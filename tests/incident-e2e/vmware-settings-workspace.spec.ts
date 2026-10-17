import { expect, type Page, type Route, type TestInfo } from '@playwright/test';
import { test as base, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { protectIntegrationConfig, unprotectIntegrationConfig } from '../../lib/security/integration-credentials';

const secret = ' synthetic-VMware-fixture!9 ';
const modules = { datacenters: false, clusters: true, hosts: true, vms: true, datastores: true };
const config = (host = 'vc-a.example.invalid') => ({ host, username: 'fixture-reader', password: secret, thumbprint: '', pollingInterval: 1440, enabledModules: modules });
const test = base.extend<{ profiles: { a: string; b: string; other: string; prefix: string } }>({
  profiles: async ({ prisma, fixtures }, use) => {
    const prefix = fixtures.manifest.prefix;
    try {
      const a = await prisma.integrationConfig.create({ data: { type: 'VMWARE_VCENTER', name: prefix + ' A', config: protectIntegrationConfig(config(), 'VMWARE_VCENTER'), syncInterval: 1440, lastSyncAt: new Date(), lastSyncStatus: 'partial' } });
      const b = await prisma.integrationConfig.create({ data: { type: 'VMWARE_VCENTER', name: prefix + ' B', enabled: false, config: protectIntegrationConfig(config('vc-b.example.invalid'), 'VMWARE_VCENTER'), syncInterval: 1440 } });
      const other = await prisma.integrationConfig.create({ data: { type: 'ZABBIX', name: prefix + ' Other', enabled: false, config: {} } });
      await prisma.integrationSyncLog.create({ data: { configId: a.id, status: 'partial', message: 'private fixture diagnostic', itemsProcessed: 9, itemsCreated: 2, itemsUpdated: 5, errorDetails: { errorCount: 1, privateDetail: 'must not escape' }, startedAt: new Date('2026-10-17T11:59:00Z'), completedAt: new Date('2026-10-17T12:00:00Z') } });
      await use({ a: a.id, b: b.id, other: other.id, prefix });
    } finally { await prisma.integrationConfig.deleteMany({ where: { OR: [{ name: { startsWith: prefix } }, { type: 'VMWARE_VCENTER', name: 'VMware vCenter' }] } }); }
  },
});
const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
async function open(page: Page, fixtures: Fixtures, id?: string) {
  await installTestSession(page.context(), fixtures, 'ADMIN');
  await page.goto('/integrations/vmware');
  await expect(page.getByRole('button', { name: 'Bilgileri yenile', exact: true })).toBeEnabled();
  if (id) await page.getByLabel('İşlem yapılacak vCenter profili', { exact: true }).selectOption(id);
}
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
}

