import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import * as Y from 'yjs';
import type {
  JoinRoom,
  JoinRoomConfig,
  MessageAction,
  Room,
} from '@trystero-p2p/mqtt';
import {
  TrysteroCollabProvider,
  categorizeJoinError,
} from '../src/lib/yjs/trystero-provider';
import type { TrysteroProviderOptions } from '../src/lib/yjs/trystero-provider';

// Controlled 0.26-style data channels, not a substitute for the local real-relay
// integration. No public sockets are opened by this suite.
interface ControlledNetwork {
  join: JoinRoom;
  block(): void;
  unblock(): void;
}
function network(): ControlledNetwork {
  const members = new Map<
    string,
    {
      room: Room;
      receive: Map<
        string,
        (data: Uint8Array, context: { peerId: string }) => void
      >;
    }
  >();
  let sequence = 0;
  let blocked = false;
  const join: JoinRoom = () => {
    const id = `peer-${++sequence}`;
    const receive = new Map<
      string,
      (data: Uint8Array, context: { peerId: string }) => void
    >();
    const room = {
      onPeerJoin: null,
      onPeerLeave: null,
      getPeers: () =>
        members.has(id)
          ? Object.fromEntries(
              [...members.keys()]
                .filter((peer) => peer !== id)
                .map((peer) => [peer, {}])
            )
          : {},
      makeAction: (
        name: string,
        config?: {
          onMessage?: (data: Uint8Array, context: { peerId: string }) => void;
        }
      ) => {
        if (config?.onMessage) receive.set(name, config.onMessage);
        return {
          send: async (data: Uint8Array, options?: { target?: string }) => {
            if (blocked) return;
            for (const [peer, member] of members) {
              if (
                peer !== id &&
                (!options?.target || options.target === peer)
              ) {
                queueMicrotask(() => {
                  if (members.has(peer))
                    member.receive.get(name)?.(data, { peerId: id });
                });
              }
            }
          },
        } as MessageAction<Uint8Array>;
      },
      leave: async () => {
        members.delete(id);
        for (const member of members.values()) member.room.onPeerLeave?.(id);
      },
    } as unknown as Room;
    if (!blocked) {
      members.set(id, { room, receive });
      queueMicrotask(() => {
        for (const [peer, member] of members) {
          if (peer !== id) {
            room.onPeerJoin?.(peer);
            member.room.onPeerJoin?.(id);
          }
        }
      });
    }
    return room;
  };
  return {
    join,
    block() {
      blocked = true;
      const ids = [...members.keys()];
      const previous = [...members.values()];
      members.clear();
      for (const member of previous)
        for (const id of ids) member.room.onPeerLeave?.(id);
    },
    unblock() {
      blocked = false;
    },
  };
}

let clientSequence = 0;
interface TestClient {
  doc: Y.Doc;
  provider: TrysteroCollabProvider;
  options: TrysteroProviderOptions;
  close(): void;
}

function setup(
  mqtt: ControlledNetwork,
  nostr: ControlledNetwork,
  roomName: string
): TestClient {
  const doc = new Y.Doc();
  const client = ++clientSequence;
  // Different IDs isolate singleton rooms for simulated devices only.
  const configs: Record<'mqtt' | 'nostr', JoinRoomConfig> = {
    mqtt: { appId: `test-mqtt-${client}` },
    nostr: { appId: `test-nostr-${client}` },
  };
  const options = {
    joins: { mqtt: mqtt.join, nostr: nostr.join },
    configs,
    discoveryTimeoutMs: 15,
    resyncIntervalMs: 10,
  };
  const provider = new TrysteroCollabProvider(roomName, doc, options);
  return {
    doc,
    provider,
    options,
    close() {
      provider.destroy();
      doc.destroy();
    },
  };
}

async function until(predicate: () => boolean) {
  for (let tick = 0; !predicate(); tick++) {
    assert.ok(
      tick < 100,
      'transport condition did not settle after 100 deterministic ticks'
    );
    mock.timers.tick(10);
    await Promise.resolve();
    await Promise.resolve();
  }
}

