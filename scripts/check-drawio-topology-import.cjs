/* eslint-disable @typescript-eslint/no-require-imports -- Isolated maintenance-contract tests. */
const assert = require('node:assert/strict');
const { buildPlan, matchPort, edgePorts, digest } = require('./drawio-topology-plan.cjs');
const { applyPlan } = require('./drawio-topology-db.cjs');
const emptyPorts = () => ({ switchPorts: [], networkInterfaces: [], nmsInterfaces: [] });
const cell = (id, extra = {}) => ({ id, lines: [], geometry: {}, ...extra });
const device = (id, ip) => ({ id, name: `Existing ${id}`, type: 'SWITCH', managementIp: ip, buildingId: null, floorId: null, rackId: null, metadata: { retained: 'local-only' }, ...emptyPorts() });
const node = (id, ip, extra = {}) => ({ labelId: id, refs: [id], name: id, managementIp: ip, rawIps: ip ? [ip] : [], type: 'SWITCH', vendor: null, model: null, buildingName: 'Main', floorNumber: 2, notes: [], locationEvidence: 'Fixture', ...extra });
function fixture() {
  const snapshot = { organizations: [{ id: 'org', name: 'Org', buildings: [{ id: 'main', name: 'Main', floors: [] }] }], devices: [device('a', '10.0.0.1')], links: [], legacy: [], buildingConnections: [] };
  snapshot.devices[0].nmsInterfaces = [{ id: 'nms-a', interfaceName: 'if437804544', description: 'Ethernet4/48' }];
  const evidence = { sha256: 'a'.repeat(64), fileName: 'fixture.drawio', pages: [{ id: 'page', cells: [cell('a'), cell('alias-a'), cell('b'), cell('ha1'), cell('ha2'), cell('unknown1'), cell('unknown2'), cell('edge', { edge: '1', source: 'a', target: 'b' }), cell('sp', { parent: 'edge', lines: ['4/48'], geometry: { x: '-0.9' } }), cell('tp', { parent: 'edge', lines: ['Gi1/0/1'], geometry: { x: '0.9' } }), cell('stack', { edge: '1', source: 'a', target: 'alias-a' })] }] };
  const review = { sha256: evidence.sha256, pageId: 'page', organizationId: 'org', nodes: [node('a', '10.0.0.1'), node('alias-a', '10.0.0.1'), node('b', '10.0.0.2'), node('ha1', null, { rawIps: ['10.0.0.254'] }), node('ha2', null, { rawIps: ['10.0.0.254'] }), node('unknown1', null, { name: 'NONE' }), node('unknown2', null, { name: 'NONE' })] };
  return { snapshot, evidence, review };
}
function mockDatabase(snapshot) {
  let state = { ...structuredClone(snapshot), configs: [], audits: [], floors: [], interfaces: [] }, writes = 0;
  const db = {
    fail: false, actor: { id: 'admin', role: 'ADMIN', status: 'ACTIVE' },
    organization: { findMany: async () => state.organizations },
    device: {
      findMany: async () => state.devices,
      findUniqueOrThrow: async ({ where }) => { const d = state.devices.find(d => d.id === where.id); assert.ok(d); return d; },
      update: async ({ where, data }) => { writes++; Object.assign(state.devices.find(d => d.id === where.id), data); },
      create: async ({ data }) => { writes++; state.devices.push(data); },
    },
    building: { create: async ({ data }) => { writes++; state.organizations[0].buildings.push(data); } },
    floor: { create: async ({ data }) => { writes++; state.floors.push(data); } },
    networkInterface: { create: async ({ data }) => { writes++; state.interfaces.push(data); }, findUniqueOrThrow: async ({ where }) => { const row = state.devices.flatMap(d => d.networkInterfaces || []).find(p => p.id === where.id); assert.ok(row); return row; }, delete: async ({ where }) => { writes++; for (const d of state.devices) d.networkInterfaces = (d.networkInterfaces || []).filter(p => p.id !== where.id); } },
    deviceLink: { findMany: async () => state.links, create: async ({ data }) => { writes++; if (db.fail) throw Error('Synthetic endpoint write failure'); state.links.push(data); }, update: async ({ where, data }) => { writes++; Object.assign(state.links.find(l => l.id === where.id), data); } },
    deviceLinkEndpoint: { create: async ({ data }) => { writes++; if (db.fail) throw Error('Synthetic endpoint write failure'); state.links.find(l => l.id === data.linkId).endpoints.push(data); }, update: async ({ where, data }) => { writes++; const ep = state.links.flatMap(l => Array.isArray(l.endpoints) ? l.endpoints : l.endpoints.create).find(ep => ep.id === where.id); assert.ok(ep); Object.assign(ep, data); }, count: async ({ where }) => state.links.flatMap(l => Array.isArray(l.endpoints) ? l.endpoints : l.endpoints.create).filter(ep => ep.portId === where.portId).length },
    connection: { findMany: async () => state.legacy, count: async () => 0 },
    switchPort: { count: async () => 0 },
    buildingConnection: { findMany: async () => state.buildingConnections, create: async ({ data }) => { writes++; state.buildingConnections.push(data); } },
    user: { findUnique: async () => db.actor },
    systemConfig: { findUnique: async ({ where }) => state.configs.find(c => c.key === where.key), create: async ({ data }) => { writes++; state.configs.push(data); } },
    auditLog: { create: async ({ data }) => { writes++; state.audits.push(data); } },
    $transaction: async (fn, options) => { assert.equal(options.isolationLevel, 'Serializable'); const before = structuredClone(state); try { return await fn(db); } catch (e) { state = before; throw e; } },
    getState: () => structuredClone(state), writes: () => writes,
  };
  return db;
}
async function main() {
  const f = fixture(), plan = buildPlan(f.evidence, f.snapshot, f.review);
  assert.equal(plan.devices.length, 6, 'Repeated management IP reuses one device; shared HA VIP and NONE names do not merge devices');
  assert.equal(plan.devices.find(d => d.id === 'a').name, 'Existing a');
  assert.equal(plan.devices.find(d => d.id === 'a').floorId, plan.floors[0].id);
  assert.equal(plan.links[0].endpoints[0].portId, 'nms:nms-a');
  assert.equal(plan.links[0].endpoints[0].portKey, 'if437804544');
  assert.equal(plan.links[0].endpoints[0].portName, 'Ethernet4/48');
  assert.equal(plan.links[0].status, 'UNKNOWN');
  assert.equal(plan.ports.length, 1);
  assert.equal(plan.heldEdges[0].reason, 'SAME_STACK_OR_DEVICE');
  assert.equal(plan.planHash, buildPlan(f.evidence, f.snapshot, f.review).planHash);
  assert.throws(() => buildPlan(f.evidence, f.snapshot, { ...f.review, sha256: 'wrong' }), /hash/);
  assert.throws(() => buildPlan(f.evidence, f.snapshot, { ...f.review, nodes: [node('missing', null)] }), /reference/);
  const ports = { ...emptyPorts(), nmsInterfaces: [{ id: '1', interfaceName: 'if1', description: 'Ethernet1/1' }, { id: '2', interfaceName: 'if2', description: 'Ethernet1/1' }] };
  assert.equal(matchPort('1/1', ports).ambiguous, true, 'Repeated friendly descriptions remain ambiguous');
  assert.equal(matchPort('99', ports).port, null);
  assert.deepEqual(edgePorts({ id: 'e' }, [cell('s', { parent: 'e', lines: ['Gi1/1'], geometry: { x: '-1' } }), cell('t', { parent: 'e', lines: ['Gi2/2'], geometry: { x: '1' } }), cell('note', { parent: 'e', lines: ['KEEP IP 1.2.3.4'], geometry: { x: '0' } })]).source, 'Gi1/1');
  const partial = fixture(); partial.evidence.pages[0].cells = partial.evidence.pages[0].cells.filter(c => !['sp', 'tp'].includes(c.id));
  assert.equal(buildPlan(partial.evidence, partial.snapshot, partial.review).links[0].endpoints.length, 0, 'Device connection survives missing port evidence');
  const conflict = fixture(); conflict.evidence.pages[0].cells.push(cell('e2', { edge: '1', source: 'a', target: 'ha1' }), cell('s2', { parent: 'e2', lines: ['Ethernet4/48'], geometry: { x: '-1' } }));
  const conflicted = buildPlan(conflict.evidence, conflict.snapshot, conflict.review);
  assert.equal(conflicted.issues.filter(i => i.kind === 'PORT_RESERVATION_CONFLICT').length, 2);
  assert.ok(conflicted.links.every(l => !l.endpoints.some(e => e.deviceId === 'a')), 'All conflicting claims are withheld');
  const reverse = fixture(); reverse.evidence.pages[0].cells.push(cell('reverse', { edge: '1', source: 'b', target: 'a' }), cell('rs', { parent: 'reverse', lines: ['Gi1/0/1'], geometry: { x: '-1' } }), cell('rt', { parent: 'reverse', lines: ['4/48'], geometry: { x: '1' } }));
  assert.equal(buildPlan(reverse.evidence, reverse.snapshot, reverse.review).duplicateEdges.length, 1);
  const db = mockDatabase(f.snapshot), initial = db.getState();
  await assert.rejects(applyPlan(db, { ...plan, fileName: 'tampered' }, 'admin', plan.planHash, 100), /hash/);
  assert.equal(db.writes(), 0);
  db.actor.role = 'VIEWER'; await assert.rejects(applyPlan(db, plan, 'admin', plan.planHash, 100), /administrator/); db.actor.role = 'ADMIN';
  await assert.rejects(applyPlan(db, plan, 'admin', plan.planHash, 1), /license/);
  db.fail = true; await assert.rejects(applyPlan(db, plan, 'admin', plan.planHash, 100), /Synthetic/);
  assert.deepEqual(db.getState(), initial, 'A late write failure rolls back the complete import');
  db.fail = false;
  const result = await applyPlan(db, plan, 'admin', plan.planHash, 100);
  assert.equal(result.reused, 1); assert.equal(result.created, 5);
  assert.equal(db.getState().devices[0].metadata.retained, 'local-only');
  assert.equal(db.getState().devices[0].name, 'Existing a');
  assert.ok(db.getState().devices.slice(1).every(d => d.status === 'UNKNOWN' && d.pollingEnabled === false));
  assert.equal(db.getState().audits.length, 1);
  const writes = db.writes(); assert.equal((await applyPlan(db, plan, 'admin', plan.planHash, 100)).replayed, true); assert.equal(db.writes(), writes, 'Replay creates no new records');
  const changed = mockDatabase(f.snapshot); changed.getState();
  await changed.device.update({ where: { id: 'a' }, data: { buildingId: 'elsewhere' } });
  await assert.rejects(applyPlan(changed, plan, 'admin', plan.planHash, 100), /changed after planning/);
  const { planHash, ...payload } = plan; assert.equal(digest(payload), planHash);
  console.log('Draw.io import passed: identity/IP/HA deduplication, floors, NMS descriptions, ambiguous/conflicting ports, partial links, reverse deduplication, source hash, actor/license/snapshot guards, atomic rollback, preservation and idempotent replay. Synthetic records only.');
}
module.exports = { fixture, mockDatabase };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
