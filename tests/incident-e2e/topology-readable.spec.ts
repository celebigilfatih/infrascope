import { expect, type Page } from '@playwright/test';
import { test, signIn } from './fixtures';
import sample from '../../scripts/fixtures/building-readable-map.cjs';
import fixture from '../../scripts/fixtures/topology-workspace.cjs';

async function readableFixture(page: Page, saved = false, jitter = false, size = 32) {
  const writes: string[] = [];
  const buildings = sample.buildings.slice(0, size);
  const links = size === 32 ? sample.links : buildings.slice(1).map((building: { id: string }, index: number) => ({
    ...sample.links[0], id: `backbone-spoke-${index}`, sourceBuildingId: buildings[0].id, sourceBuilding: buildings[0], destBuildingId: building.id, destBuilding: building,
  }));
  const positions = saved ? Object.fromEntries(buildings.map((b: { id: string }, i: number) => [`building-${b.id}`, { x: (i % 8) * 280 + (jitter ? i * 1.13 : 0), y: Math.floor(i / 8) * 230 + (jitter ? i * 1.37 : 0) }])) : {};
  const before = JSON.stringify(positions);
  const devices = Array.from({ length: 94 }, (_, i) => ({ ...fixture.devices[0], id: `readable-device-${i}`, name: `TEST-READABLE-${i}`, rack: null, buildingId: buildings[i % size].id, managementIp: `192.0.2.${i + 1}`, networkInterfaces: [] }));
  const payloads: Record<string, unknown> = {
    '/api/devices': devices, '/api/organizations': [{ ...fixture.organizations[0], buildings }],
    '/api/services': [], '/api/network-connections': [], '/api/building-connections': { items: links },
    '/api/network/topology-status': { devices: [] }, '/api/network/groups': { items: [], canManage: true },
    '/api/network/building-layout': { positions, canEdit: true },
    '/api/network/topology-presentation': { document: null, revision: 0, canEdit: true },
  };
  await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/auth/')) return route.continue();
    if (request.method() !== 'GET') { writes.push(`${request.method()} ${pathname}`); return route.fulfill({ status: 405, json: { success: false, error: 'Read-only map fixture' } }); }
    return pathname in payloads ? route.fulfill({ json: { success: true, data: payloads[pathname] } }) : route.continue();
  });
  return { writes, positions, before, links };
}

const map = (page: Page) => page.getByRole('region', { name: 'Topoloji haritası', exact: true });
async function expectClearNames(page: Page, buildings = 32, links = 33) {
  await expect(map(page)).toHaveAttribute('aria-busy', 'false');
  await expect(map(page).locator('.react-flow__node-building')).toHaveCount(buildings);
  await expect(map(page).locator('path.react-flow__edge-path')).toHaveCount(links);
  const intersections = await map(page).evaluate(element => {
    const labels = [...element.querySelectorAll('.react-flow__node-building h3, .react-flow__node-building p')].map(el => ({ text: el.textContent, rect: el.getBoundingClientRect() }));
    const hits: string[] = [];
    for (const path of element.querySelectorAll<SVGPathElement>('path.react-flow__edge-path')) {
      const matrix = path.getScreenCTM()!, length = path.getTotalLength();
      for (let step = 0; step <= length; step += 2) {
        const point = path.getPointAtLength(step).matrixTransform(matrix);
        const hit = labels.find(({ rect }) => point.x > rect.left + 1 && point.x < rect.right - 1 && point.y > rect.top + 1 && point.y < rect.bottom - 1);
        if (hit) { hits.push(`${path.id}: ${hit.text}`); break; }
      }
    }
    return hits;
  });
  expect(intersections, 'Actual SVG curves must avoid actual rendered name/count rectangles').toEqual([]);
}

