/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/topology/navigation-state.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const store = new Map();
let blocked = false;
const storage = {
  getItem(key) { if (blocked) throw Error('blocked'); return store.get(key) || null; },
  setItem(key, value) { if (blocked) throw Error('blocked'); store.set(key, value); },
};
function load(server = false) {
  const result = { exports: {} };
  vm.runInNewContext(`(function(exports){${code}\n})`, server ? {} : { window: { localStorage: storage } })(result.exports);
  return result.exports;
}
const { TOPOLOGY_NAVIGATION_PREFIX: prefix, DEFAULT_DEVICE_NAVIGATION: defaults, saveTopologyNavigation: save, readMapNavigation, readDeviceNavigation: read, validDeviceNavigation: valid } = load();
const deviceIds = new Set(['A', 'B', 'C']);
const connectionIds = new Set(['AB', 'BC']);
const value = { ...defaults, selectedDevice: 'C', connectionScopeId: 'C', connectionHistory: ['A', 'B'], panelOpen: true, list: 'connections' };
save('map', { version: 1, buildingId: 'building-A', workspaceOpen: true });
save('building:building-A', value);
const reload = load();
assert.equal(reload.readMapNavigation().buildingId, 'building-A');
assert.equal(reload.readMapNavigation().workspaceOpen, true);
const restored = reload.validDeviceNavigation(reload.readDeviceNavigation('building-A'), deviceIds, connectionIds);
assert.equal(restored.selectedDevice, 'C');
assert.equal(restored.connectionScopeId, 'C');
assert.equal(restored.list, 'connections');
assert.equal(restored.panelOpen, true);
assert.equal(JSON.stringify(restored.connectionHistory), '["A","B"]');
assert.equal(read('building-B').selectedDevice, null, 'Building state must be isolated');
assert.equal(readMapNavigation().buildingId, 'building-A', 'Child saves cannot overwrite map selection');
save('building:building-A', { ...value, connectionHistory: ['A'], selectedDevice: 'B', connectionScopeId: 'B' });
assert.equal(load().readDeviceNavigation('building-A').selectedDevice, 'B', 'Breadcrumb return survives a new mount');
assert.equal(JSON.stringify(load().readDeviceNavigation('building-A').connectionHistory), '["A"]');
const removed = valid(value, new Set(['A', 'B']), connectionIds);
assert.equal(removed.selectedDevice, null);
assert.equal(removed.connectionScopeId, null);
assert.equal(removed.connectionHistory.length, 0, 'Removed current device must clear its trail');
assert.equal(JSON.stringify(valid({ ...value, connectionHistory: ['A', 'deleted', 'B'] }, deviceIds, connectionIds).connectionHistory), '["A","B"]');
const inspected = valid({ ...value, selectedDevice: null, selectedConnection: 'BC' }, deviceIds, connectionIds);
assert.equal(inspected.selectedConnection, 'BC');
assert.equal(inspected.selectedDevice, null, 'Restored connection inspection must focus its endpoints');
assert.equal(valid({ ...value, selectedDevice: null, selectedConnection: 'removed' }, deviceIds, connectionIds).selectedDevice, 'C', 'Missing connection falls back to the current device');
save('building:closed', { ...defaults, selectedDevice: 'A' });
assert.equal(read('closed').panelOpen, false, 'A closed panel stays closed');
for (const bad of ['{broken', 'null', '[]', '{"version":2}', '{"version":1,"connectionHistory":[null,{},42],"selectedDevice":{}}']) {
  store.set(prefix + 'building:bad', bad);
  assert.equal(read('bad').selectedDevice, null);
  assert.equal(read('bad').connectionHistory.length, 0);
}
save('map', { version: 1, buildingId: 'building-A', workspaceOpen: false, onlyConnected: true });
assert.equal(load().readMapNavigation().onlyConnected, true);
save('building:focused', { ...value, onlyConnected: true });
assert.equal(load().readDeviceNavigation('focused').onlyConnected, true);
assert.equal(valid({ ...value, onlyConnected: true }, deviceIds, connectionIds).onlyConnected, true);
assert.equal(valid({ ...value, onlyConnected: true }, new Set(['A', 'B']), connectionIds).onlyConnected, false, 'A missing focus cannot leave the map narrowed');
assert.equal(valid({ ...defaults, onlyConnected: true }, deviceIds, connectionIds).onlyConnected, false);
save('building:focused', { ...value, onlyConnected: false });
assert.equal(load().readDeviceNavigation('focused').onlyConnected, false, 'Show all survives reload');
assert.equal(readMapNavigation().connectionDepth, 1, 'Legacy map records default to one step');
assert.equal(read('focused').connectionDepth, 1, 'Legacy building records default to one step');
save('map', { version: 1, buildingId: 'building-A', workspaceOpen: false, onlyConnected: true, connectionDepth: 2 });
save('building:focused', { ...value, onlyConnected: true, connectionDepth: 1 });
assert.equal(load().readMapNavigation().connectionDepth, 2);
assert.equal(load().readDeviceNavigation('focused').connectionDepth, 1, 'Map and building depth preferences are independent');
save('building:other', { ...value, onlyConnected: false, connectionDepth: 2 });
assert.equal(load().readDeviceNavigation('other').connectionDepth, 2, 'Show all retains the depth preference');
assert.equal(read('focused').connectionDepth, 1, 'Each building has its own preference');
assert.equal(valid({ ...value, onlyConnected: true, connectionDepth: 2 }, new Set(['A', 'B']), connectionIds).connectionDepth, 2, 'Missing focus exits the mode without discarding depth');
for (const connectionDepth of [undefined, null, 0, 3, '2', {}, -1]) {
  save('map', { version: 1, buildingId: 'building-A', workspaceOpen: false, connectionDepth });
  save('building:invalid-depth', { ...value, connectionDepth });
  assert.equal(load().readMapNavigation().connectionDepth, 1);
  assert.equal(load().readDeviceNavigation('invalid-depth').connectionDepth, 1);
}
console.log('Neighborhood depth persistence passed: both map scopes, independent buildings, show-all preference, legacy records, removed focus and invalid values.');
assert.equal(JSON.stringify(load().readMapNavigation().hiddenHopDistances), '[]', 'Legacy records keep both distances visible');
save('map', { version: 1, buildingId: 'building-A', workspaceOpen: false, hiddenHopDistances: [1] });
save('building:focused', { ...value, hiddenHopDistances: [2] });
save('building:other', { ...value, hiddenHopDistances: [1, 2] });
assert.equal(JSON.stringify(load().readMapNavigation().hiddenHopDistances), '[1]');
assert.equal(JSON.stringify(load().readDeviceNavigation('focused').hiddenHopDistances), '[2]');
assert.equal(JSON.stringify(load().readDeviceNavigation('other').hiddenHopDistances), '[1,2]', 'Each map scope keeps independent filters');
assert.equal(JSON.stringify(valid({ ...value, hiddenHopDistances: [1, 2] }, new Set(['A', 'B']), connectionIds).hiddenHopDistances), '[1,2]', 'Removed focus preserves the preference');
for (const [input, expected] of [[null, []], [false, []], ['1', []], [[0, 3, '1'], []], [[2, 2, 1, null, 0], [1, 2]]]) {
  save('map', { version: 1, buildingId: null, workspaceOpen: false, hiddenHopDistances: input });
  save('building:invalid-hops', { ...value, hiddenHopDistances: input });
  assert.equal(JSON.stringify(load().readMapNavigation().hiddenHopDistances), JSON.stringify(expected));
  assert.equal(JSON.stringify(load().readDeviceNavigation('invalid-hops').hiddenHopDistances), JSON.stringify(expected));
}
console.log('Hop filter persistence passed: reload, independent map/building scopes, legacy defaults and invalid/duplicate values.');
const camera = { x: -512.125, y: 89.75, zoom: .72 };
save('map', { version: 1, buildingId: 'building-A', workspaceOpen: true, viewport: camera });
save('building:building-A', { ...value, viewport: { x: 42, y: -305, zoom: 1.35 } });
assert.equal(JSON.stringify(load().readMapNavigation().viewport), JSON.stringify(camera));
assert.equal(load().readDeviceNavigation('building-A').viewport.zoom, 1.35);
assert.equal(load().readDeviceNavigation('building-B').viewport ?? null, null);
assert.equal(load().readMapNavigation().viewport.zoom, .72, 'Inner map moves must not overwrite the building map');
for (const invalid of [null, {}, { x: 0, y: 0, zoom: 0 }, { x: 0, y: 0, zoom: 3 }, { x: '10', y: 0, zoom: 1 }, { x: Infinity, y: 0, zoom: 1 }, { x: 0, y: NaN, zoom: 1 }, { x: 1e8, y: 0, zoom: 1 }]) {
  assert.equal(load().validTopologyViewport(invalid), null);
}
assert.equal(load().validTopologyViewport({ x: 0, y: 0, zoom: .05 }).zoom, .05);
assert.equal(load().validTopologyViewport({ x: 0, y: 0, zoom: 2 }).zoom, 2);
save('map', { version: 1, buildingId: null, workspaceOpen: false, viewport: { x: 0, y: 0, zoom: 99 } });
assert.equal(readMapNavigation().viewport, null, 'Malformed camera falls back to automatic layout');
const viewportCode = ts.transpileModule(fs.readFileSync('components/topology/useTopologyViewport.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const slots = [];
let cursor = 0;
const react = {
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
  useCallback(fn, deps) { const i = cursor++; if (!(i in slots) || deps.some((dep, j) => !Object.is(dep, slots[i].deps[j]))) slots[i] = { fn, deps }; return slots[i].fn; },
};
const hookModule = { exports: {} };
vm.runInNewContext(`(function(require,exports){${viewportCode}\n})`, {})(name => name === 'react' ? react : load(), hookModule.exports);
const renderViewport = () => { cursor = 0; return hookModule.exports.useTopologyViewport(); };
let hook = renderViewport();
hook.captureViewport({ x: 0, y: 0, zoom: 1 });
assert.equal(renderViewport().savedViewport, null, 'Initial React Flow move cannot overwrite a stored camera before hydration');
hook.restoreViewport(camera);
hook = renderViewport();
assert.equal(hook.retainedViewport.current.zoom, .72);
hook.captureViewport({ x: -600, y: 95, zoom: .9 });
hook = renderViewport();
assert.equal(hook.savedViewport.x, -600, 'Pan and zoom update the retained camera after hydration');
const unchanged = hook.savedViewport;
hook.captureViewport({ x: -600, y: 95, zoom: .9 });
assert.equal(renderViewport().savedViewport, unchanged, 'Repeated automatic camera events must not cause a render loop');
hook.captureViewport({ x: 0, y: 0, zoom: NaN });
assert.equal(renderViewport().savedViewport, unchanged);
hook.releaseViewport();
hook = renderViewport();
assert.equal(hook.retainedViewport.current, null, 'Explicit search or fit can replace the retained camera');
assert.equal(hook.savedViewport, null);
hook.captureViewport({ x: 150, y: -50, zoom: 1.1 });
assert.equal(renderViewport().savedViewport.zoom, 1.1, 'The new programmatic focus is captured too');
console.log('Viewport persistence passed: both map scopes, exact fractional transforms, older records, invalid cameras, hydration ordering, pan/zoom, explicit navigation and stable capture.');
blocked = true;
assert.equal(read('building-A').selectedDevice, null);
assert.equal(readMapNavigation(), null);
assert.doesNotThrow(() => save('map', { version: 1, buildingId: null, workspaceOpen: false }));
const server = load(true);
assert.equal(server.readMapNavigation(), null);
assert.equal(server.readDeviceNavigation('building-A').selectedDevice, null);
console.log('Topology navigation persistence passed: reload, building isolation, breadcrumb return, removed devices/links, panel state, malformed data, blocked storage and server safety. No live data changed.');
