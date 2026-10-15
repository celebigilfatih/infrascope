"""Verify decrypted artifacts in a separately restored acceptance database."""
import hashlib
import os
import json
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from nms_service.security.credentials import CredentialEnvelopeError, decrypt_envelope

url=make_url(os.environ['DATABASE_URL'])
if not url.database.endswith('_backup_acceptance'):
    raise SystemExit('Acceptance installation required')
destination=sys.argv[2] if len(sys.argv)>2 else 'infrascope_backup_restore'
if not destination.endswith('_backup_restore'):
    raise SystemExit('Dedicated restore database required')
engine=create_engine(url.set(database=destination))
if len(sys.argv)>1:
    with open(sys.argv[1]) as recovery_keys:
        metadata=json.load(recovery_keys)
    for name in ('INTEGRATION_CREDENTIALS_KEY','INTEGRATION_CREDENTIALS_PREVIOUS_KEY','NEXTAUTH_SECRET'):
        os.environ[name]=metadata['keys'].get(name,'')
with engine.connect() as connection:
    rows=connection.execute(text('SELECT configuration,checksum FROM nms_backups')).all()
    assert len(rows)>=2
    for configuration,checksum in rows:
        plaintext=decrypt_envelope(configuration,'infrascope:NMS_BACKUP:configuration:v1')
        assert hashlib.sha256(plaintext.encode()).hexdigest()==checksum
    original=os.environ['INTEGRATION_CREDENTIALS_KEY']
    import base64
    os.environ['INTEGRATION_CREDENTIALS_KEY']=base64.b64encode(os.urandom(32)).decode()
    try:
        try: decrypt_envelope(rows[0].configuration,'infrascope:NMS_BACKUP:configuration:v1')
        except CredentialEnvelopeError: pass
        else: raise AssertionError('Another company key decrypted an artifact')
    finally: os.environ['INTEGRATION_CREDENTIALS_KEY']=original
engine.dispose()
print(f'Restored database verified: {len(rows)} encrypted artifacts, checksums match, another installation key rejected.')
