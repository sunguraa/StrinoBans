"use client";

import {
  joinRoom,
  type ActionSender,
  type JsonValue,
  type NostrRoomConfig,
  type Room,
} from "trystero";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import type { CollabInitialSyncState, CollabProvider } from "./provider";

const TRYSTERO_SYNC_ACTION = "yjs-sync";
const TRYSTERO_AWARENESS_ACTION = "yjs-awareness-update";
const DEFAULT_TRYSTERO_APP_ID = "strinobans-collab";
const DEFAULT_TRYSTERO_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];
const INITIAL_DISCOVERY_WINDOW_MS = 250;
const REMOTE_SYNC_RESPONSE_TIMEOUT_MS = 1200;

interface AwarenessMetadataRecord {
  clientIds?: number[];
}

function splitRelayUrls(value: string | undefined): string[] | undefined {
  const urls = value
    ?.split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return urls && urls.length > 0 ? urls : undefined;
}

function buildTrysteroConfig(): NostrRoomConfig {
  const envRelays = splitRelayUrls(process.env.NEXT_PUBLIC_TRYSTERO_RELAY_URLS);
  const relayUrls = envRelays && envRelays.length > 0 ? envRelays : DEFAULT_TRYSTERO_RELAYS;
  const password = process.env.NEXT_PUBLIC_TRYSTERO_PASSWORD?.trim() || undefined;

  return {
    appId: process.env.NEXT_PUBLIC_TRYSTERO_APP_ID?.trim() || DEFAULT_TRYSTERO_APP_ID,
    password,
    relayUrls,
  };
}

