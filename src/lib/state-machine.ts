import type {
  Format,
  Team,
  Side,
  MapId,
  ActionType,
  FirstActorMode,
} from '@/types/veto';

export type StepType = 'ban' | 'pick' | 'side';

export interface VetoStep {
  team: Team;
  type: StepType;
  forPickIndex?: number;
  forDecider?: boolean;
  actor?: 'upper-bracket';
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
  acceptedActions: ConfirmedAction[];
  pendingPick: { mapId: MapId; pickedBy: Team; pickStepIndex: number } | null;
}

export interface FirstActorResult {
  firstActor?: Team;
  mode: FirstActorMode;
  flipSeed?: string;
  flippedAt?: string;
  resolvedAt?: string;
  flipWinner?: Team;
  choicePending?: boolean;
  chooserTeam?: Team;
}

export function canStartFirstActorFlip(
  mode: FirstActorMode | undefined,
  role: Team | 'spectator',
  readyState: Record<Team, boolean>,
  existingResult: FirstActorResult | null
): mode is 'random' | 'coinflip' {
  return (
    (mode === 'random' || mode === 'coinflip') &&
    role === 'a' &&
    readyState.a &&
    readyState.b &&
    existingResult === null
  );
}

export function startCoinFlip(
  mode: 'random' | 'coinflip',
  flipWinner: Team,
  flipSeed: string,
  flippedAt: string
): FirstActorResult {
  const flip = { mode, flipWinner, flipSeed, flippedAt };
  return mode === 'coinflip'
    ? { ...flip, chooserTeam: flipWinner, choicePending: true }
    : { ...flip, firstActor: flipWinner, resolvedAt: flippedAt };
}

export function resolveCoinflipChoice(
  result: FirstActorResult,
  chooser: Team,
  firstActor: Team,
  resolvedAt: string
): FirstActorResult {
  if (
    !['coinflip', 'team-a-choice', 'upper-bracket-choice'].includes(
      result.mode
    ) ||
    !result.choicePending ||
    (result.mode === 'coinflip' ? result.flipWinner : 'a') !== chooser ||
    (firstActor !== 'a' && firstActor !== 'b') ||
    (chooser !== 'a' && chooser !== 'b')
  ) {
    return result;
  }
  return { ...result, firstActor, resolvedAt, choicePending: false };
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
  firstActor?: Team | null,
  customSteps?: VetoStep[]
): VetoStep[] {
  const steps =
    customSteps && customSteps.length > 0
      ? customSteps
      : generateSteps(bestOfForFormat(format), mapCount ?? 8);
  const resolved = firstActor === 'b' ? swapStepTeams(steps) : steps;
  return resolved.map((step) =>
    step.actor === 'upper-bracket' ? { ...step, team: 'a' as const } : step
  );
}

function actionMatches(
  action: ConfirmedAction,
  step: VetoStep | undefined,
  state: VetoState
): boolean {
  if (
    !action ||
    !step ||
    typeof action.id !== 'string' ||
    action.id.length === 0 ||
    typeof action.confirmedAt !== 'string' ||
    !Number.isFinite(Date.parse(action.confirmedAt)) ||
    !Number.isSafeInteger(action.confirmedByClientId) ||
    !Number.isSafeInteger(action.stepIndex) ||
    action.stepIndex !== state.currentStepIndex ||
    action.team !== step.team ||
    action.type !== step.type
  )
    return false;
  if (action.type === 'ban' || action.type === 'pick') {
    return (
      action.side === undefined &&
      typeof action.mapId === 'string' &&
      state.remainingMaps.includes(action.mapId)
    );
  }
  if (action.side !== 'attacker' && action.side !== 'defender') return false;
  if (step.forDecider) {
    return (
      !state.pendingPick &&
      state.remainingMaps.length === 1 &&
      (action.mapId === undefined || action.mapId === state.remainingMaps[0])
    );
  }
  return (
    !!state.pendingPick &&
    state.pendingPick.pickStepIndex === action.stepIndex - 1 &&
    step.forPickIndex === state.pickedMaps.length &&
    (action.mapId === undefined || action.mapId === state.pendingPick.mapId)
  );
}

