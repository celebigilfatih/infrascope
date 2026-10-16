import { expect } from '@playwright/test';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { test, signIn, capture } from './fixtures';
import { installTestSession } from './session-fixtures';
import { deferred } from './exclusion-fixtures';

for (const denial of ['expired', 'missing', 'inactive', 'revoked-role', 'viewer-session', 'existing-disabled'] as const) {
  test(`detail exclusion access: ${denial} preserves the reason and rejects unauthorized writes`, async ({ page, context, fixtures, prisma }, testInfo) => {
    const code = fixtures.manifest.prefix;
    const rows = fixtures.manifest.rows.filter(item => item.group === 'resolve');
    const row = rows.find(item => item.initialStatus === 'OPEN')!;
    const selected = rows.filter(item => ['OPEN', 'ACKNOWLEDGED'].includes(item.initialStatus));
    const ids = fixtures.manifest.rows.map(item => item.id);
    const value = '198.51.100.42';
    let draft = `  ${code} planlı kontrol\nKurum içi kaynak doğrulandı.  `;
    await prisma.alarmEvent.updateMany({ where: { incidentId: row.id }, data: { sourceIp: value } });
    await prisma.alarmWhitelist.create({ data: { alarmCode: code, field: 'sourceIp', value: '198.51.100.88', reason: 'Must stay unchanged', createdBy: 'E2E Fixture' } });
    const existing = denial === 'existing-disabled' ? await prisma.alarmWhitelist.create({ data: {
      alarmCode: code, field: 'sourceIp', value, reason: 'Disabled exclusion must not change without permission', createdBy: 'E2E Fixture', enabled: false,
    } }) : null;
    const readEntries = () => prisma.alarmWhitelist.findMany({ orderBy: { id: 'asc' } });
    const readIncidents = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
      transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
    } });
    const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
    const original = { entries: await readEntries(), incidents: await readIncidents(), audits: await readAudits() };
    const verifyData = async (applied = false) => {
      expect(await readIncidents()).toEqual(original.incidents); expect(await readAudits()).toEqual(original.audits);
      const entries = await readEntries();
      if (!applied) expect(entries).toEqual(original.entries);
      else {
        const targets = entries.filter(entry => entry.alarmCode === code && entry.field === 'sourceIp' && entry.value === value);
        expect(targets).toHaveLength(1);
        expect(targets[0]).toMatchObject({ alarmCode: code, field: 'sourceIp', value, reason: draft.trim(), enabled: true,
          createdBy: existing ? 'E2E Fixture' : 'Incident E2E Operator', expiresAt: null });
        if (existing) { expect(targets[0].id).toBe(existing.id); expect(targets[0].createdAt).toEqual(existing.createdAt); }
        expect(entries.filter(entry => entry.id !== targets[0].id)).toEqual(original.entries.filter(entry => entry.id !== existing?.id));
      }
      fixtures.verify('preview');
    };
    const requests: unknown[] = []; const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/alarms/whitelist' && request.method() === 'POST') requests.push(request.postDataJSON());
    });
    await signIn(page, fixtures);
    const cookies = await context.cookies();
    const filtered = page.waitForResponse(reply => {
      const url = new URL(reply.url());
      return url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${code}-resolve` && !url.searchParams.has('status');
    });
    await page.goto(`/dashboard/alerts?status=all&search=${code}-resolve`); expect((await filtered).status()).toBe(200);
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
    await page.getByRole('dialog').getByRole('button', { name: 'Diğer işlemler', exact: true }).click();
    await page.getByRole('button', { name: 'Alarmı hariç tut', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Alarmı hariç tut', exact: true });
    const reason = dialog.getByRole('textbox', { name: 'Hariç tutma nedeni (zorunlu)', exact: true });
    const submit = dialog.getByRole('button', { name: 'Hariç tut', exact: true });
    const login = dialog.getByRole('link', { name: 'Yeni sekmede giriş yap', exact: true });
    const verifyDraft = async () => {
      await expect(dialog).toBeVisible(); await expect(dialog).toContainText(row.title);
      await expect(dialog).toContainText(`sourceIp: ${value}`); await expect(reason).toHaveValue(draft); await verifySelection();
    };
    const initialDraft = draft;
    await reason.fill(draft); await verifyDraft(); await verifyData(); expect(requests).toHaveLength(0);
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
        ? 'Oturumunuzun süresi doldu veya oturumunuz geçersiz. Tekrar giriş yapın. Açıklamanız bu pencerede korunuyor.'
        : 'Bu alarmı hariç tutma yetkiniz yok. Açıklamanız korundu.';
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt === 1) { draft += '\nEk kontrol notu.'; await reason.fill(draft); }
        const pending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarms/whitelist' && reply.request().method() === 'POST');
        await submit.click(); const response = await pending;
        expect(response.status()).toBe(status); expect(await response.json()).not.toHaveProperty('data');
        await expect(dialog.getByRole('alert')).toHaveText(warning); await verifyDraft();
        await expect(reason).toBeEnabled(); await expect(submit).toBeEnabled();
        await expect(dialog.getByRole('button', { name: 'İptal', exact: true })).toBeEnabled();
        if (status === 401) {
          await expect(login).toHaveAttribute('href', '/login?next=%2Fdashboard%2Falerts'); await expect(login).toHaveAttribute('target', '_blank');
        } else await expect(login).toHaveCount(0);
        expect(requests).toHaveLength(attempt + 1); await verifyData();
      }
      // Also bypass the form: neither creation nor reactivation may succeed.
      for (const targetValue of [value, '198.51.100.99']) {
        const denied = await page.request.post('/api/alarms/whitelist', { data: { alarmCode: code, field: 'sourceIp', value: targetValue, reason: draft.trim(), createdBy: 'Spoofed creator' } });
        expect(denied.status()).toBe(status); expect(await denied.json()).not.toHaveProperty('data');
      }
      await verifyData(); await capture(page, testInfo, `detail-exclusion-access-${denial}-retained`);

      if (denial === 'expired') {
        // Real login in a second tab refreshes the shared session without leaving the draft.
        const popup = context.waitForEvent('page'); await login.click(); const loginPage = await popup;
        try { await signIn(loginPage, fixtures); } finally { await loginPage.close(); }
        await verifyDraft();
      } else {
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR', status: 'ACTIVE' } });
        await context.addCookies(cookies);
      }
      await verifyDraft(); await verifyData(); expect(requests).toHaveLength(2);
      const gate = deferred(); const started = deferred();
      await page.route('**/api/alarms/whitelist', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        started.resolve(); await gate.promise; await route.continue();
      });
      const pending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarms/whitelist' && reply.request().method() === 'POST');
      try {
        await submit.click(); await started.promise;
        await expect(dialog.getByRole('button', { name: 'Ekleniyor…', exact: true })).toBeDisabled(); await expect(reason).toBeDisabled();
        await expect(login).toHaveCount(0); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
        await verifyDraft(); expect(requests).toHaveLength(3); await verifyData();
      } finally { gate.resolve(); }
      const response = await pending; expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, action: existing ? 'updated' : 'created' });
      await expect(dialog).toHaveCount(0);
      const detail = page.getByRole('dialog'); await expect(detail.getByRole('status')).toContainText('Alarm yok sayma listesine eklendi.');
      await verifyData(true); await verifySelection(); expect(requests).toHaveLength(3);
      expect(requests[0]).toEqual({ alarmCode: code, field: 'sourceIp', value, reason: initialDraft.trim() });
      for (const request of requests.slice(1)) expect(request).toEqual({ alarmCode: code, field: 'sourceIp', value, reason: draft.trim() });
      await capture(page, testInfo, `detail-exclusion-access-${denial}-authorized`);
      await detail.getByRole('button', { name: 'Diğer işlemler', exact: true }).click();
      await page.getByRole('button', { name: 'Alarmı hariç tut', exact: true }).click();
      await expect(reason).toHaveValue(''); await expect(submit).toBeDisabled(); await expect(login).toHaveCount(0);
      await dialog.getByRole('button', { name: 'İptal', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Detayı kapat', exact: true }).click();
      await verifySelection(); expect(errors).toEqual([]);
    } finally {
      await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } });
      await context.addCookies(cookies);
    }
  });
}
