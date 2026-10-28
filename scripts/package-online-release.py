"""Produce the small Windows release; input digests come from successful GHCR pushes."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

FILES = ('install.ps1', 'update.ps1', 'backup.ps1', 'release-common.ps1', 'release-https.ps1', 'docker-compose.yml',
         'env.example', '.env.example', 'INSTALL_WINDOWS.md',
         'https/Caddyfile', 'https/Redirectfile', 'https/compose.yml', 'https/redirect-compose.yml',
         'https/install-https.ps1', 'https/install-redirect.ps1', 'https/README.txt', 'https/README-REDIRECT.txt')


def build(*, root, output, version, repository, revision, app_digest, nms_digest, postgres_digest):
    if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', version):
        raise ValueError('Explicit stable semantic version required')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9_.-]*', repository):
        raise ValueError('Repository must be owner/name')
    if not re.fullmatch(r'[a-f0-9]{40,64}', revision):
        raise ValueError('A real source revision is required')
    for digest in (app_digest, nms_digest, postgres_digest):
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
            raise ValueError('Immutable image digests required')
    root, output = Path(root), Path(output)
    owner = repository.split('/')[0].lower()
    # Dedicated public customer packages do not expose historical private images.
    images = dict(app=f'ghcr.io/{owner}/infrascope-customer@{app_digest}',
                  nms=f'ghcr.io/{owner}/infrascope-customer-nms@{nms_digest}', postgres=f'postgres@{postgres_digest}')
    payload = {}
    for name in FILES:
        text = (root / 'deploy' / name).read_text(encoding='utf-8-sig').replace('\r\n', '\n')
        if name in ('env.example', '.env.example'):
            text = re.sub(r'(?m)^VERSION=.*$', f'VERSION={version}', text)
            text = re.sub(r'(?m)^REGISTRY=.*$', f'REGISTRY=ghcr.io/{owner}', text)
        payload[name] = text.encode('utf-8')
    payload['postgres-backup.sh'] = (root / 'docker/postgres-backup.sh').read_text().replace('\r\n', '\n').encode()
    payload['BACKUP_OPERATIONS.md'] = (root / 'docs/30-runbooks/nms-backups.md').read_bytes()
    pins = 'services:\n'
    for service in ('app', 'nms', 'postgres', 'database-backup'):
        pins += f'  {service}:\n    image: {images["postgres" if service == "database-backup" else service]}\n'
    payload['release-images.yml'] = pins.encode()
    manifest = dict(schema=2, version=version, repository=repository, revision=revision, images=images,
                    files={name: hashlib.sha256(data).hexdigest() for name, data in sorted(payload.items())})
    payload['release.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    output.mkdir(parents=True, exist_ok=True)
    target = output / f'infrascope-windows-online-{version}.zip'
    # Tiny text-only payload: fixed metadata and no zlib-version dependency keep
    # locally rehearsed and CI-created archives byte-identical for the same inputs.
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as archive:
        for name, data in sorted(payload.items()):
            entry=zipfile.ZipInfo('infrascope/' + name,date_time=(1980,1,1,0,0,0))
            entry.create_system=3
            entry.external_attr=0o100644 << 16
            archive.writestr(entry, data)
    bootstrap = output / 'install-infrascope.ps1'
    bootstrap.write_bytes((root / 'deploy/install-infrascope.ps1').read_bytes())
    sums = ''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n' for path in (target, bootstrap))
    (output / f'SHA256SUMS-online-{version}.txt').write_text(sums, encoding='ascii')
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--output', type=Path, default=Path('dist'))
    for name in ('version', 'repository', 'revision', 'app-digest', 'nms-digest', 'postgres-digest'):
        parser.add_argument('--' + name, required=True)
    print(build(**vars(parser.parse_args())))
