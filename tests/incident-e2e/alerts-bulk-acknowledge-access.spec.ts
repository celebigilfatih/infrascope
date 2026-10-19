import { expect } from '@playwright/test';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { test, signIn, capture } from './fixtures';
import { installTestSession } from './session-fixtures';
import { deferred } from './exclusion-fixtures';

const action = 'ACKNOWLEDGE';
const targetStatus = 'ACKNOWLEDGED';
const transitionType = 'ACKNOWLEDGED';
for (const denial of ['expired', 'missing', 'inactive', 'revoked-role', 'viewer-session', 'initial-viewer'] as const) {
  test(`bulk acknowledge access: ${denial} retains selection and rejects unauthorized status/history writes`, async ({ page, context, fixtures, prisma }, testInfo) => {
    const rows = fixtures.manifest.rows;
    const selected = rows.filter(item => item.group === 'resolve' || item.initialStatus === 'OPEN');
    const eligible = selected.filter(item => item.initialStatus === 'OPEN');
    const ids = rows.map(item => item.id);
    const readRecords = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
      transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
    } });
    const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
    const before = { records: await readRecords(), audits: await readAudits() };
    const verifyDatabase = async (applied = false) => {
      const records = await readRecords(); const audits = await readAudits();
      expect(records).toHaveLength(8);
      if (!applied) { expect({ records, audits }).toEqual(before); fixtures.verify('preview'); return; }
      for (const original of before.records) {
        const actual = records.find(item => item.id === original.id)!;
        if (!eligible.some(item => item.id === original.id)) { expect(actual).toEqual(original); continue; }
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
      expect(audits).toHaveLength(eligible.length);
      for (const item of eligible) expect(audits.filter(audit => audit.entityId === item.id)).toEqual([expect.objectContaining({ entityId: item.id, entity: 'AlarmIncident', action: 'acknowledge', userId: fixtures.userId,
        details: { fromStatus: 'OPEN', toStatus: targetStatus } })]);
    };

    const requests: Array<{ ids: string[]; action: string }> = []; const errors: string[] = []; let reads = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname !== '/api/alarm-incidents') return;
      if (request.method() === 'PATCH') requests.push(request.postDataJSON());
      if (request.method() === 'GET') reads++;
    });
    await signIn(page, fixtures); const cookies = await context.cookies();
    try {
      if (denial === 'initial-viewer') {
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
        await installTestSession(context, fixtures, 'VIEWER');
      }
      const filtered = page.waitForResponse(reply => {
        const url = new URL(reply.url()); return reply.request().method() === 'GET' && url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === fixtures.manifest.prefix && !url.searchParams.has('status');
      });
      await page.goto(`/dashboard/alerts?status=all&search=${fixtures.manifest.prefix}`); expect((await filtered).status()).toBe(200);
      const list = page.getByRole('region', { name: 'Olay listesi', exact: true });
      await expect(list.getByRole('checkbox')).toHaveCount(9);
      const checkbox = (title: string) => list.getByRole('row').filter({ has: page.getByRole('button', { name: title, exact: true }) }).getByRole('checkbox');
      for (const item of selected) await checkbox(item.title).check();
      const toolbar = list.getByRole('region', { name: 'Toplu olay işlemleri', exact: true });
      const submit = toolbar.getByRole('button', { name: 'Açık olanları onayla (2)', exact: true });
      const login = page.getByRole('link', { name: 'Yeni sekmede giriş yap', exact: true });
      const verifySelection = async () => {
        await expect(toolbar).toBeVisible(); await expect(toolbar).toContainText('5 seçili');
        for (const item of rows) await expect(checkbox(item.title)).toBeChecked({ checked: selected.some(chosen => chosen.id === item.id) });
      };
      await verifySelection(); await expect(submit).toBeEnabled(); await verifyDatabase();
      if (denial === 'expired') await installTestSession(context, fixtures, 'ADMIN', true);
      else if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
      else if (denial === 'inactive') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: 'INACTIVE' } });
      else {
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
        if (denial === 'viewer-session') await installTestSession(context, fixtures, 'VIEWER');
      }
      const status = ['expired', 'missing', 'inactive'].includes(denial) ? 401 : 403;
      const warning = status === 401
        ? 'Oturumunuzun süresi doldu veya oturumunuz geçersiz. Tekrar giriş yapın. Olay seçiminiz bu sayfada korunuyor.'
        : 'Seçili olayları onaylama yetkiniz yok. Onay durumları değiştirilmedi; olay seçiminiz korundu.';
      for (let attempt = 0; attempt < 2; attempt++) {
        const beforeReads = reads;
        const pending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
        await submit.click(); const response = await pending;
        expect(response.status()).toBe(status); expect(await response.json()).not.toHaveProperty('data');
        await expect(page.getByRole('alert').getByText(warning, { exact: true })).toBeVisible();
        await expect(submit).toBeEnabled(); await verifySelection(); await verifyDatabase();
        expect(reads).toBe(beforeReads); expect(requests).toHaveLength(attempt + 1);
        if (status === 401) { await expect(login).toHaveCount(1); await expect(login).toHaveAttribute('href', '/login?next=%2Fdashboard%2Falerts'); await expect(login).toHaveAttribute('target', '_blank'); }
        else await expect(login).toHaveCount(0);
      }
      const denied = await page.request.patch('/api/alarm-incidents', { data: { ids: selected.map(item => item.id), action, actorName: 'Untrusted' } });
      expect(denied.status()).toBe(status); expect(await denied.json()).not.toHaveProperty('data');
      const malformed = await page.request.patch('/api/alarm-incidents', { data: '{', headers: { 'content-type': 'application/json' } });
      expect(malformed.status()).toBe(status); await verifyDatabase(); await capture(page, testInfo, `bulk-acknowledge-access-${denial}-retained`);
      if (denial === 'expired') {
        const popup = context.waitForEvent('page'); await login.click(); const loginPage = await popup;
        try { await signIn(loginPage, fixtures); } finally { await loginPage.close(); }
      } else {
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR', status: 'ACTIVE' } }); await context.addCookies(cookies);
      }
      await verifySelection(); await expect(submit).toBeEnabled(); await verifyDatabase();
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
        expect(requests).toHaveLength(3); await verifySelection(); await verifyDatabase(); await expect(login).toHaveCount(0);
      } finally { gate.resolve(); }
      const response = await pending; expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, updated: 2, data: expect.arrayContaining(eligible.map(item => expect.objectContaining({ id: item.id, status: targetStatus }))) });
      await expect(toolbar).toHaveCount(0); await verifyDatabase(true); expect(requests).toHaveLength(3);
      for (const body of requests) expect({ ...body, ids: [...body.ids].sort() }).toEqual({ ids: eligible.map(item => item.id).sort(), action });
      const committed = { records: await readRecords(), audits: await readAudits() };
      const replays = await Promise.all([page.request.patch('/api/alarm-incidents', { data: requests[2] }), page.request.patch('/api/alarm-incidents', { data: requests[2] })]);
      expect(replays.map(reply => reply.status())).toEqual([200, 200]); expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
      expect((await page.request.patch('/api/alarm-incidents', { data: requests[2] })).status()).toBe(403);
      expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
      for (const item of eligible) {
        await page.getByRole('button', { name: item.title, exact: true }).click();
        const detail = page.getByRole('dialog', { name: item.title, exact: true });
        await detail.getByRole('button', { name: 'Tüm geçmiş', exact: true }).click();
        await expect(detail.getByRole('heading', { name: 'Olay onaylandı', exact: true })).toHaveCount(1);
        await capture(page, testInfo, `bulk-acknowledge-access-${denial}-${item.group}-history`);
        await detail.getByRole('button', { name: 'Detayı kapat', exact: true }).click(); await expect(detail).toHaveCount(0);
      }
      expect(errors).toEqual([]);
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); await context.addCookies(cookies);
    }
  });
}
