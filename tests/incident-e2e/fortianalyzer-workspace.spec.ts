import { expect, type Page, type Route, type TestInfo } from '@playwright/test';
import { test as base, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { protectIntegrationConfig, unprotectIntegrationConfig } from '../../lib/security/integration-credentials';

const endpoint = '/api/integrations/fortianalyzer/workspace';
const secret = ' synthetic-session-fixture!9 ';
const key = 'synthetic-analyzer-key';
const session = { host: 'faz-a.example.invalid', adom: 'Tenant A', authMode: 'session', username: 'reader', password: secret, pollingInterval: 12, custom: 'retain' };
const test = base.extend<{ profiles: { a: string; b: string; other: string; prefix: string } }>({
  profiles: async ({ prisma, fixtures }, use) => {
    const prefix = fixtures.manifest.prefix;
    try {
      const a = await prisma.integrationConfig.create({ data: { type: 'FORTIANALYZER', name: prefix + ' A', enabled: false, syncInterval: 12, config: protectIntegrationConfig(session, 'FORTIANALYZER') } });
      const b = await prisma.integrationConfig.create({ data: { type: 'FORTIANALYZER', name: prefix + ' B', enabled: false, syncInterval: 20, config: protectIntegrationConfig({ host: 'faz-b.example.invalid', adom: 'root', accessToken: key, custom: 'retain-key', pollingInterval: 20 }, 'FORTIANALYZER') } });
      const other = await prisma.integrationConfig.create({ data: { type: 'ZABBIX', name: prefix + ' Other', enabled: false, config: {} } });
      await use({ a: a.id, b: b.id, other: other.id, prefix });
    } finally { await prisma.integrationConfig.deleteMany({ where: { OR: [{ name: { startsWith: prefix } }, { type: 'FORTIANALYZER', name: 'FortiAnalyzer' }] } }); }
  },
});
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
async function open(page: Page, fixtures: Fixtures, id?: string) {
  await installTestSession(page.context(), fixtures, 'ADMIN');
  await page.goto('/integrations/fortianalyzer');
  await expect(button(page, 'Bilgileri yenile')).toBeEnabled();
  if (id) await page.getByLabel('Kayıtlı FortiAnalyzer profili', { exact: true }).selectOption(id);
}
async function save(page: Page) {
  await button(page, 'Ayarları kaydet').click();
  await expect(page.getByRole('status').filter({ hasText: 'FortiAnalyzer ayarları kaydedildi' })).toBeVisible();
  await expect(button(page, 'Bilgileri yenile')).toBeEnabled();
}
async function capture(page: Page, info: TestInfo, name: string) { await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' }); }

test('FortiAnalyzer workspace: DB-only metadata and explicit selection expose no secrets or collector health', async ({ page, fixtures, profiles, prisma }, info) => {
  const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } });
  const writes: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === endpoint && request.method() !== 'GET') writes.push(request.method()); });
  await open(page, fixtures);
  await expect(button(page, 'Ayarları kaydet')).toBeDisabled();
  await page.getByLabel('Kayıtlı FortiAnalyzer profili', { exact: true }).selectOption(profiles.a);
  const response = await page.request.get(endpoint), value = await response.json();
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect(value.profiles).toHaveLength(2);
  for (const hidden of [secret, key, 'enc:v1:', 'sourceRevision', 'retain-key']) expect(JSON.stringify(value)).not.toContain(hidden);
  expect(value.profiles.every((row: { collector: unknown }) => row.collector === null)).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Sunucu adresi', exact: true })).toHaveValue(session.host);
  await expect(page.getByLabel('Parola', { exact: true })).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Alarm verilerinin durumu', exact: true }).locator('..').locator('..')).toContainText('Durum bilgisi yok');
  expect(writes).toEqual([]); expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  await capture(page, info, 'fortianalyzer-desktop-metadata');
});

