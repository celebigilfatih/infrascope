import { expect, type Page, type Route, type TestInfo } from '@playwright/test';
import { test as base, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { protectIntegrationConfig, unprotectIntegrationConfig } from '../../lib/security/integration-credentials';

const secret = ' synthetic-fortigate-password!9 ', ca = 'synthetic-ca-material';
const modules = { interfaces: true, vlans: true, policies: true, addresses: true, vips: true, sdwan: true };
const test = base.extend<{ targets: { a: { id: string; configId: string; deviceId: string; name: string; host: string; vdom: string }; b: { id: string; configId: string; deviceId: string; name: string; host: string; vdom: string }; prefix: string } }>({
  targets: async ({ prisma, fixtures }, use) => {
    const prefix = fixtures.manifest.prefix;
    const create = async (suffix: string, vdom: string) => {
      const name = prefix + ' FortiGate ' + suffix, host = 'fg-' + suffix.toLowerCase() + '.example.invalid';
      const device = await prisma.device.create({ data: { name, type: 'FIREWALL', tags: [], pollingEnabled: false, nmsDeviceId: 1000000000 + Math.floor(Math.random() * 500000000) } });
      const integration = await prisma.integrationConfig.create({ data: { type: 'FORTIGATE', name, enabled: false, syncInterval: 1440, lastSyncAt: new Date(), lastSyncStatus: 'connected', config: protectIntegrationConfig({ host, vdom, deviceId: device.id, username: 'fixture-reader', password: secret, accessToken: '', syncMode: 'rest', pollingInterval: 1440, snmp: { version: '2c', community: 'synthetic-community' }, tlsCaPem: ca, enabledModules: modules }, 'FORTIGATE') } });
      const connector = await prisma.firewallConnector.create({ data: { integrationConfigId: integration.id, deviceId: device.id, managementHost: host, vdom, analyzerDeviceId: 'FG-QA-' + suffix, serialNumber: 'QA-' + suffix, identityStatus: 'VERIFIED', monitoringMode: 'LIMITED', capabilities: [{ source: 'fortigate-rest', status: 'unavailable', checkedAt: '2026-10-17T12:00:00Z', errorCode: 'TLS_CERTIFICATE_UNTRUSTED' }] } });
      return { id: connector.id, configId: integration.id, deviceId: device.id, name, host, vdom };
    };
    try {
      const a = await create('A', 'root'), b = await create('B', 'Branch');
      await prisma.integrationSyncLog.create({ data: { configId: a.configId, status: 'failed', itemsProcessed: 0, errorDetails: { errorCount: 2, privateDetail: 'not exposed' }, startedAt: new Date('2026-10-17T12:00:00Z'), completedAt: new Date('2026-10-17T12:00:03Z') } });
      await use({ a, b, prefix });
    } finally { await prisma.integrationConfig.deleteMany({ where: { type: 'FORTIGATE', name: { startsWith: prefix } } }); await prisma.device.deleteMany({ where: { type: 'FIREWALL', name: { startsWith: prefix } } }); }
  },
});
type Target = { id: string; configId: string; deviceId: string; name: string; host: string; vdom: string };
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
async function open(page: Page, fixtures: Fixtures, path = '/integrations/firewall') { await installTestSession(page.context(), fixtures, 'ADMIN'); await page.goto(path); await expect(button(page, path === '/integrations/firewall' ? 'Bilgileri yenile' : 'Verileri yenile')).toBeEnabled(); }
async function manage(page: Page, target: Target) { await button(page, target.name + ' bağlantısını yönet').click(); const dialog = page.getByRole('dialog', { name: 'FortiGate bağlantısını yönet', exact: true }); await expect(dialog.getByLabel('Envanter senkronizasyon aralığı (dakika) *', { exact: true })).toBeVisible(); return dialog; }
async function save(page: Page) { const dialog = page.getByRole('dialog', { name: 'FortiGate bağlantısını yönet', exact: true }); await dialog.getByRole('button', { name: 'Ayarları kaydet', exact: true }).click(); await expect(dialog.getByRole('status')).toContainText('Ayarlar kaydedildi'); await expect(dialog.getByRole('button', { name: 'Bilgileri yenile', exact: true })).toBeEnabled(); }
async function capture(page: Page, info: TestInfo, name: string) { await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' }); }
const draft = (interval = '30') => ({ authMode: 'password', username: 'fixture-reader', password: '', token: '', interval, enabled: false, syncMode: 'rest', modules: { interfaces: true, vlans: true, policies: true, addresses: true } });
const envelope = (target: Target, data: unknown, extra = {}) => ({ success: true, target: { connectorId: target.id, configId: target.configId, deviceId: target.deviceId, vdom: target.vdom }, status: 'available', source: 'fortigate-rest', collectedAt: '2026-10-17T12:00:00Z', data, ...extra });
async function syntheticTargets(page: Page, a: Target, b: Target) { const response = await page.request.get('/api/firewalls'); const value = await response.json(); for (const row of value.data) { row.enabled = true; if (row.id === a.id) row.identity.analyzerDeviceId = 'FG-QA-A'; if (row.id === b.id) row.identity.analyzerDeviceId = 'FG-QA-B'; } await page.route('**/api/firewalls', route => route.request().method() === 'GET' ? json(route, value) : route.continue()); }

test('FortiGate settings: private metadata keeps probes and inventory history separate', async ({ page, fixtures, targets, prisma }, info) => {
  const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } }); const writes: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/firewalls') && request.method() !== 'GET') writes.push(request.method()); });
  await open(page, fixtures); const response = await page.request.get('/api/firewalls'); expect(response.headers()['cache-control']).toBe('private, no-store'); const data = await response.json();
  for (const hidden of [secret, ca, 'enc:v1:']) expect(JSON.stringify(data)).not.toContain(hidden);
  const dialog = await manage(page, targets.a); await expect(dialog.getByLabel('Yeni parola', { exact: true })).toHaveValue('');
  const metadata = await page.request.get('/api/firewalls/workspace?configId=' + targets.a.configId + '&vdom=root'); expect(metadata.headers()['cache-control']).toBe('private, no-store');
  for (const hidden of [secret, ca, 'enc:v1:', 'not exposed']) expect(await metadata.text()).not.toContain(hidden);
  await dialog.getByRole('tab', { name: 'Senkronizasyon', exact: true }).click(); await expect(dialog).toContainText('Profilin son denemesi: Başarısız'); await expect(dialog.getByRole('definition').first()).toHaveText('0');
  expect(writes).toEqual([]); expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } })).toEqual(before); await dialog.getByRole('button', { name: 'Kapat', exact: true }).click(); await capture(page, info, 'fortigate-list-desktop');
});

