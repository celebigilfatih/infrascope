import { expect, type Page, type TestInfo } from '@playwright/test';
import { test, signIn } from './fixtures';
import fixture from '../../scripts/fixtures/topology-workspace.cjs';

async function mockTopology(page: Page) {
  const state = { optionalFailure: false, inventoryFailure: false, emptyInventory: false, emptyConnections: false };
  const writes: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      if (pathname === '/api/auth/login') return route.continue();
      writes.push(`${request.method()} ${pathname}`);
      return route.fulfill({ status: 405, json: { success: false, error: 'Read-only topology fixture' } });
    }
    const payloads: Record<string, unknown> = {
      '/api/devices': state.emptyInventory ? [] : fixture.devices,
      '/api/organizations': fixture.organizations,
      '/api/services': [],
      '/api/network-connections': state.emptyConnections ? [] : fixture.connections,
      '/api/building-connections': { items: [] },
      '/api/network/topology-status': { devices: state.emptyInventory ? [] : fixture.telemetry },
    };
    if (!(pathname in payloads)) return route.continue();
    const failed = pathname === '/api/devices' ? state.inventoryFailure : state.optionalFailure && !['/api/organizations'].includes(pathname);
    return route.fulfill({ status: failed ? 503 : 200, json: failed ? { success: false, error: 'Fixture source unavailable' } : { success: true, data: payloads[pathname] } });
  });
  return { state, writes, errors };
}
const details = (page: Page) => page.getByRole('complementary', { name: 'Seçim detayları', exact: true });
async function screenshot(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
}
async function openConnections(page: Page) {
  await page.getByRole('button', { name: 'Bağlantı listesi', exact: true }).click();
  return page.getByRole('dialog', { name: 'Cihaz bağlantıları', exact: true });
}

