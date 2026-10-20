import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { MAP_POOL } from '../src/lib/maps';
import {
  createGrandFinalSteps,
  createTemplateSteps,
  validatePreset,
  MAX_PRESET_BYTES,
} from '../src/lib/preset-rules';
import {
  deriveVetoState,
  generateSteps,
  getFormatSteps,
  resolveCoinflipChoice,
  startCoinFlip,
  validateAction,
  type ConfirmedAction,
  type VetoStep,
  type VetoState,
} from '../src/lib/state-machine';
import type { VetoPreset } from '../src/types/preset';
import type { Format, Team } from '../src/types/veto';

const pool = [
  'area-88',
  'base-404',
  'cauchy-street',
  'space-lab',
  'windy-town',
  'ocarnus',
  'le-brun-city',
];
const other = (team: Team): Team => (team === 'a' ? 'b' : 'a');
const labels = (steps: VetoStep[]) =>
  steps
    .map(
      (step) =>
        `${step.team}:${step.type}${step.forDecider ? ':decider' : step.forPickIndex !== undefined ? `:${step.forPickIndex}` : ''}`
    )
    .join(' ');
function preset(format: Format = 'bo5', maps = pool): VetoPreset {
  return {
    schemaVersion: 1,
    sequencePattern: 'manual',
    id: 'test',
    name: 'Test',
    author: 'Test',
    description: 'Test rules',
    updatedAt: '2026-10-19T00:00:00Z',
    format,
    ruleset: 'custom',
    mapPool: maps,
    firstActorMode: 'coinflip',
    steps: generateSteps(
      format === 'bo1' ? 1 : format === 'bo3' ? 3 : format === 'bo5' ? 5 : 7,
      maps.length
    ),
    pickBanTimerSeconds: 50,
    sideTimerSeconds: 35,
    timerEnforcement: 'none',
  };
}
function actionFor(state: VetoState): ConfirmedAction {
  const step = state.currentStep!;
  return {
    id: `action-${state.currentStepIndex}`,
    stepIndex: state.currentStepIndex,
    team: step.team,
    type: step.type,
    confirmedAt: '2026-10-19T00:00:00Z',
    confirmedByClientId: 1,
    ...(step.type === 'side'
      ? { side: 'attacker' as const }
      : { mapId: state.remainingMaps[0] }),
  };
}
function play(
  format: Format,
  maps: string[],
  steps: VetoStep[] | undefined,
  starter: Team
) {
  const actions: ConfirmedAction[] = [];
  let state = deriveVetoState(format, maps, actions, starter, steps);
  const expected = getFormatSteps(format, maps.length, starter, steps);
  for (let index = 0; index < expected.length; index++) {
    expect(state.currentStepIndex).toBe(index);
    expect(state.currentStep).toEqual(expected[index]);
    const action = actionFor(state);
    expect(
      validateAction(
        action,
        format,
        maps,
        actions,
        other(action.team),
        starter,
        steps
      ).valid
    ).toBe(false);
    expect(
      validateAction(action, format, maps, actions, 'spectator', starter, steps)
        .valid
    ).toBe(false);
    expect(
      validateAction(action, format, maps, actions, action.team, starter, steps)
        .valid
    ).toBe(true);
    actions.push(action);
    const next = deriveVetoState(format, maps, actions, starter, steps);
    expect(next.currentStepIndex).toBe(index + 1);
    expect(
      deriveVetoState(format, maps, [...actions, action], starter, steps)
    ).toEqual(next);
    expect(
      validateAction(action, format, maps, actions, action.team, starter, steps)
        .valid
    ).toBe(false);
    state = next;
  }
  expect(state.isComplete).toBe(true);
  expect(state.remainingMaps).toHaveLength(1);
  expect(state.pickedMaps).toHaveLength(Number(format.slice(2)) - 1);
  expect(state.acceptedActions).toEqual(actions);
  expect(state.currentStep).toBeNull();
  return { state, actions };
}