test('FortiGate settings: versioned save preserves identity, encrypted secrets, hidden modules and other targets', async ({ page, fixtures, targets, prisma }) => {
  await open(page, fixtures); const before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } }), other = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.b.configId } }); const dialog = await manage(page, targets.a);
  await dialog.getByLabel('Envanter senkronizasyon aralığı (dakika) *', { exact: true }).fill('30'); await expect(dialog.getByRole('button', { name: 'Bilgileri yenile', exact: true })).toBeDisabled(); await save(page);
  const saved = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } }); expect(saved).toMatchObject({ name: before.name, enabled: false, syncInterval: 30 }); const plain = unprotectIntegrationConfig<Record<string, unknown>>(saved.config, 'FORTIGATE'); expect(plain).toMatchObject({ host: targets.a.host, vdom: 'root', password: secret, tlsCaPem: ca, enabledModules: modules, snmp: { community: 'synthetic-community' } }); expect(JSON.stringify(saved.config)).not.toContain(secret); expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.b.configId } })).toEqual(other);
});

test('FortiGate settings: concurrent writes and a changed management host reject stale drafts', async ({ page, fixtures, targets, prisma }) => {
  await open(page, fixtures); const dialog = await manage(page, targets.a), before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } });
  const body = { action: 'save', configId: targets.a.configId, vdom: 'root', host: targets.a.host, expectedUpdatedAt: before.updatedAt.toISOString(), draft: draft() };
  const replies = await Promise.all([page.request.post('/api/firewalls/workspace', { data: body }), page.request.post('/api/firewalls/workspace', { data: { ...body, draft: draft('45') } })]); expect(replies.map(reply => reply.status()).sort()).toEqual([200, 409]);
  const saved = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } }); await dialog.getByLabel('Envanter senkronizasyon aralığı (dakika) *', { exact: true }).fill('60'); await dialog.getByRole('button', { name: 'Ayarları kaydet', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('başka bir işlemde değişti'); expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } })).toEqual(saved);
  const host = 'moved.example.invalid'; await prisma.firewallConnector.update({ where: { id: targets.a.id }, data: { managementHost: host } }); expect((await page.request.post('/api/firewalls/workspace', { data: { ...body, expectedUpdatedAt: saved.updatedAt.toISOString() } })).status()).toBe(409); expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } })).toEqual(saved);
});

