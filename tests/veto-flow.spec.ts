import { test, expect } from '@playwright/test';
import { chooseOption } from './helpers/choose-option';
import type { Team } from '../src/types/veto';
import {
  APP,
  chooseStarter,
  expectComplete,
  expectNoActions,
  joinSpectator,
  joinTeamB,
  playStep,
  readConfig,
  readHistory,
  readRoom,
  readyBoth,
  useOfflineTransport,
  type RoomStep,
} from './room-helpers';

// Same-origin tabs use the explicit development BroadcastChannel transport.
// These scenarios do not establish real WebRTC or internet connectivity.
test.beforeEach(async ({ context }) => {
  await useOfflineTransport(context);
});

for (const format of ['bo1', 'bo5'] as const) {
  for (const starter of ['a', 'b'] as const) {
    test(`Default ${format.toUpperCase()} completes with actual ${starter.toUpperCase()} starting`, async ({
      page,
      context,
    }) => {
      await page.goto(APP);
      await page
        .getByRole('button', {
          name: `Default ${format.replace('bo', 'Bo')}`,
          exact: true,
        })
        .click();
      const sourceResponse = await page.request.get(
        `${APP}presets/default-${format}.json`
      );
      expect(sourceResponse.ok()).toBe(true);
      const source = await sourceResponse.json();
      await page
        .getByRole('button', { name: 'Create veto room', exact: true })
        .click();
      await page.waitForURL(/\/veto\?/);
      const url = new URL(page.url());
      expect(url.pathname).toBe('/StrinoBans/veto');
      expect(url.searchParams.get('s')).toBeTruthy();
      expect(url.searchParams.get('t')).toBeTruthy();
      const pages = await joinTeamB(page, context);
      const frozen = (await readConfig(page)).presetSnapshot!;
      expect(frozen).toMatchObject({
        id: source.id,
        format,
        mapPool: source.mapPool,
        steps: source.steps,
        firstActorMode: 'coinflip',
      });
      await readyBoth(pages);
      await expect
        .poll(async () => (await readRoom(page)).initiative?.choicePending)
        .toBe(true);
      const chooser = (await readRoom(page)).initiative!.flipWinner!;
      await expect(
        pages[chooser].getByRole('button', {
          name: 'Team A goes first',
          exact: true,
        })
      ).toBeVisible();
      await chooseStarter(pages, chooser, starter);
      const second: Team = starter === 'a' ? 'b' : 'a';
      const steps: RoomStep[] =
        format === 'bo1'
          ? [
              { team: starter, type: 'ban' },
              { team: second, type: 'ban' },
              { team: starter, type: 'ban' },
              { team: second, type: 'ban' },
              { team: starter, type: 'ban' },
              { team: second, type: 'ban' },
              { team: starter, type: 'side' },
            ]
          : [
              { team: starter, type: 'ban' },
              { team: second, type: 'ban' },
              { team: starter, type: 'pick' },
              { team: second, type: 'side' },
              { team: second, type: 'pick' },
              { team: starter, type: 'side' },
              { team: starter, type: 'pick' },
              { team: second, type: 'side' },
              { team: second, type: 'pick' },
              { team: starter, type: 'side' },
              { team: starter, type: 'side' },
            ];
      for (let index = 0; index < steps.length; index++) {
        await playStep(
          pages,
          steps[index],
          index,
          steps.length,
          index === 0 || steps[index].type === 'side'
        );
        if (index === 1) {
          const progress = await readRoom(page);
          await page.reload();
          await expect
            .poll(async () => (await readRoom(page)).actions)
            .toEqual(progress.actions);
          expect((await readRoom(page)).meta?.presetSnapshot).toEqual(frozen);
        }
      }
      const history = await expectComplete(
        pages,
        steps,
        format === 'bo1' ? 1 : 5
      );
      expect(history.presetSnapshot).toEqual(frozen);
      expect((await readConfig(page)).presetSnapshot).toEqual(frozen);
      expect(
        await (
          await page.request.get(`${APP}presets/default-${format}.json`)
        ).json()
      ).toEqual(source);
      const spectator = await joinSpectator(page, context);
      await expect(
        spectator.getByRole('heading', { name: 'Veto Complete', exact: true })
      ).toBeVisible();
      await expect
        .poll(async () => (await readRoom(spectator)).actions)
        .toEqual(history.actions);
      expect((await readRoom(spectator)).meta?.presetSnapshot).toEqual(frozen);
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Veto Complete', exact: true })
      ).toBeVisible();
      expect(
        (await readHistory(page)).filter(
          ({ sessionId }) => sessionId === history.sessionId
        )
      ).toHaveLength(1);
    });
  }
}

