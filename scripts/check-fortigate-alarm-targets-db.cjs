// Explicitly opt-in: never use an installation database. Source transport and SMTP remain synthetic.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_FG_ALARM_DB_TEST !== '1' || url.protocol !== 'postgresql:'
  || url.hostname !== '127.0.0.1' || !/^\/[a-z0-9_]+_occurrence_tests$/.test(url.pathname)) {
  throw new Error('An explicit opt-in and a local disposable *_occurrence_tests database are required');
}
const { PrismaClient } = require('@prisma/client');
const { fixture } = require('./check-fortigate-alarm-targets.cjs');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
async function check(name, action, businessHours = false) {
  const f = fixture({ database: prisma });
  const template = f.state.rules[0];
  const code = businessHours ? 'SSLVPN_BUSINESS_HOURS' : `B10_${randomUUID()}`;
  const { id: _id, ...data } = template;
  const rule = await prisma.alarmDefinition.create({ data: { ...data, code } });
  f.state.rules = [rule];
  if (businessHours) {
    f.state.now = Date.parse('2026-10-16T09:00:00Z');
    f.state.users[0].last_login_timestamp = f.state.now / 1000 - 60;
  }
  // Match the source clock without relying on the host date.
  const evaluate = async () => {
    const previous = await prisma.alarmEvent.findMany({ where: { alarmId: rule.id }, select: { id: true } });
    await f.evaluate();
    await prisma.alarmEvent.updateMany({ where: { alarmId: rule.id, id: { notIn: previous.map(e => e.id) } },
      data: { createdAt: new Date(f.state.now) } });
  };
  try {
    await action({ ...f, rule, evaluate,
      events: () => prisma.alarmEvent.findMany({ where: { alarmId: rule.id } }),
      incidents: () => prisma.alarmIncident.findMany({ where: { alarmId: rule.id } }),
    });
    console.log(`PASS PostgreSQL: ${name}`);
  } finally {
    await prisma.alarmEvent.deleteMany({ where: { alarmId: rule.id } });
    await prisma.alarmIncident.deleteMany({ where: { alarmId: rule.id } });
    await prisma.alarmDefinition.delete({ where: { id: rule.id } });
  }
}
async function main() {
  await check('same user on two targets has independent event and incident uniqueness', async f => {
    await f.evaluate(); const events = await f.events(), incidents = await f.incidents();
    assert.equal(events.length, 2); assert.equal(incidents.length, 2); assert.equal(f.state.mail.length, 2);
    assert.equal(new Set(events.map(e => e.sourceEventId)).size, 2);
    assert.equal(new Set(incidents.map(i => i.fingerprint)).size, 2);
    assert.equal(new Set(f.state.mail.map(m => m.incidentId)).size, 2);
  });
  await check('real relation-filter cooldown does not suppress a new target', async f => {
    const second = f.state.configs.pop(); await f.evaluate();
    f.state.configs.push(second); await f.evaluate();
    assert.equal((await f.events()).length, 2); assert.equal(f.state.mail.length, 2);
    assert.ok((await f.incidents()).every(i => i.occurrenceCount === 1));
  });
  await check('business-hours target-wide cooldown remains independent across firewalls', async f => {
    const second = f.state.configs.pop(); await f.evaluate();
    f.state.configs.push(second); await f.evaluate();
    assert.equal((await f.events()).length, 2); assert.equal(f.state.mail.length, 2);
    assert.ok((await f.incidents()).every(i => i.entityType === 'fortigate-target'));
  }, true);
  await check('five concurrent checks commit and notify each target session once', async f => {
    const checks = await Promise.all(Array.from({ length: 5 }, () => f.engine.evaluateAllAlarms({ sources: ['fortigate-sslvpn'] })));
    assert.ok(checks.flat().every(result => !result.error || result.error === 'cooldown-active'));
    assert.equal((await f.events()).length, 2); assert.equal((await f.incidents()).length, 2);
    assert.equal(f.state.mail.length, 2);
  });
  await check('replayed sessions after cooldown do not notify; new sessions reuse only their own incident', async f => {
    await f.evaluate(); f.state.now += 61 * 60000; f.state.users[0].duration += 3600; await f.evaluate();
    assert.equal((await f.events()).length, 2); assert.equal(f.state.mail.length, 2);
    f.state.users[0].last_login_timestamp = f.state.now / 1000 - 30; await f.evaluate();
    assert.equal((await f.events()).length, 4); assert.equal(f.state.mail.length, 4);
    assert.ok((await f.incidents()).every(i => i.occurrenceCount === 2));
  });
  console.log('PostgreSQL FortiGate alarm target regressions passed (5 scenarios; actual relations, transactions and uniqueness; synthetic transport and SMTP).');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