test('FortiGate settings: auth method changes clear form secrets and inactive stored credentials', async ({ page, fixtures, targets, prisma }) => {
  await open(page, fixtures); const dialog = await manage(page, targets.a); await dialog.getByLabel('Yeni parola', { exact: true }).fill('discard-on-mode-change'); await dialog.getByLabel('REST kimlik doğrulama yöntemi', { exact: true }).selectOption('token'); await dialog.getByLabel('API erişim anahtarı *', { exact: true }).fill('new-fixture-token'); await dialog.getByLabel('REST kimlik doğrulama yöntemi', { exact: true }).selectOption('password'); await expect(dialog.getByLabel('Yeni parola', { exact: true })).toHaveValue(''); await dialog.getByLabel('REST kimlik doğrulama yöntemi', { exact: true }).selectOption('token'); await expect(dialog.getByLabel('API erişim anahtarı *', { exact: true })).toHaveValue(''); await dialog.getByLabel('API erişim anahtarı *', { exact: true }).fill('new-fixture-token'); await save(page);
  let saved = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } }), plain = unprotectIntegrationConfig<Record<string, unknown>>(saved.config, 'FORTIGATE'); expect(plain).toMatchObject({ accessToken: 'new-fixture-token', password: '', username: '' });
  await dialog.getByLabel('REST kimlik doğrulama yöntemi', { exact: true }).selectOption('password'); await dialog.getByLabel('Kullanıcı adı *', { exact: true }).fill('new-reader'); await dialog.getByLabel('Parola *', { exact: true }).fill(' next-fixture-password '); await save(page); saved = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } }); plain = unprotectIntegrationConfig(saved.config, 'FORTIGATE'); expect(plain).toMatchObject({ username: 'new-reader', password: ' next-fixture-password ', accessToken: '' });
});

test('FortiGate settings: SNMP-only import disables unsupported flags without losing SNMP/CA metadata', async ({ page, fixtures, targets, prisma }) => {
  await open(page, fixtures); const dialog = await manage(page, targets.a); await dialog.getByLabel('Envanter veri toplama yöntemi', { exact: true }).selectOption('snmp'); await save(page); const row = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } }); expect(unprotectIntegrationConfig(row.config, 'FORTIGATE')).toMatchObject({ syncMode: 'snmp', tlsCaPem: ca, snmp: { community: 'synthetic-community' }, enabledModules: { interfaces: true, vlans: false, policies: false, addresses: false, vips: false, sdwan: false } });
});

