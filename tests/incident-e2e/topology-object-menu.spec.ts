import { expect, type Page, type TestInfo } from '@playwright/test';
import { test, signIn } from './fixtures';
import fixture from '../../scripts/fixtures/topology-workspace.cjs';

const building = fixture.organizations[0].buildings[0];
const branch = { id: 'other-building', name: 'TEST · Şube', city: '', organizationId: 'test-org', floors: [] };
const devices = fixture.devices.map(device => ({ ...device, buildingId: device.rack ? null : branch.id }));
const internal = { id: 'internal-link', sourceDeviceId: 'core', targetDeviceId: 'access', sourcePortName: 'Gi1/0/1', targetPortName: 'Gi0/1', status: 'UP', type: 'ETHERNET', recordKind: 'device-link', bandwidth: '1 Gbps' };
const buildingLink = { id: 'building-link', sourceBuildingId: building.id, destBuildingId: branch.id, sourceBuilding: building, destBuilding: branch, connectionType: 'FIBER_SINGLE_MODE', status: 'UP', bandwidth: '10 Gbps', createdAt: '2026-10-19T10:00:00Z' };
async function sources(page: Page, canManage = true) {
  const reads: string[] = [], writes: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { localStorage.clear(); });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (request.method() !== 'GET') { if (path === '/api/auth/login') return route.continue(); writes.push(request.method() + ' ' + path); return route.fulfill({ status: 405, json: { success: false, error: 'Read-only synthetic test' } }); }
    let data: unknown;
    if (path === '/api/devices') data = devices;
    else if (path === '/api/organizations') data = [{ ...fixture.organizations[0], buildings: [building, branch] }];
    else if (path === '/api/services') data = [];
    else if (path === '/api/network-connections') data = fixture.connections;
    else if (path === '/api/building-connections') data = { items: [buildingLink] };
    else if (path === '/api/network/topology-status') data = { devices: fixture.telemetry };
    else if (path === '/api/network/building-layout' || path === '/api/network/building-device-layout') data = { positions: {}, canEdit: canManage };
    else if (path === '/api/network/building-devices') data = { devices: devices.filter(device => device.rack), connections: [internal], canManage };
    else if (path === '/api/network/building-device-connections') data = { ports: { core: [{ id: 'p1', name: 'Gi1/0/1' }], access: [{ id: 'p2', name: 'Gi0/1' }] }, connection: { ...internal, sourcePortId: 'p1', targetPortId: 'p2', updatedAt: '2026-10-19T10:00:00Z' }, canEdit: canManage, canDelete: canManage };
    else return route.continue();
    reads.push(request.url()); return route.fulfill({ json: { success: true, data } });
  });
  return { reads, writes, errors };
}
const map = (page: Page) => page.getByRole('region', { name: 'Topoloji haritası', exact: true });
const menu = (page: Page) => page.getByRole('menu');
const node = (page: Page, id: string) => map(page).locator(`.react-flow__node[data-id="${id}"]`);
async function capture(page: Page, info: TestInfo, name: string) { await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' }); }
async function checkMenuFocus(page: Page, info: TestInfo) {
  try { await expect(menu(page).getByRole('menuitem').first()).toBeFocused(); }
  catch (error) { await info.attach('menu-focus-diagnostic', { body: JSON.stringify(await page.evaluate(() => ({ active: document.activeElement?.outerHTML, menu: document.querySelector('[role="menu"]')?.outerHTML }))), contentType: 'application/json' }); throw error; }
}
async function rightClickEdge(page: Page, scope: ReturnType<typeof map>, id: string) {
  const edge = scope.locator(`.react-flow__edge[data-testid="rf__edge-${id}"]`); await edge.focus(); await page.keyboard.press('Shift+F10'); await expect(menu(page)).toBeVisible();
}

test('object menu: device actions use exact identity, no probes or reads on open, keyboard and clipboard feedback', async ({ page, context, fixtures }, info) => {
  const source = await sources(page); await context.grantPermissions(['clipboard-read', 'clipboard-write']); await signIn(page, fixtures); await page.goto('/network'); await page.getByRole('tab', { name: 'Cihazlar', exact: true }).click(); await expect(node(page, 'core')).toBeVisible();
  const before = source.reads.length; await node(page, 'core').click({ button: 'right' }); await expect(menu(page).getByRole('menuitem')).toHaveCount(3); expect(source.reads).toHaveLength(before); await expect(menu(page)).not.toContainText('SSH'); await expect(menu(page)).not.toContainText('Ping');
  await expect(menu(page).getByRole('menuitem').first()).toBeFocused(); await page.keyboard.press('End'); await expect(menu(page).getByRole('menuitem', { name: 'Yönetim IP’sini kopyala', exact: true })).toBeFocused(); await page.keyboard.press('Enter'); await expect(page.getByRole('status').filter({ hasText: 'Yönetim IP adresi kopyalandı.' })).toBeVisible(); expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('192.0.2.10');
  const trigger = node(page, 'core').getByRole('button', { name: 'TEST-OMURGA-01: işlemler', exact: true }); await trigger.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape'); await expect(menu(page)).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await menu(page).getByRole('menuitem', { name: 'Bağlı cihazları göster', exact: true }).click(); const list = page.getByRole('dialog', { name: 'Cihaz bağlantıları', exact: true }); await expect(list).toContainText('TEST-OMURGA-01 · Doğrudan bağlantılar'); await expect(list.getByRole('status')).toHaveText('3 / 3 bağlantı'); await list.getByRole('button', { name: 'Bağlantı listesini kapat', exact: true }).click();
  await node(page, 'unknown').click({ button: 'right' }); await expect(menu(page).getByRole('menuitem', { name: 'Yönetim IP’sini kopyala', exact: true })).toHaveCount(0); await menu(page).getByRole('menuitem', { name: 'Ayrıntıları aç', exact: true }).click(); await expect(page.getByRole('complementary', { name: 'Seçim detayları', exact: true })).toContainText('TEST-DURUMSUZ-01'); await capture(page, info, 'topology-object-device-details'); expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('object menu: building opens existing workspace and filters connected buildings; edge endpoints are explicit', async ({ page, fixtures }, info) => {
  const source = await sources(page); await signIn(page, fixtures); await page.goto('/network'); const buildingNode = node(page, 'building-' + building.id); await expect(buildingNode).toBeVisible(); const before = source.reads.length;
  await buildingNode.click({ button: 'right' }); await expect(menu(page).getByRole('menuitem')).toHaveCount(2); expect(source.reads).toHaveLength(before); await capture(page, info, 'topology-object-building-menu'); await menu(page).getByRole('menuitem', { name: 'Bağlantılı binaları göster', exact: true }).click(); await expect(page.getByRole('button', { name: 'Tümünü göster', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await rightClickEdge(page, map(page), 'building-conn-building-link'); await expect(menu(page).getByRole('menuitem', { name: 'Bağlantıyı düzenle', exact: true })).toHaveCount(0); await menu(page).getByRole('menuitem', { name: 'Ayrıntıları aç', exact: true }).click(); await expect(page.getByRole('complementary', { name: 'Seçim detayları', exact: true })).toContainText(branch.name);
  await page.getByRole('group', { name: 'Topoloji etkileşim modu', exact: true }).getByRole('button', { name: 'Düzenleme', exact: true }).click(); await rightClickEdge(page, map(page), 'building-conn-building-link'); await expect(menu(page).getByRole('menuitem', { name: 'Bağlantıyı düzenle', exact: true })).toBeVisible(); await page.keyboard.press('Escape'); await buildingNode.getByRole('button', { name: building.name + ': işlemler', exact: true }).click(); await menu(page).getByRole('menuitem', { name: 'Binadaki cihazları aç', exact: true }).click(); await expect(page.getByRole('dialog', { name: building.name, exact: true })).toBeVisible(); expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('object menu: device edge details and source/target shortcuts keep real endpoint identity', async ({ page, fixtures }) => {
  const source = await sources(page); await signIn(page, fixtures); await page.goto('/network'); await page.getByRole('tab', { name: 'Cihazlar', exact: true }).click(); await rightClickEdge(page, map(page), 'test-link-1'); await menu(page).getByRole('menuitem', { name: 'Hedef cihazı göster', exact: true }).click(); await expect(page.getByRole('complementary', { name: 'Seçim detayları', exact: true }).getByRole('heading', { name: 'TEST-SUNUCU-01', exact: true })).toBeVisible(); expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

for (const canManage of [true, false]) test('object menu: nested device/connection menu, read-only detail and editing capability ' + canManage, async ({ page, fixtures }, info) => {
  const source = await sources(page, canManage); await signIn(page, fixtures); await page.goto('/network'); await node(page, 'building-' + building.id).getByRole('button', { name: building.name + ': işlemler', exact: true }).click(); await menu(page).getByRole('menuitem', { name: 'Binadaki cihazları aç', exact: true }).click(); const workspace = page.getByRole('dialog', { name: building.name, exact: true }); await expect(workspace).toBeVisible(); const graph = workspace.locator('.react-flow'); await expect(graph.locator('.react-flow__node')).toHaveCount(2);
  const trigger = graph.locator('.react-flow__node[data-id="core"]').getByRole('button', { name: 'TEST-OMURGA-01: işlemler', exact: true }); const before = source.reads.length; await trigger.click(); await checkMenuFocus(page, info); expect(source.reads).toHaveLength(before); await page.keyboard.press('Escape'); await expect(workspace).toBeVisible(); await expect(trigger).toBeFocused(); await trigger.click(); await menu(page).getByRole('menuitem', { name: 'Bağlı cihazları göster', exact: true }).click(); await expect(workspace.getByRole('complementary')).toContainText('1 doğrudan bağlantı');
  await rightClickEdge(page, graph, 'internal-link'); await expect(menu(page).getByRole('menuitem', { name: 'Bağlantıyı düzenle', exact: true })).toHaveCount(0); await menu(page).getByRole('menuitem', { name: 'Ayrıntıları aç', exact: true }).click(); await expect(workspace).toContainText('Gi1/0/1 ↔ Gi0/1'); await expect(page.getByRole('dialog')).toHaveCount(1);
  if (canManage) { await workspace.getByRole('button', { name: 'Düzenleme', exact: true }).click(); await rightClickEdge(page, graph, 'internal-link'); await expect(menu(page).getByRole('menuitem', { name: 'Bağlantıyı düzenle', exact: true })).toBeVisible(); await menu(page).getByRole('menuitem', { name: 'Bağlantıyı düzenle', exact: true }).click(); await expect(page.getByRole('dialog').filter({ hasText: 'Cihaz bağlantısını düzenle' })).toBeVisible(); }
  else { await trigger.click(); await capture(page, info, 'topology-object-nested-readonly'); await page.keyboard.press('Escape'); }
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('object menu: mobile dark ellipsis opens bounded menu, arrows wrap and outside click dismisses', async ({ page, fixtures }, info) => {
  const source = await sources(page); await signIn(page, fixtures); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/network'); await page.getByRole('tab', { name: 'Cihazlar', exact: true }).click(); await page.evaluate(() => document.documentElement.classList.add('dark')); const trigger = node(page, 'core').getByRole('button', { name: 'TEST-OMURGA-01: işlemler', exact: true }); await trigger.click(); await expect(menu(page)).toBeVisible(); await page.keyboard.press('ArrowUp'); await expect(menu(page).getByRole('menuitem').last()).toBeFocused(); const bounds = await menu(page).boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390); expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844); await capture(page, info, 'topology-object-mobile-dark'); await page.mouse.click(5, 5); await expect(menu(page)).toHaveCount(0); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});
