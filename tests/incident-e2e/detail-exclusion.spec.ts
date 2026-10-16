import { expect } from '@playwright/test';
import { alarmWhitelistLockKey } from '../../lib/alarms/incident-exclusion';
import { test, signIn, capture } from './fixtures';

for (const failure of ['none', 'api-error', 'offline', 'response-lost'] as const) {
  test(`detail exclusion: ${failure} preserves selection and reason and creates one entry`, async ({ page, context, fixtures, prisma }, testInfo) => {
    const rows = fixtures.manifest.rows.filter(row => row.group === 'resolve');
    const row = rows.find(item => item.initialStatus === 'OPEN')!;
    const selected = rows.filter(item => ['OPEN', 'ACKNOWLEDGED'].includes(item.initialStatus));
    const ids = fixtures.manifest.rows.map(item => item.id);
    const value = '198.51.100.42';
    const draft = `  ${fixtures.manifest.prefix} planlı kontrol\nKurum içi kaynak doğrulandı.  `;
    await prisma.alarmEvent.updateMany({ where: { incidentId: row.id }, data: { sourceIp: value } });
    const canary = await prisma.alarmWhitelist.create({ data: { alarmCode: fixtures.manifest.prefix, field: 'sourceIp', value: '198.51.100.88', reason: 'Must stay unchanged', createdBy: 'E2E Fixture' } });
    const readRecords = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
      transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
    } });
    const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
    const readEntries = () => prisma.alarmWhitelist.findMany({ orderBy: { id: 'asc' } });
    const original = { records: await readRecords(), audits: await readAudits(), entries: await readEntries() };
    const body = { alarmCode: fixtures.manifest.prefix, field: 'sourceIp', value, reason: draft.trim() };
    const verifyDatabase = async (applied: boolean) => {
      expect(await readRecords()).toEqual(original.records);
      expect(await readAudits()).toEqual(original.audits);
      const entries = await readEntries();
      const targets = entries.filter(item => item.alarmCode === body.alarmCode && item.field === body.field && item.value === value);
      expect(targets).toHaveLength(applied ? 1 : 0);
      if (applied) expect(targets[0]).toMatchObject({ ...body, createdBy: 'Incident E2E Operator', enabled: true, expiresAt: null });
      expect(entries.filter(item => !targets.some(target => target.id === item.id))).toEqual(original.entries);
      expect(entries.find(item => item.id === canary.id)).toEqual(canary);
    };
    const requests: unknown[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/alarms/whitelist' && request.method() === 'POST') requests.push(request.postDataJSON());
    });
    await signIn(page, fixtures);
    const filtered = page.waitForResponse(reply => {
      const url = new URL(reply.url());
      return url.pathname === '/api/alarm-incidents' && url.searchParams.get('search') === `${fixtures.manifest.prefix}-resolve` && !url.searchParams.has('status');
    });
    await page.goto(`/dashboard/alerts?status=all&search=${fixtures.manifest.prefix}-resolve`);
    expect((await filtered).status()).toBe(200);
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
    const verifyPreserved = async () => {
      await expect(dialog).toBeVisible(); await expect(dialog).toContainText(row.title);
      await expect(dialog).toContainText(`sourceIp: ${value}`);
      await expect(reason).toHaveValue(draft); await verifySelection();
    };
    await expect(submit).toBeDisabled();
    await reason.fill('  \n  '); await expect(submit).toBeDisabled();
    await reason.fill(draft); await expect(submit).toBeEnabled();
    await verifyPreserved(); fixtures.verify('preview'); expect(requests).toHaveLength(0);

    if (failure !== 'none') {
      if (failure === 'offline') await context.setOffline(true);
      else {
        let injected = false;
        await page.route('**/api/alarms/whitelist', async route => {
          if (route.request().method() !== 'POST' || injected) return route.continue();
          injected = true;
          if (failure === 'api-error') await route.fulfill({ status: 500, json: { error: 'Regresyon: geçici hariç tutma hatası.' } });
          else {
            const committed = await route.fetch({ maxRetries: 0 });
            expect(committed.status()).toBe(200); expect(await committed.json()).toMatchObject({ success: true, action: 'created' });
            await route.abort('connectionreset');
          }
        });
      }
      try {
        await submit.click(); await expect(dialog.getByRole('alert')).toBeVisible();
        if (failure === 'api-error') await expect(dialog.getByRole('alert')).toContainText('Regresyon: geçici hariç tutma hatası.');
        await expect(submit).toBeEnabled(); await expect(reason).toBeEnabled();
        await verifyPreserved(); expect(requests).toHaveLength(1);
        await verifyDatabase(failure === 'response-lost');
        await capture(page, testInfo, `exclusion-${failure}-retained`);
      } finally { await context.setOffline(false); }
    }
    const beforeRetry = await readEntries();
    let release!: () => void; let notifyStarted!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    await page.route('**/api/alarms/whitelist', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      notifyStarted(); await gate; await route.continue();
    });
    const applied = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/alarms/whitelist' && reply.request().method() === 'POST');
    try {
      await submit.click(); await started;
      await expect(dialog.getByRole('button', { name: 'Ekleniyor…', exact: true })).toBeDisabled();
      await expect(reason).toBeDisabled(); await expect(dialog.getByRole('button', { name: 'İptal', exact: true })).toBeDisabled();
      await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
      await dialog.getByRole('button', { name: 'Hariç tutmayı iptal et', exact: true }).click();
      await verifyPreserved(); expect(requests).toHaveLength(failure === 'none' ? 1 : 2);
      await verifyDatabase(failure === 'response-lost');
    } finally { release(); }
    const response = await applied;
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, action: failure === 'response-lost' ? 'unchanged' : 'created', data: expect.objectContaining(body) });
    await expect(dialog).toHaveCount(0);
    const detail = page.getByRole('dialog');
    await expect(detail.getByRole('button', { name: 'Onayla', exact: true })).toBeEnabled();
    await expect(detail.getByRole('status')).toContainText('Alarm yok sayma listesine eklendi.');
    expect(requests).toHaveLength(failure === 'none' ? 1 : 2);
    for (const request of requests) expect(request).toEqual(body);
    await verifyDatabase(true); await verifySelection();
    if (failure === 'response-lost') expect(await readEntries()).toEqual(beforeRetry);
    await capture(page, testInfo, `exclusion-${failure}-saved`);
    await detail.getByRole('button', { name: 'Detayı kapat', exact: true }).click();
    await verifySelection(); expect(pageErrors).toEqual([]);
  });
}