for (const denial of ['editor', 'viewer', 'inactive', 'suspended', 'expired', 'missing'] as const) {
  test('FortiGate settings: current ' + denial + ' identity blocks writes and stale-account source reads', async ({ page, context, fixtures, targets, prisma }) => {
    await open(page, fixtures); const dialog = await manage(page, targets.a), before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } }); await dialog.getByLabel('Envanter senkronizasyon aralığı (dakika) *', { exact: true }).fill('60');
    try {
      await installTestSession(context, fixtures, 'ADMIN', denial === 'expired'); if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
      else if (denial === 'editor' || denial === 'viewer') await prisma.user.update({ where: { id: fixtures.userId }, data: { role: denial === 'editor' ? 'EDITOR' : 'VIEWER' } });
      else if (denial === 'inactive' || denial === 'suspended') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: denial === 'inactive' ? 'INACTIVE' : 'SUSPENDED' } });
      const status = denial === 'editor' || denial === 'viewer' ? 403 : 401; await dialog.getByRole('button', { name: 'Ayarları kaydet', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText(status === 401 ? 'Oturum' : 'yetkiniz');
      for (const action of ['save', 'test-saved', 'test-draft']) expect((await page.request.post('/api/firewalls/workspace', { data: { action, configId: targets.a.configId, vdom: 'root', draft: draft() } })).status()).toBe(status);
      expect((await page.request.post('/api/firewalls', { data: '{', headers: { 'Content-Type': 'application/json' } })).status()).toBe(status);
      expect((await page.request.post('/api/integrations/fortigate', { data: { action: 'sync', configId: targets.a.configId, vdom: 'root' } })).status()).toBe(status);
      expect((await page.request.get('/api/firewalls')).status()).toBe(status === 403 ? 200 : 401);
      if (status === 401) for (const path of ['status', 'virtual-ips', 'events', 'snmp/health', 'vpn/ssl-sessions']) expect((await page.request.get('/api/firewalls/nonexistent/' + path)).status()).toBe(401);
      expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
    } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); await installTestSession(context, fixtures, 'ADMIN'); }
    await save(page); expect((await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } })).syncInterval).toBe(60);
  });
}

test('FortiGate tests: stored/draft credentials stay separate and evidence tracks host, VDOM and time', async ({ page, fixtures, targets, prisma }) => {
  await open(page, fixtures); const dialog = await manage(page, targets.a), before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } }), calls: Record<string, unknown>[] = [];
  await page.route('**/api/firewalls/workspace', route => { const data = route.request().postDataJSON(); calls.push(data); return json(route, { success: true, configId: targets.a.configId, vdom: 'root', host: targets.a.host, connected: true, version: 'QA', testedAt: '2026-10-17T12:00:00Z' }); });
  await dialog.getByRole('tab', { name: 'Bağlantı testi', exact: true }).click(); await dialog.getByRole('button', { name: 'Kayıtlı bağlantıyı test et', exact: true }).click(); await expect(dialog).toContainText('FortiGate REST sistem durumu test sırasında okunabildi.'); expect(calls[0]).toEqual({ action: 'test-saved', configId: targets.a.configId, vdom: 'root', host: targets.a.host });
  await dialog.getByRole('button', { name: 'Formdaki bilgilerle test et', exact: true }).click(); expect(calls).toHaveLength(1); await dialog.getByRole('tab', { name: 'Bağlantı', exact: true }).click(); await dialog.getByLabel('Yeni parola', { exact: true }).fill('entered-only-fixture'); await dialog.getByRole('tab', { name: 'Bağlantı testi', exact: true }).click(); await dialog.getByRole('button', { name: 'Formdaki bilgilerle test et', exact: true }).click(); await expect(dialog).toContainText('Formdaki erişim bilgileri'); expect(calls[1]).toMatchObject({ action: 'test-draft', draft: { password: 'entered-only-fixture' } }); expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } })).toEqual(before);
});

for (const outcome of ['wrong-host', 'failed'] as const) {
  test('FortiGate tests: ' + outcome + ' cannot imply connection success', async ({ page, fixtures, targets }) => {
    await open(page, fixtures); const dialog = await manage(page, targets.a); await page.route('**/api/firewalls/workspace', route => json(route, { success: true, configId: targets.a.configId, vdom: 'root', host: outcome === 'wrong-host' ? 'wrong.invalid' : targets.a.host, connected: outcome !== 'failed', errorCode: 'TLS_CERTIFICATE_UNTRUSTED', testedAt: '2026-10-17T12:00:00Z', error: 'private-provider-message' }));
    await dialog.getByRole('tab', { name: 'Bağlantı testi', exact: true }).click(); await dialog.getByRole('button', { name: 'Kayıtlı bağlantıyı test et', exact: true }).click(); await expect(dialog).toContainText(outcome === 'wrong-host' ? 'Bağlantı testi hedefi doğrulanamadı.' : 'sertifikası güvenilir bulunmadı'); await expect(dialog.getByText('private-provider-message', { exact: true })).toHaveCount(0);
  });
}

