import { expect, type Page, type Route, type TestInfo } from '@playwright/test';
import { test, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';

const observedAt = '2026-10-17T12:00:00Z';
const license = { valid: true, tier: 'ENTERPRISE', maxDevices: 10, maxUsers: 5, validUntil: '2027-10-17T12:00:00Z', daysRemaining: 999, graceMode: false, lastValidated: '2026-10-16T22:30:00Z', licenseKey: 'IS-2****TEST', machineId: 'synthetic-installation' };
const snapshot = (changes: Record<string, unknown> = {}, usage: unknown = { deviceCount: 12, userCount: 0 }) => ({ license: { ...license, ...changes }, usage, observedAt });
const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
async function open(page: Page, fixtures: Fixtures) {
  await installTestSession(page.context(), fixtures, 'ADMIN');
  await page.goto('/settings/license');
  await expect(page.getByRole('button', { name: 'Bilgileri yenile', exact: true })).toBeEnabled();
}
const card = (page: Page, title: string) => page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
}

test('License: real keyless trial reads count every device/account without changing stored records', async ({ page, fixtures, prisma }) => {
  const device = await prisma.device.create({ data: { name: fixtures.manifest.prefix, type: 'SWITCH', tags: [], pollingEnabled: false } });
  const inactive = await prisma.user.create({ data: { name: 'Inactive fixture', email: fixtures.manifest.prefix + '@example.invalid', role: 'VIEWER', status: 'INACTIVE' } });
  try {
    const before = await Promise.all([prisma.device.findUniqueOrThrow({ where: { id: device.id } }), prisma.user.findMany({ orderBy: { id: 'asc' } }), prisma.license.count(), prisma.licenseActivation.count()]);
    const requests: string[] = [];
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/license/')) requests.push(request.method() + ' ' + new URL(request.url()).pathname); });
    await open(page, fixtures);
    const response = await page.request.get('/api/license/status');
    expect(response.status()).toBe(200); expect(response.headers()['cache-control']).toBe('private, no-store');
    const data = await response.json();
    expect(data.license).toMatchObject({ tier: 'TRIAL', valid: true, licenseKey: '', graceMode: false, maxDevices: 10, maxUsers: 2 });
    expect(data.usage).toEqual({ deviceCount: await prisma.device.count(), userCount: await prisma.user.count() });
    expect(Number.isFinite(Date.parse(data.observedAt))).toBe(true);
    await expect(page.getByRole('region', { name: 'Doğrulama bilgileri', exact: true }).getByRole('definition').filter({ hasText: 'Yerel deneme modu' })).toBeVisible();
    await expect(card(page, 'Cihaz kapasitesi').getByRole('progressbar')).toHaveAttribute('aria-valuetext', /1 \/ 10/);
    await expect(card(page, 'Kullanıcı kapasitesi').getByRole('progressbar')).toHaveAttribute('aria-valuetext', /2 \/ 2/);
    await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bilgileri yenile', exact: true })).toBeEnabled();
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(requests.every(request => request === 'GET /api/license/status')).toBe(true);
    expect(await Promise.all([prisma.device.findUniqueOrThrow({ where: { id: device.id } }), prisma.user.findMany({ orderBy: { id: 'asc' } }), prisma.license.count(), prisma.licenseActivation.count()])).toEqual(before);
  } finally {
    await prisma.device.deleteMany({ where: { id: device.id } });
    await prisma.user.deleteMany({ where: { id: inactive.id } });
  }
});

