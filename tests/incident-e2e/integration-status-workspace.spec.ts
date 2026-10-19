import { expect, type Page, type TestInfo } from '@playwright/test';
import { test as base, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { protectIntegrationConfig } from '../../lib/security/integration-credentials';

const time = '2026-10-18T10:20:30.000Z';
const test = base.extend<{ profiles: { prefix: string; firewall: string; vmware: string } }>({
  profiles: async ({ prisma, fixtures }, use) => {
    const prefix = fixtures.manifest.prefix;
    const config = async (type: 'FORTIGATE' | 'VMWARE_VCENTER' | 'FORTIANALYZER' | 'ZABBIX' | 'AWS') => prisma.integrationConfig.create({ data: {
      name: prefix + ' ' + type, type, enabled: false, syncInterval: 1440,
      config: type === 'AWS' ? { host: 'cloud.example.invalid' } : protectIntegrationConfig({ host: 'https://private-user:private-secret@source.example.invalid/path?token=private-query', url: 'https://private-user:private-secret@zabbix.example.invalid/api?token=private-query', username: 'fixture-reader', password: 'private-password', apiKey: 'private-key', adom: 'TenantQA', vdom: 'root', pollingInterval: 1440 }, type),
      lastSyncAt: new Date(time), lastSyncStatus: 'connected',
    } });
    try {
      const fw = await config('FORTIGATE'), vmware = await config('VMWARE_VCENTER');
      await config('FORTIANALYZER'); await config('ZABBIX'); await config('AWS');
      await prisma.integrationConfig.update({ where: { id: vmware.id }, data: { lastSyncStatus: 'success' } });
      await prisma.integrationSyncLog.create({ data: { configId: fw.id, status: 'partial', startedAt: new Date('2026-10-18T10:20:00Z'), completedAt: new Date(time), itemsProcessed: 0, errorDetails: { errorCount: 2, errors: ['private-log-error'] } } });
      for (const [index, vdom] of ['root', 'Branch'].entries()) {
        const device = await prisma.device.create({ data: { name: prefix + ' status device ' + index, type: 'FIREWALL', tags: [], pollingEnabled: false, nmsDeviceId: 1000000000 + Math.floor(Math.random() * 500000000) } });
        await prisma.firewallConnector.create({ data: { integrationConfigId: fw.id, deviceId: device.id, managementHost: 'fw.example.invalid', vdom, identityStatus: index ? 'CONFLICT' : 'VERIFIED', lastProbeAt: new Date(time), capabilities: [{ source: 'fortigate-rest', status: index ? 'unavailable' : 'available', checkedAt: time, latencyMs: 0, errorCode: index ? 'TLS_CERTIFICATE_UNTRUSTED' : null, reason: 'private-provider-message' }] } });
        await prisma.nmsHealthMetric.create({ data: { nmsDeviceId: device.nmsDeviceId!, collectedAt: new Date(index ? '2026-10-19T01:00:00Z' : time), cpuUsage: 0 } });
        if (!index) await prisma.device.update({ where: { id: device.id }, data: { pollingEnabled: true } });
      }
      await use({ prefix, firewall: fw.id, vmware: vmware.id });
    } finally {
      await prisma.integrationConfig.deleteMany({ where: { name: { startsWith: prefix } } });
      await prisma.device.deleteMany({ where: { name: { startsWith: prefix } } });
    }
  },
});
const refresh = (page: Page) => page.getByRole('button', { name: 'Durumları yenile', exact: true });
async function open(page: Page, fixtures: Fixtures) { await installTestSession(page.context(), fixtures, 'ADMIN'); await page.goto('/integrations/status'); await expect(refresh(page)).toBeEnabled(); }
async function capture(page: Page, info: TestInfo, name: string) { await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' }); }
async function snapshot(page: Page) { const response = await page.request.get('/api/integrations/status'); expect(response.status()).toBe(200); return response.json(); }

test('integration status: actual read-only metadata separates probes, syncs and NMS activity without secrets', async ({ page, fixtures, profiles, prisma }, info) => {
  const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } }), logs = await prisma.integrationSyncLog.findMany();
  const operations: string[] = []; page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/integrations/') && (path !== '/api/integrations/status' || request.method() !== 'GET')) operations.push(path); });
  await open(page, fixtures); const response = await page.request.get('/api/integrations/status'); expect(response.headers()['cache-control']).toBe('private, no-store'); const result = await response.json();
  for (const value of ['private-user', 'private-secret', 'private-query', 'private-password', 'private-key', 'private-log-error', 'private-provider-message', 'enc:v1:', 'healthScore', 'avgHealth']) expect(JSON.stringify(result)).not.toContain(value);
  const fw = result.data.filter((row: { id: string }) => row.id.startsWith(profiles.firewall + ':')); expect(fw).toHaveLength(2); expect(fw.map((row: { scope: string }) => row.scope).sort()).toEqual(['VDOM: Branch', 'VDOM: root']); expect(fw[0].sync).toMatchObject({ status: 'partial', errors: 2, source: 'log' });
  expect(result.data.find((row: { id: string }) => row.id === profiles.vmware)).toMatchObject({ enabled: false, host: 'source.example.invalid', connection: { state: 'unknown', checkedAt: null }, sync: { status: 'success', source: 'metadata', completedAt: time } });
  expect(result.data.find((row: { id: string }) => row.id === 'system-nms')).toMatchObject({ connection: { state: 'unknown' }, activity: { registered: 2, polling: 1, lastMetricAt: time, readFailed: false } });
  expect(operations).toEqual([]); expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } })).toEqual(before); expect(await prisma.integrationSyncLog.findMany()).toEqual(logs); await capture(page, info, 'integration-status-desktop');
});

