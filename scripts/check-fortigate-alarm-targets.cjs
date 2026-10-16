// Real target factory, FortiGate REST client, dispatcher, incident service and runner.
// Only persistence, remote transport, license and delivery are synthetic. No app env is loaded.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const { attachAlarmLease } = moduleLoader({})('scripts/helpers/alarm-run-fixture.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const clone = value => JSON.parse(JSON.stringify(value));
const instant = Date.parse('2026-10-16T19:00:00Z');
const config = (id, vdom = 'root', enabled = true) => ({ id, name: 'Synthetic firewall', type: 'FORTIGATE', enabled,
  syncInterval: 5, config: { host: `${id}.invalid`, accessToken: `synthetic-${id}`, vdom } });
const rule = (code = 'VPN_LOGIN_OFF_HOURS') => ({ id: code, code, name: 'Sentetik VPN alarmı',
  category: 'SECURITY', severity: 'ALARM_HIGH', enabled: true, notifyEmail: true, cooldownMinutes: 60,
  detectionLogic: { source: 'fortigate-sslvpn', threshold: 1, timeWindowMinutes: 240 } });
const session = (overrides = {}) => ({ user_name: 'synthetic-user', remote_host: '192.0.2.4',
  last_login_timestamp: instant / 1000 - 60, interface: 'ssl.root', duration: 60,
  subsessions: [{ aip: '192.0.2.5', in_bytes: 200, out_bytes: 100 }], ...overrides });
