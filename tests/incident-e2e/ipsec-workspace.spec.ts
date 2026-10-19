import { expect, type Page, type TestInfo } from '@playwright/test';
import { test as base, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { protectIntegrationConfig } from '../../lib/security/integration-credentials';
import type { FirewallListItem } from '../../components/firewall/types';
import { buildIpsecSnapshot } from '../../lib/security/ipsec';

const endpoint = '/api/integrations/fortigate/ipsec/workspace', list = '/api/firewalls';
const test = base.extend<{ targets: FirewallListItem[] }>({
  targets: async ({ prisma, fixtures }, use) => {
    const prefix = fixtures.manifest.prefix;
    try {
      const integration = await prisma.integrationConfig.create({ data: { name: prefix + ' FortiGate', type: 'FORTIGATE', enabled: false, syncInterval: 1440, config: protectIntegrationConfig({ host: 'ipsec.example.invalid', accessToken: 'synthetic-only', vdom: 'root', syncMode: 'rest' }, 'FORTIGATE') } });
      for (const vdom of ['root', 'Branch']) {
        const device = await prisma.device.create({ data: { name: prefix + ' ' + vdom, type: 'FIREWALL', tags: [], pollingEnabled: false } });
        await prisma.firewallConnector.create({ data: { integrationConfigId: integration.id, deviceId: device.id, managementHost: 'ipsec.example.invalid', vdom, identityStatus: 'VERIFIED' } });
      }
      const connectors = await prisma.firewallConnector.findMany({ where: { integrationConfigId: integration.id }, include: { device: true }, orderBy: { createdAt: 'asc' } });
      await use(connectors.map(row => ({ id: row.id, configId: integration.id, name: integration.name, host: row.managementHost, vdom: row.vdom, enabled: true, credentialSet: true, requiresInventoryLink: false, identity: { status: 'VERIFIED', serialNumber: null, analyzerDeviceId: null, identityKey: null, candidateKey: null, conflictWithId: null }, monitoring: null, device: { id: row.device.id, name: row.device.name, type: 'FIREWALL', vendor: null, model: null, serialNumber: null, firmwareVersion: null, status: 'UNKNOWN', criticality: 'MEDIUM', managementIp: null }, lastSyncAt: null, lastSyncStatus: null })));
    } finally { await prisma.integrationConfig.deleteMany({ where: { name: { startsWith: prefix } } }); await prisma.device.deleteMany({ where: { name: { startsWith: prefix } } }); }
  },
});
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const selector = (page: Page) => page.getByLabel('Güvenlik duvarı ve sanal alan (VDOM)', { exact: true });
const collection = (page: Page) => page.getByRole('region', { name: 'IPsec tünelleri', exact: true });
const selection = (target: FirewallListItem) => JSON.stringify([target.configId, target.vdom]);
function snapshot(prefix = 'TEST', configErrorCode: string | null = null) {
  const monitor = [
    { name: prefix + ' HQ', rgwy: '198.51.100.10', proxyid: [{ p2name: 'TEST LAN', status: 'up' }, { p2name: 'TEST APP', status: 'down' }], incoming_bytes: 0, outgoing_bytes: '9007199254740993', connection_count: 0, tun_id: '10.0.0.1', comments: 'TEST full tunnel description', psksecret: 'PRIVATE_MONITOR_SECRET' },
    { name: prefix + ' Dialup_1', parent: prefix + ' Dialup', rgwy: '2001:db8::10', proxyid: [{ status: 'up' }, { status: 'up' }], incoming_bytes: 1024, outgoing_bytes: 1536, connection_count: 1, username: 'TEST peer identity' },
    { name: prefix + ' Unknown', proxyid: [{ status: 'up' }, {}], incoming_bytes: Number.MAX_SAFE_INTEGER + 1 },
    { name: prefix + ' Down', proxyid: [{ status: 'down' }, { status: 'down' }] },
    { name: prefix + ' NoPhase' },
    ...Array.from({ length: 10 }, (_, i) => ({ name: prefix + ' Extra ' + i, proxyid: [{ p2name: 'TEST late phase ' + i, status: i % 2 ? 'up' : 'down' }], incoming_bytes: 0, outgoing_bytes: 0 })),
  ];
  const config = [{ name: prefix + ' HQ', interface: 'wan1', 'local-gw': '192.0.2.1', 'local-gw6': '2001:db8::1', 'ike-version': 2, type: 'static', psksecret: 'PRIVATE_CONFIG_SECRET' }, { name: prefix + ' Dialup', interface: 'wan2', 'local-gw6': '0::0', type: 'dynamic' }];
  return buildIpsecSnapshot(monitor, configErrorCode ? null : config, { monitorAt: new Date().toISOString(), configAt: configErrorCode ? null : new Date(Date.now() - 900000).toISOString(), configErrorCode });
}
function envelope(target: FirewallListItem, data = snapshot()) { return { success: true, source: 'fortigate-rest', target: { configId: target.configId, vdom: target.vdom, host: target.host }, data }; }
async function transport(page: Page, targets: FirewallListItem[]) {
  const reads: URL[] = [], writes: string[] = [];
  page.on('request', request => { if ((new URL(request.url()).pathname.startsWith('/api/integrations/fortigate') || new URL(request.url()).pathname === list) && request.method() !== 'GET') writes.push(request.method()); });
  await page.route('**' + list, route => route.fulfill({ json: { success: true, data: targets } }));
  await page.route('**' + endpoint + '?**', route => { const url = new URL(route.request().url()); reads.push(url); const target = targets.find(row => row.configId === url.searchParams.get('configId') && row.vdom === url.searchParams.get('vdom'))!; return route.fulfill({ json: envelope(target, snapshot(target.vdom === 'root' ? 'TEST' : 'BRANCH')) }); });
  return { reads, writes };
}
async function open(page: Page, fixtures: Fixtures, target?: FirewallListItem) { await installTestSession(page.context(), fixtures, 'ADMIN'); await page.goto('/network/ipsec'); await expect(button(page, 'Verileri yenile')).toBeEnabled(); if (target) { await selector(page).selectOption(selection(target)); await expect(collection(page).getByRole('status')).toContainText('15 / 15 kayıt'); } }
async function capture(page: Page, info: TestInfo, name: string) { await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' }); }
const actualUrl = (target: FirewallListItem) => endpoint + '?' + new URLSearchParams({ configId: target.configId, vdom: target.vdom, expectedHost: target.host });

test('IPsec: exact same-config VDOM selection, all-child states and read-only paging', async ({ page, fixtures, targets, prisma }, info) => {
  const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } }), state = await transport(page, targets); await open(page, fixtures); expect(state.reads).toHaveLength(0); await selector(page).selectOption(selection(targets[0])); await expect(collection(page).getByRole('status')).toContainText('15 / 15 kayıt');
  const table = collection(page).getByRole('table'); await expect(table).toBeVisible(); await expect(table.locator('tbody tr').nth(0)).toContainText('Kısmen bağlı'); await expect(table.locator('tbody tr').nth(1)).toContainText('Bağlı'); await expect(table.locator('tbody tr').nth(2)).toContainText('Durum bilgisi yok'); await expect(table.locator('tbody tr').nth(3)).toContainText('Bağlı değil'); await expect(table.locator('tbody tr').nth(4)).toContainText('Durum bilgisi yok'); await expect(table.locator('tbody tr').nth(0)).toContainText('0 B'); await expect(table.locator('tbody tr').nth(0)).not.toContainText(targets[0].host);
  await button(page, 'Sonraki sayfa').click(); await expect(collection(page).getByRole('status')).toContainText('Sayfa 2 / 2'); await button(page, 'Önceki sayfa').click(); await capture(page, info, 'ipsec-desktop'); await selector(page).selectOption(selection(targets[1])); await expect(collection(page)).toContainText('BRANCH HQ'); expect(state.reads.at(-1)?.searchParams.get('vdom')).toBe('Branch'); expect(state.reads.at(-1)?.searchParams.get('expectedHost')).toBe(targets[1].host); expect(state.writes).toEqual([]); expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
});

