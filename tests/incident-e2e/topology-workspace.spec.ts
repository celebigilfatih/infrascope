import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { test, signIn } from './fixtures';
import { openBuildingDevices, openSavedTopology } from './topology-navigation';
import fixture from '../../scripts/fixtures/topology-workspace.cjs';

const building = fixture.organizations[0].buildings[0];
const devices = fixture.devices.map(device => ({ ...device, buildingId: building.id, building, rackId: device.rack?.id || null, floorId: null, floor: null, nmsDeviceId: null }));
const connections = [
  { id: 'internal-up', sourceDeviceId: 'core', targetDeviceId: 'access', sourcePortName: 'Gi1/0/1', targetPortName: 'Gi0/1', status: 'UP', type: 'ETHERNET', recordKind: 'device-link', bandwidth: '1 Gbps' },
  { id: 'internal-down', sourceDeviceId: 'core', targetDeviceId: 'server', sourcePortName: 'Gi1/0/2', targetPortName: 'eth0', status: 'DOWN', type: 'ETHERNET', recordKind: 'device-link', bandwidth: '1 Gbps' },
  { id: 'internal-unknown', sourceDeviceId: 'core', targetDeviceId: 'unknown', sourcePortName: 'Gi1/0/3', targetPortName: 'eth1', status: 'UNKNOWN', type: 'ETHERNET', recordKind: 'device-link', bandwidth: '1 Gbps' },
];

async function mockTopology(page: Page) {
  const state = { workspaceFailure: false, inventoryFailure: false, emptyInventory: false, emptyConnections: false };
  const writes: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    if (request.method() !== 'GET') {
      if (pathname === '/api/auth/login') return route.continue();
      writes.push(`${request.method()} ${pathname}`);
      return route.fulfill({ status: 405, json: { success: false, error: 'Read-only topology fixture' } });
    }
    const payloads: Record<string, unknown> = {
      '/api/devices': fixture.devices,
      '/api/organizations': fixture.organizations,
      '/api/services': [],
      '/api/network-connections': fixture.connections,
      '/api/building-connections': { items: [] },
      '/api/network/topology-status': { devices: fixture.telemetry },
      '/api/network/building-layout': { positions: {}, canEdit: false },
      '/api/network/building-device-layout': { positions: {}, canEdit: false },
      '/api/network/building-devices': { devices: state.emptyInventory ? [] : devices, connections: state.emptyInventory || state.emptyConnections ? [] : connections, canManage: false },
    };
    if (!(pathname in payloads)) return route.continue();
    if (pathname.startsWith('/api/network/building-device')) expect(url.searchParams.get('buildingId')).toBe('test-building');
    const failed = pathname === '/api/devices' ? state.inventoryFailure : pathname === '/api/network/building-devices' && state.workspaceFailure;
    return route.fulfill({ status: failed ? 503 : 200, json: failed ? { success: false, error: 'Fixture source unavailable' } : { success: true, data: payloads[pathname] } });
  });
  return { state, writes, errors };
}
const panel = (workspace: Locator) => workspace.getByRole('complementary');
async function screenshot(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
}
async function openConnections(workspace: Locator) {
  await workspace.getByRole('button', { name: /^Bağlantılar \d+$/ }).click();
  await expect(panel(workspace)).toBeFocused();
  return panel(workspace);
}

