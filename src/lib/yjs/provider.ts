"use client";

import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { createTrysteroTransportProvider } from "./trystero-provider";
import { createWebrtcTransportProvider } from "./webrtc-provider";

export type CollabTransport = "trystero" | "webrtc";

export interface CollabInitialSyncState {
  shouldSeedLocal: boolean;
  discoveredPeerCount: number;
  didReceiveRemoteDoc: boolean;
}

export interface CollabProvider {
  readonly transport: CollabTransport;
  readonly awareness: Awareness;
  destroy(): void;
  waitForInitialSync(): Promise<CollabInitialSyncState>;
}

export interface CollabState {
  doc: Y.Doc;
  provider: CollabProvider;
  awareness: Awareness;
  transport: CollabTransport;
}

function getConfiguredTransport(): CollabTransport {
  // Runtime overrides (handy for local testing / debugging): a `strinobans_transport`
  // localStorage key or a `?transport=` query param take precedence over the build
  // env. The webrtc transport syncs same-origin tabs over BroadcastChannel with no
  // network, which is what the headed Playwright flow relies on.
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem("strinobans_transport");
      if (stored === "webrtc" || stored === "trystero") return stored;
    } catch {
      // ignore storage access errors
    }
    const param = new URLSearchParams(window.location.search).get("transport");
    if (param === "webrtc" || param === "trystero") return param;
  }
  const configured = process.env.NEXT_PUBLIC_COLLAB_TRANSPORT?.trim().toLowerCase();
  return configured === "webrtc" ? "webrtc" : "trystero";
}

export function createCollabSession(roomName: string): CollabState {
  const doc = new Y.Doc();
  const transport = getConfiguredTransport();
  const provider =
    transport === "trystero"
      ? createTrysteroTransportProvider(roomName, doc)
      : createWebrtcTransportProvider(roomName, doc);

  return {
    doc,
    provider,
    awareness: provider.awareness,
    transport,
  };
}

export function destroyCollabSession(state: CollabState, options?: { immediate?: boolean }): void {
  try {
    state.provider.destroy();
  } catch {
    // best-effort idempotent
  }
  try {
    state.doc.destroy();
  } catch {
    // best-effort idempotent
  }
}
