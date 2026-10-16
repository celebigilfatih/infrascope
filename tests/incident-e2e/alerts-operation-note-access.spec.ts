import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { test, signIn, capture } from './fixtures';
import { installTestSession } from './session-fixtures';
import { deferred } from './exclusion-fixtures';

for (const denial of ['expired', 'missing', 'inactive', 'revoked-role', 'viewer-session'] as const) {
  test(`operation note access: ${denial} preserves the draft and rejects unauthorized writes`, async ({ page, context, fixtures, prisma }, testInfo) => {
    const rows = fixtures.manifest.rows.filter(item => item.group === 'resolve');
    const row = rows.find(item => item.initialStatus === 'OPEN')!;
    const selected = rows.filter(item => ['OPEN', 'ACKNOWLEDGED'].includes(item.initialStatus));
    const ids = fixtures.manifest.rows.map(item => item.id);
    let draft = `  ${fixtures.manifest.prefix} inceleme notu\nKaynak kontrolü <tamamlandı>.  `;
    const initialDraft = draft;
    const readRecords = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
      transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
    } });
    const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
    const before = { records: await readRecords(), audits: await readAudits() };
    const verifyDatabase = async (applied = false) => {
      const records = await readRecords(); const audits = await readAudits();
      if (!applied) {
        expect({ records, audits }).toEqual(before); fixtures.verify('preview'); return;
      }
      for (const original of before.records) {
        const actual = records.find(item => item.id === original.id)!;
        if (original.id !== row.id) { expect(actual).toEqual(original); continue; }
        const notes = actual.transitions.filter(item => item.type === 'NOTE_ADDED');
        expect(notes).toHaveLength(1);
        expect(notes[0]).toMatchObject({ reason: draft.trim(), requestId: requests[2].requestId, actorId: fixtures.userId,
          actorName: 'Incident E2E Operator', actorType: 'USER', fromStatus: 'OPEN', toStatus: 'OPEN' });
        expect({ ...actual, updatedAt: original.updatedAt, transitions: actual.transitions.filter(item => item.type !== 'NOTE_ADDED') }).toEqual(original);
      }
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ entityId: row.id, entity: 'AlarmIncident', action: 'add_note', userId: fixtures.userId,
        details: { fromStatus: 'OPEN', toStatus: 'OPEN', reason: draft.trim() } });
    };
    const requests: Array<{ ids: string[]; action: string; reason: string; requestId: string }> = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/alarm-incidents' && request.method() === 'PATCH') requests.push(request.postDataJSON());
    });
    await signIn(page, fixtures);
    const cookies = await context.cookies();
    const filtered = page.waitForResponse(reply => {
      const url = new URL(reply.url());
      return url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-resolve` && !url.searchParams.has('status');
    });
    await page.goto(`/dashboard/alerts?status=all&search=${fixtures.manifest.prefix}-resolve`); expect((await filtered).status()).toBe(200);
    const list = page.getByRole('region', { name: 'Olay listesi', exact: true, includeHidden: true });
    await expect(list.getByRole('checkbox')).toHaveCount(5);
    const checkbox = (title: string) => list.getByRole('row', { includeHidden: true }).filter({ has: page.getByRole('button', { name: title, exact: true, includeHidden: true }) }).getByRole('checkbox', { includeHidden: true });
    for (const item of selected) await checkbox(item.title).check();
    const verifySelection = async () => {
      for (const item of rows) {
        if (selected.some(chosen => chosen.id === item.id)) await expect(checkbox(item.title)).toBeChecked();
        else await expect(checkbox(item.title)).not.toBeChecked();
      }
    };
    await page.getByRole('button', { name: row.title, exact: true }).click();
    const detail = page.getByRole('dialog');
    const notes = detail.getByRole('region', { name: 'Operasyon notları', exact: true });
    const editor = notes.getByRole('textbox', { name: 'Yeni operasyon notu', exact: true });
    const submit = notes.getByRole('button', { name: 'Not ekle', exact: true });
    const login = notes.getByRole('link', { name: 'Yeni sekmede giriş yap', exact: true });
    const verifyDraft = async () => {
      await expect(detail).toBeVisible(); await expect(editor).toHaveValue(draft); await verifySelection();
    };
    await expect(editor).toBeEnabled(); await editor.fill(draft); await verifyDraft(); await verifyDatabase();
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
        ? 'Oturumunuzun süresi doldu veya oturumunuz geçersiz. Tekrar giriş yapın. Not taslağınız bu pencerede korunuyor.'
        : 'Operasyon notu ekleme yetkiniz yok. Not taslağınız korundu.';
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt === 2) { draft += '\nEk inceleme notu.'; await editor.fill(draft); }
        const pending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
        await submit.click(); const response = await pending;
        expect(response.status()).toBe(status); expect(await response.json()).not.toHaveProperty('data');
        await expect(detail.getByRole('alert')).toHaveText(warning); await verifyDraft();
        await expect(editor).toBeEnabled(); await expect(submit).toBeEnabled();
        if (status === 401) {
          await expect(login).toHaveAttribute('href', '/login?next=%2Fdashboard%2Falerts'); await expect(login).toHaveAttribute('target', '_blank');
        } else await expect(login).toHaveCount(0);
        expect(requests).toHaveLength(attempt + 1); await verifyDatabase();
      }
      expect(requests[0]).toEqual({ ids: [row.id], action: 'ADD_NOTE', reason: initialDraft.trim(), requestId: requests[0].requestId });
      expect(requests[0].requestId).toMatch(/^[0-9a-f-]{36}$/); expect(requests[1]).toEqual(requests[0]);
      expect(requests[2].requestId).not.toBe(requests[0].requestId);
      expect(requests[2]).toEqual({ ids: [row.id], action: 'ADD_NOTE', reason: draft.trim(), requestId: requests[2].requestId });
      // Bypassing the form, changing the key or supplying malformed JSON cannot write a note.
      for (const requestId of [requests[2].requestId, randomUUID()]) {
        const denied = await page.request.patch('/api/alarm-incidents', { data: { ...requests[2], requestId } });
        expect(denied.status()).toBe(status); expect(await denied.json()).not.toHaveProperty('data');
      }
      const malformed = await page.request.patch('/api/alarm-incidents', { data: '{', headers: { 'content-type': 'application/json' } });
      expect(malformed.status()).toBe(status); await verifyDatabase();
      await capture(page, testInfo, `note-access-${denial}-retained`);

      if (denial === 'expired') {
        const popup = context.waitForEvent('page'); await login.click(); const loginPage = await popup;
        try { await signIn(loginPage, fixtures); } finally { await loginPage.close(); }
      } else {
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR', status: 'ACTIVE' } });
        await context.addCookies(cookies);
      }
      await verifyDraft(); await verifyDatabase();
      const gate = deferred(); const started = deferred();
      await page.route('**/api/alarm-incidents', async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        started.resolve(); await gate.promise; await route.continue();
      });
      const pending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
      try {
        await submit.click(); await started.promise;
        await expect(notes.getByRole('button', { name: 'Kaydediliyor…', exact: true })).toBeDisabled(); await expect(editor).toBeDisabled();
        await expect(login).toHaveCount(0); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
        await verifyDraft(); expect(requests).toHaveLength(4); await verifyDatabase();
      } finally { gate.resolve(); }
      const response = await pending; expect(response.status()).toBe(200); expect(await response.json()).toMatchObject({ success: true, updated: 1 });
      await expect(editor).toHaveValue(''); await expect(submit).toBeDisabled(); expect(requests).toHaveLength(4);
      expect(requests[3]).toEqual(requests[2]); await verifyDatabase(true); await verifySelection();

      const committed = { records: await readRecords(), audits: await readAudits() };
      const replays = await Promise.all([page.request.patch('/api/alarm-incidents', { data: requests[3] }), page.request.patch('/api/alarm-incidents', { data: requests[3] })]);
      expect(replays.map(reply => reply.status())).toEqual([200, 200]);
      expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
      // Authorization is still checked before looking up a previously committed request key.
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
      const deniedReplay = await page.request.patch('/api/alarm-incidents', { data: requests[3] }); expect(deniedReplay.status()).toBe(403);
      expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
      await notes.getByRole('button', { name: 'Not geçmişi', exact: true }).click();
      await expect(detail.getByRole('heading', { name: 'Operasyon notu eklendi', exact: true })).toHaveCount(1);
      await expect(detail.getByText(draft.trim(), { exact: true })).toHaveCount(1);
      await capture(page, testInfo, `note-access-${denial}-history`); expect(errors).toEqual([]);
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } });
      await context.addCookies(cookies);
    }
  });
}

test('operation note access: read-only users cannot submit a note from the detail or directly', async ({ page, context, fixtures, prisma }, testInfo) => {
  const row = fixtures.manifest.rows.find(item => item.group === 'resolve' && item.initialStatus === 'OPEN')!;
  const ids = fixtures.manifest.rows.map(item => item.id);
  const readRecords = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
    transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
  } });
  const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
  const before = { records: await readRecords(), audits: await readAudits() };
  let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/alarm-incidents' && request.method() === 'PATCH') requests++; });
  await signIn(page, fixtures); const cookies = await context.cookies();
  const filtered = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && new URL(reply.url()).searchParams.get('search') === `${fixtures.manifest.prefix}-resolve`);
  await page.goto(`/dashboard/alerts?search=${fixtures.manifest.prefix}-resolve`); expect((await filtered).status()).toBe(200);
  try {
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } }); await installTestSession(context, fixtures, 'VIEWER');
    const people = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents/assignees' && !new URL(reply.url()).searchParams.has('scope'));
    await page.getByRole('button', { name: row.title, exact: true }).click();
    expect(await (await people).json()).toMatchObject({ canManage: false });
    const detail = page.getByRole('dialog'); const notes = detail.getByRole('region', { name: 'Operasyon notları', exact: true });
    const editor = notes.getByRole('textbox', { name: 'Yeni operasyon notu', exact: true }); const submit = notes.getByRole('button', { name: 'Not ekle', exact: true });
    await expect(editor).toBeDisabled(); await expect(submit).toBeDisabled();
    await expect(notes).toContainText('Not eklemek için yönetici veya editör yetkisi gerekiyor.');
    await submit.click({ force: true }); expect(requests).toBe(0);
    const denied = await page.request.patch('/api/alarm-incidents', { data: { ids: [row.id], action: 'ADD_NOTE', reason: 'Yetkisiz not', requestId: randomUUID() } });
    expect(denied.status()).toBe(403); expect({ records: await readRecords(), audits: await readAudits() }).toEqual(before); fixtures.verify('preview');
    await capture(page, testInfo, 'note-access-read-only');
    await detail.getByRole('button', { name: 'Detayı kapat', exact: true }).click(); await expect(detail).toHaveCount(0);
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR' } }); await context.addCookies(cookies);
    await page.getByRole('button', { name: row.title, exact: true }).click(); await expect(editor).toBeEnabled(); await expect(editor).toHaveValue('');
    expect(requests).toBe(0);
  } finally {
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); await context.addCookies(cookies);
  }
});
