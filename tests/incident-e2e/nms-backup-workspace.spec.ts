import { expect, type Page } from '@playwright/test';
import { test, signIn, capture } from './fixtures';
import { deferred } from './exclusion-fixtures';

const NOW = Date.parse('2026-10-16T09:00:00Z');
const iso = (hours: number) => new Date(NOW - hours * 3600000).toISOString();
const policy = { enabled: true, backupType: 'Startup Config', intervalHours: 24, staleAfterHours: 48, retentionDays: 90, keepLast: 10, nextRunAt: iso(-24) };
function devices() {
  return [
    { id: 1, name: 'Fixture current', platform: 'cisco_ios', lastSuccessAt: iso(1), lastPolicySuccessAt: iso(1), policy },
    { id: 2, name: 'Fixture different type', platform: 'cisco_ios', lastSuccessAt: iso(1), lastPolicySuccessAt: iso(72), policy },
    { id: 3, name: 'Fixture missing', platform: 'cisco_ios', lastSuccessAt: iso(1), lastPolicySuccessAt: null, policy },
    { id: 4, name: 'Fixture disabled', platform: 'cisco_ios', lastSuccessAt: iso(100), lastPolicySuccessAt: null, policy: { ...policy, enabled: false } },
    { id: 5, name: 'Fixture future', platform: 'cisco_ios', lastSuccessAt: iso(-1), lastPolicySuccessAt: iso(-1), policy },
  ];
}
const files = [
  { id: 'fixture-file-1', device_id: 1, inventory_device_id: 'fixture-inventory-1', device_name: 'Fixture current', backup_type: 'Running Config', file_name: 'fixture-current.cfg', file_size: 42, created_at: iso(1), archived: false },
  { id: 'fixture-file-2', device_id: null, device_name: 'Fixture archived', backup_type: 'Startup Config', file_name: 'fixture-archived.cfg', file_size: 0, created_at: iso(72), archived: true },
];
async function mockBackups(page: Page) {
  const state = { devices: devices(), files: [...files], failReads: false, canWrite: true, status: 200, mime: 'text/plain; charset=utf-8', body: 'hostname fixture-only\nend\n', networkError: false,
    holdDownload: null as ReturnType<typeof deferred> | null, holdCreate: null as ReturnType<typeof deferred> | null,
    createFails: false, created: false };
  const downloads: string[] = [], listQueries: URLSearchParams[] = [], writes: Array<{ body: Record<string, unknown>; key: string | undefined }> = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/integrations/nms/**', async route => {
    const req = route.request(), url = new URL(req.url()), pathname = url.pathname;
    if (pathname === '/api/integrations/nms/backups/health') return route.fulfill({ status: state.failReads ? 503 : 200, json: state.failReads ? { error: 'Fixture unavailable' } : { available: true } });
    if (pathname.startsWith('/api/integrations/nms/backups/')) {
      if (req.method() !== 'GET' || url.searchParams.get('action') !== 'download') throw Error('Unexpected artifact mutation/read');
      downloads.push(pathname); const gate = state.holdDownload; state.holdDownload = null;
      if (gate) await gate.promise;
      try {
        if (state.networkError) return await route.abort('connectionfailed');
        return await route.fulfill({ status: state.status, contentType: state.mime, body: state.body });
      } catch { /* Closed dialogs cancel their read-only download request. */ }
      return;
    }
    if (req.method() !== 'GET') {
      if (pathname !== '/api/integrations/nms/backups' || req.method() !== 'POST') throw Error('Unexpected backup write');
      writes.push({ body: req.postDataJSON(), key: req.headers()['idempotency-key'] });
      if (state.holdCreate) await state.holdCreate.promise;
      if (state.createFails) return route.abort('connectionfailed');
      state.created = true; return route.fulfill({ status: 202, json: { success: true, job: { id: 'fixture-job', status: 'queued' } } });
    }
    if (state.failReads) return route.fulfill({ status: 503, json: { error: 'Fixture unavailable' } });
    if (pathname === '/api/integrations/nms/backup-policies') return route.fulfill({ json: { devices: state.devices, canEdit: state.canWrite } });
    if (pathname === '/api/integrations/nms/backup-jobs') return route.fulfill({ json: { jobs: state.created ? [{ id: 'fixture-job', deviceName: 'Fixture current', backupType: 'Running Config', status: 'queued', attempts: 0, errorMessage: null, createdAt: iso(0), backupId: null }] : [] } });
    if (pathname === '/api/integrations/nms/backups') {
      listQueries.push(url.searchParams);
      const list = state.files.filter(file => (!url.searchParams.get('device_id') || String(file.device_id) === url.searchParams.get('device_id')) && (!url.searchParams.get('search') || file.file_name.includes(url.searchParams.get('search')!)));
      return route.fulfill({ json: { data: list, total: list.length, permissions: { create: state.canWrite, content: state.canWrite, delete: false } } });
    }
    throw Error('Unexpected NMS request');
  });
  return { state, downloads, listQueries, writes, errors };
}
async function openFiles(page: Page, device = 'Fixture current') {
  await page.getByRole('tab', { name: 'Yedekler', exact: true }).click();
  await page.getByRole('button', { name: `${device} yedek ayrıntıları ve indirme`, exact: true }).first().click();
  return page.getByRole('dialog', { name: 'Yedek ayrıntıları' });
}

