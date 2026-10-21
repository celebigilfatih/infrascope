/* eslint-disable @typescript-eslint/no-require-imports -- Offline, reviewable import planning. */
const crypto = require('node:crypto');
const { isIP } = require('node:net');
const stableId = (kind, value) => `di_${kind}_${crypto.createHash('sha256').update(value).digest('hex').slice(0, 28)}`;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nameKey = value => value.trim().toLocaleLowerCase('tr-TR');
const portKey = value => value.trim().toLocaleLowerCase('en-US');
function portAlias(value) {
  return portKey(value).replace(/\s+/g, '').replace(/^tengigabitethernet/, 'te').replace(/^gigabitethernet/, 'gi').replace(/^fastethernet/, 'fa').replace(/^ethernet/, 'eth');
}
function snapshotKey(snapshot) {
  return digest({
    organizations: snapshot.organizations,
    devices: snapshot.devices.map(d => ({ id: d.id, name: d.name, type: d.type, managementIp: d.managementIp, buildingId: d.buildingId, floorId: d.floorId || null, rackId: d.rackId, ports: [...d.nmsInterfaces.map(p => `nms:${p.id}:${p.interfaceName}:${p.description || ''}`), ...d.networkInterfaces.map(p => `interface:${p.id}:${p.name}`), ...d.switchPorts.map(p => `switch:${p.id}:${p.name}:${p.connectedToId || ''}`)].sort() })).sort((a,b)=>a.id.localeCompare(b.id)),
    links: snapshot.links, legacy: snapshot.legacy, buildingConnections: snapshot.buildingConnections,
  });
}
function catalog(device) {
  return [
    ...device.switchPorts.map(p => ({ id: `switch:${p.id}`, name: p.name })),
    ...device.networkInterfaces.map(p => ({ id: `interface:${p.id}`, name: p.name })),
    ...device.nmsInterfaces.map(p => ({ id: `nms:${p.id}`, name: /^if\d+$/i.test(p.interfaceName) && /^(?:[a-z]+)?\d+(?:\/\d+)*$/i.test(p.description || '') ? p.description : p.interfaceName, key: portKey(p.interfaceName), aliases: [p.interfaceName, p.description].filter(Boolean) })),
  ];
}
function matchPort(raw, device) {
  const ports = catalog(device), key = portAlias(raw);
  let matches = ports.filter(p => (p.aliases || [p.name]).some(name => portAlias(name) === key));
  if (!matches.length && /^\d+(?:\/\d+){0,3}$/.test(key)) {
    matches = ports.filter(p => (p.aliases || [p.name]).some(name => /^(?:eth|gi|te|fa|ge|xe|xg)\d/.test(portAlias(name)) && portAlias(name).replace(/^[a-z]+/, '') === key));
  }
  const unique = new Map(matches.map(p => [p.id, p]));
  if (unique.size > 1) return { ambiguous: true };
  return { port: matches[0] || null };
}
function edgePorts(edge, cells) {
  const labels = cells.filter(c => c.parent === edge.id).flatMap(c => c.lines.map(text => ({ text: text.trim(), x: Number(c.geometry.x || 0) })));
  const valid = labels.filter(p => /^(?:(?:[a-z]+)\s*)?\d+(?:\/\d+){0,3}$/i.test(p.text));
  const side = sign => { const a = valid.filter(p => sign * p.x > .4); return a.length === 1 ? a[0].text : null; };
  return { source: side(-1), target: side(1), labels };
}
function buildPlan(evidence, snapshot, review) {
  if (review.sha256 !== evidence.sha256) throw Error('The reviewed mapping does not match the drawing hash');
  const page = evidence.pages.find(p => p.id === review.pageId);
  if (!page) throw Error('Reviewed drawing page missing');
  const source = `drawio:${page.id}`, cells = new Map(page.cells.map(c => [c.id, c]));
  const organization = snapshot.organizations.find(o => o.id === review.organizationId);
  if (!organization) throw Error('Select an existing organization');
  const issues = [], buildings = [], floors = [], nodes = [], aliases = new Map(), canonical = new Map();
  const ensureBuilding = name => {
    const found = organization.buildings.filter(b => nameKey(b.name) === nameKey(name));
    if (found.length > 1) throw Error(`Ambiguous building: ${name}`);
    if (found[0]) return found[0];
    let b = buildings.find(b => nameKey(b.name) === nameKey(name));
    if (!b) { b = { id: stableId('building', `${organization.id}:${nameKey(name)}`), name, organizationId: organization.id, address: '', city: '', country: '', floors: [] }; buildings.push(b); }
    return b;
  };
  const ensureFloor = (building, number) => {
    if (!Number.isSafeInteger(number) || number < -10 || number > 200) throw Error('Invalid reviewed floor');
    const found = building.floors.find(f => f.floorNumber === number) || floors.find(f => f.buildingId === building.id && f.floorNumber === number);
    if (found) return found;
    const f = { id: stableId('floor', `${building.id}:${number}`), buildingId: building.id, name: number === 0 ? 'Zemin Kat' : `${number}. Kat`, floorNumber: number };
    floors.push(f); return f;
  };
  for (const entry of review.nodes) {
    if (!cells.has(entry.labelId) || !entry.refs.length || entry.refs.some(id => !cells.has(id))) throw Error('Reviewed node reference missing');
    if (!entry.name?.trim() || entry.name.length > 300 || entry.managementIp && isIP(entry.managementIp) !== 4) throw Error('Invalid reviewed device');
    const matches = entry.managementIp ? snapshot.devices.filter(d => d.managementIp === entry.managementIp) : [];
    if (matches.length > 1) { issues.push({ kind: 'AMBIGUOUS_INVENTORY_IP', labelId: entry.labelId, name: entry.name, ip: entry.managementIp }); continue; }
    const existing = matches[0];
    const key = existing ? `existing:${existing.id}` : entry.managementIp ? `ip:${entry.managementIp}` : `cell:${entry.refs[0]}`;
    let node = canonical.get(key);
    const building = entry.buildingName ? ensureBuilding(entry.buildingName) : null;
    const floor = building && entry.floorNumber !== null ? ensureFloor(building, entry.floorNumber) : null;
    if (!node) {
      const b = existing?.rack?.room?.floor?.buildingId || existing?.buildingId || null;
      if (b && building && b !== building.id) issues.push({ kind: 'LOCATION_CONFLICT', deviceId: existing.id, requested: building.id, kept: b });
      node = { id: existing?.id || stableId('device', `${source}:${key}`), existing: !!existing, name: existing?.name || entry.name, type: existing?.type || entry.type,
        managementIp: existing?.managementIp || entry.managementIp, vendor: existing?.vendor || entry.vendor, model: existing?.model || entry.model,
        buildingId: b || building?.id || null, floorId: existing?.floorId || (!b || b === building?.id ? floor?.id : null) || null,
        refs: [], labelIds: [], drawingNames: [], notes: [], locationEvidence: [], rawIps: [], x: 0, y: 0,
        ports: existing || { switchPorts: [], networkInterfaces: [], nmsInterfaces: [] } };
      canonical.set(key, node); nodes.push(node);
    } else if (!existing && nameKey(node.name) !== nameKey(entry.name)) throw Error(`Conflicting drawing identity at ${entry.managementIp}`);
    if (building && node.buildingId && node.buildingId !== building.id) throw Error(`Conflicting drawing location for ${node.name}`);
    if (floor && node.floorId && node.floorId !== floor.id) throw Error(`Conflicting drawing floor for ${node.name}`);
    for (const ref of entry.refs) { if (aliases.has(ref) && aliases.get(ref) !== node.id) throw Error(`Two device identities own ${ref}`); aliases.set(ref, node.id); node.refs.push(ref); }
    node.labelIds.push(entry.labelId); node.drawingNames.push(entry.name); node.notes.push(...entry.notes); node.locationEvidence.push(entry.locationEvidence); node.rawIps.push(...entry.rawIps);
    const geometry = cells.get(entry.refs.find(ref => cells.get(ref).image) || entry.labelId).geometry;
    node.x = Number(geometry.x || 0); node.y = Number(geometry.y || 0);
  }
  const byId = new Map(nodes.map(n => [n.id, n])), links = [], duplicateEdges = [], heldEdges = [], usedTuples = new Map();
  for (const edge of page.cells.filter(c => c.edge === '1')) {
    const sourceDeviceId = aliases.get(edge.source), targetDeviceId = aliases.get(edge.target);
    if (!sourceDeviceId || !targetDeviceId) { heldEdges.push({ edgeId: edge.id, reason: 'UNRESOLVED_DEVICE_ENDPOINT', source: edge.source, target: edge.target }); continue; }
    if (sourceDeviceId === targetDeviceId) { heldEdges.push({ edgeId: edge.id, reason: 'SAME_STACK_OR_DEVICE' }); continue; }
    const named = edgePorts(edge, page.cells);
    const endpoint = (side, deviceId, raw) => {
      if (!raw) return null;
      const node = byId.get(deviceId), match = matchPort(raw, node.ports);
      if (match.ambiguous) { issues.push({ kind: 'AMBIGUOUS_PORT', edgeId: edge.id, deviceId, raw }); return null; }
      const name = match.port?.name || raw.replace(/\s+/g, ' ').trim();
      if (!match.port && node.existing && node.ports.nmsInterfaces.length) issues.push({ kind: 'DRAWING_ONLY_PORT', edgeId: edge.id, deviceId, raw });
      return { deviceId, side, portId: match.port?.id || `interface:${stableId('port', `${deviceId}:${portKey(name)}`)}`, portName: name, portKey: match.port?.key || portKey(name), raw, create: !match.port };
    };
    const endpoints = [endpoint(0, sourceDeviceId, named.source), endpoint(1, targetDeviceId, named.target)].filter(Boolean);
    const tuple = endpoints.length === 2 ? endpoints.map(p => `${p.deviceId}:${p.portKey}`).sort().join('|') : null;
    if (tuple && usedTuples.has(tuple)) { duplicateEdges.push({ edgeId: edge.id, canonicalEdgeId: usedTuples.get(tuple) }); continue; }
    if (tuple) usedTuples.set(tuple, edge.id);
    const sourceRef = `${page.id}/${edge.id}`;
    const existing = snapshot.links.find(link => link.source === 'DRAWIO' && link.sourceRef === sourceRef);
    links.push({ id: existing?.id || stableId('link', sourceRef), existing: !!existing, sourceDeviceId, targetDeviceId, source: 'DRAWIO', sourceRef, type: 'UNKNOWN', bandwidth: 'Belirtilmemiş', status: 'UNKNOWN', endpoints, edgeId: edge.id, labels: named.labels });
  }
  const reservations = new Map();
  for (const link of links.filter(l => !l.existing)) for (const endpoint of link.endpoints) { const key = `${endpoint.deviceId}:${endpoint.portKey}`; reservations.set(key, [...(reservations.get(key) || []), link.id]); }
  const occupied = new Set(snapshot.links.flatMap(l => l.endpoints.map(e => `${e.deviceId}:${e.portKey}`)));
  for (const link of snapshot.legacy) {
    if (link.sourcePort) occupied.add(`${link.sourcePort.switchDeviceId}:${portKey(link.sourcePort.name)}`);
    if (link.sourceInterface) occupied.add(`${link.sourceInterface.deviceId}:${portKey(link.sourceInterface.name)}`);
  }
  for (const link of links.filter(l => !l.existing)) link.endpoints = link.endpoints.filter(endpoint => {
    const key = `${endpoint.deviceId}:${endpoint.portKey}`, conflict = reservations.get(key).length > 1 || occupied.has(key);
    if (conflict) issues.push({ kind: 'PORT_RESERVATION_CONFLICT', edgeId: link.edgeId, deviceId: endpoint.deviceId, raw: endpoint.raw, portName: endpoint.portName });
    return !conflict;
  });
  const ports = [...new Map(links.filter(l => !l.existing).flatMap(l => l.endpoints.filter(e => e.create).map(e => [e.portId, { id: e.portId.slice('interface:'.length), deviceId: e.deviceId, name: e.portName, status: 'UNKNOWN' }]))).values()];
  const pairs = new Map(), buildingConnections = [];
  for (const link of links) {
    const a = byId.get(link.sourceDeviceId).buildingId, b = byId.get(link.targetDeviceId).buildingId;
    if (!a || !b || a === b) continue;
    const key = [a,b].sort().join('|');
    if (!pairs.has(key)) pairs.set(key, { a, b, edgeIds: [] });
    pairs.get(key).edgeIds.push(link.edgeId);
  }
  for (const pair of pairs.values()) {
    const existing = snapshot.buildingConnections.some(c => [c.sourceBuildingId,c.destBuildingId].sort().join('|') === [pair.a,pair.b].sort().join('|'));
    if (!existing) buildingConnections.push({ id: stableId('buildinglink', `${source}:${[pair.a,pair.b].sort().join('|')}`), sourceBuildingId: pair.a, destBuildingId: pair.b, connectionType: 'OTHER', status: 'UNKNOWN', recordingMethod: 'MANUAL', name: 'Çizimden aktarılan bağlantılar', notes: `Çizimde ${pair.edgeIds.length} cihaz bağlantısı bulunuyor. Kablo türü, hız ve canlı durum doğrulanmadı.`, metadata: { drawio: { source, sha256: evidence.sha256, edgeIds: pair.edgeIds } } });
  }
  const plan = { version: 1, source, sha256: evidence.sha256, fileName: evidence.fileName, pageId: page.id, snapshotHash: snapshotKey(snapshot), organizationId: organization.id,
    buildings: buildings.map(({floors: _floors,...b})=>{void _floors;return b}), floors, devices: nodes.map(({ports: _ports,...n})=>{void _ports;return n}), ports, links, buildingConnections, issues, heldEdges, duplicateEdges };
  return { ...plan, planHash: digest(plan) };
}
module.exports = { buildPlan, snapshotKey, stableId, digest, portAlias, matchPort, edgePorts };
if (require.main === module) {
  const fs = require('node:fs'), [evidence, snapshot, review, output] = process.argv.slice(2);
  const plan = buildPlan(...[evidence, snapshot, review].map(p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))));
  fs.writeFileSync(output, JSON.stringify(plan,null,2));
  console.log(JSON.stringify({ planHash: plan.planHash, buildings: plan.buildings.length, floors: plan.floors.length, devices: plan.devices.length, reused: plan.devices.filter(n=>n.existing).length, newDevices: plan.devices.filter(n=>!n.existing).length, links: plan.links.length, completeLinks: plan.links.filter(l=>l.endpoints.length===2).length, ports: plan.ports.length, buildingLinks: plan.buildingConnections.length, issues: plan.issues.length, held: plan.heldEdges.length, duplicates: plan.duplicateEdges.length }));
}
