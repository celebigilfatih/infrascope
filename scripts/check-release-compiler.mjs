// Actual Next.js compiler controls in disposable minimal projects; no product source import, DB or remote fonts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readPolicy } from './check-release-quality.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), { config, pkg } = readPolicy(root);
const parent = fs.realpathSync(os.tmpdir());
function run(name, page, expected, legacyBypass = false) {
  const dir = fs.mkdtempSync(path.join(parent, 'infrascope-compiler-'));
  try {
    fs.mkdirSync(path.join(dir, 'app'));
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ private: true, dependencies: pkg.dependencies, devDependencies: pkg.devDependencies }));
    fs.writeFileSync(path.join(dir, '.eslintrc.json'), fs.readFileSync(path.join(root, '.eslintrc.json')));
    fs.writeFileSync(path.join(dir, 'next.config.js'), 'module.exports = ' + JSON.stringify({
      eslint: legacyBypass ? { ignoreDuringBuilds: true } : config.eslint,
      typescript: legacyBypass ? { ignoreBuildErrors: true } : config.typescript,
      experimental: { cpus: 1 },
    }));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, esModuleInterop: true, jsx: 'preserve', moduleResolution: 'bundler', module: 'esnext', target: 'es2020' }, exclude: ['node_modules'] }));
    fs.writeFileSync(path.join(dir, 'app/layout.tsx'), 'export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }');
    fs.writeFileSync(path.join(dir, 'app/page.tsx'), page);
    const env = { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_DISABLE_LOCKFILE_PATCH: '1', CI: '1' };
    for (const key of ['PATH', 'SystemRoot', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
    const result = spawnSync(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build'], { cwd: dir, env, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
    const output = result.stdout + result.stderr;
    if (result.error) throw result.error;
    if (expected) { assert.notEqual(result.status, 0); assert.match(output, expected); }
    else assert.equal(result.status, 0, output.slice(-3000));
    if (legacyBypass) {
      assert.match(output, /Skipping validation of types/); assert.match(output, /Skipping linting/);
    } else assert.doesNotMatch(output, /Skipping (validation of types|linting)/);
    console.log(`PASS real Next.js build: ${name} (exit ${result.status})`);
  } finally {
    const resolved = fs.realpathSync(dir);
    assert.equal(path.dirname(resolved), parent); assert.ok(path.basename(resolved).startsWith('infrascope-compiler-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
run('TypeScript errors block output', 'const value: string = 42; export default function Page() { return <p>{value}</p>; }', /Type error:/);
run('ESLint errors block output', 'const value: any = "fixture"; export default function Page() { return <p>{value}</p>; }', /@typescript-eslint\/no-explicit-any/);
run('valid isolated application succeeds', 'const value: string = "fixture"; export default function Page() { return <p>{value}</p>; }');
run('legacy bypass negative control admits the invalid fixture', 'const value: string = 42; export default function Page() { const result: any = value; return <p>{result}</p>; }', undefined, true);
console.log('Release compiler controls passed (4 actual minimal Next.js builds; not a product release build).');
