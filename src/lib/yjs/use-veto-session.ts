'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCollabSession,
  destroyCollabSession,
  type CollabState,
  type ConnectionStatus,
} from './provider';
import {
  getRemoteAwareness,
  setLocalAwareness,
  updateSelectedMap,
  type VetoAwarenessUser,
} from './awareness';
import {
  getVetoMaps,
  seedMeta,
  getMeta,
  getActions,
  addAction,
  getTeamNames,
  setTeamName,
  getReadyState,
  setReady,
  getFirstActorResult,
  setFirstActorResult,
  setTeamIntent,
  getTeamIntents,
  clearLocalIntents,
  type SessionMeta,
  type TeamIntent,
} from './sync';
import { restoreCheckpoint, saveCheckpoint } from './checkpoint';
import {
  deriveVetoState,
  validateAction,
  startCoinFlip,
  resolveCoinflipChoice,
  type ConfirmedAction,
  type VetoState,
  type FirstActorResult,
} from '@/lib/state-machine';
import type { Team, Side } from '@/types/veto';
import {
  getRoleFromToken,
  generateSessionLinks,
  type SessionLinks,
} from '@/lib/token';
import { getSessionConfig } from '@/lib/storage';
import {
  playBeep,
  playCoinFlipSound,
  playActionSound,
  playTurnSound,
} from '@/lib/sound';
import { getUserIdentity } from '@/lib/identity';

export interface UseVetoSessionOptions {
  sessionId: string | null | undefined;
  token: string | null | undefined;
}
export interface VetoSession {
  loading: boolean;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  storageWarning: string | null;
  retryConnection: () => void;
  peerCount: number;
  role: Team | 'spectator';
  displayRole: Team | 'spectator';
  isHost: boolean;
  teamNames: Record<Team, string>;
  readyState: Record<Team, boolean>;
  actions: ConfirmedAction[];
  vetoState: VetoState;
  firstActorResult: FirstActorResult | null;
  meta: SessionMeta | null;
  shareLinks: SessionLinks | null;
  selectedMapId: string | null;
  intents: { teamA: TeamIntent[]; teamB: TeamIntent[] };
  remoteUsers: Map<number, VetoAwarenessUser>;
  localName: string;
  setLocalName: (name: string) => void;
  setTeamName: (name: string) => void;
  setReady: (ready: boolean) => void;
  selectMap: (mapId: string | null) => void;
  submitMapAction: (mapId: string) => void;
  submitSide: (side: Side) => void;
  chooseFirstActor: (firstActor: Team) => void;
}

