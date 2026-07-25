import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  canStartFirstActorFlip,
  deriveVetoState,
  resolveCoinflipChoice,
  startCoinFlip,
  validateAction,
} from '../src/lib/state-machine';

const APP = '/StrinoBans/';
const MAP_POOL = [
  'area-88',
  'base-404',
  'cauchy-street',
  'cosmite',
  'ocarnus',
  'space-lab',
  'windy-town',
];

type FirstActorMode = 'random' | 'coinflip' | 'team-a';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('strinobans_transport', 'webrtc');
  });
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

  const pendingState = deriveVetoState('bo1', MAP_POOL, [], pending.firstActor);
  expect(pendingState.currentStep).toBeNull();
  expect(pendingState.currentTeam).toBeNull();
  expect(pendingState.currentActionType).toBeNull();
  expect(
    validateAction(
      {
        id: 'pending-action',
        stepIndex: 0,
        team: 'a',
        type: 'ban',
        mapId: MAP_POOL[0],
        confirmedAt: '2026-07-24T12:00:01Z',
        confirmedByClientId: 1,
      },
      'bo1',
      MAP_POOL,
      [],
      'a',
      pending.firstActor
    )
  ).toEqual({ valid: false, reason: 'First actor has not been resolved' });

  const unauthorized = resolveCoinflipChoice(
    pending,
    'b',
    'b',
    '2026-07-24T12:00:04Z'
  );
  expect(unauthorized).toBe(pending);
  expect(unauthorized.firstActor).toBeUndefined();
  expect(unauthorized.choicePending).toBe(true);

  const resolved = resolveCoinflipChoice(
    pending,
    'a',
    'b',
    '2026-07-24T12:00:05Z'
  );
  expect(resolved.firstActor).toBe('b');
  expect(resolved.resolvedAt).toBe('2026-07-24T12:00:05Z');
  expect(resolved.flipWinner).toBe('a');
  expect(resolved.flippedAt).toBe('2026-07-24T12:00:00Z');
  expect(resolved.choicePending).toBe(false);
});

test('every published preset loads and is selectable', async ({ page }) => {
  await page.goto(APP);
  const indexResponse = await page.request.get(`${APP}presets/index.json`);
  expect(indexResponse.ok()).toBe(true);
  const index = (await indexResponse.json()) as {
    groups: {
      name: string;
      stages: { format: string; presetId: string }[];
    }[];
  };

  for (const group of index.groups) {
    await page.getByRole('button', { name: `${group.name} formats` }).click();
    for (const stage of group.stages) {
      const presetResponse = await page.request.get(
        `${APP}presets/${stage.presetId}.json`
      );
      expect(presetResponse.ok(), stage.presetId).toBe(true);
      const preset = (await presetResponse.json()) as {
        id: string;
        format: string;
        mapPool: string[];
        firstActorMode: FirstActorMode;
      };
      expect(preset.id).toBe(stage.presetId);
      expect(preset.format).toBe(stage.format);
      expect(preset.mapPool.length).toBeGreaterThan(0);
      expect(['random', 'coinflip', 'team-a']).toContain(preset.firstActorMode);

      const formatLabel = stage.format.replace('bo', 'Bo');
      await page
        .getByRole('button', { name: `${group.name} ${formatLabel}` })
        .click();
      await expect(
        page.getByText(`${group.name} · ${formatLabel}`)
      ).toBeVisible();
    }
  }
});

