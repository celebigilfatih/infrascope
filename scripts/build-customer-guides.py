"""Build and verify HTML/PDF guides from an exact online customer release, offline."""
import argparse
from datetime import date
import hashlib
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile

VERSION = r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)'
REPOSITORY = r'[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9_.-]*'
MONTHS = ('Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık')


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def package_context(*, root, release_dir, version, repository, release_date):
    if not re.fullmatch(VERSION, version) or not re.fullmatch(REPOSITORY, repository):
        raise ValueError('Stable version and owner/repository required')
    try:
        day = date.fromisoformat(release_date)
        release_dir = Path(release_dir)
        with zipfile.ZipFile(release_dir / f'infrascope-windows-online-{version}.zip') as archive:
            manifest = json.loads(archive.read('infrascope/release.json'))
            if manifest['version'] != version or manifest['repository'] != repository:
                raise ValueError('Package metadata does not match requested guide version/repository')
            payload = {}
            for name, digest in manifest['files'].items():
                data = archive.read('infrascope/' + name)
                if sha256(data) != digest:
                    raise ValueError('Package file hash mismatch: ' + name)
                payload[name] = data
        bootstrap = (release_dir / 'install-infrascope.ps1').read_bytes()
        # This asset is intentionally separate from the ZIP's file allowlist.
        if bootstrap != (Path(root) / 'deploy/install-infrascope.ps1').read_bytes():
            raise ValueError('Separate bootstrap differs from the release source')
        contracts = {'install-infrascope.ps1': (bootstrap, ['Version', 'Repository', 'Destination', 'ProjectName', 'AppPort', 'PublicIp', 'PassphraseFile', 'Update']),
                     'install.ps1': (payload['install.ps1'], ['AppPort', 'PublicIp', 'PassphraseFile']),
                     'update.ps1': (payload['update.ps1'], ['Version', 'Repository', 'PassphraseFile']),
                     'backup.ps1': (payload['backup.ps1'], ['PassphraseFile'])}
        for name, (data, parameters) in contracts.items():
            header = data.decode('utf-8-sig').split('$ErrorActionPreference', 1)[0]
            if any(not re.search(r'\$' + parameter + r'\b', header) for parameter in parameters):
                raise ValueError('Documented parameter contract changed: ' + name)
        services = re.findall(r'^  ([a-z][a-z0-9_-]*):\s*$', payload['release-images.yml'].decode(), re.M)
        backups = [service for service in services if service not in ('app', 'nms', 'postgres')]
        if not {'app', 'nms', 'postgres'}.issubset(services) or len(backups) != 1:
            raise ValueError('Packaged service names no longer match guide commands')
        return dict(version=version, repository=repository, revision=manifest['revision'],
                    release_date=release_date, date_label=f'{day.day} {MONTHS[day.month - 1]} {day.year}',
                    bootstrap_sha256=sha256(bootstrap), backup_service=backups[0])
    except (OSError, KeyError, zipfile.BadZipFile, json.JSONDecodeError) as error:
        raise ValueError('Cannot validate guide input package') from error


def render_html(root, context):
    template = (Path(root) / 'deploy/guides/windows-install.html').read_text(encoding='utf-8')
    values = {'VERSION': context['version'], 'REPOSITORY': context['repository'],
              'RELEASE_DATE': context['date_label'], 'BOOTSTRAP_SHA256': context['bootstrap_sha256'],
              'BACKUP_SERVICE': context['backup_service']}
    # Docker's literal Go templates ({{.OSType}} / {{.Architecture}}) are command text.
    if set(re.findall(r'\{\{([A-Z][A-Z0-9_]*)\}\}', template)) != set(values):
        raise ValueError('Unknown or missing guide template placeholders')
    for key, value in values.items():
        template = template.replace('{{' + key + '}}', html.escape(value, quote=True))
    if re.search(r'\{\{[A-Z][A-Z0-9_]*\}\}', template):
        raise ValueError('Unresolved guide placeholders')
    return template