test('VMware settings: DB-only metadata, explicit multi-profile selection and private history', async ({ page, fixtures, profiles, prisma }, info) => {
  const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' }, include: { syncLogs: true } });
  const writes: string[] = [];
  page.on('request', req => { if (new URL(req.url()).pathname === '/api/integrations/vmware' && req.method() !== 'GET') writes.push(req.method()); });
  await open(page, fixtures);
  await expect(page.getByRole('heading', { name: 'vCenter profilini seçin', exact: true })).toBeVisible();
  await page.getByLabel('İşlem yapılacak vCenter profili', { exact: true }).selectOption(profiles.a);
  await expect(page.getByLabel('vCenter sunucusu *', { exact: true })).toHaveValue('vc-a.example.invalid');
  await expect(page.getByLabel('Yeni parola', { exact: true })).toHaveValue('');
  const response = await page.request.get('/api/integrations/vmware?type=workspace');
  expect(response.headers()['cache-control']).toBe('private, no-store');
  const value = await response.json();
  expect(value.profiles).toHaveLength(2);
  const raw = JSON.stringify(value);
  for (const hidden of [secret, 'enc:v1:', 'private fixture diagnostic', 'must not escape']) expect(raw).not.toContain(hidden);
  expect(value.profiles.find((row: { id: string }) => row.id === profiles.a).lastSync).toMatchObject({ status: 'partial', itemsProcessed: 9, errorCount: 1 });
  await expect(page.getByText('Son kayıtlı deneme: Kısmen tamamlandı', { exact: true })).toBeVisible();
  await expect(page.getByText('Doğrulanmadı', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' }, include: { syncLogs: true } })).toEqual(before);
  await capture(page, info, 'vmware-settings-metadata');
});

test('VMware settings: exact profile edit preserves secret, name, disabled state and hidden module', async ({ page, fixtures, profiles, prisma }) => {
  const a = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } });
  const before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.b } });
  await open(page, fixtures, profiles.b);
  await page.getByLabel('Senkronizasyon aralığı (dakika) *', { exact: true }).fill('30');
  await expect(button(page, 'Bilgileri yenile')).toBeDisabled();
  await expect(page.getByLabel('İşlem yapılacak vCenter profili', { exact: true })).toBeDisabled();
  const request = page.waitForRequest(req => req.method() === 'POST' && new URL(req.url()).pathname === '/api/integrations/vmware');
  await button(page, 'Ayarları kaydet').click();
  const body = (await request).postDataJSON();
  expect(body).toMatchObject({ action: 'save-config', configId: profiles.b, expectedUpdatedAt: before.updatedAt.toISOString(), enabled: false, config: { password: '', pollingInterval: 30, enabledModules: { datacenters: false } } });
  await expect(button(page, 'Ayarları kaydet')).toBeDisabled();
  await expect(page.getByLabel('Yeni parola', { exact: true })).toHaveValue('');
  const after = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.b } });
  expect(after).toMatchObject({ name: before.name, enabled: false, syncInterval: 30 });
  expect(unprotectIntegrationConfig(after.config, 'VMWARE_VCENTER')).toMatchObject({ password: secret, enabledModules: { datacenters: false }, pollingInterval: 30 });
  expect(JSON.stringify(after.config)).not.toContain(secret);
  expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } })).toEqual(a);
  await expect(button(page, 'Kayıtlı ayarlarla senkronize et')).toBeDisabled();
});

test('VMware settings: authority changes require a new encrypted secret and invalid fields never persist', async ({ page, fixtures, profiles, prisma }) => {
  await open(page, fixtures, profiles.b);
  const before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.b } });
  await page.getByLabel('vCenter sunucusu *', { exact: true }).fill('vc-new.example.invalid');
  await button(page, 'Ayarları kaydet').click();
  await expect(page.getByRole('alert').filter({ hasText: 'parolayı girin' })).toBeVisible();
  expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.b } })).toEqual(before);
  await page.getByLabel('Yeni parola', { exact: true }).fill('new-synthetic-fixture!9');
  await page.getByLabel('Senkronizasyon aralığı (dakika) *', { exact: true }).fill('0');
  await button(page, 'Ayarları kaydet').click();
  await expect(page.getByRole('alert').filter({ hasText: 'tam sayı' })).toBeVisible();
  await page.getByLabel('Senkronizasyon aralığı (dakika) *', { exact: true }).fill('30');
  await button(page, 'Ayarları kaydet').click();
  await expect(button(page, 'Ayarları kaydet')).toBeDisabled();
  const saved = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.b } });
  expect(unprotectIntegrationConfig(saved.config, 'VMWARE_VCENTER')).toMatchObject({ host: 'vc-new.example.invalid', password: 'new-synthetic-fixture!9' });
  for (const host of ['vc.invalid/path', 'user:pass@vc.invalid', 'vc.invalid?query', ' ']) expect((await page.request.post('/api/integrations/vmware', { data: { action: 'save-config', configId: profiles.b, config: { ...config(host), password: 'new-fixture' } } })).status()).toBe(400);
  expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.b } })).toEqual(saved);
});

