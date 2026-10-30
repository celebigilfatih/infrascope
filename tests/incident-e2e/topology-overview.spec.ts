import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { test, signIn } from './fixtures';
import fixture from '../../scripts/fixtures/topology-workspace.cjs';

const buildings = ['hub', 'north', 'south', 'remote'].map((id, index) => ({
  id: `overview-${id}`, name: `TEST · ${['Merkez', 'Kuzey', 'Güney', 'Uzak konum'][index]}`,
  organizationId: 'test-org', city: 'Örnek konum', floors: [],
}));
const devices = buildings.map((building, index) => ({
  ...fixture.devices[0], id: `overview-device-${index}`, name: `TEST-OVERVIEW-${index}`,
  rack: null, buildingId: building.id, managementIp: `192.0.2.${100 + index}`, networkInterfaces: [],
}));
const physicalLinks = [
  { id: 'hub-north', source: 0, target: 1 },
  { id: 'hub-south', source: 0, target: 2 },
  { id: 'north-south', source: 1, target: 2 },
  { id: 'north-hub-backup', source: 1, target: 0 },
  { id: 'hub-remote', source: 0, target: 3 },
].map(({ id, source, target }) => ({
  id, sourceBuildingId: buildings[source].id, destBuildingId: buildings[target].id,
  sourceBuilding: buildings[source], destBuilding: buildings[target],
  connectionType: 'FIBER_SINGLE_MODE', status: 'UP', bandwidth: '10 Gbps', recordingMethod: 'MANUAL',
}));
const visiblePhysicalIds = physicalLinks.filter(link => link.id !== 'hub-remote').map(link => `building-conn-${link.id}`);

async function mockOverview(page: Page) {
  const writes: string[] = [], errors: string[] = [], edgeWarnings: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (/couldn.t create edge|couldn.t create.*handle/i.test(message.text())) edgeWarnings.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.clear());
  const payloads: Record<string, unknown> = {
    '/api/devices': devices,
    '/api/organizations': [{ ...fixture.organizations[0], buildings }],
    '/api/services': [], '/api/network-connections': [],
    '/api/building-connections': { items: physicalLinks },
    '/api/network/topology-status': { devices: [] },
    '/api/network/building-layout': { positions: {}, canEdit: false },
    '/api/network/topology-presentation': { document:null, revision:0, canEdit:false },
    '/api/network/groups': { canManage: false, items: [{
      id: 'overview-vpn', name: 'TEST · VPN grubu', kind: 'VPN', organizationId: 'test-org',
      sourceDeviceId: devices[0].id, sourcePortId: null,
      sourceDevice: { id: devices[0].id, name: devices[0].name, managementIp: devices[0].managementIp, buildingId: buildings[0].id },
      sourcePort: null, lineStatus: { status: 'UP', lastPolledAt: null },
      members: [{ buildingId: buildings[3].id, name: buildings[3].name }], positions: {}, version: 1,
    }] },
  };
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      if (pathname === '/api/auth/login') return route.continue();
      writes.push(`${request.method()} ${pathname}`);
      return route.fulfill({ status: 405, json: { success: false, error: 'Read-only overview fixture' } });
    }
    if (!(pathname in payloads)) return route.continue();
    return route.fulfill({ json: { success: true, data: payloads[pathname] } });
  });
  return { writes, errors, edgeWarnings };
}

const map = (page: Page) => page.getByRole('region', { name: 'Topoloji haritası', exact: true });
const overview = (page: Page) => page.getByRole('region', { name: 'Dengeli bina topolojisi', exact: true });
const expand = (page: Page) => page.getByRole('button', { name: 'Haritayı tam ekran yap', exact: true });
const restore = (page: Page) => page.getByRole('button', { name: 'Tam ekrandan çık', exact: true });

