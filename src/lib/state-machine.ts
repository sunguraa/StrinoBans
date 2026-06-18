import type { Format, Team, Side, MapId, ActionType } from '@/types/veto';

export type StepType = 'ban' | 'pick' | 'side';

export interface VetoStep {
  team: Team;
  type: StepType;
  forPickIndex?: number;
  forDecider?: boolean;
}

export interface ConfirmedAction {
  id: string;
  stepIndex: number;
  team: Team;
  type: ActionType;
  mapId?: MapId;
  side?: Side;
  confirmedAt: string;
  confirmedByClientId: number;
}

export interface PickedMap {
  mapId: MapId;
  pickedBy: Team;
  side: Side;
  sidePickedBy: Team;
}

export interface VetoState {
  currentStepIndex: number;
  currentStep: VetoStep | null;
  currentTeam: Team | null;
  currentActionType: StepType | null;
  bannedMaps: MapId[];
  pickedMaps: PickedMap[];
  remainingMaps: MapId[];
  deciderMap: MapId | null;
  isComplete: boolean;
  pendingPick: { mapId: MapId; pickedBy: Team; pickStepIndex: number } | null;
}

export interface CoinFlipResult {
  winner: Team;
  method: string;
  seed: string;
  rolledAt: string;
  flipWinner?: Team;
  choicePending?: boolean;
}

export type BestOf = 1 | 3 | 5 | 7;

function otherTeam(team: Team): Team {
  return team === 'a' ? 'b' : 'a';
}

function swapStepTeams(steps: VetoStep[]): VetoStep[] {
  return steps.map((step) => ({ ...step, team: otherTeam(step.team) }));
}

/**
 * Builds a fair pick/ban sequence for any best-of and (odd) map count.
 *
 * Bans alternate between teams, picks alternate (each pick's side is chosen by the
 * opposing team), and the single leftover map becomes the decider whose side is
 * chosen last. For an 8-map pool this reproduces the classic Bo1 and Bo3 orderings.
 *
 *   mapsPlayed = bestOf             (1, 3, 5, 7 — the decider is the last map)
 *   picks      = bestOf - 1         (the decider is leftover, not an explicit pick)
 *   bans       = mapCount - bestOf  (the rest of the pool; may be odd, e.g. 8-map Bo1)
 *
 * The pool size has no parity requirement — only the best-of (maps played) is odd,
 * which is what guarantees a series can't tie.
 */
export function generateSteps(bestOf: BestOf, mapCount: number): VetoStep[] {
  const picks = bestOf - 1;
  const bans = mapCount - bestOf;
  if (bans < 0) return [];

  const openingBans = Math.floor(bans / 2);
  const closingBans = bans - openingBans;

  const steps: VetoStep[] = [];
  let turn: Team = 'a';
  const advance = () => {
    turn = otherTeam(turn);
  };

  for (let i = 0; i < openingBans; i++) {
    steps.push({ team: turn, type: 'ban' });
    advance();
  }
  for (let i = 0; i < picks; i++) {
    const picker = turn;
    steps.push({ team: picker, type: 'pick' });
    steps.push({ team: otherTeam(picker), type: 'side', forPickIndex: i });
    advance();
  }
  for (let i = 0; i < closingBans; i++) {
    steps.push({ team: turn, type: 'ban' });
    advance();
  }
  steps.push({ team: turn, type: 'side', forDecider: true });
  return steps;
}

export function bestOfForFormat(format: Format): BestOf {
  switch (format) {
    case 'bo3':
      return 3;
    case 'bo5':
      return 5;
    case 'bo7':
      return 7;
    case 'bo1':
    case 'custom':
    default:
      return 1;
  }
}

/** Minimum map pool size required to run a given best-of. */
export function minMapsForBestOf(bestOf: BestOf): number {
  // Need at least `bestOf` maps to play; Bo1 needs at least one ban to be a real
  // veto, so floor the minimum at 2.
  return Math.max(2, bestOf);
}

export function getFormatSteps(
  format: Format,
  mapCount?: number,
  coinFlipWinner?: Team | null,
  customSteps?: VetoStep[],
): VetoStep[] {
  const steps = customSteps && customSteps.length > 0
    ? customSteps
    : generateSteps(bestOfForFormat(format), mapCount ?? 8);
  if (coinFlipWinner === 'b') {
    return swapStepTeams(steps);
  }
  return steps;
}

