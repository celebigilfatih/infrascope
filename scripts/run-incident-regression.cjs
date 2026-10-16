// One cross-platform command owns both test startup and disposable database cleanup.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS CLI. */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const command = ['compose', '-f', 'compose.incident-tests.yml'];
let status = 1;
try {
  const result = spawnSync('docker', [...command, 'up', '--abort-on-container-exit', '--exit-code-from', 'tests'], { cwd: root, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  status = result.status ?? 1;
} finally {
  const cleanup = spawnSync('docker', [...command, 'down', '--volumes', '--remove-orphans'], { cwd: root, stdio: 'inherit' });
  if (cleanup.error) console.error(cleanup.error.message);
  if (status === 0 && cleanup.status !== 0) status = 1;
}
process.exitCode = status;
