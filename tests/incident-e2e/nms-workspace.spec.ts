import { expect, type Page, type TestInfo } from '@playwright/test';
import { test, signIn } from './fixtures';
import { deferred } from './exclusion-fixtures';
import fixture from '../../scripts/fixtures/nms-device-monitoring.cjs';

async function mockNms(page: Page) {
  const state = { rows: fixture.rows(), failList: false, probe: 'success', holdProbe: null as ReturnType<typeof deferred> | null, holdSave: null as ReturnType<typeof deferred> | null };
  const probes: Array<Record<string, unknown>> = [], saves: Array<Record<string, unknown>> = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/integrations/nms/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/test-connection')) {
      probes.push(request.postDataJSON()); const gate = state.holdProbe; state.holdProbe = null; if (gate) await gate.promise;
      try { await route.fulfill({ status: state.probe === 'error' ? 503 : 200, json: state.probe === 'error' ? { error: 'Test hizmeti kullanılamıyor.' } : { result: {
        reachable: state.probe === 'success', outcome: state.probe === 'success' ? 'response' : 'no_response', checkedAt: new Date(fixture.NOW).toISOString(), durationMs: 12, systemName: state.probe === 'success' ? 'Fixture SNMP target' : null, uptimeSeconds: state.probe === 'success' ? 0 : null,
      } } }); } catch { /* A cancelled browser request may already be detached. */ }
      return;
    }
    if (pathname === '/api/integrations/nms/devices' && request.method() === 'POST') {
      saves.push(request.postDataJSON()); if (state.holdSave) await state.holdSave.promise;
      return route.fulfill({ json: { success: true } });
    }
    if (pathname === '/api/integrations/nms/devices' && request.method() === 'GET') return route.fulfill({ status: state.failList ? 503 : 200, json: state.failList ? { error: 'Fixture source unavailable' } : { devices: state.rows } });
    if (request.method() !== 'GET') throw new Error('Unexpected NMS write');
    return route.continue();
  });
  await page.route('**/api/devices?**', route => route.fulfill({ json: { success: true, totalPages: 1, data: [{ id: 'fixture-new-device', name: 'Fixture inventory device', type: 'SWITCH', managementIp: '192.0.2.10', nmsDeviceId: null }] } }));
  return { state, probes, saves, errors };
}
async function capture(page: Page, info: TestInfo, name: string) { await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' }); }
async function selectDevice(page: Page) { await page.goto('/integrations/nms/add-device'); await page.locator('#device').selectOption('fixture-new-device'); }
const probeButton = (page: Page) => page.getByRole('button', { name: 'SNMP bağlantısını test et', exact: true });
const probePanel = (page: Page) => page.getByRole('region', { name: /SNMP bağlantı testi/ });

test('NMS workspace: independent freshness, valid zero, filters and failed refresh retain the summary', async ({ page, fixtures }, info) => {
  const source = await mockNms(page); await signIn(page, fixtures); await page.clock.setFixedTime(fixture.NOW); await page.goto('/integrations/nms/devices');
  await page.getByRole('button', { name: 'TEST-ESKI-OLCUM: ölçüm özetini aç', exact: true }).click();
  let summary = page.getByRole('dialog', { name: 'Ölçüm özeti', exact: true });
  await expect(summary).toContainText('Yanıt kaydı güncel'); await expect(summary).toContainText('Ölçüm eski'); await expect(summary).toContainText('%36');
  await capture(page, info, 'nms-desktop-independent-measurements'); await summary.getByRole('button', { name: 'Ölçüm özetini kapat', exact: true }).click();
  await page.getByRole('button', { name: 'TEST-GUNCEL: ölçüm özetini aç', exact: true }).click(); summary = page.getByRole('dialog'); await expect(summary).toContainText('%0');
  await summary.getByRole('button', { name: 'Ölçüm özetini kapat', exact: true }).click();
  source.state.failList = true; await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Son başarılı yüklemedeki bilgiler gösteriliyor.' })).toBeVisible();
  await page.getByRole('button', { name: 'TEST-GUNCEL: ölçüm özetini aç', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('Son yenileme başarısız.');
  await page.getByRole('dialog').getByRole('button', { name: 'Ölçüm özetini kapat', exact: true }).click();
  await page.getByRole('combobox', { name: 'İzleme özeti', exact: true }).selectOption('unknown');
  await expect(page.getByRole('button', { name: 'TEST-GELECEK: ölçüm özetini aç', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'TEST-GUNCEL: ölçüm özetini aç', exact: true })).toHaveCount(0);
  expect(source.probes).toEqual([]); expect(source.saves).toEqual([]); expect(source.errors).toEqual([]);
});

test('NMS workspace: list errors remain distinct from a confirmed empty response', async ({ page, fixtures }) => {
  const source = await mockNms(page); source.state.failList = true; await signIn(page, fixtures); await page.goto('/integrations/nms/devices');
  await expect(page.getByRole('alert').filter({ hasText: 'Cihaz listesi yüklenemedi.' })).toBeVisible();
  source.state.failList = false; source.state.rows = []; await page.getByRole('button', { name: 'Tekrar dene', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Cihaz listesi yüklenemedi.' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Cihaz listesi/ })).toContainText('0'); expect(source.saves).toEqual([]);
});

test('NMS workspace: cancel and changed credentials invalidate older probe results without saving', async ({ page, fixtures }, info) => {
  const source = await mockNms(page); await signIn(page, fixtures); await selectDevice(page); await page.locator('#snmpCommunity').fill('fixture-community');
  const gate = deferred(); source.state.holdProbe = gate;
  try { await probeButton(page).click(); await expect.poll(() => source.probes.length).toBe(1); await page.getByRole('button', { name: 'Testi iptal et', exact: true }).click(); } finally { gate.resolve(); }
  await expect(probePanel(page)).toContainText('Test iptal edildi.'); await expect(probePanel(page)).not.toContainText('SNMP yanıtı alındı');
  await probeButton(page).click(); await expect(probePanel(page)).toContainText('SNMP yanıtı alındı');
  await page.locator('#snmpCommunity').fill('fixture-replacement'); await expect(probePanel(page)).toContainText('Ayarlar değişti');
  await probeButton(page).click(); await expect(probePanel(page)).toContainText('SNMP yanıtı alındı');
  expect(source.probes.at(-1)).toMatchObject({ snmpCommunity: 'fixture-replacement', snmpVersion: 'v2c', deviceId: 'fixture-new-device' });
  expect(source.probes.at(-1)).not.toHaveProperty('sshPassword'); expect(source.saves).toEqual([]);
  await capture(page, info, 'nms-probe-current-settings'); expect(source.errors).toEqual([]);
});

test('NMS workspace: v3 failure is honest and optional testing permits a polling-disabled save', async ({ page, fixtures }, info) => {
  const source = await mockNms(page); source.state.probe = 'no_response'; await signIn(page, fixtures); await selectDevice(page);
  await page.locator('#snmpVersion').selectOption('v3'); await page.locator('#snmpV3Username').fill('fixture-user'); await page.locator('#snmpV3AuthPassword').fill('fixture-auth'); await page.locator('#snmpV3PrivacyPassword').fill('fixture-private');
  await probeButton(page).click(); await expect(probePanel(page)).toContainText('SNMP yanıtı alınamadı');
  expect(source.probes[0]).toMatchObject({ snmpVersion: 'v3', snmpV3PrivacyPassword: 'fixture-private' }); expect(source.probes[0]).not.toHaveProperty('snmpCommunity');
  await page.locator('#snmpV3SecurityLevel').selectOption('authNoPriv'); source.state.probe = 'error'; await probeButton(page).click(); await expect(probePanel(page)).toContainText('Test tamamlanamadı');
  expect(source.probes[1]).not.toHaveProperty('snmpV3PrivacyPassword'); await expect(page.locator('#snmpV3AuthPassword')).toHaveValue('fixture-auth');
  await page.getByRole('switch', { name: 'Kaydettikten sonra veri toplamayı başlat', exact: true }).click();
  const gate = deferred(); source.state.holdSave = gate;
  try {
    await page.getByRole('button', { name: 'İzleme ayarlarını kaydet', exact: true }).click(); await expect.poll(() => source.saves.length).toBe(1);
    await expect(page.getByRole('button', { name: 'Kaydediliyor…', exact: true })).toBeDisabled(); await page.keyboard.press('Enter'); expect(source.saves).toHaveLength(1);
    expect(source.saves[0]).toMatchObject({ pollingEnabled: false, snmpV3SecurityLevel: 'authNoPriv', sshPassword: null });
    expect(source.saves[0]).not.toHaveProperty('snmpV3PrivacyPassword'); await capture(page, info, 'nms-optional-test-polling-disabled-save');
  } finally { gate.resolve(); }
  await expect(page).toHaveURL(/\/integrations\/nms\/devices$/); expect(source.errors).toEqual([]);
});

test('NMS workspace: the real probe API rejects current read-only roles before parsing or transport', async ({ page, fixtures, prisma }) => {
  await signIn(page, fixtures);
  try {
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'VIEWER' } });
    const denied = await page.request.post('/api/integrations/nms/test-connection', { data: '{', headers: { 'content-type': 'application/json' } }); expect(denied.status()).toBe(403);
    await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } });
    const missing = await page.request.post('/api/integrations/nms/test-connection', { data: { deviceId: 'missing-fixture-device', managementIp: '192.0.2.1', snmpPort: 161, snmpVersion: 'v2c', snmpCommunity: 'fixture-community' } }); expect(missing.status()).toBe(404);
  } finally { await prisma.user.update({ where: { id: fixtures.userId }, data: { role: 'ADMIN' } }); }
});

for (const theme of ['light', 'dark']) {
  test(`NMS workspace: mobile ${theme} monitoring summary and setup test stay usable`, async ({ page, fixtures }, info) => {
    const source = await mockNms(page); await signIn(page, fixtures); await page.setViewportSize({ width: 390, height: 844 }); await page.clock.setFixedTime(fixture.NOW);
    await page.addInitScript(value => localStorage.setItem('theme', value), theme); await page.goto('/integrations/nms/devices');
    await page.getByRole('button', { name: 'TEST-KAPALI: ölçüm özetini aç', exact: true }).click(); const summary = page.getByRole('dialog');
    await expect(summary).toContainText('Doğrulanmıyor'); const bounds = await summary.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await capture(page, info, `nms-summary-mobile-${theme}`); await summary.getByRole('button', { name: 'Ölçüm özetini kapat', exact: true }).click();
    await selectDevice(page); await page.locator('#snmpCommunity').fill('fixture-community'); await expect(probeButton(page)).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await capture(page, info, `nms-setup-mobile-${theme}`); expect(source.saves).toEqual([]); expect(source.errors).toEqual([]);
  });
}
