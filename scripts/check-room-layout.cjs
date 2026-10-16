// Exercise plan pointer behavior with isolated React hooks and an in-memory transport.
// No browser, database, or live API requests are used.
/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function fixture({ visible, fail = false, edit = true } = {}) {
  const room = { id: 'room-test', name: 'Test odası', width: 10, depth: 8, racks: [
    { id: 'rack-a', name: 'Kabinet A', maxUnits: 42, operationalStatus: 'OPERATIONAL', devices: [] },
    { id: 'rack-b', name: 'Kabinet B', maxUnits: 42, operationalStatus: 'OPERATIONAL', devices: [] },
  ] };
  const state = [], refs = [], calls = [], selected = [], notifications = [];
  let stateIndex = 0, refIndex = 0;
  const hooks = {
    useState(initial) { const index = stateIndex++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useRef(initial) { const index = refIndex++; if (!(index in refs)) refs[index] = { current: initial }; return refs[index]; },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect() {},
  };
  const cache = new Map();
  const fetchMock = async (url, options) => { calls.push({ url, ...options }); return { ok: !fail, json: async () => ({ success: !fail, error: fail ? 'Test kaydetme hatası' : undefined }) }; };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const module = { exports: {} }; cache.set(relative, module);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const localRequire = name => {
      if (name === 'react') return hooks;
      if (name === '@/components/ui/use-toast') return { useToast: () => ({ toast: value => notifications.push(value) }) };
      if (name === '@/components/ui/button') return { Button: 'button' };
      if (name === '@/lib/i18n/tr') return { uiError: value => value instanceof Error ? value.message : String(value) };
      return name.startsWith('@/') ? load(`${name.slice(2)}.ts`) : require(name);
    };
    vm.runInThisContext(`(function(require,module,exports,fetch){${code}\n})`, { filename: relative })(localRequire, module, module.exports, fetchMock);
    return module.exports;
  }
  const { FloorPlanView } = load('components/3d/FloorPlanView.tsx');
  function render() {
    stateIndex = 0; refIndex = 0;
    const tree = FloorPlanView({ room, editMode: edit, visibleRackIds: visible && new Set(visible), onRackClick: id => selected.push(id) });
    return tree.props.children.find(child => child?.type === 'canvas').props;
  }
  const captured = new Set();
  const target = { getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture: id => captured.add(id), releasePointerCapture: id => captured.delete(id), hasPointerCapture: id => captured.has(id) };
  const event = (x, y) => ({ clientX: x, clientY: y, pointerId: 1, currentTarget: target });
  return { render, event, state, calls, selected, notifications, room };
}

async function main() {
  let test = fixture();
  const original = JSON.stringify(test.room);
  let canvas = test.render();
  canvas.onPointerDown(test.event(125, 135));
  await canvas.onPointerUp(test.event(125, 135));
  assert.deepEqual(test.selected, ['rack-a']);
  assert.equal(test.calls.length, 0, 'Selecting an automatically positioned rack must not save undefined coordinates');
  assert.equal(JSON.stringify(test.room), original, 'The source response must remain unchanged');

  test = fixture({ visible: ['rack-b'], edit: false }); canvas = test.render();
  canvas.onPointerDown(test.event(125, 135));
  assert.equal(test.selected.length, 0, 'Filtered-out racks must not receive pointer selection');
  canvas.onPointerDown(test.event(200, 135));
  assert.deepEqual(test.selected, ['rack-b']);

  test = fixture({ visible: ['rack-a'] }); canvas = test.render();
  canvas.onPointerDown(test.event(125, 135));
  canvas.onPointerMove(test.event(197, 135));
  canvas = test.render(); await canvas.onPointerUp(test.event(197, 135));
  assert.equal(test.calls.length, 0, 'Hidden racks must still participate in collision prevention');

  test = fixture(); canvas = test.render();
  canvas.onPointerDown(test.event(125, 135)); canvas.onPointerMove(test.event(125, 255));
  canvas = test.render(); canvas.onPointerCancel(test.event(125, 255));
  assert.equal(test.state[0][0].coordX, undefined, 'Cancel must restore the original unassigned coordinates');
  assert.equal(test.calls.length, 0, 'Pointer cancellation must never save');

  test = fixture(); canvas = test.render();
  canvas.onPointerDown(test.event(125, 135)); canvas.onPointerMove(test.event(125, 255));
  canvas = test.render(); await canvas.onPointerUp(test.event(125, 255));
  assert.equal(test.calls.length, 1);
  assert.equal(test.calls[0].url, '/api/racks/rack-a');
  assert.equal(test.calls[0].method, 'PUT');
  const payload = JSON.parse(test.calls[0].body);
  assert.equal(payload.coordX, .5); assert.equal(payload.coordZ, 2.5); assert.equal(payload.rotation, 0);
  assert.match(test.notifications[0].title, /kaydedildi/);

  test = fixture({ fail: true }); canvas = test.render();
  canvas.onPointerDown(test.event(125, 135)); canvas.onPointerMove(test.event(125, 255));
  canvas = test.render(); await canvas.onPointerUp(test.event(125, 255));
  assert.equal(test.state[0][0].coordX, undefined, 'A failed save must restore the original coordinates');
  assert.equal(test.notifications[0].variant, 'destructive');
  console.log('Room plan checks passed: filter selection, hidden-rack collisions, selection without writes, cancellation, successful payload and failed-save rollback. No live requests.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
