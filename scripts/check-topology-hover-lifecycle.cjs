/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX };
const source = ts.transpileModule(fs.readFileSync('components/topology/ConnectionTooltip.tsx', 'utf8'), { compilerOptions: options }).outputText;
const emphasisCode = ts.transpileModule(fs.readFileSync('lib/topology/connection-emphasis.ts', 'utf8'), { compilerOptions: options }).outputText;
const emphasis = { exports: {} };
vm.runInThisContext(`(function(exports){${emphasisCode}\n})`)(emphasis.exports);
const { nextHoveredConnection } = emphasis.exports;
const timers = new Map(); let timerId = 0;
const clock = { setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
const advance = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
function mount(callback) {
  const slots = [], pending = [], listeners = new Map();
  let cursor = 0, dirty = true, hook, onChange = callback;
  function effect(kind, fn, deps) {
    const index = cursor++;
    if (!slots[index] || !deps || deps.some((value, i) => !Object.is(value, slots[index].deps?.[i]))) {
      pending.push({ index, kind, fn, deps });
    }
  }
  const react = {
    useCallback: callback => callback,
    useId: () => 'tooltip-fixture',
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useState(initial) {
      const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { const next = typeof value === 'function' ? value(slots[index]) : value; if (!Object.is(slots[index], next)) { slots[index] = next; dirty = true; } }];
    },
    useEffect: (fn, deps) => effect('passive', fn, deps),
    useLayoutEffect: (fn, deps) => effect('layout', fn, deps),
  };
  const loaded = { exports: {} };
  const sandbox = {
    ...clock, Element: class {},
    window: {
      addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
      removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    },
  };
  vm.runInNewContext(`(function(require,exports){${source}\n})`, sandbox)(name => name === 'react' ? react : {}, loaded.exports);
  const flush = () => {
    let iterations = 0;
    while (dirty || pending.length) {
      assert.ok(iterations++ < 20, 'Hover must settle without a render loop');
      if (dirty) { cursor = 0; dirty = false; hook = loaded.exports.useConnectionTooltip(onChange); }
      const effects = pending.splice(0).sort((a, b) => (a.kind === 'layout' ? 0 : 1) - (b.kind === 'layout' ? 0 : 1));
      for (const item of effects) { slots[item.index]?.cleanup?.(); slots[item.index] = { deps: item.deps, cleanup: item.fn() }; }
    }
    return hook;
  };
  flush();
  return {
    act(action) { action(flush()); return flush(); },
    flush,
    update(callback) { onChange = callback; dirty = true; return flush(); },
    emit(name, event) { for (const listener of listeners.get(name) || []) listener(event); return flush(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
const pointer = { clientX: 50, clientY: 60, currentTarget: { closest: () => null, getBoundingClientRect: () => ({ right: 30, bottom: 40 }) } };
let current = null;
const owner = id => active => { current = nextHoveredConnection(current, id, active); };
const a = mount(owner('A')), b = mount(owner('B'));
a.act(hook => hook.enter(pointer)); assert.equal(current, 'A');
a.act(hook => hook.leave());
b.act(hook => hook.enter(pointer)); assert.equal(current, 'B');
a.act(hook => hook.enter(pointer)); assert.equal(current, 'A', 'Returning before an old tooltip closes reclaims hover');
b.act(hook => hook.leave()); advance(); b.flush();
assert.equal(current, 'A', 'The old B close cannot erase A');
a.act(hook => hook.leave()); advance(); a.flush(); assert.equal(current, null);
a.act(hook => hook.enter(pointer)); a.act(hook => hook.leave()); a.act(hook => hook.keepOpen()); advance(); a.flush();
assert.equal(current, 'A', 'Moving from the path into its tooltip retains the preview');
a.act(hook => hook.leaveTooltip()); advance(); a.flush(); assert.equal(current, null);
a.act(hook => hook.focus(pointer)); a.act(hook => hook.leave()); advance(); a.flush();
assert.equal(current, 'A', 'Keyboard focus retains the preview');
a.act(hook => hook.blur()); advance(); a.flush(); assert.equal(current, null);
a.act(hook => hook.enter(pointer)); a.act(hook => hook.leave()); a.act(hook => hook.focusTooltip()); advance(); a.flush();
assert.equal(current, 'A', 'A focused tooltip action stays available after the pointer leaves');
a.act(hook => hook.blurTooltip({ currentTarget: { contains: () => true }, relatedTarget: {} })); advance(); a.flush();
assert.equal(current, 'A', 'Moving focus within the tooltip does not close it');
a.act(hook => hook.blurTooltip({ currentTarget: { contains: () => false }, relatedTarget: null })); advance(); a.flush();
assert.equal(current, null, 'Leaving the tooltip with both pointer and focus restores the map');
a.act(hook => hook.enter(pointer));
a.emit('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} }); assert.equal(current, null);
a.act(hook => hook.show(pointer)); assert.equal(current, null, 'Mousemove cannot reopen an Escape-dismissed tooltip');
a.act(hook => hook.leave()); a.act(hook => hook.enter(pointer)); assert.equal(current, 'A');
a.emit('wheel', { target: null }); assert.equal(current, null, 'Viewport gestures clear preview');
a.act(hook => hook.show(pointer)); assert.equal(current, 'A', 'Mousemove can re-enter after a viewport gesture');
a.update(owner('A')); assert.equal(current, 'A', 'Updating an edge callback cannot close a live preview');
b.act(hook => hook.enter(pointer)); a.unmount(); assert.equal(current, 'B', 'Filtering an older connection cannot clear the current one');
b.unmount(); assert.equal(current, null, 'Filtering the hovered connection clears preview');
let building = null, device = null;
const main = mount(active => { building = nextHoveredConnection(building, 'same-id', active); });
const inner = mount(active => { device = nextHoveredConnection(device, 'same-id', active); });
main.act(hook => hook.enter(pointer)); inner.act(hook => hook.enter(pointer)); main.unmount();
assert.equal(building, null); assert.equal(device, 'same-id', 'Main and building workspaces own independent hover state');
inner.unmount(); assert.equal(device, null);
assert.equal(timers.size, 0, 'Unmount cancels pending leave timers');
console.log('Tooltip hover lifecycle passed: rapid A/B/A transitions, delayed leave, tooltip transfer, keyboard focus, Escape, viewport gestures, callback replacement, filtering/unmount and workspace isolation. Actual hook; no live data changed.');