test('topology workspace: building connections preserve identity, keyboard selection and peer navigation', async ({ page, fixtures }, info) => {
  const source = await mockTopology(page); await signIn(page, fixtures); await page.goto('/network');
  await openSavedTopology(page);
  await page.getByRole('button', { name: 'Haritayı tam ekran yap', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tam ekrandan çık', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Haritayı tam ekran yap', exact: true })).toBeVisible();
  const workspace = await openBuildingDevices(page);
  await expect(workspace.getByRole('status').filter({ hasText: '4 cihaz · 3 bağlantı · 1 aktif' })).toBeVisible();
  const graph = workspace.getByRole('region', { name: 'Bina içi cihaz topolojisi', exact: true });
  await expect(graph.locator('.react-flow__node')).toHaveCount(4); await expect(graph.locator('.react-flow__edge')).toHaveCount(3);
  const list = await openConnections(workspace);
  const record = list.getByRole('button', { name: 'TEST-OMURGA-01 – TEST-DURUMSUZ-01 bağlantısını incele', exact: true });
  await record.focus(); await page.keyboard.press('Enter');
  await expect(list).toContainText('Gi1/0/3 ↔ eth1'); await expect(list).toContainText('Durum bilinmiyor');
  await list.getByRole('button', { name: 'TEST-OMURGA-01 cihazına odaklan', exact: true }).first().click();
  await expect(list.getByRole('status')).toHaveText('3 doğrudan bağlantı');
  const peer = list.getByRole('listitem').filter({ hasText: 'TEST-ERİŞİM-01' });
  await expect(peer).toContainText('Bu cihaz · TEST-OMURGA-01: Gi1/0/1'); await expect(peer).toContainText('Bağlı cihaz · TEST-ERİŞİM-01: Gi0/1'); await expect(peer).toContainText('Bağlantı açık');
  await peer.getByRole('button', { name: 'TEST-ERİŞİM-01 cihazına odaklan', exact: true }).click();
  await expect(list.getByRole('status')).toHaveText('1 doğrudan bağlantı');
  await expect(list).toContainText('Bu cihaz · TEST-ERİŞİM-01: Gi0/1'); await expect(list).toContainText('Bağlı cihaz · TEST-OMURGA-01: Gi1/0/1');
  await list.getByRole('button', { name: 'Önceki cihaza dön: TEST-OMURGA-01', exact: true }).click(); await expect(list.getByRole('status')).toHaveText('3 doğrudan bağlantı');
  await screenshot(page, info, 'topology-desktop-building-connection');
  await list.getByRole('button', { name: 'Cihaz panelini kapat', exact: true }).click();
  await expect(workspace.getByRole('button', { name: 'Bağlantılar 3', exact: true })).toBeFocused();
  const edge = graph.locator('.react-flow__edge[data-testid="rf__edge-internal-down"] path.react-flow__edge-interaction');
  let previousGeometry = '', stableReadings = 0;
  await expect.poll(async () => {
    const geometry = await edge.evaluate(element => {
      const path = element as SVGPathElement, matrix = path.getScreenCTM();
      return JSON.stringify([path.getAttribute('d'), matrix && [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]]);
    });
    stableReadings = geometry === previousGeometry ? stableReadings + 1 : 0; previousGeometry = geometry; return stableReadings >= 3;
  }, { intervals: [100], message: 'Wait for the panel resize and map fit to settle before selecting the actual edge' }).toBe(true);
  const point = await edge.evaluate(element => {
    const path = element as SVGPathElement, matrix = path.getScreenCTM();
    if (!matrix) throw new Error('Missing edge transform');
    for (const fraction of [.2, .8, .35, .65, .1, .9]) {
      const position = path.getPointAtLength(path.getTotalLength() * fraction).matrixTransform(matrix);
      if (document.elementFromPoint(position.x, position.y)?.closest('.react-flow__edge') === path.closest('.react-flow__edge')) return { x: position.x, y: position.y };
    }
    throw new Error('No exposed interactive segment for the device connection');
  });
  await page.mouse.click(point.x, point.y); await expect(panel(workspace)).toContainText('Gi1/0/2 ↔ eth0'); await expect(panel(workspace)).toContainText('Bağlantı kapalı');
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('topology workspace: unavailable building records remain unknown, retry recovers and real empty connections are explicit', async ({ page, fixtures }, info) => {
  const source = await mockTopology(page); source.state.workspaceFailure = true;
  await signIn(page, fixtures); await page.goto('/network'); const workspace = await openBuildingDevices(page);
  await expect(workspace.getByRole('alert')).toContainText('Fixture source unavailable');
  await expect(workspace.getByRole('status').filter({ hasText: 'Veriler alınamadı' })).toBeVisible();
  await expect(workspace.getByText('Bu binadaki cihazlar arasında kayıtlı bağlantı yok.', { exact: true })).toHaveCount(0);
  source.state.workspaceFailure = false; await workspace.getByRole('button', { name: 'Yeniden dene', exact: true }).click();
  await expect(workspace.getByRole('status').filter({ hasText: '4 cihaz · 3 bağlantı · 1 aktif' })).toBeVisible();
  source.state.emptyConnections = true; await workspace.getByRole('button', { name: 'Bina cihazlarını yenile', exact: true }).click();
  await expect(workspace.getByRole('status').filter({ hasText: '4 cihaz · 0 bağlantı · 1 aktif' })).toBeVisible();
  await openConnections(workspace); await expect(panel(workspace).getByRole('status')).toHaveText('Bu binadaki cihazlar arasında kayıtlı bağlantı yok.');
  await expect(workspace.getByRole('alert')).toHaveCount(0); await screenshot(page, info, 'topology-confirmed-empty-building-connections');
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('topology workspace: inventory failure retries into a building and confirmed empty building devices are distinct', async ({ page, fixtures }, info) => {
  const source = await mockTopology(page); source.state.inventoryFailure = true;
  await signIn(page, fixtures); await page.goto('/network');
  await expect(page.getByRole('alert').filter({ hasText: 'Topoloji yüklenemedi' })).toBeVisible(); await expect(page.getByText('Envanter boş', { exact: true })).toHaveCount(0);
  source.state.inventoryFailure = false; await page.getByRole('button', { name: 'Tekrar Dene', exact: true }).click(); const workspace = await openBuildingDevices(page);
  await expect(workspace.locator('.react-flow__node')).toHaveCount(4);
  source.state.emptyInventory = true; await workspace.getByRole('button', { name: 'Bina cihazlarını yenile', exact: true }).click();
  await expect(workspace.getByRole('status').filter({ hasText: '0 cihaz · 0 bağlantı · 0 aktif' })).toBeVisible();
  await expect(workspace.getByText('Bu binaya henüz cihaz atanmamış. “Cihaz ata” ile başlayın.', { exact: true })).toBeVisible();
  await expect(workspace.getByRole('alert')).toHaveCount(0); await screenshot(page, info, 'topology-recovered-empty-building');
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

for (const theme of ['light', 'dark']) {
  test(`topology workspace: mobile ${theme} building list and details stay within the viewport`, async ({ page, fixtures }, info) => {
    const source = await mockTopology(page); await signIn(page, fixtures); await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(value => localStorage.setItem('theme', value), theme); await page.goto('/network'); const workspace = await openBuildingDevices(page);
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/); else await expect(page.locator('html')).not.toHaveClass(/dark/);
    const list = await openConnections(workspace);
    await list.getByRole('button', { name: 'TEST-OMURGA-01 – TEST-SUNUCU-01 bağlantısını incele', exact: true }).click();
    await expect(list).toContainText('Gi1/0/2 ↔ eth0'); await expect(list).toContainText('Bağlantı kapalı');
    const bounds = await list.boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390); expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await screenshot(page, info, `topology-mobile-${theme}`);
    await list.getByRole('button', { name: 'TEST-SUNUCU-01 cihazına odaklan', exact: true }).click(); await expect(list.getByRole('status')).toHaveText('1 doğrudan bağlantı'); await expect(list).toContainText('Bağlı cihaz · TEST-OMURGA-01: Gi1/0/2');
    await list.getByRole('button', { name: 'Cihaz panelini kapat', exact: true }).click(); await expect(list).toHaveCount(0); await expect(workspace.getByRole('button', { name: 'Bağlantılar 3', exact: true })).toBeFocused();
    expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
  });
}
