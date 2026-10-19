/* eslint-disable @typescript-eslint/no-require-imports */
// Run actual handlers against an isolated transactional store. No live data is changed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
let auth = { role: 'ADMIN' }, race = '', fail = false, missedWrite = false, failEndpointWrite = false;
let physicalLinks = [], endpoints = [];
const device = (id, buildingId, extra = {}) => ({ id, name: `Device ${id}`, managementIp: null, buildingId, rackId: null, switchPorts: [{ id: `${id}1`, name: 'Gi1' }, { id: `${id}2`, name: 'Gi2' }], networkInterfaces: [], nmsInterfaces: [], ...extra });
const devices = [device('a', 'A'), device('b', 'B'), device('c', 'C'), device('rack', null, { rackId: 'rack1', rack: { room: { floor: { buildingId: 'A' } } } }), device('nms', 'B', { switchPorts: [], nmsInterfaces: [{ id: 'n1', interfaceName: 'xe1', speed: BigInt(10000000000) }] })];
const original = { id: 'link', sourceBuildingId: 'A', destBuildingId: 'B', connectionType: 'FIBER_SINGLE_MODE', bandwidth: null, recordingMethod: 'MANUAL', updatedAt: new Date('2026-10-17T10:00:00Z'), status: 'MAINTENANCE', distance: 1.5, notes: 'Preserve notes', metadata: { reference: 'keep' }, provider: 'Keep provider' };
let rows = [structuredClone(original)];
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (value instanceof Date) return row[key].getTime() === value.getTime();
    if (value && typeof value === 'object') return value.not !== undefined ? row[key] !== value.not : value.in ? value.in.includes(row[key]) : row[key] && matches(row[key], value);
    return row[key] === value;
  });
}
const prisma = {
  device: { findMany: async ({ where }) => devices.filter(row => matches(row, where)), count: async ({ where }) => devices.filter(row => matches(row, where)).length },
  connection: { findMany: async () => [] },
  deviceLinkEndpoint: {
    findMany: async ({ where }) => endpoints.filter(row => matches(row, where)),
    deleteMany: async ({ where }) => { endpoints = endpoints.filter(row => !matches(row, where)); },
    createMany: async ({ data }) => { if (failEndpointWrite || data.some(row => endpoints.some(other => other.deviceId === row.deviceId && other.portKey === row.portKey))) throw { code: 'P2002' }; endpoints.push(...structuredClone(data)); },
  },
  deviceLink: {
    create: async ({ data }) => { const row = { id: `physical-${physicalLinks.length + 1}`, ...data }; delete row.endpoints; await prisma.deviceLinkEndpoint.createMany({ data: data.endpoints.create.map(port => ({ ...port, linkId: row.id })) }); physicalLinks.push(row); return row; },
    update: async ({ where, data }) => { const row = physicalLinks.find(link => matches(link, where)); Object.assign(row, data); return row; },
    deleteMany: async ({ where }) => { for (const row of physicalLinks.filter(link => matches(link, where))) await prisma.deviceLinkEndpoint.deleteMany({ where: { linkId: row.id } }); physicalLinks = physicalLinks.filter(link => !matches(link, where)); },
  },
  building: { count: async ({ where }) => where.id.in.filter(id => ['A', 'B', 'C'].includes(id)).length },
  buildingConnection: {
    findUnique: async ({ where }) => { if (fail) throw new Error('offline'); const row = rows.find(item => matches(item, where)); const physical = physicalLinks.find(link => link.buildingConnectionId === row?.id); return row ? structuredClone({ ...row, sourceBuilding: { id: row.sourceBuildingId, name: `Bina ${row.sourceBuildingId}` }, destBuilding: { id: row.destBuildingId, name: `Bina ${row.destBuildingId}` }, deviceLink: physical ? { ...physical, sourceDevice: devices.find(device => device.id === physical.sourceDeviceId), targetDevice: devices.find(device => device.id === physical.targetDeviceId), endpoints: endpoints.filter(port => port.linkId === physical.id) } : null }) : null; },
    findFirst: async ({ where }) => rows.find(row => matches(row, where)) || null,
    updateMany: async ({ where, data }) => { if (race) throw { code: race }; const row = rows.find(item => matches(item, where)); if (!row || missedWrite) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
    deleteMany: async ({ where }) => { if (race) throw { code: race }; const index = rows.findIndex(row => matches(row, where)); if (index < 0 || missedWrite) return { count: 0 }; const [row] = rows.splice(index, 1); await prisma.deviceLink.deleteMany({ where: { buildingConnectionId: row.id } }); return { count: 1 }; },
  },
  $transaction: async (operation, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const before = structuredClone({ rows, physicalLinks, endpoints });
    try { return await operation(prisma); } catch (err) { rows = before.rows; physicalLinks = before.physicalLinks; endpoints = before.endpoints; throw err; }
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
const { GET, PATCH, PUT, DELETE } = load('app/api/building-connections/[id]/route.ts');
const request = body => ({ json: async () => body, nextUrl: new URL('http://fixture/') });
const context = id => ({ params: { id: id || 'link' } });
const version = () => rows.find(row => row.id === 'link').updatedAt.toISOString();
const base = () => ({ connectionType: 'CAT6', bandwidth: '1 Gbps', updatedAt: version() });
const edit = (extra = {}, id) => PATCH(request({ ...base(), ...extra }), context(id));
const remove = (extra = {}, id) => DELETE(request({ updatedAt: version(), ...extra }), context(id));
async function main() {
  auth = null;
  for (const call of [() => GET(request(), context()), () => edit(), () => remove()]) assert.equal((await call()).status, 401);
  auth = { role: 'VIEWER' };
  const viewer = await GET(request(), context());
  assert.equal(viewer.status, 200); assert.equal(viewer.body.canEdit, false); assert.equal(viewer.body.canDelete, false);
  assert.match(viewer.headers['Cache-Control'], /no-store/);
  assert.equal((await edit()).status, 403); assert.equal((await remove()).status, 403);
  auth = { role: 'EDITOR' }; assert.equal((await remove()).status, 403);
  assert.equal((await GET(request(), context())).body.canEdit, true);
  assert.equal((await GET(request(), context('missing'))).status, 404);
  for (const invalid of [{ updatedAt: undefined }, { updatedAt: 'bad' }, { connectionType: 'BAD' }, { bandwidth: undefined }, { bandwidth: 'infinite' }, { bandwidth: '0 Gbps' }, { bandwidth: -1 }]) assert.equal((await edit(invalid)).status, 400);
  assert.equal((await PATCH({ json: async () => { throw new Error('bad json'); } }, context())).status, 400);
  assert.equal((await edit({}, 'missing')).status, 404);
  const before = structuredClone(rows[0]), stale = version();
  const saved = await edit({ sourceBuildingId: 'C', status: 'ACTIVE', distance: 999, notes: 'Attack' });
  assert.equal(saved.status, 200);
  for (const field of ['sourceBuildingId', 'destBuildingId', 'distance', 'notes', 'metadata', 'provider', 'status']) assert.deepEqual(rows[0][field], before[field], `${field} must survive a compact edit`);
  assert.equal(rows[0].connectionType, 'CAT6'); assert.equal(rows[0].bandwidth, '1 Gbps'); assert.notEqual(version(), stale);
  assert.equal((await edit({ updatedAt: stale })).status, 409);
  auth = { role: 'ADMIN' }; assert.equal((await remove({ updatedAt: stale })).status, 409);
  const concurrent = { ...structuredClone(original), id: 'reverse', sourceBuildingId: 'B', destBuildingId: 'A', connectionType: 'CAT6A' };
  rows.push(concurrent);
  assert.equal((await edit({ connectionType: 'CAT6A' })).status, 409, 'Reverse parallel link of the chosen type is rejected');
  assert.equal(rows[0].connectionType, 'CAT6'); rows.pop();
  assert.equal((await edit({ bandwidth: '' })).status, 200); assert.equal(rows[0].bandwidth, null);
  assert.equal((await edit({ bandwidth: ' 2.5 Gbps ' })).status, 200); assert.equal(rows[0].bandwidth, '2.5 Gbps');
  const put = extra => PUT(request({ ...base(), sourceBuildingId: 'A', destBuildingId: 'B', status: 'ACTIVE', ...extra }), context());
  assert.equal((await put({ destBuildingId: 'A' })).status, 400);
  assert.equal((await put({ destBuildingId: 'missing' })).status, 409);
  assert.equal((await put({ distance: 'invalid' })).status, 400);
  assert.equal((await put({ notes: 'Legacy form remains compatible' })).status, 200);
  assert.equal(rows[0].distance, 1.5, 'Omitted distance is preserved by the full form');
  rows[0].recordingMethod = 'AUTO';
  const automatic = await GET(request(), context());
  assert.equal(automatic.body.canEdit, false); assert.equal(automatic.body.canDelete, false);
  assert.equal((await edit()).status, 403); assert.equal((await remove()).status, 403);
  rows[0].recordingMethod = 'MANUAL';
  missedWrite = true; assert.equal((await edit()).status, 409); assert.equal((await remove()).status, 409); missedWrite = false;
  for (const code of ['P2002', 'P2034', 'P2025']) {
    race = code; const snapshot = structuredClone(rows); assert.equal((await edit()).status, 409); assert.equal((await remove()).status, 409); assert.deepEqual(rows, snapshot);
  }
  race = ''; fail = true;
  assert.equal((await GET(request(), context())).status, 503); assert.equal((await edit()).status, 503); assert.equal((await remove()).status, 503); fail = false;
  assert.equal((await remove({ updatedAt: undefined })).status, 400);
  assert.equal((await remove({}, 'missing')).status, 404);
  const selection = { sourceDeviceId: 'a', targetDeviceId: 'b', sourcePortId: 'switch:a1', targetPortId: 'switch:b1' };
  const options = (await GET(request(), context())).body.endpointOptions;
  assert.deepEqual(options.sourceDevices.map(device => device.id), ['a', 'rack']);
  assert.deepEqual(options.targetDevices.map(device => device.id), ['b', 'nms']);
  for (const invalid of [{}, { ...selection, sourceDeviceId: 'b' }, { ...selection, targetPortId: '' }, { ...selection, targetPortId: 'forged' }]) assert.equal((await edit({ endpoints: invalid })).status, 400);
  assert.equal((await edit({ endpoints: { ...selection, sourceDeviceId: 'c' } })).status, 409);
  assert.equal((await edit({ endpoints: { ...selection, sourcePortId: 'switch:b1' } })).status, 400);
  endpoints.push({ linkId: 'internal', deviceId: 'a', portKey: 'gi1' });
  assert.equal((await edit({ endpoints: selection })).status, 409, 'Existing internal links reserve ports for building links'); endpoints.pop();
  const beforeReservation = structuredClone(rows); failEndpointWrite = true;
  assert.equal((await edit({ endpoints: selection })).status, 409); assert.deepEqual(rows, beforeReservation); assert.equal(physicalLinks.length, 0); assert.equal(endpoints.length, 0); failEndpointWrite = false;
  assert.equal((await edit({ endpoints: selection })).status, 200); assert.equal(physicalLinks.length, 1); assert.equal(endpoints.length, 2);
  const read = (await GET(request(), context())).body.data;
  assert.equal(read.deviceLink.sourceDeviceId, 'a'); assert.equal(read.deviceLink.endpoints[0].portId, 'switch:a1');
  assert.equal((await edit({ bandwidth: '10 Gbps' })).status, 200, 'Own reservations are excluded when metadata alone changes');
  assert.equal(physicalLinks[0].bandwidth, '10 Gbps');
  const portRequest = request(); portRequest.nextUrl = new URL('http://fixture/?mode=ports&sourceDeviceId=a&targetDeviceId=b');
  assert.equal((await GET(portRequest, context())).body.data.ports.a[0].occupied, false);
  const foreignRequest = request(); foreignRequest.nextUrl = new URL('http://fixture/?mode=ports&sourceDeviceId=c');
  assert.equal((await GET(foreignRequest, context())).status, 409);
  const snapshotBeforeFailure = structuredClone({ rows, endpoints, physicalLinks }); failEndpointWrite = true;
  assert.equal((await edit({ endpoints: { ...selection, sourcePortId: 'switch:a2' } })).status, 409); assert.deepEqual({ rows, endpoints, physicalLinks }, snapshotBeforeFailure); failEndpointWrite = false;
  assert.equal((await edit({ endpoints: { ...selection, sourcePortId: 'switch:a2', targetPortId: 'switch:b2' } })).status, 200);
  assert.equal(endpoints.some(port => port.portId === 'switch:a1'), false, 'Changing ports releases both old reservations');
  devices[0].buildingId = 'C'; assert.equal((await edit()).status, 409, 'A moved device must be repaired before saving'); devices[0].buildingId = 'A';
  assert.equal((await edit({ endpoints: null })).status, 200); assert.equal(endpoints.length, 0); assert.equal(physicalLinks.length, 0); assert.equal(rows.length, 1);
  assert.equal((await edit({ endpoints: { sourceDeviceId: 'rack', targetDeviceId: 'nms', sourcePortId: 'switch:rack1', targetPortId: 'nms:n1' } })).status, 200, 'Rack devices and NMS ports are supported across buildings');
  assert.equal((await remove()).status, 200); assert.equal(rows.length, 0);
  assert.equal(physicalLinks.length, 0); assert.equal(endpoints.length, 0, 'Deleting a building link releases both ports');
  rows = [structuredClone(original)];
  const legacyRequest = { json: async () => { throw new Error('No body'); }, nextUrl: new URL(`http://fixture/?${new URLSearchParams({ updatedAt: version() })}`) };
  assert.equal((await DELETE(legacyRequest, context())).status, 200, 'The existing management dialog may pass its version in the query');
  assert.equal(rows.length, 0);
  console.log('Building connection checks passed: permissions, validation, partial metadata preservation, legacy PUT, reverse duplicates, read-only discovery, optimistic concurrency, atomic failure and deletion. No live data changed.');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
