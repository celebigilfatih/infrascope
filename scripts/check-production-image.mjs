// Exercise the shipped runtime without a network or database; no source fixtures can mask missing generated files.
import cp from 'node:child_process';
const image = process.argv[2] || 'ghcr.io/celebigilfatih/infrascope:1.0.1';
const version = process.argv[3] || '1.0.1';
const probe = `const assert=require('node:assert/strict'),fs=require('node:fs');
assert.equal(process.env.NODE_ENV,'production');assert.equal(process.env.APP_VERSION,${JSON.stringify(version)});
assert.notEqual(process.getuid(),0);assert.equal(fs.existsSync('/app/.env'),false);
const {PrismaClient}=require('@prisma/client');const client=new PrismaClient();client.$disconnect();
assert.ok(fs.readdirSync('/app/node_modules/.prisma/client').some(n=>n.startsWith('libquery_engine-')));
console.log('PASS: generated Prisma client, native engine, version, non-root runtime and no installation ENV; network disabled.');`;
for (const args of [
  ['run', '--rm', '--network', 'none', '--entrypoint', 'node', image, '-e', probe],
  ['run', '--rm', '--network', 'none', '--entrypoint', '/opt/vmware/bin/python3', image, '-c', 'import pyVim, pyVmomi; print("PASS: bundled VMware runtime imports offline.")'],
]) {
  const result = cp.spawnSync('docker', args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
