// Exercise the real presentation and action code with isolated data; never modify live incidents.
/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable -- CommonJS fixture loader executes transpiled modules in a VM. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const filename = path.join(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const localRequire = name => {
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (!name.startsWith('@/') && !name.startsWith('.')) return require(name);
    const candidate = name.startsWith('@/') ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name));
    return load(fs.existsSync(path.join(root, candidate + '.tsx')) ? candidate + '.tsx' : candidate + '.ts');
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}

const fixture = {
  id: 'fixture-incident', title: 'Bellek kullanımı yüksek', message: 'Eşik aşıldı', severity: 'ALARM_HIGH', source: 'nms',
  status: 'OPEN', archiveState: 'HOT', legalHold: false, firstSeenAt: '2026-10-14T10:00:00Z', lastSeenAt: '2026-10-15T11:00:00Z', occurrenceCount: 2, reopenCount: 0, assignedTo: null,
  transitions: [
    { id: 'created', type: 'CREATED', fromStatus: null, toStatus: 'OPEN', actorType: 'SYSTEM', actorName: 'detection-engine', reason: 'First occurrence detected', createdAt: '2026-10-14T10:00:00Z' },
    { id: 'ack', type: 'ACKNOWLEDGED', fromStatus: 'OPEN', toStatus: 'ACKNOWLEDGED', actorType: 'USER', actorName: 'Operatör', reason: 'Kontrol ediliyor', createdAt: '2026-10-15T10:50:00Z' },
  ],
  occurrences: [
    { id: 'occ-1', title: 'Bellek', deviceName: 'CORE-SW', createdAt: '2026-10-14T10:00:00Z' },
    { id: 'occ-2', title: 'Bellek', deviceName: 'CORE-SW', createdAt: '2026-10-15T11:00:00Z' },
  ],
  notificationAttempts: [{ id: 'delivery', channel: 'email', status: 'FAILED_RETRYABLE', attempt: 2, error: 'Servis geçici olarak kullanılamıyor', createdAt: '2026-10-15T11:01:00Z' }],
};
const event = {
  id: 'occ-2', title: fixture.title, severity: 'ALARM_HIGH', message: fixture.message, deviceName: 'CORE-SW', sourceIp: null,
  createdAt: fixture.lastSeenAt, notifiedAt: null, notifyChannel: null,
  alarm: { code: 'NMS_MEMORY_HIGH', name: 'Bellek yüksek', description: fixture.message, category: 'OPERATIONAL', source: 'nms' },
  incident: { ...fixture },
};

