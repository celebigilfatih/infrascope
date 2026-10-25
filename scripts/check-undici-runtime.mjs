import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const floors = new Map([[6, [29, 1]], [7, [30, 1]], [8, [12, 2]]]);

export function isPatchedUndici(version) {
  const [major, minor, patch] = String(version).split('.').map(Number);
  const floor = floors.get(major);
  return !!floor && (minor > floor[0] || (minor === floor[0] && patch >= floor[1]));
}

export function assertSafeUndiciRuntime() {
  assert.ok(isPatchedUndici(process.versions.undici),
    `Node's bundled Undici ${process.versions.undici} is vulnerable; use Node 24.22.1 or newer patched LTS`);
  const dependencyVersion = require('undici/package.json').version;
  assert.ok(isPatchedUndici(dependencyVersion), `Installed npm Undici ${dependencyVersion} is vulnerable`);
  return { node: process.version, bundled: process.versions.undici, dependency: dependencyVersion };
}