for (const mode of ['session', 'api-key'] as const) {
  test('FortiAnalyzer workspace: ' + mode + ' ADOM edit preserves exact profile, encrypted secret and disabled state', async ({ page, fixtures, profiles, prisma }) => {
    const id = mode === 'session' ? profiles.a : profiles.b, canary = mode === 'session' ? profiles.b : profiles.a;
    const before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id } }), other = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: canary } });
    await open(page, fixtures, id);
    await page.getByRole('textbox', { name: 'ADOM adı', exact: true }).fill('Tenant B');
    await expect(button(page, 'Bilgileri yenile')).toBeDisabled();
    await expect(page.getByLabel('Kayıtlı FortiAnalyzer profili', { exact: true })).toBeDisabled();
    const request = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === endpoint);
    await save(page);
    expect((await request).postDataJSON()).toMatchObject({ action: 'save', configId: id, expectedUpdatedAt: before.updatedAt.toISOString(), draft: { adom: 'Tenant B', password: '', apiKey: '' } });
    const saved = await prisma.integrationConfig.findUniqueOrThrow({ where: { id } });
    expect(saved).toMatchObject({ name: before.name, enabled: false, syncInterval: before.syncInterval });
    const plain = unprotectIntegrationConfig<Record<string, unknown>>(saved.config, 'FORTIANALYZER');
    expect(plain).toMatchObject({ adom: 'Tenant B', pollingInterval: mode === 'session' ? 12 : 20, custom: mode === 'session' ? 'retain' : 'retain-key' });
    expect(plain[mode === 'session' ? 'password' : 'apiKey']).toBe(mode === 'session' ? secret : key);
    expect(JSON.stringify(saved.config)).not.toContain(mode === 'session' ? secret : key);
    if (mode === 'api-key') expect(plain.accessToken).toBeUndefined();
    expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: canary } })).toEqual(other);
  });
}

test('FortiAnalyzer workspace: method changes require new secrets and remove inactive credentials', async ({ page, fixtures, profiles, prisma }) => {
  await open(page, fixtures, profiles.a);
  await page.getByLabel('Parola', { exact: true }).fill('must-clear');
  await page.getByLabel('Kimlik doğrulama yöntemi', { exact: true }).selectOption('api-key');
  await expect(page.getByLabel('API anahtarı', { exact: true })).toHaveValue('');
  await button(page, 'Ayarları kaydet').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Yeni sunucu' })).toBeVisible();
  await page.getByLabel('API anahtarı', { exact: true }).fill('new-fixture-key');
  await button(page, 'Gizli bilgiyi göster').click(); await expect(page.getByLabel('API anahtarı', { exact: true })).toHaveAttribute('type', 'text');
  await save(page); await expect(page.getByLabel('API anahtarı', { exact: true })).toHaveAttribute('type', 'password');
  let saved = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } });
  let plain = unprotectIntegrationConfig<Record<string, unknown>>(saved.config, 'FORTIANALYZER');
  expect(plain.apiKey).toBe('new-fixture-key'); expect(plain.password).toBeUndefined(); expect(plain.username).toBeUndefined(); expect(plain.accessToken).toBeUndefined();
  await page.getByLabel('Kimlik doğrulama yöntemi', { exact: true }).selectOption('session');
  await page.getByRole('textbox', { name: 'Kullanıcı adı', exact: true }).fill('new-reader');
  await page.getByLabel('Parola', { exact: true }).fill(' new-session-fixture!9 ');
  await save(page); saved = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } }); plain = unprotectIntegrationConfig(saved.config, 'FORTIANALYZER');
  expect(plain).toMatchObject({ username: 'new-reader', password: ' new-session-fixture!9 ' }); expect(plain.apiKey).toBeUndefined(); expect(plain.accessToken).toBeUndefined();
});

