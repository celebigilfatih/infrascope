import { expect } from '@playwright/test';
import { test, signIn, capture } from './fixtures';

for (const action of ['SET_LEGAL_HOLD', 'RELEASE_LEGAL_HOLD'] as const) {
  const setting = action === 'SET_LEGAL_HOLD';
  const group = setting ? 'close' : 'resolve';
  const transitionType = setting ? 'LEGAL_HOLD_SET' : 'LEGAL_HOLD_RELEASED';
  const historyTitle = setting ? 'Saklama koruması etkinleştirildi' : 'Saklama koruması kaldırıldı';
  const submitLabel = setting ? 'Saklama korumasını etkinleştir' : 'Saklama korumasını kaldır';
  const oppositeLabel = setting ? 'Saklama korumasını kaldır' : 'Saklama korumasını etkinleştir';
  for (const failure of ['none', 'api-error', 'offline', 'response-lost'] as const) {
    test(`detail legal hold ${setting ? 'enable' : 'release'}: ${failure} retries leave one transition and audit`, async ({ page, context, fixtures, prisma }, testInfo) => {
      const initialStatus = ({ none: 'OPEN', 'api-error': 'ACKNOWLEDGED', offline: 'RESOLVED', 'response-lost': 'CLOSED' } as const)[failure];
      const row = fixtures.manifest.rows.find(item => item.group === group && item.initialStatus === initialStatus)!;
      if (!setting) await prisma.alarmIncident.update({ where: { id: row.id }, data: { legalHold: true } });
      const ids = fixtures.manifest.rows.map(item => item.id);
      const draft = `  ${fixtures.manifest.prefix} operasyon taslağı\nTakip devam ediyor.  `;
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
          expect(actual).toMatchObject({ status: initialStatus, legalHold: setting });
          expect(actual.transitions).toHaveLength(original.transitions.length + 1);
          const transitions = actual.transitions.filter(item => item.type === transitionType);
          expect(transitions).toHaveLength(1);
          expect(transitions[0]).toMatchObject({ fromStatus: initialStatus, toStatus: initialStatus, actorType: 'USER', actorId: fixtures.userId, actorName: 'Incident E2E Operator', reason: null });
          // Legal hold changes only the protection flag, update time and its append-only history.
          const restored = { ...actual, legalHold: original.legalHold, updatedAt: original.updatedAt,
            transitions: actual.transitions.filter(item => item.type !== transitionType),
          };
          expect(restored).toEqual(original);
        }
        for (const audit of audits) expect(audit).toMatchObject({ entity: 'AlarmIncident', entityId: row.id, action: action.toLowerCase(), userId: fixtures.userId, details: { fromStatus: initialStatus, toStatus: initialStatus } });
      };
      const requests: Array<{ ids: string[]; action: string }> = [];
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('request', request => {
        if (new URL(request.url()).pathname === '/api/alarm-incidents' && request.method() === 'PATCH') requests.push(request.postDataJSON());
      });
      await signIn(page, fixtures);
      const filtered = page.waitForResponse(reply => {
        const url = new URL(reply.url());
        return url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-${group}` && !url.searchParams.has('status') && url.searchParams.get('archiveState') === 'HOT';
      });
      await page.goto(`/dashboard/alerts?status=all&search=${fixtures.manifest.prefix}-${group}`);
      expect((await filtered).status()).toBe(200);
      const list = page.getByRole('region', { name: 'Olay listesi', exact: true });
      await expect(list.getByRole('checkbox')).toHaveCount(5);
      await page.getByRole('button', { name: row.title, exact: true }).click();
      const detail = page.getByRole('dialog');
      const more = detail.getByRole('button', { name: 'Diğer işlemler', exact: true });
      // The action is portalled outside the detail dialog and closes its popover on submission.
      const submit = page.getByRole('button', { name: submitLabel, exact: true });
      const holdNotice = detail.getByText('Saklama koruması etkin.', { exact: true });
      const submitHold = async () => {
        await more.click();
        await expect(submit).toBeEnabled();
        await submit.click();
      };
      const note = detail.getByRole('textbox', { name: 'Yeni operasyon notu', exact: true });
      await expect(note).toBeEnabled();
      await note.fill(draft);
      await expect(more).toBeEnabled();
      await expect(holdNotice).toHaveCount(setting ? 0 : 1);
      fixtures.verify('preview');
      expect(requests).toHaveLength(0);

      if (failure !== 'none') {
        if (failure === 'offline') await context.setOffline(true);
        else {
          let faultInjected = false;
          await page.route('**/api/alarm-incidents', async route => {
            if (route.request().method() !== 'PATCH' || faultInjected) return route.continue();
            faultInjected = true;
            if (failure === 'api-error') await route.fulfill({ status: 500, json: { success: false, error: 'Regresyon: geçici saklama koruması hatası.' } });
            else {
              const committed = await route.fetch({ maxRetries: 0 });
              expect(committed.status()).toBe(200);
              expect(await committed.json()).toMatchObject({ success: true, updated: 1 });
              await route.abort('connectionreset');
            }
          });
        }
        try {
          await submitHold();
          await expect(detail.getByRole('alert')).toBeVisible();
          if (failure === 'api-error') await expect(detail.getByRole('alert')).toContainText('Regresyon: geçici saklama koruması hatası.');
          await expect(more).toBeEnabled();
          await expect(holdNotice).toHaveCount(setting ? 0 : 1);
          await more.click();
          await expect(submit).toBeEnabled();
          await more.click();
          await expect(note).toHaveValue(draft);
          expect(requests).toHaveLength(1);
          await verifyDatabase(failure === 'response-lost');
          await capture(page, testInfo, `detail-${action.toLowerCase()}-${failure}-retained`);
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
        await submitHold(); await started;
        const busy = detail.getByRole('button', { name: 'İşlem sürüyor…', exact: true });
        await expect(busy).toHaveCount(initialStatus === 'OPEN' ? 2 : 1);
        for (let index = 0; index < await busy.count(); index++) await expect(busy.nth(index)).toBeDisabled();
        await expect(more).toBeDisabled();
        await expect(note).toBeDisabled();
        await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
        await expect(note).toHaveValue(draft);
        expect(requests).toHaveLength(failure === 'none' ? 1 : 2);
        await verifyDatabase(failure === 'response-lost');
      } finally { release(); }
      const response = await applied;
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, updated: 1, data: [expect.objectContaining({ id: row.id, status: initialStatus, legalHold: setting })] });
      await expect(more).toBeEnabled();
      await expect(holdNotice).toHaveCount(setting ? 1 : 0);
      await more.click();
      await expect(page.getByRole('button', { name: oppositeLabel, exact: true })).toBeEnabled();
      await expect(submit).toHaveCount(0);
      await more.click();
      await expect(note).toHaveValue(draft);
      expect(requests).toHaveLength(failure === 'none' ? 1 : 2);
      for (const request of requests) expect(request).toEqual({ ids: [row.id], action });
      await verifyDatabase(true);
      if (failure === 'response-lost') expect({ records: await readRecords(), audits: await readAudits() }).toEqual(priorRetry);
      await detail.getByRole('button', { name: 'Tüm geçmiş', exact: true }).click();
      await expect(detail.getByRole('heading', { name: historyTitle, exact: true })).toHaveCount(1);
      await capture(page, testInfo, `detail-${action.toLowerCase()}-${failure}-history`);
      await detail.getByRole('tab', { name: 'Genel bakış', exact: true }).click();
      await expect(note).toHaveValue(draft);
      // The open modal hides the underlying list from the accessibility tree.
      const underlyingList = page.getByRole('region', { name: 'Olay listesi', exact: true, includeHidden: true });
      await expect(underlyingList.getByRole('button', { name: row.title, exact: true, includeHidden: true })).toHaveCount(1);
      expect(pageErrors).toEqual([]);
    });
  }

  test(`detail legal hold ${setting ? 'enable' : 'release'}: overlapping retries share one protection transition`, async ({ page, fixtures, prisma }) => {
    const row = fixtures.manifest.rows.find(item => item.group === group && item.initialStatus === 'CLOSED')!;
    if (!setting) await prisma.alarmIncident.update({ where: { id: row.id }, data: { legalHold: true } });
    await signIn(page, fixtures);
    let release!: () => void;
    let notifyLocked!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const locked = new Promise<void>(resolve => { notifyLocked = resolve; });
    const blocker = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "alarm_incidents" WHERE "id" = ${row.id} FOR UPDATE`;
      notifyLocked(); await gate;
    }, { timeout: 20_000 });
    await locked;
    const body = { ids: [row.id], action };
    const responses = Promise.all([page.request.patch('/api/alarm-incidents', { data: body }), page.request.patch('/api/alarm-incidents', { data: body })]);
    try {
      await expect.poll(async () => {
        const waiting = await prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%alarm_incidents%'`;
        return waiting[0].count;
      }, { timeout: 10_000 }).toBe(2);
    } finally { release(); await blocker; }
    const replies = await responses;
    expect(replies.map(reply => reply.status())).toEqual([200, 200]);
    const bodies = await Promise.all(replies.map(reply => reply.json()));
    expect(bodies[0]).toMatchObject({ success: true, updated: 1, data: [expect.objectContaining({ id: row.id, status: 'CLOSED', legalHold: setting })] });
    expect(bodies[0]).toEqual(bodies[1]);
    const transitions = await prisma.alarmLifecycleTransition.findMany({ where: { incidentId: row.id, type: transitionType } });
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ actorId: fixtures.userId, fromStatus: 'CLOSED', toStatus: 'CLOSED' });
    expect(await prisma.auditLog.count({ where: { entityId: row.id, action: action.toLowerCase() } })).toBe(1);
  });
}
