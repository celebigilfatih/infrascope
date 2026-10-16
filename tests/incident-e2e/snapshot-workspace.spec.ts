import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { test, signIn, capture } from './fixtures';
import { deferred } from './exclusion-fixtures';
import snapshotFixture from '../../scripts/fixtures/snapshot-workspace.cjs';
import vmFixture from '../../scripts/fixtures/vm-workspace.cjs';

// All VMware reads and writes are intercepted; authentication uses only the private fixture DB.
const capabilities = { create: true, delete: true, revert: true };
async function mockSource(page: Page, options: { stale?: boolean; readOnly?: boolean; many?: boolean } = {}) {
  const writes: unknown[] = [], reads: Array<string | undefined> = [];
  let failRead = false, failWrite = false, gate: ReturnType<typeof deferred> | null = null;
  const vms = structuredClone(snapshotFixture.vms);
  if (options.many) vms[0].snapshots = Array.from({ length: 31 }, (_, index) => snapshotFixture.snapshot(`extra-${index}`, { name: `Fixture ${index}` }));
  await page.route('**/api/integrations/vmware**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const type = new URL(request.url()).searchParams.get('type');
      if (type === 'vm-workspace') return route.fulfill({ json: { vms: vmFixture.vms, collectedAt: new Date(snapshotFixture.NOW).toISOString(), canPower: false } });
      reads.push(request.headers()['x-cache-bypass']);
      return route.fulfill({ status: failRead ? 503 : 200, headers: { 'x-cache': options.stale ? 'STALE' : 'HIT' }, json: failRead ? { error: 'Kaynak bağlantısı kesildi.' } : {
        vms, collectedAt: new Date(snapshotFixture.NOW).toISOString(), capabilities: options.readOnly ? { create: false, delete: false, revert: false } : capabilities,
      } });
    }
    writes.push(request.postDataJSON());
    if (gate) await gate.promise;
    await route.fulfill({ status: failWrite ? 503 : 200, json: failWrite ? { error: 'İşlem test kaynağına iletilemedi.' } : { success: true } });
  });
  return { writes, reads, failRead: () => { failRead = true; }, failWrite: (value: boolean) => { failWrite = value; }, hold: () => { gate = deferred(); return gate; } };
}

test('snapshot workspace: pagination, filtered CSV and VM identity link', async ({ page, fixtures }, info) => {
  const source = await mockSource(page, { many: true });
  await signIn(page, fixtures); await page.clock.setFixedTime(snapshotFixture.NOW);
  await page.goto('/virtualization/snapshots');
  await expect(page.getByRole('heading', { name: 'Anlık Görüntüler', exact: true })).toBeVisible();
  const pagination = page.getByRole('navigation', { name: 'Anlık görüntü sayfaları' });
  await expect(pagination).toContainText('1–25 / 34');
  await page.getByRole('button', { name: 'Sonraki sayfa', exact: true }).click(); await expect(pagination).toContainText('26–34 / 34');
  await page.getByRole('combobox', { name: 'Sanal makine filtresi', exact: true }).selectOption('vm-102');
  await expect(pagination).toContainText('1–1 / 1');
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'CSV indir', exact: true }).click();
  const file = await downloaded; const filePath = await file.path(); expect(filePath).not.toBeNull();
  const csv = await readFile(filePath!, 'utf8'); expect(csv).toContain('Veritabanı bakımı öncesi'); expect(csv).not.toContain('Fixture 0');
  await page.getByRole('button', { name: 'VERİTABANI-01 / Veritabanı bakımı öncesi: görüntüyü incele', exact: true }).click();
  const detail = page.getByRole('dialog');
  await expect(detail).toContainText('snapshot-1'); await expect(detail).toContainText('vm-102');
  await expect(detail.getByRole('link', { name: 'Sanal makineyi incele' })).toHaveAttribute('href', '/virtualization/vms?vmId=vm-102');
  await capture(page, info, 'snapshot-desktop-detail');
  await detail.getByRole('link', { name: 'Sanal makineyi incele' }).click();
  await expect(page).toHaveURL(/\/virtualization\/vms\?vmId=vm-102$/);
  await expect(page.getByRole('dialog')).toContainText('vm-102'); expect(source.writes).toEqual([]);
});