for (const outcome of ['server', 'wrong-target'] as const) {
  test('FortiGate settings: uncertain ' + outcome + ' reply blocks retries until refresh', async ({ page, fixtures, targets, prisma }) => {
    await open(page, fixtures); const dialog = await manage(page, targets.a), before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } }); await dialog.getByLabel('Envanter senkronizasyon aralığı (dakika) *', { exact: true }).fill('30'); await page.route('**/api/firewalls/workspace', route => route.request().method() === 'GET' ? route.continue() : json(route, { success: true, configId: targets.b.configId, vdom: 'root', host: targets.a.host }, outcome === 'server' ? 500 : 200));
    await dialog.getByRole('button', { name: 'Ayarları kaydet', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('sonucu doğrulanamadı'); await expect(dialog.getByRole('button', { name: 'Ayarları kaydet', exact: true })).toBeDisabled(); await page.unroute('**/api/firewalls/workspace'); await dialog.getByRole('button', { name: 'Kayıtlı bilgileri yeniden oku', exact: true }).click(); await expect(dialog.getByLabel('Envanter senkronizasyon aralığı (dakika) *', { exact: true })).toHaveValue('1440'); expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } })).toEqual(before);
  });
}

for (const outcome of ['partial', 'wrong-target', 'server'] as const) {
  test('FortiGate sync: ' + outcome + ' response remains scoped and explicit', async ({ page, fixtures, targets, prisma }) => {
    await open(page, fixtures); const raw = await (await page.request.get('/api/firewalls/workspace?configId=' + targets.a.configId + '&vdom=root')).json(); raw.data.enabled = true; await page.route('**/api/firewalls/workspace?*', route => json(route, raw)); const dialog = await manage(page, targets.a), calls: unknown[] = []; const before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } });
    await page.route('**/api/integrations/fortigate', route => { calls.push(route.request().postDataJSON()); return json(route, { success: false, status: 'partial', target: { configId: outcome === 'wrong-target' ? targets.b.configId : targets.a.configId, vdom: 'root' }, itemsProcessed: 1, errorCount: 1 }, outcome === 'server' ? 500 : 200); });
    await dialog.getByRole('tab', { name: 'Senkronizasyon', exact: true }).click(); await dialog.getByRole('button', { name: 'Kayıtlı ayarlarla senkronize et', exact: true }).click(); if (outcome === 'partial') await expect(dialog.getByRole('status')).toContainText('kısmen tamamlandı'); else { await expect(dialog.getByRole('alert')).toContainText('sonucu doğrulanamadı'); await expect(dialog.getByRole('button', { name: 'Kayıtlı ayarlarla senkronize et', exact: true })).toBeDisabled(); } expect(calls).toEqual([{ action: 'sync', configId: targets.a.configId, vdom: 'root' }]); expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.a.configId } })).toEqual(before);
  });
}

test('FortiGate settings: failed metadata refresh preserves stale values and disables mutations', async ({ page, fixtures, targets }) => {
  await open(page, fixtures); const dialog = await manage(page, targets.a); await page.route('**/api/firewalls/workspace?*', route => json(route, { success: false }, 503)); await dialog.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('Önceki ayarlar korunuyor'); await expect(dialog.getByLabel('Kullanıcı adı *', { exact: true })).toHaveValue('fixture-reader'); await expect(dialog.getByRole('button', { name: 'Ayarları kaydet', exact: true })).toBeDisabled();
});

