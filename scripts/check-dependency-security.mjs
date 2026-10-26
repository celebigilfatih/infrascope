// Real patched dependency boundaries over loopback/owned fixtures; no live integration or email.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import axios from 'axios';
import nodemailer from 'nodemailer';

const parent = tmpdir();
const fixture = mkdtempSync(path.join(parent, 'infrascope-dependency-'));
let privateReads = 0;
const server = createServer((request, response) => {
  if (request.url === '/private') privateReads++;
  response.writeHead(request.url === '/denied' ? 403 : 200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ success: request.url !== '/denied', header: request.headers['x-infrascope-fixture'] }));
});
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const result = await axios.get(url, { headers: { 'X-InfraScope-Fixture': 'loopback-only' }, timeout: 3000 });
  assert.deepEqual(result.data, { success: true, header: 'loopback-only' });
  await assert.rejects(axios.get(`${url}/denied`), error => axios.isAxiosError(error) && error.response?.status === 403);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(axios.get(url, { signal: controller.signal }), error => axios.isCancel(error));
  console.log('PASS real Axios: valid JSON/header, forbidden response and cancellation');

  const transport = nodemailer.createTransport({ jsonTransport: true, disableFileAccess: true, disableUrlAccess: true });
  const mail = await transport.sendMail({ from: 'InfraScope <monitor@example.invalid>', to: 'İzleme Ekibi <operator@example.invalid>', subject: 'Olay çözümü — Türkçe', text: 'Geçerli bildirim' });
  const message = JSON.parse(mail.message);
  assert.equal(message.to[0].address, 'operator@example.invalid');
  assert.equal(message.subject, 'Olay çözümü — Türkçe');
  console.log('PASS real Nodemailer: Unicode notification and intended recipient');

  const file = path.join(fixture, 'private-fixture.txt');
  writeFileSync(file, 'SYNTHETIC FILE MUST NOT BECOME AN ATTACHMENT');
  const payload = { from: 'monitor@example.invalid', to: 'operator@example.invalid', subject: 'Access control fixture' };
  await assert.rejects(transport.sendMail({ ...payload, attachments: [{ path: file }] }), /access|disabled/i);
  await assert.rejects(transport.sendMail({ ...payload, attachments: [{ path: `${url}/private` }] }), /access|disabled/i);
  assert.equal(privateReads, 0);
  transport.close();
  console.log('PASS real Nodemailer: disabled file and URL access cannot be bypassed through JSON transport');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(fixture), parent);
  assert.ok(path.basename(fixture).startsWith('infrascope-dependency-'));
  rmSync(fixture, { recursive: true, force: true });
}
