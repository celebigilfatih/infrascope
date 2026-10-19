/* eslint-disable @typescript-eslint/no-require-imports */
// Exercise the actual hook with a minimal hook scheduler and controlled HTTP responses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
let cursor = 0;
const slots = [];
const effects = [];
const requests = [];
let mountEffect;
let cleanup;
const react = {
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  },
  useRef(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  },
  useCallback(fn, deps) {
    const index = cursor++;
    if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) slots[index] = { fn, deps };
    return slots[index].fn;
  },
  useEffect(fn, deps) {
    const index = cursor++;
    if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index][i]))) { slots[index] = deps; effects.push(fn); mountEffect = fn; }
  },
};
const source = fs.readFileSync(path.join(__dirname, '../components/topology/useBuildingDeviceLayout.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = { exports: {} };
vm.runInThisContext(`(function(require,module,exports,fetch){${code}\n})`)(name => { assert.equal(name, 'react'); return react; }, loaded, loaded.exports, (url, init) => new Promise(resolve => { requests.push({ url, init, resolve }); }));
const tick = () => new Promise(resolve => setImmediate(resolve));
function render() { cursor = 0; const result = loaded.exports.useBuildingDeviceLayout('buildingA'); while (effects.length) cleanup = effects.shift()(); return result; }
function reply(index, data, error) { requests[index].resolve({ ok: !error, json: async () => error ? { success: false, error } : { success: true, data } }); }
const body = index => JSON.parse(requests[index].init.body);
async function main() {
  let hook = render();
  assert.equal(hook.ready, false);
  hook.move('a', { x: 1, y: 1 });
  assert.equal(requests.length, 1, 'Dragging before saved coordinates load must not write');
  reply(0, null, 'Load failed'); await tick(); hook = render();
  assert.equal(hook.ready, false); assert.equal(hook.error, 'Load failed');
  hook.retry(); reply(1, { positions: { a: { x: 10, y: 20 } }, canEdit: true }); await tick(); hook = render();
  assert.equal(hook.ready, true); assert.deepEqual(hook.positions.a, { x: 10, y: 20 });
  hook.move('a', { x: 30, y: 40 });
  hook.move('b', { x: 50, y: 60 });
  hook.move('a', { x: 70, y: 80 });
  await tick(); hook = render();
  assert.deepEqual(hook.positions.a, { x: 70, y: 80 }, 'Latest drag applies locally immediately');
  assert.equal(hook.saving, true);
  assert.equal(requests.length, 3, 'Only one PUT may be in flight');
  assert.equal(body(2).buildingId, 'buildingA'); assert.equal(body(2).deviceId, 'a');
  reply(2, {}); await tick();
  assert.equal(requests.length, 4); assert.equal(body(3).deviceId, 'b');
  reply(3, null, 'Save failed'); await tick();
  assert.equal(requests.length, 5); assert.deepEqual(body(4).position, { x: 70, y: 80 });
  reply(4, {}); await tick(); hook = render();
  assert.equal(hook.saving, false); assert.equal(hook.saved, false); assert.equal(hook.error, 'Save failed');
  hook.retry(); await tick();
  assert.equal(requests.length, 6); assert.equal(body(5).deviceId, 'b', 'Retry only sends the unacknowledged move');
  reply(5, {}); await tick(); hook = render();
  assert.equal(hook.saved, true); assert.equal(hook.error, ''); assert.equal(hook.saving, false);
  assert.deepEqual(hook.positions, { a: { x: 70, y: 80 }, b: { x: 50, y: 60 } });
  hook.move('a', { x: 500, y: 600 }); await tick();
  const resetting = hook.reset();
  hook = render();
  assert.equal(hook.resetting, true); assert.equal(hook.saving, true);
  hook.move('b', { x: 900, y: 900 }); void hook.reset();
  await tick(); assert.equal(requests.length, 7, 'Reset waits for the pending drag and blocks duplicate reset/move requests');
  reply(6, {}); await tick();
  assert.equal(requests[7].init.method, 'POST');
  assert.deepEqual(body(7), { action: 'reset', buildingId: 'buildingA' });
  reply(7, null, 'Reset failed'); await resetting; hook = render();
  assert.equal(hook.resetting, false); assert.equal(hook.resetSaved, false);
  assert.deepEqual(hook.positions, { a: { x: 500, y: 600 }, b: { x: 50, y: 60 } }, 'A failed reset must retain the existing visible layout');
  hook.retry(); await tick(); assert.equal(requests[8].init.method, 'POST', 'Retry must repeat the failed reset');
  const defaults = { a: { x: 0, y: 0 }, b: { x: 0, y: 180 } };
  reply(8, { positions: defaults }); await tick(); hook = render();
  assert.deepEqual(hook.positions, defaults); assert.equal(hook.error, '');
  assert.equal(hook.resetSaved, true); assert.equal(hook.resetVersion, 1); assert.equal(hook.saving, false);
  hook.retry(); await tick(); assert.equal(requests.length, 9, 'Successful reset clears obsolete drag retries');
  slots.length = 0; requests.length = 0;
  render(); cleanup(); mountEffect();
  reply(1, { positions: { a: { x: 100, y: 200 } }, canEdit: true }); await tick(); hook = render();
  hook.move('a', { x: 300, y: 400 }); await tick();
  reply(0, { positions: { a: { x: 0, y: 0 } }, canEdit: true }); await tick(); hook = render();
  assert.deepEqual(hook.positions.a, { x: 300, y: 400 }, 'A stale initial response after effect replay must not overwrite a drag');
  reply(2, {}); await tick();
  slots.length = 0; requests.length = 0;
  render(); reply(0, { positions: {}, canEdit: false }); await tick(); hook = render();
  hook.move('a', { x: 1, y: 2 }); await tick();
  await hook.reset();
  assert.equal(requests.length, 1, 'Read-only users cannot enqueue a save');
  console.log('Device layout queue passed: serialized rapid drags, failed-save retry, reset waits for queued writes, drag/reset lock, reset failure preserves layout, reset retry, stale responses and read-only access. Controlled HTTP only.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
