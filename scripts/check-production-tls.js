#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const ignoredDirs = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'api-ref',
]);

const ignoredPathFragments = [
  `${path.sep}docs${path.sep}_archive${path.sep}`,
  `${path.sep}lib${path.sep}security${path.sep}tls.ts`,
  `${path.sep}scripts${path.sep}check-production-tls.js`,
];

const scannedExtensions = new Set([
  '.js',
  '.mjs',
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

function shouldScan(filePath) {
  const relative = path.relative(root, filePath);
  if (ignoredPathFragments.some((fragment) => filePath.includes(fragment))) return false;
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

const findings = [];

for (const filePath of walk(root)) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const check of checks) {
    const match = content.match(check.pattern);
    if (!match) continue;

    const before = content.slice(0, match.index);
    const line = before.split(/\r?\n/).length;
    findings.push({
      file: path.relative(root, filePath),
      line,
      check: check.name,
      text: match[0].trim(),
    });
  }
}

if (findings.length > 0) {
  console.error('Production TLS check failed:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.check}: ${finding.text}`);
  }
  process.exit(1);
}

console.log('Production TLS check passed.');
