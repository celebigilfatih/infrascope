// Actual saved settings/due reads/metadata in disposable PostgreSQL, synthetic source/clock/license.
const assert = require('node:assert/strict');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_SCHEDULE_DB_TEST !== '1' || url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1'
  || !/^\/[a-z0-9_]+_occurrence_tests$/.test(url.pathname)) {
  throw new Error('Explicit opt-in and local disposable *_occurrence_tests database required');
}
const { PrismaClient } = require('@prisma/client');
const { fixture } = require('./check-inventory-scheduling.cjs');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
let checks = 0;
async function scenario(type, name, fn) {
  const f = fixture({ database: prisma }), row = f.add(type, 2); row.id = 'scheduling-fixture';
  await prisma.integrationConfig.create({ data: row });
  try { await fn(f, row); checks++; console.log('PASS PostgreSQL ' + type + ': ' + name); }
  finally { await prisma.integrationConfig.delete({ where: { id: row.id } }); }
}
async function main() {
  await prisma.organization.create({ data: { id: 'scheduling-fixture-org', code: 'SCHEDULING_FIXTURE', name: 'Scheduling Fixture' } });
  try {
    for (const type of ['VMWARE_VCENTER', 'ZABBIX', 'FORTIGATE']) await scenario(type, 'saved interval schedules the service and persists next-attempt anchor', async (f, row) => {
      f.state.now += 119999; await f.cycle(); assert.equal(f.state.calls.length, 0);
      f.state.now++; await f.cycle(); assert.equal(f.state.calls.length, 1);
      const config = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal(config.lastSyncAt.getTime(), f.state.now); assert.equal(config.lastSyncStatus, 'success');
      const log = await prisma.integrationSyncLog.findFirstOrThrow({ where: { configId: row.id } }); assert.equal(log.status, 'success');
      const restarted = fixture({ database: prisma }); restarted.state.now = f.state.now + 119999;
      await restarted.cycle(); assert.equal(restarted.state.calls.length, 0);
      restarted.state.now++; await restarted.cycle(); assert.equal(restarted.state.calls.length, 1);
    });
    for (const type of ['VMWARE_VCENTER', 'ZABBIX']) await scenario(type, 'real API interval edits govern due time and preserve encrypted credentials', async (f, row) => {
      const route = type === 'VMWARE_VCENTER' ? 'vmware' : 'zabbix';
      const secret = type === 'VMWARE_VCENTER' ? 'password' : 'authToken';
      assert.equal((await f.post(route, { action: 'save-config', name: row.name, config: { ...row.config, pollingInterval: 1 } })).status, 200);
      const config = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal(config.syncInterval, 1); assert.match(config.config[secret], /^enc:v1:/);
      f.state.now += 60000; await f.cycle(); assert.equal(f.state.calls.length, 1); assert.equal(f.state.calls[0].config[secret], row.config[secret]);
      assert.equal((await f.post(route, { action: 'save-config', name: row.name, config: { ...row.config, pollingInterval: 5, [secret]: '********' } })).status, 200);
      f.state.now += 120000; await f.cycle(); assert.equal(f.state.calls.length, 1);
      f.state.now += 180000; await f.cycle(); assert.equal(f.state.calls.length, 2);
    });
    await scenario('VMWARE_VCENTER', 'disabled/deleted rows cannot start work; failed attempt is throttled by stored completion', async (f, row) => {
      await prisma.integrationConfig.update({ where: { id: row.id }, data: { enabled: false } });
      f.state.now += 120000; await f.cycle(); assert.equal(f.state.calls.length, 0);
      await prisma.integrationConfig.update({ where: { id: row.id }, data: { enabled: true } });
      f.state.failSource = true; await f.cycle(); assert.equal(f.state.calls.length, 1);
      assert.equal((await prisma.integrationSyncLog.findFirstOrThrow({ where: { configId: row.id } })).status, 'failed');
      f.state.now += 15000; await f.cycle(); assert.equal(f.state.calls.length, 1);
      await prisma.integrationConfig.delete({ where: { id: row.id } }); f.state.now += 120000;
      await f.cycle(); assert.equal(f.state.calls.length, 1);
      // Restore only the fixture row so the shared cleanup retains one safe ownership path.
      await prisma.integrationConfig.create({ data: row });
    });
    console.log(`Inventory scheduling PostgreSQL regressions passed (${checks} scenarios; no source/network/notification I/O).`);
  } finally { await prisma.organization.delete({ where: { id: 'scheduling-fixture-org' } }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
