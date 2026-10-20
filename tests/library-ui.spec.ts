import { expect, test, type Page } from '@playwright/test';
import { chooseOption } from './helpers/choose-option';

async function openLibrary(page: Page, name: string) {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/StrinoBans/');
  await page.getByRole('tab', { name: 'Custom map pool' }).click();
  await page.getByRole('textbox', { name: 'Preset name' }).fill(name);
  await page
    .getByText('Browser preset library & JSON backup', { exact: true })
    .click();
}

async function names(page: Page) {
  return page.evaluate(() =>
    JSON.parse(
      localStorage.getItem('strinobans_preset_library_v1') ?? '{"entries":[]}'
    )
      .entries.map((entry: { preset: { name: string } }) => entry.preset.name)
      .sort()
  );
}

test('browser library survives reload and supports edit, duplicate, rename, deletion and JSON transfer', async ({
  page,
}) => {
  await openLibrary(page, 'Original browser rules');
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  await expect.poll(() => names(page)).toEqual(['Original browser rules']);
  await page.reload();
  await page.getByRole('tab', { name: 'Custom map pool' }).click();
  await page
    .getByText('Browser preset library & JSON backup', { exact: true })
    .click();
  await chooseOption(page, 'Saved preset', 'Original browser rules');
  await page.getByRole('button', { name: 'Load / Edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Preset name' })).toHaveValue(
    'Original browser rules'
  );
  await page
    .getByRole('textbox', { name: 'Library name' })
    .fill('Renamed browser rules');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect.poll(() => names(page)).toEqual(['Renamed browser rules']);
  await page
    .getByRole('textbox', { name: 'Library name' })
    .fill('Duplicate browser rules');
  await page
    .getByRole('button', { name: 'Duplicate with this name', exact: true })
    .click();
  await expect
    .poll(() => names(page))
    .toEqual(['Duplicate browser rules', 'Renamed browser rules']);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => names(page)).toEqual(['Renamed browser rules']);
  await page
    .getByRole('textbox', { name: 'Preset name' })
    .fill('Edited browser rules');
  await chooseOption(page, 'Saved preset', 'Renamed browser rules');
  await page
    .getByRole('button', { name: 'Overwrite selected', exact: true })
    .click();
  await expect.poll(() => names(page)).toEqual(['Edited browser rules']);
  const downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export draft JSON', exact: true })
    .click();
  const stream = await (await downloaded).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const json = Buffer.concat(chunks);
  await page
    .getByRole('textbox', { name: 'Preset name' })
    .fill('Temporary unsaved edit');
  await page.getByLabel('Import preset JSON').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: json,
  });
  await expect(
    page.getByRole('region', { name: 'Imported preset preview' })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Accept into draft', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Preset name' })).toHaveValue(
    'Edited browser rules'
  );
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'A preset with this name already exists.' })
  ).toBeVisible();
  expect(await names(page)).toEqual(['Edited browser rules']);
});

test('two tabs reject stale saved revisions without losing either draft or newer library data', async ({
  page,
  context,
}) => {
  await openLibrary(page, 'Initial rules');
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  await expect.poll(() => names(page)).toEqual(['Initial rules']);
  const other = await context.newPage();
  await openLibrary(other, 'Other draft');
  await chooseOption(other, 'Saved preset', 'Initial rules');
  await other.getByRole('button', { name: 'Load / Edit', exact: true }).click();
  await other.getByRole('textbox', { name: 'Preset name' }).fill('Newer rules');
  await other
    .getByRole('button', { name: 'Overwrite selected', exact: true })
    .click();
  await expect.poll(() => names(other)).toEqual(['Newer rules']);
  await page
    .getByRole('textbox', { name: 'Preset name' })
    .fill('Preserved draft');
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'The library changed in another tab.' })
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Preset name' })).toHaveValue(
    'Preserved draft'
  );
  expect(await names(page)).toEqual(['Newer rules']);
  await page
    .getByRole('button', { name: 'Refresh library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  await expect
    .poll(() => names(page))
    .toEqual(['Newer rules', 'Preserved draft']);
});