for (const mode of ['random', 'coinflip', 'team-a'] as const) {
  test(`${mode} establishes the intended first actor`, async ({
    page,
    context,
  }) => {
    await serveModePreset(context, mode);
    const [teamA, teamB] = await createRoom(page, context, mode);
    await teamA.getByRole('button', { name: 'Ready up Team A' }).click();
    await teamB.getByRole('button', { name: 'Ready up Team B' }).click();

    if (mode === 'team-a') {
      await expect(
        teamA.getByRole('heading', { name: 'Coin Flip' })
      ).toHaveCount(0);
      await expect(teamA.getByText('Your turn: ban a map')).toBeVisible();
      await expect(teamB.getByText('Waiting for Team A to ban')).toBeVisible();
      return;
    }

    await expect(
      teamA.getByRole('heading', { name: 'Coin Flip' })
    ).toBeVisible();
    if (mode === 'random') {
      await expect(teamA.getByText('Random coin flip')).toBeVisible();
      await expect(teamA.getByText('goes first')).toBeVisible();
      return;
    }

    const teamAChoice = teamA.getByRole('button', {
      name: 'Team B goes first',
    });
    const teamBChoice = teamB.getByRole('button', {
      name: 'Team B goes first',
    });
    await expect
      .poll(
        async () =>
          (await teamAChoice.isVisible()) || (await teamBChoice.isVisible())
      )
      .toBe(true);

    await expect(teamA.getByText(/^Your turn:/)).toHaveCount(0);
    await expect(teamB.getByText(/^Your turn:/)).toHaveCount(0);
    await expect(teamA.locator('[aria-current="step"]')).toHaveCount(0);
    await expect(teamB.locator('[aria-current="step"]')).toHaveCount(0);

    const teamAWonFlip = await teamAChoice.isVisible();
    const chooser = teamAWonFlip ? teamA : teamB;
    const flipWinner = teamAWonFlip ? 'Team A' : 'Team B';
    const firstActor = teamAWonFlip ? 'Team B' : 'Team A';
    await chooser
      .getByRole('button', { name: `${firstActor} goes first` })
      .click();

    const actorPage = firstActor === 'Team A' ? teamA : teamB;
    const waitingPage = firstActor === 'Team A' ? teamB : teamA;
    await expect(actorPage.getByText('Your turn: ban a map')).toBeVisible();
    await expect(
      waitingPage.getByText(`Waiting for ${firstActor} to ban`)
    ).toBeVisible();

    await teamA.reload();
    await expect(
      teamA.getByRole('heading', { name: 'Coin Flip' })
    ).toBeVisible();
    await expect(teamA.getByLabel(`${flipWinner} won the flip`)).toBeVisible();
    await expect(teamA.getByText(`${firstActor} goes first`)).toBeVisible();
    await expect(
      teamA.getByText(`Coin-flip winner: ${flipWinner}`)
    ).toBeVisible();
  });
}

async function serveModePreset(
  context: BrowserContext,
  mode: FirstActorMode
): Promise<void> {
  const presetId = `test-${mode}`;
  await context.route('**/presets/index.json', (route) =>
    route.fulfill({
      json: {
        version: 2,
        groups: [
          {
            id: presetId,
            name: `Test ${mode}`,
            author: 'tests',
            description: `${mode} first-actor behavior`,
            updatedAt: '2026-07-24T00:00:00Z',
            stages: [{ format: 'bo1', presetId }],
          },
        ],
      },
    })
  );
  await context.route(`**/presets/${presetId}.json`, (route) =>
    route.fulfill({
      json: {
        id: presetId,
        name: `Test ${mode} — Bo1`,
        author: 'tests',
        description: `${mode} first-actor behavior`,
        updatedAt: '2026-07-24T00:00:00Z',
        format: 'bo1',
        ruleset: 'default',
        mapPool: MAP_POOL,
        firstActorMode: mode,
        pickBanTimerSeconds: 50,
        sideTimerSeconds: 35,
        timerEnforcement: 'none',
      },
    })
  );
}

async function createRoom(
  teamA: Page,
  context: BrowserContext,
  mode: FirstActorMode
): Promise<[Page, Page]> {
  await teamA.goto(APP);
  const groupName = `Test ${mode}`;
  await teamA.getByRole('button', { name: `${groupName} formats` }).click();
  await teamA.getByRole('button', { name: `${groupName} Bo1` }).click();
  await teamA.getByRole('button', { name: 'Create veto room' }).click();
  await teamA.waitForURL(/\/veto\?/);

  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(teamA.url()).origin,
  });
  await teamA.getByRole('button', { name: 'Copy Team B Link link' }).click();
  const teamBUrl = await teamA.evaluate(() => navigator.clipboard.readText());

  const teamB = await context.newPage();
  await teamB.goto(teamBUrl);
  await expect(teamA.getByRole('heading', { name: 'Ready up' })).toBeVisible();
  await expect(teamB.getByRole('heading', { name: 'Ready up' })).toBeVisible();
  return [teamA, teamB];
}