async function expectPhysicalPaths(scope: Locator, ids: string[]) {
  const edges = scope.locator('.react-flow__edge-buildingOverview');
  await expect(edges).toHaveCount(ids.length);
  await expect.poll(async () => edges.evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')?.replace(/^rf__edge-/, '')).sort())).toEqual([...ids].sort());
  for (const id of ids) {
    const path = scope.getByTestId(`rf__edge-${id}`).locator('path.react-flow__edge-path');
    await expect(path).toBeAttached();
    // A graph row or empty edge wrapper cannot stand in for a rendered connection.
    await expect.poll(async () => path.evaluate(element => {
      const length = (element as SVGPathElement).getTotalLength();
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      let visible = style.stroke !== 'none' && Number.parseFloat(style.strokeWidth) > 0 && Number(style.strokeOpacity) > 0;
      for (let parent: Element | null = element; parent; parent = parent.parentElement) {
        const computed = getComputedStyle(parent);
        if (computed.display === 'none' || computed.visibility === 'hidden' || Number(computed.opacity) === 0) visible = false;
      }
      return Number.isFinite(length) && length > 20 && bounds.width + bounds.height > 20 && visible;
    })).toBe(true);
  }
  await expect(scope.locator('.react-flow__edge-smoothstep')).toHaveCount(1);
  const logicalPath = scope.locator('.react-flow__edge-smoothstep path.react-flow__edge-path');
  await expect(logicalPath).toBeAttached();
  await expect.poll(() => logicalPath.evaluate(element => {
    const style = getComputedStyle(element);
    return (element as SVGPathElement).getTotalLength() > 20 && style.stroke !== 'none' && Number(style.opacity) > 0 && Number(style.strokeOpacity) > 0;
  })).toBe(true);
}

async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
}

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`building overview: ${viewport.name} direct fullscreen, button/Escape return and rendered connections`, async ({ page, fixtures }, info) => {
    await page.setViewportSize(viewport);
    const source = await mockOverview(page); await signIn(page, fixtures); await page.goto('/network');
    await expect(overview(page)).toBeVisible();
    await expect(expand(page)).toBeVisible(); await expect(expand(page)).toHaveText('Tam ekran');
    await expectPhysicalPaths(map(page), visiblePhysicalIds);
    await expect.poll(() => overview(page).evaluate(element => getComputedStyle(element.parentElement!).position)).toBe('relative');
    await capture(page, info, `${viewport.name}-normal`);
    for (const returnMethod of ['button', 'Escape']) {
      await expand(page).click(); await expect(restore(page)).toBeVisible();
      await expect.poll(() => overview(page).evaluate(element => {
        const workspace = element.parentElement!, bounds = workspace.getBoundingClientRect();
        return getComputedStyle(workspace).position === 'fixed' && bounds.left <= 20 && bounds.top <= 20 && bounds.right >= innerWidth - 20 && bounds.bottom >= innerHeight - 20;
      })).toBe(true);
      await expectPhysicalPaths(map(page), visiblePhysicalIds);
      // Resizing can move a node under the stationary desktop pointer, even at
      // the mobile viewport. Escape closes an active tooltip before the map.
      await page.mouse.move(0, 0); await expect(page.getByRole('tooltip')).toHaveCount(0);
      if (returnMethod === 'button') await capture(page, info, `${viewport.name}-fullscreen`);
      if (returnMethod === 'button') await restore(page).click(); else await restore(page).press('Escape');
      await expect(expand(page)).toBeVisible(); await expect(restore(page)).toHaveCount(0);
      await expect.poll(() => overview(page).evaluate(element => getComputedStyle(element.parentElement!).position)).toBe('relative');
      await expectPhysicalPaths(map(page), visiblePhysicalIds);
    }
    expect(source.writes).toEqual([]); expect(source.errors).toEqual([]); expect(source.edgeWarnings).toEqual([]);
  });
}

test('building overview: flat map preserves cross/parallel links, fullscreen and reload', async ({ page, fixtures }, info) => {
  const source = await mockOverview(page); await signIn(page, fixtures); await page.goto('/network');
  await expectPhysicalPaths(map(page), visiblePhysicalIds);
  await expand(page).click(); await expect(restore(page)).toBeVisible();
  await expectPhysicalPaths(map(page), visiblePhysicalIds);
  await restore(page).click(); await expect(expand(page)).toBeVisible(); await expectPhysicalPaths(map(page), visiblePhysicalIds);
  await page.reload(); await expect(expand(page)).toBeVisible();
  await expectPhysicalPaths(map(page), visiblePhysicalIds); await capture(page, info, 'all-connections-after-reload');
  expect(source.writes).toEqual([]); expect(source.errors).toEqual([]); expect(source.edgeWarnings).toEqual([]);
});

test('building overview: returning from a real group restores keyboard focus', async ({page,fixtures}) => {
  const state=await mockOverview(page);await signIn(page,fixtures);await page.goto('/network');
  const open=page.getByRole('button',{name:'TEST · VPN grubu: Grubu aç',exact:true});
  await open.press('Enter');await expect(page.getByRole('region',{name:'TEST · VPN grubu grup topolojisi'})).toBeVisible();
  await page.getByRole('button',{name:'Tüm ağa dön',exact:true}).click();await expect(open).toBeFocused();expect(state.writes).toEqual([]);
});