test('backbone overview: 10 buildings, node and edge inspector without writes', async ({ page, fixtures }, info) => {
  const state = await readableFixture(page, false, false, 10);
  await signIn(page, fixtures);
  await page.goto('/network');
  await expectClearNames(page, 10, state.links.length);
  await expect(map(page).locator('[data-backbone="true"]')).toContainText('TEST · Merkez');
  await page.getByRole('button', { name: 'Ekrana sığdır', exact: true }).click();
  await info.attach('10-buildings-backbone', { body: await page.screenshot(), contentType: 'image/png' });
  await map(page).locator('[data-backbone="true"]').click({ position: { x: 80, y: 28 } });
  await expect(page.getByRole('group', { name: 'Seçili bina işlemleri' }).getByRole('button', { name: 'Cihazları aç' })).toBeVisible();
  await page.getByRole('button', { name: 'Seçimi kapat' }).click();
  const point = await map(page).locator('path.react-flow__edge-path').first().evaluate(element => {
    const path = element as SVGPathElement;
    const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('group', { name: 'Seçili bağlantı ayrıntıları' })).toContainText('Durum bilinmiyor');
  expect(state.writes).toEqual([]);
});

test('readable topology: 32 buildings/33 obstacle-aware paths, fullscreen and no view writes', async ({ page, fixtures }, info) => {
  const state = await readableFixture(page); await signIn(page, fixtures); await page.goto('/network');
  await expectClearNames(page);
  await page.getByRole('button', { name: 'Haritayı tam ekran yap', exact: true }).click();
  await page.getByRole('button', { name: 'Ekrana sığdır', exact: true }).click();
  await expectClearNames(page);
  const zoom = await map(page).locator('.react-flow__viewport').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
  expect(zoom).toBeGreaterThan(.5);
  await info.attach('32-buildings-33-links-fullscreen', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Tam ekrandan çık', exact: true }).click();
  await expectClearNames(page); await page.reload(); await expectClearNames(page);
  expect(state.writes).toEqual([]); expect(JSON.stringify(state.positions)).toBe(state.before);
});

test('readable topology: saved coordinates survive preview/cancel and reload without writes', async ({ page, fixtures }, info) => {
  const state = await readableFixture(page, true); await signIn(page, fixtures); await page.goto('/network');
  await expectClearNames(page);
  const original = await map(page).locator('.react-flow__node-building').evaluateAll(elements => Object.fromEntries(elements.map(el => [el.getAttribute('data-id'), (el as HTMLElement).style.transform])));
  await page.getByRole('button', { name: 'Haritayı düzenle', exact: true }).click();
  for (const [id, point] of Object.entries(state.positions)) {
    await expect(map(page).locator(`[data-id="${id}"]`)).toHaveCSS('transform', `matrix(1, 0, 0, 1, ${point.x}, ${point.y})`);
  }
  await page.getByRole('button', { name: 'Bina haritası seçenekleri', exact: true }).click();
  await page.getByRole('button', { name: 'Otomatik düzenle', exact: true }).click();
  await expect(page.getByText('Yerleşim önizlemesi', { exact: true })).toBeVisible();
  await expectClearNames(page);
  await info.attach('layout-preview-no-write', { body: await page.screenshot(), contentType: 'image/png' });
  expect(state.writes).toEqual([]);
  await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  await page.getByRole('button', { name: 'Düzenlemeyi bitir', exact: true }).click();
  await page.reload(); await expectClearNames(page);
  const restored = await map(page).locator('.react-flow__node-building').evaluateAll(elements => Object.fromEntries(elements.map(el => [el.getAttribute('data-id'), (el as HTMLElement).style.transform])));
  expect(restored).toEqual(original); expect(state.writes).toEqual([]); expect(JSON.stringify(state.positions)).toBe(state.before);
});

test('readable topology: dragging coalesces routing until release on unaligned 32/33 saved positions', async ({ page, fixtures }) => {
  await readableFixture(page, true, true); await signIn(page, fixtures); await page.goto('/network');
  await expectClearNames(page);
  await page.getByRole('button', { name: 'Haritayı düzenle', exact: true }).click();
  await page.getByRole('combobox', { name: 'Topolojide bina veya cihaz ara', exact: true }).fill('TEST · Merkez');
  await page.getByRole('option', { name: 'TEST · Merkez Bina', exact: true }).click();
  const node = map(page).locator('[data-id="building-readable-00"]'), box = (await node.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 28); await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 48, { steps: 2 });
  await expect(page.getByText('Taşıma sırasında bağlantılar geçici olarak gizlenir; bıraktığınızda yeniden çizilir.', { exact: true })).toBeVisible();
  await expect(map(page).locator('path.react-flow__edge-path')).toHaveCount(0);
  await page.mouse.move(box.x + 140, box.y + 70, { steps: 4 }); await page.mouse.up();
  await expectClearNames(page);
});
