import type { Page } from '@playwright/test';

export async function selectNmsDevice(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Cihaz adı veya IP ile ara', exact: true }).fill(name);
  await page.getByRole('option').filter({ hasText: name }).click();
}
