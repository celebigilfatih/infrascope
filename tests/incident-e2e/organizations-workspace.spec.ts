import { expect, type Page, type Route, type TestInfo } from '@playwright/test';
import { test as base, signIn, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';

interface Graph {
  id: string; name: string; code: string; emptyId: string; emptyName: string;
  buildingId: string; floorId: string; roomId: string; rackId: string; unitId: string;
  vlanId: string; subnetId: string; clusterId: string; datastoreId: string;
  deviceId: string; interfaceId: string; connectionId: string; canaryId: string; canaryBuildingId: string;
}
const test = base.extend<{ graph: Graph }>({
  graph: async ({ prisma, fixtures }, use) => {
    const prefix = fixtures.manifest.prefix;
    const organizations: string[] = [], devices: string[] = [];
    try {
      const org = await prisma.organization.create({ data: { name: 'İzleme Organizasyonu ' + prefix, code: prefix, description: 'Sentetik konum kapsamı' } }); organizations.push(org.id);
      const empty = await prisma.organization.create({ data: { name: 'Boş Organizasyon ' + prefix, code: prefix + '-E' } }); organizations.push(empty.id);
      const canary = await prisma.organization.create({ data: { name: 'Korunan Organizasyon ' + prefix, code: prefix + '-C' } }); organizations.push(canary.id);
      const building = await prisma.building.create({ data: { name: 'Merkez Bina', organizationId: org.id, address: 'Synthetic address', city: 'İzmir', country: 'Türkiye' } });
      const canaryBuilding = await prisma.building.create({ data: { name: 'Korunan Bina', organizationId: canary.id, address: 'Canary', city: 'Ankara', country: 'Türkiye' } });
      const floor = await prisma.floor.create({ data: { name: 'Giriş Katı', floorNumber: 0, buildingId: building.id } });
      const room = await prisma.room.create({ data: { name: 'Sistem Odası', floorId: floor.id } });
      const rack = await prisma.rack.create({ data: { name: 'Test Kabineti', roomId: room.id } });
      const vlan = await prisma.vlan.create({ data: { name: 'Test VLAN', organizationId: org.id, vlanId: 123 } });
      const subnet = await prisma.subnet.create({ data: { cidr: '192.0.2.0/24', organizationId: org.id, vlanId: vlan.id } });
      const cluster = await prisma.vMwareCluster.create({ data: { name: 'Test Cluster', vcenterId: prefix, sourceScope: prefix, datacenterName: 'Fixture', organizationId: org.id } });
      const datastore = await prisma.vMwareDatastore.create({ data: { name: 'Test Datastore', vcenterId: prefix, sourceScope: prefix, organizationId: org.id, clusterId: cluster.id } });
      const device = await prisma.device.create({ data: { name: prefix, type: 'PHYSICAL_SERVER', tags: [], rackId: rack.id, vmwareClusterId: cluster.id } }); devices.push(device.id);
      const nic = await prisma.networkInterface.create({ data: { name: 'fixture0', deviceId: device.id, vlanId: vlan.id } });
      const unit = await prisma.rackUnit.create({ data: { rackId: rack.id, deviceId: device.id, position: 1 } });
      const connection = await prisma.buildingConnection.create({ data: { sourceBuildingId: building.id, destBuildingId: canaryBuilding.id, connectionType: 'FIBER_SINGLE_MODE' } });
      await use({ ...org, emptyId: empty.id, emptyName: empty.name, buildingId: building.id, floorId: floor.id, roomId: room.id, rackId: rack.id, unitId: unit.id, vlanId: vlan.id, subnetId: subnet.id, clusterId: cluster.id, datastoreId: datastore.id, deviceId: device.id, interfaceId: nic.id, connectionId: connection.id, canaryId: canary.id, canaryBuildingId: canaryBuilding.id });
    } finally {
      await prisma.device.deleteMany({ where: { id: { in: devices } } });
      await prisma.organization.deleteMany({ where: { OR: [{ id: { in: organizations } }, { code: { startsWith: prefix } }] } });
    }
  },
});
async function open(page: Page, fixtures: Fixtures, term?: string) {
  await signIn(page, fixtures);
  await page.goto('/settings/organizations');
  await expect(page.getByRole('button', { name: 'Yeni organizasyon', exact: true })).toBeEnabled();
  if (term) await page.getByRole('textbox', { name: 'Organizasyon ara', exact: true }).fill(term);
}
async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
}
const json = (route: Route, data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
async function edit(page: Page, graph: Graph) {
  await page.getByRole('button', { name: graph.name + ' organizasyonunu düzenle', exact: true }).click();
  return page.getByRole('dialog', { name: 'Organizasyonu düzenle', exact: true });
}

test('Organizations: actual hierarchy, accent-tolerant filters and exact room navigation', async ({ page, fixtures, graph }, info) => {
  await open(page, fixtures, 'IZLEME ORGANIZASYONU');
  await expect(page.getByRole('heading', { name: graph.name, exact: true })).toBeVisible();
  const summary = await page.getByRole('region', { name: 'Organizasyon ve konum özeti' }).innerText();
  await page.getByLabel('Konum bağlantısı', { exact: true }).selectOption('empty');
  await expect(page.getByText('Filtrelerle eşleşen organizasyon yok', { exact: true })).toBeVisible();
  expect(await page.getByRole('region', { name: 'Organizasyon ve konum özeti' }).innerText()).toBe(summary);
  await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).click();
  await page.getByLabel('Organizasyon ara', { exact: true }).fill('IZMIR');
  await page.getByRole('button', { name: graph.name + ' organizasyonunu incele', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Organizasyon ayrıntıları', exact: true });
  await dialog.locator('summary').filter({ hasText: 'Merkez Bina' }).press('Enter');
  await expect(dialog.getByText('Giriş Katı', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('listitem').filter({ hasText: 'Sistem Odası' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Oda yerleşimi', exact: true })).toHaveAttribute('href', '/locations/rooms/' + graph.roomId);
  await expect(dialog.getByRole('link', { name: 'Konum yönetimi', exact: true })).toHaveAttribute('href', '/locations');
  await capture(page, info, 'organization-hierarchy');
});

test('Organizations: real creation and changed-field edit appear immediately in fresh uncached reads', async ({ page, fixtures, graph, prisma }) => {
  await open(page, fixtures, graph.code);
  await page.getByRole('button', { name: 'Yeni organizasyon', exact: true }).click();
  const creation = page.getByRole('dialog', { name: 'Yeni organizasyon', exact: true });
  await creation.getByLabel('Organizasyon adı *', { exact: true }).fill('Created ' + graph.code);
  await creation.getByLabel('Organizasyon kodu *', { exact: true }).fill(graph.code + '-NEW');
  await creation.getByRole('button', { name: 'Organizasyonu oluştur', exact: true }).click();
  await expect(creation).toHaveCount(0);
  expect(await prisma.organization.count({ where: { code: graph.code + '-NEW' } })).toBe(1);
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: graph.id } });
  const dialog = await edit(page, graph);
  await dialog.getByLabel('Organizasyon kodu *', { exact: true }).fill(graph.code + '-EDIT');
  const request = page.waitForRequest(req => req.method() === 'PUT' && new URL(req.url()).pathname === '/api/organizations/' + graph.id);
  await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
  expect((await request).postDataJSON()).toEqual({ code: graph.code + '-EDIT' });
  await expect(dialog).toHaveCount(0);
  const after = await prisma.organization.findUniqueOrThrow({ where: { id: graph.id } });
  expect(after).toEqual({ ...before, code: graph.code + '-EDIT', updatedAt: after.updatedAt });
  const response = await page.request.get('/api/organizations');
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect((await response.json()).data.find((row: { id: string }) => row.id === graph.id).code).toBe(after.code);
  expect(await prisma.building.count({ where: { id: graph.buildingId, organizationId: graph.id } })).toBe(1);
});

test('Organizations: typed deletion cascades only the selected graph and detaches retained devices', async ({ page, fixtures, graph, prisma }, info) => {
  const canary = await prisma.organization.findUniqueOrThrow({ where: { id: graph.canaryId }, include: { buildings: true } });
  await open(page, fixtures, graph.code);
  await page.getByRole('button', { name: graph.name + ' organizasyonunu sil', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Organizasyonu sil', exact: true });
  const remove = dialog.getByRole('button', { name: 'Kalıcı olarak sil', exact: true });
  await expect(remove).toBeDisabled();
  await expect(dialog.getByText(/Cihaz kayıtları korunur/)).toBeVisible();
  await dialog.getByLabel('Onay için', { exact: false }).fill(graph.code.toLowerCase());
  await expect(remove).toBeDisabled();
  expect(await prisma.organization.count({ where: { id: graph.id } })).toBe(1);
  await dialog.getByLabel('Onay için', { exact: false }).fill(graph.code);
  await capture(page, info, 'organization-delete-scope');
  await remove.click();
  await expect(dialog).toHaveCount(0);
  expect(await prisma.organization.findUnique({ where: { id: graph.id } })).toBeNull();
  expect(await Promise.all([
    prisma.building.count({ where: { id: graph.buildingId } }),
    prisma.floor.count({ where: { id: graph.floorId } }),
    prisma.room.count({ where: { id: graph.roomId } }),
    prisma.rack.count({ where: { id: graph.rackId } }),
    prisma.rackUnit.count({ where: { id: graph.unitId } }),
    prisma.vlan.count({ where: { id: graph.vlanId } }),
    prisma.subnet.count({ where: { id: graph.subnetId } }),
    prisma.vMwareCluster.count({ where: { id: graph.clusterId } }),
    prisma.vMwareDatastore.count({ where: { id: graph.datastoreId } }),
    prisma.buildingConnection.count({ where: { id: graph.connectionId } }),
  ])).toEqual(Array(10).fill(0));
  expect(await prisma.device.findUniqueOrThrow({ where: { id: graph.deviceId } })).toMatchObject({ rackId: null, vmwareClusterId: null });
  expect(await prisma.networkInterface.findUniqueOrThrow({ where: { id: graph.interfaceId } })).toMatchObject({ deviceId: graph.deviceId, vlanId: null });
  expect(await prisma.organization.findUniqueOrThrow({ where: { id: graph.canaryId }, include: { buildings: true } })).toEqual(canary);
});

test('Organizations: validation, uniqueness, missing records and supported-field boundaries use real PostgreSQL', async ({ page, fixtures, graph, prisma }) => {
  await installTestSession(page.context(), fixtures, 'ADMIN');
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: graph.id } });
  expect((await page.request.post('/api/organizations', { data: { name: ' ', code: 'invalid' } })).status()).toBe(400);
  expect((await page.request.put('/api/organizations/' + graph.id, { data: { status: 'inactive' } })).status()).toBe(400);
  const duplicate = await page.request.post('/api/organizations', { data: { name: 'Duplicate', code: graph.code } });
  expect(duplicate.status()).toBe(409);
  expect(await duplicate.json()).toMatchObject({ success: false, code: 'DUPLICATE' });
  expect((await page.request.put('/api/organizations/nonexistent-fixture', { data: { name: 'Missing' } })).status()).toBe(404);
  expect((await page.request.delete('/api/organizations/nonexistent-fixture')).status()).toBe(404);
  expect(await prisma.organization.findUniqueOrThrow({ where: { id: graph.id } })).toEqual(before);
});

test('Organizations: a failed refresh preserves stale rows and disables mutations', async ({ page, fixtures, graph }, info) => {
  await open(page, fixtures, graph.code);
  await page.route('**/api/organizations?fresh=1', route => json(route, { success: false, error: 'private detail' }, 500));
  await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Organizasyon listesi alınamadı' })).toContainText('Son başarılı okumadaki kayıtlar korunuyor');
  await expect(page.getByRole('heading', { name: graph.name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yeni organizasyon', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: graph.name + ' organizasyonunu düzenle', exact: true })).toBeDisabled();
  await capture(page, info, 'organization-stale-read');
});

for (const failure of ['list', 'identity'] as const) {
  test(`Organizations: initial ${failure} failure is explicit and cannot enable writes`, async ({ page, fixtures, graph }) => {
    await signIn(page, fixtures);
    await page.route(failure === 'list' ? '**/api/organizations?fresh=1' : '**/api/auth/me', route => json(route, { success: false }, 503));
    await page.goto('/settings/organizations');
    await expect(page.getByRole('alert').filter({ hasText: failure === 'list' ? 'Organizasyon listesi alınamadı' : 'İşlem yetkisi doğrulanamadı' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Yeni organizasyon', exact: true })).toBeDisabled();
    if (failure === 'list') await expect(page.getByRole('heading', { name: 'Organizasyon listesi alınamadı', exact: true })).toBeVisible();
    else await expect(page.getByRole('heading', { name: graph.name, exact: true })).toBeVisible();
  });
}

test('Organizations: incomplete hierarchy stays unknown while actual empty hierarchy stays zero', async ({ page, fixtures, graph }) => {
  await signIn(page, fixtures);
  await page.route('**/api/organizations?fresh=1', async route => {
    const response = await route.fetch();
    const value = await response.json();
    value.data.find((row: { id: string }) => row.id === graph.id).buildings[0].floors = null;
    await json(route, value);
  });
  await page.goto('/settings/organizations');
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: graph.name, exact: true }) });
  await expect(card.getByText('Bilgi yok', { exact: true })).toHaveCount(3);
  const empty = page.locator('article').filter({ has: page.getByRole('heading', { name: graph.emptyName, exact: true }) });
  await expect(empty.locator('dd')).toHaveText(['0', '0', '0', '0']);
});

for (const failure of ['server', 'wrong-target'] as const) {
  test(`Organizations: ${failure} write retains draft and blocks uncertain replay until refresh`, async ({ page, fixtures, graph, prisma }) => {
    await open(page, fixtures, graph.code);
    const dialog = await edit(page, graph);
    await dialog.getByLabel('Açıklama (isteğe bağlı)', { exact: true }).fill('Retained draft');
    let writes = 0;
    const target = '**/api/organizations/' + graph.id;
    await page.route(target, route => { writes++; return json(route, { success: true, data: { id: 'wrong-target', description: 'Retained draft' } }, failure === 'server' ? 500 : 200); });
    await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('sonucu doğrulanamadı');
    await expect(dialog.getByLabel('Açıklama (isteğe bağlı)', { exact: true })).toHaveValue('Retained draft');
    await expect(dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true })).toBeDisabled();
    expect(writes).toBe(1);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: graph.id } })).description).toBe('Sentetik konum kapsamı');
    await dialog.getByRole('button', { name: 'Kapat ve listeye dön', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Yeni organizasyon', exact: true })).toBeDisabled();
    await page.unroute(target);
    await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Yeni organizasyon', exact: true })).toBeEnabled();
  });
}