test('VMware settings: stale versions and concurrent saves cannot overwrite another edit', async ({ page, fixtures, profiles, prisma }) => {
  await open(page, fixtures, profiles.b);
  const before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.b } });
  const payload = { action: 'save-config', configId: profiles.b, expectedUpdatedAt: before.updatedAt.toISOString(), config: { ...config('vc-b.example.invalid'), password: '', pollingInterval: 30 } };
  const results = await Promise.all([page.request.post('/api/integrations/vmware', { data: payload }), page.request.post('/api/integrations/vmware', { data: { ...payload, config: { ...payload.config, pollingInterval: 45 } } })]);
  expect(results.map(result => result.status()).sort()).toEqual([200, 409]);
  const saved = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.b } });
  await page.getByLabel('Senkronizasyon aralığı (dakika) *', { exact: true }).fill('60');
  await button(page, 'Ayarları kaydet').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Profil başka bir işlemde değişti' })).toBeVisible();
  await expect(page.getByLabel('Senkronizasyon aralığı (dakika) *', { exact: true })).toHaveValue('60');
  expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.b } })).toEqual(saved);
});

test('VMware settings: first-profile creation is explicit and duplicate create cannot overwrite it', async ({ page, fixtures, profiles, prisma }) => {
  await prisma.integrationConfig.deleteMany({ where: { id: { in: [profiles.a, profiles.b] } } });
  await open(page, fixtures);
  await page.getByLabel('vCenter sunucusu *', { exact: true }).fill('new.example.invalid');
  await page.getByLabel('Kullanıcı adı *', { exact: true }).fill('new-reader');
  await page.getByLabel('Parola *', { exact: true }).fill('new-profile-fixture!9');
  await page.getByLabel('Otomatik senkronizasyon açık', { exact: true }).uncheck();
  const request = page.waitForRequest(req => req.method() === 'POST' && new URL(req.url()).pathname === '/api/integrations/vmware');
  await button(page, 'Ayarları kaydet').click();
  expect((await request).postDataJSON()).toMatchObject({ action: 'save-config', createOnly: true, enabled: false });
  await expect(page.getByLabel('Yeni parola', { exact: true })).toHaveValue('');
  const created = await prisma.integrationConfig.findFirstOrThrow({ where: { type: 'VMWARE_VCENTER', name: 'VMware vCenter' } });
  expect(created.enabled).toBe(false);
  expect((await page.request.post('/api/integrations/vmware', { data: { action: 'save-config', createOnly: true, name: created.name, config: config('wrong.example.invalid') } })).status()).toBe(409);
  expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: created.id } })).toEqual(created);
  const races = await Promise.all([1, 2].map(index => page.request.post('/api/integrations/vmware', { data: { action: 'save-config', createOnly: true, name: profiles.prefix + ' Race', enabled: false, config: config(`race-${index}.example.invalid`) } })));
  expect(races.map(result => result.status()).sort()).toEqual([200, 409]);
});

test('VMware settings: saved and draft tests use distinct credentials and retire changed test evidence', async ({ page, fixtures, profiles, prisma }) => {
  await open(page, fixtures, profiles.a);
  const before = await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } });
  const actions: Record<string, unknown>[] = [];
  await page.route('**/api/integrations/vmware', route => { const data = route.request().postDataJSON(); actions.push(data); return json(route, { connected: true, version: 'Synthetic 8.0', ...(data.action === 'test-saved' ? { configId: data.configId } : {}) }); });
  await button(page, 'Kayıtlı bağlantıyı test et').click();
  await expect(page.getByRole('region', { name: 'Bağlantı testi', exact: true })).toContainText('test sırasında doğrulandı');
  expect(actions[0]).toEqual({ action: 'test-saved', configId: profiles.a });
  await button(page, 'Formdaki bilgilerle test et').click();
  await expect(page.getByRole('alert').filter({ hasText: 'parolayı girin' })).toBeVisible();
  expect(actions).toHaveLength(1);
  await page.getByLabel('Yeni parola', { exact: true }).fill('draft-only-fixture!9');
  await button(page, 'Formdaki bilgilerle test et').click();
  await expect(page.getByRole('region', { name: 'Bağlantı testi', exact: true })).toContainText('Formdaki bilgiler');
  expect(actions[1]).toMatchObject({ action: 'test', config: { host: 'vc-a.example.invalid', password: 'draft-only-fixture!9' } });
  await page.getByLabel('vCenter sunucusu *', { exact: true }).fill('changed.example.invalid');
  await expect(page.getByRole('region', { name: 'Bağlantı testi', exact: true })).toContainText('Test sonucu yok');
  expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.a } })).toEqual(before);
});

