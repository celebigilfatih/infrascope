import { createHash } from 'node:crypto';
import { expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { test, signIn, capture } from './fixtures';

test('React 19 room renderer retains WebGL, camera and rack interactions', async ({ page, fixtures, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // The real room/font renderer must work without a CDN or an external fallback.
  await context.route('https://**/*', route => route.abort());
  await page.route('**/api/rooms/framework-room', route => route.fulfill({ json: { success: true, data: {
    id: 'framework-room', name: 'Framework uyumluluk odası', width: 10, depth: 8, height: 3,
    racks: [{ id: 'framework-rack', name: 'Uyumluluk kabineti', maxUnits: 42, operationalStatus: 'OPERATIONAL', coordX: 2, coordZ: 2, devices: [] }],
  } } }));
  await signIn(page, fixtures);
  await page.goto('/locations/rooms/framework-room');
  const scene = page.getByRole('img', { name: 'Framework uyumluluk odası üç boyutlu sistem odası görünümü' });
  const canvas = scene.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(node => {
    const gl = (node as HTMLCanvasElement).getContext('webgl2') || (node as HTMLCanvasElement).getContext('webgl');
    return gl ? Boolean(gl.getParameter(gl.RENDERER)) : false;
  })).toBe(true);
  // A healthy context alone also admits a blank scene while a font is pending.
  await expect.poll(async () => {
    const { data } = PNG.sync.read(await canvas.screenshot());
    const colors = new Set<number>();
    for (let index = 0; index < data.length; index += 28) {
      colors.add((data[index] << 16) | (data[index + 1] << 8) | data[index + 2]);
      if (colors.size > 64) break;
    }
    return colors.size;
  }).toBeGreaterThan(24);
  const initial = createHash('sha256').update((await canvas.screenshot()).toString('base64')).digest('hex');
  await page.getByLabel('Kamera açısı').selectOption('top');
  await expect(page.getByLabel('Kamera açısı')).toHaveValue('top');
  await expect.poll(async () => createHash('sha256').update((await canvas.screenshot()).toString('base64')).digest('hex')).not.toBe(initial);
  await page.getByRole('button', { name: 'Uyumluluk kabineti detaylarını göster' }).click();
  await expect(page.getByRole('button', { name: 'Seçili kabinete odaklan' })).toBeVisible();
  await page.getByRole('button', { name: 'Doluluk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Doluluk', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Genel görünüme dön' }).click();
  await expect(page.getByLabel('Kamera açısı')).toHaveValue('isometric');
  await capture(page, info, 'framework-react19-room3d');
  expect(errors).toEqual([]);
});
