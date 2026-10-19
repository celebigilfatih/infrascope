/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
let auth = { role: 'EDITOR' }, conflictAtWrite = null, failLinks = false, writes = 0;
const assignmentWrites = [];
const devices = [
  { id: 'a', name: 'Alpha', nmsDeviceId: 1, buildingId: null, rackId: null },
  { id: 'b', name: 'Beta', nmsDeviceId: 2, buildingId: null, rackId: null },
  { id: 'e', name: 'External', nmsDeviceId: 3, buildingId: 'B', rackId: null },
  { id: 'r', name: 'Rack device', buildingId: null, rackId: 'rack', rack: { id: 'rack', room: { floor: { building: { id: 'B', name: 'Building B' } } } } },
  ...Array.from({ length: 35 }, (_, i) => ({ id: `candidate-${i}`, name: `Candidate ${String(i).padStart(2, '0')}`, buildingId: null, rackId: null })),
].map(device => ({ type: 'SWITCH', status: 'UNKNOWN', criticality: 'MEDIUM', floorId: null, ...device }));
function matches(device, where = {}) {
  if (where.AND && !where.AND.every(w => matches(device, w))) return false;
  if (where.OR && !where.OR.some(w => matches(device, w))) return false;
  for (const field of ['id', 'rackId', 'buildingId', 'floorId']) if (Object.hasOwn(where, field)) {
    const value = where[field];
    if (value && typeof value === 'object') {
      if (value.in && !value.in.includes(device[field])) return false;
      if (value.not !== undefined && device[field] === value.not) return false;
    } else if (device[field] !== value) return false;
  }
  if (where.rack && device.rack?.room?.floor?.building?.id !== where.rack.room.floor.buildingId) return false;
  for (const field of ['name', 'managementIp']) if (where[field]?.contains && !String(device[field] || '').toLowerCase().includes(where[field].contains.toLowerCase())) return false;
  return true;
}
const wire = (id, peer) => ({ id, status: 'UP', sourcePort: { name: 'Gi1', switchDevice: { id: 'a' } }, sourceInterface: { id: `${peer}-1`, name: 'Gi2', device: { id: peer } } });
const neighbors = [
  { id: 'reverse', nmsDeviceId: 2, localInterface: 'Gi2', remoteDeviceName: 'Alpha', remoteInterface: 'Gi1', protocol: 'lldp', lastSeenAt: new Date('2026-10-16T12:00:00Z') },
  { id: 'parallel', nmsDeviceId: 1, localInterface: 'Gi3', remoteDeviceName: 'Beta', remoteInterface: 'Gi4', protocol: 'lldp', lastSeenAt: new Date('2026-10-16T12:00:00Z') },
];
const prisma = {
  deviceLink: { findMany: async () => [] },
  building: { findUnique: async ({ where }) => ['A', 'B'].includes(where.id) ? { id: where.id } : null },
  device: {
    findMany: async ({ where, select, skip = 0, take = 10000 }) => { assert.ok(!select.snmpCommunity && !select.sshPassword); return devices.filter(d => matches(d, where)).slice(skip, skip + take); },
    count: async ({ where }) => devices.filter(d => matches(d, where)).length,
    updateMany: async ({ where, data }) => {
      assignmentWrites.push({ where: { ...where }, data: { ...data } });
      const selected = devices.filter(d => matches(d, where));
      const changed = ++writes === conflictAtWrite ? [] : selected;
      changed.forEach(d => Object.assign(d, data));
      return { count: changed.length };
    },
  },
  connection: { findMany: async () => { if (failLinks) throw new Error('Synthetic unavailable links'); return [wire('internal', 'b'), wire('external', 'e')]; } },
  nmsTopologyLink: { findMany: async () => neighbors },
  $transaction: async fn => { const before = devices.map(d => ({ ...d })); try { return await fn(prisma); } catch (error) { devices.splice(0, devices.length, ...before); throw error; } },
};
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const loaded = { exports: {} }; cache.set(relative, loaded);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mockRequire = name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
    if (name === '@/lib/prisma') return { prisma };
    if (name === '@/lib/auth/request-actor') return { getRequestActor: async () => auth };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(path.join(path.dirname(relative), name) + '.ts');
    throw new Error(`Unexpected live dependency ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(mockRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { GET, PATCH } = load('app/api/network/building-devices/route.ts');
const helper = load('lib/topology/building-devices.ts');
const request = (query = '', body) => ({ nextUrl: new URL(`http://fixture/api?${query}`), json: async () => body });
const assign = (ids, extra = {}) => PATCH(request('', { action: 'assign', buildingId: 'A', deviceIds: ids, ...extra }));
async function main() {
  assert.equal(helper.deviceBuildingId(devices.find(d => d.id === 'r')), 'B');
  auth = null; assert.equal((await GET(request('buildingId=A'))).status, 401); assert.equal((await assign(['a'])).status, 401);
  auth = { role: 'VIEWER' }; assert.equal((await GET(request('buildingId=A'))).body.data.canManage, false); assert.equal((await assign(['a'])).status, 403);
  auth = { role: 'EDITOR' };
  assert.equal((await GET(request('buildingId=missing'))).status, 404);
  for (const ids of [[], [null], Array.from({ length: 201 }, (_, i) => String(i))]) assert.equal((await assign(ids)).status, 400);
  assert.equal((await assign(['a', 'missing'])).status, 404); assert.equal((await assign(['a', 'r'])).status, 409); assert.equal(writes, 0);
  assert.equal((await assign(['e'])).status, 409);
  const page1 = (await GET(request('buildingId=A&mode=candidates'))).body.data;
  const page2 = (await GET(request('buildingId=A&mode=candidates&page=2'))).body.data;
  assert.equal(page1.items.length, 30); assert.ok(page2.items.length); assert.ok(page1.items.every(d => !d.buildingId && !d.rackId));
  assert.ok(!page2.items.some(d => page1.items.find(first => first.id === d.id)));
  assert.equal((await assign(['a', 'b', 'a'])).body.data.count, 2);
  const members = (await GET(request('buildingId=A'))).body.data;
  assert.deepEqual(members.devices.map(d => d.id), ['a', 'b']); assert.equal(members.connections.length, 2);
  assert.equal(members.connections.find(link => link.id === 'internal').status, 'UP');
  assert.equal(members.connections.find(link => link.protocol === 'LLDP').status, 'UNKNOWN');
  assert.ok(!members.connections.some(link => link.targetDeviceId === 'e'));
  assert.equal(helper.buildingInternalConnections([devices[0], devices[1]], [wire('internal', 'b')], neighbors, [...devices, { id: 'other-building-beta', name: 'Beta' }]).length, 1, 'Duplicate names outside the building must not create a guessed LLDP edge');
  const drawing = { id: 'drawio', sourceDeviceId: 'a', targetDeviceId: 'b', sourcePortName: 'Gi1', status: 'UNKNOWN', recordingSource: 'DRAWIO' };
  const coalesced = helper.buildingInternalConnections([devices[0], devices[1]], [], neighbors, devices, [drawing]);
  assert.equal(coalesced.length, 2, 'Reverse LLDP with the same known port does not duplicate a partial drawing link; a parallel port remains');
  assert.equal(coalesced[0].status, 'UNKNOWN'); assert.equal(coalesced[0].targetPortName, undefined, 'Source evidence stays unchanged');
  assert.equal(helper.buildingInternalConnections([devices[0], devices[1]], [], neighbors, devices, [{ ...drawing, sourcePortName: undefined }]).length, 3, 'A portless drawing link cannot prove which parallel observation it represents');
  assert.equal(helper.buildingInternalConnections([devices[0], devices[1], { ...devices[1], id: 'duplicate' }], [], neighbors).length, 1, 'Ambiguous remote names must not be guessed; only the unambiguous reverse peer remains');
  assert.equal((await assign(['e'], { allowReassign: true })).status, 200);
  devices[0].floorId = 'floor-a';
  assert.equal((await assign(['a'])).status, 200);
  assert.equal(devices[0].floorId, 'floor-a', 'Same-building assignment preserves the imported floor');
  assert.deepEqual(assignmentWrites.at(-1), { where: { id: 'a', rackId: null, buildingId: 'A', floorId: 'floor-a' }, data: { buildingId: 'A' } }, 'Guard the saved floor without overwriting it on an idempotent assignment');
  devices.find(d => d.id === 'e').floorId = 'floor-a';
  assert.equal((await PATCH(request('', { action: 'assign', buildingId: 'B', deviceIds: ['e'], allowReassign: true }))).status, 200);
  assert.equal(devices.find(d => d.id === 'e').floorId, null, 'Moving buildings clears a stale floor');
  assert.equal(helper.deviceFloor({ floor: { id: 'direct', name: '2. Kat', floorNumber: 2 } }).id, 'direct');
  assert.equal(helper.deviceFloor({ rack: { room: { floor: { id: 'rack-floor', name: '1. Kat' } } }, floor: { id: 'stale', name: '2. Kat' } }).id, 'rack-floor');
  const before = devices.map(d => ({ ...d }));
  const writesBeforeConflict = writes;
  conflictAtWrite = writes + 2;
  assert.equal((await PATCH(request('', { action: 'unassign', buildingId: 'A', deviceIds: ['a', 'b'] }))).status, 409);
  assert.equal(writes, writesBeforeConflict + 2, 'The conflict must occur after one successful per-device update');
  assert.deepEqual(devices, before, 'A later conflict rolls back both the earlier building and floor changes');
  conflictAtWrite = null;
  assert.equal((await PATCH(request('', { action: 'unassign', buildingId: 'B', deviceIds: ['a'] }))).status, 409);
  assert.equal((await PATCH(request('', { action: 'unassign', buildingId: 'A', deviceIds: ['a'] }))).status, 200);
  assert.equal(devices[0].buildingId, null);
  assert.equal(devices[0].floorId, null, 'Removing building membership clears the direct floor');
  assert.ok((await GET(request(`buildingId=${helper.UNASSIGNED_DEVICE_BUILDING}`))).body.data.devices.some(d => d.id === 'a'));
  failLinks = true; assert.equal((await GET(request('buildingId=A'))).status, 503);
  console.log('Building devices passed: membership, permissions, pagination, bulk assignment, rack protection, explicit transfers, floor preservation/clearing, rollback after partial success, unassignment, internal-only edges, LLDP deduplication/ambiguity and unavailable sources. Synthetic records only.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
