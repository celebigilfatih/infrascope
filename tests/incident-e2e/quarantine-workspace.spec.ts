import { expect, type Page, type TestInfo } from '@playwright/test';
import { test as base, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { protectIntegrationConfig } from '../../lib/security/integration-credentials';
import type { FirewallListItem } from '../../components/firewall/types';
import type { QuarantineRecord } from '../../lib/security/quarantine';

const endpoint = '/api/security/quarantine', list = '/api/firewalls', ipv6 = '2001:0db8:0000:0000:0000:0000:0000:000a';
const test = base.extend<{ targets: FirewallListItem[] }>({
  targets: async ({ prisma, fixtures }, use) => {
    const prefix = fixtures.manifest.prefix;
    try {
      const integration = await prisma.integrationConfig.create({ data: { name: prefix + ' FortiGate', type: 'FORTIGATE', enabled: false, syncInterval: 1440, config: protectIntegrationConfig({ host: 'quarantine.example.invalid', accessToken: 'synthetic-only', vdom: 'root', syncMode: 'rest' }, 'FORTIGATE') } });
      for (const vdom of ['root', 'Branch']) {
        const device = await prisma.device.create({ data: { name: prefix + ' ' + vdom, type: 'FIREWALL', tags: [], pollingEnabled: false } });
        await prisma.firewallConnector.create({ data: { integrationConfigId: integration.id, deviceId: device.id, managementHost: 'quarantine.example.invalid', vdom, identityStatus: 'VERIFIED' } });
      }
      const connectors = await prisma.firewallConnector.findMany({ where: { integrationConfigId: integration.id }, include: { device: true }, orderBy: { createdAt: 'asc' } });
      await use(connectors.map(row => ({ id: row.id, configId: integration.id, name: integration.name, host: row.managementHost, vdom: row.vdom, enabled: true, credentialSet: true, requiresInventoryLink: false, identity: { status: 'VERIFIED', serialNumber: null, analyzerDeviceId: null, identityKey: null, candidateKey: null, conflictWithId: null }, monitoring: null, device: { id: row.device.id, name: row.device.name, type: 'FIREWALL', vendor: null, model: null, serialNumber: null, firmwareVersion: null, status: 'UNKNOWN', criticality: 'MEDIUM', managementIp: null }, lastSyncAt: null, lastSyncStatus: null })));
    } finally { await prisma.integrationConfig.deleteMany({ where: { name: { startsWith: prefix } } }); await prisma.device.deleteMany({ where: { name: { startsWith: prefix } } }); }
  },
});
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const selector = (page: Page) => page.getByLabel('Güvenlik duvarı ve sanal alan (VDOM)', { exact: true });
const collection = (page: Page) => page.getByRole('region', { name: 'Karantina kayıtları', exact: true });
const selection = (target: FirewallListItem) => JSON.stringify([target.configId, target.vdom]);
function records(vdom = 'root'): QuarantineRecord[] {
  const now = Date.now();
  return Array.from({ length: 12 }, (_, i) => ({ id: vdom + ':' + i, ip: i === 0 ? ipv6 : `192.0.2.${i}`, source: i % 3 === 0 ? 'manual' : i % 3 === 1 ? 'ips' : '', service: 'TEST HTTPS', comment: 'TEST reason ' + i, status: 'banned', vdom, interface: 'TEST port', created: new Date(now - 60000).toISOString(), expires: i % 4 === 0 ? null : new Date(now + (i % 4 === 1 ? 3600000 : i % 4 === 2 ? -1000 : 172800000)).toISOString() }));
}
function envelope(target: FirewallListItem, data = records(target.vdom), allowed = true) { return { success: true, target: { configId: target.configId, vdom: target.vdom, host: target.host }, source: 'fortigate-rest', collectedAt: new Date().toISOString(), writeAccess: allowed ? { allowed: true } : { allowed: false, code: 'feature-disabled' }, data, count: data.length }; }
const canonical = (ip: string) => ip.includes(':') ? new URL(`http://[${ip}]/`).hostname.slice(1, -1) : ip;
async function transport(page: Page, targets: FirewallListItem[], allowed = true) {
  const state = { reads: [] as URL[], writes: [] as { method: string; url: URL; body: Record<string, unknown> | null }[], rows: new Map(targets.map(target => [selection(target), records(target.vdom)])) };
  await page.route('**' + list, route => route.fulfill({ json: { success: true, data: targets } }));
  await page.route('**' + endpoint + '?**', route => {
    const request = route.request(), url = new URL(request.url()), target = targets.find(row => row.configId === url.searchParams.get('configId') && row.vdom === url.searchParams.get('vdom'))!;
    if (request.method() === 'GET') { state.reads.push(url); return route.fulfill({ json: envelope(target, state.rows.get(selection(target)), allowed) }); }
    const body = request.method() === 'POST' ? request.postDataJSON() : null; state.writes.push({ method: request.method(), url, body });
    const previous = state.rows.get(selection(target))!;
    if (body) state.rows.set(selection(target), [...previous, { ...previous[0], id: 'added:' + state.writes.length, ip: canonical(String(body.ip)), source: 'manual', comment: String(body.comment) }]);
    else state.rows.set(selection(target), previous.filter(row => canonical(row.ip) !== canonical(url.searchParams.get('ip')!)));
    return route.fulfill({ json: { success: true } });
  }); return state;
}
async function open(page: Page, fixtures: Fixtures, target?: FirewallListItem) { await installTestSession(page.context(), fixtures, 'ADMIN'); await page.goto('/security/quarantine'); await expect(button(page, 'Verileri yenile')).toBeEnabled(); if (target) { await selector(page).selectOption(selection(target)); await expect(collection(page).getByRole('status')).toContainText('12 / 12 kayıt'); } }
async function add(page: Page, ip = '192.0.2.99') { await button(page, 'IP’yi karantinaya al').click(); const dialog = page.getByRole('dialog'); await dialog.getByLabel('IP adresi', { exact: true }).fill(ip); await dialog.getByLabel('Karantina nedeni', { exact: true }).fill('TEST operator reason'); return dialog; }
async function capture(page: Page, info: TestInfo, name: string) { await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' }); }

test('quarantine: exact same-config VDOM selection, filters, pagination and unknown expiry', async ({ page, fixtures, targets, prisma }, info) => {
  const before = await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } }), state = await transport(page, targets); await open(page, fixtures); expect(state.reads).toHaveLength(0); await selector(page).selectOption(selection(targets[0])); await expect(collection(page).getByRole('status')).toContainText('12 / 12 kayıt');
  await expect(page.getByRole('region', { name: 'Karantina özeti' })).toContainText('Süre bilgisi yok'); await button(page, 'Sonraki sayfa').click(); await expect(collection(page).getByRole('status')).toContainText('Sayfa 2 / 2'); await page.getByLabel('Geçerlilik süresi', { exact: true }).selectOption('unknown'); await expect(collection(page).getByRole('status')).toContainText('3 / 12 kayıt'); await expect(collection(page)).not.toContainText('süresiz');
  await button(page, 'Filtreleri temizle').click(); await page.getByLabel('Kayıtlarda ara', { exact: true }).fill(ipv6); await button(page, ipv6 + ': karantina ayrıntıları').click(); await expect(page.getByRole('dialog')).toContainText('TEST reason 0'); await expect(page.getByRole('dialog')).toContainText('Bitiş zamanı bilinmiyor'); await button(page, 'Kapat').click();
  await selector(page).selectOption(selection(targets[1])); await expect(collection(page)).toContainText('VDOM: Branch'); expect(state.reads.at(-1)?.searchParams.get('expectedHost')).toBe(targets[1].host); expect(state.writes).toHaveLength(0); expect(await prisma.integrationConfig.findMany({ orderBy: { id: 'asc' } })).toEqual(before); await capture(page, info, 'quarantine-desktop');
});

