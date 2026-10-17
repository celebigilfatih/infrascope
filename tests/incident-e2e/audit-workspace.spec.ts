import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test as base, signIn } from './fixtures';
import { installTestSession } from './session-fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';

interface AuditFixture { action: string; ids: string[]; userId: string }
const test = base.extend<{ audit: AuditFixture }>({
  audit: async ({ fixtures, prisma }, use) => {
    const action = `${fixtures.manifest.prefix}.custom`;
    const records = Array.from({ length: 28 }, (_, index) => ({
      id: `${fixtures.manifest.prefix}-audit-${String(index).padStart(3, '0')}`,
      entity: 'AuditWorkspaceFixture', entityId: `${fixtures.manifest.prefix}-${index}`, action, resource: 'device',
      resourceId: index === 6 ? '=SUM(1,1)' : `${fixtures.manifest.prefix}-device-${index}`,
      userId: index === 7 ? null : fixtures.userId, ipAddress: null, userAgent: null,
      details: index === 4 ? false : index === 5 ? 0 : { before: { enabled: false, count: 0 }, after: { enabled: true, count: 1 } },
      timestamp: new Date(index === 0 ? '2026-10-16T20:59:59.999Z' : index === 1 ? '2026-10-17T21:00:00Z' : index === 2 ? '2026-10-16T21:00:00Z' : index === 3 ? '2026-10-17T20:59:59.999Z' : '2026-10-17T09:00:00Z'),
    }));
    await prisma.auditLog.createMany({ data: records });
    try { await use({ action, ids: records.map(item => item.id), userId: fixtures.userId }); }
    finally { await prisma.auditLog.deleteMany({ where: { id: { in: records.map(item => item.id) } } }); }
  },
});
const inspect = (page: Page, id: string) => page.getByRole('button', { name: `${id} kaydının ayrıntıları`, exact: true });
async function capture(page: Page, info: TestInfo, name: string, fullPage = false) {
  await info.attach(name, { body: await page.screenshot({ fullPage, animations: 'disabled' }), contentType: 'image/png' });
}
async function applyFilters(page: Page, action: string) {
  const pending = page.waitForResponse(reply => {
    const url = new URL(reply.url()); return url.pathname === '/api/audit' && url.searchParams.get('action') === action;
  });
  await page.getByRole('button', { name: 'Filtreleri uygula', exact: true }).click();
  const response = await pending; expect(response.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'CSV indir', exact: true })).toBeEnabled();
  return response.json();
}
async function openAudit(page: Page, action: string) {
  await page.goto('/settings/audit');
  await expect(page.getByRole('button', { name: 'CSV indir', exact: true })).toBeEnabled();
  await page.getByLabel('İşlem', { exact: true }).fill(action);
  return applyFilters(page, action);
}

test('Audit workspace: real list, day boundaries, stable pagination and CSV share one immutable scope', async ({ page, fixtures, audit, prisma }, info) => {
  await signIn(page, fixtures); await openAudit(page, audit.action);
  const readRecords = () => prisma.auditLog.findMany({ where: { id: { in: audit.ids } }, orderBy: { id: 'asc' } });
  const before = await readRecords();
  await page.getByLabel('Başlangıç tarihi', { exact: true }).fill('2026-10-17');
  await page.getByLabel('Bitiş tarihi', { exact: true }).fill('2026-10-17');
  await page.getByLabel('Kaynak türü', { exact: true }).selectOption('device');
  const first = await applyFilters(page, audit.action);
  const expected = before.filter(item => item.timestamp >= new Date('2026-10-16T21:00:00Z') && item.timestamp < new Date('2026-10-17T21:00:00Z')).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime() || b.id.localeCompare(a.id));
  expect(first.pagination).toMatchObject({ total: 26, totalPages: 2, page: 1, pageSize: 25 });
  expect(first.data.map((item: { id: string }) => item.id)).toEqual(expected.slice(0, 25).map(item => item.id));
  const secondReply = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/audit' && new URL(reply.url()).searchParams.get('page') === '2');
  await page.getByRole('button', { name: 'Sonraki sayfa', exact: true }).click();
  const second = await (await secondReply).json(); expect(second.data.map((item: { id: string }) => item.id)).toEqual(expected.slice(25).map(item => item.id));
  await expect(page.getByRole('button', { name: 'Sonraki sayfa', exact: true })).toBeDisabled();
  const download = page.waitForEvent('download');
  const exported = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/audit/export');
  await page.getByRole('button', { name: 'CSV indir', exact: true }).click();
  const response = await exported; expect(response.status()).toBe(200); expect(response.headers()['x-audit-export-truncated']).toBe('false');
  const params = new URL(response.url()).searchParams;
  expect(Object.fromEntries(params)).toEqual({ action: audit.action, resource: 'device', startDate: '2026-10-17', endDate: '2026-10-17' });
  const file = await download; const contents = await readFile((await file.path())!);
  expect([...contents.subarray(0, 3)]).toEqual([239, 187, 191]);
  const csv = contents.toString('utf8'); expect(csv).toContain('Tarih ve saat (UTC)'); expect(csv).toContain('"\'=SUM(1,1)"');
  const lines = csv.trimEnd().split('\n').slice(1); expect(lines).toHaveLength(26);
  expect(lines.map(line => line.split(',')[0])).toEqual(expected.map(item => `"${item.timestamp.toISOString()}"`));
  for (const item of expected.filter(item => item.resourceId !== '=SUM(1,1)')) expect(csv).toContain(`"${item.resourceId}"`);
  for (const item of before.filter(item => !expected.some(selected => selected.id === item.id))) expect(csv).not.toContain(`"${item.resourceId}"`);
  for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) expect((await page.request.fetch('/api/audit', { method })).status()).toBe(405);
  expect(await readRecords()).toEqual(before);
  await capture(page, info, 'audit-list-export-scope');
});