test('IPsec: full search, partial filter, exact counters and configured versus observed endpoints', async ({ page, fixtures, targets }) => {
  const state = await transport(page, targets); await open(page, fixtures, targets[0]); const count = state.reads.length; await page.getByLabel('Tünel durumu', { exact: true }).selectOption('partial'); await expect(collection(page).getByRole('status')).toContainText('1 / 15 kayıt'); await button(page, 'TEST HQ: bağlantı ayrıntıları').click(); let dialog = page.getByRole('dialog'); await expect(dialog).toContainText('9.007.199.254.740.993'); await expect(dialog).toContainText('192.0.2.1'); await expect(dialog).toContainText('2001:db8::1'); await expect(dialog).toContainText('198.51.100.10'); await expect(dialog).toContainText('TEST full tunnel description'); await expect(dialog).toContainText('TEST APP'); await expect(dialog).toContainText('Bağlı değil'); await expect(dialog).toContainText('Alınan · Uzak → yerel'); await expect(dialog).toContainText('Gönderilen · Yerel → uzak'); await button(page, 'Kapat').click();
  await button(page, 'Filtreleri temizle').click(); await page.getByLabel('Tünellerde ara', { exact: true }).fill('TEST late phase 9'); await expect(collection(page).getByRole('status')).toContainText('1 / 15 kayıt'); await button(page, 'Filtreleri temizle').click(); await button(page, 'TEST Dialup_1: bağlantı ayrıntıları').click(); dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Sabit IP bildirilmemiş'); await expect(dialog).toContainText('2001:db8::10'); await expect(dialog).toContainText('TEST Dialup'); await expect(dialog).not.toContainText('0::0'); await button(page, 'Kapat').click(); expect(state.reads).toHaveLength(count);
});

