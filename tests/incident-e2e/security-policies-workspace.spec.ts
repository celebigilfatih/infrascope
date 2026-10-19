import { expect, type Page, type TestInfo } from '@playwright/test';
import { test as base, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { protectIntegrationConfig } from '../../lib/security/integration-credentials';
import type { FirewallListItem } from '../../components/firewall/types';
import { normalizeSecurityPolicies } from '../../lib/security/policies';

const endpoint = '/api/firewall-policies/workspace', list = '/api/firewalls';
const test = base.extend<{ targets: FirewallListItem[] }>({
  targets: async ({ prisma, fixtures }, use) => {
    const prefix = fixtures.manifest.prefix;
    try {
      const integration = await prisma.integrationConfig.create({ data: { name: prefix + ' FortiGate', type: 'FORTIGATE', enabled: false, syncInterval: 1440, config: protectIntegrationConfig({ host: 'policies.example.invalid', accessToken: 'synthetic-only', vdom: 'root', syncMode: 'rest' }, 'FORTIGATE') } });
      for (const vdom of ['root', 'Branch']) {
        const device = await prisma.device.create({ data: { name: prefix + ' ' + vdom, type: 'FIREWALL', tags: [], pollingEnabled: false } });
        await prisma.firewallConnector.create({ data: { integrationConfigId: integration.id, deviceId: device.id, managementHost: 'policies.example.invalid', vdom, identityStatus: 'VERIFIED' } });
      }
      const connectors = await prisma.firewallConnector.findMany({ where: { integrationConfigId: integration.id }, include: { device: true }, orderBy: { createdAt: 'asc' } });
      await use(connectors.map(row => ({ id: row.id, configId: integration.id, name: integration.name, host: row.managementHost, vdom: row.vdom, enabled: true, credentialSet: true, requiresInventoryLink: false, identity: { status: 'VERIFIED', serialNumber: null, analyzerDeviceId: null, identityKey: null, candidateKey: null, conflictWithId: null }, monitoring: null, device: { id: row.device.id, name: row.device.name, type: 'FIREWALL', vendor: null, model: null, serialNumber: null, firmwareVersion: null, status: 'UNKNOWN', criticality: 'MEDIUM', managementIp: null }, lastSyncAt: null, lastSyncStatus: null })));
    } finally { await prisma.integrationConfig.deleteMany({ where: { name: { startsWith: prefix } } }); await prisma.device.deleteMany({ where: { name: { startsWith: prefix } } }); }
  },
});
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const selector = (page: Page) => page.getByLabel('Güvenlik duvarı ve sanal alan (VDOM)', { exact: true });
const collection = (page: Page) => page.getByRole('region', { name: 'Güvenlik politikaları', exact: true });
const selection = (target: FirewallListItem) => JSON.stringify([target.configId, target.vdom]);
function records(prefix = 'TEST') {
  return normalizeSecurityPolicies([
    { policyid: 200, name: prefix + ' Web', action: 'accept', status: 'disable', srcintf: [{ name: 'lan' }], dstintf: [{ name: 'wan' }], srcaddr: [{ name: 'TEST group' }, { name: '2001:db8::/64' }, { name: 'TEST extra source 3' }], dstaddr: [{ name: 'all' }], service: [{ name: 'HTTPS' }, { name: 'DNS' }, { name: 'TEST service 3' }], hit_count: '9007199254740993', last_used: '2026-10-19T10:00:00+03:00', schedule: 'always', nat: 'enable', logtraffic: 'all', comments: 'TEST complete description' },
    { policyid: 0, name: prefix + ' Deny', action: 'deny', status: 'enable', srcintf: [], dstintf: [], srcaddr: [], dstaddr: [], service: [], hit_count: 0 },
    { policyid: 5, name: prefix + ' Unknown', action: 'other-source-action-' + 'x'.repeat(60), hit_count: Number.MAX_SAFE_INTEGER + 1, last_used: '2026-10-19 10:00:00' },
    ...Array.from({ length: 10 }, (_, i) => ({ policyid: 109 - i, name: prefix + ' Rule ' + i, status: i % 2 ? 'enable' : 'disable', action: i % 2 ? 'deny' : 'accept', dstaddr: [{ name: 'TEST server' }], hit_count: 0 })),
  ]);
}
function envelope(target: FirewallListItem, data = records()) { return { success: true, source: 'fortigate-rest', target: { configId: target.configId, vdom: target.vdom, host: target.host }, collectedAt: new Date().toISOString(), data }; }
async function transport(page: Page, targets: FirewallListItem[]) {
  const reads: URL[] = [], writes: string[] = [];
  page.on('request', request => { if ([endpoint, list].includes(new URL(request.url()).pathname) && request.method() !== 'GET') writes.push(request.method()); });
  await page.route('**' + list, route => route.fulfill({ json: { success: true, data: targets } }));
  await page.route('**' + endpoint + '?**', route => { const url = new URL(route.request().url()); reads.push(url); const target = targets.find(row => row.configId === url.searchParams.get('configId') && row.vdom === url.searchParams.get('vdom'))!; return route.fulfill({ json: envelope(target, records(target.vdom === 'root' ? 'TEST' : 'BRANCH')) }); });
  return { reads, writes };
}
async function open(page: Page, fixtures: Fixtures, target?: FirewallListItem) { await installTestSession(page.context(), fixtures, 'ADMIN'); await page.goto('/security/policies'); await expect(button(page, 'Verileri yenile')).toBeEnabled(); if (target) { await selector(page).selectOption(selection(target)); await expect(collection(page).getByRole('status')).toContainText('13 / 13 kayıt'); } }
async function capture(page: Page, info: TestInfo, name: string) { await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' }); }
const actualUrl = (target: FirewallListItem) => endpoint + '?' + new URLSearchParams({ configId: target.configId, vdom: target.vdom, expectedHost: target.host });

test('security policies: explicit same-config VDOM selection preserves returned order without writes', async ({ page, fixtures, targets, prisma }, info) => {
  const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } }), state = await transport(page, targets); await open(page, fixtures); expect(state.reads).toHaveLength(0); await selector(page).selectOption(selection(targets[0])); await expect(collection(page).getByRole('status')).toContainText('13 / 13 kayıt');
  const table = collection(page).getByRole('table'); await expect(table).toBeVisible(); await expect(table.locator('tbody tr').nth(0)).toContainText('Kural no: 200'); await expect(table.locator('tbody tr').nth(1)).toContainText('Kural no: 0'); await expect(table.locator('tbody tr').nth(2)).toContainText('Kural no: 5'); await expect(table.locator('tbody tr').nth(0)).toContainText('Kural kapalı'); await expect(table.locator('tbody tr').nth(0)).toContainText('İzin ver'); await expect(table.locator('tbody tr').nth(2)).toContainText('Bilgi yok');
  await expect.poll(() => table.getByText(/^Diğer işlem:/).evaluate(label => { const cell = label.closest('td')!.getBoundingClientRect(), box = label.getBoundingClientRect(); return box.left >= cell.left && box.right <= cell.right; })).toBe(true);
  await button(page, 'Sonraki sayfa').click(); await expect(collection(page).getByRole('status')).toContainText('Sayfa 2 / 2'); await button(page, 'Önceki sayfa').click(); await capture(page, info, 'security-policies-desktop'); await selector(page).selectOption(selection(targets[1])); await expect(collection(page)).toContainText('BRANCH Web'); expect(state.reads.at(-1)?.searchParams.get('expectedHost')).toBe(targets[1].host); expect(state.reads.at(-1)?.searchParams.get('vdom')).toBe('Branch'); expect(state.writes).toEqual([]); expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
});

