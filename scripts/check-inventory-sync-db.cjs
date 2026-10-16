// Opt-in real metadata transactions. Source collection and inventory mutations remain synthetic.
const assert = require('node:assert/strict');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_SYNC_DB_TEST !== '1' || url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1'
  || !/^\/[a-z0-9_]+_occurrence_tests$/.test(url.pathname)) {
  throw new Error('Explicit opt-in and a local disposable *_occurrence_tests database required');
}
const { PrismaClient } = require('@prisma/client');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const { fixture } = require('./check-inventory-sync.cjs');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
let checks = 0;
async function scenario(type, name, fn) {
  const id = 'fixture-config';
  await prisma.integrationConfig.create({ data: { id, name: 'inventory-sync-fixture', type: type === 'vmware' ? 'VMWARE_VCENTER' : 'ZABBIX', config: {} } });
  try { await fn(id); checks++; console.log(`PASS PostgreSQL ${type}: ${name}`); }
  finally { await prisma.integrationConfig.delete({ where: { id } }); }
}
function recorder(database = prisma) {
  return moduleLoader({ '@/lib/prisma': { prisma: database } })('lib/integrations/sync-log.ts').recordInventorySync;
}
async function main() {
  for (const type of ['vmware', 'zabbix']) {
    for (const status of ['success', 'partial', 'failed']) await scenario(type, status, async id => {
      const f = fixture(type, 'hosts', { recordSync: recorder() });
      if (status === 'partial') f.state.failWrites.add('device:' + (type === 'vmware' ? 'host-1' : '1'));
      if (status === 'failed') f.state.auth = false;
      const response = await f.post(); assert.equal(response.status, 200); const result = await response.json();
      assert.equal(result.status, status);
      const log = await prisma.integrationSyncLog.findFirstOrThrow({ where: { configId: id } });
      const config = await prisma.integrationConfig.findUniqueOrThrow({ where: { id } });
      assert.equal(log.status, status); assert.equal(config.lastSyncStatus, status);
      assert.equal(log.completedAt.getTime(), config.lastSyncAt.getTime()); assert.ok(log.startedAt <= log.completedAt);
      assert.equal(log.itemsProcessed, result.itemsProcessed); assert.equal(log.itemsCreated, result.itemsCreated);
      assert.equal(log.itemsUpdated, result.itemsUpdated); assert.equal(log.errorDetails.errorCount, result.errorCount);
      assert.equal(log.message, result.errors.length ? result.errors.join('; ') : null);
    });
    await scenario(type, 'database update failure rolls back the already inserted sync log', async id => {
      const recordSync = recorder({ $transaction: callback => prisma.$transaction(tx => callback({
        integrationSyncLog: tx.integrationSyncLog,
        integrationConfig: { update: args => tx.integrationConfig.update({ ...args, where: { id: 'fixture-missing-config' } }) },
      })) });
      const f = fixture(type, 'hosts', { recordSync });
      assert.equal((await f.post()).status, 500);
      assert.equal(await prisma.integrationSyncLog.count({ where: { configId: id } }), 0);
      const config = await prisma.integrationConfig.findUniqueOrThrow({ where: { id } });
      assert.equal(config.lastSyncStatus, null); assert.equal(config.lastSyncAt, null);
      assert.equal(f.state.writes.length, 2);
    });
  }
  await scenario('vmware', 'cluster-only and datastore-only counters reach metadata', async id => {
    for (const module of ['clusters', 'datastores']) {
      const f = fixture('vmware', module, { recordSync: recorder() });
      assert.equal((await f.post()).status, 200);
      const log = await prisma.integrationSyncLog.findFirstOrThrow({ where: { configId: id }, orderBy: { startedAt: 'desc' } });
      assert.equal(log.itemsProcessed, 2); assert.equal(log.itemsCreated, module === 'clusters' ? 2 : 0);
      await prisma.integrationSyncLog.deleteMany({ where: { configId: id } });
    }
  });
  console.log(`Inventory sync PostgreSQL regressions passed (${checks} scenarios; real log/config transactions, synthetic inventory/source).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
