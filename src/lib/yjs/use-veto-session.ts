"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { createCollabSession, destroyCollabSession, type CollabState } from "./provider";
import {
  getRemoteAwareness,
  setLocalAwareness,
  updateSelectedMap,
  type VetoAwarenessUser,
} from "./awareness";
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
  getCoinFlip,
  setCoinFlip,
  setTeamIntent,
  getTeamIntents,
  clearLocalIntents,
  type SessionMeta,
  type TeamIntent,
} from "./sync";
import {
  deriveVetoState,
  validateAction,
  type ConfirmedAction,
  type VetoState,
  type CoinFlipResult,
} from "@/lib/state-machine";
import type { Team, Side, MapId } from "@/types/veto";
import { getRoleFromToken, generateSessionLinks, type SessionLinks } from "@/lib/token";
import { getSessionConfig } from "@/lib/storage";
import { playBeep, playCoinFlipSound } from "@/lib/sound";

const LOCAL_ORIGIN = "local-veto";
const USER_IDENTITY_KEY = "strinobans_user_identity";

interface UserIdentity {
  name: string;
  color: string;
}

function randomColor(): string {
  const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function getUserIdentity(): UserIdentity {
  if (typeof window === "undefined") return { name: "Player", color: randomColor() };
  try {
    const raw = window.localStorage.getItem(USER_IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UserIdentity;
      if (parsed.name && parsed.color) return parsed;
    }
  } catch {
    // ignore
  }
  const identity: UserIdentity = { name: `Player ${Math.floor(Math.random() * 1000)}`, color: randomColor() };
  try {
    window.localStorage.setItem(USER_IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // ignore
  }
  return identity;
}

export interface UseVetoSessionOptions {
  sessionId: string | null | undefined;
  token: string | null | undefined;
}

export interface VetoSession {
  loading: boolean;
  isConnected: boolean;
  peerCount: number;
  role: Team | "spectator";
  displayRole: Team | "spectator";
  teamNames: Record<Team, string>;
  readyState: Record<Team, boolean>;
  actions: ConfirmedAction[];
  vetoState: VetoState;
  coinFlip: CoinFlipResult | null;
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
  flipCoin: () => void;
  chooseSeededFirstActor: (firstActor: Team) => void;
}

export function useVetoSession({ sessionId, token }: UseVetoSessionOptions): VetoSession {
  const identity = useMemo(() => getUserIdentity(), []);

  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [actions, setActions] = useState<ConfirmedAction[]>([]);
  const [teamNames, setTeamNames] = useState<Record<Team, string>>({ a: "Team A", b: "Team B" });
  const [readyState, setReadyState] = useState<Record<Team, boolean>>({ a: false, b: false });
  const [coinFlip, setCoinFlipState] = useState<CoinFlipResult | null>(null);
  const [intents, setIntents] = useState<{ teamA: TeamIntent[]; teamB: TeamIntent[] }>({ teamA: [], teamB: [] });
  const [remoteUsers, setRemoteUsers] = useState<Map<number, VetoAwarenessUser>>(new Map());
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [localName, setLocalName] = useState(identity.name);

  const sessionRef = useRef<CollabState | null>(null);
  const mapsRef = useRef<ReturnType<typeof getVetoMaps> | null>(null);
  const mountedRef = useRef(true);
  const lastReadyRef = useRef<Record<Team, boolean>>({ a: false, b: false });

  const role = useMemo(() => {
    if (!meta || !token) return "spectator";
    return getRoleFromToken(token, meta.teamAToken, meta.teamBToken);
  }, [meta, token]);

  const displayRole = useMemo(() => role, [role]);

  const vetoState = useMemo(
    () => deriveVetoState(meta?.format ?? "bo1", meta?.mapPool ?? [], actions, coinFlip?.winner ?? null),
    [meta, actions, coinFlip],
  );

  const shareLinks = useMemo(
    () => (meta ? generateSessionLinks(meta.sessionId, meta.teamAToken, meta.teamBToken) : null),
    [meta],
  );

  // Refs for latest state inside callbacks/effects. Synced in an effect rather
  // than during render: nothing reads these during render, only inside callbacks
  // and effects that run after commit, so this stays fresh and rule-compliant.
  const metaRef = useRef(meta);
  const actionsRef = useRef(actions);
  const coinFlipRef = useRef(coinFlip);
  const roleRef = useRef(role);
  const vetoStateRef = useRef(vetoState);
  const localNameRef = useRef(localName);
  useEffect(() => {
    metaRef.current = meta;
    actionsRef.current = actions;
    coinFlipRef.current = coinFlip;
    roleRef.current = role;
    vetoStateRef.current = vetoState;
    localNameRef.current = localName;
  });

  const updateRemoteUsers = useCallback((awareness: CollabState["awareness"]) => {
    if (!mountedRef.current) return;
    const users = getRemoteAwareness(awareness);
    setRemoteUsers(new Map(users));
    setPeerCount(users.size);
  }, []);

  const syncAllState = useCallback((doc: Y.Doc) => {
    if (!mountedRef.current) return;
    setMeta(getMeta(doc));
    setActions(getActions(doc));
    setTeamNames(getTeamNames(doc));
    setReadyState(getReadyState(doc));
    setCoinFlipState(getCoinFlip(doc));
    setIntents({ teamA: getTeamIntents(doc, "a"), teamB: getTeamIntents(doc, "b") });
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
    if (!session || currentRole === "spectator") return;
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
              presetId: config.presetId ?? "default-bo1",
              mapPool: config.mapPool ?? [],
              format: (config.format as SessionMeta["format"]) ?? "bo1",
              ruleset: config.ruleset ?? "default",
              createdAt: new Date().toISOString(),
              teamAToken: config.teamAToken,
              teamBToken: config.teamBToken,
              seededPick: config.seededPick ?? false,
              pickBanTimerSeconds: config.pickBanTimerSeconds ?? null,
              sideTimerSeconds: config.sideTimerSeconds ?? null,
              timerEnforcement: config.timerEnforcement ?? "none",
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
          (["a", "b"] as Team[]).forEach((team) => {
            if (next[team] && !lastReadyRef.current[team]) playBeep();
          });
          lastReadyRef.current = next;
        };
        const coinObserver = () => setCoinFlipState(getCoinFlip(session.doc));
        const intentObserver = () =>
          setIntents({ teamA: getTeamIntents(session.doc, "a"), teamB: getTeamIntents(session.doc, "b") });
        const awarenessHandler = () => updateRemoteUsers(session.awareness);

        maps.meta.observe(metaObserver);
        maps.actions.observe(actionsObserver);
        maps.teamNames.observe(teamNamesObserver);
        maps.readyState.observe(readyObserver);
        maps.coinFlip.observe(coinObserver);
        maps.teamAIntent.observe(intentObserver);
        maps.teamBIntent.observe(intentObserver);
        session.awareness.on("change", awarenessHandler);

        if (!cancelled) setLoading(false);
      } catch (error) {
        console.error("[StrinoBans] Failed to start veto session", error);
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
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [stopSession]);

  const submitConfirmedAction = useCallback(
    (action: Omit<ConfirmedAction, "id" | "confirmedAt" | "confirmedByClientId">) => {
      const session = sessionRef.current;
      const currentMeta = metaRef.current;
      const currentActions = actionsRef.current;
      const currentCoin = coinFlipRef.current;
      const currentRole = roleRef.current;
      if (!session || !currentMeta || currentRole === "spectator") return;

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
        currentCoin?.winner ?? null,
      );
      if (!validation.valid) {
        console.warn("[StrinoBans] Invalid action", validation.reason);
        return;
      }

      session.doc.transact(() => {
        addAction(session.doc, fullAction);
      }, LOCAL_ORIGIN);
    },
    [],
  );

  const submitMapAction = useCallback(
    (mapId: string) => {
      const step = vetoStateRef.current.currentStep;
      if (!step || (step.type !== "ban" && step.type !== "pick")) return;
      submitConfirmedAction({ stepIndex: vetoStateRef.current.currentStepIndex, team: step.team, type: step.type, mapId });
      setSelectedMapId(null);
    },
    [submitConfirmedAction],
  );

  const submitSide = useCallback(
    (side: Side) => {
      const step = vetoStateRef.current.currentStep;
      if (!step || step.type !== "side") return;
      const mapId = step.forDecider ? vetoStateRef.current.deciderMap ?? undefined : undefined;
      submitConfirmedAction({ stepIndex: vetoStateRef.current.currentStepIndex, team: step.team, type: "side", side, mapId });
    },
    [submitConfirmedAction],
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
    if (currentRole === "a" || currentRole === "b") {
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
    if (!session || currentRole === "spectator") return;
    setTeamName(session.doc, currentRole, name);
  }, []);

  const setReadyCallback = useCallback(
    (ready: boolean) => {
      const session = sessionRef.current;
      const currentRole = roleRef.current;
      if (!session || currentRole === "spectator") return;
      if (ready) playBeep();
      setReady(session.doc, currentRole, ready);
    },
    [],
  );

  const flipCoin = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const existing = getCoinFlip(session.doc);
    if (existing) return;
    const seed = crypto.randomUUID();
    const winner: Team = Math.random() < 0.5 ? "a" : "b";
    const result: CoinFlipResult = {
      winner,
      method: "coin-flip",
      seed,
      rolledAt: new Date().toISOString(),
    };
    setCoinFlip(session.doc, result);
    playCoinFlipSound();
  }, []);

  const chooseSeededFirstActor = useCallback(
    (firstActor: Team) => {
      const session = sessionRef.current;
      if (!session) return;
      const existing = getCoinFlip(session.doc);
      if (existing) return;
      const result: CoinFlipResult = {
        winner: firstActor,
        method: "seeded-pick",
        seed: "seeded",
        rolledAt: new Date().toISOString(),
      };
      setCoinFlip(session.doc, result);
      playCoinFlipSound();
    },
    [],
  );

  // Auto-flip 1-2s after both ready (only Team A token holder triggers)
  useEffect(() => {
    if (!meta || coinFlip || meta.seededPick) return;
    if (!readyState.a || !readyState.b) return;
    if (role !== "a") return;
    const delay = 1000 + Math.floor(Math.random() * 1000);
    const t = setTimeout(() => flipCoin(), delay);
    return () => clearTimeout(t);
  }, [readyState, meta, coinFlip, role, flipCoin]);

  // Timer enforcement: random choice after timeout+leniency
  useEffect(() => {
    if (!meta || !vetoState.currentStep || meta.timerEnforcement !== "random-after-timeout") return;
    const currentRole = roleRef.current;
    const step = vetoState.currentStep;
    if (currentRole === "spectator" || step.team !== currentRole) return;

    const seconds = step.type === "side" ? meta.sideTimerSeconds ?? 30 : meta.pickBanTimerSeconds ?? 50;
    const leniency = 5;
    const deadline = Date.now() + (seconds + leniency) * 1000;

    const t = setTimeout(() => {
      if (step.type === "side") {
        const side: Side = Math.random() < 0.5 ? "attacker" : "defender";
        submitSide(side);
      } else {
        const pool = vetoStateRef.current.remainingMaps;
        if (pool.length > 0) {
          const mapId = pool[Math.floor(Math.random() * pool.length)];
          submitMapAction(mapId);
        }
      }
    }, deadline - Date.now());

    return () => clearTimeout(t);
  }, [meta, vetoState.currentStep, vetoState.currentStepIndex, submitSide, submitMapAction]);

  return useMemo(
    () => ({
      loading,
      isConnected,
      peerCount,
      role,
      displayRole,
      teamNames,
      readyState,
      actions,
      vetoState,
      coinFlip,
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
      flipCoin,
      chooseSeededFirstActor,
    }),
    [
      loading,
      isConnected,
      peerCount,
      role,
      displayRole,
      teamNames,
      readyState,
      actions,
      vetoState,
      coinFlip,
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
      flipCoin,
      chooseSeededFirstActor,
    ],
  );
}




