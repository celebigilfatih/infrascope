// Exercise the actual TSX form's state/event handlers with synthetic hooks/fetch; no DOM, browser or installation calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/integrations/fortianalyzer/page.tsx'), 'utf8');
function fixture(mode) {
  const values = [], effects = [], calls = []; let cursor = 0, mounted = false;
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], v => { values[i] = v; }]; },
    useEffect: fn => { if (!mounted) effects.push(fn); } };
  const module = { exports: {} }, components = new Proxy({}, { get: (_target, name) => name });
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const fetch = async (_url, options) => {
    if (options) { calls.push(JSON.parse(options.body)); return { json: async () => ({ success: true, connected: true }) }; }
    return { json: async () => ({ config: { host: 'fa.fixture.invalid', username: mode === 'session' ? 'reader' : '', adom: 'Tenant_A', authMode: mode, passwordSet: true, apiKeySet: true } }) };
  };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { console, fetch })(name => name === 'react' ? react : name === '@/lib/i18n/tr' ? { uiError: e => e || '' } : components, module, module.exports);
  function render() { cursor = 0; const tree = module.exports.default(); mounted = true; return tree; }
  function all(node, predicate, result = []) { if (!node || typeof node !== 'object') return result;
    if (predicate(node)) result.push(node); for (const child of (node.props?.children || []).flat(Infinity)) all(child, predicate, result); return result; }
  const field = id => all(render(), n => n.props?.id === id)[0];
  const button = text => all(render(), n => n.type === 'Button' && n.props.children.flat(Infinity).includes(text))[0];
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  render(); effects.forEach(fn => fn());
  return { values, calls, field, button, render, all, flush };
}
async function main() {
  let count = 0;
  for (const mode of ['session', 'api-key']) {
    const f = fixture(mode); await f.flush();
    assert.equal(f.field('fa-adom').props.value, 'Tenant_A'); assert.equal(f.field('fa-auth-mode').props.value, mode);
    assert.equal(Boolean(f.field('fa-password')), mode === 'session'); assert.equal(Boolean(f.field('fa-api-key')), mode === 'api-key');
    const id = mode === 'session' ? 'fa-password' : 'fa-api-key'; f.field(id).props.onChange({ target: { value: 'fixture-entered' } });
    const testing = f.button('Bağlantıyı Test Et').props.onClick(); assert.equal(f.field('fa-adom').props.disabled, true); await testing;
    assert.equal(f.all(f.render(), n => n.type === 'Badge').length, 1);
    f.field('fa-adom').props.onChange({ target: { value: 'Tenant_B' } });
    assert.equal(f.all(f.render(), n => n.type === 'Badge').length, 0);
    await f.button('Kaydet ve Uygula').props.onClick();
    assert.equal(f.calls.length, 2); assert.equal(f.calls[0].config.adom, 'Tenant_A'); assert.equal(f.calls[1].config.adom, 'Tenant_B');
    for (const call of f.calls) { assert.equal(call.config.authMode, mode);
      assert.equal(call.config[mode === 'session' ? 'password' : 'apiKey'], 'fixture-entered');
      assert.equal(call.config[mode === 'session' ? 'apiKey' : 'password'], undefined);
      if (mode === 'api-key') assert.equal(call.config.username, undefined); }
    assert.equal(f.field(id).props.value, ''); count++; console.log(`PASS form: ${mode} load, probe/save payload, target edits, pending controls and secret clearing`);
  }
  console.log(`FortiAnalyzer profile form regressions passed (${count} scenarios; actual component handlers, synthetic hooks/fetch; no visual assertion).`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
