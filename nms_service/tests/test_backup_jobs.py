import hashlib
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from unittest.mock import patch
from sqlalchemy import text
from nms_service.backup_worker import BackupWorker
from nms_service.database.models import db_manager, cuid, DatabaseManager
from nms_service.core.config import config
from nms_service.security.credentials import decrypt_envelope, encrypt_envelope
from nms_service.ssh.backups import BackupError
from test_backup_capture import IOS


class JobTests(unittest.TestCase):
    def test_worker_sessions_use_utc_even_with_a_different_database_timezone(self):
        with patch.dict(config.database.options, {'options':'-c timezone=Europe/Istanbul'}):
            manager=DatabaseManager()
            try:
                with manager.get_session() as session:
                    self.assertEqual(session.execute(text('SHOW timezone')).scalar(),'UTC')
            finally:
                manager.close()

    @classmethod
    def setUpClass(cls):
        if not db_manager.engine.url.database.endswith('_backup_tests'):
            raise RuntimeError('Refusing to mutate a non-test database')

    def execute(self, sql, values=None):
        with db_manager.get_session() as session:
            result=session.execute(text(sql),values or {})
            rows=[dict(row) for row in result.mappings()] if result.returns_rows else []
            session.commit()
            return rows

    def setUp(self):
        self.execute('TRUNCATE devices,nms_backups,nms_backup_jobs,nms_backup_policies,audit_logs CASCADE')
        self.device_id=cuid()
        password=encrypt_envelope('fixture-password','infrascope:NMS_DEVICE:sshPassword:v1')
        self.execute('''INSERT INTO devices (id,name,type,vendor,"updatedAt",nms_device_id,management_ip,
          ssh_username,ssh_password,ssh_host_key_fingerprint,backup_platform,polling_enabled)
          VALUES (:id,'fixture-switch','SWITCH','Cisco',CURRENT_TIMESTAMP,1,'127.0.0.1','fixture',:password,'SHA256:fixture','cisco_ios',false)''', {'id':self.device_id,'password':password})
        self.worker=BackupWorker(capture=lambda *_:IOS)

    def enqueue(self):
        job_id=cuid()
        self.execute('''INSERT INTO nms_backup_jobs (id,inventory_device_id,nms_device_id,device_name,backup_type,idempotency_key,active_device_key,updated_at)
          VALUES (:id,:inventory,1,'fixture-switch','Running Config',:id,1,CURRENT_TIMESTAMP)''', {'id':job_id,'inventory':self.device_id})
        return job_id

    def test_success_without_monitoring_is_encrypted_and_audited(self):
        job_id=self.enqueue(); self.worker.tick()
        job=self.execute('SELECT * FROM nms_backup_jobs WHERE id=:id',{'id':job_id})[0]
        backup=self.execute('SELECT * FROM nms_backups')[0]
        self.assertEqual(job['status'],'succeeded'); self.assertIsNone(job['active_device_key'])
        self.assertTrue(backup['configuration'].startswith('enc:v1:i:'))
        self.assertEqual(decrypt_envelope(backup['configuration'],'infrascope:NMS_BACKUP:configuration:v1'),IOS)
        self.assertEqual(backup['checksum'],hashlib.sha256(IOS.encode()).hexdigest())
        self.assertEqual(self.execute("SELECT count(*) AS count FROM audit_logs WHERE action='SSH_CONFIG_BACKUP_COMPLETED'")[0]['count'],1)

    def test_two_workers_only_claim_one_job(self):
        self.enqueue()
        with ThreadPoolExecutor(max_workers=2) as pool: claimed=list(pool.map(lambda _:self.worker.claim(),range(2)))
        self.assertEqual(sum(job is not None for job in claimed),1)
        self.worker.process(next(job for job in claimed if job))
        self.assertEqual(len(self.execute('SELECT id FROM nms_backups')),1)

    def test_expired_worker_cannot_commit(self):
        self.enqueue(); old=self.worker.claim()
        self.execute("UPDATE nms_backup_jobs SET lease_expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second'")
        current=self.worker.claim()
        cfg,platform=self.worker._read_device(current)
        self.assertFalse(self.worker._complete(old,cfg,platform,IOS))
        self.worker.process(current)
        self.assertEqual(len(self.execute('SELECT id FROM nms_backups')),1)
        self.assertEqual(self.execute('SELECT attempts FROM nms_backup_jobs')[0]['attempts'],2)

    def test_per_device_lock_defers_work(self):
        self.enqueue(); job=self.worker.claim()
        with db_manager.engine.connect() as connection:
            connection.execute(text('SELECT pg_advisory_lock(8170,1)')); connection.commit()
            try: self.worker.process(job)
            finally: connection.execute(text('SELECT pg_advisory_unlock(8170,1)')); connection.commit()
        row=self.execute('SELECT status,attempts FROM nms_backup_jobs')[0]
        self.assertEqual(row,{'status':'retrying','attempts':0})

    def test_auth_failure_stops_and_transport_failure_backs_off(self):
        self.enqueue()
        def fail(*_): raise BackupError('AUTH_FAILED','fixture failure')
        self.worker.capture=fail; self.worker.tick()
        row=self.execute('SELECT * FROM nms_backup_jobs')[0]
        self.assertEqual(row['status'],'failed'); self.assertEqual(row['attempts'],1)
        self.execute('UPDATE devices SET ssh_password=:password',{'password':encrypt_envelope('fixture-revised-password','infrascope:NMS_DEVICE:sshPassword:v1')})
        self.enqueue()
        def transient(*_): raise BackupError('TIMEOUT','fixture timeout',True)
        self.worker.capture=transient; self.worker.tick()
        row=self.execute("SELECT * FROM nms_backup_jobs WHERE status='retrying'")[0]
        self.assertGreater(row['run_after'],datetime.utcnow()+timedelta(seconds=20))
        self.execute("UPDATE nms_backup_jobs SET run_after=CURRENT_TIMESTAMP WHERE status='retrying'")
        self.worker.capture=lambda *_:IOS; self.worker.tick()
        self.assertEqual(len(self.execute('SELECT id FROM nms_backups')),1)

    def test_wrong_credentials_are_not_hammered_by_new_jobs(self):
        calls=[]
        def fail(*_):
            calls.append(1)
            raise BackupError('AUTH_FAILED','fixture failure')
        self.worker.capture=fail
        self.enqueue(); self.worker.tick()
        self.enqueue(); self.worker.tick()
        self.assertEqual(len(calls),1)
        self.assertEqual(self.execute("SELECT count(*) AS count FROM nms_backup_jobs WHERE error_code='AUTH_COOLDOWN'")[0]['count'],1)

    def test_partial_capture_does_not_persist_a_success(self):
        self.enqueue(); self.worker.capture=lambda *_:IOS.replace('end\n','')
        self.worker.tick()
        self.assertEqual(self.execute('SELECT status,error_code FROM nms_backup_jobs')[0],{'status':'failed','error_code':'INCOMPLETE_OUTPUT'})
        self.assertEqual(self.execute('SELECT count(*) AS count FROM nms_backups')[0]['count'],0)

    def test_device_deletion_preserves_artifact(self):
        self.enqueue(); self.worker.tick()
        self.execute('DELETE FROM devices WHERE id=:id',{'id':self.device_id})
        backup=self.execute('SELECT nms_device_id,device_name,configuration FROM nms_backups')[0]
        self.assertIsNone(backup['nms_device_id']); self.assertEqual(backup['device_name'],'fixture-switch')
        self.assertTrue(backup['configuration'].startswith('enc:'))

    def test_inventory_id_reuse_never_redirects_a_pending_job(self):
        self.enqueue(); self.execute('DELETE FROM devices')
        self.worker.tick()
        self.assertEqual(self.execute('SELECT status,error_code FROM nms_backup_jobs')[0],{'status':'failed','error_code':'DEVICE_UNAVAILABLE'})

    def test_schedule_is_idempotent_and_retention_keeps_newest(self):
        policy_id=cuid()
        self.execute('''INSERT INTO nms_backup_policies (id,inventory_device_id,nms_device_id,enabled,next_run_at,updated_at,retention_days,keep_last)
          VALUES (:id,:inventory,1,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,30,2)''',{'id':policy_id,'inventory':self.device_id})
        self.worker.maintenance_tick(); self.worker.maintenance_tick()
        self.assertEqual(len(self.execute('SELECT id FROM nms_backup_jobs')),1)
        for index in range(5):
            self.execute('''INSERT INTO nms_backups (id,nms_device_id,device_name,size_bytes,created_at,updated_at)
              VALUES (:id,1,'fixture-switch',1,:created,CURRENT_TIMESTAMP)''',{'id':cuid(),'created':datetime.utcnow()-timedelta(days=90+index)})
        self.worker.maintenance_tick()
        self.assertEqual(len(self.execute('SELECT id FROM nms_backups')),2)
        self.assertEqual(self.execute("SELECT count(*) AS count FROM audit_logs WHERE action='SSH_CONFIG_BACKUP_RETENTION_APPLIED'")[0]['count'],1)

    def test_busy_device_defers_schedule_instead_of_losing_an_interval(self):
        self.enqueue()
        self.execute('''INSERT INTO nms_backup_policies (id,inventory_device_id,nms_device_id,enabled,next_run_at,updated_at)
          VALUES (:id,:inventory,1,true,CURRENT_TIMESTAMP-INTERVAL '1 second',CURRENT_TIMESTAMP)''',{'id':cuid(),'inventory':self.device_id})
        self.worker.maintenance_tick()
        policy=self.execute('SELECT next_run_at FROM nms_backup_policies')[0]
        self.assertLess(policy['next_run_at'],datetime.utcnow()+timedelta(seconds=90))
        self.assertEqual(len(self.execute('SELECT id FROM nms_backup_jobs')),1)
