/* eslint-disable @typescript-eslint/no-require-imports */
// Exercise the real port catalog and route handlers, without touching user data.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
let auth = { role: 'EDITOR' }, fail = false, race = '', writes = 0, failEndpointWrite = false;
const links = [], endpoints = [], legacy = [];
const devices = [
  { id: 'a', name: 'Switch A', buildingId: 'A', rackId: null, switchPorts: [{ id: 'a1', name: 'Gi1', speed: '1 Gbps' }, { id: 'a2', name: 'Gi2' }], networkInterfaces: [], nmsInterfaces: [{ id: 'a-nms', interfaceName: 'gi1', speed: BigInt(1000000000) }] },
  { id: 'b', name: 'Switch B', buildingId: 'A', rackId: null, switchPorts: [{ id: 'b1', name: 'Gi1' }, { id: 'b2', name: 'Gi2' }], networkInterfaces: [], nmsInterfaces: [] },
  { id: 'c', name: 'Server C', buildingId: null, rackId: 'rack', rack: { room: { floor: { buildingId: 'A' } } }, switchPorts: [], networkInterfaces: [{ id: 'c1', name: 'eth0' }], nmsInterfaces: [] },
  { id: 'd', name: 'Server D', buildingId: 'A', rackId: null, switchPorts: [], networkInterfaces: [{ id: 'd1', name: 'eth0' }], nmsInterfaces: [] },
  { id: 'e', name: 'Outside', buildingId: 'B', rackId: null, switchPorts: [], networkInterfaces: [], nmsInterfaces: [] },
  { id: 'f', name: 'NMS F', buildingId: 'A', rackId: null, switchPorts: [], networkInterfaces: [], nmsInterfaces: [{ id: 'f1', interfaceName: 'xe1', speed: BigInt(10000000000) }] },
];
function matches(device, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(item => matches(device, item));
    if (key === 'OR') return value.some(item => matches(device, item));
    if (value && typeof value === 'object') return value.in ? value.in.includes(device[key]) : device[key] && matches(device[key], value);
    return device[key] === value;
  });
}
const prisma = {
  building: { findUnique: async ({ where }) => ['A', 'B'].includes(where.id) ? { id: where.id } : null },
  device: {
    count: async ({ where }) => devices.filter(device => matches(device, where)).length,
    findMany: async ({ where }) => { if (fail) throw new Error('Catalog unavailable'); return devices.filter(device => matches(device, where)); },
  },
  deviceLinkEndpoint: {
    findMany: async ({ where }) => endpoints.filter(port => where.deviceId.in.includes(port.deviceId) && (!where.linkId || port.linkId !== where.linkId.not)),
    deleteMany: async ({ where }) => { for (let i = endpoints.length - 1; i >= 0; i--) if (endpoints[i].linkId === where.linkId) endpoints.splice(i, 1); },
    createMany: async ({ data }) => { if (failEndpointWrite) throw Object.assign(new Error('Endpoint conflict'), { code: 'P2002' }); endpoints.push(...data); },
  },
  connection: { findMany: async () => legacy },
  deviceLink: { create: async ({ data }) => {
    if (race) throw Object.assign(new Error('Concurrent write'), { code: race });
    const row = { id: `link-${++writes}`, updatedAt: new Date('2026-10-17T10:00:00Z'), ...data, endpoints: data.endpoints.create };
    endpoints.push(...row.endpoints.map(port => ({ ...port, linkId: row.id })));
    links.push(row); return row;
  },
    findUnique: async ({ where }) => { const row = links.find(link => link.id === where.id); return row ? { ...row, endpoints: endpoints.filter(port => port.linkId === row.id) } : null; },
    findUniqueOrThrow: async args => { const row = await prisma.deviceLink.findUnique(args); if (!row) throw Object.assign(new Error('Missing'), { code: 'P2025' }); return row; },
    updateMany: async ({ where, data }) => { if (race) throw Object.assign(new Error('Concurrent update'), { code: race }); const row = links.find(link => link.id === where.id && link.updatedAt.getTime() === where.updatedAt.getTime()); if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
    deleteMany: async ({ where }) => { if (race) throw Object.assign(new Error('Concurrent delete'), { code: race }); const index = links.findIndex(link => link.id === where.id && link.updatedAt.getTime() === where.updatedAt.getTime()); if (index < 0) return { count: 0 }; const [row] = links.splice(index, 1); await prisma.deviceLinkEndpoint.deleteMany({ where: { linkId: row.id } }); return { count: 1 }; },
  },
  $transaction: async (operation, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const beforeLinks = structuredClone(links), beforeEndpoints = structuredClone(endpoints);
    try { return await operation(prisma); }
    catch (err) { links.splice(0, links.length, ...beforeLinks); endpoints.splice(0, endpoints.length, ...beforeEndpoints); throw err; }
  },
};
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const fixtureRequire = name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) } };
    if (name === '@/lib/prisma') return { prisma };
    if (name === '@/lib/auth/request-actor') return { getRequestActor: async () => auth };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(`${path.join(path.dirname(relative), name)}.ts`);
    throw new Error(`Unexpected dependency ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(fixtureRequire, loaded, loaded.exports);
  cache.set(relative, loaded.exports); return loaded.exports;
}
const { GET, POST, PATCH, DELETE } = load('app/api/network/building-device-connections/route.ts');
const { devicePortCatalog, normalizeDeviceLinks } = load('lib/topology/device-links.ts');
const request = body => ({ json: async () => body, nextUrl: new URL(`http://fixture/?${new URLSearchParams({ buildingId: 'A', sourceDeviceId: 'a', targetDeviceId: 'b', ...body })}`) });
const base = { buildingId: 'A', sourceDeviceId: 'a', targetDeviceId: 'b', sourcePortId: 'switch:a1', targetPortId: 'switch:b1', type: 'FIBER', bandwidth: '10 Gbps' };
const create = extra => POST(request({ ...base, ...extra }));
async function main() {
  const imported = { id: 'drawing', sourceDeviceId: 'a', targetDeviceId: 'b', source: 'DRAWIO', sourceRef: 'page/edge', type: 'UNKNOWN', status: 'UNKNOWN', bandwidth: 'Belirtilmemiş', endpoints: [{ side: 0, portName: 'Ethernet4/48' }] };
  assert.equal(normalizeDeviceLinks([imported])[0].targetPortName, undefined);
  assert.equal(normalizeDeviceLinks([imported])[0].recordingSource, 'DRAWIO');
  assert.equal(normalizeDeviceLinks([{ ...imported, source: 'MANUAL' }]).length, 0, 'Incomplete manual links remain invalid');
  devices[5].nmsInterfaces.push({ id: 'friendly', interfaceName: 'if42', description: 'Ethernet4/48', speed: BigInt(0) });
  const friendly = (await devicePortCatalog(prisma, ['f'])).f.find(p => p.id === 'nms:friendly');
  assert.equal(friendly.name, 'Ethernet4/48'); assert.equal(friendly.key, 'if42');
  devices[5].nmsInterfaces.find(p => p.id === 'friendly').description = '24 Gigabit - Level';
  const numbered = (await devicePortCatalog(prisma, ['f'])).f.find(p => p.id === 'nms:friendly');
  assert.equal(numbered.name, '24'); assert.equal(numbered.key, 'if42');
  devices[5].nmsInterfaces.pop();
  auth = null; assert.equal((await GET(request())).status, 401); assert.equal((await create()).status, 401);
  auth = { role: 'VIEWER' }; assert.equal((await GET(request())).status, 200); assert.equal((await create()).status, 403);
  auth = { role: 'EDITOR' };
  const ports = (await GET(request())).body.data.ports;
  assert.equal(ports.a.length, 2, 'The same physical switch/NMS port is offered only once');
  assert.equal(ports.a[0].occupied, false);
  devices[0].switchPorts[0].connectedToId = 'existing-interface';
  assert.equal((await create()).status, 409, 'A switch-port assignment also reserves the port without a legacy wire row');
  devices[0].switchPorts[0].connectedToId = null;
  for (const invalid of [{ sourceDeviceId: 'b' }, { sourceDeviceId: '' }, { buildingId: 'A:other' }, { type: 'WRONG' }, { bandwidth: 'infinite' }, { bandwidth: '' }, { sourcePortId: '' }, { targetPortId: 'switch:foreign' }]) assert.equal((await create(invalid)).status, 400);
  assert.equal((await POST({ json: async () => { throw new Error('bad json'); } })).status, 400);
  assert.equal((await create({ targetDeviceId: 'e' })).status, 409);
  assert.equal((await create({ buildingId: '__unassigned-devices__' })).status, 409);
  assert.equal((await create({ buildingId: 'missing' })).status, 404);
  assert.equal((await create({ sourcePortId: 'switch:b1' })).status, 400, 'A port belonging to the other device cannot be forged');
  assert.equal(writes, 0);
  const first = await create(); assert.equal(first.status, 201);
  assert.deepEqual(first.body.data.connection, { id: 'link-1', sourceDeviceId: 'a', targetDeviceId: 'b', sourcePortName: 'Gi1', targetPortName: 'Gi1', type: 'FIBER', bandwidth: '10 Gbps', status: 'UNKNOWN', recordKind: 'device-link' });
  const { buildingInternalConnections } = load('lib/topology/building-devices.ts');
  const observed = buildingInternalConnections([{ ...devices[0], nmsDeviceId: 1 }, { ...devices[1], nmsDeviceId: 2 }], [], [{ id: 'neighbor', nmsDeviceId: 1, localInterface: 'Gi1', remoteDeviceName: devices[1].name, remoteInterface: 'Gi1', protocol: 'LLDP', lastSeenAt: new Date() }], devices, [first.body.data.connection]);
  assert.equal(observed.length, 1, 'Manual metadata replaces the same observed port-to-port LLDP edge');
  assert.equal(observed[0].bandwidth, '10 Gbps');
  assert.equal((await GET(request())).body.data.ports.a[0].occupied, true);
  assert.equal((await create()).status, 409);
  assert.equal((await create({ sourceDeviceId: 'b', targetDeviceId: 'a', sourcePortId: 'switch:b1', targetPortId: 'switch:a1' })).status, 409, 'Reverse duplicate must be rejected');
  assert.equal((await create({ sourcePortId: 'nms:a-nms' })).status, 400, 'A duplicate inventory alias cannot bypass physical port reservation');
  assert.equal((await create({ sourcePortId: 'switch:a2', targetPortId: 'switch:b2' })).status, 201, 'Parallel connections may use different ports');
  assert.equal((await create({ sourceDeviceId: 'c', targetDeviceId: 'd', sourcePortId: 'interface:c1', targetPortId: 'interface:d1', type: 'ETHERNET', bandwidth: '1 Gbps' })).status, 201, 'Rack-based membership and server-to-server interfaces are supported');
  legacy.push({ sourcePort: { switchDeviceId: 'b', name: 'Old1', networkInterface: null }, sourceInterface: { deviceId: 'f', name: 'xe1' } });
  assert.equal((await devicePortCatalog(prisma, ['f'])).f[0].occupied, true, 'Legacy peer interfaces reserve the same physical port');
  legacy.length = 0;
  for (const code of ['P2002', 'P2034']) { race = code; assert.equal((await create({ sourceDeviceId: 'f', targetDeviceId: 'e', sourcePortId: 'nms:f1' })).status, 409); }
  // Free up one synthetic endpoint, then test NMS creation and the database race path.
  devices[4].buildingId = 'A'; devices[4].networkInterfaces = [{ id: 'e1', name: 'eth0' }];
  for (const code of ['P2002', 'P2034']) { race = code; assert.equal((await create({ sourceDeviceId: 'f', targetDeviceId: 'e', sourcePortId: 'nms:f1', targetPortId: 'interface:e1' })).status, 409); }
  race = '';
  assert.equal((await create({ sourceDeviceId: 'f', targetDeviceId: 'e', sourcePortId: 'nms:f1', targetPortId: 'interface:e1' })).status, 201);
  const detail = id => GET(request({ connectionId: id }));
  const initial = (await detail('link-1')).body.data;
  assert.equal(initial.ports.a[0].occupied, false, 'Editing excludes only this link from reservations');
  assert.equal(initial.ports.a[1].occupied, true, 'Another link stays reserved');
  assert.equal(initial.connection.sourcePortId, 'switch:a1');
  assert.equal(initial.connection.targetPortId, 'switch:b1');
  assert.equal(initial.canEdit, true); assert.equal(initial.canDelete, false);
  const edit = (extra = {}) => PATCH(request({ ...base, connectionId: 'link-1', updatedAt: initial.connection.updatedAt, ...extra }));
  const remove = (extra = {}) => DELETE(request({ connectionId: 'link-1', buildingId: 'A', updatedAt: initial.connection.updatedAt, ...extra }));
  links[0].buildingConnectionId = 'building-link'; auth = { role: 'ADMIN' };
  assert.equal((await detail('link-1')).status, 403, 'A building-managed connection cannot be edited through the internal workspace');
  assert.equal((await edit()).status, 403); assert.equal((await remove()).status, 403);
  delete links[0].buildingConnectionId;
  auth = null; assert.equal((await edit()).status, 401); assert.equal((await remove()).status, 401);
  auth = { role: 'VIEWER' }; assert.equal((await edit()).status, 403); assert.equal((await remove()).status, 403);
  assert.equal((await detail('link-1')).body.data.canEdit, false);
  auth = { role: 'EDITOR' }; assert.equal((await remove()).status, 403);
  for (const invalid of [{ updatedAt: undefined }, { type: 'INVALID' }, { bandwidth: '' }, { connectionId: 'bad:id' }]) assert.equal((await edit(invalid)).status, 400);
  assert.equal((await edit({ connectionId: 'missing' })).status, 404);
  assert.equal((await edit({ buildingId: 'B' })).status, 409);
  assert.equal((await edit({ sourcePortId: 'switch:b1' })).status, 400);
  assert.equal((await edit({ sourcePortId: 'switch:a2', targetPortId: 'switch:b2' })).status, 409);
  const metadataEdit = await edit({ type: 'ETHERNET', bandwidth: '1 Gbps' });
  assert.equal(metadataEdit.status, 200, 'Current ports are valid when only metadata changes');
  assert.equal(metadataEdit.body.data.connection.type, 'ETHERNET');
  assert.equal(metadataEdit.body.data.connection.bandwidth, '1 Gbps');
  const current = (await detail('link-1')).body.data.connection;
  assert.notEqual(current.updatedAt, initial.connection.updatedAt);
  assert.equal((await edit()).status, 409, 'Stale edits cannot overwrite newer metadata');
  auth = { role: 'ADMIN' }; assert.equal((await remove()).status, 409, 'Stale deletion cannot remove an updated link');
  const parallel = (await detail('link-2')).body.data.connection;
  assert.equal((await remove({ connectionId: 'link-2', updatedAt: parallel.updatedAt })).status, 200);
  const before = { links: structuredClone(links), endpoints: structuredClone(endpoints) };
  failEndpointWrite = true;
  assert.equal((await edit({ updatedAt: current.updatedAt, sourcePortId: 'switch:a2', targetPortId: 'switch:b2' })).status, 409);
  assert.deepEqual({ links, endpoints }, before, 'An endpoint write conflict rolls back metadata and old port release');
  failEndpointWrite = false;
  const changed = await edit({ updatedAt: current.updatedAt, sourcePortId: 'switch:a2', targetPortId: 'switch:b2', type: 'FIBER', bandwidth: '25 Gbps' });
  assert.equal(changed.status, 200); assert.equal(changed.body.data.connection.sourcePortName, 'Gi2');
  const refreshed = (await detail('link-1')).body.data;
  assert.equal(refreshed.connection.bandwidth, '25 Gbps');
  assert.equal((await GET(request())).body.data.ports.a[0].occupied, false, 'The old port is released after an edit');
  devices[1].buildingId = 'B';
  assert.equal((await remove({ updatedAt: refreshed.connection.updatedAt })).status, 409, 'Moved devices invalidate the old building scope');
  devices[1].buildingId = 'A';
  for (const code of ['P2002', 'P2034']) { race = code; assert.equal((await edit({ updatedAt: refreshed.connection.updatedAt, sourcePortId: 'switch:a2', targetPortId: 'switch:b2' })).status, 409); assert.equal((await remove({ updatedAt: refreshed.connection.updatedAt })).status, 409); }
  race = '';
  assert.equal((await remove({ updatedAt: refreshed.connection.updatedAt })).status, 200);
  assert.equal((await detail('link-1')).status, 404);
  assert.ok(!endpoints.some(port => port.linkId === 'link-1'), 'Delete cascades both port reservations');
  assert.equal((await GET(request())).body.data.ports.a.every(port => !port.occupied), true);
  assert.equal((await remove({ updatedAt: refreshed.connection.updatedAt })).status, 404);
  fail = true; assert.equal((await GET(request())).status, 503); assert.equal((await create()).status, 503);
  console.log('Device connections passed: create/edit/delete permissions, building scope, port ownership/reservations, unchanged-port edits, stale writes/deletes, atomic rollback, port release, switch/server/NMS endpoints and storage failures. Synthetic records only.');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
