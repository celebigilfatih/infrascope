import { expect, type Page } from '@playwright/test';
import { test, signIn } from './fixtures';
import { selectNmsDevice } from './nms-form-helpers';

const devices = [
  { id: 'search-1', name: 'İŞLETMELER Şubesi Uzun Cihaz Adı', managementIp: '192.0.2.11', vendor: 'Cisco', model: 'Nexus 9300', type: 'SWITCH', nmsDeviceId: null },
  { id: 'search-2', name: 'Aynı cihaz', managementIp: '192.0.2.12', vendor: 'HPE', model: '5510', type: 'SWITCH', nmsDeviceId: null },
  { id: 'search-3', name: 'Aynı cihaz', managementIp: '192.0.2.13', vendor: 'Fortinet', model: '400F', type: 'FIREWALL', nmsDeviceId: null },
  { id: 'already-monitored', name: 'Monitored fixture', type: 'SWITCH', nmsDeviceId: 123 },
];

async function prepare(page: Page) {
  const writes: unknown[] = [];
  await page.route('**/api/devices?**', route => route.fulfill({ json: { success: true, totalPages: 1, data: devices } }));
  await page.route('**/api/integrations/nms/devices', route => {
    if (route.request().method() === 'POST') writes.push(route.request().postDataJSON());
    return route.fulfill({ status: 400, json: { error: 'Synthetic fixture: no device writes' } });
  });
  return writes;
}

test('NMS compact search: keyboard selection filters inventory without submitting the form', async ({ page, fixtures }, info) => {
  const writes = await prepare(page);
  await signIn(page, fixtures);
  await page.goto('/integrations/nms/add-device');
  const search = page.getByRole('combobox', { name: 'Cihaz adı veya IP ile ara', exact: true });
  await expect(search).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#managementIp')).toHaveCount(0);
  await search.click();
  await expect(page.getByRole('option')).toHaveCount(3);
  for (const query of ['isletmeler', '192.0.2.11', 'cisco', '9300']) {
    await search.fill(query);
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toContainText(devices[0].name);
  }
  await search.fill('unmatched fixture');
  await expect(page.getByText('Eşleşen cihaz bulunamadı.', { exact: true })).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(0);
  await search.fill('Aynı cihaz');
  await expect(page.getByRole('option')).toHaveCount(2);
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page.locator('#managementIp')).toHaveValue('192.0.2.13');
  expect(writes).toEqual([]);
  await search.click();
  await search.press('Escape');
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Cihaz seçimini temizle', exact: true }).click();
  await expect(page.locator('#managementIp')).toHaveCount(0);
  await selectNmsDevice(page, devices[0].name);
  await expect(page.locator('#managementIp')).toHaveValue('192.0.2.11');
  await page.setViewportSize({ width: 1440, height: 900 });
  const save = page.getByRole('button', { name: 'Kaydet ve izlemeyi başlat', exact: true });
  const box = await save.boundingBox();
  expect(box && box.y >= 0 && box.y + box.height <= 900).toBeTruthy();
  await expect(page.getByRole('complementary', { name: 'İzleme özeti' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Yapılandırma durumu' })).toHaveCount(0);
  await expect(page.locator('#snmpPort')).toBeHidden();
  await info.attach('compact-default-form', { body: await page.screenshot(), contentType: 'image/png' });
});

test('NMS compact advanced settings: invalid hidden fields reopen and receive focus', async ({ page, fixtures }) => {
  const writes = await prepare(page);
  await signIn(page, fixtures);
  await page.goto('/integrations/nms/add-device');
  await selectNmsDevice(page, devices[0].name);
  await page.locator('#snmpCommunity').fill('fixture-community');
  const advanced = page.getByRole('button', { name: 'Gelişmiş ayarlar', exact: true });
  await advanced.click();
  await expect(page.locator('#snmpPort')).toHaveValue('161');
  await expect(page.locator('#sshPort')).toHaveCount(0);
  await page.locator('#pollingPreset').selectOption('custom');
  await page.locator('#pollingInterval').fill('75');
  await page.locator('#snmpPort').fill('0');
  await advanced.click();
  await page.getByRole('button', { name: 'Kaydet ve izlemeyi başlat', exact: true }).click();
  await expect(advanced).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#snmpPort')).toBeFocused();
  await page.locator('#snmpPort').fill('1161');
  await page.getByRole('switch', { name: 'SSH erişimini etkinleştir', exact: true }).click();
  await expect(page.locator('#sshPort')).toHaveValue('22');
  await page.locator('#sshUsername').fill('fixture');
  await page.getByRole('button', { name: 'Kaydet ve izlemeyi başlat', exact: true }).click();
  await expect(page.locator('#backupPlatform')).toBeFocused();
  await expect(page.locator('#backupPlatform')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#backupPlatform').selectOption('cisco_nxos');
  await page.getByRole('combobox', { name: 'Cihaz adı veya IP ile ara', exact: true }).fill('192.0.2.12');
  await page.getByRole('option').click();
  await expect(page.locator('#backupPlatform')).toHaveValue('');
  expect(writes).toEqual([]);
});

test('NMS compact test status: probe remains optional and device changes invalidate its result', async ({ page, fixtures }) => {
  const writes = await prepare(page);
  await page.route('**/api/integrations/nms/test-connection', async route => {
    const payload = route.request().postDataJSON();
    expect(payload.sshPassword).toBeUndefined();
    expect(payload.backupPlatform).toBeUndefined();
    await route.fulfill({ json: { result: { reachable: true, outcome: 'response', checkedAt: '2026-10-27T12:00:00Z', durationMs: 12, systemName: 'Fixture', uptimeSeconds: 60 } } });
  });
  await signIn(page, fixtures);
  await page.goto('/integrations/nms/add-device');
  await selectNmsDevice(page, devices[0].name);
  await page.locator('#snmpCommunity').fill('fixture-community');
  await page.getByRole('button', { name: 'SNMP bağlantısını test et', exact: true }).click();
  await expect(page.getByText('SNMP yanıtı alındı', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Cihaz adı veya IP ile ara', exact: true }).fill('192.0.2.12');
  await page.getByRole('option').click();
  await expect(page.getByText('Ayarlar değişti', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});
