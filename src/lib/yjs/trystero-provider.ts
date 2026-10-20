'use client';

import {
  joinRoom as joinMqttRoom,
  defaultRelayUrls as mqttDefaults,
  type JoinRoom,
  type JoinRoomConfig,
  type MessageAction,
  type Room,
} from '@trystero-p2p/mqtt';
import {
  joinRoom as joinNostrRoom,
  defaultRelayUrls as nostrDefaults,
} from '@trystero-p2p/nostr';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import type {
  CollabInitialSyncState,
  CollabProvider,
  ConnectionStatus,
} from './provider';

export const TRYSTERO_PROTOCOL_REVISION = 'yjs-v2';
const DISCOVERY_TIMEOUT_MS = 20_000;
const RESYNC_INTERVAL_MS = 5_000;
type Strategy = 'mqtt' | 'nostr';
type Channel = 'sync' | 'awareness';

export function categorizeJoinError(error: string): string {
  if (/password|decrypt|authentication/i.test(error))
    return 'Room authentication failed. Check the room link.';
  if (/handshake|admission/i.test(error))
    return 'Peer admission failed. Retrying discovery.';
  if (/timeout|timed out/i.test(error))
    return 'Peer connection timed out. Retrying discovery.';
  return 'A direct peer connection could not be established. Discovery is still running.';
}

function relayUrls(value: string | undefined): string[] | undefined {
  const urls = value?.split(/[\s,]+/).filter(Boolean);
  return urls?.length ? [...new Set(urls)] : undefined;
}

export function buildTrysteroConfig(strategy: Strategy): JoinRoomConfig {
  const overrides =
    strategy === 'mqtt'
      ? (process.env.NEXT_PUBLIC_TRYSTERO_MQTT_RELAY_URLS ??
        process.env.NEXT_PUBLIC_TRYSTERO_RELAY_URLS)
      : process.env.NEXT_PUBLIC_TRYSTERO_NOSTR_RELAY_URLS;
  // Fixed overlapping discovery sets, never device-specific/random profile selection.
  // The Nostr endpoints are maintained upstream defaults, all on standard WSS 443.
  const urls =
    relayUrls(overrides) ??
    (strategy === 'mqtt'
      ? mqttDefaults
      : nostrDefaults.filter((url) =>
          [
            'wss://cdn.satellite.earth',
            'wss://nos.lol',
            'wss://nostr.chaima.info',
          ].includes(url)
        ));
  return {
    appId: `${process.env.NEXT_PUBLIC_TRYSTERO_APP_ID?.trim() || 'strinobans-collab'}:${TRYSTERO_PROTOCOL_REVISION}`,
    password: process.env.NEXT_PUBLIC_TRYSTERO_PASSWORD?.trim() || undefined,
    relayConfig: { urls, redundancy: urls.length, warnOnRelayFailure: false },
  };
}

interface RoomSubscriber {
  message(
    channel: Channel,
    payload: Uint8Array,
    peerId: string,
    origin: SharedRoom
  ): void;
  peersChanged(): void;
  error(message: string): void;
}

// Trystero caches one Room per app/room. Multiplex callbacks/actions so concurrent
// consumers and React StrictMode cannot overwrite handlers or leave a sibling's room.
class SharedRoom {
  readonly subscribers = new Set<RoomSubscriber>();
  private room: Room | null = null;
  private actions: Partial<Record<Channel, MessageAction<Uint8Array>>> = {};

  constructor(
    private readonly join: JoinRoom,
    private readonly config: JoinRoomConfig,
    private readonly name: string
  ) {}

  start(): void {
    try {
      this.room = this.join(this.config, this.name, {
        onJoinError: ({ error }) => this.report(categorizeJoinError(error)),
      });
      for (const channel of ['sync', 'awareness'] as const) {
        this.actions[channel] = this.room.makeAction<Uint8Array>(
          `yjs-${channel}`,
          {
            onMessage: (payload, { peerId }) => {
              for (const subscriber of this.subscribers)
                subscriber.message(channel, payload, peerId, this);
            },
          }
        );
      }
      this.room.onPeerJoin = this.room.onPeerLeave = () => {
        for (const subscriber of this.subscribers) subscriber.peersChanged();
      };
    } catch {
      this.report('Discovery could not start. Retry to reconnect.');
    }
  }

  peers(): string[] {
    // Upstream 0.26 excludes pending/failed handshakes from getPeers().
    return this.room ? Object.keys(this.room.getPeers()) : [];
  }

