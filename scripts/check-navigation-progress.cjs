/* eslint-disable @typescript-eslint/no-require-imports -- Deterministic component regression with no browser or network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const slots = [], timers = new Map(), listeners = new Map();
  let cursor = 0, now = 0, sequence = 0, dirty = true, tree, pending = [];
  let pathname = '/initial';
  const location = { href: 'http://fixture/initial' };
  const later = (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; };
  const changed = (a, b) => !a || a.length !== b.length || b.some((v, i) => !Object.is(a[i], v));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return (slots[index] ||= { current: initial }); },
    useEffect(fn, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps, cleanup: previous?.cleanup };
        pending.push(() => { slots[index].cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const loaded = { exports: {} };
  const source = fs.readFileSync(path.resolve(__dirname, '../components/ui/navigation-progress.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    URL, Math: Object.create(Math, { random: { value: () => .2 } }),
    window: { location },
    document: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } },
    setTimeout: later, clearTimeout: id => timers.delete(id),
  })(name => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === 'next/navigation') return { usePathname: () => pathname };
    if (name === '@/lib/utils') return { cn: (...values) => values.filter(Boolean).join(' ') };
    throw new Error(`Unexpected live dependency ${name}`);
  }, loaded, loaded.exports);
  function render() {
    let passes = 0;
    do {
      assert.ok(++passes < 50, 'Effects must settle without a render loop');
      dirty = false; cursor = 0; pending = [];
      tree = loaded.exports.NavigationProgress();
      for (const effect of pending) effect();
    } while (dirty);
  }
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn();
      if (dirty) render();
    }
    now = end;
  }
  render();
  return {
    bar: () => tree?.props.children?.props,
    timers, listeners, advance,
    click(href, extra = {}) {
      listeners.get('click')({ target: { closest: () => href ? { href: new URL(href, location.href).href, target: '' } : null }, ...extra });
      if (dirty) render();
    },
    navigate(next) { pathname = next; location.href = new URL(next, location.href).href; render(); },
    rerender: render,
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

const f = fixture();
assert.equal(f.bar(), undefined);
assert.equal(f.listeners.size, 1);
for (const [href, extra] of [[null, {}], ['/initial', {}], ['https://external.invalid/other', {}], ['/next', { ctrlKey: true }], ['/next', { metaKey: true }], ['/next', { shiftKey: true }]]) {
  f.click(href, extra); assert.equal(f.bar(), undefined);
}
f.click('/first');
assert.equal(f.bar().role, 'progressbar');
assert.equal(f.bar()['aria-valuenow'], 10);
f.rerender(); f.advance(1500);
assert.ok(f.bar(), 'Pending navigation must retain a visible indicator');
assert.ok(f.bar()['aria-valuenow'] > 10 && f.bar()['aria-valuenow'] < 100, 'A pending navigation must not complete because loading state changed');
f.navigate('/first');
assert.equal(f.bar()['aria-valuenow'], 100);
f.advance(299); assert.equal(f.bar()['aria-valuenow'], 100);
f.advance(1); assert.equal(f.bar(), undefined); assert.equal(f.timers.size, 0);

f.click('/second'); f.advance(260);
assert.equal(f.bar()['aria-valuenow'], 13);
f.navigate('/second'); f.advance(150); f.navigate('/third');
f.advance(299); assert.equal(f.bar()['aria-valuenow'], 100, 'A later pathname replaces the previous completion timer');
f.advance(1); assert.equal(f.bar(), undefined);
f.click('/fourth'); f.advance(260); f.unmount();
assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 0);
console.log('Navigation progress passed: ignored clicks, stable pending state, pathname completion, delayed reset, repeated route changes and timer/listener cleanup. Controlled clock and hooks; no live I/O.');
