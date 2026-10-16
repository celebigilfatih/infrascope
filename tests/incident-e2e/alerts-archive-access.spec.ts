import { expect } from '@playwright/test';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import { test, signIn, capture } from './fixtures';
import { installTestSession } from './session-fixtures';
import { deferred } from './exclusion-fixtures';

for (const action of ['ARCHIVE', 'RESTORE'] as const) {
  const archiving = action === 'ARCHIVE';
  const operation = action.toLowerCase();
  const group = archiving ? 'close' : 'resolve';
  const targetArchive = archiving ? 'ARCHIVED' : 'HOT';
  const transitionType = archiving ? 'ARCHIVED' : 'RESTORED';
  const submitLabel = archiving ? 'Arşivle' : 'Arşivden çıkar';
  const nextLabel = archiving ? 'Arşivden çıkar' : 'Arşivle';
  const historyTitle = archiving ? 'Olay arşivlendi' : 'Olay arşivden çıkarıldı';
  for (const denial of ['expired', 'missing', 'inactive', 'revoked-role', 'editor-session', 'viewer-session'] as const) {
    test(`detail ${operation} access: ${denial} rejects archive/history writes and recovers safely`, async ({ page, context, fixtures, assignee, prisma }, testInfo) => {
      const initialStatus = 'CLOSED';
      const rows = fixtures.manifest.rows.filter(item => item.group === group);
      const row = rows.find(item => item.initialStatus === initialStatus)!;
      const visibleRows = archiving ? rows : rows.filter(item => item.id === row.id || ['OPEN', 'ACKNOWLEDGED'].includes(item.initialStatus));
      const selected = visibleRows.filter(item => item.id === row.id || item.initialStatus === 'ACKNOWLEDGED');
      if (!archiving) await prisma.alarmIncident.updateMany({ where: { id: { in: visibleRows.map(item => item.id) } }, data: {
        archiveState: 'ARCHIVED', archivedAt: new Date('2026-01-01T00:00:00Z'), archiveReason: 'E2E arşiv başlangıcı',
      } });
      let applied = false;
      const ids = fixtures.manifest.rows.map(item => item.id);
      const draft = `  ${fixtures.manifest.prefix} operasyon taslağı\nTakip <devam ediyor>.  `;
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
          if (original.id !== row.id) { expect(actual).toEqual(original); continue; }
          expect(actual).toMatchObject({ status: 'CLOSED', archiveState: targetArchive, archiveReason: null });
          if (archiving) expect(actual.archivedAt).not.toBeNull(); else expect(actual.archivedAt).toBeNull();
          expect(actual.transitions).toHaveLength(original.transitions.length + 1);
          const transitions = actual.transitions.filter(item => item.type === transitionType);
          expect(transitions).toHaveLength(1);
          expect(transitions[0]).toMatchObject({ fromStatus: 'CLOSED', toStatus: 'CLOSED', actorType: 'USER', actorId: fixtures.userId, actorName: 'Incident E2E Operator', reason: null });
          expect({ ...actual, archiveState: original.archiveState, archivedAt: original.archivedAt,
            archiveReason: original.archiveReason, updatedAt: original.updatedAt,
            transitions: actual.transitions.filter(item => item.type !== transitionType),
          }).toEqual(original);
        }
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({ entityId: row.id, entity: 'AlarmIncident', action: action.toLowerCase(), userId: fixtures.userId,
          details: { fromStatus: initialStatus, toStatus: 'CLOSED' } });
      };
      const requests: Array<{ ids: string[]; action: string }> = []; const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (new URL(request.url()).pathname === '/api/alarm-incidents' && request.method() === 'PATCH') requests.push(request.postDataJSON());
      });
      await signIn(page, fixtures); const cookies = await context.cookies();
      const filtered = page.waitForResponse(reply => {
        const url = new URL(reply.url());
        return url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-${group}` && !url.searchParams.has('status');
      });
      await page.goto(`/dashboard/alerts?status=all&search=${fixtures.manifest.prefix}-${group}`); expect((await filtered).status()).toBe(200);
      const list = page.getByRole('region', { name: 'Olay listesi', exact: true, includeHidden: true });
      await expect(list.getByRole('checkbox')).toHaveCount(archiving ? 5 : 2);
      if (!archiving) {
        const archived = page.waitForResponse(reply => {
          const url = new URL(reply.url()); return url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-${group}` && url.searchParams.get('archiveState') === 'ARCHIVED' && !url.searchParams.has('status');
        });
        await page.getByRole('button', { name: 'Filtreler', exact: true }).click();
        await page.getByRole('combobox', { name: 'Saklama alanı', exact: true }).selectOption('ARCHIVED'); expect((await archived).status()).toBe(200);
        await page.getByRole('button', { name: 'Tamam', exact: true }).click(); await expect(list.getByRole('checkbox')).toHaveCount(4);
      }
      const checkbox = (title: string) => list.getByRole('row', { includeHidden: true }).filter({ has: page.getByRole('button', { name: title, exact: true, includeHidden: true }) }).getByRole('checkbox', { includeHidden: true });
      for (const item of selected) await checkbox(item.title).check();
      const verifySelection = async () => {
        for (const item of visibleRows) {
          if (applied && item.id === row.id) { await expect(list.getByRole('button', { name: item.title, exact: true, includeHidden: true })).toHaveCount(0); continue; }
          if (selected.some(chosen => chosen.id === item.id)) await expect(checkbox(item.title)).toBeChecked();
          else await expect(checkbox(item.title)).not.toBeChecked();
        }
      };
      await page.getByRole('button', { name: row.title, exact: true }).click();
      const detail = page.getByRole('dialog'); const operations = detail.getByRole('region', { name: 'Durum işlemleri', exact: true });
      const submit = operations.getByRole('button', { name: submitLabel, exact: true });
      const note = detail.getByRole('textbox', { name: 'Yeni operasyon notu', exact: true });
      const person = detail.getByRole('combobox', { name: 'Sorumlu seçimi', exact: true });
      const login = operations.getByRole('link', { name: 'Yeni sekmede giriş yap', exact: true });
      const verifyDraft = async () => {
        await expect(detail).toBeVisible(); await expect(note).toHaveValue(draft); await expect(person).toHaveValue(assignee.id); await verifySelection();
      };
      await expect(note).toBeEnabled(); await note.fill(draft); await person.selectOption(assignee.id);
      await expect(submit).toBeEnabled(); await verifyDraft(); await verifyDatabase(); expect(requests).toHaveLength(0);
      try {
        if (denial === 'expired') await installTestSession(context, fixtures, 'ADMIN', true);
        else if (denial === 'missing') await context.clearCookies({ name: SESSION_COOKIE_NAME });
        else if (denial === 'inactive') await prisma.user.update({ where: { id: fixtures.userId }, data: { status: 'INACTIVE' } });
        else {
          await prisma.user.update({ where: { id: fixtures.userId }, data: { role: denial === 'viewer-session' ? 'VIEWER' : 'EDITOR' } });
          if (denial === 'viewer-session' || denial === 'editor-session') await installTestSession(context, fixtures, denial === 'viewer-session' ? 'VIEWER' : 'EDITOR');
        }
        const status = ['expired', 'missing', 'inactive'].includes(denial) ? 401 : 403;
        const warning = status === 401
          ? 'Oturumunuzun süresi doldu veya oturumunuz geçersiz. Tekrar giriş yapın. Arşiv durumu ve taslaklarınız bu pencerede korunuyor.'
          : archiving ? 'Bu olayı arşivleme yetkiniz yok. Arşiv durumu değiştirilmedi.' : 'Bu olayı arşivden çıkarma yetkiniz yok. Arşiv durumu değiştirilmedi.';
        for (let attempt = 0; attempt < 2; attempt++) {
          const pending = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
          await submit.click(); const response = await pending; expect(response.status()).toBe(status); expect(await response.json()).not.toHaveProperty('data');
          await expect(operations.getByRole('alert')).toHaveText(warning); await verifyDraft(); await expect(submit).toBeEnabled();
          if (status === 401) {
            await expect(login).toHaveAttribute('href', '/login?next=%2Fdashboard%2Falerts'); await expect(login).toHaveAttribute('target', '_blank');
            await expect(detail.getByRole('link', { name: 'Yeni sekmede giriş yap', exact: true })).toHaveCount(1);
          } else await expect(login).toHaveCount(0);
          expect(requests).toHaveLength(attempt + 1); await verifyDatabase();
        }
        for (const deniedAction of ['ARCHIVE', 'RESTORE']) {
          const denied = await page.request.patch('/api/alarm-incidents', { data: { ids: [row.id], action: deniedAction, actorName: 'Untrusted' } });
          expect(denied.status()).toBe(status); expect(await denied.json()).not.toHaveProperty('data');
        }
        // EDITOR may write other actions; malformed JSON cannot identify an archive action.
        const malformed = await page.request.patch('/api/alarm-incidents', { data: '{', headers: { 'content-type': 'application/json' } });
        expect(malformed.status()).toBe(status === 403 && denial !== 'viewer-session' ? 400 : status); await verifyDatabase(); await capture(page, testInfo, `detail-${operation}-access-${denial}-retained`);
        if (denial === 'expired') {
          const popup = context.waitForEvent('page'); await login.click(); const loginPage = await popup;
          try { await signIn(loginPage, fixtures); } finally { await loginPage.close(); }
        } else {
          await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); await context.addCookies(cookies);
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
          const busy = operations.getByRole('button', { name: 'İşlem sürüyor…', exact: true });
          await expect(busy).toHaveCount(1);
          for (const button of await busy.all()) await expect(button).toBeDisabled();
          await expect(note).toBeDisabled(); await expect(person).toBeDisabled(); await expect(login).toHaveCount(0);
          await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await verifyDraft(); expect(requests).toHaveLength(3); await verifyDatabase();
        } finally { gate.resolve(); }
        const response = await pending; expect(response.status()).toBe(200);
        expect(await response.json()).toMatchObject({ success: true, updated: 1, data: [expect.objectContaining({ id: row.id, status: 'CLOSED', archiveState: targetArchive })] });
        applied = true;
        await expect(operations.getByRole('button', { name: nextLabel, exact: true })).toBeEnabled(); await expect(submit).toHaveCount(0);
        await verifyDraft(); await verifyDatabase(true); expect(requests).toHaveLength(3);
        for (const body of requests) expect(body).toEqual({ ids: [row.id], action });
        const committed = { records: await readRecords(), audits: await readAudits() };
        const replays = await Promise.all([page.request.patch('/api/alarm-incidents', { data: requests[2] }), page.request.patch('/api/alarm-incidents', { data: requests[2] })]);
        expect(replays.map(reply => reply.status())).toEqual([200, 200]); expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'EDITOR' } });
        for (const deniedAction of ['ARCHIVE', 'RESTORE']) {
          const denied = await page.request.patch('/api/alarm-incidents', { data: { ids: [row.id], action: deniedAction } }); expect(denied.status()).toBe(403);
        }
        expect({ records: await readRecords(), audits: await readAudits() }).toEqual(committed);
        await detail.getByRole('button', { name: 'Tüm geçmiş', exact: true }).click();
        await expect(detail.getByRole('heading', { name: historyTitle, exact: true })).toHaveCount(1); await capture(page, testInfo, `detail-${operation}-access-${denial}-history`);
        await detail.getByRole('tab', { name: 'Genel bakış', exact: true }).click(); await verifyDraft(); expect(errors).toEqual([]);
      } finally {
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); await context.addCookies(cookies);
      }
    });
  }

  for (const role of ['EDITOR', 'VIEWER'] as const) {
    test(`detail ${operation} access: ${role} cannot change archive state through the detail or API`, async ({ page, context, fixtures, prisma }, testInfo) => {
      const initialStatus = 'CLOSED';
      const row = fixtures.manifest.rows.find(item => item.group === group && item.initialStatus === initialStatus)!;
      if (!archiving) await prisma.alarmIncident.update({ where: { id: row.id }, data: {
        archiveState: 'ARCHIVED', archivedAt: new Date('2026-01-01T00:00:00Z'), archiveReason: 'E2E arşiv başlangıcı',
      } });
      const ids = fixtures.manifest.rows.map(item => item.id);
      const readRecords = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
        transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
      } });
      const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
      const before = { records: await readRecords(), audits: await readAudits() }; let requests = 0;
      page.on('request', request => { if (new URL(request.url()).pathname === '/api/alarm-incidents' && request.method() === 'PATCH') requests++; });
      await signIn(page, fixtures); const cookies = await context.cookies();
      const filtered = page.waitForResponse(reply => {
        const url = new URL(reply.url()); return url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-${group}` && !url.searchParams.has('status');
      });
      await page.goto(`/dashboard/alerts?status=all&search=${fixtures.manifest.prefix}-${group}`); expect((await filtered).status()).toBe(200);
      if (!archiving) {
        const archived = page.waitForResponse(reply => {
          const url = new URL(reply.url()); return url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-${group}` && url.searchParams.get('archiveState') === 'ARCHIVED' && !url.searchParams.has('status');
        });
        await page.getByRole('button', { name: 'Filtreler', exact: true }).click();
        await page.getByRole('combobox', { name: 'Saklama alanı', exact: true }).selectOption('ARCHIVED'); expect((await archived).status()).toBe(200);
        await page.getByRole('button', { name: 'Tamam', exact: true }).click();
      }
      try {
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role } }); await installTestSession(context, fixtures, role);
        const people = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents/assignees' && !new URL(reply.url()).searchParams.has('scope'));
        await page.getByRole('button', { name: row.title, exact: true }).click(); expect(await (await people).json()).toMatchObject({ canArchive: false, canManage: role === 'EDITOR' });
        const detail = page.getByRole('dialog'); const operations = detail.getByRole('region', { name: 'Durum işlemleri', exact: true });
        const submit = operations.getByRole('button', { name: submitLabel, exact: true });
        const note = detail.getByRole('textbox', { name: 'Yeni operasyon notu', exact: true });
        if (role === 'EDITOR') await expect(note).toBeEnabled(); else await expect(note).toBeDisabled();
        await expect(submit).toBeDisabled(); await expect(operations).toContainText('Arşivleme ve arşivden çıkarma için yönetici yetkisi gerekiyor.');
        await submit.click({ force: true }); expect(requests).toBe(0);
        const denied = await page.request.patch('/api/alarm-incidents', { data: { ids: [row.id], action } });
        expect(denied.status()).toBe(403); expect(await denied.json()).not.toHaveProperty('data');
        expect({ records: await readRecords(), audits: await readAudits() }).toEqual(before); fixtures.verify('preview'); await capture(page, testInfo, `detail-${operation}-access-${role}-read-only`);
        await detail.getByRole('button', { name: 'Detayı kapat', exact: true }).click(); await expect(detail).toHaveCount(0);
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); await context.addCookies(cookies);
        await page.getByRole('button', { name: row.title, exact: true }).click(); await expect(submit).toBeEnabled(); expect(requests).toBe(0);
        expect({ records: await readRecords(), audits: await readAudits() }).toEqual(before);
      } finally {
        await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } }); await context.addCookies(cookies);
      }
    });
  }
}
