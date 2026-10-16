// Exercise the real read-only dashboard routes with isolated data dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname, '..');
let authorized = true;
let queryCount = 0;
let resourceQuery;
const now = Date.now();
const devices = [
  { id: 'fixture-a', name: 'Switch A', type: 'SWITCH', status: 'UNKNOWN', nmsDeviceId: 101, managementIp: '192.0.2.1', pollingEnabled: true, lastPolledAt: new Date(now - 1000) },
  { id: 'fixture-b', name: 'Switch B', type: 'SWITCH', status: 'UNKNOWN', nmsDeviceId: 102, managementIp: '192.0.2.2', pollingEnabled: true, lastPolledAt: new Date(now - 7200000) },
  { id: 'fixture-c', name: 'Switch C', type: 'SWITCH', status: 'UNKNOWN', nmsDeviceId: 103, managementIp: '192.0.2.3', pollingEnabled: true, lastPolledAt: null },
  { id: 'fixture-d', name: 'Switch D', type: 'SWITCH', status: 'UNKNOWN', nmsDeviceId: 104, managementIp: '192.0.2.4', pollingEnabled: false, lastPolledAt: null },
];
function matches(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return expected.some(item => matches(row, item));
    if (key === 'AND') return expected.every(item => matches(row, item));
    if (expected && typeof expected === 'object') return Object.entries(expected).every(([op, value]) =>
      op === 'not' ? row[key] !== value : op === 'in' ? value.includes(row[key]) : op === 'gte' ? row[key] !== null && row[key] >= value : op === 'lt' ? row[key] !== null && row[key] < value : op === 'contains' ? String(row[key]).toLowerCase().includes(value.toLowerCase()) : op === 'mode');
    return row[key] === expected;
  });
}
const select = (row, fields) => fields ? Object.fromEntries(Object.keys(fields).map(key => [key, row[key]])) : row;
const incident = { id: 'incident-a', severity: 'ALARM_HIGH', title: 'Memory High on Switch A: 85.3%', status: 'OPEN', source: 'NMS', entityType: 'nms-device', entityId: '101', lastSeenAt: new Date(), occurrenceCount: 2, alarm: { code: 'NMS_MEMORY_HIGH', name: 'Memory high' }, occurrences: [{ rawData: { memory_usage: 85.3 } }] };
const prisma = {
  device: {
    count: async ({ where } = {}) => devices.filter(row => matches(row, where)).length,
    findMany: async ({ where, select: fields } = {}) => devices.filter(row => matches(row, where)).map(row => select(row, fields)),
    findFirst: async ({ where, select: fields } = {}) => { const row = devices.filter(item => matches(item, where)).sort((a,b) => (b.lastPolledAt || 0) - (a.lastPolledAt || 0))[0]; return row ? select(row, fields) : null; },
    findUnique: async ({ where, select: fields }) => { queryCount++; const row = devices.find(item => matches(item, where)); return row ? select(row, fields) : null; },
  },
  nmsHealthMetric: { findFirst: async ({ select: fields }) => select({ cpuUsage: 0, memoryUsage: 85.3, collectedAt: new Date() }, fields) },
  $queryRaw: async (strings, ...values) => { resourceQuery = { sql: strings.join('?'), values }; return [{ bucket: 0, cpu: 0, memory: 85.3, cpuPeak: 1, memoryPeak: 85.3, samples: 2 }]; },
  alarmIncident: { findFirst: async () => ({ entityId: '101' }), findMany: async () => [incident], groupBy: async () => [{ severity: 'ALARM_HIGH', _count: { id: 1 } }] },
  integrationConfig: { findMany: async () => [] }, firewallPolicy: { count: async () => 0 },
  vMwareCluster: { count: async () => 0 },
  vMwareDatastore: { count: async () => 0, aggregate: async () => ({ _sum: { capacity: null, freeSpace: null } }), findMany: async () => [] },
  vmSnapshot: { findMany: async () => [] },
};
const overrides = { '@/lib/prisma': { prisma }, '@/lib/auth/request-actor': { getRequestActor: async () => authorized ? { role: 'VIEWER', actor: { id: 'fixture-user' } } : null } };
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const localRequire = name => overrides[name] || (name.startsWith('@/') ? load(name.slice(2) + '.ts') : require(name));
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}
const request = query => new NextRequest(`http://localhost/api/dashboard/analytics${query}`);
async function main() {
  const helpers = load('lib/dashboard/resources.ts');
  const window = helpers.resourceWindow('24h', new Date('2026-10-15T08:00:00Z'));
  assert.equal(window.count, 24); assert.equal(window.seconds, 3600);
  const points = helpers.fillResourceBuckets(window.start, window.seconds, window.count, [{ bucket: 2, cpu: 0, memory: 85.3, cpuPeak: 0, memoryPeak: 86, samples: 1 }]);
  assert.equal(points[0].cpu, null); assert.equal(points[2].cpu, 0); assert.equal(points[3].memory, null);
  assert.equal(points.filter(point => point.samples > 0).length, 1);
  for (const value of [NaN, Infinity, -1, 101, null, '12']) assert.equal(helpers.percentage(value), null);
  const analytics = load('app/api/dashboard/analytics/route.ts');
  const search = load('app/api/dashboard/search/route.ts');
  authorized = false;
  assert.equal((await analytics.GET(request(''))).status, 401);
  assert.equal((await search.GET(request('?q=Switch'))).status, 401);
  authorized = true;
  for (const range of ['bad', '__proto__', "24h';DROP TABLE devices;"]) assert.equal((await analytics.GET(request('?range=' + encodeURIComponent(range)))).status, 400);
  assert.equal((await analytics.GET(request('?deviceId='))).status, 400);
  assert.equal((await analytics.GET(request('?deviceId=missing'))).status, 404);
  const result = await analytics.GET(request('?deviceId=fixture-a&range=6h'));
  assert.equal(result.status, 200); assert.match(result.headers.get('cache-control'), /no-store/);
  const body = await result.json(); assert.equal(body.range, '6h'); assert.equal(body.device.id, 'fixture-a');
  assert.equal(body.points.length, 24); assert.equal(body.points[0].cpu, 0); assert.equal(body.points[1].cpu, null); assert.equal(body.latest.cpu.value, 0);
  assert.match(resourceQuery.sql, /collected_at >=/); assert.match(resourceQuery.sql, /collected_at </);
  assert(resourceQuery.values.includes(101)); assert.equal(resourceQuery.values.filter(value => value instanceof Date).length, 3);
  assert.doesNotMatch(JSON.stringify(body), /sshPassword|snmpCommunity|NEXTAUTH|INTEGRATION_CREDENTIALS/);
  const defaultBody = await (await analytics.GET(request(''))).json(); assert.equal(defaultBody.device.id, 'fixture-a');
  assert.equal((await search.GET(request('?q=a'))).status, 400);
  assert.equal((await search.GET(request('?q=' + 'a'.repeat(101)))).status, 400);
  const searchResult = await (await search.GET(request('?q=Switch'))).json(); assert.equal(searchResult.devices.length, 4);
  const summary = await (await load('app/api/dashboard/summary/route.ts').GET()).json();
  assert.deepEqual(summary.coverage, { total: 4, monitored: 3, fresh: 1, unknown: 1, stale: 1, unmonitored: 1 });
  assert.equal(summary.metrics.nms.healthy, 1, 'Fresh UNKNOWN inventory devices must count as receiving data');
  assert.equal(summary.operations.network.offlineDevices.length, 2, 'UNKNOWN inventory status alone must not create a polling failure');
  assert.equal(summary.incidents.items[0].deviceName, 'Switch A'); assert.equal(summary.incidents.items[0].value, 85.3);
  const originalConfigs = prisma.integrationConfig.findMany;
  for (const [syncStatus, expectedState] of [['success', 'healthy'], ['partial', 'stale'], ['failed', 'error']]) {
    prisma.integrationConfig.findMany = async () => [{ id: 'fixture-vc', type: 'VMWARE_VCENTER', enabled: true,
      config: { host: 'fixture.invalid' }, lastSyncAt: new Date(), lastSyncStatus: syncStatus, syncInterval: 5 }];
    const body = await (await load('app/api/dashboard/summary/route.ts').GET()).json();
    const source = body.integrations.find(i => i.key === 'VMWARE_VCENTER');
    assert.equal(source.state, expectedState);
    if (syncStatus === 'partial') assert.match(source.message, /kısmen/);
    if (syncStatus === 'failed') assert.match(source.message, /başarısız/);
  }
  prisma.integrationConfig.findMany = originalConfigs;
  assert(queryCount > 0);
  const savedDevices = devices.splice(0);
  prisma.alarmIncident.findFirst = async () => null;
  const empty = await (await analytics.GET(request(''))).json();
  assert.equal(empty.device, null); assert.deepEqual(empty.points, []); assert.deepEqual(empty.latest, { cpu: null, memory: null });
  devices.push(...savedDevices);
  const savedQuery = prisma.$queryRaw;
  const savedConsoleError = console.error;
  console.error = () => {};
  try {
    prisma.$queryRaw = async () => { throw new Error('Fixture database unavailable'); };
    assert.equal((await analytics.GET(request('?deviceId=fixture-a'))).status, 503);
    prisma.device.findMany = async () => { throw new Error('Fixture search unavailable'); };
    assert.equal((await search.GET(request('?q=Switch'))).status, 503);
  } finally { prisma.$queryRaw = savedQuery; console.error = savedConsoleError; }
  console.log('Dashboard checks passed: authenticated reads, parameter validation, bounded resource queries, real zero/null semantics, coverage and exact incident mapping.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
