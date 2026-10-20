import { test, expect } from '@playwright/test';
import * as Y from 'yjs';
import {
  seedMeta,
  getMeta,
  getVetoMaps,
  addAction,
  getActions,
  type SessionMeta,
} from '../src/lib/yjs/sync';
import {
  deriveVetoState,
  type ConfirmedAction,
} from '../src/lib/state-machine';
import {
  createGrandFinalSteps,
  createTemplateSteps,
} from '../src/lib/preset-rules';
import type { VetoPreset } from '../src/types/preset';

function room(): SessionMeta {
  const preset: VetoPreset = {
    schemaVersion: 1,
    id: 'private-bo3',
    name: 'Captain rules',
    author: 'Local',
    description: '',
    updatedAt: '2026-10-19T00:00:00Z',
    format: 'bo3',
    ruleset: 'default',
    mapPool: [
      'area-88',
      'base-404',
      'cauchy-street',
      'space-lab',
      'windy-town',
      'ocarnus',
      'le-brun-city',
    ],
    firstActorMode: 'team-a',
    sequencePattern: 'picks-first',
    steps: createTemplateSteps('picks-first', 'bo3', 7),
    pickBanTimerSeconds: 50,
    sideTimerSeconds: 35,
    timerEnforcement: 'none',
  };
  return {
    sessionId: 'isolated-room',
    presetId: preset.id,
    presetName: preset.name,
    presetSnapshot: preset,
    format: 'bo3',
    mapPool: preset.mapPool,
    ruleset: 'default',
    createdAt: preset.updatedAt,
    teamAToken: 'test-team-a',
    teamBToken: 'test-team-b',
    firstActorMode: 'team-a',
    steps: preset.steps,
  };
}

test('a room keeps the validated snapshot when its source definition changes', () => {
  const doc = new Y.Doc();
  const source = room();
  seedMeta(doc, source);
  source.presetSnapshot!.name = 'Edited later';
  source.presetSnapshot!.mapPool.splice(0, 1);
  expect(getMeta(doc)?.presetName).toBe('Captain rules');
  expect(getMeta(doc)?.mapPool).toContain('area-88');
  seedMeta(doc, { ...room(), presetName: 'Returning stale creator' });
  expect(getMeta(doc)?.presetName).toBe('Captain rules');
  doc.destroy();
});

test('malformed or inconsistent synchronized room rules cannot become runnable', () => {
  const doc = new Y.Doc();
  for (const invalid of [
    null,
    [],
    { ...room(), teamBToken: 'test-team-a' },
    {
      ...room(),
      presetSnapshot: {
        ...room().presetSnapshot,
        steps: [{ team: 'a', type: 'side', forPickIndex: 8 }],
      },
    },
  ]) {
    getVetoMaps(doc).meta.set('value', JSON.stringify(invalid));
    expect(getMeta(doc)).toBeNull();
  }
  doc.destroy();
});

test('redundant transports and duplicate submissions cannot advance the same step twice', () => {
  const source = new Y.Doc();
  const target = new Y.Doc();
  const meta = room();
  seedMeta(source, meta);
  const pick: ConfirmedAction = {
    id: 'pick-1',
    stepIndex: 0,
    team: 'a',
    type: 'pick',
    mapId: 'area-88',
    confirmedAt: '2026-10-19T12:00:00Z',
    confirmedByClientId: 1,
  };
  addAction(source, pick);
  addAction(source, { ...pick, id: 'repeat-click', mapId: 'base-404' });
  const update = Y.encodeStateAsUpdate(source);
  Y.applyUpdate(target, update);
  Y.applyUpdate(target, update);
  const state = deriveVetoState(
    meta.format,
    meta.mapPool,
    getActions(target),
    'a',
    meta.steps
  );
  expect(state.acceptedActions).toEqual([pick]);
  expect(state.currentStepIndex).toBe(1);
  expect(state.pendingPick?.mapId).toBe('area-88');
  expect(state.currentStep).toMatchObject({
    team: 'b',
    type: 'side',
    forPickIndex: 0,
  });
  source.destroy();
  target.destroy();
});

test('a legal retry can replace a rejected concurrent step after document merge', () => {
  const first = new Y.Doc();
  const second = new Y.Doc();
  const pool = room().mapPool;
  const steps = createGrandFinalSteps();
  const action = (
    id: string,
    stepIndex: number,
    mapId: string,
    second: number
  ): ConfirmedAction => ({
    id,
    stepIndex,
    mapId,
    team: 'a',
    type: 'ban',
    confirmedByClientId: 1,
    confirmedAt: `2026-10-19T12:00:0${second}Z`,
  });
  addAction(first, action('first-ban', 0, pool[0], 0));
  addAction(second, action('concurrent-ban', 0, pool[1], 1));
  addAction(second, action('branch-second-ban', 1, pool[0], 2));
  Y.applyUpdate(first, Y.encodeStateAsUpdate(second));
  expect(
    deriveVetoState('bo5', pool, getActions(first), 'a', steps).currentStepIndex
  ).toBe(1);
  addAction(first, action('legal-retry', 1, pool[2], 3));
  const state = deriveVetoState('bo5', pool, getActions(first), 'a', steps);
  expect(state.currentStepIndex).toBe(2);
  expect(state.bannedMaps).toEqual([pool[0], pool[2]]);
  first.destroy();
  second.destroy();
});
