// Validate shipped font assets without installing packages or contacting upstream.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontPath = 'public/fonts/inter/InterVariable.woff2';
const expectedHash = '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3';
const hash = data => createHash('sha256').update(data).digest('hex');
const binary = fs.readFileSync(path.join(root, fontPath));
assert.equal(binary.subarray(0, 4).toString(), 'wOF2');
assert.equal(hash(binary), expectedHash, 'Review provenance and update the checksum when updating the font');
const license = fs.readFileSync(path.join(root, 'public/fonts/inter/OFL.txt'));
assert.equal(hash(license), '262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a', 'Ship the complete upstream license');
assert.match(license.toString(), /SIL OPEN FONT LICENSE Version 1\.1/);

// Use the parser already bundled with the pinned Next.js build dependency.
const require = createRequire(import.meta.url);
const fontFromBuffer = require('next/dist/compiled/@next/font/dist/fontkit').default;
const font = fontFromBuffer(binary);
const sceneBinary = fs.readFileSync(path.join(root, 'public/fonts/inter/InterVariable.ttf'));
assert.equal(hash(sceneBinary), 'c5de106eb3ffd7790cde68809043884c14380ce0bdb6560e812b75e1981fc61c');
const sceneFont = fontFromBuffer(sceneBinary);
assert.equal(sceneFont.familyName, font.familyName);
for (const char of 'ÇĞİÖŞÜçğıöşü') assert.ok(sceneFont.hasGlyphForCodePoint(char.codePointAt(0)), `Local 3D font must contain ${char}`);
assert.match(fs.readFileSync(path.join(root, 'components/3d/Rack3D.tsx'), 'utf8'), /font="\/fonts\/inter\/InterVariable\.ttf"/);
assert.equal(font.familyName, 'Inter Variable');
assert.equal(font.variationAxes.wght.min, 100);
assert.equal(font.variationAxes.wght.max, 900);
for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÇĞİÖŞÜçğıöşü') {
  assert.ok(font.hasGlyphForCodePoint(char.codePointAt(0)), `Missing font glyph: ${char}`);
}

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
for (const dir of ['app', 'components', 'lib', 'public']) {
  for (const file of files(path.join(root, dir)).filter(file => /\.(?:[cm]?js|tsx?|css|html)$/.test(file))) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /next\/font\/google|(?:fonts\.googleapis\.com|fonts\.gstatic\.com)/i,
      `Remote font dependency in ${path.relative(root, file)}`);
  }
}

const buildOption = process.argv.indexOf('--build-dir');
if (buildOption !== -1) {
  assert.ok(process.argv[buildOption + 1], '--build-dir requires a Next build directory');
  const build = path.resolve(process.argv[buildOption + 1]);
  assert.ok(fs.readFileSync(path.join(build, 'BUILD_ID'), 'utf8').trim());
  const manifest = JSON.parse(fs.readFileSync(path.join(build, 'server/next-font-manifest.json'), 'utf8'));
  const emitted = [...new Set(Object.values(manifest.app).flat())];
  const matching = emitted.filter(file => {
    assert.ok(file.startsWith('static/media/') && !file.includes('..'), 'Expected a local Next font asset');
    return hash(fs.readFileSync(path.join(build, file))) === expectedHash;
  });
  assert.ok(matching.length > 0, 'The bundled Inter binary must be emitted and preloaded by the root layout');
  const css = files(path.join(build, 'static/css')).filter(file => file.endsWith('.css')).map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com/i);
  assert.match(css, /font-weight:100 900/);
  assert.ok(matching.some(file => css.includes(path.basename(file))), 'Font CSS must reference the emitted binary');
  const login = fs.readFileSync(path.join(build, 'server/app/login.html'), 'utf8');
  const preloads = (login.match(/<link\b[^>]*>/g) || []).filter(link => /rel="preload"/.test(link) && /as="font"/.test(link));
  assert.ok(matching.some(file => preloads.some(link => link.includes(`href="/_next/${file}"`))),
    'The rendered login page must preload the bundled root font');
  console.log('Release font assets passed: root-layout font manifest, identical emitted WOFF2, local CSS URL and variable weights.');
}
console.log('Local font checks passed: pinned Inter binary, OFL license, Latin/Turkish glyphs, variable weights and no Google font imports/URLs.');