test.beforeEach(() =>
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
);
test.afterEach(() => mock.timers.reset());

test('redundant paths deduplicate updates and one route departure retains awareness', async () => {
  const mqtt = network();
  const nostr = network();
  const a = setup(mqtt, nostr, 'redundancy');
  const b = setup(mqtt, nostr, 'redundancy');
  try {
    a.provider.awareness.setLocalState({ user: { name: 'A' } });
    await until(() => b.provider.awareness.getStates().has(a.doc.clientID));
    a.doc.getArray('actions').push([{ id: 'one-action' }]);
    await until(() => b.doc.getArray('actions').length === 1);
    mqtt.block();
    assert.ok(b.provider.awareness.getStates().has(a.doc.clientID));
    a.doc.getArray('actions').push([{ id: 'second-action' }]);
    await until(() => b.doc.getArray('actions').length === 2);
    assert.deepEqual(b.doc.getArray('actions').toArray(), [
      { id: 'one-action' },
      { id: 'second-action' },
    ]);
    a.provider.destroy();
    await until(() => !b.provider.awareness.getStates().has(a.doc.clientID));
  } finally {
    a.close();
    b.close();
  }
});

test('shared upstream rooms survive sibling destruction and StrictMode remount', async () => {
  const mqtt = network();
  const nostr = network();
  const a = setup(mqtt, nostr, 'shared');
  const siblingDoc = new Y.Doc();
  const sibling = new TrysteroCollabProvider('shared', siblingDoc, a.options);
  const remote = setup(mqtt, nostr, 'shared');
  try {
    a.provider.destroy();
    remote.doc.getMap('meta').set('alive', true);
    await until(() => siblingDoc.getMap('meta').get('alive') === true);
    sibling.destroy();
    const remount = new TrysteroCollabProvider('shared', siblingDoc, a.options);
    try {
      remote.doc.getMap('meta').set('remounted', true);
      await until(() => siblingDoc.getMap('meta').get('remounted') === true);
    } finally {
      remount.destroy();
    }
  } finally {
    a.close();
    sibling.destroy();
    siblingDoc.destroy();
    remote.close();
  }
});

test('join errors are categorized without exposing identifiers or SDP', () => {
  for (const input of [
    'wrong password private-token',
    'handshake rejected private-token',
    'timeout 192.0.2.1',
    'SDP contains private-token',
  ]) {
    const message = categorizeJoinError(input);
    assert.equal(message.includes('private-token'), false);
    assert.equal(message.includes('192.0.2.1'), false);
    assert.equal(message.includes('SDP'), false);
  }
});

test('losing all healthy paths starts a fresh automatic recovery window', async () => {
  const mqtt = network();
  const nostr = network();
  const a = setup(mqtt, nostr, 'recovery-window');
  const b = setup(mqtt, nostr, 'recovery-window');
  try {
    await until(() => a.provider.getStatus().phase === 'connected');
    mock.timers.tick(30);
    mqtt.block();
    nostr.block();
    assert.notEqual(a.provider.getStatus().phase, 'error');
    mock.timers.tick(20);
    assert.equal(a.provider.getStatus().phase, 'error');
  } finally {
    a.close();
    b.close();
  }
});

test('local sibling synchronization does not cancel the remote-peer discovery deadline', async () => {
  const mqtt = network();
  const nostr = network();
  const a = setup(mqtt, nostr, 'local-only');
  const localDoc = new Y.Doc();
  const sibling = new TrysteroCollabProvider('local-only', localDoc, a.options);
  try {
    a.doc.getMap('meta').set('name', 'local snapshot');
    await until(() => localDoc.getMap('meta').get('name') === 'local snapshot');
    mock.timers.tick(20);
    assert.equal(a.provider.getStatus().peerCount, 0);
    assert.equal(a.provider.getStatus().phase, 'error');
    assert.equal(sibling.getStatus().phase, 'error');
  } finally {
    sibling.destroy();
    localDoc.destroy();
    a.close();
  }
});