function encodeSyncStep1Message(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

function encodeSyncUpdateMessage(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

function getMetadataClientIds(metadata: JsonValue | undefined): number[] {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") return [];
  const { clientIds } = metadata as AwarenessMetadataRecord;
  if (!Array.isArray(clientIds)) return [];
  return clientIds.filter((clientId): clientId is number => typeof clientId === "number");
}

class TrysteroCollabProvider implements CollabProvider {
  readonly transport = "trystero" as const;
  readonly awareness: Awareness;

  private readonly doc: Y.Doc;
  private readonly room: Room;
  private readonly peerIds = new Set<string>();
  private readonly peerClientIds = new Map<string, Set<number>>();
  private readonly sendSyncMessage: ActionSender<Uint8Array>;
  private readonly sendAwarenessUpdate: ActionSender<Uint8Array>;
  private readonly initialSyncPromise: Promise<CollabInitialSyncState>;

  private resolveInitialSync!: (state: CollabInitialSyncState) => void;
  private discoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private syncTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private discoveryComplete = false;
  private initialSyncResolved = false;
  private didReceiveRemoteDoc = false;
  private destroyed = false;

  constructor(roomName: string, doc: Y.Doc) {
    this.doc = doc;
    this.awareness = new Awareness(doc);
    this.room = joinRoom(buildTrysteroConfig(), roomName);

    const [sendSyncMessage, receiveSyncMessage] =
      this.room.makeAction<Uint8Array>(TRYSTERO_SYNC_ACTION);
    const [sendAwarenessUpdate, receiveAwarenessUpdate] =
      this.room.makeAction<Uint8Array>(TRYSTERO_AWARENESS_ACTION);

    this.sendSyncMessage = sendSyncMessage;
    this.sendAwarenessUpdate = sendAwarenessUpdate;

    this.initialSyncPromise = new Promise<CollabInitialSyncState>((resolve) => {
      this.resolveInitialSync = resolve;
    });

    receiveSyncMessage((payload, peerId) => {
      this.handleSyncMessage(payload, peerId);
    });
    receiveAwarenessUpdate((payload, peerId, metadata) => {
      this.handleAwarenessUpdate(payload, peerId, metadata);
    });

    this.room.onPeerJoin(this.handlePeerJoin);
    this.room.onPeerLeave(this.handlePeerLeave);
    this.doc.on("update", this.handleLocalDocUpdate);
    this.awareness.on("update", this.handleLocalAwarenessUpdate);

    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = null;
      this.discoveryComplete = true;

      if (this.didReceiveRemoteDoc) {
        this.finishInitialSync(false);
        return;
      }
      if (this.peerIds.size === 0) {
        this.finishInitialSync(true);
        return;
      }
      this.syncTimeoutTimer = setTimeout(() => {
        this.syncTimeoutTimer = null;
        this.finishInitialSync(false);
      }, REMOTE_SYNC_RESPONSE_TIMEOUT_MS);
    }, INITIAL_DISCOVERY_WINDOW_MS);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearLocalAwareness();
    this.clearTimers();
    this.finishInitialSync(false);
    this.doc.off("update", this.handleLocalDocUpdate);
    this.awareness.off("update", this.handleLocalAwarenessUpdate);
    this.peerIds.clear();
    this.peerClientIds.clear();
    void this.room.leave().catch(() => undefined);
  }

  waitForInitialSync(): Promise<CollabInitialSyncState> {
    return this.initialSyncPromise;
  }

  private finishInitialSync(shouldSeedLocal: boolean): void {
    if (this.initialSyncResolved) return;
    this.initialSyncResolved = true;
    this.clearTimers();
    this.resolveInitialSync({
      shouldSeedLocal,
      discoveredPeerCount: this.peerIds.size,
      didReceiveRemoteDoc: this.didReceiveRemoteDoc,
    });
  }

  private clearTimers(): void {
    if (this.discoveryTimer) {
      clearTimeout(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    if (this.syncTimeoutTimer) {
      clearTimeout(this.syncTimeoutTimer);
      this.syncTimeoutTimer = null;
    }
  }

  private clearLocalAwareness(): void {
    if (this.awareness.getLocalState() !== null) {
      this.awareness.setLocalState(null);
    }
  }

  private rememberPeerClientIds(peerId: string, clientIds: number[]): void {
    if (clientIds.length === 0) return;
    const peerClients = this.peerClientIds.get(peerId) ?? new Set<number>();
    clientIds.forEach((clientId) => peerClients.add(clientId));
    this.peerClientIds.set(peerId, peerClients);
  }

  private sendSyncStep1(peerId: string): void {
    void this.sendSyncMessage(encodeSyncStep1Message(this.doc), peerId).catch(() => undefined);
  }

  private sendLocalAwareness(peerId: string | null = null): void {
    const localState = this.awareness.getLocalState();
    if (!localState || typeof localState !== "object" || !("user" in localState)) return;
    const clientIds = [this.awareness.clientID];
    void this.sendAwarenessUpdate(encodeAwarenessUpdate(this.awareness, clientIds), peerId, {
      clientIds,
    }).catch(() => undefined);
  }

  private readonly handlePeerJoin = (peerId: string) => {
    if (this.destroyed) return;
    this.peerIds.add(peerId);
    this.sendSyncStep1(peerId);
    this.sendLocalAwareness(peerId);
  };

  private readonly handlePeerLeave = (peerId: string) => {
    this.peerIds.delete(peerId);
    const clientIds = this.peerClientIds.get(peerId);
    if (clientIds && clientIds.size > 0) {
      removeAwarenessStates(this.awareness, Array.from(clientIds), this);
    }
    this.peerClientIds.delete(peerId);
    if (!this.initialSyncResolved && this.discoveryComplete && this.peerIds.size === 0) {
      this.finishInitialSync(true);
    }
  };

  private readonly handleLocalDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (this.destroyed || origin === this) return;
    void this.sendSyncMessage(encodeSyncUpdateMessage(update)).catch(() => undefined);
  };

  private readonly handleLocalAwarenessUpdate = (
    event: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (this.destroyed || origin === this) return;
    const changedClients = [...event.added, ...event.updated, ...event.removed].filter(
      (clientId) => clientId === this.awareness.clientID,
    );
    if (changedClients.length === 0) return;
    void this.sendAwarenessUpdate(encodeAwarenessUpdate(this.awareness, changedClients), null, {
      clientIds: changedClients,
    }).catch(() => undefined);
  };

  private handleSyncMessage(payload: Uint8Array, peerId: string): void {
    if (this.destroyed) return;
    this.peerIds.add(peerId);
    const decoder = decoding.createDecoder(payload);
    const replyEncoder = encoding.createEncoder();
    try {
      const messageType = syncProtocol.readSyncMessage(decoder, replyEncoder, this.doc, this);
      if (
        messageType === syncProtocol.messageYjsSyncStep2 ||
        messageType === syncProtocol.messageYjsUpdate
      ) {
        this.didReceiveRemoteDoc = true;
        this.finishInitialSync(false);
      }
      const reply = encoding.toUint8Array(replyEncoder);
      if (reply.byteLength > 0) {
        void this.sendSyncMessage(reply, peerId).catch(() => undefined);
      }
    } catch (error) {
      console.error("[StrinoBans] Failed to read Trystero Yjs sync message", error);
    }
  }

  private handleAwarenessUpdate(
    payload: Uint8Array,
    peerId: string,
    metadata: JsonValue | undefined,
  ): void {
    this.peerIds.add(peerId);
    this.rememberPeerClientIds(peerId, getMetadataClientIds(metadata));
    applyAwarenessUpdate(this.awareness, payload, this);
  }
}

export function createTrysteroTransportProvider(roomName: string, doc: Y.Doc): CollabProvider {
  return new TrysteroCollabProvider(roomName, doc);
}
