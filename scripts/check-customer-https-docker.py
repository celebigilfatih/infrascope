"""Portable Windows production rehearsal. Only unpublished GitHub transport is doubled.

Requires already published immutable candidate image references and Docker Linux amd64.
Creates random owned projects, synthetic credentials, explicit CA trust and temporary DBs.
"""
import argparse
import hashlib
import http.cookiejar
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import zipfile

ROOT = Path(__file__).resolve().parent.parent
PS_ENV = {k: v for k, v in os.environ.items() if k.upper() != 'PSMODULEPATH'}


def free_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('app-ref', 'nms-ref', 'postgres-ref', 'revision'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'output/release110/production-rehearsal')
    args = parser.parse_args()
    for ref in (args.app_ref, args.nms_ref, args.postgres_ref):
        if not re.fullmatch(r'[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}', ref):
            raise ValueError('Only immutable image references are accepted')
    args.output.mkdir(parents=True, exist_ok=True)
    # Windows TEMP may use an8.3 alias; Compose records its canonical long path.
    scratch = Path(tempfile.mkdtemp(prefix='infrascope-release-https-')).resolve()
    events = []
    fixtures = []
    owned_volumes = []
    owned_containers = []
    failed = True

    def run(command, data=None, expect_failure=False):
        result = subprocess.run(list(map(str, command)), input=data, text=True, capture_output=True, cwd=ROOT,
                                env=PS_ENV if command[0] == 'powershell.exe' else None)
        with (args.output / 'commands.log').open('a', encoding='utf8') as log:
            log.write(result.stdout + result.stderr)
        if expect_failure:
            if not result.returncode:
                raise AssertionError('Expected interruption did not fail')
        elif result.returncode:
            raise RuntimeError(f'Command failed ({result.returncode}): {command[0]}; see commands.log')
        return result.stdout.strip()

    def check(condition, message):
        if not condition:
            raise AssertionError(message)
        events.append(message)
        print('PASS: ' + message, flush=True)

    def ps(script, **kwargs):
        command = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script)]
        for key, value in kwargs.items():
            if value is True:
                command.append('-' + key)
            elif value is not False and value is not None:
                command += ['-' + key, str(value)]
        return command

    def compose(fixture):
        root, project, *_ = fixture
        return ['docker', 'compose', '--project-directory', root, '--env-file', root / '.env',
                '-f', root / 'docker-compose.yml', '-f', root / 'release-images.yml', '-p', project]

    def fixture(name):
        root = scratch / name / 'infrascope'
        project = 'infrascope-rc110-' + uuid.uuid4().hex[:9]
        ports = (free_port(), free_port(), free_port())
        entry = (root, project, *ports)
        fixtures.append(entry)
        return entry

    def tls_state(entry):
        root = entry[0]
        pointer = json.loads((root / '.release-https-state.json').read_text()) if (root / '.release-https-state.json').exists() else None
        return Path(pointer['proxyRoot']) if pointer else root.parent / 'InfraScope-HTTPS'

    def verify_session(entry):
        root, _, http_port, tls_port, _ = entry
        proxy = tls_state(entry)
        ca = proxy / 'infrascope-root-ca.crt'
        base = f'https://127.0.0.1:{tls_port}'
        context = ssl.create_default_context(cafile=str(ca))
        jar = http.cookiejar.CookieJar()
        client = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context), urllib.request.HTTPCookieProcessor(jar))
        check(json.load(client.open(base + '/api/health/ready', timeout=15))['status'] == 'ready', 'CA-verified HTTPS readiness')
        password = secrets.token_urlsafe(24)
        js = 'const{PrismaClient}=require("@prisma/client");const b=require("bcryptjs");const p=new PrismaClient();(async()=>{await p.user.upsert({where:{email:"fixture@example.invalid"},update:{password:await b.hash(' + json.dumps(password) + ',12)},create:{name:"Release fixture",email:"fixture@example.invalid",password:await b.hash(' + json.dumps(password) + ',12),role:"ADMIN",status:"ACTIVE"}});await p.$disconnect();})().catch(()=>process.exit(1));'
        run(compose(entry) + ['exec', '-T', 'app', 'node'], js)
        request = urllib.request.Request(base + '/api/auth/login', data=json.dumps({'email': 'fixture@example.invalid', 'password': password}).encode(), headers={'Content-Type': 'application/json'})
        with client.open(request, timeout=30) as response:
            check(json.load(response)['success'], 'Real administrator login over HTTPS')
            cookie = response.headers['Set-Cookie'].lower()
            check(all(value in cookie for value in ('secure', 'httponly', 'samesite=strict')), 'Secure session cookie attributes')
        for _ in range(2):
            check(json.load(client.open(base + '/api/auth/me', timeout=15))['user']['email'] == 'fixture@example.invalid', 'Session survives subsequent request/refresh')
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *unused):
                return None
        plain = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        try:
            plain.open(urllib.request.Request(f'http://127.0.0.1:{http_port}/login?next=%2Fdashboard', headers={'Host': 'invalid.example'}), timeout=10)
            raise AssertionError('HTTP was not redirected')
        except urllib.error.HTTPError as error:
            check(error.code == 308 and error.headers['Location'] == base + '/login?next=%2Fdashboard', 'HTTP308 preserves path/query and ignores untrusted Host')
        untrusted = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ssl.create_default_context()))
        try:
            untrusted.open(base + '/api/health/ready', timeout=5)
            raise AssertionError('Untrusted CA was accepted')
        except urllib.error.URLError:
            check(True, 'Untrusted CA rejected without verification bypass')
        return sha(ca)

    try:
        spec = importlib.util.spec_from_file_location('online', ROOT / 'scripts/package-online-release.py')
        package = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(package)
        candidate = package.build(root=ROOT, output=scratch / 'candidate', version='1.0.10', repository='celebigilfatih/infrascope', revision=args.revision,
                                  app_digest=args.app_ref.split('@')[1], nms_digest=args.nms_ref.split('@')[1], postgres_digest=args.postgres_ref.split('@')[1])
        phrase = scratch / 'passphrase.txt'
        phrase.write_text(secrets.token_urlsafe(40), encoding='utf8')
        fresh = fixture('fresh')
        root, project, http_port, tls_port, backend_port = fresh
        bootstrap = ROOT / 'scripts/fixtures/release-bootstrap.ps1'
        run(ps(bootstrap, FixtureZip=candidate, Version='1.0.10', Destination=root, PassphraseFile=phrase, PublicIp='127.0.0.1', ProjectName=project, AppPort=http_port, HttpsPort=tls_port, BackendPort=backend_port, InterruptAfterTlsStart=True),expect_failure=True)
        check((root/'.release-https-state.json').exists(),'Interrupted TLS enrollment keeps its owned resume identity')
        caddy='caddy@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f'
        partial_ca=None
        for _ in range(20):
            result=subprocess.run(['docker','run','--rm','--network','none','--volume',project+'-https_caddy_data:/data:ro',caddy,'sh','-ec','sha256sum /data/caddy/pki/authorities/local/root.crt'],text=True,capture_output=True)
            if result.returncode==0:
                partial_ca=result.stdout.split()[0]
                break
            time.sleep(.5)
        check(bool(partial_ca),'Interrupted enrollment already owns a recoverable CA')
        run(ps(root/'install.ps1',NoBrowser=True,PublicIp='127.0.0.1',ProjectName=project,AppPort=http_port,HttpsPort=tls_port,BackendPort=backend_port,PassphraseFile=phrase))
        fresh_ca = verify_session(fresh)
        check(fresh_ca==partial_ca,'TLS enrollment retry preserves the CA created before interruption')
        initial = list((root / 'backups').glob('*.isbackup'))
        check(len(initial) == 1, 'Fresh installation creates exactly one encrypted secure recovery bundle')
        run(ps(root / 'install.ps1', NoBrowser=True, PublicIp='127.0.0.1', ProjectName=project, AppPort=http_port, HttpsPort=tls_port, BackendPort=backend_port, PassphraseFile=phrase))
        check(sha(tls_state(fresh) / 'infrascope-root-ca.crt') == fresh_ca and len(list((root / 'backups').glob('*.isbackup'))) == 1, 'Fresh installer retry preserves CA and original recovery point')

        # Official old ZIP, verified by GitHub's published asset digest; no ignored local pilot output.
        request = urllib.request.Request('https://api.github.com/repos/celebigilfatih/infrascope/releases/tags/v1.0.9', headers={'User-Agent': 'InfraScope-release-rehearsal'})
        release = json.load(urllib.request.urlopen(request, timeout=60))
        asset = next(item for item in release['assets'] if item['name'] == 'infrascope-windows-online-1.0.9.zip')
        old_zip = scratch / 'official-1.0.9.zip'
        with urllib.request.urlopen(asset['browser_download_url'], timeout=120) as response:
            old_zip.write_bytes(response.read())
        check(asset['digest'] == 'sha256:' + sha(old_zip), 'Official1.0.9 release ZIP digest verified')
        old = fixture('existing')
        old_root, old_project, old_http, old_tls, old_backend = old
        with zipfile.ZipFile(old_zip) as archive:
            if any(not item.startswith('infrascope/') or '..' in Path(item).parts for item in archive.namelist()):
                raise ValueError('Unsafe official fixture ZIP')
            archive.extractall(old_root.parent)
        run(ps(old_root / 'install.ps1', NoBrowser=True, ProjectName=old_project, AppPort=old_http))
        old_app_id=run(compose(old)+['ps','-q','app'])
        labels=json.loads(run(['docker','inspect',old_app_id]))[0]['Config']['Labels']
        (args.output/'old-compose-identity.json').write_text(json.dumps({'expectedRoot':str(old_root),'labels':labels},indent=2),encoding='utf8')
        sql = "CREATE TABLE customer_release_fixture (id integer PRIMARY KEY, note text NOT NULL); INSERT INTO customer_release_fixture VALUES (1, 'persistent customer data');"
        run(compose(old) + ['exec', '-T', 'postgres', 'psql', '-U', 'infrascope', '-d', 'infrascope', '-v', 'ON_ERROR_STOP=1', '-c', sql])
        external = old_root.parent / 'InfraScope-HTTPS'
        shutil.copytree(ROOT / 'deploy/https', external)
        run(ps(external / 'install-https.ps1', PublicIp='127.0.0.1', InstallationProject=old_project, ProxyProject=old_project + '-https', HttpsPort=old_tls))
        run(ps(external / 'install-redirect.ps1', PublicIp='127.0.0.1', InstallationRoot=old_root, InstallationProject=old_project, ProxyProject=old_project + '-https', LegacyPort=old_http, BackendPort=old_backend))
        old_ca = verify_session(old)
        check(old_ca != fresh_ca, 'Separate customer installations have separate CA identities')
        before_env = (old_root / '.env').read_bytes()
        before_id = (old_root / 'data/machine-id/machine-id').read_bytes()
        run(ps(bootstrap, FixtureZip=candidate, Version='1.0.10', Destination=old_root, PassphraseFile=phrase, Update=True, InterruptAfterReady=True), expect_failure=True)
        check((old_root / '.update-state.json').exists(), 'Real interrupted update retains its resume journal')
        bundles = list((old_root / 'backups').glob('*.isbackup'))
        check(len(bundles) == 1, 'Interrupted update creates one immutable pre-update backup')
        bundle_hash = sha(bundles[0])
        run(ps(bootstrap, FixtureZip=candidate, Version='1.0.10', Destination=old_root, PassphraseFile=phrase, Update=True))
        check((old_root / '.env').read_bytes() == before_env.replace(b'VERSION=1.0.9', b'VERSION=1.0.10'), 'Update preserves every customer ENV byte except VERSION')
        check((old_root / 'data/machine-id/machine-id').read_bytes() == before_id, 'License identity preserved')
        check(verify_session(old) == old_ca, 'Existing external CA and login preserved across upgrade/resume')
        check(len(list((old_root / 'backups').glob('*.isbackup'))) == 1 and sha(bundles[0]) == bundle_hash, 'Resume retains the same original encrypted backup')
        check(run(compose(old) + ['exec', '-T', 'postgres', 'psql', '-U', 'infrascope', '-d', 'infrascope', '-At', '-c', 'SELECT note FROM customer_release_fixture WHERE id=1']) == 'persistent customer data', 'Customer data preserved')
        run(ps(bootstrap, FixtureZip=candidate, Version='1.0.10', Destination=old_root, PassphraseFile=phrase, Update=True))
        check(len(list((old_root / 'backups').glob('*.isbackup'))) == 1, 'Same-version update is idempotent')
        # Actual authenticated restoration into a separate DB and a new owned CA volume.
        recovery = old_root / 'backups/verified-recovery'
        run(['docker', 'run', '--rm', '-i', '--network', 'none', '--volume', str(old_root / 'backups') + ':/recovery', '--entrypoint', 'python', args.nms_ref, '-m', 'nms_service.recovery', 'extract', '--input', '/recovery/' + bundles[0].name, '--directory', '/recovery/verified-recovery'], phrase.read_text() + '\n')
        check((recovery / 'environment.env').read_bytes() == before_env, 'Recovery authenticates original settings and keys')
        metadata = json.loads((recovery / 'https-recovery.json').read_text())
        check(metadata['caHash'] == old_ca and metadata['archiveHash'] == sha(recovery / 'https-recovery.tar'), 'Encrypted recovery includes the original authenticated CA material')
        volume = 'infrascope-rc110-restore-' + uuid.uuid4().hex[:10]
        run(['docker', 'volume', 'create', '--label', 'io.infrascope.qa=release110', volume])
        owned_volumes.append(volume)
        caddy = 'caddy@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f'
        restored_ca = run(['docker', 'run', '--rm', '--network', 'none', '--volume', volume + ':/target', '--volume', str(recovery) + ':/recovery:ro', caddy, 'sh', '-ec', 'tar -xf /recovery/https-recovery.tar -C /target; sha256sum /target/caddy/pki/authorities/local/root.crt']).split()[0]
        check(restored_ca == old_ca, 'Restored separate CA volume has the same trusted fingerprint')
        restored_proxy='infrascope-rc110-restored-'+uuid.uuid4().hex[:10]
        restored_port=free_port()
        owned_containers.append(restored_proxy)
        run(['docker','run','--detach','--name',restored_proxy,'--network',old_project+'_infrascope-net','--read-only','--cap-drop','ALL','--cap-add','NET_BIND_SERVICE','--tmpfs','/tmp','--tmpfs','/config','--volume',volume+':/data','--volume',str(ROOT/'deploy/https/Caddyfile')+':/etc/caddy/Caddyfile:ro','--publish',f'127.0.0.1:{restored_port}:443','--env','PUBLIC_HOST=127.0.0.1',caddy])
        recovered_client=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=str(external/'infrascope-root-ca.crt'))))
        usable=False
        for _ in range(30):
            try:
                usable=json.load(recovered_client.open(f'https://127.0.0.1:{restored_port}/api/health/ready',timeout=2))['status']=='ready'
                if usable:break
            except (urllib.error.URLError,TimeoutError):
                time.sleep(.5)
        check(usable,'Restored CA private keys serve usable HTTPS trusted by the original public certificate')
        run(compose(old) + ['cp', recovery / 'database.dump', 'postgres:/tmp/release-restore.dump'])
        run(compose(old) + ['exec', '-T', 'postgres', 'createdb', '-U', 'infrascope', 'release_restore_fixture'])
        run(compose(old) + ['exec', '-T', 'postgres', 'pg_restore', '--no-owner', '--no-acl', '-U', 'infrascope', '-d', 'release_restore_fixture', '/tmp/release-restore.dump'])
        check(run(compose(old) + ['exec', '-T', 'postgres', 'psql', '-U', 'infrascope', '-d', 'release_restore_fixture', '-At', '-c', 'SELECT note FROM customer_release_fixture WHERE id=1']) == 'persistent customer data', 'Original database backup restores customer data into separate DB')
        failed = False
    finally:
        cleanup_errors = []
        for container in owned_containers:
            result=subprocess.run(['docker','rm','--force',container],capture_output=True)
            if result.returncode:cleanup_errors.append('Restored proxy cleanup failed: '+container)
        for entry in reversed(fixtures):
            root, project, *_ = entry
            if (root / '.env').exists():
                for proxy in (root / 'https', root.parent / 'InfraScope-HTTPS'):
                    for state_file, env_file, compose_file, project_field in (('.redirect-state.json', '.redirect.env', 'redirect-compose.yml', 'redirectProject'), ('.https-state.json', '.env', 'compose.yml', 'project')):
                        if (proxy / state_file).exists():
                            state = json.loads((proxy / state_file).read_text())
                            owned_project = state[project_field]
                            if not owned_project.startswith(project + '-https'):
                                cleanup_errors.append('Unexpected proxy ownership')
                                continue
                            result = subprocess.run(['docker', 'compose', '--project-directory', str(proxy), '--env-file', str(proxy / env_file), '-f', str(proxy / compose_file), '-p', owned_project, 'down', '--volumes', '--remove-orphans'], capture_output=True)
                            if result.returncode:
                                cleanup_errors.append('Proxy cleanup failed: ' + owned_project)
                result = subprocess.run(list(map(str, compose(entry) + ['down', '--volumes', '--remove-orphans'])), capture_output=True)
                if result.returncode:
                    cleanup_errors.append('Application cleanup failed: ' + project)
        for volume in owned_volumes:
            result = subprocess.run(['docker', 'volume', 'rm', volume], capture_output=True)
            if result.returncode:
                cleanup_errors.append('Recovery volume cleanup failed')
        (args.output / 'result.json').write_text(json.dumps({'passed': not failed and not cleanup_errors, 'checks': events, 'cleanupErrors': cleanup_errors}, indent=2), encoding='utf8')
        if cleanup_errors:
            raise RuntimeError('; '.join(cleanup_errors) + '; fixture retained at ' + str(scratch))
        if scratch.parent != Path(tempfile.gettempdir()).resolve() or not scratch.name.startswith('infrascope-release-https-'):
            raise RuntimeError('Unexpected cleanup target')
        shutil.rmtree(scratch)


if __name__ == '__main__':
    main()
