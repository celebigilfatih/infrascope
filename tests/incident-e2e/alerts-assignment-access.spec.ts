import { expect } from '@playwright/test';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { test, signIn, capture } from './fixtures';
import { installTestSession } from './session-fixtures';
import { deferred } from './exclusion-fixtures';

for (const denial of ['expired', 'missing', 'inactive', 'revoked-role', 'viewer-session'] as const) {
  test(`detail assignment access: ${denial} preserves the chosen owner and rejects unauthorized writes`, async ({ page, context, fixtures, assignee, prisma }, testInfo) => {
    const rows = fixtures.manifest.rows.filter(item => item.group === 'resolve');
    const row = rows.find(item => item.initialStatus === 'OPEN')!;
    const selected = rows.filter(item => ['OPEN', 'ACKNOWLEDGED'].includes(item.initialStatus));
    const ids = fixtures.manifest.rows.map(item => item.id);
    const draft = `  ${fixtures.manifest.prefix} kaydedilmemiş not\nİnceleme devam ediyor.  `;
    // Start with an existing owner so denied changes must preserve a real assignment.
    await prisma.alarmIncident.update({ where: { id: row.id }, data: {
      assignedToId: fixtures.userId, assignedTo: 'Incident E2E Operator', assignedAt: new Date('2026-10-15T12:00:00Z'),
    } });
    const readRecords = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
      transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
    } });
    const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
    const before = { records: await readRecords(), audits: await readAudits() };
    const assignmentMetadata = { previousAssigneeId: fixtures.userId, previousAssigneeName: 'Incident E2E Operator', assigneeId: assignee.id, assigneeName: assignee.name };
    const verifyDatabase = async (applied = false) => {
      const records = await readRecords(); const audits = await readAudits();
      expect(records).toHaveLength(8);
      if (!applied) { expect({ records, audits }).toEqual(before); fixtures.verify('preview'); return; }
      for (const original of before.records) {
        const actual = records.find(item => item.id === original.id)!;
        if (original.id !== row.id) { expect(actual).toEqual(original); continue; }
        expect(actual).toMatchObject({ assignedToId: assignee.id, assignedTo: assignee.name });
        expect(actual.assignedAt).not.toBeNull(); expect(actual.assignedAt).not.toEqual(original.assignedAt);
        const history = actual.transitions.filter(item => item.type === 'ASSIGNED');
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({ actorType: 'USER', actorId: fixtures.userId, actorName: 'Incident E2E Operator',
          fromStatus: 'OPEN', toStatus: 'OPEN', reason: null, metadata: assignmentMetadata });
        expect({ ...actual, assignedToId: original.assignedToId, assignedTo: original.assignedTo, assignedAt: original.assignedAt,
          updatedAt: original.updatedAt, transitions: actual.transitions.filter(item => item.type !== 'ASSIGNED'),
        }).toEqual(original);
      }
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ entityId: row.id, entity: 'AlarmIncident', action: 'assign', userId: fixtures.userId,
        details: { fromStatus: 'OPEN', toStatus: 'OPEN', assignment: assignmentMetadata } });
    };
    const requests: Array<{ ids: string[]; action: string; assigneeId: string }> = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/alarm-incidents' && request.method() === 'PATCH') requests.push(request.postDataJSON());
    });
    await signIn(page, fixtures); const cookies = await context.cookies();
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
    const detail = page.getByRole('dialog'); const assignment = detail.getByRole('region', { name: 'Sorumlu atama', exact: true });
    const person = assignment.getByRole('combobox', { name: 'Sorumlu seçimi', exact: true });
    const submit = assignment.getByRole('button', { name: 'Atamayı kaydet', exact: true });
    const note = detail.getByRole('textbox', { name: 'Yeni operasyon notu', exact: true });
    const login = assignment.getByRole('link', { name: 'Yeni sekmede giriş yap', exact: true });
    const verifyDraft = async () => {
      await expect(detail).toBeVisible(); await expect(person).toHaveValue(assignee.id); await expect(note).toHaveValue(draft); await verifySelection();
    };
    await expect(person).toBeEnabled(); await expect(person).toHaveValue(fixtures.userId); await expect(submit).toBeDisabled();
    await note.fill(draft); await person.selectOption(assignee.id); await verifyDraft(); await verifyDatabase(); expect(requests).toHaveLength(0);
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
        ? 'Oturumunuzun süresi doldu veya oturumunuz geçersiz. Tekrar giriş yapın. Sorumlu seçiminiz bu pencerede korunuyor.'
        : 'Sorumlu değiştirme yetkiniz yok. Sorumlu seçiminiz korundu.';
      for (let attempt = 0; attempt < 2; attempt++) {
        const pending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
        await submit.click(); const response = await pending; expect(response.status()).toBe(status); expect(await response.json()).not.toHaveProperty('data');
        await expect(detail.getByRole('alert')).toHaveText(warning); await verifyDraft();
        await expect(person).toBeEnabled(); await expect(note).toBeEnabled(); await expect(submit).toBeEnabled();
        await expect(assignment.locator('p').first()).toHaveText('Incident E2E Operator');
        if (status === 401) {
          await expect(login).toHaveAttribute('href', '/login?next=%2Fdashboard%2Falerts'); await expect(login).toHaveAttribute('target', '_blank');
          await expect(detail.getByRole('link', { name: 'Yeni sekmede giriş yap', exact: true })).toHaveCount(1);
        } else await expect(login).toHaveCount(0);
        expect(requests).toHaveLength(attempt + 1); await verifyDatabase();
      }
      // Direct callers cannot bypass authorization to change, clear or validate an assignment.
      for (const assigneeId of [assignee.id, null, 'missing-assignee']) {
        const denied = await page.request.patch('/api/alarm-incidents', { data: { ids: [row.id], action: 'ASSIGN', assigneeId, actorName: 'Untrusted', assigneeName: 'Untrusted' } });
        expect(denied.status()).toBe(status); expect(await denied.json()).not.toHaveProperty('data');
      }
      const malformed = await page.request.patch('/api/alarm-incidents', { data: '{', headers: { 'content-type': 'application/json' } });
      expect(malformed.status()).toBe(status); await verifyDatabase(); await capture(page, testInfo, `assignment-access-${denial}-retained`);

      if (denial === 'expired') {
        const popup = context.waitForEvent('page'); await login.click(); const loginPage = await popup;
        try { await signIn(loginPage, fixtures); } finally { await loginPage.close(); }
      } else {
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR', status: 'ACTIVE' } }); await context.addCookies(cookies);
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
        await expect(assignment.getByRole('button', { name: 'Kaydediliyor…', exact: true })).toBeDisabled(); await expect(person).toBeDisabled(); await expect(note).toBeDisabled();
        await expect(login).toHaveCount(0); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
        await verifyDraft(); expect(requests).toHaveLength(3); await verifyDatabase();
      } finally { gate.resolve(); }
      const response = await pending; expect(response.status()).toBe(200); expect(await response.json()).toMatchObject({ success: true, updated: 1 });
      await expect(assignment.locator('p').first()).toHaveText(assignee.name); await expect(submit).toBeDisabled();
      await verifyDraft(); await verifyDatabase(true); expect(requests).toHaveLength(3);
      for (const body of requests) expect(body).toEqual({ ids: [row.id], action: 'ASSIGN', assigneeId: assignee.id });
      const committed = { records: await readRecords(), audits: await readAudits() };
      const replays = await Promise.all([page.request.patch('/api/alarm-incidents', { data: requests[2] }), page.request.patch('/api/alarm-incidents', { data: requests[2] })]);
      expect(replays.map(reply => reply.status())).toEqual([200, 200]); expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
      // A prior successful assignment does not bypass a later role revocation.
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
      for (const assigneeId of [assignee.id, null]) {
        const denied = await page.request.patch('/api/alarm-incidents', { data: { ...requests[2], assigneeId } }); expect(denied.status()).toBe(403);
      }
      expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
      await detail.getByRole('button', { name: 'Tüm geçmiş', exact: true }).click();
      await expect(detail.getByRole('heading', { name: 'Sorumlu güncellendi', exact: true })).toHaveCount(1);
      await expect(detail.getByText(`Incident E2E Operator → ${assignee.name} · Incident E2E Operator`, { exact: true })).toBeVisible();
      await capture(page, testInfo, `assignment-access-${denial}-history`);
      await detail.getByRole('tab', { name: 'Genel bakış', exact: true }).click(); await verifyDraft(); expect(errors).toEqual([]);
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); await context.addCookies(cookies);
    }
  });
}

