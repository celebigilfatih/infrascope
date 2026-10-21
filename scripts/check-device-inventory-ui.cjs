// Actual device APIs and placement/query helpers with an in-memory ORM and license stub.
// No database, real inventory mutation, connector, or live network request is used.
/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
const state = { writes: [], queries: [], licenseDenied: false, devices: [
  { id: 'occupied', name: 'Sunucu A', type: 'PHYSICAL_SERVER', rackId: 'rack-a', rackUnitPosition: 1, metadata: { unitHeight: 3 }, status: 'ACTIVE', criticality: 'MEDIUM' },
  { id: 'edit', name: 'Sunucu B', type: 'PHYSICAL_SERVER', rackId: 'rack-a', rackUnitPosition: 6, metadata: { unitHeight: 2, vendorData: { original: true }, tag: 'preserve' }, status: 'ACTIVE', criticality: 'HIGH' },
] };
const json = (body, options) => ({ body, status: options?.status || 200 });
const prisma = {
  rack: { findUnique: async ({ where }) => where.id === 'rack-a' ? { id: 'rack-a', maxUnits: 12, devices: state.devices.filter(d => d.rackId === where.id).map(d => ({ ...d })) } : where.id === 'rack-b' ? { id: 'rack-b', maxUnits: 4, devices: [] } : null },
  device: {
    count: async args => { if (args) state.queries.push({ kind: 'count', ...args }); return state.devices.length; },
    findMany: async args => { state.queries.push({ kind: 'findMany', ...args }); return state.devices.map(d => ({ ...d })); },
    findUnique: async ({ where }) => { const d = state.devices.find(d => d.id === where.id); return d ? { ...d, childDevices: [], services: [] } : null; },
    create: async ({ data }) => { const d = { ...data, id: `created-${state.devices.length}` }; state.devices.push(d); state.writes.push({ kind: 'create', data }); return d; },
    update: async ({ where, data }) => { const d = state.devices.find(d => d.id === where.id); assert.ok(d); Object.assign(d, data); state.writes.push({ kind: 'update', data }); return { ...d }; },
  },
};
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const module = { exports: {} }; cache.set(relative, module);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name === '@/lib/prisma') return { prisma };
    if (name === 'next/server') return { NextResponse: { json } };
    if (name === '@/lib/license/middleware') return { checkDeviceLimit: async () => state.licenseDenied ? json({ success: false, error: 'Fixture license limit' }, { status: 403 }) : null };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const file = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(file + '.ts');
    }
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(localRequire, module, module.exports);
  return module.exports;
}
const { deviceUnitHeight, mergeUnitHeight, placementIssue, availableUnitRanges, firstAvailableUnit } = load('lib/racks/device-placement.ts');
const { inventoryQuery } = load('lib/devices/inventory-query.ts');
const { matchesInventoryFilters } = load('lib/devices/inventory-view.ts');
const rack = { id: 'rack-a', maxUnits: 12, devices: state.devices };
assert.deepEqual(availableUnitRanges(rack), [{ start: 4, end: 5 }, { start: 8, end: 12 }]);
assert.equal(firstAvailableUnit(rack, 3), 8);
assert.equal(firstAvailableUnit(rack, 3, 'edit'), 4);
assert.equal(firstAvailableUnit(rack, 13), null);
assert.match(placementIssue({ rackId: rack.id, rack, start: 3, height: 2 }), /Sunucu A/);
assert.equal(placementIssue({ rackId: rack.id, rack, start: 6, height: 2, deviceId: 'edit' }), null);
assert.match(placementIssue({ rackId: rack.id, rack, start: 12, height: 2 }), /sınırını aşıyor/);
assert.match(placementIssue({ rackId: null, rack: null, start: 1, height: 1 }), /önce bir kabinet/);
assert.equal(placementIssue({ rackId: rack.id, rack, start: null, height: 2 }), null);
assert.match(placementIssue({ rackId: rack.id, rack, start: 4, height: 1.5 }), /tam sayı/);
const originalMetadata = { unitHeight: 2, vendorData: { original: true } };
assert.deepEqual(mergeUnitHeight(originalMetadata, 3), { unitHeight: 3, vendorData: { original: true } });
assert.equal(originalMetadata.unitHeight, 2);
assert.equal(deviceUnitHeight(null), 1);
assert.throws(() => mergeUnitHeight(['legacy'], 2), /nesne biçiminde/);
const query = inventoryQuery(new URLSearchParams('page=2&limit=10&filterType=all&rackId=rack-a&placement=pending&status=MAINTENANCE&search=IP'));
assert.equal(query.page, 2); assert.equal(query.limit, 10);
assert.ok(query.where.AND.some(item => item.rackId === 'rack-a'));
assert.ok(query.where.AND.some(item => item.status === 'MAINTENANCE'));
assert.ok(query.where.AND.some(item => item.OR?.some(condition => condition.managementIp)));
assert.equal(inventoryQuery(new URLSearchParams('page=Infinity&limit=Infinity')).page, 1);
assert.throws(() => inventoryQuery(new URLSearchParams('status=INVALID')), /durumu/);
const defaults = { type: 'manual', rack: 'all', search: '', status: 'all', placement: 'all' };
assert.equal(matchesInventoryFilters(state.devices[0], defaults), true);
assert.equal(matchesInventoryFilters({ ...state.devices[0], type: 'VMWARE_CLUSTER' }, defaults), false);
assert.equal(matchesInventoryFilters(state.devices[0], { ...defaults, rack: 'unassigned' }), false);
assert.equal(matchesInventoryFilters({ ...state.devices[0], rackUnitPosition: null }, { ...defaults, placement: 'pending' }), true);

