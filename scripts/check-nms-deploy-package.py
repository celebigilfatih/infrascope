"""Validate customer archives without extracting executable or secret material."""
import sys
import tarfile
import zipfile
from pathlib import Path

version=sys.argv[1] if len(sys.argv)>1 else '1.0.0'
required=('docker-compose.yml','install.sh','update.sh','backup.sh','postgres-backup.sh','BACKUP_OPERATIONS.md','env.example')
with zipfile.ZipFile(Path('dist')/f'infrascope-customer-deploy-{version}.zip') as archive:
    for filename in required:
        content=archive.read('infrascope/'+filename)
        if filename.endswith('.sh'):
            assert b'\r' not in content, filename+' has non-Unix line endings'
    assert all('/license-server/' not in name and not name.endswith('/.env') for name in archive.namelist())
    compose=archive.read('infrascope/docker-compose.yml').decode()
    assert '  nms:' in compose and '  database-backup:' in compose
    assert 'NMS_BACKEND_URL: http://nms:8500' in compose
with tarfile.open(Path('dist')/f'infrascope-appliance-{version}.tar.gz') as archive:
    for filename in required:
        entry=archive.getmember(f'infrascope-appliance-{version}/opt/infrascope/'+filename)
        if filename in ('install.sh','update.sh','backup.sh'):
            assert entry.mode & 0o100, filename+' is not executable'
print('Customer ZIP and appliance TAR verified: NMS, database backups, recovery tool, documentation, Unix scripts; no live environment or central license server.')
