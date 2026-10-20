import * as Y from 'yjs';
import { getMeta } from './sync';

const MAX_BYTES = 262144;
const key = (sessionId: string) => `strinobans_room_checkpoint:v1:${sessionId}`;

/** Per-tab recovery only; this is not a hosted or portable room backup. */
export function restoreCheckpoint(sessionId: string, doc: Y.Doc): boolean {
  const raw = window.sessionStorage.getItem(key(sessionId));
  if (!raw) return false;
  if (raw.length > MAX_BYTES * 2)
    throw new Error('Local room recovery data is too large.');
  const binary = atob(raw);
  const update = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) update[i] = binary.charCodeAt(i);
  const candidate = new Y.Doc();
  try {
    Y.applyUpdate(candidate, update);
    if (getMeta(candidate)?.sessionId !== sessionId)
      throw new Error('Local room recovery data is invalid.');
    Y.applyUpdate(doc, update);
    return true;
  } finally {
    candidate.destroy();
  }
}

export function saveCheckpoint(sessionId: string, doc: Y.Doc): void {
  if (getMeta(doc)?.sessionId !== sessionId) return;
  const update = Y.encodeStateAsUpdate(doc);
  if (update.byteLength > MAX_BYTES)
    throw new Error('Local room recovery storage limit reached.');
  let binary = '';
  for (const byte of update) binary += String.fromCharCode(byte);
  window.sessionStorage.setItem(key(sessionId), btoa(binary));
}