test('FortiGate onboarding: validation and uncertain creation prevent duplicate submission', async ({ page, fixtures, targets, prisma }) => {
  await open(page, fixtures); const before = await prisma.integrationConfig.count(); await button(page, 'FortiGate ekle').click(); const dialog = page.getByRole('dialog', { name: 'FortiGate ekle', exact: true }); await dialog.getByRole('button', { name: /Kaydet/ }).click(); await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByLabel('Cihaz adı', { exact: true }).fill('Synthetic new firewall'); await dialog.getByLabel('Yönetim IP adresi / sunucu adı', { exact: true }).fill('new.example.invalid'); await dialog.getByLabel('Kullanıcı adı', { exact: true }).fill('reader'); await dialog.getByLabel('Parola', { exact: true }).fill('new-synthetic-secret'); const calls: unknown[] = []; await page.route('**/api/firewalls', route => { calls.push(route.request().postDataJSON()); return json(route, { success: true }, 500); }); await dialog.getByRole('button', { name: /Kaydet/ }).click(); await expect(dialog).toContainText('sonucu doğrulanamadı'); await expect(dialog.getByRole('button', { name: /Kaydet/ })).toBeDisabled(); expect(calls).toHaveLength(1); expect(await prisma.integrationConfig.count()).toBe(before); expect(await prisma.firewallConnector.count({ where: { id: targets.a.id } })).toBe(1);
});

test('FortiGate removal: selected private connector removal preserves both inventory devices and the other profile', async ({ page, fixtures, targets, prisma }) => {
  await open(page, fixtures); const other = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.b.configId } }); const response = await page.request.delete('/api/firewalls/' + targets.a.id); expect(response.status()).toBe(200); expect(await prisma.firewallConnector.findUnique({ where: { id: targets.a.id } })).toBeNull(); expect(await prisma.device.count({ where: { id: { in: [targets.a.deviceId, targets.b.deviceId] } } })).toBe(2); expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: targets.b.configId } })).toEqual(other);
});

async function sourceFixtures(page: Page, a: Target, b: Target, canRead = true) {
  await syntheticTargets(page, a, b);
  const state = { fail: false, wrong: false, contentReads: [] as string[], resources: [] as string[] };
  await page.route(new RegExp('/api/firewalls/(' + a.id + '|' + b.id + ')/'), route => {
    const url = new URL(route.request().url()), target = url.pathname.includes(a.id) ? a : b, suffix = target.id === a.id ? 'A' : 'B'; state.resources.push(url.pathname + url.search);
    if (state.fail) return json(route, { success: false }, 500);
    let data: unknown; let extra: Record<string, unknown> = {};
    if (url.pathname.endsWith('/status')) data = { connected: true, hostname: 'QA-' + suffix, cpu: suffix === 'A' ? 0 : 50, session: { current: 0 } };
    else if (url.pathname.endsWith('/virtual-ips')) {
      const item = { name: 'QA VIP ' + suffix, comment: null, type: 'static-nat', external: '192.0.2.10', internal: ['198.51.100.10'], interface: 'wan1', externalPort: '443', internalPort: '8443', protocol: 'tcp', portForward: true, enabled: null, usage: 'unknown', policies: [] };
      const items = url.searchParams.get('search')?.includes('missing') ? [] : [item];
      data = { items, pagination: { page: 1, limit: 10, total: items.length, hasMore: false }, summary: { total: 1, portForward: 1, referenced: null, unknownState: 1 }, interfaces: ['wan1'], usageAvailable: false, usageErrorCode: 'UNSUPPORTED_OPERATION', usageAt: null };
    } else if (url.pathname.endsWith('/events')) { data = { items: [{ id: 'event-' + suffix, category: 'config', deviceId: 'FG-QA-' + suffix, vdom: target.vdom, occurredAt: '2026-10-17T12:00:00Z', action: 'edit', user: 'QA operator', message: 'QA config ' + suffix, configPath: 'system.global' }], pagination: { page: 1, limit: 100, total: 1, hasMore: false } }; extra = { source: 'event-cache', target: { connectorId: target.id, configId: target.configId, deviceId: target.deviceId, analyzerDeviceId: 'FG-QA-' + suffix, vdom: target.vdom } }; }
    else data = { items: [], pagination: { page: 1, limit: 10, total: 0, hasMore: false } };
    return json(route, envelope(target, data, { ...extra, ...(state.wrong ? { target: { connectorId: 'wrong', deviceId: target.deviceId, configId: target.configId, vdom: target.vdom } } : {}) }));
  });
  await page.route(new RegExp('/api/integrations/nms/devices/(' + a.deviceId + '|' + b.deviceId + ')/backups'), route => {
    const url = new URL(route.request().url()), target = url.pathname.includes(a.deviceId) ? a : b, suffix = target.id === a.id ? 'a' : 'b';
    if (!url.pathname.endsWith('/backups')) { const id = url.pathname.split('/').pop()!; state.contentReads.push(id); return json(route, { success: true, id, backupType: 'Running Config', checksum: 'synthetic-checksum', configuration: id.startsWith('old') ? 'set mode old\nend\n' : 'set mode new\nend\n' }); }
    return json(route, { backups: ['old', 'new'].map((id, index) => ({ id: id + '-' + suffix, backupType: 'Running Config', backupFile: id + '-' + suffix + '.cfg', createdAt: index ? '2026-10-17T12:00:00Z' : '2026-10-16T12:00:00Z', sizeBytes: '40', checksum: 'synthetic-checksum' })), permissions: { create: canRead, delete: false } });
  });
  return state;
}

