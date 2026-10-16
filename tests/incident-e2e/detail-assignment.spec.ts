import { expect } from '@playwright/test';
import { test, signIn, capture } from './fixtures';

for (const mode of ['change', 'remove'] as const) {
  const operation = mode === 'remove' ? 'unassignment' : 'assignment';
  for (const failure of ['none', 'api-error', 'offline', 'response-lost'] as const) {
    test(`detail ${operation}: ${failure} keeps target and retry creates one history item`, async ({ page, context, fixtures, assignee, prisma }, testInfo) => {
      const targetId = mode === 'remove' ? null : assignee.id;
      const targetName = mode === 'remove' ? null : assignee.name;
      const selectedValue = targetId || '';
      const row = fixtures.manifest.rows.find(item => item.group === 'resolve' && item.initialStatus === 'OPEN')!;
      // Exercise a change from an existing owner, rather than only an initial assignment.
      await prisma.alarmIncident.update({ where: { id: row.id }, data: {
        assignedToId: fixtures.userId, assignedTo: 'Incident E2E Operator', assignedAt: new Date('2026-10-15T12:00:00Z'),
      } });
      const ids = fixtures.manifest.rows.map(item => item.id);
      const draft = `  ${fixtures.manifest.prefix} kaydedilmemiş not\nİnceleme devam ediyor.  `;
      const readRecords = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
        transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
      } });
      const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
      const before = await readRecords();
      expect(before).toHaveLength(8);
      expect(await readAudits()).toEqual([]);
      const verifyDatabase = async (applied: boolean) => {
        const records = await readRecords();
        const audits = await readAudits();
        expect(records).toHaveLength(before.length);
        expect(audits).toHaveLength(applied ? 1 : 0);
        for (const original of before) {
          const actual = records.find(item => item.id === original.id)!;
          if (!applied || original.id !== row.id) { expect(actual).toEqual(original); continue; }
          expect(actual).toMatchObject({ assignedToId: targetId, assignedTo: targetName });
          if (mode === 'remove') expect(actual.assignedAt).toBeNull();
          else { expect(actual.assignedAt).not.toBeNull(); expect(actual.assignedAt).not.toEqual(original.assignedAt); }
          const assignments = actual.transitions.filter(item => item.type === 'ASSIGNED');
          expect(assignments).toHaveLength(1);
          expect(assignments[0]).toMatchObject({
            actorType: 'USER', actorId: fixtures.userId, actorName: 'Incident E2E Operator', fromStatus: 'OPEN', toStatus: 'OPEN', reason: null,
            metadata: { previousAssigneeId: fixtures.userId, previousAssigneeName: 'Incident E2E Operator', assigneeId: targetId, assigneeName: targetName },
          });
          expect({ ...actual, assignedToId: original.assignedToId, assignedTo: original.assignedTo,
            assignedAt: original.assignedAt, updatedAt: original.updatedAt,
            transitions: actual.transitions.filter(item => item.type !== 'ASSIGNED'),
          }).toEqual(original);
        }
        for (const audit of audits) expect(audit).toMatchObject({ entity: 'AlarmIncident', entityId: row.id, action: 'assign', userId: fixtures.userId,
          details: { fromStatus: 'OPEN', toStatus: 'OPEN', assignment: { previousAssigneeId: fixtures.userId, previousAssigneeName: 'Incident E2E Operator', assigneeId: targetId, assigneeName: targetName } },
        });
      };
      const requests: Array<{ ids: string[]; action: string; assigneeId: string | null }> = [];
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('request', request => {
        if (new URL(request.url()).pathname === '/api/alarm-incidents' && request.method() === 'PATCH') requests.push(request.postDataJSON());
      });
      await signIn(page, fixtures);
      const filtered = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && new URL(reply.url()).searchParams.get('search') === `${fixtures.manifest.prefix}-resolve`);
      await page.goto(`/dashboard/alerts?search=${fixtures.manifest.prefix}-resolve`);
      expect((await filtered).status()).toBe(200);
      await page.getByRole('button', { name: row.title, exact: true }).click();
      const detail = page.getByRole('dialog');
      const assignment = detail.getByRole('region', { name: 'Sorumlu atama', exact: true });
      const person = assignment.getByRole('combobox', { name: 'Sorumlu seçimi', exact: true });
      const submit = assignment.getByRole('button', { name: mode === 'remove' ? 'Atamayı kaldır' : 'Atamayı kaydet', exact: true });
      const note = detail.getByRole('textbox', { name: 'Yeni operasyon notu', exact: true });
      await expect(person).toBeEnabled();
      await expect(person).toHaveValue(fixtures.userId);
      await expect(assignment.getByRole('button', { name: 'Atamayı kaydet', exact: true })).toBeDisabled();
      await note.fill(draft);
      await person.selectOption(selectedValue);
      await expect(submit).toBeEnabled();
      fixtures.verify('preview');
      expect(requests).toHaveLength(0);

      if (failure !== 'none') {
        if (failure === 'offline') await context.setOffline(true);
        else {
          let faultInjected = false;
          await page.route('**/api/alarm-incidents', async route => {
            if (route.request().method() !== 'PATCH' || faultInjected) return route.continue();
            faultInjected = true;
            if (failure === 'api-error') await route.fulfill({ status: 500, json: { success: false, error: 'Regresyon: geçici detay atama hatası.' } });
            else {
              const committed = await route.fetch({ maxRetries: 0 });
              expect(committed.status()).toBe(200);
              expect(await committed.json()).toMatchObject({ success: true, updated: 1 });
              await route.abort('connectionreset');
            }
          });
        }
        try {
          await submit.click();
          await expect(detail.getByRole('alert')).toBeVisible();
          if (failure === 'api-error') await expect(detail.getByRole('alert')).toContainText('Regresyon: geçici detay atama hatası.');
          await expect(person).toHaveValue(selectedValue);
          await expect(note).toHaveValue(draft);
          await expect(submit).toBeEnabled();
          expect(requests).toHaveLength(1);
          await verifyDatabase(failure === 'response-lost');
          await capture(page, testInfo, `detail-${operation}-${failure}-retained`);
        } finally { await context.setOffline(false); }
      }

      const priorRetry = { records: await readRecords(), audits: await readAudits() };
      let release!: () => void;
      let notifyStarted!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const started = new Promise<void>(resolve => { notifyStarted = resolve; });
      await page.route('**/api/alarm-incidents', async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        notifyStarted(); await gate; await route.continue();
      });
      const applied = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
      try {
        await submit.click(); await started;
        await expect(assignment.getByRole('button', { name: 'Kaydediliyor…', exact: true })).toBeDisabled();
        await expect(person).toBeDisabled();
        await expect(note).toBeDisabled();
        await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
        await expect(person).toHaveValue(selectedValue);
        await expect(note).toHaveValue(draft);
        expect(requests).toHaveLength(failure === 'none' ? 1 : 2);
        await verifyDatabase(failure === 'response-lost');
      } finally { release(); }
      const response = await applied;
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, updated: 1 });
      await expect(assignment.locator('p').first()).toHaveText(targetName || 'Atanmamış');
      await expect(person).toHaveValue(selectedValue);
      await expect(note).toHaveValue(draft);
      await expect(assignment.getByRole('button', { name: 'Atamayı kaydet', exact: true })).toBeDisabled();
      expect(requests).toHaveLength(failure === 'none' ? 1 : 2);
      for (const request of requests) expect(request).toEqual({ ids: [row.id], action: 'ASSIGN', assigneeId: targetId });
      await verifyDatabase(true);
      if (failure === 'response-lost') expect({ records: await readRecords(), audits: await readAudits() }).toEqual(priorRetry);
      await detail.getByRole('button', { name: 'Tüm geçmiş', exact: true }).click();
      await expect(detail.getByRole('heading', { name: 'Sorumlu güncellendi', exact: true })).toHaveCount(1);
      await expect(detail.getByText(`Incident E2E Operator → ${targetName || 'Atanmamış'} · Incident E2E Operator`, { exact: true })).toBeVisible();
      await capture(page, testInfo, `detail-${operation}-${failure}-history`);
      await detail.getByRole('tab', { name: 'Genel bakış', exact: true }).click();
      await expect(note).toHaveValue(draft);
      expect(pageErrors).toEqual([]);
    });
  }

  test(`detail ${operation}: overlapping retries wait for the first write and share one history item`, async ({ page, fixtures, assignee, prisma }) => {
    const row = fixtures.manifest.rows.find(item => item.group === 'resolve' && item.initialStatus === 'OPEN')!;
    if (mode === 'remove') await prisma.alarmIncident.update({ where: { id: row.id }, data: {
      assignedToId: fixtures.userId, assignedTo: 'Incident E2E Operator', assignedAt: new Date('2026-10-15T12:00:00Z'),
    } });
    await signIn(page, fixtures);
    let release!: () => void;
    let notifyLocked!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const locked = new Promise<void>(resolve => { notifyLocked = resolve; });
    // Force both HTTP attempts to overlap at the same incident, without timing sleeps.
    const blocker = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "alarm_incidents" WHERE "id" = ${row.id} FOR UPDATE`;
      notifyLocked(); await gate;
    }, { timeout: 20_000 });
    await locked;
    const body = { ids: [row.id], action: 'ASSIGN', assigneeId: mode === 'remove' ? null : assignee.id };
    const responses = Promise.all([page.request.patch('/api/alarm-incidents', { data: body }), page.request.patch('/api/alarm-incidents', { data: body })]);
    try {
      await expect.poll(async () => {
        const waiting = await prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%alarm_incidents%'`;
        return waiting[0].count;
      }, { timeout: 10_000 }).toBe(2);
    } finally { release(); await blocker; }
    expect((await responses).map(reply => reply.status())).toEqual([200, 200]);
    const assignments = await prisma.alarmLifecycleTransition.findMany({ where: { incidentId: row.id, type: 'ASSIGNED' } });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ actorId: fixtures.userId, metadata: {
      previousAssigneeId: mode === 'remove' ? fixtures.userId : null,
      assigneeId: body.assigneeId, assigneeName: mode === 'remove' ? null : assignee.name,
    } });
    const stored = await prisma.alarmIncident.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored).toMatchObject({ assignedToId: body.assigneeId, assignedTo: mode === 'remove' ? null : assignee.name });
    if (mode === 'remove') expect(stored.assignedAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: row.id, action: 'assign' } })).toBe(1);
  });
}
