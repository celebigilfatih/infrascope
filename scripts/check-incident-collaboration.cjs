// Opt-in PostgreSQL regression: all fixture writes are rolled back in one transaction.
// No operational incident is updated; no integration or notification transport is loaded.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node regression entry point. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { NextRequest } = require('next/server');
const { moduleLoader, alarm } = require('./check-alarm-occurrences.cjs');

if (process.env.INFRASCOPE_COLLABORATION_DB_TEST !== '1') {
  throw new Error('Set INFRASCOPE_COLLABORATION_DB_TEST=1 to run the rollback-only database check.');
}
const db = new PrismaClient();
const prefix = `collaboration-check-${randomUUID()}`;
const rollback = new Error('ROLLBACK_FIXTURES');
const quiet = new Proxy({}, { get: () => () => {} });
const fixtureIds = [];

async function main() {
  try {
    await db.$transaction(async tx => {
      const users = {};
      for (const [key, role, status] of [['admin', 'ADMIN', 'ACTIVE'], ['editor', 'EDITOR', 'ACTIVE'], ['viewer', 'VIEWER', 'ACTIVE'], ['inactive', 'EDITOR', 'INACTIVE'], ['suspended', 'ADMIN', 'SUSPENDED']]) {
        users[key] = await tx.user.create({ data: { name: `Fixture ${key}`, email: `${prefix}-${key}@example.invalid`, role, status } });
        fixtureIds.push(users[key].id);
      }
      const alarmData = { ...alarm }; delete alarmData.id;
      const rule = await tx.alarmDefinition.create({ data: { ...alarmData, code: prefix, enabled: false, notifyEmail: false } });
      const incident = await tx.alarmIncident.create({ data: {
        alarmId: rule.id, fingerprint: prefix, source: 'fixture', severity: 'ALARM_HIGH', category: 'CONFIG_ACCESS', title: prefix, message: 'Isolated collaboration fixture',
      } });
      let auth = { role: 'ADMIN', actor: { type: 'USER', id: users.admin.id, name: users.admin.name } };
      let savepointSequence = 0;
      const transaction = async fn => {
        const savepoint = `collaboration_fixture_${++savepointSequence}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
        try {
          const result = await fn(tx);
          await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (error) {
          await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
          throw error;
        }
      };
      const prisma = new Proxy(tx, { get: (target, key) => key === '$transaction' ? transaction : target[key] });
      const load = moduleLoader({ 'next/server': require('next/server'), zlib: require('node:zlib'), '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => quiet },
        '@/lib/auth/request-actor': { getRequestActor: async () => auth } }, { console: { ...console, error() {} } });
      const service = load('lib/alarms/incident-service.ts');
      const route = load('app/api/alarm-incidents/route.ts');
      const people = load('app/api/alarm-incidents/assignees/route.ts');
      const detail = load('app/api/alarm-incidents/[id]/route.ts');
      const exportRoute = load('app/api/alarm-incidents/export/route.ts');
      const patch = body => route.PATCH(new NextRequest('http://localhost/api/alarm-incidents', { method: 'PATCH', body: JSON.stringify({ ids: [incident.id], ...body }) }));
      const getPeople = () => people.GET(new NextRequest('http://localhost/api/alarm-incidents/assignees'));
      const getFilterPeople = () => people.GET(new NextRequest('http://localhost/api/alarm-incidents/assignees?scope=filter'));

      const candidates = await (await getPeople()).json();
      assert.equal(candidates.canManage, true);
      for (const key of ['admin', 'editor']) assert(candidates.data.some(row => row.id === users[key].id));
      for (const key of ['viewer', 'inactive', 'suspended']) assert(!candidates.data.some(row => row.id === users[key].id));
      assert(candidates.data.every(row => Object.keys(row).sort().join(',') === 'id,name'));
      await tx.alarmIncident.update({ where: { id: incident.id }, data: { assignedToId: users.inactive.id, assignedTo: users.inactive.name } });
      assert((await (await getFilterPeople()).json()).data.some(row => row.id === users.inactive.id), 'Past inactive assignees remain filterable');
      await tx.alarmIncident.update({ where: { id: incident.id }, data: { assignedToId: 'deleted-fixture-user', assignedTo: 'Eski operatör' } });
      assert((await (await getFilterPeople()).json()).data.some(row => row.id === 'deleted-fixture-user' && row.name === 'Eski operatör'), 'Deleted assignees retain their recorded identity');
      await tx.alarmIncident.update({ where: { id: incident.id }, data: { assignedToId: null, assignedTo: null } });

      const assigned = await patch({ action: 'ASSIGN', assigneeId: users.editor.id, assigneeName: 'Spoofed name', actorName: 'Spoofed actor' });
      assert.equal(assigned.status, 200);
      let stored = await tx.alarmIncident.findUniqueOrThrow({ where: { id: incident.id }, include: { transitions: true } });
      assert.equal(stored.assignedTo, users.editor.name); assert.equal(stored.assignedToId, users.editor.id); assert(stored.assignedAt);
      assert.equal(stored.transitions[0].actorId, users.admin.id); assert.equal(stored.transitions[0].actorName, users.admin.name);
      assert.equal(stored.transitions[0].metadata.assigneeName, users.editor.name);
      assert.equal(stored.transitions[0].metadata.previousAssigneeId, null);
      assert.equal(stored.status, 'OPEN'); assert.equal(stored.occurrenceCount, 1);
      await patch({ action: 'ASSIGN', assigneeId: users.editor.id });
      assert.equal(await tx.alarmLifecycleTransition.count({ where: { incidentId: incident.id } }), 1, 'Unchanged assignment is a no-op');

      for (const assigneeId of [undefined, '', 'missing-user', users.viewer.id, users.inactive.id, users.suspended.id, 42]) {
        assert.equal((await patch({ action: 'ASSIGN', assigneeId })).status, 400);
      }
      assert.equal((await patch({ action: 'ASSIGN', assigneeId: null })).status, 200);
      stored = await tx.alarmIncident.findUniqueOrThrow({ where: { id: incident.id } });
      assert.equal(stored.assignedTo, null); assert.equal(stored.assignedToId, null); assert.equal(stored.assignedAt, null);

      const noteText = '  Kontrol tamamlandı.\nİkinci adım: bellek takibi.  ';
      assert.equal((await patch({ action: 'ADD_NOTE', reason: noteText, actorName: 'Untrusted' })).status, 200);
      const note = await tx.alarmLifecycleTransition.findFirstOrThrow({ where: { incidentId: incident.id, type: 'NOTE_ADDED' } });
      assert.equal(note.reason, noteText.trim()); assert.equal(note.actorId, users.admin.id); assert.equal(note.actorName, users.admin.name);
      assert.equal(note.fromStatus, 'OPEN'); assert.equal(note.toStatus, 'OPEN'); assert(note.createdAt instanceof Date);
      for (const reason of ['', '   \n ', 'x'.repeat(4001), 42, null]) assert.equal((await patch({ action: 'ADD_NOTE', reason })).status, 400);
      assert.equal((await patch({ action: 'ADD_NOTE', reason: 'x'.repeat(4000) })).status, 200);
      assert.equal((await patch({ ids: [incident.id, 'other'], action: 'ADD_NOTE', reason: 'Invalid bulk' })).status, 400);
      assert.equal((await patch({ ids: incident.id, action: 'ADD_NOTE', reason: 'Invalid ids' })).status, 400);
      stored = await tx.alarmIncident.findUniqueOrThrow({ where: { id: incident.id } });
      assert.equal(stored.status, 'OPEN'); assert.equal(stored.acknowledgedAt, null); assert.equal(stored.lastSeenAt.getTime(), incident.lastSeenAt.getTime());
      assert.equal(stored.occurrenceCount, 1);

      const reread = await (await detail.GET(new NextRequest('http://localhost/api/alarm-incidents/' + incident.id), { params: { id: incident.id } })).json();
      assert.equal(reread.data.transitions.filter(row => row.type === 'NOTE_ADDED').length, 2);
      assert.equal(reread.data.transitions.find(row => row.id === note.id).reason, noteText.trim());
      assert.equal(await tx.auditLog.count({ where: { entityId: incident.id, action: 'add_note', userId: users.admin.id } }), 2);

      const requestId = randomUUID();
      const keyedNote = { action: 'ADD_NOTE', reason: 'Tek gönderim\nAynı taslak.', requestId };
      assert.equal((await patch(keyedNote)).status, 200);
      const afterKeyed = await tx.alarmIncident.findUniqueOrThrow({ where: { id: incident.id }, include: { transitions: { orderBy: { id: 'asc' } } } });
      const keyedAudits = await tx.auditLog.findMany({ where: { entityId: incident.id }, orderBy: { id: 'asc' } });
      assert.equal((await patch({ ...keyedNote, requestId: requestId.toUpperCase() })).status, 200);
      assert.deepEqual(await tx.alarmIncident.findUniqueOrThrow({ where: { id: incident.id }, include: { transitions: { orderBy: { id: 'asc' } } } }), afterKeyed, 'A replay must not change notes or update timestamps');
      assert.deepEqual(await tx.auditLog.findMany({ where: { entityId: incident.id }, orderBy: { id: 'asc' } }), keyedAudits, 'A replay must not duplicate audit');
      assert.equal((await patch({ ...keyedNote, reason: 'Farklı içerik' })).status, 400);
      for (const invalid of [null, '', 42, {}, 'invalid-key', 'x'.repeat(500)]) assert.equal((await patch({ ...keyedNote, requestId: invalid })).status, 400);
      assert.equal((await patch({ action: 'ASSIGN', assigneeId: users.admin.id, requestId })).status, 400);
      auth = { role: 'EDITOR', actor: { type: 'USER', id: users.editor.id, name: users.editor.name } };
      assert.equal((await patch(keyedNote)).status, 400, 'A key cannot be replayed as another actor');
      auth = { role: 'ADMIN', actor: { type: 'USER', id: users.admin.id, name: users.admin.name } };
      assert.equal(await tx.alarmLifecycleTransition.count({ where: { requestId } }), 1);
      assert.deepEqual(await tx.auditLog.findMany({ where: { entityId: incident.id }, orderBy: { id: 'asc' } }), keyedAudits);
      assert.equal((await patch({ ...keyedNote, requestId: randomUUID() })).status, 200, 'Identical text is allowed as a new intentional note');

      auth = { role: 'VIEWER', actor: { type: 'USER', id: users.viewer.id, name: users.viewer.name } };
      const deniedNoteBefore = await tx.alarmIncident.findUniqueOrThrow({ where: { id: incident.id }, include: { transitions: { orderBy: { id: 'asc' } } } });
      const deniedNoteAudits = await tx.auditLog.findMany({ where: { entityId: incident.id }, orderBy: { id: 'asc' } });
      const deniedNoteKey = randomUUID();
      for (const requestId of [deniedNoteKey, deniedNoteKey, randomUUID()]) {
        const denied = await patch({ action: 'ADD_NOTE', reason: 'Denied', requestId });
        assert.equal(denied.status, 403); assert(!Object.hasOwn(await denied.json(), 'data'));
      }
      assert.equal((await route.PATCH(new NextRequest('http://localhost/api/alarm-incidents', { method: 'PATCH', body: '{invalid-json' }))).status, 403, 'Authorization precedes note body parsing');
      assert.deepEqual(await tx.alarmIncident.findUniqueOrThrow({ where: { id: incident.id }, include: { transitions: { orderBy: { id: 'asc' } } } }), deniedNoteBefore);
      assert.deepEqual(await tx.auditLog.findMany({ where: { entityId: incident.id }, orderBy: { id: 'asc' } }), deniedNoteAudits, 'Denied notes must not create history, audit or reserve keys');
      assert.equal(await tx.alarmLifecycleTransition.count({ where: { requestId: deniedNoteKey } }), 0);

      for (const assigneeId of [users.editor.id, null, 'missing-assignee']) {
        const denied = await patch({ action: 'ASSIGN', assigneeId, assigneeName: 'Untrusted', actorName: 'Untrusted' });
        assert.equal(denied.status, 403); assert(!Object.hasOwn(await denied.json(), 'data'));
      }
      assert.deepEqual(await tx.alarmIncident.findUniqueOrThrow({ where: { id: incident.id }, include: { transitions: { orderBy: { id: 'asc' } } } }), deniedNoteBefore, 'Denied assignment changes and removals cannot change the existing incident or history');
      assert.deepEqual(await tx.auditLog.findMany({ where: { entityId: incident.id }, orderBy: { id: 'asc' } }), deniedNoteAudits, 'Denied assignments cannot create audit records');
      assert.equal((await (await getPeople()).json()).canManage, false);
      auth = { role: 'EDITOR', actor: { type: 'USER', id: users.editor.id, name: users.editor.name } };
      assert.equal((await patch({ action: 'ADD_NOTE', reason: 'Editör notu' })).status, 200);
      assert.equal((await patch({ action: 'ADD_NOTE', reason: 'Denied', requestId: deniedNoteKey })).status, 200, 'A denied request key remains usable by a newly authorized editor');
      assert.equal((await patch({ action: 'ADD_NOTE', reason: 'Denied', requestId: deniedNoteKey })).status, 200);
      assert.equal(await tx.alarmLifecycleTransition.count({ where: { requestId: deniedNoteKey } }), 1);
      assert.equal((await patch({ action: 'ASSIGN', assigneeId: users.admin.id })).status, 200);
      const mineRequest = new NextRequest('http://localhost/api/alarm-incidents?assignee=me&status=OPEN,ACKNOWLEDGED');
      assert.equal((await (await route.GET(mineRequest)).json()).total, 0, 'Editor must not inherit another user’s assignment');
      auth = { role: 'ADMIN', actor: { type: 'USER', id: users.admin.id, name: users.admin.name } };
      const mine = await (await route.GET(mineRequest)).json();
      assert.equal(mine.total, 1); assert.equal(mine.data[0].id, incident.id); assert.equal(mine.overview.status.OPEN, 1);
      const mineCsv = await (await exportRoute.GET(mineRequest)).text();
      assert.equal(mineCsv.trim().split('\n').length, 2); assert(mineCsv.includes(incident.id));
      const second = await tx.alarmIncident.create({ data: {
        alarmId: rule.id, fingerprint: `${prefix}-second`, source: 'fixture', severity: 'ALARM_HIGH', category: 'CONFIG_ACCESS', title: prefix, message: 'Bulk fixture', status: 'ACKNOWLEDGED',
      } });
      assert.equal((await patch({ ...keyedNote, ids: [second.id] })).status, 400, 'A key is bound to its original incident');
      const batchIds = [incident.id, second.id];
      const beforeBatch = await tx.alarmLifecycleTransition.count({ where: { incidentId: { in: batchIds }, type: 'ASSIGNED' } });
      const bulkResponse = await patch({ ids: [second.id, incident.id, second.id], action: 'ASSIGN', assigneeId: users.editor.id, assigneeName: 'Spoofed' });
      assert.equal(bulkResponse.status, 200); assert.equal((await bulkResponse.json()).updated, 2, 'Duplicate ids are handled once');
      const batchRows = await tx.alarmIncident.findMany({ where: { id: { in: batchIds } }, orderBy: { id: 'asc' } });
      assert(batchRows.every(row => row.assignedToId === users.editor.id && row.assignedTo === users.editor.name));
      assert.equal(batchRows.find(row => row.id === second.id).status, 'ACKNOWLEDGED');
      assert.equal(await tx.alarmLifecycleTransition.count({ where: { incidentId: { in: batchIds }, type: 'ASSIGNED' } }), beforeBatch + 2);
      await patch({ ids: batchIds, action: 'ASSIGN', assigneeId: users.editor.id });
      assert.equal(await tx.alarmLifecycleTransition.count({ where: { incidentId: { in: batchIds }, type: 'ASSIGNED' } }), beforeBatch + 2, 'Retrying the same assignment must not duplicate history');
      const beforeFailure = await tx.alarmLifecycleTransition.count({ where: { incidentId: { in: batchIds } } });
      const auditBeforeFailure = await tx.auditLog.count({ where: { entityId: { in: batchIds } } });
      assert.equal((await patch({ ids: [incident.id, 'zz-missing-incident'], action: 'ASSIGN', assigneeId: users.admin.id })).status, 400);
      assert.deepEqual(await tx.alarmIncident.findMany({ where: { id: { in: batchIds } }, orderBy: { id: 'asc' } }), batchRows, 'A late missing record rolls back the earlier assignment');
      assert.equal(await tx.alarmLifecycleTransition.count({ where: { incidentId: { in: batchIds } } }), beforeFailure, 'Failed batch must not leave history');
      assert.equal(await tx.auditLog.count({ where: { entityId: { in: batchIds } } }), auditBeforeFailure, 'Failed batch must not leave audit');
      assert.equal((await patch({ ids: batchIds, action: 'ASSIGN', assigneeId: users.inactive.id })).status, 400);
      assert.equal((await patch({ ids: Array.from({ length: 101 }, (_, index) => `fixture-${index}`), action: 'ASSIGN', assigneeId: users.editor.id })).status, 400);
      const resolved = await tx.alarmIncident.create({ data: { alarmId: rule.id, fingerprint: `${prefix}-resolved`, source: 'fixture', severity: 'ALARM_HIGH', category: 'CONFIG_ACCESS', title: prefix, message: 'Resolved fixture', status: 'RESOLVED' } });
      const closed = await tx.alarmIncident.create({ data: { alarmId: rule.id, fingerprint: `${prefix}-closed`, source: 'fixture', severity: 'ALARM_HIGH', category: 'CONFIG_ACCESS', title: prefix, message: 'Closed fixture', status: 'CLOSED' } });
      const lifecycleIds = [...batchIds, resolved.id, closed.id];
      for (const incidentId of lifecycleIds) await tx.alarmEvent.create({ data: { incidentId, alarmId: rule.id, severity: 'ALARM_HIGH', title: prefix, message: 'Lifecycle occurrence fixture' } });
      auth = { role: 'EDITOR', actor: { type: 'USER', id: users.editor.id, name: users.editor.name } };
      const reasonHistoryBefore = await tx.alarmLifecycleTransition.count({ where: { incidentId: { in: lifecycleIds } } });
      const requiredReasonRows = await tx.alarmIncident.findMany({ where: { id: { in: lifecycleIds } }, orderBy: { id: 'asc' } });
      const requiredReasonAudits = await tx.auditLog.count({ where: { entityId: { in: lifecycleIds } } });
      for (const action of ['RESOLVE', 'CLOSE']) for (const reason of [undefined, null, '', ' \t\n ', 42, {}, 'x'.repeat(4001)]) {
        assert.equal((await patch({ ids: lifecycleIds, action, bulk: true, reason })).status, 400);
      }
      assert.equal(await tx.alarmLifecycleTransition.count({ where: { incidentId: { in: lifecycleIds } } }), reasonHistoryBefore);
      for (const action of ['RESOLVE', 'CLOSE']) for (const bulk of [undefined, false]) {
        const rejected = await patch({ ids: lifecycleIds, action, bulk });
        assert.equal(rejected.status, 400); assert.match((await rejected.json()).error, /açıklaması zorunludur/);
      }
      assert.deepEqual(await tx.alarmIncident.findMany({ where: { id: { in: lifecycleIds } }, orderBy: { id: 'asc' } }), requiredReasonRows, 'Rejected descriptions must not change incident data');
      assert.equal(await tx.auditLog.count({ where: { entityId: { in: lifecycleIds } } }), requiredReasonAudits);
      const resolutionReason = '  Ortak çözüm: yapılandırma düzeltildi.\nBellek kullanımı kontrol edildi.  ';
      const resolvedResponse = await patch({ ids: [...lifecycleIds, incident.id], action: 'RESOLVE', bulk: true, reason: resolutionReason });
      assert.equal(resolvedResponse.status, 200);
      const resolvedResult = await resolvedResponse.json(); assert.equal(resolvedResult.updated, 2); assert.equal(resolvedResult.skipped, 2);
      assert(resolvedResult.data.every(row => row.status === 'RESOLVED'));
      const resolutionHistory = await tx.alarmLifecycleTransition.findMany({ where: { incidentId: { in: lifecycleIds }, type: 'RESOLVED' } });
      assert.equal(resolutionHistory.length, 2); assert(resolutionHistory.every(row => row.actorId === users.editor.id && row.toStatus === 'RESOLVED'));
      assert(resolutionHistory.every(row => row.reason === resolutionReason.trim()));
      assert(resolvedResult.data.every(row => row.resolutionReason === resolutionReason.trim()));
      assert.equal((await tx.alarmIncident.findUniqueOrThrow({ where: { id: resolved.id } })).resolutionReason, null, 'Skipped records must not gain the explanation');
      const resolutionAudits = await tx.auditLog.findMany({ where: { entityId: { in: batchIds }, action: 'resolve' } });
      assert(resolutionAudits.every(row => row.details.reason === resolutionReason.trim()));
      assert.equal(await tx.auditLog.count({ where: { entityId: { in: lifecycleIds }, action: 'resolve' } }), 2);
      const repeatResolution = await (await patch({ ids: lifecycleIds, action: 'RESOLVE', bulk: true, reason: resolutionReason })).json();
      assert.equal(repeatResolution.updated, 0); assert.equal(repeatResolution.skipped, 4);
      assert.equal(await tx.alarmLifecycleTransition.count({ where: { incidentId: { in: lifecycleIds }, type: 'RESOLVED' } }), 2);
      const beforeMissing = await tx.alarmIncident.findMany({ where: { id: { in: lifecycleIds } }, orderBy: { id: 'asc' } });
      assert.equal((await patch({ ids: [incident.id, 'zz-missing-lifecycle'], action: 'CLOSE', bulk: true, reason: 'Tamamlandı' })).status, 400);
      assert.deepEqual(await tx.alarmIncident.findMany({ where: { id: { in: lifecycleIds } }, orderBy: { id: 'asc' } }), beforeMissing);
      auth = { role: 'ADMIN', actor: { type: 'USER', id: users.admin.id, name: users.admin.name } };
      const closeReason = '  Ortak kapatma: takip tamamlandı.\nHizmet normal.  ';
      const closedResponse = await patch({ ids: lifecycleIds, action: 'CLOSE', bulk: true, reason: closeReason });
      assert.equal(closedResponse.status, 200);
      const closedResult = await closedResponse.json(); assert.equal(closedResult.updated, 3); assert.equal(closedResult.skipped, 1);
      assert(closedResult.data.every(row => row.status === 'CLOSED' && row.activeFingerprint === null && row.closedById === users.admin.id));
      assert(closedResult.data.every(row => row.closeReason === closeReason.trim()));
      const closeHistory = await tx.alarmLifecycleTransition.findMany({ where: { incidentId: { in: lifecycleIds }, type: 'CLOSED' } });
      assert(closeHistory.every(row => row.reason === closeReason.trim()));
      const closeAudits = await tx.auditLog.findMany({ where: { entityId: { in: lifecycleIds }, action: 'close' } });
      assert(closeAudits.every(row => row.details.reason === closeReason.trim()));
      assert.equal((await tx.alarmIncident.findUniqueOrThrow({ where: { id: closed.id } })).closeReason, null);
      const reasonReread = await (await detail.GET(new NextRequest('http://localhost/api/alarm-incidents/' + incident.id), { params: { id: incident.id } })).json();
      assert.equal(reasonReread.data.transitions.find(row => row.type === 'RESOLVED').reason, resolutionReason.trim());
      assert.equal(reasonReread.data.transitions.find(row => row.type === 'CLOSED').reason, closeReason.trim());
      assert.equal(await tx.alarmLifecycleTransition.count({ where: { incidentId: { in: lifecycleIds }, type: 'CLOSED' } }), 3);
      assert.equal(await tx.auditLog.count({ where: { entityId: { in: lifecycleIds }, action: 'close' } }), 3);
      assert.equal(await tx.alarmEvent.count({ where: { incidentId: { in: [incident.id, second.id, resolved.id] }, acknowledged: true } }), 3);
      const repeatedClose = await (await patch({ ids: lifecycleIds, action: 'CLOSE', bulk: true, reason: closeReason })).json();
      assert.equal(repeatedClose.updated, 0); assert.equal(repeatedClose.skipped, 4);
      const lifecycleRows = await tx.alarmIncident.findMany({ where: { id: { in: lifecycleIds } } });
      assert(lifecycleRows.every(row => row.status === 'CLOSED' && row.occurrenceCount === 1));
      assert.equal((await patch({ ids: lifecycleIds, action: 'ASSIGN', bulk: true, assigneeId: users.admin.id })).status, 400);
      assert.equal((await patch({ ids: lifecycleIds, action: 'RESOLVE', bulk: 'yes' })).status, 400);
      const boundary = await tx.alarmIncident.create({ data: { alarmId: rule.id, fingerprint: `${prefix}-reason-boundary`, source: 'fixture', severity: 'ALARM_HIGH', category: 'CONFIG_ACCESS', title: prefix, message: 'Reason boundary fixture' } });
      assert.equal((await patch({ ids: [boundary.id], action: 'RESOLVE', bulk: true, reason: 'x'.repeat(4000) })).status, 200);
      assert.equal((await tx.alarmIncident.findUniqueOrThrow({ where: { id: boundary.id } })).resolutionReason.length, 4000);
      assert.equal((await patch({ ids: [boundary.id], action: 'CLOSE', bulk: true, reason: ' \n ' })).status, 400);
      assert.equal((await tx.alarmIncident.findUniqueOrThrow({ where: { id: boundary.id } })).closeReason, null);
      const ackOnly = await tx.alarmIncident.create({ data: {
        alarmId: rule.id, fingerprint: `${prefix}-single-acknowledge`, source: 'fixture', severity: 'ALARM_HIGH', category: 'CONFIG_ACCESS', title: prefix, message: 'Single acknowledge retry fixture', occurrenceCount: 2,
        occurrences: { create: [1, 2].map(index => ({ alarmId: rule.id, severity: 'ALARM_HIGH', title: `${prefix}-${index}`, message: 'Acknowledgement occurrence fixture' })) },
      } });
      const readAcknowledgement = () => tx.alarmIncident.findUniqueOrThrow({ where: { id: ackOnly.id }, include: { transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } } } });
      const beforeAcknowledgement = await readAcknowledgement();
      auth = { role: 'EDITOR', actor: { type: 'USER', id: users.editor.id, name: users.editor.name } };
      assert.equal((await patch({ ids: [ackOnly.id], action: 'ACKNOWLEDGE', reason: 'First acknowledgement reason' })).status, 200);
      const acknowledged = await readAcknowledgement();
      const acknowledgementAudits = await tx.auditLog.findMany({ where: { entityId: ackOnly.id }, orderBy: { id: 'asc' } });
      assert.equal(acknowledged.status, 'ACKNOWLEDGED'); assert(acknowledged.acknowledgedAt);
      assert.equal(acknowledged.acknowledgedById, users.editor.id); assert.equal(acknowledged.acknowledgedBy, users.editor.name);
      assert.equal(acknowledged.transitions.length, 1);
      assert.equal(acknowledged.transitions[0].type, 'ACKNOWLEDGED'); assert.equal(acknowledged.transitions[0].reason, 'First acknowledgement reason');
      assert.equal(acknowledged.transitions[0].actorId, users.editor.id); assert.equal(acknowledged.transitions[0].fromStatus, 'OPEN'); assert.equal(acknowledged.transitions[0].toStatus, 'ACKNOWLEDGED');
      assert.equal(acknowledgementAudits.length, 1); assert.equal(acknowledgementAudits[0].action, 'acknowledge'); assert.equal(acknowledgementAudits[0].userId, users.editor.id);
      assert.equal(acknowledged.occurrences.length, 2);
      assert(acknowledged.occurrences.every(row => row.acknowledged && row.acknowledgedAt && row.acknowledgedBy === users.editor.name));
      assert.deepEqual({ ...acknowledged, status: beforeAcknowledgement.status, updatedAt: beforeAcknowledgement.updatedAt,
        acknowledgedAt: beforeAcknowledgement.acknowledgedAt, acknowledgedById: beforeAcknowledgement.acknowledgedById, acknowledgedBy: beforeAcknowledgement.acknowledgedBy,
        transitions: [], occurrences: acknowledged.occurrences.map(row => {
          const original = beforeAcknowledgement.occurrences.find(item => item.id === row.id);
          return { ...row, acknowledged: original.acknowledged, acknowledgedAt: original.acknowledgedAt, acknowledgedBy: original.acknowledgedBy };
        }) }, beforeAcknowledgement, 'Acknowledgement changes only the intended lifecycle/history and occurrence acknowledgement fields');
      auth = { role: 'ADMIN', actor: { type: 'USER', id: users.admin.id, name: users.admin.name } };
      assert.equal((await patch({ ids: [ackOnly.id], action: 'ACKNOWLEDGE', reason: 'Retry by another operator must preserve the first record' })).status, 200);
      assert.deepEqual(await readAcknowledgement(), acknowledged, 'A replay preserves the original acknowledgement actor, reason, timestamps, occurrences and history');
      assert.deepEqual(await tx.auditLog.findMany({ where: { entityId: ackOnly.id }, orderBy: { id: 'asc' } }), acknowledgementAudits);
      const terminalIds = [boundary.id, closed.id];
      const terminalRows = await tx.alarmIncident.findMany({ where: { id: { in: terminalIds } }, orderBy: { id: 'asc' }, include: { transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } } } });
      const terminalAudits = await tx.auditLog.findMany({ where: { entityId: { in: terminalIds } }, orderBy: { id: 'asc' } });
      assert.equal((await patch({ ids: terminalIds, action: 'ACKNOWLEDGE' })).status, 200);
      assert.deepEqual(await tx.alarmIncident.findMany({ where: { id: { in: terminalIds } }, orderBy: { id: 'asc' }, include: { transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } } } }), terminalRows, 'Acknowledging RESOLVED/CLOSED incidents remains a no-op');
      assert.deepEqual(await tx.auditLog.findMany({ where: { entityId: { in: terminalIds } }, orderBy: { id: 'asc' } }), terminalAudits);
      auth = { role: 'EDITOR', actor: { type: 'USER', id: users.editor.id, name: users.editor.name } };
      assert.equal((await patch({ ids: [ackOnly.id], action: 'UNACKNOWLEDGE', reason: 'First withdrawal reason' })).status, 200);
      const withdrawn = await readAcknowledgement();
      const withdrawalAudits = await tx.auditLog.findMany({ where: { entityId: ackOnly.id }, orderBy: { id: 'asc' } });
      assert.equal(withdrawn.status, 'OPEN');
      assert.equal(withdrawn.acknowledgedAt, null); assert.equal(withdrawn.acknowledgedById, null); assert.equal(withdrawn.acknowledgedBy, null);
      assert.equal(withdrawn.transitions.length, acknowledged.transitions.length + 1);
      const withdrawal = withdrawn.transitions.find(row => row.type === 'UNACKNOWLEDGED');
      assert(withdrawal); assert.equal(withdrawal.fromStatus, 'ACKNOWLEDGED'); assert.equal(withdrawal.toStatus, 'OPEN');
      assert.equal(withdrawal.actorId, users.editor.id); assert.equal(withdrawal.reason, 'First withdrawal reason');
      assert.equal(withdrawalAudits.length, acknowledgementAudits.length + 1);
      assert.equal(withdrawalAudits.find(row => row.action === 'unacknowledge').userId, users.editor.id);
      assert.equal(withdrawn.occurrences.length, 2);
      assert(withdrawn.occurrences.every(row => !row.acknowledged && row.acknowledgedAt === null && row.acknowledgedBy === null));
      assert.deepEqual({ ...withdrawn, status: acknowledged.status, updatedAt: acknowledged.updatedAt,
        acknowledgedAt: acknowledged.acknowledgedAt, acknowledgedById: acknowledged.acknowledgedById, acknowledgedBy: acknowledged.acknowledgedBy,
        transitions: withdrawn.transitions.filter(row => row.id !== withdrawal.id), occurrences: withdrawn.occurrences.map(row => {
          const original = acknowledged.occurrences.find(item => item.id === row.id);
          return { ...row, acknowledged: original.acknowledged, acknowledgedAt: original.acknowledgedAt, acknowledgedBy: original.acknowledgedBy };
        }) }, acknowledged, 'Withdrawal retains the original acknowledgement history and all unrelated evidence');
      auth = { role: 'ADMIN', actor: { type: 'USER', id: users.admin.id, name: users.admin.name } };
      assert.equal((await patch({ ids: [ackOnly.id], action: 'UNACKNOWLEDGE', reason: 'Retry by another operator must preserve the withdrawal' })).status, 200);
      assert.deepEqual(await readAcknowledgement(), withdrawn, 'Withdrawal replay preserves the first actor/reason/timestamps and cleared acknowledgement fields');
      assert.deepEqual(await tx.auditLog.findMany({ where: { entityId: ackOnly.id }, orderBy: { id: 'asc' } }), withdrawalAudits);
      assert.equal((await patch({ ids: terminalIds, action: 'UNACKNOWLEDGE' })).status, 200);
      assert.deepEqual(await tx.alarmIncident.findMany({ where: { id: { in: terminalIds } }, orderBy: { id: 'asc' }, include: { transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } } } }), terminalRows, 'Withdrawing acknowledgement from RESOLVED/CLOSED incidents remains a no-op');
      assert.deepEqual(await tx.auditLog.findMany({ where: { entityId: { in: terminalIds } }, orderBy: { id: 'asc' } }), terminalAudits);
      const single = await tx.alarmIncident.create({ data: { alarmId: rule.id, fingerprint: `${prefix}-single-lifecycle`, source: 'fixture', severity: 'ALARM_HIGH', category: 'CONFIG_ACCESS', title: prefix, message: 'Single lifecycle retry fixture' } });
      assert.equal((await patch({ ids: [single.id], action: 'CLOSE' })).status, 400, 'An open incident still cannot be closed directly');
      for (const action of ['RESOLVE', 'CLOSE']) {
        assert.equal((await patch({ ids: [single.id], action, reason: `${action} initial reason` })).status, 200);
        const afterSingle = await tx.alarmIncident.findUniqueOrThrow({ where: { id: single.id }, include: { transitions: { orderBy: { id: 'asc' } }, occurrences: true } });
        const singleAudits = await tx.auditLog.findMany({ where: { entityId: single.id }, orderBy: { id: 'asc' } });
        assert.equal((await patch({ ids: [single.id], action, reason: 'Retry must not replace the first reason' })).status, 200);
        assert.deepEqual(await tx.alarmIncident.findUniqueOrThrow({ where: { id: single.id }, include: { transitions: { orderBy: { id: 'asc' } }, occurrences: true } }), afterSingle, 'Single lifecycle retries preserve reasons, actors, timestamps and history');
        assert.deepEqual(await tx.auditLog.findMany({ where: { entityId: single.id }, orderBy: { id: 'asc' } }), singleAudits);
      }
      const readArchive = () => tx.alarmIncident.findUniqueOrThrow({ where: { id: single.id }, include: { transitions: { orderBy: { id: 'asc' } }, occurrences: true } });
      const readArchiveAudits = () => tx.auditLog.findMany({ where: { entityId: single.id }, orderBy: { id: 'asc' } });
      for (const action of ['ARCHIVE', 'RESTORE']) {
        const beforeArchive = await readArchive();
        const beforeArchiveAudits = await readArchiveAudits();
        for (const role of ['EDITOR', 'VIEWER']) {
          const user = users[role.toLowerCase()];
          auth = { role, actor: { type: 'USER', id: user.id, name: user.name } };
          assert.equal((await patch({ ids: [single.id], action })).status, 403, 'Archive actions remain admin-only');
        }
        auth = { role: 'ADMIN', actor: { type: 'USER', id: users.admin.id, name: users.admin.name } };
        assert.deepEqual(await readArchive(), beforeArchive, 'Denied archive actions must not write');
        assert.deepEqual(await readArchiveAudits(), beforeArchiveAudits);
        assert.equal((await patch({ ids: [single.id], action, reason: `${action} initial reason` })).status, 200);
        const archived = await readArchive();
        const archivedAudits = await readArchiveAudits();
        assert.equal(archived.archiveState, action === 'ARCHIVE' ? 'ARCHIVED' : 'HOT');
        assert.equal(archived.status, 'CLOSED', 'Restoring must not reopen the incident');
        assert.equal(archived.archiveReason, action === 'ARCHIVE' ? `${action} initial reason` : null);
        assert.equal(archived.archivedAt !== null, action === 'ARCHIVE');
        assert.equal(archived.transitions.length, beforeArchive.transitions.length + 1);
        assert.equal(archivedAudits.length, beforeArchiveAudits.length + 1);
        assert.equal((await patch({ ids: [single.id], action, reason: 'Retry must preserve the first archive record' })).status, 200);
        assert.deepEqual(await readArchive(), archived, 'Archive retries preserve timestamps, reasons and all history');
        assert.deepEqual(await readArchiveAudits(), archivedAudits, 'Archive retries must not duplicate audit');
      }
      const readHold = () => tx.alarmIncident.findUniqueOrThrow({ where: { id: single.id }, include: { transitions: { orderBy: { id: 'asc' } }, occurrences: true } });
      const readHoldAudits = () => tx.auditLog.findMany({ where: { entityId: single.id }, orderBy: { id: 'asc' } });
      for (const action of ['SET_LEGAL_HOLD', 'RELEASE_LEGAL_HOLD']) {
        const beforeHold = await readHold();
        const beforeHoldAudits = await readHoldAudits();
        for (const role of ['EDITOR', 'VIEWER']) {
          const user = users[role.toLowerCase()];
          auth = { role, actor: { type: 'USER', id: user.id, name: user.name } };
          assert.equal((await patch({ ids: [single.id], action })).status, 403, 'Legal hold actions remain admin-only');
        }
        auth = { role: 'ADMIN', actor: { type: 'USER', id: users.admin.id, name: users.admin.name } };
        assert.deepEqual(await readHold(), beforeHold, 'Denied legal hold actions must not write');
        assert.deepEqual(await readHoldAudits(), beforeHoldAudits);
        const reason = `${action} initial reason`;
        assert.equal((await patch({ ids: [single.id], action, reason })).status, 200);
        const held = await readHold();
        const heldAudits = await readHoldAudits();
        const type = action === 'SET_LEGAL_HOLD' ? 'LEGAL_HOLD_SET' : 'LEGAL_HOLD_RELEASED';
        assert.equal(held.legalHold, action === 'SET_LEGAL_HOLD');
        assert.equal(held.transitions.length, beforeHold.transitions.length + 1);
        const movement = held.transitions.find(row => row.type === type);
        assert(movement);
        assert.equal(movement.actorId, users.admin.id); assert.equal(movement.actorName, users.admin.name);
        assert.equal(movement.reason, reason); assert.equal(movement.fromStatus, 'CLOSED'); assert.equal(movement.toStatus, 'CLOSED');
        assert.deepEqual({ ...held, legalHold: beforeHold.legalHold, updatedAt: beforeHold.updatedAt,
          transitions: held.transitions.filter(row => row.id !== movement.id) }, beforeHold, 'Legal hold preserves lifecycle, archive, assignment and occurrences');
        assert.equal(heldAudits.length, beforeHoldAudits.length + 1);
        assert.equal((await patch({ ids: [single.id], action, reason: 'Retry must preserve the first legal hold record' })).status, 200);
        assert.deepEqual(await readHold(), held, 'Legal hold retries preserve timestamps, reasons and all history');
        assert.deepEqual(await readHoldAudits(), heldAudits, 'Legal hold retries must not duplicate audit');
      }
      const beforeInvalidArchive = await tx.alarmIncident.findUniqueOrThrow({ where: { id: boundary.id }, include: { transitions: true } });
      const invalidArchiveAudits = await tx.auditLog.count({ where: { entityId: boundary.id } });
      assert.equal((await patch({ ids: [boundary.id], action: 'ARCHIVE' })).status, 400, 'An unresolved close cannot be bypassed by archiving');
      assert.deepEqual(await tx.alarmIncident.findUniqueOrThrow({ where: { id: boundary.id }, include: { transitions: true } }), beforeInvalidArchive);
      assert.equal(await tx.auditLog.count({ where: { entityId: boundary.id } }), invalidArchiveAudits);
      const orderedIds = [...batchIds].sort();
      await tx.alarmIncident.update({ where: { id: orderedIds[0] }, data: { status: 'RESOLVED' } });
      await tx.alarmIncident.update({ where: { id: orderedIds[1] }, data: { status: 'OPEN' } });
      const beforeLateClose = await tx.alarmIncident.findMany({ where: { id: { in: batchIds } }, orderBy: { id: 'asc' } });
      const closeHistoryCount = await tx.alarmLifecycleTransition.count({ where: { incidentId: { in: batchIds } } });
      const closeAuditCount = await tx.auditLog.count({ where: { entityId: { in: batchIds } } });
      assert.equal((await patch({ ids: orderedIds, action: 'CLOSE', reason: 'Tamamlandı' })).status, 400);
      assert.deepEqual(await tx.alarmIncident.findMany({ where: { id: { in: batchIds } }, orderBy: { id: 'asc' } }), beforeLateClose, 'A late close failure must restore an earlier close');
      assert.equal(await tx.alarmLifecycleTransition.count({ where: { incidentId: { in: batchIds } } }), closeHistoryCount);
      assert.equal(await tx.auditLog.count({ where: { entityId: { in: batchIds } } }), closeAuditCount);
      const whitelist = load('app/api/alarms/whitelist/route.ts');
      const postExclusion = body => whitelist.POST(new NextRequest('http://localhost/api/alarms/whitelist', { method: 'POST', body: JSON.stringify(body) }));
      const exclusion = { alarmCode: prefix, field: 'sourceIp', value: '198.51.100.42', reason: '  Planned source\nVerified  ', createdBy: 'Spoofed creator', expiresAt: '2030-01-01T00:00:00Z' };
      const exclusionsBefore = await tx.alarmWhitelist.findMany({ orderBy: { id: 'asc' } });
      for (const change of [{ field: 'invalid' }, { value: '' }, { alarmCode: 42 }, { reason: {} }, { expiresAt: 'invalid' }, { expiresAt: 42 }]) assert.equal((await postExclusion({ ...exclusion, ...change })).status, 400);
      assert.deepEqual(await tx.alarmWhitelist.findMany({ orderBy: { id: 'asc' } }), exclusionsBefore);
      auth = { role: 'EDITOR', actor: { type: 'USER', id: users.editor.id, name: users.editor.name } };
      const exclusionResponse = await postExclusion(exclusion);
      assert.equal(exclusionResponse.status, 200); assert.equal((await exclusionResponse.json()).action, 'created');
      const createdExclusion = await tx.alarmWhitelist.findUniqueOrThrow({ where: { alarmCode_field_value: { alarmCode: prefix, field: exclusion.field, value: exclusion.value } } });
      assert.equal(createdExclusion.createdBy, users.editor.name); assert.equal(createdExclusion.reason, exclusion.reason.trim()); assert.equal(createdExclusion.expiresAt.toISOString(), '2030-01-01T00:00:00.000Z');
      auth = { role: 'ADMIN', actor: { type: 'USER', id: users.admin.id, name: users.admin.name } };
      const replayExclusion = await postExclusion(exclusion);
      assert.equal(replayExclusion.status, 200); assert.equal((await replayExclusion.json()).action, 'unchanged');
      assert.deepEqual(await tx.alarmWhitelist.findUniqueOrThrow({ where: { id: createdExclusion.id } }), createdExclusion, 'Identical exclusion replay preserves creator, expiry and timestamps');
      assert.equal((await (await postExclusion({ ...exclusion, reason: 'New intentional reason' })).json()).action, 'updated');
      let editedExclusion = await tx.alarmWhitelist.findUniqueOrThrow({ where: { id: createdExclusion.id } });
      assert.equal(editedExclusion.reason, 'New intentional reason'); assert.equal(editedExclusion.createdBy, users.editor.name); assert.deepEqual(editedExclusion.createdAt, createdExclusion.createdAt);
      assert.equal((await (await postExclusion({ ...exclusion, reason: undefined })).json()).action, 'unchanged');
      await tx.alarmWhitelist.update({ where: { id: createdExclusion.id }, data: { enabled: false } });
      assert.equal((await (await postExclusion(exclusion)).json()).action, 'updated');
      editedExclusion = await tx.alarmWhitelist.findUniqueOrThrow({ where: { id: createdExclusion.id } });
      assert.equal(editedExclusion.enabled, true); assert.equal(editedExclusion.reason, exclusion.reason.trim());
      assert.equal(await tx.alarmWhitelist.count({ where: { alarmCode: prefix } }), 1);
      assert.deepEqual(await tx.alarmWhitelist.findMany({ where: { id: { not: createdExclusion.id } }, orderBy: { id: 'asc' } }), exclusionsBefore, 'Other exclusions stay unchanged');
      const deleteExclusion = query => whitelist.DELETE(new NextRequest(`http://localhost/api/alarms/whitelist${query}`, { method: 'DELETE' }));
      const exclusionCanary = await tx.alarmWhitelist.create({ data: { alarmCode: prefix, field: 'destIp', value: exclusion.value, reason: 'Same value, different field', createdBy: users.editor.name, enabled: false } });
      const beforeRemoval = await tx.alarmWhitelist.findMany({ orderBy: { id: 'asc' } });
      for (const query of ['', '?id=', '?id=%20%20', `?id=${createdExclusion.id}&id=${exclusionCanary.id}`, `?id=%20${createdExclusion.id}`]) assert.equal((await deleteExclusion(query)).status, 400);
      assert.deepEqual(await tx.alarmWhitelist.findMany({ orderBy: { id: 'asc' } }), beforeRemoval, 'Invalid IDs must not delete any record');
      const removal = await deleteExclusion(`?id=${createdExclusion.id}`);
      assert.equal(removal.status, 200); assert.deepEqual(await removal.json(), { success: true, removed: 1 });
      const afterRemoval = beforeRemoval.filter(row => row.id !== createdExclusion.id);
      assert.deepEqual(await tx.alarmWhitelist.findMany({ orderBy: { id: 'asc' } }), afterRemoval, 'Delete changes only the requested ID, retaining disabled and different-field entries');
      const removalReplay = await deleteExclusion(`?id=${createdExclusion.id}`);
      assert.equal(removalReplay.status, 200); assert.deepEqual(await removalReplay.json(), { success: true, removed: 0 });
      assert.deepEqual(await tx.alarmWhitelist.findMany({ orderBy: { id: 'asc' } }), afterRemoval);
      assert.equal((await postExclusion(exclusion)).status, 200);
      const replacement = await tx.alarmWhitelist.findUniqueOrThrow({ where: { alarmCode_field_value: { alarmCode: prefix, field: exclusion.field, value: exclusion.value } } });
      assert.notEqual(replacement.id, createdExclusion.id);
      const beforeStaleReplay = await tx.alarmWhitelist.findMany({ orderBy: { id: 'asc' } });
      const staleReplay = await deleteExclusion(`?id=${createdExclusion.id}`);
      assert.equal(staleReplay.status, 200); assert.deepEqual(await staleReplay.json(), { success: true, removed: 0 });
      assert.deepEqual(await tx.alarmWhitelist.findMany({ orderBy: { id: 'asc' } }), beforeStaleReplay, 'A stale delete cannot remove a newly created exclusion for the same matching key');
      const getExclusions = () => whitelist.GET(new NextRequest('http://localhost/api/alarms/whitelist?includeDisabled=true'));
      for (const role of ['ADMIN', 'EDITOR', 'VIEWER']) {
        const user = users[role.toLowerCase()];
        auth = { role, actor: { type: 'USER', id: user.id, name: user.name } };
        const read = await getExclusions();
        assert.equal(read.status, 200); assert.equal((await read.json()).canDelete, role === 'ADMIN');
        assert.equal(read.headers.get('Cache-Control'), 'no-store');
        if (role !== 'ADMIN') assert.equal((await deleteExclusion(`?id=${replacement.id}`)).status, 403, 'Only current ADMIN may remove exclusions');
        assert.deepEqual(await tx.alarmWhitelist.findMany({ orderBy: { id: 'asc' } }), beforeStaleReplay);
      }
      auth = { role: 'NO_ACCESS', actor: { type: 'USER', id: users.admin.id, name: users.admin.name } };
      for (const response of [await getExclusions(), await deleteExclusion(`?id=${replacement.id}`)]) {
        assert.equal(response.status, 403); assert(!Object.hasOwn(await response.json(), 'data'));
      }
      assert.deepEqual(await tx.alarmWhitelist.findMany({ orderBy: { id: 'asc' } }), beforeStaleReplay, 'Unauthorized reads/deletes cannot change exclusion data');
      auth = { role: 'VIEWER', actor: { type: 'USER', id: users.viewer.id, name: users.viewer.name } };
      for (const body of [exclusion, { ...exclusion, value: '198.51.100.99' }, { ...exclusion, field: 'destIp', reason: 'Unauthorized reenable' }]) {
        const denied = await postExclusion(body); assert.equal(denied.status, 403); assert(!Object.hasOwn(await denied.json(), 'data'));
      }
      const unreadBody = new NextRequest('http://localhost/api/alarms/whitelist', { method: 'POST', body: '{invalid-json' });
      assert.equal((await whitelist.POST(unreadBody)).status, 403, 'Write authorization precedes body parsing and mutation');
      assert.deepEqual(await tx.alarmWhitelist.findMany({ orderBy: { id: 'asc' } }), beforeStaleReplay, 'Unauthorized creation, update and reactivation must not change any exclusion');
      auth = { role: 'VIEWER', actor: { type: 'USER', id: users.viewer.id, name: users.viewer.name } };
      assert.equal((await patch({ ids: batchIds, action: 'ASSIGN', assigneeId: users.admin.id })).status, 403);
      for (const action of ['RESOLVE', 'CLOSE']) assert.equal((await patch({ ids: lifecycleIds, action, bulk: true })).status, 403);
      auth = null;
      assert.equal((await postExclusion(exclusion)).status, 401);
      assert.equal((await deleteExclusion(`?id=${replacement.id}`)).status, 401);
      const deniedRead = await getExclusions(); assert.equal(deniedRead.status, 401); assert(!Object.hasOwn(await deniedRead.json(), 'data'));
      assert.deepEqual(await tx.alarmWhitelist.findMany({ orderBy: { id: 'asc' } }), beforeStaleReplay, 'Unauthenticated removal cannot write');
      assert.equal((await patch({ ids: [ackOnly.id], action: 'ACKNOWLEDGE' })).status, 401);
      assert.equal((await patch({ ids: [ackOnly.id], action: 'UNACKNOWLEDGE' })).status, 401);
      assert.equal((await patch({ ids: batchIds, action: 'ASSIGN', assigneeId: users.admin.id })).status, 401);
      assert.equal((await patch({ action: 'ADD_NOTE', reason: 'Denied' })).status, 401);
      assert.equal((await getPeople()).status, 401);
      await assert.rejects(() => service.transitionAlarmIncident({ incidentId: incident.id, action: 'ADD_NOTE', reason: ' ', actor: { type: 'SYSTEM', name: 'fixture' } }), /boş/);
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await db.user.count({ where: { id: { in: fixtureIds } } }), 0, 'All test users must roll back');
  assert.equal(await db.alarmDefinition.count({ where: { code: prefix } }), 0, 'All test incidents, notes and audits must roll back');
  assert.equal(await db.alarmWhitelist.count({ where: { alarmCode: prefix } }), 0, 'All test exclusions must roll back');
  console.log('Incident collaboration passed: real PostgreSQL assignment/unassignment, canonical names, active-role validation, append-only notes, actor/time, detail re-read, audit, unchanged lifecycle, auth/roles, invalid inputs and complete rollback. No operational incident changed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
