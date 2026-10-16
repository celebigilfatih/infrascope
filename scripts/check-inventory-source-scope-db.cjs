// Actual forward migration, Prisma constraints and importers. Disposable PostgreSQL only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_SCOPE_DB_TEST !== '1' || url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1'
  || !/^\/[a-z0-9_]+_occurrence_tests$/.test(url.pathname)) throw new Error('Explicit opt-in and local disposable *_occurrence_tests database required');
const { PrismaClient } = require('@prisma/client');
const { sourceFixture, normalizationVectors } = require('./check-inventory-source-scope.cjs');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
const source = sourceFixture(prisma);
const ownedScopes = ['VMWARE_VCENTER', 'ZABBIX'].flatMap(type => [
  source.scope(type, 'fixture-a', type === 'VMWARE_VCENTER' ? 'a.invalid' : 'https://a.invalid/zabbix'),
  source.scope(type, 'fixture-b', type === 'VMWARE_VCENTER' ? 'b.invalid' : 'https://b.invalid/zabbix'),
  source.scope(type, 'fixture-a', type === 'VMWARE_VCENTER' ? 'changed.invalid' : 'https://changed.invalid'),
]);
let checks = 0;
function execute(sql) {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'execute', '--url', url.href, '--stdin'],
    { input: sql, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, DATABASE_URL: url.href } });
}
function migration(schema, records) {
  const ddl = `CREATE SCHEMA "${schema}"; SET search_path TO "${schema}";
    CREATE TABLE integration_configs (id TEXT PRIMARY KEY, type TEXT, config JSONB, enabled BOOLEAN);
    CREATE TABLE devices (id TEXT PRIMARY KEY, "vmwareMoref" TEXT, "zabbixHostId" TEXT, "vmHostId" TEXT, "vmwareClusterId" TEXT);
    CREATE TABLE vmware_clusters (id TEXT PRIMARY KEY, "vcenterId" TEXT);
    CREATE TABLE vmware_datastores (id TEXT PRIMARY KEY, "vcenterId" TEXT, "clusterId" TEXT REFERENCES vmware_clusters(id));
    CREATE TABLE zabbix_triggers (id TEXT PRIMARY KEY, "triggerId" TEXT, "hostId" TEXT);
    CREATE TABLE capacity_metrics (id TEXT PRIMARY KEY, "resourceType" TEXT, "resourceId" TEXT, "metricType" TEXT, timestamp TIMESTAMP);
    CREATE TABLE network_interfaces (id TEXT PRIMARY KEY, "deviceId" TEXT REFERENCES devices(id));
    ${records}`;
  const sql = fs.readFileSync(path.resolve('prisma/migrations/20261016140000_inventory_source_scope/migration.sql'), 'utf8');
  execute(ddl + '\n' + sql);
}
async function scenario(name, run) { await run(); checks++; console.log('PASS PostgreSQL ' + name); }
async function migrationChecks() {
  await scenario('sole saved connection backfills scopes without changing IDs or associations', async () => {
    migration('b16_single', `
      INSERT INTO integration_configs VALUES ('fixture-vc','VMWARE_VCENTER','{"host":"HTTPS://VC.FIXTURE.INVALID:443///"}',false),
        ('fixture-z','ZABBIX','{"url":"HTTPS://Z.FIXTURE.INVALID:443/zabbix/api_jsonrpc.php///"}',true);
      INSERT INTO vmware_clusters VALUES ('old-cluster','domain-c1');
      INSERT INTO devices VALUES ('old-host','host-1',null,null,'old-cluster'), ('old-vm','vm-1',null,'old-host',null),
        ('old-z',null,'101',null,null), ('duplicate-a','duplicate',null,null,null), ('duplicate-b','duplicate',null,null,null);
      INSERT INTO vmware_datastores VALUES ('datastore-1','datastore-1','old-cluster');
      INSERT INTO network_interfaces VALUES ('old-interface','old-z');
      INSERT INTO zabbix_triggers VALUES ('201','201','101');
      INSERT INTO capacity_metrics VALUES ('old-metric','host','host-1','cpu',now());`);
    const vc = source.scope('VMWARE_VCENTER', 'fixture-vc', 'vc.fixture.invalid');
    const z = source.scope('ZABBIX', 'fixture-z', 'https://z.fixture.invalid/zabbix');
    const devices = await prisma.$queryRawUnsafe('SELECT * FROM b16_single.devices ORDER BY id');
    assert.equal(devices.find(r => r.id === 'old-vm').vmHostId, 'old-host');
    assert.equal(devices.find(r => r.id === 'old-host').vmwareClusterId, 'old-cluster');
    assert.equal(devices.find(r => r.id === 'old-host').vmwareSourceScope, vc);
    assert.equal(devices.find(r => r.id === 'old-z').zabbixSourceScope, z);
    assert.ok(devices.filter(r => r.id.startsWith('duplicate')).every(r => r.vmwareSourceScope === null));
    const [datastore] = await prisma.$queryRawUnsafe('SELECT * FROM b16_single.vmware_datastores');
    assert.equal(datastore.id, 'datastore-1'); assert.equal(datastore.clusterId, 'old-cluster'); assert.equal(datastore.sourceScope, vc);
    const [iface] = await prisma.$queryRawUnsafe('SELECT * FROM b16_single.network_interfaces'); assert.equal(iface.deviceId, 'old-z');
    const [trigger] = await prisma.$queryRawUnsafe('SELECT * FROM b16_single.zabbix_triggers'); assert.equal(trigger.id, '201'); assert.equal(trigger.sourceScope, z);
    const [metric] = await prisma.$queryRawUnsafe('SELECT * FROM b16_single.capacity_metrics'); assert.equal(metric.sourceScope, vc);
  });
  await scenario('ambiguous enabled/disabled configurations never claim legacy rows', async () => {
    migration('b16_ambiguous', `
      INSERT INTO integration_configs VALUES ('fixture-a','VMWARE_VCENTER','{"host":"a.invalid"}',true),
        ('fixture-b','VMWARE_VCENTER','{"host":"b.invalid"}',false),
        ('fixture-z-a','ZABBIX','{"url":"https://a.invalid"}',true), ('fixture-z-b','ZABBIX','{"url":"https://b.invalid"}',false);
      INSERT INTO devices VALUES ('old-host','host-1',null,null,null),('old-z',null,'101',null,null);
      INSERT INTO vmware_clusters VALUES ('old-cluster','domain-c1');
      INSERT INTO vmware_datastores VALUES ('old-ds','datastore-1','old-cluster');
      INSERT INTO zabbix_triggers VALUES ('201','201','101');`);
    for (const table of ['devices', 'vmware_clusters', 'vmware_datastores', 'zabbix_triggers']) {
      const rows = await prisma.$queryRawUnsafe(`SELECT * FROM b16_ambiguous.${table}`);
      assert.ok(rows.every(r => table === 'devices' ? !r.vmwareSourceScope && !r.zabbixSourceScope : !r.sourceScope));
    }
  });
  await scenario('missing configurations preserve legacy records as unassigned', async () => {
    migration('b16_missing', `INSERT INTO devices VALUES ('old-host','host-1',null,null,null);`);
    const [row] = await prisma.$queryRawUnsafe('SELECT * FROM b16_missing.devices');
    assert.equal(row.id, 'old-host'); assert.equal(row.vmwareSourceScope, null);
  });
  await scenario('SQL and application normalization agree for all regression vectors', async () => {
    // The production migration uses this same temporary function body, without persisting a helper in public.
    const sql = fs.readFileSync('prisma/migrations/20261016140000_inventory_source_scope/migration.sql', 'utf8');
    const definition = sql.match(/CREATE FUNCTION pg_temp\.inventory_source_scope[\s\S]*?END \$\$;/)[0]
      .replace('pg_temp.inventory_source_scope', 'b16_single.test_scope');
    execute(definition);
    for (const [type, a, b] of normalizationVectors) for (const endpoint of [a, b]) {
      const [row] = await prisma.$queryRaw`SELECT b16_single.test_scope(${type}::text, 'fixture-a', ${endpoint}::text) AS scope`;
      assert.equal(row.scope, source.scope(type, 'fixture-a', endpoint));
    }
  });
}
async function inventoryChecks() {
  await prisma.organization.create({ data: { id: 'scope-fixture-org', name: 'Scope Fixture', code: 'SCOPE_FIXTURE' } });
  for (const type of ['VMWARE_VCENTER', 'ZABBIX']) {
    const vmware = type === 'VMWARE_VCENTER', field = vmware ? 'vmwareSourceScope' : 'zabbixSourceScope';
    const a = source.service(type, 'fixture-a', vmware ? 'a.invalid' : 'https://a.invalid/zabbix');
    const b = source.service(type, 'fixture-b', vmware ? 'b.invalid' : 'https://b.invalid/zabbix');
    await scenario(type + ': concurrent imports isolate equal remote IDs and relationships', async () => {
      const results = await Promise.all([a.instance.syncToInventory('scope-fixture-org'), b.instance.syncToInventory('scope-fixture-org')]);
      assert.ok(results.every(r => r.success), JSON.stringify(results));
      const devices = await prisma.device.findMany({ where: { [field]: { in: [a.scope(), b.scope()] } } }); assert.equal(devices.length, 4);
      if (vmware) {
        for (const vm of devices.filter(r => r.vmwareMoref === 'vm-1')) {
          const host = devices.find(r => r.id === vm.vmHostId);
          assert.equal(host[field], vm[field]); assert.equal(vm.vmwareClusterId, host.vmwareClusterId);
        }
        for (const host of devices.filter(r => r.vmwareMoref === 'host-1')) assert.equal((await prisma.vMwareCluster.findUnique({ where: { id: host.vmwareClusterId } })).sourceScope, host[field]);
        assert.equal(await prisma.vMwareDatastore.count(), 2);
      } else {
        assert.equal(await prisma.networkInterface.count(), 4); assert.equal(await prisma.zabbixTrigger.count(), 4);
        for (const trigger of await prisma.zabbixTrigger.findMany()) assert.ok(devices.some(d => d[field] === trigger.sourceScope && d.zabbixHostId === trigger.hostId));
      }
    });
    await scenario(type + ': retry updates only its own rows and keeps database IDs', async () => {
      const before = await prisma.device.findMany({ where: { [field]: b.scope() }, orderBy: { id: 'asc' } });
      const ownIds = (await prisma.device.findMany({ where: { [field]: a.scope() }, orderBy: { id: 'asc' } })).map(r => r.id);
      assert.equal((await a.instance.syncToInventory('scope-fixture-org')).success, true);
      assert.deepEqual(await prisma.device.findMany({ where: { [field]: b.scope() }, orderBy: { id: 'asc' } }), before);
      assert.deepEqual((await prisma.device.findMany({ where: { [field]: a.scope() }, orderBy: { id: 'asc' } })).map(r => r.id), ownIds);
    });
    await scenario(type + ': retarget preserves prior inventory and returning resumes original rows', async () => {
      const changed = source.service(type, 'fixture-a', vmware ? 'changed.invalid' : 'https://changed.invalid');
      const old = await prisma.device.findMany({ where: { [field]: a.scope() }, orderBy: { id: 'asc' } });
      assert.equal((await changed.instance.syncToInventory('scope-fixture-org')).success, true);
      assert.deepEqual(await prisma.device.findMany({ where: { [field]: a.scope() }, orderBy: { id: 'asc' } }), old);
      assert.equal((await a.instance.syncToInventory('scope-fixture-org')).success, true);
      assert.equal(await prisma.device.count({ where: { [field]: a.scope() } }), 2);
    });
    await scenario(type + ': database enforces source uniqueness without global remote-ID uniqueness', async () => {
      const row = await prisma.device.findFirst({ where: { [field]: a.scope() } });
      await assert.rejects(prisma.device.create({ data: { name: 'duplicate', type: row.type, [field]: row[field],
        ...(vmware ? { vmwareMoref: row.vmwareMoref } : { zabbixHostId: row.zabbixHostId }) } }), e => e.code === 'P2002');
      if (vmware) {
        const cluster = await prisma.vMwareCluster.findFirst();
        await assert.rejects(prisma.vMwareCluster.create({ data: { organizationId: 'scope-fixture-org', sourceScope: cluster.sourceScope,
          vcenterId: cluster.vcenterId, name: 'duplicate', datacenterName: 'fixture' } }), e => e.code === 'P2002');
        const ds = await prisma.vMwareDatastore.findFirst();
        await assert.rejects(prisma.vMwareDatastore.create({ data: { organizationId: 'scope-fixture-org', sourceScope: ds.sourceScope,
          vcenterId: ds.vcenterId, name: 'duplicate' } }), e => e.code === 'P2002');
      } else {
        const trigger = await prisma.zabbixTrigger.findFirst();
        await assert.rejects(prisma.zabbixTrigger.create({ data: { sourceScope: trigger.sourceScope, triggerId: trigger.triggerId,
          hostId: trigger.hostId, description: 'duplicate', status: 'OK' } }), e => e.code === 'P2002');
      }
    });
  }
  const Engine = source.load('lib/topology/relationship-engine.ts').TopologyRelationshipEngine;
  const engine = new Engine(prisma);
  await scenario('normal imports never claim unresolved legacy devices, datastore primary keys or triggers', async () => {
    await prisma.vMwareCluster.create({ data: { id: 'scope-fixture-legacy-cluster', organizationId: 'scope-fixture-org', vcenterId: 'domain-c1', name: 'legacy', datacenterName: 'legacy' } });
    const host = await prisma.device.create({ data: { id: 'scope-fixture-legacy-host', name: 'legacy-host', type: 'VIRTUAL_HOST',
      vmwareMoref: 'host-1', zabbixHostId: '101', vmwareClusterId: 'scope-fixture-legacy-cluster' } });
    await prisma.device.create({ data: { id: 'scope-fixture-legacy-vm', name: 'legacy-vm', type: 'VIRTUAL_MACHINE', vmwareMoref: 'vm-1', vmHostId: host.id } });
    const ds = await prisma.vMwareDatastore.create({ data: { id: 'datastore-1', organizationId: 'scope-fixture-org', vcenterId: 'datastore-1',
      name: 'legacy-datastore', clusterId: 'scope-fixture-legacy-cluster' } });
    const trigger = await prisma.zabbixTrigger.create({ data: { id: '201', triggerId: '201', hostId: '101', description: 'legacy-trigger', status: 'OK' } });
    const vmware = source.service('VMWARE_VCENTER', 'fixture-a', 'a.invalid');
    const zabbix = source.service('ZABBIX', 'fixture-a', 'https://a.invalid/zabbix');
    assert.equal((await vmware.instance.syncToInventory('scope-fixture-org')).success, true);
    assert.equal((await zabbix.instance.syncToInventory('scope-fixture-org')).success, true);
    assert.deepEqual(await prisma.device.findUnique({ where: { id: host.id } }), host);
    assert.deepEqual(await prisma.vMwareDatastore.findUnique({ where: { id: ds.id } }), ds);
    assert.deepEqual(await prisma.zabbixTrigger.findUnique({ where: { id: trigger.id } }), trigger);
    assert.equal((await prisma.device.findUnique({ where: { id: 'scope-fixture-legacy-vm' } })).vmHostId, host.id);
  });
  await scenario('topology rejects a cross-source VM/host pointer', async () => {
    const vms = await prisma.device.findMany({ where: { vmwareMoref: 'vm-1', vmwareSourceScope: { in: ownedScopes } }, orderBy: { id: 'asc' } });
    const foreignHost = await prisma.device.findFirst({ where: { vmwareMoref: 'host-1', vmwareSourceScope: { not: vms[0].vmwareSourceScope } } });
    await prisma.device.update({ where: { id: vms[0].id }, data: { vmHostId: foreignHost.id } });
    const result = await engine.correlateVmHostRelationships(); assert.equal(result.errors.length, 0);
    assert.equal(await prisma.relationship.count({ where: { targetDeviceId: vms[0].id, relationshipType: 'VIRTUAL_RUNS_ON' } }), 0);
    for (const rel of await prisma.relationship.findMany({ where: { relationshipType: 'VIRTUAL_RUNS_ON' } })) {
      const parent = await prisma.device.findUnique({ where: { id: rel.sourceDeviceId } });
      const child = await prisma.device.findUnique({ where: { id: rel.targetDeviceId } });
      assert.equal(parent.vmwareSourceScope, child.vmwareSourceScope);
    }
  });
  await scenario('topology cluster representatives match source and external ID together', async () => {
    for (const cluster of await prisma.vMwareCluster.findMany({ where: { sourceScope: { in: ownedScopes } } })) await prisma.device.create({ data: {
      name: 'fixture-cluster-representative', type: 'OTHER', vmwareMoref: cluster.vcenterId, vmwareSourceScope: cluster.sourceScope,
    } });
    const result = await engine.correlateClusterHostRelationships(); assert.equal(result.errors.length, 0);
    assert.equal(result.relationshipsCreated, 3);
    for (const rel of await prisma.relationship.findMany({ where: { relationshipType: 'CLUSTER_CONTAINS' } })) {
      const parent = await prisma.device.findUnique({ where: { id: rel.sourceDeviceId } });
      const child = await prisma.device.findUnique({ where: { id: rel.targetDeviceId } });
      assert.equal(parent.vmwareSourceScope, child.vmwareSourceScope);
    }
  });
  await scenario('VMware native event IDs, incidents, notifications and cooldown stay within their source', async () => {
    const mail = [], quiet = new Proxy({}, { get: () => () => {} });
    const load = moduleLoader({ '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => quiet },
      '@/lib/integrations/fortianalyzer': {}, '@/lib/integrations/vmware': {}, '@/lib/integrations/fortigate': {},
      '@/lib/firewall/connector-factory': {}, '@/lib/alarms/queries': { ALARM_QUERY_REGISTRY: new Map(), BYPASS_CACHE_ALARMS: new Set() },
      '@/lib/alarms/suppression-engine': { createDefaultSuppressionEngine: () => ({}) },
      '@/lib/notifications/email': { sendAlarmEmail: async data => { mail.push(data); return true; }, getEmailStats: () => ({}) },
    }, { console: quiet });
    const Engine = load('lib/alarms/detection-engine.ts').AlarmDetectionEngine;
    const rule = await prisma.alarmDefinition.create({ data: { code: 'B16_VM_SCOPE_FIXTURE', name: 'Fixture', source: 'vmware', category: 'OPERATIONAL',
      severity: 'ALARM_HIGH', cooldownMinutes: 5, notifyEmail: true,
      detectionLogic: { logtype: 'vmware', filter: 'datastoreFreePercent < 10', threshold: 1, timeWindowMinutes: 5, description: 'Fixture' } } });
    const ruleIds = [rule.id];
    const a = new Engine(null), b = new Engine(null), aScope = ownedScopes[0], bScope = ownedScopes[1];
    let reads = 0;
    a.vmwareInventoryScope = aScope; b.vmwareInventoryScope = bScope;
    a.vmwareService = b.vmwareService = { fetchDatastores: async () => { reads++; return []; } };
    const log = scope => ({ type: 'vm', vmId: 'vm-1', vmName: 'same-name', id: 'same-native-event', inventorySourceScope: scope });
    try {
      await a.fireAlarm(rule, [log(aScope)]);
      assert.equal((await a.evaluateVMwareAlarm(rule)).error, 'cooldown-active'); assert.equal(reads, 0);
      assert.equal((await b.evaluateVMwareAlarm(rule)).error, undefined); assert.equal(reads, 1);
      await b.fireAlarm(rule, [log(bScope)]); await b.fireAlarm(rule, [log(bScope)]);
      assert.equal(await prisma.alarmEvent.count({ where: { alarmId: rule.id } }), 2);
      assert.equal(await prisma.alarmIncident.count({ where: { alarmId: rule.id } }), 2); assert.equal(mail.length, 2);
      const evaluated = await prisma.alarmDefinition.create({ data: { code: 'B16_VM_EVALUATED_FIXTURE', name: 'Fixture', source: null, category: 'OPERATIONAL',
        severity: 'ALARM_HIGH', cooldownMinutes: 5, notifyEmail: true, detectionLogic: rule.detectionLogic } });
      ruleIds.push(evaluated.id);
      a.vmwareService.fetchDatastores = async () => [{ datastore: { value: 'datastore-1' }, name: 'same-name', summary: { capacity: 100, freeSpace: 0 } }];
      assert.equal((await a.evaluateVMwareAlarm(evaluated)).triggered, true);
      assert.equal((await b.evaluateVMwareAlarm(evaluated)).triggered, true);
      const events = await prisma.alarmEvent.findMany({ where: { alarmId: evaluated.id } });
      assert.equal(events.length, 2); assert.deepEqual(new Set(events.map(e => e.rawData[0].inventorySourceScope)), new Set([aScope, bScope]));
      assert.equal(await prisma.alarmIncident.count({ where: { alarmId: evaluated.id } }), 2); assert.equal(mail.length, 4);
    } finally {
      const ids = (await prisma.alarmIncident.findMany({ where: { alarmId: { in: ruleIds } } })).map(r => r.id);
      await prisma.alarmEvent.deleteMany({ where: { alarmId: { in: ruleIds } } }); await prisma.alarmIncident.deleteMany({ where: { alarmId: { in: ruleIds } } });
      await prisma.auditLog.deleteMany({ where: { entity: 'AlarmIncident', entityId: { in: ids } } });
      await prisma.alarmDefinition.deleteMany({ where: { id: { in: ruleIds } } });
    }
  });
}
async function main() {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url.href }, stdio: 'pipe' });
  try { await migrationChecks(); await inventoryChecks(); console.log(`Inventory source PostgreSQL regressions passed (${checks} scenarios; synthetic source only).`); }
  finally {
    // Remove only this suite's fixture schemas and owned inventory, never other suites' rows.
    for (const schema of ['b16_single', 'b16_ambiguous', 'b16_missing']) await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    const deviceWhere = { OR: [{ vmwareSourceScope: { in: ownedScopes } }, { zabbixSourceScope: { in: ownedScopes } },
      { id: { in: ['scope-fixture-legacy-host', 'scope-fixture-legacy-vm'] } }] };
    const ids = (await prisma.device.findMany({ where: deviceWhere, select: { id: true } })).map(r => r.id);
    await prisma.relationship.deleteMany({ where: { OR: [{ sourceDeviceId: { in: ids } }, { targetDeviceId: { in: ids } }] } });
    await prisma.networkInterface.deleteMany({ where: { deviceId: { in: ids } } }); await prisma.device.deleteMany({ where: deviceWhere });
    await prisma.zabbixTrigger.deleteMany({ where: { OR: [{ sourceScope: { in: ownedScopes } }, { id: '201', sourceScope: null }] } });
    await prisma.capacityMetric.deleteMany({ where: { sourceScope: { in: ownedScopes } } });
    await prisma.vMwareDatastore.deleteMany({ where: { OR: [{ sourceScope: { in: ownedScopes } }, { id: 'datastore-1', sourceScope: null }] } });
    await prisma.vMwareCluster.deleteMany({ where: { OR: [{ sourceScope: { in: ownedScopes } }, { id: 'scope-fixture-legacy-cluster' }] } });
    await prisma.organization.deleteMany({ where: { id: 'scope-fixture-org' } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