test('quarantine: add validates IP/reason, sends exact scope and verifies equivalent IPv6', async ({ page, fixtures, targets }) => {
  const state = await transport(page, targets); await open(page, fixtures, targets[0]); let dialog = await add(page, 'bad'); await dialog.getByRole('button', { name: 'Karantinaya al', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('Geçerli'); expect(state.writes).toHaveLength(0); await dialog.getByLabel('IP adresi', { exact: true }).fill('2001:0DB8:0000:0000:0000:0000:0000:0099'); await dialog.getByLabel('Karantina nedeni', { exact: true }).fill(' '); await dialog.getByRole('button', { name: 'Karantinaya al', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('nedenini'); await dialog.getByLabel('Karantina nedeni', { exact: true }).fill('TEST operator reason'); await dialog.getByLabel('Karantina süresi', { exact: true }).selectOption('permanent'); await dialog.getByRole('button', { name: 'Karantinaya al', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'karantina listesinde doğrulandı.' })).toBeVisible(); expect(state.writes).toHaveLength(1); expect(state.writes[0].body).toEqual({ ip: '2001:0DB8:0000:0000:0000:0000:0000:0099', comment: 'TEST operator reason' }); expect(state.writes[0].url.searchParams.get('vdom')).toBe(targets[0].vdom); expect(state.writes[0].url.searchParams.get('expectedHost')).toBe(targets[0].host);
  dialog = await add(page); await dialog.getByRole('button', { name: 'Karantinaya al', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: '192.0.2.99 seçili cihazın karantina listesinde doğrulandı.' })).toBeVisible(); expect(state.writes[1].body?.expiry_hours).toBe(24);
});

test('quarantine: remove requires confirmation and verifies absence from the exact scope', async ({ page, fixtures, targets }) => {
  const state = await transport(page, targets); await open(page, fixtures, targets[0]); await button(page, '192.0.2.1: karantinadan çıkar').click(); const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('192.0.2.1'); await expect(dialog).toContainText('TEST reason 1'); await expect(dialog).toContainText('VDOM: ' + targets[0].vdom); expect(state.writes).toHaveLength(0); await dialog.getByRole('button', { name: 'Karantinadan çıkar', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'artık seçili cihazın karantina listesinde görünmüyor.' })).toBeVisible(); expect(state.writes).toHaveLength(1); expect(state.writes[0].method).toBe('DELETE'); expect(state.writes[0].url.searchParams.get('ip')).toBe('192.0.2.1');
});

test('quarantine: equivalent IPv6 still present is never reported as removed', async ({ page, fixtures, targets }) => {
  await transport(page, targets); await page.route('**' + endpoint + '?**', route => route.request().method() === 'DELETE' ? route.fulfill({ json: { success: true } }) : route.fallback()); await open(page, fixtures, targets[0]); await button(page, ipv6 + ': karantinadan çıkar').click(); await page.route('**' + endpoint + '?**', route => route.request().method() === 'GET' ? route.fulfill({ json: envelope(targets[0], records().map(row => ({ ...row, ip: canonical(row.ip) }))) }) : route.fallback()); await page.getByRole('dialog').getByRole('button', { name: 'Karantinadan çıkar', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'hâlâ cihaz listesinde görünüyor.' })).toBeVisible(); await expect(page.getByText(/artık seçili cihazın karantina listesinde görünmüyor/)).toHaveCount(0);
});