test('NMS backups: coverage follows scheduled type independently of file filters', async ({ page, fixtures }, info) => {
  const source = await mockBackups(page); await signIn(page, fixtures); await page.clock.setFixedTime(NOW); await page.goto('/integrations/nms/backups');
  const wrongType = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fixture different type', exact: true }) });
  await expect(wrongType).toContainText('Yedek gecikmiş'); await expect(wrongType).toContainText('Zamanlanan türün son yedeği'); await expect(wrongType).toContainText('Başlangıç yapılandırması');
  await expect(page.getByRole('article').filter({ hasText: 'Fixture missing' })).toContainText('Planlanan türde yedek yok');
  await expect(page.getByRole('article').filter({ hasText: 'Fixture disabled' })).toContainText('Yedek var');
  await expect(page.getByRole('article').filter({ hasText: 'Fixture future' })).toContainText('Tarih doğrulanamıyor');
  await page.getByRole('combobox', { name: 'Yedek durumunu filtrele' }).selectOption('attention'); await expect(page.getByRole('article')).toHaveCount(3);
  await capture(page, info, 'nms-backup-scheduled-type-coverage');
  await wrongType.getByRole('button', { name: 'Yedekleri gör' }).click(); await expect(page.getByRole('tab', { name: 'Yedekler', exact: true })).toHaveAttribute('data-state', 'active');
  await expect.poll(() => source.listQueries.at(-1)?.get('device_id')).toBe('2');
  await page.getByRole('tab', { name: 'Cihaz durumu' }).click(); await expect(page.getByRole('article').filter({ hasText: 'Fixture different type' })).toContainText('Yedek gecikmiş');
  await page.getByRole('article').filter({ hasText: 'Fixture different type' }).getByRole('button', { name: 'Zamanlama', exact: true }).click();
  await expect(page.locator('#policy-device')).toHaveValue('2'); expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('NMS backups: failed reads preserve records with unknown freshness, empty success is distinct', async ({ page, fixtures }) => {
  const source = await mockBackups(page); await signIn(page, fixtures); await page.goto('/integrations/nms/backups');
  await expect(page.getByRole('article')).toHaveCount(5); source.state.failReads = true; await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  const refreshError = page.getByRole('alert').filter({ hasText: 'Bazı bilgiler yenilenemedi' });
  await expect(refreshError).toBeVisible(); await expect(page.getByRole('article')).toHaveCount(5); await expect(page.getByRole('article').first()).toContainText('Güncellik bilinmiyor');
  source.state.failReads = false; source.state.devices = []; source.state.files = []; await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  await expect(refreshError).toHaveCount(0); await expect(page.getByText('Yedekleme için kayıtlı cihaz yok.', { exact: true })).toBeVisible(); expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('NMS backups: archived file metadata, recovery guide and actual browser download', async ({ page, fixtures }, info) => {
  const source = await mockBackups(page); await signIn(page, fixtures); await page.clock.setFixedTime(NOW); await page.goto('/integrations/nms/backups');
  const dialog = await openFiles(page, 'Fixture archived'); await expect(dialog).toContainText('Arşiv yedeği'); await expect(dialog).toContainText('0 B'); await expect(dialog).toContainText('TSİ');
  await dialog.getByText('Geri yükleme adımlarını göster', { exact: true }).click(); await expect(dialog).toContainText('Bu cihaz envanterden kaldırılmış.');
  await capture(page, info, 'nms-backup-archived-recovery-guide');
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Dosyayı indir', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('fixture-archived.cfg'); await expect(dialog.getByRole('status')).toContainText('Dosya tarayıcıya iletildi'); expect(source.downloads).toEqual(['/api/integrations/nms/backups/fixture-file-2']); expect(source.errors).toEqual([]);
});

test('NMS backups: download failures never claim success and retry uses the same artifact', async ({ page, fixtures }) => {
  const source = await mockBackups(page); let actualDownloads = 0; page.on('download', () => actualDownloads++);
  await signIn(page, fixtures); await page.goto('/integrations/nms/backups'); const dialog = await openFiles(page);
  for (const [status, message] of [[401, 'Oturumunuz sona ermiş'], [403, 'Yedek indirme yetkiniz yok'], [404, 'Yedek bulunamadı'], [409, 'bütünlüğü doğrulanamadı'], [503, 'Dosya indirilemedi']] as const) {
    source.state.status = status; await dialog.getByRole('button', { name: 'Dosyayı indir', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText(message); await expect(dialog.getByRole('status')).toHaveCount(0);
  }
  source.state.status = 200; source.state.mime = 'text/html'; await dialog.getByRole('button', { name: 'Dosyayı indir', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('Beklenen yapılandırma dosyası alınamadı');
  source.state.mime = 'text/plain'; source.state.body = ''; await dialog.getByRole('button', { name: 'Dosyayı indir', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('Yedek dosyası boş');
  source.state.networkError = true; await dialog.getByRole('button', { name: 'Dosyayı indir', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('Sunucuya ulaşılamadı'); expect(actualDownloads).toBe(0);
  source.state.networkError = false; source.state.body = 'hostname fixture\nend\n'; const downloaded = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Dosyayı indir', exact: true }).click(); await downloaded;
  await expect(dialog.getByRole('status')).toContainText('Dosya tarayıcıya iletildi'); expect(new Set(source.downloads).size).toBe(1); expect(source.errors).toEqual([]);
});

test('NMS backups: closing a pending download fences its result and permits another artifact', async ({ page, fixtures }) => {
  const source = await mockBackups(page); let actualDownloads = 0; page.on('download', () => actualDownloads++); await signIn(page, fixtures); await page.goto('/integrations/nms/backups');
  const dialog = await openFiles(page); const gate = deferred(); source.state.holdDownload = gate;
  try { await dialog.getByRole('button', { name: 'Dosyayı indir', exact: true }).click(); await expect.poll(() => source.downloads.length).toBe(1); await expect(dialog.getByRole('button', { name: 'Dosya hazırlanıyor…' })).toBeDisabled(); await dialog.getByRole('button', { name: 'Kapat', exact: true }).click(); } finally { gate.resolve(); }
  const next = await openFiles(page, 'Fixture archived'); await expect(next.getByRole('status')).toHaveCount(0); await expect(next.getByRole('alert')).toHaveCount(0); expect(actualDownloads).toBe(0);
  const downloaded = page.waitForEvent('download'); await next.getByRole('button', { name: 'Dosyayı indir', exact: true }).click(); await downloaded; expect(source.errors).toEqual([]);
});

test('NMS backups: read-only metadata and real current-role enforcement prohibit content reads', async ({ page, fixtures, prisma }) => {
  const source = await mockBackups(page); source.state.canWrite = false; await signIn(page, fixtures); await page.goto('/integrations/nms/backups'); const dialog = await openFiles(page);
  await expect(dialog.getByRole('button', { name: 'Dosyayı indir', exact: true })).toHaveCount(0); await expect(dialog).toContainText('Yedek içeriğini indirmek için'); await dialog.getByText('Geri yükleme adımlarını göster', { exact: true }).click(); expect(source.downloads).toEqual([]);
  try { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } }); const response = await page.request.get('/api/integrations/nms/backups/missing-fixture?action=download'); expect(response.status()).toBe(403); } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); }
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('NMS backups: ambiguous queue retry retains idempotency and acceptance stays queued', async ({ page, fixtures }) => {
  const source = await mockBackups(page); await signIn(page, fixtures); await page.goto('/integrations/nms/backups'); await page.getByRole('button', { name: 'Yedek oluştur', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Yeni yedek oluştur' }); await page.locator('#backup-device').selectOption('1'); await page.locator('#backup-note').fill('Fixture request');
  source.state.createFails = true; await dialog.getByRole('button', { name: 'Kuyruğa ekle', exact: true }).click(); await expect(dialog.getByRole('alert')).toBeVisible(); expect(source.writes).toHaveLength(1);
  source.state.createFails = false; const gate = deferred(); source.state.holdCreate = gate;
  try { await dialog.getByRole('button', { name: 'Kuyruğa ekle', exact: true }).click(); await expect.poll(() => source.writes.length).toBe(2); await expect(dialog.getByRole('button', { name: 'Kuyruğa ekleniyor…' })).toBeDisabled(); await page.keyboard.press('Enter'); expect(source.writes).toHaveLength(2); } finally { gate.resolve(); }
  await expect(dialog).toHaveCount(0); expect(source.writes[0].key).toBeTruthy(); expect(source.writes[0].key).toBe(source.writes[1].key); await expect(page.getByRole('tab', { name: /İşler/ })).toHaveAttribute('data-state', 'active'); await expect(page.getByRole('cell', { name: 'Kuyrukta', exact: true })).toBeVisible(); expect(source.downloads).toEqual([]); expect(source.errors).toEqual([]);
});

for (const theme of ['light', 'dark']) {
  test(`NMS backups: mobile ${theme} coverage and archive guide fit the viewport`, async ({ page, fixtures }, info) => {
    const source = await mockBackups(page); await signIn(page, fixtures); await page.setViewportSize({ width: 390, height: 844 }); await page.clock.setFixedTime(NOW); await page.addInitScript(value => localStorage.setItem('theme', value), theme); await page.goto('/integrations/nms/backups');
    await expect(page.getByRole('article')).toHaveCount(5); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await capture(page, info, `nms-backup-coverage-mobile-${theme}`);
    const dialog = await openFiles(page, 'Fixture archived'); await dialog.getByText('Geri yükleme adımlarını göster', { exact: true }).click(); const button = dialog.getByRole('button', { name: 'Dosyayı indir', exact: true }); await button.scrollIntoViewIfNeeded(); await expect(button).toBeInViewport(); const bounds = await dialog.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390); await capture(page, info, `nms-backup-guide-mobile-${theme}`); expect(source.downloads).toEqual([]); expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
  });
}
