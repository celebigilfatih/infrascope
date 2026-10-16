// Opt-in real PostgreSQL ownership, independent processes and fenced-transaction checks.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_ALARM_RUN_DB_TEST !== '1' || url.protocol !== 'postgresql:'
  || url.hostname !== '127.0.0.1' || !/^\/[a-z0-9_]+_occurrence_tests$/.test(url.pathname)) {
  throw new Error('Explicit opt-in and a local disposable *_occurrence_tests DB are required');
}
const { PrismaClient } = require('@prisma/client');
const { moduleLoader, alarm, log } = require('./check-alarm-occurrences.cjs');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
const quiet = new Proxy({}, { get: () => () => {} }), mail = [];
const load = moduleLoader({ '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => quiet },
  '@/lib/integrations/fortianalyzer': {}, '@/lib/integrations/vmware': {}, '@/lib/integrations/fortigate': {},
  '@/lib/firewall/connector-factory': {}, '@/lib/alarms/queries': { ALARM_QUERY_REGISTRY: new Map(), BYPASS_CACHE_ALARMS: new Set() },
  '@/lib/alarms/suppression-engine': { createDefaultSuppressionEngine: () => ({}) },
  '@/lib/notifications/email': { getEmailStats: () => ({}), sendAlarmEmail: async data => { mail.push(data); return true; } },
}, { AbortController, AbortSignal, console: quiet });
const lease = load('lib/alarms/run-lease.ts'), context = load('lib/alarms/execution-context.ts');
const db = load('lib/alarms/execution-prisma.ts').alarmExecutionPrisma(prisma);
const fixtureKey = `b19-fixture-${randomUUID()}`;
const ownedLogs = new Set(), workers = new Set();
let rule, passed = 0, ownsFixture = false;
function pass(name) { passed++; console.log(`PASS PostgreSQL: ${name}`); }
async function claim() { const value = await lease.claimAlarmRun(); if (value) ownedLogs.add(value.runLogId); return value; }
async function expire() {
  const row = await prisma.systemConfig.findUniqueOrThrow({ where: { key: lease.ALARM_RUN_LEASE_KEY } });
  await prisma.systemConfig.update({ where: { key: lease.ALARM_RUN_LEASE_KEY }, data: { value: JSON.stringify({ ...JSON.parse(row.value), expiresAt: Date.now() - 1 }) } });
}
const summary = status => ({ status, totalAlarms: 0, triggeredCount: 0, errorCount: 0, durationMs: 0 });
function startWorker() {
  const child = fork(__filename, ['--claim-worker'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  workers.add(child); child.on('exit', () => workers.delete(child));
  let errors = ''; child.stderr.on('data', chunk => { errors += chunk; });
  const ready = new Promise((resolve, reject) => { child.on('message', msg => { if (msg.type === 'ready') resolve(); }); child.on('error', reject); });
  const result = new Promise((resolve, reject) => {
    child.on('message', msg => { if (msg.type === 'result') resolve(msg.claim); if (msg.type === 'failure') reject(new Error(msg.error)); });
    child.on('error', reject); child.on('exit', code => { if (code) reject(new Error(errors || `Worker exited ${code}`)); });
  });
  return { ready, result, go: () => child.send('go') };
}
async function main() {
  // This suite owns a singleton lease. Refuse a populated installation even if its URL was mislabeled.
  assert.equal(await prisma.alarmCheckLog.count(), 0, 'An empty disposable alarm-check store is required');
  assert.equal(await prisma.systemConfig.count({ where: { key: lease.ALARM_RUN_LEASE_KEY } }), 0);
  ownsFixture = true;
  const otherPool = new PrismaClient({ datasources: { db: { url: url.href } } });
  try {
    const before = await Promise.all([prisma.alarmCheckLog.findFirst({ where: { status: 'RUNNING' } }), otherPool.alarmCheckLog.findFirst({ where: { status: 'RUNNING' } })]);
    assert.ok(before.every(row => row === null));
    const data = { checkTime: new Date(), totalAlarms: 0, triggeredCount: 0, errorCount: 0, durationMs: 0, status: 'RUNNING' };
    const duplicates = await Promise.all([prisma.alarmCheckLog.create({ data }), otherPool.alarmCheckLog.create({ data })]);
    duplicates.forEach(row => ownedLogs.add(row.id));
    assert.equal(await prisma.alarmCheckLog.count({ where: { status: 'RUNNING' } }), 2);
    await prisma.alarmCheckLog.deleteMany({ where: { id: { in: duplicates.map(row => row.id) } } });
    pass('negative control: separate read/create guards admit two concurrent RUNNING rows');
  } finally { await otherPool.$disconnect(); }
  const group = Array.from({ length: 4 }, startWorker);
  await Promise.all(group.map(w => w.ready)); group.forEach(w => w.go());
  const results = await Promise.all(group.map(w => w.result));
  const winners = results.filter(Boolean); assert.equal(winners.length, 1); ownedLogs.add(winners[0].runLogId);
  assert.equal(await prisma.alarmCheckLog.count({ where: { status: 'RUNNING' } }), 1);
  pass('four independent Node processes and client pools admit exactly one owner');
  await lease.reconcileAlarmRuns();
  assert.equal((await prisma.alarmCheckLog.findUniqueOrThrow({ where: { id: winners[0].runLogId } })).status, 'RUNNING');
  pass('startup preserves another process active owner and log');
  await expire(); const next = await claim(); assert.ok(next);
  assert.equal((await prisma.alarmCheckLog.findUniqueOrThrow({ where: { id: winners[0].runLogId } })).status, 'ORPHANED');
  pass('a dead process lease can expire and recover without deleting history');
  await assert.rejects(lease.finishAlarmRun(winners[0], summary('SUCCESS')), e => e.code === 'ALARM_LEASE_LOST');
  assert.equal(JSON.parse((await prisma.systemConfig.findUniqueOrThrow({ where: { key: lease.ALARM_RUN_LEASE_KEY } })).value).owner, next.owner);
  pass('stale finalization cannot release the successor lease');
  const oldScope = lease.createAlarmExecution(winners[0]);
  await assert.rejects(context.withAlarmExecution(oldScope.execution, () => db.systemConfig.create({ data: { key: fixtureKey, value: 'stale' } })), e => e.code === 'ALARM_LEASE_LOST');
  assert.equal(await prisma.systemConfig.count({ where: { key: fixtureKey } }), 0);
  pass('superseded owner cannot commit a real database mutation');
  const active = lease.createAlarmExecution(next);
  await assert.rejects(context.withAlarmExecution(active.execution, () => db.$transaction(async tx => {
    await tx.systemConfig.create({ data: { key: fixtureKey, value: 'must-rollback' } }); active.cancel();
  })), e => e.code === 'ALARM_RUN_CANCELLED');
  assert.equal(await prisma.systemConfig.count({ where: { key: fixtureKey } }), 0);
  pass('cancellation before commit rolls back an already-issued transaction write');
  const valid = lease.createAlarmExecution(next);
  await context.withAlarmExecution(valid.execution, () => db.systemConfig.create({ data: { key: fixtureKey, value: 'current' } }));
  assert.equal((await prisma.systemConfig.findUniqueOrThrow({ where: { key: fixtureKey } })).value, 'current');
  pass('the current owner retains normal guarded mutation behavior');
  const raw = await context.withAlarmExecution(valid.execution, () => db.$queryRaw`SELECT 1 AS readable`);
  assert.equal(raw[0].readable, 1);
  await context.withAlarmExecution(valid.execution, () => db.$executeRaw`UPDATE "system_configs" SET "value" = 'guarded-raw' WHERE "key" = ${fixtureKey}`);
  assert.equal((await prisma.systemConfig.findUniqueOrThrow({ where: { key: fixtureKey } })).value, 'guarded-raw');
  pass('NMS-style raw reads and mutations retain their tagged-SQL contract under the fence');
  const { id: _id, ...definition } = alarm;
  rule = await prisma.alarmDefinition.create({ data: { ...definition, code: `B19_${randomUUID()}` } });
  const engine = new (load('lib/alarms/detection-engine.ts').AlarmDetectionEngine)(null);
  await context.withAlarmExecution(valid.execution, () => engine.fireAlarm(rule, [log()]));
  assert.equal(await prisma.alarmEvent.count({ where: { alarmId: rule.id } }), 1); assert.equal(mail.length, 1);
  pass('real engine and incident transaction record and notify under valid ownership');
  valid.cancel();
  await assert.rejects(context.withAlarmExecution(valid.execution, () => db.$executeRaw`UPDATE "system_configs" SET "value" = 'late' WHERE "key" = ${fixtureKey}`), e => e.code === 'ALARM_RUN_CANCELLED');
  assert.equal((await prisma.systemConfig.findUniqueOrThrow({ where: { key: fixtureKey } })).value, 'guarded-raw');
  pass('cancelled raw SQL cannot bypass the scoped database fence');
  await assert.rejects(context.withAlarmExecution(valid.execution, () => engine.fireAlarm(rule, [log({ eventtime: '1792065600000000001' })])), e => e.code === 'ALARM_RUN_CANCELLED');
  assert.equal(await prisma.alarmEvent.count({ where: { alarmId: rule.id } }), 1); assert.equal(mail.length, 1);
  pass('cancelled actual engine cannot create another occurrence or notification');
  const service = load('lib/alarms/incident-service.ts');
  await assert.rejects(context.withAlarmExecution(valid.execution, () => service.recordAlarmOccurrence({ alarm: rule, title: 'Fixture', message: 'Fixture', rawData: [log()] })), e => e.code === 'ALARM_RUN_CANCELLED');
  pass('direct incident recording is fenced independently of engine entry checks');
  await lease.finishAlarmRun(next, summary('SUCCESS'));
  const fresh = await claim(); assert.ok(fresh); await lease.finishAlarmRun(fresh, summary('SUCCESS'));
  pass('owner completion releases atomically for a new check');
  const recent = await prisma.alarmCheckLog.create({ data: { checkTime: new Date(), totalAlarms: 0, triggeredCount: 0, errorCount: 0, durationMs: 0, status: 'RUNNING' } }); ownedLogs.add(recent.id);
  assert.equal(await claim(), null); await lease.reconcileAlarmRuns();
  assert.equal((await prisma.alarmCheckLog.findUniqueOrThrow({ where: { id: recent.id } })).status, 'RUNNING');
  await prisma.alarmCheckLog.update({ where: { id: recent.id }, data: { checkTime: new Date(Date.now() - lease.ALARM_RUN_LEASE_MS - 1000) } });
  const legacyRecovered = await claim(); assert.ok(legacyRecovered); await lease.finishAlarmRun(legacyRecovered, summary('SUCCESS'));
  pass('recent legacy rows block claims and only expired legacy rows become orphaned');
  await prisma.systemConfig.update({ where: { key: lease.ALARM_RUN_LEASE_KEY }, data: { value: '{}' } });
  await assert.rejects(claim(), e => e.code === 'ALARM_LEASE_INVALID');
  pass('malformed persisted ownership fails closed');
  console.log(`Alarm ownership PostgreSQL regressions passed (${passed} scenarios; four independent worker processes).`);
}
async function cleanup() {
  if (!ownsFixture) { await prisma.$disconnect(); return; }
  for (const worker of workers) worker.kill();
  if (rule) {
    const incidents = await prisma.alarmIncident.findMany({ where: { alarmId: rule.id }, select: { id: true } });
    await prisma.alarmEvent.deleteMany({ where: { alarmId: rule.id } });
    await prisma.alarmIncident.deleteMany({ where: { alarmId: rule.id } });
    await prisma.auditLog.deleteMany({ where: { entity: 'AlarmIncident', entityId: { in: incidents.map(r => r.id) } } });
    await prisma.alarmDefinition.delete({ where: { id: rule.id } });
  }
  await prisma.alarmCheckLog.deleteMany({ where: { id: { in: [...ownedLogs] } } });
  await prisma.systemConfig.deleteMany({ where: { key: { in: [fixtureKey, lease.ALARM_RUN_LEASE_KEY] } } });
  await prisma.$disconnect();
}
if (process.argv.includes('--claim-worker')) {
  process.send({ type: 'ready' });
  process.once('message', async () => {
    try { const claim = await lease.claimAlarmRun(); process.send({ type: 'result', claim }); }
    catch (e) { process.send({ type: 'failure', error: e.message }); process.exitCode = 1; }
    finally { await prisma.$disconnect(); process.disconnect(); }
  });
} else main().catch(e => { console.error(e); process.exitCode = 1; }).finally(cleanup);