  send(
    channel: Channel,
    payload: Uint8Array,
    sender: RoomSubscriber,
    target?: string
  ): void {
    const action = this.actions[channel];
    if (action)
      void action.send(payload, { target }).catch(() => {
        this.report(
          'A peer send failed. Synchronization will retry automatically.'
        );
      });
    // Separate local docs sharing the same upstream Room must synchronize too.
    if (!target) {
      for (const subscriber of this.subscribers) {
        if (subscriber !== sender)
          subscriber.message(channel, payload, 'local', this);
      }
    }
  }

  retry(): void {
    if (this.peers().length > 0) return;
    this.stop();
    this.start();
  }

  ensureStarted(): void {
    if (!this.room) this.start();
  }

  stop(): void {
    const room = this.room;
    this.room = null;
    this.actions = {};
    if (room) {
      room.onPeerJoin = room.onPeerLeave = null;
      // leave releases upstream's occupied-room cache synchronously, before awaiting.
      void room.leave().catch(() => undefined);
    }
  }

  private report(message: string): void {
    for (const subscriber of this.subscribers) subscriber.error(message);
  }
}

const sharedRooms = new Map<string, SharedRoom>();

export interface TrysteroProviderOptions {
  // Inject real local strategies or in-memory controlled rooms without public probes.
  joins?: Record<Strategy, JoinRoom>;
  configs?: Record<Strategy, JoinRoomConfig>;
  discoveryTimeoutMs?: number;
  resyncIntervalMs?: number;
}

export class TrysteroCollabProvider implements CollabProvider, RoomSubscriber {
  readonly transport = 'trystero' as const;
  readonly awareness: Awareness;
  private readonly paths: { key: string; room: SharedRoom }[] = [];
  private readonly listeners = new Set<(status: ConnectionStatus) => void>();
  private readonly syncedPeers = new Set<string>();
  private readonly initialSyncPromise: Promise<CollabInitialSyncState>;
  private resolveInitialSync!: (state: CollabInitialSyncState) => void;
  private initialSyncResolved = false;
  private didReceiveRemoteDoc = false;
  private destroyed = false;
  private timedOut = false;
  private lastError: string | undefined;
  private status: ConnectionStatus = { phase: 'discovering', peerCount: 0 };
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private readonly resyncTimer: ReturnType<typeof setInterval>;
  private readonly timeoutMs: number;

  constructor(
    roomName: string,
    private readonly doc: Y.Doc,
    options: TrysteroProviderOptions = {}
  ) {
    this.awareness = new Awareness(doc);
    this.timeoutMs = options.discoveryTimeoutMs ?? DISCOVERY_TIMEOUT_MS;
    this.initialSyncPromise = new Promise<CollabInitialSyncState>((resolve) => {
      this.resolveInitialSync = resolve;
    });
    this.doc.on('update', this.handleDocUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);
    for (const strategy of ['mqtt', 'nostr'] as const) {
      const config =
        options.configs?.[strategy] ?? buildTrysteroConfig(strategy);
      const join =
        options.joins?.[strategy] ??
        (strategy === 'mqtt' ? joinMqttRoom : joinNostrRoom);
      const key = JSON.stringify([strategy, config, roomName]);
      let room = sharedRooms.get(key);
      const fresh = !room;
      if (!room) {
        room = new SharedRoom(join, config, roomName);
        sharedRooms.set(key, room);
      }
      this.paths.push({ key, room });
      room.subscribers.add(this);
      if (fresh) room.start();
    }
    this.armDeadline();
    this.peersChanged();
    // Never stop discovery or anti-entropy after initial sync: late peers and route
    // recovery must merge the same doc, including peers reachable only through a bridge.
    this.resyncTimer = setInterval(
      () => this.requestSync(),
      options.resyncIntervalMs ?? RESYNC_INTERVAL_MS
    );
  }

  getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  subscribeStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  waitForInitialSync(): Promise<CollabInitialSyncState> {
    return this.initialSyncPromise;
  }