test('IPsec: configuration failure preserves fresh monitor data without a false local endpoint', async ({ page, fixtures, targets }) => {
  await transport(page, targets); await page.route('**' + endpoint + '?**', route => route.fulfill({ json: envelope(targets[0], snapshot('TEST', 'AUTHENTICATION_FAILED')) })); await open(page, fixtures, targets[0]); await expect(page.getByText('Yerel uç yapılandırması okunamadı.', { exact: false })).toBeVisible(); await expect(collection(page)).not.toContainText('Önceki veri'); await button(page, 'TEST HQ: bağlantı ayrıntıları').click(); const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Kısmen bağlı'); await expect(dialog).toContainText('9.007.199.254.740.993'); await expect(dialog).toContainText('IP bilgisi yok'); await expect(dialog).not.toContainText('192.0.2.1'); await expect(dialog).not.toContainText('PRIVATE');
});

for (const failure of ['http', 'scope', 'state', 'duplicate'] as const) test('IPsec: ' + failure + ' refresh retains labeled previous results and recovers', async ({ page, fixtures, targets }) => {
  await transport(page, targets); await open(page, fixtures, targets[0]); await page.route('**' + endpoint + '?**', route => { const value = envelope(targets[0]); if (failure === 'scope') value.target.host = 'wrong.example.invalid'; if (failure === 'state') value.data.rows[0].state = 'up'; if (failure === 'duplicate') value.data.rows[1] = value.data.rows[0]; return route.fulfill({ status: failure === 'http' ? 503 : 200, json: failure === 'http' ? { success: false, error: 'PRIVATE_PROVIDER_FAILURE' } : value }); });
  await button(page, 'Verileri yenile').click(); await expect(page.getByRole('alert').filter({ hasText: 'Önceki izleme listesi gösteriliyor' })).toBeVisible(); await expect(collection(page)).toContainText('Önceki veri'); await button(page, 'TEST HQ: bağlantı ayrıntıları').click(); await expect(page.getByRole('dialog')).toContainText('Önceki veri'); await expect(page.getByText('PRIVATE_PROVIDER_FAILURE')).toHaveCount(0); await button(page, 'Kapat').click(); await page.unroute('**' + endpoint + '?**'); await page.route('**' + endpoint + '?**', route => route.fulfill({ json: envelope(targets[0]) })); await button(page, 'Verileri yenile').click(); await expect(button(page, 'Verileri yenile')).toBeEnabled(); await expect(page.getByRole('alert').filter({ hasText: 'Önceki izleme listesi gösteriliyor' })).toHaveCount(0);
});

test('IPsec: metadata failure marks retained monitor results as previous data', async ({ page, fixtures, targets }) => {
  await transport(page, targets); await open(page, fixtures, targets[0]); await page.route('**' + list, route => route.fulfill({ status: 503, json: { success: false } })); await button(page, 'Verileri yenile').click(); await expect(page.getByRole('alert').filter({ hasText: 'Önceki cihaz listesi korunuyor' })).toBeVisible(); await expect(collection(page)).toContainText('Önceki veri'); await expect(collection(page)).toContainText('TEST HQ');
});

test('IPsec: genuine empty source differs from unavailable initial data', async ({ page, fixtures, targets }) => {
  await transport(page, targets); const data = snapshot(); data.rows = []; await page.route('**' + endpoint + '?**', route => route.fulfill({ json: envelope(targets[0], data) })); await open(page, fixtures); await selector(page).selectOption(selection(targets[0])); await expect(collection(page)).toContainText('Son başarılı okumada izleme listesi boş geldi.'); await expect(collection(page).getByRole('status')).toContainText('0 / 0 kayıt'); await page.unroute('**' + endpoint + '?**'); await page.route('**' + endpoint + '?**', route => route.fulfill({ status: 503, json: { success: false, data: [] } })); await selector(page).selectOption(selection(targets[1])); await expect(page.getByRole('heading', { name: 'IPsec bilgisi alınamadı' })).toBeVisible(); await expect(collection(page).getByRole('status')).toHaveCount(0); await expect(page.getByRole('region', { name: 'IPsec özeti' })).toContainText('Bilgi yok');
});

