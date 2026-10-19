/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('components/topology/usePersistedConnectionTypeFilter.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const labelCode = ts.transpileModule(fs.readFileSync('components/topology/useConnectionLabelVisibility.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const prefix = 'infrascope:topology:connection-types:v1:';
const allowed = ['FIBER', 'ETHERNET', 'OTHER'];
const store = new Map();
const writes = [];
let blocked = false;
const storage = {
  getItem(key) { if (blocked) throw new Error('Storage blocked'); return store.get(key) || null; },
  setItem(key, value) { if (blocked) throw new Error('Storage blocked'); writes.push(key); store.set(key, value); },
};
function mount(scope, server = false, labels = false) {
  const slots = [], effects = [];
  let cursor = 0, dirty = true, result, currentScope = scope;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; dirty = true; }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index][i]))) {
        slots[index] = deps;
        if (!server) effects.push(effect);
      }
    },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(`(function(require,exports){${labels ? labelCode : code}\n})`, server ? {} : { window: { localStorage: storage } })(name => { assert.equal(name, 'react'); return react; }, loaded.exports);
  const render = () => { cursor = 0; dirty = false; result = labels ? loaded.exports.useConnectionLabelVisibility(currentScope) : loaded.exports.usePersistedConnectionTypeFilter(currentScope, allowed); };
  const flush = () => {
    let iterations = 0;
    while (dirty || effects.length) {
      assert.ok(iterations++ < 10, 'Persistence must settle without a render loop');
      if (dirty) render();
      const pending = effects.splice(0);
      pending.forEach(effect => effect());
    }
    return result;
  };
  return { flush, update(value) { result[1](value); return flush(); }, switchTo(next) { currentScope = next; dirty = true; return flush(); } };
}
const hidden = hook => Array.from(hook[0]).sort();
store.set(prefix + 'buildings', JSON.stringify({ version: 1, hiddenTypes: ['FIBER', 'FIBER', 'REMOVED_TYPE', 1] }));
const main = mount('buildings');
assert.deepEqual(hidden(main.flush()), ['FIBER'], 'Restore valid selections, ignore duplicates and obsolete values');
assert.equal(writes.length, 1, 'Never overwrite a saved selection with initial defaults');
assert.deepEqual(JSON.parse(store.get(prefix + 'buildings')).hiddenTypes, ['FIBER']);
assert.deepEqual(hidden(main.update(previous => new Set([...previous, 'ETHERNET']))), ['ETHERNET', 'FIBER']);
assert.deepEqual(hidden(mount('buildings').flush()), ['ETHERNET', 'FIBER'], 'Multiple hidden types survive a fresh mount');
const buildingA = mount('building:A');
assert.deepEqual(hidden(buildingA.flush()), []);
buildingA.update(new Set(['ETHERNET']));
assert.deepEqual(hidden(mount('building:B').flush()), [], 'Another building keeps its own default');
assert.deepEqual(hidden(buildingA.switchTo('building:B')), [], 'Changing scopes must not leak the previous selection');
assert.deepEqual(hidden(buildingA.switchTo('building:A')), ['ETHERNET']);
assert.deepEqual(hidden(mount('buildings').flush()), ['ETHERNET', 'FIBER'], 'Building filters cannot overwrite the main map');
main.update(new Set());
assert.deepEqual(hidden(mount('buildings').flush()), [], 'Show all remains selected after remount');
for (const invalid of ['{broken', 'null', '[]', '{"version":2,"hiddenTypes":["FIBER"]}', '{"version":1,"hiddenTypes":"FIBER"}']) {
  store.set(prefix + 'invalid', invalid);
  assert.deepEqual(hidden(mount('invalid').flush()), [], 'Invalid preferences safely fall back to all types');
}
blocked = true;
const unavailable = mount('blocked');
assert.deepEqual(hidden(unavailable.flush()), []);
assert.deepEqual(hidden(unavailable.update(new Set(['FIBER']))), ['FIBER'], 'Blocked storage must not break filtering');
assert.deepEqual(hidden(mount('server', true).flush()), [], 'Server render requires no browser globals');
blocked = false;
const labelPrefix = 'infrascope:topology:connection-labels:v1:';
const labelMount = scope => mount(scope, false, true);
store.set(labelPrefix + 'buildings', JSON.stringify({ version: 1, showLabels: false }));
const beforeLabelWrites = writes.length;
const labels = labelMount('buildings');
assert.equal(labels.flush()[0], false, 'Hidden labels restore without overwriting the saved choice');
assert.equal(writes.length, beforeLabelWrites + 1);
assert.equal(JSON.parse(store.get(labelPrefix + 'buildings')).showLabels, false);
assert.equal(labelMount('buildings').flush()[0], false, 'Hidden labels survive reload');
const labelsA = labelMount('building:A');
assert.equal(labelsA.flush()[0], true, 'Labels are visible by default');
labelsA.update(false);
assert.equal(labelMount('building:A').flush()[0], false);
assert.equal(labelsA.switchTo('building:B')[0], true, 'Another building has an independent label preference');
assert.equal(labelsA.switchTo('building:A')[0], false);
labels.update(true);
assert.equal(labelMount('buildings').flush()[0], true, 'Showing labels again also survives reload');
assert.deepEqual(hidden(mount('building:A').flush()), ['ETHERNET'], 'Labels must not alter type filters');
for (const invalid of ['{broken', 'null', '{"version":1,"showLabels":"false"}', '{"version":2,"showLabels":false}']) {
  store.set(labelPrefix + 'invalid', invalid);
  assert.equal(labelMount('invalid').flush()[0], true);
}
blocked = true;
const blockedLabels = labelMount('blocked');
assert.equal(blockedLabels.flush()[0], true);
assert.equal(blockedLabels.update(false)[0], false, 'Label toggle works when persistence is blocked');
assert.equal(mount('server', true, true).flush()[0], true, 'Labels render safely on the server');
console.log('Topology filter persistence passed: restore before save, reload, multi-select, reset, building isolation, scope changes, invalid data, blocked storage and server rendering. No live data changed.');
console.log('Label visibility passed: defaults, hide/show reload, building isolation, independent type filters, invalid preferences, blocked storage and server rendering.');
