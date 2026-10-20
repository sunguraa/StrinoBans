import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { build } from 'esbuild';
import { WebSocketServer, WebSocket } from 'ws';

interface NostrEvent {
  id: string;
  pubkey: string;
  sig: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}
interface NostrFilter {
  kinds?: number[];
  since?: number;
  '#x'?: string[];
}

function matches(event: NostrEvent, filter: NostrFilter) {
  return (
    (!filter.kinds || filter.kinds.includes(event.kind)) &&
    (filter.since === undefined || event.created_at >= filter.since) &&
    (!filter['#x'] ||
      event.tags.some(
        ([name, value]) => name === 'x' && filter['#x']!.includes(value)
      ))
  );
}

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return (server.address() as AddressInfo).port;
}

export async function startTransportFixture() {
  // This is a real localhost NIP-01 pub/sub relay: subscriptions, tagged/kind/time
  // filtering, retained events, publication acknowledgements, EOSE and CLOSE.
  // No app-specific sync data or peer behavior is simulated by the relay.
  const subscriptions = new Map<WebSocket, Map<string, NostrFilter[]>>();
  const events = new Map<string, NostrEvent>();
  let paused = false;
  const relayHttp = createServer();
  const relay = new WebSocketServer({ server: relayHttp });
  relay.on('connection', (socket) => {
    const subscriptionsForSocket = new Map<string, NostrFilter[]>();
    subscriptions.set(socket, subscriptionsForSocket);
    socket.on('close', () => subscriptions.delete(socket));
    socket.on('message', (bytes) => {
      try {
        const message: unknown = JSON.parse(bytes.toString());
        if (!Array.isArray(message)) return;
        if (message[0] === 'REQ' && typeof message[1] === 'string') {
          const filters = message.slice(2) as NostrFilter[];
          subscriptionsForSocket.set(message[1], filters);
          if (!paused)
            for (const event of events.values()) {
              if (filters.some((filter) => matches(event, filter)))
                socket.send(JSON.stringify(['EVENT', message[1], event]));
            }
          socket.send(JSON.stringify(['EOSE', message[1]]));
        } else if (message[0] === 'CLOSE' && typeof message[1] === 'string') {
          subscriptionsForSocket.delete(message[1]);
        } else if (message[0] === 'EVENT') {
          const event = message[1] as NostrEvent;
          if (
            !event ||
            typeof event.id !== 'string' ||
            typeof event.content !== 'string' ||
            typeof event.pubkey !== 'string' ||
            typeof event.sig !== 'string' ||
            !Number.isInteger(event.kind) ||
            !Number.isInteger(event.created_at) ||
            !Array.isArray(event.tags)
          )
            return;
          socket.send(
            JSON.stringify([
              'OK',
              event.id,
              !paused,
              paused ? 'error: fixture paused' : '',
            ])
          );
          if (paused || events.has(event.id)) return;
          events.set(event.id, event);
          for (const [client, clientSubscriptions] of subscriptions) {
            if (client.readyState !== WebSocket.OPEN) continue;
            for (const [id, filters] of clientSubscriptions) {
              if (filters.some((filter) => matches(event, filter)))
                client.send(JSON.stringify(['EVENT', id, event]));
            }
          }
        }
      } catch {
        socket.send(JSON.stringify(['NOTICE', 'Invalid relay message']));
      }
    });
  });
  const relayPort = await listen(relayHttp);
  // Reserve and close a localhost port: MQTT is genuinely unavailable, not mocked.
  const unavailable = createServer();
  const unavailablePort = await listen(unavailable);
  await new Promise<void>((resolve, reject) =>
    unavailable.close((error) => (error ? reject(error) : resolve()))
  );
  const nostrUrl = `ws://127.0.0.1:${relayPort}`;
  const mqttUrl = `ws://127.0.0.1:${unavailablePort}`;
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'ts',
      contents: `
        import * as Y from 'yjs';
        import { joinRoom as mqtt } from '@trystero-p2p/mqtt';
        import { joinRoom as nostr } from '@trystero-p2p/nostr';
        import { TrysteroCollabProvider } from './src/lib/yjs/trystero-provider';
        const rooms = [];
        let doc, provider, originalDoc, originalAwareness;
        const wrap = join => (config, room, callbacks) => {
          const result = join(config, room, callbacks);
          rooms.push(result);
          return result;
        };
        const config = url => ({
          appId: 'strinobans-local-real-transport:yjs-v2',
          relayConfig: { urls: [url], redundancy: 1, warnOnRelayFailure: false },
          rtcConfig: { iceServers: [] },
          _test_only_mdnsHostFallbackToLoopback: true
        });
        window.transportTest = {
          start(room, creator) {
            doc = originalDoc = new Y.Doc();
            provider = new TrysteroCollabProvider(room, doc, {
              joins: { mqtt: wrap(mqtt), nostr: wrap(nostr) },
              configs: { mqtt: config(${JSON.stringify(mqttUrl)}), nostr: config(${JSON.stringify(nostrUrl)}) }
            });
            originalAwareness = provider.awareness;
            if (creator) doc.getMap('meta').set('preset', 'frozen-local-config');
          },
          state() {
            return { status: provider.getStatus(), meta: doc.getMap('meta').toJSON(),
              actions: doc.getArray('actions').toArray(),
              sameDoc: doc === originalDoc, sameAwareness: provider.awareness === originalAwareness };
          },
          act(id) { doc.getArray('actions').push([{ id }]); },
          disconnect() { for (const room of rooms) for (const peer of Object.values(room.getPeers())) peer.close(); },
        };
      `,
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
  });
  const app = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/harness.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(bundle.outputFiles[0].contents);
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<!doctype html><title>Local transport integration</title><script src="/harness.js"></script>'
      );
    }
  });
  const appPort = await listen(app);
  return {
    origin: `http://127.0.0.1:${appPort}`,
    pauseRelay(value: boolean) {
      paused = value;
      events.clear();
    },
    async close() {
      for (const socket of relay.clients) socket.terminate();
      await new Promise<void>((resolve, reject) =>
        relay.close((error) => (error ? reject(error) : resolve()))
      );
      await Promise.all(
        [relayHttp, app].map(
          (server) =>
            new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve()))
            )
        )
      );
    },
  };
}