async function main() {
  const list = load('app/api/devices/route.ts');
  const detail = load('app/api/devices/[id]/route.ts');
  const request = body => ({ json: async () => body });
  const update = body => detail.PUT(request(body), { params: { id: 'edit' } });
  let response = await update({ rackUnitPosition: 2 });
  assert.equal(response.status, 400); assert.match(response.body.error, /çakışıyor/); assert.equal(state.writes.length, 0);
  response = await update({ rackId: 'rack-a', rackUnitPosition: 11, unitHeight: 3 });
  assert.equal(response.status, 400); assert.equal(state.writes.length, 0);
  response = await update({ rackId: 'rack-a', rackUnitPosition: 6, unitHeight: 3 });
  assert.equal(response.status, 200);
  assert.deepEqual(state.devices.find(d => d.id === 'edit').metadata, { unitHeight: 3, vendorData: { original: true }, tag: 'preserve' });
  response = await update({ rackId: null });
  assert.equal(response.status, 200);
  assert.equal(state.devices.find(d => d.id === 'edit').rackUnitPosition, null, 'Unassigning must clear an orphan U position');
  response = await update({ rackId: 'rack-b', rackUnitPosition: null, unitHeight: 2 });
  assert.equal(response.status, 200, 'A cabinet assignment may intentionally await its U position');
  response = await update({ type: 'PRINTER' }); assert.equal(response.status, 200);
  response = await update({ type: 'CAMERA' }); assert.equal(response.status, 200);
  const before = state.writes.length;
  response = await list.POST(request({ name: 'Test C', type: 'PHYSICAL_SERVER', rackId: 'rack-a', rackUnitPosition: '2x', unitHeight: 1 }));
  assert.equal(response.status, 400); assert.equal(state.writes.length, before);
  response = await list.POST(request({ name: 'Test C', type: 'PHYSICAL_SERVER', rackId: 'rack-a', rackUnitPosition: 4, unitHeight: 2, metadata: { vendorData: 'preserve' } }));
  assert.equal(response.status, 201); assert.deepEqual(response.body.data.metadata, { vendorData: 'preserve', unitHeight: 2 });
  response = await list.POST(request({ name: 'Test D', type: 'PHYSICAL_SERVER', rackId: 'rack-a', rackUnitPosition: 4, unitHeight: 2 }));
  assert.equal(response.status, 400);
  state.licenseDenied = true;
  const beforeDenied = state.writes.length;
  response = await list.POST(request({ name: 'Blocked', type: 'OTHER' }));
  assert.equal(response.status, 403); assert.equal(state.writes.length, beforeDenied, 'License checks must remain in place');
  state.licenseDenied = false;
  response = await list.GET({ url: 'http://fixture.invalid/api/devices?page=2&limit=10&filterType=all&rackId=rack-a&placement=pending&status=MAINTENANCE' });
  assert.equal(response.status, 200);
  const find = state.queries.find(q => q.kind === 'findMany'), count = state.queries.find(q => q.kind === 'count');
  assert.deepEqual(find.where, count.where, 'Filters must affect both rows and total count');
  assert.equal(find.skip, 10); assert.equal(find.take, 10);
  state.queries.length = 0;
  await list.GET({ url: 'http://fixture.invalid/api/devices?mode=minimal&filterType=all' });
  assert.equal(state.queries.find(q => q.kind === 'findMany').select.nmsDeviceId, true, 'NMS minimal inventory must remain compatible');
  const anchor = state.devices.find(d => d.id === 'edit');
  anchor.networkGroups = [{ id: 'logical-group' }];
  const beforeAnchorDelete = state.writes.length;
  response = await detail.DELETE(request({}), { params: { id: 'edit' } });
  assert.equal(response.status, 409); assert.match(response.body.error, /merkez cihaz/); assert.equal(state.writes.length, beforeAnchorDelete);
  delete anchor.networkGroups;
  prisma.device.delete = async () => { const error = new Error('Concurrent FK reference'); error.code = 'P2003'; throw error; };
  response = await detail.DELETE(request({}), { params: { id: 'edit' } });
  assert.equal(response.status, 409, 'A concurrently added group anchor must reject deletion without a generic server failure');
  console.log('Device inventory checks passed: filters/counts, multi-U preview validation, empty slots, self-exclusion, overlap/overflow rejection, metadata preservation, unlink, pending U assignment, POST/PUT persistence, printer/camera editing, license guard and protected/concurrent network-group anchor deletion. No live requests.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
