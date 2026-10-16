import { expect } from '@playwright/test';
import { test, signIn, capture } from './fixtures';

for (const group of ['resolve', 'close'] as const) {
  test(`bulk ${group}: explanation, exclusions, prune, undo and explicit approval`, async ({ page, fixtures, prisma }, testInfo) => {
    const resolving = group === 'resolve';
    const eligibleCount = resolving ? 2 : 1;
    const excludedCount = 4 - eligibleCount;
    const rows = fixtures.manifest.rows.filter(row => row.group === group);
    const eligible = rows.filter(row => resolving ? ['OPEN', 'ACKNOWLEDGED'].includes(row.initialStatus) : row.initialStatus === 'RESOLVED');
    const excluded = rows.filter(row => !eligible.includes(row));
    const reason = fixtures.manifest.reasons[group];
    const requests: Array<{ ids: string[]; reason: string; action: string; bulk: boolean }> = [];
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/alarm-incidents' && request.method() === 'PATCH') requests.push(request.postDataJSON());
    });

    await signIn(page, fixtures);
    // Use the real All-status tab so this test also protects access to mixed selections.
    const filtered = page.waitForResponse(reply => {
      const url = new URL(reply.url());
      return reply.request().method() === 'GET' && url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-${group}`;
    });
    await page.goto(`/dashboard/alerts?search=${fixtures.manifest.prefix}-${group}`);
    expect((await filtered).status()).toBe(200);
    await expect(page.getByRole('button', { name: rows.find(row => row.initialStatus === 'OPEN')!.title, exact: true })).toBeVisible();
    await page.getByRole('group', { name: 'Olay durumu', exact: true }).getByRole('button', { name: /^Tümü/ }).click();
    await expect(page.getByRole('button', { name: excluded.find(row => row.initialStatus === 'CLOSED')!.title, exact: true })).toBeVisible();
    const rowFor = (title: string) => page.getByRole('row').filter({ has: page.getByRole('button', { name: title, exact: true }) });
    await expect(page.getByRole('region', { name: 'Olay listesi', exact: true }).getByRole('checkbox')).toHaveCount(5);
    await page.getByRole('checkbox', { name: 'Bu sayfadaki olayları seç', exact: true }).check();
    await page.getByRole('button', { name: resolving ? 'Çözüldü işaretle (2)' : 'Kapat (1)', exact: true }).click();
    const proceed = page.getByRole('button', { name: 'Onay ekranına geç', exact: true });
    const explanation = page.getByRole('textbox', { name: 'İşlem açıklaması (zorunlu)', exact: true });
    await expect(proceed).toBeDisabled();
    await explanation.fill('  \n  ');
    await expect(proceed).toBeDisabled();
    await explanation.fill(resolving ? `  ${reason}  ` : 'İlk kapatma taslağı');
    await proceed.click();
    const dialog = page.getByRole('dialog', { name: resolving ? 'Toplu çözümü onayla' : 'Toplu kapatmayı onayla', exact: true });
    const selectedCount = (count: number) => expect(dialog.locator('dl')).toContainText(new RegExp(`Seçili olay\\s*${count}`));
    await selectedCount(4);
    await expect(dialog.getByRole('list', { name: 'İşlem uygulanacak olaylar', exact: true }).getByRole('listitem')).toHaveCount(eligibleCount);
    const excludedList = dialog.getByRole('list', { name: `İşlem dışında kalacak olaylar (${excludedCount})`, exact: true });
    await expect(excludedList.getByRole('listitem')).toHaveCount(excludedCount);
    for (const row of excluded) await expect(excludedList).toContainText(row.title);
    await expect(excludedList).toContainText(resolving ? 'Kapatılmış olay yeniden çözülemez.' : 'Olay zaten kapatılmış.');
    await expect(excludedList).toContainText(resolving ? 'Olay zaten çözüldü olarak işaretlenmiş.' : 'Kapatılmadan önce çözüldü olarak işaretlenmelidir.');

    const prune = dialog.getByRole('button', { name: 'İşlem dışında kalanları seçimden çıkar', exact: true });
    await prune.click();
    await selectedCount(eligibleCount);
    await expect(dialog.getByRole('status')).toHaveText(`${excludedCount} olay seçimden çıkarıldı.`);
    await expect(excludedList).toHaveCount(0);
    for (const row of eligible) await expect(rowFor(row.title).getByRole('checkbox')).toBeChecked();
    for (const row of excluded) await expect(rowFor(row.title).getByRole('checkbox')).not.toBeChecked();
    await capture(page, testInfo, `${group}-pruned-undo`);

    if (!resolving) {
      await dialog.getByRole('button', { name: 'Geri dön', exact: true }).click();
      await explanation.fill(`  ${reason}  `);
      await proceed.click();
    }
    await dialog.getByRole('button', { name: 'Geri al', exact: true }).click();
    await selectedCount(4);
    await expect(excludedList.getByRole('listitem')).toHaveCount(excludedCount);
    await expect(dialog.getByText(reason, { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Bu sayfadaki olayları seç', exact: true })).toBeChecked();
    await expect(dialog.getByRole('button', { name: 'Geri al', exact: true })).toHaveCount(0);
    expect(requests).toHaveLength(0);
    fixtures.verify('preview'); // Includes transition/audit counts and untouched canary.
    await capture(page, testInfo, `${group}-restored`);

    // Resolve tests a pruned payload; close tests a restored mixed payload and server skips.
    if (resolving) await prune.click();
    const applied = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
    await dialog.getByRole('button', { name: resolving ? 'Onayla ve çöz' : 'Onayla ve kapat', exact: true }).click();
    const response = await applied;
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ success: true, updated: eligibleCount, skipped: resolving ? 0 : excludedCount });
    await expect(dialog).toBeHidden();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ action: resolving ? 'RESOLVE' : 'CLOSE', bulk: true, reason });
    expect([...requests[0].ids].sort()).toEqual((resolving ? eligible : rows).map(row => row.id).sort());
    for (const row of eligible) await expect(rowFor(row.title).getByText(resolving ? 'Çözüldü' : 'Kapatıldı', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Toplu olay işlemleri', exact: true })).toHaveCount(0);
    fixtures.verify(group, group);
    const transitions = await prisma.alarmLifecycleTransition.findMany({ where: { incidentId: { in: eligible.map(row => row.id) }, reason } });
    expect(transitions).toHaveLength(eligibleCount);
    expect(transitions.every(transition => transition.actorId === fixtures.userId && transition.actorName === 'Incident E2E Operator')).toBe(true);

    await page.getByRole('button', { name: eligible[0].title, exact: true }).click();
    const detail = page.getByRole('dialog');
    await expect(detail.getByText(reason, { exact: true })).toBeVisible();
    await detail.getByRole('button', { name: 'Tüm geçmiş', exact: true }).click();
    await expect(detail.getByText(reason, { exact: true })).toBeVisible();
    await capture(page, testInfo, `${group}-history`);
    expect(pageErrors).toEqual([]);
  });

  for (const failure of ['api-error', 'offline', 'response-lost'] as const) {
    test(`bulk ${group}: ${failure} preserves draft/selection and retry never duplicates history`, async ({ page, context, fixtures, prisma }, testInfo) => {
      const resolving = group === 'resolve';
      const rows = fixtures.manifest.rows.filter(row => row.group === group);
      const eligible = rows.filter(row => resolving ? ['OPEN', 'ACKNOWLEDGED'].includes(row.initialStatus) : row.initialStatus === 'RESOLVED');
      const excluded = rows.filter(row => !eligible.includes(row));
      const reason = fixtures.manifest.reasons[group];
      const draft = `  ${reason}  `;
      const requests: Array<{ ids: string[]; action: string; bulk: boolean; reason: string }> = [];
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('request', request => {
        if (new URL(request.url()).pathname === '/api/alarm-incidents' && request.method() === 'PATCH') requests.push(request.postDataJSON());
      });
      await signIn(page, fixtures);
      const filtered = page.waitForResponse(reply => {
        const url = new URL(reply.url());
        return reply.request().method() === 'GET' && url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-${group}` && !url.searchParams.has('status');
      });
      await page.goto(`/dashboard/alerts?status=all&search=${fixtures.manifest.prefix}-${group}`);
      expect((await filtered).status()).toBe(200);
      const rowFor = (title: string) => page.getByRole('row').filter({ has: page.getByRole('button', { name: title, exact: true }) });
      await expect(page.getByRole('region', { name: 'Olay listesi', exact: true }).getByRole('checkbox')).toHaveCount(5);
      await expect(rowFor(rows.find(row => row.initialStatus === 'CLOSED')!.title)).toBeVisible();
      await page.getByRole('checkbox', { name: 'Bu sayfadaki olayları seç', exact: true }).check();
      await page.getByRole('button', { name: resolving ? 'Çözüldü işaretle (2)' : 'Kapat (1)', exact: true }).click();
      const explanation = page.getByRole('textbox', { name: 'İşlem açıklaması (zorunlu)', exact: true });
      await explanation.fill(draft);
      await page.getByRole('button', { name: 'Onay ekranına geç', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: resolving ? 'Toplu çözümü onayla' : 'Toplu kapatmayı onayla', exact: true });
      const confirm = dialog.getByRole('button', { name: resolving ? 'Onayla ve çöz' : 'Onayla ve kapat', exact: true });
      const prune = dialog.getByRole('button', { name: 'İşlem dışında kalanları seçimden çıkar', exact: true });
      const assertSelection = async (selected: typeof rows) => {
        await expect(dialog.locator('dl')).toContainText(new RegExp(`Seçili olay\\s*${selected.length}`));
        for (const row of rows) await expect(rowFor(row.title).getByRole('checkbox')).toBeChecked({ checked: selected.includes(row) });
        await expect(dialog.getByText(reason, { exact: true })).toBeVisible();
      };
      await prune.click();
      await assertSelection(eligible);
      fixtures.verify('preview');

      // Inject only the failure. Retry still traverses the real authenticated API/DB.
      let faultInjected = false;
      if (failure === 'offline') {
        await context.setOffline(true);
      } else {
        await page.route('**/api/alarm-incidents', async route => {
          if (route.request().method() !== 'PATCH' || faultInjected) return route.continue();
          faultInjected = true;
          if (failure === 'api-error') {
            await route.fulfill({ status: 500, json: { success: false, error: 'Regresyon: geçici API hatası.' } });
          } else {
            // Commit successfully, then drop the response: the browser cannot know it succeeded.
            const committed = await route.fetch({ maxRetries: 0 });
            expect(committed.status()).toBe(200);
            expect(await committed.json()).toMatchObject({ success: true, updated: eligible.length, skipped: 0 });
            await route.abort('connectionreset');
          }
        });
      }
      try {
        await confirm.click();
        await expect(dialog.getByRole('alert')).toBeVisible();
        if (failure === 'api-error') await expect(dialog.getByRole('alert')).toHaveText('Regresyon: geçici API hatası.');
        await expect(confirm).toBeEnabled();
        await assertSelection(eligible);
        expect(requests).toHaveLength(1); // No hidden automatic retry.
        fixtures.verify(failure === 'response-lost' ? group : 'preview', group);
        await capture(page, testInfo, `${group}-${failure}-retained`);
      } finally {
        await context.setOffline(false);
      }

      // The prune snapshot and the original multiline draft survive the failure too.
      await dialog.getByRole('button', { name: 'Geri al', exact: true }).click();
      await assertSelection(rows);
      await expect(dialog.getByRole('list', { name: `İşlem dışında kalacak olaylar (${excluded.length})`, exact: true }).getByRole('listitem')).toHaveCount(excluded.length);
      await prune.click();
      await assertSelection(eligible);
      await dialog.getByRole('button', { name: 'Geri dön', exact: true }).click();
      await expect(explanation).toHaveValue(draft);
      await page.getByRole('button', { name: 'Onay ekranına geç', exact: true }).click();
      expect(requests).toHaveLength(1);

      // Hold retry in flight to exercise busy controls without timing-based sleeps.
      let releaseRetry!: () => void;
      let retryStarted!: () => void;
      const gate = new Promise<void>(resolve => { releaseRetry = resolve; });
      const started = new Promise<void>(resolve => { retryStarted = resolve; });
      await page.route('**/api/alarm-incidents', async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        retryStarted();
        await gate;
        await route.continue();
      });
      const applied = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarm-incidents' && reply.request().method() === 'PATCH');
      try {
        await confirm.click();
        await started;
        const saving = dialog.getByRole('button', { name: 'Kaydediliyor…', exact: true });
        await expect(saving).toBeDisabled();
        await expect(dialog.getByRole('button', { name: 'Geri dön', exact: true })).toBeDisabled();
        await expect(dialog.getByRole('button', { name: 'Geri al', exact: true })).toBeDisabled();
        for (const row of rows) await expect(rowFor(row.title).getByRole('checkbox')).toBeDisabled();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeVisible();
        expect(requests).toHaveLength(2);
        fixtures.verify(failure === 'response-lost' ? group : 'preview', group);
      } finally {
        releaseRetry();
      }
      const response = await applied;
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, updated: failure === 'response-lost' ? 0 : eligible.length, skipped: failure === 'response-lost' ? eligible.length : 0 });
      expect(requests).toHaveLength(2);
      expect(requests[1]).toEqual(requests[0]);
      expect(requests[1]).toMatchObject({ action: resolving ? 'RESOLVE' : 'CLOSE', bulk: true, reason });
      expect([...requests[1].ids].sort()).toEqual(eligible.map(row => row.id).sort());
      if (failure === 'response-lost') {
        // A zero-update retry is not proof this user performed the earlier write.
        // Keep the draft/selection and ask them to inspect server history instead of claiming success.
        await expect(dialog.getByRole('alert')).toContainText('Önceki isteğin sonucu sunucuda kaydedilmiş olabilir.');
        await expect(dialog.getByRole('alert')).not.toContainText('Açıklama kaydedilmedi');
        await assertSelection(eligible);
        await expect(confirm).toBeEnabled();
        await dialog.getByRole('button', { name: 'Geri dön', exact: true }).click();
        await expect(explanation).toHaveValue(draft);
      } else {
        await expect(dialog).toBeHidden();
        await expect(page.getByRole('region', { name: 'Toplu olay işlemleri', exact: true })).toHaveCount(0);
        for (const row of eligible) await expect(rowFor(row.title).getByText(resolving ? 'Çözüldü' : 'Kapatıldı', { exact: true })).toBeVisible();
      }
      // Checks exact total transitions/audits, reason fields, excluded rows and the unselected canary.
      fixtures.verify(group, group);
      const transitions = await prisma.alarmLifecycleTransition.findMany({ where: { incidentId: { in: eligible.map(row => row.id) }, reason } });
      expect(transitions).toHaveLength(eligible.length);
      expect(transitions.every(transition => transition.actorId === fixtures.userId)).toBe(true);
      expect(pageErrors).toEqual([]);
      await capture(page, testInfo, `${group}-${failure}-retry`);
    });
  }
}
