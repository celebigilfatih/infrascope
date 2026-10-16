// Pure policy, scanner and workflow regressions. No application startup or installation ENV.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { policyErrors, readPolicy } from './check-release-quality.mjs';
import { scanContent, shouldScan } from './check-production-tls.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), tests = [];
const test = (name, run) => tests.push([name, run]);
const current = () => readPolicy(root);
test('actual production build explicitly enforces Next type/lint and the pre-compilation quality command', () => {
  const { config, pkg } = current(); assert.deepEqual(policyErrors(config, pkg), []);
});
for (const section of ['typescript', 'eslint']) test(`${section} bypass is rejected`, () => {
  const { config, pkg } = current(); config[section][section === 'eslint' ? 'ignoreDuringBuilds' : 'ignoreBuildErrors'] = true;
  assert.ok(policyErrors(config, pkg).length);
});
for (const [name, script] of [
  ['direct build', ['build', 'next build']],
  ['no-lint build', ['build', 'next build --no-lint']],
  ['ignored quality exit', ['build', 'npm run quality:release || next build']],
  ['partial quality gate', ['quality:release', 'npm run type-check']],
  ['ignored compiler exit', ['type-check', 'tsc --noEmit || true']],
  ['scoped lint bypass', ['lint', 'next lint --file next.config.js']],
]) test(`${name} cannot pass release policy`, () => {
  const { config, pkg } = current(); pkg.scripts[script[0]] = script[1]; assert.ok(policyErrors(config, pkg).length);
});
for (const [name, relative, code] of [
  ['Python requests verification', 'scripts/collector.py', 'requests.get(url, verify=False)'],
  ['Python unverified context', 'scripts/collector.py', 'ssl._create_unverified_context()'],
  ['Python certificate mode', 'scripts/collector.py', 'ctx.verify_mode = ssl.CERT_NONE'],
  ['Python hostname policy', 'scripts/collector.py', 'ctx.check_hostname = False'],
  ['Python global override', 'scripts/collector.py', "os.environ['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'"],
  ['CommonJS TLS bypass', 'lib/client.cjs', 'const options = { rejectUnauthorized' + ': false }'],
  ['JS global override', 'lib/client.js', 'process.env.NODE_TLS_' + "REJECT_UNAUTHORIZED = '0'"],
  ['production insecure flag', '.env.production', 'FORTIANALYZER_TLS_INSECURE=true'],
]) test(`${name} is detected`, () => assert.equal(scanContent(relative, code).length, 1));
test('Python and CommonJS files are included by the actual tree selector', () => {
  for (const file of ['scripts/get-snapshots.py', 'scripts/get-host-details.py', 'lib/client.cjs']) assert.equal(shouldScan(path.join(root, file)), true);
});
test('trusted-file exclusions never hide similarly named Python files', () => {
  assert.equal(shouldScan(path.join(root, 'lib/security/tls.ts')), false);
  assert.equal(shouldScan(path.join(root, 'lib/security/tls.ts.extra.py')), true);
  assert.equal(shouldScan(path.join(root, 'scripts/check-production-tls.mjs.extra.py')), true);
});
test('verified Python TLS is accepted', () => assert.equal(scanContent('scripts/collector.py', 'ctx = ssl.create_default_context(cadata=ca)\nrequests.get(url, verify=True)').length, 0));
const helper = fs.readFileSync(path.join(root, 'scripts/vmware_helper.py'), 'utf8');
test('only the reviewed centralized Python development/test policy is accepted', () => {
  assert.equal(scanContent('scripts/vmware_helper.py', helper).length, 0);
  assert.equal(scanContent('scripts/other_helper.py', helper).length, 2);
});
test('a weakened guard invalidates the Python policy exception', () => {
  assert.equal(scanContent('scripts/vmware_helper.py', helper.replace("== 'production'", "== 'staging'")).length, 2);
});
test('a later unsafe assignment is not hidden by an earlier reviewed assignment', () => {
  const result = scanContent('scripts/vmware_helper.py', helper + '\nctx.verify_mode = ssl.CERT_NONE\n');
  assert.equal(result.length, 1); assert.ok(result[0].line > 100);
});
test('scanner reports every match and line without exposing matched source', () => {
  const result = scanContent('scripts/collector.py', '\nrequests.get(a, verify=False)\nrequests.get(b, verify=False)');
  assert.deepEqual(result.map(r => r.line), [2, 3]); assert.ok(result.every(r => !('text' in r)));
});
test('tag and manual publication wait for every required reusable quality/regression workflow', () => {
  const publish = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/publish-image.yml'), 'utf8'));
  assert.deepEqual([...publish.jobs.publish.needs].sort(), ['release-quality', 'alarm-checks', 'dashboard-checks', 'incident-checks', 'backup-checks'].sort());
  assert.equal(publish.jobs.publish.if, undefined); assert.ok(publish.on.push.tags); assert.ok(publish.on.workflow_dispatch);
  for (const job of publish.jobs.publish.needs) {
    const file = publish.jobs[job].uses.replace('./', ''), workflow = yaml.load(fs.readFileSync(path.join(root, file), 'utf8'));
    assert.ok('workflow_call' in workflow.on); assert.ok(!publish.jobs[job]['continue-on-error']);
    for (const task of Object.values(workflow.jobs)) assert.ok(!task['continue-on-error']);
  }
});
test('reusable quality workflow executes policy regressions, real compiler controls and the full gate', () => {
  const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/release-quality.yml'), 'utf8'));
  const steps = workflow.jobs.quality.steps;
  for (const cmd of ['npm run test:release-quality', 'npm run test:release-compiler', 'npm run quality:release']) {
    const step = steps.find(s => s.run === cmd); assert.ok(step); assert.ok(!step['continue-on-error']); assert.equal(step.if, undefined);
  }
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /RUN INFRASCOPE_BUILD=1 npm run build/);
});
for (const [name, run] of tests) { run(); console.log(`PASS ${name}`); }
console.log(`Release quality regressions passed (${tests.length} scenarios; configuration/scanner/workflow contracts only).`);