test('Audit workspace: details preserve false/zero and actor navigation uses the exact user identity', async ({ page, fixtures, audit, prisma }, info) => {
  await signIn(page, fixtures); await openAudit(page, audit.action);
  const sizeReply = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/audit' && new URL(reply.url()).searchParams.get('pageSize') === '50');
  await page.getByRole('combobox', { name: 'Sayfa başına kayıt', exact: true }).selectOption('50'); await sizeReply;
  await expect(page.getByRole('button', { name: 'CSV indir', exact: true })).toBeEnabled();
  await page.getByLabel('Kullanıcı', { exact: true }).fill(fixtures.email);
  const byEmail = await applyFilters(page, audit.action); expect(byEmail.pagination.total).toBe(27);
  expect(byEmail.data.every((item: { userId: string }) => item.userId === audit.userId)).toBe(true);
  await page.getByLabel('Kullanıcı', { exact: true }).fill(''); await applyFilters(page, audit.action);
  const before = await prisma.auditLog.findMany({ where: { id: { in: audit.ids } }, orderBy: { id: 'asc' } });
  for (const [index, label] of [[4, 'Hayır'], [5, '0']] as const) {
    await inspect(page, audit.ids[index]).click();
    const dialog = page.getByRole('dialog', { name: 'İşlem ayrıntıları', exact: true });
    await expect(dialog.getByRole('heading', { name: 'Kaydedilen ayrıntılar', exact: true })).toBeVisible();
    await expect(dialog.getByText(label, { exact: true })).toBeVisible();
    await expect(dialog.getByText('Bu işlem için ek ayrıntı kaydedilmemiş.', { exact: true })).toHaveCount(0);
    await capture(page, info, `audit-scalar-${index}`);
    await dialog.getByRole('button', { name: 'Kapat', exact: true }).click();
  }
  await inspect(page, audit.ids[8]).click();
  const dialog = page.getByRole('dialog', { name: 'İşlem ayrıntıları', exact: true });
  await expect(dialog.getByText('Önceki değer', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Yeni değer', { exact: true })).toBeVisible();
  const pending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/audit' && new URL(reply.url()).searchParams.get('userId') === audit.userId);
  await dialog.getByRole('button', { name: 'Bu kullanıcının işlemleri', exact: true }).click();
  const response = await pending; const body = await response.json(); expect(body.pagination.total).toBe(27);
  expect(new URL(response.url()).searchParams.has('user')).toBe(false);
  expect(body.data.every((item: { userId: string }) => item.userId === audit.userId)).toBe(true);
  expect(await prisma.auditLog.findMany({ where: { id: { in: audit.ids } }, orderBy: { id: 'asc' } })).toEqual(before);
});

for (const denial of ['editor', 'viewer', 'inactive', 'expired', 'missing'] as const) {
  test(`Audit workspace: real ${denial} identity cannot read or export using an old ADMIN session`, async ({ page, context, fixtures, audit, prisma }, info) => {
    await signIn(page, fixtures); await openAudit(page, audit.action);
    const cookies = await context.cookies();
    const before = await prisma.auditLog.findMany({ where: { id: { in: audit.ids } }, orderBy: { id: 'asc' } });
    try {
      if (denial === 'expired') await installTestSession(context, fixtures, 'ADMIN', true);
      else if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
      else await prisma.user.update({ where: { id: fixtures.userId }, data: denial === 'inactive' ? { status: 'INACTIVE' } : { role: denial === 'editor' ? 'EDITOR' : 'VIEWER' } });
      const expected = ['editor', 'viewer'].includes(denial) ? 403 : 401;
      for (const endpoint of ['/api/audit', '/api/audit/export']) for (const suffix of ['', '?page=-1']) {
        const reply = await page.request.get(endpoint + suffix); expect(reply.status()).toBe(expected); expect(await reply.json()).not.toHaveProperty('data');
      }
      await page.getByRole('button', { name: 'Yenile', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: expected === 403 ? 'Denetim kayıtlarını görüntüleme yetkiniz yok.' : 'Oturumunuz sona ermiş.' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'CSV indir', exact: true })).toBeDisabled();
      expect(await prisma.auditLog.findMany({ where: { id: { in: audit.ids } }, orderBy: { id: 'asc' } })).toEqual(before);
      await capture(page, info, `audit-real-${denial}-denied`);
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); await context.addCookies(cookies);
    }
  });
}