for (const starter of ['a', 'b'] as const) {
  test(`grand final Team A chooses role ${starter === 'a' ? 'first' : 'second'} and retains both bans`, async ({
    page,
    context,
  }) => {
    await page.goto(APP);
    await page
      .getByRole('button', { name: 'Grand final formats', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Grand final Bo5', exact: true })
      .click();
    await expect(
      page.getByRole('combobox', { name: /^Upper-bracket finalist/ })
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Create veto room', exact: true })
      .click();
    await page.waitForURL(/\/veto\?/);
    const pages = await joinTeamB(page, context);
    await readyBoth(pages);
    await expect(
      pages.a.getByRole('button', {
        name: 'Team A picks first',
        exact: true,
      })
    ).toBeVisible();
    await expect(
      pages.b.getByRole('button', { name: /picks first$/ })
    ).toHaveCount(0);
    expect((await readRoom(page)).initiative?.chooserTeam).toBe('a');
    await expectNoActions(pages.a);
    await expectNoActions(pages.b);
    await chooseStarter(pages, 'a', starter, 'pick');
    const second: Team = starter === 'a' ? 'b' : 'a';
    const steps: RoomStep[] = [
      { team: 'a', type: 'ban' },
      { team: 'a', type: 'ban' },
      { team: starter, type: 'pick' },
      { team: second, type: 'side' },
      { team: second, type: 'pick' },
      { team: starter, type: 'side' },
      { team: starter, type: 'pick' },
      { team: second, type: 'side' },
      { team: second, type: 'pick' },
      { team: starter, type: 'side' },
      { team: second, type: 'side' },
    ];
    for (let index = 0; index < steps.length; index++) {
      if (index < 2) {
        const rejectedBan = pages.b.getByRole('button', {
          name: 'Confirm ban',
          exact: true,
        });
        await expect(rejectedBan).toBeDisabled();
        await rejectedBan.evaluate((button: HTMLButtonElement) =>
          button.click()
        );
        expect((await readRoom(pages.b)).actions).toHaveLength(index);
      }
      await playStep(
        pages,
        steps[index],
        index,
        steps.length,
        index === 0 || steps[index].type === 'side'
      );
    }
    const history = await expectComplete(pages, steps, 5);
    expect(history).toMatchObject({
      firstActor: starter,
      firstActorMode: 'upper-bracket-choice',
    });
    expect(
      history.actions
        .filter(({ type }) => type === 'ban')
        .map(({ team }) => team)
    ).toEqual(['a', 'a']);
    expect(history.finalResult.map(({ sidePickedBy }) => sidePickedBy)).toEqual(
      [second, starter, second, starter, second]
    );
    expect(history.finalResult.every(({ side }) => side === 'attacker')).toBe(
      true
    );
  });
}

test('custom UI creates a playable snapshot without mutating its saved source preset', async ({
  page,
  context,
}) => {
  const roomCode = 'ABCD1234'.repeat(16);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(APP);
  await page.getByRole('tab', { name: 'Custom map pool', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Preset name', exact: true })
    .fill('Saved source BO1');
  await chooseOption(page, 'Series', 'BO1');
  await page
    .getByRole('button', { name: 'Select all maps', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Deselect all maps', exact: true })
    .click();
  for (const name of ['Area 88', 'Base 404', 'Cosmite']) {
    await page
      .getByRole('button', { name: `${name}, excluded`, exact: true })
      .click();
  }
  const create = page.getByRole('button', {
    name: 'Create room from this draft',
    exact: true,
  });
  await expect(create).toBeDisabled();
  await page
    .getByRole('button', { name: 'Rebuild from template', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Advanced Settings', exact: true })
    .click();
  await chooseOption(page, 'Who decides the starter?', 'Team A always starts');
  await chooseOption(
    page,
    'On timeout',
    'Advisory timer — no automatic action'
  );
  await page
    .getByRole('textbox', {
      name: 'Preset Room Code',
      exact: true,
    })
    .fill(roomCode);
  await page
    .getByText('Browser preset library & JSON backup', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  await expect(
    page.getByText('Saved as a new browser preset.', { exact: true })
  ).toBeVisible();
  const source = await page.evaluate(() =>
    localStorage.getItem('strinobans_preset_library_v1')
  );
  expect(source).not.toBeNull();
  await page
    .getByRole('textbox', { name: 'Preset name', exact: true })
    .fill('Room-only BO1');
  await create.click();
  await page.waitForURL(/\/veto\?/);
  const pages = await joinTeamB(page, context);
  const snapshot = (await readConfig(page)).presetSnapshot!;
  expect(snapshot).toMatchObject({
    name: 'Room-only BO1',
    mapPool: ['area-88', 'base-404', 'cosmite'],
    firstActorMode: 'team-a',
    roomImportCode: roomCode,
  });
  await readyBoth(pages);
  const steps: RoomStep[] = [
    { team: 'a', type: 'ban' },
    { team: 'b', type: 'ban' },
    { team: 'a', type: 'side' },
  ];
  await playStep(pages, steps[0], 0, steps.length, true);
  const spectator = await joinSpectator(page, context);
  await expect
    .poll(async () => (await readRoom(spectator)).actions.length)
    .toBe(1);
  expect((await readRoom(spectator)).meta?.presetSnapshot).toEqual(snapshot);
  await expect(spectator.locator('main button[aria-pressed]')).toHaveCount(0);
  await page.reload();
  await expect.poll(async () => (await readRoom(page)).actions.length).toBe(1);
  for (let index = 1; index < steps.length; index++)
    await playStep(pages, steps[index], index, steps.length, true);
  const history = await expectComplete(pages, steps, 1);
  expect(history.presetSnapshot).toEqual(snapshot);
  await page.setViewportSize({ width: 375, height: 1000 });
  await expect(page.getByText(roomCode, { exact: true })).toBeVisible();
  const roomBounds = await page.locator('main').evaluate((main) => ({
    width: main.clientWidth,
    content: main.scrollWidth,
  }));
  expect(roomBounds.content).toBeLessThanOrEqual(roomBounds.width);
  await expect(
    spectator.getByRole('heading', { name: 'Veto Complete', exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('strinobans_preset_library_v1')
    )
  ).toBe(source);
});
