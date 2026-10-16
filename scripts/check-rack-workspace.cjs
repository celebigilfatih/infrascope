// Verify saved rack positions, estimated capacity, overlap segments and API height data.
// Uses in-memory fixtures and a mocked Prisma client. No live requests or records.
/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
const previewStyles = new Map();
let databaseCalls = 0, selection;
const prisma = { rack: { findMany: async args => { databaseCalls++; selection = args; return [{ id: 'test-rack', maxUnits: 12, devices: [{ id: 'a', rackUnitPosition: 1, metadata: { unitHeight: 3 } }] }]; } } };
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const module = { exports: {} }; cache.set(relative, module);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name === '@/lib/prisma') return { prisma };
    if (name === 'next/server') return { NextResponse: { json: value => value } };
    if (name === 'next/link') return { __esModule: true, default: ({ children, href, ...props }) => require('react').createElement('a', { href, ...props }, children) };
    if (name.endsWith('.module.css')) {
      const file = path.join(path.dirname(relative), name);
      const prefix = path.basename(file).replace(/\W/g, '_') + '_';
      previewStyles.set(file, fs.readFileSync(path.join(root, file), 'utf8').replace(/\.([a-zA-Z_][\w-]*)/g, `.${prefix}$1`));
      return { __esModule: true, default: new Proxy({}, { get: (_, key) => prefix + String(key) }) };
    }
    if (name.startsWith('@/') || name.startsWith('.')) {
      let target = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(relative), name);
      target = ['.ts', '.tsx'].map(ext => target + ext).find(file => fs.existsSync(path.join(root, file)));
      if (!target) throw new Error(`Missing local module: ${name}`);
      return load(target);
    }
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(localRequire, module, module.exports);
  return module.exports;
}
const { presentRack } = load('lib/racks/presentation.ts');
const device = (id, start, height) => ({ id, name: id, rackUnitPosition: start, metadata: { unitHeight: height }, type: 'PHYSICAL_SERVER', status: 'ACTIVE' });
const devices = [device('Sunucu A', 1, 3), device('Sunucu B', 7, 2), device('Atanmamış C', null, 2)];
const original = JSON.stringify(devices);
const result = presentRack(12, devices);
assert.equal(result.capacity.usedUnits, 7, 'Capacity must account for multi-U heights and estimated unassigned devices');
assert.equal(result.capacity.availableUnits, 5);
assert.equal(result.assignedUsedUnits, 5);
assert.equal(result.estimatedUnits, 2);
assert.equal(result.capacity.unpositionedDevices, 1);
assert.deepEqual(result.segments.map(segment => [segment.start, segment.end, segment.devices.map(d => d.id)]), [[1, 3, ['Sunucu A']], [7, 8, ['Sunucu B']]]);
assert.equal(JSON.stringify(devices), original, 'Presentation must not write estimated positions into source data');
const overlap = presentRack(12, [device('A', 2, 3), device('B', 4, 2)]);
assert.equal(overlap.capacity.usedUnits, 4, 'Overlapping units must only be counted once');
assert.equal(overlap.capacity.conflictDevices, 2);
assert.deepEqual(overlap.segments.map(s => [s.start, s.end, s.devices.length]), [[2, 3, 1], [4, 4, 2], [5, 5, 1]]);
assert.equal(overlap.segments.every(s => s.hasConflict), true);
const overflow = presentRack(12, [device('A', 12, 3), device('B', 20, 1)]);
assert.equal(overflow.capacity.usedUnits, 1);
assert.equal(overflow.capacity.conflictDevices, 2);
assert.equal(overflow.segments.length, 1);
assert.equal(overflow.segments[0].hasConflict, true);
const empty = presentRack(42, []);
assert.equal(empty.capacity.availableUnits, 42); assert.equal(empty.segments.length, 0);
const unassigned = presentRack(4, [device('A', 0, 2), device('B', 1.5, 2), device('C', null, 1)]);
assert.equal(unassigned.segments.length, 0);
assert.equal(unassigned.capacity.usedUnits, 4);
assert.equal(unassigned.capacity.unpositionedDevices, 3);
assert.equal(unassigned.capacity.conflictDevices, 1);

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { RackDetails } = load('components/racks/RackDetails.tsx');
const rack = { id: 'fixture', name: 'Test kabineti', type: 'CUSTOM', maxUnits: 12, operationalStatus: 'OPERATIONAL', position: 'Test sırası', room: { id: 'fixture-room', name: 'Test odası' }, devices };
const html = renderToStaticMarkup(React.createElement(RackDetails, { rack, onEdit() {}, onDelete() {} }));
assert.match(html, /grid-row:10 \/ span 3/);
assert.match(html, /Konum atanmamış/);
assert.match(html, /7 U/); assert.match(html, /5 U/);
assert.doesNotMatch(html, /U 4: Atanmamış C/, 'Estimated placements must not appear as saved positions in the elevation');
assert.match(html, /Kabinet içi yerleşim/);
if (process.argv.includes('--preview')) {
  const globals = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
  fs.mkdirSync(path.join(root, 'output/racks-refresh'), { recursive: true });
  fs.writeFileSync(path.join(root, 'output/racks-refresh/fixture.html'), `<!doctype html><html lang="tr"><meta charset="utf-8"><title>Kabinet yerleşimi — test verisi</title><style>${globals}\n${[...previewStyles.values()].join('\n')}\nbody{margin:24px auto;max-width:1020px;padding:0 20px;font-family:Arial,sans-serif;background:#f8faf9;color:#17241e}*{box-sizing:border-box}h1,h2,h3,h4,p,dl,dd{margin:0}button{font-family:inherit;cursor:pointer}button svg{vertical-align:middle}button{padding:6px;border:1px solid #dce5df;border-radius:7px;background:white}a{color:inherit;text-decoration:none}</style><p style="margin-bottom:16px;font-weight:600">TEST VERİSİ · 12 U kabinet · 3 U ve 2 U kayıtlı cihazlar · 2 U konumu atanmamış cihaz</p>${html}</html>`);
}

async function main() {
  const route = load('app/api/racks/route.ts');
  const request = fresh => ({ nextUrl: new URL(`http://fixture.invalid/api/racks${fresh ? '?fresh=1' : ''}`) });
  await route.GET(request(false)); await route.GET(request(false));
  assert.equal(databaseCalls, 1, 'Ordinary list requests should retain caching');
  await route.GET(request(true));
  assert.equal(databaseCalls, 2, 'Explicit refresh must bypass stale cached capacity');
  assert.equal(selection.include.devices.select.metadata, true, 'The list response must include multi-U height metadata');
  console.log('Rack workspace checks passed: multi-U capacity, assigned-only elevation, estimated/unassigned devices, overlap, overflow, rendered labels, unchanged payloads and fresh GET. No live requests.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
