/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS regression runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
let rows = [], queries = [];
let auth = { role: 'ADMIN', actor: { type: 'USER', id: 'fixture-admin', name: 'Fixture Admin' } }, reads = 0;
const prisma = { auditLog: {
  findMany: async query => { reads++; queries.push(query); return rows.slice(0, query.take); },
  count: async () => { reads++; return rows.length; },
} };
function load(relative) {
  const filename = path.resolve(root, relative.endsWith('.ts') ? relative : `${relative}.ts`);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const localRequire = name => name === '@/lib/prisma' ? { prisma } : (name === '@/lib/auth/request-actor' || name === './request-actor') ? { getRequestActor: async () => { if (auth instanceof Error) throw auth; return auth; } } : name.startsWith('@/') ? load(name.slice(2)) : name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), name))) : require(name);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename })(localRequire, mod, mod.exports);
  return mod.exports;
}
async function main() {
  const query = load('lib/audit/query'), view = load('lib/audit/view');
  const range = query.auditDateRange('2026-10-16', '2026-10-16');
  assert.equal(range.gte.toISOString(), '2026-10-15T21:00:00.000Z');
  assert.equal(range.lt.toISOString(), '2026-10-16T21:00:00.000Z');
  assert.equal(range.lte, undefined);
  assert.equal(query.auditDateRange('2016-01-01').gte.toISOString(), '2015-12-31T22:00:00.000Z');
  assert.equal(new Date('2026-10-16T20:59:59.999Z') < range.lt, true);
  assert.equal(new Date('2026-10-16T21:00:00Z') < range.lt, false);
  assert.equal(query.auditDateRange(undefined, '2026-10-16T12:00:00Z').lte.toISOString(), '2026-10-16T12:00:00.000Z');
  for (const params of ['startDate=2026-10-17&endDate=2026-10-16', 'startDate=2026-02-30', 'startDate=2026-02-30T09:00:00Z', 'endDate=garbage', 'page=-1', 'page=1.5', 'pageSize=1000', 'page=NaN']) assert.throws(() => query.parseAuditQuery(new URLSearchParams(params)), query.AuditQueryError);
  assert.equal(view.auditKind('SSH_CONFIG_BACKUP_DELETED').kind, 'delete');
  assert.equal(view.auditKind('user.delete').kind, 'delete');
  assert.equal(view.auditKind('undeleted_marker').kind, 'other');
  assert.equal(view.auditKind('SSH_CONFIG_BACKUP_FAILED').tone, 'warning');
  assert.equal(view.auditTitle('unmapped.custom'), 'Diğer işlem');
  assert.equal(view.auditValue(false), 'Hayır'); assert.equal(view.auditValue(0), '0');
  assert.equal(view.auditTime('invalid'), 'Tarih bilinmiyor');
  assert.match(view.auditTime('2026-10-16T09:00:00Z'), /12:00:00 TSİ$/);
  assert.deepEqual(view.auditPreset(7, new Date('2026-10-15T22:00:00Z')), { startDate: '2026-10-10', endDate: '2026-10-16' });
  const filters = { ...view.emptyAuditFilters, action: 'silme', user: ' Ayşe ', startDate: '2026-10-16', endDate: '2026-10-16' };
  assert.equal(view.auditFilterParams(filters).get('action'), 'delete');
  assert.equal(view.auditFilterParams(filters).get('user'), 'Ayşe');
  const exactActor = view.auditFilterParams({ ...filters, user: 'Ayşe', userId: 'actor-id' });
  assert.equal(exactActor.get('userId'), 'actor-id'); assert.equal(exactActor.has('user'), false);
  assert.equal(query.auditWhere({ userId: 'actor-id' }).userId, 'actor-id');
  const list = load('app/api/audit/route'), csv = load('app/api/audit/export/route');
  const row = { id: 'audit-test', action: 'user.delete', resource: 'user', resourceId: 'deleted-id', userId: 'actor', user: { name: '=FORMULA', email: 'test@example.invalid', role: 'ADMIN' }, timestamp: new Date('2026-10-16T20:59:59.999Z'), details: { count: 0, enabled: false }, ipAddress: null, userAgent: null };
  rows = [row];
  const params = view.auditFilterParams(filters).toString();
  const request = new Request(`http://localhost/api/audit?${params}&page=1&pageSize=25`);
  const response = await list.GET(request); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.data.length, 1); assert.equal(result.pagination.total, 1);
  assert.equal(view.isAuditEntry(result.data[0]), true);
  for (const value of [null, {}, { ...result.data[0], id: null }, { ...result.data[0], userName: {} }]) assert.equal(view.isAuditEntry(value), false);
  for (const details of [false, 0, [], { enabled: false, count: 0 }]) assert.equal(view.isAuditEntry({ ...result.data[0], details }), true);
  const listWhere = queries.at(-1).where;
  assert.equal(listWhere.OR[0].user.name.contains, 'Ayşe');
  assert.equal(listWhere.OR[1].user.email.contains, 'Ayşe');
  const exported = await csv.GET(new Request(`http://localhost/api/audit/export?${params}`));
  assert.equal(exported.status, 200); assert.deepEqual(queries.at(-1).where, listWhere);
  assert.equal(exported.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(Array.from(new Uint8Array(await exported.clone().arrayBuffer()).slice(0, 3)), [239, 187, 191]);
  const contents = await exported.text(); assert.match(contents, /Tarih ve saat \(UTC\)/); assert.match(contents, /"'=FORMULA"/);
  assert.equal(exported.headers.get('X-Audit-Export-Truncated'), 'false');
  for (const handler of [list.GET, csv.GET]) {
    const before = queries.length;
    assert.equal((await handler(new Request('http://localhost/api/audit?startDate=2026-10-17&endDate=2026-10-16'))).status, 400);
    assert.equal(queries.length, before);
  }
  rows = Array.from({ length: 10001 }, (_, index) => ({ ...row, id: `audit-${index}` }));
  const capped = await csv.GET(new Request('http://localhost/api/audit/export'));
  assert.equal(capped.headers.get('X-Audit-Export-Truncated'), 'true');
  assert.equal((await capped.text()).split('\n').length, 10001);
  assert.equal((await list.DELETE()).status, 405);
  const administrator = auth;
  for (const identity of [null, { ...administrator, role: 'EDITOR' }, { ...administrator, role: 'VIEWER' }, new Error('Fixture identity lookup failure')]) {
    auth = identity;
    const expected = identity instanceof Error ? 503 : identity ? 403 : 401;
    for (const handler of [list.GET, csv.GET]) for (const suffix of ['', '?page=-1']) {
      const before = reads;
      const denied = await handler(new Request(`http://localhost/api/audit${suffix}`));
      assert.equal(denied.status, expected, 'Current identity must authorize before query parsing or audit reads');
      assert(!Object.hasOwn(await denied.json(), 'data'));
      assert.equal(reads, before);
    }
  }
  auth = administrator;
  console.log('Audit workspace checks passed: Turkish calendar days, inclusive end date, user search, list/export parity, CSV limits/escaping, operation labels and immutable records.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
