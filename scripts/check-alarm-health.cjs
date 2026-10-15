// Isolated runner/health regressions. No live integrations, notifications or DB writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
delete process.env.VMWARE_HOST;
const quiet = new Proxy({}, { get: () => () => {} });
let state;
const cleanResult = () => ({ alarmCode: 'NMS_BACKUP_FAILED', triggered: false, matchCount: 0, events: [] });
function reset() {
  state = { config: null, license: true, logs: [], nmsResults: [cleanResult()], faResults: [], faCalls: 0, alertChecks: 0 };
}
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object') {
      return Object.entries(value).every(([operator, bound]) =>
        operator === 'gte' ? row[key] >= bound : operator === 'gt' ? row[key] > bound : false);
    }
    return row[key] === value;
  });
}
const prisma = {
  alarmCheckLog: {
    findFirst: async ({ where }) => state.logs.filter(row => matches(row, where)).sort((a, b) => b.checkTime - a.checkTime)[0] || null,
    count: async ({ where }) => state.logs.filter(row => matches(row, where)).length,
    create: async ({ data }) => { const row = { id: String(state.logs.length + 1), ...data }; state.logs.push(row); return row; },
    update: async ({ where, data }) => Object.assign(state.logs.find(row => row.id === where.id), data),
  },
  integrationConfig: { findFirst: async ({ where }) => {
    assert.equal(where.enabled, true);
    return state.config?.enabled === true ? state.config : null;
  } },
  alarmDefinition: { count: async () => 104, findFirst: async () => ({ severity: 'ALARM_HIGH', category: 'NETWORK' }) },
  alarmEvent: { count: async () => 0 },
  device: { count: async () => 1 }, nmsHealthMetric: { count: async () => 1 },
  systemConfig: { findUnique: async () => null },
  $queryRaw: async () => [],
};
const overrides = {
  '@/lib/prisma': { prisma },
  '@/lib/logger': { createLogger: () => quiet },
  '@/lib/license/client': { initLicense: async () => {}, isLicenseValid: () => state.license },
  '@/lib/security/integration-credentials': { unprotectIntegrationConfig: value => value },
  '@/lib/integrations/fortianalyzer': {
    initSharedFortiAnalyzerService: () => ({}), getSharedFortiAnalyzerService: () => null,
    getFortiAnalyzerLoginHealth: () => { state.alertChecks++; return { consecutiveFailures: 0 }; },
  },
  '@/lib/firewall/connector-factory': { getFortiGateConnector: async () => ({ service: null }) },
  '@/lib/alarms/detection-engine': {
    getEventCacheStatus: () => null,
    AlarmDetectionEngine: class {
      async evaluateNmsAlarms() { if (state.nmsError) throw new Error(state.nmsError); return state.nmsResults; }
      async evaluateAllAlarms(options) {
        assert.equal(options.includeNms, false); state.faCalls++;
        if (state.faError) throw new Error(state.faError);
        return state.faResults;
      }
    },
  },
  '@/lib/notifications/dlq-worker': {
    getDLQStats: async () => ({ pending: 0, failedPermanent: 0 }), cleanupDLQ: async () => {},
  },
  '@/lib/notifications/email': { sendAlarmEmail: async () => { throw new Error('Unexpected notification'); } },
  '@/lib/alarm-scheduler': { getSchedulerStatus: () => ({ running: true }) },
  '@/lib/alarms/alarm-monitor': { getAlarmMonitor: () => ({ getStatus: () => ({ running: true }) }) },
};
function loader() {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const localRequire = name => {
      if (overrides[name]) return overrides[name];
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      return require(name);
    };
    vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
      console, process, Date, AbortSignal, setTimeout: () => 0,
      fetch: async () => ({ ok: true, json: async () => ({ poller_alive: true, registered_devices: 1 }) }),
    }, { filename })(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}