test('FortiGate overview: explicit selection, real zero vs unknown, stale data and target switching', async ({ page, fixtures, targets }, info) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); const state = await sourceFixtures(page, targets.a, targets.b); await open(page, fixtures, '/network/firewall'); expect(state.resources).toEqual([]);
  await page.getByLabel('Görüntülenecek cihaz ve VDOM', { exact: true }).selectOption(targets.a.id); await expect(page.getByRole('meter', { name: 'CPU kullanımı', exact: true })).toHaveAttribute('aria-valuenow', '0'); await expect(page.getByRole('meter', { name: 'Bellek kullanımı', exact: true })).toHaveCount(0); await expect(page.getByText('QA-A', { exact: true })).toBeVisible(); await expect(button(page, 'Verileri yenile')).toBeEnabled(); await capture(page, info, 'fortigate-overview-desktop');
  state.fail = true; await button(page, 'Verileri yenile').click(); await expect(page.getByText(/Önceki/).first()).toBeVisible(); await expect(page.getByText('QA-A', { exact: true })).toBeVisible(); state.fail = false;
  await page.getByLabel('Görüntülenecek cihaz ve VDOM', { exact: true }).selectOption(targets.b.id); await expect(page.getByText('QA-B', { exact: true })).toBeVisible(); await expect(page.getByText('QA-A', { exact: true })).toHaveCount(0); await expect(page.getByRole('meter', { name: 'CPU kullanımı', exact: true })).toHaveAttribute('aria-valuenow', '50');
});

test('FortiGate virtual IPs: unknown policy usage, scoped details, filters and a failed refresh', async ({ page, fixtures, targets }, info) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); const state = await sourceFixtures(page, targets.a, targets.b); await open(page, fixtures, '/security/virtual-ips'); await page.getByLabel('Bağlı güvenlik duvarı ve VDOM', { exact: true }).selectOption(targets.a.id); await expect(page.getByText('QA VIP A', { exact: true }).first()).toBeVisible(); await expect(page.getByText(/Politika eşleşmeleri okunamadı/)).toBeVisible(); await capture(page, info, 'fortigate-virtual-ips-desktop');
  await page.getByLabel('Eşlemelerde ara', { exact: true }).fill('missing'); await expect.poll(() => state.resources.some(url => url.includes('search=missing'))).toBe(true); await expect(page.getByText('QA VIP A', { exact: true })).toHaveCount(0); await page.getByLabel('Eşlemelerde ara', { exact: true }).fill(''); await expect(page.getByText('QA VIP A', { exact: true }).first()).toBeVisible();
  state.fail = true; await button(page, 'Verileri yenile').click(); await expect(page.getByText(/Önceki eşlemeler/)).toBeVisible(); await expect(page.getByText('QA VIP A', { exact: true }).first()).toBeVisible(); state.fail = false;
  await page.getByLabel('Bağlı güvenlik duvarı ve VDOM', { exact: true }).selectOption(targets.b.id); await expect(page.getByText('QA VIP B', { exact: true }).first()).toBeVisible(); await expect(page.getByText('QA VIP A', { exact: true })).toHaveCount(0);
});

