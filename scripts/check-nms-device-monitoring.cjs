/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { NOW, device, rows } = require('./fixtures/nms-device-monitoring.cjs');
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const module = { exports: {} }; cache.set(relative, module);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const local = name => {
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name === 'next/link') return { __esModule: true, default: ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const target = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(['.ts', '.tsx'].map(ext => target + ext).find(file => fs.existsSync(path.join(root, file))));
    }
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(local, module, module.exports); return module.exports;
}
const view = load('lib/nms/device-monitoring-view.ts'), signals = load('components/nms/MonitoringSignals.tsx');
const fixture = rows(), original = JSON.stringify(fixture);
assert.deepEqual(fixture.map(row => view.getStatus(row, NOW)), ['online', 'offline', 'disabled', 'unknown', 'unknown', 'online']);
assert.equal(view.getStatus(device('edge', { lastPolledAt: new Date(NOW - 750000).toISOString() }), NOW), 'offline');
assert.equal(view.getStatus(device('edge', { lastPolledAt: new Date(NOW - 749999).toISOString() }), NOW), 'online');
assert.equal(view.getStatus(device('bad', { lastPolledAt: 'not-a-date' }), NOW), 'unknown');
assert.equal(view.getStatus(device('future', { lastPolledAt: new Date(NOW + 1).toISOString() }), NOW), 'unknown');
for (const interval of [null, 0, -5, Infinity, NaN, 90000]) assert.equal(view.pollingSeconds(interval), 300);
assert.equal(view.pollingSeconds(10), 10); assert.equal(view.pollingSeconds(86400), 86400);
assert.equal(view.measuredPercent(0), 0); assert.equal(view.measuredPercent(100), 100);
for (const value of [null, NaN, Infinity, -1, 101]) assert.equal(view.measuredPercent(value), null);
assert.equal(view.formatRelative(null, NOW), 'Henüz veri yok'); assert.match(view.formatRelative('bad', NOW), /Tarih okunamadı/); assert.match(view.formatRelative(new Date(NOW + 1).toISOString(), NOW), /Gelecek tarih/);
assert.match(view.absoluteTime('2026-10-16T13:00:00Z'), /16:00/);
const render = (component, row, props = {}) => renderToStaticMarkup(React.createElement(signals[component], { device: row, now: NOW, ...props }));
assert.match(render('Reachability', fixture[0]), /Yanıt kaydı güncel/);
assert.match(render('Reachability', fixture[1]), /Yanıt gecikiyor/); assert.match(render('Reachability', fixture[1]), /Kesinti doğrulanmadı/);
assert.match(render('Reachability', fixture[2]), /Doğrulanmıyor/); assert.doesNotMatch(render('Reachability', fixture[2]), /Yanıt kaydı güncel/);
assert.match(render('Reachability', fixture[4]), /Bilinmiyor/);
assert.match(render('MonitoringState', fixture[2]), /İzleme kapalı/);
assert.match(render('LastPoll', fixture[0]), /TSİ/); assert.match(render('LastPoll', fixture[4]), /Gelecek tarih/);
assert.match(render('Resources', fixture[0]), /%0/); assert.match(render('Resources', fixture[5]), /Ölçüm eski/); assert.doesNotMatch(render('Resources', fixture[5]), /Ölçüm güncel/);
assert.match(render('Resources', fixture[4]), /Ölçüm tarihi belirsiz/); assert.doesNotMatch(render('Resources', fixture[4]), /%125/);
const compact = { showFreshness: false, showTimestamp: false };
assert.match(render('Resources', fixture[5], compact), /Ölçüm eski/, 'Compact values must still identify historical measurements');
assert.match(render('Resources', fixture[4], compact), /Ölçüm tarihi belirsiz/, 'Compact values must identify invalid or future measurement times');
for (const collectedAt of ['not-a-time', null, undefined]) {
  assert.match(render('Resources', { ...fixture[0], latestHealth: { ...fixture[0].latestHealth, collectedAt } }, compact), /Ölçüm tarihi belirsiz/);
}
assert.match(render('Resources', { ...fixture[0], pollingEnabled: false }, compact), /İzleme kapalı · son ölçüm/);
assert.match(render('Resources', fixture[0], compact), /%0/);
assert.doesNotMatch(render('Resources', fixture[0], compact), /Ölçüm güncel|<time/, 'Current compact measurements remain concise');
assert.match(render('PortIssues', fixture[0]), /Kapalı port kaydı yok/); assert.doesNotMatch(render('PortIssues', fixture[0]), /Uyarı yok/);
assert.match(render('PortIssues', fixture[1]), /2 kapalı port/);
assert.equal(JSON.stringify(fixture), original);
console.log('NMS monitoring view passed: fresh/delayed boundary, disabled monitoring, future/malformed times, independent resource freshness, zero/missing/invalid percentages and honest port records. Synthetic data only.');
