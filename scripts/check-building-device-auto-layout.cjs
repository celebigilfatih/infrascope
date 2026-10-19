/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
function load(file) {
  const fixtureModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(name => load(path.join(path.dirname(file), `${name}.ts`)), fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}
const { defaultBuildingDevicePositions: arrange, mergeBuildingDevicePositions: merge, buildingDeviceFocusIds: focus, buildingDeviceViewport: viewport, DEVICE_READABLE_ZOOM } = load('lib/topology/building-device-layout.ts');
const { visibleDeviceLabelIds } = load('lib/topology/device-labels.ts');
const ids = count => Array.from({ length: count }, (_, i) => `device-${String(i).padStart(4, '0')}`);
const edge = (sourceDeviceId, targetDeviceId, id = `${sourceDeviceId}-${targetDeviceId}`) => ({ id, sourceDeviceId, targetDeviceId, status: 'UP' });
const bounds = points => ({ width: Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)) + 140, height: Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) + 110 });
function spaced(positions) {
  const points = Object.values(positions);
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    assert.ok(Math.abs(points[i].x - points[j].x) >= 172 || Math.abs(points[i].y - points[j].y) >= 134, `Icons and their two-line names overlap: ${i}, ${j}`);
  }
  assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
}
assert.deepEqual(arrange([], []), {});
assert.deepEqual(arrange(['a'], []), { a: { x: 0, y: 0 } });
for (const count of [2, 9, 122, 500]) {
  const devices = ids(count);
  const chain = devices.slice(1).map((id, i) => edge(devices[i], id));
  const star = devices.slice(1).map(id => edge(devices[0], id));
  for (const links of [[], chain, star, [...chain, edge(devices.at(-1), devices[0])]]) {
    const positions = arrange(devices, links);
    assert.equal(Object.keys(positions).length, count);
    spaced(positions);
    const box = bounds(Object.values(positions));
    if (count > 9) assert.ok(box.width / box.height > .5 && box.width / box.height < 3, 'Large maps must remain compact instead of forming one tall strip');
    assert.deepEqual(arrange([...devices].reverse(), [...links].reverse()), positions, 'Inventory/API ordering must not shuffle the map');
    const readable = viewport(positions, focus(devices, links), 1100, 560);
    assert.ok(readable.zoom >= DEVICE_READABLE_ZOOM, 'Initial view keeps icons readable as inventory grows');
    if (count >= 122) {
      const overview = viewport(positions, focus(devices, links), 1100, 560, true);
      assert.ok(overview.zoom < readable.zoom, 'An explicit overview can show the whole large map');
      for (const p of Object.values(positions)) {
        assert.ok(p.x * overview.zoom + overview.x >= 0 && (p.x + 140) * overview.zoom + overview.x <= 1100);
        assert.ok(p.y * overview.zoom + overview.y >= 0 && (p.y + 110) * overview.zoom + overview.y <= 560);
      }
    }
  }
}
const devices = ids(60), links = devices.slice(0, 20).filter((_, i) => i % 2 === 0).map((id, i) => edge(id, devices[i * 2 + 1]));
const positions = arrange(devices, links);
spaced(positions);
for (const link of links) {
  const a = positions[link.sourceDeviceId], b = positions[link.targetDeviceId];
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) <= 220, 'Each disconnected pair stays together');
}
assert.deepEqual(arrange(devices, [...links, edge('missing', devices[0]), edge(devices[0], devices[0]), ...links.map(link => edge(link.targetDeviceId, link.sourceDeviceId))]), positions, 'Self, foreign and duplicate links cannot distort the groups');
const saved = { [devices[0]]: { ...positions[devices[1]] }, stale: { x: 1e6, y: 1e6 } };
const merged = merge(positions, saved);
assert.deepEqual(merged[devices[0]], saved[devices[0]], 'Manual positions stay exact');
assert.equal(merged.stale, undefined, 'Removed inventory cannot expand the viewport');
spaced(merged);
assert.deepEqual(merge(positions, merged), merged, 'A persisted reset restores identical coordinates');
assert.deepEqual(viewport({}, [], 300, 300), { x: 0, y: 0, zoom: 1 });
assert.ok(viewport(merged, focus(devices, links), 300, 240).zoom >= DEVICE_READABLE_ZOOM);
const labelCandidates = [
  { id: 'node-overlap', x: 60, y: 50, width: 180 },
  { id: 'lower-priority', x: 400, y: 200, width: 220 },
  { id: 'selected', x: 400, y: 200, width: 220, priority: 2 },
  { id: 'separate', x: 800, y: 200, width: 220 },
];
assert.deepEqual([...visibleDeviceLabelIds({ a: { x: 0, y: 0 } }, labelCandidates)].sort(), ['selected', 'separate'], 'Crowded labels cannot overlap nodes or each other; selection gets priority');
assert.deepEqual([...visibleDeviceLabelIds({ a: { x: 0, y: 0 } }, [...labelCandidates].reverse())].sort(), ['selected', 'separate']);
console.log('Building auto layout passed: groups, 500-device chain/star/cycles, spacing, stable ordering, saved positions, readable viewport, overview and label collisions.');