for (const failure of ['unavailable', 'invalid-row'] as const) {
  test(`Audit workspace: ${failure} refresh preserves its old scope without rendering it as a new result`, async ({ page, fixtures, audit }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await signIn(page, fixtures); const original = await openAudit(page, audit.action);
    await page.route('**/api/audit?*', route => route.fulfill({ status: failure === 'unavailable' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failure === 'unavailable' ? { success: false } : { ...original, data: [null] }) }));
    await page.getByRole('button', { name: 'Yenile', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Son alınan kayıtlar gösteriliyor.' })).toBeVisible();
    await expect(inspect(page, original.data[0].id)).toBeVisible();
    await expect(page.getByRole('button', { name: 'CSV indir', exact: true })).toBeDisabled();
    await page.getByLabel('İşlem', { exact: true }).fill(`${audit.action}.other`);
    await page.getByRole('button', { name: 'Filtreleri uygula', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kayıtlar görüntülenemiyor', exact: true })).toBeVisible();
    await expect(inspect(page, original.data[0].id)).toHaveCount(0); expect(errors).toEqual([]);
    await capture(page, info, `audit-${failure}-new-scope`);
  });
}

test('Audit workspace: export errors never download and a capped export is explicitly labelled', async ({ page, fixtures, audit }, info) => {
  await signIn(page, fixtures); await openAudit(page, audit.action);
  let downloads = 0, fail = true; page.on('download', () => downloads++);
  await page.route('**/api/audit/export?*', route => route.fulfill(fail ? { status: 503, contentType: 'application/json', body: '{"success":false}' } : { contentType: 'text/csv; charset=utf-8', headers: { 'X-Audit-Export-Truncated': 'true' }, body: '\uFEFF"Test kaydı"\n"İzole CSV"' }));
  await page.getByRole('button', { name: 'CSV indir', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'CSV dosyası hazırlanamadı.' })).toBeVisible(); expect(downloads).toBe(0);
  fail = false; const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV indir', exact: true }).click(); await download;
  await expect(page.getByText('İlk 10.000 kayıt CSV olarak tarayıcıya iletildi. Tüm kayıtlar için tarih aralığını daraltın.', { exact: true })).toBeVisible();
  expect(downloads).toBe(1); await capture(page, info, 'audit-capped-export-notice');
});

test('Audit workspace: date drafts do not query until applied and known empty results remain distinct', async ({ page, fixtures, audit }, info) => {
  await signIn(page, fixtures); await openAudit(page, audit.action);
  let reads = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/audit') reads++; });
  await page.getByLabel('Başlangıç tarihi', { exact: true }).fill('2026-10-18');
  await page.getByLabel('Bitiş tarihi', { exact: true }).fill('2026-10-17');
  await expect(page.getByText('Bitiş tarihi başlangıç tarihinden önce olamaz.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filtreleri uygula', exact: true })).toBeDisabled(); expect(reads).toBe(0);
  await page.getByRole('button', { name: 'Bugün', exact: true }).click(); expect(reads).toBe(0);
  await page.getByLabel('İşlem', { exact: true }).fill(`${audit.action}.missing`);
  const body = await applyFilters(page, `${audit.action}.missing`); expect(body.pagination.total).toBe(0);
  await expect(page.getByRole('heading', { name: 'Bu filtrelere uygun kayıt yok', exact: true })).toBeVisible();
  await capture(page, info, 'audit-known-empty');
});

for (const dark of [false, true]) {
  test(`Audit workspace: mobile ${dark ? 'dark' : 'light'} list and detail stay inside the viewport`, async ({ page, fixtures, audit }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(value => localStorage.setItem('theme', value), dark ? 'dark' : 'light');
    await signIn(page, fixtures); const body = await openAudit(page, audit.action);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await capture(page, info, `audit-mobile-${dark ? 'dark' : 'light'}-list`);
    await inspect(page, body.data[0].id).click();
    const dialog = page.getByRole('dialog', { name: 'İşlem ayrıntıları', exact: true });
    await dialog.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    const bounds = await dialog.boundingBox(); expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await capture(page, info, `audit-mobile-${dark ? 'dark' : 'light'}-detail`);
    await dialog.getByRole('button', { name: 'Kapat', exact: true }).click();
  });
}
