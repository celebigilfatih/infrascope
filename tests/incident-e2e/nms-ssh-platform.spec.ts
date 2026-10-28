import { expect } from '@playwright/test';
import { test, signIn } from './fixtures';
import { selectNmsDevice } from './nms-form-helpers';

test('SSH onboarding requires a platform, persists the explicit choice and exposes it to backups', async ({ page, prisma, fixtures }, info) => {
  const device = await prisma.device.create({ data: {
    name: 'SSH platform onboarding fixture', type: 'SWITCH', tags: [], managementIp: '192.0.2.212',
    vendor: 'HP', model: '5500', operatingSystem: 'Comware', pollingEnabled: false,
  } });
  const endpoint = '/api/integrations/nms/devices';
  try {
    await signIn(page, fixtures);
    const payload = { deviceId: device.id, managementIp: device.managementIp, snmpCommunity: 'fixture-community',
      sshUsername: 'fixture', sshPassword: 'fixture-password', pollingEnabled: false };
    for (const backupPlatform of [undefined, null, '', 'automatic', '__proto__', 42]) {
      expect((await page.request.post(endpoint, { data: { ...payload, backupPlatform } })).status()).toBe(400);
      expect((await prisma.device.findUniqueOrThrow({ where: { id: device.id } })).nmsDeviceId).toBeNull();
    }
    await page.goto('/integrations/nms/add-device');
    await selectNmsDevice(page, device.name);
    await page.locator('#snmpCommunity').fill('fixture-community');
    await page.getByRole('switch', { name: 'SSH erişimini etkinleştir', exact: true }).click();
    await page.locator('#sshUsername').fill('fixture');
    await page.locator('#sshPassword').fill('fixture-password');
    await page.getByRole('switch', { name: 'Kaydettikten sonra veri toplamayı başlat', exact: true }).click();
    const platform = page.locator('#backupPlatform');
    await expect(platform).toHaveValue('');
    const save = page.getByRole('button', { name: 'İzleme ayarlarını kaydet', exact: true });
    await save.click();
    await expect(platform).toHaveAttribute('aria-invalid', 'true');
    await expect(platform).toBeFocused();
    await platform.selectOption('cisco_nxos');
    const response = page.waitForResponse(reply => new URL(reply.url()).pathname === endpoint && reply.request().method() === 'POST');
    await save.click();
    const result = await response;
    expect(result.status()).toBe(201);
    expect((await result.json()).device.backupPlatform).toBe('cisco_nxos');
    await expect(page).toHaveURL(/\/integrations\/nms\/devices$/);
    const stored = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(stored.backupPlatform).toBe('cisco_nxos');
    expect(stored.operatingSystem).toBe('Comware');
    const policies = await (await page.request.get('/api/integrations/nms/backup-policies')).json();
    expect(policies.devices.find((row: { id: number }) => row.id === stored.nmsDeviceId).platform).toBe('cisco_nxos');
    await page.goto(`/integrations/nms/devices/${device.id}/edit`);
    await page.getByRole('button', { name: 'SSH erişimi', exact: true }).click();
    await expect(page.locator('#backup-platform')).toHaveValue('cisco_nxos');
    await page.locator('#backup-platform').scrollIntoViewIfNeeded();
    await info.attach('saved-ssh-platform', { body: await page.screenshot(), contentType: 'image/png' });
  } finally {
    await prisma.device.delete({ where: { id: device.id } });
  }
});

test('Existing SSH devices can correct their backup platform in edit settings and retain it after reload', async ({ page, prisma, fixtures }) => {
  const device = await prisma.device.create({ data: {
    name: 'SSH platform edit fixture', type: 'SWITCH', tags: [], nmsDeviceId: 1900000003,
    managementIp: '192.0.2.213', vendor: 'Cisco', backupPlatform: 'cisco_ios',
    snmpCommunity: 'fixture-community', sshUsername: 'fixture', sshPassword: 'fixture-password', pollingEnabled: false,
  } });
  const endpoint = `/api/integrations/nms/devices/${device.id}`;
  const editUrl = `/integrations/nms/devices/${device.id}/edit`;
  try {
    await signIn(page, fixtures);
    for (const backupPlatform of [null, '', 'automatic', '__proto__', 42]) {
      expect((await page.request.put(endpoint, { data: { backupPlatform } })).status()).toBe(400);
    }
    await page.goto(editUrl);
    await page.getByRole('button', { name: 'SSH erişimi', exact: true }).click();
    await expect(page.locator('#backup-platform')).toHaveValue('cisco_ios');
    await page.locator('#backup-platform').selectOption('comware');
    const response = page.waitForResponse(reply => new URL(reply.url()).pathname === endpoint && reply.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/integrations/nms/devices/${device.id}$`));
    await page.goto(editUrl);
    await page.getByRole('button', { name: 'SSH erişimi', exact: true }).click();
    await expect(page.locator('#backup-platform')).toHaveValue('comware');
    const stored = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(stored.backupPlatform).toBe('comware');
    expect(stored.sshPassword).toBe('fixture-password');
    expect(stored.snmpCommunity).toBe('fixture-community');
    const policies = await (await page.request.get('/api/integrations/nms/backup-policies')).json();
    expect(policies.devices.find((row: { id: number }) => row.id === device.nmsDeviceId).platform).toBe('comware');
    await prisma.nmsBackupPolicy.create({ data: { inventoryDeviceId: device.id, nmsDeviceId: device.nmsDeviceId!, enabled: true, backupType: 'Startup Config' } });
    expect((await page.request.put(endpoint, { data: { backupPlatform: 'huawei_vrp' } })).status()).toBe(422);
    expect((await prisma.device.findUniqueOrThrow({ where: { id: device.id } })).backupPlatform).toBe('comware');
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
    expect((await page.request.put(endpoint, { data: { backupPlatform: 'cisco_nxos' } })).status()).toBe(403);
  } finally {
    await prisma.nmsBackupPolicy.deleteMany({ where: { inventoryDeviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
  }
});
