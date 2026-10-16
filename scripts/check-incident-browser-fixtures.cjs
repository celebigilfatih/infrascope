// Disposable records for browser E2E. Only this run's exact IDs may be removed.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS fixture CLI. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const directory = process.env.INFRASCOPE_INCIDENT_FIXTURE_DIR ? path.resolve(process.env.INFRASCOPE_INCIDENT_FIXTURE_DIR) : path.resolve(__dirname, '../output/incident-browser-e2e');
const manifestPath = path.join(directory, 'manifest.json');
const operationalSelect = { id: true, status: true, legalHold: true, assignedToId: true, assignedTo: true, acknowledgedAt: true, resolvedAt: true, resolutionReason: true, closedAt: true, closeReason: true };
const json = value => JSON.parse(JSON.stringify(value));
async function create() {
  try { const existing = JSON.parse(await fs.readFile(manifestPath, 'utf8')); if (!existing.cleaned) throw new Error('Clean the previous run first'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const prefix = `E2E-BULK-${randomUUID().slice(0, 8)}`;
  const baseline = json(await db.alarmIncident.findMany({ select: operationalSelect, orderBy: { id: 'asc' } }));
  const reasons = { resolve: `${prefix} çözüm kontrolü\nBellek ve bağlantı kontrolleri tamamlandı.`, close: `${prefix} kapatma kontrolü\nSon kontrol tamamlandı; operasyon kapatıldı.` };
  const rows = [];
  const rule = await db.$transaction(async tx => {
    const alarm = await tx.alarmDefinition.create({ data: { code: prefix, name: `${prefix} disposable browser fixtures`, description: 'Temporary browser E2E only', category: 'OPERATIONAL', severity: 'ALARM_INFO', source: 'fixture', enabled: false, notifyEmail: false, detectionLogic: { fixture: prefix }, cooldownMinutes: 1440 } });
    for (const group of ['resolve', 'close']) for (const status of ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED']) {
      const id = `${prefix}-${group}-${status}`;
      const title = `${prefix}-${group} / ${status}`;
      const now = new Date();
      const acknowledged = status !== 'OPEN', resolved = ['RESOLVED', 'CLOSED'].includes(status), closed = status === 'CLOSED';
      const seedReason = 'E2E başlangıç kaydı';
      const record = await tx.alarmIncident.create({ data: { id, alarmId: alarm.id, fingerprint: id, activeFingerprint: closed ? null : id, source: 'fixture', severity: 'ALARM_INFO', category: 'OPERATIONAL', title, message: `Disposable test incident ${prefix}`, status,
        acknowledgedAt: acknowledged ? now : null, acknowledgedBy: acknowledged ? 'E2E Fixture' : null,
        resolvedAt: resolved ? now : null, resolvedBy: resolved ? 'E2E Fixture' : null, resolutionReason: resolved ? seedReason : null,
        closedAt: closed ? now : null, closedBy: closed ? 'E2E Fixture' : null, closeReason: closed ? seedReason : null,
        occurrences: { create: { alarmId: alarm.id, title, message: 'Synthetic browser E2E occurrence', severity: 'ALARM_INFO', deviceName: 'E2E-TEST-DEVICE', acknowledged, acknowledgedAt: acknowledged ? now : null, acknowledgedBy: acknowledged ? 'E2E Fixture' : null, sourceEventId: id } },
        transitions: { create: [
          { type: 'CREATED', toStatus: 'OPEN', actorType: 'SYSTEM', actorName: 'E2E Fixture', reason: seedReason },
          ...(acknowledged ? [{ type: 'ACKNOWLEDGED', fromStatus: 'OPEN', toStatus: 'ACKNOWLEDGED', actorType: 'SYSTEM', actorName: 'E2E Fixture', reason: seedReason }] : []),
          ...(resolved ? [{ type: 'RESOLVED', fromStatus: 'ACKNOWLEDGED', toStatus: 'RESOLVED', actorType: 'SYSTEM', actorName: 'E2E Fixture', reason: seedReason }] : []),
          ...(closed ? [{ type: 'CLOSED', fromStatus: 'RESOLVED', toStatus: 'CLOSED', actorType: 'SYSTEM', actorName: 'E2E Fixture', reason: seedReason }] : []),
        ] },
      }, include: { _count: { select: { transitions: true } } } });
      rows.push({ id, title, group, initialStatus: status, baseline: json({ status: record.status, resolutionReason: record.resolutionReason, closeReason: record.closeReason, transitions: record._count.transitions }) });
    }
    return alarm;
  });
  const manifest = { prefix, alarmId: rule.id, reasons, rows, baseline, createdAt: new Date().toISOString(), cleaned: false };
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ prefix, records: rows.length, searches: { resolve: `${prefix}-resolve`, close: `${prefix}-close` }, reasons, operationalBaseline: baseline.length }));
}
async function readManifest() {
  const m = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert.match(m.prefix, /^E2E-BULK-[a-f0-9]{8}$/);
  assert.equal(m.rows.length, 8);
  assert(m.rows.every(row => row.id.startsWith(`${m.prefix}-`) && row.title.startsWith(m.prefix)));
  return m;
}
async function operationalUnchanged(m) {
  const actual = json(await db.alarmIncident.findMany({ where: { id: { in: m.baseline.map(row => row.id) } }, select: operationalSelect, orderBy: { id: 'asc' } }));
  assert.deepEqual(actual, m.baseline, 'Operational incident status, legal hold, assignment and reasons must stay unchanged');
}
async function verify(m, phase, onlyGroup) {
  assert(['preview', 'resolve', 'close'].includes(phase));
  assert(onlyGroup === undefined || ['resolve', 'close'].includes(onlyGroup));
  const ids = m.rows.map(row => row.id);
  const records = await db.alarmIncident.findMany({ where: { id: { in: ids }, alarmId: m.alarmId }, include: { transitions: true, occurrences: true, notificationAttempts: true } });
  assert.equal(records.length, 8);
  let transitions = 0;
  for (const fixture of m.rows) {
    const row = records.find(record => record.id === fixture.id);
    const applied = (!onlyGroup || onlyGroup === fixture.group) && ((fixture.group === 'resolve' && phase !== 'preview' && ['OPEN', 'ACKNOWLEDGED'].includes(fixture.initialStatus)) || (fixture.group === 'close' && phase === 'close' && fixture.initialStatus === 'RESOLVED'));
    const status = applied ? (fixture.group === 'resolve' ? 'RESOLVED' : 'CLOSED') : fixture.initialStatus;
    assert.equal(row.status, status, fixture.title);
    assert.equal(row.transitions.length, fixture.baseline.transitions + Number(applied), fixture.title);
    assert.equal(row.resolutionReason, applied && fixture.group === 'resolve' ? m.reasons.resolve : fixture.baseline.resolutionReason);
    assert.equal(row.closeReason, applied && fixture.group === 'close' ? m.reasons.close : fixture.baseline.closeReason);
    assert.equal(row.notificationAttempts.length, 0);
    const audits = await db.auditLog.findMany({ where: { entityId: row.id } });
    assert.equal(audits.length, Number(applied));
    if (applied) {
      const transition = row.transitions.find(item => item.reason === m.reasons[fixture.group]);
      assert(transition); assert.equal(transition.type, fixture.group === 'resolve' ? 'RESOLVED' : 'CLOSED');
      assert.equal(transition.actorType, 'USER'); assert(transition.actorId); assert(transition.actorName);
      assert.equal(audits[0].userId, transition.actorId); assert.equal(audits[0].details.reason, transition.reason);
      assert(row.occurrences.every(event => event.acknowledged));
      if (status === 'CLOSED') assert.equal(row.activeFingerprint, null);
      transitions++;
    }
  }
  await operationalUnchanged(m);
  const result = { phase, passed: true, fixtures: records.length, browserTransitions: transitions, operationalIncidentsUnchanged: m.baseline.length, checkedAt: new Date().toISOString() };
  await fs.writeFile(path.join(directory, `verified-${phase}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
async function cleanup(m) {
  await operationalUnchanged(m);
  const ids = m.rows.map(row => row.id);
  const rule = await db.alarmDefinition.findUnique({ where: { id: m.alarmId } });
  assert(rule && rule.code === m.prefix && rule.enabled === false && rule.notifyEmail === false);
  const owned = await db.alarmIncident.findMany({ where: { alarmId: m.alarmId }, select: { id: true } });
  assert.deepEqual(owned.map(row => row.id).sort(), [...ids].sort(), 'Never clean records outside this manifest');
  await db.$transaction(async tx => {
    await tx.alarmWhitelist.deleteMany({ where: { alarmCode: m.prefix } });
    await tx.auditLog.deleteMany({ where: { entity: 'AlarmIncident', entityId: { in: ids } } });
    await tx.alarmEvent.deleteMany({ where: { alarmId: m.alarmId, incidentId: { in: ids } } });
    await tx.alarmIncident.deleteMany({ where: { alarmId: m.alarmId, id: { in: ids } } });
    await tx.alarmDefinition.delete({ where: { id: m.alarmId } });
  });
  assert.equal(await db.alarmIncident.count({ where: { id: { in: ids } } }), 0);
  assert.equal(await db.alarmEvent.count({ where: { alarmId: m.alarmId } }), 0);
  assert.equal(await db.alarmWhitelist.count({ where: { alarmCode: m.prefix } }), 0);
  assert.equal(await db.auditLog.count({ where: { entityId: { in: ids } } }), 0);
  await operationalUnchanged(m);
  m.cleaned = true; m.cleanedAt = new Date().toISOString();
  await fs.writeFile(manifestPath, JSON.stringify(m, null, 2));
  console.log(JSON.stringify({ cleaned: true, incidentsRemoved: ids.length, operationalIncidentsUnchanged: m.baseline.length }));
}
async function main() {
  const mode = process.argv[2];
  if (mode === 'create') return create();
  const manifest = await readManifest();
  if (mode === 'verify') return verify(manifest, process.argv[3], process.argv[4]);
  if (mode === 'cleanup') return cleanup(manifest);
  throw new Error('Use create | verify preview/resolve/close | cleanup');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