async function main() {
  const i18n = load('lib/i18n/tr.ts');
  const helpers = load('lib/alarms/incident-detail-presentation.ts');
  const history = helpers.buildIncidentHistory(fixture);
  assert.equal(history.length, 5); assert.equal(history[0].kind, 'notification'); assert.equal(history[1].id, 'occurrence:occ-2');
  assert.equal(history.find(item => item.id === 'transition:ack').description, 'Açık → Onaylandı');
  assert.equal(history.find(item => item.id === 'transition:created').reason, 'İlk alarm oluşumu tespit edildi.');
  assert.equal(history[0].title, 'Bildirim yeniden denenecek');
  const collaborationHistory = helpers.buildIncidentHistory({ ...fixture, transitions: [...fixture.transitions,
    { id: 'note', type: 'NOTE_ADDED', actorType: 'USER', actorName: 'Operatör', reason: 'Kontrol edildi.\nTakip sürüyor.', createdAt: '2026-10-15T12:00:00Z' },
    { id: 'assigned', type: 'ASSIGNED', actorType: 'USER', actorName: 'Yönetici', metadata: { previousAssigneeName: null, assigneeName: 'Operatör' }, createdAt: '2026-10-15T11:59:00Z' },
  ] });
  assert.equal(collaborationHistory[0].kind, 'note'); assert.equal(collaborationHistory[0].actor, 'Operatör');
  assert.equal(collaborationHistory[0].reason, 'Kontrol edildi.\nTakip sürüyor.');
  assert.equal(collaborationHistory[1].description, 'Atanmamış → Operatör');
  assert(helpers.incidentHistoryHighlights(collaborationHistory).some(item => item.kind === 'note'));
  assert.equal(new Set(history.map(item => item.id)).size, 5);
  const noisyHistory = [...Array.from({ length: 25 }, (_, i) => ({ ...history[1], id: `repeat-${i}` })), ...history];
  const highlights = helpers.incidentHistoryHighlights(noisyHistory);
  assert(highlights.some(item => item.id === 'transition:created'), 'Repeat alarms must not bury lifecycle changes in the overview');
  assert.equal(highlights.filter(item => item.kind === 'occurrence').length, 1);
  assert.deepEqual(helpers.buildIncidentHistory({ ...fixture, transitions: [], occurrences: [], notificationAttempts: [] }), []);
  assert.equal(helpers.incidentDate('bad date'), '—');
  assert.match(helpers.incidentDate('2026-10-14T23:30:00Z'), /15/); // Explicit Istanbul timezone crosses midnight.
  const expected = { OPEN: ['ACKNOWLEDGE', 'RESOLVE'], ACKNOWLEDGED: ['RESOLVE'], RESOLVED: ['CLOSE'], CLOSED: ['ARCHIVE'] };
  for (const [status, actions] of Object.entries(expected)) assert.deepEqual(helpers.incidentLifecycleActions({ ...fixture, status }).map(item => item.action), actions);
  assert.deepEqual(helpers.incidentLifecycleActions({ ...fixture, archiveState: 'ARCHIVED' }).map(item => item.action), ['RESTORE']);
  assert.deepEqual(helpers.incidentLifecycleActions(), []);

  // Render the actual component inside the real Dialog provider: loading/error/legacy/status states.
  const { IncidentDetailWorkspace } = load('components/dashboard/IncidentDetailWorkspace.tsx');
  const { Dialog } = load('components/ui/dialog.tsx');
  const props = { event, detail: fixture, loading: false, error: null, busy: false, notice: null, description: fixture.message, onRetry() {}, onAction: async () => true, onDiscard() {}, children: React.createElement('p', null, 'Preserved technical content') };
  const render = overrides => renderToStaticMarkup(React.createElement(Dialog, { open: true }, React.createElement(IncidentDetailWorkspace, { ...props, ...overrides })));
  const html = render({});
  assert(html.includes('Olay detayı')); assert(html.includes('Olay geçmişi')); assert(html.includes('Teknik detaylar'));
  assert(html.includes('Onayla')); assert(html.includes('Çözüldü olarak işaretle')); assert(html.includes('Bildirim yeniden denenecek'));
  assert(html.includes('Sorumlu seçimi')); assert(html.includes('Yeni operasyon notu')); assert(html.includes('Not geçmişi'));
  assert(!html.includes('CREATED')); assert(!html.includes('OPEN →'));
  assert(render({ loading: true, detail: null }).includes('Olay geçmişi yükleniyor'));
  const errorHtml = render({ error: 'Ayrıntı alınamadı', detail: null }); assert(errorHtml.includes('Tekrar dene')); assert(errorHtml.includes('disabled=""'));
  assert(render({ event: { ...event, incident: undefined }, detail: null }).includes('Bu alarm bir olay kaydına bağlı değil'));
  assert(render({ detail: { ...fixture, status: 'RESOLVED' } }).includes('Olayı kapat'));
  assert(render({ detail: { ...fixture, archiveState: 'ARCHIVED' } }).includes('Arşivden çıkar'));
  assert(render({ notice: { text: 'İşlem başarısız', type: 'error' } }).includes('role="alert"'));
  const authNoteHtml = render({ notice: { text: 'Not taslağınız korundu', type: 'error', authStatus: 401 } });
  assert(authNoteHtml.includes('Yeni sekmede giriş yap')); assert(authNoteHtml.includes('target="_blank"')); assert(authNoteHtml.includes('rel="noopener noreferrer"'));
  const authAssignmentHtml = render({ notice: { text: 'Sorumlu seçiminiz korundu', type: 'error', authStatus: 401, authAction: 'ASSIGN' } });
  assert.equal(authAssignmentHtml.split('Yeni sekmede giriş yap').length - 1, 1, 'Assignment login is offered once, beside assignment controls');
  assert(authAssignmentHtml.indexOf('Yeni sekmede giriş yap') > authAssignmentHtml.indexOf('aria-label="Sorumlu atama"'));
  assert(!render({ notice: { text: 'Sorumlu değiştirme yetkiniz yok', type: 'error', authStatus: 403, authAction: 'ASSIGN' } }).includes('Yeni sekmede giriş yap'));

  // Run the actual page action closure under a fake transport. Verify success keeps the dialog open,
  // updates current status and reloads history, while failures preserve the prior incident.
  const source = fs.readFileSync(path.join(root, 'app/dashboard/alerts/page.tsx'), 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AlertsDashboardPage');
  const declaration = name => page.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name);
  const fetchArrow = declaration('fetchEvents').initializer.arguments[0].getText(ast);
  const exportArrow = declaration('exportIncidents').initializer.getText(ast);
  const listCode = ts.transpileModule(`exports.fetch = ${fetchArrow}; exports.export = ${exportArrow};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  for (const statusFilter of ['ACTIVE', 'ALL']) for (const assigneeFilter of ['all', 'me', 'unassigned', 'other']) {
    let fetched;
    const context = { ...i18n, exports: {}, filtersReady: true, assigneeFilter, statusFilter, severityFilter: 'ALARM_HIGH', sourceFilter: 'switch', archiveFilter: 'HOT', debouncedSearch: 'CORE',
      ordering: { sort: 'severity', direction: 'asc' }, page: 3, pageCursor: 'fixture-cursor', PAGE_SIZE: 25, eventRequestSequence: { current: 0 }, URLSearchParams,
      setLoading() {}, setRefreshing() {}, setFetchError() {}, window: { location: { href: '' } },
      fetch: async url => { fetched = url; return { ok: false, json: async () => ({ error: 'isolated fixture transport' }) }; }, console: { error() {} } };
    vm.createContext(context); vm.runInContext(listCode, context);
    await context.exports.fetch(); context.exports.export();
    const listParams = new URL(fetched, 'http://localhost').searchParams;
    const exportParams = new URL(context.window.location.href, 'http://localhost').searchParams;
    assert.equal(listParams.get('assignee'), assigneeFilter === 'all' ? null : assigneeFilter);
    assert.equal(listParams.get('status'), statusFilter === 'ALL' ? null : 'OPEN,ACKNOWLEDGED');
    listParams.delete('limit'); listParams.delete('cursor');
    assert.deepEqual([...listParams.entries()].sort(), [...exportParams.entries()].sort(), 'Actual page list and CSV closures must include identical filters');
    const keyExpression = declaration('filterKey').initializer.getText(ast);
    const firstKey = vm.runInContext(keyExpression, context); context.assigneeFilter = 'different';
    assert.notEqual(firstKey, vm.runInContext(keyExpression, context), 'Changing assignee resets pagination and selection scope');
  }
  const { IncidentFilters } = load('components/dashboard/IncidentOperations.tsx');
  const filterProps = { status: 'ACTIVE', severity: 'all', source: 'all', archive: 'HOT', assignee: 'me', search: '', counts: {},
    onStatus() {}, onSeverity() {}, onSource() {}, onArchive() {}, onAssignee() {}, onSearch() {} };
  const filterHtml = renderToStaticMarkup(React.createElement(IncidentFilters, filterProps));
  assert(filterHtml.includes('Sorumlu görünümü')); assert(filterHtml.includes('Sorumlu: Bana atananlar'));
  assert(renderToStaticMarkup(React.createElement(IncidentFilters, { ...filterProps, assignee: 'unassigned' })).includes('Sorumlu: Atanmamış'));
  const allStatusHtml = renderToStaticMarkup(React.createElement(IncidentFilters, { ...filterProps, status: 'ALL', counts: { OPEN: 2, ACKNOWLEDGED: 1, RESOLVED: 3, CLOSED: 4 } }));
  const allStatusButton = [...allStatusHtml.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(([, attributes]) => attributes.includes('aria-pressed="true"'));
  assert(allStatusButton); assert.equal(allStatusButton[2].replace(/<[^>]*>/g, ''), 'Tümü10');
  const batchEvents = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'].map((status, index) => ({ ...event, id: `batch-event-${index}`, incident: { ...event.incident, id: `batch-${index}`, status } }));
  const { IncidentList } = load('components/dashboard/IncidentOperations.tsx');
  const listProps = { events: batchEvents, total: 3, loading: false, refreshing: false, error: null, acknowledgingIds: new Set(), selectedIds: new Set(batchEvents.map(row => row.incident.id)),
    page: 0, hasMore: false, sort: 'severity', direction: 'asc', onSort() {}, onPrevious() {}, onNext() {}, onOpen() {}, onSelection() {}, onAcknowledgeSelected() {}, onAssignSelected: async () => ({ success: true }), onTransitionSelected: async () => ({ success: true }), onRetry() {} };
  const selectedHtml = renderToStaticMarkup(React.createElement(IncidentList, listProps));
  assert(selectedHtml.includes('3 seçili')); assert(selectedHtml.includes('Sorumlu ata')); assert(selectedHtml.includes('Açık olanları onayla (1)'));
  assert(selectedHtml.includes('Çözüldü işaretle (2)')); assert(selectedHtml.includes('Kapat (1)'));
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(elements)];
  const { IncidentBulkLifecycle } = load('components/dashboard/IncidentBulkLifecycle.tsx');
  const mixedActions = elements(IncidentList(listProps)).filter(node => node.type === IncidentBulkLifecycle);
  assert.deepEqual(mixedActions.find(node => node.props.action === 'RESOLVE').props.incidents, batchEvents.slice(0, 2).map(row => ({ id: row.incident.id, title: row.title, status: row.incident.status })));
  assert.deepEqual(mixedActions.find(node => node.props.action === 'CLOSE').props.incidents, [{ id: 'batch-2', title: event.title, status: 'RESOLVED' }]);
  assert.deepEqual(mixedActions.find(node => node.props.action === 'RESOLVE').props.excludedIncidents.map(row => row.id), ['batch-2']);
  assert.deepEqual(mixedActions.find(node => node.props.action === 'CLOSE').props.excludedIncidents.map(row => row.id), ['batch-0', 'batch-1']);
  const partialActions = elements(IncidentList({ ...listProps, selectedIds: new Set(['batch-1', 'batch-2', 'off-page']) })).filter(node => node.type === IncidentBulkLifecycle);
  assert.deepEqual(partialActions.find(node => node.props.action === 'RESOLVE').props.incidents.map(row => row.id), ['batch-1'], 'Preview excludes unselected, ineligible and off-page incidents');
  assert.deepEqual(partialActions.find(node => node.props.action === 'CLOSE').props.excludedIncidents.map(row => row.id), ['batch-1'], 'Excluded preview contains only selected current-page records');
  const closedRow = { ...event, id: 'closed-event', title: 'Kapatılmış olay', incident: { ...event.incident, id: 'closed-incident', status: 'CLOSED' } };
  const fourStatusActions = elements(IncidentList({ ...listProps, events: [...batchEvents, closedRow], selectedIds: new Set([...listProps.selectedIds, 'closed-incident']) })).filter(node => node.type === IncidentBulkLifecycle);
  for (const node of fourStatusActions) {
    const combinedIds = [...node.props.incidents, ...node.props.excludedIncidents].map(row => row.id);
    assert.equal(combinedIds.length, 4); assert.equal(new Set(combinedIds).size, 4, 'Eligible and excluded groups partition the selection without duplication');
    assert(node.props.excludedIncidents.some(row => row.id === 'closed-incident' && row.status === 'CLOSED'));
  }
  for (const action of ['RESOLVE', 'CLOSE']) {
    let selection, requests = 0;
    const props = { ...listProps, events: [...batchEvents, closedRow], selectedIds: new Set([...listProps.selectedIds, 'closed-incident', 'off-page']), onSelection: ids => { selection = ids; }, onTransitionSelected: async () => { requests++; return { success: true }; } };
    const node = elements(IncidentList(props)).find(node => node.type === IncidentBulkLifecycle && node.props.action === action);
    node.props.onKeepEligible();
    assert.deepEqual([...selection], action === 'RESOLVE' ? ['batch-0', 'batch-1'] : ['batch-2']);
    assert.equal(requests, 0, 'Pruning selection never applies a lifecycle action');
    const prunedNode = elements(IncidentList({ ...props, selectedIds: selection })).find(item => item.type === IncidentBulkLifecycle && item.props.action === action);
    assert.equal(node.key, prunedNode.key, 'Selection pruning keeps the component mounted so its draft survives');
    assert.equal(prunedNode.props.excludedIncidents.length, 0);
    prunedNode.props.onRestoreSelection(['batch-0', 'batch-1', 'batch-2', 'closed-incident', 'off-page', 'batch-0']);
    assert.deepEqual([...selection], ['batch-0', 'batch-1', 'batch-2', 'closed-incident'], 'Undo restores eligible and excluded records once, excluding unavailable IDs');
    assert.equal(requests, 0, 'Undo only updates selection');
    for (const blocked of [{ loading: true }, { refreshing: true }, { acknowledgingIds: new Set(['busy']) }]) {
      selection = undefined;
      elements(IncidentList({ ...props, ...blocked })).find(item => item.type === IncidentBulkLifecycle && item.props.action === action).props.onKeepEligible();
      assert.equal(selection, undefined, 'Selection cannot change during a pending operation or refresh');
      elements(IncidentList({ ...props, ...blocked })).find(item => item.type === IncidentBulkLifecycle && item.props.action === action).props.onRestoreSelection(['batch-0', 'closed-incident']);
      assert.equal(selection, undefined, 'Undo cannot change selection during a pending operation or refresh');
    }
  }
  const zeroCountHtml = renderToStaticMarkup(React.createElement(IncidentBulkLifecycle, { action: 'CLOSE', incidents: [], excludedIncidents: [{ id: 'open', title: 'Açık olay', status: 'OPEN' }], disabled: false, onApply: async () => ({ success: true }) }));
  assert(zeroCountHtml.includes('disabled=""')); assert(zeroCountHtml.includes('Kapat (0)'));
  const closedHtml = renderToStaticMarkup(React.createElement(IncidentList, { ...listProps, selectedIds: new Set(['batch-1', 'batch-2']) }));
  assert(closedHtml.includes('2 seçili')); assert(closedHtml.includes('Sorumlu ata')); assert(!closedHtml.includes('Seçilenleri onayla'));
  const bulkCode = ts.transpileModule(`exports.run = ${declaration('assignSelected').initializer.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  async function runBulk(response, initialBusy = false) {
    let selected = structuredClone(batchEvents[0]), selection = new Set(['batch-0', 'batch-1', 'batch-2', 'off-page']), notice, request, calls = 0, refreshes = 0, revision = 0;
    const context = { ...i18n, exports: {}, bulkOperationInFlight: { current: initialBusy }, acknowledgingIds: new Set(), loading: false, refreshing: false, events: batchEvents, selectedIds: selection, viewKey: 'fixture-view',
      fetch: async (_url, init) => { calls++; request = JSON.parse(init.body); if (response instanceof Error) throw response; return { ok: response.ok, json: async () => response.body }; },
      setAcknowledgingIds: value => { context.acknowledgingIds = value; }, setMessage: value => { notice = value; },
      setSelectedEvent: setter => { selected = setter(selected); }, setIncidentDetailRevision: setter => { revision = setter(revision); },
      setSelection: value => { selection = value.ids; }, fetchEvents: async () => { refreshes++; }, Set, Error };
    vm.createContext(context); vm.runInContext(bulkCode, context);
    const result = await context.exports.run('operator');
    return { result, selection, selected, notice, request, calls, refreshes, revision, busy: context.acknowledgingIds, inFlight: context.bulkOperationInFlight.current };
  }
  const bulkSuccess = await runBulk({ ok: true, body: { success: true, updated: 3, data: [{ id: 'batch-0', assignedToId: 'operator', assignedTo: 'Operatör' }] } });
  assert.equal(bulkSuccess.result.success, true); assert.deepEqual([...bulkSuccess.request.ids], ['batch-0', 'batch-1', 'batch-2']);
  assert.equal(bulkSuccess.request.action, 'ASSIGN'); assert.equal(bulkSuccess.request.assigneeId, 'operator'); assert.equal(bulkSuccess.calls, 1);
  assert.equal(bulkSuccess.selection.size, 0); assert.equal(bulkSuccess.refreshes, 1); assert.equal(bulkSuccess.selected.incident.assignedTo, 'Operatör'); assert.equal(bulkSuccess.revision, 1);
  const bulkFailure = await runBulk({ ok: false, body: { success: false, error: 'Atama yetkisi yok' } });
  assert.equal(bulkFailure.result.success, false); assert.equal(bulkFailure.selection.size, 4); assert.equal(bulkFailure.refreshes, 0); assert.equal(bulkFailure.busy.size, 0); assert.equal(bulkFailure.inFlight, false);
  assert.equal((await runBulk(new Error('Offline'))).selection.size, 4);
  assert.equal((await runBulk({ ok: true }, true)).calls, 0, 'Duplicate bulk submissions must not issue requests');
  const { isIncidentBulkLifecycleEligible } = load('lib/alarms/incident-bulk-lifecycle.ts');
  for (const [status, resolve, close] of [['OPEN', true, false], ['ACKNOWLEDGED', true, false], ['RESOLVED', false, true], ['CLOSED', false, false]]) {
    assert.equal(isIncidentBulkLifecycleEligible(status, 'RESOLVE'), resolve); assert.equal(isIncidentBulkLifecycleEligible(status, 'CLOSE'), close);
  }
  const lifecycleCode = ts.transpileModule(`exports.run = ${declaration('transitionSelected').initializer.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  async function runLifecycle(action, response, initialBusy = false, eligible = true, reason = 'Ortak işlem açıklaması') {
    let selected = structuredClone(action === 'CLOSE' ? batchEvents[2] : batchEvents[0]), selection = new Set(eligible ? ['batch-0', 'batch-1', 'batch-2', 'off-page'] : ['batch-0']), notice, request, calls = 0, refreshes = 0, revision = 0;
    const context = { ...i18n, exports: {}, bulkOperationInFlight: { current: initialBusy }, acknowledgingIds: new Set(), loading: false, refreshing: false, events: batchEvents, selectedIds: selection, viewKey: 'fixture-view', isIncidentBulkLifecycleEligible,
      fetch: async (_url, init) => { calls++; request = JSON.parse(init.body); if (response instanceof Error) throw response; return { ok: response.ok, json: async () => response.body }; },
      setAcknowledgingIds: value => { context.acknowledgingIds = value; }, setMessage: value => { notice = value; }, setSelectedEvent: setter => { selected = setter(selected); },
      setIncidentDetailRevision: setter => { revision = setter(revision); }, setSelection: value => { selection = value.ids; }, fetchEvents: async () => { refreshes++; }, Set, Error };
    vm.createContext(context); vm.runInContext(lifecycleCode, context); const result = await context.exports.run(action, reason);
    return { result, selection, selected, notice, request, calls, refreshes, revision, busy: context.acknowledgingIds, inFlight: context.bulkOperationInFlight.current };
  }
  for (const [action, id, status] of [['RESOLVE', 'batch-0', 'RESOLVED'], ['CLOSE', 'batch-2', 'CLOSED']]) {
    const result = await runLifecycle(action, { ok: true, body: { success: true, updated: 1, skipped: 2, data: [{ id, status }] } });
    assert.equal(result.request.action, action); assert.equal(result.request.bulk, true); assert.equal(result.request.reason, 'Ortak işlem açıklaması'); assert.equal(result.result.success, true); assert.deepEqual([...result.request.ids], ['batch-0', 'batch-1', 'batch-2']);
    assert.equal(result.calls, 1); assert.equal(result.selection.size, 0); assert.equal(result.refreshes, 1); assert.equal(result.selected.incident.status, status);
    assert.equal(result.revision, 1); assert(result.notice.text.includes('2 uygun olmayan kayıt değiştirilmedi')); assert.equal(result.busy.size, 0);
    const failed = await runLifecycle(action, { ok: false, body: { success: false, error: 'Durum işlemi reddedildi' } });
    assert.equal(failed.selection.size, 4); assert.equal(failed.notice.type, 'error'); assert.equal(failed.refreshes, 0); assert.equal(failed.inFlight, false);
  }
  assert.equal((await runLifecycle('CLOSE', { ok: true }, false, false)).calls, 0, 'No eligible record must not send a request');
  assert.equal((await runLifecycle('RESOLVE', { ok: true }, true)).calls, 0);
  assert.equal((await runLifecycle('RESOLVE', new Error('Offline'))).selection.size, 4);
  for (const action of ['RESOLVE', 'CLOSE']) for (const reason of ['', ' \n ', null]) {
    const rejected = await runLifecycle(action, { ok: true }, false, true, reason);
    assert.equal(rejected.calls, 0); assert.equal(rejected.result.success, false); assert.equal(rejected.selection.size, 4);
  }
  for (const action of ['RESOLVE', 'CLOSE']) {
    const noChange = await runLifecycle(action, { ok: true, body: { success: true, updated: 0, skipped: 3, data: [] } });
    assert.equal(noChange.result.success, false); assert.equal(noChange.selection.size, 4); assert.equal(noChange.refreshes, 0);
    assert.match(noChange.result.error, /sunucuda kaydedilmiş olabilir/);
    assert(!noChange.result.error.includes('Açıklama kaydedilmedi'), 'A lost response must not be mistaken for a failed write');
    assert.equal(noChange.inFlight, false); assert.equal(noChange.busy.size, 0);
  }
  const lifecycleHelper = load('lib/alarms/incident-bulk-lifecycle.ts');
  for (const action of ['RESOLVE', 'CLOSE']) for (const status of ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED']) {
    const exclusion = lifecycleHelper.incidentBulkLifecycleExclusionReason(status, action);
    if (isIncidentBulkLifecycleEligible(status, action)) assert.equal(exclusion, null);
    else if (status === 'CLOSED') assert.match(exclusion, action === 'RESOLVE' ? /yeniden çözülemez/ : /zaten kapatılmış/);
    else if (status === 'RESOLVED') assert.match(exclusion, /zaten çözüldü/);
    else assert.match(exclusion, /önce çözüldü olarak işaretlenmelidir/);
  }
  assert.equal(lifecycleHelper.incidentBulkLifecycleReason('  Satır 1\nSatır 2  '), 'Satır 1\nSatır 2');
  assert.throws(() => lifecycleHelper.incidentBulkLifecycleReason(' \n '), /zorunlu/);
  for (const invalid of [undefined, null, '', ' \t\n ', 42, {}, 'x'.repeat(4001)]) assert.throws(() => lifecycleHelper.incidentBulkLifecycleReason(invalid));
  const reasonSource = fs.readFileSync(path.join(root, 'components/dashboard/IncidentBulkLifecycle.tsx'), 'utf8');
  const reasonAst = ts.createSourceFile('reason.tsx', reasonSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const reasonComponent = reasonAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'IncidentBulkLifecycle');
  const previewKey = reasonComponent.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(reasonAst) === 'incidentKey').initializer.getText(reasonAst);
  const keyItems = [{ id: 'a', title: 'A', status: 'OPEN' }, { id: 'b', title: 'B', status: 'ACKNOWLEDGED' }];
  const keyFor = (incidents, excludedIncidents = [], action = 'RESOLVE') => vm.runInNewContext(previewKey, { incidents, excludedIncidents, action });
  assert.equal(keyFor(keyItems), keyFor([...keyItems].reverse()), 'Reordering the same records does not invalidate review');
  for (const change of [{ id: 'c' }, { title: 'Başlık güncellendi' }, { status: 'ACKNOWLEDGED' }]) {
    assert.notEqual(keyFor(keyItems), keyFor([{ ...keyItems[0], ...change }, keyItems[1]]), 'Identity, title or status changes invalidate a same-count preview');
  }
  const excludedItems = [{ id: 'excluded', title: 'Kapatılmış olay', status: 'CLOSED' }];
  for (const change of [{ id: 'changed-excluded' }, { title: 'Hariç başlık değişti' }, { status: 'RESOLVED' }]) {
    assert.notEqual(keyFor(keyItems, excludedItems), keyFor(keyItems, [{ ...excludedItems[0], ...change }]), 'Changes in an excluded incident invalidate the review even when counts are unchanged');
  }
  const reasonSubmit = reasonComponent.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(reasonAst) === 'submit');
  const reasonReview = reasonComponent.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(reasonAst) === 'review');
  const reasonPrune = reasonComponent.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(reasonAst) === 'removeExcluded');
  const reasonUndo = reasonComponent.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(reasonAst) === 'undoPrune');
  const selectionEffect = reasonComponent.body.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(reasonAst) === 'useEffect').expression.arguments[0];
  const reasonCode = ts.transpileModule(`exports.review = ${reasonReview.initializer.getText(reasonAst)}; exports.run = ${reasonSubmit.initializer.getText(reasonAst)}; exports.prune = ${reasonPrune.initializer.getText(reasonAst)}; exports.undo = ${reasonUndo.initializer.getText(reasonAst)}; exports.selectionEffect = ${selectionEffect.getText(reasonAst)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  async function runReasonForm(action, result, initialReason = '  Kontrol tamamlandı.\nOrtak açıklama.  ', duplicate = false, options = {}) {
    let reason = initialReason, open = true, error, saving = false, calls = 0, submitted, prunes = 0, restores = 0, restoredIds;
    const incidents = [{ id: 'preview-1', title: 'Bellek yüksek', status: action === 'RESOLVE' ? 'OPEN' : 'RESOLVED' }, { id: 'preview-2', title: 'Bağlantı hatası', status: action === 'RESOLVE' ? 'ACKNOWLEDGED' : 'RESOLVED' }];
    const excludedIncidents = [{ id: 'excluded', title: 'Kapatılmış olay', status: 'CLOSED' }];
    const context = { ...i18n, exports: {}, action, reason, confirmation: null, incidents, excludedIncidents, incidentKey: keyFor(incidents, excludedIncidents, action), get confirmationCurrent() { return this.confirmation?.incidentKey === this.incidentKey; }, disabled: false, saving, count: 2, total: 3, INCIDENT_BULK_REASON_MAX_LENGTH: 4000, inFlight: { current: duplicate },
      selectionKey: JSON.stringify([...incidents, ...excludedIncidents].map(row => row.id).sort()), previousSelectionKey: { current: JSON.stringify([...incidents, ...excludedIncidents].map(row => row.id).sort()) }, pendingPrune: { current: null },
      undoSelection: null, get canUndoSelection() { return this.undoSelection?.prunedSelectionKey === this.selectionKey && this.undoSelection?.prunedIncidentKey === this.incidentKey; },
      setReason: value => { reason = value; }, setOpen: value => { open = value; }, setError: value => { error = value; }, setSaving: value => { saving = value; },
      setConfirmation: value => { context.confirmation = typeof value === 'function' ? value(context.confirmation) : value; },
      setUndoSelection: value => { context.undoSelection = value; },
      onKeepEligible: () => { prunes++; context.selectionKey = JSON.stringify(incidents.map(row => row.id).sort()); context.excludedIncidents = []; context.total = incidents.length; context.incidentKey = keyFor(incidents, [], action); },
      onRestoreSelection: ids => {
        restores++;
        if (options.restoreRejected) return null;
        restoredIds = options.restoreMissing ? incidents.map(row => row.id) : ids;
        context.selectionKey = JSON.stringify([...restoredIds].sort()); context.excludedIncidents = options.restoreMissing ? [] : excludedIncidents;
        context.total = incidents.length + context.excludedIncidents.length; context.incidentKey = keyFor(incidents, context.excludedIncidents, action);
        return restoredIds;
      },
      onApply: async (action, reason) => { calls++; submitted = { action, reason }; if (result instanceof Error) throw result; return result; } };
    vm.createContext(context); vm.runInContext(reasonCode, context);
    if (!options.skipReview) context.exports.review();
    assert.equal(calls, 0, 'Reviewing an explanation must never apply the operation');
    const preview = context.confirmation;
    Object.assign(context, options.afterReview);
    if (options.prune) { context.exports.prune(); if (prunes) { Object.assign(context, options.afterPrune); context.exports.selectionEffect(); } }
    if (options.undo) {
      Object.assign(context, options.beforeUndo);
      if (options.editedReason) { reason = context.reason = options.editedReason; context.confirmation = { ...context.confirmation, reason: reason.trim() }; }
      context.exports.undo();
      if (options.repeatUndo) context.exports.undo();
      if (restores && context.pendingPrune.current) { Object.assign(context, options.afterUndo); context.exports.selectionEffect(); }
    }
    if (options.selectionEffect) context.exports.selectionEffect();
    if (!options.pruneOnly) await context.exports.run();
    return { reason, open, error, saving, calls, submitted, preview, confirmation: context.confirmation, prunes, restores, restoredIds, undoSelection: context.undoSelection, pendingSelection: context.pendingPrune.current, selectionKey: context.selectionKey, inFlight: context.inFlight.current };
  }
  for (const action of ['RESOLVE', 'CLOSE']) {
    const success = await runReasonForm(action, { success: true });
    assert.equal(success.reason, ''); assert.equal(success.open, false); assert.equal(success.submitted.action, action); assert.equal(success.submitted.reason, 'Kontrol tamamlandı.\nOrtak açıklama.');
    assert.equal(success.preview.count, 2); assert.equal(success.preview.total, 3); assert.equal(success.preview.reason, success.submitted.reason); assert.equal(success.confirmation, null);
    assert.deepEqual([...success.preview.incidents].map(row => row.id), ['preview-1', 'preview-2']);
    assert.equal(success.preview.incidents[0].status, action === 'RESOLVE' ? 'OPEN' : 'RESOLVED');
    assert.equal(success.preview.excludedIncidents.length, 1); assert.equal(success.preview.excludedIncidents[0].title, 'Kapatılmış olay');
    const failure = await runReasonForm(action, { success: false, error: 'Kayıt başarısız' });
    assert.equal(failure.reason, '  Kontrol tamamlandı.\nOrtak açıklama.  '); assert.equal(failure.open, true); assert.equal(failure.error, 'Kayıt başarısız'); assert.equal(failure.inFlight, false);
    assert.equal(failure.confirmation.reason, failure.preview.reason, 'Failure retains the reviewed explanation for retry');
    assert.equal((await runReasonForm(action, { success: true }, 'Açıklama', false, { skipReview: true })).calls, 0, 'Submitting without the confirmation step cannot apply');
    for (const afterReview of [{ count: 1 }, { total: 4 }, { reason: 'Değişen açıklama' }, { confirmation: null }, { disabled: true }, { incidentKey: 'same-count-but-different-incident' }, { incidentKey: 'same-count-but-status-changed' }]) {
      assert.equal((await runReasonForm(action, { success: true }, 'Açıklama', false, { afterReview })).calls, 0, 'Changed scope, draft or cancelled review requires a fresh confirmation');
    }
    const pruned = await runReasonForm(action, { success: true }, '  Açıklama\nİkinci satır  ', false, { prune: true, pruneOnly: true });
    assert.equal(pruned.prunes, 1); assert.equal(pruned.calls, 0); assert.equal(pruned.open, true); assert.equal(pruned.reason, '  Açıklama\nİkinci satır  ');
    assert.equal(pruned.confirmation.total, 2); assert.equal(pruned.confirmation.excludedIncidents.length, 0); assert.equal(pruned.confirmation.reason, 'Açıklama\nİkinci satır');
    assert.equal(pruned.selectionKey, JSON.stringify(['preview-1', 'preview-2'])); assert.equal(pruned.preview.excludedIncidents.length, 1, 'Original reviewed snapshot remains immutable');
    assert(pruned.undoSelection, 'Pruning offers undo until the selection changes or the operation succeeds');
    const undone = await runReasonForm(action, { success: true }, '  Açıklama\nİkinci satır  ', false, { prune: true, undo: true, repeatUndo: true, pruneOnly: true });
    assert.equal(undone.calls, 0); assert.equal(undone.restores, 1); assert.deepEqual([...undone.restoredIds].sort(), ['excluded', 'preview-1', 'preview-2']);
    assert.equal(undone.open, true); assert.equal(undone.reason, '  Açıklama\nİkinci satır  '); assert.equal(undone.confirmation.reason, 'Açıklama\nİkinci satır');
    assert.equal(undone.confirmation.total, 3); assert.equal(undone.confirmation.count, 2); assert.equal(undone.confirmation.excludedIncidents.length, 1); assert.equal(undone.undoSelection, null);
    const editedUndo = await runReasonForm(action, { success: true }, 'İlk açıklama', false, { prune: true, undo: true, pruneOnly: true, editedReason: '  Düzenlenmiş açıklama\nYeni satır  ' });
    assert.equal(editedUndo.reason, '  Düzenlenmiş açıklama\nYeni satır  '); assert.equal(editedUndo.confirmation.reason, 'Düzenlenmiş açıklama\nYeni satır');
    for (const beforeUndo of [{ disabled: true }, { saving: true }, { confirmation: null }, { undoSelection: null }, { incidentKey: 'changed' }, { selectionKey: 'manual-selection' }, { inFlight: { current: true } }]) {
      assert.equal((await runReasonForm(action, { success: true }, 'Açıklama', false, { prune: true, undo: true, pruneOnly: true, beforeUndo })).restores, 0);
    }
    const undoRace = await runReasonForm(action, { success: true }, 'Açıklama korunsun', false, { prune: true, undo: true, afterUndo: { incidentKey: 'status-changed-during-undo' } });
    assert.equal(undoRace.calls, 0); assert.equal(undoRace.reason, 'Açıklama korunsun'); assert.equal(undoRace.open, true); assert.equal(undoRace.confirmation, null); assert.match(undoRace.error, /yeniden onaylayın/);
    const undoThenSave = await runReasonForm(action, { success: true }, 'Açıklama', false, { prune: true, undo: true });
    assert.equal(undoThenSave.calls, 1); assert.equal(undoThenSave.undoSelection, null); assert.equal(undoThenSave.submitted.reason, 'Açıklama');
    const missingUndo = await runReasonForm(action, { success: true }, 'Açıklama kaybolmasın', false, { prune: true, undo: true, restoreMissing: true });
    assert.equal(missingUndo.calls, 0); assert.equal(missingUndo.reason, 'Açıklama kaybolmasın'); assert.equal(missingUndo.confirmation, null); assert.match(missingUndo.error, /artık bu listede bulunmuyor/);
    assert.equal(missingUndo.pendingSelection, null, 'A restore with no available additions must not leave selection controls pending');
    const rejectedUndo = await runReasonForm(action, { success: true }, 'Açıklama', false, { prune: true, undo: true, pruneOnly: true, restoreRejected: true });
    assert(rejectedUndo.undoSelection, 'An unsuccessful local restore keeps undo available for retry'); assert.equal(rejectedUndo.reason, 'Açıklama');
    assert.equal(rejectedUndo.pendingSelection, null);
    const saveFailedAfterPrune = await runReasonForm(action, { success: false, error: 'Kayıt başarısız' }, 'Açıklama', false, { prune: true });
    assert(saveFailedAfterPrune.undoSelection, 'A failed lifecycle operation keeps undo available'); assert.equal(saveFailedAfterPrune.reason, 'Açıklama');
    const confirmedAfterPrune = await runReasonForm(action, { success: true }, 'Açıklama', false, { prune: true });
    assert.equal(confirmedAfterPrune.calls, 1); assert.equal(confirmedAfterPrune.submitted.reason, 'Açıklama');
    for (const afterReview of [{ disabled: true }, { saving: true }, { confirmation: null }, { incidentKey: 'stale' }, { count: 0 }, { excludedIncidents: [] }]) {
      assert.equal((await runReasonForm(action, { success: true }, 'Açıklama', false, { prune: true, pruneOnly: true, afterReview })).prunes, 0);
    }
    const raced = await runReasonForm(action, { success: true }, 'Açıklama', false, { prune: true, afterPrune: { incidentKey: 'status-changed-concurrently' } });
    assert.equal(raced.calls, 0); assert.equal(raced.confirmation, null); assert.equal(raced.open, false);
    assert.equal(raced.undoSelection, null);
    const manualSelection = await runReasonForm(action, { success: true }, 'Eski seçim açıklaması', false, { selectionEffect: true, afterReview: { selectionKey: 'another-selection' } });
    assert.equal(manualSelection.reason, ''); assert.equal(manualSelection.open, false); assert.equal(manualSelection.calls, 0);
  }
  for (const action of ['RESOLVE', 'CLOSE']) for (const reason of ['', ' \t\n ']) assert.equal((await runReasonForm(action, { success: true }, reason)).calls, 0);
  assert.equal((await runReasonForm('CLOSE', new Error('Offline'))).open, true);
  assert.equal((await runReasonForm('CLOSE', { success: true }, 'x'.repeat(4001))).calls, 0);
  assert.equal((await runReasonForm('RESOLVE', { success: true }, 'Açıklama', true)).calls, 0);
  // Render the real confirmation branch with isolated hook state, without opening a portal or sending a request.
  function renderReasonReview(action, excludedStatuses = action === 'RESOLVE' ? ['RESOLVED', 'CLOSED'] : ['OPEN', 'ACKNOWLEDGED', 'CLOSED'], pruned = false) {
    const incidents = [{ id: 'preview-1', title: 'Bellek yüksek', status: action === 'RESOLVE' ? 'OPEN' : 'RESOLVED' }, { id: 'preview-2', title: 'Bağlantı <script>kesildi</script>', status: action === 'RESOLVE' ? 'ACKNOWLEDGED' : 'RESOLVED' }];
    const originalExcluded = excludedStatuses.map(status => ({ id: `excluded-${status}`, title: `Hariç ${status} <b>olay</b>`, status }));
    const excludedIncidents = pruned ? [] : originalExcluded;
    const total = incidents.length + excludedIncidents.length;
    let confirmation = { count: 2, total, reason: 'Kontrol tamamlandı.\n<script>metin olarak kalmalı</script>', incidents, excludedIncidents, incidentKey: keyFor(incidents, excludedIncidents, action) }, slot = 0;
    const selectionKey = JSON.stringify([...incidents, ...excludedIncidents].map(row => row.id).sort());
    let undoSelection = pruned ? { selectionKey: JSON.stringify([...incidents, ...originalExcluded].map(row => row.id).sort()), confirmation: { ...confirmation, total: incidents.length + originalExcluded.length, excludedIncidents: originalExcluded, incidentKey: keyFor(incidents, originalExcluded, action) }, prunedSelectionKey: selectionKey, prunedIncidentKey: confirmation.incidentKey } : null;
    const draft = `  ${confirmation.reason}  `;
    const values = [true, draft, null, false, confirmation, undoSelection];
    let keptEligible = false, restoredIds;
    const module = { exports: {} };
    const code = ts.transpileModule(reasonSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const localRequire = name => {
      if (name === 'react') return { ...React, useState: () => { const index = slot++; return [values[index], value => { if (index === 4) confirmation = value; if (index === 5) undoSelection = value; }]; }, useEffect() {}, useRef: initial => ({ current: initial }), useId: () => 'reason-fixture' };
      if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (!name.startsWith('@/') && !name.startsWith('.')) return require(name);
      const candidate = name.startsWith('@/') ? name.slice(2) : path.relative(root, path.resolve(root, 'components/dashboard', name));
      return load(fs.existsSync(path.join(root, candidate + '.tsx')) ? candidate + '.tsx' : candidate + '.ts');
    };
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(localRequire, module, module.exports);
    const tree = module.exports.IncidentBulkLifecycle({ action, incidents, excludedIncidents, selectionKey, disabled: false, onKeepEligible: () => { keptEligible = true; }, onRestoreSelection: ids => { restoredIds = ids; return ids; }, onApply: async () => { throw new Error('Selection changes must never apply'); } });
    const { PopoverContent } = load('components/ui/popover.tsx');
    const content = elements(tree).find(node => node.type === PopoverContent);
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, content.props.children));
    const pruneButton = elements(content).find(node => node.props?.children === 'İşlem dışında kalanları seçimden çıkar');
    if (excludedIncidents.length) { assert(pruneButton); assert.equal(pruneButton.props.disabled, false); pruneButton.props.onClick(); assert.equal(keptEligible, true); }
    else { assert.equal(pruneButton, undefined); assert.equal(keptEligible, false); }
    const undoButton = elements(content).find(node => node.props?.children === 'Geri al');
    if (pruned) {
      assert(undoButton); assert.equal(undoButton.props.disabled, false); undoButton.props.onClick();
      assert.deepEqual([...restoredIds].sort(), [...incidents, ...originalExcluded].map(row => row.id).sort());
      assert.equal(undoSelection, null, 'Rendered undo consumes its snapshot');
    } else assert.equal(undoButton, undefined);
    const back = elements(content).find(node => node.props?.children === 'Geri dön');
    back.props.onClick();
    assert.equal(confirmation, null, 'Going back discards the review without applying');
    assert.equal(values[1], draft, 'Going back preserves the explanation draft');
    return html;
  }
  for (const action of ['RESOLVE', 'CLOSE']) {
    const reviewHtml = renderReasonReview(action);
    const excludedStatuses = action === 'RESOLVE' ? ['RESOLVED', 'CLOSED'] : ['OPEN', 'ACKNOWLEDGED', 'CLOSED'];
    assert(reviewHtml.includes(`Seçili olay</dt><dd>${2 + excludedStatuses.length}</dd>`));
    assert(reviewHtml.includes(`${action === 'RESOLVE' ? 'Çözüldü işaretlenecek' : 'Kapatılacak'}</dt><dd>2</dd>`));
    assert(reviewHtml.includes(`Durumu uygun olmayan ${excludedStatuses.length} seçili olay`));
    assert(reviewHtml.includes('Kontrol tamamlandı.\n&lt;script&gt;metin olarak kalmalı&lt;/script&gt;'));
    assert(reviewHtml.includes('İşlem uygulanacak olaylar')); assert(reviewHtml.includes('Bellek yüksek')); assert(reviewHtml.includes('Bağlantı &lt;script&gt;kesildi&lt;/script&gt;'));
    assert(reviewHtml.includes('INC-REVIEW-1')); assert(reviewHtml.includes('Mevcut durum: '));
    if (action === 'RESOLVE') { assert(reviewHtml.includes('Açık')); assert(reviewHtml.includes('Onaylandı')); }
    else { assert(reviewHtml.includes('Çözüldü')); assert(reviewHtml.includes('Onaylandı')); }
    assert.equal((reviewHtml.match(/<li>/g) || []).length, 2 + excludedStatuses.length, 'Every selected incident appears in exactly one preview group');
    assert(reviewHtml.includes(`İşlem dışında kalacak olaylar (${excludedStatuses.length})`));
    for (const status of excludedStatuses) {
      assert(reviewHtml.includes(`Hariç ${status} &lt;b&gt;olay&lt;/b&gt;`));
      assert(reviewHtml.includes(lifecycleHelper.incidentBulkLifecycleExclusionReason(status, action)));
    }
    assert.equal((reviewHtml.match(/İşleme alınmama nedeni:/g) || []).length, excludedStatuses.length);
    assert(reviewHtml.includes(action === 'RESOLVE' ? 'Onayla ve çöz' : 'Onayla ve kapat'));
    assert(!reviewHtml.includes('<textarea')); assert(!reviewHtml.includes('<script>'));
    const allEligibleHtml = renderReasonReview(action, []);
    assert(!allEligibleHtml.includes('Durumu uygun olmayan')); assert(!allEligibleHtml.includes('İşlem dışında kalacak'));
    const prunedHtml = renderReasonReview(action, excludedStatuses, true);
    assert(prunedHtml.includes(`${excludedStatuses.length} olay seçimden çıkarıldı.`)); assert(prunedHtml.includes('Geri al'));
    assert(prunedHtml.includes('Seçili olay</dt><dd>2</dd>')); assert(!prunedHtml.includes('İşlem dışında kalacak'));
  }
  const bulkSource = fs.readFileSync(path.join(root, 'components/dashboard/IncidentBulkAssignment.tsx'), 'utf8');
  const bulkAst = ts.createSourceFile('bulk.tsx', bulkSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bulkComponent = bulkAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'IncidentBulkAssignment');
  const submitDeclaration = bulkComponent.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(bulkAst) === 'submit');
  const submitCode = ts.transpileModule(`exports.run = ${submitDeclaration.initializer.getText(bulkAst)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  async function runAssignmentForm(result, duplicate = false) {
    let open = true, error, saving = false, calls = 0;
    const context = { ...i18n, exports: {}, assigneeId: 'operator', disabled: false, loading: false, canManage: true, inFlight: { current: duplicate },
      setSaving: value => { saving = value; }, setError: value => { error = value; }, setOpen: value => { open = value; },
      onAssign: async assigneeId => { calls++; assert.equal(assigneeId, 'operator'); if (result instanceof Error) throw result; return result; } };
    vm.createContext(context); vm.runInContext(submitCode, context); await context.exports.run();
    return { open, error, saving, calls, assigneeId: context.assigneeId, inFlight: context.inFlight.current };
  }
  const formFailure = await runAssignmentForm({ success: false, error: 'Kullanıcı artık aktif değil' });
  assert.equal(formFailure.open, true); assert.equal(formFailure.assigneeId, 'operator'); assert.equal(formFailure.error, 'Kullanıcı artık aktif değil'); assert.equal(formFailure.saving, false);
  assert.equal((await runAssignmentForm({ success: true })).open, false);
  assert.equal((await runAssignmentForm(new Error('Offline'))).open, true);
  assert.equal((await runAssignmentForm({ success: true }, true)).calls, 0);
  const statement = page.body.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === 'transitionIncident'));
  assert(statement, 'Actual incident action must exist');
  const actionCode = ts.transpileModule(statement.getText(ast) + '\nexports.run = transitionIncident;', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  async function runAction(response, initialBusy = false, action = 'ACKNOWLEDGE', payload) {
    let selected = structuredClone(event), notice, revision = 0, fetches = 0, refreshes = 0, request;
    const context = {
      ...i18n,
      exports: {}, acknowledgingIds: new Set(initialBusy ? [fixture.id] : []),
      fetch: async (_url, init) => { request = JSON.parse(init.body); fetches++; if (response instanceof Error) throw response; return { ok: response.ok, status: response.status, json: async () => { if (response.nonJson) throw new Error('No JSON body for this authorization response'); return response.body; } }; },
      setMessage: value => { notice = value; },
      setAcknowledgingIds: setter => { context.acknowledgingIds = setter(context.acknowledgingIds); },
      setSelectedEvent: setter => { selected = setter(selected); },
      setIncidentDetailRevision: setter => { revision = setter(revision); },
      fetchEvents: async () => { refreshes++; },
      setDetailOpen: () => { throw new Error('Successful actions must keep detail open'); },
      console: { error() {} }, Set, setTimeout,
    };
    vm.createContext(context); vm.runInContext(actionCode, context);
    const result = await context.exports.run(event, action, payload);
    return { result, selected, notice, revision, fetches, refreshes, request, busy: context.acknowledgingIds };
  }
  const success = await runAction({ ok: true, body: { success: true, data: [{ id: fixture.id, status: 'ACKNOWLEDGED' }] } });
  assert.equal(success.result, true); assert.equal(success.selected.incident.status, 'ACKNOWLEDGED'); assert.equal(success.revision, 1); assert.equal(success.refreshes, 1); assert.equal(success.notice.incidentId, fixture.id); assert.equal(success.busy.size, 0);
  const withdrawn = await runAction({ ok: true, body: { success: true, data: [{ id: fixture.id, status: 'OPEN' }] } }, false, 'UNACKNOWLEDGE');
  assert.equal(withdrawn.result, true); assert.equal(withdrawn.request.action, 'UNACKNOWLEDGE'); assert.equal(withdrawn.selected.incident.status, 'OPEN');
  assert.equal(withdrawn.notice.text, 'Onay geri alındı'); assert.equal(withdrawn.revision, 1); assert.equal(withdrawn.refreshes, 1); assert.equal(withdrawn.busy.size, 0);
  const failure = await runAction({ ok: false, body: { success: false, error: 'Yetki yok' } });
  assert.equal(failure.result, false); assert.equal(failure.selected.incident.status, 'OPEN'); assert.equal(failure.revision, 0); assert.equal(failure.notice.type, 'error'); assert.equal(failure.busy.size, 0);
  assert.equal((await runAction(new Error('Offline'))).result, false);
  assert.equal((await runAction({ ok: true }, true)).fetches, 0, 'Duplicate in-flight actions are ignored');
  const assigned = await runAction({ ok: true, body: { success: true, data: [{ id: fixture.id, assignedToId: 'operator', assignedTo: 'Operatör' }] } }, false, 'ASSIGN', { assigneeId: 'operator' });
  assert.equal(assigned.request.assigneeId, 'operator'); assert.equal(assigned.selected.incident.assignedTo, 'Operatör');
  assert.equal(assigned.selected.incident.status, 'OPEN'); assert.equal(assigned.revision, 1);
  const noted = await runAction({ ok: true, body: { success: true, data: [fixture] } }, false, 'ADD_NOTE', { reason: 'Operasyon notu' });
  assert.equal(noted.request.reason, 'Operasyon notu'); assert.equal(noted.notice.text, 'Operasyon notu eklendi');
  assert.equal(noted.revision, 1); assert.equal(noted.selected.incident.status, 'OPEN');
  for (const status of [401, 403]) {
    const rejectedAssignment = await runAction({ ok: false, status, nonJson: true }, false, 'ASSIGN', { assigneeId: 'chosen-operator' });
    assert.equal(rejectedAssignment.result, false); assert.equal(rejectedAssignment.notice.authStatus, status); assert.equal(rejectedAssignment.notice.authAction, 'ASSIGN');
    assert.match(rejectedAssignment.notice.text, status === 401 ? /Oturumunuzun/ : /Sorumlu değiştirme yetkiniz yok/);
    assert.equal(rejectedAssignment.revision, 0); assert.equal(rejectedAssignment.refreshes, 0); assert.equal(rejectedAssignment.busy.size, 0);
    assert.deepEqual(rejectedAssignment.selected, event); assert.equal(rejectedAssignment.request.assigneeId, 'chosen-operator');
    const rejectedNote = await runAction({ ok: false, status, nonJson: true }, false, 'ADD_NOTE', { reason: 'Keep this draft', requestId: '00000000-0000-4000-8000-000000000001' });
    assert.equal(rejectedNote.result, false); assert.equal(rejectedNote.notice.authStatus, status);
    assert.match(rejectedNote.notice.text, status === 401 ? /Oturumunuzun/ : /notu ekleme yetkiniz yok/);
    assert.equal(rejectedNote.revision, 0); assert.equal(rejectedNote.refreshes, 0); assert.equal(rejectedNote.busy.size, 0);
    assert.deepEqual(rejectedNote.selected, event); assert.equal(rejectedNote.request.reason, 'Keep this draft');
  }
  const { incidentExclusionTarget } = load('lib/alarms/incident-exclusion.ts');
  for (const [code, sourceIp, destIp, deviceName, field, value] of [
    ['GENERIC', '198.51.100.42', null, 'CORE-SW', 'sourceIp', '198.51.100.42'],
    ['DNS_TEST', '198.51.100.42', '198.51.100.53', 'CORE-SW', 'destIp', '198.51.100.53'],
    ['SSLVPN_AUTH_FAILED', null, null, 'operator', 'user', 'operator'],
    ['NMS_TEST', null, null, 'CORE-SW', 'deviceName', 'CORE-SW'],
    ['VM_TEST', null, null, 'VM-1', 'deviceName', 'VM-1'],
  ]) assert.deepEqual(incidentExclusionTarget({ alarm: { code }, sourceIp, destIp, deviceName }), { field, value });
  const exclusionCode = ts.transpileModule(`exports.run = ${declaration('addToWhitelist').initializer.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  async function runExclusion(response, { duplicate = false, initialBusy = false, missingTarget = false, reason = '  Planned check\nSecond line  ' } = {}) {
    let notice, request, calls = 0, refreshes = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    const context = { ...i18n, exports: {}, selectedEvent: missingTarget ? { ...event, alarm: { ...event.alarm, code: 'GENERIC' }, sourceIp: null } : event,
      discardReason: reason, discardOpen: true, discardLoading: false, exclusionInFlight: { current: initialBusy }, incidentExclusionTarget,
      setDiscardLoading: value => { context.discardLoading = value; }, setDiscardOpen: value => { context.discardOpen = value; },
      setDiscardReason: value => { context.discardReason = value; }, setMessage: value => { notice = value; },
      setDiscardAccessError: value => { context.discardAccessError = value; },
      fetchEvents: () => { refreshes++; }, console: { error() {} },
      fetch: async (_url, init) => { calls++; request = JSON.parse(init.body); if (duplicate) await gate;
        if (response instanceof Error) throw response; return { ok: response.ok, status: response.status, json: async () => { if (response.nonJson) throw new Error('Authorization responses need no JSON'); return response.body; } }; },
    };
    vm.createContext(context); vm.runInContext(exclusionCode, context);
    const pending = context.exports.run();
    if (duplicate) {
      try {
        await context.exports.run(); assert.equal(calls, 1, 'A synchronous exclusion guard rejects a duplicate before React rerenders');
        assert.equal(context.discardReason, reason); assert.equal(context.discardOpen, true);
      } finally { release(); }
    }
    await pending;
    return { reason: context.discardReason, open: context.discardOpen, loading: context.discardLoading, busy: context.exclusionInFlight.current, accessError: context.discardAccessError, notice, request, calls, refreshes };
  }
  const excluded = await runExclusion({ ok: true, body: { success: true } }, { duplicate: true });
  assert.equal(excluded.calls, 1); assert.equal(excluded.reason, ''); assert.equal(excluded.open, false); assert.equal(excluded.busy, false); assert.equal(excluded.refreshes, 1);
  assert.deepEqual(excluded.request, { alarmCode: event.alarm.code, field: 'deviceName', value: event.deviceName, reason: 'Planned check\nSecond line' });
  for (const response of [{ ok: false, body: { error: 'Temporary error' } }, new Error('Offline')]) {
    const rejected = await runExclusion(response);
    assert.equal(rejected.reason, '  Planned check\nSecond line  '); assert.equal(rejected.open, true); assert.equal(rejected.loading, false); assert.equal(rejected.busy, false); assert.equal(rejected.refreshes, 0); assert.equal(rejected.notice.type, 'error');
  }
  for (const status of [401, 403]) {
    const denied = await runExclusion({ ok: false, status, nonJson: true }, { duplicate: true });
    assert.equal(denied.accessError, status); assert.equal(denied.calls, 1); assert.equal(denied.open, true);
    assert.equal(denied.reason, '  Planned check\nSecond line  '); assert.equal(denied.busy, false); assert.equal(denied.loading, false); assert.equal(denied.refreshes, 0);
    assert.match(denied.notice.text, status === 401 ? /Oturumunuzun/ : /yetkiniz yok/);
  }
  for (const options of [{ reason: ' \n ' }, { initialBusy: true }, { missingTarget: true }]) assert.equal((await runExclusion({ ok: true }, options)).calls, 0);
  // Execute the actual composer save closure: failed saves retain drafts, successful
  // notes clear them, assignments preserve them, and in-flight duplicates are ignored.
  const workspaceSource = fs.readFileSync(path.join(root, 'components/dashboard/IncidentDetailWorkspace.tsx'), 'utf8');
  const workspaceAst = ts.createSourceFile('workspace.tsx', workspaceSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const workspace = workspaceAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'IncidentDetailWorkspace');
  const saveStatement = workspace.body.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(workspaceAst) === 'saveCollaboration'));
  const saveCode = ts.transpileModule(saveStatement.getText(workspaceAst) + '\nexports.run = saveCollaboration;', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  async function saveDraft(success, kind = 'note', initiallySaving = false) {
    let calls = 0, draft = '  İnceleme notu\nİkinci satır  ', saving = null, submitted;
    const context = { ...i18n, exports: {}, note: draft, assigneeId: 'operator', incidentId: fixture.id, event: { id: fixture.id }, noteAttempt: { current: null }, crypto: require('node:crypto'), savingRef: { current: initiallySaving },
      setSaving: value => { saving = value; }, setNote: value => { draft = value; },
      onAction: async (action, payload) => { calls++; submitted = { action, payload }; if (success instanceof Error) throw success; return success; } };
    vm.createContext(context); vm.runInContext(saveCode, context);
    try { await context.exports.run(kind); } catch { assert(success instanceof Error); }
    return { calls, draft, saving, submitted, ref: context.savingRef.current };
  }
  assert.equal((await saveDraft(false)).draft, '  İnceleme notu\nİkinci satır  ');
  const savedDraft = await saveDraft(true); assert.equal(savedDraft.draft, ''); assert.equal(savedDraft.submitted.payload.reason, 'İnceleme notu\nİkinci satır'); assert.equal(savedDraft.ref, false);
  assert.match(savedDraft.submitted.payload.requestId, /^[0-9a-f-]{36}$/);
  assert.equal((await saveDraft(true, 'assignment')).submitted.payload.assigneeId, 'operator');
  assert.equal((await saveDraft(true, 'assignment')).draft, '  İnceleme notu\nİkinci satır  ');
  assert.equal((await saveDraft(true, 'note', true)).calls, 0);
  const failedDraft = await saveDraft(new Error('Offline')); assert.equal(failedDraft.ref, false); assert.equal(failedDraft.saving, null); assert(failedDraft.draft);
  console.log('Incident detail passed: combined chronological history, Turkish labels, timezone, lifecycle action availability, rendered loading/error/legacy states and actual action success/failure/duplicate handling. No live incident changed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
