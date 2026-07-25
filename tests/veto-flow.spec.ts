import { test, expect, type Page } from '@playwright/test';

const APP = '/StrinoBans/';

// Force the BroadcastChannel-backed webrtc transport so two same-origin tabs sync
// locally without any signaling server.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('strinobans_transport', 'webrtc');
    } catch {
      // ignore
    }
  });
});

test('landing shows the Default preset group and creates a room with a correct URL', async ({
  page,
}) => {
  await page.goto(APP);

  // Grouped preset with four best-of sub-buttons.
  await expect(page.getByRole('heading', { name: 'Default' })).toBeVisible();
  await page.getByRole('button', { name: 'Default formats' }).click();
  for (const bo of ['Bo1', 'Bo3', 'Bo5', 'Bo7']) {
    await expect(
      page.getByRole('button', { name: `Default ${bo}` })
    ).toBeVisible();
  }

  // Create is gated until a format is chosen.
  const create = page.getByRole('button', { name: 'Create veto room' });
  await expect(create).toBeDisabled();

  await page.getByRole('button', { name: 'Default Bo3' }).click();
  await expect(page.getByText('Default · Bo3')).toBeVisible();
  await expect(create).toBeEnabled();

  await create.click();
  await page.waitForURL(/\/veto\?/);

  const url = new URL(page.url());
  // basePath must appear exactly once (regression: /StrinoBans/StrinoBans/veto).
  expect(url.pathname).toBe('/StrinoBans/veto');
  expect(url.searchParams.get('s')).toBeTruthy();
  expect(url.searchParams.get('t')).toBeTruthy();

  // Room loads instead of hanging on "Connecting…".
  await expect(page.getByRole('heading', { name: 'Ready up' })).toBeVisible();
});

test('custom map pool gates the available best-of formats by size', async ({
  page,
}) => {
  await page.goto(APP);
  await page.getByRole('tab', { name: 'Custom' }).click();

  // Full pool (8 maps) — every format available.
  await expect(page.getByRole('button', { name: 'Custom Bo7' })).toBeEnabled();

  // Shrink the pool to 4 maps: Bo5/Bo7 need more, Bo1/Bo3 still fit.
  await page.getByRole('button', { name: /Deselect all/ }).click();
  for (const name of ['Area 88', 'Base 404', 'Cauchy Street', 'Cosmite']) {
    await page.getByRole('button', { name: `${name} not selected` }).click();
  }
  await expect(page.getByText('4 of 9 maps selected.')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Custom Bo1' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Custom Bo3' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Custom Bo5' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Custom Bo7' })).toBeDisabled();

  await page.getByRole('button', { name: 'Custom Bo3' }).click();
  await expect(page.getByText('Custom · Bo3 · 4 maps')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create veto room' })
  ).toBeEnabled();
});

test('full Bo1 veto runs end to end across two peers', async ({
  page,
  context,
}) => {
  const teamA = page;
  await teamA.goto(APP);
  await teamA.getByRole('button', { name: 'Default formats' }).click();
  await teamA.getByRole('button', { name: 'Default Bo1' }).click();
  await teamA.getByRole('button', { name: 'Create veto room' }).click();
  await teamA.waitForURL(/\/veto\?/);

  // Copy Team B's private link, then open it as a second peer.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(teamA.url()).origin,
  });
  await teamA.getByRole('button', { name: 'Copy Team B Link link' }).click();
  const teamBUrl = await teamA.evaluate(() => navigator.clipboard.readText());

  const teamB = await context.newPage();
  await teamB.goto(teamBUrl);

  // Both reach ready-up (sync established, no connecting hang).
  await expect(teamA.getByRole('heading', { name: 'Ready up' })).toBeVisible();
  await expect(teamB.getByRole('heading', { name: 'Ready up' })).toBeVisible();

  await teamA.getByLabel('Team A name').fill('Blackwall');
  await teamB.getByLabel('Team B name').fill('Nightfall');
  await teamA.getByRole('button', { name: 'Ready up Team A' }).click();
  await teamB.getByRole('button', { name: 'Ready up Team B' }).click();

  // Coin flip shows a result before the board appears.
  await expect(teamA.getByRole('heading', { name: 'Coin Flip' })).toBeVisible();
  await expect(teamA.getByText('goes first')).toBeVisible();

  // Drive the veto: each peer acts when it's their turn until completion.
  await driveToCompletion([teamA, teamB]);

  await expect(
    teamA.getByRole('heading', { name: 'Veto Complete' })
  ).toBeVisible();
  await expect(
    teamB.getByRole('heading', { name: 'Veto Complete' })
  ).toBeVisible();
  // Bo1 leaves exactly one decider map, shown with a Decider badge.
  await expect(teamA.getByText('Decider', { exact: true })).toBeVisible();
});

async function actIfMyTurn(p: Page): Promise<boolean> {
  // Side selection (decider): the action bar offers Attacker/Defender.
  const attacker = p.getByRole('button', {
    name: 'Choose attacker',
    exact: true,
  });
  if (await attacker.isVisible().catch(() => false)) {
    await attacker.click();
    return true;
  }
  // Ban/pick: clickable maps are the only buttons carrying aria-pressed on the board.
  const confirm = p.getByRole('button', { name: /^Confirm (ban|pick)$/i });
  const maps = p.locator('main button[aria-pressed]');
  if (
    (await confirm.isVisible().catch(() => false)) &&
    (await maps.count()) > 0
  ) {
    await maps.first().click();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    return true;
  }
  return false;
}

async function driveToCompletion(pages: Page[]): Promise<void> {
  for (let i = 0; i < 40; i++) {
    for (const p of pages) {
      if (
        await p
          .getByRole('heading', { name: 'Veto Complete' })
          .isVisible()
          .catch(() => false)
      ) {
        return;
      }
    }
    let acted = false;
    for (const p of pages) {
      if (await actIfMyTurn(p)) {
        acted = true;
        break;
      }
    }
    if (!acted) await pages[0].waitForTimeout(400);
  }
}
