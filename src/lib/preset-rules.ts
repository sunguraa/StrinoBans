import type { VetoPreset } from '@/types/preset';
import type { Format, Team } from '@/types/veto';
import { MAP_POOL } from '@/lib/maps';
import {
  bestOfForFormat,
  generateSteps,
  minMapsForBestOf,
  type VetoStep,
} from '@/lib/state-machine';

export type SequencePattern =
  | 'standard'
  | 'picks-first'
  | 'legacy-split-bans'
  | 'manual';
export const MAX_PRESET_BYTES = 65_536;
const formats = ['bo1', 'bo3', 'bo5', 'bo7'];
const patterns = ['standard', 'picks-first', 'legacy-split-bans', 'manual'];
const other = (team: Team): Team => (team === 'a' ? 'b' : 'a');

export function createTemplateSteps(
  pattern: SequencePattern,
  format: Format,
  mapCount: number
): VetoStep[] {
  const bestOf = bestOfForFormat(format);
  if (
    !formats.includes(format) ||
    !Number.isInteger(mapCount) ||
    mapCount < minMapsForBestOf(bestOf) ||
    mapCount > MAP_POOL.length
  ) {
    throw new Error('Unsupported series length or map count');
  }
  if (pattern === 'legacy-split-bans') return generateSteps(bestOf, mapCount);
  if (pattern === 'manual')
    throw new Error('Manual sequences must be edited explicitly');
  if (pattern === 'standard' && format !== 'bo5')
    return generateSteps(bestOf, mapCount);
  if (pattern === 'standard' && mapCount !== 7) {
    throw new Error(
      'The two-opening-bans BO5 template requires exactly seven maps'
    );
  }
  if (pattern === 'picks-first' && bestOf === 1) {
    throw new Error('Picks first requires BO3 or longer');
  }
  if (pattern !== 'standard' && pattern !== 'picks-first')
    throw new Error('Unknown sequence pattern');
  const steps: VetoStep[] = [];
  if (pattern === 'standard')
    steps.push({ team: 'a', type: 'ban' }, { team: 'b', type: 'ban' });
  for (let i = 0; i < bestOf - 1; i++) {
    const team: Team = i % 2 === 0 ? 'a' : 'b';
    steps.push(
      { team, type: 'pick' },
      { team: other(team), type: 'side', forPickIndex: i }
    );
  }
  let banTeam: Team = 'a';
  if (pattern === 'picks-first') {
    for (let i = 0; i < mapCount - bestOf; i++) {
      steps.push({ team: banTeam, type: 'ban' });
      banTeam = other(banTeam);
    }
  }
  steps.push({ team: banTeam, type: 'side', forDecider: true });
  return steps;
}

export function createGrandFinalSteps(): VetoStep[] {
  const steps = createTemplateSteps('standard', 'bo5', 7);
  steps[0] = { team: 'a', type: 'ban', actor: 'upper-bracket' };
  steps[1] = { team: 'a', type: 'ban', actor: 'upper-bracket' };
  steps[steps.length - 1] = { team: 'b', type: 'side', forDecider: true };
  return steps;
}

function sameSteps(a: VetoStep[], b: VetoStep[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (step, i) =>
        step.team === b[i].team &&
        step.type === b[i].type &&
        step.forPickIndex === b[i].forPickIndex &&
        step.forDecider === b[i].forDecider &&
        step.actor === b[i].actor
    )
  );
}

