// Opt-in real PostgreSQL source-to-inventory tests. No direct device or notification access.
const assert = require('node:assert/strict');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_FG_SNMP_DB_TEST !== '1' || url.protocol !== 'postgresql:'
  || url.hostname !== '127.0.0.1' || !/^\/[a-z0-9_]+_occurrence_tests$/.test(url.pathname)) {
  throw new Error('An explicit opt-in and a local disposable *_occurrence_tests database are required');
}
const { PrismaClient } = require('@prisma/client');
const { fixture } = require('./check-fortigate-snmp.cjs');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
async function check(name, action) {
  const f = fixture({ database: prisma });
  const deviceIds = f.state.devices.map(d => d.id), configIds = f.state.configs.map(c => c.id);
  try {
    for (const device of f.state.devices) await prisma.device.create({ data: { ...device, name: device.id, type: 'FIREWALL' } });
    for (const integration of f.state.configs) await prisma.integrationConfig.create({ data: integration });
    for (const connector of f.state.links) await prisma.firewallConnector.create({ data: connector });
    await prisma.nmsInterface.createMany({ data: f.state.rows });
    await action(f);
    console.log(`PASS PostgreSQL: ${name}`);
  } finally {
    await prisma.integrationSyncLog.deleteMany({ where: { configId: { in: configIds } } });
    await prisma.firewallConnector.deleteMany({ where: { integrationConfigId: { in: configIds } } });
    await prisma.integrationConfig.deleteMany({ where: { id: { in: configIds } } });
    await prisma.device.deleteMany({ where: { id: { in: deviceIds } } });
  }
}
async function main() {
  await check('values come from actual NMS rows, including later changes and exact counters', async f => {
    let data = await f.read(); assert.equal(data.length, 2); assert.equal(data[0].mtu, 9000);
    assert.equal(data[0].observation.inOctets, '9007199254740995');
    await prisma.nmsInterface.update({ where: { id: 'metric-100-1' }, data: { speed: 10000000000n, operStatus: 'down', mtu: 1600 } });
    data = await f.read(); assert.equal(data[0].speed, 10000000000); assert.equal(data[0].status, 'down'); assert.equal(data[0].mtu, 1600);
  });
  await check('target-scoped sync persists observed interface states without inventing IP/type', async f => {
    const result = await f.sync(); assert.equal(result.success, true); assert.equal(result.interfacesProcessed, 2);
    assert.equal(result.interfaceSource.source, 'nms');
    const rows = await prisma.networkInterface.findMany({ where: { deviceId: 'device-a' }, orderBy: { name: 'asc' } });
    assert.deepEqual(rows.map(r => r.status), ['UP', 'DOWN']); assert.ok(rows.every(r => r.ipv4 === null && r.type === 'OTHER'));
  });
  await check('another target with the same port name keeps its own device and observations', async f => {
    await prisma.nmsInterface.update({ where: { id: 'metric-101-1' }, data: { interfaceName: 'observed-port-1', operStatus: 'down' } });
    await f.sync(); await f.sync('config-b');
    const rows = await prisma.networkInterface.findMany({ where: { name: 'observed-port-1' } });
    assert.equal(rows.length, 2);
    assert.equal(rows.find(r => r.deviceId === 'device-a').status, 'UP');
    assert.equal(rows.find(r => r.deviceId === 'device-b').status, 'DOWN');
  });
  await check('one stale row cannot create a successful partial inventory or erase existing source fields', async f => {
    await prisma.networkInterface.create({ data: { name: 'observed-port-1', deviceId: 'device-a', type: 'FIBER', ipv4: '192.0.2.8/24', status: 'UP' } });
    await prisma.nmsInterface.update({ where: { id: 'metric-100-2' }, data: { lastPolledAt: new Date(f.state.now - 600000) } });
    const result = await f.sync(); assert.equal(result.success, false);
    const rows = await prisma.networkInterface.findMany({ where: { deviceId: 'device-a' } });
    assert.equal(rows.length, 1); assert.equal(rows[0].ipv4, '192.0.2.8/24'); assert.equal(rows[0].type, 'FIBER');
  });
  await check('duplicate interface names reject before an upsert can merge distinct indices', async f => {
    await prisma.nmsInterface.update({ where: { id: 'metric-100-2' }, data: { interfaceName: 'observed-port-1' } });
    const result = await f.sync(); assert.equal(result.success, false);
    assert.equal(await prisma.networkInterface.count({ where: { deviceId: 'device-a' } }), 0);
  });
  await check('a full snapshot is read beyond the ordinary UI page size', async f => {
    const base = f.state.rows[0];
    await prisma.nmsInterface.createMany({ data: Array.from({ length: 200 }, (_, i) => ({ ...base,
      id: `metric-extra-${i}`, interfaceIndex: i + 3, interfaceName: `extra-${i}`,
    })) });
    const result = await f.sync(); assert.equal(result.success, true); assert.equal(result.interfacesProcessed, 202);
    assert.equal(await prisma.networkInterface.count({ where: { deviceId: 'device-a' } }), 202);
  });
  console.log('PostgreSQL FortiGate SNMP regressions passed (6 scenarios; real NMS reads, target relations and inventory persistence).');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
