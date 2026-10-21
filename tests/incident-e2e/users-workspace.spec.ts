import { expect, type Page, type Route, type TestInfo } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { test as base, signIn, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';

const test = base.extend<{ account: { id: string; name: string; email: string } }>({
  account: async ({ prisma, fixtures }, use) => {
    const row = await prisma.user.create({ data: { name: 'İzleyici Giriş', email: fixtures.manifest.prefix + '@example.invalid', role: 'VIEWER', status: 'ACTIVE', password: await bcrypt.hash(fixtures.password, 12), lastLoginAt: null } });
    try { await use(row); }
    finally {
      await prisma.auditLog.deleteMany({ where: { resource: 'user', resourceId: row.id } });
      await prisma.user.deleteMany({ where: { id: row.id } });
    }
  },
});
async function open(page: Page, fixtures: Fixtures, email: string) {
  await signIn(page, fixtures);
  await page.goto('/settings/users');
  await expect(page.getByRole('button', { name: 'Yeni kullanıcı', exact: true })).toBeEnabled();
  await page.getByLabel('Kullanıcı ara', { exact: true }).fill(email);
}
async function inspect(page: Page, name = 'İzleyici Giriş') {
  await page.getByRole('button', { name: name + ' hesabını incele', exact: true }).filter({ visible: true }).click();
  return page.getByRole('dialog', { name: 'Kullanıcı ayrıntıları', exact: true });
}
async function edit(page: Page) {
  await (await inspect(page)).getByRole('button', { name: 'Hesabı düzenle', exact: true }).click();
  return page.getByRole('dialog', { name: 'Hesabı düzenle', exact: true });
}
async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
}
const json = (route: Route, data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

test('Users workspace: real list filters, timestamps, activity and effective read-only role rules', async ({ page, fixtures, account, prisma }, info) => {
  await open(page, fixtures, account.email);
  await page.getByLabel('Kullanıcı ara', { exact: true }).fill('IZLEYICI GIRIS');
  await expect(page.getByText('Giriş kaydı yok', { exact: true }).filter({ visible: true })).toHaveCount(1);
  await page.getByLabel('Hesap durumu filtresi', { exact: true }).selectOption('inactive');
  await expect(page.getByText('Filtrelerle eşleşen kullanıcı yok', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).click();
  await page.getByLabel('Kullanıcı ara', { exact: true }).fill(account.email);
  await prisma.userActivity.create({ data: { userId: account.id, action: 'edit_user', createdAt: new Date('2026-10-17T22:00:00Z') } });
  const dialog = await inspect(page);
  await dialog.locator('summary').filter({ hasText: 'Hesaba yazılan son 5 kayıt' }).press('Enter');
  await expect(dialog.getByText('18.10.2026 01:00 · TSİ', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Kaydı oluşturan kişi/)).toBeVisible();
  await page.keyboard.press('Escape');
  const writes: string[] = [];
  page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/permissions') || (new URL(req.url()).pathname.startsWith('/api/users') && req.method() !== 'GET')) writes.push(req.method()); });
  await page.getByRole('tab', { name: 'Rol ve erişim kuralları', exact: true }).click();
  await expect(page.getByText(/Ortak rol yetkileri burada değiştirilemez/)).toBeVisible();
  await page.getByLabel('Yetki alanı ara', { exact: true }).fill('DENETIM');
  await expect(page.getByRole('region', { name: 'Denetim kayıtları erişim kuralları', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await capture(page, info, 'users-static-policy');
});

test('Users workspace: real changed-field edit, current-password verification and delete retain canonical audit identity', async ({ page, fixtures, account, prisma }, info) => {
  await open(page, fixtures, account.email);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
  const dialog = await edit(page);
  await dialog.getByLabel('Ad soyad', { exact: true }).fill('Updated Fixture');
  await expect(dialog.getByRole('region', { name: 'Değişiklik özeti' })).toContainText('İzleyici Giriş');
  const request = page.waitForRequest(req => new URL(req.url()).pathname === '/api/users' && req.method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
  expect((await request).postDataJSON()).toEqual({ id: account.id, name: 'Updated Fixture' });
  await expect(dialog).toHaveCount(0);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
  expect(after).toEqual({ ...before, name: 'Updated Fixture', updatedAt: after.updatedAt });
  expect(await prisma.auditLog.findMany({ where: { action: 'user.update', resourceId: account.id } })).toEqual([expect.objectContaining({ userId: fixtures.userId })]);
  await (await inspect(page, 'Updated Fixture')).getByRole('button', { name: 'Parolayı değiştir', exact: true }).click();
  const password = page.getByRole('dialog', { name: 'Parolayı değiştir', exact: true });
  const newPassword = fixtures.password + 'X';
  await password.getByLabel('Seçili hesabın mevcut parolası', { exact: true }).fill('Wrong-fixture!9');
  await password.getByLabel('Yeni parola', { exact: true }).fill(newPassword);
  await password.getByLabel('Parolayı doğrulayın', { exact: true }).fill(newPassword);
  await password.getByRole('button', { name: 'Parolayı değiştir', exact: true }).click();
  await expect(password.getByRole('alert')).toContainText('mevcut parolası hatalı');
  expect((await prisma.user.findUniqueOrThrow({ where: { id: account.id } })).password).toBe(after.password);
  await password.getByLabel('Seçili hesabın mevcut parolası', { exact: true }).fill(fixtures.password);
  await password.getByRole('button', { name: 'Parolayı değiştir', exact: true }).click();
  await expect(password).toHaveCount(0);
  const changed = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
  expect(await bcrypt.compare(newPassword, changed.password!)).toBe(true);
  expect(await prisma.auditLog.findMany({ where: { action: 'user.password_change', resourceId: account.id } })).toEqual([expect.objectContaining({ userId: fixtures.userId })]);
  await (await inspect(page, 'Updated Fixture')).getByRole('button', { name: 'Hesabı sil', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Hesabı sil', exact: true });
  await expect(deletion.getByText(account.email, { exact: true })).toBeVisible();
  await capture(page, info, 'users-delete-target');
  await deletion.getByRole('button', { name: 'Hesabı kalıcı olarak sil', exact: true }).click();
  await expect(deletion).toHaveCount(0);
  expect(await prisma.user.findUnique({ where: { id: account.id } })).toBeNull();
  expect(await prisma.userActivity.count({ where: { userId: account.id } })).toBe(0);
  expect(await prisma.auditLog.findMany({ where: { action: 'user.delete', resourceId: account.id } })).toEqual([expect.objectContaining({ userId: fixtures.userId, details: expect.objectContaining({ actorId: fixtures.userId }) })]);
});

for (const failure of ['server', 'unverified'] as const) {
  test(`Users workspace: ${failure} write retains draft and blocks retries until a fresh list`, async ({ page, fixtures, account, prisma }, info) => {
    await open(page, fixtures, account.email);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    const dialog = await edit(page);
    await dialog.getByLabel('Ad soyad', { exact: true }).fill('Retained Fixture');
    let writes = 0;
    await page.route('**/api/users', route => route.request().method() !== 'PATCH' ? route.continue() : (writes++, json(route, failure === 'server' ? { success: false, error: 'Email already exists' } : { success: true }, failure === 'server' ? 500 : 200)));
    await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('sonucu doğrulanamadı');
    await expect(dialog.getByLabel('Ad soyad', { exact: true })).toHaveValue('Retained Fixture');
    await expect(dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true })).toBeDisabled();
    expect(writes).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: account.id } })).toEqual(before);
    await capture(page, info, 'users-' + failure + '-retained');
    await dialog.getByRole('button', { name: 'Vazgeç', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Yeni kullanıcı', exact: true })).toBeDisabled();
    await page.unroute('**/api/users');
    await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Yeni kullanıcı', exact: true })).toBeEnabled();
  });
}
for (const denial of ['viewer', 'inactive', 'suspended', 'expired', 'missing'] as const) {
  test(`Users workspace: real ${denial} identity denies stale-session account writes without changing records`, async ({ page, context, fixtures, account, prisma }, info) => {
    await open(page, fixtures, account.email);
    const dialog = await edit(page);
    await dialog.getByLabel('Ad soyad', { exact: true }).fill('Denied Fixture');
    const before = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    const snapshot = () => Promise.all([prisma.userActivity.findMany({ where: { userId: account.id } }), prisma.auditLog.findMany({ where: { resourceId: account.id } })]);
    const records = await snapshot(), cookies = await context.cookies();
    try {
      if (denial === 'expired') await installTestSession(context, fixtures, 'ADMIN', true);
      else if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
      else await prisma.user.update({ where: { id: fixtures.userId }, data: denial === 'viewer' ? { role: 'VIEWER' } : { status: denial === 'suspended' ? 'SUSPENDED' : 'INACTIVE' } });
      const status = denial === 'viewer' ? 403 : 401;
      for (let i = 0; i < 2; i++) {
        const response = page.waitForResponse(res => new URL(res.url()).pathname === '/api/users' && res.request().method() === 'PATCH');
        await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
        expect((await response).status()).toBe(status);
        await expect(dialog.getByRole('alert')).toContainText(status === 401 ? 'Oturumunuz' : 'yetkiniz');
        await expect(dialog.getByLabel('Ad soyad', { exact: true })).toHaveValue('Denied Fixture');
      }
      for (const method of ['POST', 'PATCH', 'DELETE']) expect((await page.request.fetch('/api/users?id=' + account.id, { method, data: '{', headers: { 'content-type': 'application/json' } })).status()).toBe(status);
      expect((await page.request.patch('/api/users/password', { data: '{', headers: { 'content-type': 'application/json' } })).status()).toBe(status);
      for (const url of ['/api/users', '/api/users/activities?userId=' + account.id]) expect((await page.request.get(url)).status()).toBe(denial === 'viewer' ? 200 : 401);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: account.id } })).toEqual(before);
      expect(await snapshot()).toEqual(records);
      await capture(page, info, 'users-real-' + denial);
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } });
      await context.addCookies(cookies);
    }
    await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: account.id } })).name).toBe('Denied Fixture');
    expect(await prisma.auditLog.count({ where: { resourceId: account.id, action: 'user.update' } })).toBe(1);
  });
}

