"""Seed synthetic SSH/users only in an explicitly named acceptance database."""
from pathlib import Path
import sys
from sqlalchemy import text
from nms_service.database.models import db_manager
from nms_service.security.credentials import encrypt_envelope

if not db_manager.engine.url.database.endswith('_backup_acceptance'):
    raise SystemExit('Acceptance database name required')
mode=sys.argv[1] if len(sys.argv)>1 else 'seed'
if mode in ('bad-password','good-password'):
    with db_manager.get_session() as session:
        session.execute(text('UPDATE devices SET ssh_password=:password WHERE id=\'backup-acceptance-device\''),
          {'password':encrypt_envelope('fixture-wrong-password' if mode=='bad-password' else 'fixture-password','infrascope:NMS_DEVICE:sshPassword:v1')})
        session.commit()
    print('Synthetic fixture credentials updated.')
    raise SystemExit(0)
if mode in ('check-failed-alarm','check-resolved-alarm'):
    with db_manager.get_session() as session:
        rows=session.execute(text('''SELECT i.status::text FROM alarm_incidents i JOIN alarm_definitions d ON d.id=i."alarmId"
          WHERE d.code='NMS_BACKUP_FAILED' AND i."entityId"='backup-acceptance-device' ''')).scalars().all()
        expected='OPEN' if mode=='check-failed-alarm' else 'RESOLVED'
        assert rows and all(status==expected for status in rows), f'Expected {expected}, got {rows}'
        events=session.execute(text('''SELECT count(*) FROM alarm_events e JOIN alarm_definitions d ON d.id=e."alarmId"
          WHERE d.code='NMS_BACKUP_FAILED' ''')).scalar()
        assert events==1, 'Cooldown did not prevent duplicate backup alarm occurrences'
    print(f'Backup alarm {expected} verified; duplicate evaluation did not create another occurrence.')
    raise SystemExit(0)
fingerprint=Path('/fixtures/ssh-fingerprint').read_text().strip()
password_hash=Path('/fixtures/ui-password-hash').read_text().strip() if Path('/fixtures/ui-password-hash').exists() else None
with db_manager.get_session() as session:
    for role in ('ADMIN','EDITOR','VIEWER'):
        session.execute(text('''INSERT INTO users (id,name,email,role,status,password,"updatedAt")
          VALUES (:id,:name,:email,CAST(:role AS "UserRole"),'ACTIVE',:password,CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET password=EXCLUDED.password'''),
          {'id':f'backup-acceptance-{role.lower()}','name':f'Acceptance {role}',
           'email':f'backup-{role.lower()}@example.invalid','role':role,'password':password_hash})
    session.execute(text('''INSERT INTO devices
      (id,name,type,vendor,nms_device_id,management_ip,ssh_username,ssh_password,ssh_port,
        ssh_host_key_fingerprint,backup_platform,polling_enabled,"updatedAt")
      VALUES ('backup-acceptance-device','Acceptance SSH fixture','SWITCH','Cisco',900001,'fixture-ssh',
        'fixture',:password,2222,:fingerprint,'cisco_ios',false,CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET ssh_host_key_fingerprint=EXCLUDED.ssh_host_key_fingerprint'''),
      {'password':encrypt_envelope('fixture-password','infrascope:NMS_DEVICE:sshPassword:v1'),'fingerprint':fingerprint})
    session.commit()
print('Synthetic acceptance users and SSH fixture device ready.')