test('FortiAnalyzer workspace: validation rejects changed identity, malformed authority, ADOM and masked credentials without writes', async ({ page, fixtures, profiles, prisma }) => {
  await open(page, fixtures, profiles.a); const before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } });
  await page.getByRole('textbox', { name: 'Sunucu adresi', exact: true }).fill('changed.example.invalid'); await button(page, 'Ayarları kaydet').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Yeni sunucu' })).toBeVisible();
  const payload = { action: 'save', configId: profiles.a, expectedUpdatedAt: before.updatedAt.toISOString(), draft: { ...session, apiKey: '' } };
  for (const draft of [{ ...payload.draft, host: 'user:secret@faz.invalid' }, { ...payload.draft, host: 'faz.invalid/path' }, { ...payload.draft, host: 'faz.invalid:99999' }, { ...payload.draft, adom: '../root' }, { ...payload.draft, password: '********' }, { ...payload.draft, authMode: 'api-key', apiKey: 'has space' }]) expect((await page.request.post(endpoint, { data: { ...payload, draft } })).status()).toBe(400);
  expect((await page.request.post(endpoint, { data: { ...payload, configId: profiles.other } })).status()).toBe(404);
  expect((await page.request.post(endpoint, { data: null })).status()).toBe(400);
  expect((await page.request.post(endpoint, { data: '{', headers: { 'Content-Type': 'application/json' } })).status()).toBe(400);
  expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } })).toEqual(before);
});

test('FortiAnalyzer workspace: concurrent and stale settings cannot overwrite credentials or ADOM', async ({ page, fixtures, profiles, prisma }) => {
  await open(page, fixtures, profiles.a); const before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } });
  const data = { action: 'save', configId: profiles.a, expectedUpdatedAt: before.updatedAt.toISOString(), draft: { ...session, password: '', apiKey: '', adom: 'Race A' } };
  const replies = await Promise.all([page.request.post(endpoint, { data }), page.request.post(endpoint, { data: { ...data, draft: { ...data.draft, adom: 'Race B' } } })]);
  expect(replies.map(reply => reply.status()).sort()).toEqual([200, 409]);
  const saved = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } });
  await page.getByRole('textbox', { name: 'ADOM adı', exact: true }).fill('Stale draft'); await button(page, 'Ayarları kaydet').click();
  await expect(page.getByRole('alert').filter({ hasText: 'başka bir işlemde değişti' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'ADOM adı', exact: true })).toHaveValue('Stale draft');
  expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } })).toEqual(saved);
});

test('FortiAnalyzer workspace: first creation and competing creation never overwrite a saved profile', async ({ page, fixtures, profiles, prisma }) => {
  await prisma.integrationConfig.deleteMany({ where: { id: { in: [profiles.a, profiles.b] } } }); await open(page, fixtures);
  await page.getByRole('textbox', { name: 'Sunucu adresi', exact: true }).fill(session.host); await page.getByRole('textbox', { name: 'Kullanıcı adı', exact: true }).fill(session.username); await page.getByLabel('Parola', { exact: true }).fill(secret); await save(page);
  const saved = await prisma.integrationConfig.findFirstOrThrow({ where: { type: 'FORTIANALYZER', name: 'FortiAnalyzer' } });
  expect(saved.enabled).toBe(true); expect(JSON.stringify(saved.config)).not.toContain(secret);
  const data = { action: 'save', draft: { ...session, apiKey: '' } };
  expect((await page.request.post(endpoint, { data })).status()).toBe(409); expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(saved);
  await prisma.integrationConfig.delete({ where: { id: saved.id } });
  const replies = await Promise.all([page.request.post(endpoint, { data }), page.request.post(endpoint, { data })]); expect(replies.map(reply => reply.status()).sort()).toEqual([200, 409]);
});

