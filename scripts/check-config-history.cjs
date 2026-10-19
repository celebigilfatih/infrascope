/* eslint-disable @typescript-eslint/no-require-imports -- Pure frontend contracts, synthetic HTTP; no database or integration access. */
const assert = require('node:assert/strict');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
let transport = async () => { throw Error('Unexpected network'); };
const model = moduleLoader({}, { AbortController, setTimeout, clearTimeout, fetch: (...args) => transport(...args) })('lib/firewall/config-history.ts');
const at = '2026-10-17T12:00:00Z', old = '2026-10-16T12:00:00Z';
const row = { id: 'event-1', category: 'config', deviceId: 'FG-TEST', vdom: 'root', occurredAt: at, action: 'Edit', user: 'TEST' };
const page = items => ({ items, pagination: { total: items.length, hasMore: false } });
const file = (id, createdAt, backupType = 'Running Config') => ({ id, createdAt, backupType, backupFile: id + '.cfg', sizeBytes: '0', checksum: 'fixture-checksum' });
async function main() {
  const events = model.scopedConfigEvents(page([{ ...row, id: 'undated', occurredAt: 'invalid' }, row]), 'FG-TEST', 'root');
  assert.equal(events.items[0].id, 'event-1'); assert.equal(events.items[1].at, null); assert.equal(events.total, 2);
  assert.equal(model.parseConfigEvents(page([])).total, 0);
  assert.throws(() => model.scopedConfigEvents(page([{ ...row, deviceId: 'OTHER' }]), 'FG-TEST', 'root'));
  assert.throws(() => model.scopedConfigEvents(page([{ ...row, vdom: 'OTHER' }]), 'FG-TEST', 'root'));
  assert.throws(() => model.parseConfigEvents(page([{ ...row, category: 'auth' }])));
  assert.equal(model.parseConfigEvents({ ...page([row]), pagination: { total: 500, hasMore: true } }).truncated, true);
  const versions = model.parseConfigVersions({ backups: [file('old', old), file('new', at), file('startup', old, 'Startup Config')], permissions: { create: true } });
  assert.equal(versions.items[0].id, 'new'); assert.equal(versions.items[0].bytes, 0); assert.equal(versions.canRead, true);
  const before = versions.items.find(v => v.id === 'old'), after = versions.items[0];
  assert.equal(model.configPairError(before, after), '');
  assert.ok(model.configPairError(after, before)); assert.ok(model.configPairError(before, before)); assert.ok(model.configPairError(versions.items.find(v => v.id === 'startup'), after)); assert.ok(model.configPairError(undefined, after));
  assert.equal(model.parseConfigVersions({ backups: [], permissions: {} }).canRead, false);
  assert.throws(() => model.parseConfigVersions({ backups: [file('same', old), file('same', at)], permissions: {} }));
  const content = { id: 'old', backupType: 'Running Config', checksum: before.checksum, configuration: 'config\nold\nend' };
  assert.equal(model.parseConfigContent(content, before), content.configuration);
  for (const extra of [{ id: 'wrong' }, { checksum: 'wrong' }, { backupType: 'Startup Config' }, { configuration: '' }, { configuration: 'x'.repeat(500001) }]) assert.throws(() => model.parseConfigContent({ ...content, ...extra }, before));
  const diff = model.compareConfigLines('config\nold\nkeep\nend', 'config\nnew\nkeep\nadded\nend');
  assert.equal(diff.added, 2); assert.equal(diff.removed, 1);
  assert.deepEqual(Array.from(diff.lines.filter(v => v.kind !== 'added'), v => v.text), ['config', 'old', 'keep', 'end']);
  assert.deepEqual(Array.from(diff.lines.filter(v => v.kind !== 'removed'), v => v.text), ['config', 'new', 'keep', 'added', 'end']);
  assert.equal(diff.lines.find(v => v.text === 'old').before, 2); assert.equal(diff.lines.find(v => v.text === 'added').after, 4);
  assert.equal(model.compareConfigLines('a\r\nb', 'a\nb').added, 0);
  assert.equal(model.compareConfigLines('same', 'same').removed, 0);
  assert.equal(model.compareConfigLines('a\na\nb', 'a\nb\nb').added, 1);
  assert.throws(() => model.compareConfigLines('a\n'.repeat(1600), 'b\n'.repeat(1600)), /çok büyük/);
  assert.throws(() => model.compareConfigLines('x'.repeat(500001), 'x'), /çok büyük/);
  // Reconstruction property across duplicate lines, insertions and removals catches alignment/line-number errors.
  for (let seed = 1; seed <= 35; seed++) {
    const a = Array.from({ length: seed % 11 + 1 }, (_, i) => String((i * 7 + seed) % 5)).join('\n');
    const b = Array.from({ length: seed % 9 + 1 }, (_, i) => String((i * 3 + seed) % 4)).join('\n');
    const result = model.compareConfigLines(a, b);
    assert.equal(result.lines.filter(v => v.kind !== 'added').map(v => v.text).join('\n'), a);
    assert.equal(result.lines.filter(v => v.kind !== 'removed').map(v => v.text).join('\n'), b);
    assert.deepEqual(Array.from(result.lines.filter(v => v.before !== null), v => v.before), Array.from({ length: a.split('\n').length }, (_, i) => i + 1));
    assert.deepEqual(Array.from(result.lines.filter(v => v.after !== null), v => v.after), Array.from({ length: b.split('\n').length }, (_, i) => i + 1));
  }
  transport = async () => Response.json({ backups: [] }); await model.requestConfigJson('/fixture', new AbortController().signal);
  for (const status of [401, 403, 404, 409, 500]) { transport = async () => Response.json({ error: 'private-provider-error' }, { status }); await assert.rejects(model.requestConfigJson('/fixture', new AbortController().signal), e => !e.message.includes('private')); }
  transport = async () => Response.json({ success: false, error: 'private' }); await assert.rejects(model.requestConfigJson('/fixture', new AbortController().signal), /Veriler alınamadı/);
  console.log('Config history passed: device/VDOM/category isolation, unknown times, bounded list scope, metadata/role contracts, version identity/type/order, exact diff reconstruction and line numbers, size limits and Turkish HTTP errors. No database or source calls.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