test('IPsec: single-source auto selection, disabled source and empty installation', async ({ page, fixtures, targets }) => {
  const state = await transport(page, [targets[0]]); await open(page, fixtures); await expect(collection(page).getByRole('status')).toContainText('15 / 15 kayıt'); await page.unroute('**' + list); await page.route('**' + list, route => route.fulfill({ json: { success: true, data: [{ ...targets[0], enabled: false }] } })); const reads = state.reads.length; await button(page, 'Verileri yenile').click(); await expect(page.getByRole('heading', { name: 'Bağlantı devre dışı' })).toBeVisible(); expect(state.reads).toHaveLength(reads); await page.unroute('**' + list); await page.route('**' + list, route => route.fulfill({ json: { success: true, data: [] } })); await button(page, 'Verileri yenile').click(); await expect(page.getByRole('heading', { name: 'Henüz güvenlik duvarı eklenmemiş' })).toBeVisible();
});

test('IPsec: late old VDOM responses cannot replace a newly selected target', async ({ page, fixtures, targets }) => {
  await transport(page, targets); let release!: () => void, complete!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }), done = new Promise<void>(resolve => { complete = resolve; }); let pending = false;
  await page.route('**' + endpoint + '?**', async route => { if (new URL(route.request().url()).searchParams.get('vdom') !== targets[0].vdom) return route.fallback(); pending = true; await gate; try { await route.fulfill({ json: envelope(targets[0], snapshot('OLD SCOPE')) }); } catch { /* The real component aborted its old read. */ } finally { complete(); } });
  try { await open(page, fixtures); await selector(page).selectOption(selection(targets[0])); await expect.poll(() => pending).toBe(true); await selector(page).selectOption(selection(targets[1])); await expect(collection(page)).toContainText('BRANCH HQ'); release(); await done; await expect(page.getByText('OLD SCOPE HQ', { exact: true })).toHaveCount(0); } finally { release(); }
});

for (const role of ['ADMIN', 'EDITOR', 'VIEWER'] as const) test('IPsec: real current ' + role + ' read reaches local target/query guards without writes', async ({ page, context, fixtures, targets, prisma }) => {
  await installTestSession(context, fixtures, 'ADMIN'); const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } }), audit = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } }); try { await prisma.user.update({ where: { id: fixtures.userId }, data: { role } }); const response = await page.request.get(actualUrl(targets[0])); expect(response.status()).toBe(409); expect((await response.json()).code).toBe('TARGET_DISABLED'); expect(response.headers()['cache-control']).toBe('private, no-store'); expect((await page.request.get(endpoint)).status()).toBe(400); expect((await page.request.get(actualUrl({ ...targets[0], configId: 'missing' }))).status()).toBe(404); expect((await page.request.get(list)).status()).toBe(200); expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } })).toEqual(before); expect(await prisma.auditLog.findMany({ orderBy: { id: 'asc' } })).toEqual(audit); } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); }
});

for (const denial of ['inactive', 'suspended', 'expired', 'missing'] as const) test('IPsec: real ' + denial + ' session cannot read private source/metadata', async ({ page, context, fixtures, targets, prisma }) => {
  await installTestSession(context, fixtures, 'ADMIN', denial === 'expired'); try { if (denial === 'inactive' || denial === 'suspended') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: denial === 'inactive' ? 'INACTIVE' : 'SUSPENDED' } }); if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME }); expect((await page.request.get(actualUrl(targets[0]))).status()).toBe(401); expect((await page.request.get(list)).status()).toBe(401); } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { status: 'ACTIVE' } }); }
});

test('IPsec: mobile light/dark endpoint cards and scrollable keyboard details fit the viewport', async ({ page, fixtures, targets }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await transport(page, targets); await open(page, fixtures, targets[0]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await capture(page, info, 'ipsec-mobile-light'); await page.evaluate(() => document.documentElement.classList.add('dark')); await capture(page, info, 'ipsec-mobile-dark'); await button(page, 'Bağlantı ayrıntıları').filter({ visible: true }).first().focus(); await page.keyboard.press('Enter'); const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('TEST APP'); await expect.poll(() => dialog.evaluate(el => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight; })).toBe(true); await dialog.evaluate(el => { el.scrollTop = 0; }); await capture(page, info, 'ipsec-mobile-detail'); const close = dialog.getByRole('button', { name: 'Kapat', exact: true }); await close.scrollIntoViewIfNeeded(); await expect.poll(() => close.evaluate(button => { const box = button.getBoundingClientRect(), panel = button.closest('[role=dialog]')!.getBoundingClientRect(); return box.top >= panel.top && box.bottom <= panel.bottom && box.top >= 0 && box.bottom <= innerHeight; })).toBe(true); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});