test('topology workspace: connection identity, keyboard list, device peers, edges and expanded map', async ({ page, fixtures }, info) => {
  const source = await mockTopology(page); await signIn(page, fixtures); await page.goto('/network');
  await page.getByRole('tab', { name: 'Cihazlar', exact: true }).click();
  const map = page.getByRole('region', { name: 'Topoloji haritası', exact: true });
  await expect(map.locator('.react-flow__node')).toHaveCount(4); await expect(map.locator('.react-flow__edge')).toHaveCount(3);
  const list = await openConnections(page);
  await list.getByLabel('Bağlantı durumu', { exact: true }).selectOption('unknown');
  await list.getByRole('textbox', { name: 'Bağlantılarda ara', exact: true }).fill('Gi1/0/3');
  await expect(list.getByRole('status')).toHaveText('1 / 3 bağlantı');
  const record = list.getByRole('button').filter({ hasText: 'TEST-DURUMSUZ-01' }); await record.focus(); await page.keyboard.press('Enter');
  await expect(list).toHaveCount(0); await expect(details(page)).toContainText('Durum bilinmiyor'); await expect(details(page)).toContainText('Gi1/0/3');
  await expect(details(page)).toBeFocused();
  await details(page).getByRole('button', { name: 'TEST-OMURGA-01', exact: true }).click();
  await expect(details(page).getByRole('heading', { name: 'TEST-OMURGA-01', exact: true })).toBeVisible();
  await expect(details(page)).toContainText('192.0.2.10'); await expect(details(page)).toContainText('Son ölçüm (TSİ): 16 Eki 2026 15:00');
  await details(page).getByRole('button').filter({ hasText: 'TEST-ERİŞİM-01' }).click();
  await expect(details(page)).toContainText('Gi1/0/1'); await expect(details(page)).toContainText('Gi0/1'); await expect(details(page)).toContainText('Bağlantı açık');
  await screenshot(page, info, 'topology-desktop-connection');
  await details(page).getByRole('button', { name: 'Detay panelini kapat', exact: true }).click(); await expect(map).toBeFocused();
  const edge = map.getByRole('button', { name: 'Cihaz bağlantısı: Gi1/0/2 – eth0, Bağlantı kapalı', exact: true }).locator('path.react-flow__edge-interaction');
  const point = await edge.evaluate(element => {
    const path = element as SVGPathElement, matrix = path.getScreenCTM();
    if (!matrix) throw new Error('Missing edge transform');
    const position = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(matrix);
    return { x: position.x, y: position.y };
  });
  await page.mouse.click(point.x, point.y); await expect(details(page)).toContainText('Bağlantı kapalı');
  await page.getByRole('button', { name: 'Haritayı genişlet', exact: true }).click(); await expect(page.getByRole('button', { name: 'Normal görünüme dön', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Haritayı genişlet', exact: true })).toBeVisible();
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('topology workspace: unavailable connection counts stay unknown and recover separately from real empty data', async ({ page, fixtures }, info) => {
  const source = await mockTopology(page); source.state.optionalFailure = true;
  await signIn(page, fixtures); await page.goto('/network'); await page.getByRole('tab', { name: 'Cihazlar', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Bazı veriler alınamadı:' })).toBeVisible();
  await page.getByRole('button', { name: 'Ağ özetini göster', exact: true }).click();
  const metric = page.getByRole('region', { name: 'Ağ özeti', exact: true }).locator('div').filter({ has: page.getByText('Görünen bağlantı', { exact: true }) }).first();
  await expect(metric).toContainText('—');
  await page.keyboard.press('Escape');
  let list = await openConnections(page); await expect(list).toContainText('Bağlantı sayısı doğrulanamadı.'); await expect(list).toContainText('Bağlantı verileri alınamadı.');
  await list.getByRole('button', { name: 'Bağlantı listesini kapat', exact: true }).click();
  source.state.optionalFailure = false; await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Topoloji haritası', exact: true }).locator('.react-flow__edge')).toHaveCount(3);
  source.state.emptyConnections = true; await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  list = await openConnections(page); await expect(list.getByRole('status')).toHaveText('0 / 0 bağlantı'); await expect(list).toContainText('Bu görünümde kayıtlı cihaz bağlantısı yok.');
  await screenshot(page, info, 'topology-confirmed-empty-connections'); expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('topology workspace: inventory error is retryable and never presented as successful empty inventory', async ({ page, fixtures }, info) => {
  const source = await mockTopology(page); source.state.inventoryFailure = true;
  await signIn(page, fixtures); await page.goto('/network');
  await expect(page.getByRole('alert').filter({ hasText: 'Topoloji yüklenemedi' })).toBeVisible();
  await page.getByRole('button', { name: 'Ağ özetini göster', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Ağ özeti', exact: true })).toContainText('—');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Envanter boş', { exact: true })).toHaveCount(0);
  source.state.inventoryFailure = false; await page.getByRole('button', { name: 'Tekrar Dene', exact: true }).click(); await page.getByRole('tab', { name: 'Cihazlar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Topoloji haritası', exact: true }).locator('.react-flow__node')).toHaveCount(4);
  source.state.emptyInventory = true; source.state.emptyConnections = true; await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  await expect(page.getByText('Envanter boş', { exact: true })).toBeVisible();
  await screenshot(page, info, 'topology-recovered-inventory'); expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

for (const theme of ['light', 'dark']) {
  test(`topology workspace: mobile ${theme} list and inspector stay within the viewport`, async ({ page, fixtures }, info) => {
    const source = await mockTopology(page); await signIn(page, fixtures); await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(value => localStorage.setItem('theme', value), theme); await page.goto('/network'); await page.getByRole('tab', { name: 'Cihazlar', exact: true }).click();
    const list = await openConnections(page); await list.getByRole('textbox', { name: 'Bağlantılarda ara', exact: true }).fill('Gi1/0/2');
    await list.getByRole('button').filter({ hasText: 'TEST-SUNUCU-01' }).click(); await expect(details(page)).toBeVisible();
    const bounds = await details(page).boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await screenshot(page, info, `topology-mobile-${theme}`);
    await details(page).getByRole('button', { name: 'TEST-SUNUCU-01', exact: true }).click(); await expect(details(page).getByText('Bu cihaz için kayıtlı bağlantı yok.', { exact: true })).toHaveCount(0);
    await expect(details(page)).toContainText('TEST-OMURGA-01');
    await details(page).getByRole('button', { name: 'Detay panelini kapat', exact: true }).click(); await expect(details(page)).toHaveCount(0);
    expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
  });
}
