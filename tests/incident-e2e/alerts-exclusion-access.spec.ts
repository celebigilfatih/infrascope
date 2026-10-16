import { expect } from '@playwright/test';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { test, capture } from './fixtures';
import { installTestSession } from './session-fixtures';
import { prepareExclusions } from './exclusion-fixtures';

const expiredWarning = 'Oturumunuzun süresi doldu veya oturumunuz geçersiz. Tekrar giriş yapın.';
const removeWarning = 'Hariç tutma kayıtlarını kaldırma yetkiniz yok.';

for (const operation of ['load', 'remove'] as const) for (const denial of ['expired', 'missing', 'forbidden', 'inactive'] as const) {
  test(`exclusion access: ${operation} ${denial} blocks unauthorized operations and recovers after reauthorization`, async ({ page, context, fixtures, prisma }, testInfo) => {
    const ui = await prepareExclusions(page, fixtures, prisma, { allowDeleteAttempts: operation === 'remove' });
    const cookies = await context.cookies();
    const target = ui.visibleEntries().find(entry => entry.field === 'sourceIp')!;
    const requests: string[] = [];
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/alarms/whitelist') requests.push(request.method()); });
    if (operation === 'remove') {
      await ui.open(); await ui.verifyList();
      await ui.table.getByRole('row').filter({ hasText: target.reason! }).getByRole('button', { name: 'Kaldır', exact: true }).click();
      await expect(ui.dialog.getByRole('region', { name: 'Kaldırma onayı' })).toContainText(`${target.field}: ${target.value}`);
    }
    try {
      if (denial === 'expired') await installTestSession(context, fixtures, 'ADMIN', true);
      else if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
      else if (denial === 'inactive') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: 'INACTIVE' } });
      else if (operation === 'load') {
        // All three supported roles can read alarms. An unsupported signed role
        // exercises the real middleware's fail-closed 403 read boundary.
        await installTestSession(context, fixtures, 'NO_ACCESS');
      } else {
        // The existing ADMIN JWT must not override a freshly revoked DB role.
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
      }
      const status = denial === 'forbidden' ? 403 : 401;
      const responsePending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarms/whitelist' && reply.request().method() === (operation === 'load' ? 'GET' : 'DELETE'));
      if (operation === 'load') await ui.open();
      else await ui.dialog.getByRole('button', { name: 'Kaldırmayı onayla', exact: true }).click();
      const response = await responsePending;
      expect(response.status()).toBe(status);
      const body = await response.json(); expect(body).not.toHaveProperty('data'); expect(body).not.toHaveProperty('removed');
      const warning = status === 401 ? expiredWarning : operation === 'load' ? 'Hariç tutma kayıtlarını görüntüleme yetkiniz yok.' : removeWarning;
      await expect(ui.dialog.getByRole('alert')).toHaveText(warning);
      await expect(ui.table).toHaveCount(0); await expect(ui.empty).toHaveCount(0); await expect(ui.reload).toHaveCount(0);
      await expect(ui.dialog.getByRole('region', { name: 'Kaldırma onayı' })).toHaveCount(0);
      await expect(ui.dialog.getByRole('button', { name: 'Kaldır', exact: true })).toHaveCount(0);
      await expect(ui.dialog.getByRole('button', { name: 'Kaldırmayı onayla', exact: true })).toHaveCount(0);
      await expect(ui.dialog.getByRole('status')).toHaveCount(0);
      const login = ui.dialog.getByRole('link', { name: 'Tekrar giriş yap', exact: true });
      if (status === 401) await expect(login).toHaveAttribute('href', '/login?next=%2Fdashboard%2Falerts');
      else await expect(login).toHaveCount(0);
      await ui.verifySelection(); await ui.verifyData();
      // Bypassing the disabled/absent UI controls must still be denied by the API.
      const directDelete = await page.request.delete(`/api/alarms/whitelist?id=${target.id}`);
      expect(directDelete.status()).toBe(status); expect(await directDelete.json()).not.toHaveProperty('removed');
      const directRead = await page.request.get('/api/alarms/whitelist?includeDisabled=true');
      if (operation === 'remove' && denial === 'forbidden') {
        expect(directRead.status()).toBe(200); expect((await directRead.json()).canDelete).toBe(false);
      } else {
        expect(directRead.status()).toBe(status); expect(await directRead.json()).not.toHaveProperty('data');
      }
      expect(requests).toEqual(operation === 'load' ? ['GET'] : ['GET', 'DELETE']);
      await ui.verifyData(); await capture(page, testInfo, `exclusion-access-${operation}-${denial}`);

      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } });
      await context.addCookies(cookies);
      await expect(ui.dialog.getByRole('alert')).toHaveText(warning);
      await ui.verifyData();
      expect(requests).toEqual(operation === 'load' ? ['GET'] : ['GET', 'DELETE']);
      await ui.close(); await ui.open(); await ui.verifyList();
      expect(requests).toEqual(operation === 'load' ? ['GET', 'GET'] : ['GET', 'DELETE', 'GET']);
      await ui.close();
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } });
      await context.addCookies(cookies);
    }
  });
}

for (const role of ['EDITOR', 'VIEWER'] as const) {
  test(`exclusion access: ${role} can read but cannot remove entries`, async ({ page, context, fixtures, prisma }, testInfo) => {
    const ui = await prepareExclusions(page, fixtures, prisma);
    const cookies = await context.cookies();
    let deletes = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/alarms/whitelist' && request.method() === 'DELETE') deletes++; });
    try {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role } });
      // EDITOR deliberately keeps its old ADMIN JWT; VIEWER exercises the Edge denial too.
      if (role === 'VIEWER') await installTestSession(context, fixtures, role);
      const loaded = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarms/whitelist' && reply.request().method() === 'GET');
      await ui.open();
      const response = await loaded; expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, canDelete: false, data: ui.visibleEntries().map(entry => expect.objectContaining({ id: entry.id })) });
      await expect(ui.dialog.getByRole('status')).toHaveText(removeWarning);
      await expect(ui.dialog.getByRole('alert')).toHaveCount(0); await expect(ui.reload).toHaveCount(0);
      await expect(ui.table.getByRole('row')).toHaveCount(4);
      const buttons = ui.table.getByRole('button', { name: 'Kaldır', exact: true });
      await expect(buttons).toHaveCount(3);
      for (const button of await buttons.all()) { await expect(button).toBeDisabled(); await button.click({ force: true }); }
      await expect(ui.dialog.getByRole('region', { name: 'Kaldırma onayı' })).toHaveCount(0);
      expect(deletes).toBe(0);
      const denied = await page.request.delete(`/api/alarms/whitelist?id=${ui.visibleEntries()[0].id}`);
      expect(denied.status()).toBe(403); expect(await denied.json()).not.toHaveProperty('removed');
      await ui.verifySelection(); await ui.verifyData(); await capture(page, testInfo, `exclusion-read-only-${role.toLowerCase()}`);
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); await context.addCookies(cookies);
      for (const button of await buttons.all()) await expect(button).toBeDisabled();
      await ui.close(); await ui.open(); await ui.verifyList(); await ui.close(); expect(deletes).toBe(0);
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); await context.addCookies(cookies);
    }
  });
}
