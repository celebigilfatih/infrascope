"""Behavioral release packaging checks; synthetic files, no Docker daemon or live ENV."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import tarfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
VERSION = '9.8.7-release-test'


class CustomerReleasePackage(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix='infrascope-package-test-')
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        for directory in ('deploy', 'docker', 'docs/30-runbooks', 'Kurulum', 'scripts'):
            (self.root / directory).mkdir(parents=True, exist_ok=True)
        for name in ('docker-compose.yml', '.env.example', 'env.example', 'install.sh', 'update.sh', 'backup.sh', 'INSTALL.md'):
            shutil.copyfile(ROOT / 'deploy' / name, self.root / 'deploy' / name)
        for name in ('install.ps1', 'backup.ps1', 'update.ps1', 'release-common.ps1', 'release-https.ps1', 'install-infrascope.ps1', 'INSTALL_WINDOWS.md'):
            source = ROOT / 'deploy' / name
            if source.exists():
                shutil.copyfile(source, self.root / 'deploy' / name)
        shutil.copytree(ROOT / 'deploy/https', self.root / 'deploy/https')
        for name in ('package-customer-deploy.sh', 'package-appliance-assets.sh', 'customer-release-common.sh'):
            shutil.copyfile(ROOT / 'scripts' / name, self.root / 'scripts' / name)
        shutil.copytree(ROOT / 'deploy/appliance', self.root / 'deploy/appliance', dirs_exist_ok=True)
        shutil.copyfile(ROOT / 'docker/postgres-backup.sh', self.root / 'docker/postgres-backup.sh')
        (self.root / 'docs/30-runbooks/nms-backups.md').write_text('Synthetic backup guide\n')
        for name in ('infrascope_customer_cookbook.html', 'infrascope_user_cookbook.html'):
            (self.root / 'Kurulum' / name).write_text('<p>Synthetic installation guide</p>')
        self.images = self.root / 'image-input'
        self.images.mkdir()
        self.image_names = (f'infrascope-{VERSION}.tar', f'infrascope-nms-{VERSION}.tar', 'postgres-16-alpine.tar')
        for index, name in enumerate(self.image_names):
            (self.images / name).write_bytes(f'SYNTHETIC IMAGE ARCHIVE {index}'.encode())

    def package(self, **extra):
        env = {**os.environ, 'VERSION': VERSION, **extra}
        return subprocess.run([shutil.which('bash'), 'scripts/package-customer-deploy.sh'], cwd=self.root, env=env, capture_output=True, text=True)

    def test_non_default_version_is_pinned_in_both_templates(self):
        result = self.package()
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.root / 'dist' / f'infrascope-customer-deploy-{VERSION}.zip') as archive:
            for name in ('env.example', '.env.example'):
                self.assertIn(f'VERSION={VERSION}\n', archive.read('infrascope/' + name).decode())
            self.assertFalse(any(name.endswith('/.env') or '/license-server/' in name for name in archive.namelist()))
            for name in ('install.sh', 'update.sh', 'backup.sh', 'postgres-backup.sh'):
                entry = archive.getinfo('infrascope/' + name)
                self.assertNotIn(b'\r', archive.read(entry))
                self.assertTrue(entry.external_attr >> 16 & 0o100, name)

    def test_exact_supplied_images_are_included_without_unrelated_files(self):
        (self.images / 'customer-secret.env').write_text('DO NOT SHIP')
        result = self.package(IMAGE_TAR_DIR=str(self.images))
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.root / 'dist' / f'infrascope-customer-deploy-{VERSION}.zip') as archive:
            for name in self.image_names:
                self.assertEqual(archive.read('infrascope/images/' + name), (self.images / name).read_bytes())
            self.assertFalse(any('customer-secret' in name for name in archive.namelist()))

    def test_windows_installation_and_backup_are_shipped(self):
        result = self.package()
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.root / 'dist' / f'infrascope-customer-deploy-{VERSION}.zip') as archive:
            for name in ('install.ps1', 'backup.ps1', 'update.ps1', 'release-common.ps1', 'release-https.ps1', 'https/install-https.ps1', 'https/install-redirect.ps1', 'install-infrascope.ps1', 'INSTALL_WINDOWS.md'):
                self.assertGreater(len(archive.read('infrascope/' + name)), 100)

    def test_repackaging_replaces_stale_archive_entries(self):
        self.assertEqual(self.package().returncode, 0)
        target = self.root / 'dist' / f'infrascope-customer-deploy-{VERSION}.zip'
        with zipfile.ZipFile(target, 'a') as archive:
            archive.writestr('infrascope/stale-private.env', 'DO NOT RETAIN')
        self.assertEqual(self.package().returncode, 0)
        with zipfile.ZipFile(target) as archive:
            self.assertNotIn('infrascope/stale-private.env', archive.namelist())

    def test_image_manifest_is_shipped_with_exact_archives(self):
        manifest = b'{"version":"9.8.7-release-test","images":[]}'
        (self.images / 'image-manifest.json').write_bytes(manifest)
        self.assertEqual(self.package(IMAGE_TAR_DIR=str(self.images)).returncode, 0)
        with zipfile.ZipFile(self.root / 'dist' / f'infrascope-customer-deploy-{VERSION}.zip') as archive:
            self.assertEqual(archive.read('infrascope/images/image-manifest.json'), manifest)

    def test_both_templates_have_blank_required_installation_keys(self):
        self.assertEqual(self.package().returncode, 0)
        with zipfile.ZipFile(self.root / 'dist' / f'infrascope-customer-deploy-{VERSION}.zip') as archive:
            for name in ('env.example', '.env.example'):
                text = archive.read('infrascope/' + name).decode()
                settings = dict(line.split('=', 1) for line in text.splitlines() if '=' in line and not line.startswith('#'))
                for key in ('LICENSE_KEY', 'POSTGRES_PASSWORD', 'NEXTAUTH_SECRET', 'INTEGRATION_CREDENTIALS_KEY', 'NMS_INTERNAL_TOKEN'):
                    self.assertIn(key, settings, name)
                    self.assertEqual(settings[key], '', name)

    def test_incomplete_image_input_is_rejected(self):
        (self.images / self.image_names[1]).unlink()
        result = self.package(IMAGE_TAR_DIR=str(self.images))
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'dist' / f'infrascope-customer-deploy-{VERSION}.zip').exists())

    def test_invalid_release_version_is_rejected(self):
        result = self.package(VERSION='latest')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'dist/infrascope-customer-deploy-latest.zip').exists())

    def test_appliance_pins_version_and_includes_the_same_images(self):
        result = subprocess.run(['bash', 'scripts/package-appliance-assets.sh'], cwd=self.root,
                                env={**os.environ, 'VERSION': VERSION, 'IMAGE_TAR_DIR': str(self.images)}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        prefix = f'infrascope-appliance-{VERSION}/opt/infrascope/'
        with tarfile.open(self.root / 'dist' / f'infrascope-appliance-{VERSION}.tar.gz') as archive:
            self.assertIn(f'VERSION={VERSION}\n', archive.extractfile(prefix + 'env.example').read().decode())
            for name in self.image_names:
                self.assertEqual(archive.extractfile(prefix + 'images/' + name).read(), (self.images / name).read_bytes())

    def test_offline_installer_loads_all_three_images(self):
        installation = self.root / 'installation'
        installation.mkdir()
        shutil.copytree(self.images, installation / 'images')
        (installation / '.env').write_text(f'REGISTRY=example.invalid/release\nVERSION={VERSION}\n')
        binary = self.root / 'bin'
        binary.mkdir()
        docker = binary / 'docker'
        docker.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$DOCKER_TEST_LOG"\n'
                          'case "$3" in *infrascope-nms*) key=nms;; *postgres*) key=postgres;; *) key=app;; esac\n'
                          'if [ "$1" = image ]; then test -f "$DOCKER_TEST_STATE/$key"; exit $?; fi\n'
                          'if [ "$1" = load ]; then touch "$DOCKER_TEST_STATE/$key"; exit 0; fi\n'
                          'if [ "$1" = pull ]; then exit 66; fi\nexit 0\n')
        docker.chmod(0o755)
        text = (ROOT / 'deploy/install.sh').read_text()
        function = text.split('prepare_images() {', 1)[1].split('\n}', 1)[0]
        log = self.root / 'docker-calls.txt'
        state = self.root / 'docker-state'
        state.mkdir()
        result = subprocess.run(['bash', '-c', 'set -e; prepare_images() {' + function + '\n}\nprepare_images'], cwd=installation,
                                env={**os.environ, 'PATH': str(binary) + os.pathsep + os.environ['PATH'], 'DOCKER_TEST_LOG': str(log), 'DOCKER_TEST_STATE': str(state)}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = log.read_text()
        for name in self.image_names:
            self.assertIn('load -i ./images/' + name, calls)
        self.assertNotIn('pull ', calls)


if __name__ == '__main__':
    unittest.main(verbosity=2)
