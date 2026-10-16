const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const { Prisma } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
process.env.INTEGRATION_CREDENTIALS_KEY = crypto.randomBytes(32).toString('base64');

let actor = { role: 'ADMIN', actor: { id: 'fixture-admin' } };
const audits = [], jobs = [];
let listQuery;
const device = { id: 'inventory-id', nmsDeviceId: 75, name: 'fixture-switch', managementIp: '127.0.0.1',
  vendor: 'Cisco', backupPlatform: null, sshUsername: 'fixture', sshPassword: 'encrypted-fixture', sshHostKeyFingerprint: 'SHA256:fixture' };
let row = { id: 'backup-id', nmsDeviceId: 75, deviceName: 'fixture-switch', backupType: 'Running Config',
  backupFile: 'switch.cfg', description: null, sizeBytes: 100n, createdAt: new Date(), device: { id: device.id, name: device.name } };
const prisma = {
  device: { findUnique: async query => (query.where.id === device.id || query.where.nmsDeviceId === 75) ? device : null,
    findMany: async () => [device], update: async () => device },
  nmsBackup: { findMany: async query => { listQuery = query; return [row]; },
    findFirst: async query => query.where.id === row.id && (query.where.nmsDeviceId === undefined || query.where.nmsDeviceId === row.nmsDeviceId) ? row : null,
    delete: async () => row, groupBy: async () => [], count: async () => 1 },
  nmsBackupJob: {
    findUnique: async query => jobs.find(job => job.idempotencyKey === query.where.idempotencyKey) || null,
    findFirst: async () => jobs.find(job => job.activeDeviceKey === 75) || null,
    create: async ({ data }) => {
      if (jobs.some(job => job.activeDeviceKey === data.activeDeviceKey)) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'fixture' });
      const job = { ...data, id: crypto.randomUUID(), status: 'queued', attempts: 0, createdAt: new Date(), backupId: null };
      jobs.push(job); return job;
    }, findMany: async () => jobs,
  },
  nmsBackupPolicy: { findMany: async () => [], upsert: async ({ create }) => ({ ...create, id: 'policy-id' }) },
  auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
  $transaction: async operations => typeof operations === 'function' ? operations(prisma) : Promise.all(operations),
};
const noLog = new Proxy({}, { get: () => () => {} });
const overrides = { '@/lib/prisma': { prisma }, '@/lib/auth/request-actor': { getRequestActor: async () => actor }, '@/lib/logger': { createLogger: () => noLog } };
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (overrides[name]) return overrides[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      let target = name.startsWith('@/') ? path.resolve(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      if (target.endsWith('.json')) return require(target);
      return load(path.relative(root, target + '.ts'));
    }
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}
const request = (method = 'GET', body, suffix = '', key = 'fixture-idempotency-key') => new NextRequest(`http://localhost/api/integrations/nms/backups${suffix}`, {
  method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

async function main() {
  const credentials = load('lib/security/integration-credentials.ts');
  const content = 'hostname fixture-switch\ninterface Gi0/1\n description fixture\nend\n';
  row.configuration = credentials.protectNmsBackup(content);
  row.checksum = crypto.createHash('sha256').update(content).digest('hex');
  const service = load('lib/nms/backup-service.ts');
  const global = load('app/api/integrations/nms/backups/route.ts');
  const detail = load('app/api/integrations/nms/backups/[id]/route.ts');
  const deviceRoute = load('app/api/integrations/nms/devices/[id]/backups/route.ts');
  const policies = load('app/api/integrations/nms/backup-policies/route.ts');
  const context = { params: { id: row.id } };

  actor = null;
  assert.equal((await global.GET(request())).status, 401);
  assert.equal((await service.enqueueDeviceBackup(request('POST', {}), device.id)).status, 401);
  assert.equal((await detail.GET(request(), context)).status, 401);
  actor = { role: 'VIEWER', actor: { id: 'fixture-viewer' } };
  const metadata = await (await global.GET(request())).json();
  assert.equal(metadata.permissions.content, false);
  assert.doesNotMatch(JSON.stringify(metadata), /configuration|sshPassword|encrypted-fixture/);
  assert.equal(listQuery.select.configuration, undefined);
  assert.equal((await service.enqueueDeviceBackup(request('POST', {}), device.id)).status, 403);
  assert.equal((await detail.GET(request(), context)).status, 403);
  assert.equal((await detail.DELETE(request(), context)).status, 403);
  assert.equal((await policies.PUT(request('PUT', {}))).status, 403);

  actor = { role: 'EDITOR', actor: { id: 'fixture-editor' } };
  const first = await global.POST(request('POST', { device_id: 75, backup_type: 'Running Config' }));
  assert.equal(first.status, 202);
  const firstJob = (await first.json()).job;
  assert.equal(firstJob.status, 'queued');
  assert.equal(audits.filter(audit => audit.action === 'SSH_CONFIG_BACKUP_COMPLETED').length, 0);
  const duplicate = await global.POST(request('POST', { device_id: 75 }));
  assert.equal((await duplicate.json()).job.id, firstJob.id);
  const another = await global.POST(request('POST', { device_id: 75 }, '', 'another-fixture-key'));
  assert.equal((await another.json()).job.id, firstJob.id);
  assert.equal(jobs.length, 1);
  assert.equal((await global.POST(request('POST', { device_id: 75, backup_type: 'Startup Config' }))).status, 409);
  assert.equal((await service.enqueueDeviceBackup(request('POST', { backupType: 'Full Backup' }), device.id)).status, 400);
  assert.equal((await service.enqueueDeviceBackup(request('POST', {}, '', 'bad'), device.id)).status, 400);
  assert.equal((await policies.PUT(request('PUT', {}))).status, 403);
  const download = await detail.GET(request('GET', undefined, '?action=download'), context);
  assert.equal(download.status, 200); assert.equal(await download.text(), content);
  assert.equal(download.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(audits.at(-1).action, 'SSH_CONFIG_BACKUP_READ');
  assert.equal((await service.readBackup(request(), row.id, 999)).status, 404);
  row.nmsDeviceId = null; row.device = null;
  assert.equal((await detail.GET(request(), context)).status, 200);
  assert.equal((await (await global.GET(request())).json()).data[0].archived, true);
  row.checksum = 'corrupt';
  const corrupt = await detail.GET(request('GET', undefined, '?action=download'), context);
  assert.equal(corrupt.status, 409); assert.equal(corrupt.headers.get('Content-Disposition'), null);
  assert.doesNotMatch(await corrupt.text(), /hostname|description fixture/);

  actor = { role: 'ADMIN', actor: { id: 'fixture-admin' } };
  assert.equal((await detail.DELETE(request(), context)).status, 200);
  for (const invalid of ['abc', '-1', '0', '1.5', '2147483648', '9007199254740992', '']) assert.equal((await global.GET(request('GET', undefined, `?device_id=${invalid}`))).status, 400);
  const policy = { device_id: 75, enabled: true, platform: 'cisco_ios', backup_type: 'Running Config', interval_hours: 24, retention_days: 90, keep_last: 10, stale_after_hours: 48 };
  assert.equal((await policies.PUT(request('PUT', policy))).status, 200);
  assert.equal((await policies.PUT(request('PUT', { ...policy, stale_after_hours: 1 }))).status, 400);
  assert.equal((await policies.PUT(request('PUT', { ...policy, platform: 'comware', backup_type: 'Startup Config' }))).status, 422);
  assert.equal((await policies.PUT(request('PUT', { ...policy, platform: 'arbitrary-command' }))).status, 400);
  const capabilities = await (await deviceRoute.GET(request(), { params: { id: device.id } })).json();
  assert.equal(capabilities.permissions.startup, true);

  // A fresh backup of a different type cannot hide a stale scheduled type.
  prisma.nmsBackupPolicy.findMany = async () => [{ ...policy, id: 'policy-current', nmsDeviceId: 75, inventoryDeviceId: device.id, backupType: 'Running Config' }];
  prisma.nmsBackup.groupBy = async query => {
    assert.deepEqual(Array.from(query.by), ['nmsDeviceId', 'backupType']);
    return [
      { nmsDeviceId: 75, backupType: 'Running Config', _max: { createdAt: new Date('2026-10-12T09:00:00Z') } },
      { nmsDeviceId: 75, backupType: 'Startup Config', _max: { createdAt: new Date('2026-10-16T09:00:00Z') } },
    ];
  };
  const coverage = await (await policies.GET(request())).json();
  assert.equal(coverage.devices[0].lastSuccessAt, '2026-10-16T09:00:00.000Z');
  assert.equal(coverage.devices[0].lastPolicySuccessAt, '2026-10-12T09:00:00.000Z');
  prisma.nmsBackup.groupBy = async () => [{ nmsDeviceId: 75, backupType: 'Startup Config', _max: { createdAt: new Date('2026-10-16T09:00:00Z') } }];
  const missingType = await (await policies.GET(request())).json();
  assert.equal(missingType.devices[0].lastPolicySuccessAt, null);

  let faCalled = false;
  const queries = load('lib/alarms/queries/nms.ts');
  const failed = { inventory_device_id: 'fixture-a', source_event_id: 'job', condition_key: 'backup-failed' };
  const overdue = { inventory_device_id: 'fixture-b', source_event_id: 'policy', condition_key: 'backup-overdue' };
  let rawCalls = 0;
  prisma.$queryRaw = async () => ++rawCalls === 1 ? [failed] : [failed, overdue];
  const result = await queries.getNmsBackupFailedEvents({ alarmCode: 'NMS_BACKUP_FAILED', eventCache: null, cacheIsFresh: false, faService: new Proxy({}, { get: () => { faCalled = true; throw new Error('FA must not be used'); } }) });
  assert.equal(result.events.length, 2); assert.equal(faCalled, false); assert.equal(rawCalls, 2);
  console.log('NMS backup API contracts passed: roles, durable acceptance, duplicate requests, archived downloads, integrity, policies, alarms.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
