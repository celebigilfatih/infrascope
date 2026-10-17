import { expect, type Page, type Route } from '@playwright/test';
import { test, signIn, capture, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';

const emailConfig = { channel: 'email', enabled: true, isConfigured: true, config: {
  smtpHost: 'smtp.example.invalid', smtpPort: 587, smtpUser: 'operator@example.invalid', smtpPass: '********', smtpSecure: false, recipients: ['recipient@example.invalid'],
} };
const notificationUrl = '**/api/alarms/notification';
const definitionsUrl = '**/api/alarms/definitions';
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
async function openWorkspace(page: Page, fixtures: Fixtures) {
  await signIn(page, fixtures);
  await page.goto('/settings/alerts');
  await expect(page.getByText('Düzenleme yetkisi var', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Kural ara', exact: true }).fill(fixtures.manifest.prefix);
  await expect(page.getByRole('button', { name: `${fixtures.manifest.prefix} kuralını incele`, exact: true })).toHaveCount(1);
}
async function inspectRule(page: Page, fixtures: Fixtures) {
  await page.getByRole('button', { name: `${fixtures.manifest.prefix} kuralını incele`, exact: true }).click();
  return page.getByRole('dialog', { name: 'Kural ayrıntıları', exact: true });
}

test('Rule workspace: filtering, source semantics and a real changed-field save preserve detection and history', async ({ page, fixtures, prisma }, info) => {
  await prisma.alarmDefinition.update({ where: { id: fixtures.manifest.alarmId }, data: { name: 'Yüksek Giriş Denetimi', source: 'fortianalyzer', cooldownMinutes: 30, notifyEmail: true, detectionLogic: { source: 'fortianalyzer', threshold: 5, timeWindowMinutes: 15 } } });
  await openWorkspace(page, fixtures);
  await page.getByRole('textbox', { name: 'Kural ara', exact: true }).fill('YUKSEK GIRIS');
  await expect(page.getByRole('button', { name: `${fixtures.manifest.prefix} kuralını incele`, exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Kural durumu', exact: true }).selectOption('enabled');
  await expect(page.getByText('Bu filtrelerde kural bulunamadı', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Kural ara', exact: true }).fill(fixtures.manifest.prefix);
  const before = await prisma.alarmDefinition.findUniqueOrThrow({ where: { id: fixtures.manifest.alarmId }, include: { alarmEvents: true, incidents: true } });
  const dialog = await inspectRule(page, fixtures);
  await expect(dialog.getByText('En az 5 eşleşme', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Son 15 dakika', { exact: true })).toBeVisible();
  await dialog.getByLabel('Tekrar beklemesi (dakika)', { exact: true }).fill('0');
  await dialog.getByRole('switch', { name: 'Bu kural için e-posta iste', exact: true }).uncheck();
  const response = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarms/definitions' && reply.request().method() === 'PUT');
  await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
  const saved = await response; expect(saved.status()).toBe(200);
  expect(saved.request().postDataJSON()).toEqual({ id: fixtures.manifest.alarmId, cooldownMinutes: 0, notifyEmail: false });
  await expect(dialog).toHaveCount(0);
  const after = await prisma.alarmDefinition.findUniqueOrThrow({ where: { id: before.id }, include: { alarmEvents: true, incidents: true } });
  expect(after).toEqual({ ...before, cooldownMinutes: 0, notifyEmail: false, updatedAt: after.updatedAt });
  for (const cooldownMinutes of [-1, 1.5, 525601]) expect((await page.request.put('/api/alarms/definitions', { data: { id: before.id, cooldownMinutes } })).status()).toBe(400);
  expect(await prisma.alarmDefinition.findUniqueOrThrow({ where: { id: before.id }, include: { alarmEvents: true, incidents: true } })).toEqual(after);
  await capture(page, info, 'rules-saved');
});

for (const failure of ['server', 'forbidden', 'unverified'] as const) {
  test(`Rule workspace: ${failure} save retains the draft and retry changes only the intended fields`, async ({ page, fixtures, prisma }, info) => {
    await openWorkspace(page, fixtures);
    const before = await prisma.alarmDefinition.findUniqueOrThrow({ where: { id: fixtures.manifest.alarmId } });
    const dialog = await inspectRule(page, fixtures);
    await dialog.getByLabel('Tekrar beklemesi (dakika)', { exact: true }).fill('47');
    await page.route(definitionsUrl, route => route.request().method() !== 'PUT' ? route.continue() : json(route, failure === 'unverified' ? { success: true, data: {} } : { success: false }, failure === 'server' ? 500 : failure === 'forbidden' ? 403 : 200));
    await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByLabel('Tekrar beklemesi (dakika)', { exact: true })).toHaveValue('47');
    await expect(page.getByText(/kuralı kaydedildi\./)).toHaveCount(0);
    expect(await prisma.alarmDefinition.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
    await capture(page, info, `rule-${failure}-retained`);
    await page.unroute(definitionsUrl);
    await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const after = await prisma.alarmDefinition.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toEqual({ ...before, cooldownMinutes: 47, updatedAt: after.updatedAt });
  });
}

for (const denial of ['viewer', 'inactive', 'expired'] as const) {
  test(`Rule workspace: real ${denial} identity blocks rule, channel and test-send writes`, async ({ page, context, fixtures, prisma }, info) => {
    await openWorkspace(page, fixtures);
    const before = await prisma.alarmDefinition.findUniqueOrThrow({ where: { id: fixtures.manifest.alarmId } });
    const channel = await prisma.notificationConfig.findMany();
    const dialog = await inspectRule(page, fixtures);
    await dialog.getByLabel('Tekrar beklemesi (dakika)', { exact: true }).fill('61');
    const cookies = await context.cookies();
    try {
      if (denial === 'expired') await installTestSession(context, fixtures, 'ADMIN', true);
      else await prisma.user.update({ where: { id: fixtures.userId }, data: denial === 'viewer' ? { role: 'VIEWER' } : { status: 'INACTIVE' } });
      const expected = denial === 'viewer' ? 403 : 401;
      const response = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarms/definitions' && reply.request().method() === 'PUT');
      await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
      expect((await response).status()).toBe(expected);
      await expect(dialog.getByRole('alert')).toHaveText(expected === 403 ? 'Bu işlem için yetkiniz yok.' : 'Oturumunuz sona ermiş. Yeniden giriş yapın.');
      await expect(dialog.getByLabel('Tekrar beklemesi (dakika)', { exact: true })).toHaveValue('61');
      for (const url of ['/api/alarms/definitions', '/api/alarms/notification']) {
        expect((await page.request.put(url, { data: '{', headers: { 'content-type': 'application/json' } })).status()).toBe(expected);
        if (denial !== 'viewer') expect((await page.request.get(url)).status()).toBe(401);
      }
      expect((await page.request.post('/api/alarms/notification')).status()).toBe(expected);
      expect(await prisma.alarmDefinition.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
      expect(await prisma.notificationConfig.findMany()).toEqual(channel);
      await capture(page, info, `rule-real-${denial}-retained`);
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } });
      await context.addCookies(cookies);
    }
  });
}

test('Rule workspace: current VIEWER can inspect but cannot submit changes or send email', async ({ page, fixtures, prisma }, info) => {
  await signIn(page, fixtures);
  try {
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
    await page.goto('/settings/alerts');
    await expect(page.getByText('Salt okunur görünüm', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Kural ara', exact: true }).fill(fixtures.manifest.prefix);
    const dialog = await inspectRule(page, fixtures);
    await expect(dialog.getByLabel('Tekrar beklemesi (dakika)', { exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true })).toHaveCount(0);
    await capture(page, info, 'rule-read-only');
    await dialog.getByRole('button', { name: 'Kapat', exact: true }).click();
    await page.getByRole('tab', { name: /^E-posta kanalı/ }).click();
    await expect(page.getByLabel('SMTP sunucusu', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Test iletisi gönder', exact: true })).toBeDisabled();
  } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); }
});

test('Rule workspace: email drafts, validation, failed saves and explicit test confirmation never contact SMTP', async ({ page, fixtures }, info) => {
  const writes: Array<{ method: string; body: unknown }> = []; let fail = true;
  await page.route(notificationUrl, async route => {
    const method = route.request().method();
    if (method === 'GET') return json(route, { success: true, data: emailConfig });
    writes.push({ method, body: method === 'PUT' ? route.request().postDataJSON() : null });
    return json(route, fail ? { success: false } : method === 'PUT' ? { success: true, data: { channel: 'email', enabled: true } } : { success: true }, fail ? 500 : 200);
  });
  await openWorkspace(page, fixtures);
  await page.getByRole('tab', { name: /^E-posta kanalı/ }).click();
  await expect(page.getByLabel('SMTP parolası', { exact: true })).toHaveValue('');
  await page.getByLabel('SMTP sunucusu', { exact: true }).fill('changed.example.invalid');
  await page.getByLabel('Yeni alıcı e-posta adresi', { exact: true }).fill('RECIPIENT@example.invalid');
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  await expect(page.getByText('Bu alıcı zaten listede.', { exact: true })).toBeVisible();
  await page.getByLabel('Yeni alıcı e-posta adresi', { exact: true }).fill('');
  await page.getByRole('tab', { name: 'Alarm kuralları', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Yenile', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: /^E-posta kanalı/ }).click();
  await expect(page.getByLabel('SMTP sunucusu', { exact: true })).toHaveValue('changed.example.invalid');
  await expect(page.getByRole('button', { name: 'Test iletisi gönder', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Ayarları kaydet', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'E-posta ayarları kaydedilemedi.' })).toBeVisible();
  await expect(page.getByLabel('SMTP sunucusu', { exact: true })).toHaveValue('changed.example.invalid');
  expect(writes).toHaveLength(1); expect(writes[0].body).toMatchObject({ smtpHost: 'changed.example.invalid', smtpPass: '' });
  fail = false;
  await page.getByRole('button', { name: 'Ayarları kaydet', exact: true }).click();
  await expect(page.getByText(/E-posta ayarları kaydedildi\./)).toBeVisible();
  await page.getByRole('button', { name: 'Test iletisi gönder', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Test iletisi gönderilsin mi?', exact: true });
  await expect(confirm.getByText('recipient@example.invalid', { exact: true })).toBeVisible();
  expect(writes.filter(item => item.method === 'POST')).toHaveLength(0);
  await capture(page, info, 'rule-email-confirmation');
  await confirm.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  expect(writes.filter(item => item.method === 'POST')).toHaveLength(0);
  await page.getByRole('button', { name: 'Test iletisi gönder', exact: true }).click();
  await page.getByRole('button', { name: 'Kayıtlı alıcılara gönder', exact: true }).click();
  await expect(page.getByText(/E-posta sunucusu test iletisini kabul etti\./)).toBeVisible();
  expect(writes.filter(item => item.method === 'POST')).toHaveLength(1);
});

test('Rule workspace: partial reload retains previous rules with stale status and disables their editor', async ({ page, fixtures }, info) => {
  await openWorkspace(page, fixtures);
  await page.route(definitionsUrl, route => json(route, { success: false }, 503));
  await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Son alınan bilgiler gösteriliyor' })).toBeVisible();
  const dialog = await inspectRule(page, fixtures);
  await expect(dialog.getByLabel('Tekrar beklemesi (dakika)', { exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true })).toHaveCount(0);
  await capture(page, info, 'rule-stale-read-only');
});

for (const dark of [false, true]) {
  test(`Rule workspace: mobile ${dark ? 'dark' : 'light'} rules and email remain usable`, async ({ page, fixtures }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(value => localStorage.setItem('theme', value), dark ? 'dark' : 'light');
    await page.route(notificationUrl, route => json(route, { success: true, data: emailConfig }));
    await openWorkspace(page, fixtures);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const dialog = await inspectRule(page, fixtures);
    await expect(dialog.getByLabel('Tekrar beklemesi (dakika)', { exact: true })).toBeVisible();
    await dialog.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await info.attach(`rule-mobile-${dark ? 'dark' : 'light'}-detail`, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
    await dialog.getByRole('button', { name: 'Kapat', exact: true }).click();
    await page.getByRole('tab', { name: /^E-posta kanalı/ }).click();
    await expect(page.getByLabel('SMTP sunucusu', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await capture(page, info, `rule-mobile-${dark ? 'dark' : 'light'}-email`);
  });
}