for (const result of ['failed', 'unavailable'] as const) {
  test(`VMware settings: ${result} test result cannot imply a healthy connection`, async ({ page, fixtures, profiles }) => {
    await open(page, fixtures, profiles.a);
    await page.route('**/api/integrations/vmware', route => json(route, result === 'failed' ? { connected: false, configId: profiles.a, code: 'VMWARE_HELPER_TLS_ERROR', error: 'private raw message' } : { connected: true, configId: 'wrong-profile' }));
    await button(page, 'Kayıtlı bağlantıyı test et').click();
    await expect(page.getByRole('region', { name: 'Bağlantı testi', exact: true })).toContainText(result === 'failed' ? 'Son test başarısız' : 'Test sonucu alınamadı');
    await expect(page.getByText('private raw message', { exact: true })).toHaveCount(0);
  });
}

for (const result of ['partial', 'wrong-target', 'server'] as const) {
  test(`VMware settings: ${result} manual sync response stays scoped and explicit`, async ({ page, fixtures, profiles }) => {
    await open(page, fixtures, profiles.a);
    await page.route('**/api/integrations/vmware', route => json(route, { configId: result === 'wrong-target' ? profiles.b : profiles.a, success: false, status: 'partial', itemsProcessed: 1, itemsCreated: 0, itemsUpdated: 1, errorCount: 1, duration: 100 }, result === 'server' ? 500 : 200));
    await button(page, 'Kayıtlı ayarlarla senkronize et').click();
    if (result === 'partial') {
      await expect(page.getByRole('status').filter({ hasText: 'Manuel senkronizasyon:' })).toContainText('kısmen tamamlandı');
      const manual = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Bu oturumdaki manuel işlem sonucu' }) });
      await manual.locator('summary').press('Enter');
      await expect(manual.getByRole('definition')).toHaveText(['1', '0', '1', '1']);
      await page.unroute('**/api/integrations/vmware');
      await page.getByLabel('Senkronizasyon aralığı (dakika) *', { exact: true }).fill('30');
      await button(page, 'Ayarları kaydet').click();
      await expect(page.locator('summary').filter({ hasText: 'Bu oturumdaki manuel işlem sonucu' })).toHaveCount(0);
    } else {
      await expect(page.getByRole('alert').filter({ hasText: 'İşlemin sonucu doğrulanamadı' })).toBeVisible();
      await expect(button(page, 'Kayıtlı ayarlarla senkronize et')).toBeDisabled();
      await page.unroute('**/api/integrations/vmware');
      await button(page, 'Kayıtlı bilgileri yeniden oku').click();
      await expect(button(page, 'Kayıtlı ayarlarla senkronize et')).toBeEnabled();
    }
  });
}

