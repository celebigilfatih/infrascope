import { expect } from '@playwright/test';
import { test, signIn, capture } from './fixtures';
import { deferred } from './exclusion-fixtures';

const action = 'ACKNOWLEDGE';
const targetStatus = 'ACKNOWLEDGED';
const transitionType = 'ACKNOWLEDGED';
for (const failure of ['none', 'api-error', 'offline', 'connection-reset', 'response-lost', 'partial-response-lost'] as const) {
  test(`bulk acknowledge: ${failure} retains selection and retries without duplicate approvals/history`, async ({ page, context, fixtures, prisma }, testInfo) => {
    const rows = fixtures.manifest.rows;
    const selected = rows.filter(item => item.group === 'resolve' || item.initialStatus === 'OPEN');
    const eligible = selected.filter(item => item.initialStatus === 'OPEN');
    const eligibleIds = eligible.map(item => item.id).sort();
    const ids = rows.map(item => item.id);
    const readRecords = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
      transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
    } });
    const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
    const before = { records: await readRecords(), audits: await readAudits() };
    const verifyDatabase = async (appliedIds: string[] = []) => {
      const records = await readRecords(); const audits = await readAudits();
      expect(records).toHaveLength(8);
      if (appliedIds.length === 0) { expect({ records, audits }).toEqual(before); fixtures.verify('preview'); return; }
      for (const original of before.records) {
        const actual = records.find(item => item.id === original.id)!;
        if (!appliedIds.includes(original.id)) { expect(actual).toEqual(original); continue; }
        expect(actual.status).toBe(targetStatus);
        expect(actual.transitions).toHaveLength(original.transitions.length + 1);
        const transitions = actual.transitions.filter(item => item.type === transitionType);
        expect(transitions).toHaveLength(1);
        expect(transitions[0]).toMatchObject({ fromStatus: original.status, toStatus: targetStatus, actorType: 'USER', actorId: fixtures.userId, actorName: 'Incident E2E Operator', reason: null });
        expect(actual.acknowledgedAt).not.toBeNull();
        expect(actual).toMatchObject({ acknowledgedById: fixtures.userId, acknowledgedBy: 'Incident E2E Operator' });
        for (const occurrence of actual.occurrences) {
          expect(occurrence).toMatchObject({ acknowledged: true, acknowledgedBy: 'Incident E2E Operator' }); expect(occurrence.acknowledgedAt).not.toBeNull();
        }
        expect({ ...actual, status: original.status, updatedAt: original.updatedAt,
          transitions: actual.transitions.filter(item => item.type !== transitionType),
          occurrences: actual.occurrences.map(occurrence => {
            const previous = original.occurrences.find(item => item.id === occurrence.id)!;
            return { ...occurrence, acknowledged: previous.acknowledged, acknowledgedAt: previous.acknowledgedAt, acknowledgedBy: previous.acknowledgedBy };
          }),
          acknowledgedAt: original.acknowledgedAt, acknowledgedById: original.acknowledgedById, acknowledgedBy: original.acknowledgedBy,
        }).toEqual(original);
      }
      expect(audits).toHaveLength(appliedIds.length);
      for (const item of eligible.filter(item => appliedIds.includes(item.id))) expect(audits.filter(audit => audit.entityId === item.id)).toEqual([expect.objectContaining({ entityId: item.id, entity: 'AlarmIncident', action: 'acknowledge', userId: fixtures.userId,
        details: { fromStatus: 'OPEN', toStatus: targetStatus } })]);
    };


    const requests: Array<{ ids: string[]; action: string }> = []; const errors: string[] = []; let reads = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname !== '/api/alarm-incidents') return;
      if (request.method() === 'PATCH') requests.push(request.postDataJSON());
      if (request.method() === 'GET') reads++;
    });
    await signIn(page, fixtures);
    const filtered = page.waitForResponse(reply => {
      const url = new URL(reply.url()); return reply.request().method() === 'GET' && url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === fixtures.manifest.prefix && !url.searchParams.has('status');
    });
    await page.goto(`/dashboard/alerts?status=all&search=${fixtures.manifest.prefix}`); expect((await filtered).status()).toBe(200);
    const list = page.getByRole('region', { name: 'Olay listesi', exact: true });
    await expect(list.getByRole('checkbox')).toHaveCount(9);
    const rowFor = (title: string) => list.getByRole('row').filter({ has: page.getByRole('button', { name: title, exact: true }) });
    const checkbox = (title: string) => rowFor(title).getByRole('checkbox');
    for (const item of selected) await checkbox(item.title).check();
    const toolbar = list.getByRole('region', { name: 'Toplu olay işlemleri', exact: true });
    const submit = toolbar.getByRole('button', { name: 'Açık olanları onayla (2)', exact: true });
    const verifySelection = async () => {
      await expect(toolbar).toBeVisible(); await expect(toolbar).toContainText('5 seçili');
      for (const item of rows) await expect(checkbox(item.title)).toBeChecked({ checked: selected.some(chosen => chosen.id === item.id) });
      for (const item of eligible) await expect(rowFor(item.title).getByText('Açık', { exact: true })).toBeVisible();
    };
    await verifySelection(); await expect(submit).toBeEnabled(); await verifyDatabase();
    let appliedBeforeRetry: string[] = [];
    if (failure !== 'none') {
      if (failure === 'offline') await context.setOffline(true);
      else {
        let injected = false;
        await page.route('**/api/alarm-incidents', async route => {
          if (route.request().method() !== 'PATCH' || injected) return route.continue();
          injected = true;
          if (failure === 'api-error') return route.fulfill({ status: 500, json: { success: false, error: 'Regresyon: geçici toplu onaylama API hatası.' } });
          if (failure === 'connection-reset') return route.abort('connectionreset');
          const body = route.request().postDataJSON() as { ids: string[]; action: string };
          const committedIds = failure === 'partial-response-lost' ? [body.ids[0]] : body.ids;
          const committed = await route.fetch({ maxRetries: 0, postData: JSON.stringify({ ...body, ids: committedIds }) });
          expect(committed.status()).toBe(200);
          expect(await committed.json()).toMatchObject({ success: true, updated: committedIds.length });
          appliedBeforeRetry = [...committedIds];
          await route.abort('connectionreset');
        });
      }
      const priorReads = reads;
      try {
        await submit.click();
        await expect(page.getByRole('alert').filter({ hasText: 'Olay seçiminiz korundu; tekrar deneyebilirsiniz.' })).toBeVisible();
        if (failure === 'api-error') await expect(page.getByRole('alert').filter({ hasText: 'Olay seçiminiz korundu; tekrar deneyebilirsiniz.' })).toContainText('Regresyon: geçici toplu onaylama API hatası.');
        await expect(submit).toBeEnabled(); await verifySelection(); await verifyDatabase(appliedBeforeRetry);
        expect(requests).toHaveLength(1); expect(reads).toBe(priorReads);
        await capture(page, testInfo, `bulk-acknowledge-${failure}-retained`);
      } finally { await context.setOffline(false); }
      await verifySelection();
    }
    const beforeRetry = { records: await readRecords(), audits: await readAudits() };
    const gate = deferred(); const started = deferred();
    await page.route('**/api/alarm-incidents', async route => {
      if (route.request().method() !== 'PATCH') return route.continue();
      started.resolve(); await gate.promise; await route.continue();
    });
    const pending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
    try {
      await submit.click(); await started.promise; await expect(submit).toBeDisabled();
      await expect(toolbar.getByRole('button', { name: 'Seçimi temizle', exact: true })).toBeDisabled();
      await expect(toolbar.getByRole('button', { name: 'Sorumlu ata', exact: true })).toBeDisabled();
      for (const item of rows) await expect(checkbox(item.title)).toBeDisabled();
      await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
      expect(requests).toHaveLength(failure === 'none' ? 1 : 2); await verifySelection(); await verifyDatabase(appliedBeforeRetry);
    } finally { gate.resolve(); }
    const response = await pending; expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, updated: 2, data: expect.arrayContaining(eligible.map(item => expect.objectContaining({ id: item.id, status: targetStatus }))) });
    await expect(toolbar).toHaveCount(0); await verifyDatabase(eligibleIds);
    expect(requests).toHaveLength(failure === 'none' ? 1 : 2);
    for (const body of requests) expect({ ...body, ids: [...body.ids].sort() }).toEqual({ ids: eligibleIds, action });
    const committed = { records: await readRecords(), audits: await readAudits() };
    for (const id of appliedBeforeRetry) {
      expect(committed.records.find(item => item.id === id)).toEqual(beforeRetry.records.find(item => item.id === id));
      expect(committed.audits.filter(item => item.entityId === id)).toEqual(beforeRetry.audits.filter(item => item.entityId === id));
    }
    if (failure === 'response-lost') expect(committed).toEqual(beforeRetry);
    const replays = await Promise.all([page.request.patch('/api/alarm-incidents', { data: requests[requests.length - 1] }), page.request.patch('/api/alarm-incidents', { data: requests[requests.length - 1] })]);
    expect(replays.map(reply => reply.status())).toEqual([200, 200]); expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
    for (const item of eligible) {
      await expect(rowFor(item.title).getByText('Onaylandı', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: item.title, exact: true }).click();
      const detail = page.getByRole('dialog', { name: item.title, exact: true });
      await detail.getByRole('button', { name: 'Tüm geçmiş', exact: true }).click();
      await expect(detail.getByRole('heading', { name: 'Olay onaylandı', exact: true })).toHaveCount(1);
      await capture(page, testInfo, `bulk-acknowledge-${failure}-${item.group}-history`);
      await detail.getByRole('button', { name: 'Detayı kapat', exact: true }).click(); await expect(detail).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}