export function deriveVetoState(
  format: Format,
  mapPool: MapId[],
  actions: ConfirmedAction[],
  firstActor?: Team | null,
  customSteps?: VetoStep[]
): VetoState {
  const actorResolved = firstActor === 'a' || firstActor === 'b';
  const steps = getFormatSteps(format, mapPool.length, firstActor, customSteps);
  const state: VetoState = {
    currentStepIndex: 0,
    currentStep: null,
    currentTeam: null,
    currentActionType: null,
    bannedMaps: [],
    pickedMaps: [],
    remainingMaps: [...mapPool],
    deciderMap: null,
    isComplete: false,
    pendingPick: null,
    acceptedActions: [],
  };
  // Replay only the contiguous valid prefix. Duplicates never count as steps.
  const ordered = actions
    .filter(
      (action) =>
        action &&
        Number.isSafeInteger(action.stepIndex) &&
        action.stepIndex >= 0 &&
        typeof action.confirmedAt === 'string' &&
        typeof action.id === 'string'
    )
    .sort(
      (a, b) =>
        a.stepIndex - b.stepIndex ||
        (a.confirmedAt < b.confirmedAt
          ? -1
          : a.confirmedAt > b.confirmedAt
            ? 1
            : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  const usedIds = new Set<string>();
  if (actorResolved) {
    for (const action of ordered) {
      if (action.stepIndex > state.currentStepIndex) break;
      const step = steps[state.currentStepIndex];
      if (usedIds.has(action.id) || !actionMatches(action, step, state))
        continue;
      usedIds.add(action.id);
      state.acceptedActions.push(action);
      if (action.type === 'ban' || action.type === 'pick') {
        const mapId = action.mapId!;
        state.remainingMaps = state.remainingMaps.filter(
          (map) => map !== mapId
        );
        if (action.type === 'ban') state.bannedMaps.push(mapId);
        else
          state.pendingPick = {
            mapId,
            pickedBy: action.team,
            pickStepIndex: action.stepIndex,
          };
      } else if (!step.forDecider && state.pendingPick) {
        state.pickedMaps.push({
          mapId: state.pendingPick.mapId,
          pickedBy: state.pendingPick.pickedBy,
          side: action.side!,
          sidePickedBy: action.team,
        });
        state.pendingPick = null;
      }
      state.currentStepIndex++;
    }
  }
  state.currentStep = actorResolved
    ? (steps[state.currentStepIndex] ?? null)
    : null;
  state.currentTeam = state.currentStep?.team ?? null;
  state.currentActionType = state.currentStep?.type ?? null;
  state.deciderMap =
    state.remainingMaps.length === 1 ? state.remainingMaps[0] : null;
  state.isComplete =
    actorResolved &&
    steps.length > 0 &&
    state.currentStepIndex === steps.length;
  return state;
}

export function validateAction(
  action: ConfirmedAction,
  format: Format,
  mapPool: MapId[],
  actions: ConfirmedAction[],
  role: Team | 'spectator',
  firstActor?: Team | null,
  customSteps?: VetoStep[]
): { valid: boolean; reason?: string } {
  if (role !== 'a' && role !== 'b') {
    return { valid: false, reason: 'Spectators cannot take actions' };
  }
  if (firstActor !== 'a' && firstActor !== 'b') {
    return { valid: false, reason: 'First actor has not been resolved' };
  }
  const state = deriveVetoState(
    format,
    mapPool,
    actions,
    firstActor,
    customSteps
  );
  if (!action || role !== action.team) {
    return { valid: false, reason: 'Cannot act for another team' };
  }
  if (actions.some((existing) => existing?.id === action.id)) {
    return { valid: false, reason: 'Action already exists' };
  }
  return actionMatches(action, state.currentStep ?? undefined, state)
    ? { valid: true }
    : {
        valid: false,
        reason: 'Action does not match the current step or available map/side',
      };
}
