// Opt-in disposable PostgreSQL only. No sources, notifications or application ENV.
const assert = require('node:assert/strict');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_CREDENTIAL_DB_TEST !== '1' || url.protocol !== 'postgresql:'
  || url.hostname !== '127.0.0.1' || !/^\/[a-z0-9_]+_occurrence_tests$/.test(url.pathname)) {
  throw new Error('Explicit opt-in and local disposable *_occurrence_tests database required');
}
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('node:child_process');
const { fixture, plain, key, field } = require('./check-credential-storage.cjs');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
const types = ['VMWARE_VCENTER', 'ZABBIX', 'FORTIGATE', 'FORTIANALYZER'];
const input = type => ['FORTIGATE', 'FORTIANALYZER'].includes(type)
  ? { host: 'fortinet.fixture.invalid', password: 'fixture-fortinet' } : plain(type);
const ids = types.map(type => 'credential-fixture-' + type);
async function cleanup() {
  await prisma.integrationConfig.deleteMany({ where: { OR: [{ id: { in: ids } }, { name: 'credential-api-fixture' }] } });
  await prisma.notificationConfig.deleteMany({ where: { id: 'credential-fixture-email' } });
}
async function seed() {
  await cleanup();
  for (const type of types) await prisma.integrationConfig.create({ data: { id: 'credential-fixture-' + type,
    type, name: 'credential-fixture', enabled: false, config: input(type) } });
  await prisma.notificationConfig.create({ data: { id: 'credential-fixture-email', channel: 'email', enabled: false, config: plain('SMTP') } });
}
const read = async () => ({ rows: await prisma.integrationConfig.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } }),
  email: await prisma.notificationConfig.findUnique({ where: { id: 'credential-fixture-email' } }) });
