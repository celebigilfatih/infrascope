/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), path = require('node:path');
const exportsFixture = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/topology/fullscreen.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsFixture });
const { MapFullscreen } = exportsFixture;
(async () => {
  let listener, state, requests = 0, exits = 0, denied = false;
  const doc = { fullscreenElement: null, fullscreenEnabled: true, addEventListener: (_, fn) => { listener = fn; }, removeEventListener: () => { listener = null; }, exitFullscreen: async () => { exits++; doc.fullscreenElement = null; listener?.(); } };
  doc.documentElement = { requestFullscreen: async () => { requests++; if (denied) throw Error('Denied'); doc.fullscreenElement = doc.documentElement; listener(); } };
  const controller = new MapFullscreen(doc, next => { state = next; });
  await controller.toggle(); assert.equal(state.expanded, true); assert.equal(state.fallback, false); assert.equal(requests, 1);
  await controller.toggle(); assert.equal(state.expanded, false); assert.equal(exits, 1);
  await controller.toggle(); doc.fullscreenElement = null; listener(); assert.equal(state.expanded, false, 'Browser Esc synchronizes button');
  denied = true; await controller.toggle(); assert.equal(state.expanded, true); assert.equal(state.fallback, true);
  await controller.toggle(); assert.equal(state.expanded, false);
  doc.fullscreenElement = {}; await controller.toggle(); assert.equal(state.fallback, true); assert.equal(requests, 3, 'Never replace another fullscreen owner');
  await controller.toggle(); controller.dispose(); assert.equal(listener, null);
  doc.fullscreenElement = null;
  let release;
  doc.documentElement.requestFullscreen = () => new Promise(resolve => { release = () => { doc.fullscreenElement = doc.documentElement; resolve(); }; });
  const pendingController = new MapFullscreen(doc, () => {});
  const pending = pendingController.toggle(); pendingController.dispose(); release(); await pending;
  assert.equal(doc.fullscreenElement, null, 'Unmount during a pending request must not strand browser fullscreen');
  for (const outcome of ['resolve', 'reject']) {
    let settle;
    doc.documentElement.requestFullscreen = () => new Promise((resolve, reject) => {
      settle = () => {
        if (outcome === 'reject') { reject(Error('Late denial')); return; }
        doc.fullscreenElement = doc.documentElement; listener?.(); resolve();
      };
    });
    const closing = new MapFullscreen(doc, next => { state = next; });
    const entering = closing.toggle();
    await closing.close();
    settle(); await entering;
    assert.equal(state.expanded, false, `Close before ${outcome} must not reopen the overview`);
    assert.equal(state.fallback, false, `Close before ${outcome} must not reopen fallback`);
    assert.equal(state.busy, false);
    assert.equal(doc.fullscreenElement, null, `Close before ${outcome} must release native fullscreen`);
    await closing.close();
    assert.equal(doc.fullscreenElement, null, 'Repeated close remains safe');
    doc.documentElement.requestFullscreen = async () => { doc.fullscreenElement = doc.documentElement; listener?.(); };
    await closing.toggle();
    assert.equal(state.expanded, true, 'A new entry works after cancellation settles');
    await closing.close();
    assert.equal(doc.fullscreenElement, null, 'The new entry retains ownership for exit');
    closing.dispose();
  }
  console.log('Fullscreen lifecycle passed: native, exit/Esc, denied fallback, foreign owner and cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
