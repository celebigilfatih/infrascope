import { expect, type Page } from '@playwright/test';
import { test, signIn } from './fixtures';
import fixture from '../../scripts/fixtures/topology-workspace.cjs';

const buildings = [{ id: 'edit-hub', name: 'TEST · Merkez bina', organizationId: 'test-org', floors: [] }, { id: 'edit-peer', name: 'TEST · Uzak bina', organizationId: 'test-org', floors: [] }];
const devices = ['one', 'two'].map((id, index) => ({ ...fixture.devices[0], id: `edit-${id}`, name: `TEST · Cihaz ${index + 1}`, rack: null, buildingId: buildings[0].id, managementIp: `192.0.2.${index + 1}` }));
type Failure = number | 'lost' | null;
async function mockEditing(page: Page, failure: Failure = null, deviceLink = false) {
  const positions: Record<string, { x: number; y: number }> = { 'building-edit-hub': { x: 100, y: 100 }, 'building-edit-peer': { x: 400, y: 200 } };
  const writes: string[] = [], records: Record<string, unknown>[] = [];
  let attempts = 0, layoutFailure = false;
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    if (pathname.startsWith('/api/auth/')) return route.continue();
    if (request.method() !== 'GET') {
      const body = request.postDataJSON(); writes.push(`${request.method()} ${pathname}`);
      if (pathname === '/api/network/building-layout') {
        if (layoutFailure) { layoutFailure = false; return route.fulfill({ status: 503, json: { success: false, error: 'Yerleşim kaydedilemedi.' } }); }
        positions[body.nodeId] = body.position;
        return route.fulfill({ json: { success: true, data: body } });
      }
      if (pathname === (deviceLink ? '/api/network/building-device-connections' : '/api/building-connections')) {
        attempts++;
        if (failure !== null && attempts === 1 && failure !== 'lost') return route.fulfill({ status: failure, json: { success: false, error: failure === 401 ? 'Oturum açmanız gerekiyor.' : failure === 403 ? 'Bağlantı oluşturma yetkiniz yok.' : 'Bağlantı kaydedilemedi.' } });
        if (!records.length) records.push(deviceLink ? { ...body, id: 'edit-link', sourcePortName: 'Gi1', targetPortName: 'Gi2', status: 'UNKNOWN', recordKind: 'device-link' } : { ...body, id: 'edit-link', status: 'UNKNOWN' });
        if (failure === 'lost' && attempts === 1) return route.abort('connectionreset');
        return route.fulfill({ json: { success: true, data: deviceLink ? { connection: records[0] } : records[0] } });
      }
      return route.fulfill({ status: 405, json: { success: false, error: 'Unexpected fixture write' } });
    }
    const payloads: Record<string, unknown> = {
      '/api/devices': devices, '/api/organizations': [{ ...fixture.organizations[0], buildings }],
      '/api/services': [], '/api/network-connections': [], '/api/building-connections': { items: deviceLink ? [] : records },
      '/api/network/topology-status': { devices: [] }, '/api/network/groups': { canManage: true, items: [] },
      '/api/network/building-layout': { positions, canEdit: true },
      '/api/network/building-devices': { devices, connections: deviceLink ? records : [], canManage: true },
      '/api/network/building-device-layout': { positions: {}, canEdit: true },
      '/api/network/building-device-connections': { ports: {
        'edit-one': [{ id: 'switch:one', name: 'Gi1', kind: 'switch', occupied: false }],
        'edit-two': [{ id: 'switch:two', name: 'Gi2', kind: 'switch', occupied: false }],
      } },
    };
    if (!(pathname in payloads)) return route.continue();
    if (pathname === '/api/network/building-devices' && url.searchParams.get('mode') === 'candidates') {
      return route.fulfill({ json: { success: true, data: { items: [], total: 0, page: 1 } } });
    }
    return route.fulfill({ json: { success: true, data: payloads[pathname] } });
  });
  return { positions, writes, records, failLayout: () => { layoutFailure = true; } };
}

