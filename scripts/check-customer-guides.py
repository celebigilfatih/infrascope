"""Offline release guide regressions. Add --integration to render and inspect real PDFs."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
INTEGRATION = '--integration' in sys.argv
if INTEGRATION:
    sys.argv.remove('--integration')


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class CustomerGuides(unittest.TestCase):
    def setUp(self):
        self.guide = module('customer_guides', 'build-customer-guides.py')
        self.package = module('online_package', 'package-online-release.py')
        self.temp = tempfile.TemporaryDirectory(prefix='infrascope-guide-test-')
        self.addCleanup(self.temp.cleanup)
        self.scratch = Path(self.temp.name)

    def fixture(self, version='1.0.8', repository='celebigilfatih/infrascope'):
        release = self.scratch / version
        self.package.build(root=ROOT, output=release, version=version, repository=repository,
                           revision='a' * 40, app_digest='sha256:' + '1' * 64,
                           nms_digest='sha256:' + '2' * 64, postgres_digest='sha256:' + '3' * 64)
        return dict(root=ROOT, release_dir=release, version=version, repository=repository,
                    release_date='2026-10-25')

    def test_two_versions_and_repositories_have_exact_links_commands_and_bootstrap_hash(self):
        for version, repository in [('1.0.8', 'celebigilfatih/infrascope'), ('2.4.0', 'Example-Org/customer-fork')]:
            args = self.fixture(version, repository)
            context = self.guide.package_context(**args)
            text = self.guide.render_html(ROOT, context)
            self.assertIn(f'-Version {version}', text)
            self.assertGreaterEqual(text.count(f"-Repository '{repository}'"), 2)
            self.assertIn(f'https://github.com/{repository}/releases/download/v{version}/install-infrascope.ps1', text)
            self.assertIn(hashlib.sha256((args['release_dir'] / 'install-infrascope.ps1').read_bytes()).hexdigest(), text)
            self.assertNotIn('1.0.7', text)
            self.assertNotRegex(text, r'\{\{[A-Z][A-Z0-9_]*\}\}')
            self.assertIn("'{{.OSType}}/{{.Architecture}}'", text)
            self.assertNotIn('postgres-backup', text)
            self.assertIn('logs --tail 100 app nms postgres database-backup', text)
            self.assertEqual(len(self.guide.html_commands(text)), 18)
            self.assertIn('25 Ekim 2026', text)
            # Windows CI also parses the actual generated commands with PowerShell 5.1.
            if shutil.which('powershell.exe'):
                command_file = self.scratch / ('commands-' + version + '.json')
                command_file.write_text(json.dumps(self.guide.html_commands(text)), encoding='utf-8')
                safe_path = str(command_file).replace("'", "''")
                script = (f"$blocks=Get-Content -LiteralPath '{safe_path}' -Raw -Encoding UTF8 | ConvertFrom-Json; "
                          "foreach($b in $blocks){$t=$null;$e=$null;"
                          "[System.Management.Automation.Language.Parser]::ParseInput($b.text,[ref]$t,[ref]$e)|Out-Null;"
                          "if($e.Count){throw ($b.id+': '+($e.Message -join '; '))}}")
                parsed = subprocess.run(['powershell.exe', '-NoProfile', '-Command', script], capture_output=True, text=True)
                self.assertEqual(parsed.returncode, 0, parsed.stderr)

    def test_invalid_versions_repository_and_date_are_rejected(self):
        args = self.fixture()
        for changes in [{'version': 'latest'}, {'version': '01.2.3'}, {'version': '1.2.3-rc1'},
                        {'repository': '../elsewhere'}, {'repository': 'a/b<script>'},
                        {'release_date': '2026-02-30'}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.guide.package_context(**{**args, **changes})

    def test_package_version_and_repository_mismatch_are_rejected(self):
        args = self.fixture()
        for changes in [{'version': '2.0.0'}, {'repository': 'other/repo'}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.guide.package_context(**{**args, **changes})

    def test_separate_bootstrap_tampering_is_rejected(self):
        args = self.fixture()
        (args['release_dir'] / 'install-infrascope.ps1').write_bytes(b'Write-Host wrong')
        with self.assertRaises(ValueError):
            self.guide.package_context(**args)

    def test_changed_install_parameter_contract_is_rejected(self):
        args = self.fixture()
        archive = args['release_dir'] / 'infrascope-windows-online-1.0.8.zip'
        with zipfile.ZipFile(archive) as z:
            payload = {n: z.read(n) for n in z.namelist()}
        payload['infrascope/update.ps1'] = payload['infrascope/update.ps1'].replace(b'$PassphraseFile', b'$RecoveryFile')
        manifest = json.loads(payload['infrascope/release.json'])
        manifest['files']['update.ps1'] = hashlib.sha256(payload['infrascope/update.ps1']).hexdigest()
        payload['infrascope/release.json'] = json.dumps(manifest).encode()
        with zipfile.ZipFile(archive, 'w') as z:
            for n, data in payload.items():
                z.writestr(n, data)
        with self.assertRaisesRegex(ValueError, 'parameter'):
            self.guide.package_context(**args)

    def test_template_drift_is_rejected(self):
        context = self.guide.package_context(**self.fixture())
        altered = self.scratch / 'altered'
        target = altered / 'deploy/guides/windows-install.html'
        target.parent.mkdir(parents=True)
        target.write_text((ROOT / 'deploy/guides/windows-install.html').read_text(encoding='utf-8') + '{{UNKNOWN}}', encoding='utf-8')
        with self.assertRaises(ValueError):
            self.guide.render_html(altered, context)

    def test_renamed_repository_parameters_block_future_release(self):
        args = self.fixture()
        archive = args['release_dir'] / 'infrascope-windows-online-1.0.8.zip'
        with zipfile.ZipFile(archive) as z:
            payload = {n: z.read(n) for n in z.namelist()}
        payload['infrascope/update.ps1'] = payload['infrascope/update.ps1'].replace(b'$Repository', b'$SourceRepository')
        manifest = json.loads(payload['infrascope/release.json'])
        manifest['files']['update.ps1'] = hashlib.sha256(payload['infrascope/update.ps1']).hexdigest()
        payload['infrascope/release.json'] = json.dumps(manifest).encode()
        with zipfile.ZipFile(archive, 'w') as z:
            for name, data in payload.items():
                z.writestr(name, data)
        with self.assertRaisesRegex(ValueError, 'parameter'):
            self.guide.package_context(**args)

        args = self.fixture()
        bootstrap = (args['release_dir'] / 'install-infrascope.ps1').read_bytes().replace(b'$Repository', b'$SourceRepository')
        alternate = self.scratch / 'renamed-bootstrap-source'
        (alternate / 'deploy').mkdir(parents=True)
        (alternate / 'deploy/install-infrascope.ps1').write_bytes(bootstrap)
        (args['release_dir'] / 'install-infrascope.ps1').write_bytes(bootstrap)
        with self.assertRaisesRegex(ValueError, 'parameter'):
            self.guide.package_context(**{**args, 'root': alternate})

    def test_release_workflow_publishes_guides_only_after_verified_generation(self):
        workflow = (ROOT / '.github/workflows/publish-image.yml').read_text(encoding='utf-8')
        self.assertIn('scripts/build-customer-guides.py', workflow)
        self.assertLess(workflow.index('scripts/build-customer-guides.py'), workflow.index('gh release create'))
        self.assertIn('release-notes-$VERSION.md', workflow)
        for extension in ['html', 'pdf']:
            self.assertIn(f'InfraScope-$VERSION-Windows11-Kurulum-Kilavuzu.{extension}', workflow)
        self.assertIn('SHA256SUMS-guides-$VERSION.txt', workflow)
        self.assertNotIn('continue-on-error', workflow)
        checks = (ROOT / '.github/workflows/customer-deployment.yml').read_text(encoding='utf-8')
        self.assertIn('scripts/check-customer-guides.py --integration', checks)
        self.assertIn('scripts/*guide*', checks)


if INTEGRATION:
    class GuideRendering(unittest.TestCase):
        setUp = CustomerGuides.setUp
        fixture = CustomerGuides.fixture

        def test_real_html_pdf_checksums_notes_and_failure_gate_for_two_versions(self):
            for version, repo in [('1.0.8', 'celebigilfatih/infrascope'), ('2.4.0', 'Example-Org/customer-fork')]:
                args = self.fixture(version, repo)
                output = self.scratch / ('guides-' + version)
                result = self.guide.build(**args, output=output)
                manifest = json.loads(result.read_text(encoding='utf-8'))
                self.assertEqual(manifest['version'], version)
                self.assertEqual(manifest['repository'], repo)
                self.assertEqual(manifest['checks']['command_blocks'], 18)
                self.assertEqual(manifest['checks']['faqs'], 14)
                self.assertGreater(manifest['checks']['pages'], 10)
                self.assertEqual(manifest['checks']['html_copy_buttons'], 18)
                for name, digest in manifest['files'].items():
                    self.assertEqual(hashlib.sha256((output / name).read_bytes()).hexdigest(), digest)
                sums = (output / f'SHA256SUMS-guides-{version}.txt').read_text()
                self.assertEqual(len(sums.splitlines()), 2)
                notes = (output / f'release-notes-{version}.md').read_text(encoding='utf-8')
                self.assertIn((ROOT / 'docs/releases/customer.md').read_text(encoding='utf-8').split('### Güvenlik kapsamı')[1], notes)
                self.assertNotIn('<sürüm>', notes)
                for extension in ['html', 'pdf']:
                    self.assertIn(f'https://github.com/{repo}/releases/download/v{version}/InfraScope-{version}-Windows11-Kurulum-Kilavuzu.{extension}', notes)
                pdf = output / f'InfraScope-{version}-Windows11-Kurulum-Kilavuzu.pdf'
                pdf.write_bytes(b'%PDF-broken')
                with self.assertRaises(Exception):
                    self.guide.verify_output(output, manifest)


if __name__ == '__main__':
    unittest.main(verbosity=2)
