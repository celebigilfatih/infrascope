import { expect } from '@playwright/test';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { test, signIn, capture } from './fixtures';
import { installTestSession } from './session-fixtures';
import { deferred } from './exclusion-fixtures';

for (const group of ['resolve', 'close'] as const) {
  const resolving = group === 'resolve';
  const action = resolving ? 'RESOLVE' : 'CLOSE';
  const targetStatus = resolving ? 'RESOLVED' : 'CLOSED';
  const title = resolving ? 'Toplu çözümü onayla' : 'Toplu kapatmayı onayla';
  const submitLabel = resolving ? 'Onayla ve çöz' : 'Onayla ve kapat';
  const triggerLabel = resolving ? 'Çözüldü işaretle (2)' : 'Kapat (1)';
  for (const denial of ['expired', 'missing', 'inactive', 'revoked-role', 'viewer-session'] as const) {
    test(`bulk ${group} access: ${denial} preserves selection/reason and rejects unauthorized writes`, async ({ page, context, fixtures, prisma }, testInfo) => {
      const rows = fixtures.manifest.rows.filter(row => row.group === group);
      const eligible = rows.filter(row => resolving ? ['OPEN', 'ACKNOWLEDGED'].includes(row.initialStatus) : row.initialStatus === 'RESOLVED');
      const excluded = rows.filter(row => !eligible.includes(row));
      const ids = fixtures.manifest.rows.map(row => row.id);
      const reason = fixtures.manifest.reasons[group];
      const draft = `  ${reason}  `;
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
          const actual = records.find(row => row.id === original.id)!;
          if (!eligible.some(row => row.id === original.id)) { expect(actual).toEqual(original); continue; }
          expect(actual.status).toBe(targetStatus);
          expect(actual.transitions).toHaveLength(original.transitions.length + 1);
          const movements = actual.transitions.filter(row => row.type === targetStatus);
          expect(movements).toHaveLength(1);
          expect(movements[0]).toMatchObject({ fromStatus: original.status, toStatus: targetStatus, reason,
            actorType: 'USER', actorId: fixtures.userId, actorName: 'Incident E2E Operator' });
          if (resolving) {
            expect(actual.resolvedAt).not.toBeNull();
            expect(actual).toMatchObject({ resolvedById: fixtures.userId, resolvedBy: 'Incident E2E Operator', resolutionReason: reason });
          } else {
            expect(actual.closedAt).not.toBeNull();
            expect(actual).toMatchObject({ closedById: fixtures.userId, closedBy: 'Incident E2E Operator', closeReason: reason, activeFingerprint: null });
          }
          for (const occurrence of actual.occurrences) {
            expect(occurrence).toMatchObject({ acknowledged: true, acknowledgedBy: 'Incident E2E Operator' });
            expect(occurrence.acknowledgedAt).not.toBeNull();
          }
          expect({ ...actual, status: original.status, updatedAt: original.updatedAt,
            transitions: actual.transitions.filter(row => row.type !== targetStatus),
            occurrences: actual.occurrences.map(occurrence => {
              const previous = original.occurrences.find(row => row.id === occurrence.id)!;
              return { ...occurrence, acknowledged: previous.acknowledged, acknowledgedAt: previous.acknowledgedAt, acknowledgedBy: previous.acknowledgedBy };
            }),
            ...(resolving ? { resolvedAt: original.resolvedAt, resolvedById: original.resolvedById, resolvedBy: original.resolvedBy, resolutionReason: original.resolutionReason }
              : { closedAt: original.closedAt, closedById: original.closedById, closedBy: original.closedBy, closeReason: original.closeReason, activeFingerprint: original.activeFingerprint }),
          }).toEqual(original);
          expect(audits.filter(row => row.entityId === original.id)).toEqual([expect.objectContaining({ entity: 'AlarmIncident', action: action.toLowerCase(), userId: fixtures.userId,
            details: expect.objectContaining({ fromStatus: original.status, toStatus: targetStatus, reason }) })]);
        }
        expect(audits).toHaveLength(eligible.length); fixtures.verify(group, group);
      };
      const requests: Array<{ ids: string[]; action: string; bulk: boolean; reason: string }> = [];
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (new URL(request.url()).pathname === '/api/alarm-incidents' && request.method() === 'PATCH') requests.push(request.postDataJSON());
      });
      await signIn(page, fixtures); const cookies = await context.cookies();
      const filtered = page.waitForResponse(reply => {
        const url = new URL(reply.url());
        return reply.request().method() === 'GET' && url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-${group}` && !url.searchParams.has('status');
      });
      await page.goto(`/dashboard/alerts?status=all&search=${fixtures.manifest.prefix}-${group}`); expect((await filtered).status()).toBe(200);
      const list = page.getByRole('region', { name: 'Olay listesi', exact: true, includeHidden: true });
      const checkbox = (name: string) => list.getByRole('row', { includeHidden: true }).filter({ has: page.getByRole('button', { name, exact: true, includeHidden: true }) }).getByRole('checkbox', { includeHidden: true });
      await expect(list.getByRole('checkbox')).toHaveCount(5);
      await page.getByRole('checkbox', { name: 'Bu sayfadaki olayları seç', exact: true }).check();
      await page.getByRole('button', { name: triggerLabel, exact: true }).click();
      const explanation = page.getByRole('textbox', { name: 'İşlem açıklaması (zorunlu)', exact: true });
      const proceed = page.getByRole('button', { name: 'Onay ekranına geç', exact: true });
      await explanation.fill(draft); await proceed.click();
      const dialog = page.getByRole('dialog', { name: title, exact: true });
      const confirm = dialog.getByRole('button', { name: submitLabel, exact: true });
      const prune = dialog.getByRole('button', { name: 'İşlem dışında kalanları seçimden çıkar', exact: true });
      const undo = dialog.getByRole('button', { name: 'Geri al', exact: true });
      const login = dialog.getByRole('link', { name: 'Yeni sekmede giriş yap', exact: true });
      const assertSelection = async (selected: typeof rows) => {
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('dl')).toContainText(new RegExp(`Seçili olay\\s*${selected.length}`));
        await expect(dialog.getByText(reason, { exact: true })).toBeVisible();
        for (const row of rows) await expect(checkbox(row.title)).toBeChecked({ checked: selected.includes(row) });
        await expect(dialog.getByRole('list', { name: 'İşlem uygulanacak olaylar', exact: true }).getByRole('listitem')).toHaveCount(eligible.length);
        const excludedList = dialog.getByRole('list', { name: `İşlem dışında kalacak olaylar (${excluded.length})`, exact: true });
        if (selected.length === rows.length) await expect(excludedList.getByRole('listitem')).toHaveCount(excluded.length);
        else await expect(excludedList).toHaveCount(0);
      };
      await prune.click(); await assertSelection(eligible); await expect(undo).toBeEnabled(); await verifyDatabase();
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
          ? 'Oturumunuzun süresi doldu veya oturumunuz geçersiz. Tekrar giriş yapın. Seçiminiz ve açıklamanız bu pencerede korunuyor.'
          : resolving ? 'Seçili olayları çözme yetkiniz yok. Olay durumları değiştirilmedi; seçiminiz ve açıklamanız korundu.' : 'Seçili olayları kapatma yetkiniz yok. Olay durumları değiştirilmedi; seçiminiz ve açıklamanız korundu.';
        const denySubmit = async () => {
          const pending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
          await confirm.click(); const response = await pending;
          expect(response.status()).toBe(status); expect(await response.json()).not.toHaveProperty('data');
          await expect(dialog.getByRole('alert')).toHaveText(warning); await expect(confirm).toBeEnabled();
          if (status === 401) { await expect(login).toHaveAttribute('href', '/login?next=%2Fdashboard%2Falerts'); await expect(login).toHaveAttribute('target', '_blank'); }
          else await expect(login).toHaveCount(0);
          await verifyDatabase();
        };
        for (let attempt = 0; attempt < 2; attempt++) {
          await denySubmit(); await assertSelection(eligible); await expect(undo).toBeEnabled(); expect(requests).toHaveLength(attempt + 1);
        }
        await capture(page, testInfo, `bulk-${group}-access-${denial}-pruned-retained`);
        await undo.click(); await assertSelection(rows);
        await dialog.getByRole('button', { name: 'Geri dön', exact: true }).click(); await expect(explanation).toHaveValue(draft);
        if (status === 401) await expect(page.getByRole('link', { name: 'Yeni sekmede giriş yap', exact: true })).toHaveCount(1);
        await proceed.click(); await denySubmit(); await assertSelection(rows); expect(requests).toHaveLength(3);
        for (const deniedAction of ['RESOLVE', 'CLOSE']) {
          const denied = await page.request.patch('/api/alarm-incidents', { data: { ids: rows.map(row => row.id), action: deniedAction, bulk: true, reason, actorName: 'Untrusted' } });
          expect(denied.status()).toBe(status); expect(await denied.json()).not.toHaveProperty('data');
        }
        const malformed = await page.request.patch('/api/alarm-incidents', { data: '{', headers: { 'content-type': 'application/json' } });
        expect(malformed.status()).toBe(status); await verifyDatabase();
        await capture(page, testInfo, `bulk-${group}-access-${denial}-mixed-retained`);
        if (denial === 'expired') {
          const popup = context.waitForEvent('page'); await login.click(); const loginPage = await popup;
          try { await signIn(loginPage, fixtures); } finally { await loginPage.close(); }
          if (!await dialog.isVisible()) {
            await page.getByRole('button', { name: triggerLabel, exact: true }).click(); await expect(explanation).toHaveValue(draft); await proceed.click();
          }
        } else {
          await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR', status: 'ACTIVE' } }); await context.addCookies(cookies);
        }
        await assertSelection(rows); await verifyDatabase();
        if (resolving) await prune.click();
        const finalSelection = resolving ? eligible : rows;
        await assertSelection(finalSelection);
        const gate = deferred(); const started = deferred();
        await page.route('**/api/alarm-incidents', async route => {
          if (route.request().method() !== 'PATCH') return route.continue();
          started.resolve(); await gate.promise; await route.continue();
        });
        const pending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
        try {
          await confirm.click(); await started.promise;
          await expect(dialog.getByRole('button', { name: 'Kaydediliyor…', exact: true })).toBeDisabled();
          await expect(dialog.getByRole('button', { name: 'Geri dön', exact: true })).toBeDisabled();
          if (resolving) await expect(undo).toBeDisabled(); else await expect(prune).toBeDisabled();
          await expect(login).toHaveCount(0);
          for (const row of rows) await expect(checkbox(row.title)).toBeDisabled();
          await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
          await assertSelection(finalSelection); expect(requests).toHaveLength(4); await verifyDatabase();
        } finally { gate.resolve(); }
        const response = await pending; expect(response.status()).toBe(200);
        expect(await response.json()).toMatchObject({ success: true, updated: eligible.length, skipped: finalSelection.length - eligible.length });
        await expect(dialog).toBeHidden(); await expect(page.getByRole('region', { name: 'Toplu olay işlemleri', exact: true })).toHaveCount(0);
        await verifyDatabase(true); expect(requests).toHaveLength(4);
        for (const [index, body] of requests.entries()) {
          expect(body).toEqual({ ids: expect.any(Array), action, bulk: true, reason });
          expect([...body.ids].sort()).toEqual((index < 2 ? eligible : index === 2 ? rows : finalSelection).map(row => row.id).sort());
        }
        const committed = { records: await readRecords(), audits: await readAudits() };
        const replays = await Promise.all([page.request.patch('/api/alarm-incidents', { data: requests[3] }), page.request.patch('/api/alarm-incidents', { data: requests[3] })]);
        expect(replays.map(reply => reply.status())).toEqual([200, 200]);
        for (const replay of replays) expect(await replay.json()).toMatchObject({ success: true, updated: 0, skipped: finalSelection.length });
        expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
        expect((await page.request.patch('/api/alarm-incidents', { data: requests[3] })).status()).toBe(403);
        expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
        await page.getByRole('button', { name: eligible[0].title, exact: true }).click();
        const detail = page.getByRole('dialog', { name: eligible[0].title });
        await detail.getByRole('button', { name: 'Tüm geçmiş', exact: true }).click(); await expect(detail.getByText(reason, { exact: true })).toHaveCount(1);
        await capture(page, testInfo, `bulk-${group}-access-${denial}-history`); expect(errors).toEqual([]);
      } finally {
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); await context.addCookies(cookies);
      }
    });
  }
}