export function validatePreset(value: unknown): {
  preset: VetoPreset | null;
  errors: string[];
} {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { preset: null, errors: ['Preset must be an object'] };
  }
  try {
    if (
      new TextEncoder().encode(JSON.stringify(value)).length > MAX_PRESET_BYTES
    ) {
      return { preset: null, errors: ['Preset exceeds 64 KiB'] };
    }
  } catch {
    return { preset: null, errors: ['Preset must be JSON data'] };
  }
  const input = value as Record<string, unknown>;
  const text = (
    key: string,
    max: number,
    required = true
  ): string | undefined => {
    const entry = input[key];
    if (entry === undefined && !required) return undefined;
    if (
      typeof entry !== 'string' ||
      entry.length > max ||
      (required && entry.trim().length === 0) ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(entry)
    ) {
      errors.push(
        `${key} must be ${required ? 'a nonempty' : 'a'} string of at most ${max} characters`
      );
      return undefined;
    }
    return entry;
  };
  const id = text('id', 100);
  const name = text('name', 120);
  const author = text('author', 120);
  const description = text('description', 2000, false) ?? '';
  const updatedAt = text('updatedAt', 64);
  const ruleset = text('ruleset', 100);
  const notes = text('notes', 4000, false);
  const roomImportCode = text('roomImportCode', 128, false);
  if (id && !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id))
    errors.push('id contains unsupported characters');
  if (updatedAt && !Number.isFinite(Date.parse(updatedAt)))
    errors.push('updatedAt must be a valid date');
  if (
    roomImportCode !== undefined &&
    !/^[a-zA-Z0-9_-]{1,128}$/.test(roomImportCode)
  )
    errors.push('roomImportCode contains unsupported characters');
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1)
    errors.push('Unsupported schemaVersion');
  const format = input.format as Format;
  if (!formats.includes(format))
    errors.push('format must be bo1, bo3, bo5, or bo7');
  const pattern = input.sequencePattern as SequencePattern | undefined;
  if (pattern !== undefined && !patterns.includes(pattern))
    errors.push('Unknown sequencePattern');
  if (input.schemaVersion === 1 && pattern === undefined)
    errors.push('Version 1 requires sequencePattern');
  const mode = input.firstActorMode;
  if (
    ![
      'random',
      'coinflip',
      'team-a',
      'team-a-choice',
      'upper-bracket-choice',
    ].includes(mode as string)
  )
    errors.push('Invalid firstActorMode');
  const pool = input.mapPool;
  const knownMaps = MAP_POOL.map((map) => map.id);
  if (
    !Array.isArray(pool) ||
    pool.length > MAP_POOL.length ||
    pool.some((map) => typeof map !== 'string' || !knownMaps.includes(map)) ||
    new Set(pool).size !== pool.length
  )
    errors.push('mapPool must contain unique known maps');
  const mapPool: string[] = Array.isArray(pool)
    ? pool.filter((map): map is string => typeof map === 'string')
    : [];
  const bestOf = bestOfForFormat(format);
  if (mapPool.length < minMapsForBestOf(bestOf))
    errors.push(
      `This format requires at least ${minMapsForBestOf(bestOf)} maps`
    );
  for (const [key, minimum] of [
    ['pickBanTimerSeconds', 30],
    ['sideTimerSeconds', 20],
  ] as const) {
    const timer = input[key];
    if (
      timer !== undefined &&
      timer !== null &&
      (typeof timer !== 'number' ||
        !Number.isInteger(timer) ||
        timer < minimum ||
        timer > 3600)
    ) {
      errors.push(`${key} must be null or an integer from ${minimum} to 3600`);
    }
  }
  if (
    input.timerEnforcement !== undefined &&
    input.timerEnforcement !== 'none' &&
    input.timerEnforcement !== 'random-after-timeout'
  )
    errors.push('Invalid timerEnforcement');
  let steps: VetoStep[] | undefined;
  if (input.steps !== undefined) {
    if (
      !Array.isArray(input.steps) ||
      input.steps.length === 0 ||
      input.steps.length > 32
    ) {
      errors.push('steps must contain between 1 and 32 entries');
    } else {
      steps = [];
      for (const entry of input.steps) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          errors.push('Every step must be an object');
          continue;
        }
        const step = entry as Record<string, unknown>;
        if (step.team !== 'a' && step.team !== 'b')
          errors.push('Invalid step team');
        if (!['ban', 'pick', 'side'].includes(step.type as string))
          errors.push('Invalid step type');
        if (
          step.forPickIndex !== undefined &&
          (!Number.isInteger(step.forPickIndex) ||
            (step.forPickIndex as number) < 0)
        )
          errors.push('Invalid pick reference');
        if (step.forDecider !== undefined && step.forDecider !== true)
          errors.push('forDecider must be true when present');
        if (step.actor !== undefined && step.actor !== 'upper-bracket')
          errors.push('Invalid step actor');
        steps.push({
          team: step.team as Team,
          type: step.type as VetoStep['type'],
          ...(step.forPickIndex !== undefined
            ? { forPickIndex: step.forPickIndex as number }
            : {}),
          ...(step.forDecider !== undefined
            ? { forDecider: step.forDecider as boolean }
            : {}),
          ...(step.actor !== undefined
            ? { actor: step.actor as 'upper-bracket' }
            : {}),
        });
      }
    }
  } else if (input.schemaVersion === 1 || pattern !== undefined)
    errors.push('Versioned rules require explicit compiled steps');
  const effective = steps ?? generateSteps(bestOf, mapPool.length);
  let remaining = mapPool.length;
  let picks = 0;
  let bans = 0;
  let sides = 0;
  effective.forEach((step, index) => {
    if (
      step.type !== 'side' &&
      (step.forPickIndex !== undefined || step.forDecider !== undefined)
    )
      errors.push('Only side steps may reference picks or decider');
    if (step.type === 'ban' || step.type === 'pick') {
      remaining--;
      if (remaining < 1) errors.push('Sequence depletes the decider map');
      if (step.type === 'ban') bans++;
      else {
        const next = effective[index + 1];
        if (
          !next ||
          next.type !== 'side' ||
          next.team !== other(step.team) ||
          next.forPickIndex !== picks ||
          next.forDecider !== undefined
        )
          errors.push(
            'Each pick needs an immediate opponent side with its pick index'
          );
        picks++;
      }
    } else if (step.type === 'side') {
      sides++;
      if (step.forDecider === true) {
        if (
          index !== effective.length - 1 ||
          remaining !== 1 ||
          step.forPickIndex !== undefined
        )
          errors.push('Decider side must be final with exactly one map left');
      } else if (
        index === 0 ||
        effective[index - 1].type !== 'pick' ||
        step.forPickIndex !== picks - 1
      )
        errors.push('Side step must immediately follow its referenced pick');
    }
  });
  if (
    picks !== bestOf - 1 ||
    bans !== mapPool.length - bestOf ||
    sides !== bestOf ||
    remaining !== 1 ||
    !effective[effective.length - 1]?.forDecider
  )
    errors.push(
      'Sequence must have exact picks, bans, sides, and one final decider'
    );
  const privileged = effective.some((step) => step.actor !== undefined);
  if (!privileged && effective.length > 0 && effective[0].team !== 'a')
    errors.push('Assign the first action to Team 1 (the first actor).');
  if (privileged || mode === 'upper-bracket-choice') {
    if (
      format !== 'bo5' ||
      mapPool.length !== 7 ||
      mode !== 'upper-bracket-choice' ||
      !sameSteps(effective, createGrandFinalSteps())
    )
      errors.push(
        'Upper-bracket privilege requires the fixed seven-map BO5 grand final'
      );
  } else if (
    pattern !== undefined &&
    pattern !== 'manual' &&
    formats.includes(format)
  ) {
    try {
      if (
        !sameSteps(
          effective,
          createTemplateSteps(pattern, format, mapPool.length)
        )
      )
        errors.push('Compiled steps do not match sequencePattern');
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : 'Unsupported template'
      );
    }
  }
  if (errors.length) return { preset: null, errors };
  const preset: VetoPreset = {
    id: id!,
    name: name!,
    author: author!,
    description: description!,
    updatedAt: updatedAt!,
    format,
    ruleset: ruleset!,
    mapPool,
    firstActorMode: mode as VetoPreset['firstActorMode'],
    ...(input.schemaVersion === 1 ? { schemaVersion: 1 as const } : {}),
    ...(pattern !== undefined ? { sequencePattern: pattern } : {}),
    ...(steps !== undefined ? { steps } : {}),
    ...(input.pickBanTimerSeconds !== undefined
      ? { pickBanTimerSeconds: input.pickBanTimerSeconds as number | null }
      : {}),
    ...(input.sideTimerSeconds !== undefined
      ? { sideTimerSeconds: input.sideTimerSeconds as number | null }
      : {}),
    ...(input.timerEnforcement !== undefined
      ? {
          timerEnforcement:
            input.timerEnforcement as VetoPreset['timerEnforcement'],
        }
      : {}),
    ...(roomImportCode !== undefined ? { roomImportCode } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
  return { preset, errors: [] };
}
