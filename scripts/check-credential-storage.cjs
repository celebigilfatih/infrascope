// Actual crypto, API, saved-source, email and migration code; synthetic I/O only.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const key = n => Buffer.alloc(32, n).toString('base64');
const plain = profile => profile === 'VMWARE_VCENTER'
  ? { host: 'vc.fixture.invalid', username: 'fixture-reader', password: ' fixture-VM-$secret\n', pollingInterval: 10,
    enabledModules: { datacenters: true, clusters: true, hosts: true, vms: true, datastores: true } }
  : profile === 'ZABBIX' ? { url: 'https://zabbix.fixture.invalid', authToken: 'fixture-token', pollingInterval: 5,
    enabledModules: { hosts: true, interfaces: true, triggers: true, items: true } }
  : { smtpHost: 'smtp.fixture.invalid', smtpUser: 'fixture-user', smtpPass: ' fixture-SMTP-$secret ', smtpPort: 587,
    recipients: ['fixture@example.invalid'], smtpSecure: false };

function fixture(database) {
  const state = { rows: [], email: null, clients: [], transports: [], attempts: [], queued: [], logs: [], writes: 0,
    conflict: false, conflictEmail: false, failWrite: false };
  const env = { INTEGRATION_CREDENTIALS_KEY: key(13) };
  const orm = {
    integrationConfig: {
      findFirst: async ({ where }) => structuredClone(state.rows.find(r => r.type === where.type
        && (where.name === undefined || where.name === r.name) && (!where.enabled || r.enabled)) || null),
      findMany: async ({ where }) => structuredClone(state.rows.filter(r => (typeof where.type === 'string' ? where.type === r.type : where.type.in.includes(r.type))
        && (!where.enabled || r.enabled) && (!where.id || where.id === r.id))),
      upsert: async ({ where, create, update }) => {
        const r = state.rows.find(r => r.type === where.type_name.type && r.name === where.type_name.name);
        state.writes++;
        if (r) return Object.assign(r, structuredClone(update));
        const row = { id: `fixture-${state.rows.length}`, ...structuredClone(create) }; state.rows.push(row); return row;
      },
      updateMany: async ({ where, data }) => {
        if (state.failWrite) throw new Error('Fixture write failure');
        if (state.conflict) return { count: 0 };
        const row = state.rows.find(r => r.id === where.id);
        if (!row || JSON.stringify(row.config) !== JSON.stringify(where.config.equals)) return { count: 0 };
        state.writes++; Object.assign(row, structuredClone(data)); return { count: 1 };
      },
      update: async () => ({}),
    },
    notificationConfig: {
      findUnique: async () => structuredClone(state.email),
      upsert: async ({ create, update }) => {
        state.writes++; state.email = state.email ? { ...state.email, ...update } : { id: 'fixture-mail', ...create };
        return structuredClone(state.email);
      },
      updateMany: async ({ where, data }) => {
        if (state.conflictEmail) return { count: 0 };
        if (JSON.stringify(state.email.config) !== JSON.stringify(where.config.equals)) return { count: 0 };
        state.writes++; Object.assign(state.email, structuredClone(data)); return { count: 1 };
      },
    },
    organization: { findFirst: async () => ({ id: 'fixture-org' }) },
    integrationSyncLog: { create: async () => ({}) },
    device: { findMany: async () => [] }, nmsBackup: { findMany: async () => [] },
    $transaction: async callback => {
      const before = structuredClone({ rows: state.rows, email: state.email, writes: state.writes });
      try { return await callback(orm); }
      catch (error) { Object.assign(state, before); throw error; }
    },
  };
  class Source {
    constructor(config) { state.clients.push(structuredClone(config)); }
    async authenticate() { return true; }
    async getStatus() { return { connected: true }; }
    async testConnection() { return { connected: true }; }
    async syncToInventory() { return { success: true, status: 'success', itemsProcessed: 0, itemsCreated: 0, itemsUpdated: 0, errorCount: 0,
      errors: [], hostsCreated: 0, hostsUpdated: 0, vmsCreated: 0, vmsUpdated: 0, clustersCreated: 0, clustersUpdated: 0 }; }
  }
  const dependencies = {
    'next/server': { NextRequest, NextResponse }, '@/lib/prisma': { prisma: database || orm },
    '@/lib/logger': { createLogger: () => new Proxy({}, { get: () => (...args) => state.logs.push(args) }) },
    '@/lib/auth/api-permission': { authorizeApiRequest: async () => ({ allowed: true, auth: { role: 'ADMIN' } }) },
    '@/lib/auth/permission-policy': { canAccessSync: () => true },
    '@/lib/integrations/vmware': { VMwareService: Source }, '@/lib/integrations/zabbix': { ZabbixService: Source },
    '@/lib/integrations/vmware-python': { isVMwarePythonError: () => false },
    nodemailer: { createTransport: config => { state.transports.push(config); return { verify: async () => true,
      sendMail: async () => ({ messageId: 'fixture-message' }) }; } },
    '@/lib/notifications/attempts': { recordNotificationAttempt: async value => state.attempts.push(value) },
    '@/lib/notifications/dlq-worker': { addToDLQ: async (...args) => state.queued.push(args) },
    '@/lib/validators': { validateBody: (body, schema) => { const p = schema.safeParse(body); return p.success ? { success: true, data: p.data } : { success: false, error: 'Fixture validation rejected' }; } },
    zod: require('zod'),
  };
  const load = moduleLoader(dependencies, { process: { env }, structuredClone, TextEncoder, TextDecoder, globalThis: {}, console: quiet });
  const crypto = load('lib/security/integration-credentials.ts');
  const request = (url, method, body) => new NextRequest('http://fixture.invalid' + url, { method,
    headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const api = (profile, config, name = 'fixture-profile', action = 'save-config') => {
    const type = profile === 'VMWARE_VCENTER' ? 'vmware' : 'zabbix';
    return load(`app/api/integrations/${type}/route.ts`).POST(request(`/api/integrations/${type}`, 'POST', { action, config, name }));
  };
  const mail = (config, enabled = true) => load('app/api/alarms/notification/route.ts').PUT(request('/api/alarms/notification', 'PUT', { ...config, enabled }));
  const migrate = options => load('lib/security/integration-credential-migration.ts').migrateIntegrationCredentials(options);
  return { state, env, orm, load, crypto, api, mail, migrate, request };
}
const tests = [], test = (name, fn) => tests.push([name, fn]);
const field = p => p === 'VMWARE_VCENTER' ? 'password' : p === 'ZABBIX' ? 'authToken' : 'smtpPass';
for (const profile of ['VMWARE_VCENTER', 'ZABBIX', 'SMTP']) {
  const secret = field(profile);
  test(`${profile}: real API write encrypts and runtime resolves the exact secret`, async () => {
    const f = fixture(), config = plain(profile);
    const response = profile === 'SMTP' ? await f.mail(config) : await f.api(profile, config);
    assert.equal(response.status, 200);
    const saved = profile === 'SMTP' ? f.state.email.config : f.state.rows[0].config;
    assert.match(saved[secret], /^enc:v1:i:/); assert.ok(!JSON.stringify(saved).includes(config[secret]));
    assert.equal(f.crypto.unprotectIntegrationConfig(saved, profile)[secret], config[secret]);
    if (profile === 'VMWARE_VCENTER') f.load('lib/integrations/vmware-source.ts').createSavedVMwareSource({ id: f.state.rows[0].id, config: saved, syncInterval: 10 });
    if (profile === 'ZABBIX') await f.load('app/api/integrations/zabbix/route.ts').GET(f.request('/api/integrations/zabbix', 'GET'));
    if (profile === 'SMTP') {
      const result = await f.load('lib/notifications/email.ts').sendTestEmail(); assert.equal(result.success, true);
      assert.equal(f.state.transports[0].auth.pass, config[secret]);
    } else assert.equal(f.state.clients.at(-1)[secret], config[secret]);
  });
  for (const edit of ['', '********', undefined]) test(`${profile}: ${String(edit)} edit retains same-profile secret`, async () => {
    const f = fixture(), config = plain(profile);
    if (profile === 'SMTP') await f.mail(config); else await f.api(profile, config);
    const response = profile === 'SMTP' ? await f.mail({ ...config, [secret]: edit }) : await f.api(profile, { ...config, [secret]: edit });
    assert.equal(response.status, 200);
    const saved = profile === 'SMTP' ? f.state.email.config : f.state.rows[0].config;
    assert.equal(f.crypto.unprotectIntegrationConfig(saved, profile)[secret], config[secret]);
  });
  test(`${profile}: explicit replacement takes effect`, async () => {
    const f = fixture(), config = plain(profile);
    if (profile === 'SMTP') { await f.mail(config); await f.mail({ ...config, [secret]: 'fixture-replaced' }); }
    else { await f.api(profile, config); await f.api(profile, { ...config, [secret]: 'fixture-replaced' }); }
    const saved = profile === 'SMTP' ? f.state.email.config : f.state.rows[0].config;
    assert.equal(f.crypto.unprotectIntegrationConfig(saved, profile)[secret], 'fixture-replaced');
  });
  for (const failure of ['wrong-key', 'malformed', 'tampered']) test(`${profile}: ${failure} stops before source/SMTP access`, async () => {
    const f = fixture(); let saved = f.crypto.protectIntegrationConfig(plain(profile), profile);
    if (failure === 'wrong-key') f.env.INTEGRATION_CREDENTIALS_KEY = key(14);
    else if (failure === 'malformed') saved[secret] = 'enc:v1:i:broken';
    else { const parts = saved[secret].split(':'); const bytes = Buffer.from(parts[5], 'base64url'); bytes[0] ^= 1; parts[5] = bytes.toString('base64url'); saved[secret] = parts.join(':'); }
    if (profile === 'VMWARE_VCENTER') assert.throws(() => f.load('lib/integrations/vmware-source.ts').createSavedVMwareSource({ id: f.state.rows[0].id, config: saved, syncInterval: 10 }));
    if (profile === 'ZABBIX') { f.state.rows.push({ id: 'bad', type: profile, enabled: true, config: saved });
      assert.equal((await f.load('app/api/integrations/zabbix/route.ts').GET(f.request('/api/integrations/zabbix', 'GET'))).status, 500); }
    if (profile === 'SMTP') { f.state.email = { id: 'bad', enabled: true, config: saved };
      assert.equal((await f.load('lib/notifications/email.ts').sendTestEmail()).success, false);
      assert.equal(await f.load('lib/notifications/email.ts').sendAlarmEmail({ alarmEventId: 'fixture-event', incidentId: 'fixture-incident' }), false);
      assert.equal(f.state.attempts[0].status, 'FAILED_RETRYABLE'); assert.equal(f.state.queued.length, 1); }
    assert.equal(f.state.clients.length + f.state.transports.length, 0);
    assert.ok(!JSON.stringify(f.state.logs).includes(saved[secret]));
  });
  test(`${profile}: context substitution is rejected`, () => {
    const f = fixture(), saved = f.crypto.protectIntegrationConfig(plain(profile), profile);
    assert.throws(() => f.crypto.unprotectIntegrationConfig({ password: saved[secret] }, 'FORTIANALYZER'));
  });
}
for (const profile of ['VMWARE_VCENTER', 'ZABBIX']) {
  test(`${profile}: a new named profile never borrows another profile secret`, async () => {
    const f = fixture(), config = plain(profile); await f.api(profile, config, 'first');
    assert.equal((await f.api(profile, { ...config, [field(profile)]: '********' }, 'second')).status, 400);
    assert.equal(f.state.rows.length, 1);
  });
  test(`${profile}: unsaved test uses entered credentials and does not persist`, async () => {
    const f = fixture(), config = plain(profile); await f.api(profile, config);
    const n = f.state.writes; assert.equal((await f.api(profile, { ...config, [field(profile)]: 'fixture-entered' }, undefined, 'test')).status, 200);
    assert.equal(f.state.clients.at(-1)[field(profile)], 'fixture-entered'); assert.equal(f.state.writes, n);
  });
  test(`${profile}: manual sync decrypts saved credentials`, async () => {
    const f = fixture(), config = plain(profile); await f.api(profile, config);
    assert.equal((await f.api(profile, undefined, undefined, 'sync')).status, 200);
    assert.equal(f.state.clients.at(-1)[field(profile)], config[field(profile)]);
  });
}
test('VMware/SMTP settings responses contain masks, never ciphertext/plaintext', async () => {
  const f = fixture(); await f.api('VMWARE_VCENTER', plain('VMWARE_VCENTER')); await f.mail(plain('SMTP'));
  const vm = await (await f.load('app/api/integrations/vmware/route.ts').GET(f.request('/api/integrations/vmware?type=config', 'GET'))).json();
  const mail = await (await f.load('app/api/alarms/notification/route.ts').GET()).json();
  assert.equal(vm.config.password, '********'); assert.equal(mail.data.config.smtpPass, '********');
  assert.ok(!JSON.stringify([vm, mail]).includes('enc:v1:'));
});
test('Zabbix unsupported aliases are not persisted as plaintext', async () => {
  const f = fixture(); await f.api('ZABBIX', { ...plain('ZABBIX'), password: 'fixture-alias', apiToken: 'fixture-alias', apiKey: 'fixture-alias' });
  assert.ok(!JSON.stringify(f.state.rows[0]).includes('fixture-alias'));
});
test('VMware health authenticates with decrypted saved credentials', async () => {
  const f = fixture(), h = require('./check-vmware-health.cjs').fixture();
  h.state.env.INTEGRATION_CREDENTIALS_KEY = f.env.INTEGRATION_CREDENTIALS_KEY;
  const original = h.state.records[0].config;
  h.state.records[0].config = f.crypto.protectIntegrationConfig(original, 'VMWARE_VCENTER');
  const result = await h.health(); assert.equal(result.datasources.vmware.status, 'healthy');
  const basic = h.state.calls.find(c => c.options.method === 'POST').options.headers.Authorization;
  assert.equal(basic, 'Basic ' + Buffer.from(original.username + ':' + original.password).toString('base64'));
  assert.ok(!JSON.stringify(result).includes(original.password));
});
test('VMware health rejects a wrong key before a remote login', async () => {
  const f = fixture(), h = require('./check-vmware-health.cjs').fixture();
  h.state.env.INTEGRATION_CREDENTIALS_KEY = key(14);
  h.state.records[0].config = f.crypto.protectIntegrationConfig(h.state.records[0].config, 'VMWARE_VCENTER');
  assert.equal((await h.health()).datasources.vmware.status, 'unhealthy'); assert.equal(h.state.calls.length, 0);
});
test('VMware alarm initializer receives decrypted credentials through the shared source', async () => {
  const f = fixture(), a = require('./check-alarm-dispatch.cjs').fixture({ credentials: f.crypto });
  a.state.configs.VMWARE_VCENTER = { id: 'fixture-vcenter', enabled: true, config: f.crypto.protectIntegrationConfig(plain('VMWARE_VCENTER'), 'VMWARE_VCENTER') };
  assert.equal(await a.engine(false).initializeVMware(), true);
  assert.equal(a.state.lastVMConfig.password, plain('VMWARE_VCENTER').password);
});
test('SMTP invitation/reset consumers use the decrypted shared configuration', async () => {
  const f = fixture(); await f.mail(plain('SMTP'));
  const email = f.load('lib/email/sendInvitation.ts');
  assert.equal(await email.sendInvitationEmail({ to: 'fixture@example.invalid', token: 'fixture-token', invitedBy: 'Fixture', role: 'VIEWER' }), true);
  assert.equal(await email.sendPasswordResetEmail({ to: 'fixture@example.invalid', token: 'fixture-token', userName: 'Fixture' }), true);
  assert.equal(f.state.transports.length, 2);
  assert.ok(f.state.transports.every(t => t.auth.pass === plain('SMTP').smtpPass));
});
test('SMTP configured delivery decrypts, records SENT and retains disabled semantics', async () => {
  const f = fixture(); await f.mail(plain('SMTP'));
  const email = f.load('lib/notifications/email.ts');
  assert.equal(await email.sendAlarmEmail({ alarmEventId: 'fixture-event', incidentId: 'fixture-incident', alarmCode: 'FIXTURE',
    alarmName: 'Fixture', title: 'Fixture', severity: 'ALARM_HIGH', category: 'OPERATIONAL', message: 'Fixture', timestamp: new Date() }), true);
  assert.equal(f.state.attempts[0].status, 'SENT'); assert.equal(f.state.transports[0].auth.pass, plain('SMTP').smtpPass);
  await f.mail(plain('SMTP'), false);
  assert.equal(await email.sendAlarmEmail({ alarmEventId: 'fixture-disabled', alarmCode: 'FIXTURE_DISABLED' }), false);
  assert.equal(f.state.attempts.at(-1).status, 'SKIPPED_DISABLED'); assert.equal(f.state.transports.length, 1);
});
function seed(f) {
  f.state.rows = ['VMWARE_VCENTER', 'ZABBIX'].map((type, i) => ({ id: `fixture-${i}`, type, name: 'fixture', enabled: false, config: plain(type) }));
  f.state.email = { id: 'fixture-email', channel: 'email', enabled: false, config: plain('SMTP') };
}
test('migration protects disabled integration/email records and a second run is unchanged', async () => {
  const f = fixture(); seed(f); const r = await f.migrate(); assert.equal(r.protected, 2); assert.equal(r.smtpProtected, 1);
  const before = JSON.stringify(f.state); await f.migrate();
  // Log counts may change; the saved envelopes and write count must not.
  const snapshot = JSON.parse(before); assert.deepEqual(f.state.rows, snapshot.rows); assert.deepEqual(f.state.email, snapshot.email); assert.equal(f.state.writes, snapshot.writes);
});
test('migration upgrades session-derived envelopes and rotates every new profile', async () => {
  const f = fixture(); seed(f); delete f.env.INTEGRATION_CREDENTIALS_KEY; f.env.NEXTAUTH_SECRET = 'fixture-session'; await f.migrate();
  f.env.INTEGRATION_CREDENTIALS_KEY = key(13); await f.migrate();
  f.env.INTEGRATION_CREDENTIALS_PREVIOUS_KEY = key(13); f.env.INTEGRATION_CREDENTIALS_KEY = key(14); await f.migrate();
  delete f.env.INTEGRATION_CREDENTIALS_PREVIOUS_KEY;
  for (const row of f.state.rows) assert.equal(f.crypto.unprotectIntegrationConfig(row.config, row.type)[field(row.type)], plain(row.type)[field(row.type)]);
  assert.equal(f.crypto.unprotectIntegrationConfig(f.state.email.config, 'SMTP').smtpPass, plain('SMTP').smtpPass);
});
for (const failure of ['missing-key', 'wrong-key', 'conflict', 'email-conflict', 'write-failure']) test(`migration ${failure} aborts all integration/email writes`, async () => {
  const f = fixture(); seed(f);
  if (failure === 'missing-key') delete f.env.INTEGRATION_CREDENTIALS_KEY;
  if (failure === 'wrong-key') f.state.email.config = f.crypto.protectIntegrationConfig(plain('SMTP'), 'SMTP', { INTEGRATION_CREDENTIALS_KEY: key(14) });
  f.state.conflict = failure === 'conflict'; f.state.conflictEmail = failure === 'email-conflict'; f.state.failWrite = failure === 'write-failure';
  const before = JSON.stringify({ rows: f.state.rows, email: f.state.email });
  await assert.rejects(f.migrate()); assert.equal(f.state.writes, 0);
  assert.equal(JSON.stringify({ rows: f.state.rows, email: f.state.email }), before);
});
async function main() { for (const [name, fn] of tests) { await fn(); console.log('PASS ' + name); }
  console.log(`Credential storage regressions passed (${tests.length} scenarios; no installation ENV, network, database or recipients).`); }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixture, plain, key, field };
