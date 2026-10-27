import { expect, type Page } from '@playwright/test';
import { test, signIn, capture } from './fixtures';

async function mockDevice(page: Page) {
  const state = { ready: false, failRead: false, started: false, startup: true, platform: { id: 'aruba_switch', label: 'HP ProCurve / ArubaOS-Switch' }, blockers: [
    { code: 'PLATFORM_REQUIRED', message: 'Yedekleme platformu seçilmemiş.', action: 'platform' },
    { code: 'SSH_HOST_KEY_REQUIRED', message: 'SSH cihaz anahtarı henüz onaylanmamış.', action: 'ssh' },
  ] };
  const writes: unknown[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/integrations/nms/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/backups')) {
      if (request.method() === 'POST') { writes.push(request.postDataJSON()); state.started = true; return route.fulfill({ status: 202, json: { success: true, job: { id: 'fixture-job' } } }); }
      if (state.failRead) return route.fulfill({ status: 503, json: { error: 'Fixture unavailable' } });
      return route.fulfill({ json: { backups: [], permissions: { create: true, running: true, startup: state.startup },
        readiness: { ready: state.ready, platform: state.ready ? state.platform : null, blockers: state.blockers } } });
    }
    if (path.endsWith('/backup-jobs')) return route.fulfill({ json: { jobs: state.started ? [{ id: 'fixture-job', status: 'failed', errorCode: 'INCOMPLETE_OUTPUT',
      errorMessage: 'HP ProCurve / ArubaOS-Switch: Configuration Editor başlığı bulunamadı. Seçilen platformu ve cihazın işletim sistemini kontrol edin.' }] : [] } });
    if (path === '/api/integrations/nms/devices/fixture-backup-device') return route.fulfill({ json: { device: { id: 'fixture-backup-device', nmsDeviceId: 75, name: 'Fixture HP', vendor: 'HP', type: 'SWITCH', managementIp: '192.0.2.10',
      pollingEnabled: true, pollingInterval: 300, lastPolledAt: new Date().toISOString() }, interfaces: [], healthMetrics: [], topologyLinks: [] } });
    throw new Error('Unexpected fixture request: ' + path);
  });
  return { state, writes, errors };
}
async function openBackups(page: Page) {
  await page.goto('/integrations/nms/devices/fixture-backup-device');
  await page.getByRole('tab', { name: 'Yedekler', exact: true }).click();
}

test('NMS device backups: disabled actions explain every missing prerequisite and link to settings', async ({ page, fixtures }, info) => {
  const source = await mockDevice(page); await signIn(page, fixtures); await openBackups(page);
  await expect(page.getByText('Yedekleme platformu seçilmemiş.', { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('SSH cihaz anahtarı henüz onaylanmamış.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Çalışan yapılandırmayı yedekle', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Platform ayarlarını aç' })).toHaveAttribute('href', '/integrations/nms/backups');
  await expect(page.getByRole('link', { name: 'SSH ayarlarını aç' })).toHaveAttribute('href', '/integrations/nms/devices/fixture-backup-device/edit#ssh-section');
  await capture(page, info, 'nms-device-backup-prerequisites'); expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('NMS device backups: approved prerequisites permit running backup; unsupported type and failed refresh stay explicit', async ({ page, fixtures }) => {
  const source = await mockDevice(page); source.state.ready = true; source.state.blockers = []; source.state.startup = false;
  source.state.platform = { id: 'comware', label: 'HPE / H3C Comware' };
  await signIn(page, fixtures); await openBackups(page);
  const run = page.getByRole('button', { name: 'Çalışan yapılandırmayı yedekle', exact: true });
  await expect(run).toBeEnabled(); await expect(page.getByText('Seçili platform: HPE / H3C Comware', { exact: true })).toBeVisible();
  await expect(page.getByText('Bu platform başlangıç yapılandırması yedeğini desteklemiyor.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Başlangıç yapılandırmasını yedekle', exact: true })).toBeDisabled();
  source.state.failRead = true; await page.getByRole('button', { name: 'Yedek listesini yenile' }).click();
  await expect(run).toBeDisabled(); await expect(page.getByText('Yedekleme ön koşulları doğrulanamadı. Listeyi yeniden yükleyin.', { exact: true })).toBeVisible();
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('NMS device backups: accepted work reports structural failure with the selected profile and no false success', async ({ page, fixtures }, info) => {
  const source = await mockDevice(page); source.state.ready = true; source.state.blockers = [];
  await signIn(page, fixtures); await openBackups(page);
  await page.getByRole('button', { name: 'Çalışan yapılandırmayı yedekle', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Configuration Editor başlığı bulunamadı' })).toBeVisible();
  await expect(page.getByText('Yedekleme tamamlandı.', { exact: true })).toHaveCount(0);
  expect(source.writes).toHaveLength(1); expect(source.errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, info, 'nms-device-backup-structural-error-mobile');
});