const snapshot = async () => JSON.stringify(await read());
let checks = 0;
async function check(name, fn) { await seed(); try { await fn(); checks++; console.log('PASS PostgreSQL: ' + name); } finally { await cleanup(); } }
async function main() {
  await check('actual configuration APIs persist protected JSON in PostgreSQL', async () => {
    const f = fixture(prisma);
    for (const profile of ['VMWARE_VCENTER', 'ZABBIX']) {
      assert.equal((await f.api(profile, plain(profile), 'credential-api-fixture')).status, 200);
      const row = await prisma.integrationConfig.findUnique({ where: { type_name: { type: profile, name: 'credential-api-fixture' } } });
      assert.match(row.config[field(profile)], /^enc:v1:i:/);
      assert.equal(f.crypto.unprotectIntegrationConfig(row.config, profile)[field(profile)], plain(profile)[field(profile)]);
      assert.equal((await f.api(profile, { ...plain(profile), [field(profile)]: '********' }, 'credential-api-fixture')).status, 200);
    }
    assert.equal((await f.mail(plain('SMTP'))).status, 200);
    const row = await prisma.notificationConfig.findUnique({ where: { channel: 'email' } });
    assert.match(row.config.smtpPass, /^enc:v1:i:/);
    assert.equal((await f.load('lib/notifications/email.ts').getEmailConfig()).smtpPass, plain('SMTP').smtpPass);
  });
  await check('legacy enabled/disabled profiles and SMTP migrate once without changing metadata', async () => {
    const f = fixture(prisma), before = await read(); const r = await f.migrate({ includeNms: false });
    assert.equal(r.protected, 4); assert.equal(r.smtpProtected, 1); const after = await read();
    for (const row of after.rows) { const secret = ['FORTIGATE', 'FORTIANALYZER'].includes(row.type) ? 'password' : field(row.type);
      assert.match(row.config[secret], /^enc:v1:i:/); assert.equal(f.crypto.unprotectIntegrationConfig(row.config, row.type)[secret], input(row.type)[secret]);
      assert.equal(row.enabled, false); assert.equal(row.createdAt.toISOString(), before.rows.find(r => r.id === row.id).createdAt.toISOString()); }
    assert.equal(f.crypto.unprotectIntegrationConfig(after.email.config, 'SMTP').smtpPass, plain('SMTP').smtpPass);
    const stable = await snapshot(); assert.equal((await f.migrate({ includeNms: false })).protected, 0); assert.equal(await snapshot(), stable);
  });
  await check('session upgrade and explicit rotation survive removal of the previous key', async () => {
    const f = fixture(prisma); delete f.env.INTEGRATION_CREDENTIALS_KEY; f.env.NEXTAUTH_SECRET = 'fixture-session';
    await f.migrate({ includeNms: false }); f.env.INTEGRATION_CREDENTIALS_KEY = key(13); await f.migrate({ includeNms: false });
    f.env.INTEGRATION_CREDENTIALS_KEY = key(14); f.env.INTEGRATION_CREDENTIALS_PREVIOUS_KEY = key(13);
    await f.migrate({ rotate: true, includeNms: false }); delete f.env.INTEGRATION_CREDENTIALS_PREVIOUS_KEY;
    const data = await read(); for (const row of data.rows) f.crypto.unprotectIntegrationConfig(row.config, row.type);
    assert.equal(f.crypto.unprotectIntegrationConfig(data.email.config, 'SMTP').smtpPass, plain('SMTP').smtpPass);
  });
  await check('wrong SMTP key aborts before any integration write', async () => {
    const f = fixture(prisma); await prisma.notificationConfig.update({ where: { id: 'credential-fixture-email' },
      data: { config: f.crypto.protectIntegrationConfig(plain('SMTP'), 'SMTP', { INTEGRATION_CREDENTIALS_KEY: key(14) }) } });
    const before = await snapshot(); await assert.rejects(f.migrate({ includeNms: false })); assert.equal(await snapshot(), before);
  });
  for (const scope of ['integration', 'email']) await check(`concurrent ${scope} save is retained and migration rolls back`, async () => {
    let raced = false;
    const database = { $transaction: (callback, options) => prisma.$transaction(tx => callback({
      integrationConfig: {
        findMany: args => tx.integrationConfig.findMany(args),
        updateMany: async args => {
          if (!raced && scope === 'integration') { raced = true; await prisma.integrationConfig.update({ where: { id: args.where.id },
            data: { config: { ...input('VMWARE_VCENTER'), password: 'fixture-concurrent-save' } } }); }
          return tx.integrationConfig.updateMany(args);
        },
      },
      notificationConfig: {
        findUnique: args => tx.notificationConfig.findUnique(args),
        updateMany: async args => {
          if (scope === 'email') { raced = true; await prisma.notificationConfig.update({ where: { id: 'credential-fixture-email' },
            data: { config: { ...plain('SMTP'), smtpPass: 'fixture-concurrent-save' } } }); }
          return tx.notificationConfig.updateMany(args);
        },
      },
    }), options) };
    const f = fixture(database); await assert.rejects(f.migrate({ includeNms: false }), /concurrent/); assert.equal(raced, true);
    const after = await read();
    assert.ok(after.rows.every(r => !JSON.stringify(r.config).includes('enc:v1:')));
    if (scope === 'integration') assert.ok(after.rows.some(r => r.config.password === 'fixture-concurrent-save'));
    else assert.equal(after.email.config.smtpPass, 'fixture-concurrent-save');
  });
  await check('real migration/rotation CLI uses the same protected records', async () => {
    const f = fixture(prisma);
    const cli = (migrate, env) => {
      const code = `require('ts-node').register({compilerOptions:{module:'CommonJS'}});${migrate ? "process.argv.push('--migrate');" : ''}require('./scripts/security/rotate-integration-credentials.ts');`;
      const result = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 30000 });
      assert.equal(result.status, 0, result.stderr); return result.stdout;
    };
    assert.match(cli(true, { INTEGRATION_CREDENTIALS_KEY: key(13) }), /Migrated 4 integration and 1 SMTP/);
    const before = await snapshot(); assert.match(cli(true, { INTEGRATION_CREDENTIALS_KEY: key(13) }), /Migrated 0 integration and 0 SMTP/);
    assert.equal(await snapshot(), before);
    assert.match(cli(false, { INTEGRATION_CREDENTIALS_KEY: key(14), INTEGRATION_CREDENTIALS_PREVIOUS_KEY: key(13) }), /Rotated 4 integration and 1 SMTP/);
    f.env.INTEGRATION_CREDENTIALS_KEY = key(14);
    for (const row of (await read()).rows) f.crypto.unprotectIntegrationConfig(row.config, row.type);
    assert.equal(f.crypto.unprotectIntegrationConfig((await read()).email.config, 'SMTP').smtpPass, plain('SMTP').smtpPass);
  });
  console.log(`Credential migration PostgreSQL regressions passed (${checks} scenarios).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