function fixture({ database, realEmail = false } = {}) {
  const state = { now: instant, configs: [config('target-a', 'branch-a'), config('target-b', 'branch-b')],
    rules: [rule()], calls: [], events: [], incidents: [], mail: [], checks: [], queries: [],
    users: [session()], status: {}, connectors: [], nmsRuns: 0, retries: 0, faReads: 0, deliveries: [], attempts: [] };
  const DateClass = class extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return state.now; }
  };
  const withIncident = event => event ? { ...event, incident: state.incidents.find(i => i.id === event.incidentId) } : null;
  const apply = (row, data) => {
    assert.ok(row, 'Fixture row exists');
    for (const [key, value] of Object.entries(data)) {
      if (key === 'transitions') continue;
      row[key] = value && typeof value === 'object' && 'increment' in value ? (row[key] || 0) + value.increment : value;
    }
    return { ...row };
  };
  const prisma = {
    integrationConfig: {
      findMany: async ({ where, take }) => {
        state.queries.push({ operation: 'targets', where: clone(where) });
        if (state.enumerationError) throw new Error('Synthetic enumeration failed');
        const rows = state.configs.filter(c => c.type === where.type && (where.enabled === undefined || c.enabled === where.enabled));
        const snapshot = rows.map(c => ({ ...c }));
        state.afterEnumeration?.();
        return take ? snapshot.slice(0, take) : snapshot;
      },
      findUnique: async ({ where }) => {
        state.queries.push({ operation: 'resolve', id: where.id });
        if (state.configError === where.id) throw new Error('Synthetic target config failed');
        return state.configs.find(c => c.id === where.id) || null;
      },
      findFirst: async ({ where }) => { state.faReads++; assert.equal(where.type, 'FORTIANALYZER'); return null; },
    },
    firewallConnector: { findUnique: async ({ where }) => state.connectors.find(c =>
      c.integrationConfigId === where.integrationConfigId_vdom.integrationConfigId && c.vdom === where.integrationConfigId_vdom.vdom) || null },
    device: { findUnique: async ({ where }) => ({ id: where.id }), findFirst: async () => null },
    alarmDefinition: { findMany: async () => state.rules.filter(r => r.enabled),
      findFirst: async ({ where }) => state.rules.find(r => r.code === where.code) || null },
    alarmCooldown: { deleteMany: async () => ({ count: 0 }) },
    alarmWhitelist: { findMany: async () => state.whitelist || [] },
    alarmEvent: {
      findFirst: async ({ where }) => {
        state.queries.push({ operation: 'cooldown', where: clone(where) });
        return state.events.find(e => {
          if (e.alarmId !== where.alarmId || (where.deviceName && e.deviceName !== where.deviceName)) return false;
          if (where.createdAt && e.createdAt < where.createdAt.gte) return false;
          const scope = where.incident?.is;
          if (scope) {
            const incident = state.incidents.find(i => i.id === e.incidentId);
            if (!incident || Object.entries(scope).some(([k, v]) => incident[k] !== v)) return false;
          }
          return true;
        }) || null;
      },
      findUnique: async ({ where }) => {
        const key = where.alarmId_sourceEventId;
        return withIncident(state.events.find(e => e.alarmId === key.alarmId && e.sourceEventId === key.sourceEventId));
      },
      create: async ({ data }) => {
        if (state.writeFailureTarget && data.rawData[0].targetKey === state.writeFailureTarget) throw new Error('Synthetic persistence failed');
        assert.ok(!state.events.some(e => e.alarmId === data.alarmId && e.sourceEventId === data.sourceEventId));
        const event = { id: `event-${state.events.length + 1}`, createdAt: new DateClass(), ...data };
        state.events.push(event); return { ...event };
      },
      update: async ({ where, data }) => apply(state.events.find(e => e.id === where.id), data),
    },
    alarmIncident: {
      findUnique: async ({ where }) => state.incidents.find(i => i.activeFingerprint === where.activeFingerprint) || null,
      create: async ({ data }) => { const row = { id: `incident-${state.incidents.length + 1}`, reopenCount: 0, ...data }; state.incidents.push(row); return { ...row }; },
      update: async ({ where, data }) => apply(state.incidents.find(i => i.id === where.id), data),
    },
    alarmCheckLog: {
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }) => { const row = { id: `check-${state.checks.length + 1}`, ...data }; state.checks.push(row); return row; },
      update: async ({ where, data }) => apply(state.checks.find(c => c.id === where.id), data),
    },
    systemConfig: { upsert: async () => { state.heartbeats = (state.heartbeats || 0) + 1; } },
    notificationConfig: { findUnique: async () => ({ enabled: true, config: {
      smtpHost: 'smtp.invalid', smtpPort: 587, smtpUser: 'synthetic@example.invalid', smtpPass: 'synthetic-only', recipients: ['recipient@example.invalid'],
    } }) },
    $transaction: async fn => {
      const snapshot = { events: state.events.map(e => ({ ...e })), incidents: state.incidents.map(i => ({ ...i })) };
      try { return await fn(prisma); } catch (error) { Object.assign(state, snapshot); throw error; }
    },
  };
  if (database) {
    // Opt-in disposable DB checks reuse the same real evaluation path and transport fixtures.
    prisma.alarmEvent = database.alarmEvent;
    prisma.alarmIncident = database.alarmIncident;
    prisma.$transaction = (...args) => database.$transaction(...args);
  } else {
    // B19 ownership is part of the actual runner contract. Model it rather than bypassing it.
    Object.defineProperty(state, 'logs', { get: () => state.checks, set: value => { state.checks = value; } });
    const heartbeat = prisma.systemConfig.upsert;
    attachAlarmLease(prisma, () => state, DateClass);
    const leaseUpsert = prisma.systemConfig.upsert, leaseTransaction = prisma.$transaction;
    prisma.systemConfig.upsert = args => args.where.key === 'alarm-runner-lease-v1' ? leaseUpsert(args) : heartbeat(args);
    prisma.$transaction = async work => {
      const snapshot = { events: state.events.map(e => ({ ...e })), incidents: state.incidents.map(i => ({ ...i })) };
      try { return await leaseTransaction(work); } catch (error) { Object.assign(state, snapshot); throw error; }
    };
  }
  let email;
  const load = moduleLoader({
    'next/server': { NextRequest, NextResponse },
    '@/lib/auth/api-permission': { authorizeApiRequest: async () => ({ allowed: true }) },
    '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => quiet },
    https: { request: () => { throw new Error('Real HTTPS forbidden'); } }, querystring: require('node:querystring'),
    '@/lib/security/tls': { getHttpsRequestTlsOptions: () => { throw new Error('Cookie login forbidden in token fixture'); },
      secureFetch: async (source, rawUrl, options) => {
        assert.equal(source, 'FORTIGATE');
        const url = new URL(rawUrl); assert.equal(url.pathname, '/api/v2/monitor/vpn/ssl');
        const call = { host: url.host, vdom: url.searchParams.get('vdom'), headers: clone(options.headers), method: options.method };
        state.calls.push(call);
        if (state.invalidResponse === url.host) return { ok: true, json: async () => ({ unexpected: true }) };
        const status = state.status[url.host] || 200;
        return { ok: status < 400, status, text: async () => 'Synthetic source error', json: async () => ({
          results: clone(state.usersByHost?.[url.host] || state.users),
        }) };
      } },
    '@/lib/security/integration-credentials': { unprotectIntegrationConfig: value => {
      if (value.corrupt) throw new Error('Synthetic credential decryption failed'); return value;
    } },
    '@/lib/integrations/fortianalyzer': { initSharedFortiAnalyzerService: () => { throw new Error('Unexpected FA client'); },
      getFortiAnalyzerLoginHealth: () => ({ consecutiveFailures: 0 }) },
    '@/lib/integrations/vmware': {},
    '@/lib/alarms/queries': { ALARM_QUERY_REGISTRY: new Map(), BYPASS_CACHE_ALARMS: new Set() },
    '@/lib/alarms/suppression-engine': { createDefaultSuppressionEngine: () => ({ getStats: () => ({}) }) },
    '@/lib/notifications/email': { getEmailStats: () => ({}), sendAlarmEmail: async data => {
      const committed = database ? await database.alarmEvent.findUnique({ where: { id: data.alarmEventId } })
        : state.events.find(e => e.id === data.alarmEventId);
      assert.ok(committed, 'Commit occurrence before delivery');
      state.mail.push(clone(data)); return realEmail ? email.sendAlarmEmail(data) : true;
    } },
    nodemailer: { createTransport: () => ({ sendMail: async data => {
      state.deliveries.push(clone(data)); return { messageId: `synthetic-mail-${state.deliveries.length}` };
    } }) },
    '@/lib/notifications/attempts': { recordNotificationAttempt: async data => { state.attempts.push(clone(data)); } },
    '@/lib/notifications/dlq-worker': { getDLQStats: async () => ({ pending: 0 }), cleanupDLQ: async () => {} },
    '@/lib/license/client': { initLicense: async () => {}, isLicenseValid: () => true },
  }, { Date: DateClass, URL, console: quiet, process: { env: {} }, setTimeout: () => 0, clearTimeout: () => {}, AbortController, AbortSignal,
    setInterval: callback => { state.interval = callback; return 1; }, clearInterval: () => { state.interval = null; } });
  const Engine = load('lib/alarms/detection-engine.ts').AlarmDetectionEngine;
  if (realEmail) email = load('lib/notifications/email.ts');
  Engine.prototype.evaluateNmsAlarms = async () => { state.nmsRuns++; return []; };
  Engine.prototype.retryFailedNotifications = async () => { state.retries++; };
  const engine = new Engine(null);
  const evaluate = () => engine.evaluateAllAlarms({ sources: ['fortigate-sslvpn'] });
  const run = () => load('lib/alarms/alarm-runner.ts').runAlarmCheck();
  const post = () => load('app/api/alarms/check/route.ts').POST(new NextRequest('http://localhost/api/alarms/check', { method: 'POST' }));
  const factory = load('lib/firewall/connector-factory.ts');
  return { state, evaluate, run, post, engine, factory, load, email };
}
const tests = [], test = (name, fn) => tests.push([name, fn]);
test('two enabled configurations reach their own host, token and saved VDOM without FA', async f => {
  const results = await f.evaluate();
  assert.equal(results.length, 2); assert.ok(results.every(r => r.triggered && !r.error));
  assert.deepEqual(f.state.calls.map(c => [c.host, c.vdom, c.headers.Authorization]), [
    ['target-a.invalid', 'branch-a', 'Bearer synthetic-target-a'], ['target-b.invalid', 'branch-b', 'Bearer synthetic-target-b'],
  ]);
  assert.equal(f.state.faReads, 0);
});
test('same username and session evidence create independent incidents, occurrences and notifications', async f => {
  await f.evaluate();
  assert.equal(f.state.events.length, 2); assert.equal(f.state.incidents.length, 2); assert.equal(f.state.mail.length, 2);
  assert.equal(new Set(f.state.events.map(e => e.sourceEventId)).size, 2);
  assert.equal(new Set(f.state.incidents.map(i => i.fingerprint)).size, 2);
  assert.equal(new Set(f.state.mail.map(m => m.incidentId)).size, 2);
  for (const event of f.state.events) {
    assert.equal(event.deviceName, 'synthetic-user');
    assert.equal(event.rawData[0].targetKey, `${event.rawData[0].configId}:${event.rawData[0].vdom}`);
    assert.ok(event.message.includes(event.rawData[0].targetKey));
  }
});
test('a failed first target is visible and does not suppress the second target', async f => {
  f.state.status['target-a.invalid'] = 403;
  const results = await f.evaluate();
  assert.ok(results[0].error); assert.equal(results[0].target.configId, 'target-a');
  assert.equal(results[1].triggered, true); assert.equal(results[1].target.vdom, 'branch-b');
  assert.equal(f.state.events.length, 1); assert.equal(f.state.mail.length, 1);
});
test('enumeration covers more than the factory ambiguity guard limit of two', async f => {
  f.state.configs.push(config('target-c', 'branch-c'));
  const result = await f.evaluate(); assert.equal(result.length, 3); assert.equal(f.state.events.length, 3);
  assert.equal(f.state.queries.filter(q => q.operation === 'targets').length, 1);
  assert.deepEqual(f.state.queries.filter(q => q.operation === 'resolve').map(q => q.id), ['target-a', 'target-b', 'target-c']);
});
test('selectorless factory still rejects ambiguous targets instead of picking the first', async f => {
  await assert.rejects(f.factory.getFortiGateConnector(), { code: 'TARGET_REQUIRED' });
  assert.equal(f.state.calls.length, 0);
});
test('two configurations on the same appliance and VDOM keep separate credentials and incidents', async f => {
  f.state.configs[1].config.host = 'target-a.invalid'; f.state.configs[1].config.vdom = 'branch-a';
  await f.evaluate();
  assert.deepEqual(f.state.calls.map(c => c.headers.Authorization), ['Bearer synthetic-target-a', 'Bearer synthetic-target-b']);
  assert.equal(f.state.incidents.length, 2); assert.equal(f.state.mail.length, 2);
});
test('legacy configuration without a linked inventory device uses normalized default root', async f => {
  f.state.configs = [config('target-a', '  ')];
  const result = await f.evaluate();
  assert.equal(result[0].target.key, 'target-a:root'); assert.equal(f.state.calls[0].vdom, 'root');
  assert.equal(f.state.events[0].rawData[0].inventoryDeviceId, null);
});
test('the factory linked management host and inventory identity reach the selected evaluator', async f => {
  f.state.connectors = [{ integrationConfigId: 'target-a', vdom: 'branch-a', managementHost: 'linked.invalid', deviceId: 'synthetic-device' }];
  await f.evaluate();
  assert.equal(f.state.calls[0].host, 'linked.invalid');
  assert.equal(f.state.events[0].rawData[0].inventoryDeviceId, 'synthetic-device');
  assert.equal(f.state.events[0].rawData[0].targetKey, 'target-a:branch-a');
});
test('disabled targets are excluded without initializing their client', async f => {
  f.state.configs[0].enabled = false;
  const result = await f.evaluate(); assert.equal(result.length, 1);
  assert.equal(f.state.calls[0].host, 'target-b.invalid'); assert.equal(f.state.calls.length, 1);
});
test('absence is skipped on full cycles and reported by an explicitly required source action', async f => {
  f.state.configs = [];
  assert.equal((await f.evaluate()).length, 0);
  const result = await f.engine.evaluateAllAlarms({ sources: ['fortigate-sslvpn'], requireConfiguredSources: true });
  assert.match(result[0].error, /not configured/); assert.equal(f.state.calls.length, 0);
});
test('disabled rules do not enumerate targets or initialize clients', async f => {
  f.state.rules[0].enabled = false;
  assert.equal((await f.evaluate()).length, 0);
  assert.equal(f.state.queries.length, 0); assert.equal(f.state.calls.length, 0);
});
test('a different explicit source selection never reads FortiGate configuration', async f => {
  await f.engine.evaluateAllAlarms({ sources: ['vmware'] });
  assert.equal(f.state.queries.length, 0); assert.equal(f.state.calls.length, 0);
});
for (const failure of ['config-read', 'decrypt', 'missing-host', 'invalid-vdom']) test(`${failure} remains local to its target`, async f => {
  if (failure === 'config-read') f.state.configError = 'target-a';
  if (failure === 'decrypt') f.state.configs[0].config.corrupt = true;
  if (failure === 'missing-host') f.state.configs[0].config.host = '';
  if (failure === 'invalid-vdom') f.state.configs[0].config.vdom = '\u0000invalid';
  const result = await f.evaluate();
  assert.ok(result[0].error); assert.equal(result[0].target.configId, 'target-a');
  assert.ok(result[1].triggered); assert.equal(f.state.events.length, 1); assert.equal(f.state.mail.length, 1);
});
for (const change of ['disable', 'delete']) test(`target ${change} between enumeration and resolution cannot use a stale client`, async f => {
  await f.evaluate(); f.state.calls = [];
  f.state.afterEnumeration = () => {
    if (change === 'disable') f.state.configs[0].enabled = false;
    else f.state.configs.shift();
  };
  const result = await f.evaluate();
  assert.ok(result[0].error); assert.equal(result[0].target.configId, 'target-a');
  assert.ok(!f.state.calls.some(c => c.host === 'target-a.invalid'));
  assert.ok(!result[1].error); assert.equal(f.state.events.length, 2);
});
test('source enumeration failure is reported instead of becoming a clean empty check', async f => {
  f.state.enumerationError = true;
  const result = await f.run();
  assert.equal(result.summary.errors, 1); assert.match(result.errors[0].error, /enumeration/);
  assert.equal(f.state.checks.at(-1).status, 'PARTIAL'); assert.equal(f.state.calls.length, 0);
});
test('a successful empty source is clean and distinct from malformed source data', async f => {
  f.state.usersByHost = { 'target-a.invalid': [] }; f.state.invalidResponse = 'target-b.invalid';
  const result = await f.evaluate();
  assert.equal(result[0].error, undefined); assert.equal(result[0].matchCount, 0);
  assert.ok(result[1].error); assert.equal(result[1].target.key, 'target-b:branch-b');
  assert.equal(f.state.events.length, 0); assert.equal(f.state.mail.length, 0);
});
test('repeated checks use per-target per-user cooldowns and do not resend notifications', async f => {
  await f.evaluate(); const results = await f.evaluate();
  assert.ok(results.every(r => !r.triggered));
  assert.equal(f.state.events.length, 2); assert.equal(f.state.mail.length, 2);
  for (const query of f.state.queries.filter(q => q.operation === 'cooldown')) {
    assert.equal(query.where.incident.is.entityType, 'fortigate-user');
    assert.ok(query.where.incident.is.entityId.includes('target-'));
  }
});
test('a later added target is not suppressed by an existing target user cooldown', async f => {
  f.state.configs = [config('target-a', 'branch-a')]; await f.evaluate();
  f.state.configs.push(config('target-b', 'branch-b')); const result = await f.evaluate();
  assert.equal(result[0].triggered, false); assert.equal(result[1].triggered, true);
  assert.equal(f.state.events.length, 2); assert.equal(f.state.mail.length, 2);
});
test('different users on a target retain independent cooldowns', async f => {
  await f.evaluate(); f.state.users.push(session({ user_name: 'second-synthetic-user' }));
  const result = await f.evaluate();
  assert.ok(result.every(r => r.matchCount === 1));
  assert.equal(f.state.incidents.length, 4); assert.equal(f.state.mail.length, 4);
});
test('new session within a user cooldown waits and after cooldown creates a new occurrence in its scoped incident', async f => {
  await f.evaluate(); f.state.now += 120000;
  f.state.users[0].last_login_timestamp += 120;
  const skipped = await f.evaluate(); assert.ok(skipped.every(r => !r.triggered)); assert.equal(f.state.mail.length, 2);
  f.state.now += 61 * 60000; await f.evaluate();
  assert.equal(f.state.events.length, 4); assert.equal(f.state.incidents.length, 2);
  assert.ok(f.state.incidents.every(i => i.occurrenceCount === 2)); assert.equal(f.state.mail.length, 4);
});
test('traffic and duration changes after cooldown do not replay the same source session', async f => {
  await f.evaluate(); f.state.now += 61 * 60000;
  f.state.users[0].duration += 3600; f.state.users[0].subsessions[0].in_bytes = 900000000;
  await f.evaluate(); assert.equal(f.state.events.length, 2); assert.equal(f.state.mail.length, 2);
});
test('saved VDOM change uses a fresh target scope on the same reusable engine', async f => {
  f.state.configs = [config('target-a', 'branch-a')]; await f.evaluate();
  f.state.configs[0].config.vdom = 'branch-new'; const result = await f.evaluate();
  assert.equal(result[0].target.key, 'target-a:branch-new'); assert.equal(f.state.calls.at(-1).vdom, 'branch-new');
  assert.equal(f.state.incidents.length, 2); assert.equal(f.state.mail.length, 2);
});
test('saved host and token changes replace the cached connector on the next cycle', async f => {
  await f.evaluate(); f.state.calls = [];
  f.state.configs[0].config.host = 'replacement.invalid'; f.state.configs[0].config.accessToken = 'synthetic-rotated';
  await f.evaluate();
  assert.equal(f.state.calls[0].host, 'replacement.invalid'); assert.equal(f.state.calls[0].headers.Authorization, 'Bearer synthetic-rotated');
  assert.equal(f.state.calls[1].headers.Authorization, 'Bearer synthetic-target-b');
  assert.equal(f.state.mail.length, 2);
});
test('disabled configuration is re-read on a reusable engine instead of polling a previous client', async f => {
  await f.evaluate(); f.state.calls = []; f.state.configs[0].enabled = false;
  const result = await f.evaluate(); assert.equal(result.length, 1);
  assert.ok(f.state.calls.every(c => c.host === 'target-b.invalid'));
});
test('historical unscoped user events do not suppress a different known target', async f => {
  f.state.events.push({ id: 'legacy', alarmId: f.state.rules[0].id, deviceName: 'synthetic-user', createdAt: new Date(instant), incidentId: 'legacy-incident' });
  f.state.incidents.push({ id: 'legacy-incident', entityType: 'user', entityId: 'synthetic-user' });
  const result = await f.evaluate(); assert.ok(result.every(r => r.triggered)); assert.equal(f.state.mail.length, 2);
});
test('business-hours alarm cooldown is target-wide and does not block another firewall', async f => {
  f.state.now = Date.parse('2026-10-16T09:00:00Z');
  f.state.users = [session({ last_login_timestamp: f.state.now / 1000 - 60 })];
  f.state.rules = [rule('SSLVPN_BUSINESS_HOURS')];
  const first = await f.evaluate(); assert.ok(first.every(r => r.triggered));
  assert.equal(f.state.incidents.length, 2); assert.ok(f.state.incidents.every(i => i.entityType === 'fortigate-target'));
  f.state.users.push(session({ user_name: 'second-user', last_login_timestamp: f.state.now / 1000 - 30 }));
  const second = await f.evaluate(); assert.ok(second.every(r => r.error === 'cooldown-active'));
  assert.equal(f.state.events.length, 2); assert.equal(f.state.mail.length, 2);
});
test('group session ordering and changing counters do not replay a business-hours occurrence', async f => {
  f.state.now = Date.parse('2026-10-16T09:00:00Z');
  f.state.users = ['user-a', 'user-b'].map(user_name => session({ user_name, last_login_timestamp: f.state.now / 1000 - 60 }));
  f.state.rules = [rule('SSLVPN_BUSINESS_HOURS')]; await f.evaluate();
  f.state.now += 61 * 60000; f.state.users.reverse(); f.state.users[0].duration += 4000;
  await f.evaluate(); assert.equal(f.state.events.length, 2); assert.equal(f.state.mail.length, 2);
});
test('per-target occurrence time uses the source session timestamp', async f => {
  await f.evaluate();
  assert.ok(f.state.events.every(e => e.sourceOccurredAt.toISOString() === new Date((instant / 1000 - 60) * 1000).toISOString()));
});
test('notification preferences and whitelist suppression remain in the existing path', async f => {
  f.state.rules[0].notifyEmail = false; await f.evaluate();
  assert.equal(f.state.events.length, 2); assert.equal(f.state.mail.length, 0);
  f.state.rules = [rule('SYNTHETIC_DIRECT_CONNECTION')];
  f.state.whitelist = [{ field: 'targetKey', value: 'target-a:branch-a' }];
  await f.evaluate(); assert.equal(f.state.events.length, 3); assert.equal(f.state.mail.length, 1);
  assert.ok(f.state.mail[0].message.includes('target-b:branch-b'));
});
test('persistence failure on one target never sends its notification or suppresses the next target', async f => {
  f.state.writeFailureTarget = 'target-a:branch-a'; const result = await f.evaluate();
  assert.ok(result[0].error); assert.ok(result[1].triggered);
  assert.equal(f.state.events.length, 1); assert.equal(f.state.incidents.length, 1); assert.equal(f.state.mail.length, 1);
  assert.ok(f.state.mail[0].message.includes('target-b:branch-b'));
});
test('runner preserves target errors and source identity and runs shared work only once', async f => {
  f.state.status['target-a.invalid'] = 403; const result = await f.run();
  assert.equal(result.summary.total, 2); assert.equal(result.summary.triggered, 1); assert.equal(result.summary.errors, 1);
  assert.equal(result.errors[0].target.key, 'target-a:branch-a'); assert.equal(result.triggered[0].target.key, 'target-b:branch-b');
  assert.equal(f.state.checks.at(-1).status, 'PARTIAL'); assert.equal(f.state.nmsRuns, 1); assert.equal(f.state.retries, 1);
});
test('manual POST and the shared runner use the same multiple-target dispatch', async f => {
  const response = await f.post(); const result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.summary.total, 2); assert.equal(result.summary.triggered, 2);
  assert.deepEqual(result.triggered.map(r => r.target.key), ['target-a:branch-a', 'target-b:branch-b']);
  assert.equal(f.state.nmsRuns, 1); assert.equal(f.state.retries, 1); assert.equal(f.state.mail.length, 2);
});
test('an actual scheduler interval invokes the shared multiple-target runner once', async f => {
  const scheduler = f.load('lib/alarm-scheduler.ts'); scheduler.startAlarmScheduler({ runImmediately: false });
  assert.equal(f.state.calls.length, 0); f.state.interval();
  for (let step = 0; step < 1000 && scheduler.getSchedulerStatus().tickInProgress; step++) await Promise.resolve();
  assert.equal(f.state.heartbeats, 1); assert.equal(f.state.events.length, 2); assert.equal(f.state.mail.length, 2);
  assert.equal(f.state.nmsRuns, 1); assert.equal(f.state.retries, 1); assert.equal(scheduler.getSchedulerStatus().tickInProgress, false);
  scheduler.stopAlarmScheduler(); assert.equal(f.state.interval, null);
});
test('target failures can recover without losing the other target history', async f => {
  f.state.status['target-a.invalid'] = 403; await f.run();
  f.state.status['target-a.invalid'] = 200; const result = await f.run();
  assert.equal(result.summary.errors, 0); assert.equal(f.state.checks[0].status, 'PARTIAL'); assert.equal(f.state.checks[1].status, 'SUCCESS');
  assert.equal(f.state.events.length, 2); assert.equal(f.state.mail.length, 2);
});
test('evaluation results and notifications contain no decrypted configuration or token', async f => {
  const result = await f.run(); const output = JSON.stringify([result, f.state.events, f.state.incidents, f.state.mail]);
  for (const c of f.state.configs) { assert.ok(!output.includes(c.config.accessToken)); assert.ok(!output.includes(c.config.host)); }
});
test('real email cooldown permits separate target incidents and blocks only a repeat of its own incident', async () => {
  const f = fixture({ realEmail: true }); await f.evaluate();
  assert.equal(f.state.deliveries.length, 2);
  assert.deepEqual(f.state.attempts.map(a => a.status), ['SENT', 'SENT']);
  assert.equal(new Set(f.state.attempts.map(a => a.incidentId)).size, 2);
  const repeated = await f.email.sendAlarmEmail({ ...f.state.mail[0], timestamp: new Date(instant) });
  assert.equal(repeated, false); assert.equal(f.state.deliveries.length, 2);
  assert.equal(f.state.attempts.at(-1).status, 'SKIPPED_COOLDOWN');
  assert.ok(f.state.deliveries[0].html.includes('target-a:branch-a'));
  assert.ok(f.state.deliveries[1].html.includes('target-b:branch-b'));
});
async function main() {
  let failed = 0;
  for (const [name, check] of tests) {
    try { await check(fixture()); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
  }
  assert.equal(failed, 0, `${failed} FortiGate target regressions failed`);
  console.log(`FortiGate alarm target regressions passed (${tests.length} scenarios; isolated source, persistence and delivery).`);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixture };
