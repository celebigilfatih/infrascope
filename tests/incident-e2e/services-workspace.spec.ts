import { expect, type APIResponse, type Page } from '@playwright/test';
import { test as base, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { parseServicesSnapshot } from '../../lib/services/workspace';
import type { DependencyType, ServiceStatus } from '@prisma/client';

const endpoint = '/api/services/workspace';
type Inventory = { services: Array<{ id: string; name: string }>; apps: string[]; devices: string[] };
const test = base.extend<{ inventory: Inventory }>({
  inventory: async ({ prisma, fixtures }, use) => {
    const inventory: Inventory = { services: [], apps: [], devices: [] }, prefix = fixtures.manifest.prefix;
    try {
      for (let i = 0; i < 4; i++) {
        const row = await prisma.device.create({ data: { name: `${prefix} TEST Host ${i}`, type: 'PHYSICAL_SERVER', tags: [], pollingEnabled: false, managementIp: i === 3 ? '2001:db8:1234:5678:90ab:cdef:1234:5678' : `192.0.2.${i + 1}`, sshPassword: 'PRIVATE_SYNTHETIC_DEVICE', snmpCommunity: 'PRIVATE_SYNTHETIC_SNMP' } });
        inventory.devices.push(row.id);
      }
      for (const name of ['TEST Portal', 'TEST Secondary']) inventory.apps.push((await prisma.application.create({ data: { name: prefix + ' ' + name, vendor: 'TEST Vendor', licenseKey: 'PRIVATE_SYNTHETIC_LICENSE', installPath: 'PRIVATE_SYNTHETIC_PATH' } })).id);
      for (let i = 0; i < 15; i++) {
        const status: ServiceStatus = ['RUNNING', 'FAILED', 'UNKNOWN', 'DEGRADED', 'STOPPED'][i] as ServiceStatus || 'RUNNING';
        const row = await prisma.service.create({ data: { name: `${prefix} ${String(i).padStart(2, '0')} TEST Service`, applicationId: [2, 4].includes(i) ? null : inventory.apps[i === 3 ? 1 : 0], deviceId: inventory.devices[0], type: 'WEB_SERVER', status, criticality: 'MEDIUM', port: 10000 + i, protocol: i === 0 ? 'BOTH' : 'TCP', metadata: { private: 'PRIVATE_SYNTHETIC_METADATA' } } });
        inventory.services.push(row);
      }
      const types: DependencyType[] = ['DEPENDS_ON', 'REQUIRES', 'PROVIDES', 'SUPPORTS', 'COMMUNICATES_WITH', 'DEPLOYED_ON', 'HOSTED_ON', 'CONNECTED_TO'];
      for (const [i, type] of types.entries()) await prisma.dependency.create({ data: { sourceServiceId: inventory.services[0].id, targetDeviceId: inventory.devices[1 + i % 3], type, criticality: 'HIGH', description: i === 7 ? 'TEST hidden relation' : 'TEST relation' } });
      await prisma.dependency.create({ data: { sourceServiceId: inventory.services[1].id, targetDeviceId: inventory.devices[1], type: 'DEPENDS_ON' } });
      await use(inventory);
    } finally {
      await prisma.dependency.deleteMany({ where: { sourceServiceId: { in: inventory.services.map(row => row.id) } } });
      await prisma.service.deleteMany({ where: { id: { in: inventory.services.map(row => row.id) } } });
      await prisma.application.deleteMany({ where: { id: { in: inventory.apps } } });
      await prisma.device.deleteMany({ where: { id: { in: inventory.devices } } });
    }
  },
});
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const clear = (page: Page) => page.getByRole('search', { name: 'Servis filtreleri', exact: true }).getByRole('button', { name: 'Filtreleri temizle', exact: true });
const collection = (page: Page) => page.getByRole('region', { name: 'Servis listesi', exact: true });
const detail = (page: Page, name: string) => button(page, `${name}: servis ayrıntıları`);
async function open(page: Page, fixtures: Fixtures, role = 'ADMIN') {
  await installTestSession(page.context(), fixtures, role);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/services');
  await expect(collection(page)).toHaveAttribute('aria-busy', 'false');
}
async function payload(page: Page) { const response = await page.request.get(endpoint); expect(response.status()).toBe(200); return response.json(); }

test('services: complete counts, paging, unknown/unassigned filters and hidden-target search are local', async ({ page, fixtures, inventory }, info) => {
  const reads: string[] = [], writes: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === endpoint) reads.push(request.url()); if (request.method() !== 'GET') writes.push(request.url()); });
  await open(page, fixtures);
  await info.attach('services-desktop', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await expect(collection(page).getByRole('status')).toContainText('15 / 15 servis');
  await expect(page.getByText('1 servisin durumu bilinmiyor · 2 servise uygulama atanmamış.')).toBeVisible();
  const count = reads.length;
  await button(page, 'Sonraki sayfa').click(); await expect(collection(page)).toContainText(inventory.services[14].name);
  await page.getByLabel('Kayıtlı servis durumu', { exact: true }).selectOption('UNKNOWN'); await expect(collection(page).getByRole('status')).toContainText('1 / 15');
  await clear(page).click(); await page.getByLabel('Bağlı uygulama', { exact: true }).selectOption('null'); await expect(collection(page).getByRole('status')).toContainText('2 / 15');
  await clear(page).click();
  for (const query of ['TEST hidden relation', '2001:db8:1234:5678:90ab:cdef:1234:5678', 'Destekler', '10000']) {
    await page.getByLabel('Servis ve ilişkilerde ara', { exact: true }).fill(query); await expect(collection(page).getByRole('status')).toContainText('1 / 15');
  }
  await page.getByLabel('Servis ve ilişkilerde ara', { exact: true }).fill('not present'); await expect(page.getByRole('heading', { name: 'Filtrelere uygun servis yok' })).toBeVisible();
  await clear(page).click(); expect(reads).toHaveLength(count); expect(writes).toEqual([]);
});

test('services: keyboard relation details preserve all edge types and prevent deletion with dependencies', async ({ page, fixtures, inventory }) => {
  await open(page, fixtures); await detail(page, inventory.services[0].name).click(); const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('10000 / TCP ve UDP'); await expect(dialog).toContainText('son sağlık kontrolü zamanı değildir');
  await expect(dialog.getByRole('button', { name: 'Servis kaydını sil', exact: true })).toBeDisabled();
  await dialog.getByRole('tab', { name: 'Servis bilgileri', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('tab', { name: 'İlişkiler (8)', exact: true })).toHaveAttribute('aria-selected', 'true');
  for (const label of ['Bağımlı', 'Gerektirir', 'Sağlar', 'Destekler', 'İletişim kurar', 'Dağıtıldığı cihaz', 'Barındırıldığı cihaz', 'Bağlı']) await expect(dialog.getByText(label, { exact: true })).toBeVisible();
  await expect(dialog).toContainText('2001:db8:1234:5678:90ab:cdef:1234:5678'); await expect(dialog).toContainText('TEST hidden relation'); await expect(dialog).not.toContainText('PRIVATE_SYNTHETIC');
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});

for (const failure of ['http', 'association', 'calendar', 'duplicate'] as const) test('services: ' + failure + ' refresh retains evidence, blocks deletion and recovers', async ({ page, fixtures, inventory }) => {
  await open(page, fixtures); const body = await payload(page); const before = await collection(page).getByText(/Son liste okuma:/).textContent();
  await page.route('**' + endpoint, route => {
    const value = structuredClone(body);
    if (failure === 'association') value.data[0].application.id = 'wrong';
    if (failure === 'calendar') value.readAt = '2026-02-30T12:00:00Z';
    if (failure === 'duplicate') value.data[1] = value.data[0];
    return route.fulfill({ status: failure === 'http' ? 503 : 200, json: failure === 'http' ? { success: false, error: 'PRIVATE_SYNTHETIC_FAILURE' } : value });
  });
  await button(page, 'Verileri yenile').click(); await expect(page.getByRole('alert').filter({ hasText: 'Önceki liste korunuyor' })).toBeVisible();
  expect(await collection(page).getByText(/Son liste okuma:/).textContent()).toBe(before);
  await detail(page, inventory.services[2].name).click(); await expect(page.getByRole('dialog').getByRole('button', { name: 'Servis kaydını sil', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await page.unroute('**' + endpoint); await button(page, 'Verileri yenile').click(); await expect(collection(page)).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('alert').filter({ hasText: 'Önceki liste korunuyor' })).toHaveCount(0); await expect(page.getByText('PRIVATE_SYNTHETIC_FAILURE')).toHaveCount(0);
});

test('services: empty and unavailable stay distinct and a pending refresh cannot overlap', async ({ page, fixtures, inventory }) => {
  expect(inventory.services).toHaveLength(15); await installTestSession(page.context(), fixtures, 'ADMIN'); const body = await payload(page);
  await page.route('**' + endpoint, route => route.fulfill({ json: { ...body, data: [] } })); await page.goto('/services'); await expect(page.getByRole('heading', { name: 'Henüz servis kaydı yok' })).toBeVisible();
  await page.unroute('**' + endpoint); await page.route('**' + endpoint, route => route.fulfill({ status: 503, json: { success: false } })); await page.reload(); await expect(page.getByRole('heading', { name: 'Servis kayıtları alınamadı' })).toBeVisible(); await expect(page.getByRole('region', { name: 'Servis özeti' })).toContainText('Bilgi yok');
  await page.unroute('**' + endpoint); await button(page, 'Tekrar dene').click(); await expect(collection(page)).toContainText(inventory.services[0].name);
  let release = () => {}, count = 0; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**' + endpoint, async route => { count++; await gate; await route.fulfill({ json: body }); });
  try { await button(page, 'Verileri yenile').click(); await expect(button(page, 'Okunuyor…')).toBeDisabled(); await expect.poll(() => count).toBe(1); release(); await expect(button(page, 'Verileri yenile')).toBeEnabled(); } finally { release(); }
});

test('services: an invalid record timestamp stays unknown and cannot authorize deletion', async ({ page, fixtures, inventory }) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); const body = await payload(page);
  body.data.find((row: { id: string }) => row.id === inventory.services[2].id).updatedAt = '2026-02-30T12:00:00Z';
  await page.route('**' + endpoint, route => route.fulfill({ json: body })); await page.goto('/services');
  await expect(collection(page)).toHaveAttribute('aria-busy', 'false'); await detail(page, inventory.services[2].name).click();
  await expect(button(page, 'Servis kaydını sil')).toBeDisabled(); await expect(page.getByRole('dialog')).toContainText('Bilgi yok');
});

for (const role of ['ADMIN', 'EDITOR', 'VIEWER'] as const) test('services: current ' + role + ' controls real reads and deletion despite an older admin cookie', async ({ page, context, fixtures, inventory, prisma }) => {
  await installTestSession(context, fixtures, 'ADMIN'); await prisma.user.update({ where: { id: fixtures.userId }, data: { role } });
  try {
    const before = await prisma.service.findMany({ orderBy: { id: 'asc' } }), audit = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
    const response = await page.request.get(endpoint); expect(response.status()).toBe(200); expect(response.headers()['cache-control']).toBe('private, no-store'); const value = await response.json();
    expect(JSON.stringify(value)).not.toContain('PRIVATE_SYNTHETIC'); const snapshot = parseServicesSnapshot(value); expect(snapshot.rows).toHaveLength(15); expect(snapshot.canDelete).toBe(role === 'ADMIN');
    if (role !== 'ADMIN') expect((await page.request.delete('/api/services/' + inventory.services[2].id)).status()).toBe(403);
    await page.goto('/services'); await expect(collection(page)).toHaveAttribute('aria-busy', 'false'); await detail(page, inventory.services[2].name).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Servis kaydını sil', exact: true })).toHaveCount(role === 'ADMIN' ? 1 : 0);
    expect(await prisma.service.findMany({ orderBy: { id: 'asc' } })).toEqual(before); expect(await prisma.auditLog.findMany({ orderBy: { id: 'asc' } })).toEqual(audit);
  } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); }
});

for (const denial of ['inactive', 'suspended', 'expired', 'missing'] as const) test('services: ' + denial + ' identity cannot read or delete', async ({ page, context, fixtures, inventory, prisma }) => {
  await installTestSession(context, fixtures, 'ADMIN', denial === 'expired');
  try {
    if (denial === 'inactive' || denial === 'suspended') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: denial === 'inactive' ? 'INACTIVE' : 'SUSPENDED' } });
    if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
    expect((await page.request.get(endpoint)).status()).toBe(401); expect((await page.request.delete('/api/services/' + inventory.services[2].id)).status()).toBe(401);
    expect(await prisma.service.count({ where: { id: inventory.services[2].id } })).toBe(1);
  } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { status: 'ACTIVE' } }); }
});

test('services: cancel does not delete and duplicate confirmation performs one verified fixture deletion', async ({ page, fixtures, inventory, prisma }) => {
  let writes = 0; page.on('request', request => { if (request.method() === 'DELETE') writes++; });
  await open(page, fixtures); const selected = inventory.services[2];
  await detail(page, selected.name).click(); await button(page, 'Servis kaydını sil').click(); await expect(page.getByRole('dialog')).toContainText(selected.name); await button(page, 'Vazgeç').click(); expect(writes).toBe(0);
  await detail(page, selected.name).click(); await button(page, 'Servis kaydını sil').click();
  const confirm = button(page, 'Kaydı kalıcı olarak sil'); await confirm.evaluate(node => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
  await expect(page.getByText(/servis kaydı silindi ve güncel listede bulunmadığı doğrulandı/)).toBeVisible(); expect(writes).toBe(1); expect(await prisma.service.count({ where: { id: selected.id } })).toBe(0);
});

test('services: acknowledged but still-present deletion locks retry until a fresh explicit read', async ({ page, fixtures, inventory, prisma }) => {
  await open(page, fixtures); const selected = inventory.services[2]; let writes = 0;
  await page.route('**/api/services/' + selected.id + '?*', route => { writes++; return route.fulfill({ json: { success: true, data: { id: selected.id } } }); });
  await detail(page, selected.name).click(); await button(page, 'Servis kaydını sil').click(); await button(page, 'Kaydı kalıcı olarak sil').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Silme sonucu tam olarak doğrulanamadı' })).toBeVisible();
  await detail(page, selected.name).click(); await expect(button(page, 'Servis kaydını sil')).toBeDisabled(); await page.keyboard.press('Escape');
  expect(writes).toBe(1); expect(await prisma.service.count({ where: { id: selected.id } })).toBe(1);
  await button(page, 'Verileri yenile').click(); await expect(collection(page)).toHaveAttribute('aria-busy', 'false'); await detail(page, selected.name).click(); await expect(button(page, 'Servis kaydını sil')).toBeEnabled();
});

test('services: stale versions reject deletion while the legacy no-version contract remains supported', async ({ page, fixtures, inventory, prisma }) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); const selected = inventory.services[2];
  expect((await page.request.delete('/api/services/' + selected.id + '?expectedUpdatedAt=2026-02-30T12:00:00Z')).status()).toBe(400);
  expect((await page.request.delete('/api/services/' + selected.id + '?expectedUpdatedAt=2020-01-01T00:00:00Z')).status()).toBe(409);
  expect(await prisma.service.count({ where: { id: selected.id } })).toBe(1);
  expect((await page.request.delete('/api/services/' + selected.id)).status()).toBe(200); expect(await prisma.service.count({ where: { id: selected.id } })).toBe(0);
});

