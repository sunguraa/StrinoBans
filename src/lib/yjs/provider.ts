'use client';

import type { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { createTrysteroTransportProvider } from './trystero-provider';
import { createWebrtcTransportProvider } from './webrtc-provider';

export type CollabTransport = 'trystero' | 'webrtc';

export interface ConnectionStatus {
  phase:
    | 'discovering'
    | 'connecting'
    | 'syncing'
    | 'connected'
    | 'disconnected'
    | 'error';
  peerCount: number;
  message?: string;
}

export interface CollabInitialSyncState {
  shouldSeedLocal: boolean;
  discoveredPeerCount: number;
  didReceiveRemoteDoc: boolean;
}

export interface CollabProvider {
  readonly transport: CollabTransport;
  readonly awareness: Awareness;
  getStatus(): ConnectionStatus;
  subscribeStatus(listener: (status: ConnectionStatus) => void): () => void;
  retry(): void;
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
  // Production never inherits an old per-device route. Debugging must be explicit.
  const configured =
    process.env.NEXT_PUBLIC_COLLAB_TRANSPORT?.trim().toLowerCase();
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const debug =
      params.get('p2pdebug') === '1' || process.env.NODE_ENV === 'development';
    if (debug) {
      const param = params.get('transport');
      if (param === 'webrtc' || param === 'trystero') return param;
      if (process.env.NODE_ENV === 'development') {
        try {
          if (window.localStorage.getItem('strinobans_transport') === 'webrtc')
            return 'webrtc';
        } catch {
          // Storage is optional for the offline test adapter.
        }
      }
      if (configured === 'webrtc') return 'webrtc';
    }
  }
  return 'trystero';
}

export function createCollabSession(roomName: string): CollabState {
  const doc = new Y.Doc();
  const transport = getConfiguredTransport();
  const provider =
    transport === 'trystero'
      ? createTrysteroTransportProvider(roomName, doc)
      : createWebrtcTransportProvider(roomName, doc);

  return {
    doc,
    provider,
    awareness: provider.awareness,
    transport,
  };
}

export function destroyCollabSession(
  state: CollabState,
  options?: { immediate?: boolean }
): void {
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
