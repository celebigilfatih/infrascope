import { expect, type Page } from '@playwright/test';
import { test, signIn } from './fixtures';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const iso = (minutes = 1) => new Date(NOW - minutes * 60000).toISOString();
const endpoint = '/api/integrations/nms/devices/detail-fixture';
const url = '/integrations/nms/devices/detail-fixture';

async function mockDetail(page: Page) {
  const device = { id: 'detail-fixture', name: 'Compact detail fixture', type: 'SWITCH', vendor: 'Cisco', nmsDeviceId: 301, managementIp: '192.0.2.221', snmpVersion: '2c', snmpPort: 161, pollingEnabled: true, pollingInterval: 300, lastPolledAt: iso() };
  const interfaces = ['up', 'down', 'down'].map((operStatus, index) => ({ id: `port-${index + 1}`, interfaceIndex: index + 1, interfaceName: `Gi1/0/${index + 1}`, description: index === 0 ? 'Fixture uplink' : null, adminStatus: index === 2 ? 'down' : 'up', operStatus, speed: '1000000000', inOctets: '1024', outOctets: '2048', inErrors: 0, outErrors: 0, mtu: 1500, downSince: null, operUpSince: null, lastPolledAt: iso(), monitored: index === 0 }));
  const state = { device, interfaces, healthMetrics: [{ id: 'health-fixture', cpuUsage: 0 as number | null, memoryUsage: 32 as number | null, temperature: 0, uptimeSeconds: 0, collectedAt: iso() }], fail: false };
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/integrations/nms/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === endpoint && request.method() === 'GET') return route.fulfill({ status: state.fail ? 503 : 200, json: state.fail ? { error: 'Synthetic unavailable' } : { device: state.device, interfaces: state.interfaces, healthMetrics: state.healthMetrics, topologyLinks: [{ id: 'neighbor', localInterface: 'Gi1/0/1', remoteDeviceName: 'Fixture neighbor', remoteInterface: 'Gi0/1', protocol: 'lldp', lastSeenAt: iso() }] } });
    if (path === `${endpoint}/ports/monitored` && request.method() === 'PATCH') {
      const body = request.postDataJSON(); writes.push({ path, body });
      for (const iface of state.interfaces) if (body.interfaceIds.includes(iface.id)) iface.monitored = body.monitored;
      return route.fulfill({ json: { success: true } });
    }
    if (path === `${endpoint}/backups` && request.method() === 'GET') return route.fulfill({ json: { permissions: { create: false, running: true, startup: false }, backups: [{ id: 'backup-fixture', backupType: 'Running Config', backupFile: 'fixture.cfg', description: null, sizeBytes: '120', checksum: 'fixture', createdAt: iso(60) }] } });
    if (path === `${endpoint}/backups/backup-fixture` && request.method() === 'GET') return route.fulfill({ json: { configuration: 'hostname fixture\nend\n' } });
    throw new Error(`Unexpected detail fixture request: ${request.method()} ${path}`);
  });
  return { state, writes, errors };
}

