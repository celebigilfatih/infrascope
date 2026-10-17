import { expect, type Page, type Route, type TestInfo } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { test as base, signIn, type Fixtures } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';

interface Invites { id: string; email: string; token: string; prefix: string }
let serial = 0;
const test = base.extend<{ invites: Invites }>({
  invites: async ({ prisma, fixtures }, use) => {
    const prefix = fixtures.manifest.prefix.toLowerCase(), email = prefix + '@example.invalid';
    const row = await prisma.invitation.create({ data: { email, role: 'EDITOR', token: randomBytes(32).toString('hex'), invitedBy: 'İlk Davet Eden', expiresAt: new Date(Date.now() + 86400000) } });
    try { await use({ id: row.id, email, token: row.token, prefix }); }
    finally {
      const accounts = await prisma.user.findMany({ where: { email: { startsWith: prefix } }, select: { id: true } });
      const rows = await prisma.invitation.findMany({ where: { email: { startsWith: prefix } }, select: { id: true } });
      await prisma.auditLog.deleteMany({ where: { OR: [{ resourceId: { in: rows.map(item => item.id) } }, { userId: { in: accounts.map(item => item.id) } }] } });
      await prisma.user.deleteMany({ where: { id: { in: accounts.map(item => item.id) } } });
      await prisma.invitation.deleteMany({ where: { id: { in: rows.map(item => item.id) } } });
    }
  },
});
async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
}
async function open(page: Page, fixtures: Fixtures, email: string) {
  await signIn(page, fixtures); await page.goto('/settings/users/invitations');
  await expect(page.getByRole('button', { name: 'Yeni davet', exact: true })).toBeEnabled();
  await page.getByLabel('Davet ara', { exact: true }).fill(email);
}
const visibleButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const payload = (token: string, password: string) => ({ token, name: 'Recipient Fixture', password, role: 'ADMIN' });
async function recipient(page: Page) { await page.context().clearCookies(); }

test('Invitations: read-only list, server expiry, secret omission, filters and details', async ({ page, fixtures, invites, prisma }, info) => {
  await prisma.invitation.update({ where: { id: invites.id }, data: { expiresAt: new Date('2026-01-01T00:00:00Z') } });
  const before = await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } });
  await open(page, fixtures, invites.email);
  const response = await page.request.get('/api/users/invite');
  expect(response.headers()['cache-control']).toBe('private, no-store');
  const body = await response.json();
  expect(body.data.find((item: { id: string }) => item.id === invites.id).status).toBe('expired');
  expect(JSON.stringify(body)).not.toContain(invites.token);
  await page.getByLabel('Atanacak rol filtresi', { exact: true }).selectOption('viewer');
  await expect(page.getByText('Filtrelerle eşleşen davet yok', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).click();
  await page.getByLabel('Davet ara', { exact: true }).fill('ILK DAVET EDEN');
  await visibleButton(page, invites.email + ' davetini incele').click();
  const detail = page.getByRole('dialog', { name: 'Davet ayrıntıları', exact: true });
  await expect(detail.getByText('Bu oturumda doğrulanmış gönderim bilgisi yok.', { exact: true })).toBeVisible();
  await detail.locator('summary').press('Enter');
  await expect(detail.getByText('Editör rolünün erişimi', { exact: true })).toBeVisible();
  await capture(page, info, 'invitation-detail-role');
  expect(await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } })).toEqual(before);
  expect(await prisma.auditLog.count({ where: { resourceId: invites.id } })).toBe(0);
});

