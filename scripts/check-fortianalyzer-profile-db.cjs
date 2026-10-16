// Opt-in disposable PostgreSQL; real settings/crypto/cache queries, synthetic FA transport and connector identity.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_FA_PROFILE_DB_TEST !== '1' || url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1'
  || !/^\/[a-z0-9_]+_occurrence_tests$/.test(url.pathname)) throw new Error('Explicit opt-in and a local disposable *_occurrence_tests DB are required');
const { PrismaClient } = require('@prisma/client');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
const nonce = randomUUID(), calls = [], quiet = new Proxy({}, { get: () => () => {} });
const env = { INTEGRATION_CREDENTIALS_KEY: Buffer.alloc(32, 31).toString('base64') };
const plain = { host: 'fa.fixture.invalid', adom: 'Tenant_A', authMode: 'api-key', apiKey: 'fixture-key' };
const connector = { id: 'fixture-connector', analyzerDeviceId: 'FIXTURE', deviceId: 'fixture-device', vdom: 'root' };
const database = { integrationConfig: prisma.integrationConfig, cachedEvent: prisma.cachedEvent,
  notificationConfig: prisma.notificationConfig, $transaction: prisma.$transaction.bind(prisma),
  firewallConnector: { findUnique: async () => connector } };
const load = moduleLoader({
  'next/server': { NextRequest, NextResponse }, zod: require('zod'), '@/lib/prisma': { prisma: database },
  '@/lib/logger': { createLogger: () => quiet },
  '@/lib/auth/api-permission': { authorizeApiRequest: async () => ({ allowed: true }) },
  '@/lib/validators': { validateBody: (input, schema) => { const r = schema.safeParse(input); return r.success ? { success: true, data: r.data } : { success: false, error: 'Fixture validation failed' }; } },
  '@/lib/firewall/capability-store': { persistFirewallCapability: async () => {} },
  '@/lib/security/tls': { secureFetch: async (_source, _url, options) => {
    const body = JSON.parse(options.body); calls.push({ body, headers: options.headers });
    assert.equal(options.headers.Authorization, `Bearer ${plain.apiKey}`); assert.equal(body.session, undefined);
    assert.equal(body.params[0].url, '/dvmdb/adom/Tenant_A/device');
    return { ok: true, status: 200, json: async () => ({ result: [{ status: { code: 0 }, data: [] }] }) };
  } },
}, { process: { env }, console: quiet, AbortController, AbortSignal, setTimeout, clearTimeout });
const route = load('app/api/integrations/fortianalyzer/route.ts');
const crypto = load('lib/security/integration-credentials.ts');
const revision = load('lib/integrations/fortianalyzer-revision.ts').fortiAnalyzerRevision;
const request = config => new NextRequest('http://fixture.invalid/api/integrations/fortianalyzer', { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-config', config }) });
const saved = () => prisma.integrationConfig.findUnique({ where: { type_name: { type: 'FORTIANALYZER', name: 'FortiAnalyzer' } } });
let count = 0;
async function check(name, run) { await run(); count++; console.log(`PASS PostgreSQL: ${name}`); }
async function main() {
  // This suite needs an empty fixture schema; refuse rather than touching someone else's records.
  assert.equal(await prisma.integrationConfig.count(), 0, 'Empty disposable integration store required');
  await check('actual save canonicalizes and encrypts API-key aliases, redacts reads and retains blank edits', async () => {
    assert.equal((await (await route.POST(request({ ...plain, apiKey: undefined, accessToken: plain.apiKey }))).json()).success, true);
    const row = await saved(); assert.match(row.config.apiKey, /^enc:v1:i:/); assert.equal(row.config.accessToken, undefined);
    assert.equal(crypto.unprotectIntegrationConfig(row.config, 'FORTIANALYZER').apiKey, plain.apiKey);
    assert.equal((await (await route.POST(request({ ...plain, apiKey: '********' }))).json()).success, true);
    const read = await (await route.GET(new NextRequest('http://fixture.invalid/api/integrations/fortianalyzer?type=config'))).json();
    assert.equal(read.config.adom, 'Tenant_A'); assert.equal(read.config.apiKeySet, true);
    assert.ok(!JSON.stringify(read).includes(plain.apiKey)); assert.ok(!JSON.stringify(read).includes('enc:v1:'));
  });
  await check('plaintext legacy accessToken migrates once and resolves the selected ADOM', async () => {
    const row = await saved(); await prisma.integrationConfig.update({ where: { id: row.id }, data: {
      config: { host: plain.host, adom: plain.adom, accessToken: plain.apiKey }, enabled: false } });
    const migrate = load('lib/security/integration-credential-migration.ts').migrateIntegrationCredentials;
    assert.equal((await migrate({ includeNms: false })).protected, 1);
    const migrated = await saved(); assert.match(migrated.config.accessToken, /^enc:v1:i:/); assert.equal(migrated.enabled, false);
    assert.equal((await migrate({ includeNms: false })).protected, 0);
    await prisma.integrationConfig.update({ where: { id: row.id }, data: { enabled: true } });
    const profile = load('lib/integrations/fortianalyzer-source.ts').readFortiAnalyzerProfile(migrated.config);
    assert.equal(profile.adom, 'Tenant_A'); assert.equal(profile.authMode, 'api-key');
    assert.equal(await load('lib/integrations/fortianalyzer.ts').default.testConnection(profile), true); assert.equal(calls.length, 1);
  });
  await check('ADOM revisions isolate identical native event IDs in actual Prisma/JSONB cache queries', async () => {
    const row = await saved(), aRevision = revision(row), bRevision = revision({ ...row, config: { ...row.config, adom: 'Tenant_B' } });
    assert.notEqual(aRevision, bRevision);
    const Cache = load('lib/alarms/event-cache.ts').EventCacheService;
    const a = new Cache({}, { revision: aRevision }), b = new Cache({}, { revision: bRevision });
    const now = new Date(), native = { logid: nonce, eventtime: (BigInt(now.getTime()) * 1000000n).toString(),
      devid: 'FIXTURE', vd: 'root', type: 'event', subtype: 'system', action: 'edit' };
    await a.saveEvents('event', [{ ...native, msg: 'Tenant_A' }]); await b.saveEvents('event', [{ ...native, msg: 'Tenant_B' }]);
    assert.equal(await prisma.cachedEvent.count({ where: { logId: { contains: nonce } } }), 2);
    const rows = await b.queryCachedEvents({ logtype: 'event', startTime: new Date(0), endTime: new Date(Date.now() + 60000) });
    assert.equal(rows.length, 1); assert.equal(rows[0].msg, 'Tenant_B');
  });
  await check('firewall event page and count use the selected analyzer revision', async () => {
    const events = load('lib/firewall/fortianalyzer-events.ts');
    const result = await events.readFirewallAnalyzerEvents({ connectorId: connector.id, category: 'config', requestUrl: 'http://fixture.invalid/events' });
    assert.equal(result.envelope.source, 'event-cache');
    assert.equal(result.envelope.data.pagination.total, 1); assert.equal(result.envelope.data.items.length, 1);
    assert.equal(result.envelope.data.items[0].message, 'Tenant_A');
  });
  await check('wrong encryption key prevents credential resolution without source I/O', async () => {
    const row = await saved(); env.INTEGRATION_CREDENTIALS_KEY = Buffer.alloc(32, 32).toString('base64');
    const before = calls.length; assert.throws(() => load('lib/integrations/fortianalyzer-source.ts').readFortiAnalyzerProfile(row.config));
    assert.equal(calls.length, before);
  });
  console.log(`FortiAnalyzer profile PostgreSQL regressions passed (${count} scenarios).`);
}
let ownsStore = false;
prisma.integrationConfig.count().then(async count => {
  assert.equal(count, 0, 'Empty disposable integration store required'); ownsStore = true; await main();
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (ownsStore) await prisma.integrationConfig.deleteMany({ where: { type: 'FORTIANALYZER', name: 'FortiAnalyzer' } });
  await prisma.cachedEvent.deleteMany({ where: { logId: { contains: nonce } } }); await prisma.$disconnect();
});