test('services: a concurrently committed dependency survives a blocked delete', async ({ page, fixtures, inventory, prisma }) => {
  await installTestSession(page.context(), fixtures, 'ADMIN'); const selected = inventory.services[2]; await page.request.get('/api/services/' + selected.id);
  const state: { pending?: Promise<APIResponse> } = {};
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "services" WHERE "id" = ${selected.id} FOR UPDATE`;
      const [holder] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      await tx.dependency.create({ data: { sourceServiceId: selected.id, targetDeviceId: inventory.devices[1], type: 'REQUIRES' } });
      state.pending = page.request.delete('/api/services/' + selected.id);
      await expect.poll(async () => {
        const [row] = await prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND ${holder.pid} = ANY(pg_blocking_pids(pid))`;
        return row.count;
      }, { timeout: 10000 }).toBeGreaterThan(0);
    }, { timeout: 15000 });
    expect((await state.pending!).status()).toBe(409);
    expect(await prisma.service.count({ where: { id: selected.id } })).toBe(1); expect(await prisma.dependency.count({ where: { sourceServiceId: selected.id } })).toBe(1);
  } finally { await state.pending?.catch(() => {}); }
});

test('services: mobile light/dark and long relation details remain within the viewport', async ({ page, fixtures, inventory }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, fixtures);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach('services-mobile-light', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.evaluate(() => document.documentElement.classList.add('dark')); await collection(page).scrollIntoViewIfNeeded();
  await info.attach('services-mobile-dark', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await button(page, 'Servis ayrıntıları').first().focus(); await page.keyboard.press('Enter'); const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Servis bilgileri', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(dialog).toContainText('2001:db8:1234:5678:90ab:cdef:1234:5678');
  await expect.poll(() => dialog.evaluate(node => { const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && node.scrollWidth <= node.clientWidth; })).toBe(true);
  await info.attach('services-mobile-relations', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); expect(inventory.services).toHaveLength(15);
});
