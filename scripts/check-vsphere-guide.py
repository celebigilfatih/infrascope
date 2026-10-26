"""Verify the maintained PDF/HTML guide, render all pages and export PowerShell examples for parsing."""
from html.parser import HTMLParser
import hashlib
import json
from pathlib import Path
import runpy
import pdfplumber
from pypdf import PdfReader
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
source = runpy.run_path(str(ROOT / 'scripts/build-vsphere-windows-guide.py'))
reader = PdfReader(source['PDF'])
planned = source['PAGES']
assert len(reader.pages) == len(planned), 'Unexpected overflow pages'
for index, page in enumerate(reader.pages):
    text = page.extract_text()
    assert planned[index][1].split('\n')[0] in text, (index, 'wrong section')
    assert f'{index + 1:02d} / {len(planned):02d}' in text, (index, 'wrong footer')
    assert '\ufffd' not in text
with pdfplumber.open(source['PDF']) as document:
    for index, page in enumerate(document.pages):
        assert all(20 < char['x0'] < page.width - 20 and 15 < char['top'] < page.height - 15 for char in page.chars), (index, 'text outside margins')


class Commands(HTMLParser):
    def __init__(self):
        super().__init__()
        self.commands, self.current, self.inside, self.sections = [], '', False, 0

    def handle_starttag(self, tag, attrs):
        if tag == 'section':
            self.sections += 1
        if tag == 'pre':
            self.current, self.inside = '', True

    def handle_data(self, text):
        if self.inside:
            self.current += text

    def handle_endtag(self, tag):
        if tag == 'pre':
            self.commands.append(self.current)
            self.inside = False


parser = Commands()
parser.feed(source['HTML'].read_text(encoding='utf-8'))
assert parser.sections == len(planned)
assert any('install-infrascope.ps1' in code for code in parser.commands)
assert any('update.ps1' in code for code in parser.commands)
assert not any('\\\\' in code for code in parser.commands)
qa = ROOT / 'tmp/pdfs/online-release-guide'
qa.mkdir(parents=True, exist_ok=True)
(qa / 'commands.json').write_text(json.dumps(parser.commands), encoding='utf-8')
document = pdfium.PdfDocument(source['PDF'])
contact = Image.new('RGB', (300 * 4, 440 * ((len(document) + 3) // 4)), '#d9e6e0')
draw = ImageDraw.Draw(contact)
for index, page in enumerate(document):
    render = page.render(scale=1.2).to_pil().convert('RGB')
    render.save(qa / f'page-{index + 1:02d}.png')
    render.thumbnail((290, 410))
    x, y = (index % 4) * 300 + 5, (index // 4) * 440 + 5
    contact.paste(render, (x, y))
    draw.text((x, y + 413), f'Page {index + 1}', fill='black')
contact.save(qa / 'contact.png')
result = dict(passed=True, pages=len(planned), codeBlocks=len(parser.commands),
              scope='Document structure, text bounds, Unicode, PDF rendering and HTML code examples',
              pdfSha256=hashlib.sha256(source['PDF'].read_bytes()).hexdigest(),
              htmlSha256=hashlib.sha256(source['HTML'].read_bytes()).hexdigest())
(ROOT / 'output/pdf/infrascope_vsphere_windows11_kurulum_rehberi.verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
