import { expect, test } from '@playwright/test';
import {
  APP,
  readyBoth,
  seedLegacyRoom,
  useOfflineTransport,
} from './room-helpers';

test.beforeEach(async ({ context }) => useOfflineTransport(context));

test('an unsaved custom draft survives switching between setup tabs', async ({
  page,
}) => {
  await page.goto(APP);
  await page.getByRole('tab', { name: 'Custom map pool' }).click();
  await page
    .getByRole('textbox', { name: 'Preset name' })
    .fill('Unsaved captain draft');
  await page.getByRole('tab', { name: 'Preset formats' }).click();
  await page.getByRole('tab', { name: 'Custom map pool' }).click();
  await expect(page.getByRole('textbox', { name: 'Preset name' })).toHaveValue(
    'Unsaved captain draft'
  );
});

test('connected peers without a room-state holder receive a bounded recovery action', async ({
  page,
  context,
}) => {
  test.setTimeout(45_000);
  const room = crypto.randomUUID();
  await page.goto(`${APP}veto?s=${room}`);
  const other = await context.newPage();
  await other.goto(`${APP}veto?s=${room}`);
  for (const peer of [page, other]) {
    await expect(
      peer.getByRole('button', { name: 'Retry connection' })
    ).toBeVisible({ timeout: 25_000 });
    await expect(
      peer.getByRole('heading', { name: 'Ready up', exact: true })
    ).toHaveCount(0);
  }
});

test('reload does not revive an unconfirmed map-selection badge', async ({
  page,
  context,
}) => {
  const peers = await seedLegacyRoom(page, context, 'team-a');
  await readyBoth(peers);
  await expect(
    page.getByText('Your turn: ban a map', { exact: true })
  ).toBeVisible();
  const map = page.locator('main button[aria-pressed]').first();
  await map.click();
  await expect(map.locator('span.rounded-full')).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByText('Your turn: ban a map', { exact: true })
  ).toBeVisible();
  await expect(
    page
      .locator('main button[aria-pressed]')
      .first()
      .locator('span.rounded-full')
  ).toHaveCount(0);
});

test('page restoration republishes awareness before accepting a new map selection', async ({
  page,
  context,
}) => {
  const peers = await seedLegacyRoom(page, context, 'team-a');
  await readyBoth(peers);
  await expect(
    page.getByText('Your turn: ban a map', { exact: true })
  ).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent('pagehide', { persisted: true })
    );
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true })
    );
  });
  const map = page.locator('main button[aria-pressed]').first();
  await expect(map).toBeVisible();
  await map.click();
  await expect(map.locator('span.rounded-full')).toHaveCount(1);
});