test('detail exclusion: overlapping first attempts share one entry', async ({ page, fixtures, prisma }) => {
  const body = { alarmCode: fixtures.manifest.prefix, field: 'sourceIp', value: '198.51.100.42', reason: 'Concurrent exclusion' };
  const key = alarmWhitelistLockKey(body.alarmCode, body.field, body.value);
  await signIn(page, fixtures);
  let release!: () => void; let notifyLocked!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const locked = new Promise<void>(resolve => { notifyLocked = resolve; });
  const blocker = prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    notifyLocked(); await gate;
  }, { timeout: 20_000 });
  await locked;
  const responses = Promise.all([page.request.post('/api/alarms/whitelist', { data: body }), page.request.post('/api/alarms/whitelist', { data: body })]);
  try {
    await expect.poll(async () => {
      const waiting = await prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%pg_advisory_xact_lock%'`;
      return waiting[0].count;
    }, { timeout: 10_000 }).toBe(2);
  } finally { release(); await blocker; }
  const replies = await responses;
  expect(replies.map(reply => reply.status())).toEqual([200, 200]);
  const bodies = await Promise.all(replies.map(reply => reply.json()));
  expect(bodies.map(reply => reply.action).sort()).toEqual(['created', 'unchanged']);
  expect(bodies[0].data).toEqual(bodies[1].data);
  const entries = await prisma.alarmWhitelist.findMany({ where: { alarmCode: body.alarmCode } });
  expect(entries).toHaveLength(1); expect(entries[0]).toMatchObject({ ...body, createdBy: 'Incident E2E Operator' });
  fixtures.verify('preview');
});
