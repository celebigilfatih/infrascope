import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test, signIn, capture } from './fixtures';

for (const failure of ['none', 'api-error', 'offline', 'response-lost'] as const) {
  test(`operation note: ${failure} retains draft and retries create one note`, async ({ page, context, fixtures, prisma }, testInfo) => {
    const row = fixtures.manifest.rows.find(item => item.group === 'resolve' && item.initialStatus === 'OPEN')!;
    const ids = fixtures.manifest.rows.map(item => item.id);
    const text = `${fixtures.manifest.prefix} inceleme notu\nBağlantı kontrolü <tamamlandı>.`;
    const draft = `  ${text}  `;
    const readRecords = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
      transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
    } });
    const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
    const before = await readRecords();
    expect(before).toHaveLength(8);
    expect(await readAudits()).toEqual([]);
    const verifyDatabase = async (count: number) => {
      const records = await readRecords();
      const audits = await readAudits();
      expect(records).toHaveLength(before.length);
      expect(audits).toHaveLength(count);
      for (const original of before) {
        const actual = records.find(item => item.id === original.id)!;
        if (original.id !== row.id || count === 0) { expect(actual).toEqual(original); continue; }
        const notes = actual.transitions.filter(item => item.type === 'NOTE_ADDED');
        expect(notes).toHaveLength(count);
        expect(new Set(notes.map(item => item.requestId)).size).toBe(count);
        for (const note of notes) {
          expect(note).toMatchObject({ reason: text, actorId: fixtures.userId, actorName: 'Incident E2E Operator', actorType: 'USER', fromStatus: 'OPEN', toStatus: 'OPEN' });
          expect(note.requestId).toMatch(/^[0-9a-f-]{36}$/);
        }
        expect({ ...actual, updatedAt: original.updatedAt, transitions: actual.transitions.filter(item => item.type !== 'NOTE_ADDED') }).toEqual(original);
      }
      for (const audit of audits) expect(audit).toMatchObject({ entityId: row.id, entity: 'AlarmIncident', action: 'add_note', userId: fixtures.userId, details: { fromStatus: 'OPEN', toStatus: 'OPEN', reason: text } });
    };
    const requests: Array<{ ids: string[]; action: string; reason: string; requestId: string }> = [];
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
    const notes = detail.getByRole('region', { name: 'Operasyon notları', exact: true });
    const editor = notes.getByRole('textbox', { name: 'Yeni operasyon notu', exact: true });
    const submit = notes.getByRole('button', { name: 'Not ekle', exact: true });
    await expect(editor).toBeEnabled();
    await expect(submit).toBeDisabled();
    await editor.fill('  \n ');
    await expect(submit).toBeDisabled();
    await editor.fill(draft);
    fixtures.verify('preview');

    if (failure !== 'none') {
      if (failure === 'offline') await context.setOffline(true);
      else {
        let faultInjected = false;
        await page.route('**/api/alarm-incidents', async route => {
          if (route.request().method() !== 'PATCH' || faultInjected) return route.continue();
          faultInjected = true;
          if (failure === 'api-error') await route.fulfill({ status: 500, json: { success: false, error: 'Regresyon: geçici not API hatası.' } });
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
        if (failure === 'api-error') await expect(detail.getByRole('alert')).toContainText('Regresyon: geçici not API hatası.');
        await expect(editor).toHaveValue(draft);
        await expect(submit).toBeEnabled();
        expect(requests).toHaveLength(1);
        await verifyDatabase(failure === 'response-lost' ? 1 : 0);
        await capture(page, testInfo, `note-${failure}-retained`);
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
      await expect(notes.getByRole('button', { name: 'Kaydediliyor…', exact: true })).toBeDisabled();
      await expect(editor).toBeDisabled();
      await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
      await expect(editor).toHaveValue(draft);
      expect(requests).toHaveLength(failure === 'none' ? 1 : 2);
      await verifyDatabase(failure === 'response-lost' ? 1 : 0);
    } finally { release(); }
    const response = await applied;
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, updated: 1 });
    await expect(editor).toHaveValue('');
    await expect(submit).toBeDisabled();
    expect(requests).toHaveLength(failure === 'none' ? 1 : 2);
    for (const request of requests) expect(request).toEqual({ ids: [row.id], action: 'ADD_NOTE', reason: text, requestId: requests[0].requestId });
    await verifyDatabase(1);
    if (failure === 'response-lost') expect({ records: await readRecords(), audits: await readAudits() }).toEqual(priorRetry);

    // A new intentional submission of identical text must get a new key and remain allowed.
    if (failure === 'none') {
      await expect(editor).toBeEnabled();
      await editor.fill(draft);
      const second = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
      await submit.click(); expect((await second).status()).toBe(200);
      await expect(editor).toHaveValue('');
      expect(requests).toHaveLength(2);
      expect(requests[1].requestId).not.toBe(requests[0].requestId);
      await verifyDatabase(2);
    }
    await notes.getByRole('button', { name: 'Not geçmişi', exact: true }).click();
    const count = failure === 'none' ? 2 : 1;
    await expect(detail.getByRole('heading', { name: 'Operasyon notu eklendi', exact: true })).toHaveCount(count);
    await expect(detail.getByText(text, { exact: true })).toHaveCount(count);
    await capture(page, testInfo, `note-${failure}-history`);
    expect(pageErrors).toEqual([]);
  });
}

test('operation note: overlapping replays share one durable note and audit', async ({ page, fixtures, prisma }) => {
  const row = fixtures.manifest.rows.find(item => item.group === 'resolve' && item.initialStatus === 'OPEN')!;
  await signIn(page, fixtures);
  const body = { ids: [row.id], action: 'ADD_NOTE', reason: 'Eşzamanlı tekrar deneme', requestId: randomUUID() };
  const responses = await Promise.all([page.request.patch('/api/alarm-incidents', { data: body }), page.request.patch('/api/alarm-incidents', { data: body })]);
  expect(responses.map(reply => reply.status())).toEqual([200, 200]);
  const notes = await prisma.alarmLifecycleTransition.findMany({ where: { incidentId: row.id, type: 'NOTE_ADDED' } });
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ requestId: body.requestId, reason: body.reason, actorId: fixtures.userId });
  expect(await prisma.auditLog.count({ where: { entityId: row.id, action: 'add_note' } })).toBe(1);
});