export function deriveVetoState(
  format: Format,
  mapPool: MapId[],
  actions: ConfirmedAction[],
  coinFlipWinner?: Team | null,
  customSteps?: VetoStep[],
): VetoState {
  const steps = getFormatSteps(format, mapPool.length, coinFlipWinner, customSteps);

  const bannedMaps: MapId[] = [];
  const pickedMaps: PickedMap[] = [];
  const usedMaps = new Set<MapId>();

  const sortedActions = [...actions].sort((a, b) => {
    if (a.stepIndex !== b.stepIndex) return a.stepIndex - b.stepIndex;
    return a.confirmedAt.localeCompare(b.confirmedAt);
  });

  const seenStepIndices = new Set<number>();
  let pendingPick: { mapId: MapId; pickedBy: Team; pickStepIndex: number } | null = null;

  for (const action of sortedActions) {
    if (seenStepIndices.has(action.stepIndex)) continue;
    seenStepIndices.add(action.stepIndex);

    if (action.stepIndex >= steps.length) continue;

    const step = steps[action.stepIndex];
    if (!step) continue;

    switch (action.type) {
      case 'ban':
        if (action.mapId && !usedMaps.has(action.mapId)) {
          bannedMaps.push(action.mapId);
          usedMaps.add(action.mapId);
        }
        break;
      case 'pick':
        if (action.mapId && !usedMaps.has(action.mapId)) {
          pendingPick = {
            mapId: action.mapId,
            pickedBy: action.team,
            pickStepIndex: action.stepIndex,
          };
          usedMaps.add(action.mapId);
        }
        break;
      case 'side':
        if (pendingPick && action.side) {
          pickedMaps.push({
            mapId: pendingPick.mapId,
            pickedBy: pendingPick.pickedBy,
            side: action.side,
            sidePickedBy: action.team,
          });
          pendingPick = null;
        } else if (action.side && !pendingPick && action.mapId) {
          // noop: decider side handled below
        }
        break;
    }
  }

  const remainingMaps = mapPool.filter((m) => !usedMaps.has(m));
  const currentStepIndex = sortedActions.filter((a) => seenStepIndices.has(a.stepIndex)).length;
  const currentStep = currentStepIndex < steps.length ? steps[currentStepIndex] : null;
  const deciderMap = remainingMaps.length === 1 ? remainingMaps[0] : null;

  const deciderSideAction = actions.find(
    (a) => a.type === 'side' && steps[a.stepIndex]?.forDecider === true,
  );

  const isComplete =
    currentStepIndex >= steps.length ||
    (currentStepIndex === steps.length - 1 &&
      currentStep?.type === 'side' &&
      currentStep?.forDecider === true &&
      deciderSideAction !== undefined);

  return {
    currentStepIndex,
    currentStep,
    currentTeam: currentStep?.team ?? null,
    currentActionType: currentStep?.type ?? null,
    bannedMaps,
    pickedMaps,
    remainingMaps,
    deciderMap,
    isComplete,
    pendingPick,
  };
}

export function validateAction(
  action: ConfirmedAction,
  format: Format,
  mapPool: MapId[],
  actions: ConfirmedAction[],
  role: Team | 'spectator',
  coinFlipWinner?: Team | null,
  customSteps?: VetoStep[],
): { valid: boolean; reason?: string } {
  const steps = getFormatSteps(format, mapPool.length, coinFlipWinner, customSteps);
  const state = deriveVetoState(format, mapPool, actions, coinFlipWinner, customSteps);

  if (role === 'spectator') {
    return { valid: false, reason: 'Spectators cannot take actions' };
  }
  if (role !== action.team) {
    return { valid: false, reason: `Team ${role} cannot act for team ${action.team}` };
  }

  if (action.stepIndex !== state.currentStepIndex) {
    return {
      valid: false,
      reason: `Expected step ${state.currentStepIndex}, got ${action.stepIndex}`,
    };
  }

  const step = steps[action.stepIndex];
  if (!step) {
    return { valid: false, reason: 'Step index out of bounds' };
  }

  if (action.team !== step.team) {
    return { valid: false, reason: `Expected team ${step.team}, got ${action.team}` };
  }

  if (action.type !== step.type) {
    return { valid: false, reason: `Expected action ${step.type}, got ${action.type}` };
  }

  if (action.type === 'ban' || action.type === 'pick') {
    if (!action.mapId) {
      return { valid: false, reason: 'Missing mapId for ban/pick' };
    }
    if (!state.remainingMaps.includes(action.mapId)) {
      return { valid: false, reason: 'Map not available (already banned/picked)' };
    }
  }

  if (action.type === 'side') {
    if (!action.side) {
      return { valid: false, reason: 'Missing side for side pick' };
    }
    if (step.forDecider) {
      if (state.remainingMaps.length !== 1) {
        return { valid: false, reason: 'Decider not determined yet' };
      }
    } else if (!state.pendingPick) {
      return { valid: false, reason: 'No pending pick to assign side' };
    }
  }

  return { valid: true };
}
