'use client';

import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';
import type {
  CollabInitialSyncState,
  CollabProvider,
  ConnectionStatus,
} from './provider';

const DEFAULT_SIGNALING_URL = 'wss://y-webrtc-eu.fly.dev';
const INITIAL_DISCOVERY_WINDOW_MS = 350;
const PEER_SYNC_SETTLE_TIMEOUT_MS = 1500;

interface WebrtcPeersEvent {
  added: string[];
  removed: string[];
  webrtcPeers: string[];
  bcPeers: string[];
}

function normalizeSignalingUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function buildSignalingServers(): string[] {
  const signalingServers: string[] = [];
  const seen = new Set<string>();

  const addUrl = (value: string | null | undefined) => {
    if (!value) return;
    const normalized = normalizeSignalingUrl(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    signalingServers.push(normalized);
  };

  if (typeof window !== 'undefined') {
    const envSignaling = process.env.NEXT_PUBLIC_SIGNALING_URL;
    if (envSignaling) {
      envSignaling
        .split(/[\s,]+/)
        .filter(Boolean)
        .forEach(addUrl);
    }
    if (process.env.NODE_ENV === 'development') {
      addUrl(`ws://${window.location.hostname}:4444`);
    }
  }

  addUrl(DEFAULT_SIGNALING_URL);
  return signalingServers;
}

class WebrtcCollabProvider implements CollabProvider {
  readonly transport = 'webrtc' as const;
  readonly awareness: WebrtcProvider['awareness'];

  private readonly doc: Y.Doc;
  private readonly provider: WebrtcProvider;
  private readonly initialSyncPromise: Promise<CollabInitialSyncState>;

  private resolveInitialSync!: (state: CollabInitialSyncState) => void;
  private discoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private peerSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private discoveryComplete = false;
  private initialSyncResolved = false;
  private didReceiveRemoteDoc = false;
  private destroyed = false;
  private peerCount = 0;
  private status: ConnectionStatus = { phase: 'discovering', peerCount: 0 };
  private readonly statusListeners = new Set<
    (status: ConnectionStatus) => void
  >();
  private statusTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(roomName: string, doc: Y.Doc) {
    this.doc = doc;
    this.provider = new WebrtcProvider(roomName, doc, {
      signaling: buildSignalingServers(),
    });
    this.awareness = this.provider.awareness;

    this.initialSyncPromise = new Promise<CollabInitialSyncState>((resolve) => {
      this.resolveInitialSync = resolve;
    });

    this.doc.on('update', this.handleDocUpdate);
    this.provider.on('peers', this.handlePeers);
    this.provider.on('synced', this.handleSynced);

    this.armStatusTimeout();
    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = null;
      this.discoveryComplete = true;
      this.peerCount = this.getPeerCount();

      if (this.didReceiveRemoteDoc) {
        this.finishInitialSync(false);
        return;
      }
      if (this.peerCount === 0) {
        this.finishInitialSync(true);
        return;
      }
      this.schedulePeerSyncTimeout();
    }, INITIAL_DISCOVERY_WINDOW_MS);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clearLocalAwareness();
    this.destroyed = true;
    this.clearTimers();
    clearTimeout(this.statusTimer);
    this.finishInitialSync(false);
    this.provider.off('peers', this.handlePeers);
    this.provider.off('synced', this.handleSynced);
    this.doc.off('update', this.handleDocUpdate);
    this.provider.destroy();
    this.setStatus('disconnected');
    this.statusListeners.clear();
  }

  waitForInitialSync(): Promise<CollabInitialSyncState> {
    return this.initialSyncPromise;
  }

  getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  subscribeStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  retry(): void {
    if (this.destroyed) return;
    const localAwareness = this.awareness.getLocalState();
    this.provider.disconnect();
    this.provider.connect();
    this.awareness.setLocalState(localAwareness);
    // BroadcastChannel membership can survive disconnect without another peers
    // event, so derive readiness from the retained room instead of resetting it.
    this.peerCount = this.getPeerCount();
    const room = this.provider.room;
    this.setStatus(
      this.peerCount === 0
        ? 'discovering'
        : room && (room.bcConns.size > 0 || room.synced)
          ? 'connected'
          : 'syncing'
    );
    this.armStatusTimeout();
  }

  private armStatusTimeout(): void {
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      if (this.status.phase !== 'connected')
        this.setStatus(
          'error',
          'No synchronized peer yet. Discovery continues; retry to reconnect.'
        );
    }, 20_000);
  }

  private setStatus(phase: ConnectionStatus['phase'], message?: string): void {
    this.status = {
      phase,
      peerCount: phase === 'disconnected' ? 0 : this.getPeerCount(),
      message,
    };
    for (const listener of this.statusListeners) listener(this.getStatus());
  }

  private finishInitialSync(shouldSeedLocal: boolean): void {
    if (this.initialSyncResolved) return;
    this.initialSyncResolved = true;
    this.clearTimers();
    this.resolveInitialSync({
      shouldSeedLocal,
      discoveredPeerCount: this.getPeerCount(),
      didReceiveRemoteDoc: this.didReceiveRemoteDoc,
    });
  }

  private clearTimers(): void {
    if (this.discoveryTimer) {
      clearTimeout(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    if (this.peerSyncTimer) {
      clearTimeout(this.peerSyncTimer);
      this.peerSyncTimer = null;
    }
  }

  private clearLocalAwareness(): void {
    if (this.awareness.getLocalState() !== null) {
      this.awareness.setLocalState(null);
    }
  }

  private getPeerCount(): number {
    const room = this.provider.room;
    if (!room) return this.peerCount;
    return (
      [...room.webrtcConns.values()].filter((peer) => peer.connected).length +
      room.bcConns.size
    );
  }

  private schedulePeerSyncTimeout(): void {
    if (this.peerSyncTimer || this.initialSyncResolved) return;
    this.peerSyncTimer = setTimeout(() => {
      this.peerSyncTimer = null;
      this.peerCount = this.getPeerCount();
      this.finishInitialSync(this.peerCount === 0 && !this.didReceiveRemoteDoc);
    }, PEER_SYNC_SETTLE_TIMEOUT_MS);
  }

  private readonly handleDocUpdate = (_update: Uint8Array, origin: unknown) => {
    if (this.destroyed || origin !== this.provider.room) return;
    this.didReceiveRemoteDoc = true;
    this.finishInitialSync(false);
    this.setStatus('connected');
  };

  private readonly handlePeers = (_event: WebrtcPeersEvent) => {
    if (this.destroyed) return;
    this.peerCount = this.getPeerCount();
    const room = this.provider.room;
    this.setStatus(
      this.peerCount === 0
        ? 'discovering'
        : room && (room.bcConns.size > 0 || room.synced)
          ? 'connected'
          : 'syncing'
    );
    this.armStatusTimeout();

    if (this.initialSyncResolved || !this.discoveryComplete) return;

    if (this.didReceiveRemoteDoc) {
      this.finishInitialSync(false);
      return;
    }
    if (this.peerCount === 0) {
      this.finishInitialSync(true);
      return;
    }
    this.schedulePeerSyncTimeout();
  };

  private readonly handleSynced = ({ synced }: { synced: boolean }) => {
    if (this.destroyed || !synced) return;
    this.peerCount = this.getPeerCount();
    if (this.peerCount > 0) this.setStatus('connected');
    if (this.didReceiveRemoteDoc) {
      this.finishInitialSync(false);
      return;
    }
    if (this.peerCount > 0) {
      this.finishInitialSync(false);
      return;
    }
    if (this.discoveryComplete) {
      this.finishInitialSync(true);
    }
  };
}

export function createWebrtcTransportProvider(
  roomName: string,
  doc: Y.Doc
): CollabProvider {
  return new WebrtcCollabProvider(roomName, doc);
}
