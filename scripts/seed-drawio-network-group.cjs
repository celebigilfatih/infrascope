/* eslint-disable @typescript-eslint/no-require-imports -- Local reviewed topology bootstrap. */
const { digest } = require('./drawio-topology-plan.cjs');
function reviewedGroup(original, snapshot, sourceIp, name, expectedCount) {
  const { planHash, ...payload } = original;
  if (digest(payload) !== planHash) throw Error('Original drawing artifact hash mismatch');
  const roots = snapshot.devices.filter(d => d.managementIp === sourceIp);
  if (roots.length !== 1) throw Error('The reviewed source IP must identify one existing device');
  const source = roots[0], ids = new Set(original.devices.filter(d => /^TT-ROUTER(?:\s|$)/i.test(d.name)).map(d => d.id));
  const peerIds = new Set(snapshot.links.filter(l => l.source === 'DRAWIO' && l.sourceRef?.startsWith(original.pageId + '/') && [l.sourceDeviceId,l.targetDeviceId].includes(source.id)).map(l => l.sourceDeviceId === source.id ? l.targetDeviceId : l.sourceDeviceId).filter(id => ids.has(id)));
  const peers = snapshot.devices.filter(d => peerIds.has(d.id));
  const buildingIds = [...new Set(peers.map(d => d.rack?.room?.floor?.building?.id || d.buildingId))].sort();
  if (!Number.isSafeInteger(expectedCount) || peers.length !== expectedCount || buildingIds.length !== expectedCount || buildingIds.some(id => !id)) throw Error('Reviewed remote-site count or location identity changed');
  const organization = snapshot.organizations.find(o => o.id === original.organizationId);
  if (!organization || buildingIds.some(id => !organization.buildings.some(b => b.id === id))) throw Error('Reviewed sites must belong to the original organization');
  return { body: { name, kind: 'VPN', organizationId: organization.id, sourceDeviceId: source.id, sourcePortId: null, memberBuildingIds: buildingIds }, proof: { pageId: original.pageId, sourceSha256: original.sha256, originalPlanHash: planHash, peerDeviceIds: [...peerIds].sort() } };
}
module.exports = { reviewedGroup };
if (require.main === module) {
  require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' } });
  const fs = require('node:fs');
  const { prisma } = require('../lib/prisma.ts');
  const { readSnapshot } = require('./drawio-topology-db.cjs');
  const { writeNetworkGroup } = require('../lib/topology/network-group-service.ts');
  const [artifact, sourceIp, name, actorId, count, mode] = process.argv.slice(2);
  (async () => {
    if (!artifact || !sourceIp || !name || !actorId || !count || !['--preview','--apply'].includes(mode)) throw Error('Usage: seed-drawio-network-group.cjs <original-plan> <source-ip> <group-name> <admin-id> <expected-sites> --preview|--apply');
    const original = JSON.parse(fs.readFileSync(artifact,'utf8'));
    const seed = reviewedGroup(original, await readSnapshot(prisma), sourceIp, name, Number(count));
    if (mode === '--preview') { console.log(JSON.stringify(seed)); return; }
    const result = await prisma.$transaction(async tx => {
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, status: true } });
      if (actor?.role !== 'ADMIN' || actor.status !== 'ACTIVE') throw Error('An active administrator is required');
      const origin = await tx.systemConfig.findUnique({ where: { key: `network.topology.drawio-import:${original.pageId}` } });
      if (!origin || JSON.parse(origin.value).planHash !== original.planHash) throw Error('Drawing import registry mismatch');
      const current = reviewedGroup(original, await readSnapshot(tx), sourceIp, name, Number(count));
      if (digest(seed) !== digest(current)) throw Error('Reviewed group membership changed');
      const key = `network.topology.group-seed:${original.pageId}:${digest(name).slice(0,16)}`;
      const prior = await tx.systemConfig.findUnique({ where: { key } });
      if (prior) {
        const saved = JSON.parse(prior.value), group = await tx.networkGroup.findUnique({ where: { id: saved.groupId }, include: { members: true } });
        if (!group || group.name !== name || group.sourceDeviceId !== seed.body.sourceDeviceId || group.sourcePortId !== null || group.organizationId !== seed.body.organizationId || group.kind !== seed.body.kind || digest(group.members.map(m=>m.buildingId).sort()) !== digest(seed.body.memberBuildingIds) || saved.seedHash !== digest(seed)) throw Error('Seed group was edited or removed; preserve operator changes');
        return { id: group.id, members: group.members.length, replayed: true };
      }
      const groupId = await writeNetworkGroup(tx, seed.body, actorId);
      await tx.systemConfig.create({ data: { key, value: JSON.stringify({ groupId, seedHash: digest(seed), actorId, ...seed.proof }) } });
      return { id: groupId, members: seed.body.memberBuildingIds.length, replayed: false };
    }, { isolationLevel: 'Serializable', timeout: 120000 });
    console.log(JSON.stringify(result));
  })().catch(e => { console.error(e.message); process.exitCode=1; }).finally(()=>prisma.$disconnect());
}
