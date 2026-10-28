"""Behavioral checks for the small, digest-pinned customer release (no credentials)."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parent.parent


class OnlineRelease(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('online_release', ROOT / 'scripts/package-online-release.py')
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.scratch = tempfile.TemporaryDirectory(prefix='infrascope-online-package-')
        self.addCleanup(self.scratch.cleanup)
        self.output = Path(self.scratch.name)

    def build(self, **overrides):
        args = dict(root=ROOT, output=self.output, version='1.0.2', repository='celebigilfatih/infrascope',
                    revision='a' * 40, app_digest='sha256:' + '1' * 64,
                    nms_digest='sha256:' + '2' * 64, postgres_digest='sha256:' + '3' * 64)
        return self.module.build(**{**args, **overrides})

    def test_package_contains_no_images_or_customer_state_and_hashes_all_payload(self):
        target = self.build()
        self.assertLess(target.stat().st_size, 1_000_000)
        with zipfile.ZipFile(target) as archive:
            names = archive.namelist()
            self.assertTrue(all(name.startswith('infrascope/') for name in names))
            self.assertFalse(any(name.endswith(('.tar', '/.env')) or '/data/' in name for name in names))
            manifest = json.loads(archive.read('infrascope/release.json'))
            self.assertEqual(manifest['version'], '1.0.2')
            self.assertEqual(manifest['repository'], 'celebigilfatih/infrascope')
            self.assertEqual(set(manifest['files']), {name.removeprefix('infrascope/') for name in names} - {'release.json'})
            for name, digest in manifest['files'].items():
                self.assertEqual(hashlib.sha256(archive.read('infrascope/' + name)).hexdigest(), digest)
            pins = archive.read('infrascope/release-images.yml').decode()
            for service in ('app', 'nms', 'postgres', 'database-backup'):
                self.assertIn(f'  {service}:', pins)
            self.assertIn('ghcr.io/celebigilfatih/infrascope-customer@sha256:' + '1' * 64, pins)
            self.assertIn(b'VERSION=1.0.2\n', archive.read('infrascope/env.example'))

            for name in ('update.ps1', 'release-common.ps1', 'install.ps1', 'backup.ps1'):
                self.assertIn('infrascope/' + name, names)
        sums = (self.output / 'SHA256SUMS-online-1.0.2.txt').read_text()
        self.assertIn(hashlib.sha256(target.read_bytes()).hexdigest(), sums)

    def test_same_source_and_digests_produce_identical_zip_bytes_at_different_times(self):
        with patch('zipfile.time.localtime',return_value=(2020,1,2,3,4,6,3,2,-1)):
            before=self.build().read_bytes()
        with patch('zipfile.time.localtime',return_value=(2026,10,28,9,10,12,2,301,-1)):
            after=self.build().read_bytes()
        self.assertEqual(hashlib.sha256(before).hexdigest(),hashlib.sha256(after).hexdigest())

    def test_invalid_version_repository_or_digest_is_rejected(self):
        for override in ({'version': 'latest'}, {'repository': '../private'}, {'app_digest': 'latest'},
                         {'nms_digest': 'sha256:' + 'g' * 64}, {'revision': 'unknown'}):
            with self.subTest(override=override), self.assertRaises(ValueError):
                self.build(**override)

    def test_release_bootstrap_is_also_a_separate_asset(self):
        self.build()
        bootstrap = self.output / 'install-infrascope.ps1'
        self.assertEqual(bootstrap.read_bytes(), (ROOT / 'deploy/install-infrascope.ps1').read_bytes())

    def test_release_includes_only_versioned_https_helpers_and_hashes_nested_paths(self):
        target = self.build()
        expected = {f'https/{name}' for name in (
            'Caddyfile', 'Redirectfile', 'compose.yml', 'redirect-compose.yml',
            'install-https.ps1', 'install-redirect.ps1', 'README.txt', 'README-REDIRECT.txt')}
        with zipfile.ZipFile(target) as archive:
            manifest = json.loads(archive.read('infrascope/release.json'))
            self.assertEqual(manifest['schema'], 2)
            self.assertTrue(expected.issubset(manifest['files']))
            self.assertIn('release-https.ps1', manifest['files'])
            for name in expected:
                self.assertEqual(hashlib.sha256(archive.read('infrascope/' + name)).hexdigest(), manifest['files'][name])
            self.assertFalse(any(name.endswith(('.key', '.crt', '.pfx')) or '/.https-state' in name for name in archive.namelist()))


if __name__ == '__main__':
    unittest.main(verbosity=2)