test('security policies: full-list search, independent state/action filters and exact details', async ({ page, fixtures, targets }) => {
  const state = await transport(page, targets); await open(page, fixtures, targets[0]); const count = state.reads.length;
  await page.getByLabel('Politikalarda ara', { exact: true }).fill('TEST service 3'); await expect(collection(page).getByRole('status')).toContainText('1 / 13 kayıt'); await button(page, 'Kural 200: politika ayrıntıları').click(); let dialog = page.getByRole('dialog'); await expect(dialog).toContainText('TEST extra source 3'); await expect(dialog).toContainText('TEST service 3'); await expect(dialog).toContainText('9.007.199.254.740.993'); await expect(dialog).toContainText('19.10.2026 10:00'); await expect(dialog).toContainText('TEST complete description'); await expect(dialog).toContainText('Tüm trafik'); await expect(dialog).toContainText('Açık'); await expect(dialog).toContainText('Kural kapalı'); await expect(dialog).toContainText('İzin ver'); await button(page, 'Kapat').click();
  await button(page, 'Filtreleri temizle').click(); await page.getByLabel('Kural durumu', { exact: true }).selectOption('unknown'); await expect(collection(page).getByRole('status')).toContainText('1 / 13 kayıt'); await button(page, 'Kural 5: politika ayrıntıları').click(); dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Bilgi yok'); await expect(dialog).not.toContainText('Tüm adresler'); await button(page, 'Kapat').click(); await button(page, 'Filtreleri temizle').click(); await page.getByLabel('Tanımlı işlem', { exact: true }).selectOption('deny'); await expect(collection(page)).not.toContainText('TEST Web'); expect(state.reads).toHaveLength(count);
});

