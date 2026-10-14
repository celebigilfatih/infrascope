const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');

function loadRoute(relativePath, dependencies) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) {${compiled}\n})`, { filename })(
    name => name === 'next/server' ? require(name) : dependencies[name] || (() => { throw new Error(`Unexpected dependency: ${name}`); })(),
    module, module.exports,
  );
  return module.exports;
}

async function main() {
  let actor = { role: 'ADMIN', actor: { id: 'test-admin' } };
  let listQuery;
  let createCall;
  let deleteCall;
  let detailStatus = 200;
  const row = { id: 'backup-uuid', nmsDeviceId: 75, backupType: 'Running Config', backupFile: 'switch.cfg',
    description: 'Test backup', sizeBytes: 4120n, createdAt: new Date('2026-10-14T13:30:00Z'),
    device: { id: 'inventory-id', name: 'ISG_DEPO_SW' }, configuration: 'secret-config', sshPassword: 'secret-password' };
  const prisma = {
    nmsBackup: {
      findMany: async query => { listQuery = query; return [row]; },
      findUnique: async query => query.where.id === row.id ? row : null,
    },
    device: { findUnique: async query => query.where.nmsDeviceId === 75 ? { id: 'inventory-id' } : null },
  };
  const dependencies = {
    '@/lib/prisma': { prisma },
    '@/lib/auth/request-actor': { getRequestActor: async () => actor },
    '../devices/[id]/backups/route': { POST: async (request, context) => {
      createCall = { body: await request.json(), context, cookie: request.headers.get('cookie') };
      return NextResponse.json({ success: true }, { status: 201 });
    } },
    '../../devices/[id]/backups/[backupId]/route': {
      GET: async () => NextResponse.json(detailStatus === 200 ? { configuration: 'hostname switch\nend\n' } : { error: 'Backup integrity verification failed' }, { status: detailStatus }),
      DELETE: async (_request, context) => { deleteCall = context; return NextResponse.json({ success: true }); },
    },
  };
  const list = loadRoute('app/api/integrations/nms/backups/route.ts', dependencies);
  const detail = loadRoute('app/api/integrations/nms/backups/[id]/route.ts', dependencies);
  const request = (query = '') => new NextRequest(`http://localhost/api/integrations/nms/backups${query}`);
  const context = { params: { id: row.id } };
  const payload = await (await list.GET(request())).json();
  assert.equal(payload.total, 1);
  assert.equal(payload.data[0].id, 'backup-uuid');
  assert.equal(payload.data[0].file_size, 4120);
  assert.equal(payload.data[0].device_name, 'ISG_DEPO_SW');
  assert.doesNotMatch(JSON.stringify(payload), /secret-config|secret-password|configuration|sshPassword/);
  assert.equal(listQuery.select.configuration, undefined);
  assert.equal(listQuery.select.device.select.sshPassword, undefined);
  await list.GET(request('?device_id=75&backup_type=Running%20Config&search=ISG'));
  assert.equal(listQuery.where.nmsDeviceId, 75);
  assert.equal(listQuery.where.backupType, 'Running Config');
  assert.equal(listQuery.where.OR[1].device.name.contains, 'ISG');
  for (const invalid of ['abc', '-1', '0', '1.5', '9007199254740992', '']) {
    assert.equal((await list.GET(request(`?device_id=${invalid}`))).status, 400);
  }
  const download = await detail.GET(request('?action=download'), context);
  assert.equal(download.status, 200);
  assert.equal(await download.text(), 'hostname switch\nend\n');
  assert.match(download.headers.get('Content-Disposition'), /attachment; filename="switch.cfg"/);
  assert.equal(download.headers.get('Cache-Control'), 'private, no-store');
  detailStatus = 409;
  const corrupt = await detail.GET(request('?action=download'), context);
  assert.equal(corrupt.status, 409);
  assert.equal(corrupt.headers.get('Content-Disposition'), null);
  assert.equal((await detail.GET(request(), { params: { id: 'missing' } })).status, 404);
  actor = null;
  assert.equal((await list.GET(request())).status, 401);
  assert.equal((await detail.GET(request('?action=download'), context)).status, 401);
  assert.equal((await detail.DELETE(request(), context)).status, 401);
  actor = { role: 'VIEWER', actor: { id: 'test-viewer' } };
  assert.equal((await detail.DELETE(request(), context)).status, 403);
  assert.equal(deleteCall, undefined);
  actor = { role: 'ADMIN', actor: { id: 'test-admin' } };
  assert.equal((await detail.DELETE(request(), context)).status, 200);
  assert.deepEqual(deleteCall.params, { id: 'inventory-id', backupId: row.id });
  const post = body => new NextRequest('http://localhost/api/integrations/nms/backups', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'session=test' }, body: JSON.stringify(body),
  });
  assert.equal((await list.POST(post({ device_id: 75, backup_type: 'Running Config', description: 'Manual' }))).status, 201);
  assert.deepEqual(createCall.body, { backupType: 'Running Config', description: 'Manual' });
  assert.equal(createCall.cookie, 'session=test');
  assert.equal(createCall.context.params.id, 'inventory-id');
  assert.equal((await list.POST(post({ device_id: 75, schedule: 'Scheduled' }))).status, 400);
  assert.equal((await list.POST(post({ device_id: 75, backup_type: 'Startup Config' }))).status, 400);
  assert.equal((await list.POST(post({ device_id: 999 }))).status, 404);
  console.log('General NMS backup route checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
