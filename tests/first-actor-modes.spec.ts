import { test, expect } from '@playwright/test';
import { chooseOption } from './helpers/choose-option';
import {
  canStartFirstActorFlip,
  deriveVetoState,
  resolveCoinflipChoice,
  startCoinFlip,
  validateAction,
} from '../src/lib/state-machine';
import {
  APP,
  LEGACY_MAPS,
  chooseStarter,
  expectNoActions,
  joinSpectator,
  joinTeamB,
  playStep,
  readRoom,
  seedLegacyRoom,
  useOfflineTransport,
} from './room-helpers';

test.beforeEach(async ({ context }) => {
  await useOfflineTransport(context);
});

test('only ready Team A can create a first-actor flip', () => {
  const ready = { a: true, b: true };
  expect(canStartFirstActorFlip('coinflip', 'b', ready, null)).toBe(false);
  expect(canStartFirstActorFlip('coinflip', 'spectator', ready, null)).toBe(
    false
  );
  expect(
    canStartFirstActorFlip('coinflip', 'a', { a: true, b: false }, null)
  ).toBe(false);
  expect(canStartFirstActorFlip('team-a', 'a', ready, null)).toBe(false);
  const existing = startCoinFlip(
    'coinflip',
    'a',
    'existing-seed',
    '2026-07-24T11:59:00Z'
  );
  expect(canStartFirstActorFlip('coinflip', 'a', ready, existing)).toBe(false);
  expect(canStartFirstActorFlip('coinflip', 'a', ready, null)).toBe(true);
});

test('coinflip remains unresolved until its winner chooses', () => {
  const pending = startCoinFlip(
    'coinflip',
    'a',
    'flip-seed',
    '2026-07-24T12:00:00Z'
  );
  expect(pending.firstActor).toBeUndefined();
  expect(pending.resolvedAt).toBeUndefined();
  expect(pending.choicePending).toBe(true);
  const state = deriveVetoState('bo1', LEGACY_MAPS, [], pending.firstActor);
  expect(state.currentStep).toBeNull();
  expect(state.currentTeam).toBeNull();
  expect(state.currentActionType).toBeNull();
  expect(
    validateAction(
      {
        id: 'pending-action',
        stepIndex: 0,
        team: 'a',
        type: 'ban',
        mapId: LEGACY_MAPS[0],
        confirmedAt: '2026-07-24T12:00:01Z',
        confirmedByClientId: 1,
      },
      'bo1',
      LEGACY_MAPS,
      [],
      'a',
      pending.firstActor
    )
  ).toEqual({ valid: false, reason: 'First actor has not been resolved' });
  expect(resolveCoinflipChoice(pending, 'b', 'b', '2026-07-24T12:00:04Z')).toBe(
    pending
  );
  const resolved = resolveCoinflipChoice(
    pending,
    'a',
    'b',
    '2026-07-24T12:00:05Z'
  );
  expect(resolved).toMatchObject({
    firstActor: 'b',
    flipWinner: 'a',
    flippedAt: pending.flippedAt,
    resolvedAt: '2026-07-24T12:00:05Z',
    choicePending: false,
  });
  expect(
    resolveCoinflipChoice(resolved, 'a', 'a', '2026-07-24T12:00:06Z')
  ).toBe(resolved);
});