for (const denial of ['editor', 'viewer', 'inactive', 'suspended', 'expired', 'missing'] as const) {
  test(`Organizations: current ${denial} identity rejects all mutations despite stale ADMIN state`, async ({ page, context, fixtures, graph, prisma }) => {
    await open(page, fixtures, graph.code);
    const dialog = await edit(page, graph);
    await dialog.getByLabel('Organizasyon adı *', { exact: true }).fill('Preserved draft');
    const before = await prisma.organization.findMany({ orderBy: { id: 'asc' }, include: { buildings: true } });
    try {
      await installTestSession(context, fixtures, 'ADMIN', denial === 'expired');
      if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
      else if (denial === 'viewer' || denial === 'editor') await prisma.user.update({ where: { id: fixtures.userId }, data: { role: denial.toUpperCase() as 'VIEWER' | 'EDITOR' } });
      else if (denial === 'inactive' || denial === 'suspended') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: denial.toUpperCase() as 'INACTIVE' | 'SUSPENDED' } });
      const status = denial === 'viewer' || denial === 'editor' ? 403 : 401;
      await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText(status === 403 ? 'yetkiniz' : 'Oturumunuz');
      await expect(dialog.getByLabel('Organizasyon adı *', { exact: true })).toHaveValue('Preserved draft');
      expect((await page.request.post('/api/organizations', { data: { name: 'Denied', code: graph.code + '-DENIED' } })).status()).toBe(status);
      expect((await page.request.put('/api/organizations/' + graph.id, { data: { code: 'Denied' } })).status()).toBe(status);
      expect((await page.request.delete('/api/organizations/' + graph.id)).status()).toBe(status);
      expect((await page.request.get('/api/organizations')).status()).toBe(status === 403 ? 200 : 401);
      expect(await prisma.organization.findMany({ orderBy: { id: 'asc' }, include: { buildings: true } })).toEqual(before);
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } });
      await installTestSession(context, fixtures, 'ADMIN');
    }
    await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: graph.id } })).name).toBe('Preserved draft');
  });
}

test('Organizations: mobile light and dark dialogs remain usable without horizontal overflow or writes', async ({ page, fixtures, graph, prisma }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, fixtures, graph.code);
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: graph.id } });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, info, 'organizations-mobile-light');
  await page.getByRole('button', { name: graph.name + ' organizasyonunu düzenle', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Organizasyonu düzenle', exact: true });
  await dialog.getByLabel('Organizasyon adı *', { exact: true }).fill('Cancelled mobile draft');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await capture(page, info, 'organizations-mobile-dark-edit');
  await dialog.getByRole('button', { name: 'İptal', exact: true }).click();
  expect(await prisma.organization.findUniqueOrThrow({ where: { id: graph.id } })).toEqual(before);
});