class Commands(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.commands = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'code' and attrs.get('id'):
            self.current = dict(id=attrs['id'], text='')

    def handle_data(self, text):
        if self.current is not None:
            self.current['text'] += text

    def handle_endtag(self, tag):
        if tag == 'code' and self.current is not None:
            self.commands.append(self.current)
            self.current = None


def html_commands(text):
    parser = Commands()
    parser.feed(text)
    return parser.commands


def verify_output(output, manifest):
    import pdfplumber

    output = Path(output)
    for name, digest in manifest['files'].items():
        if sha256((output / name).read_bytes()) != digest:
            raise ValueError('Generated guide hash mismatch: ' + name)
    stem = f'InfraScope-{manifest["version"]}-Windows11-Kurulum-Kilavuzu'
    text = (output / (stem + '.html')).read_text(encoding='utf-8')
    commands = html_commands(text)
    pages = []
    with pdfplumber.open(output / (stem + '.pdf')) as pdf:
        for number, page in enumerate(pdf.pages, 1):
            page_text = page.extract_text(x_tolerance=1) or ''
            chars = [c for c in page.chars if c['text'].strip()]
            if len(chars) < 80 or any(c['x0'] < 35 or c['x1'] > page.width - 35 or c['top'] < 8 or c['bottom'] > page.height - 8 for c in chars):
                raise ValueError(f'Blank page or text outside PDF margins: page {number}')
            pages.append(page_text)
        uris = [str(link.get('uri', '')) for page in pdf.pages for link in page.hyperlinks]
    compact = lambda s: re.sub(r'\s+', '', s)
    lines = {line.strip() for page in pages for line in page.splitlines()}
    for command in commands:
        if not any(compact(command['text']) in compact(page) for page in pages):
            raise ValueError('PDF command block missing or split between pages: ' + command['id'])
        if any(line.strip() not in lines for line in command['text'].splitlines() if line.strip()):
            raise ValueError('PDF command line wrapped or changed: ' + command['id'])
    full_text = '\n'.join(pages)
    if any(f'{n:02d} ·' not in full_text for n in range(1, 15)) or '\ufffd' in full_text:
        raise ValueError('PDF troubleshooting text or character encoding is incomplete')
    release_url = f'https://github.com/{manifest["repository"]}/releases/tag/v{manifest["version"]}'
    if release_url not in uris or manifest['bootstrap_sha256'] not in full_text:
        raise ValueError('PDF version link or installer checksum missing')
    if manifest['version'] not in full_text or re.search(r'file:///|[A-Z]:[/\\].*(?:worktrees|Dev)', full_text):
        raise ValueError('PDF version missing or private build path leaked')
    return dict(pages=len(pages), command_blocks=len(commands), faqs=14, command_lines_preserved=True)


def build(*, root, release_dir, output, version, repository, release_date):
    root, output = Path(root), Path(output)
    context = package_context(root=root, release_dir=release_dir, version=version,
                              repository=repository, release_date=release_date)
    output.mkdir(parents=True, exist_ok=True)
    stem = f'InfraScope-{version}-Windows11-Kurulum-Kilavuzu'
    html_path, pdf_path = output / (stem + '.html'), output / (stem + '.pdf')
    text = render_html(root, context)
    html_path.write_text(text, encoding='utf-8', newline='\n')
    metadata = output / f'guide-manifest-{version}.json'
    manifest = dict(schema=1, **context, commands=html_commands(text), html_name=html_path.name)
    metadata.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    subprocess.run([os.environ.get('NODE_BINARY', 'node'), str(root / 'scripts/render-customer-guide-pdf.cjs'),
                    '--html', str(html_path.resolve()), '--output', str(pdf_path.resolve()),
                    '--metadata', str(metadata.resolve())], check=True, cwd=root)
    manifest['files'] = {p.name: sha256(p.read_bytes()) for p in (html_path, pdf_path)}
    manifest['checks'] = {**verify_output(output, manifest), **json.loads((output / f'guide-browser-checks-{version}.json').read_text())}
    metadata.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    sums = ''.join(f'{digest}  {name}\n' for name, digest in manifest['files'].items())
    (output / f'SHA256SUMS-guides-{version}.txt').write_text(sums, encoding='ascii')
    base = (root / 'docs/releases/customer.md').read_text(encoding='utf-8').replace('<sürüm>', version)
    links = '\n'.join(f'- [{extension.upper()} kurulum kılavuzunu indir](https://github.com/{repository}/releases/download/v{version}/{stem}.{extension})' for extension in ('html', 'pdf'))
    section = (f'### Windows 11 / vSphere kurulum kılavuzları - {version}\n\n{links}\n'
               f'- [Kılavuz SHA256 değerleri](https://github.com/{repository}/releases/download/v{version}/SHA256SUMS-guides-{version}.txt)\n\n'
               'HTML ve PDF aynı doğrulanmış sürüm paketinden üretilmiştir. HTML komutlarında Kopyala düğmesi bulunur; PDF komutları seçilebilir.\n\n')
    first, separator, remaining = base.partition('\n')
    notes = first + '\n\n' + section + remaining.lstrip() if separator else section + base
    (output / f'release-notes-{version}.md').write_text(notes, encoding='utf-8', newline='\n')
    return metadata


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--release-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    for name in ('version', 'repository', 'release-date'):
        parser.add_argument('--' + name, required=True)
    print(build(**vars(parser.parse_args())))
