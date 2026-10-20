import { expect, test, type Page } from '@playwright/test';
import { chooseOption } from './helpers/choose-option';

async function openCustom(page: Page) {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/StrinoBans/');
  await page.getByRole('tab', { name: 'Custom map pool', exact: true }).click();
}

async function libraryNames(page: Page) {
  return page.evaluate(() =>
    JSON.parse(
      localStorage.getItem('strinobans_preset_library_v1') ?? '{"entries":[]}'
    ).entries.map((entry: { preset: { name: string } }) => entry.preset.name)
  );
}

const blockOrder = (page: Page) =>
  page
    .locator('[data-block-id]')
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-block-id'))
    );

test('a reordered first actor stays repairable through its popup during disclosure expansion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await openCustom(page);
  await page
    .getByRole('button', { name: 'Advanced Settings', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Move block 1 down', exact: true })
    .click();
  const create = page.getByRole('button', {
    name: 'Create room from this draft',
    exact: true,
  });
  await expect(create).toBeDisabled();
  const first = page.locator('[data-block-index="0"]');
  const actor = first.getByRole('combobox', { name: 'Who Bans?', exact: true });
  await expect(actor).toHaveText('Team 2');
  await expect(
    page.getByRole('region', { name: 'Draft validation', exact: true })
  ).toContainText('Assign the first action to Team 1 (the first actor).');
  await actor.click();
  const team1 = page.getByRole('option', { name: 'Team 1', exact: true });
  await expect(team1).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole('option', { name: 'Team 2', exact: true })
  ).toBeInViewport({ ratio: 1 });
  await team1.click();
  await expect(actor).toHaveText('Team 1');
  await expect(actor).toBeFocused();
  await expect(create).toBeEnabled();
});

test('a short mobile library wraps unbroken names and scrolls to its last option', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 500 });
  await openCustom(page);
  await page
    .getByRole('button', {
      name: 'Browser preset library & JSON backup',
      exact: true,
    })
    .click();
  const names = [
    'W'.repeat(120),
    ...Array.from({ length: 7 }, (_, index) => `Saved rules ${index + 1}`),
  ];
  for (const [index, name] of names.entries()) {
    await page
      .getByRole('textbox', { name: 'Preset name', exact: true })
      .fill(name);
    await page
      .getByRole('button', { name: 'Save as new', exact: true })
      .click();
    await expect
      .poll(async () => (await libraryNames(page)).length)
      .toBe(index + 1);
  }
  const saved = page.getByRole('combobox', {
    name: 'Saved preset',
    exact: true,
  });
  await saved.click();
  await page.keyboard.press('Home');
  const longName = page.getByRole('option', { name: names[0], exact: true });
  await expect(longName).toBeInViewport({ ratio: 1 });
  expect(
    await longName.evaluate(
      (option) => option.scrollWidth <= option.clientWidth
    )
  ).toBe(true);
  expect(
    await longName.evaluate((option) => {
      const text = option.lastElementChild!;
      const bounds = text.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(text);
      return [...range.getClientRects()].every(
        (line) => line.left >= bounds.left - 1 && line.right <= bounds.right + 1
      );
    })
  ).toBe(true);
  await page.keyboard.press('End');
  const last = page.getByRole('option', { name: names.at(-1), exact: true });
  await expect(last).toBeInViewport({ ratio: 1 });
  await last.click();
  await expect(saved).toHaveText(names.at(-1)!);
  await expect(saved).toBeFocused();
});

test('a fresh tab cannot overwrite a newer library revision after loading an entry', async ({
  page,
  context,
}) => {
  await openCustom(page);
  await page
    .getByRole('textbox', { name: 'Preset name', exact: true })
    .fill('Original rules');
  await page
    .getByRole('button', {
      name: 'Browser preset library & JSON backup',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  await expect.poll(() => libraryNames(page)).toEqual(['Original rules']);
  const fresh = await context.newPage();
  await openCustom(fresh);
  await fresh
    .getByRole('button', {
      name: 'Browser preset library & JSON backup',
      exact: true,
    })
    .click();
  await chooseOption(fresh, 'Saved preset', 'Original rules');
  await fresh.getByRole('button', { name: 'Load / Edit', exact: true }).click();
  await fresh
    .getByRole('textbox', { name: 'Preset name', exact: true })
    .fill('Stale local edit');
  await page
    .getByRole('textbox', { name: 'Preset name', exact: true })
    .fill('Newer remote edit');
  await page
    .getByRole('button', { name: 'Overwrite selected', exact: true })
    .click();
  await expect.poll(() => libraryNames(fresh)).toEqual(['Newer remote edit']);
  await expect(
    fresh
      .getByRole('status')
      .filter({ hasText: /Library changed in another tab/ })
  ).toBeVisible();
  await fresh
    .getByRole('textbox', { name: 'Preset name', exact: true })
    .fill('Stale local edit after remote update');
  await fresh
    .getByRole('button', { name: 'Overwrite selected', exact: true })
    .click();
  await expect(
    fresh.getByRole('status').filter({
      hasText:
        /^(Saved over selected browser preset\.|The library changed in another tab\.)/,
    })
  ).toBeVisible();
  expect(await libraryNames(fresh)).toEqual(['Newer remote edit']);
  await expect(
    fresh.getByRole('textbox', { name: 'Preset name', exact: true })
  ).toHaveValue('Stale local edit after remote update');
});

test('hiding the editor cancels its drag without consuming outside keys or changing the draft', async ({
  page,
}) => {
  await openCustom(page);
  const advanced = page.getByRole('button', {
    name: 'Advanced Settings',
    exact: true,
  });
  await advanced.click();
  const original = await blockOrder(page);
  const first = page.getByRole('button', {
    name: 'Move block 1: ban',
    exact: true,
  });
  await first.focus();
  await first.press('Space');
  await first.press('ArrowDown');
  await expect(page.getByTestId('sequence-drag-preview')).toBeVisible();
  await advanced.click();
  await expect(page.getByTestId('sequence-drag-preview')).toHaveCount(0);
  const name = page.getByRole('textbox', { name: 'Preset name', exact: true });
  const beforeName = await name.inputValue();
  await name.focus();
  await name.press('End');
  await name.press('Space');
  await expect(name).toHaveValue(`${beforeName} `);
  await advanced.click();
  expect(await blockOrder(page)).toEqual(original);
  await first.focus();
  await first.press('Space');
  await first.press('ArrowDown');
  await page.getByRole('tab', { name: 'Preset formats', exact: true }).click();
  await expect(page.getByTestId('sequence-drag-preview')).toHaveCount(0);
  await page
    .getByRole('tab', { name: 'Preset formats', exact: true })
    .press('Space');
  await page.getByRole('tab', { name: 'Custom map pool', exact: true }).click();
  expect(await blockOrder(page)).toEqual(original);
  await expect(name).toHaveValue(`${beforeName} `);
});

test('grand-final import preview assigns both privileged bans to actual Team A', async ({
  page,
}) => {
  await openCustom(page);
  await page
    .getByRole('button', {
      name: 'Browser preset library & JSON backup',
      exact: true,
    })
    .click();
  await page
    .getByLabel('Import preset JSON', { exact: true })
    .setInputFiles('public/presets/grand-final-bo5.json');
  const preview = page.getByRole('region', { name: 'Imported preset preview' });
  await expect(preview).toBeVisible();
  const rows = preview.getByRole('listitem');
  expect((await rows.allTextContents()).slice(0, 2)).toEqual([
    expect.stringContaining('Team A'),
    expect.stringContaining('Team A'),
  ]);
  await expect(page).toHaveURL(/\/StrinoBans\/?$/);
});