const exactStandard: Record<string, string> = {
  bo1: 'a:ban b:ban a:ban b:ban a:ban b:ban a:side:decider',
  bo3: 'a:ban b:ban a:pick b:side:0 b:pick a:side:1 a:ban b:ban a:side:decider',
  bo5: 'a:ban b:ban a:pick b:side:0 b:pick a:side:1 a:pick b:side:2 b:pick a:side:3 a:side:decider',
  bo7: 'a:pick b:side:0 b:pick a:side:1 a:pick b:side:2 b:pick a:side:3 a:pick b:side:4 b:pick a:side:5 a:side:decider',
};
for (const format of ['bo1', 'bo3', 'bo5', 'bo7'] as const) {
  for (const starter of ['a', 'b'] as const) {
    test(`standard ${format}, starter ${starter}: exact sequence and every transition`, () => {
      const steps = createTemplateSteps('standard', format, 7);
      expect(labels(steps)).toBe(exactStandard[format]);
      const expected =
        starter === 'a'
          ? exactStandard[format]
          : exactStandard[format].replace(/[ab]:/g, (match) =>
              match === 'a:' ? 'b:' : 'a:'
            );
      expect(labels(getFormatSteps(format, 7, starter, steps))).toBe(expected);
      play(format, pool, steps, starter);
    });
  }
}
for (const starter of ['a', 'b'] as const) {
  test(`grand final upper actual A, role A actual ${starter}`, () => {
    const steps = createGrandFinalSteps();
    const resolved = getFormatSteps('bo5', 7, starter, steps);
    const second = other(starter);
    expect(labels(resolved)).toBe(
      `a:ban a:ban ${starter}:pick ${second}:side:0 ${second}:pick ${starter}:side:1 ${starter}:pick ${second}:side:2 ${second}:pick ${starter}:side:3 ${second}:side:decider`
    );
    for (const chooserTeam of ['a', 'b', undefined] as const) {
      const pending = {
        mode: 'upper-bracket-choice' as const,
        chooserTeam,
        choicePending: true,
      };
      for (const unauthorized of ['b', 'spectator'] as const) {
        expect(
          resolveCoinflipChoice(pending, unauthorized as Team, starter, 'now')
        ).toBe(pending);
      }
      const choice = resolveCoinflipChoice(pending, 'a', starter, 'now');
      expect(choice.firstActor).toBe(starter);
      expect(choice.choicePending).toBe(false);
    }
    expect(
      deriveVetoState('bo5', pool, [], null, steps).currentStep
    ).toBeNull();
    const { state, actions } = play('bo5', pool, steps, starter);
    expect(
      actions
        .filter((action) => action.type === 'ban')
        .map((action) => action.team)
    ).toEqual(['a', 'a']);
    expect(state.pickedMaps.map((map) => map.pickedBy)).toEqual([
      starter,
      second,
      starter,
      second,
    ]);
    expect(state.pickedMaps.map((map) => map.sidePickedBy)).toEqual([
      second,
      starter,
      second,
      starter,
    ]);
    expect(
      actions
        .filter((action) => action.type === 'side')
        .map((action) => action.team)
    ).toEqual([second, starter, second, starter, second]);
    expect(state.pickedMaps.map((map) => map.side)).toEqual([
      'attacker',
      'attacker',
      'attacker',
      'attacker',
    ]);
    for (const index of [0, 1]) {
      const prefix = actions.slice(0, index);
      for (const unauthorized of ['b', 'spectator'] as const) {
        const forged = { ...actions[index], team: unauthorized as Team };
        expect(
          validateAction(
            forged,
            'bo5',
            pool,
            prefix,
            unauthorized,
            starter,
            steps
          ).valid
        ).toBe(false);
        expect(
          deriveVetoState('bo5', pool, [...prefix, forged], starter, steps)
            .acceptedActions
        ).toEqual(prefix);
      }
    }
  });
}
for (const mapCount of [7, 8]) {
  for (const starter of ['a', 'b'] as const) {
    test(`missing metadata legacy BO5 ${mapCount} maps starter ${starter}`, () => {
      const maps = MAP_POOL.slice(0, mapCount).map((map) => map.id);
      const expected =
        mapCount === 7
          ? 'a:ban b:pick a:side:0 a:pick b:side:1 b:pick a:side:2 a:pick b:side:3 b:ban a:side:decider'
          : 'a:ban b:pick a:side:0 a:pick b:side:1 b:pick a:side:2 a:pick b:side:3 b:ban a:ban b:side:decider';
      expect(labels(generateSteps(5, mapCount))).toBe(expected);
      const legacy = preset('bo5', maps);
      delete legacy.schemaVersion;
      delete legacy.sequencePattern;
      delete legacy.steps;
      const parsed = validatePreset(legacy);
      expect(parsed.errors).toEqual([]);
      expect(parsed.preset?.steps).toBeUndefined();
      play('bo5', maps, undefined, starter);
    });
  }
}
for (const [format, count] of [
  ['bo1', 2],
  ['bo3', 3],
  ['bo3', 4],
  ['bo3', 8],
  ['bo5', 5],
  ['bo5', 6],
  ['bo5', 8],
  ['bo7', 7],
  ['bo7', 8],
] as const) {
  test(`parameterized ${format} ${count} maps, both starters`, () => {
    const maps = MAP_POOL.slice(0, count).map((map) => map.id);
    const pattern = format === 'bo1' ? 'legacy-split-bans' : 'picks-first';
    const steps = createTemplateSteps(pattern, format, count);
    const bans = steps.filter((step) => step.type === 'ban');
    if (pattern === 'picks-first') {
      expect(steps[0]).toEqual({ team: 'a', type: 'pick' });
      expect(bans.map((step) => step.team)).toEqual(
        Array.from({ length: bans.length }, (_, i) => (i % 2 ? 'b' : 'a'))
      );
      expect(steps.at(-1)?.team).toBe(bans.length % 2 ? 'b' : 'a');
    }
    const candidate = {
      ...preset(format, maps),
      sequencePattern: pattern,
      steps,
    };
    expect(validatePreset(candidate).errors).toEqual([]);
    for (const starter of ['a', 'b'] as const)
      play(format, maps, steps, starter);
    expect(createTemplateSteps('legacy-split-bans', format, count)).toEqual(
      generateSteps(Number(format.slice(2)) as 1 | 3 | 5 | 7, count)
    );
  });
}