test('detail assignment access: read-only users cannot change an existing owner through the form or API', async ({ page, context, fixtures, assignee, prisma }, testInfo) => {
  const row = fixtures.manifest.rows.find(item => item.group === 'resolve' && item.initialStatus === 'OPEN')!;
  const ids = fixtures.manifest.rows.map(item => item.id);
  await prisma.alarmIncident.update({ where: { id: row.id }, data: {
    assignedToId: fixtures.userId, assignedTo: 'Incident E2E Operator', assignedAt: new Date('2026-10-15T12:00:00Z'),
  } });
  const readRecords = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
    transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
  } });
  const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
  const before = { records: await readRecords(), audits: await readAudits() }; let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/alarm-incidents' && request.method() === 'PATCH') requests++; });
  await signIn(page, fixtures); const cookies = await context.cookies();
  const filtered = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && new URL(reply.url()).searchParams.get('search') === `${fixtures.manifest.prefix}-resolve`);
  await page.goto(`/dashboard/alerts?search=${fixtures.manifest.prefix}-resolve`); expect((await filtered).status()).toBe(200);
  try {
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } }); await installTestSession(context, fixtures, 'VIEWER');
    const people = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents/assignees' && !new URL(reply.url()).searchParams.has('scope'));
    await page.getByRole('button', { name: row.title, exact: true }).click(); expect(await (await people).json()).toMatchObject({ canManage: false });
    const detail = page.getByRole('dialog'); const assignment = detail.getByRole('region', { name: 'Sorumlu atama', exact: true });
    const person = assignment.getByRole('combobox', { name: 'Sorumlu seçimi', exact: true }); const submit = assignment.getByRole('button', { name: 'Atamayı kaydet', exact: true });
    await expect(person).toHaveValue(fixtures.userId); await expect(person).toBeDisabled(); await expect(submit).toBeDisabled();
    await expect(assignment).toContainText('Yalnızca yönetici ve editörler atama yapabilir.'); await submit.click({ force: true }); expect(requests).toBe(0);
    for (const assigneeId of [assignee.id, null]) {
      const denied = await page.request.patch('/api/alarm-incidents', { data: { ids: [row.id], action: 'ASSIGN', assigneeId } }); expect(denied.status()).toBe(403);
    }
    expect({ records: await readRecords(), audits: await readAudits() }).toEqual(before); fixtures.verify('preview'); await capture(page, testInfo, 'assignment-access-read-only');
    await detail.getByRole('button', { name: 'Detayı kapat', exact: true }).click(); await expect(detail).toHaveCount(0);
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR' } }); await context.addCookies(cookies);
    await page.getByRole('button', { name: row.title, exact: true }).click(); await expect(person).toBeEnabled(); await expect(person).toHaveValue(fixtures.userId);
    await person.selectOption(assignee.id); await expect(submit).toBeEnabled(); expect(requests).toBe(0);
    expect({ records: await readRecords(), audits: await readAudits() }).toEqual(before);
  } finally {
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); await context.addCookies(cookies);
  }
});
