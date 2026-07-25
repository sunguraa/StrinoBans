'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import {
  createCollabSession,
  destroyCollabSession,
  type CollabState,
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
import {
  deriveVetoState,
  validateAction,
  canStartFirstActorFlip,
  startCoinFlip,
  resolveCoinflipChoice,
  type ConfirmedAction,
  type VetoState,
  type FirstActorResult,
} from '@/lib/state-machine';
import type { Team, Side, MapId } from '@/types/veto';
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

const LOCAL_ORIGIN = 'local-veto';

export interface UseVetoSessionOptions {
  sessionId: string | null | undefined;
  token: string | null | undefined;
}

export interface VetoSession {
  loading: boolean;
  isConnected: boolean;
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

  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [actions, setActions] = useState<ConfirmedAction[]>([]);
  const [teamNames, setTeamNames] = useState<Record<Team, string>>({
    a: 'Team A',
    b: 'Team B',
  });
  const [readyState, setReadyState] = useState<Record<Team, boolean>>({
    a: false,
    b: false,
  });
  const [firstActorResult, setFirstActorResultState] =
    useState<FirstActorResult | null>(null);
  const [intents, setIntents] = useState<{
    teamA: TeamIntent[];
    teamB: TeamIntent[];
  }>({ teamA: [], teamB: [] });
  const [remoteUsers, setRemoteUsers] = useState<
    Map<number, VetoAwarenessUser>
  >(new Map());
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [localName, setLocalName] = useState(identity.name);

  const sessionRef = useRef<CollabState | null>(null);
  const mapsRef = useRef<ReturnType<typeof getVetoMaps> | null>(null);
  const mountedRef = useRef(true);
  const lastReadyRef = useRef<Record<Team, boolean>>({ a: false, b: false });

  const role = useMemo(() => {
    if (!meta || !token) return 'spectator';
    return getRoleFromToken(token, meta.teamAToken, meta.teamBToken);
  }, [meta, token]);

  const displayRole = useMemo(() => role, [role]);

  const isHost = useMemo(() => role === 'a', [role]);

  const vetoState = useMemo(
    () =>
      deriveVetoState(
        meta?.format ?? 'bo1',
        meta?.mapPool ?? [],
        actions,
        firstActorResult?.firstActor ?? null,
        meta?.steps
      ),
    [meta, actions, firstActorResult]
  );

  // Play a turn cue when it becomes the local player's turn.
  const lastTurnActorRef = useRef<Team | null>(null);
  useEffect(() => {
    const currentStep = vetoState.currentStep;
    if (role !== 'spectator' && currentStep && currentStep.team === role) {
      if (lastTurnActorRef.current !== role) {
        playTurnSound();
      }
    }
    lastTurnActorRef.current = currentStep?.team ?? null;
  }, [vetoState.currentStep, role]);

  const shareLinks = useMemo(
    () =>
      meta
        ? generateSessionLinks(meta.sessionId, meta.teamAToken, meta.teamBToken)
        : null,
    [meta]
  );

  // Refs for latest state inside callbacks/effects. Synced in an effect rather
  // than during render: nothing reads these during render, only inside callbacks
  // and effects that run after commit, so this stays fresh and rule-compliant.
  const roleRef = useRef(role);
  const metaRef = useRef(meta);
  const actionsRef = useRef(actions);
  const firstActorResultRef = useRef(firstActorResult);
  const readyStateRef = useRef(readyState);
  const vetoStateRef = useRef(vetoState);
  const localNameRef = useRef(localName);
  useEffect(() => {
    roleRef.current = role;
    metaRef.current = meta;
    actionsRef.current = actions;
    firstActorResultRef.current = firstActorResult;
    readyStateRef.current = readyState;
    vetoStateRef.current = vetoState;
    localNameRef.current = localName;
  });

  const updateRemoteUsers = useCallback(
    (awareness: CollabState['awareness']) => {
      if (!mountedRef.current) return;
      const users = getRemoteAwareness(awareness);
      setRemoteUsers(new Map(users));
      setPeerCount(users.size);
    },
    []
  );

