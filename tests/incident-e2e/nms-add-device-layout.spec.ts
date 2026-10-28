import { expect, type Page } from '@playwright/test';
import { test, signIn } from './fixtures';
import { selectNmsDevice } from './nms-form-helpers';

async function inventory(page: Page, devices: Array<Record<string, unknown>>) {
  const writes: string[] = [];
  await page.route('**/api/devices?**', route => route.fulfill({ json: { success: true, totalPages: 1, data: devices } }));
  await page.route('**/api/integrations/nms/devices', route => {
    if (route.request().method() === 'POST') writes.push('save');
    return route.fulfill({ status: 400, json: { error: 'No writes in this layout fixture' } });
  });
  return writes;
}

for (const configured of [false, true]) {
  test(`NMS add layout: ${configured ? 'already monitored inventory' : 'empty inventory'} offers a usable next action`, async ({ page, fixtures }, info) => {
    const writes = await inventory(page, configured ? [{ id: 'layout-monitored', name: 'Fixture switch', type: 'SWITCH', nmsDeviceId: 100 }] : []);
    await signIn(page, fixtures);
    await page.goto('/integrations/nms/add-device');
    await expect(page.getByText(configured ? 'Tüm cihazlar zaten izleniyor' : 'Önce envantere bir cihaz ekleyin', { exact: true })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'İzleme özeti' })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Yapılandırma durumu' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kaydet ve izlemeyi başlat', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: configured ? 'İzlenen cihazlara git' : 'Envantere git', exact: true })).toHaveAttribute('href', configured ? '/integrations/nms/devices' : '/devices');
    await info.attach('inventory-next-action', { body: await page.screenshot(), contentType: 'image/png' });
    expect(writes).toEqual([]);
  });
}

for (const theme of ['light', 'dark']) {
  test(`NMS add layout: ${theme} SNMPv3 and SSH fields remain usable on mobile`, async ({ page, fixtures }, info) => {
    const writes = await inventory(page, [{ id: 'layout-new', name: 'Fixture network switch with a long name', managementIp: '192.0.2.10', type: 'SWITCH', nmsDeviceId: null }]);
    await signIn(page, fixtures);
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await page.goto('/integrations/nms/add-device');
    await selectNmsDevice(page, 'Fixture network switch with a long name');
    await expect(page.locator('#managementIp')).toHaveValue('192.0.2.10');
    await expect(page.locator('#snmpCommunity')).toBeVisible();
    await page.locator('#snmpVersion').selectOption('v3');
    await expect(page.locator('#snmpV3AuthPassword')).toBeVisible();
    await expect(page.locator('#snmpV3PrivacyPassword')).toBeVisible();
    await page.getByRole('switch', { name: 'SSH erişimini etkinleştir', exact: true }).click();
    await expect(page.locator('#sshUsername')).toBeVisible();
    await expect(page.locator('#sshPassword')).toBeVisible();
    await expect(page.locator('#backupPlatform')).toHaveValue('');
    await page.locator('#backupPlatform').selectOption('cisco_nxos');
    await expect(page.locator('#backupPlatform')).toHaveValue('cisco_nxos');
    await info.attach('desktop-v3-ssh', { body: await page.screenshot(), contentType: 'image/png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#sshPassword').scrollIntoViewIfNeeded();
    const passwordBounds = await page.locator('#sshPassword').boundingBox();
    const actionsBounds = await page.getByRole('group', { name: 'Kayıt işlemleri', exact: true }).boundingBox();
    expect(passwordBounds && actionsBounds && passwordBounds.y + passwordBounds.height <= actionsBounds.y).toBeTruthy();
    const save = page.getByRole('button', { name: 'Kaydet ve izlemeyi başlat', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await save.click();
    await expect(page.locator('#snmpV3Username')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#snmpV3Username')).toBeFocused();
    await info.attach('mobile-field-validation', { body: await page.screenshot(), contentType: 'image/png' });
    expect(writes).toEqual([]);
  });
}
