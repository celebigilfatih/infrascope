import { expect } from '@playwright/test';
import { test, signIn } from './fixtures';

const data = {
  name: 'Compact NMS edit fixture', type: 'SWITCH' as const, tags: [], nmsDeviceId: 1900000010,
  managementIp: '192.0.2.215', operatingSystem: 'Cisco IOS 15.2', backupPlatform: 'cisco_ios',
  snmpVersion: '2c', snmpPort: 1161, snmpCommunity: 'fixture-community', pollingInterval: 75, pollingEnabled: false,
  sshUsername: 'fixture', sshPassword: 'fixture-password', sshPort: 2222,
  sshHostKeyAlgorithm: 'ssh-ed25519', sshHostKeyFingerprint: 'SHA256:old-fixture-key',
};

test('NMS compact edit: advanced settings start closed, hidden errors open and reset preserves stored values', async ({ page, prisma, fixtures }, info) => {
  const device = await prisma.device.create({ data });
  try {
    await signIn(page, fixtures);
    await page.goto(`/integrations/nms/devices/${device.id}/edit`);
    const advanced = page.getByRole('button', { name: 'Gelişmiş ayarlar', exact: true });
    await expect(advanced).toBeVisible({ timeout: 5000 });
    await expect(advanced).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('complementary', { name: 'Ayar özeti' })).toHaveCount(0);
    await expect(page.locator('#snmp-port')).toBeHidden();
    await expect(page.locator('#operating-system')).toBeHidden();
    const ssh = page.getByRole('button', { name: 'SSH erişimi', exact: true });
    await expect(ssh).toHaveAttribute('aria-expanded', 'false');
    const save = page.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true });
    await expect(save).toBeDisabled();
    await page.locator('#management-ip').fill('192.0.2.216');
    await page.getByRole('button', { name: 'Değişiklikleri sıfırla', exact: true }).click();
    await expect(page.locator('#management-ip')).toHaveValue(data.managementIp);
    await expect(save).toBeDisabled();
    await advanced.click();
    await expect(page.locator('#snmp-port')).toHaveValue('1161');
    await expect(page.locator('#polling-preset')).toHaveValue('custom');
    await expect(page.locator('#polling-interval')).toHaveValue('75');
    await page.locator('#snmp-port').fill('0');
    await advanced.click();
    await save.click();
    await expect(advanced).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#snmp-port')).toBeFocused();
    await page.getByRole('button', { name: 'Değişiklikleri sıfırla', exact: true }).click();
    await expect(advanced).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#snmp-version').selectOption('v3');
    await save.click();
    await expect(page.locator('#snmp-v3-username')).toBeFocused();
    await page.getByRole('button', { name: 'Değişiklikleri sıfırla', exact: true }).click();
    const bounds = await save.boundingBox();
    expect(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 1000).toBeTruthy();
    await info.attach('compact-edit-default', { body: await page.screenshot(), contentType: 'image/png' });
  } finally { await prisma.device.delete({ where: { id: device.id } }); }
});