  retry(): void {
    if (this.destroyed) return;
    this.timedOut = false;
    this.lastError = undefined;
    for (const { room } of this.paths) room.retry();
    this.armDeadline();
    this.peersChanged();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.awareness.setLocalState(null);
    this.destroyed = true;
    clearTimeout(this.deadline);
    clearInterval(this.resyncTimer);
    this.doc.off('update', this.handleDocUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    this.awareness.destroy();
    this.finishInitialSync();
    for (const { key, room } of this.paths) {
      room.subscribers.delete(this);
      if (!room.subscribers.size) {
        sharedRooms.delete(key);
        room.stop();
      }
    }
    this.status = { phase: 'disconnected', peerCount: 0 };
    for (const listener of this.listeners) listener(this.getStatus());
    this.listeners.clear();
  }

  peersChanged(): void {
    if (this.destroyed) return;
    const peers = this.peerIds();
    for (const id of this.syncedPeers)
      if (!peers.has(id)) this.syncedPeers.delete(id);
    if (this.status.phase === 'connected' && peers.size === 0) {
      this.timedOut = false;
      this.lastError = undefined;
      this.armDeadline();
    }
    // Do not remove awareness on one route's leave. Clocked awareness expiry or
    // an explicit owner tombstone handles actual departure without flickering.
    this.updateStatus();
    this.requestSync();
  }

  error(message: string): void {
    this.lastError = message;
    this.updateStatus();
  }

  message(
    channel: Channel,
    payload: Uint8Array,
    peerId: string,
    origin: SharedRoom
  ): void {
    if (this.destroyed) return;
    try {
      if (channel === 'awareness') {
        applyAwarenessUpdate(this.awareness, payload, origin);
        return;
      }
      const reply = encoding.createEncoder();
      const type = syncProtocol.readSyncMessage(
        decoding.createDecoder(payload),
        reply,
        this.doc,
        origin
      );
      if (
        type === syncProtocol.messageYjsSyncStep2 &&
        peerId !== 'local' &&
        this.peerIds().has(peerId)
      ) {
        clearTimeout(this.deadline);
        this.timedOut = false;
        this.didReceiveRemoteDoc = true;
        this.syncedPeers.add(peerId);
        this.finishInitialSync();
        this.updateStatus();
      }
      if (encoding.length(reply))
        origin.send(
          'sync',
          encoding.toUint8Array(reply),
          this,
          peerId === 'local' ? undefined : peerId
        );
    } catch {
      this.error(
        'A peer sent an invalid synchronization message. Waiting for a valid sync.'
      );
    }
  }

  private peerIds(): Set<string> {
    return new Set(this.paths.flatMap(({ room }) => room.peers()));
  }

  private updateStatus(): void {
    if (this.destroyed) return;
    const peers = this.peerIds();
    const connected = [...peers].some((id) => this.syncedPeers.has(id));
    const next: ConnectionStatus = {
      phase: connected
        ? 'connected'
        : this.timedOut
          ? 'error'
          : peers.size
            ? 'syncing'
            : this.lastError
              ? 'connecting'
              : 'discovering',
      peerCount: peers.size,
      message: connected
        ? undefined
        : (this.lastError ??
          (this.timedOut
            ? 'No synchronized peer yet. Discovery continues; retry or check that the other player has this room open.'
            : undefined)),
    };
    if (
      next.phase === this.status.phase &&
      next.peerCount === this.status.peerCount &&
      next.message === this.status.message
    )
      return;
    this.status = next;
    for (const listener of this.listeners) listener(this.getStatus());
  }

  private armDeadline(): void {
    clearTimeout(this.deadline);
    this.deadline = setTimeout(() => {
      this.timedOut = true;
      this.finishInitialSync();
      this.updateStatus();
    }, this.timeoutMs);
  }

  private finishInitialSync(): void {
    if (this.initialSyncResolved) return;
    this.initialSyncResolved = true;
    // Transport completion never authorizes room creation or implies validated meta.
    this.resolveInitialSync({
      shouldSeedLocal: false,
      discoveredPeerCount: this.peerIds().size,
      didReceiveRemoteDoc: this.didReceiveRemoteDoc,
    });
  }

  private requestSync(): void {
    if (this.destroyed) return;
    const encoder = encoding.createEncoder();
    syncProtocol.writeSyncStep1(encoder, this.doc);
    const message = encoding.toUint8Array(encoder);
    const clients = [...this.awareness.getStates().keys()];
    for (const { room } of this.paths) {
      room.ensureStarted();
      room.send('sync', message, this);
      if (clients.length)
        room.send(
          'awareness',
          encodeAwarenessUpdate(this.awareness, clients),
          this
        );
    }
  }

  private readonly handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    const encoder = encoding.createEncoder();
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    // Bridge different reachable paths. Yjs only emits an update for new structs,
    // so duplicate delivery over both routes cannot duplicate logical actions.
    for (const { room } of this.paths)
      if (room !== origin) room.send('sync', message, this);
  };

  private readonly handleAwarenessUpdate = (
    event: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    const clients = [...event.added, ...event.updated, ...event.removed];
    const message = encodeAwarenessUpdate(this.awareness, clients);
    for (const { room } of this.paths)
      if (room !== origin) room.send('awareness', message, this);
  };
}

export function createTrysteroTransportProvider(
  roomName: string,
  doc: Y.Doc,
  options?: TrysteroProviderOptions
): CollabProvider {
  return new TrysteroCollabProvider(roomName, doc, options);
}