  const syncAllState = useCallback((doc: Y.Doc) => {
    if (!mountedRef.current) return;
    setMeta(getMeta(doc));
    setActions(getActions(doc));
    setTeamNames(getTeamNames(doc));
    setReadyState(getReadyState(doc));
    setFirstActorResultState(getFirstActorResult(doc));
    setIntents({
      teamA: getTeamIntents(doc, 'a'),
      teamB: getTeamIntents(doc, 'b'),
    });
  }, []);

  const refreshAwareness = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const currentRole = roleRef.current;
    setLocalAwareness(session.awareness, {
      name: localNameRef.current,
      color: identity.color,
      role: currentRole,
      selectedMapId,
    });
  }, [identity.color, selectedMapId]);

  useEffect(() => {
    refreshAwareness();
  }, [refreshAwareness]);

  useEffect(() => {
    const session = sessionRef.current;
    const currentRole = roleRef.current;
    if (!session || currentRole === 'spectator') return;
    setTeamIntent(session.doc, currentRole, {
      clientId: session.awareness.clientID,
      team: currentRole,
      selectedMapId,
      color: identity.color,
      name: localNameRef.current,
    });
    refreshAwareness();
  }, [role, selectedMapId, identity.color, refreshAwareness]);

  const stopSession = useCallback((options?: { immediate?: boolean }) => {
    const session = sessionRef.current;
    if (!session) return;
    const clientId = session.awareness.clientID;
    clearLocalIntents(session.doc, clientId);
    session.awareness.setLocalState(null);
    destroyCollabSession(session, { immediate: options?.immediate ?? true });
    sessionRef.current = null;
    mapsRef.current = null;
    setIsConnected(false);
    setPeerCount(0);
    setRemoteUsers(new Map());
  }, []);

  // Session lifecycle. Depends only on sessionId, so map selections and awareness
  // changes never tear down the connection. Written to be React Strict Mode safe:
  // each run owns its own `session` + `cancelled` flag, so the dev double-mount
  // (mount → unmount → mount) can't strand us on the loading screen.
  useEffect(() => {
    if (!sessionId) {
      // No room to join — clear the loading screen. Legitimate external sync.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    mountedRef.current = true;
    let cancelled = false;

    const session = createCollabSession(`strinobans:${sessionId}`);
    const maps = getVetoMaps(session.doc);
    sessionRef.current = session;
    mapsRef.current = maps;
    setLoading(true);
    setIsConnected(false);

    const teardown = () => {
      try {
        clearLocalIntents(session.doc, session.awareness.clientID);
        session.awareness.setLocalState(null);
      } catch {
        // best-effort
      }
      destroyCollabSession(session, { immediate: true });
      if (sessionRef.current === session) {
        sessionRef.current = null;
        mapsRef.current = null;
      }
    };

    void (async () => {
      try {
        const initial = await session.provider.waitForInitialSync();
        if (cancelled) return;

        if (initial.shouldSeedLocal) {
          const config = getSessionConfig(sessionId);
          if (config?.teamAToken && config.teamBToken) {
            const metaValue: SessionMeta = {
              sessionId,
              presetId: config.presetId ?? 'default-bo1',
              mapPool: config.mapPool ?? [],
              format: (config.format as SessionMeta['format']) ?? 'bo1',
              ruleset: config.ruleset ?? 'default',
              createdAt: new Date().toISOString(),
              teamAToken: config.teamAToken,
              teamBToken: config.teamBToken,
              firstActorMode: config.firstActorMode,
              steps: config.steps,
              pickBanTimerSeconds: config.pickBanTimerSeconds ?? null,
              sideTimerSeconds: config.sideTimerSeconds ?? null,
              timerEnforcement: config.timerEnforcement ?? 'none',
              roomImportCode: config.roomImportCode,
            };
            seedMeta(session.doc, metaValue);
          }
        }

        syncAllState(session.doc);
        updateRemoteUsers(session.awareness);
        setLocalAwareness(session.awareness, {
          name: localNameRef.current,
          color: identity.color,
          role: roleRef.current,
          selectedMapId: null,
        });
        setIsConnected(true);

        const metaObserver = () => setMeta(getMeta(session.doc));
        const actionsObserver = () => setActions(getActions(session.doc));
        const teamNamesObserver = () => setTeamNames(getTeamNames(session.doc));
        const readyObserver = () => {
          const next = getReadyState(session.doc);
          setReadyState(next);
          (['a', 'b'] as Team[]).forEach((team) => {
            if (next[team] && !lastReadyRef.current[team]) playBeep();
          });
          lastReadyRef.current = next;
        };
        const firstActorObserver = () =>
          setFirstActorResultState(getFirstActorResult(session.doc));
        const intentObserver = () =>
          setIntents({
            teamA: getTeamIntents(session.doc, 'a'),
            teamB: getTeamIntents(session.doc, 'b'),
          });
        const awarenessHandler = () => updateRemoteUsers(session.awareness);

        maps.meta.observe(metaObserver);
        maps.actions.observe(actionsObserver);
        maps.teamNames.observe(teamNamesObserver);
        maps.readyState.observe(readyObserver);
        maps.firstActorResult.observe(firstActorObserver);
        maps.teamAIntent.observe(intentObserver);
        maps.teamBIntent.observe(intentObserver);
        session.awareness.on('change', awarenessHandler);

        if (!cancelled) setLoading(false);
      } catch (error) {
        console.error('[StrinoBans] Failed to start veto session', error);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      teardown();
      setIsConnected(false);
      setPeerCount(0);
      setRemoteUsers(new Map());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const handler = () => stopSession({ immediate: true });
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }, [stopSession]);

  const submitConfirmedAction = useCallback(
    (
      action: Omit<
        ConfirmedAction,
        'id' | 'confirmedAt' | 'confirmedByClientId'
      >
    ) => {
      const session = sessionRef.current;
      const currentMeta = metaRef.current;
      const currentActions = actionsRef.current;
      const currentFirstActorResult = firstActorResultRef.current;
      const currentRole = roleRef.current;
      if (
        !session ||
        !currentMeta ||
        currentRole === 'spectator' ||
        !currentFirstActorResult?.firstActor
      ) {
        return;
      }

      const fullAction: ConfirmedAction = {
        ...action,
        id: crypto.randomUUID(),
        confirmedAt: new Date().toISOString(),
        confirmedByClientId: session.awareness.clientID,
      };

      const validation = validateAction(
        fullAction,
        currentMeta.format,
        currentMeta.mapPool,
        currentActions,
        currentRole,
        currentFirstActorResult?.firstActor ?? null,
        currentMeta.steps
      );
      if (!validation.valid) {
        console.warn('[StrinoBans] Invalid action', validation.reason);
        return;
      }

      session.doc.transact(() => {
        addAction(session.doc, fullAction);
      }, LOCAL_ORIGIN);
    },
    []
  );

  const submitMapAction = useCallback(
    (mapId: string) => {
      const step = vetoStateRef.current.currentStep;
      if (!step || (step.type !== 'ban' && step.type !== 'pick')) return;
      submitConfirmedAction({
        stepIndex: vetoStateRef.current.currentStepIndex,
        team: step.team,
        type: step.type,
        mapId,
      });
      playActionSound(step.type);
      setSelectedMapId(null);
    },
    [submitConfirmedAction]
  );

  const submitSide = useCallback(
    (side: Side) => {
      const step = vetoStateRef.current.currentStep;
      if (!step || step.type !== 'side') return;
      const mapId = step.forDecider
        ? (vetoStateRef.current.deciderMap ?? undefined)
        : undefined;
      submitConfirmedAction({
        stepIndex: vetoStateRef.current.currentStepIndex,
        team: step.team,
        type: 'side',
        side,
        mapId,
      });
      playActionSound('side');
    },
    [submitConfirmedAction]
  );

  const selectMap = useCallback((mapId: string | null) => {
    setSelectedMapId(mapId);
  }, []);

  useEffect(() => {
    const session = sessionRef.current;
    const maps = mapsRef.current;
    if (!session || !maps) return;
    updateSelectedMap(session.awareness, selectedMapId);
    const currentRole = roleRef.current;
    if (currentRole === 'a' || currentRole === 'b') {
      setTeamIntent(session.doc, currentRole, {
        clientId: session.awareness.clientID,
        team: currentRole,
        selectedMapId,
        color: identity.color,
        name: localNameRef.current,
      });
    }
  }, [selectedMapId, identity.color]);

  const setTeamNameCallback = useCallback((name: string) => {
    const session = sessionRef.current;
    const currentRole = roleRef.current;
    if (!session || currentRole === 'spectator') return;
    setTeamName(session.doc, currentRole, name);
  }, []);

  const setReadyCallback = useCallback((ready: boolean) => {
    const session = sessionRef.current;
    const currentRole = roleRef.current;
    if (!session || currentRole === 'spectator') return;
    if (ready) playBeep();
    setReady(session.doc, currentRole, ready);
  }, []);

  const flipCoin = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;

    const mode = metaRef.current?.firstActorMode;
    const existing = getFirstActorResult(session.doc);
    if (
      !canStartFirstActorFlip(
        mode,
        roleRef.current,
        readyStateRef.current,
        existing
      )
    ) {
      return;
    }

    const flipWinner: Team = Math.random() < 0.5 ? 'a' : 'b';
    const result = startCoinFlip(
      mode,
      flipWinner,
      crypto.randomUUID(),
      new Date().toISOString()
    );
    setFirstActorResult(session.doc, result);
    playCoinFlipSound();
  }, []);

  const chooseFirstActor = useCallback((firstActor: Team) => {
    const session = sessionRef.current;
    const chooser = roleRef.current;
    if (!session || chooser === 'spectator') return;
    const existing = getFirstActorResult(session.doc);
    if (
      !existing ||
      existing.mode !== 'coinflip' ||
      !existing.choicePending ||
      existing.flipWinner !== chooser
    ) {
      return;
    }
    setFirstActorResult(
      session.doc,
      resolveCoinflipChoice(
        existing,
        chooser,
        firstActor,
        new Date().toISOString()
      )
    );
  }, []);

  // Team A finalizes the first actor after both teams are ready.
  useEffect(() => {
    if (
      !meta ||
      firstActorResult ||
      !readyState.a ||
      !readyState.b ||
      role !== 'a'
    ) {
      return;
    }
    if (meta.firstActorMode === 'team-a') {
      const session = sessionRef.current;
      if (!session) return;
      setFirstActorResult(session.doc, {
        firstActor: 'a',
        mode: 'team-a',
        resolvedAt: new Date().toISOString(),
      });
      return;
    }
    const delay = 1000 + Math.floor(Math.random() * 1000);
    const timer = setTimeout(() => flipCoin(), delay);
    return () => clearTimeout(timer);
  }, [readyState, meta, firstActorResult, role, flipCoin]);

  // Timer enforcement lives in the <Timer> component (the visible countdown is the
  // single source of truth). It only fires on the acting team's client, so no
  // host-authoritative duplicate is needed here — and keeping it out of this hook
  // avoids the countdown being reset by awareness/state churn.

  return useMemo(
    () => ({
      loading,
      isConnected,
      peerCount,
      role,
      displayRole,
      isHost,
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
      selectMap,
      submitMapAction,
      submitSide,
      chooseFirstActor,
    }),
    [
      loading,
      isConnected,
      peerCount,
      role,
      displayRole,
      isHost,
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
      setTeamNameCallback,
      setReadyCallback,
      selectMap,
      submitMapAction,
      submitSide,
      chooseFirstActor,
    ]
  );
}
