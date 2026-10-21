/* eslint-disable @typescript-eslint/no-require-imports -- Reviewed local maintenance workflow. */
const { buildPlan, digest, snapshotKey, stableId, matchPort, portAlias, edgePorts } = require('./drawio-topology-plan.cjs');
const { readSnapshot } = require('./drawio-topology-db.cjs');
const hostKey = name => name.trim().replace(/\([a-z0-9]{8,}\)$/i, '').replace(/\.bbslocal$/i, '').toLowerCase();
const compatible = (a, b) => portAlias(a) === portAlias(b) || /^\d+(?:\/\d+)*$/.test(a) && a === portAlias(b).replace(/^[a-z]+/, '');
const physicalName = name => typeof name === 'string' && /^(?:[a-z]+)?\d+(?:\/\d+){0,3}$/i.test(name);
function buildReconciliation(original, evidence, snapshot, mapping, review, observations) {
  const { planHash: originalHash, ...originalPayload } = original;
  if (digest(originalPayload) !== originalHash) throw Error('Original import artifact hash mismatch');
  if (review.sha256 !== original.sha256 || evidence.sha256 !== original.sha256 || mapping.sha256 !== original.sha256) throw Error('Drawing source hash mismatch');
  if (!Number.isFinite(Date.parse(review.observedAt))) throw Error('A valid observation review timestamp is required');
  const copy = structuredClone(evidence), page = copy.pages.find(p => p.id === original.pageId);
  const cells = new Map(page.cells.map(c => [c.id, c]));
  for (const item of review.edges || []) {
    const cell = cells.get(item.edgeId);
    if (!cell || !original.heldEdges.some(e => e.edgeId === item.edgeId) || !item.evidence) throw Error('Only reviewed held edges can be resolved');
    for (const side of ['source', 'target']) if (item[side]) { if (!cells.has(item[side])) throw Error('Endpoint cell missing'); cell[side] = item[side]; }
  }
  const nodes = structuredClone(mapping);
  for (const added of review.newDevices || []) nodes.nodes.push(added.mapping);
  // Re-plan only to recover source cell identities and edge labels; never re-apply the import.
  const proposed = buildPlan(copy, snapshot, nodes), actual = new Map(snapshot.devices.map(d => [d.id, d]));
  const newDevices = (review.newDevices || []).map(item => {
    const d = proposed.devices.find(d => d.refs.includes(item.mapping.refs[0]));
    if (!d || actual.has(d.id) || item.mapping.managementIp) throw Error('New reviewed HA members must have a distinct source identity and no shared management IP');
    return { id: d.id, name: d.name, type: d.type, managementIp: null, vendor: d.vendor, model: d.model, buildingId: null, floorId: null, refs: d.refs, evidence: item.evidence, sharedManagementIp: item.sharedManagementIp || null };
  });
  newDevices.forEach(d => actual.set(d.id, { ...d, rackId: null, switchPorts: [], networkInterfaces: [], nmsInterfaces: [] }));
  const existingBuildings = snapshot.organizations.find(o => o.id === original.organizationId)?.buildings || [];
  const newBuildings = (review.newBuildings || []).map(b => {
    if (!b.name?.trim() || !b.evidence || existingBuildings.some(old => hostKey(old.name) === hostKey(b.name))) throw Error('New building requires a distinct user-confirmed name');
    return { id: stableId('building', `${original.organizationId}:${b.name.trim().toLocaleLowerCase('tr-TR')}`), name: b.name.trim(), organizationId: original.organizationId, address: '', city: '', country: '' };
  });
  if (new Set(newBuildings.map(b => b.id)).size !== newBuildings.length) throw Error('Duplicate new building');
  const knownDevices = new Set(original.devices.map(d => d.id)), buildings = [...existingBuildings, ...newBuildings.map(b => ({ ...b, floors: [] }))];
  const floors = [], locations = [], changes = [];
  const floor = (buildingId, number) => {
    const building = buildings.find(b => b.id === buildingId); if (!building || !Number.isSafeInteger(number) || number < -10 || number > 200) throw Error('Invalid floor scope');
    const existing = building.floors.filter(f => f.floorNumber === number); if (existing.length > 1) throw Error('Ambiguous floor');
    if (existing[0]) return existing[0].id;
    let f = floors.find(f => f.buildingId === buildingId && f.floorNumber === number);
    if (!f) { f = { id: stableId('floor', `${buildingId}:${number}`), buildingId, name: number === 0 ? 'Zemin Kat' : `${number}. Kat`, floorNumber: number }; floors.push(f); } return f.id;
  };
  for (const item of review.floors || []) { if (!item.evidence) throw Error('Floor evidence required'); floor(item.buildingId, item.number); }
  for (const item of review.locations || []) {
    const d = actual.get(item.id);
    if (!d || d.rackId || !buildings.some(b => b.id === item.buildingId) || !item.evidence || !knownDevices.has(d.id) && !newDevices.some(n => n.id === d.id)) throw Error('Invalid reviewed location');
    if (d.buildingId && d.buildingId !== item.buildingId) throw Error('A populated building assignment requires explicit conflict resolution');
    const floorId = item.floorNumber === undefined ? d.floorId || null : floor(item.buildingId, item.floorNumber);
    if (d.floorId && d.floorId !== floorId) throw Error('A populated floor assignment requires explicit conflict resolution');
    if (d.buildingId !== item.buildingId || d.floorId !== floorId) locations.push({ id: d.id, buildingId: item.buildingId, floorId, evidence: item.evidence });
  }
  for (const item of review.deviceChanges || []) {
    const before = actual.get(item.id), source = original.devices.find(d => d.id === item.id);
    if (!before || !source || source.existing || before.nmsDeviceId || !item.evidence || Object.keys(item.set).some(k => !['name', 'managementIp'].includes(k)) || item.set.managementIp !== null) throw Error('Only an unmonitored drawing-only HA identity may release its confirmed shared IP');
    changes.push(item);
  }
  const newLinks = proposed.links.filter(l => !snapshot.links.some(saved => saved.source === 'DRAWIO' && saved.sourceRef === l.sourceRef));
  if (newLinks.some(l => !(review.edges || []).some(e => e.edgeId === l.edgeId))) throw Error('Unreviewed new drawing link');
  const additions = [], ports = new Map(), issues = [], used = new Set(snapshot.links.flatMap(l => l.endpoints.map(e => `${e.deviceId}:${e.portKey}`)));
  const physicalUsed = new Set(snapshot.links.flatMap(l => l.endpoints.map(e => `${e.deviceId}:${portAlias(e.portName)}`)));
  for (const wire of snapshot.legacy) { if (wire.sourcePort) physicalUsed.add(`${wire.sourcePort.switchDeviceId}:${portAlias(wire.sourcePort.name)}`); if (wire.sourceInterface) physicalUsed.add(`${wire.sourceInterface.deviceId}:${portAlias(wire.sourceInterface.name)}`); }
  for (const d of snapshot.devices) for (const p of d.switchPorts) if (p.connectedToId) physicalUsed.add(`${d.id}:${portAlias(p.name)}`);
  const nameOwners = new Map(); for (const d of actual.values()) { const key = hostKey(d.name); nameOwners.set(key, [...(nameOwners.get(key) || []), d.id]); }
  const matchObservation = (link, endpoints, raw) => {
    const a = actual.get(link.sourceDeviceId), b = actual.get(link.targetDeviceId), candidates = [];
    for (const o of observations) {
      if (!Number.isFinite(Date.parse(o.lastSeenAt)) || Date.parse(review.observedAt) - Date.parse(o.lastSeenAt) > 7 * 86400000 || Date.parse(o.lastSeenAt) > Date.parse(review.observedAt) + 60000) continue;
      let names;
      if (o.nmsDeviceId === a.nmsDeviceId && nameOwners.get(hostKey(o.remoteDeviceName))?.length === 1 && nameOwners.get(hostKey(o.remoteDeviceName))[0] === b.id) names = [o.localInterface, o.remoteInterface];
      if (o.nmsDeviceId === b.nmsDeviceId && nameOwners.get(hostKey(o.remoteDeviceName))?.length === 1 && nameOwners.get(hostKey(o.remoteDeviceName))[0] === a.id) names = [o.remoteInterface, o.localInterface];
      if (!names || !names.every(physicalName) || !endpoints.length || !endpoints.every(e => compatible(e.portName, names[e.side])) || ['source', 'target'].some((side, index) => raw[side] && !compatible(raw[side], names[index]))) continue;
      candidates.push({ names, observation: o });
    }
    return new Set(candidates.map(c => c.names.map(portAlias).join('|'))).size === 1 ? candidates : [];
  };
  const endpoint = (link, side, name, proof, choice) => {
    const deviceId = side === 0 ? link.sourceDeviceId : link.targetDeviceId, d = actual.get(deviceId);
    let found = matchPort(name, d);
    if (choice?.portId) {
      const row = d.nmsInterfaces.find(p => `nms:${p.id}` === choice.portId);
      if (!row || ![row.description || '', row.interfaceName].some(label => compatible(name, label))) throw Error('Explicit NMS endpoint does not match its physical port');
      found = { port: { id: choice.portId, name, key: row.interfaceName.trim().toLowerCase() } };
    }
    if (found.ambiguous) { issues.push({ linkId: link.id, deviceId, port: name, reason: 'AMBIGUOUS_PORT' }); return null; }
    const portName = found.port?.name || name, portKey = found.port?.key || portName.trim().toLowerCase(), portId = found.port?.id || `interface:${stableId('port', `${deviceId}:${portKey}`)}`;
    if (used.has(`${deviceId}:${portKey}`) || physicalUsed.has(`${deviceId}:${portAlias(portName)}`)) { issues.push({ linkId: link.id, deviceId, port: name, reason: 'OCCUPIED_PORT' }); return null; }
    if (!found.port) ports.set(portId, { id: portId.slice(10), deviceId, name: portName, status: 'UNKNOWN' });
    return { side, deviceId, portId, portName, portKey, evidence: proof };
  };
  const repairedEdges = new Set((review.edges || []).map(e => e.edgeId));
  for (const link of proposed.links) {
    const saved = snapshot.links.find(l => l.source === 'DRAWIO' && l.sourceRef === link.sourceRef);
    const current = saved ? [...saved.endpoints] : [];
    const raw = edgePorts(cells.get(link.edgeId), page.cells);
    const observation = matchObservation(link, current.length ? current : link.endpoints, raw);
    const added = [];
    for (const side of [0, 1]) {
      if (current.some(e => e.side === side)) continue;
      let name = observation[0]?.names[side], proof = observation.length ? { kind: 'NMS_OBSERVATION', observations: observation.map(o => o.observation) } : null;
      const choice = (review.endpointChoices || []).find(c => c.sourceRef === link.sourceRef && c.side === side);
      if (choice) { if (!choice.evidence || !physicalName(choice.portName) || raw[side === 0 ? 'source' : 'target'] && !compatible(raw[side === 0 ? 'source' : 'target'], choice.portName) && !choice.correctDrawingLabel) throw Error('Explicit port correction requires reviewed source evidence'); name = choice.portName; proof = { kind: 'REVIEWED_PORT', review: choice.evidence }; }
      if (!name && !saved && repairedEdges.has(link.edgeId)) { name = raw[side === 0 ? 'source' : 'target']; proof = { kind: 'DRAWING', review: review.edges.find(e => e.edgeId === link.edgeId).evidence }; }
      if (name) { const ep = endpoint(link, side, name, proof, choice); if (ep) added.push(ep); }
    }
    if (saved) additions.push(...added.map(ep => ({ linkId: saved.id, ...ep })));
    else link.endpoints = added;
  }
  const requests = [...additions, ...newLinks.flatMap(l => l.endpoints)], counts = new Map();
  for (const ep of requests) { const key = `${ep.deviceId}:${portAlias(ep.portName)}`; counts.set(key, (counts.get(key) || 0) + 1); }
  const unambiguous = ep => { if (counts.get(`${ep.deviceId}:${portAlias(ep.portName)}`) <= 1) return true; issues.push({ deviceId: ep.deviceId, port: ep.portName, reason: 'CONFLICTING_NEW_CLAIMS' }); return false; };
  const safeAdditions = additions.filter(unambiguous); newLinks.forEach(l => { l.endpoints = l.endpoints.filter(unambiguous); });
  const acceptedPortIds = new Set([...safeAdditions, ...newLinks.flatMap(l => l.endpoints)].map(ep => ep.portId));
  const replacements = [];
  for (const item of review.catalogMappings || []) {
    const link = snapshot.links.find(l => l.source === 'DRAWIO' && l.sourceRef === item.sourceRef), old = link?.endpoints.find(ep => ep.side === item.side), device = actual.get(old?.deviceId), row = device?.nmsInterfaces.find(p => `nms:${p.id}` === item.portId);
    const number = row?.description?.match(/^(\d+)\s+Gigabit\s*-\s*Level$/i)?.[1];
    const corrected = item.correctDrawingLabel && physicalName(item.portName) && row && [row.description || '', row.interfaceName].some(label => compatible(item.portName, label));
    if (!old || !(number && number === old.portName || corrected) || !item.evidence || !original.ports?.some(p => `interface:${p.id}` === old.portId && p.deviceId === old.deviceId && p.name === old.portName)) throw Error('Only an original drawing placeholder with exact NMS evidence or an explicit label correction may be replaced');
    const portKey = row.interfaceName.trim().toLowerCase();
    if (used.has(`${old.deviceId}:${portKey}`) || [...safeAdditions, ...newLinks.flatMap(l => l.endpoints)].some(ep => ep.deviceId === old.deviceId && ep.portKey === portKey)) throw Error('Replacement NMS port is occupied');
    replacements.push({ endpointId: old.id, linkId: link.id, deviceId: old.deviceId, portId: item.portId, portName: corrected ? item.portName : number, portKey, retiredInterfaceId: old.portId.slice(10), retiredPortName: old.portName, evidence: item.evidence });
  }
  const after = new Map([...actual].map(([id, d]) => [id, { ...d }])); locations.forEach(d => Object.assign(after.get(d.id), d));
  const pairs = new Map();
  for (const l of [...snapshot.links, ...newLinks]) { const a = after.get(l.sourceDeviceId)?.buildingId, b = after.get(l.targetDeviceId)?.buildingId; if (!a || !b || a === b) continue; const key = [a, b].sort().join('|'); if (!pairs.has(key)) pairs.set(key, { a, b, refs: [] }); pairs.get(key).refs.push(l.sourceRef); }
  const buildingConnections = [...pairs.values()].filter(pair => !snapshot.buildingConnections.some(c => [c.sourceBuildingId, c.destBuildingId].sort().join('|') === [pair.a, pair.b].sort().join('|'))).map(pair => ({ id: stableId('buildinglink', `${original.source}:${[pair.a,pair.b].sort().join('|')}`), sourceBuildingId: pair.a, destBuildingId: pair.b, connectionType: 'OTHER', status: 'UNKNOWN', recordingMethod: 'MANUAL', name: 'İncelemeyle tamamlanan çizim bağlantıları', notes: 'Cihaz bağlantılarından türetilmiştir. Kablo türü, hız ve canlı durum doğrulanmadı.', metadata: { drawio: { sha256: original.sha256, refs: pair.refs } } }));
  const payload = { version: 1, pageId: original.pageId, sha256: original.sha256, originalPlanHash: original.planHash, snapshotHash: snapshotKey(snapshot), observedAt: review.observedAt, newDevices, deviceChanges: changes, locations, floors, newBuildings, newLinks, additions: safeAdditions, replacements, ports: [...ports.values()].filter(p => acceptedPortIds.has(`interface:${p.id}`)), buildingConnections, issues, review };
  return { ...payload, planHash: digest(payload) };
}
async function applyReconciliation(db, plan, actorId, expectedHash, maxDevices) {
  const { planHash, ...payload } = plan; if (planHash !== expectedHash || digest(payload) !== planHash) throw Error('Reconciliation artifact hash mismatch');
  return db.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, status: true } }); if (actor?.role !== 'ADMIN' || actor.status !== 'ACTIVE') throw Error('An active administrator is required');
    const key = `network.topology.drawio-reconcile:${plan.pageId}:${planHash}`, replay = await tx.systemConfig.findUnique({ where: { key } }); if (replay) return { ...JSON.parse(replay.value).result, replayed: true };
    const origin = await tx.systemConfig.findUnique({ where: { key: `network.topology.drawio-import:${plan.pageId}` } }); if (!origin || JSON.parse(origin.value).planHash !== plan.originalPlanHash || JSON.parse(origin.value).sha256 !== plan.sha256) throw Error('Original import registry mismatch');
    const snapshot = await readSnapshot(tx); if (snapshotKey(snapshot) !== plan.snapshotHash) throw Error('Inventory changed after reconciliation planning');
    if (snapshot.devices.length + plan.newDevices.length > maxDevices) throw Error('Device license capacity exceeded');
    for (const b of plan.newBuildings) await tx.building.create({ data: b });
    for (const f of plan.floors) await tx.floor.create({ data: f });
    for (const d of plan.newDevices) { const { refs, evidence, sharedManagementIp, ...data } = d; await tx.device.create({ data: { ...data, status: 'UNKNOWN', pollingEnabled: false, metadata: { drawioImports: { [plan.pageId]: { sha256: plan.sha256, refs, notes: [evidence], sharedManagementIp } } } } }); }
    const changedIds = new Set([...plan.locations, ...plan.deviceChanges].map(d => d.id)), before = [];
    for (const id of changedIds) {
      const d = await tx.device.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, managementIp: true, buildingId: true, floorId: true, rackId: true, metadata: true } });
      if (d.metadata !== null && (typeof d.metadata !== 'object' || Array.isArray(d.metadata))) throw Error('Existing metadata requires reconciliation');
      const metadata = d.metadata || {}; if (metadata.drawioReconciliations !== undefined && (!metadata.drawioReconciliations || typeof metadata.drawioReconciliations !== 'object' || Array.isArray(metadata.drawioReconciliations))) throw Error('Existing reconciliation provenance is invalid');
      const location = plan.locations.find(x => x.id === id), change = plan.deviceChanges.find(x => x.id === id); before.push({ id, name: d.name, managementIp: d.managementIp, buildingId: d.buildingId, floorId: d.floorId });
      await tx.device.update({ where: { id }, data: { ...(location ? { buildingId: location.buildingId, floorId: location.floorId } : {}), ...(change?.set || {}), metadata: { ...metadata, drawioReconciliations: { ...(metadata.drawioReconciliations || {}), [planHash]: { location, change, sha256: plan.sha256 } } } } });
    }
    for (const p of plan.ports) await tx.networkInterface.create({ data: p });
    const strip = ({ evidence: _evidence, ...ep }) => { void _evidence; return ep; };
    for (const l of plan.newLinks) await tx.deviceLink.create({ data: { id: l.id, sourceDeviceId: l.sourceDeviceId, targetDeviceId: l.targetDeviceId, source: 'DRAWIO', sourceRef: l.sourceRef, type: 'UNKNOWN', status: 'UNKNOWN', bandwidth: 'Belirtilmemiş', endpoints: { create: l.endpoints.map(strip) } } });
    for (const ep of plan.additions) await tx.deviceLinkEndpoint.create({ data: strip(ep) });
    const retiredInterfaces = [];
    for (const ep of plan.replacements) {
      await tx.deviceLinkEndpoint.update({ where: { id: ep.endpointId }, data: { portId: ep.portId, portName: ep.portName, portKey: ep.portKey } });
      const old = await tx.networkInterface.findUniqueOrThrow({ where: { id: ep.retiredInterfaceId } });
      if (old.deviceId !== ep.deviceId || old.name !== ep.retiredPortName || old.type !== 'ETHERNET' || old.status !== 'UNKNOWN' || [old.ipv4, old.ipv6, old.macAddress, old.vlanId].some(v => v != null) || await tx.deviceLinkEndpoint.count({ where: { portId: `interface:${old.id}` } }) || await tx.switchPort.count({ where: { connectedToId: old.id } }) || await tx.connection.count({ where: { OR: [{ sourceInterfaceId: old.id }, { destInterfaceId: old.id }] } })) throw Error('Drawing placeholder acquired references or user data; do not retire it');
      retiredInterfaces.push(old); await tx.networkInterface.delete({ where: { id: old.id } });
    }
    for (const id of new Set([...plan.additions, ...plan.replacements].map(ep => ep.linkId))) await tx.deviceLink.update({ where: { id }, data: { updatedAt: new Date() } });
    for (const b of plan.buildingConnections) await tx.buildingConnection.create({ data: b });
    const result = { newDevices: plan.newDevices.length, deviceChanges: plan.deviceChanges.length, locations: plan.locations.length, floors: plan.floors.length, newBuildings: plan.newBuildings.length, newLinks: plan.newLinks.length, addedEndpoints: plan.additions.length, remappedEndpoints: plan.replacements.length, ports: plan.ports.length, buildingConnections: plan.buildingConnections.length };
    await tx.systemConfig.create({ data: { key, value: JSON.stringify({ planHash, originalPlanHash: plan.originalPlanHash, sha256: plan.sha256, actorId, at: new Date().toISOString(), result, before, review: plan.review, additions: plan.additions, replacements: plan.replacements, retiredInterfaces, linkIds: plan.newLinks.map(l => l.id) }) } });
    await tx.auditLog.create({ data: { entity: 'TopologyReconciliation', entityId: plan.pageId, action: 'UPDATE', resource: 'devices', resourceId: plan.pageId, userId: actorId, details: { planHash, sha256: plan.sha256, result } } });
    return result;
  }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 120000 });
}
module.exports = { buildReconciliation, applyReconciliation, hostKey, compatible };
if (require.main === module) {
  const fs = require('node:fs'), [original, evidence, snapshot, mapping, review, nms, output] = process.argv.slice(2);
  const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
  const plan = buildReconciliation(read(original), read(evidence), read(snapshot), read(mapping), read(review), read(nms).neighbors);
  fs.writeFileSync(output, JSON.stringify(plan, null, 2)); console.log(JSON.stringify({ planHash: plan.planHash, newDevices: plan.newDevices.length, deviceChanges: plan.deviceChanges.length, locations: plan.locations.length, floors: plan.floors.length, newLinks: plan.newLinks.length, endpoints: plan.additions.length, ports: plan.ports.length, issues: plan.issues.length, buildingConnections: plan.buildingConnections.length }));
}
