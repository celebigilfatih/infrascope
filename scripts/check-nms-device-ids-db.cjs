// Real entry points and transactions; explicit disposable PostgreSQL only. No source/recipient I/O.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_NMS_ID_DB_TEST !== '1' || url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1'
  || !/^\/[a-z0-9_]+_occurrence_tests$/.test(url.pathname)) throw new Error('Explicit opt-in and local disposable *_occurrence_tests database required');
url.searchParams.set('connection_limit', '10');
const { PrismaClient } = require('@prisma/client');
const { fixture, deferred } = require('./check-nms-device-ids.cjs');
const database = () => new PrismaClient({ datasources: { db: { url: url.href } } });
const prisma = database();
let checks = 0;
async function cleanup(f) {
  const ids = model => f.state.created.filter(r => r.model === model).map(r => r.id);
  await prisma.firewallConnector.deleteMany({ where: { id: { in: ids('firewallConnector') } } });
  await prisma.integrationConfig.deleteMany({ where: { id: { in: ids('integrationConfig') } } });
  await prisma.nmsDiscoveryScan.deleteMany({ where: { id: { startsWith: f.prefix } } });
  await prisma.device.deleteMany({ where: { OR: [{ id: { startsWith: f.prefix } }, { id: { in: ids('device') } }] } });
}
async function scenario(name, run) {
  const prefix = `b17-fixture-${checks + 1}-`, f = fixture({ database: prisma, prefix }); f.prefix = prefix;
  f.found = async (ip = '192.0.2.20') => {
    const scan = await prisma.nmsDiscoveryScan.create({ data: { id: prefix + 'scan-' + (++f.state.sequence), cidr: '192.0.2.0/24', status: 'completed' } });
    return prisma.nmsDiscoveredDevice.create({ data: { scanId: scan.id, ipAddress: ip, snmpCommunity: 'fixture-community', snmpStatus: 'success' } });
  };
  try { await run(f); assert.ok(f.state.isolations.every(i => i === 'read committed')); checks++; console.log('PASS PostgreSQL ' + name); }
  finally { await cleanup(f); }
}
async function concurrent(f, operations) {
  f.state.barrier = { expected: operations.length, gate: deferred() }; f.state.lockAttempts = 0;
  try { return await Promise.all(operations.map(run => run())); } finally { f.state.barrier = null; }
}
async function created(responses) {
  const bodies = await Promise.all(responses.map(r => r.json()));
  assert.ok(responses.every(r => r.status === 201), JSON.stringify(bodies));
  const devices = bodies.map(b => b.device || b.data.device);
  assert.equal(new Set(devices.map(d => d.nmsDeviceId)).size, devices.length);
  assert.ok(devices.every(d => Number.isInteger(d.nmsDeviceId) && d.nmsDeviceId > 0));
  return devices;
}
async function main() {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url.href }, stdio: 'pipe' });
  const [defaults] = await prisma.$queryRawUnsafe('SHOW default_transaction_isolation');
  console.log('Fixture database default isolation: ' + defaults.default_transaction_isolation);
  await scenario('original void lock query reproduces P2010 while the real helper succeeds', async f => {
    await assert.rejects(prisma.$transaction(tx => tx.$queryRaw`SELECT pg_advisory_xact_lock(${2147380047})`), e => e.code === 'P2010' && /void/.test(e.message));
    const id = await prisma.$transaction(tx => f.load('lib/nms/device-id.ts').reserveNextNmsDeviceId(tx), { isolationLevel: 'ReadCommitted' });
    assert.ok(Number.isInteger(id) && id > 0);
  });
  await scenario('negative control: unlocked MAX plus independent updates produces one uniqueness failure', async f => {
    const devices = [await f.addDevice(), await f.addDevice()], gate = deferred(); let reads = 0;
    const results = await Promise.allSettled(devices.map(async device => {
      const max = await prisma.device.aggregate({ _max: { nmsDeviceId: true } }); const next = (max._max.nmsDeviceId || 0) + 1;
      if (++reads === 2) gate.resolve(); await gate.promise;
      return prisma.device.update({ where: { id: device.id }, data: { nmsDeviceId: next } });
    }));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'P2002');
  });
  await scenario('legacy/legacy synchronized contenders return different IDs with zero 500 responses', async f => {
    const a = await f.addDevice({ managementIp: '192.0.2.1' }), b = await f.addDevice({ managementIp: '192.0.2.2' });
    await created(await concurrent(f, [() => f.enable(a), () => f.enable(b)]));
  });
  await scenario('legacy/firewall synchronized contenders share allocation and probe only after commit', async f => {
    const device = await f.addDevice(); const responses = await concurrent(f, [() => f.enable(device), () => f.firewall('mixed')]);
    await created(responses); assert.equal(f.state.probes.length, 1);
    const body = await (await f.firewall('rest', { snmp: undefined })).json();
    assert.equal(body.data.device.nmsDeviceId, null); assert.equal(body.data.probe.connected, false);
  });
  await scenario('discovery/legacy contenders retain independent inventory and discovery identity', async f => {
    const a = await f.addDevice(), b = await f.addDevice(), found = await f.found();
    await created(await concurrent(f, [() => f.enable(a), () => f.discover(b, found)]));
    assert.equal((await prisma.nmsDiscoveredDevice.findUnique({ where: { id: found.id } })).imported, true);
  });
  await scenario('discovery/firewall contenders share allocation without replacing remote evidence', async f => {
    const device = await f.addDevice(), found = await f.found();
    await created(await concurrent(f, [() => f.discover(device, found), () => f.firewall('discovery') ]));
    assert.equal((await prisma.nmsDiscoveredDevice.findUnique({ where: { id: found.id } })).ipAddress, found.ipAddress);
  });
  await scenario('six synchronized mixed writers all commit unique positive identifiers', async f => {
    const a = await f.addDevice({ managementIp: '192.0.2.1' }), b = await f.addDevice({ managementIp: '192.0.2.2' });
    const c = await f.addDevice(), d = await f.addDevice(), x = await f.found('192.0.2.3'), y = await f.found('192.0.2.4');
    await created(await concurrent(f, [() => f.enable(a), () => f.enable(b), () => f.discover(c, x), () => f.discover(d, y),
      () => f.firewall('batch-a'), () => f.firewall('batch-b')]));
  });
  await scenario('same device double enable returns 201/409 and cannot replace the winning ID', async f => {
    const device = await f.addDevice(); const responses = await concurrent(f, [() => f.enable(device), () => f.enable(device)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
    const winner = await responses.find(r => r.status === 201).json(), loser = await responses.find(r => r.status === 409).json();
    assert.equal(loser.nmsDeviceId, winner.device.nmsDeviceId);
    assert.equal((await prisma.device.findUnique({ where: { id: device.id } })).nmsDeviceId, winner.device.nmsDeviceId);
    assert.equal(f.state.allocations.length, 1);
  });
  await scenario('same discovered row cannot enable two inventory devices concurrently', async f => {
    const a = await f.addDevice(), b = await f.addDevice(), found = await f.found();
    const responses = await concurrent(f, [() => f.discover(a, found), () => f.discover(b, found)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
    assert.equal(await prisma.device.count({ where: { id: { in: [a.id, b.id] }, nmsDeviceId: { not: null } } }), 1);
  });
  await scenario('same-IP competing devices retain a 409 instead of assigning a second NMS identity', async f => {
    const a = await f.addDevice(), b = await f.addDevice();
    const responses = await concurrent(f, [() => f.enable(a), () => f.enable(b)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]); assert.equal(f.state.allocations.length, 1);
  });
  await scenario('legacy and discovery competing for one inventory row cannot reassign its identity', async f => {
    const device = await f.addDevice(), found = await f.found();
    const responses = await concurrent(f, [() => f.enable(device), () => f.discover(device, found)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]); assert.equal(f.state.allocations.length, 1);
    assert.equal((await prisma.nmsDiscoveredDevice.findUnique({ where: { id: found.id } })).imported, responses[1].status === 201);
  });
  for (const site of ['device:update', 'nmsDiscoveredDevice:update']) await scenario('real discovery transaction rolls back ' + site + ' and safely retries', async f => {
    const device = await f.addDevice(), found = await f.found(); f.state.failOnce = site;
    assert.equal((await f.discover(device, found)).status, 500);
    assert.equal((await prisma.device.findUnique({ where: { id: device.id } })).nmsDeviceId, null);
    const row = await prisma.nmsDiscoveredDevice.findUnique({ where: { id: found.id } }); assert.equal(row.imported, false); assert.equal(row.importedAt, null);
    assert.equal((await f.discover(device, found)).status, 201);
  });
  for (const site of ['integrationConfig:create', 'firewallConnector:create']) await scenario('real firewall transaction rolls back ' + site + ' without probing', async f => {
    f.state.failOnce = site; assert.equal((await f.firewall('rollback')).status, 500); assert.equal(f.state.probes.length, 0);
    const deviceIds = f.state.created.filter(r => r.model === 'device').map(r => r.id);
    assert.equal(await prisma.device.count({ where: { id: { in: deviceIds } } }), 0);
    assert.equal((await f.firewall('rollback')).status, 201); assert.equal(f.state.probes.length, 1);
  });
  await scenario('late transaction failure rolls back an assigned ID and releases the lock', async f => {
    const device = await f.addDevice(); f.state.failCommit = true;
    assert.equal((await f.enable(device)).status, 500);
    assert.equal((await prisma.device.findUnique({ where: { id: device.id } })).nmsDeviceId, null);
    f.state.failCommit = false; assert.equal((await f.enable(device)).status, 201);
  });
  await scenario('independent application clients contend through PostgreSQL rather than a process mutex', async f => {
    const second = database(), peer = fixture({ database: second, prefix: f.prefix + 'peer-' }); peer.prefix = f.prefix + 'peer-';
    const held = deferred(), release = deferred(), attempts = deferred(); let count = 0;
    const blocker = prisma.$transaction(async tx => {
      await f.load('lib/nms/device-id.ts').reserveNextNmsDeviceId(tx); held.resolve(); await release.promise;
    }, { isolationLevel: 'ReadCommitted' });
    const pending = [];
    try {
      await held.promise;
      f.state.onLockAttempt = peer.state.onLockAttempt = () => { if (++count === 2) attempts.resolve(); };
      const device = await f.addDevice();
      pending.push(f.enable(device), peer.firewall('peer'));
      await attempts.promise; release.resolve(); await blocker;
      await created(await Promise.all(pending));
    } finally {
      release.resolve(); await blocker.catch(() => {}); await Promise.allSettled(pending); await cleanup(peer); await second.$disconnect();
    }
  });
  await scenario('integer limit is validated before writing and no overflow/fallback ID is invented', async f => {
    await f.addDevice({ nmsDeviceId: 2147483646 });
    const a = await f.addDevice({ managementIp: '192.0.2.1' }), b = await f.addDevice({ managementIp: '192.0.2.2' });
    const first = await f.enable(a); assert.equal(first.status, 201); assert.equal((await first.json()).device.nmsDeviceId, 2147483647);
    assert.equal((await f.enable(b)).status, 500); assert.equal((await prisma.device.findUnique({ where: { id: b.id } })).nmsDeviceId, null);
  });
  console.log(`NMS device ID PostgreSQL regressions passed (${checks} scenarios; actual routes, locks, constraints and rollback; source probes mocked).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
