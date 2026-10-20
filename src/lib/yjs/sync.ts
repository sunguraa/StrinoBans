import * as Y from 'yjs';
import type { FirstActorMode, Format, Team } from '@/types/veto';
import type { ConfirmedAction, FirstActorResult } from '@/lib/state-machine';
import type { VetoPreset } from '@/types/preset';
import { validatePreset } from '@/lib/preset-rules';
export interface SessionMeta {
  sessionId: string;
  presetId: string;
  presetName?: string;
  presetSnapshot?: VetoPreset;
  mapPool: string[];
  format: Format;
  ruleset: string;
  createdAt: string;
  teamAToken: string;
  teamBToken: string;
  firstActorMode: FirstActorMode;
  steps?: VetoPreset['steps'];
  pickBanTimerSeconds?: number | null;
  sideTimerSeconds?: number | null;
  timerEnforcement?: 'none' | 'random-after-timeout';
  roomImportCode?: string;
}

export interface TeamIntent {
  clientId: number;
  team: Team;
  selectedMapId?: string | null;
  color: string;
  name: string;
}

export interface VetoYjsMaps {
  meta: Y.Map<string>;
  actions: Y.Array<string>;
  teamAIntent: Y.Map<string>;
  teamBIntent: Y.Map<string>;
  teamNames: Y.Map<string>;
  readyState: Y.Map<string>;
  firstActorResult: Y.Map<string>;
}

const LOCAL_ORIGIN = 'local-veto';

function parseJson<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getVetoMaps(doc: Y.Doc): VetoYjsMaps {
  return {
    meta: doc.getMap<string>('meta'),
    actions: doc.getArray<string>('actions'),
    teamAIntent: doc.getMap<string>('teamAIntent'),
    teamBIntent: doc.getMap<string>('teamBIntent'),
    teamNames: doc.getMap<string>('teamNames'),
    readyState: doc.getMap<string>('readyState'),
    firstActorResult: doc.getMap<string>('firstActorResult'),
  };
}

export function seedMeta(doc: Y.Doc, meta: SessionMeta): void {
  const maps = getVetoMaps(doc);
  if (maps.meta.has('value')) return;
  doc.transact(() => {
    if (!maps.meta.has('value')) maps.meta.set('value', JSON.stringify(meta));
  }, LOCAL_ORIGIN);
}

export function getMeta(doc: Y.Doc): SessionMeta | null {
  const raw = getVetoMaps(doc).meta.get('value');
  if (!raw || raw.length > 262144) return null;
  const value = parseJson<SessionMeta>(raw);
  if (
    !value ||
    typeof value.sessionId !== 'string' ||
    !value.sessionId ||
    typeof value.teamAToken !== 'string' ||
    !value.teamAToken ||
    typeof value.teamBToken !== 'string' ||
    !value.teamBToken ||
    value.teamAToken === value.teamBToken
  )
    return null;
  const result = validatePreset(
    value.presetSnapshot ?? {
      id: value.presetId,
      name: value.presetName ?? value.presetId,
      author: 'Room creator',
      description: '',
      updatedAt: value.createdAt,
      format: value.format,
      ruleset: value.ruleset,
      mapPool: value.mapPool,
      firstActorMode: value.firstActorMode,
      steps: value.steps,
      pickBanTimerSeconds: value.pickBanTimerSeconds,
      sideTimerSeconds: value.sideTimerSeconds,
      timerEnforcement: value.timerEnforcement,
      roomImportCode: value.roomImportCode,
    }
  );
  if (!result.preset) return null;
  const preset = result.preset;
  return {
    ...value,
    presetId: preset.id,
    presetName: preset.name,
    mapPool: preset.mapPool,
    format: preset.format as Format,
    ruleset: preset.ruleset,
    firstActorMode: preset.firstActorMode,
    steps: preset.steps,
    pickBanTimerSeconds: preset.pickBanTimerSeconds,
    sideTimerSeconds: preset.sideTimerSeconds,
    timerEnforcement: preset.timerEnforcement,
    roomImportCode: preset.roomImportCode,
    ...(value.presetSnapshot ? { presetSnapshot: preset } : {}),
  };
}

export function addAction(doc: Y.Doc, action: ConfirmedAction): boolean {
  const maps = getVetoMaps(doc);
  if (getActions(doc).some((existing) => existing.id === action.id))
    return false;
  doc.transact(() => {
    maps.actions.push([JSON.stringify(action)]);
  }, LOCAL_ORIGIN);
  return true;
}

