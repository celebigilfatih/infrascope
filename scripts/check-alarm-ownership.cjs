// Actual runner/lease/execution/engine/email code with deterministic time and synthetic I/O.
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const { moduleLoader, alarm, log } = require('./check-alarm-occurrences.cjs');
const { attachAlarmLease } = require('./helpers/alarm-run-fixture.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function clock() {
  let now = Date.parse('2026-10-16T00:00:00Z'), sequence = 0;
  const timers = new Map(), microtasks = [];
  const flush = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
  return {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
    setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn: AsyncLocalStorage.bind(fn), due: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, ms) { const id = ++sequence; timers.set(id, { fn: AsyncLocalStorage.bind(fn), due: now + ms, interval: ms }); return id; },
    clearInterval(id) { timers.delete(id); }, queueMicrotask: fn => microtasks.push(fn),
    flush, timers, microtasks,
    async advance(ms) {
      const end = now + ms;
      await flush();
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due; timers.delete(next[0]);
        if (next[1].interval) timers.set(next[0], { ...next[1], due: now + next[1].interval });
        next[1].fn(); await flush();
      }
      now = end; await flush();
    },
  };
}
function fixture() {
  const timer = clock(), state = { logs: [], sourceCalls: 0, mail: 0, effects: [], licensed: true, smtpReads: 0 };
  const prisma = {
    alarmCheckLog: { create: async ({ data }) => { const row = { id: `fixture-${state.logs.length}`, ...data }; state.logs.push(row); return row; } },
    alarmDefinition: { findFirst: async () => ({ severity: 'ALARM_HIGH', category: 'OPERATIONAL' }) },
    alarmWhitelist: { findMany: async () => [] },
    integrationConfig: { findFirst: async () => null },
    notificationConfig: { findUnique: async () => { state.smtpReads++; if (state.smtpWait) await state.smtpWait;
      return { enabled: true, config: { smtpHost: 'smtp.fixture.invalid', smtpPort: 587, smtpUser: 'fixture', smtpPass: 'fixture', recipients: ['fixture@example.invalid'] } }; } },
    notificationAttempt: { create: async () => { state.effects.push('attempt'); return {}; } },
    alarmEvent: { update: async () => { state.effects.push('event-update'); return {}; } },
    systemConfig: { findUnique: async () => null, create: async () => ({}) },
    $queryRaw: async () => [],
  };
  attachAlarmLease(prisma, () => state, timer.Date);
  const engine = class {
    async evaluateNmsAlarms() {
      state.sourceCalls++;
      if (state.wait) await state.wait;
      if (state.late) await state.late();
      return [{ alarmCode: 'NMS_FIXTURE', triggered: false, matchCount: 0, events: [] }];
    }
    async evaluateAllAlarms() { return []; }
  };
  const dependencies = {
    '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => quiet },
    '@/lib/alarms/detection-engine': { AlarmDetectionEngine: engine },
    '@/lib/integrations/fortianalyzer': { initSharedFortiAnalyzerService: () => ({}), getFortiAnalyzerLoginHealth: () => ({ consecutiveFailures: 0 }) },
    '@/lib/integrations/vmware': {}, '@/lib/integrations/fortigate': {}, '@/lib/firewall/connector-factory': {},
    '@/lib/alarms/queries': { ALARM_QUERY_REGISTRY: new Map(), BYPASS_CACHE_ALARMS: new Set() },
    '@/lib/alarms/suppression-engine': { createDefaultSuppressionEngine: () => ({}) },
    '@/lib/license/client': { initLicense: async () => {}, isLicenseValid: () => state.licensed },
    '@/lib/security/integration-credentials': { unprotectIntegrationConfig: value => value },
    '@/lib/notifications/email': { sendAlarmEmail: async () => { state.mail++; return true; }, getEmailStats: () => ({}) },
    '@/lib/notifications/dlq-worker': { getDLQStats: async () => { if (state.dlqWait) await state.dlqWait; return { pending: 1 }; },
      processDLQ: async () => { state.effects.push('dlq'); return {}; }, cleanupDLQ: async () => {} },
    nodemailer: { createTransport: () => ({ sendMail: async () => { state.mail++; return { messageId: 'fixture' }; } }) },
    zlib: require('node:zlib'),
  };
  const makeLoader = (globalRoot = {}) => moduleLoader(dependencies, { ...timer, globalThis: globalRoot, AbortController, AbortSignal, console: quiet });
  const load = makeLoader();
  return { state, prisma, timer, load, makeLoader, run: () => load('lib/alarms/alarm-runner.ts').runAlarmCheck(),
    lease: () => load('lib/alarms/run-lease.ts'), context: () => load('lib/alarms/execution-context.ts') };
}
const tests = [], test = (name, fn) => tests.push([name, fn]);
test('same module overlap claims once and returns busy instead of prior success', async f => {
  await f.run(); f.state.effects = [];
  const hold = deferred(); f.state.wait = hold.promise;
  const active = f.run(); await f.timer.flush();
  const overlap = await f.run(); assert.equal(overlap.success, false); assert.match(overlap.error, /progress/);
  hold.resolve(); await active; assert.equal(f.state.sourceCalls, 2);
});
test('independent module instances atomically admit one runner', async f => {
  const hold = deferred(); f.state.wait = hold.promise;
  const other = f.makeLoader()('lib/alarms/alarm-runner.ts');
  const a = f.run(), b = other.runAlarmCheck(); await f.timer.flush();
  assert.equal(f.state.sourceCalls, 1); assert.equal(f.state.logs.filter(r => r.status === 'RUNNING').length, 1);
  hold.resolve(); const results = await Promise.all([a, b]); assert.equal(results.filter(r => r.success).length, 1);
});
test('failed database claim fails closed without source calls', async f => {
  f.state.claimError = true; const result = await f.run(); assert.equal(result.success, false); assert.equal(f.state.sourceCalls, 0);
});
test('startup cannot orphan a live owner', async f => {
  const claim = await f.lease().claimAlarmRun();
  await f.load('lib/alarms/alarm-runner.ts').initializeAlarmRunner();
  assert.equal(f.state.logs[0].status, 'RUNNING'); assert.equal(JSON.parse(f.state.lease.value).owner, claim.owner);
});
test('crashed expired owner is orphaned and a new owner can claim', async f => {
  const claim = await f.lease().claimAlarmRun(); await f.timer.advance(12 * 60000 + 1);
  const next = await f.lease().claimAlarmRun(); assert.ok(next); assert.notEqual(next.owner, claim.owner);
  assert.equal(f.state.logs[0].status, 'ORPHANED');
});
test('recent legacy RUNNING remains protected while stale legacy rows recover', async f => {
  f.state.logs.push({ id: 'legacy', status: 'RUNNING', checkTime: new f.timer.Date() });
  assert.equal(await f.lease().claimAlarmRun(), null);
  await f.timer.advance(12 * 60000 + 1); assert.ok(await f.lease().claimAlarmRun()); assert.equal(f.state.logs[0].status, 'ORPHANED');
});
test('malformed ownership records fail closed', async f => {
  f.state.lease = { key: 'alarm-runner-lease-v1', value: '{}' };
  await assert.rejects(f.lease().claimAlarmRun(), e => e.code === 'ALARM_LEASE_INVALID'); assert.equal(f.state.logs.length, 0);
});
test('stale finalization cannot release or rewrite a successor', async f => {
  const old = await f.lease().claimAlarmRun(); await f.timer.advance(12 * 60000 + 1); const current = await f.lease().claimAlarmRun();
  await assert.rejects(f.lease().finishAlarmRun(old, { status: 'SUCCESS' }), e => e.code === 'ALARM_LEASE_LOST');
  assert.equal(JSON.parse(f.state.lease.value).owner, current.owner); assert.equal(f.state.logs[1].status, 'RUNNING');
});
test('timeout fences late actual engine writes and notifications', async f => {
  const hold = deferred(); f.state.wait = hold.promise;
  const Engine = f.load('lib/alarms/detection-engine.ts').AlarmDetectionEngine;
  f.state.late = () => new Engine(null).fireAlarm(alarm, [log()]);
  const active = f.run(); await f.timer.flush(); await f.timer.advance(10 * 60000);
  const result = await active; assert.equal(result.success, false); assert.equal(f.state.logs[0].status, 'FAILED');
  hold.resolve(); await f.timer.flush(); assert.equal(f.state.mail, 0); assert.deepEqual(f.state.effects, []);
  assert.equal(f.state.logs[0].status, 'FAILED');
});
test('timeout also covers delivery postprocessing, not only detection', async f => {
  const hold = deferred(); f.state.dlqWait = hold.promise;
  const active = f.run(); await f.timer.flush(); await f.timer.advance(10 * 60000); await active;
  hold.resolve(); await f.timer.flush(); assert.deepEqual(f.state.effects, []);
});
test('cancellation during finalization cannot commit a late SUCCESS', async f => {
  const hold = deferred(), update = f.prisma.alarmCheckLog.updateMany;
  f.prisma.alarmCheckLog.updateMany = async args => { if (args.data.status === 'SUCCESS') await hold.promise; return update(args); };
  const active = f.run(); await f.timer.flush(); await f.timer.advance(10 * 60000);
  hold.resolve(); const result = await active;
  assert.equal(result.success, false); assert.equal(f.state.logs[0].status, 'FAILED');
});
test('a completed run clears its deadline and releases for the next check', async f => {
  assert.equal((await f.run()).success, true); assert.equal(f.timer.timers.size, 0);
  assert.equal((await f.run()).success, true); assert.equal(f.state.logs.length, 2);
});
test('scoped Prisma rejects a late read before its caller can mutate', async f => {
  const claim = await f.lease().claimAlarmRun(), scope = f.lease().createAlarmExecution(claim), hold = deferred();
  f.prisma.alarmDefinition.findFirst = () => hold.promise;
  const db = f.load('lib/alarms/execution-prisma.ts').alarmExecutionPrisma(f.prisma);
  const work = f.context().withAlarmExecution(scope.execution, () => db.alarmDefinition.findFirst());
  scope.cancel(); hold.resolve({}); await assert.rejects(work, e => e.code === 'ALARM_RUN_CANCELLED');
});
test('SMTP config resumed after cancellation starts neither transport nor attempts', async f => {
  const claim = await f.lease().claimAlarmRun(), scope = f.lease().createAlarmExecution(claim), hold = deferred();
  f.state.smtpWait = hold.promise;
  const work = f.context().withAlarmExecution(scope.execution, () => f.load('lib/notifications/email.ts').sendAlarmEmail({
    alarmCode: 'FIXTURE', alarmName: 'Fixture', severity: 'ALARM_HIGH', category: 'SYSTEM', title: 'Fixture', message: 'Fixture', timestamp: new f.timer.Date(),
  }));
  await f.timer.flush(); scope.cancel(); hold.resolve(); await assert.rejects(work);
  assert.equal(f.state.mail, 0); assert.deepEqual(f.state.effects, []);
});
test('SMTP handoff verifies ownership even before the local deadline', async f => {
  const claim = await f.lease().claimAlarmRun(), scope = f.lease().createAlarmExecution(claim);
  f.state.lease.value = JSON.stringify({ ...claim, owner: 'fixture-successor' });
  await assert.rejects(f.context().withAlarmExecution(scope.execution, () => f.load('lib/notifications/email.ts').sendAlarmEmail({
    alarmCode: 'FIXTURE', alarmName: 'Fixture', severity: 'ALARM_HIGH', category: 'SYSTEM', title: 'Fixture', message: 'Fixture', timestamp: new f.timer.Date(),
  })));
  assert.equal(f.state.mail, 0); assert.deepEqual(f.state.effects, []);
});
test('the active owner can deliver through the real email decision path', async f => {
  const claim = await f.lease().claimAlarmRun(), scope = f.lease().createAlarmExecution(claim);
  const sent = await f.context().withAlarmExecution(scope.execution, () => f.load('lib/notifications/email.ts').sendAlarmEmail({
    alarmCode: 'FIXTURE', alarmName: 'Fixture', severity: 'ALARM_HIGH', category: 'SYSTEM', title: 'Fixture', message: 'Fixture', timestamp: new f.timer.Date(),
  }));
  assert.equal(sent, true); assert.equal(f.state.mail, 1); assert.deepEqual(f.state.effects, ['attempt']);
});
test('source deadline aborts its request when the run is cancelled', async f => {
  const claim = await f.lease().claimAlarmRun(), scope = f.lease().createAlarmExecution(claim);
  let signal;
  const fa = { startLogSearch: async (_a, _b, _c, options) => { signal = options.signal; return new Promise(() => {}); } };
  const promise = f.context().withAlarmExecution(scope.execution, () => f.load('lib/alarms/queries/fortianalyzer-search.ts').startFortiAnalyzerSearch(fa, 'event', 1));
  await f.timer.flush(); scope.cancel(); await assert.rejects(promise); assert.equal(signal.aborted, true);
});
test('background work can detach without inheriting the cancelled run', async f => {
  const claim = await f.lease().claimAlarmRun(), scope = f.lease().createAlarmExecution(claim);
  const c = f.context(); let observed;
  c.withAlarmExecution(scope.execution, () => c.withoutAlarmExecution(() => f.timer.setTimeout(() => { observed = c.currentAlarmExecution(); }, 100)));
  scope.cancel(); await f.timer.advance(100); assert.equal(observed, undefined);
});
test('a search stage timeout fences late effects while preserving its parent run', async f => {
  const claim = await f.lease().claimAlarmRun(), scope = f.lease().createAlarmExecution(claim), hold = deferred();
  const c = f.context(), db = f.load('lib/alarms/execution-prisma.ts').alarmExecutionPrisma(f.prisma);
  let lateError;
  const stage = c.withAlarmExecution(scope.execution, () => c.withAlarmStage(async () => {
    await hold.promise;
    try { await db.alarmEvent.update({}); } catch (error) { lateError = error; throw error; }
  }, 1000));
  const rejected = assert.rejects(stage, e => e.code === 'ALARM_STAGE_TIMEOUT');
  await f.timer.advance(1000); await rejected;
  hold.resolve(); await f.timer.flush(); assert.equal(lateError.code, 'ALARM_STAGE_TIMEOUT'); assert.deepEqual(f.state.effects, []);
  await c.withAlarmExecution(scope.execution, () => db.alarmEvent.update({})); assert.deepEqual(f.state.effects, ['event-update']);
});
test('watchdog startup is shared across reloads and stops pending timers', async f => {
  const shared = {}, a = f.makeLoader(shared)('lib/alarms/alarm-monitor.ts'), b = f.makeLoader(shared)('lib/alarms/alarm-monitor.ts');
  assert.equal(a.startAlarmMonitor(), b.startAlarmMonitor()); assert.equal(f.timer.timers.size, 1);
  a.stopAlarmMonitor(); assert.equal(f.timer.timers.size, 0);
});
test('stopping an inactive watchdog also cancels its pending recovery restart', async f => {
  const monitor = f.load('lib/alarms/alarm-monitor.ts').getAlarmMonitor();
  monitor.scheduleRecovery(); monitor.stop();
  assert.equal(f.timer.timers.size, 0); await f.timer.advance(10 * 60000); assert.equal(monitor.getStatus().running, false);
});
test('retention start is idempotent before first run and after module reload', async f => {
  const shared = {}, a = f.makeLoader(shared)('lib/alarms/retention-service.ts'), b = f.makeLoader(shared)('lib/alarms/retention-service.ts');
  a.startAlarmRetentionScheduler(); b.startAlarmRetentionScheduler(); assert.equal(f.timer.timers.size, 1);
  const firstRun = [...f.timer.timers.values()][0].due;
  await f.timer.advance(firstRun - f.timer.Date.now()); assert.equal([...f.timer.timers.values()].filter(t => t.interval).length, 1);
  a.stopAlarmRetentionScheduler(); assert.equal(f.timer.timers.size, 0);
});
test('retention stop before first run cancels startup and allows one restart', async f => {
  const r = f.load('lib/alarms/retention-service.ts'); r.startAlarmRetentionScheduler(); r.stopAlarmRetentionScheduler();
  assert.equal(f.timer.timers.size, 0); r.startAlarmRetentionScheduler(); r.startAlarmRetentionScheduler(); assert.equal(f.timer.timers.size, 1);
});
test('scheduler stop invalidates a queued immediate tick', async f => {
  const scheduler = f.load('lib/alarm-scheduler.ts'); scheduler.startAlarmScheduler(); scheduler.stopAlarmScheduler();
  for (const task of f.timer.microtasks) task(); await f.timer.flush(); assert.equal(f.state.sourceCalls, 0);
});
test('VMware-only checks cannot establish full-source SUCCESS recovery', async f => {
  const result = await f.load('lib/alarms/alarm-runner.ts').runAlarmCheck({ sources: ['vmware'], requireConfiguredSources: true });
  assert.equal(result.success, true); assert.equal(f.state.logs[0].status, 'SOURCE_SUCCESS'); assert.equal(f.state.sourceCalls, 0);
});
async function main() {
  for (const [name, run] of tests) { await run(fixture()); console.log(`PASS ${name}`); }
  console.log(`Alarm ownership regressions passed (${tests.length} scenarios; isolated I/O and virtual time).`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { fixture, deferred, clock };