test('NMS compact detail: identity appears once and key values fit above the tabs', async ({ page, fixtures }, info) => {
  const source = await mockDetail(page);
  await signIn(page, fixtures); await page.clock.setFixedTime(NOW); await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Compact detail fixture', exact: true })).toBeVisible();
  await expect(page.getByText('NMS İzleme', { exact: true })).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByText('192.0.2.221', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Cihaz kimliği', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'İzleme durumu', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Yedekler', exact: true })).toHaveCount(0);
  const metrics = page.getByRole('region', { name: 'Kaynak ölçümleri', exact: true });
  await expect(metrics).toContainText('%0.0');
  await expect(metrics).toContainText('0 °C');
  await expect(page.getByRole('button', { name: /Bağlantı uyarısı/ })).toBeInViewport();
  await page.getByRole('tab', { name: 'SNMP', exact: true }).click();
  await expect(page.getByText('Toplama aralığı', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Gizli tutulur', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Sayfanın son yenilenmesi', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Son verinin yaşı', { exact: true })).toHaveCount(0);
  await expect(page.getByText('#301', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Genel bakış', exact: true }).click();
  await info.attach('compact-detail-overview', { body: await page.screenshot(), contentType: 'image/png' });
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('NMS compact detail: port shortcuts, draft refresh and saving still work', async ({ page, fixtures }) => {
  const source = await mockDetail(page); await signIn(page, fixtures); await page.clock.setFixedTime(NOW); await page.goto(url);
  await page.getByRole('button', { name: /Bağlantı uyarısı/ }).click();
  await expect(page.getByRole('tab', { name: 'Portlar', exact: true })).toHaveAttribute('data-state', 'active');
  await expect(page.getByRole('combobox', { name: 'Port durumu', exact: true })).toHaveValue('issues');
  const checkbox = page.getByRole('checkbox', { name: 'Gi1/0/2: alarm izlemesi', exact: true });
  await checkbox.check();
  await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  await expect(checkbox).toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: 'Kaydedilmemiş port seçimleri var.' })).toBeVisible();
  await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  expect(source.writes).toEqual([]);
  await checkbox.check();
  await page.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
  await expect(page.getByText('Port alarm izleme ayarları kaydedildi.', { exact: true })).toBeVisible();
  expect(source.writes).toEqual([{ path: `${endpoint}/ports/monitored`, body: { interfaceIds: ['port-2'], monitored: true } }]);
  expect(source.errors).toEqual([]);
});

test('NMS compact detail: stale, disabled and invalid observations remain distinguishable', async ({ page, fixtures }) => {
  const source = await mockDetail(page); await signIn(page, fixtures); await page.clock.setFixedTime(NOW); await page.goto(url);
  source.state.healthMetrics[0].collectedAt = iso(60);
  await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Kaynak ölçümleri', exact: true })).toContainText('Ölçüm eski');
  await expect(page.getByText('Güncel veri', { exact: true })).toBeVisible();
  source.state.device.pollingEnabled = false;
  await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Kaynak ölçümleri', exact: true })).toContainText('İzleme kapalı · son ölçüm');
  source.state.device.pollingEnabled = true;
  source.state.device.lastPolledAt = iso(-60);
  source.state.healthMetrics[0].collectedAt = 'invalid';
  source.state.healthMetrics[0].cpuUsage = null;
  await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  await expect(page.getByText('Veri bekleniyor', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Kaynak ölçümleri', exact: true })).toContainText('Ölçüm tarihi belirsiz');
  source.state.fail = true;
  await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Son yüklenen bilgiler gösteriliyor.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Compact detail fixture', exact: true })).toBeVisible();
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

test('NMS compact detail: topology and backup view remain reachable without triggering writes', async ({ page, fixtures }) => {
  const source = await mockDetail(page); await signIn(page, fixtures); await page.clock.setFixedTime(NOW); await page.goto(url);
  await page.getByRole('tab', { name: 'Topoloji', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Fixture neighbor', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Yedekler', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Çalışan yapılandırmayı yedekle', exact: true })).toBeDisabled();
  const view = page.getByRole('button', { name: /tarihli yedeği görüntüle/ });
  await view.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('hostname fixture');
  await dialog.press('Escape');
  await expect(view).toBeFocused();
  await page.getByRole('button', { name: /tarihli yedeği sil/ }).click();
  await expect(page.getByRole('alertdialog')).toContainText('kalıcı olarak silinir');
  await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
});

for (const theme of ['light', 'dark']) {
  test(`NMS compact detail: ${theme} mobile tabs and primary actions stay usable`, async ({ page, fixtures }, info) => {
    const source = await mockDetail(page); await signIn(page, fixtures); await page.clock.setFixedTime(NOW);
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url);
    await expect(page.getByRole('link', { name: 'İzleme ayarları', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await info.attach(`compact-detail-${theme}-mobile`, { body: await page.screenshot(), contentType: 'image/png' });
    for (const name of ['Portlar', 'SNMP', 'Topoloji', 'Yedekler', 'Genel bakış']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('data-state', 'active');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(source.writes).toEqual([]); expect(source.errors).toEqual([]);
  });
}
