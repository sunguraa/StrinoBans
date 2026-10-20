import { expect, type BrowserContext, type Page } from '@playwright/test';
import * as Y from 'yjs';
import type {
  ConfirmedAction,
  FirstActorResult,
  StepType,
} from '../src/lib/state-machine';
import type { SessionMeta } from '../src/lib/yjs/sync';
import type { SessionRecord, SessionSummary } from '../src/lib/storage';
import type { Team } from '../src/types/veto';

export const APP = '/StrinoBans/';
export const LEGACY_MAPS = [
  'area-88',
  'base-404',
  'cauchy-street',
  'cosmite',
  'ocarnus',
  'space-lab',
  'windy-town',
];
export type RoomPages = Record<Team, Page>;
export type RoomStep = { team: Team; type: StepType };

// Exercise only the development BroadcastChannel path: not real WebRTC/network coverage.
// Playwright's fresh context per test keeps local/session storage isolated between cases.
export async function useOfflineTransport(context: BrowserContext) {
  await context.addInitScript(() =>
    localStorage.setItem('strinobans_transport', 'webrtc')
  );
}

export async function readRoom(page: Page) {
  const id = new URL(page.url()).searchParams.get('s');
  const raw = await page.evaluate(
    (sessionId) =>
      sessionStorage.getItem(`strinobans_room_checkpoint:v1:${sessionId}`),
    id
  );
  const doc = new Y.Doc();
  try {
    if (raw) Y.applyUpdate(doc, new Uint8Array(Buffer.from(raw, 'base64')));
    const meta = doc.getMap<string>('meta').get('value');
    const initiative = doc.getMap<string>('firstActorResult').get('value');
    return {
      meta: meta ? (JSON.parse(meta) as SessionMeta) : null,
      initiative: initiative
        ? (JSON.parse(initiative) as FirstActorResult)
        : null,
      actions: doc
        .getArray<string>('actions')
        .toArray()
        .map((action) => JSON.parse(action) as ConfirmedAction),
      ready: {
        a: doc.getMap<string>('readyState').get('a') === 'true',
        b: doc.getMap<string>('readyState').get('b') === 'true',
      },
    };
  } finally {
    doc.destroy();
  }
}

export async function readConfig(page: Page): Promise<SessionRecord> {
  const id = new URL(page.url()).searchParams.get('s');
  return page.evaluate(
    (sessionId) =>
      JSON.parse(
        localStorage.getItem(`strinobans_session_config:${sessionId}`)!
      ),
    id
  );
}

export async function readHistory(page: Page): Promise<SessionSummary[]> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('strinobans_session_history') ?? '[]')
  );
}

export async function joinTeamB(
  a: Page,
  context: BrowserContext
): Promise<RoomPages> {
  await expect(
    a.getByRole('heading', { name: 'Ready up', exact: true })
  ).toBeVisible();
  const url = await a
    .getByRole('textbox', { name: 'Team B link', exact: true })
    .inputValue();
  const b = await context.newPage();
  await b.goto(url);
  await expect(
    b.getByRole('heading', { name: 'Ready up', exact: true })
  ).toBeVisible();
  await expect.poll(async () => (await readRoom(b)).meta).not.toBeNull();
  return { a, b };
}

export async function joinSpectator(a: Page, context: BrowserContext) {
  const url = new URL(a.url());
  url.searchParams.delete('t');
  const spectator = await context.newPage();
  await spectator.goto(url.toString());
  await expect
    .poll(async () => (await readRoom(spectator)).meta)
    .not.toBeNull();
  return spectator;
}

export async function seedLegacyRoom(
  a: Page,
  context: BrowserContext,
  mode: 'random' | 'coinflip' | 'team-a'
) {
  await a.goto(APP);
  const sessionId = `legacy-${mode}-${crypto.randomUUID()}`;
  const config: SessionRecord = {
    sessionId,
    teamAToken: crypto.randomUUID(),
    teamBToken: crypto.randomUUID(),
    presetId: `legacy-${mode}`,
    presetName: `Legacy ${mode}`,
    firstActorMode: mode,
    mapPool: LEGACY_MAPS,
    format: 'bo1',
    ruleset: 'default',
    timerEnforcement: 'none',
    createdAt: new Date().toISOString(),
  };
  await a.evaluate(
    (record) =>
      localStorage.setItem(
        `strinobans_session_config:${record.sessionId}`,
        JSON.stringify(record)
      ),
    config
  );
  await a.goto(`${APP}veto?s=${sessionId}&t=${config.teamAToken}`);
  return joinTeamB(a, context);
}

export async function readyBoth(pages: RoomPages) {
  await pages.a
    .getByRole('button', { name: 'Ready up Team A', exact: true })
    .click();
  await pages.b
    .getByRole('button', { name: 'Ready up Team B', exact: true })
    .click();
  await expect
    .poll(async () => (await readRoom(pages.a)).ready)
    .toEqual({ a: true, b: true });
}

export async function expectNoActions(page: Page) {
  await expect(
    page.getByRole('button', { name: /^Confirm (ban|pick)$/ })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /^Choose (attacker|defender)/ })
  ).toHaveCount(0);
  await expect(page.locator('main button[aria-pressed]')).toHaveCount(0);
  await expect(page.locator('[aria-current="step"]')).toHaveCount(0);
  expect((await readRoom(page)).actions).toEqual([]);
}