test('Users workspace: current VIEWER is read-only and last admin deletion stays guarded', async ({ page, fixtures, account, prisma, context }, info) => {
  await open(page, fixtures, fixtures.email);
  const own = await inspect(page, 'Incident E2E Operator');
  await expect(own.getByRole('button', { name: 'Hesabı sil', exact: true })).toBeDisabled();
  expect((await page.request.delete('/api/users?id=' + fixtures.userId)).status()).toBe(400);
  await page.keyboard.press('Escape');
  await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
  await installTestSession(context, fixtures, 'VIEWER');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Yeni kullanıcı', exact: true })).toBeDisabled();
  await page.getByLabel('Kullanıcı ara', { exact: true }).fill(account.email);
  const detail = await inspect(page);
  for (const name of ['Hesabı düzenle', 'Parolayı değiştir', 'Hesabı sil']) await expect(detail.getByRole('button', { name, exact: true })).toBeDisabled();
  await capture(page, info, 'users-readonly');
});

test('Users workspace: synthetic creation validates passwords, verifies response and clears secrets on close', async ({ page, fixtures, prisma }, info) => {
  await open(page, fixtures, fixtures.email);
  const count = await prisma.user.count();
  await page.getByRole('button', { name: 'Yeni kullanıcı', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Yeni kullanıcı', exact: true });
  await dialog.getByLabel('Ad soyad', { exact: true }).fill('Create Fixture');
  const email = fixtures.manifest.prefix + '-create@example.invalid';
  await dialog.getByLabel('E-posta adresi', { exact: true }).fill(email);
  await dialog.getByLabel('Parola', { exact: true }).fill('weakpass');
  await dialog.getByLabel('Parolayı doğrulayın', { exact: true }).fill('weakpass');
  await dialog.getByRole('button', { name: 'Kullanıcı oluştur', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Parola koşullarını');
  await dialog.getByLabel('Parola', { exact: true }).fill(fixtures.password);
  await dialog.getByLabel('Parolayı doğrulayın', { exact: true }).fill(fixtures.password);
  let body: Record<string, unknown> = {};
  await page.route('**/api/users', route => {
    if (route.request().method() !== 'POST') return route.continue();
    body = route.request().postDataJSON();
    return json(route, { success: true, data: { id: 'synthetic-created', name: body.name, email: body.email, role: body.role, status: 'active' } });
  });
  await dialog.getByRole('button', { name: 'Kullanıcı oluştur', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(body).toEqual({ name: 'Create Fixture', email: email.toLowerCase(), role: 'viewer', status: 'active', password: fixtures.password });
  expect(await prisma.user.count()).toBe(count);
  await page.getByRole('button', { name: 'Yeni kullanıcı', exact: true }).click();
  await expect(dialog.getByLabel('Parola', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Parolayı doğrulayın', { exact: true })).toHaveValue('');
  await capture(page, info, 'users-create-cleared');
});

test('Users workspace: refresh and identity errors preserve stale records and disable writes; mobile dark dialogs fit', async ({ page, fixtures, account }, info) => {
  await open(page, fixtures, account.email);
  await page.route('**/api/users', route => json(route, { success: false }, 500));
  await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Kullanıcı listesi alınamadı.' })).toContainText('son başarılı okumaya');
  await expect(page.getByRole('button', { name: 'Yeni kullanıcı', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: account.name + ' hesabını incele', exact: true }).filter({ visible: true })).toBeVisible();
  await page.unroute('**/api/users');
  await page.route('**/api/auth/me', route => route.fulfill({ status: 503, body: 'not JSON' }));
  await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'İşlem yetkisi doğrulanamadı' })).toBeVisible();
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Yeni kullanıcı', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  const dialog = await inspect(page);
  await expect(dialog).toBeInViewport({ ratio: 0.99 });
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  const deletion = dialog.getByRole('button', { name: 'Hesabı sil', exact: true });
  await deletion.scrollIntoViewIfNeeded();
  // Measure the action and its animated panel together after scrolling. Separate
  // boundingBox calls can compare different animation frames by a fraction of a pixel.
  await expect.poll(() => deletion.evaluate(button => {
    const panel = button.closest('[role="dialog"]');
    if (!panel) return false;
    const action = button.getBoundingClientRect(); const container = panel.getBoundingClientRect();
    return action.width > 0 && action.height > 0 && action.left >= container.left && action.top >= container.top
      && action.right <= container.right && action.bottom <= container.bottom
      && action.left >= 0 && action.top >= 0 && action.right <= window.innerWidth && action.bottom <= window.innerHeight;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture(page, info, 'users-mobile-dark-detail');
  await deletion.click();
  const confirmation = page.getByRole('dialog', { name: 'Hesabı sil', exact: true });
  await expect(confirmation.getByText(account.email, { exact: true })).toBeVisible();
  await capture(page, info, 'users-mobile-dark-delete-confirmation');
  await confirmation.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await capture(page, info, 'users-mobile-light-list');
});

test('Users workspace: current EDITOR keeps write scope while stale ADMIN JWT cannot delete', async ({ page, fixtures, account, prisma }, info) => {
  await open(page, fixtures, account.email);
  await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR' } });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Yeni kullanıcı', exact: true })).toBeEnabled();
  await page.getByLabel('Kullanıcı ara', { exact: true }).fill(account.email);
  const detail = await inspect(page);
  await expect(detail.getByRole('button', { name: 'Hesabı sil', exact: true })).toBeDisabled();
  expect((await page.request.delete('/api/users?id=' + account.id)).status()).toBe(403);
  await detail.getByRole('button', { name: 'Hesabı düzenle', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Hesabı düzenle', exact: true });
  await dialog.getByLabel('Hesap durumu', { exact: true }).selectOption('suspended');
  await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: account.id } })).status).toBe('SUSPENDED');
  await capture(page, info, 'users-editor-write');
});

test('Users workspace: held save blocks repeated submissions and commits one audit entry', async ({ page, fixtures, account, prisma }) => {
  await open(page, fixtures, account.email);
  const dialog = await edit(page);
  await dialog.getByLabel('Ad soyad', { exact: true }).fill('Single Fixture');
  let release!: () => void, started!: () => void, writes = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const seen = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/users', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    writes++; started(); await gate; await route.continue();
  });
  try {
    await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click();
    await seen;
    await expect(dialog.getByRole('button', { name: 'İşleniyor…', exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('Ad soyad', { exact: true })).toBeDisabled();
    await page.keyboard.press('Enter');
    expect(writes).toBe(1);
  } finally { release(); }
  await expect(dialog).toHaveCount(0);
  expect(await prisma.auditLog.count({ where: { resourceId: account.id, action: 'user.update' } })).toBe(1);
});

test('Users workspace: allowed self-deletion preserves deleted actor identity in audit details', async ({ page, context, fixtures, account, prisma }) => {
  await open(page, fixtures, account.email);
  await prisma.user.update({ where: { id: account.id }, data: { role: 'ADMIN' } });
  await installTestSession(context, { ...fixtures, userId: account.id, email: account.email }, 'ADMIN');
  expect((await page.request.delete('/api/users?id=' + account.id)).status()).toBe(200);
  expect(await prisma.user.findUnique({ where: { id: account.id } })).toBeNull();
  expect(await prisma.auditLog.findMany({ where: { resourceId: account.id, action: 'user.delete' } })).toEqual([expect.objectContaining({ userId: null, details: expect.objectContaining({ actorId: account.id }) })]);
});