test('VMware settings: stale read preserves data and disables every operation', async ({ page, fixtures, profiles }) => {
  await open(page, fixtures, profiles.a);
  await page.route('**/api/integrations/vmware?type=workspace', route => json(route, { success: false }, 500));
  await button(page, 'Bilgileri yenile').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Son başarılı okumadaki bilgiler korunuyor' })).toBeVisible();
  await expect(page.getByLabel('vCenter sunucusu *', { exact: true })).toHaveValue('vc-a.example.invalid');
  for (const name of ['Ayarları kaydet', 'Kayıtlı bağlantıyı test et', 'Formdaki bilgilerle test et', 'Kayıtlı ayarlarla senkronize et']) await expect(button(page, name)).toBeDisabled();
});

for (const denial of ['editor', 'viewer', 'inactive', 'suspended', 'expired', 'missing'] as const) {
  test(`VMware settings: current ${denial} identity rejects settings and secret tests before source access`, async ({ page, context, fixtures, profiles, prisma }) => {
    await open(page, fixtures, profiles.b);
    const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' }, include: { syncLogs: true } });
    await page.getByLabel('Senkronizasyon aralığı (dakika) *', { exact: true }).fill('60');
    try {
      await installTestSession(context, fixtures, 'ADMIN', denial === 'expired');
      if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
      else if (denial === 'editor' || denial === 'viewer') await prisma.user.update({ where: { id: fixtures.userId }, data: { role: denial === 'editor' ? 'EDITOR' : 'VIEWER' } });
      else if (denial === 'inactive' || denial === 'suspended') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: denial === 'inactive' ? 'INACTIVE' : 'SUSPENDED' } });
      const status = denial === 'editor' || denial === 'viewer' ? 403 : 401;
      await button(page, 'Ayarları kaydet').click();
      await expect(page.getByRole('alert').filter({ hasText: status === 401 ? 'Oturum' : 'yetkiniz' })).toBeVisible();
      await expect(page.getByLabel('Senkronizasyon aralığı (dakika) *', { exact: true })).toHaveValue('60');
      for (const action of ['save-config', 'test-saved', 'test']) expect((await page.request.post('/api/integrations/vmware', { data: { action, configId: profiles.b, config: config() } })).status()).toBe(status);
      expect((await page.request.get('/api/integrations/vmware?type=workspace')).status()).toBe(status === 403 ? 200 : 401);
      // A disabled target exercises the sync permission boundary without creating a source.
      expect((await page.request.post('/api/integrations/vmware', { data: { action: 'sync', configId: profiles.b } })).status()).toBe(denial === 'editor' ? 400 : status);
      expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' }, include: { syncLogs: true } })).toEqual(before);
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } });
      await installTestSession(context, fixtures, 'ADMIN');
    }
    await button(page, 'Ayarları kaydet').click();
    await expect(button(page, 'Ayarları kaydet')).toBeDisabled();
    expect((await prisma.integrationConfig.findUniqueOrThrow({ where: { id: profiles.b } })).syncInterval).toBe(60);
  });
}

test('VMware settings: mobile light/dark inspection and read-only role controls do not contact vCenter', async ({ page, fixtures, profiles, prisma }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, fixtures, profiles.a);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, info, 'vmware-settings-mobile-light');
  const advanced = page.locator('summary').filter({ hasText: 'Gelişmiş bağlantı bilgileri' });
  await advanced.scrollIntoViewIfNeeded(); await advanced.press('Enter');
  await expect(page.getByText(/bu sürümde sertifikayı doğrulamak için kullanılmaz/)).toBeVisible();
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await capture(page, info, 'vmware-settings-mobile-dark');
  await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR' } });
  try {
    await page.reload();
    await expect(button(page, 'Bilgileri yenile')).toBeEnabled();
    await page.getByLabel('İşlem yapılacak vCenter profili', { exact: true }).selectOption(profiles.a);
    for (const name of ['Ayarları kaydet', 'Kayıtlı bağlantıyı test et', 'Formdaki bilgilerle test et']) await expect(button(page, name)).toBeDisabled();
    await expect(button(page, 'Kayıtlı ayarlarla senkronize et')).toBeEnabled();
  } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); }
});
