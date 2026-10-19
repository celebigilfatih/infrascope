import { expect } from '@playwright/test';
import { test, signIn, capture } from './fixtures';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { installTestSession } from './session-fixtures';

for (const denial of ['expired', 'missing', 'inactive', 'revoked-role', 'viewer-session'] as const) {
  test(`bulk assignment access: ${denial} retains selection/assignee without unauthorized writes`, async ({ page, context, fixtures, assignee, prisma }, testInfo) => {
    const rows = fixtures.manifest.rows.filter(row => row.group === 'resolve');
    const ids = rows.map(row => row.id).sort();
    const allIds = fixtures.manifest.rows.map(row => row.id);
    const readRecords = () => prisma.alarmIncident.findMany({ where: { id: { in: allIds } }, orderBy: { id: 'asc' }, include: {
      transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
    } });
    const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: allIds } }, orderBy: { id: 'asc' } });
    const before = await readRecords();
    expect(before).toHaveLength(8);
    expect(await readAudits()).toEqual([]);
    const verifyDatabase = async (applied: boolean) => {
      const records = await readRecords();
      const audits = await readAudits();
      expect(records).toHaveLength(before.length);
      expect(audits).toHaveLength(applied ? rows.length : 0);
      for (const original of before) {
        const actual = records.find(row => row.id === original.id)!;
        if (!applied || !ids.includes(original.id)) {
          expect(actual).toEqual(original);
          continue;
        }
        expect(actual).toMatchObject({ assignedToId: assignee.id, assignedTo: assignee.name });
        expect(actual.assignedAt).not.toBeNull();
        const assignment = actual.transitions.filter(item => item.type === 'ASSIGNED');
        expect(assignment).toHaveLength(1);
        expect(assignment[0]).toMatchObject({
          fromStatus: original.status, toStatus: original.status, actorType: 'USER',
          actorId: fixtures.userId, actorName: 'Incident E2E Operator', reason: null,
          metadata: { previousAssigneeId: null, previousAssigneeName: null, assigneeId: assignee.id, assigneeName: assignee.name },
        });
        // Assignment may change only the owner, update timestamp and one history item.
        // Lifecycle, occurrence acknowledgements, reasons and notifications stay identical.
        expect({ ...actual, assignedToId: original.assignedToId, assignedTo: original.assignedTo,
          assignedAt: original.assignedAt, updatedAt: original.updatedAt,
          transitions: actual.transitions.filter(item => item.type !== 'ASSIGNED'),
        }).toEqual(original);
        expect(audits.filter(item => item.entityId === original.id)).toEqual([expect.objectContaining({
          action: 'assign', userId: fixtures.userId, entity: 'AlarmIncident', resourceId: original.id,
          details: expect.objectContaining({ assignment: { previousAssigneeId: null, previousAssigneeName: null, assigneeId: assignee.id, assigneeName: assignee.name } }),
        })]);
      }
    };
    const requests: Array<{ ids: string[]; action: string; assigneeId: string }> = [];
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/alarm-incidents' && request.method() === 'PATCH') requests.push(request.postDataJSON());
    });
    await signIn(page, fixtures);
    const cookies = await context.cookies();
    const filtered = page.waitForResponse(reply => {
      const url = new URL(reply.url());
      return reply.request().method() === 'GET' && url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-resolve` && !url.searchParams.has('status');
    });
    await page.goto(`/dashboard/alerts?status=all&search=${fixtures.manifest.prefix}-resolve`);
    expect((await filtered).status()).toBe(200);
    const list = page.getByRole('region', { name: 'Olay listesi', exact: true, includeHidden: true });
    const rowFor = (title: string) => list.getByRole('row', { includeHidden: true }).filter({ has: page.getByRole('button', { name: title, exact: true, includeHidden: true }) });
    await expect(list.getByRole('checkbox')).toHaveCount(5);
    const selectAll = page.getByRole('checkbox', { name: 'Bu sayfadaki olayları seç', exact: true });
    await selectAll.check();
    const toolbar = page.getByRole('region', { name: 'Toplu olay işlemleri', exact: true });
    await toolbar.getByRole('button', { name: 'Sorumlu ata', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Toplu sorumlu atama', exact: true });
    const person = dialog.getByRole('combobox', { name: 'Atanacak sorumlu', exact: true });
    const submit = dialog.getByRole('button', { name: 'Atamayı uygula', exact: true });
    await expect(submit).toBeDisabled();
    await expect(person).toBeEnabled();
    await person.selectOption(assignee.id);
    const assertPreserved = async () => {
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('4 olay seçili.');
      await expect(person).toHaveValue(assignee.id);
      await expect(selectAll).toBeChecked();
      for (const row of rows) await expect(rowFor(row.title).getByRole('checkbox', { includeHidden: true })).toBeChecked();
    };
    await assertPreserved();
    fixtures.verify('preview');
    expect(requests).toHaveLength(0);

    const login = dialog.getByRole('link', { name: 'Yeni sekmede giriş yap', exact: true });
    try {
      if (denial === 'expired') await installTestSession(context, fixtures, 'ADMIN', true);
      else if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
      else if (denial === 'inactive') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: 'INACTIVE' } });
      else {
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
        if (denial === 'viewer-session') await installTestSession(context, fixtures, 'VIEWER');
      }
      const status = ['expired', 'missing', 'inactive'].includes(denial) ? 401 : 403;
      const warning = status === 401
        ? 'Oturumunuzun süresi doldu veya oturumunuz geçersiz. Tekrar giriş yapın. Olay seçiminiz ve seçtiğiniz sorumlu bu pencerede korunuyor.'
        : 'Seçili olayların sorumlusunu değiştirme yetkiniz yok. Atamalar değiştirilmedi; olay seçiminiz ve seçtiğiniz sorumlu korundu.';
      for (let attempt = 0; attempt < 2; attempt++) {
        const pending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
        await submit.click(); const response = await pending;
        expect(response.status()).toBe(status); expect(await response.json()).not.toHaveProperty('data');
        await expect(dialog.getByRole('alert')).toHaveText(warning); await expect(submit).toBeEnabled();
        await assertPreserved(); await verifyDatabase(false); fixtures.verify('preview');
        expect(requests).toHaveLength(attempt + 1);
        if (status === 401) { await expect(login).toHaveAttribute('href', '/login?next=%2Fdashboard%2Falerts'); await expect(login).toHaveAttribute('target', '_blank'); }
        else await expect(login).toHaveCount(0);
      }
      const forbidden = await page.request.patch('/api/alarm-incidents', { data: { ids, action: 'ASSIGN', assigneeId: assignee.id, actorName: 'Untrusted' } });
      expect(forbidden.status()).toBe(status); expect(await forbidden.json()).not.toHaveProperty('data');
      const malformed = await page.request.patch('/api/alarm-incidents', { data: '{', headers: { 'content-type': 'application/json' } });
      expect(malformed.status()).toBe(status); await verifyDatabase(false);
      await capture(page, testInfo, `bulk-assignment-access-${denial}-retained`);
      if (denial === 'expired') {
        const popup = context.waitForEvent('page'); await login.click(); const loginPage = await popup;
        try { await signIn(loginPage, fixtures); } finally { await loginPage.close(); }
        if (!await dialog.isVisible()) await toolbar.getByRole('button', { name: 'Sorumlu ata', exact: true }).click();
      } else {
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR', status: 'ACTIVE' } });
        await context.addCookies(cookies);
      }
      await assertPreserved(); await verifyDatabase(false);
      let release!: () => void;
      let notifyStarted!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const started = new Promise<void>(resolve => { notifyStarted = resolve; });
      await page.route('**/api/alarm-incidents', async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        notifyStarted();
        await gate;
        await route.continue();
      });
      const applied = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
      try {
        await submit.click();
        await started;
        await expect(dialog.getByRole('button', { name: 'Atanıyor…', exact: true })).toBeDisabled();
        await expect(dialog.getByRole('button', { name: 'İptal', exact: true })).toBeDisabled();
        await expect(person).toBeDisabled();
        for (const row of rows) await expect(rowFor(row.title).getByRole('checkbox', { includeHidden: true })).toBeDisabled();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Escape');
        await assertPreserved();
        expect(requests).toHaveLength(3);
        await verifyDatabase(false);
      } finally {
        release();
      }
      const response = await applied;
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, updated: rows.length });
      await expect(dialog).toBeHidden();
      await expect(toolbar).toHaveCount(0);
      expect(requests).toHaveLength(3);
      for (const request of requests) {
        expect({ ...request, ids: [...request.ids].sort() }).toEqual({ ids, action: 'ASSIGN', assigneeId: assignee.id });
      }
      await verifyDatabase(true);
      const committed = { records: await readRecords(), audits: await readAudits() };
      const replays = await Promise.all([page.request.patch('/api/alarm-incidents', { data: requests[2] }), page.request.patch('/api/alarm-incidents', { data: requests[2] })]);
      expect(replays.map(reply => reply.status())).toEqual([200, 200]);
      for (const replay of replays) expect(await replay.json()).toMatchObject({ success: true });
      expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
      expect((await page.request.patch('/api/alarm-incidents', { data: requests[2] })).status()).toBe(403);
      expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
      for (const row of rows) await expect(rowFor(row.title).getByText(assignee.name, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: rows[0].title, exact: true }).click();
      const detail = page.getByRole('dialog', { name: rows[0].title, exact: true });
      await detail.getByRole('button', { name: 'Tüm geçmiş', exact: true }).click();
      await expect(detail.getByText('Sorumlu güncellendi', { exact: true })).toHaveCount(1);
      await expect(detail.getByText(`Atanmamış → ${assignee.name} · Incident E2E Operator`, { exact: true })).toBeVisible();
      await capture(page, testInfo, `bulk-assignment-access-${denial}-history`);
      expect(pageErrors).toEqual([]);
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } });
      await context.addCookies(cookies);
    }
  });
}

test('bulk assignment access: initial viewer cannot submit and editor capability refresh enables assignment', async ({ page, context, fixtures, prisma, assignee }, testInfo) => {
  await signIn(page, fixtures); const cookies = await context.cookies();
  try {
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
    await installTestSession(context, fixtures, 'VIEWER');
    const filtered = page.waitForResponse(reply => {
      const url = new URL(reply.url());
      return reply.request().method() === 'GET' && url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-resolve` && !url.searchParams.has('status');
    });
    await page.goto(`/dashboard/alerts?status=all&search=${fixtures.manifest.prefix}-resolve`); expect((await filtered).status()).toBe(200);
    await page.getByRole('checkbox', { name: 'Bu sayfadaki olayları seç', exact: true }).check();
    const trigger = page.getByRole('button', { name: 'Sorumlu ata', exact: true });
    const people = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents/assignees');
    await trigger.click(); expect(await (await people).json()).toMatchObject({ success: true, canManage: false });
    const dialog = page.getByRole('dialog', { name: 'Toplu sorumlu atama', exact: true });
    await expect(dialog.getByRole('combobox')).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Atamayı uygula', exact: true })).toBeDisabled();
    await expect(dialog).toContainText('Atama için yönetici veya editör yetkisi gerekiyor.');
    const ids = fixtures.manifest.rows.filter(row => row.group === 'resolve').map(row => row.id);
    expect((await page.request.patch('/api/alarm-incidents', { data: { ids, action: 'ASSIGN', assigneeId: assignee.id } })).status()).toBe(403);
    fixtures.verify('preview'); await capture(page, testInfo, 'bulk-assignment-access-viewer-readonly');
    await dialog.getByRole('button', { name: 'İptal', exact: true }).click(); await expect(dialog).toBeHidden();
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR' } });
    const refreshed = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents/assignees');
    await trigger.click(); expect(await (await refreshed).json()).toMatchObject({ success: true, canManage: true });
    await expect(dialog.getByRole('combobox')).toBeEnabled(); await dialog.getByRole('combobox').selectOption(assignee.id);
    await expect(dialog.getByRole('button', { name: 'Atamayı uygula', exact: true })).toBeEnabled(); fixtures.verify('preview');
  } finally {
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); await context.addCookies(cookies);
  }
});
