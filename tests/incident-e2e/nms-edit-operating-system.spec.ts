import { expect } from '@playwright/test';
import { test, signIn } from './fixtures';

test('NMS operating system: edit, save, reload and clear persist without changing credentials', async ({ page, prisma, fixtures }, info) => {
  const device = await prisma.device.create({ data: {
    name: 'Operating system edit fixture', type: 'SWITCH', tags: [], nmsDeviceId: 1900000001,
    managementIp: '192.0.2.211', operatingSystem: 'Cisco IOS 15.2', backupPlatform: 'cisco_ios',
    snmpCommunity: 'fixture-community', sshPassword: 'fixture-password', pollingEnabled: false,
  } });
  const endpoint = `/api/integrations/nms/devices/${device.id}`;
  const editUrl = `/integrations/nms/devices/${device.id}/edit`;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await signIn(page, fixtures);
    await page.goto(editUrl);
    const advanced = page.getByRole('button', { name: 'Gelişmiş ayarlar', exact: true });
    await advanced.click();
    const field = page.getByRole('textbox', { name: 'İşletim sistemi', exact: true });
    const save = page.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true });
    await expect(field).toHaveValue('Cisco IOS 15.2');
    await expect(save).toBeDisabled();
    await field.fill('Temporary edit');
    await page.getByRole('button', { name: 'Değişiklikleri sıfırla', exact: true }).click();
    await advanced.click();
    await expect(field).toHaveValue('Cisco IOS 15.2');
    await expect(save).toBeDisabled();
    for (const value of ['  Cisco IOS XE 17.12  ', '']) {
      await field.fill(value);
      await expect(save).toBeEnabled();
      const response = page.waitForResponse(reply => new URL(reply.url()).pathname === endpoint && reply.request().method() === 'PUT');
      await save.click();
      const result = await response;
      expect(result.status()).toBe(200);
      expect((await result.json()).device.operatingSystem).toBe(value.trim() || null);
      await expect(page).toHaveURL(new RegExp(`/integrations/nms/devices/${device.id}$`));
      const stored = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
      expect(stored.operatingSystem).toBe(value.trim() || null);
      expect(stored.snmpCommunity).toBe('fixture-community');
      expect(stored.sshPassword).toBe('fixture-password');
      expect(stored.backupPlatform).toBe('cisco_ios');
      await page.goto(editUrl);
      await advanced.click();
      await expect(field).toHaveValue(value.trim());
      await expect(save).toBeDisabled();
    }
    await info.attach('operating-system-field', { body: await page.screenshot(), contentType: 'image/png' });
    expect(errors).toEqual([]);
  } finally {
    await prisma.device.delete({ where: { id: device.id } });
  }
});

test('NMS operating system API: rejects malformed values, preserves omitted values and enforces write access', async ({ page, prisma, fixtures, request }) => {
  const device = await prisma.device.create({ data: {
    name: 'Operating system validation fixture', type: 'SWITCH', tags: [], nmsDeviceId: 1900000002,
    operatingSystem: 'FortiOS 7.4', pollingEnabled: false,
  } });
  const endpoint = `/api/integrations/nms/devices/${device.id}`;
  try {
    expect((await request.put(endpoint, { data: { operatingSystem: 'Unauthorized change' } })).status()).toBe(401);
    await signIn(page, fixtures);
    for (const value of [42, true, {}, [], 'x'.repeat(256)]) {
      expect((await page.request.put(endpoint, { data: { operatingSystem: value } })).status()).toBe(400);
    }
    expect((await page.request.put(endpoint, { data: { pollingEnabled: false } })).status()).toBe(200);
    expect((await page.request.get(endpoint)).status()).toBe(200);
    expect((await (await page.request.get(endpoint)).json()).device.operatingSystem).toBe('FortiOS 7.4');
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
    expect((await page.request.put(endpoint, { data: { operatingSystem: 'Forbidden change' } })).status()).toBe(403);
    expect((await prisma.device.findUniqueOrThrow({ where: { id: device.id } })).operatingSystem).toBe('FortiOS 7.4');
  } finally {
    await prisma.device.delete({ where: { id: device.id } });
  }
});