test('topology editing: same canvas, autosave failure/retry and reload retain positions', async ({ page, fixtures }) => {
  const state = await mockEditing(page); await signIn(page, fixtures); await page.goto('/network');
  const map = page.getByRole('region', { name: 'Topoloji haritası', exact: true });
  const node = map.locator('[data-id="building-edit-hub"]');
  await expect(node).toBeVisible(); await expect(page.getByRole('button', { name: 'Bağlantı ekle', exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]);
  await page.getByRole('button', { name: 'Düzenleme', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bağlantı ekle', exact: true })).toBeVisible();
  state.failLayout();
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 25); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + 65, { steps: 8 }); await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Yeniden dene', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const moved = await node.getAttribute('style');
  await page.getByRole('button', { name: 'Yeniden dene', exact: true }).click();
  await expect(page.getByText('Yerleşim kaydedildi', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Görüntüleme', exact: true }).click();
  await expect(node).toHaveAttribute('style', moved!);
  await page.reload(); await expect(node).toHaveAttribute('style', moved!);
  await expect(page.getByRole('button', { name: 'Düzenleme', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

for (const failure of [503, 401, 403, 'lost'] as const) {
  test(`topology editing: building create ${failure} keeps draft and retries safely`, async ({ page, fixtures }) => {
    const state = await mockEditing(page, failure); await signIn(page, fixtures); await page.goto('/network');
    await page.getByRole('button', { name: 'Düzenleme', exact: true }).click();
    await page.getByRole('button', { name: 'Bağlantı ekle', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Bina Bağlantısı Ekle' });
    await form.locator('#sourceBuilding').click(); await page.getByRole('option', { name: buildings[0].name, exact: true }).click();
    await form.locator('#destBuilding').click(); await page.getByRole('option', { name: buildings[1].name, exact: true }).click();
    await form.locator('#notes').fill('TEST · bağlantı taslağı');
    const save = form.getByRole('button', { name: 'Bağlantı Oluştur', exact: true });
    await save.click(); await expect(save).toBeEnabled();
    await expect(form.locator('#notes')).toHaveValue('TEST · bağlantı taslağı');
    await expect(form.locator('#sourceBuilding')).toContainText(buildings[0].name);
    await expect(form.locator('#destBuilding')).toContainText(buildings[1].name);
    if (failure !== 'lost') expect(state.records).toHaveLength(0);
    await save.click(); await expect(form).toHaveCount(0); expect(state.records).toHaveLength(1);
    expect(state.records[0].status).toBe('UNKNOWN');
  });
  test(`topology editing: device create ${failure} keeps selections and retries safely`, async ({ page, fixtures }) => {
    const state = await mockEditing(page, failure, true); await signIn(page, fixtures); await page.goto('/network');
    await page.getByRole('region', { name: 'Topoloji haritası', exact: true }).locator('[data-id="building-edit-hub"]').click();
    const workspace = page.getByRole('dialog', { name: 'TEST · Merkez bina' });
    await workspace.getByRole('button', { name: 'Düzenleme', exact: true }).click();
    await workspace.getByRole('button', { name: 'Bağlantı ekle', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Cihazları bağla' });
    await form.locator('#device-link-source').selectOption(devices[0].id); await form.locator('#device-link-target').selectOption(devices[1].id);
    await form.locator('#device-link-source-port').selectOption('switch:one'); await form.locator('#device-link-target-port').selectOption('switch:two');
    await form.locator('#device-link-speed').selectOption('10 Gbps');
    const save = form.getByRole('button', { name: 'Bağlantıyı kaydet', exact: true });
    await save.click(); await expect(form.getByRole('alert')).toBeVisible();
    await expect(form.locator('#device-link-source-port')).toHaveValue('switch:one'); await expect(form.locator('#device-link-target-port')).toHaveValue('switch:two');
    if (failure !== 'lost') expect(state.records).toHaveLength(0);
    await save.click(); await expect(form).toHaveCount(0); expect(state.records).toHaveLength(1);
  });
}

test('topology editing: fresh camera retains search focus after viewport capture', async ({ page, fixtures }) => {
  const state = await mockEditing(page); state.positions['building-edit-peer'] = { x: 4000, y: 200 };
  await signIn(page, fixtures); await page.goto('/network');
  const camera = page.getByRole('region', { name: 'Topoloji haritası', exact: true }).locator('.react-flow__viewport');
  await expect.poll(() => camera.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a)).toBeLessThan(.5);
  await page.getByRole('combobox', { name: 'Topolojide bina veya cihaz ara' }).fill(buildings[0].name);
  await page.getByRole('option', { name: `${buildings[0].name} Bina`, exact: true }).click();
  await expect.poll(() => camera.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a)).toBeGreaterThan(.85);
  await page.waitForTimeout(400);
  expect(await camera.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a)).toBeGreaterThan(.85);
  expect(state.writes).toEqual([]);
});

test('topology editing: real fullscreen and portalled forms, denied fallback and Esc', async ({ page, fixtures }) => {
  await mockEditing(page); await signIn(page, fixtures); await page.goto('/network');
  await page.getByRole('button', { name: 'Haritayı tam ekran yap', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await page.getByRole('button', { name: 'Düzenleme', exact: true }).click(); await page.getByRole('button', { name: 'Bağlantı ekle', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Bina Bağlantısı Ekle' }); await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Pencereyi kapat', exact: true }).click();
  await page.getByRole('button', { name: 'Tam ekrandan çık', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBe(null);
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error('Denied fixture')); });
  await page.getByRole('button', { name: 'Haritayı tam ekran yap', exact: true }).click();
  await expect(page.getByText('Tarayıcı tam ekranı kullanılamadı; harita sayfa içinde büyütüldü.')).toBeVisible();
  await page.getByRole('button', { name: 'Tam ekrandan çık', exact: true }).press('Escape');
  await expect(page.getByRole('button', { name: 'Haritayı tam ekran yap', exact: true })).toBeVisible();
});

test('topology editing: device fallback explains unavailable native fullscreen in active dialog', async ({ page, fixtures }) => {
  await mockEditing(page); await signIn(page, fixtures); await page.goto('/network');
  await page.getByRole('region', { name: 'Topoloji haritası', exact: true }).locator('[data-id="building-edit-hub"]').click();
  const workspace = page.getByRole('dialog', { name: 'TEST · Merkez bina' });
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error('Denied fixture')); });
  await workspace.getByRole('button', { name: 'Haritayı tam ekran yap', exact: true }).click();
  await expect(workspace.getByText('Tarayıcı tam ekranı kullanılamadı; harita sayfa içinde büyütüldü.')).toBeVisible();
  await workspace.getByRole('button', { name: 'Tam ekrandan çık', exact: true }).click();
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  for (const mode of ['normal', 'native-workspace', 'native-overview', 'denied', 'unavailable'] as const) {
    test(`topology closing: ${viewport.name} ${mode} restores the normal overview`, async ({ page, fixtures }, info) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const state = await mockEditing(page);
      state.records.push({
        id: 'edit-existing-link', sourceBuildingId: buildings[0].id, destBuildingId: buildings[1].id,
        sourceBuilding: buildings[0], destBuilding: buildings[1], connectionType: 'FIBER_SINGLE_MODE',
        status: 'UNKNOWN', bandwidth: '1 Gbps', recordingMethod: 'MANUAL',
      });
      await signIn(page, fixtures); await page.goto('/network');
      const overview = page.getByRole('region', { name: 'Dengeli bina topolojisi', exact: true });
      const map = page.getByRole('region', { name: 'Topoloji haritası', exact: true });
      const path = map.getByTestId('rf__edge-building-conn-edit-existing-link').locator('path.react-flow__edge-path');
      await expect(path).toBeVisible();
      if (mode === 'native-overview') {
        await overview.getByRole('button', { name: 'Haritayı tam ekran yap', exact: true }).click();
        await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
      }
      await map.locator('[data-id="building-edit-hub"]').click();
      const workspace = page.getByRole('dialog', { name: buildings[0].name, exact: true });
      await expect(workspace.getByRole('button', { name: 'Cihaz ata', exact: true })).toBeEnabled();
      if (mode === 'denied') {
        await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error('Denied fixture')); });
      } else if (mode === 'unavailable') {
        await page.evaluate(() => { Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true }); });
      }
      if (mode !== 'normal' && mode !== 'native-overview') {
        await workspace.getByRole('button', { name: 'Haritayı tam ekran yap', exact: true }).click();
      }
      if (mode.startsWith('native-')) {
        await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
      } else if (mode !== 'normal') {
        await expect(workspace.getByText('Tarayıcı tam ekranı kullanılamadı; harita sayfa içinde büyütüldü.')).toBeVisible();
      }
      await workspace.getByRole('button', { name: 'Bina görünümünü kapat', exact: true }).click();
      await expect(workspace).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.fullscreenElement), { timeout: 5000 }).toBe(null);
      await expect(page.getByRole('button', { name: 'Tam ekrandan çık', exact: true })).toHaveCount(0);
      await expect(overview.getByRole('button', { name: 'Haritayı tam ekran yap', exact: true })).toBeVisible();
      await expect(page.getByText('Tarayıcı tam ekranı kullanılamadı; harita sayfa içinde büyütüldü.')).toHaveCount(0);
      const heading = await page.getByRole('heading', { name: 'Ağ topolojisi', exact: true }).boundingBox();
      expect(heading).not.toBeNull();
      await expect.poll(async () => (await overview.boundingBox())?.y ?? -1).toBeGreaterThan(heading!.y + heading!.height);
      await expect(path).toBeVisible();
      expect(await path.evaluate(element => (element as SVGPathElement).getTotalLength())).toBeGreaterThan(20);
      await info.attach(`closed-${viewport.name}-${mode}`, { body: await page.screenshot(), contentType: 'image/png' });
      expect(state.writes).toEqual([]);
    });
  }
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`topology header controls: ${viewport.name} close and assignment stay separate in normal/fullscreen`, async ({ page, fixtures }, info) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = await mockEditing(page);
    await signIn(page, fixtures); await page.goto('/network');
    await page.getByRole('region', { name: 'Topoloji haritası', exact: true }).locator('[data-id="building-edit-hub"]').click();
    const workspace = page.getByRole('dialog', { name: buildings[0].name, exact: true });
    const close = workspace.getByRole('button', { name: 'Bina görünümünü kapat', exact: true });
    const assign = workspace.getByRole('button', { name: 'Cihaz ata', exact: true });
    for (const mode of ['normal', 'fullscreen', 'return'] as const) {
      if (mode === 'fullscreen') {
        await workspace.getByRole('button', { name: 'Haritayı tam ekran yap', exact: true }).click();
        await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
      } else if (mode === 'return') {
        await workspace.getByRole('button', { name: 'Tam ekrandan çık', exact: true }).press('Escape');
        await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBe(null);
      }
      await expect(assign).toBeEnabled();
      await expect.poll(async () => {
        const a = await assign.boundingBox(), b = await close.boundingBox();
        if (!a || !b) return -1;
        return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
          * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      }, { timeout: 5000, message: `${mode}: close must not overlap the assignment action` }).toBe(0);
      for (const control of [close, assign]) {
        await expect(control).toBeVisible();
        expect(await control.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
            && [.15, .85].every(fraction => element.contains(document.elementFromPoint(rect.left + rect.width * fraction, rect.top + rect.height / 2)));
        }), `${mode}: both sides of each labelled control must receive pointer input`).toBe(true);
      }
      await info.attach(`header-${viewport.name}-${mode}`, { body: await workspace.screenshot(), contentType: 'image/png' });
      await assign.click();
      await expect(workspace.getByRole('textbox', { name: 'Atanacak cihazlarda ara', exact: true })).toBeVisible();
      await workspace.getByRole('button', { name: 'Cihaz görünümüne dön', exact: true }).click();
    }
    await close.click(); await expect(workspace).toHaveCount(0);
    expect(state.writes).toEqual([]);
  });
}