test('Invitations: real development create/resend preserve link scope, original inviter and canonical audit actor', async ({ page, fixtures, invites, prisma }, info) => {
  await open(page, fixtures, invites.email);
  const before = await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } });
  await visibleButton(page, invites.email + ' davetini yeniden gönder').click();
  const dialog = page.getByRole('dialog', { name: 'Daveti yeniden gönder', exact: true });
  await expect(dialog.getByText(/Önceki e-postadaki bağlantı/)).toBeVisible();
  await expect(dialog.getByText(invites.email, { exact: true })).toBeVisible();
  expect(await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } })).toEqual(before);
  const reply = page.waitForResponse(res => res.url().endsWith('/resend') && res.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Yeniden gönder', exact: true }).click();
  const response = await reply, result = await response.json(); expect(response.status()).toBe(200); expect(result.delivery).toBe('development');
  expect(JSON.stringify(result)).not.toContain(invites.token);
  await expect(dialog).toHaveCount(0);
  const after = await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } });
  expect(after).toEqual({ ...before, expiresAt: after.expiresAt });
  expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime());
  expect(await prisma.auditLog.findMany({ where: { resourceId: invites.id } })).toEqual([expect.objectContaining({ userId: fixtures.userId, action: 'invitation.resend' })]);
  await expect(page.getByText(/Geliştirme modunda gerçek e-posta gönderilmez\./)).toBeVisible();
  await page.getByRole('button', { name: 'Yeni davet', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Yeni kullanıcı daveti', exact: true });
  const email = invites.prefix + '-new@example.invalid';
  await create.getByLabel('E-posta adresi', { exact: true }).fill(email.toUpperCase());
  await create.getByLabel('Atanacak rol', { exact: true }).selectOption('viewer');
  await create.getByRole('button', { name: 'Daveti gönder', exact: true }).click();
  await expect(create).toHaveCount(0);
  const row = await prisma.invitation.findUniqueOrThrow({ where: { email } });
  expect(row.role).toBe('VIEWER'); expect(row.invitedBy).toBe('Incident E2E Operator');
  expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  await capture(page, info, 'invitation-development-result');
  expect((await page.request.post('/api/users/invite', { data: { email, role: 'ADMIN' } })).status()).toBe(409);
});

test('Invitations: unauthenticated recipient accepts once with stored role, hashes password and logs in explicitly', async ({ page, context, fixtures, invites, prisma }, info) => {
  await recipient(page); await page.goto('/verify?token=' + invites.token);
  await expect(page.getByRole('heading', { name: 'Hesabınızı Oluşturun', exact: true })).toBeVisible();
  await page.getByLabel('Ad Soyad', { exact: true }).fill('Recipient Fixture');
  await page.getByLabel('Parola', { exact: true }).fill(fixtures.password);
  await page.getByLabel('Parolayı Doğrula', { exact: true }).fill(fixtures.password);
  await page.getByRole('button', { name: 'Hesap Oluştur', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hesap Oluşturuldu', exact: true })).toBeVisible();
  const user = await prisma.user.findUniqueOrThrow({ where: { email: invites.email } });
  expect(user.role).toBe('EDITOR'); expect(await bcrypt.compare(fixtures.password, user.password!)).toBe(true);
  expect((await context.cookies()).some(item => item.name === SESSION_COOKIE_NAME)).toBe(false);
  const row = await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } }); expect(row.status).toBe('ACCEPTED'); expect(row.acceptedAt).not.toBeNull();
  expect(await prisma.auditLog.count({ where: { action: 'invitation.accept', resourceId: invites.id, userId: user.id } })).toBe(1);
  expect((await page.request.post('/api/users/verify', { data: payload(invites.token, fixtures.password) })).status()).toBe(400);
  await capture(page, info, 'invitation-recipient-accepted');
  await signIn(page, { ...fixtures, userId: user.id, email: invites.email });
});

test('Invitations: concurrent acceptance of the same token creates exactly one account', async ({ page, invites, fixtures, prisma }) => {
  await recipient(page);
  const replies = await Promise.all([1, 2].map(() => page.request.post('/api/users/verify', { data: payload(invites.token, fixtures.password) })));
  expect(replies.filter(reply => reply.status() === 200)).toHaveLength(1);
  for (const reply of replies.filter(item => item.status() !== 200)) expect([400, 403, 409]).toContain(reply.status());
  expect(await prisma.user.count({ where: { email: invites.email } })).toBe(1);
  expect((await prisma.user.findUniqueOrThrow({ where: { email: invites.email } })).role).toBe('EDITOR');
  expect(await prisma.auditLog.count({ where: { action: 'invitation.accept', resourceId: invites.id } })).toBe(1);
});

