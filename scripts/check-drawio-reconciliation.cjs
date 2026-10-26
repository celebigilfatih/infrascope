/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic reconciliation contracts. */
const assert = require('node:assert/strict');
const { buildReconciliation, applyReconciliation, hostKey, compatible } = require('./reconcile-drawio-topology.cjs');
const { digest } = require('./drawio-topology-plan.cjs');
const { mockDatabase } = require('./check-drawio-topology-import.cjs');
function fixture() {
  const device = (id, name, ip, nmsDeviceId) => ({ id, name, type: 'SWITCH', managementIp: ip, nmsDeviceId, buildingId: null, floorId: null, rackId: null, metadata: { retained: true }, networkInterfaces: [], switchPorts: [], nmsInterfaces: [] });
  const a = device('a', 'Core', '10.0.0.1', 1), b = device('b', 'Peer', '10.0.0.2', 2), c = device('c', 'Third', '10.0.0.3', 3);
  a.nmsInterfaces = [{ id: 'a1', interfaceName: 'if1', description: 'Ethernet1/1' }, { id: 'a2', interfaceName: 'if2', description: 'Ethernet1/2' }];
  b.nmsInterfaces = [{ id: 'b1', interfaceName: 'if3', description: 'GigabitEthernet0/1' }];
  const cell = (id, extra = {}) => ({ id, lines: [], geometry: {}, ...extra });
  const evidence = { sha256: 'a'.repeat(64), fileName: 'fixture.drawio', pages: [{ id: 'page', cells: [cell('a'), cell('b'), cell('c'), cell('edge', { edge: '1', source: 'a', target: 'b' }), cell('s', { parent: 'edge', lines: ['1/1'], geometry: { x: '-1' } }), cell('held', { edge: '1', source: null, target: 'c' }), cell('hs', { parent: 'held', lines: ['1/2'], geometry: { x: '-1' } }), cell('ht', { parent: 'held', lines: ['eth0'], geometry: { x: '1' } })] }] };
  const mapping = { sha256: evidence.sha256, pageId: 'page', organizationId: 'org', nodes: [a,b,c].map(d => ({ labelId: d.id, refs: [d.id], name: d.name, managementIp: d.managementIp, rawIps: [d.managementIp], type: 'SWITCH', vendor: null, model: null, buildingName: null, floorNumber: null, notes: [], locationEvidence: null })) };
  const snapshot = { organizations: [{ id: 'org', name: 'Org', buildings: [{ id: 'main', name: 'Main', floors: [] }] }], devices: [a,b,c], links: [{ id: 'saved', source: 'DRAWIO', sourceRef: 'page/edge', sourceDeviceId: 'a', targetDeviceId: 'b', status: 'UNKNOWN', endpoints: [{ side: 0, deviceId: 'a', portId: 'nms:a1', portName: 'Ethernet1/1', portKey: 'if1' }] }], legacy: [], buildingConnections: [] };
  const originalPayload = { pageId: 'page', source: 'drawio:page', sha256: evidence.sha256, organizationId: 'org', devices: [a,b,c].map(d => ({ id: d.id, existing: true })), heldEdges: [{ edgeId: 'held' }] };
  const original = { ...originalPayload, planHash: digest(originalPayload) };
  const review = { sha256: evidence.sha256, observedAt: '2026-10-19T13:00:00Z', edges: [{ edgeId: 'held', source: 'a', target: 'c', evidence: 'Reviewed source point' }], locations: [{ id: 'c', buildingId: 'main', floorNumber: 0, evidence: 'User confirmed' }] };
  const observations = [{ id: 'obs', nmsDeviceId: 1, localInterface: 'Ethernet1/1', remoteDeviceName: 'Peer.bbslocal', remoteInterface: 'GigabitEthernet0/1', protocol: 'cdp', lastSeenAt: '2026-10-19T12:00:00Z' }];
  return { original, evidence, snapshot, mapping, review, observations };
}
const build = f => buildReconciliation(f.original, f.evidence, f.snapshot, f.mapping, f.review, f.observations);
async function main() {
  const f = fixture(), plan = build(f);
  assert.equal(plan.newLinks.length, 1); assert.equal(plan.newLinks[0].endpoints.length, 2);
  assert.equal(plan.additions.length, 1); assert.equal(plan.additions[0].portId, 'nms:b1'); assert.equal(plan.additions[0].portKey, 'if3');
  assert.equal(plan.ports.length, 1); assert.equal(plan.ports[0].status, 'UNKNOWN');
  assert.equal(plan.floors[0].floorNumber, 0); assert.equal(plan.locations.length, 1);
  assert.equal(hostKey('Core(FOX2247PJXN)'), 'core'); assert.equal(hostKey('Peer.bbslocal'), 'peer'); assert.ok(compatible('1/0/1', 'TenGigabitEthernet1/0/1')); assert.ok(!compatible('Gi1/0/1', 'Te1/0/1'));
  const stale = fixture(); stale.observations[0].lastSeenAt = '2026-10-01T12:00:00Z'; assert.equal(build(stale).additions.length, 0);
  const conflict = fixture(); conflict.observations.push({ ...conflict.observations[0], id: 'other', remoteInterface: 'GigabitEthernet0/2' }); assert.equal(build(conflict).additions.length, 0, 'Conflicting observations cannot decide a port');
  const collision = fixture(); collision.snapshot.devices.push({ ...collision.snapshot.devices[1], id: 'ambiguous-peer' }); assert.equal(build(collision).additions.length, 0, 'Hostname normalization must still have exactly one inventory owner');
  const mismatch = fixture(); mismatch.observations[0].localInterface = 'Ethernet1/99'; assert.equal(build(mismatch).additions.length, 0, 'The known endpoint must corroborate the observation');
  const occupied = fixture(); occupied.snapshot.links.push({ id: 'occupied', endpoints: [{ deviceId: 'c', portKey: 'eth0', portName: 'eth0' }] }); assert.ok(build(occupied).issues.some(i => i.reason === 'OCCUPIED_PORT'));
  const claimed = fixture(); claimed.original.heldEdges.push({ edgeId: 'held2' }); const { planHash: _oldHash, ...newOriginal } = claimed.original; void _oldHash; claimed.original.planHash = digest(newOriginal); claimed.review.edges.push({ edgeId: 'held2', source: 'a', target: 'b', evidence: 'Second reviewed point' });
  claimed.evidence.pages[0].cells.push({ id: 'held2', edge: '1', source: null, target: 'b', lines: [], geometry: {} }, { id: 'hs2', parent: 'held2', lines: ['1/2'], geometry: { x: '-1' } }, { id: 'ht2', parent: 'held2', lines: ['Gi0/2'], geometry: { x: '1' } });
  const claims = build(claimed); assert.ok(claims.newLinks.every(l => !l.endpoints.some(ep => ep.deviceId === 'a')), 'All conflicting new claims remain unassigned');
  const invalid = fixture(); invalid.review.edges[0].source = 'missing'; assert.throws(() => build(invalid), /cell missing/);
  const unreviewed = fixture(); unreviewed.review.edges[0].edgeId = 'edge'; assert.throws(() => build(unreviewed), /reviewed held/);
  const moved = fixture(); moved.snapshot.devices[2].buildingId = 'another'; assert.throws(() => build(moved), /conflict resolution/);
  const db = mockDatabase(f.snapshot); await db.systemConfig.create({ data: { key: 'network.topology.drawio-import:page', value: JSON.stringify({ planHash: f.original.planHash, sha256: f.evidence.sha256 }) } });
  const initial = db.getState();
  await assert.rejects(applyReconciliation(db, { ...plan, observedAt: 'tampered' }, 'admin', plan.planHash, 100), /hash/);
  db.actor.status = 'DISABLED'; await assert.rejects(applyReconciliation(db, plan, 'admin', plan.planHash, 100), /administrator/); db.actor.status = 'ACTIVE';
  db.fail = true; await assert.rejects(applyReconciliation(db, plan, 'admin', plan.planHash, 100), /Synthetic/); assert.deepEqual(db.getState(), initial, 'A late endpoint failure rolls back location, floor, port and link writes'); db.fail = false;
  const result = await applyReconciliation(db, plan, 'admin', plan.planHash, 100); assert.equal(result.newLinks, 1); assert.equal(result.addedEndpoints, 1);
  assert.equal(db.getState().devices[2].metadata.retained, true); assert.equal(db.getState().links[0].endpoints[0].portName, 'Ethernet1/1');
  assert.equal(db.getState().configs.find(c => c.key === 'network.topology.drawio-import:page').value, initial.configs[0].value, 'Original import registry remains immutable');
  const count = db.writes(); assert.equal((await applyReconciliation(db, plan, 'admin', plan.planHash, 100)).replayed, true); assert.equal(db.writes(), count);
  const hp = fixture(); hp.snapshot.devices[1].networkInterfaces.push({ id: 'placeholder', deviceId: 'b', name: '1', type: 'ETHERNET', status: 'UNKNOWN' }); hp.snapshot.devices[1].nmsInterfaces[0].description = '1 Gigabit - Level'; hp.snapshot.links[0].endpoints.push({ id: 'old-endpoint', side: 1, deviceId: 'b', portId: 'interface:placeholder', portName: '1', portKey: '1' });
  const { planHash: _hpHash, ...hpOrigin } = hp.original; void _hpHash; hpOrigin.ports = [{ id: 'placeholder', deviceId: 'b', name: '1' }]; hp.original = { ...hpOrigin, planHash: digest(hpOrigin) }; hp.review.catalogMappings = [{ sourceRef: 'page/edge', side: 1, portId: 'nms:b1', evidence: 'Exact numbered vendor description' }];
  const hpPlan = build(hp), hpDb = mockDatabase(hp.snapshot); assert.equal(hpPlan.replacements.length, 1);
  await hpDb.systemConfig.create({ data: { key: 'network.topology.drawio-import:page', value: JSON.stringify({ planHash: hp.original.planHash, sha256: hp.evidence.sha256 }) } });
  await applyReconciliation(hpDb, hpPlan, 'admin', hpPlan.planHash, 100); assert.equal(hpDb.getState().links[0].endpoints[1].portId, 'nms:b1'); assert.equal(hpDb.getState().devices[1].networkInterfaces.length, 0, 'Only the unused original placeholder is retired');
  hp.snapshot.devices[1].networkInterfaces[0].ipv4 = '10.1.1.10'; const protectedDb = mockDatabase(hp.snapshot); await protectedDb.systemConfig.create({ data: { key: 'network.topology.drawio-import:page', value: JSON.stringify({ planHash: hp.original.planHash, sha256: hp.evidence.sha256 }) } }); const protectedBefore = protectedDb.getState();
  await assert.rejects(applyReconciliation(protectedDb, hpPlan, 'admin', hpPlan.planHash, 100), /user data/); assert.deepEqual(protectedDb.getState(), protectedBefore);
  const { planHash, ...payload } = plan; assert.equal(digest(payload), planHash);
  console.log('Draw.io reconciliation passed: reviewed endpoints, NMS hostname uniqueness, fresh/corroborated ports, stale/conflicting/occupied evidence, floors, source/actor/hash guards, preservation, atomic rollback and idempotent replay. Synthetic records only.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
