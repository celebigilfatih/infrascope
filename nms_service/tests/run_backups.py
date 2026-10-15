"""Run against a dedicated migrated database. Never uses the installation database."""
import base64
import os
import unittest
from pathlib import Path
from sqlalchemy.engine import make_url

name = os.getenv('NMS_BACKUP_TEST_DATABASE', 'infrascope_backup_tests')
if not name.endswith('_backup_tests'):
    raise SystemExit('Test database name must end in _backup_tests')
os.environ['DATABASE_URL'] = make_url(os.environ['DATABASE_URL']).set(database=name).render_as_string(hide_password=False)
os.environ['INTEGRATION_CREDENTIALS_KEY'] = base64.b64encode(os.urandom(32)).decode()
os.environ.pop('INTEGRATION_CREDENTIALS_PREVIOUS_KEY', None)
os.environ['NMS_LOG_DIR'] = '/tmp/infrascope-backup-test-logs'
suite = unittest.defaultTestLoader.discover(str(Path(__file__).parent), pattern='test_backup*.py')
result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)
