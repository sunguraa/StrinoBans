import { expect, test } from '@playwright/test';
import { APP, useOfflineTransport } from './room-helpers';

test('a maximum-length custom preset name stays visible without horizontal room overflow', async ({
  page,
  context,
}) => {
  await useOfflineTransport(context);
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(APP);
  await page.getByRole('tab', { name: 'Custom map pool', exact: true }).click();
  const name = 'Championship'.repeat(10);
  await page
    .getByRole('textbox', { name: 'Preset name', exact: true })
    .fill(name);
  await page
    .getByRole('button', { name: 'Create room from this draft', exact: true })
    .click();
  await page.waitForURL(/\/veto\?/);
  await expect(
    page.getByRole('heading', { name: 'Ready up', exact: true })
  ).toBeVisible();
  await expect(
    page.locator('main summary').getByText(name, { exact: true })
  ).toBeVisible();
  const bounds = await page
    .locator('main')
    .evaluate((main) => ({
      viewport: main.clientWidth,
      content: main.scrollWidth,
    }));
  expect(bounds.content).toBeLessThanOrEqual(bounds.viewport);
});