for (const role of ['EDITOR', 'VIEWER'] as const) test('integration status: current ' + role + ' can read without a management write', async ({ page, fixtures, profiles, prisma }) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); await prisma.user.update({ where: { id: fixtures.userId }, data: { role } });
  try { await page.goto('/integrations/status'); await expect(refresh(page)).toBeEnabled(); expect((await page.request.get('/api/integrations/status')).status()).toBe(200); await expect(page.getByRole('heading', { name: profiles.prefix + ' VMWARE_VCENTER', exact: true })).toBeVisible(); }
  finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); }
});

for (const denial of ['inactive', 'suspended', 'expired', 'missing'] as const) test('integration status: ' + denial + ' identity cannot refresh private records', async ({ page, context, fixtures, profiles, prisma }) => {
  await open(page, fixtures); const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } });
  try {
    await installTestSession(context, fixtures, 'ADMIN', denial === 'expired');
    if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
    if (denial === 'inactive' || denial === 'suspended') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: denial === 'inactive' ? 'INACTIVE' : 'SUSPENDED' } });
    const response = await page.request.get('/api/integrations/status'); expect(response.status()).toBe(401); expect((await response.json()).data).toBeUndefined();
    await refresh(page).click(); await expect(page.getByRole('alert').filter({ hasText: 'Son alınan sonuçlar korunuyor.' })).toContainText('Oturumunuz'); await expect(page.getByRole('heading', { name: profiles.prefix + ' VMWARE_VCENTER', exact: true })).toBeVisible(); expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { status: 'ACTIVE' } }); await installTestSession(context, fixtures, 'ADMIN'); }
  await refresh(page).click(); await expect(page.getByRole('alert').filter({ hasText: 'Son alınan sonuçlar korunuyor.' })).toHaveCount(0);
});

test('integration status: filters, source details and management links retain distinct meanings', async ({ page, fixtures, profiles }) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); const value = await snapshot(page);
  for (const row of value.data) if (row.kind === 'FORTIGATE') row.enabled = true;
  await page.route('**/api/integrations/status', route => route.fulfill({ json: value })); await page.goto('/integrations/status'); await expect(refresh(page)).toBeEnabled();
  await page.getByLabel('Durum', { exact: true }).selectOption('attention'); await expect(page.getByRole('status')).toContainText('2 /');
  await page.getByLabel('Durum', { exact: true }).selectOption('success'); await expect(page.getByRole('status')).toContainText('1 /');
  const card = page.getByRole('article', { name: 'FortiGate: ' + profiles.prefix + ' FORTIGATE', exact: true }); await expect(card).toHaveCount(1); await card.locator('summary').click(); await expect(card).toContainText('0 ms'); await expect(card).toContainText('VDOM bazında ayrım tutulmaz'); expect(await card.getByRole('link', { name: /Entegrasyonu aç/ }).getAttribute('href')).toBe('/integrations/firewall');
  await page.getByLabel('Durum', { exact: true }).selectOption('all'); await page.getByLabel('Entegrasyon ara', { exact: true }).fill('Branch'); await expect(page.getByRole('status')).toContainText('1 /'); await expect(page.getByRole('article')).toContainText('Sunucu sertifikası doğrulanamadı.');
  await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).click(); await page.getByLabel('Entegrasyon türü', { exact: true }).selectOption('AWS'); await expect(page.getByRole('article').getByRole('link')).toHaveCount(0);
  await page.getByLabel('Entegrasyon ara', { exact: true }).fill('no-match'); await expect(page.getByRole('heading', { name: 'Filtrelere uygun entegrasyon bulunamadı', exact: true })).toBeVisible();
});