test('Invitations: different concurrent tokens cannot exceed the real trial user quota', async ({ page, invites, fixtures, prisma }) => {
  const second = await prisma.invitation.create({ data: { email: invites.prefix + '-quota@example.invalid', role: 'VIEWER', token: randomBytes(32).toString('hex'), invitedBy: 'Quota Fixture', expiresAt: new Date(Date.now() + 86400000) } });
  expect(await prisma.user.count()).toBe(1);
  const replies = await Promise.all([invites.token, second.token].map(token => page.request.post('/api/users/verify', { data: payload(token, fixtures.password) })));
  expect(replies.filter(reply => reply.status() === 200)).toHaveLength(1);
  for (const reply of replies.filter(item => item.status() !== 200)) expect([403, 409]).toContain(reply.status());
  expect(await prisma.user.count()).toBe(2);
  const rows = await prisma.invitation.findMany({ where: { id: { in: [invites.id, second.id] } } });
  expect(rows.filter(row => row.status === 'ACCEPTED')).toHaveLength(1); expect(rows.filter(row => row.status === 'PENDING')).toHaveLength(1);
});

test('Invitations: actual transaction rolls back invitation claim and account after activity insert failure', async ({ page, invites, fixtures, prisma }) => {
  const before = await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } });
  await prisma.$executeRawUnsafe("ALTER TABLE user_activities ADD CONSTRAINT invitation_fixture_rollback CHECK (action <> 'account_created')");
  try {
    expect((await page.request.post('/api/users/verify', { data: payload(invites.token, fixtures.password) })).status()).toBe(500);
    expect(await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } })).toEqual(before);
    expect(await prisma.user.findUnique({ where: { email: invites.email } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { resourceId: invites.id } })).toBe(0);
  } finally { await prisma.$executeRawUnsafe('ALTER TABLE user_activities DROP CONSTRAINT invitation_fixture_rollback'); }
});