export function useVetoSession({
  sessionId,
  token,
}: UseVetoSessionOptions): VetoSession {
  const identity = useMemo(() => getUserIdentity(), []);
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [rawActions, setActions] = useState<ConfirmedAction[]>([]);
  const [teamNames, setTeamNames] = useState<Record<Team, string>>({
    a: 'Team A',
    b: 'Team B',
  });
  const [readyState, setReadyState] = useState<Record<Team, boolean>>({
    a: false,
    b: false,
  });
  const [firstActorResult, setFirstActor] = useState<FirstActorResult | null>(
    null
  );
  const [intents, setIntents] = useState<{
    teamA: TeamIntent[];
    teamB: TeamIntent[];
  }>({ teamA: [], teamB: [] });
  const [remoteUsers, setRemoteUsers] = useState<
    Map<number, VetoAwarenessUser>
  >(new Map());
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [localName, setLocalName] = useState(identity.name);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    phase: 'discovering',
    peerCount: 0,
  });
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const sessionRef = useRef<CollabState | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const role = meta
    ? getRoleFromToken(token ?? null, meta.teamAToken, meta.teamBToken)
    : 'spectator';
  const vetoState = useMemo(
    () =>
      deriveVetoState(
        meta?.format ?? 'bo1',
        meta?.mapPool ?? [],
        rawActions,
        firstActorResult?.firstActor ?? null,
        meta?.steps
      ),
    [meta, rawActions, firstActorResult]
  );
  const actions = vetoState.acceptedActions;
  const shareLinks = useMemo(
    () =>
      meta
        ? generateSessionLinks(meta.sessionId, meta.teamAToken, meta.teamBToken)
        : null,
    [meta]
  );
  const isConnected =
    connectionStatus.phase === 'connected' && connectionStatus.peerCount > 0;

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const session = createCollabSession(`strinobans:${sessionId}`);
    sessionRef.current = session;
    const maps = getVetoMaps(session.doc);
    let recoveryWarning: string | null = null;
    let metadataTimer: number | undefined;
    const armMetadataDeadline = () => {
      clearTimeout(metadataTimer);
      if (getMeta(session.doc) || maps.meta.has('value')) return;
      metadataTimer = window.setTimeout(() => {
        if (active && !getMeta(session.doc))
          setConnectionError(
            'Waiting for room state. Keep the creator or a participant holding this room open, then retry.'
          );
      }, 20_000);
    };
    const readIntents = () => {
      const live = session.awareness.getStates();
      setIntents({
        teamA: getTeamIntents(session.doc, 'a').filter((intent) =>
          live.has(intent.clientId)
        ),
        teamB: getTeamIntents(session.doc, 'b').filter((intent) =>
          live.has(intent.clientId)
        ),
      });
    };
    const readState = () => {
      if (!active) return;
      if (recoveryWarning) setStorageWarning(recoveryWarning);
      const current = getMeta(session.doc);
      if (current && current.sessionId !== sessionId) {
        setConnectionError(
          'This room received mismatched rules. Retry the original invitation.'
        );
        return;
      }
      setMeta(current);
      setActions(getActions(session.doc));
      setTeamNames(getTeamNames(session.doc));
      setReadyState(getReadyState(session.doc));
      setFirstActor(getFirstActorResult(session.doc));
      readIntents();
      if (current) {
        clearTimeout(metadataTimer);
        setConnectionError(null);
      } else if (maps.meta.has('value'))
        setConnectionError(
          'The room rules are invalid or unsupported. Ask the creator to check the preset.'
        );
    };
    const checkpoint = () => {
      readState();
      try {
        saveCheckpoint(sessionId, session.doc);
      } catch {
        if (active)
          setStorageWarning(
            'Local room recovery is unavailable. Keep another participant connected before reloading.'
          );
      }
    };
    const readPresence = () => {
      if (!active) return;
      setRemoteUsers(new Map(getRemoteAwareness(session.awareness)));
      readIntents();
    };
    const readStatus = (status: ConnectionStatus) => {
      if (active) setConnectionStatus(status);
    };
    const unsubscribeStatus = session.provider.subscribeStatus(readStatus);
    session.doc.on('update', checkpoint);
    session.awareness.on('change', readPresence);
    try {
      restoreCheckpoint(sessionId, session.doc);
    } catch {
      recoveryWarning =
        'A local room checkpoint could not be restored. Waiting for another participant to synchronize.';
    }
    if (!getMeta(session.doc)) {
      const config = getSessionConfig(sessionId);
      if (config) {
        const preset = config.presetSnapshot;
        seedMeta(session.doc, {
          sessionId,
          presetId: preset?.id ?? config.presetId ?? 'custom',
          presetName: preset?.name ?? config.presetName,
          presetSnapshot: preset,
          mapPool: preset?.mapPool ?? config.mapPool ?? [],
          format: (preset?.format ??
            config.format ??
            'bo1') as SessionMeta['format'],
          ruleset: preset?.ruleset ?? config.ruleset ?? 'default',
          createdAt: config.createdAt,
          teamAToken: config.teamAToken,
          teamBToken: config.teamBToken,
          firstActorMode: preset?.firstActorMode ?? config.firstActorMode,
          steps: preset?.steps ?? config.steps,
          pickBanTimerSeconds:
            preset?.pickBanTimerSeconds ?? config.pickBanTimerSeconds ?? null,
          sideTimerSeconds:
            preset?.sideTimerSeconds ?? config.sideTimerSeconds ?? null,
          timerEnforcement:
            preset?.timerEnforcement ?? config.timerEnforcement ?? 'none',
          roomImportCode: preset?.roomImportCode ?? config.roomImportCode,
        });
      }
    }
    readState();
    readPresence();
    readStatus(session.provider.getStatus());
    armMetadataDeadline();
    retryRef.current = () => {
      setConnectionError(null);
      armMetadataDeadline();
      session.provider.retry();
      readState();
    };
    let suspendedUser: VetoAwarenessUser | undefined;
    const persistBeforeLeave = () => {
      const user = (
        session.awareness.getLocalState() as { user?: VetoAwarenessUser } | null
      )?.user;
      if (user) suspendedUser = { ...user, selectedMapId: null };
      session.awareness.setLocalState(null);
      clearLocalIntents(session.doc, session.awareness.clientID);
      setSelectedMapId(null);
      try {
        saveCheckpoint(sessionId, session.doc);
      } catch {
        /* Recovery remains best effort. */
      }
    };
    const resume = () => {
      if (suspendedUser) {
        session.awareness.setLocalState({ user: suspendedUser });
        suspendedUser = undefined;
      }
      armMetadataDeadline();
      session.provider.retry();
    };
    window.addEventListener('pagehide', persistBeforeLeave);
    window.addEventListener('pageshow', resume);
    return () => {
      active = false;
      clearTimeout(metadataTimer);
      window.removeEventListener('pagehide', persistBeforeLeave);
      window.removeEventListener('pageshow', resume);
      unsubscribeStatus();
      session.doc.off('update', checkpoint);
      session.awareness.off('change', readPresence);
      clearLocalIntents(session.doc, session.awareness.clientID);
      try {
        saveCheckpoint(sessionId, session.doc);
      } catch {
        /* The mounted client already reports storage failures. */
      }
      if (sessionRef.current === session) {
        sessionRef.current = null;
        retryRef.current = null;
      }
      destroyCollabSession(session, { immediate: true });
    };
  }, [sessionId]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    setLocalAwareness(session.awareness, {
      name: localName,
      color: identity.color,
      role,
      selectedMapId,
    });
    updateSelectedMap(session.awareness, selectedMapId);
    if (role !== 'spectator')
      setTeamIntent(session.doc, role, {
        clientId: session.awareness.clientID,
        team: role,
        selectedMapId,
        color: identity.color,
        name: localName,
      });
  }, [role, localName, selectedMapId, identity.color]);

  const previousActor = useRef<Team | null>(null);
  useEffect(() => {
    if (vetoState.currentTeam === role && previousActor.current !== role)
      playTurnSound();
    previousActor.current = vetoState.currentTeam;
  }, [vetoState.currentTeam, role]);

  const retryConnection = useCallback(() => {
    retryRef.current?.();
  }, []);
  const setTeamNameCallback = useCallback(
    (name: string) => {
      const session = sessionRef.current;
      const current = session && getMeta(session.doc);
      if (!session || !current) return;
      const actor = getRoleFromToken(
        token ?? null,
        current.teamAToken,
        current.teamBToken
      );
      if (actor !== 'spectator') setTeamName(session.doc, actor, name);
    },
    [token]
  );
  const setReadyCallback = useCallback(
    (ready: boolean) => {
      const session = sessionRef.current;
      const current = session && getMeta(session.doc);
      if (!session || !current || getFirstActorResult(session.doc)) return;
      const actor = getRoleFromToken(
        token ?? null,
        current.teamAToken,
        current.teamBToken
      );
      if (actor !== 'spectator') {
        setReady(session.doc, actor, ready);
        if (ready) playBeep();
      }
    },
    [token]
  );

  const submitConfirmed = useCallback(
    (
      action: Omit<
        ConfirmedAction,
        'id' | 'confirmedAt' | 'confirmedByClientId'
      >
    ) => {
      const session = sessionRef.current;
      const current = session && getMeta(session.doc);
      const status = session?.provider.getStatus();
      if (
        !session ||
        !current ||
        status?.phase !== 'connected' ||
        status.peerCount === 0
      )
        return false;
      const actor = getRoleFromToken(
        token ?? null,
        current.teamAToken,
        current.teamBToken
      );
      const ready = getReadyState(session.doc);
      const initiative = getFirstActorResult(session.doc);
      if (
        !ready.a ||
        !ready.b ||
        !initiative?.firstActor ||
        initiative.choicePending
      )
        return false;
      const full: ConfirmedAction = {
        ...action,
        id: crypto.randomUUID(),
        confirmedAt: new Date().toISOString(),
        confirmedByClientId: session.awareness.clientID,
      };
      const validation = validateAction(
        full,
        current.format,
        current.mapPool,
        getActions(session.doc),
        actor,
        initiative.firstActor,
        current.steps
      );
      if (!validation.valid) return false;
      return addAction(session.doc, full);
    },
    [token]
  );
  const submitMapAction = useCallback(
    (mapId: string) => {
      const step = vetoState.currentStep;
      if (!step || (step.type !== 'ban' && step.type !== 'pick')) return;
      if (
        submitConfirmed({
          stepIndex: vetoState.currentStepIndex,
          team: step.team,
          type: step.type,
          mapId,
        })
      ) {
        playActionSound(step.type);
        setSelectedMapId(null);
      }
    },
    [submitConfirmed, vetoState]
  );
  const submitSide = useCallback(
    (side: Side) => {
      const step = vetoState.currentStep;
      if (!step || step.type !== 'side') return;
      if (
        submitConfirmed({
          stepIndex: vetoState.currentStepIndex,
          team: step.team,
          type: 'side',
          side,
          ...(step.forDecider
            ? { mapId: vetoState.deciderMap ?? undefined }
            : {}),
        })
      )
        playActionSound('side');
    },
    [submitConfirmed, vetoState]
  );

  const chooseFirstActor = useCallback(
    (firstActor: Team) => {
      if (firstActor !== 'a' && firstActor !== 'b') return;
      const session = sessionRef.current;
      const current = session && getMeta(session.doc);
      const status = session?.provider.getStatus();
      if (
        !session ||
        !current ||
        status?.phase !== 'connected' ||
        status.peerCount === 0
      )
        return;
      const ready = getReadyState(session.doc);
      const existing = getFirstActorResult(session.doc);
      const chooser = getRoleFromToken(
        token ?? null,
        current.teamAToken,
        current.teamBToken
      );
      if (
        !ready.a ||
        !ready.b ||
        chooser === 'spectator' ||
        !existing ||
        existing.firstActor
      )
        return;
      const next = resolveCoinflipChoice(
        existing,
        chooser,
        firstActor,
        new Date().toISOString()
      );
      if (next !== existing) setFirstActorResult(session.doc, next);
    },
    [token]
  );

  useEffect(() => {
    const session = sessionRef.current;
    if (
      !session ||
      !meta ||
      role !== 'a' ||
      !readyState.a ||
      !readyState.b ||
      firstActorResult ||
      !isConnected
    )
      return;
    const begin = () => {
      if (getFirstActorResult(session.doc)) return;
      const ready = getReadyState(session.doc);
      const status = session.provider.getStatus();
      if (
        !ready.a ||
        !ready.b ||
        status.phase !== 'connected' ||
        status.peerCount === 0
      )
        return;
      const now = new Date().toISOString();
      if (meta.firstActorMode === 'team-a')
        setFirstActorResult(session.doc, {
          mode: 'team-a',
          firstActor: 'a',
          resolvedAt: now,
        });
      else if (
        meta.firstActorMode === 'team-a-choice' ||
        meta.firstActorMode === 'upper-bracket-choice'
      ) {
        setFirstActorResult(session.doc, {
          mode: meta.firstActorMode,
          choicePending: true,
          chooserTeam: 'a',
        });
      } else {
        setFirstActorResult(
          session.doc,
          startCoinFlip(
            meta.firstActorMode,
            Math.random() < 0.5 ? 'a' : 'b',
            crypto.randomUUID(),
            now
          )
        );
        playCoinFlipSound();
      }
    };
    const timer = setTimeout(
      begin,
      meta.firstActorMode === 'coinflip' || meta.firstActorMode === 'random'
        ? 1000
        : 0
    );
    return () => clearTimeout(timer);
  }, [meta, role, readyState, firstActorResult, isConnected]);

  return {
    loading: !meta,
    isConnected,
    connectionStatus,
    connectionError,
    storageWarning,
    retryConnection,
    peerCount: connectionStatus.peerCount,
    role,
    displayRole: role,
    isHost: role === 'a',
    teamNames,
    readyState,
    actions,
    vetoState,
    firstActorResult,
    meta,
    shareLinks,
    selectedMapId,
    intents,
    remoteUsers,
    localName,
    setLocalName,
    setTeamName: setTeamNameCallback,
    setReady: setReadyCallback,
    selectMap: setSelectedMapId,
    submitMapAction,
    submitSide,
    chooseFirstActor,
  };
}