for (const mode of ['session', 'api-key'] as const) {
  test('FortiAnalyzer workspace: ' + mode + ' saved/draft tests keep credentials and target evidence separate', async ({ page, fixtures, profiles, prisma }) => {
    const id = mode === 'session' ? profiles.a : profiles.b; await open(page, fixtures, id); const before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id } }), calls: Record<string, unknown>[] = [];
    await page.route('**' + endpoint, route => { const body = route.request().postDataJSON(); calls.push(body); return json(route, { success: true, connected: true, configId: id, host: mode === 'session' ? session.host : 'faz-b.example.invalid', adom: mode === 'session' ? 'Tenant A' : 'root', testedAt: '2026-10-17T12:00:00.000Z' }); });
    await button(page, 'Kayıtlı bağlantıyı test et').click(); await expect(page.getByText('Sunucu ve ADOM erişimi test sırasında doğrulandı.', { exact: true })).toBeVisible(); expect(calls[0]).toEqual({ action: 'test-saved', configId: id });
    await button(page, 'Formdaki bilgilerle test et').click(); await expect(page.getByRole('alert').filter({ hasText: 'Form testi için' })).toBeVisible(); expect(calls).toHaveLength(1);
    await page.getByLabel(mode === 'session' ? 'Parola' : 'API anahtarı', { exact: true }).fill('entered-only-fixture'); await button(page, 'Formdaki bilgilerle test et').click();
    await expect(page.getByText(/^Formdaki bilgiler ·/)).toBeVisible(); expect(calls[1]).toMatchObject({ action: 'test-draft', configId: id, draft: { authMode: mode, [mode === 'session' ? 'password' : 'apiKey']: 'entered-only-fixture' } });
    await page.getByRole('textbox', { name: 'ADOM adı', exact: true }).fill('Changed'); await expect(page.getByText('Sunucu ve ADOM erişimi test sırasında doğrulandı.', { exact: true })).toHaveCount(0);
    expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });
}

for (const result of ['failed', 'wrong-target'] as const) {
  test('FortiAnalyzer workspace: ' + result + ' probe cannot appear healthy', async ({ page, fixtures, profiles }) => {
    await open(page, fixtures, profiles.a); await page.route('**' + endpoint, route => json(route, { success: true, connected: result !== 'failed', configId: result === 'wrong-target' ? profiles.b : profiles.a, host: session.host, adom: session.adom, testedAt: '2026-10-17T12:00:00Z', error: 'raw-private-provider-error' }));
    await button(page, 'Kayıtlı bağlantıyı test et').click(); await expect(page.getByText(result === 'failed' ? 'Sunucu erişimi, kimlik doğrulaması veya ADOM yetkisi doğrulanamadı.' : 'Bağlantı testi sonucu doğrulanamadı.', { exact: result !== 'failed' })).toBeVisible(); expect(await page.getByText('raw-private-provider-error').count()).toBe(0);
  });
}

for (const outcome of ['server', 'wrong-target'] as const) {
  test('FortiAnalyzer workspace: ' + outcome + ' save preserves draft and requires explicit refresh', async ({ page, fixtures, profiles, prisma }) => {
    await open(page, fixtures, profiles.a); const before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } }); await page.getByRole('textbox', { name: 'ADOM adı', exact: true }).fill('Draft to retain');
    await page.route('**' + endpoint, route => route.request().method() === 'GET' ? route.continue() : json(route, { success: true, configId: profiles.b }, outcome === 'server' ? 500 : 200));
    await button(page, 'Ayarları kaydet').click(); await expect(page.getByRole('alert').filter({ hasText: 'Kaydetme sonucu doğrulanamadı' })).toBeVisible(); await expect(page.getByRole('textbox', { name: 'ADOM adı', exact: true })).toHaveValue('Draft to retain'); await expect(button(page, 'Ayarları kaydet')).toBeDisabled();
    await page.unroute('**' + endpoint); await button(page, 'Kayıtlı bilgileri yeniden oku').click(); await expect(button(page, 'Bilgileri yenile')).toBeEnabled(); await expect(page.getByRole('textbox', { name: 'ADOM adı', exact: true })).toHaveValue(session.adom); expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } })).toEqual(before);
  });
}