for (const format of ['bo1', 'bo3', 'bo7'] as const) {
  for (const count of [7, 8]) {
    test(`unversioned ${format} ${count} maps preserves legacy rules for both starters`, () => {
      const maps = MAP_POOL.slice(0, count).map((map) => map.id);
      const legacy = preset(format, maps);
      delete legacy.schemaVersion;
      delete legacy.sequencePattern;
      delete legacy.steps;
      expect(validatePreset(legacy).preset).toEqual(legacy);
      for (const starter of ['a', 'b'] as const)
        play(format, maps, undefined, starter);
    });
  }
}

test('templates reject unsupported combinations rather than invent BO5 bans', () => {
  for (const count of [5, 6, 8, 9])
    expect(() => createTemplateSteps('standard', 'bo5', count)).toThrow();
  expect(() => createTemplateSteps('picks-first', 'bo1', 7)).toThrow();
  expect(() => createTemplateSteps('standard', 'bo7', 6)).toThrow();
  expect(() => createTemplateSteps('standard', 'custom', 7)).toThrow();
  expect(() => createTemplateSteps('manual', 'bo3', 7)).toThrow();
});

test('coinflip and seeded initiative only accept the entitled chooser and valid actual team', () => {
  for (const winner of ['a', 'b'] as const) {
    const pending = startCoinFlip(
      'coinflip',
      winner,
      'seed',
      '2026-10-19T00:00:00Z'
    );
    expect(pending.firstActor).toBeUndefined();
    for (const starter of ['a', 'b'] as const) {
      expect(
        resolveCoinflipChoice(pending, other(winner), starter, 'now')
      ).toBe(pending);
      const result = resolveCoinflipChoice(pending, winner, starter, 'now');
      expect(result.firstActor).toBe(starter);
      expect(
        resolveCoinflipChoice(result, winner, other(starter), 'later')
      ).toBe(result);
    }
  }
  const seeded = {
    mode: 'team-a-choice' as const,
    choicePending: true,
    chooserTeam: 'a' as const,
  };
  expect(resolveCoinflipChoice(seeded, 'b', 'b', 'now')).toBe(seeded);
  expect(resolveCoinflipChoice(seeded, 'a', 'b', 'now').firstActor).toBe('b');
  expect(resolveCoinflipChoice(seeded, 'a', 'bad' as Team, 'now')).toBe(seeded);
});

