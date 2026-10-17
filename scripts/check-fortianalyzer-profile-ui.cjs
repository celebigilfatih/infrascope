/* eslint-disable @typescript-eslint/no-require-imports -- Actual TSX handlers with synchronous synthetic hooks and transport. */
// Actual component state and event handlers; no DOM, installation ENV or source calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
function fixture(mode) {
  const values = [], effects = [], calls = []; let cursor = 0, mounted = false, release, gate = false;
  let profile = { id: 'profile-a', name: 'Fixture profile', enabled: false, host: 'fa.fixture.invalid', adom: 'Tenant_A', authMode: mode, username: mode === 'session' ? 'reader' : '', passwordSet: mode === 'session', apiKeySet: mode === 'api-key', updatedAt: '2026-10-17T10:00:00.000Z', collector: null };
  const react = { useState: initial => { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; },
    useRef: initial => { const i = cursor++; return values[i] ??= { current: initial }; }, useCallback: fn => fn, useEffect: fn => { if (!mounted) effects.push(fn); } };
  const network = async (_url, options) => {
    if (options.method === 'GET') return Response.json({ success: true, profiles: [profile] });
    const body = JSON.parse(options.body); calls.push(body);
    if (gate) await new Promise(resolve => { release = resolve; });
    if (body.action === 'save') { profile = { ...profile, adom: body.draft.adom, updatedAt: '2026-10-17T11:00:00.000Z' }; return Response.json({ success: true, configId: profile.id }); }
    return Response.json({ success: true, connected: true, host: body.draft?.host || profile.host, adom: body.draft?.adom || profile.adom, configId: profile.id, testedAt: '2026-10-17T10:30:00.000Z' });
  };
  const runtime = { console, fetch: network, AbortController, setTimeout, clearTimeout };
  const load = moduleLoader({}, runtime), ui = load('lib/integrations/fortianalyzer-workspace.ts'), policy = load('lib/auth/permission-policy.ts');
  const mod = { exports: {} }, tags = new Proxy({}, { get: (_target, name) => name });
  const compile = ts.transpileModule(fs.readFileSync('app/integrations/fortianalyzer/page.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext('(function(require,module,exports){' + compile + '\n})', runtime)(name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name === '@/lib/integrations/fortianalyzer-workspace' ? ui : name === '@/lib/auth/permission-policy' ? policy : name === '@/lib/users/workspace' ? { requestUsersJson: async () => ({ role: 'ADMIN' }), parseActor: v => v, userDate: v => v || 'Bilgi yok' } : tags, mod, mod.exports);
  function render() { cursor = 0; const tree = mod.exports.default(); mounted = true; return tree; }
  function all(node, predicate, result = []) { if (!node || typeof node !== 'object') return result; if (predicate(node)) result.push(node); for (const child of [node.props?.children].flat(Infinity)) all(child, predicate, result); return result; }
  const field = id => all(render(), n => n.props?.id === id)[0];
  const button = text => all(render(), n => n.type === 'Button' && [n.props.children].flat(Infinity).includes(text))[0];
  const flush = async () => { for (let i = 0; i < 150; i++) await Promise.resolve(); };
  render(); effects.forEach(fn => fn());
  return { calls, field, button, render, all, flush, hold: () => { gate = true; }, release: () => { gate = false; release(); } };
}
async function main() {
  for (const mode of ['session', 'api-key']) {
    const f = fixture(mode); await f.flush();
    assert.equal(f.field('analyzer-adom').props.value, 'Tenant_A'); assert.equal(f.field('analyzer-auth').props.value, mode);
    assert.equal(Boolean(f.field('analyzer-user')), mode === 'session'); assert.equal(f.field('analyzer-secret').props.value, ''); assert.equal(f.calls.length, 0);
    f.button('Kayıtlı bağlantıyı test et').props.onClick(); await f.flush(); assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])), { action: 'test-saved', configId: 'profile-a' });
    f.field('analyzer-secret').props.onChange({ target: { value: 'fixture-entered' } });
    f.hold(); f.button('Formdaki bilgilerle test et').props.onClick(); await f.flush();
    assert.equal(f.all(f.render(), n => n.type === 'fieldset')[0].props.disabled, true); f.release(); await f.flush();
    assert.ok(f.all(f.render(), n => n.type === 'p' && n.props.children === 'Sunucu ve ADOM erişimi test sırasında doğrulandı.').length);
    f.field('analyzer-adom').props.onChange({ target: { value: 'Tenant_B' } });
    assert.equal(f.all(f.render(), n => n.type === 'p' && n.props.children === 'Sunucu ve ADOM erişimi test sırasında doğrulandı.').length, 0);
    f.all(f.render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} }); await f.flush();
    assert.equal(f.calls.length, 3); assert.equal(f.calls[1].action, 'test-draft'); assert.equal(f.calls[1].draft.adom, 'Tenant_A'); assert.equal(f.calls[2].action, 'save'); assert.equal(f.calls[2].draft.adom, 'Tenant_B'); assert.equal(f.calls[2].expectedUpdatedAt, '2026-10-17T10:00:00.000Z');
    for (const call of f.calls.slice(1)) { assert.equal(call.draft.authMode, mode); assert.equal(call.draft[mode === 'session' ? 'password' : 'apiKey'], 'fixture-entered'); assert.equal(call.draft[mode === 'session' ? 'apiKey' : 'password'], ''); }
    assert.equal(f.field('analyzer-secret').props.value, '');
    console.log('PASS form: ' + mode + ' read-only mount, saved/draft credentials, pending controls, changed test retirement, versioned save and cleared secret');
  }
  console.log('FortiAnalyzer profile form regressions passed (2 scenarios; actual component handlers, synthetic hooks/fetch; no visual assertion).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
