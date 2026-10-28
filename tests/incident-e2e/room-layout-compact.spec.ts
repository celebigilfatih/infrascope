import { expect, type Page } from '@playwright/test';
import { test, signIn, capture } from './fixtures';

const rackName = 'Uzun isimli ana omurga ve dağıtım kabineti';
async function roomFixture(page: Page) {
  const writes: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/racks/**', route => { writes.push(route.request().method()); return route.fulfill({ status: 403, json: { success: false } }); });
  await page.route('**/api/rooms/compact-room', route => {
    if (route.request().method() !== 'GET') { writes.push(route.request().method()); return route.fulfill({ status: 403, json: { success: false } }); }
    return route.fulfill({ json: { success: true, data: {
      id: 'compact-room', name: 'Kompakt sistem odası', width: null, depth: null, height: null,
      floor: { name: 'Giriş katı', building: { name: 'Merkez bina' } },
      racks: [
        { id: 'rack-main', name: rackName, type: '42U_RACK', maxUnits: 42, operationalStatus: 'OPERATIONAL', coordX: null, coordZ: null, devices: [
          { id: 'device-one', name: 'Kesilmeden gösterilecek uzun isimli ağ anahtarı', type: 'SWITCH', status: 'ACTIVE', rackUnitPosition: null },
        ] },
        { id: 'rack-second', name: 'İkinci kabinet', type: '42U_RACK', maxUnits: 42, operationalStatus: 'MAINTENANCE', coordX: 3, coordZ: 2, devices: [] },
      ],
    } } });
  });
  return { writes, errors };
}

test('Room compact desktop: scene uses empty inspector space and filtering clears hidden selection', async ({ page, fixtures }, info) => {
  const source = await roomFixture(page); await signIn(page, fixtures); await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/locations/rooms/compact-room');
  await expect(page.getByRole('heading', { name: 'Kompakt sistem odası', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Kabinet detayları' })).toHaveCount(0);
  await expect(page.getByText('Odayı farklı açılardan inceleyin', { exact: true })).toHaveCount(0);
  const scene = page.getByRole('region', { name: 'Oda yerleşim alanı' });
  expect((await scene.boundingBox())!.width).toBeGreaterThan(750);
  await page.getByRole('button', { name: `${rackName} detaylarını göster`, exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Kabinet detayları' });
  await expect(inspector.getByRole('heading', { name: rackName, exact: true })).toBeVisible();
  await expect(inspector.getByText('Kesilmeden gösterilecek uzun isimli ağ anahtarı', { exact: true })).toBeVisible();
  await expect(inspector).toContainText('atanmamış');
  await expect(page.getByText('U, kabinet içindeki yükseklik birimidir.', { exact: false })).toHaveCount(0);
  await page.getByLabel('Kabinet veya cihaz ara').fill('İkinci');
  await expect(inspector).toHaveCount(0);
  await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).click();
  await page.getByRole('tab', { name: 'Oda planı', exact: true }).click();
  await page.getByRole('button', { name: 'Yerleşimi düzenle', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'kaydedilir' })).toBeVisible();
  await page.getByRole('button', { name: 'Düzenlemeyi bitir', exact: true }).click();
  await capture(page, info, 'room-compact-desktop-plan');
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('Room compact mobile: selection, expandable help and rack list fit without horizontal overflow', async ({ page, fixtures }, info) => {
  const source = await roomFixture(page); await signIn(page, fixtures); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/locations/rooms/compact-room');
  await page.getByLabel('Kabinet seçin', { exact: true }).selectOption('rack-main');
  const inspector = page.getByRole('complementary', { name: 'Kabinet detayları' });
  await expect(inspector.getByRole('heading', { name: rackName, exact: true })).toBeVisible();
  const scene = page.getByRole('region', { name: 'Oda yerleşim alanı' });
  expect((await inspector.boundingBox())!.y).toBeGreaterThanOrEqual((await scene.boundingBox())!.y + (await scene.boundingBox())!.height - 1);
  await expect(page.getByText('Sürükleyerek döndürün', { exact: false })).not.toBeVisible();
  await page.getByText('Görünüm yardımı', { exact: true }).click();
  await expect(page.getByText('Sürükleyerek döndürün', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Kabinet listesini göster', exact: true }).click();
  await expect(page.getByRole('button', { name: `${rackName} detaylarını göster`, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await capture(page, info, 'room-compact-mobile');
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});