for (const denial of ['viewer', 'inactive', 'suspended', 'expired', 'missing'] as const) {
  test(`Invitations: real ${denial} identity denies sends and preserves drafts and stored records`, async ({ page, context, fixtures, invites, prisma }, info) => {
    await open(page, fixtures, invites.email);
    const before = await prisma.invitation.findMany({ orderBy: { id: 'asc' } }), cookies = await context.cookies();
    await page.getByRole('button', { name: 'Yeni davet', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Yeni kullanıcı daveti', exact: true });
    const email = invites.prefix + '-denied@example.invalid';
    await dialog.getByLabel('E-posta adresi', { exact: true }).fill(email);
    await dialog.getByLabel('Atanacak rol', { exact: true }).selectOption('editor');
    try {
      if (denial === 'expired') await installTestSession(context, fixtures, 'ADMIN', true);
      else if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
      else await prisma.user.update({ where: { id: fixtures.userId }, data: denial === 'viewer' ? { role: 'VIEWER' } : { status: denial === 'suspended' ? 'SUSPENDED' : 'INACTIVE' } });
      const status = denial === 'viewer' ? 403 : 401;
      for (let i = 0; i < 2; i++) {
        const response = page.waitForResponse(res => new URL(res.url()).pathname === '/api/users/invite' && res.request().method() === 'POST');
        await dialog.getByRole('button', { name: 'Daveti gönder', exact: true }).click();
        expect((await response).status()).toBe(status);
        await expect(dialog.getByRole('alert')).toContainText(status === 401 ? 'Oturumunuz' : 'yetkiniz');
        await expect(dialog.getByLabel('E-posta adresi', { exact: true })).toHaveValue(email);
        await expect(dialog.getByLabel('Atanacak rol', { exact: true })).toHaveValue('editor');
      }
      for (const url of ['/api/users/invite', '/api/users/invite/' + invites.id + '/resend']) expect((await page.request.post(url, { data: '{', headers: { 'content-type': 'application/json' } })).status()).toBe(status);
      expect((await page.request.get('/api/users/invite')).status()).toBe(denial === 'viewer' ? 200 : 401);
      expect(await prisma.invitation.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
      expect(await prisma.auditLog.count({ where: { resourceId: invites.id } })).toBe(0);
      await capture(page, info, 'invitation-real-' + denial);
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR', status: 'ACTIVE' } }); await context.addCookies(cookies);
    }
    await dialog.getByRole('button', { name: 'Daveti gönder', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { email } })).role).toBe('EDITOR');
  });
}

for (const failure of ['server', 'wrong-target'] as const) {
  test(`Invitations: ${failure} resend blocks uncertain retries until a refreshed list`, async ({ page, invites, fixtures, prisma }, info) => {
    await open(page, fixtures, invites.email);
    const before = await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } });
    await visibleButton(page, invites.email + ' davetini yeniden gönder').click();
    const dialog = page.getByRole('dialog', { name: 'Daveti yeniden gönder', exact: true });
    let writes = 0;
    await page.route('**/api/users/invite/*/resend', route => {
      writes++;
      return json(route, failure === 'server' ? { success: true } : { success: true, delivery: 'development', data: { ...before, id: 'wrong', role: 'editor', status: 'pending', emailSent: true } }, failure === 'server' ? 500 : 200);
    });
    await dialog.getByRole('button', { name: 'Yeniden gönder', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('sonucu doğrulanamadı');
    await expect(dialog.getByRole('button', { name: 'Yeniden gönder', exact: true })).toBeDisabled(); expect(writes).toBe(1);
    expect(await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } })).toEqual(before);
    await capture(page, info, 'invitation-' + failure);
    await dialog.getByRole('button', { name: 'Vazgeç', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Yeni davet', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Yeni davet', exact: true })).toBeEnabled();
  });
}

