// Pure configuration policy. Runtime/network/database initialization is never imported.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
const BUILD = 'npm run quality:release && next build';
const QUALITY = 'node scripts/check-release-quality.mjs && npm run security:tls-check && npm run security:dependencies && npm run type-check && npm run lint';
function policyErrors(config, pkg) {
  const errors = [];
  if (config?.typescript?.ignoreBuildErrors !== false) errors.push('Next.js TypeScript build checks must be explicitly enabled');
  if (config?.eslint?.ignoreDuringBuilds !== false) errors.push('Next.js ESLint build checks must be explicitly enabled');
  if (pkg?.scripts?.build !== BUILD) errors.push('Release build must pass quality:release before next build');
  if (pkg?.scripts?.['quality:release'] !== QUALITY) errors.push('Release quality command must enforce policy, TLS, type and lint checks');
  if (pkg?.scripts?.['type-check'] !== 'tsc --noEmit') errors.push('Type checking must execute the real compiler without suppressing failure');
  if (pkg?.scripts?.['security:dependencies'] !== 'npm audit --audit-level=low') errors.push('Dependency audit must reject every finding across the full dependency tree');
  if (pkg?.scripts?.lint !== 'next lint') errors.push('Lint must execute the full configured Next.js lint scope without suppressing failure');
  return errors;
}
function readPolicy(root) {
  const policyModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'next.config.js'), 'utf8'), {
    module: policyModule, exports: policyModule.exports, process: { env: { NODE_ENV: 'production', npm_lifecycle_event: 'build' } },
  }, { filename: 'next.config.js', timeout: 1000 });
  return { config: policyModule.exports, pkg: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { config, pkg } = readPolicy(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
    const errors = policyErrors(config, pkg);
    if (errors.length) { errors.forEach(error => console.error(error)); process.exitCode = 1; }
    else console.log('Release build quality policy passed.');
  } catch { console.error('Release build quality configuration could not be validated'); process.exitCode = 1; }
}
export { policyErrors, readPolicy, BUILD, QUALITY };