test('FortiGate virtual IPs: wrong target data is rejected rather than shown as an empty success', async ({ page, fixtures, targets }) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); const state = await sourceFixtures(page, targets.a, targets.b); state.wrong = true; await open(page, fixtures, '/security/virtual-ips'); await page.getByLabel('Bağlı güvenlik duvarı ve VDOM', { exact: true }).selectOption(targets.a.id); await expect(page.getByText('Seçili cihaz ve VDOM için veri doğrulanamadı.', { exact: true })).toBeVisible(); await expect(page.getByText('QA VIP A', { exact: true })).toHaveCount(0);
});

test('FortiGate config history: scoped events and explicit same-device file comparison', async ({ page, fixtures, targets }, info) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); const state = await sourceFixtures(page, targets.a, targets.b); await open(page, fixtures, '/network/config-revisions'); await page.getByLabel('Cihaz ve VDOM', { exact: true }).selectOption(targets.a.id); await expect(page.getByText('QA config A', { exact: true }).first()).toBeVisible(); expect(state.contentReads).toEqual([]);
  await page.getByRole('tab', { name: 'Sürümler ve karşılaştırma', exact: true }).click(); await page.getByLabel('Eski sürüm', { exact: true }).selectOption('old-a'); await page.getByLabel('Yeni sürüm', { exact: true }).selectOption('new-a'); await button(page, 'Karşılaştır').click(); await expect(page.getByRole('region', { name: 'Sürüm karşılaştırması', exact: true })).toContainText('set mode new'); expect(state.contentReads.sort()).toEqual(['new-a', 'old-a']); await capture(page, info, 'fortigate-config-comparison-desktop');
  await page.getByLabel('Cihaz ve VDOM', { exact: true }).selectOption(targets.b.id); await expect(page.getByText('set mode new', { exact: true })).toHaveCount(0); await page.getByRole('tab', { name: 'Değişiklikler', exact: true }).click(); await expect(page.getByText('QA config B', { exact: true }).first()).toBeVisible();
});

test('FortiGate config history: read-only backup metadata never loads file contents', async ({ page, fixtures, targets, prisma }) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); const state = await sourceFixtures(page, targets.a, targets.b, false); await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
  try { await page.goto('/network/config-revisions'); await page.getByLabel('Cihaz ve VDOM', { exact: true }).selectOption(targets.a.id); await page.getByRole('tab', { name: 'Sürümler ve karşılaştırma', exact: true }).click(); await expect(page.getByText(/içeriğini karşılaştırmak için/)).toBeVisible(); await expect(button(page, 'Karşılaştır')).toHaveCount(0); expect(state.contentReads).toEqual([]); }
  finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); }
});

for (const path of ['/integrations/firewall', '/network/firewall', '/security/virtual-ips', '/network/config-revisions']) {
  test('FortiGate responsive: ' + path + ' light and dark remain within mobile viewport', async ({ page, fixtures, targets }, info) => {
    await page.setViewportSize({ width: 390, height: 844 }); await installTestSession(page.context(), fixtures, 'ADMIN'); if (path !== '/integrations/firewall') await sourceFixtures(page, targets.a, targets.b); await open(page, fixtures, path);
    if (path === '/integrations/firewall') await manage(page, targets.a);
    else { await page.getByLabel(path === '/network/firewall' ? 'Görüntülenecek cihaz ve VDOM' : path === '/security/virtual-ips' ? 'Bağlı güvenlik duvarı ve VDOM' : 'Cihaz ve VDOM', { exact: true }).selectOption(targets.a.id); await expect(page.getByText(path === '/network/firewall' ? 'QA-A' : path === '/security/virtual-ips' ? 'QA VIP A' : 'QA config A', { exact: true }).filter({ visible: true }).first()).toBeVisible(); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); const label = path.split('/').join('-'); await capture(page, info, 'fortigate-mobile-light' + label); await page.evaluate(() => document.documentElement.classList.add('dark')); await capture(page, info, 'fortigate-mobile-dark' + label);
  });
}