for (const failure of ['http', 'offline', 'unconfirmed'] as const) test('quarantine: ' + failure + ' write blocks blind retry until a fresh read', async ({ page, fixtures, targets }) => {
  const state = await transport(page, targets); let attempts = 0; await page.route('**' + endpoint + '?**', route => { if (route.request().method() === 'GET') return route.fallback(); attempts++; return failure === 'offline' ? route.abort('failed') : route.fulfill({ status: failure === 'http' ? 503 : 200, json: { success: failure === 'unconfirmed' ? undefined : false, error: 'private-provider-error' } }); }); await open(page, fixtures, targets[0]); const dialog = await add(page); const submit = dialog.getByRole('button', { name: 'Karantinaya al', exact: true }); await submit.click(); await expect(dialog.getByRole('alert')).toContainText('doğrulanamadı'); await expect(submit).toBeDisabled(); expect(attempts).toBe(1); await expect(dialog.getByLabel('IP adresi', { exact: true })).toHaveValue('192.0.2.99'); await expect(page.getByText('private-provider-error')).toHaveCount(0); await dialog.getByRole('button', { name: 'Vazgeç', exact: true }).click(); await expect(button(page, 'IP’yi karantinaya al')).toBeDisabled(); await button(page, 'Verileri yenile').click(); await expect(button(page, 'IP’yi karantinaya al')).toBeEnabled(); expect(state.writes).toHaveLength(0);
});

