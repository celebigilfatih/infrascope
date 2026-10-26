import { expect, type Page } from '@playwright/test';

// Device maps are reached through a building; the global device tab is retired.
export async function openSavedTopology(page: Page) {
  await page.getByRole('tab', { name: 'Binalar', exact: true }).click();
  await page.getByRole('button', { name: 'Bina haritası seçenekleri', exact: true }).click();
  await page.getByRole('button', { name: 'Kayıtlı düzen / Düzenleme', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Topoloji haritası', exact: true })).toBeVisible();
  const map = page.getByRole('region', { name: 'Topoloji haritası', exact: true });
  await expect.poll(async () => {
    const toolbar = await map.locator('[data-topology-toolbar]').boundingBox();
    const graph = await map.locator('.react-flow').boundingBox();
    return !!toolbar && !!graph && toolbar.y + toolbar.height <= graph.y;
  }, { message: 'Labelled map tools must reserve space above the interactive graph' }).toBe(true);
}

export async function openBuildingDevices(page: Page, buildingName = 'TEST · Merkez bina') {
  await openSavedTopology(page);
  await page.getByRole('region', { name: 'Topoloji haritası', exact: true })
    .getByRole('button', { name: `${buildingName}: işlemler`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Binadaki cihazları aç', exact: true }).click();
  const workspace = page.getByRole('dialog', { name: buildingName, exact: true });
  await expect(workspace).toBeVisible();
  return workspace;
}
