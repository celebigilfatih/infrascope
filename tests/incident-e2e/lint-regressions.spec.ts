import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { installTestSession } from './session-fixtures';

async function sources(page: Page) {
  const reads: string[] = [], writes: string[] = [], errors: string[] = [];
  const service = { id: 'lint-service', name: 'TEST Service', type: 'HTTP', status: 'RUNNING', criticality: 'MEDIUM', port: 443, protocol: 'TCP', deviceId: 'lint-device', application: { id: 'lint-app', name: 'TEST App', vendor: 'Cisco' }, device: { id: 'lint-device', name: 'TEST Host' } };
  const dependency = { id: 'lint-dependency', sourceServiceId: service.id, targetDeviceId: 'lint-device', type: 'DEPENDS_ON', criticality: 'MEDIUM', description: null, createdAt: '2026-10-19T10:00:00Z', sourceService: service, targetDevice: service.device };
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== 'GET') {
      writes.push(request.method() + ' ' + url.pathname);
      return route.fulfill({ status: 405, json: { success: false, error: 'Read-only lint regression' } });
    }
    reads.push(url.pathname + url.search);
    if (url.pathname === '/api/services/workspace') return route.fulfill({ json: { success: true, source: 'database', readAt: new Date().toISOString(), canDelete: false, data: [{ ...service, createdAt: null, updatedAt: null, applicationId: service.application.id, dependencies: [] }] } });
    if (url.pathname === '/api/integrations/vmware') {
      const days = url.searchParams.get('days');
      return route.fulfill({ json: { trends: [{ resourceId: 'lint-host', resourceType: 'host', resourceName: `TEST CPU ${days}`, metricType: 'cpu', currentValue: '25', trendPercent: '1', status: 'normal', dataPoints: [] }] } });
    }
    if (url.pathname === '/api/services/dependencies') return route.fulfill({ json: { success: true, dependencies: [dependency] } });
    if (url.pathname === '/api/services') return route.fulfill({ json: { success: true, data: [service], services: [service] } });
    if (url.pathname === '/api/devices') return route.fulfill({ json: { success: true, data: [service.device], devices: [service.device] } });
    return route.fulfill({ json: { success: true, data: [], count: 0 } });
  });
  return { reads, writes, errors };
}

test('Lint: capacity callbacks keep the selected period on refresh and polling', async ({ page, fixtures }) => {
  const state = await sources(page);
  await installTestSession(page.context(), fixtures, 'ADMIN');
  await page.clock.install();
  await page.goto('/analytics/capacity');
  await expect(page.getByRole('cell', { name: 'TEST CPU 7', exact: true })).toBeVisible();
  const queries = () => state.reads.filter(url => url.startsWith('/api/integrations/vmware')).map(url => new URL(url, 'http://fixture').searchParams.get('days'));
  // The development server intentionally replays mount effects in Strict Mode.
  await expect.poll(queries).toEqual(['7', '7']);
  await page.getByRole('combobox').selectOption('30');
  await expect(page.getByRole('cell', { name: 'TEST CPU 30', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  await expect.poll(queries).toEqual(['7', '7', '30', '30']);
  await page.clock.fastForward(120000);
  await expect.poll(queries).toEqual(['7', '7', '30', '30', '30']);
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

test('Lint: dependency callbacks do not refetch on search renders', async ({ page, fixtures }) => {
  const state = await sources(page);
  await installTestSession(page.context(), fixtures, 'ADMIN');
  await page.goto('/services/dependencies');
  await expect(page.getByRole('cell', { name: 'TEST Service', exact: true })).toBeVisible();
  await page.getByPlaceholder('Servis ara...').fill('missing');
  await page.getByPlaceholder('Servis ara...').fill('TEST');
  await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  await expect.poll(() => state.reads.filter(url => url === '/api/services/dependencies').length).toBe(3);
  expect(state.reads.filter(url => url === '/api/services')).toHaveLength(2);
  expect(state.reads.filter(url => url === '/api/devices')).toHaveLength(2);
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

test('Lint: service workspace filtering keeps its loaded snapshot without another read', async ({ page, fixtures }) => {
  const state = await sources(page);
  await installTestSession(page.context(), fixtures, 'ADMIN');
  await page.goto('/services');
  const list = page.getByRole('region', { name: 'Servis listesi', exact: true });
  await expect(list).toHaveAttribute('aria-busy', 'false');
  const count = state.reads.filter(url => url === '/api/services/workspace').length;
  await page.getByLabel('Servis ve ilişkilerde ara', { exact: true }).fill('missing');
  await expect(page.getByRole('heading', { name: 'Filtrelere uygun servis yok' })).toBeVisible();
  await page.getByLabel('Servis ve ilişkilerde ara', { exact: true }).fill('TEST');
  await expect(list.getByRole('status')).toContainText('1 / 1 servis');
  expect(state.reads.filter(url => url === '/api/services/workspace')).toHaveLength(count);
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

test('Lint: navigation progress waits for the destination route', async ({ page, fixtures }) => {
  const state = await sources(page);
  await installTestSession(page.context(), fixtures, 'ADMIN');
  await page.goto('/services');
  await expect(page.getByRole('region', { name: 'Servis listesi', exact: true })).toHaveAttribute('aria-busy', 'false');
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/services/dependencies*', async route => {
    if (new URL(route.request().url()).pathname !== '/services/dependencies') return route.fallback();
    await gate; await route.continue();
  });
  try {
    await page.getByRole('navigation', { name: 'Uygulama bölümleri' }).getByRole('link', { name: 'Bağımlılıklar', exact: true }).click({ noWaitAfter: true });
    const progress = page.getByRole('progressbar', { name: 'Sayfa yükleniyor' });
    await expect(progress).toBeVisible();
    // Keep the destination pending beyond the completion delay.
    await expect.poll(() => progress.getAttribute('aria-valuenow')).not.toBe('10');
    await expect(progress).not.toHaveAttribute('aria-valuenow', '100');
    release();
    await expect(page).toHaveURL(/\/services\/dependencies$/);
    await expect(progress).toHaveCount(0);
  } finally { release(); }
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});