test('NMS compact edit: saves advanced intervals without changing blank credentials or hidden platform values', async ({ page, prisma, fixtures }) => {
  const device = await prisma.device.create({ data });
  const endpoint = `/api/integrations/nms/devices/${device.id}`;
  try {
    await signIn(page, fixtures);
    await page.goto(`${endpoint.replace('/api', '')}/edit`);
    await page.getByRole('button', { name: 'Gelişmiş ayarlar', exact: true }).click();
    await page.locator('#polling-interval').fill('85');
    await page.getByRole('button', { name: 'Gelişmiş ayarlar', exact: true }).click();
    const response = page.waitForResponse(reply => new URL(reply.url()).pathname === endpoint && reply.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${endpoint.replace('/api', '')}$`));
    const stored = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(stored.pollingInterval).toBe(85);
    for (const key of ['snmpCommunity', 'sshPassword', 'backupPlatform', 'operatingSystem', 'snmpPort', 'sshPort', 'sshHostKeyFingerprint'] as const) expect(stored[key]).toBe(device[key]);
    await page.goto(`${endpoint.replace('/api', '')}/edit`);
    await expect(page.getByRole('button', { name: 'Gelişmiş ayarlar', exact: true })).toHaveAttribute('aria-expanded', 'false');
  } finally { await prisma.device.delete({ where: { id: device.id } }); }
});

test('NMS compact edit: SSH key inspection and approval remain explicit and disabled for unsaved targets', async ({ page, prisma, fixtures }) => {
  const device = await prisma.device.create({ data });
  let inspections = 0, approvals = 0;
  try {
    await page.route(`**/api/integrations/nms/devices/${device.id}/ssh-host-key`, async route => {
      if (route.request().method() === 'GET') {
        inspections++;
        await route.fulfill({ json: { data: { observed: { algorithm: 'ssh-ed25519', fingerprint: 'SHA256:new-fixture-key', observed_at: '2026-10-27T12:00:00Z' }, trusted: { algorithm: 'ssh-ed25519', fingerprint: data.sshHostKeyFingerprint, matches: false } } } });
      } else {
        approvals++;
        expect(route.request().postDataJSON()).toEqual({ fingerprint: 'SHA256:new-fixture-key' });
        await route.fulfill({ json: { success: true } });
      }
    });
    await signIn(page, fixtures);
    await page.goto(`/integrations/nms/devices/${device.id}/edit`);
    expect(inspections).toBe(0);
    await page.getByRole('button', { name: 'SSH erişimi', exact: true }).click();
    await page.getByRole('button', { name: 'Anahtarı kontrol et', exact: true }).click();
    await expect(page.getByText('Anahtar değişmiş', { exact: true })).toBeVisible();
    expect(approvals).toBe(0);
    await page.getByRole('button', { name: 'Bu anahtara güven', exact: true }).click();
    await expect(page.getByText('SSH anahtarı onaylandı ve kaydedildi.', { exact: true })).toBeVisible();
    expect(approvals).toBe(1);
    await expect(page.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Gelişmiş ayarlar', exact: true }).click();
    await page.locator('#ssh-port').fill('2223');
    await expect(page.getByRole('button', { name: 'Anahtarı kontrol et', exact: true })).toBeDisabled();
    await expect(page.getByText('Yeni IP veya port için önce ayarları kaydedin, ardından anahtarı kontrol edin.', { exact: true })).toBeVisible();
    expect(inspections).toBe(1);
  } finally { await prisma.device.delete({ where: { id: device.id } }); }
});

for (const theme of ['light', 'dark']) {
  test(`NMS compact edit: ${theme} mobile SNMPv3 and SSH fields stay above the action bar`, async ({ page, prisma, fixtures }, info) => {
    const device = await prisma.device.create({ data: { ...data, snmpVersion: '3', snmpV3Username: 'fixture', snmpV3SecurityLevel: 'authPriv', snmpV3AuthProtocol: 'SHA', snmpV3AuthPassword: 'fixture-auth-password', snmpV3PrivacyProtocol: 'AES', snmpV3PrivacyPassword: 'fixture-privacy-password' } });
    try {
      await signIn(page, fixtures);
      await page.addInitScript(value => localStorage.setItem('theme', value), theme);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/integrations/nms/devices/${device.id}/edit`);
      await page.getByRole('button', { name: 'SSH erişimi', exact: true }).click();
      await page.locator('#ssh-password').scrollIntoViewIfNeeded();
      const field = await page.locator('#ssh-password').boundingBox();
      const actions = await page.getByRole('group', { name: 'Kayıt işlemleri', exact: true }).boundingBox();
      expect(field && actions && field.y + field.height <= actions.y).toBeTruthy();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await info.attach(`compact-edit-${theme}-mobile`, { body: await page.screenshot(), contentType: 'image/png' });
    } finally { await prisma.device.delete({ where: { id: device.id } }); }
  });
}
