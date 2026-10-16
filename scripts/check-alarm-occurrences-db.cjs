// Opt-in PostgreSQL regression. Only use a dedicated, migrated, disposable DB.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_OCCURRENCE_DB_TEST !== '1'
  || url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1'
  || !/^\/[a-z0-9_]+_occurrence_tests$/.test(url.pathname)) {
  throw new Error('An explicit opt-in and a local dedicated *_occurrence_tests database are required');
}

const { PrismaClient } = require('@prisma/client');
const { moduleLoader, alarm, log, input } = require('./check-alarm-occurrences.cjs');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
const mail = [];
const quiet = new Proxy({}, { get: () => () => {} });
const load = moduleLoader({
  '@/lib/prisma': { prisma },
  '@/lib/logger': { createLogger: () => quiet },
  '@/lib/integrations/fortianalyzer': {}, '@/lib/integrations/vmware': {}, '@/lib/integrations/fortigate': {},
  '@/lib/firewall/connector-factory': {},
  '@/lib/alarms/queries': { ALARM_QUERY_REGISTRY: new Map(), BYPASS_CACHE_ALARMS: new Set() },
  '@/lib/alarms/suppression-engine': { createDefaultSuppressionEngine: () => ({}) },
  '@/lib/notifications/email': {
    sendAlarmEmail: async data => { mail.push(data); return true; }, getEmailStats: () => ({}),
  },
});
const service = load('lib/alarms/incident-service.ts');
const { AlarmDetectionEngine } = load('lib/alarms/detection-engine.ts');
const actor = { type: 'SYSTEM', name: 'occurrence-regression' };

async function withRule(name, test) {
  mail.length = 0;
  const { id: _id, ...data } = alarm;
  const rule = await prisma.alarmDefinition.create({ data: { ...data, code: `B01_${randomUUID()}` } });
  const engine = new AlarmDetectionEngine(null, { fortiAnalyzerConfigId: 'fixture-analyzer-a' });
  const fire = entry => engine.fireAlarm(rule, [entry]);
  const close = async id => {
    await service.transitionAlarmIncident({ incidentId: id, action: 'RESOLVE', actor });
    await service.transitionAlarmIncident({ incidentId: id, action: 'CLOSE', actor });
  };
  try {
    await test({ rule, fire, close });
    console.log(`PASS PostgreSQL: ${name}`);
  } finally {
    const incidents = await prisma.alarmIncident.findMany({ where: { alarmId: rule.id }, select: { id: true } });
    await prisma.alarmEvent.deleteMany({ where: { alarmId: rule.id } });
    await prisma.alarmIncident.deleteMany({ where: { alarmId: rule.id } });
    await prisma.auditLog.deleteMany({ where: { entity: 'AlarmIncident', entityId: { in: incidents.map(row => row.id) } } });
    await prisma.alarmDefinition.delete({ where: { id: rule.id } });
  }
}

async function main() {
  await withRule('repeat, new source time and physical device', async ({ rule, fire }) => {
    await fire(log()); await fire(log());
    assert.equal(await prisma.alarmEvent.count({ where: { alarmId: rule.id } }), 1);
    assert.equal(mail.length, 1);
    await fire(log({ eventtime: '1792065600000000001' }));
    await fire(log({ devid: 'FIXTURE-B', devname: 'fixture-b' }));
    assert.equal(await prisma.alarmEvent.count({ where: { alarmId: rule.id } }), 3);
    assert.equal(mail.length, 3);
    const incident = await prisma.alarmIncident.findFirst({ where: { alarmId: rule.id } });
    assert.equal(incident.occurrenceCount, 3);
  });
  await withRule('closed incident and concurrent duplicate delivery', async ({ rule, fire, close }) => {
    await fire(log());
    const first = await prisma.alarmIncident.findFirst({ where: { alarmId: rule.id } });
    await close(first.id); await fire(log());
    assert.equal(mail.length, 1);
    const next = log({ eventtime: '1792065601000000000', itime_t: 1792065601 });
    await Promise.all(Array.from({ length: 5 }, () => fire(next)));
    assert.equal(await prisma.alarmEvent.count({ where: { alarmId: rule.id } }), 2);
    const incidents = await prisma.alarmIncident.findMany({ where: { alarmId: rule.id } });
    assert.equal(incidents.length, 2);
    assert.equal(incidents.find(row => row.id === first.id).status, 'CLOSED');
    assert.equal(incidents.find(row => row.id !== first.id).occurrenceCount, 1);
    assert.equal(mail.length, 2, 'Only the committed new occurrence may notify');
  });
  await withRule('legacy replay and new event after upgrade', async ({ rule, fire, close }) => {
    const previous = await service.recordAlarmOccurrence({ ...input(log()), alarm: rule, sourceEventId: log().logid });
    await close(previous.incident.id);
    const before = await prisma.alarmEvent.findUnique({ where: { id: previous.event.id } });
    await fire(log());
    assert.equal(mail.length, 0);
    assert.deepEqual(await prisma.alarmEvent.findUnique({ where: { id: previous.event.id } }), before);
    await fire(log({ eventtime: '1792065601000000000', itime_t: 1792065601 }));
    assert.equal(await prisma.alarmEvent.count({ where: { alarmId: rule.id } }), 2);
    assert.equal(mail.length, 1);
  });
  console.log('PostgreSQL occurrence regressions passed (real transactions, uniqueness and five concurrent deliveries; SMTP mocked).');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