for (const mode of ['random', 'coinflip', 'team-a'] as const) {
  test(`legacy ${mode} room resolves initiative without a catalog preset`, async ({
    page,
    context,
  }) => {
    const pages = await seedLegacyRoom(page, context, mode);
    await pages.a
      .getByRole('button', { name: 'Ready up Team A', exact: true })
      .click();
    await expect(
      pages.b.getByRole('heading', { name: 'Ready up', exact: true })
    ).toBeVisible();
    expect((await readRoom(pages.a)).initiative).toBeNull();
    await expectNoActions(pages.a);
    await pages.b
      .getByRole('button', { name: 'Ready up Team B', exact: true })
      .click();
    await expect
      .poll(async () => (await readRoom(pages.a)).initiative?.mode)
      .toBe(mode);
    let starter: 'a' | 'b';
    if (mode === 'coinflip') {
      const initiative = (await readRoom(pages.a)).initiative!;
      const winner = initiative.flipWinner!;
      starter = winner === 'a' ? 'b' : 'a';
      const loser = pages[winner === 'a' ? 'b' : 'a'];
      await expect(
        pages[winner].getByRole('button', {
          name: 'Team A goes first',
          exact: true,
        })
      ).toBeVisible();
      await expect(
        loser.getByRole('button', { name: /goes first$/ })
      ).toHaveCount(0);
      await expectNoActions(pages.a);
      await expectNoActions(pages.b);
      await chooseStarter(pages, winner, starter);
      expect((await readRoom(pages.b)).initiative).toMatchObject({
        flipWinner: winner,
        chooserTeam: winner,
        firstActor: starter,
        choicePending: false,
      });
    } else {
      starter = (await readRoom(pages.a)).initiative!.firstActor!;
      if (mode === 'team-a') expect(starter).toBe('a');
      else
        expect(starter).toBe((await readRoom(pages.a)).initiative!.flipWinner);
    }
    await playStep(pages, { team: starter, type: 'ban' }, 0, 7, true);
    const beforeReload = await readRoom(pages.a);
    await pages.a.reload();
    await expect
      .poll(async () => (await readRoom(pages.a)).actions)
      .toEqual(beforeReload.actions);
    expect((await readRoom(pages.a)).initiative).toEqual(
      beforeReload.initiative
    );
    expect((await readRoom(pages.a)).meta).toEqual(beforeReload.meta);
    const spectator = await joinSpectator(pages.a, context);
    await expect
      .poll(async () => (await readRoom(spectator)).actions)
      .toEqual(beforeReload.actions);
    expect((await readRoom(spectator)).initiative).toEqual(
      beforeReload.initiative
    );
    await expect(spectator.locator('main button[aria-pressed]')).toHaveCount(0);
    await expect(
      spectator.getByRole('button', { name: /^Confirm ban$/ })
    ).toBeDisabled();
  });
}

for (const starter of ['a', 'b'] as const) {
  test(`seeded Team A chooses ${starter.toUpperCase()} only after both ready; B and spectator cannot act`, async ({
    page,
    context,
  }) => {
    await page.goto(APP);
    await page
      .getByRole('button', { name: 'Default Bo1', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Advanced Settings', exact: true })
      .click();
    await chooseOption(
      page,
      'First actor policy',
      'Seeded — Team A chooses who starts'
    );
    await page
      .getByRole('button', { name: 'Create veto room', exact: true })
      .click();
    await page.waitForURL(/\/veto\?/);
    const pages = await joinTeamB(page, context);
    const spectator = await joinSpectator(page, context);
    await pages.a
      .getByRole('button', { name: 'Ready up Team A', exact: true })
      .click();
    for (const participant of [pages.a, pages.b, spectator]) {
      await expect(
        participant.getByRole('button', { name: /goes first$/ })
      ).toHaveCount(0);
      await expectNoActions(participant);
    }
    expect((await readRoom(pages.a)).initiative).toBeNull();
    await pages.b
      .getByRole('button', { name: 'Ready up Team B', exact: true })
      .click();
    await expect(
      pages.a.getByRole('button', { name: 'Team A goes first', exact: true })
    ).toBeVisible();
    for (const participant of [pages.a, pages.b, spectator])
      await expectNoActions(participant);
    for (const unauthorized of [pages.b, spectator]) {
      await expect(
        unauthorized.getByRole('button', { name: /goes first$/ })
      ).toHaveCount(0);
      await expect(
        unauthorized.getByText('Waiting for Team A to choose…', { exact: true })
      ).toBeVisible();
    }
    expect((await readRoom(pages.a)).initiative).toMatchObject({
      mode: 'team-a-choice',
      chooserTeam: 'a',
      choicePending: true,
    });
    const pending = (await readRoom(pages.a)).initiative!;
    expect(
      resolveCoinflipChoice(pending, 'b', starter, new Date().toISOString())
    ).toEqual(pending);
    // Attempt two conflicting choices in the same browser turn; the first must win.
    await pages.a
      .getByRole('button', {
        name: `Team ${starter.toUpperCase()} goes first`,
        exact: true,
      })
      .evaluate((button: HTMLButtonElement) => {
        const buttons = button.parentElement!.querySelectorAll('button');
        button.click();
        for (const other of buttons) if (other !== button) other.click();
      });
    await expect
      .poll(async () => (await readRoom(pages.b)).initiative?.firstActor)
      .toBe(starter);
    await playStep(pages, { team: starter, type: 'ban' }, 0, 7, true);
    await expect
      .poll(async () => (await readRoom(spectator)).actions.length)
      .toBe(1);
    expect((await readRoom(spectator)).initiative?.firstActor).toBe(starter);
    await expect(spectator.locator('main button[aria-pressed]')).toHaveCount(0);
    await expect(
      spectator.getByRole('button', { name: /goes first$/ })
    ).toHaveCount(0);
  });
}
