"""PostgreSQL-backed jobs, fenced leases, schedules and retention for NMS backups."""
import hashlib
import json
import os
import random
import threading
import uuid
from datetime import datetime, timedelta

from sqlalchemy import text

from nms_service.core.logger import logger
from nms_service.database.models import Device, db_manager, cuid
from nms_service.security.credentials import CredentialEnvelopeError, decrypt_nms_credential, encrypt_nms_backup
from nms_service.ssh.backups import BackupError, capture_configuration, resolve_platform
from nms_service.ssh.poller import SSHDeviceConfig


def audit(session, entity_id, action, details, user_id=None):
    session.execute(text('''INSERT INTO audit_logs
      (id, entity, "entityId", action, "userId", resource, "resourceId", details, timestamp)
      VALUES (:id, 'NmsBackupJob', :entity, :action, (SELECT id FROM users WHERE id=:user_id),
        'device', :entity, CAST(:details AS jsonb), CURRENT_TIMESTAMP)'''),
      dict(id=cuid(), entity=entity_id, action=action, user_id=user_id, details=json.dumps(details)))


class BackupWorker:
    def __init__(self, manager=db_manager, capture=capture_configuration):
        self.db = manager
        self.capture = capture
        self.stop_event = threading.Event()
        self.threads = []
        self.last_tick = None
        self.last_error = None

    def start(self):
        concurrency = min(8, max(1, int(os.getenv("NMS_BACKUP_WORKERS", "2"))))
        for index in range(concurrency):
            thread = threading.Thread(target=self.run, daemon=True, name=f"nms-backup-{index}")
            thread.start()
            self.threads.append(thread)
        thread = threading.Thread(target=self.maintain, daemon=True, name="nms-backup-scheduler")
        thread.start()
        self.threads.append(thread)

    def shutdown(self):
        self.stop_event.set()
        for thread in self.threads:
            thread.join(timeout=1)
        # In-flight work is bounded; its lease remains durable across shutdown.

    def _recover(self, session):
        rows = session.execute(text('''UPDATE nms_backup_jobs SET
          status=CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'retrying' END,
          active_device_key=CASE WHEN attempts >= max_attempts THEN NULL ELSE active_device_key END,
          finished_at=CASE WHEN attempts >= max_attempts THEN CURRENT_TIMESTAMP ELSE NULL END,
          error_code='WORKER_INTERRUPTED', error_message='İşleyici kesintisi sonrasında iş yeniden değerlendirildi.',
          lease_token=NULL, lease_expires_at=NULL, run_after=CURRENT_TIMESTAMP-INTERVAL '1 second', updated_at=CURRENT_TIMESTAMP
          WHERE status='running' AND lease_expires_at < CURRENT_TIMESTAMP
          RETURNING id, status, requested_by''')).mappings().all()
        for row in rows:
            audit(session, row['id'], 'SSH_CONFIG_BACKUP_FAILED' if row['status'] == 'failed' else 'SSH_CONFIG_BACKUP_RECOVERED',
                  {'errorCode': 'WORKER_INTERRUPTED'}, row['requested_by'])

    def claim(self):
        with self.db.get_session() as session:
            self._recover(session)
            row = session.execute(text('''SELECT * FROM nms_backup_jobs
              WHERE status IN ('queued','retrying') AND run_after <= CURRENT_TIMESTAMP
              ORDER BY run_after, created_at FOR UPDATE SKIP LOCKED LIMIT 1''')).mappings().first()
            if not row:
                session.commit()
                return None
            token = str(uuid.uuid4())
            job = session.execute(text('''UPDATE nms_backup_jobs SET status='running', attempts=attempts+1,
              lease_token=:token, lease_expires_at=CURRENT_TIMESTAMP + INTERVAL '5 minutes',
              started_at=COALESCE(started_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
              WHERE id=:id RETURNING *'''), {'id': row['id'], 'token': token}).mappings().one()
            result = dict(job)
            session.commit()
            return result

    def _read_device(self, job):
        with self.db.get_session() as session:
            device = session.query(Device).filter(Device.id == job['inventory_device_id'], Device.nms_device_id == job['nms_device_id']).first()
            if not device or not device.management_ip:
                raise BackupError('DEVICE_UNAVAILABLE', 'Cihaz silinmiş veya yönetim adresi bulunmuyor.')
            platform = resolve_platform(device)
            if not platform:
                raise BackupError('UNSUPPORTED_PLATFORM', 'Cihazın yedekleme platformunu seçin.')
            if not device.ssh_host_key_fingerprint:
                raise BackupError('HOST_KEY_UNTRUSTED', 'SSH cihaz anahtarı onaylanmalıdır.')
            if not device.ssh_username or not device.ssh_password:
                raise BackupError('CREDENTIALS_MISSING', 'SSH kullanıcı adı ve şifresi gereklidir.')
            # Hash the encrypted envelope, never a plaintext password. A credential edit
            # changes the revision and permits immediate verification of the new secret.
            revision = hashlib.sha256(json.dumps([device.management_ip, device.ssh_port,
                device.ssh_username, device.ssh_password, device.ssh_host_key_fingerprint]).encode()).hexdigest()
            blocked = session.execute(text('''SELECT id FROM nms_backup_jobs WHERE inventory_device_id=:inventory AND nms_device_id=:device
              AND error_code='AUTH_FAILED' AND credential_revision=:revision
              AND finished_at>CURRENT_TIMESTAMP-INTERVAL '15 minutes' LIMIT 1'''),
              {'inventory': device.id, 'device': device.nms_device_id, 'revision': revision}).first()
            if blocked:
                raise BackupError('AUTH_COOLDOWN', 'SSH hesabını korumak için 15 dakikalık bekleme etkin. Bilgileri düzelttikten sonra yeniden deneyin.')
            session.execute(text('UPDATE nms_backup_jobs SET credential_revision=:revision WHERE id=:id AND lease_token=:token'),
              {'revision': revision, 'id': job['id'], 'token': job['lease_token']})
            password = decrypt_nms_credential(device.ssh_password, 'sshPassword')
            cfg = SSHDeviceConfig(device_id=device.nms_device_id, device_name=device.name,
                ip_address=device.management_ip, username=device.ssh_username, password=password,
                port=device.ssh_port or 22, vendor=platform, timeout=10,
                host_key_fingerprint=device.ssh_host_key_fingerprint,
                host_key_algorithm=device.ssh_host_key_algorithm or '')
            session.commit()
            return cfg, platform

    def _complete(self, job, cfg, platform, output):
        # Capture implementations are validated here too, before any durable success.
        from nms_service.ssh.backups import validate_configuration
        output = validate_configuration(output, platform)
        payload = output.encode('utf-8')
        checksum, backup_id = hashlib.sha256(payload).hexdigest(), cuid()
        encrypted = encrypt_nms_backup(output)
        with self.db.get_session() as session:
            owned = session.execute(text('''SELECT id FROM nms_backup_jobs WHERE id=:id
              AND status='running' AND lease_token=:token AND lease_expires_at>CURRENT_TIMESTAMP FOR UPDATE'''),
              {'id': job['id'], 'token': job['lease_token']}).first()
            if not owned:
                return False
            session.execute(text('''INSERT INTO nms_backups
              (id,nms_device_id,device_name,management_ip,platform,job_id,backup_type,backup_file,
                description,size_bytes,checksum,configuration,created_at,updated_at)
              VALUES (:id,:device,:name,:ip,:platform,:job,:type,:file,:description,:size,:checksum,:configuration,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)'''),
              dict(id=backup_id, device=cfg.device_id, name=cfg.device_name, ip=cfg.ip_address,
                   platform=platform, job=job['id'], type=job['backup_type'], file=f"backup_{cfg.device_id}_{backup_id}.cfg",
                   description=job['description'], size=len(payload), checksum=checksum, configuration=encrypted))
            session.execute(text('''UPDATE nms_backup_jobs SET status='succeeded',backup_id=:backup,
              active_device_key=NULL,lease_token=NULL,lease_expires_at=NULL,error_code=NULL,error_message=NULL,
              finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=:id'''), {'backup': backup_id, 'id': job['id']})
            audit(session, job['id'], 'SSH_CONFIG_BACKUP_COMPLETED', {'backupId': backup_id, 'checksum': checksum, 'sizeBytes': len(payload)}, job['requested_by'])
            session.commit()
            return True

    def _fail(self, job, error):
        retry = error.retryable and job['attempts'] < job['max_attempts']
        delay = min(300, 30 * (2 ** (job['attempts'] - 1))) + random.randint(0, 10)
        with self.db.get_session() as session:
            row = session.execute(text('''UPDATE nms_backup_jobs SET status=:status,
              active_device_key=CASE WHEN :retry THEN active_device_key ELSE NULL END,
              run_after=:run_after,lease_token=NULL,lease_expires_at=NULL,error_code=:code,error_message=:message,
              finished_at=CASE WHEN :retry THEN NULL ELSE CURRENT_TIMESTAMP END,updated_at=CURRENT_TIMESTAMP
              WHERE id=:id AND lease_token=:token AND status='running' RETURNING id'''),
              dict(status='retrying' if retry else 'failed', retry=retry, run_after=datetime.utcnow()+timedelta(seconds=delay),
                   code=error.code, message=str(error), id=job['id'], token=job['lease_token'])).first()
            if row:
                audit(session, job['id'], 'SSH_CONFIG_BACKUP_RETRYING' if retry else 'SSH_CONFIG_BACKUP_FAILED',
                      {'errorCode': error.code, 'attempt': job['attempts']}, job['requested_by'])
            session.commit()

    def process(self, job):
        # Keep this physical connection pinned: session advisory locks must not return to the pool.
        with self.db.engine.connect() as lock_connection:
            acquired = lock_connection.execute(text('SELECT pg_try_advisory_lock(8170,:device)'), {'device': job['nms_device_id']}).scalar()
            lock_connection.commit()
            if not acquired:
                with self.db.get_session() as session:
                    session.execute(text('''UPDATE nms_backup_jobs SET status='retrying', attempts=attempts-1,
                      run_after=CURRENT_TIMESTAMP+INTERVAL '10 seconds',lease_token=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP
                      WHERE id=:id AND lease_token=:token'''), {'id': job['id'], 'token': job['lease_token']})
                    session.commit()
                return
            try:
                cfg, platform = self._read_device(job)
                output = self.capture(cfg, platform, job['backup_type'])
                self._complete(job, cfg, platform, output)
            except BackupError as error:
                self._fail(job, error)
            except CredentialEnvelopeError:
                self._fail(job, BackupError('CREDENTIALS_UNAVAILABLE', 'Şifreleme anahtarıyla cihaz bilgileri çözülemedi.'))
            except Exception as error:
                logger.error('Backup job %s failed (%s)', job['id'], type(error).__name__)
                self._fail(job, BackupError('STORAGE_OR_WORKER_ERROR', 'Yedekleme işleyicisi veya veritabanı işlemi başarısız.'))
            finally:
                try:
                    lock_connection.execute(text('SELECT pg_advisory_unlock(8170,:device)'), {'device': job['nms_device_id']})
                    lock_connection.commit()
                except Exception:
                    lock_connection.invalidate()

    def tick(self):
        job = self.claim()
        if job:
            self.process(job)
        self.last_tick = datetime.utcnow()
        self.last_error = None
        return job is not None

    def run(self):
        while not self.stop_event.is_set():
            try:
                busy = self.tick()
            except Exception as error:
                self.last_error = type(error).__name__
                logger.warning('Backup queue unavailable (%s)', self.last_error)
                busy = False
            if not busy:
                self.stop_event.wait(2)

    def maintenance_tick(self):
        with self.db.get_session() as session:
            policies = session.execute(text('''SELECT * FROM nms_backup_policies WHERE enabled=true
              AND next_run_at<=CURRENT_TIMESTAMP ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 100''')).mappings().all()
            for policy in policies:
                device = session.query(Device).filter(Device.id == policy['inventory_device_id'], Device.nms_device_id == policy['nms_device_id']).first()
                if not device:
                    session.execute(text('UPDATE nms_backup_policies SET enabled=false,updated_at=CURRENT_TIMESTAMP WHERE id=:id'), {'id': policy['id']})
                    continue
                inserted = session.execute(text('''INSERT INTO nms_backup_jobs
                  (id,inventory_device_id,nms_device_id,device_name,backup_type,idempotency_key,active_device_key,updated_at)
                  VALUES (:id,:inventory,:device,:name,:type,:key,:device,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING RETURNING id'''),
                  dict(id=cuid(), inventory=device.id, device=device.nms_device_id, name=device.name,
                       type=policy['backup_type'], key=f"policy:{policy['id']}:{policy['next_run_at'].isoformat()}" )).scalar()
                if inserted:
                    audit(session, inserted, 'SSH_CONFIG_BACKUP_REQUESTED', {'source': 'schedule', 'policyId': policy['id']})
                session.execute(text('''UPDATE nms_backup_policies SET next_run_at=:next,updated_at=CURRENT_TIMESTAMP WHERE id=:id'''),
                  {'id': policy['id'], 'next': datetime.utcnow() + (timedelta(hours=policy['interval_hours']) if inserted else timedelta(minutes=1))})
            session.commit()
        # Retention has its own transaction and lock; a broken policy cannot roll back scheduled jobs.
        with self.db.get_session() as session:
            if not session.execute(text('SELECT pg_try_advisory_xact_lock(8170,0)')).scalar():
                return
            policies = session.execute(text('''SELECT p.* FROM nms_backup_policies p JOIN devices d
              ON d.id=p.inventory_device_id AND d.nms_device_id=p.nms_device_id WHERE p.enabled=true''')).mappings().all()
            for policy in policies:
                removed = session.execute(text('''DELETE FROM nms_backups WHERE id IN (
                  SELECT id FROM nms_backups WHERE nms_device_id=:device
                  AND id NOT IN (SELECT id FROM nms_backups WHERE nms_device_id=:device ORDER BY created_at DESC,id DESC LIMIT :keep)
                  AND created_at<:cutoff ORDER BY created_at,id LIMIT 500) RETURNING id'''),
                  {'device': policy['nms_device_id'], 'keep': policy['keep_last'], 'cutoff': datetime.utcnow()-timedelta(days=policy['retention_days'])}).scalars().all()
                if removed:
                    audit(session, policy['id'], 'SSH_CONFIG_BACKUP_RETENTION_APPLIED', {'backupIds': list(removed)})
            session.commit()

    def maintain(self):
        while not self.stop_event.is_set():
            try:
                self.maintenance_tick()
            except Exception as error:
                logger.warning('Backup scheduler unavailable (%s)', type(error).__name__)
            self.stop_event.wait(30)


backup_worker = BackupWorker()
