/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS runner with isolated TSX module loading. */
// Actual page + shared UI components, synthetic HTTP and page hooks only.
// State is populated by effects/events, never by a hard-coded useState index.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function createVMwarePageFixture(transport) {
  const root = path.resolve(__dirname, '../..'), entry = path.join(root, 'app/integrations/vmware/page.tsx');
  const modules = new Map(), hooks = [], effects = [], requests = [];
  let cursor = 0, dirty = true, tree, html = '', pending = 0, closed = false;
  const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  function slot(kind, initialize) {
    const index = cursor++;
    if (!hooks[index]) hooks[index] = { kind, ...initialize() };
    assert.equal(hooks[index].kind, kind, 'Page hook order must remain valid');
    return hooks[index];
  }
  const pageReact = { ...React,
    useState(initial) {
      const state = slot('state', () => ({ value: typeof initial === 'function' ? initial() : initial }));
      state.setter ??= update => { const value = typeof update === 'function' ? update(state.value) : update; if (!Object.is(value, state.value)) { state.value = value; dirty = true; } };
      return [state.value, state.setter];
    },
    useRef(initial) { return slot('ref', () => ({ value: { current: initial } })).value; },
    useCallback(callback, deps) {
      const state = slot('callback', () => ({ value: callback, deps }));
      if (!sameDeps(state.deps, deps)) { state.value = callback; state.deps = deps; }
      return state.value;
    },
    useEffect(effect, deps) {
      const state = slot('effect', () => ({ initialized: false }));
      if (!state.initialized || !sameDeps(state.deps, deps)) { state.initialized = true; state.deps = deps; effects.push(() => { state.cleanup?.(); state.cleanup = effect(); }); }
    },
  };
  const packages = new Set(['react', 'react/jsx-runtime', 'lucide-react', 'clsx', 'tailwind-merge', '@radix-ui/react-slot', 'class-variance-authority']);
  const fixtureFetch = async (url, options = {}) => {
    assert.equal(closed, false, 'No request after fixture cleanup');
    requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    pending++;
    try { return await transport(url, options); } finally { pending--; }
  };
  function load(filename) {
    filename = path.resolve(filename);
    assert.ok(filename.startsWith(root + path.sep), 'Fixture imports stay inside the repository');
    if (modules.has(filename)) return modules.get(filename).exports;
    const loadedModule = { exports: {} }; modules.set(filename, loadedModule);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const localRequire = name => {
      if (name === 'react' && filename === entry) return pageReact;
      if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { ...props, href }, children) };
      if (packages.has(name)) return require(name);
      if (name.startsWith('@/') || name.startsWith('.')) {
        const target = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
        // CSS class names remain observable for semantic tone assertions; no visual claims.
        if (target.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_object, key) => `fixture-${String(key)}` }) };
        const source = [target, `${target}.ts`, `${target}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        assert.ok(source, `Fixture module exists: ${name}`);
        return load(source);
      }
      throw new Error(`Unapproved VMware page fixture dependency: ${name}`);
    };
    vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { console, URL, AbortController, setTimeout, clearTimeout, fetch: fixtureFetch }, { filename })(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  const Page = load(entry).default;
  function render() {
    dirty = false;
    html = renderToStaticMarkup(React.createElement(function FixturePage() { cursor = 0; tree = Page(); return tree; }));
    return html;
  }
  function all(node, predicate, found = []) {
    if (Array.isArray(node)) { node.forEach(child => all(child, predicate, found)); return found; }
    if (!React.isValidElement(node)) return found;
    if (predicate(node)) found.push(node);
    all(node.props.children, predicate, found);
    return found;
  }
  const text = node => Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
  async function flush() {
    for (let turn = 0; turn < 30; turn++) {
      if (dirty) render();
      effects.splice(0).forEach(effect => effect());
      // Drain fetch/json/effect promises without a wall-clock sleep or live network.
      await new Promise(resolve => setImmediate(resolve));
      if (!dirty && !effects.length && pending === 0) return html;
    }
    throw new Error('VMware page fixture did not settle');
  }
  async function click(label) {
    const matches = all(tree, node => typeof node.props.onClick === 'function' && text(node.props.children) === label);
    assert.equal(matches.length, 1, `Exactly one action: ${label}`);
    assert.ok(!matches[0].props.disabled, `Action is enabled: ${label}`);
    await matches[0].props.onClick();
    return flush();
  }
  function close() { hooks.filter(hook => hook.kind === 'effect').forEach(hook => hook.cleanup?.()); closed = true; }
  return { render, flush, click, close, requests, get html() { return html; } };
}
module.exports = { createVMwarePageFixture };