for (const failure of ['http', 'scope', 'duplicate', 'malformed'] as const) test('security policies: ' + failure + ' refresh retains marked previous definitions and recovers', async ({ page, fixtures, targets }) => {
  await transport(page, targets); await open(page, fixtures, targets[0]); await page.route('**' + endpoint + '?**', route => { const value = envelope(targets[0]); if (failure === 'scope') value.target.host = 'wrong.example.invalid'; if (failure === 'duplicate') value.data[1] = { ...value.data[0], position: 2 }; if (failure === 'malformed') value.data[0].hitCount = '-1'; return route.fulfill({ status: failure === 'http' ? 503 : 200, json: failure === 'http' ? { success: false, error: 'private-provider-error' } : value }); });
  await button(page, 'Verileri yenile').click(); await expect(page.getByRole('alert').filter({ hasText: 'Önceki politika listesi gösteriliyor' })).toBeVisible(); await expect(collection(page)).toContainText('Önceki veri'); await button(page, 'Kural 200: politika ayrıntıları').click(); await expect(page.getByRole('dialog')).toContainText('Önceki veri'); await expect(page.getByText('private-provider-error')).toHaveCount(0); await button(page, 'Kapat').click(); await page.unroute('**' + endpoint + '?**'); await page.route('**' + endpoint + '?**', route => route.fulfill({ json: envelope(targets[0]) })); await button(page, 'Verileri yenile').click(); await expect(button(page, 'Verileri yenile')).toBeEnabled(); await expect(page.getByRole('alert').filter({ hasText: 'Önceki politika listesi gösteriliyor' })).toHaveCount(0); await expect(collection(page)).toContainText('FortiGate REST');
});

test('security policies: failed metadata refresh marks retained source definitions as previous data', async ({ page, fixtures, targets }) => {
  await transport(page, targets); await open(page, fixtures, targets[0]); await page.route('**' + list, route => route.fulfill({ status: 503, json: { success: false } })); await button(page, 'Verileri yenile').click(); await expect(page.getByRole('alert').filter({ hasText: 'Önceki cihaz listesi korunuyor' })).toBeVisible(); await expect(collection(page)).toContainText('Önceki veri'); await expect(collection(page)).toContainText('TEST Web');
});

test('security policies: genuine empty results differ from unavailable initial data', async ({ page, fixtures, targets }) => {
  await transport(page, targets); await page.route('**' + endpoint + '?**', route => route.fulfill({ json: envelope(targets[0], []) })); await open(page, fixtures); await selector(page).selectOption(selection(targets[0])); await expect(collection(page)).toContainText('Son başarılı okumada boş liste alındı.'); await expect(collection(page).getByRole('status')).toContainText('0 / 0 kayıt');
  await page.unroute('**' + endpoint + '?**'); await page.route('**' + endpoint + '?**', route => route.fulfill({ status: 503, json: { success: false, data: [] } })); await selector(page).selectOption(selection(targets[1])); await expect(page.getByRole('heading', { name: 'Politika bilgisi alınamadı' })).toBeVisible(); await expect(collection(page).getByRole('status')).toHaveCount(0); await expect(page.getByRole('region', { name: 'Politika özeti' })).toContainText('Bilgi yok');
});

test('security policies: single-source auto selection, disabled source and empty installation', async ({ page, fixtures, targets }) => {
  const state = await transport(page, [targets[0]]); await open(page, fixtures); await expect(collection(page).getByRole('status')).toContainText('13 / 13 kayıt'); expect(state.reads.length).toBeGreaterThan(0);
  await page.unroute('**' + list); await page.route('**' + list, route => route.fulfill({ json: { success: true, data: [{ ...targets[0], enabled: false }] } })); const reads = state.reads.length; await button(page, 'Verileri yenile').click(); await expect(page.getByRole('heading', { name: 'Bağlantı devre dışı' })).toBeVisible(); expect(state.reads).toHaveLength(reads);
  await page.unroute('**' + list); await page.route('**' + list, route => route.fulfill({ json: { success: true, data: [] } })); await button(page, 'Verileri yenile').click(); await expect(page.getByRole('heading', { name: 'Henüz güvenlik duvarı eklenmemiş' })).toBeVisible();
});

