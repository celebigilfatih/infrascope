import { expect } from '@playwright/test';
import { test, capture } from './fixtures';
import { deferred, prepareExclusions } from './exclusion-fixtures';

for (const failure of ['none', 'api-error', 'offline', 'connection-reset'] as const) {
  test(`exclusion loading: ${failure} retries load the current list without writes`, async ({ page, context, fixtures, prisma }, testInfo) => {
    const ui = await prepareExclusions(page, fixtures, prisma);
    const failureCount = failure === 'none' ? 0 : 2;
    const attempts = Array.from({ length: failureCount + 1 }, () => ({ started: deferred(), gate: deferred() }));
    const requests: string[] = [];
    await page.route('**/api/alarms/whitelist?**', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      const slot = attempts[requests.length]; requests.push(new URL(route.request().url()).searchParams.toString());
      expect(slot).toBeDefined(); slot.started.resolve(); await slot.gate.promise;
      if (requests.length <= failureCount) {
        if (failure === 'api-error') await route.fulfill({ status: 500, json: { error: 'Regresyon: kayıtlar geçici olarak yüklenemedi.' } });
        else if (failure === 'offline') await route.continue();
        else {
          const response = await route.fetch({ maxRetries: 0 });
          expect(response.status()).toBe(200); expect((await response.json()).data).toHaveLength(3);
          await route.abort('connectionreset');
        }
      } else await route.continue();
    });
    try {
      await ui.open();
      for (let index = 0; index < attempts.length; index++) {
        if (index > 0) await ui.reload.click();
        await attempts[index].started.promise; await ui.verifyLoading();
        expect(requests).toHaveLength(index + 1); await ui.verifyData();
        if (index < failureCount) {
          if (failure === 'offline') await context.setOffline(true);
          attempts[index].gate.resolve();
          try {
            await expect(ui.dialog.getByRole('alert')).toHaveText(failure === 'api-error' ? 'Regresyon: kayıtlar geçici olarak yüklenemedi.' : 'Bağlantı kurulamadı. Kayıtları yeniden yükleyin.');
            await expect(ui.reload).toBeEnabled(); await expect(ui.table).toHaveCount(0); await expect(ui.empty).toHaveCount(0);
            await expect(ui.dialog.getByRole('status')).toHaveCount(0);
            await ui.verifySelection(); await ui.verifyData();
            if (index === failureCount - 1) await capture(page, testInfo, `exclusion-load-${failure}-retry`);
          } finally { await context.setOffline(false); }
        } else {
          if (failure !== 'none') {
            await prisma.alarmWhitelist.updateMany({ where: { alarmCode: ui.code, field: 'sourceIp' }, data: { reason: 'Yeniden denemede güncel açıklama' } });
            await prisma.alarmWhitelist.create({ data: { alarmCode: ui.code, field: 'sourceIp', value: '198.51.100.99', reason: 'İlk hatadan sonra eklenen kayıt', createdBy: 'E2E Fixture', createdAt: new Date('2026-02-01') } });
            await ui.checkpoint();
          }
          const loaded = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarms/whitelist' && reply.request().method() === 'GET');
          attempts[index].gate.resolve();
          const response = await loaded;
          expect(response.status()).toBe(200);
          expect(await response.json()).toEqual({ success: true, data: JSON.parse(JSON.stringify(ui.visibleEntries())), canDelete: true });
          await ui.verifyList(); await capture(page, testInfo, `exclusion-load-${failure}-loaded`);
        }
      }
      expect(requests).toEqual(Array(attempts.length).fill('includeDisabled=true'));
      await ui.close();
    } finally { for (const attempt of attempts) attempt.gate.resolve(); await context.setOffline(false); }

    if (failure === 'none') {
      await page.unroute('**/api/alarms/whitelist?**');
      await prisma.alarmWhitelist.deleteMany({ where: { alarmCode: ui.code } }); await ui.checkpoint();
      const loaded = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarms/whitelist' && reply.request().method() === 'GET');
      await ui.open(); expect((await loaded).status()).toBe(200);
      await expect(ui.empty).toBeVisible(); await expect(ui.table).toHaveCount(0);
      await expect(ui.dialog.getByRole('alert')).toHaveCount(0); await expect(ui.reload).toHaveCount(0);
      await ui.verifySelection(); await ui.verifyData(); await ui.close();
    }
  });
}

test('exclusion loading: closing a pending load and reopening ignores its stale response', async ({ page, fixtures, prisma }, testInfo) => {
  const ui = await prepareExclusions(page, fixtures, prisma);
  const oldReady = deferred(); const releaseOld = deferred(); const oldFinished = deferred(); const freshReady = deferred(); const releaseFresh = deferred();
  let requests = 0;
  await page.route('**/api/alarms/whitelist?**', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    requests++;
    if (requests === 1) {
      const response = await route.fetch({ maxRetries: 0 });
      expect(response.status()).toBe(200); expect((await response.json()).data).toHaveLength(3);
      oldReady.resolve(); await releaseOld.promise;
      try { await route.fulfill({ response }); } finally { oldFinished.resolve(); }
    } else {
      expect(requests).toBe(2); freshReady.resolve(); await releaseFresh.promise; await route.continue();
    }
  });
  try {
    await ui.open(); await oldReady.promise; await ui.verifyLoading();
    await ui.close();
    await prisma.alarmWhitelist.updateMany({ where: { alarmCode: ui.code, field: 'sourceIp' }, data: { reason: 'Yeni penceredeki güncel kayıt' } });
    await ui.checkpoint();
    await ui.open(); await freshReady.promise; await ui.verifyLoading();
    releaseOld.resolve(); await oldFinished.promise;
    await ui.verifyLoading(); await ui.verifyData();
    const loaded = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarms/whitelist' && reply.request().method() === 'GET');
    releaseFresh.resolve(); expect((await loaded).status()).toBe(200);
    await ui.verifyList(); await expect(ui.table).toContainText('Yeni penceredeki güncel kayıt');
    await expect(ui.table).not.toContainText('Etkin kaynak'); expect(requests).toBe(2);
    await capture(page, testInfo, 'exclusion-load-reopened-current'); await ui.close();
  } finally { releaseOld.resolve(); releaseFresh.resolve(); }
});
