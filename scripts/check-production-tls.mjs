#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ignoredDirs = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'api-ref',
]);

const ignoredRelativeFiles = new Set([
  'lib/security/tls.ts',
  'scripts/check-production-tls.js',
  'scripts/check-production-tls.mjs',
]);

const scannedExtensions = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.py',
  '.ts',
  '.tsx',
  '.sh',
  '.env',
  '.example',
  '.yml',
  '.yaml',
  '.md',
]);

const exactFiles = new Set([
  '.env.local',
  '.env.production',
  '.env.example',
  'Dockerfile',
  'package.json',
]);

const checks = [
  {
    name: 'forbidden NODE_TLS_REJECT_UNAUTHORIZED assignment',
    pattern: /process\.env\.NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0['"]/,
  },
  {
    name: 'forbidden NODE_TLS_REJECT_UNAUTHORIZED env value',
    pattern: /^\s*NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0["']?\s*$/m,
  },
  {
    name: 'forbidden rejectUnauthorized false literal',
    pattern: /rejectUnauthorized\s*:\s*false/,
  },
  {
    name: 'forbidden production insecure TLS flag',
    pattern: /^\s*[A-Z0-9_]+_TLS_INSECURE\s*=\s*["']?true["']?\s*$/m,
  },
];

const pythonChecks = [
  { name: 'forbidden Python verify=False', pattern: /\bverify\s*=\s*False\b/ },
  { name: 'forbidden Python unverified SSL context', pattern: /\bssl\._create_unverified_context\b/ },
  { name: 'forbidden Python certificate verification disable', pattern: /\b\w+\.verify_mode\s*=\s*ssl\.CERT_NONE\b/ },
  { name: 'forbidden Python hostname verification disable', pattern: /\b\w+\.check_hostname\s*=\s*False\b/ },
  { name: 'forbidden Python global TLS bypass', pattern: /\bos\.environ\s*\[\s*['"]NODE_TLS_REJECT_UNAUTHORIZED['"]\s*\]\s*=\s*['"]0['"]/ },
];

// Reviewed B08 central policy, including truthy/production_guard/tls_context.
// A changed policy fails this exception until reviewed with the runtime TLS tests.
const PYTHON_POLICY_SHA256 = '3a0d2cceb4bdbad5cbe398467bc2f0b87c37ab468c052ff12061a46df0527b41';
function pythonPolicySpan(relative, content) {
  if (relative.split(path.sep).join('/') !== 'scripts/vmware_helper.py') return null;
  const start = content.indexOf('def truthy('), end = content.indexOf('\ndef unique_object(');
  if (start < 0 || end < start) return null;
  return createHash('sha256').update(content.slice(start, end)).digest('hex') === PYTHON_POLICY_SHA256 ? { start, end } : null;
}

function scanContent(relative, source) {
  const content = source.replace(/\r\n/g, '\n');
  const span = pythonPolicySpan(relative, content);
  const patterns = path.extname(relative) === '.py' ? [...checks, ...pythonChecks] : checks;
  const findings = [];
  for (const check of patterns) {
    const pattern = new RegExp(check.pattern.source, check.pattern.flags + 'g');
    for (const match of content.matchAll(pattern)) {
      const reviewedAssignment = check.name === 'forbidden Python certificate verification disable'
        || check.name === 'forbidden Python hostname verification disable';
      if (reviewedAssignment && span && match.index >= span.start && match.index < span.end) continue;
      findings.push({ file: relative, line: content.slice(0, match.index).split('\n').length, check: check.name });
    }
  }
  return findings;
}

function shouldScan(filePath) {
  const relative = path.relative(root, filePath);
  const portableRelative = relative.split(path.sep).join('/');
  if (portableRelative.startsWith('docs/_archive/') || ignoredRelativeFiles.has(portableRelative)) return false;
  if (exactFiles.has(relative)) return true;

  const ext = path.extname(filePath);
  if (scannedExtensions.has(ext)) return true;

  return path.basename(filePath).startsWith('.env');
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }

    const filePath = path.join(dir, entry.name);
    if (shouldScan(filePath)) files.push(filePath);
  }
  return files;
}

function scanTree() {
  return walk(root).flatMap(filePath => scanContent(path.relative(root, filePath), fs.readFileSync(filePath, 'utf8')));
}

function run() {
  const findings = scanTree();
  if (findings.length > 0) {
    console.error('Production TLS check failed:');
    for (const finding of findings) console.error(`- ${finding.file}:${finding.line} ${finding.check}`);
    process.exitCode = 1;
  } else {
    console.log('Production TLS check passed (including Python and CommonJS).');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) run();
export { scanContent, shouldScan, scanTree, run };