export function getActions(doc: Y.Doc): ConfirmedAction[] {
  const maps = getVetoMaps(doc);
  const actions: ConfirmedAction[] = [];
  const ids = new Set<string>();
  maps.actions.forEach((value) => {
    if (value.length > 4096 || actions.length >= 128) return;
    const parsed = parseJson<ConfirmedAction>(value);
    if (
      !parsed ||
      typeof parsed.id !== 'string' ||
      ids.has(parsed.id) ||
      !Number.isInteger(parsed.stepIndex) ||
      parsed.stepIndex < 0 ||
      (parsed.team !== 'a' && parsed.team !== 'b') ||
      !['ban', 'pick', 'side'].includes(parsed.type) ||
      typeof parsed.confirmedAt !== 'string' ||
      !Number.isFinite(parsed.confirmedByClientId) ||
      (parsed.mapId !== undefined && typeof parsed.mapId !== 'string') ||
      (parsed.side !== undefined &&
        parsed.side !== 'attacker' &&
        parsed.side !== 'defender')
    )
      return;
    ids.add(parsed.id);
    actions.push(parsed);
  });
  return actions;
}

export function setTeamName(doc: Y.Doc, team: Team, name: string): void {
  const maps = getVetoMaps(doc);
  doc.transact(() => {
    maps.teamNames.set(team, name);
  }, LOCAL_ORIGIN);
}

export function getTeamNames(doc: Y.Doc): Record<Team, string> {
  const maps = getVetoMaps(doc);
  return {
    a: maps.teamNames.get('a') ?? 'Team A',
    b: maps.teamNames.get('b') ?? 'Team B',
  };
}

export function setReady(doc: Y.Doc, team: Team, ready: boolean): void {
  const maps = getVetoMaps(doc);
  doc.transact(() => {
    maps.readyState.set(team, JSON.stringify(ready));
  }, LOCAL_ORIGIN);
}

export function getReadyState(doc: Y.Doc): Record<Team, boolean> {
  const maps = getVetoMaps(doc);
  return {
    a: maps.readyState.get('a') === 'true',
    b: maps.readyState.get('b') === 'true',
  };
}

export function setFirstActorResult(
  doc: Y.Doc,
  result: FirstActorResult
): void {
  const maps = getVetoMaps(doc);
  doc.transact(() => {
    maps.firstActorResult.set('value', JSON.stringify(result));
  }, LOCAL_ORIGIN);
}

export function getFirstActorResult(doc: Y.Doc): FirstActorResult | null {
  const value = parseJson<FirstActorResult>(
    getVetoMaps(doc).firstActorResult.get('value')
  );
  if (
    !value ||
    ![
      'random',
      'coinflip',
      'team-a',
      'team-a-choice',
      'upper-bracket-choice',
    ].includes(value.mode)
  )
    return null;
  if (
    value.firstActor !== undefined &&
    value.firstActor !== 'a' &&
    value.firstActor !== 'b'
  )
    return null;
  if (
    value.flipWinner !== undefined &&
    value.flipWinner !== 'a' &&
    value.flipWinner !== 'b'
  )
    return null;
  if (
    value.chooserTeam !== undefined &&
    value.chooserTeam !== 'a' &&
    value.chooserTeam !== 'b'
  )
    return null;
  if (value.choicePending && !value.chooserTeam && !value.flipWinner)
    return null;
  return value;
}

export function setTeamIntent(
  doc: Y.Doc,
  team: Team,
  intent: TeamIntent
): void {
  const maps = getVetoMaps(doc);
  const target = team === 'a' ? maps.teamAIntent : maps.teamBIntent;
  doc.transact(() => {
    target.set(String(intent.clientId), JSON.stringify(intent));
  }, LOCAL_ORIGIN);
}

export function getTeamIntents(doc: Y.Doc, team: Team): TeamIntent[] {
  const maps = getVetoMaps(doc);
  const target = team === 'a' ? maps.teamAIntent : maps.teamBIntent;
  const intents: TeamIntent[] = [];
  target.forEach((value) => {
    const parsed = parseJson<TeamIntent>(value);
    if (parsed) intents.push(parsed);
  });
  return intents;
}

export function clearLocalIntents(doc: Y.Doc, clientId: number): void {
  const maps = getVetoMaps(doc);
  const id = String(clientId);
  doc.transact(() => {
    maps.teamAIntent.delete(id);
    maps.teamBIntent.delete(id);
  }, LOCAL_ORIGIN);
}
