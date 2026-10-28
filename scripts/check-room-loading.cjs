// Keep room data and the lazy 3D module out of a serial loading waterfall.
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  const effects = [], requests = [], updates = [];
  let finishRoom;
  const pendingRoom = new Promise(resolve => { finishRoom = resolve; });
  const hooks = {
    useState: initial => [typeof initial === 'function' ? initial() : initial, value => updates.push(value)],
    useRef: initial => ({ current: initial }),
    useMemo: fn => fn(), useCallback: fn => fn,
    useEffect: fn => effects.push(fn),
  };
  const loadedModule = { exports: {} };
  const filename = path.resolve(__dirname, '../app/locations/rooms/[id]/page.tsx');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const components = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
  const localRequire = name => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'next/dynamic') return () => 'LazyScene';
    if (name === 'next/navigation') return { useParams: () => ({ id: 'fixture-room' }), useRouter: () => ({ push() {} }) };
    if (name === '@/components/3d/Room3D') { requests.push('3d-module'); return { Room3D() {} }; }
    if (name === '@/components/ui/use-toast') return { useToast: () => ({ toast() {} }) };
    if (name === '@/components/layout/BreadcrumbProvider') return { usePageBreadcrumb() {} };
    if (name === '@/lib/utils') return { cn: (...values) => values.filter(Boolean).join(' ') };
    if (name === '@/lib/i18n/tr') return { uiError: value => String(value), uiLabel: value => value };
    return components;
  };
  const fetchRoom = url => { requests.push(url); return pendingRoom; };
  vm.runInThisContext(`(function(require,module,exports,fetch){${code}\n})`, { filename })(localRequire, loadedModule, loadedModule.exports, fetchRoom);
  loadedModule.exports.default();
  effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(requests.includes('/api/rooms/fixture-room'), 'Room data should start loading immediately');
  assert.ok(requests.includes('3d-module'), 'The 3D module must start loading before the room response arrives');
  assert.equal(updates.some(value => value && value.id === 'fixture-room'), false, 'The pending response must not be treated as loaded data');
  finishRoom({ ok: true, json: async () => ({ success: true, data: { id: 'fixture-room', racks: [] } }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(updates.some(value => value && value.id === 'fixture-room'), 'Room data must still reach the page');
  console.log('Room loading passed: data and lazy 3D module begin in parallel, pending data stays pending.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