test('Invitations: source failure is distinct from invalid token and GET retry does not submit an account', async ({ page, invites }) => {
  await recipient(page);
  await page.route('**/api/users/verify?*', route => json(route, { success: true, valid: true }, 503));
  await page.goto('/verify?token=' + invites.token);
  await expect(page.getByRole('heading', { name: 'Davet doğrulanamadı', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Geçersiz Davet', exact: true })).toHaveCount(0);
  await page.unroute('**/api/users/verify?*');
  await page.getByRole('button', { name: 'Yeniden doğrula', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hesabınızı Oluşturun', exact: true })).toBeVisible();
});

test('Invitations: HTTP failure cannot claim account success even with a successful body', async ({ page, invites, fixtures, prisma }, info) => {
  await recipient(page); await page.goto('/verify?token=' + invites.token);
  await expect(page.getByRole('heading', { name: 'Hesabınızı Oluşturun', exact: true })).toBeVisible();
  await page.getByLabel('Ad Soyad', { exact: true }).fill('Recipient Fixture');
  await page.getByLabel('Parola', { exact: true }).fill(fixtures.password);
  await page.getByLabel('Parolayı Doğrula', { exact: true }).fill(fixtures.password);
  let writes = 0;
  await page.route('**/api/users/verify', route => { writes++; return json(route, { success: true, data: { id: 'synthetic', name: 'Recipient Fixture', email: invites.email, role: 'editor' } }, 500); });
  await page.getByRole('button', { name: 'Hesap Oluştur', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hata', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hesap Oluşturuldu', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hesap Oluştur', exact: true })).toHaveCount(0); expect(writes).toBe(1);
  expect(await prisma.user.findUnique({ where: { email: invites.email } })).toBeNull();
  await capture(page, info, 'invitation-acceptance-uncertain');
});

test('Invitations: exact public token route/method boundaries and real strict rate limiting', async ({ page, invites }) => {
  await recipient(page);
  for (const url of ['/api/users/invite', '/api/users/verify/extra']) expect((await page.request.get(url)).status()).toBe(401);
  expect((await page.request.delete('/api/users/verify')).status()).toBe(401);
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '198.51.100.' + (++serial) });
  for (let i = 0; i < 10; i++) expect((await page.request.get('/api/users/verify?token=' + invites.token)).status()).toBe(200);
  const limited = await page.request.get('/api/users/verify?token=' + invites.token);
  expect(limited.status()).toBe(429); expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);
});

test('Invitations: stale read disables sends and mobile dark confirmation remains inside the viewport', async ({ page, invites, fixtures, prisma }, info) => {
  await open(page, fixtures, invites.email);
  await page.route('**/api/users/invite', route => json(route, { success: false }, 500));
  await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Davet listesi alınamadı.' })).toContainText('Son başarılı okumadaki');
  await expect(page.getByRole('button', { name: 'Yeni davet', exact: true })).toBeDisabled();
  await page.unroute('**/api/users/invite');
  await page.getByRole('button', { name: 'Bilgileri yenile', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Yeni davet', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  const before = await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } });
  await visibleButton(page, invites.email + ' davetini yeniden gönder').click();
  const dialog = page.getByRole('dialog', { name: 'Daveti yeniden gönder', exact: true });
  await expect(dialog).toBeInViewport({ ratio: 0.99 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, info, 'invitation-mobile-dark-confirmation');
  await dialog.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  expect(await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } })).toEqual(before);
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await capture(page, info, 'invitation-mobile-light-list');
});
test('Invitations: open-page expiry uses server observation without modifying records', async ({ page, invites, fixtures, prisma }) => {
  await page.clock.install();
  const expiry = new Date(Date.now() + 45000).toISOString(), observedAt = new Date().toISOString();
  const before = await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } });
  await page.route('**/api/users/invite', route => json(route, { success: true, data: [{ ...before, role: 'editor', status: 'pending', expiresAt: expiry }], observedAt, deliveryMode: 'development' }));
  await open(page, fixtures, invites.email);
  const row = page.getByRole('row').filter({ hasText: invites.email });
  await expect(row.getByText('Kabul bekliyor', { exact: true })).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(row.getByText('Süresi doldu', { exact: true })).toBeVisible();
  expect(await prisma.invitation.findUniqueOrThrow({ where: { id: invites.id } })).toEqual(before);
});
test('Invitations: late acceptance response cannot replace a different token view', async ({ page, invites, fixtures, prisma }) => {
  const second = await prisma.invitation.create({ data: { email: invites.prefix + '-next@example.invalid', role: 'VIEWER', token: randomBytes(32).toString('hex'), invitedBy: 'Next Fixture', expiresAt: new Date(Date.now() + 86400000) } });
  await recipient(page); await page.goto('/verify?token=' + invites.token);
  await page.getByLabel('Ad Soyad', { exact: true }).fill('Recipient Fixture');
  await page.getByLabel('Parola', { exact: true }).fill(fixtures.password);
  await page.getByLabel('Parolayı Doğrula', { exact: true }).fill(fixtures.password);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), seen = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/users/verify', async route => { started(); await gate; await json(route, { success: true, data: { id: 'synthetic', name: 'Recipient Fixture', email: invites.email, role: 'editor' } }); });
  const response = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/users/verify' && reply.request().method() === 'POST');
  try {
    await page.getByRole('button', { name: 'Hesap Oluştur', exact: true }).click(); await seen;
    await page.evaluate(token => history.pushState(null, '', '/verify?token=' + token), second.token);
    await expect(page.getByText(second.email, { exact: true })).toBeVisible();
  } finally { release(); }
  await response;
  await expect(page.getByRole('heading', { name: 'Hesabınızı Oluşturun', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hesap Oluşturuldu', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Parola', { exact: true })).toHaveValue('');
});
