/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
// Actual transformation and inspector components. Synthetic records; no network or ORM.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const fixture = require('./fixtures/topology-workspace.cjs');
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const module = { exports: {} }; cache.set(relative, module);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const local = name => {
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const target = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(['.ts', '.tsx'].map(ext => target + ext).find(file => fs.existsSync(path.join(root, file))));
    }
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(local, module, module.exports); return module.exports;
}
const view = load('lib/topology/workspace.ts');
const original = JSON.stringify(fixture);
const links = view.normalizeTopologyConnections(fixture.connections);
const recordedLink = { id: 'recorded', sourceDeviceId: 'server-a', targetDeviceId: 'server-b', sourcePortName: 'eth0', targetPortName: 'eth1', type: 'FIBER', bandwidth: '10 Gbps', status: 'UNKNOWN' };
assert.deepEqual(view.normalizeTopologyConnections([recordedLink]), [recordedLink], 'Recorded links preserve both arbitrary device endpoints, ports and declared speed');
assert.equal(links.length, 3);
assert.deepEqual(view.normalizeTopologyConnections([{ ...recordedLink, recordingSource: 'DRAWIO' }]), [{ ...recordedLink, recordingSource: 'DRAWIO' }], 'Keep explicit import provenance without adding absent optional fields');
assert.equal(links[0].sourceDeviceId, 'core'); assert.equal(links[0].sourcePortName, 'Gi1/0/1');
assert.equal(links[0].targetDeviceId, 'access'); assert.equal(links[0].targetInterfaceId, 'access-1');
assert.equal(links[0].sourceInterfaceId, undefined, 'Peer interface must not be assigned to the source switch');
const fallback = view.normalizeTopologyConnections([{ id: 'fallback', status: 'UP', sourcePort: { name: 'Gi1', switchDevice: { id: 'a' }, networkInterface: { id: 'b-1', name: 'eth0', device: { id: 'b' } } }, destInterfaceId: 'unjoined-legacy-id' }]);
assert.equal(fallback[0].targetDeviceId, 'b'); assert.equal(fallback[0].targetInterfaceId, 'b-1');
assert.deepEqual(view.normalizeTopologyConnections([{ id: 'missing', status: 'UP' }, { id: 'self', status: 'UP', sourcePort: { switchDevice: { id: 'a' } }, sourceInterface: { device: { id: 'a' } } }]), []);
for (const value of ['UNKNOWN', '', null, undefined, 'unexpected']) {
  assert.equal(view.connectionState(value).key, 'unknown'); assert.equal(view.connectionState(value).tone, 'neutral');
}
assert.equal(view.connectionState('up').key, 'up'); assert.equal(view.connectionState('DOWN').key, 'down');
assert.equal(view.connectionState('DORMANT').label, 'Beklemede'); assert.equal(view.connectionState('MAINTENANCE').tone, 'warning');
const edge = view.deviceConnectionEdge(links[2]);
assert.equal(edge.data.connectionId, links[2].id); assert.equal(edge.source, 'core'); assert.equal(edge.target, 'unknown');
assert.equal(edge.data.label, 'Durum bilinmiyor'); assert.notEqual(edge.style.stroke, view.deviceConnectionEdge(links[1]).style.stroke);
const positions = view.deviceGraphPositions(fixture.devices.map(device => device.id), links);
assert.ok(positions.core.y < positions.access.y && positions.access.y === positions.server.y);
assert.equal(new Set(Object.values(positions).map(position => `${position.x}:${position.y}`)).size, 4);
assert.deepEqual(view.deviceGraphPositions(['a', 'b'], [], true), { a: { x: 0, y: 0 }, b: { x: 310, y: 0 } });
assert.deepEqual(view.deviceGraphPositions([], links), {});
assert.equal(Object.keys(view.deviceGraphPositions(['a', 'b', 'c'], [{ id: 'a-b', sourceDeviceId: 'a', targetDeviceId: 'b' }, { id: 'b-c', sourceDeviceId: 'b', targetDeviceId: 'c' }, { id: 'c-a', sourceDeviceId: 'c', targetDeviceId: 'a' }])).length, 3, 'Cycles must terminate and retain every device');
const { DeviceInspector, ConnectionInspector } = load('components/topology/TopologyInspector.tsx');
const noop = () => { throw new Error('Read-only fixture must not mutate inventory'); };
const render = props => renderToStaticMarkup(React.createElement(DeviceInspector, { device: fixture.devices[0], devices: fixture.devices, connections: links, downPorts: fixture.telemetry[0].downPorts, telemetryAvailable: true, connectionsAvailable: true, servicesCount: 0, onSelectConnection: noop, onOpenInventory: noop, ...props }));
const html = render(); assert.match(html, /192.0.2.10/); assert.match(html, /TEST-ERİŞİM-01/); assert.match(html, /Gi1\/0\/1 ↔ Gi0\/1/); assert.match(html, /Bağlantı açık/); assert.match(html, /Bağlantı kapalı/); assert.match(html, /Durum bilinmiyor/); assert.match(html, /Son ölçüm \(TSİ\): 16 Eki 2026 15:00/);
assert.match(render({ telemetryAvailable: false, downPorts: [], connectionsAvailable: false, servicesCount: null }), /Port izleme verileri alınamadı/);
assert.match(render({ connectionsAvailable: false }), /Bağlı cihazlar <span>—<\/span>/, 'Unavailable connections cannot be presented as a verified count');
assert.match(render({ downPorts: [] }), /tüm portların izlendiği veya açık olduğu anlamına gelmez/);
const details = renderToStaticMarkup(React.createElement(ConnectionInspector, { connection: links[0], devices: fixture.devices, onSelectDevice: noop }));
assert.match(details, /Kaynak cihaz \/ port/); assert.match(details, /Hedef cihaz \/ port/); assert.match(details, /TEST-OMURGA-01/); assert.match(details, /Gi0\/1/); assert.doesNotMatch(details, /1Gbps/);
assert.equal(JSON.stringify(fixture), original);
console.log('Topology workspace passed: actual endpoint mapping, missing/self endpoints, unknown status, consistent edge metadata, device peers, port freshness and unavailable sources. Synthetic records only.');