test('replay rejects malformed actions, future gaps, invalid teams/types/sides and repeated maps', () => {
  const steps = createTemplateSteps('standard', 'bo5', 7);
  const initial = deriveVetoState('bo5', pool, [], 'a', steps);
  const first = actionFor(initial);
  const badActions = [
    null,
    { ...first, stepIndex: -1 },
    { ...first, stepIndex: 0.5 },
    { ...first, team: 'b' },
    { ...first, team: 'spectator' },
    { ...first, type: 'pick' },
    { ...first, mapId: 'unknown' },
    { ...first, side: 'attacker' },
    { ...first, confirmedAt: {} },
    { ...first, confirmedAt: 'bad' },
    { ...first, confirmedByClientId: NaN },
    { ...first, id: '' },
  ];
  for (const bad of badActions) {
    expect(
      deriveVetoState('bo5', pool, [bad] as ConfirmedAction[], 'a', steps)
    ).toEqual(initial);
    expect(
      validateAction(bad as ConfirmedAction, 'bo5', pool, [], 'a', 'a', steps)
        .valid
    ).toBe(false);
  }
  const { actions } = play('bo5', pool, steps, 'a');
  const malformedId = JSON.parse(
    JSON.stringify({ ...first, id: { toString: null } })
  ) as ConfirmedAction;
  const expectedPrefix = deriveVetoState('bo5', pool, actions, 'a', steps);
  expect(
    deriveVetoState('bo5', pool, [malformedId, ...actions], 'a', steps)
  ).toEqual(expectedPrefix);
  expect(
    deriveVetoState('bo5', pool, [...actions, malformedId], 'a', steps)
  ).toEqual(expectedPrefix);
  const alternate = { ...first, id: 'Z-action', mapId: pool[1] };
  const ordinalFirst = { ...first, id: 'a-action' };
  expect(
    deriveVetoState('bo5', pool, [ordinalFirst, alternate], 'a', steps)
      .acceptedActions
  ).toEqual([alternate]);
  expect(
    deriveVetoState('bo5', pool, [alternate, ordinalFirst], 'a', steps)
      .acceptedActions
  ).toEqual([alternate]);
  expect(
    deriveVetoState('bo5', pool, actions.slice(1), 'a', steps).currentStepIndex
  ).toBe(0);
  expect(
    deriveVetoState('bo5', pool, [actions[0], ...actions.slice(2)], 'a', steps)
      .currentStepIndex
  ).toBe(1);
  expect(
    deriveVetoState('bo5', pool, [...actions].reverse(), 'a', steps).isComplete
  ).toBe(true);
  expect(
    deriveVetoState('bo5', pool, actions, null, steps).acceptedActions
  ).toEqual([]);
  const repeated = { ...actions[1], mapId: actions[0].mapId };
  expect(
    deriveVetoState(
      'bo5',
      pool,
      [actions[0], repeated, ...actions.slice(2)],
      'a',
      steps
    ).currentStepIndex
  ).toBe(1);
  for (const side of ['invalid', '', null]) {
    const malformed = { ...actions[3], side } as ConfirmedAction;
    expect(
      deriveVetoState(
        'bo5',
        pool,
        [...actions.slice(0, 3), malformed, ...actions.slice(4)],
        'a',
        steps
      ).currentStepIndex
    ).toBe(3);
  }
  const repeatedId = { ...actions[1], id: actions[0].id };
  expect(
    deriveVetoState('bo5', pool, [actions[0], repeatedId], 'a', steps)
      .currentStepIndex
  ).toBe(1);
});

test('preset validation rejects boundaries and projects all untrusted fields out', () => {
  const valid = preset();
  expect(validatePreset(valid).errors).toEqual([]);
  for (const change of [
    { schemaVersion: 2 },
    { schemaVersion: 1, steps: undefined },
    { sequencePattern: 'unknown' },
    { format: 'custom' },
    { mapPool: ['unknown', ...pool.slice(1)] },
    { mapPool: [pool[0], ...pool.slice(0, 6)] },
    { mapPool: pool.slice(0, 4) },
    { mapPool: [] },
    { firstActorMode: 'bad' },
    { pickBanTimerSeconds: 29 },
    { sideTimerSeconds: 19 },
    { pickBanTimerSeconds: 3601 },
    { sideTimerSeconds: 20.5 },
    { pickBanTimerSeconds: Infinity },
    { timerEnforcement: 'bad' },
    { roomImportCode: '<script>' },
    { roomImportCode: 123 },
    { roomImportCode: null },
    { name: '' },
    { name: 'x'.repeat(121) },
    { notes: 'x'.repeat(4001) },
    { updatedAt: 'invalid' },
    { description: '\u0000' },
    { steps: [] },
    { steps: Array(33).fill({ team: 'a', type: 'ban' }) },
    { steps: [null] },
    { steps: [{ team: 'z', type: 'explode' }] },
    { tokens: 'x'.repeat(MAX_PRESET_BYTES) },
  ])
    expect(
      validatePreset({ ...valid, ...change }).preset,
      JSON.stringify(change)
    ).toBeNull();
  for (const timer of [30, 3600, null])
    expect(
      validatePreset({ ...valid, pickBanTimerSeconds: timer }).errors
    ).toEqual([]);
  for (const timer of [20, 3600, null])
    expect(
      validatePreset({ ...valid, sideTimerSeconds: timer }).errors
    ).toEqual([]);
  const projected = validatePreset({
    ...valid,
    tokens: { a: 'secret' },
    participants: ['private'],
    actions: [],
    roomId: 'private',
    steps: valid.steps!.map((step) => ({ ...step, token: 'secret' })),
  }).preset!;
  expect(JSON.stringify(projected)).not.toContain('secret');
  expect(projected).not.toHaveProperty('roomId');
  expect(projected).not.toHaveProperty('participants');
});

