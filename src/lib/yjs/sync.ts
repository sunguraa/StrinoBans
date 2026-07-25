import * as Y from 'yjs';
import type { FirstActorMode, Format, Team } from '@/types/veto';
import type { ConfirmedAction, FirstActorResult } from '@/lib/state-machine';

export interface SessionMeta {
  sessionId: string;
  presetId: string;
  mapPool: string[];
  format: Format;
  ruleset: string;
  createdAt: string;
  teamAToken: string;
  teamBToken: string;
  firstActorMode: FirstActorMode;
  steps?: {
    team: 'a' | 'b';
    type: 'ban' | 'pick' | 'side';
    forPickIndex?: number;
    forDecider?: boolean;
  }[];
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
  doc.transact(() => {
    maps.meta.set('value', JSON.stringify(meta));
  }, LOCAL_ORIGIN);
}

export function getMeta(doc: Y.Doc): SessionMeta | null {
  const maps = getVetoMaps(doc);
  return parseJson<SessionMeta>(maps.meta.get('value'));
}

export function addAction(doc: Y.Doc, action: ConfirmedAction): void {
  const maps = getVetoMaps(doc);
  doc.transact(() => {
    maps.actions.push([JSON.stringify(action)]);
  }, LOCAL_ORIGIN);
}

export function getActions(doc: Y.Doc): ConfirmedAction[] {
  const maps = getVetoMaps(doc);
  const actions: ConfirmedAction[] = [];
  maps.actions.forEach((value) => {
    const parsed = parseJson<ConfirmedAction>(value);
    if (parsed) actions.push(parsed);
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
  const maps = getVetoMaps(doc);
  return parseJson<FirstActorResult>(maps.firstActorResult.get('value'));
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
