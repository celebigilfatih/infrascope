// Owned loopback fixtures only: validate both the npm parser and Node's bundled parser.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isPatchedUndici, assertSafeUndiciRuntime } from './check-undici-runtime.mjs';

const require = createRequire(import.meta.url);
for (const version of ['6.28.1', '6.29.0', '7.29.0', '7.30.0', '8.12.1']) assert.equal(isPatchedUndici(version), false);
for (const version of ['6.29.1', '7.30.1', '8.12.2']) assert.equal(isPatchedUndici(version), true);
console.log('PASS patched parsers:', assertSafeUndiciRuntime());
const runtimePin = readFileSync('.nvmrc', 'utf8').trim();
for (const filename of ['Dockerfile', 'Dockerfile.dev', 'Dockerfile.incident-tests']) {
  const versions = [...readFileSync(filename, 'utf8').matchAll(/^FROM node:([^\s]+)/gm)].map(match => match[1].replace(/-slim$/, ''));
  assert.ok(versions.length > 0, `${filename} must select a patched Node runtime`);
  for (const version of versions) assert.equal(version, runtimePin, `${filename} must match the reviewed Node pin`);
}
for (const filename of readdirSync('.github/workflows').filter(name => name.endsWith('.yml'))) {
  for (const match of readFileSync(path.join('.github/workflows', filename), 'utf8').matchAll(/node-version: '([^']+)'/g)) {
    assert.equal(match[1], runtimePin, `${filename} must match the reviewed Node pin`);
  }
}
console.log('PASS production, development, regression and CI runtime pins agree');

// A rejection alone is insufficient: vulnerable parsers crash after the caller catches it.
for (const mode of ['global', 'npm']) {
  for (const encodings of ['gzip, gzip, gzip, gzip, gzip, gzip', 'gzip, deflate, br, gzip, deflate, br, gzip']) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { createServer } from 'node:net';
      import { fetch as npmFetch, Agent } from 'undici';
      const agent = new Agent();
      const server = createServer(socket => socket.once('data', () => socket.end(
        'HTTP/1.1 200 OK\\r\\nContent-Encoding: ' + ${JSON.stringify(encodings)} + '\\r\\nContent-Length: 100\\r\\nConnection: close\\r\\n\\r\\n')));
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const fetcher = ${JSON.stringify(mode)} === 'global' ? globalThis.fetch : npmFetch;
        await assert.rejects(fetcher('http://127.0.0.1:' + server.address().port, { dispatcher: agent }),
          error => /content-encoding/.test(error.cause?.message || ''));
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('PROCESS_SURVIVED');
      } finally { await agent.destroy(); await new Promise(resolve => server.close(resolve)); }
    `], { cwd: process.cwd(), encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 0, `${mode} rejected response crashed: ${child.stderr}`);
    assert.match(child.stdout, /PROCESS_SURVIVED/);
  }
}
console.log('PASS both parsers survive early close after rejecting excessive and mixed content-encoding chains');

const fixture = mkdtempSync(path.join(tmpdir(), 'infrascope-undici-'));
const original = Object.fromEntries(['NODE_ENV', 'VMWARE_TLS_CA_CERT_PATH', 'VMWARE_TLS_INSECURE'].map(key => [key, process.env[key]]));
const timers = new Set();
let httpServer, httpsServer;
try {
  const openssl = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', path.join(fixture, 'key.pem'), '-out', path.join(fixture, 'ca.pem'), '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { encoding: 'utf8' });
  assert.equal(openssl.status, 0, 'OpenSSL must generate the owned loopback certificate');
  const ts = require('typescript');
  const { Module } = require('node:module');
  const tlsPath = path.resolve('lib/security/tls.ts');
  const compiled = ts.transpileModule(readFileSync(tlsPath, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const loaded = new Module(tlsPath);
  loaded.filename = tlsPath; loaded.paths = Module._nodeModulePaths(path.dirname(tlsPath));
  loaded._compile(compiled, tlsPath);
  const { secureFetch } = loaded.exports;
  process.env.NODE_ENV = 'production';
  delete process.env.VMWARE_TLS_CA_CERT_PATH;
  delete process.env.VMWARE_TLS_INSECURE;
  let hits = 0;
  const handler = async (request, response) => {
    hits++;
    if (request.url === '/slow') {
      const timer = setTimeout(() => { timers.delete(timer); response.end('late'); }, 500);
      timers.add(timer); return;
    }
    let body = '';
    for await (const part of request) body += part;
    const payload = JSON.stringify({ header: request.headers['x-fixture'], body });
    response.writeHead(request.url === '/denied' ? 403 : 200, {
      'Content-Type': 'application/json', ...(request.url === '/gzip' ? { 'Content-Encoding': 'gzip' } : {}),
    });
    response.end(request.url === '/gzip' ? gzipSync(payload) : payload);
  };
  httpServer = createServer(handler);
  httpsServer = createHttpsServer({ key: readFileSync(path.join(fixture, 'key.pem')), cert: readFileSync(path.join(fixture, 'ca.pem')) }, handler);
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => httpsServer.listen(0, '127.0.0.1', resolve));
  const http = `http://127.0.0.1:${httpServer.address().port}`;
  const https = `https://127.0.0.1:${httpsServer.address().port}`;
  const options = { method: 'POST', headers: { 'X-Fixture': 'owned-loopback' }, body: '<soap>valid</soap>' };
  assert.deepEqual(await (await secureFetch('VMWARE', http, options)).json(), { header: 'owned-loopback', body: options.body });
  assert.deepEqual(await (await secureFetch('VMWARE', http + '/gzip', options)).json(), { header: 'owned-loopback', body: options.body });
  assert.equal((await secureFetch('VMWARE', http + '/denied')).status, 403);
  await assert.rejects(secureFetch('VMWARE', https));
  const caPem = readFileSync(path.join(fixture, 'ca.pem'), 'utf8');
  assert.equal((await secureFetch('VMWARE', https, { caPem })).status, 200);
  process.env.VMWARE_TLS_CA_CERT_PATH = path.join(fixture, 'ca.pem');
  assert.equal((await secureFetch('VMWARE', https)).status, 200);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(secureFetch('VMWARE', http, { signal: controller.signal }));
  await assert.rejects(secureFetch('VMWARE', http + '/slow', { timeoutMs: 20 }));
  const previousHits = hits;
  process.env.VMWARE_TLS_INSECURE = 'true';
  assert.throws(() => secureFetch('VMWARE', https), /forbidden in production/);
  assert.equal(hits, previousHits);
  console.log('PASS real secureFetch: JSON/header/SOAP, gzip, 403, cancellation/timeout, custom CA, strict TLS and production guard');
} finally {
  for (const timer of timers) clearTimeout(timer);
  for (const server of [httpServer, httpsServer]) if (server) {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  assert.equal(path.dirname(fixture), tmpdir());
  rmSync(fixture, { recursive: true, force: true });
}