test('preset steps require precise pick references, opponents, final decider and full depletion', () => {
  const valid = {
    ...preset(),
    steps: createTemplateSteps('standard', 'bo5', 7),
  };
  for (const mutate of [
    (steps: VetoStep[]) => {
      steps[3].forPickIndex = 1;
    },
    (steps: VetoStep[]) => {
      steps[3].team = 'a';
    },
    (steps: VetoStep[]) => {
      steps[2].forPickIndex = 0;
    },
    (steps: VetoStep[]) => {
      steps[2].actor = 'upper-bracket';
    },
    (steps: VetoStep[]) => {
      steps[3].forDecider = true;
    },
    (steps: VetoStep[]) => {
      steps[3].forDecider = false;
    },
    (steps: VetoStep[]) => {
      steps.at(-1)!.forPickIndex = 4;
    },
    (steps: VetoStep[]) => {
      steps.pop();
    },
    (steps: VetoStep[]) => {
      steps.splice(2, 1);
    },
    (steps: VetoStep[]) => {
      steps.splice(1, 0, { team: 'b', type: 'ban' });
    },
  ]) {
    const steps = structuredClone(valid.steps);
    mutate(steps);
    expect(validatePreset({ ...valid, steps }).preset).toBeNull();
  }
  expect(
    validatePreset({ ...valid, sequencePattern: 'legacy-split-bans' }).preset
  ).toBeNull();
  expect(
    validatePreset({ ...valid, firstActorMode: 'upper-bracket-choice' }).preset
  ).toBeNull();
  expect(
    validatePreset({
      ...valid,
      firstActorMode: 'upper-bracket-choice',
      steps: createGrandFinalSteps(),
    }).errors
  ).toEqual([]);
});

test('side validation rejects wrong maps and invalid sides, including premature decider actions', () => {
  const steps = createTemplateSteps('standard', 'bo3', 7);
  const { actions } = play('bo3', pool, steps, 'a');
  const sideIndex = steps.findIndex((step) => step.forPickIndex === 0);
  const side = actions[sideIndex];
  const prefix = actions.slice(0, sideIndex);
  for (const malformed of [
    { ...side, side: 'invalid' },
    { ...side, mapId: 'not-the-picked-map' },
    { ...side, team: other(side.team) },
  ]) {
    expect(
      validateAction(
        malformed as ConfirmedAction,
        'bo3',
        pool,
        prefix,
        side.team,
        'a',
        steps
      ).valid
    ).toBe(false);
  }
  const decider = actions.at(-1)!;
  expect(deriveVetoState('bo3', pool, [decider], 'a', steps).isComplete).toBe(
    false
  );
  const beforeFinal = actions.slice(0, -1);
  expect(
    validateAction(
      { ...decider, mapId: actions[0].mapId },
      'bo3',
      pool,
      beforeFinal,
      decider.team,
      'a',
      steps
    ).valid
  ).toBe(false);
  expect(
    deriveVetoState(
      'bo3',
      pool,
      [...beforeFinal, { ...decider, side: 'invalid' as 'attacker' }],
      'a',
      steps
    ).isComplete
  ).toBe(false);
});

test('published catalog contains only versioned Default and separate grand final with no unverified import code', () => {
  const index = JSON.parse(readFileSync('public/presets/index.json', 'utf8'));
  expect(index.groups.map((group: { id: string }) => group.id)).toEqual([
    'default',
    'grand-final',
  ]);
  for (const group of index.groups) {
    for (const stage of group.stages) {
      const value = JSON.parse(
        readFileSync(`public/presets/${stage.presetId}.json`, 'utf8')
      );
      const result = validatePreset(value);
      expect(result.errors).toEqual([]);
      expect(result.preset?.mapPool).toEqual(pool);
      expect(result.preset?.schemaVersion).toBe(1);
      expect(result.preset?.roomImportCode).toBeUndefined();
      expect(result.preset?.pickBanTimerSeconds).toBe(50);
      expect(result.preset?.sideTimerSeconds).toBe(35);
    }
  }
});
