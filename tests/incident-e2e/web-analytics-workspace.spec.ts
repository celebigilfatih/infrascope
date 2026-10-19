import { expect, type Page, type Route, type TestInfo } from '@playwright/test';
import { test as base, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { protectIntegrationConfig } from '../../lib/security/integration-credentials';
import type { AnalyzerProfile } from '../../lib/integrations/fortianalyzer-workspace';

const metadata = '/api/integrations/fortianalyzer/workspace', analytics = '/api/integrations/fortianalyzer/analytics';
const test = base.extend<{ profiles: AnalyzerProfile[] }>({
  profiles: async ({ prisma, fixtures }, use) => {
    const prefix = fixtures.manifest.prefix;
    try {
      for (const name of ['A', 'B']) await prisma.integrationConfig.create({ data: { type: 'FORTIANALYZER', name: prefix + name, enabled: false, config: protectIntegrationConfig({ host: `faz-${name.toLowerCase()}.example.invalid`, adom: `Test ${name}`, authMode: 'session', username: 'fixture', password: 'synthetic-fixture' }, 'FORTIANALYZER') } });
      const records = await prisma.integrationConfig.findMany({ where: { name: { startsWith: prefix } }, orderBy: { name: 'asc' } });
      await use(records.map((row, index) => ({ id: row.id, name: row.name, enabled: true, host: `faz-${index}.example.invalid`, adom: `Test ${index ? 'B' : 'A'}`, authMode: 'session', username: 'fixture', passwordSet: true, apiKeySet: false, updatedAt: row.updatedAt.toISOString(), collector: null })));
    } finally { await prisma.integrationConfig.deleteMany({ where: { name: { startsWith: prefix } } }); }
  },
});
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const source = (page: Page) => page.getByLabel('FortiAnalyzer kaynağı', { exact: true });
const sites = (page: Page) => page.getByRole('region', { name: 'Web siteleri', exact: true });
const rowName = 'site-0.example.invalid';
function rows(view: string) {
  if (view === 'top-browsing-users') return Array.from({ length: 100 }, (_, i) => ({ f_user: `TEST user ${i}`, srcip: `192.0.2.${i + 1}`, bandwidth: 100 - i, sessions: i, session_block: 0 }));
  if (view === 'policy-hits') return [{ policy: 'TEST policy', policyid: 0, counts: 0, count_block: 0, srcintf: 'TEST LAN', dstintf: 'TEST WAN' }];
  if (view === 'top-applications') return [{ app: 'TEST app', bandwidth: 0, sessions: 0 }];
  return Array.from({ length: 12 }, (_, i) => ({ domain: `site-${i}.example.invalid`, catdesc: i < 6 ? 'TEST News' : 'TEST Services', bandwidth: i === 11 ? undefined : 12000 - i * 1000, sessions: i, session_block: 0, traffic_in: 0, fortigate: i % 2 ? 'TEST Branch' : 'TEST HQ', threatweight: i === 0 ? 5 : undefined }));
}
function envelope(route: Route, profiles: AnalyzerProfile[], data?: unknown[]) {
  const q = new URL(route.request().url()).searchParams, profile = profiles.find(row => row.id === q.get('configId'))!;
  const end = q.get('end')!, minutes = Number(q.get('minutes'));
  return { success: true, view: q.get('view'), scope: { configId: profile.id, adom: profile.adom, profileUpdatedAt: q.get('profileUpdatedAt'), minutes, start: new Date(Date.parse(end) - minutes * 60_000).toISOString(), end }, collectedAt: new Date().toISOString(), totalCount: data ? data.length : 300, data: data || rows(q.get('view')!) };
}
async function transport(page: Page, profiles: AnalyzerProfile[]) {
  const reads: URL[] = [];
  await page.route('**' + metadata, route => route.fulfill({ json: { success: true, profiles } }));
  await page.route('**' + analytics + '?**', route => { reads.push(new URL(route.request().url())); return route.fulfill({ json: envelope(route, profiles) }); });
  return reads;
}
async function open(page: Page, fixtures: Fixtures, id?: string) { await installTestSession(page.context(), fixtures, 'ADMIN'); await page.goto('/security/web-analytics'); await expect(button(page, 'Verileri yenile')).toBeEnabled(); if (id) { await source(page).selectOption(id); await expect(sites(page).getByText(rowName, { exact: true }).filter({ visible: true })).toBeVisible(); } }
async function capture(page: Page, info: TestInfo, name: string) { await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' }); }

test('web analytics: explicit source, shared UTC window and lazy views remain read-only', async ({ page, fixtures, profiles, prisma }, info) => {
  const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } }), reads = await transport(page, profiles);
  await open(page, fixtures); expect(reads).toHaveLength(0); await source(page).selectOption(profiles[0].id);
  await expect(sites(page).getByText(rowName, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Web trafiği özeti' })).toContainText('Bilgi yok');
  for (const name of ['Kategoriler', 'Kullanıcılar', 'Politika eşleşmeleri', 'Uygulamalar']) { await page.getByRole('tab', { name, exact: true }).click(); await expect(page.getByRole('tabpanel')).not.toContainText('Analiz kayıtları okunuyor'); }
  await expect.poll(() => new Set(reads.map(url => url.searchParams.get('view'))).size).toBe(4);
  expect(new Set(reads.map(url => url.searchParams.get('end'))).size).toBe(1); expect(reads.every(url => url.searchParams.get('configId') === profiles[0].id && url.searchParams.get('minutes') === '60' && url.searchParams.get('profileUpdatedAt') === profiles[0].updatedAt)).toBe(true);
  expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  await page.getByRole('tab', { name: 'Web siteleri', exact: true }).click(); await capture(page, info, 'web-analytics-desktop');
});

test('web analytics: all returned users, pagination, filters, zero and missing details', async ({ page, fixtures, profiles }) => {
  await transport(page, profiles); await open(page, fixtures, profiles[0].id);
  await button(page, 'Web siteleri: sonraki sayfa').click(); await expect(sites(page).getByRole('status')).toHaveText('12 kayıt · Sayfa 2 / 2');
  await page.getByLabel('Tehdit skoru bulunanlar', { exact: true }).check(); await expect(sites(page).getByRole('status')).toHaveText('1 kayıt · Sayfa 1 / 1');
  await button(page, rowName + ': analiz ayrıntıları').click(); const detail = page.getByRole('dialog'); await expect(detail).toContainText('0 B'); await expect(detail).toContainText('Bilgi yok'); await button(page, 'Kapat').click();
  await page.getByRole('tab', { name: 'Kullanıcılar', exact: true }).click(); await page.getByLabel('Kullanıcılar içinde ara', { exact: true }).fill('TEST user 99'); await expect(page.getByRole('region', { name: 'Kullanıcılar', exact: true }).getByRole('status')).toHaveText('1 kayıt · Sayfa 1 / 1');
  await page.getByRole('tab', { name: 'Kategoriler', exact: true }).click(); await expect(page.getByRole('region', { name: 'Kategori dağılımı' })).toContainText('Trafik payı hesaplanamıyor');
  await page.getByRole('tab', { name: 'Uygulamalar', exact: true }).click(); await button(page, 'TEST app: analiz ayrıntıları').click(); await expect(page.getByRole('dialog').getByText('Kaynağın uygulama risk puanı').locator('..')).toContainText('Bilgi yok');
});

for (const code of ['PROFILE_CHANGED', 'PROFILE_DISABLED', 'SOURCE_TIMEOUT', 'SOURCE_FAILED']) test('web analytics: HTTP failure preserves ' + code + ' and independent user data', async ({ page, fixtures, profiles }) => {
  await transport(page, profiles); await page.route('**' + analytics + '?**', route => new URL(route.request().url()).searchParams.get('view') === 'top-websites' ? route.fulfill({ status: 503, json: { success: false, code, error: 'private-provider-error' } }) : route.fallback());
  await open(page, fixtures); await source(page).selectOption(profiles[0].id);
  const messages = { PROFILE_CHANGED: 'Kaynak ayarları değişmiş.', PROFILE_DISABLED: 'profili devre dışı', SOURCE_TIMEOUT: 'zaman aşımına', SOURCE_FAILED: 'verilerini döndürmedi' };
  await expect(page.getByRole('alert').filter({ hasText: 'Web kayıtları:' })).toContainText(messages[code as keyof typeof messages]); await expect(page.getByText('private-provider-error')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Kullanıcılar', exact: true }).click(); await expect(page.getByRole('region', { name: 'Kullanıcılar', exact: true }).getByRole('status')).toContainText('100 kayıt');
  await page.unroute('**' + analytics + '?**'); await page.route('**' + analytics + '?**', route => route.fulfill({ json: envelope(route, profiles) }));
  await page.getByRole('alert').filter({ hasText: 'Web kayıtları:' }).getByRole('button', { name: 'Yeniden dene' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Web kayıtları:' })).toHaveCount(0);
});

test('web analytics: confirmed empty differs from malformed scope and initial failure', async ({ page, fixtures, profiles }) => {
  await transport(page, profiles); await page.route('**' + analytics + '?**', route => route.fulfill({ json: envelope(route, profiles, []) })); await open(page, fixtures); await source(page).selectOption(profiles[0].id);
  await expect(sites(page)).toContainText('Kaynak bu zaman aralığında kayıt döndürmedi'); await expect(page.getByRole('region', { name: 'Web trafiği özeti' })).toContainText('0 B');
  await page.unroute('**' + analytics + '?**'); await page.route('**' + analytics + '?**', route => { const value = envelope(route, profiles); value.scope.adom = 'wrong'; return route.fulfill({ json: value }); });
  await page.getByLabel('Zaman aralığı', { exact: true }).selectOption('15'); await expect(sites(page)).toContainText('Bu görünümün verileri alınamadı'); await expect(sites(page)).not.toContainText('kayıt döndürmedi'); await expect(page.getByRole('alert').filter({ hasText: 'Web kayıtları:' })).toContainText('veri doğrulanamadı');
});

test('web analytics: late source response cannot replace the newly selected scope', async ({ page, fixtures, profiles }) => {
  const reads = await transport(page, profiles); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let waiting = false;
  await page.route('**' + analytics + '?**', async route => { if (new URL(route.request().url()).searchParams.get('configId') !== profiles[0].id) return route.fallback(); waiting = true; await gate; const value = envelope(route, profiles); value.data = [{ domain: 'old-source.example.invalid' }]; await route.fulfill({ json: value }).catch(() => {}); });
  try { await open(page, fixtures); await source(page).selectOption(profiles[0].id); await expect.poll(() => waiting).toBe(true); await source(page).selectOption(profiles[1].id); await expect(sites(page).getByText(rowName, { exact: true }).filter({ visible: true })).toBeVisible(); release(); await expect(page.getByText('old-source.example.invalid')).toHaveCount(0); await page.getByLabel('Zaman aralığı', { exact: true }).selectOption('360'); await expect.poll(() => reads.some(url => url.searchParams.get('configId') === profiles[1].id && url.searchParams.get('minutes') === '360')).toBe(true); }
  finally { release(); }
});

test('web analytics: real route rejects disabled, wrong type, missing and stale profiles before source I/O', async ({ page, fixtures, profiles, prisma }) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); const query = new URLSearchParams({ configId: profiles[0].id, profileUpdatedAt: profiles[0].updatedAt!, view: 'top-websites', minutes: '60', end: new Date().toISOString() });
  let response = await page.request.get(analytics + '?' + query); expect(response.status()).toBe(409); expect((await response.json()).code).toBe('PROFILE_DISABLED'); expect(response.headers()['cache-control']).toBe('private, no-store');
  // Invalid profile parsing fails locally before a source service can be resolved.
  await prisma.integrationConfig.update({ where: { id: profiles[0].id }, data: { enabled: true, config: {} } });
  response = await page.request.get(analytics + '?' + query); expect(response.status()).toBe(409); expect((await response.json()).code).toBe('PROFILE_CHANGED');
  await prisma.integrationConfig.update({ where: { id: profiles[0].id }, data: { enabled: false, type: 'ZABBIX' } });
  expect((await page.request.get(analytics + '?' + query)).status()).toBe(404); query.set('configId', 'missing'); expect((await page.request.get(analytics + '?' + query)).status()).toBe(404);
  await page.context().clearCookies({ name: SESSION_COOKIE_NAME }); expect((await page.request.get(analytics + '?' + query)).status()).toBe(401);
});

test('web analytics: disabled and empty installations never request source data', async ({ page, fixtures, profiles }) => {
  const reads = await transport(page, profiles.map(row => ({ ...row, enabled: false }))); await open(page, fixtures); await source(page).selectOption(profiles[0].id); await expect(page.getByRole('heading', { name: 'Seçili bağlantı devre dışı' })).toBeVisible(); expect(reads).toHaveLength(0);
  await page.unroute('**' + metadata); await page.route('**' + metadata, route => route.fulfill({ json: { success: true, profiles: [] } })); await button(page, 'Verileri yenile').click(); await expect(page.getByRole('heading', { name: 'FortiAnalyzer bağlantısı bulunmuyor' })).toBeVisible(); expect(reads).toHaveLength(0);
});

test('web analytics: failed metadata refresh retains the prior list and recovers', async ({ page, fixtures, profiles }) => {
  await transport(page, profiles); await open(page, fixtures, profiles[0].id); await page.route('**' + metadata, route => route.fulfill({ status: 503, body: 'private-error' })); await button(page, 'Kaynak listesini yenile').click(); await expect(page.getByRole('alert').filter({ hasText: 'Önceki kaynak listesi korunuyor.' })).toBeVisible(); await expect(sites(page).getByText(rowName, { exact: true }).filter({ visible: true })).toBeVisible();
  await page.unroute('**' + metadata); await page.route('**' + metadata, route => route.fulfill({ json: { success: true, profiles } })); await button(page, 'Kaynak listesini yenile').click(); await expect(button(page, 'Verileri yenile')).toBeEnabled(); await expect(page.getByRole('alert').filter({ hasText: 'Önceki kaynak listesi korunuyor.' })).toHaveCount(0);
});

test('web analytics: mobile light/dark details remain keyboard accessible without overflow', async ({ page, fixtures, profiles }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await transport(page, profiles); await open(page, fixtures, profiles[0].id); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await capture(page, info, 'web-analytics-mobile-light'); await page.evaluate(() => document.documentElement.classList.add('dark')); await capture(page, info, 'web-analytics-mobile-dark');
  await button(page, 'Analiz ayrıntıları').filter({ visible: true }).first().focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible(); expect(await page.getByRole('dialog').evaluate(el => el.getBoundingClientRect().width <= innerWidth)).toBe(true); await capture(page, info, 'web-analytics-mobile-detail'); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});
