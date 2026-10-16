import { expect } from '@playwright/test';
import { test, signIn, capture } from './fixtures';

for (const failure of ['none', 'api-error', 'offline', 'response-lost'] as const) {
  test(`exclusion removal: ${failure} retains target and leaves other entries untouched`, async ({ page, context, fixtures, prisma }, testInfo) => {
    const code = fixtures.manifest.prefix;
    const target = await prisma.alarmWhitelist.create({ data: { alarmCode: code, field: 'sourceIp', value: '198.51.100.42', reason: 'Kaldırılacak kayıt\nKaynak doğrulandı.', createdBy: 'E2E Fixture' } });
    await prisma.alarmWhitelist.createMany({ data: [
      { alarmCode: code, field: 'sourceIp', value: '198.51.100.88', reason: 'Same alarm, different value', createdBy: 'E2E Fixture' },
      { alarmCode: code, field: 'destIp', value: target.value, reason: 'Same value, different field', createdBy: 'E2E Fixture' },
      { alarmCode: code, field: 'deviceName', value: 'E2E-TEST-DEVICE', reason: 'Disabled entry must stay disabled', createdBy: 'E2E Fixture', enabled: false },
    ] });
    const readEntries = () => prisma.alarmWhitelist.findMany({ orderBy: { id: 'asc' } });
    const original = await readEntries();
    const ids = fixtures.manifest.rows.map(row => row.id);
    const readIncidents = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
      transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
    } });
    const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
    const evidence = { incidents: await readIncidents(), audits: await readAudits() };
    const verifyDatabase = async (removed: boolean) => {
      expect(await readEntries()).toEqual(original.filter(entry => !removed || entry.id !== target.id));
      expect(await readIncidents()).toEqual(evidence.incidents);
      expect(await readAudits()).toEqual(evidence.audits);
      fixtures.verify('preview');
    };
    const requests: string[] = []; const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/alarms/whitelist' && request.method() === 'DELETE') requests.push(url.searchParams.toString());
    });
    await signIn(page, fixtures);
    const filtered = page.waitForResponse(reply => {
      const url = new URL(reply.url());
      return url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${code}-resolve` && !url.searchParams.has('status');
    });
    await page.goto(`/dashboard/alerts?status=all&search=${code}-resolve`);
    expect((await filtered).status()).toBe(200);
    const rows = fixtures.manifest.rows.filter(row => row.group === 'resolve');
    const selected = rows.filter(row => ['OPEN', 'ACKNOWLEDGED'].includes(row.initialStatus));
    const list = page.getByRole('region', { name: 'Olay listesi', exact: true, includeHidden: true });
    await expect(list.getByRole('checkbox')).toHaveCount(5);
    const checkbox = (title: string) => list.getByRole('row', { includeHidden: true }).filter({ has: page.getByRole('button', { name: title, exact: true, includeHidden: true }) }).getByRole('checkbox', { includeHidden: true });
    for (const row of selected) await checkbox(row.title).check();
    const verifySelection = async () => {
      for (const row of rows) {
        if (selected.some(item => item.id === row.id)) await expect(checkbox(row.title)).toBeChecked();
        else await expect(checkbox(row.title)).not.toBeChecked();
      }
    };
    await page.getByRole('button', { name: 'İşlemler', exact: true }).click();
    await page.getByRole('button', { name: 'Hariç tutma kayıtları', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Hariç tutma kayıtları', exact: true });
    const table = dialog.getByRole('table', { name: 'Hariç tutma listesi', exact: true });
    const targetRow = table.getByRole('row').filter({ hasText: target.reason! });
    const canaries = original.filter(entry => entry.alarmCode === code && entry.id !== target.id);
    await targetRow.getByRole('button', { name: 'Kaldır', exact: true }).click();
    const confirmation = dialog.getByRole('region', { name: 'Kaldırma onayı', exact: true });
    const submit = dialog.getByRole('button', { name: 'Kaldırmayı onayla', exact: true });
    const verifyPreserved = async () => {
      await expect(dialog).toBeVisible(); await expect(confirmation).toContainText(code);
      await expect(confirmation).toContainText(`${target.field}: ${target.value}`);
      await expect(confirmation).toContainText(target.reason!);
      await expect(targetRow).toHaveAttribute('aria-selected', 'true');
      for (const entry of canaries) await expect(table.getByRole('row').filter({ hasText: entry.reason! })).toBeVisible();
      await verifySelection();
    };
    await verifyPreserved(); await verifyDatabase(false); expect(requests).toHaveLength(0);
    if (failure !== 'none') {
      if (failure === 'offline') await context.setOffline(true);
      else {
        let injected = false;
        await page.route('**/api/alarms/whitelist?**', async route => {
          if (route.request().method() !== 'DELETE' || injected) return route.continue();
          injected = true;
          if (failure === 'api-error') await route.fulfill({ status: 500, json: { error: 'Regresyon: geçici kaldırma hatası.' } });
          else {
            const committed = await route.fetch({ maxRetries: 0 });
            expect(committed.status()).toBe(200); expect(await committed.json()).toEqual({ success: true, removed: 1 });
            await route.abort('connectionreset');
          }
        });
      }
      try {
        await submit.click(); await expect(dialog.getByRole('alert')).toBeVisible();
        if (failure === 'api-error') await expect(dialog.getByRole('alert')).toContainText('Regresyon: geçici kaldırma hatası.');
        await expect(submit).toBeEnabled(); await verifyPreserved();
        expect(requests).toHaveLength(1); await verifyDatabase(failure === 'response-lost');
        await capture(page, testInfo, `removal-${failure}-retained`);
      } finally { await context.setOffline(false); }
    }
    const beforeRetry = await readEntries();
    let release!: () => void; let notifyStarted!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    await page.route('**/api/alarms/whitelist?**', async route => {
      if (route.request().method() !== 'DELETE') return route.continue();
      notifyStarted(); await gate; await route.continue();
    });
    const applied = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarms/whitelist' && reply.request().method() === 'DELETE');
    try {
      await submit.click(); await started;
      await expect(dialog.getByRole('button', { name: 'Kaldırılıyor…', exact: true })).toBeDisabled();
      await expect(dialog.getByRole('button', { name: 'Vazgeç', exact: true })).toBeDisabled();
      for (const button of await table.getByRole('button').all()) await expect(button).toBeDisabled();
      await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
      await dialog.getByRole('button', { name: 'Hariç tutma kayıtlarını kapat', exact: true }).click();
      await verifyPreserved(); expect(requests).toHaveLength(failure === 'none' ? 1 : 2);
      await verifyDatabase(failure === 'response-lost');
    } finally { release(); }
    const response = await applied;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ success: true, removed: failure === 'response-lost' ? 0 : 1 });
    await expect(confirmation).toHaveCount(0); await expect(targetRow).toHaveCount(0);
    await expect(dialog.getByRole('status')).toHaveText('Hariç tutma kaydı kaldırıldı.');
    for (const entry of canaries) await expect(table.getByRole('row').filter({ hasText: entry.reason! })).toBeVisible();
    expect(requests).toEqual(Array(failure === 'none' ? 1 : 2).fill(`id=${target.id}`));
    await verifyDatabase(true); await verifySelection();
    if (failure === 'response-lost') expect(await readEntries()).toEqual(beforeRetry);
    await capture(page, testInfo, `removal-${failure}-saved`);
    await dialog.getByRole('button', { name: 'Kapat', exact: true }).click();
    await expect(dialog).toHaveCount(0); await verifySelection();
    await expect(page.getByRole('button', { name: 'İşlemler', exact: true })).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('exclusion removal: concurrent deletes and stale retries preserve a recreated entry', async ({ page, fixtures, prisma }) => {
  const body = { alarmCode: fixtures.manifest.prefix, field: 'sourceIp', value: '198.51.100.42', reason: 'Recreated exclusion' };
  const target = await prisma.alarmWhitelist.create({ data: { ...body, createdBy: 'E2E Fixture' } });
  await prisma.alarmWhitelist.create({ data: { ...body, value: '198.51.100.88', reason: 'Unrelated exclusion', createdBy: 'E2E Fixture' } });
  const readOthers = () => prisma.alarmWhitelist.findMany({ where: { id: { not: target.id } }, orderBy: { id: 'asc' } });
  const original = await readOthers();
  await signIn(page, fixtures);
  let release!: () => void; let notifyLocked!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const locked = new Promise<void>(resolve => { notifyLocked = resolve; });
  const blocker = prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM alarm_whitelist WHERE id = ${target.id} FOR UPDATE`;
    notifyLocked(); await gate;
  }, { timeout: 20_000 });
  await locked;
  const url = `/api/alarms/whitelist?id=${target.id}`;
  const responses = Promise.all([page.request.delete(url), page.request.delete(url)]);
  try {
    await expect.poll(async () => {
      const waiting = await prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%DELETE FROM%alarm_whitelist%'`;
      return waiting[0].count;
    }, { timeout: 10_000 }).toBe(2);
  } finally { release(); await blocker; }
  const replies = await responses;
  expect(replies.map(reply => reply.status())).toEqual([200, 200]);
  const bodies = await Promise.all(replies.map(reply => reply.json()));
  expect(bodies.map(reply => reply.removed).sort()).toEqual([0, 1]);
  expect(bodies.every(reply => reply.success)).toBe(true);
  expect(await prisma.alarmWhitelist.findUnique({ where: { id: target.id } })).toBeNull();
  expect(await readOthers()).toEqual(original);
  const recreated = await page.request.post('/api/alarms/whitelist', { data: body });
  expect(recreated.status()).toBe(200);
  const replacement = (await recreated.json()).data;
  expect(replacement.id).not.toBe(target.id);
  const beforeStaleRetry = await prisma.alarmWhitelist.findMany({ orderBy: { id: 'asc' } });
  const replay = await page.request.delete(url);
  expect(replay.status()).toBe(200); expect(await replay.json()).toEqual({ success: true, removed: 0 });
  expect(await prisma.alarmWhitelist.findMany({ orderBy: { id: 'asc' } })).toEqual(beforeStaleRetry);
  fixtures.verify('preview');
});