test('License: overflow, actual zero, masked identity and canonical plan disclosure stay read-only', async ({ page, fixtures }, info) => {
  await page.route('**/api/license/status', route => json(route, snapshot({ licenseKey: 'unexpected-full-synthetic-key' })));
  const writes: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/license/') && request.method() !== 'GET') writes.push(request.url()); });
  await open(page, fixtures);
  await expect(card(page, 'Cihaz kapasitesi')).toContainText('%120 dolu');
  await expect(card(page, 'Cihaz kapasitesi').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await expect(card(page, 'Cihaz kapasitesi')).toContainText('2 adet limitin üzerinde');
  await expect(card(page, 'Kullanıcı kapasitesi').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(card(page, 'Kalan lisans süresi')).toContainText('365 gün');
  await expect(page.getByRole('region', { name: 'Doğrulama bilgileri', exact: true }).getByRole('definition').filter({ hasText: '17.10.2026 01:30' })).toBeVisible();
  const identity = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Lisans ve kurulum kimliği' }) });
  await expect(identity).not.toHaveAttribute('open', '');
  await identity.locator('summary').press('Enter');
  await expect(identity.getByText('••••••••', { exact: true })).toBeVisible();
  await expect(page.getByText('unexpected-full-synthetic-key', { exact: true })).toHaveCount(0);
  await page.locator('summary').filter({ hasText: 'Plan kapsamını karşılaştır' }).press('Enter');
  const table = page.getByRole('table', { name: 'Lisans planlarının özellik kapsamı' });
  const reports = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Temel raporlar', exact: true }) });
  await expect(reports.getByRole('cell')).toHaveText(['Plan kapsamında değil', 'Plan kapsamında', 'Plan kapsamında']);
  await expect(page.getByText(/Özelliğin bu sürümde bulunduğunu/)).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(writes).toEqual([]);
  await capture(page, info, 'license-plan-disclosure');
});

for (const mode of ['missing', 'zero-limit'] as const) {
  test(`License: ${mode} counts never become fabricated capacity or unlimited usage`, async ({ page, fixtures }) => {
    await page.route('**/api/license/status', route => json(route, mode === 'missing' ? snapshot({ licenseKey: undefined, tier: 'UNKNOWN', validUntil: '2027-10-17T12:00:00' }, {}) : snapshot({ maxDevices: 0, maxUsers: 0 }, { deviceCount: 2, userCount: 0 })));
    await open(page, fixtures);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(card(page, 'Cihaz kapasitesi')).toContainText(mode === 'missing' ? 'Bilgi eksik' : 'Limit aşıldı');
    await expect(card(page, 'Kullanıcı kapasitesi')).toContainText(mode === 'missing' ? 'Bilgi eksik' : 'Kapasite yok');
    if (mode === 'missing') {
      await expect(card(page, 'Lisans durumu')).toContainText('Bilgiler eksik');
      await page.locator('summary').filter({ hasText: 'Lisans ve kurulum kimliği' }).press('Enter');
      await expect(page.getByText('Anahtar bilgisi alınamadı', { exact: true }).filter({ visible: true })).toHaveCount(2);
    }
  });
}

test('License: server observation overrides browser clock skew and expiry advances without another request', async ({ page, fixtures }) => {
  await page.clock.install({ time: new Date('2035-01-01T00:00:00Z') });
  let reads = 0;
  await page.route('**/api/license/status', route => { reads++; return json(route, snapshot({ validUntil: '2026-10-17T12:01:00Z' })); });
  await open(page, fixtures);
  await expect(card(page, 'Lisans durumu')).toContainText('Süre azalıyor');
  await expect(card(page, 'Kalan lisans süresi')).toContainText('1 gün');
  const before = reads;
  await page.clock.fastForward(120_000);
  await expect(card(page, 'Lisans durumu')).toContainText('Süresi doldu');
  await expect(card(page, 'Kalan lisans süresi')).toContainText('Süre doldu');
  expect(reads).toBe(before);
});

for (const state of ['grace', 'restricted', 'expired'] as const) {
  test(`License: ${state} is distinct from valid live verification`, async ({ page, fixtures }) => {
    await page.route('**/api/license/status', route => json(route, snapshot(state === 'grace' ? { graceMode: true } : state === 'restricted' ? { valid: false, graceMode: true, validUntil: '' } : { valid: false, validUntil: '2026-10-16T12:00:00Z' })));
    await open(page, fixtures);
    await expect(card(page, 'Lisans durumu')).toContainText(state === 'grace' ? 'Ek süre' : state === 'restricted' ? 'Erişim kısıtlı' : 'Süresi doldu');
    if (state === 'grace') await expect(page.getByText(/bağlantı için tanınan ek süre değildir/)).toBeVisible();
  });
}

test('License: failed refresh retains explicitly stale measurements then recovers with a fresh read', async ({ page, fixtures }, info) => {
  let unavailable = false;
  await page.route('**/api/license/status', route => json(route, snapshot(), unavailable ? 500 : 200));
  await open(page, fixtures);
  unavailable = true;
  await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Lisans bilgileri alınamadı' })).toContainText('son başarılı okumaya aittir');
  await expect(page.getByText('Önceki bilgiler gösteriliyor', { exact: true })).toBeVisible();
  await expect(card(page, 'Cihaz kapasitesi')).toContainText('%120 dolu');
  await capture(page, info, 'license-stale-read');
  unavailable = false;
  await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
  await expect(page.getByText('Uygulamanın bildirdiği durum', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Lisans bilgileri alınamadı' })).toHaveCount(0);
});

for (const failure of ['server', 'malformed'] as const) {
  test(`License: initial ${failure} response leaves state and measurements unknown`, async ({ page, fixtures }) => {
    await page.route('**/api/license/status', route => json(route, failure === 'server' ? snapshot() : { license: {} }, failure === 'server' ? 500 : 200));
    await open(page, fixtures);
    await expect(page.getByRole('alert').filter({ hasText: 'Lisans bilgileri' })).toBeVisible();
    await expect(card(page, 'Lisans durumu')).toContainText('Bilgi alınamadı');
    await expect(card(page, 'Cihaz kapasitesi')).toContainText('Bilgi eksik');
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });
}

for (const denial of ['inactive', 'suspended', 'expired', 'missing'] as const) {
  test(`License: current ${denial} identity cannot read status through a stale ADMIN session`, async ({ page, context, fixtures, prisma }) => {
    await open(page, fixtures);
    try {
      await installTestSession(context, fixtures, 'ADMIN', denial === 'expired');
      if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
      else if (denial === 'inactive' || denial === 'suspended') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: denial === 'inactive' ? 'INACTIVE' : 'SUSPENDED' } });
      const response = await page.request.get('/api/license/status');
      expect(response.status()).toBe(401);
      expect(await response.json()).not.toHaveProperty('license');
      await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Oturumunuz' })).toBeVisible();
      await expect(page.getByText('Önceki bilgiler gösteriliyor', { exact: true })).toBeVisible();
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { status: 'ACTIVE' } });
      await installTestSession(context, fixtures, 'ADMIN');
    }
    expect((await page.request.get('/api/license/status')).status()).toBe(200);
  });
}

for (const role of ['EDITOR', 'VIEWER'] as const) {
  test(`License: current ACTIVE ${role} retains the existing settings read permission`, async ({ page, context, fixtures, prisma }) => {
    await installTestSession(context, fixtures, 'ADMIN');
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role } });
    try {
      const response = await page.request.get('/api/license/status');
      expect(response.status()).toBe(200);
      expect((await response.json()).license.tier).toBe('TRIAL');
    } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); }
  });
}

test('License: mobile light/dark disclosures stay in the viewport and never call issuer actions', async ({ page, fixtures }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/license/status', route => json(route, snapshot()));
  const actions: string[] = [];
  page.on('request', request => { if (/\/api\/license\/(activate|validate|heartbeat)/.test(new URL(request.url()).pathname)) actions.push(request.method()); });
  await open(page, fixtures);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, info, 'license-mobile-light');
  await page.locator('summary').filter({ hasText: 'Plan kapsamını karşılaştır' }).press('Enter');
  await expect(page.getByRole('table', { name: 'Lisans planlarının özellik kapsamı' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await capture(page, info, 'license-mobile-dark-plan');
  expect(actions).toEqual([]);
});