export async function chooseStarter(
  pages: RoomPages,
  chooser: Team,
  starter: Team,
  kind: 'veto' | 'pick' = 'veto'
) {
  await pages[chooser]
    .getByRole('button', {
      name: `Team ${starter.toUpperCase()} ${kind === 'pick' ? 'picks first' : 'goes first'}`,
      exact: true,
    })
    .click();
  for (const page of Object.values(pages)) {
    await expect
      .poll(async () => (await readRoom(page)).initiative?.firstActor)
      .toBe(starter);
  }
}

export async function playStep(
  pages: RoomPages,
  step: RoomStep,
  index: number,
  total: number,
  duplicate = false
) {
  const actor = pages[step.team];
  const other = pages[step.team === 'a' ? 'b' : 'a'];
  for (const page of Object.values(pages)) {
    const progress = page.getByText(`${index} / ${total}`, { exact: true });
    await expect(progress).toHaveCount(2); // Phase bar and action-feed counter agree.
    await expect(progress.first()).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveCount(1);
    await expect
      .poll(async () => (await readRoom(page)).actions.length)
      .toBe(index);
  }
  let action;
  if (step.type === 'side') {
    action = actor.getByRole('button', {
      name: 'Choose attacker',
      exact: true,
    });
    await expect(action).toBeVisible();
    await expect(
      other.getByRole('button', { name: /^Choose (attacker|defender)/ })
    ).toHaveCount(0);
  } else {
    await expect(
      actor.getByText(`Your turn: ${step.type} a map`, { exact: true })
    ).toBeVisible();
    await expect(
      other.getByRole('button', { name: `Confirm ${step.type}`, exact: true })
    ).toBeDisabled();
    await actor.locator('main button[aria-pressed]').first().click();
    action = actor.getByRole('button', {
      name: `Confirm ${step.type}`,
      exact: true,
    });
    await expect(action).toBeEnabled();
  }
  if (duplicate) {
    // Two events in one browser turn deliberately exercise stale React handlers.
    await action.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  } else await action.click();
  for (const page of Object.values(pages)) {
    await expect
      .poll(async () => (await readRoom(page)).actions.length)
      .toBe(index + 1);
    expect((await readRoom(page)).actions[index]).toMatchObject({
      stepIndex: index,
      team: step.team,
      type: step.type,
    });
  }
}

export async function expectComplete(
  pages: RoomPages,
  steps: RoomStep[],
  mapsPlayed: number
) {
  for (const page of Object.values(pages)) {
    await expect(
      page.getByRole('heading', { name: 'Veto Complete', exact: true })
    ).toBeVisible();
    await expect(page.getByText('Decider', { exact: true })).toBeVisible();
  }
  const state = await readRoom(pages.a);
  expect(state.actions.map(({ team, type }) => ({ team, type }))).toEqual(
    steps
  );
  expect(state.actions.map(({ stepIndex }) => stepIndex)).toEqual(
    steps.map((_, index) => index)
  );
  expect(new Set(state.actions.map(({ id }) => id)).size).toBe(steps.length);
  await expect
    .poll(
      async () =>
        (await readHistory(pages.a)).find(
          (entry) => entry.sessionId === state.meta?.sessionId
        )?.actions
    )
    .toEqual(state.actions);
  const history = (await readHistory(pages.a)).find(
    (entry) => entry.sessionId === state.meta?.sessionId
  )!;
  expect(history).toMatchObject({
    firstActor: state.initiative?.firstActor,
    firstActorMode: state.meta?.firstActorMode,
    format: state.meta?.format,
    mapPool: state.meta?.mapPool,
  });
  if (state.meta?.presetSnapshot)
    expect(history.presetSnapshot).toEqual(state.meta.presetSnapshot);
  expect(history.finalResult).toHaveLength(mapsPlayed);
  expect(new Set(history.finalResult.map(({ mapId }) => mapId)).size).toBe(
    mapsPlayed
  );
  const picked = state.actions.filter(({ type }) => type === 'pick');
  const sides = state.actions.filter(({ type }) => type === 'side');
  expect(sides).toHaveLength(mapsPlayed);
  for (let index = 0; index < mapsPlayed; index++) {
    expect(history.finalResult[index]).toMatchObject({
      side: sides[index].side,
      sidePickedBy: sides[index].team,
    });
    if (index < picked.length)
      expect(history.finalResult[index]).toMatchObject({
        mapId: picked[index].mapId,
        pickedBy: picked[index].team,
      });
  }
  const banned = state.actions
    .filter(({ type }) => type === 'ban')
    .map(({ mapId }) => mapId);
  expect(history.finalResult.some(({ mapId }) => banned.includes(mapId))).toBe(
    false
  );
  const decider = state.meta!.mapPool.filter(
    (mapId) =>
      !banned.includes(mapId) &&
      !picked.some((action) => action.mapId === mapId)
  );
  expect(decider).toHaveLength(1);
  expect(history.finalResult[mapsPlayed - 1]).toMatchObject({
    mapId: decider[0],
    pickedBy: '',
  });
  expect(sides[mapsPlayed - 1].mapId).toBe(decider[0]);
  expect((await readRoom(pages.b)).meta).toEqual(state.meta);
  expect((await readRoom(pages.b)).actions).toEqual(state.actions);
  return history;
}
