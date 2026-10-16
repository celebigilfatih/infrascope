import { expect } from '@playwright/test';
import { test, signIn, capture } from './fixtures';

for (const failure of ['none', 'api-error', 'offline', 'response-lost'] as const) {
  test(`bulk assignment: ${failure} retains selection/assignee and never duplicates history`, async ({ page, context, fixtures, assignee, prisma }, testInfo) => {
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
    const filtered = page.waitForResponse(reply => {
      const url = new URL(reply.url());
      return reply.request().method() === 'GET' && url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-resolve` && !url.searchParams.has('status');
    });
    await page.goto(`/dashboard/alerts?status=all&search=${fixtures.manifest.prefix}-resolve`);
    expect((await filtered).status()).toBe(200);
    const list = page.getByRole('region', { name: 'Olay listesi', exact: true });
    const rowFor = (title: string) => list.getByRole('row').filter({ has: page.getByRole('button', { name: title, exact: true }) });
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
      for (const row of rows) await expect(rowFor(row.title).getByRole('checkbox')).toBeChecked();
    };
    await assertPreserved();
    fixtures.verify('preview');
    expect(requests).toHaveLength(0);

    if (failure !== 'none') {
      if (failure === 'offline') {
        await context.setOffline(true);
      } else {
        let faultInjected = false;
        await page.route('**/api/alarm-incidents', async route => {
          if (route.request().method() !== 'PATCH' || faultInjected) return route.continue();
          faultInjected = true;
          if (failure === 'api-error') {
            await route.fulfill({ status: 500, json: { success: false, error: 'Regresyon: geçici atama API hatası.' } });
          } else {
            const committed = await route.fetch({ maxRetries: 0 });
            expect(committed.status()).toBe(200);
            expect(await committed.json()).toMatchObject({ success: true, updated: rows.length });
            await route.abort('connectionreset');
          }
        });
      }
      try {
        await submit.click();
        await expect(dialog.getByRole('alert')).toBeVisible();
        if (failure === 'api-error') await expect(dialog.getByRole('alert')).toHaveText('Regresyon: geçici atama API hatası.');
        await expect(submit).toBeEnabled();
        await assertPreserved();
        expect(requests).toHaveLength(1);
        await verifyDatabase(failure === 'response-lost');
        await capture(page, testInfo, `assignment-${failure}-retained`);
      } finally {
        await context.setOffline(false);
      }
    }

    const priorRetry = { records: await readRecords(), audits: await readAudits() };
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
      for (const row of rows) await expect(rowFor(row.title).getByRole('checkbox')).toBeDisabled();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await assertPreserved();
      expect(requests).toHaveLength(failure === 'none' ? 1 : 2);
      await verifyDatabase(failure === 'response-lost');
    } finally {
      release();
    }
    const response = await applied;
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, updated: rows.length });
    await expect(dialog).toBeHidden();
    await expect(toolbar).toHaveCount(0);
    expect(requests).toHaveLength(failure === 'none' ? 1 : 2);
    for (const request of requests) {
      expect({ ...request, ids: [...request.ids].sort() }).toEqual({ ids, action: 'ASSIGN', assigneeId: assignee.id });
    }
    await verifyDatabase(true);
    if (failure === 'response-lost') {
      expect({ records: await readRecords(), audits: await readAudits() }).toEqual(priorRetry);
    }
    for (const row of rows) await expect(rowFor(row.title).getByText(assignee.name, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: rows[0].title, exact: true }).click();
    const detail = page.getByRole('dialog');
    await detail.getByRole('button', { name: 'Tüm geçmiş', exact: true }).click();
    await expect(detail.getByText('Sorumlu güncellendi', { exact: true })).toHaveCount(1);
    await expect(detail.getByText(`Atanmamış → ${assignee.name} · Incident E2E Operator`, { exact: true })).toBeVisible();
    await capture(page, testInfo, `assignment-${failure}-history`);
    expect(pageErrors).toEqual([]);
  });
}