test('security policies: late old VDOM data cannot replace the newly selected scope', async ({ page, fixtures, targets }) => {
  await transport(page, targets); let release!: () => void, complete!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }), done = new Promise<void>(resolve => { complete = resolve; }); let pending = false;
  await page.route('**' + endpoint + '?**', async route => { if (new URL(route.request().url()).searchParams.get('vdom') !== targets[0].vdom) return route.fallback(); pending = true; await gate; try { await route.fulfill({ json: envelope(targets[0], records('OLD SCOPE')) }); } catch { /* The actual component cancelled its old read. */ } finally { complete(); } });
  try { await open(page, fixtures); await selector(page).selectOption(selection(targets[0])); await expect.poll(() => pending).toBe(true); await selector(page).selectOption(selection(targets[1])); await expect(collection(page)).toContainText('BRANCH Web'); release(); await done; await expect(page.getByText('OLD SCOPE Web', { exact: true })).toHaveCount(0); await expect(collection(page)).toContainText('BRANCH Web'); } finally { release(); }
});

for (const role of ['ADMIN', 'EDITOR', 'VIEWER'] as const) test('security policies: real current ' + role + ' may read metadata and reaches local target/query guards without writes', async ({ page, context, fixtures, targets, prisma }) => {
  await installTestSession(context, fixtures, 'ADMIN'); const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } }), audit = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
  try { await prisma.user.update({ where: { id: fixtures.userId }, data: { role } }); const response = await page.request.get(actualUrl(targets[0])); expect(response.status()).toBe(409); expect((await response.json()).code).toBe('TARGET_DISABLED'); expect(response.headers()['cache-control']).toBe('private, no-store'); expect((await page.request.get(endpoint)).status()).toBe(400); expect((await page.request.get(actualUrl({ ...targets[0], configId: 'missing' }))).status()).toBe(404); expect((await page.request.get(list)).status()).toBe(200); expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } })).toEqual(before); expect(await prisma.auditLog.findMany({ orderBy: { id: 'asc' } })).toEqual(audit); }
  finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); }
});

for (const denial of ['inactive', 'suspended', 'expired', 'missing'] as const) test('security policies: real ' + denial + ' session cannot read source or metadata', async ({ page, context, fixtures, targets, prisma }) => {
  await installTestSession(context, fixtures, 'ADMIN', denial === 'expired'); try { if (denial === 'inactive' || denial === 'suspended') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: denial === 'inactive' ? 'INACTIVE' : 'SUSPENDED' } }); if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME }); expect((await page.request.get(actualUrl(targets[0]))).status()).toBe(401); expect((await page.request.get(list)).status()).toBe(401); }
  finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { status: 'ACTIVE' } }); }
});

test('security policies: mobile light/dark cards and keyboard details fit long source definitions', async ({ page, fixtures, targets }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await transport(page, targets); await open(page, fixtures, targets[0]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await capture(page, info, 'security-policies-mobile-light'); await page.evaluate(() => document.documentElement.classList.add('dark')); await capture(page, info, 'security-policies-mobile-dark'); await button(page, 'Politika ayrıntıları').filter({ visible: true }).first().focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toContainText('2001:db8::/64'); await expect.poll(() => page.getByRole('dialog').evaluate(el => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight; })).toBe(true); await page.getByRole('dialog').evaluate(el => { el.scrollTop = 0; }); await capture(page, info, 'security-policies-mobile-detail'); await page.getByRole('dialog').getByRole('button', { name: 'Kapat', exact: true }).scrollIntoViewIfNeeded(); await expect.poll(() => page.getByRole('dialog').getByRole('button', { name: 'Kapat', exact: true }).evaluate(button => { const box = button.getBoundingClientRect(), panel = button.closest('[role=dialog]')!.getBoundingClientRect(); return box.top >= panel.top && box.bottom <= panel.bottom && box.top >= 0 && box.bottom <= innerHeight; })).toBe(true); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});