test('quarantine: pending write locks source changes, duplicate Enter and dismissal', async ({ page, fixtures, targets }) => {
  await transport(page, targets); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let attempts = 0;
  await page.route('**' + endpoint + '?**', async route => { if (route.request().method() === 'GET') return route.fallback(); attempts++; await gate; return route.fulfill({ status: 503, json: { success: false } }); });
  try { await open(page, fixtures, targets[0]); const dialog = await add(page); const submit = dialog.getByRole('button', { name: 'Karantinaya al', exact: true }); await submit.focus(); await page.keyboard.press('Enter'); await expect.poll(() => attempts).toBe(1); await page.keyboard.press('Enter'); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible(); await expect(selector(page)).toBeDisabled(); await expect(page.getByRole('button', { name: 'Verileri yenile', exact: true, includeHidden: true })).toBeDisabled(); expect(attempts).toBe(1); release(); await expect(dialog.getByRole('alert')).toContainText('doğrulanamadı'); }
  finally { release(); }
});

test('quarantine: freshness is rechecked at submit before the next display timer tick', async ({ page, fixtures, targets }) => {
  const state = await transport(page, targets); await open(page, fixtures, targets[0]); const dialog = await add(page); await page.clock.setFixedTime(new Date(Date.now() + 125000)); await dialog.getByRole('button', { name: 'Karantinaya al', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('Liste güncel değil'); expect(state.writes).toHaveLength(0); await expect(dialog.getByRole('button', { name: 'Karantinaya al', exact: true })).toBeDisabled();
});

test('quarantine: read failure retains stale records but disables mutations and recovers', async ({ page, fixtures, targets }) => {
  await transport(page, targets); await open(page, fixtures, targets[0]); await page.route('**' + endpoint + '?**', route => route.fulfill({ status: 503, json: { success: false } })); await button(page, 'Verileri yenile').click(); await expect(page.getByRole('alert').filter({ hasText: 'Önceki kayıtlar gösteriliyor' })).toBeVisible(); await expect(collection(page).getByText(ipv6, { exact: true }).filter({ visible: true })).toBeVisible(); await expect(button(page, 'IP’yi karantinaya al')).toBeDisabled(); await page.unroute('**' + endpoint + '?**'); await page.route('**' + endpoint + '?**', route => route.fulfill({ json: envelope(targets[0]) })); await button(page, 'Verileri yenile').click(); await expect(button(page, 'IP’yi karantinaya al')).toBeEnabled();
});

test('quarantine: a successful write with failed reconciliation remains unverified', async ({ page, fixtures, targets }) => {
  await transport(page, targets); await open(page, fixtures, targets[0]); const dialog = await add(page); let submitted = false; await page.route('**' + endpoint + '?**', route => { if (route.request().method() !== 'GET') { submitted = true; return route.fulfill({ json: { success: true } }); } return submitted ? route.fulfill({ status: 503, json: { success: false } }) : route.fallback(); }); await dialog.getByRole('button', { name: 'Karantinaya al', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'güncel liste okunamadığı için sonuç doğrulanamadı' })).toBeVisible(); await expect(button(page, 'IP’yi karantinaya al')).toBeDisabled();
});

test('quarantine: late old-scope responses cannot replace a newly selected VDOM', async ({ page, fixtures, targets }) => {
  await transport(page, targets); let release!: () => void, complete!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }), done = new Promise<void>(resolve => { complete = resolve; }); let pending = false;
  await page.route('**' + endpoint + '?**', async route => { if (new URL(route.request().url()).searchParams.get('vdom') !== targets[0].vdom) return route.fallback(); pending = true; await gate; try { await route.fulfill({ json: envelope(targets[0], [{ ...records()[0], comment: 'OLD SCOPE' }]) }); } catch { /* The old request was cancelled by the real page. */ } finally { complete(); } });
  try { await open(page, fixtures); await selector(page).selectOption(selection(targets[0])); await expect.poll(() => pending).toBe(true); await selector(page).selectOption(selection(targets[1])); await expect(collection(page)).toContainText('VDOM: Branch'); await expect(collection(page).getByRole('status')).toContainText('12 / 12 kayıt'); release(); await done; await expect(page.getByText('OLD SCOPE')).toHaveCount(0); await expect(collection(page)).toContainText('VDOM: Branch'); } finally { release(); }
});

