// Read-only route checks with an isolated in-memory Prisma dependency. No live data is changed.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node regression entry point. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const { AlarmSeverity2 } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const severities = Object.values(AlarmSeverity2);
const records = Array.from({ length: 47 }, (_, index) => ({
  id: `incident-${String(index).padStart(3, '0')}`, severity: severities[index % 5],
  lastSeenAt: new Date(Date.UTC(2026, 9, 15, 9, Math.floor(index / 3))),
  firstSeenAt: new Date('2026-10-14T10:00:00Z'), status: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED'][index % 4],
  archiveState: index > 40 ? 'ARCHIVED' : 'HOT', source: ['nms', 'vmware', 'fortianalyzer'][index % 3],
  title: `Incident ${index}`, message: '', entityId: `entity-${index}`, occurrenceCount: 1,
  assignedToId: [null, 'test', 'other'][index % 3], assignedTo: [null, 'Operatör', 'Diğer operatör'][index % 3],
  alarm: { code: 'NMS_MEMORY_HIGH' }, occurrences: [{ deviceName: index % 2 ? 'CORE-SWITCH' : 'EDGE-ROUTER' }],
}));
const compare = (key, a, b) => key === 'severity' ? severities.indexOf(a) - severities.indexOf(b) : a > b ? 1 : a < b ? -1 : 0;
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(item => matches(row, item));
    if (key === 'OR') return value.some(item => matches(row, item));
    if (key === 'alarm') return matches(row.alarm, value);
    if (key === 'occurrences') return row.occurrences.some(item => matches(item, value.some));
    if (value instanceof Date) return +row[key] === +value;
    if (value && typeof value === 'object') return Object.entries(value).every(([operator, operand]) => {
      if (operator === 'in') return operand.includes(row[key]);
      if (operator === 'contains') return String(row[key]).toLowerCase().includes(operand.toLowerCase());
      if (operator === 'mode') return true;
      const order = compare(key, row[key], operand);
      return operator === 'gt' ? order > 0 : operator === 'lt' ? order < 0 : operator === 'gte' ? order >= 0 : operator === 'lte' ? order <= 0 : false;
    });
    return row[key] === value;
  });
}
const ordered = (rows, order) => [...rows].sort((a, b) => {
  for (const clause of order) { const [key, direction] = Object.entries(clause)[0]; const difference = compare(key, a[key], b[key]); if (difference) return direction === 'asc' ? difference : -difference; }
  return 0;
});
let authorized = true;
let currentUserId = 'test';
let exportedQuery;
const prisma = { alarmIncident: {
  findMany: async query => { if (query.take === 10000) exportedQuery = query; return ordered(records.filter(row => matches(row, query.where)), query.orderBy).slice(0, query.take); },
  count: async ({ where }) => records.filter(row => matches(row, where)).length,
  groupBy: async ({ by, where }) => {
    const counts = new Map(); for (const row of records.filter(row => matches(row, where))) counts.set(row[by[0]], (counts.get(row[by[0]]) || 0) + 1);
    return [...counts].map(([value, count]) => ({ [by[0]]: value, _count: { id: count } }));
  },
} };
const mocks = {
  '@/lib/prisma': { prisma },
  '@/lib/auth/request-actor': { getRequestActor: async () => authorized ? { role: 'ADMIN', actor: { id: currentUserId } } : null },
  '@/lib/auth/api-permission': { authorizeApiRequest: () => { throw new Error('No write authorization allowed in read-only tests'); } },
  '@/lib/alarms/incident-service': { transitionAlarmIncident: () => { throw new Error('No writes allowed in read-only tests'); } },
};
const cache = new Map();
function load(relative) {
  const filename = path.join(root, relative); if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const localRequire = name => mocks[name] || (name.startsWith('@/') ? load(name.slice(2) + '.ts') : require(name));
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename })(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const req = params => new NextRequest(`http://localhost/api/alarm-incidents?${params}`);
async function main() {
  const helper = load('lib/alarms/incident-list.ts');
  const route = load('app/api/alarm-incidents/route.ts');
  for (const assignee of ['all', 'me', 'unassigned', 'other']) for (const sort of ['severity', 'lastSeenAt']) for (const direction of ['asc', 'desc']) {
    const params = new URLSearchParams({ limit: '3', sort, direction, assignee, status: 'OPEN,ACKNOWLEDGED', archiveState: 'HOT' });
    const ordering = helper.incidentListOrdering(params);
    const expected = ordered(records.filter(row => matches(row, helper.incidentListFilters(params, currentUserId))), ordering.orderBy);
    const ids = []; let pages = 0;
    do {
      const response = await route.GET(req(params)); assert.equal(response.status, 200);
      const body = await response.json(); assert.equal(body.total, expected.length);
      assert(body.data.length <= 3); ids.push(...body.data.map(row => row.id));
      if (!body.nextCursor) break;
      params.set('cursor', body.nextCursor); assert(++pages < 20, 'Cursor must terminate');
    } while (true);
    assert.deepEqual(ids, expected.map(row => row.id), `${sort} ${direction} must traverse every tie without duplicates/skips`);
    assert.equal(new Set(ids).size, ids.length);
  }
  const badCursor = await route.GET(req('sort=severity&direction=asc&cursor=invalid')); assert.equal(badCursor.status, 400);
  const encoded = helper.encodeIncidentCursor(records[0], helper.incidentListOrdering(new URLSearchParams('sort=severity&direction=asc')));
  assert.equal((await route.GET(req(`sort=lastSeenAt&cursor=${encoded}`))).status, 400, 'Cursors cannot cross sort orders');
  const legacy = Buffer.from(JSON.stringify({ id: records[0].id, lastSeenAt: records[0].lastSeenAt })).toString('base64url');
  assert.equal((await route.GET(req(`cursor=${legacy}`))).status, 200);
  assert.equal((await route.GET(req('from=invalid'))).status, 400);
  assert.equal((await route.GET(req('limit=NaN'))).status, 200);
  const body = await (await route.GET(req('status=RESOLVED'))).json();
  const activeCritical = records.filter(row => row.archiveState === 'HOT' && ['OPEN', 'ACKNOWLEDGED'].includes(row.status) && row.severity === 'ALARM_CRITICAL').length;
  assert.equal(body.overview.activeSeverity.ALARM_CRITICAL, activeCritical, 'Summary excludes resolved critical incidents');
  assert.equal(body.overview.status.OPEN, records.filter(row => row.archiveState === 'HOT' && row.status === 'OPEN').length, 'Tab counts remain independent of current view');
  const exportRoute = load('app/api/alarm-incidents/export/route.ts');
  assert.throws(() => helper.incidentAssigneeFilter(new URLSearchParams('assignee=me')), /oturum/);
  const mine = await (await route.GET(req('assignee=me&assignedToId=other&userId=other&status=RESOLVED'))).json();
  assert(mine.data.every(row => row.assignedToId === 'test'), 'Mine derives identity from the session and ignores client user identity');
  assert.equal(mine.overview.status.OPEN || 0, records.filter(row => row.archiveState === 'HOT' && row.status === 'OPEN' && row.assignedToId === 'test').length);
  assert.equal(mine.overview.activeSeverity.ALARM_CRITICAL || 0, records.filter(row => row.archiveState === 'HOT' && ['OPEN', 'ACKNOWLEDGED'].includes(row.status) && row.severity === 'ALARM_CRITICAL' && row.assignedToId === 'test').length);
  currentUserId = 'other';
  const anotherUser = await (await route.GET(req('assignee=me'))).json();
  assert(anotherUser.data.length > 0 && anotherUser.data.every(row => row.assignedToId === 'other'));
  currentUserId = 'test';
  for (const assignee of ['me', 'unassigned', 'other', 'missing-user']) {
    const params = new URLSearchParams({ assignee, search: 'CORE-SWITCH', archiveState: 'HOT', sort: 'severity', direction: 'asc' });
    const filtered = await (await route.GET(req(params))).json();
    assert.equal(filtered.total, records.filter(row => matches(row, helper.incidentListFilters(params, currentUserId))).length);
    const response = await exportRoute.GET(req(params)); assert.equal(response.status, 200);
    assert.deepEqual(exportedQuery.where, helper.incidentListFilters(params, currentUserId));
    assert.equal((await response.text()).trim().split('\n').length - 1, filtered.total, 'Assignee CSV and list use identical filters');
  }
  for (const assignee of ['   ', 'x'.repeat(201)]) {
    const params = new URLSearchParams({ assignee });
    assert.equal((await route.GET(req(params))).status, 400);
    assert.equal((await exportRoute.GET(req(params))).status, 400);
  }
  const filters = new URLSearchParams('archiveState=HOT&status=OPEN,ACKNOWLEDGED&source=switch&severity=ALARM_HIGH&search=CORE-SWITCH&sort=severity&direction=asc');
  const list = await (await route.GET(req(filters))).json();
  assert(list.total > 0, 'Search must match occurrence device names');
  const exported = await exportRoute.GET(req(filters)); assert.equal(exported.status, 200);
  assert.deepEqual(exportedQuery.where, helper.incidentListFilters(filters));
  assert.deepEqual(exportedQuery.orderBy, helper.incidentListOrdering(filters).orderBy);
  const csv = await exported.text();
  assert.equal(csv.trim().split('\n').length - 1, list.total, 'CSV must export the same filtered rows');
  authorized = false;
  assert.equal((await route.GET(req('assignee=me'))).status, 401);
  assert.equal((await exportRoute.GET(req(filters))).status, 401);
  assert.equal((await exportRoute.GET(req('assignee=me'))).status, 401);
  console.log('Incident center passed: all/mine/unassigned/user scopes across both sort directions and cursor pages, session identity, scoped counters, empty/invalid filters, matching CSV, legacy cursor and auth. No live records changed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