test('FortiAnalyzer workspace: stale reads preserve metadata and block all writes', async ({ page, fixtures, profiles }) => {
  await open(page, fixtures, profiles.a); await page.route('**' + endpoint, route => json(route, { success: false }, 503)); await button(page, 'Bilgileri yenile').click(); await expect(page.getByRole('alert').filter({ hasText: 'Son alınan bilgiler korunuyor' })).toBeVisible(); await expect(page.getByRole('textbox', { name: 'Sunucu adresi', exact: true })).toHaveValue(session.host);
  for (const name of ['Ayarları kaydet', 'Kayıtlı bağlantıyı test et', 'Formdaki bilgilerle test et']) await expect(button(page, name)).toBeDisabled();
});

for (const denial of ['editor', 'viewer', 'inactive', 'suspended', 'expired', 'missing'] as const) {
  test('FortiAnalyzer workspace: current ' + denial + ' identity rejects all writes before source access', async ({ page, context, fixtures, profiles, prisma }) => {
    await open(page, fixtures, profiles.a); const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } }); await page.getByRole('textbox', { name: 'ADOM adı', exact: true }).fill('Preserved draft');
    try {
      await installTestSession(context, fixtures, 'ADMIN', denial === 'expired');
      if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
      else if (denial === 'editor' || denial === 'viewer') await prisma.user.update({ where: { id: fixtures.userId }, data: { role: denial === 'editor' ? 'EDITOR' : 'VIEWER' } });
      else if (denial === 'inactive' || denial === 'suspended') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: denial === 'inactive' ? 'INACTIVE' : 'SUSPENDED' } });
      const status = denial === 'editor' || denial === 'viewer' ? 403 : 401;
      await button(page, 'Ayarları kaydet').click(); await expect(page.getByRole('alert').filter({ hasText: status === 401 ? 'Oturum' : 'yetkiniz' })).toBeVisible(); await expect(page.getByRole('textbox', { name: 'ADOM adı', exact: true })).toHaveValue('Preserved draft');
      for (const action of ['save', 'test-saved', 'test-draft']) expect((await page.request.post(endpoint, { data: { action, configId: profiles.a, draft: { ...session, apiKey: '' } } })).status()).toBe(status);
      expect((await page.request.get(endpoint)).status()).toBe(status === 403 ? 200 : 401); expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
    } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); await installTestSession(context, fixtures, 'ADMIN'); }
    await save(page); const saved = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } }); expect(unprotectIntegrationConfig<Record<string, unknown>>(saved.config, 'FORTIANALYZER').adom).toBe('Preserved draft');
  });
}

test('FortiAnalyzer workspace: mobile light/dark collector semantics and read-only controls', async ({ page, fixtures, profiles, prisma }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, fixtures, profiles.a); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await capture(page, info, 'fortianalyzer-mobile-light');
  const original = await (await page.request.get(endpoint)).json(); original.profiles.find((row: { id: string }) => row.id === profiles.a).collector = { lastSyncTime: '2026-10-17T12:00:00Z', isFresh: false, stopped: false, syncInProgress: false, failedLogtypes: ['dns'], consecutiveSyncFailures: 2, nextSyncDelayMin: 20 };
  await page.route('**' + endpoint, route => json(route, original)); await button(page, 'Bilgileri yenile').click(); await expect(button(page, 'Bilgileri yenile')).toBeEnabled(); await page.evaluate(() => document.documentElement.classList.add('dark'));
  const region = page.getByRole('region', { name: 'Alarm verilerinin senkronizasyonu', exact: true }); await region.scrollIntoViewIfNeeded(); await expect(region).toContainText('DNS sorguları'); await expect(region).toContainText('20 dakika'); await expect(region).toContainText('En az bir'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await capture(page, info, 'fortianalyzer-mobile-dark-collector');
  await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR' } });
  try { await page.reload(); await expect(button(page, 'Bilgileri yenile')).toBeEnabled(); await page.getByLabel('Kayıtlı FortiAnalyzer profili', { exact: true }).selectOption(profiles.a); for (const name of ['Ayarları kaydet', 'Kayıtlı bağlantıyı test et', 'Formdaki bilgilerle test et']) await expect(button(page, name)).toBeDisabled(); }
  finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); }
});