test('quarantine: wrong host/VDOM responses and initial failures never become empty success', async ({ page, fixtures, targets }) => {
  await transport(page, targets); await page.route('**' + endpoint + '?**', route => { const value = envelope(targets[0], []); value.target.host = 'wrong.example.invalid'; return route.fulfill({ json: value }); }); await open(page, fixtures); await selector(page).selectOption(selection(targets[0])); await expect(page.getByRole('heading', { name: 'Karantina bilgisi alınamadı' })).toBeVisible(); await expect(page.getByText('Son başarılı okumada cihaz boş liste bildirdi.')).toHaveCount(0); await expect(page.getByRole('region', { name: 'Karantina özeti' })).toContainText('Bilgi yok');
});

test('quarantine: disabled, read-only and empty installations prevent writes', async ({ page, fixtures, targets }) => {
  const state = await transport(page, targets.map(row => ({ ...row, enabled: false }))); await open(page, fixtures); await selector(page).selectOption(selection(targets[0])); await expect(page.getByRole('heading', { name: 'Bağlantı devre dışı' })).toBeVisible(); expect(state.reads).toHaveLength(0); await page.unroute('**' + list); await page.route('**' + list, route => route.fulfill({ json: { success: true, data: targets } })); await page.unroute('**' + endpoint + '?**'); await page.route('**' + endpoint + '?**', route => route.fulfill({ json: envelope(targets[0], [], false) })); await button(page, 'Verileri yenile').click(); await expect(collection(page)).toContainText('boş liste bildirdi'); await expect(button(page, 'IP’yi karantinaya al')).toBeDisabled(); await expect(page.getByRole('status').filter({ hasText: 'sistem ayarlarında kapalı' })).toBeVisible(); await page.unroute('**' + list); await page.route('**' + list, route => route.fulfill({ json: { success: true, data: [] } })); await button(page, 'Verileri yenile').click(); await expect(page.getByRole('heading', { name: 'Henüz güvenlik duvarı eklenmemiş' })).toBeVisible();
});

for (const denial of ['editor', 'viewer', 'inactive', 'suspended', 'expired', 'missing', 'feature-disabled'] as const) test('quarantine: real ' + denial + ' guard rejects add/remove before source and audit writes', async ({ page, context, fixtures, targets, prisma }) => {
  await installTestSession(context, fixtures, 'ADMIN', denial === 'expired'); const before = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
  try {
    if (denial === 'editor' || denial === 'viewer') await prisma.user.update({ where: { id: fixtures.userId }, data: { role: denial === 'editor' ? 'EDITOR' : 'VIEWER' } });
    if (denial === 'inactive' || denial === 'suspended') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: denial === 'inactive' ? 'INACTIVE' : 'SUSPENDED' } });
    if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
    const query = new URLSearchParams({ configId: targets[0].configId, vdom: targets[0].vdom, expectedHost: targets[0].host, ip: '192.0.2.99' }), url = endpoint + '?' + query;
    const status = denial === 'feature-disabled' ? 503 : denial === 'editor' || denial === 'viewer' ? 403 : 401;
    expect((await page.request.post(url, { data: { ip: '192.0.2.99', comment: 'TEST denied' } })).status()).toBe(status); expect((await page.request.delete(url)).status()).toBe(status);
    expect(await prisma.auditLog.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
    // The disabled target is a local-only positive read control for active accounts.
    expect((await page.request.get(url)).status()).toBe(['editor', 'viewer', 'feature-disabled'].includes(denial) ? 409 : 401);
  } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); }
});

test('quarantine: mobile light/dark details fit and support keyboard dismissal', async ({ page, fixtures, targets }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await transport(page, targets); await open(page, fixtures, targets[0]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await capture(page, info, 'quarantine-mobile-light'); await page.evaluate(() => document.documentElement.classList.add('dark')); await capture(page, info, 'quarantine-mobile-dark'); await button(page, 'İncele').filter({ visible: true }).first().focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible(); expect(await page.getByRole('dialog').evaluate(el => el.getBoundingClientRect().width <= innerWidth)).toBe(true); await capture(page, info, 'quarantine-mobile-detail'); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});
