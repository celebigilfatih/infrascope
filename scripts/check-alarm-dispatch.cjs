// Real runner, engine dispatch and VMware route; all external I/O is replaced.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const healthFixture = require('./check-alarm-health.cjs');
const { attachAlarmLease } = require('./helpers/alarm-run-fixture.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const clean = alarmCode => ({ alarmCode, triggered: false, matchCount: 0, events: [] });
function rule(code, source, detectionLogic = {}) {
  return { id: code, code, name: 'Fixture', source, severity: 'ALARM_HIGH', category: 'OPERATIONAL',
    enabled: true, notifyEmail: false, cooldownMinutes: 5,
    detectionLogic: { threshold: 1, timeWindowMinutes: 5, ...detectionLogic } };
}
const vmRule = () => rule('DATASTORE_SPACE_CRITICAL', 'vmware', { logtype: 'vmware', filter: 'datastoreFreePercent < 10' });
const fgRule = () => rule('SSLVPN_BUSINESS_HOURS', 'fortigate-sslvpn', { logtype: 'event', source: 'fortigate-sslvpn' });
const faRule = () => rule('ADMIN_CONFIG_CHANGE', 'fortianalyzer', { logtype: 'event' });
const vmConfig = () => ({ id: 'fixture-vcenter', enabled: true, name: 'Fixture', config: { host: 'fixture.invalid', username: 'fixture', password: 'fixture' } });
const faConfig = () => ({ id: 'fixture-analyzer', enabled: true, config: { host: 'fixture.invalid', username: 'fixture', password: 'fixture' } });
function fixture(options = {}) {
  const state = { configs: {}, rules: [], calls: [], logs: [], auth: true, login: true, fgConfigured: false, license: true };
  const prisma = {
    integrationConfig: { findFirst: async ({ where }) => {
      state.calls.push(`config:${where.type}`);
      if (state.configError === where.type) throw new Error(`Fixture ${where.type} config failed`);
      const value = state.configs[where.type]; return value?.enabled ? value : null;
    }, findMany: async ({ where }) => {
      state.calls.push(`targets:${where.type}`);
      return state.fgConfigured ? [{ id: 'fixture-config' }] : [];
    } },
    alarmDefinition: { findMany: async () => { if (state.rulesError) throw new Error('Fixture catalog failed'); return state.rules.filter(r => r.enabled); }, findFirst: async () => ({ severity: 'ALARM_HIGH', category: 'OPERATIONAL' }) },
    alarmCooldown: { deleteMany: async () => { state.calls.push('cooldown:prune'); return { count: 0 }; } },
    alarmEvent: { findFirst: async () => null, findMany: async () => [] },
    alarmCheckLog: { findFirst: async () => null, create: async ({ data }) => {
      const row = { id: String(state.logs.length + 1), ...data }; state.logs.push(row); return row;
    }, update: async ({ where, data }) => Object.assign(state.logs.find(r => r.id === where.id), data) },
  };
  attachAlarmLease(prisma, () => state);
  const fa = { login: async () => { state.calls.push('fa:login'); if (state.faError) throw new Error(state.faError); return state.login; } };
  const fg = { clearCmdbResponseCache: () => state.calls.push('fg:clear-cmdb'), clearEventLogCache: () => state.calls.push('fg:clear-events'),
    getSSLVPNUsers: async () => { state.calls.push('fg:users'); if (state.fgQueryError) throw new Error('Fixture FG query failed'); return []; } };
  const load = moduleLoader({
    'next/server': { NextRequest, NextResponse }, '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => quiet },
    '@/lib/auth/request-actor': { getRequestActor: async () => ({ role: 'ADMIN', actor: { id: 'fixture-admin' } }) },
    '@/lib/license/middleware': { checkLicense: async () => null },
    '@/lib/integrations/fortianalyzer': { initSharedFortiAnalyzerService: config => { state.lastFAConfig = config; state.calls.push('fa:init'); return fa; },
      getFortiAnalyzerLoginHealth: () => ({ consecutiveFailures: 0 }) },
    '@/lib/integrations/vmware': { VMwareService: class {
      constructor(config) { state.lastVMConfig = config; state.calls.push('vm:new'); }
      async authenticate() { state.calls.push('vm:auth'); return state.auth; }
      async fetchDatastores() { state.calls.push('vm:datastores'); if (state.vmQueryError) throw new Error('Fixture VMware query failed'); return []; }
    } },
    '@/lib/integrations/fortigate': {},
    '@/lib/firewall/connector-factory': { getFortiGateConnector: async selector => {
      state.calls.push('fg:connector');
      assert.equal(selector.configId, 'fixture-config');
      if (state.fgError) throw Object.assign(new Error('Fixture FG target failed'), { code: state.fgError });
      if (!state.fgConfigured) throw Object.assign(new Error('FortiGate integration not configured'), { code: 'NOT_CONFIGURED' });
      return { service: fg, target: { configId: 'fixture-config', vdom: 'root', key: 'fixture-config:root' } };
    } },
    '@/lib/security/integration-credentials': options.credentials || { unprotectIntegrationConfig: (config, profile) => {
      if (state.decryptError && profile === 'FORTIANALYZER') throw new Error('Fixture decrypt failed'); return config;
    } },
    '@/lib/alarms/queries': { ALARM_QUERY_REGISTRY: new Map(), BYPASS_CACHE_ALARMS: new Set() },
    '@/lib/alarms/suppression-engine': { createDefaultSuppressionEngine: () => ({ getStats: () => ({}) }) },
    '@/lib/notifications/email': { getEmailStats: () => ({}), sendAlarmEmail: async () => { throw new Error('Unexpected notification'); } },
    '@/lib/notifications/dlq-worker': { getDLQStats: async () => ({ pending: 0 }), cleanupDLQ: async () => {} },
    '@/lib/license/client': { initLicense: async () => {}, isLicenseValid: () => state.license },
  }, { process: { env: {} }, console: quiet,
    setTimeout: () => 0, clearTimeout: () => {}, AbortController, AbortSignal,
  });
  const Engine = load('lib/alarms/detection-engine.ts').AlarmDetectionEngine;
  // Preserve real initializers and VMware/FG evaluators. Isolate unrelated source/cache workers.
  Engine.prototype.evaluateNmsAlarms = async () => { state.calls.push('nms:evaluate'); if (state.nmsError) throw new Error('Fixture NMS failed'); return [clean('NMS_FIXTURE')]; };
  Engine.prototype.retryFailedNotifications = async () => { state.calls.push('notifications:retry'); };
  Engine.prototype.initializeEventCache = async function () { state.calls.push('fa:cache'); this.cacheInitialized = true; };
  const evaluateGroup = Engine.prototype.evaluateLogTypeGroupOptimized;
  Engine.prototype.evaluateLogTypeGroupOptimized = async function (type, alarms) {
    if (type === 'vmware') return evaluateGroup.call(this, type, alarms);
    state.calls.push('fa:query'); if (state.faQueryError) throw new Error('Fixture FA query failed'); return alarms.map(a => clean(a.code));
  };
  const engine = service => new Engine(service === false ? null : fa);
  const run = () => load('lib/alarms/alarm-runner.ts').runAlarmCheck();
  const route = () => load('app/api/alarms/check-vmware/route.ts');
  const postRequest = () => new NextRequest('http://localhost/api/alarms/check-vmware', { method: 'POST' });
  return { state, engine, run, route, postRequest };
}
const tests = [], test = (name, fn) => tests.push([name, fn]);
test('VMware-only runner evaluates VMware without FA configuration or FA I/O', async f => {
  f.state.configs.VMWARE_VCENTER = vmConfig(); f.state.rules = [vmRule()];
  const result = await f.run(); assert.equal(result.summary.errors, 0); assert.equal(result.summary.total, 2);
  assert.ok(f.state.calls.includes('vm:datastores')); assert.ok(!f.state.calls.some(c => c.startsWith('fa:')));
});
test('FortiGate-only runner evaluates direct SSL-VPN without FA', async f => {
  f.state.fgConfigured = true; f.state.rules = [fgRule()];
  const result = await f.run(); assert.equal(result.summary.errors, 0); assert.ok(f.state.calls.includes('fg:users'));
  assert.ok(!f.state.calls.some(c => c.startsWith('fa:')));
});
test('NMS-only engine does not initialize optional integrations', async f => {
  const results = await f.engine(false).evaluateAllAlarms();
  assert.equal(results.length, 1); assert.deepEqual(f.state.calls, ['cooldown:prune', 'nms:evaluate', 'notifications:retry']);
});
for (const mode of ['missing', 'disabled', 'malformed', 'config-failure', 'decrypt-failure', 'auth-failure', 'query-failure']) {
  test(`${mode} FA preserves independent VMware and FortiGate results`, async f => {
    f.state.configs.VMWARE_VCENTER = vmConfig(); f.state.fgConfigured = true; f.state.rules = [vmRule(), fgRule(), faRule()];
    if (mode !== 'missing') f.state.configs.FORTIANALYZER = faConfig();
    if (mode === 'disabled') f.state.configs.FORTIANALYZER.enabled = false;
    if (mode === 'malformed') delete f.state.configs.FORTIANALYZER.config.password;
    if (mode === 'config-failure') f.state.configError = 'FORTIANALYZER';
    if (mode === 'decrypt-failure') f.state.decryptError = true;
    if (mode === 'auth-failure') f.state.login = false;
    if (mode === 'query-failure') f.state.faQueryError = true;
    const result = await f.run();
    assert.ok(f.state.calls.includes('vm:datastores')); assert.ok(f.state.calls.includes('fg:users'));
    assert.ok(!result.errors.some(e => [vmRule().code, fgRule().code].includes(e.code)));
    assert.equal(result.summary.errors > 0, !['missing', 'disabled'].includes(mode));
    assert.equal(f.state.logs.at(-1).status, result.summary.errors ? 'PARTIAL' : 'SUCCESS');
    assert.equal(f.state.calls.filter(c => c === 'nms:evaluate').length, 1);
    if (['auth-failure', 'query-failure'].includes(mode)) {
      assert.ok(f.state.calls.indexOf('vm:datastores') < f.state.calls.indexOf('fa:login'));
      assert.ok(f.state.calls.indexOf('fg:users') < f.state.calls.indexOf('fa:login'));
    }
  });
}
test('all configured sources run once and share the existing FG connector', async f => {
  f.state.configs.VMWARE_VCENTER = vmConfig(); f.state.configs.FORTIANALYZER = faConfig();
  f.state.fgConfigured = true; f.state.rules = [vmRule(), fgRule(), faRule()];
  const result = await f.run(); assert.equal(result.summary.total, 4); assert.equal(result.summary.errors, 0);
  for (const call of ['nms:evaluate', 'fg:connector', 'fg:clear-cmdb', 'fg:clear-events', 'fg:users', 'vm:auth', 'vm:datastores', 'fa:login', 'fa:cache', 'fa:query']) {
    assert.equal(f.state.calls.filter(c => c === call).length, 1, call);
  }
});
for (const mode of ['vm-auth', 'vm-config', 'vm-query', 'fg-config', 'fg-ambiguous', 'fg-query', 'nms']) test(`${mode} failure stays scoped while the other sources run`, async f => {
  f.state.configs.VMWARE_VCENTER = vmConfig(); f.state.configs.FORTIANALYZER = faConfig();
  f.state.fgConfigured = true; f.state.rules = [vmRule(), fgRule(), faRule()];
  if (mode === 'vm-auth') f.state.auth = false;
  if (mode === 'vm-config') delete f.state.configs.VMWARE_VCENTER.config.password;
  if (mode === 'vm-query') f.state.vmQueryError = true;
  if (mode === 'fg-config') f.state.fgError = 'INVALID_CONFIG';
  if (mode === 'fg-ambiguous') f.state.fgError = 'TARGET_REQUIRED';
  if (mode === 'fg-query') f.state.fgQueryError = true;
  if (mode === 'nms') f.state.nmsError = true;
  const result = await f.run();
  const expected = mode.startsWith('vm-') ? vmRule().code : mode.startsWith('fg-') ? fgRule().code : 'NMS_SOURCE';
  assert.equal(result.errors.length, 1); assert.equal(result.errors[0].code, expected);
  assert.ok(f.state.calls.includes('fa:query'));
  if (!mode.startsWith('vm-')) assert.ok(f.state.calls.includes('vm:datastores'));
  if (!mode.startsWith('fg-')) assert.ok(f.state.calls.includes('fg:users'));
  assert.equal(f.state.logs.at(-1).status, 'PARTIAL');
});
test('absent or disabled optional source configs do not start clients or hide NMS', async f => {
  f.state.configs.VMWARE_VCENTER = { ...vmConfig(), enabled: false };
  f.state.configs.FORTIANALYZER = { ...faConfig(), enabled: false };
  f.state.rules = [vmRule(), fgRule(), faRule()];
  const result = await f.run(); assert.equal(result.summary.errors, 0); assert.equal(result.summary.total, 1);
  assert.ok(!f.state.calls.some(c => c === 'vm:new' || c.startsWith('fa:') || c === 'fg:users'));
});
test('disabled alarm rules never initialize their configured clients', async f => {
  f.state.configs.VMWARE_VCENTER = vmConfig(); f.state.fgConfigured = true;
  f.state.rules = [{ ...vmRule(), enabled: false }, { ...fgRule(), enabled: false }];
  const result = await f.engine(false).evaluateAllAlarms({ includeNms: false });
  assert.equal(result.length, 0); assert.ok(!f.state.calls.some(c => /^(vm:|fg:|config:)/.test(c)));
});
test('an unsuccessful VMware initialization can recover on the next engine cycle', async f => {
  f.state.configs.VMWARE_VCENTER = vmConfig(); f.state.rules = [vmRule()]; f.state.auth = false;
  const engine = f.engine(false); const first = await engine.evaluateAllAlarms({ includeNms: false });
  assert.match(first[0].error, /authentication failed/);
  f.state.auth = true; const second = await engine.evaluateAllAlarms({ includeNms: false });
  assert.equal(second[0].error, undefined); assert.ok(f.state.calls.includes('vm:datastores'));
});
for (const field of ['accessToken', 'apiKey']) test(`FA ${field} configuration does not require a password`, async f => {
  f.state.configs.FORTIANALYZER = faConfig(); delete f.state.configs.FORTIANALYZER.config.password;
  f.state.configs.FORTIANALYZER.config[field] = 'fixture-key'; f.state.rules = [faRule()];
  const result = await f.run(); assert.equal(result.summary.errors, 0); assert.ok(f.state.calls.includes('fa:query'));
  assert.equal(f.state.lastFAConfig.accessToken, 'fixture-key');
});
test('catalog failure retains NMS results and is not mislabeled as a FA source error', async f => {
  f.state.rulesError = true; const result = await f.run();
  assert.equal(result.summary.total, 1); assert.equal(result.errors[0].code, 'ALARM_ENGINE');
  assert.equal(f.state.logs.at(-1).status, 'PARTIAL');
});
test('invalid license still prevents every source from running', async f => {
  f.state.license = false; f.state.configs.VMWARE_VCENTER = vmConfig(); f.state.rules = [vmRule()];
  const result = await f.run(); assert.equal(result.success, false); assert.equal(result.errors[0].code, 'LICENSE');
  assert.equal(f.state.calls.length, 0); assert.equal(f.state.logs.at(-1).status, 'FAILED');
});
test('correlation login failure stays within FA-dependent rules', async f => {
  f.state.configs.VMWARE_VCENTER = vmConfig(); f.state.fgConfigured = true;
  f.state.rules = [vmRule(), fgRule(), faRule(), rule('CORRELATION_FIXTURE', 'fortianalyzer', { clientCheck: 'correlation' })];
  f.state.login = false;
  const result = await f.engine().evaluateAllAlarms({ includeNms: false });
  const failed = Array.from(result.filter(r => r.error), r => r.alarmCode).sort();
  assert.deepEqual(failed, ['ADMIN_CONFIG_CHANGE', 'CORRELATION_FIXTURE']);
});
for (const mode of ['legacy-logtype', 'row-source', 'logic-source']) test(`VMware dispatch honors ${mode} metadata`, async f => {
  f.state.configs.VMWARE_VCENTER = vmConfig(); const vm = vmRule();
  if (mode === 'legacy-logtype') vm.source = null;
  if (mode === 'row-source') vm.detectionLogic.logtype = 'event';
  if (mode === 'logic-source') { vm.source = null; vm.detectionLogic.logtype = 'event'; vm.detectionLogic.source = 'vmware'; }
  f.state.rules = [vm]; const result = await f.engine(false).evaluateAllAlarms({ includeNms: false });
  assert.equal(result[0].error, undefined); assert.ok(f.state.calls.includes('vm:datastores'));
  assert.ok(!f.state.calls.some(c => c.startsWith('fa:')));
});
test('VMware-only POST uses the shared engine without reading FA config', async f => {
  f.state.configs.VMWARE_VCENTER = vmConfig(); f.state.rules = [vmRule(), fgRule(), faRule()];
  const response = await f.route().POST(f.postRequest()); const result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.summary.total, 1); assert.equal(result.summary.errors, 0);
  assert.ok(f.state.calls.includes('vm:datastores'));
  assert.ok(!f.state.calls.some(c => c.startsWith('fa:') || c.includes('FORTIANALYZER') || c.startsWith('fg:') || c.startsWith('nms:')));
  assert.ok(!f.state.calls.includes('notifications:retry'));
  assert.ok(!f.state.calls.includes('cooldown:prune'));
});
for (const mode of ['missing', 'disabled', 'auth-failure']) test(`VMware-only POST reports ${mode} source without touching FA`, async f => {
  f.state.rules = [vmRule(), fgRule(), faRule()];
  if (mode !== 'missing') f.state.configs.VMWARE_VCENTER = vmConfig();
  if (mode === 'disabled') f.state.configs.VMWARE_VCENTER.enabled = false;
  if (mode === 'auth-failure') f.state.auth = false;
  const response = await f.route().POST(f.postRequest()); const result = await response.json();
  assert.equal(result.summary.errors, 1); assert.equal(result.errors[0].code, vmRule().code);
  assert.ok(!f.state.calls.some(c => c.startsWith('fa:') || c.includes('FORTIANALYZER') || c.startsWith('fg:')));
});
test('VMware-only action with no enabled VMware rules does not initialize a client', async f => {
  f.state.rules = [faRule(), fgRule()];
  const response = await f.route().POST(f.postRequest()), result = await response.json();
  assert.equal(result.summary.total, 0); assert.equal(result.summary.errors, 0); assert.equal(f.state.calls.length, 0);
});
test('independent-source failures degrade check health and recovery preserves their history', async f => {
  f.state.configs.VMWARE_VCENTER = vmConfig(); f.state.rules = [vmRule()]; f.state.auth = false;
  for (let i = 0; i < 6; i++) assert.equal((await f.run()).summary.errors, 1);
  healthFixture.reset(); healthFixture.getState().logs = f.state.logs;
  assert.equal((await healthFixture.health()).alarms.unresolvedErrorChecks, 6);
  f.state.auth = true; assert.equal((await f.run()).summary.errors, 0);
  assert.equal((await healthFixture.health()).alarms.unresolvedErrorChecks, 0);
  assert.equal(f.state.logs.filter(row => row.status === 'PARTIAL').length, 6);
});
async function main() {
  for (const [name, fn] of tests) { await fn(fixture()); console.log(`PASS ${name}`); }
  console.log(`Alarm dispatch regressions passed (${tests.length} scenarios; isolated source I/O).`);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixture };
