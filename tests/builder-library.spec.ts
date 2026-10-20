import { test, expect } from '@playwright/test';
import { chooseOption } from './helpers/choose-option';
import type { VetoPreset } from '../src/types/preset';
import { createTemplateSteps, validatePreset } from '../src/lib/preset-rules';
import {
  changePresetLibrary,
  compileSequenceBlocks,
  exportPresetJson,
  importPresetJson,
  MAX_PRESET_JSON_BYTES,
  moveSequenceBlock,
  PRESET_LIBRARY_KEY,
  readPresetLibrary,
  type LibraryStorage,
  type SequenceBlock,
} from '../src/lib/preset-library';

function preset(name = 'Example'): VetoPreset {
  return {
    id: 'example',
    name,
    author: 'Test organizer',
    description: 'Regression definition',
    updatedAt: '2026-10-19T00:00:00.000Z',
    ruleset: 'custom',
    schemaVersion: 1,
    sequencePattern: 'manual',
    format: 'bo3',
    mapPool: [
      'area-88',
      'base-404',
      'cauchy-street',
      'le-brun-city',
      'ocarnus',
      'space-lab',
      'windy-town',
    ],
    firstActorMode: 'coinflip',
    steps: createTemplateSteps('standard', 'bo3', 7),
    pickBanTimerSeconds: 30,
    sideTimerSeconds: 20,
    timerEnforcement: 'none',
  };
}
function memoryStorage(initial: string | null = null) {
  let raw = initial;
  const storage: LibraryStorage = {
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  };
  return storage;
}

test('atomic reordering preserves identity, pairs immediate sides, and renumbers picks', () => {
  const blocks: SequenceBlock[] = [
    { id: 'ban-a', type: 'ban', team: 'a', sideTeam: 'b' },
    { id: 'pick-a', type: 'pick', team: 'a', sideTeam: 'b' },
    { id: 'ban-b', type: 'ban', team: 'b', sideTeam: 'a' },
    { id: 'pick-b', type: 'pick', team: 'b', sideTeam: 'a' },
    { id: 'ban-c', type: 'ban', team: 'a', sideTeam: 'b' },
    { id: 'ban-d', type: 'ban', team: 'b', sideTeam: 'a' },
  ];
  const reordered = moveSequenceBlock(blocks, 'pick-b', 0);
  expect(reordered[0]).toBe(blocks[3]);
  expect(blocks[0].id).toBe('ban-a');
  expect(moveSequenceBlock(blocks, 'missing', 0)).toBe(blocks);
  expect(moveSequenceBlock(blocks, 'ban-a', -1)).toBe(blocks);
  const steps = compileSequenceBlocks(reordered, 'b');
  expect(steps.slice(0, 2)).toEqual([
    { type: 'pick', team: 'b' },
    { type: 'side', team: 'a', forPickIndex: 0 },
  ]);
  expect(
    steps
      .filter((step) => step.forPickIndex !== undefined)
      .map((step) => step.forPickIndex)
  ).toEqual([0, 1]);
  expect(steps.at(-1)).toEqual({ type: 'side', team: 'b', forDecider: true });
  expect(validatePreset({ ...preset(), steps }).preset).toBeNull();
  const validOrder = moveSequenceBlock(blocks, 'pick-a', 0);
  expect(
    validatePreset({
      ...preset(),
      steps: compileSequenceBlocks(validOrder, 'b'),
    }).errors
  ).toEqual([]);
  const invalid = validOrder.map((block) =>
    block.id === 'pick-a' ? { ...block, sideTeam: block.team } : block
  );
  expect(
    validatePreset({ ...preset(), steps: compileSequenceBlocks(invalid, 'b') })
      .preset
  ).toBeNull();
});

test('library CRUD retains stable IDs and creation timestamps, with explicit collision decisions', () => {
  const storage = memoryStorage();
  const initial = readPresetLibrary(storage);
  const saved = changePresetLibrary(storage, initial, {
    type: 'save',
    id: 'library-a',
    preset: preset(),
  });
  expect(saved.library.revision).toBe(1);
  const original = saved.library.entries[0];
  expect(() =>
    changePresetLibrary(storage, saved, {
      type: 'save',
      id: 'library-a',
      preset: preset('Edited'),
    })
  ).toThrow(/Overwrite|overwrite/);
  expect(() =>
    changePresetLibrary(storage, saved, {
      type: 'save',
      id: 'library-b',
      preset: preset(),
    })
  ).toThrow(/name already exists/);
  const edited = changePresetLibrary(storage, saved, {
    type: 'save',
    id: 'library-a',
    preset: preset('Edited'),
    overwrite: true,
  });
  expect(edited.library.entries[0].id).toBe(original.id);
  expect(edited.library.entries[0].createdAt).toBe(original.createdAt);
  const duplicate = changePresetLibrary(storage, edited, {
    type: 'duplicate',
    id: 'library-a',
    newId: 'library-b',
    name: 'Copy',
  });
  const renamed = changePresetLibrary(storage, duplicate, {
    type: 'rename',
    id: 'library-b',
    name: 'Renamed copy',
  });
  expect(renamed.library.entries.map((entry) => entry.preset.name)).toEqual([
    'Edited',
    'Renamed copy',
  ]);
  const deleted = changePresetLibrary(storage, renamed, {
    type: 'delete',
    id: 'library-a',
  });
  expect(readPresetLibrary(storage).library).toEqual(deleted.library);
  expect(deleted.library.entries.map((entry) => entry.id)).toEqual([
    'library-b',
  ]);
});

test('malformed and unknown storage remains byte-for-byte intact and cannot be overwritten', () => {
  for (const raw of [
    '{broken',
    '{"version":9,"private":"preserve"}',
    '{"version":1,"revision":0,"entries":[{}]}',
  ]) {
    const storage = memoryStorage(raw);
    const snapshot = readPresetLibrary(storage);
    expect(snapshot.error).toBeTruthy();
    expect(snapshot.raw).toBe(raw);
    expect(() =>
      changePresetLibrary(storage, snapshot, {
        type: 'save',
        id: 'new',
        preset: preset(),
      })
    ).toThrow(/read-only/);
    expect(storage.getItem(PRESET_LIBRARY_KEY)).toBe(raw);
  }
});

test('stale tabs and quota failures preserve current storage and caller draft', () => {
  const storage = memoryStorage();
  const stale = readPresetLibrary(storage);
  const draft = preset();
  const saved = changePresetLibrary(storage, stale, {
    type: 'save',
    id: 'a',
    preset: draft,
  });
  expect(() =>
    changePresetLibrary(storage, stale, {
      type: 'save',
      id: 'b',
      preset: preset('Other'),
    })
  ).toThrow(/another tab/);
  expect(storage.getItem(PRESET_LIBRARY_KEY)).toBe(saved.raw);
  const disabled: LibraryStorage = {
    getItem: storage.getItem,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  expect(() =>
    changePresetLibrary(disabled, saved, {
      type: 'save',
      id: 'b',
      preset: preset('Other'),
    })
  ).toThrow(/full or disabled/);
  expect(draft).toEqual(preset());
  expect(storage.getItem(PRESET_LIBRARY_KEY)).toBe(saved.raw);
  expect(
    readPresetLibrary({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    }).error
  ).toBeTruthy();
});

test('JSON import validates unknown data, enforces byte limit, and exports definition only', () => {
  const payload = {
    ...preset(),
    roomId: 'secret-room',
    token: 'secret',
    participants: ['captain'],
    history: ['action'],
  };
  const imported = importPresetJson(JSON.stringify(payload));
  const exported = JSON.parse(exportPresetJson(imported));
  expect(exported.name).toBe('Example');
  expect(exported.steps).toEqual(preset().steps);
  for (const field of [
    'roomId',
    'token',
    'participants',
    'history',
    'revision',
    'createdAt',
  ])
    expect(exported).not.toHaveProperty(field);
  expect(() => importPresetJson(' '.repeat(MAX_PRESET_JSON_BYTES + 1))).toThrow(
    /too large/
  );
  expect(() => importPresetJson('not json')).toThrow(/not valid JSON/);
  for (const value of [
    null,
    [],
    { ...preset(), format: 'custom' },
    { ...preset(), pickBanTimerSeconds: 29 },
    { ...preset(), sideTimerSeconds: 19 },
    { ...preset(), mapPool: ['area-88', 'area-88'] },
  ])
    expect(() => importPresetJson(JSON.stringify(value))).toThrow();
  const storage = memoryStorage();
  const saved = changePresetLibrary(storage, readPresetLibrary(storage), {
    type: 'save',
    id: 'a',
    preset: imported,
  });
  expect(() =>
    changePresetLibrary(storage, saved, {
      type: 'save',
      id: 'b',
      preset: imported,
    })
  ).toThrow(/name already exists/);
  expect(saved.library.entries).toHaveLength(1);
});

test('template gates do not prohibit valid manual even-pool sequences', () => {
  expect(() => createTemplateSteps('standard', 'bo5', 8)).toThrow(/seven maps/);
  expect(() => createTemplateSteps('picks-first', 'bo1', 7)).toThrow();
  const pool = [...preset().mapPool, 'cosmite'];
  const manual = {
    ...preset(),
    format: 'bo5',
    mapPool: pool,
    steps: createTemplateSteps('picks-first', 'bo5', 8),
  };
  expect(validatePreset(manual).errors).toEqual([]);
});

test('builder preserves stale edits and keyboard reorder focus while preventing invalid creation', async ({
  page,
}) => {
  const create = page.getByRole('button', {
    name: 'Create room from this draft',
  });
  for (const width of [1280, 390]) {
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await test.step(`${width}px, ${reducedMotion}`, async () => {
        await page.setViewportSize({ width, height: 720 });
        await page.emulateMedia({ reducedMotion });
        await page.goto('/StrinoBans/');
        await page.getByRole('tab', { name: 'Custom map pool' }).click();
        await expect(create).toBeEnabled();
        await page
          .getByRole('button', { name: 'Advanced Settings', exact: true })
          .click();
        const rows = page.locator('[data-block-id]');
        const before = await rows.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-block-id'))
        );
        const firstId = before[0];
        const movedRow = page.locator(`[data-block-id="${firstId}"]`);
        const handle = movedRow.getByRole('button', {
          name: /^Move block \d+: ban$/,
        });
        await expect(handle).toHaveAccessibleDescription(
          /Space[\s\S]*arrow[\s\S]*Escape/i
        );
        await handle.focus();
        expect(
          await page.locator('main').evaluate((element) => element.scrollTop)
        ).toBeGreaterThan(0);
        await handle.press('Space');
        await handle.press('ArrowDown');
        await handle.press('Space');
        await expect(movedRow).toHaveAttribute('data-block-index', '1');
        await expect(handle).toBeFocused();
        expect(
          await rows.evaluateAll((elements) =>
            elements.map((element) => element.getAttribute('data-block-id'))
          )
        ).toEqual([before[1], before[0], ...before.slice(2)]);
        const order = await rows.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-block-id'))
        );
        await handle.press('Space');
        await handle.press('ArrowDown');
        await handle.press('Escape');
        await expect(page.getByTestId('sequence-drag-preview')).toHaveCount(0);
        expect(
          await rows.evaluateAll((elements) =>
            elements.map((element) => element.getAttribute('data-block-id'))
          )
        ).toEqual(order);
        await expect(handle).toBeFocused();
        await handle.press('Space');
        await handle.press('ArrowDown');
        await handle.press('ArrowDown');
        await handle.press('ArrowUp');
        await handle.press('ArrowDown');
        await handle.press('Enter');
        await expect(movedRow).toHaveAttribute('data-block-index', '3');
        await expect(handle).toBeFocused();
        await expect(page.getByTestId('sequence-drag-preview')).toHaveCount(0);
        await handle.press('Space');
        await handle.press('ArrowUp');
        await handle.press('ArrowUp');
        await handle.press('ArrowUp');
        await handle.press('Tab');
        await expect(movedRow).toHaveAttribute('data-block-index', '0');
        expect(
          await rows.evaluateAll((elements) =>
            elements.map((element) => element.getAttribute('data-block-id'))
          )
        ).toEqual(before);
        await expect(handle).toBeFocused();
        await expect(page.getByTestId('sequence-drag-preview')).toHaveCount(0);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
      });
    }
  }
  await chooseOption(page, 'Series', 'BO5');
  await expect(create).toBeDisabled();
  await expect(
    page.getByText('Your sequence is stale.', { exact: false })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Keep sequence and validate' })
    .click();
  await expect(create).toBeDisabled();
  await expect(
    page.getByRole('region', { name: 'Draft validation' })
  ).toBeVisible();
});

test('pointer drag shows a moving preview and reorders a pick with its side', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1200 });
  await page.goto('/StrinoBans/');
  await page.getByRole('tab', { name: 'Custom map pool' }).click();
  await page
    .getByRole('button', { name: 'Advanced Settings', exact: true })
    .click();
  const editor = page.getByRole('region', { name: 'Edit sequence' });
  const before = await editor
    .locator('[data-block-id]')
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-block-id'))
    );
  const side = await editor
    .getByRole('combobox', { name: 'Who chooses Side?', exact: true })
    .first()
    .innerText();
  const source = page.getByRole('button', {
    name: 'Move block 3: pick',
    exact: true,
  });
  const target = page.getByRole('button', {
    name: 'Move block 4: pick',
    exact: true,
  });
  await target.hover();
  await source.hover();
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 8);
  const preview = page.getByTestId('sequence-drag-preview');
  await expect(preview).toBeVisible();
  const initial = (await preview.boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 10,
  });
  await expect
    .poll(async () => (await preview.boundingBox())!.y)
    .toBeGreaterThan(initial.y + 50);
  await expect(editor.locator('[data-drop-edge=\"after\"]')).toHaveCount(1);
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  const expected = [...before];
  const [picked] = expected.splice(2, 1);
  expected.splice(3, 0, picked);
  await expect
    .poll(() =>
      editor
        .locator('[data-block-id]')
        .evaluateAll((rows) =>
          rows.map((row) => row.getAttribute('data-block-id'))
        )
    )
    .toEqual(expected);
  await expect(
    editor
      .getByRole('combobox', { name: 'Who chooses Side?', exact: true })
      .nth(1)
  ).toHaveText(side);
  await expect(
    page.getByRole('button', { name: 'Create room from this draft' })
  ).toBeEnabled();
});

test('failed browser save keeps the editable draft and never reports success', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'strinobans_preset_library_v1')
        throw new DOMException('Quota reached', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/StrinoBans/');
  await page.getByRole('tab', { name: 'Custom map pool' }).click();
  await page.getByLabel('Preset name', { exact: true }).fill('Keep this draft');
  await page
    .getByText('Browser preset library & JSON backup', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'browser storage is full or disabled' })
  ).toBeVisible();
  await expect(page.getByLabel('Preset name', { exact: true })).toHaveValue(
    'Keep this draft'
  );
  await expect(
    page.getByRole('button', { name: 'Create room from this draft' })
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('strinobans_preset_library_v1')
    )
  ).toBeNull();
});

test('legacy import preview materializes the actual sequence without changing timer defaults', () => {
  const legacy = {
    ...preset(),
    schemaVersion: undefined,
    sequencePattern: undefined,
    steps: undefined,
    pickBanTimerSeconds: null,
    sideTimerSeconds: null,
  };
  const imported = importPresetJson(JSON.stringify(legacy));
  expect(imported.steps).toEqual(
    createTemplateSteps('legacy-split-bans', 'bo3', 7)
  );
  expect(imported.sequencePattern).toBe('legacy-split-bans');
  expect(imported.pickBanTimerSeconds).toBeNull();
  expect(imported.sideTimerSeconds).toBeNull();
  expect(validatePreset(imported).errors).toEqual([]);
});

test('touch drag reorders a pick and its side choice on a narrow screen', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 900 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto(
      new URL(
        '/StrinoBans/',
        test.info().project.use.baseURL as string
      ).toString()
    );
    await page.getByRole('tab', { name: 'Custom map pool' }).click();
    await page
      .getByRole('button', { name: 'Advanced Settings', exact: true })
      .click();
    const editor = page.getByRole('region', { name: 'Edit sequence' });
    const before = await editor
      .locator('[data-block-id]')
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-block-id'))
      );
    const chooser = await editor
      .getByRole('combobox', { name: 'Who chooses Side?', exact: true })
      .first()
      .innerText();
    const source = page.getByRole('button', {
      name: 'Move block 3: pick',
      exact: true,
    });
    const target = page.getByRole('button', {
      name: 'Move block 4: pick',
      exact: true,
    });
    await target.tap({ trial: true });
    await source.tap({ trial: true });
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    const x = from!.x + from!.width / 2;
    const y = from!.y + from!.height / 2;
    const endY = to!.y + to!.height / 2;
    expect(endY).toBeLessThan(900);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    await expect(source).toHaveAttribute('aria-pressed', 'true');
    for (let step = 1; step <= 4; step++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + ((endY - y) * step) / 4, id: 1 }],
      });
    await expect(page.getByTestId('sequence-drag-preview')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    const expected = [...before];
    const [moved] = expected.splice(2, 1);
    expected.splice(3, 0, moved);
    await expect
      .poll(() =>
        editor
          .locator('[data-block-id]')
          .evaluateAll((rows) =>
            rows.map((row) => row.getAttribute('data-block-id'))
          )
      )
      .toEqual(expected);
    await expect(
      editor
        .getByRole('combobox', { name: 'Who chooses Side?', exact: true })
        .nth(1)
    ).toHaveText(chooser);
    await expect(
      page.getByRole('button', { name: 'Create room from this draft' })
    ).toBeEnabled();
  } finally {
    await context.close();
  }
});