async function run() { return loader()('lib/alarms/alarm-runner.ts').runAlarmCheck(); }
async function health() { return (await loader()('app/api/health/route.ts').GET()).json(); }
function failures(count, ageMinutes = 20) {
  return Array.from({ length: count }, (_, index) => ({
    checkTime: new Date(Date.now() - (ageMinutes + index) * 60000), status: 'PARTIAL', errorCount: 1,
  }));
}
async function main() {
  reset();
  let result = await run();
  assert.equal(result.summary.errors, 0, 'An absent optional integration must not fail NMS checks');
  assert.equal(result.summary.total, 1);
  assert.equal(state.logs[0].status, 'SUCCESS');
  assert.equal(state.faCalls, 0); assert.equal(state.alertChecks, 0);

  reset(); state.config = { enabled: false, config: {} };
  result = await run(); assert.equal(result.summary.errors, 0); assert.equal(state.alertChecks, 0);

  reset(); state.nmsError = 'Database query failed';
  result = await run(); assert.equal(result.errors[0].code, 'NMS_SOURCE');
  assert.equal(state.logs[0].status, 'PARTIAL');

  reset(); state.config = { enabled: true, config: { host: 'fixture.invalid' } };
  result = await run(); assert.equal(result.errors[0].code, 'FORTIANALYZER_SOURCE');
  assert.equal(result.summary.total, 1); assert.equal(state.logs[0].errorCount, 1);

  reset(); state.config = { enabled: true, config: { host: 'fixture.invalid', password: 'fixture' } };
  state.faError = 'FortiAnalyzer login failed';
  result = await run(); assert.equal(result.errors[0].code, 'FORTIANALYZER_SOURCE');
  assert.equal(result.summary.total, 1); assert.equal(state.logs[0].status, 'PARTIAL');

  reset(); state.config = { enabled: true, config: { host: 'fixture.invalid', password: 'fixture' } };
  state.faResults = [{ ...cleanResult(), alarmCode: 'FA_FIXTURE' }];
  result = await run(); assert.equal(result.summary.errors, 0); assert.equal(result.summary.total, 2);
  assert.equal(state.faCalls, 1); assert.equal(state.logs[0].status, 'SUCCESS');

  reset(); state.nmsResults = [{ ...cleanResult(), error: 'Query timeout' }];
  result = await run(); assert.equal(result.summary.errors, 1); assert.equal(state.logs[0].status, 'PARTIAL');

  reset(); state.license = false;
  result = await run(); assert.equal(result.success, false); assert.equal(state.logs[0].status, 'FAILED');

  reset(); state.logs = failures(7);
  let status = await health();
  assert.equal(status.status, 'degraded'); assert.equal(status.alarms.recentErrors, 7);
  assert.equal(status.alarms.unresolvedErrorChecks, 7);
  const history = JSON.stringify(state.logs);
  await run();
  status = await health(); assert.equal(status.status, 'healthy');
  assert.equal(status.alarms.recentErrors, 7); assert.equal(status.alarms.unresolvedErrorChecks, 0);
  assert.equal(JSON.stringify(state.logs.slice(0, 7)), history, 'Recovery must preserve historical evidence');

  state.logs[7].checkTime = new Date(Date.now() - 10 * 60000);
  state.logs.push(...failures(6, 1));
  status = await health(); assert.equal(status.status, 'degraded');
  assert.equal(status.alarms.unresolvedErrorChecks, 6, 'New failures must still degrade health after recovery');

  reset(); state.logs = failures(7);
  state.logs.push({ checkTime: new Date(), status: 'RUNNING', errorCount: 0 });
  status = await health(); assert.equal(status.status, 'degraded', 'An unfinished check cannot clear failures');

  reset(); state.logs = failures(7, 70);
  status = await health(); assert.equal(status.alarms.recentErrors, 0); assert.equal(status.status, 'healthy');
  console.log('Alarm runner and health regressions passed: optional sources, real failures, recovery, preserved history and renewed degradation.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
