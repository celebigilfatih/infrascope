import { expect, type Page } from '@playwright/test';
import type { AlarmWhitelist, PrismaClient } from '@prisma/client';
import { signIn, type Fixtures } from './fixtures';

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

export async function prepareExclusions(page: Page, fixtures: Fixtures, prisma: PrismaClient, { allowDeleteAttempts = false }: { allowDeleteAttempts?: boolean } = {}) {
  const code = fixtures.manifest.prefix;
  // Each isolated case starts after the previous case's fixture cleanup.
  expect(await prisma.alarmWhitelist.count()).toBe(0);
  await prisma.alarmWhitelist.createMany({ data: [
    { alarmCode: code, field: 'sourceIp', value: '198.51.100.42', reason: 'Etkin kaynak', createdBy: 'E2E Fixture', createdAt: new Date('2026-01-01') },
    { alarmCode: code, field: 'destIp', value: '198.51.100.88', reason: 'Süreli hedef', createdBy: 'E2E Fixture', expiresAt: new Date('2099-01-01'), createdAt: new Date('2026-01-02') },
    { alarmCode: code, field: 'deviceName', value: 'E2E-TEST-DEVICE', reason: 'Devre dışı kayıt', createdBy: 'E2E Fixture', enabled: false, createdAt: new Date('2026-01-03') },
    { alarmCode: code, field: 'user', value: 'expired-fixture', reason: 'Süresi dolmuş kayıt', createdBy: 'E2E Fixture', expiresAt: new Date('2000-01-01'), createdAt: new Date('2026-01-04') },
  ] });
  const readEntries = () => prisma.alarmWhitelist.findMany({ orderBy: { id: 'asc' } });
  let expected = await readEntries();
  const ids = fixtures.manifest.rows.map(row => row.id);
  const readIncidents = () => prisma.alarmIncident.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: {
    transitions: { orderBy: { id: 'asc' } }, occurrences: { orderBy: { id: 'asc' } }, notificationAttempts: { orderBy: { id: 'asc' } },
  } });
  const readAudits = () => prisma.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { id: 'asc' } });
  const original = { incidents: await readIncidents(), audits: await readAudits() };
  const writes: string[] = []; const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/alarms/whitelist' && request.method() !== 'GET' && !(allowDeleteAttempts && request.method() === 'DELETE')) writes.push(request.method());
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
  const dialog = page.getByRole('dialog', { name: 'Hariç tutma kayıtları', exact: true });
  const table = dialog.getByRole('table', { name: 'Hariç tutma listesi', exact: true });
  const empty = dialog.getByText('Gösterilecek hariç tutma kaydı yok.', { exact: true });
  const reload = dialog.getByRole('button', { name: 'Yeniden yükle', exact: true });
  const visibleEntries = () => expected.filter(entry => entry.field !== 'user').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const verifySelection = async () => {
    for (const row of rows) {
      if (selected.some(item => item.id === row.id)) await expect(checkbox(row.title)).toBeChecked();
      else await expect(checkbox(row.title)).not.toBeChecked();
    }
  };
  const verifyData = async () => {
    expect(await readEntries()).toEqual(expected);
    expect(await readIncidents()).toEqual(original.incidents); expect(await readAudits()).toEqual(original.audits);
    expect(writes).toEqual([]); expect(errors).toEqual([]); fixtures.verify('preview');
  };
  const verifyLoading = async () => {
    await expect(dialog.getByRole('status')).toHaveText('Kayıtlar yükleniyor…');
    await expect(table).toHaveCount(0); await expect(empty).toHaveCount(0);
    await expect(dialog.getByRole('alert')).toHaveCount(0); await expect(reload).toHaveCount(0);
    await verifySelection();
  };
  const verifyList = async (entries: AlarmWhitelist[] = visibleEntries()) => {
    await expect(dialog.getByRole('status')).toHaveCount(0); await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(reload).toHaveCount(0); await expect(empty).toHaveCount(0);
    await expect(table.getByRole('row')).toHaveCount(entries.length + 1);
    for (const [index, entry] of entries.entries()) {
      const row = table.getByRole('row').nth(index + 1);
      await expect(row).toContainText(entry.alarmCode); await expect(row).toContainText(`${entry.field}: ${entry.value}`);
      await expect(row).toContainText(entry.reason!);
      await expect(row.getByRole('button', { name: 'Kaldır', exact: true })).toBeEnabled();
      await expect(row.getByText('Devre dışı', { exact: true })).toHaveCount(entry.enabled ? 0 : 1);
    }
    await expect(table).not.toContainText('Süresi dolmuş kayıt');
    await verifySelection(); await verifyData();
  };
  const open = async () => {
    await page.getByRole('button', { name: 'İşlemler', exact: true }).click();
    await page.getByRole('button', { name: 'Hariç tutma kayıtları', exact: true }).click();
    await expect(dialog).toBeVisible();
  };
  const close = async () => {
    await dialog.getByRole('button', { name: 'Kapat', exact: true }).click();
    await expect(dialog).toHaveCount(0); await verifySelection();
    await expect(page.getByRole('button', { name: 'İşlemler', exact: true })).toBeFocused();
  };
  return { code, dialog, table, empty, reload, open, close, visibleEntries, verifySelection, verifyLoading, verifyList, verifyData,
    checkpoint: async () => { expected = await readEntries(); },
  };
}