test('snapshot workspace: create, retry, confirmation and duplicate submission guards', async ({ page, fixtures }, info) => {
  const source = await mockSource(page);
  await signIn(page, fixtures); await page.clock.setFixedTime(snapshotFixture.NOW); await page.goto('/virtualization/snapshots');
  await page.getByRole('button', { name: 'Yeni görüntü', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Sanal makine', { exact: true }).selectOption('vm-201');
  await dialog.getByLabel('Anlık görüntü adı', { exact: true }).fill('  Fixture before update  ');
  await dialog.getByLabel('Açıklama (isteğe bağlı)', { exact: true }).fill('Fixture only');
  await dialog.getByRole('button', { name: 'Vazgeç', exact: true }).click(); expect(source.writes).toEqual([]);
  await page.getByRole('button', { name: 'Yeni görüntü', exact: true }).click(); dialog = page.getByRole('dialog');
  await dialog.getByLabel('Sanal makine', { exact: true }).selectOption('vm-201');
  await dialog.getByLabel('Anlık görüntü adı', { exact: true }).fill('  Fixture before update  ');
  await dialog.getByLabel('Açıklama (isteğe bağlı)', { exact: true }).fill('Fixture only'); source.failWrite(true);
  await dialog.getByRole('button', { name: 'Görüntü oluştur', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('İşlem test kaynağına iletilemedi.');
  await expect(dialog.getByLabel('Anlık görüntü adı', { exact: true })).toHaveValue('  Fixture before update  ');
  source.failWrite(false); const gate = source.hold();
  try {
    await dialog.getByRole('button', { name: 'Görüntü oluştur', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'İletiliyor…', exact: true })).toBeDisabled();
    await page.keyboard.press('Enter'); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible(); expect(source.writes).toHaveLength(2);
  } finally { gate.resolve(); }
  await expect(dialog).toHaveCount(0); expect(source.writes).toEqual(Array(2).fill({ action: 'snapshot-create', vmId: 'vm-201', name: 'Fixture before update', description: 'Fixture only' }));
  expect(source.reads).toContain('1');
  await page.getByRole('button', { name: 'VERİTABANI-01 / Veritabanı bakımı öncesi: görüntüyü incele', exact: true }).click(); dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Görüntüyü sil', exact: true }).click();
  await expect(dialog.getByRole('group', { name: 'Anlık görüntü işlemini onayla' })).toContainText('Sanal makine: VERİTABANI-01');
  await dialog.getByRole('button', { name: 'Vazgeç', exact: true }).click(); expect(source.writes).toHaveLength(2);
  await dialog.getByRole('button', { name: 'Görüntüyü sil', exact: true }).click(); await capture(page, info, 'snapshot-delete-confirmation');
  await dialog.getByRole('button', { name: 'Silmeyi onayla', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(source.writes[2]).toEqual({ action: 'snapshot-delete', vmId: 'vm-102', snapshotId: 'snapshot-1' });
  await page.getByRole('button', { name: 'VERİTABANI-01 / Veritabanı bakımı öncesi: görüntüyü incele', exact: true }).click(); dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Bu noktaya dön', exact: true }).click(); await dialog.getByRole('button', { name: 'Geri dönmeyi onayla', exact: true }).click();
  await expect(dialog).toHaveCount(0); expect(source.writes[3]).toEqual({ action: 'snapshot-revert', vmId: 'vm-102', snapshotId: 'snapshot-1' });
});

test('snapshot workspace: stale and failed refresh keep rows and block writes', async ({ page, fixtures }, info) => {
  const source = await mockSource(page, { stale: true });
  await signIn(page, fixtures); await page.clock.setFixedTime(snapshotFixture.NOW); await page.goto('/virtualization/snapshots');
  await expect(page.getByRole('alert').filter({ hasText: 'Veriler güncel olmayabilir' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Yeni görüntü', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'VERİTABANI-01 / Veritabanı bakımı öncesi: görüntüyü incele', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Görüntüyü sil', exact: true })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Kapat', exact: true }).click(); source.failRead();
  await page.getByRole('button', { name: 'Yenile', exact: true }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Kaynak bağlantısı kesildi.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'VERİTABANI-01 / Veritabanı bakımı öncesi: görüntüyü incele', exact: true })).toBeVisible();
  expect(source.writes).toEqual([]); expect(source.reads).toContain('1'); await capture(page, info, 'snapshot-stale-refresh-error');
});

for (const theme of ['light', 'dark']) {
  test(`snapshot workspace: mobile ${theme} read-only cards and detail fit the viewport`, async ({ page, fixtures }, info) => {
    const source = await mockSource(page, { readOnly: true });
    await signIn(page, fixtures); await page.setViewportSize({ width: 390, height: 844 }); await page.clock.setFixedTime(snapshotFixture.NOW);
    await page.addInitScript(value => localStorage.setItem('theme', value), theme); await page.goto('/virtualization/snapshots');
    await expect(page.getByRole('button', { name: 'Yeni görüntü', exact: true })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Anlık görüntü, VM veya açıklama ara', exact: true }).fill('Veritabanı');
    await page.getByRole('button', { name: 'VERİTABANI-01 / Veritabanı bakımı öncesi: görüntüyü incele', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Görüntüyü sil', exact: true })).toHaveCount(0);
    const bounds = await dialog.boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await capture(page, info, `snapshot-mobile-${theme}`); expect(source.writes).toEqual([]);
  });
}