for (const failure of ['http', 'malformed'] as const) test('integration status: ' + failure + ' refresh retains the prior snapshot and recovers', async ({ page, fixtures, profiles }) => {
  await open(page, fixtures); await page.route('**/api/integrations/status', route => failure === 'http' ? route.fulfill({ status: 503, json: { success: false, error: 'private-provider-message' } }) : route.fulfill({ json: { success: true, data: [{ id: 'invalid' }], observedAt: time, warnings: [] } }));
  await refresh(page).click(); await expect(page.getByRole('alert').filter({ hasText: 'Son alınan sonuçlar korunuyor.' })).toContainText('Son alınan sonuçlar korunuyor.'); await expect(page.getByRole('heading', { name: profiles.prefix + ' VMWARE_VCENTER', exact: true })).toBeVisible(); await expect(page.getByText('private-provider-message', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/integrations/status'); await refresh(page).click(); await expect(page.getByRole('alert').filter({ hasText: 'Son alınan sonuçlar korunuyor.' })).toHaveCount(0);
});

test('integration status: empty installation has honest unconfigured placeholders', async ({ page, fixtures }) => {
  await open(page, fixtures); const value = await snapshot(page); expect(value.data).toHaveLength(5); expect(value.data.every((row: { configured: boolean }) => row.configured === false)).toBe(true); await expect(page.getByRole('article')).toHaveCount(5); await expect(page.getByRole('article', { name: 'FortiAnalyzer: FortiAnalyzer', exact: true })).toContainText('Envanter aktarımı yapılmaz');
});

test('integration status: initial request failure never invents zero counters or an empty success', async ({ page, fixtures }) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); await page.route('**/api/integrations/status', route => route.fulfill({ status: 503, json: { success: false } })); await page.goto('/integrations/status'); await expect(page.getByRole('heading', { name: 'Entegrasyon durumları gösterilemiyor', exact: true })).toBeVisible(); await expect(page.getByRole('article')).toHaveCount(0); await expect(page.getByText('—', { exact: true })).toHaveCount(4);
});

test('integration status: partial NMS read stays unknown while other integrations remain available', async ({ page, fixtures, profiles }) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); const value = await snapshot(page); const nms = value.data.find((row: { id: string }) => row.id === 'system-nms'); Object.assign(nms, { configured: null, enabled: null, activity: { registered: null, polling: null, lastMetricAt: null, readFailed: true } }); value.warnings = ['Cihaz izleme bilgileri alınamadı.'];
  await page.route('**/api/integrations/status', route => route.fulfill({ json: value })); await page.goto('/integrations/status'); await expect(refresh(page)).toBeEnabled(); await page.getByLabel('Durum', { exact: true }).selectOption('attention'); await expect(page.getByRole('article')).toHaveCount(1); await expect(page.getByRole('article')).toContainText('Yapılandırma bilgisi alınamadı'); await expect(page.getByRole('article')).not.toContainText('0 kayıtlı cihaz'); await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).click(); await expect(page.getByRole('heading', { name: profiles.prefix + ' VMWARE_VCENTER', exact: true })).toBeVisible();
});

test('integration status: mobile light/dark layout and keyboard disclosure', async ({ page, fixtures, profiles }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, fixtures); await page.getByLabel('Entegrasyon ara', { exact: true }).fill(profiles.prefix + ' VMWARE'); const card = page.getByRole('article'); await expect(card).toHaveCount(1); const summary = card.locator('summary'); await summary.focus(); await page.keyboard.press('Enter'); await expect(card.locator('details')).toHaveAttribute('open', ''); await expect(card).toContainText('ayrıntılı günlük bulunmuyor'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await capture(page, info, 'integration-status-mobile-light'); await page.evaluate(() => document.documentElement.classList.add('dark')); await capture(page, info, 'integration-status-mobile-dark');
});
