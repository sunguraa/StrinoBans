import type { ConfirmedAction } from '@/lib/state-machine';

export interface SessionRecord {
  sessionId: string;
  teamAToken: string;
  teamBToken: string;
  presetId?: string;
  mapPool?: string[];
  format?: string;
  ruleset?: string;
  seededPick?: boolean;
  coinFlipMode?: 'random' | 'seeded' | 'choose-team';
  steps?: { team: 'a' | 'b'; type: 'ban' | 'pick' | 'side'; forPickIndex?: number; forDecider?: boolean }[];
  pickBanTimerSeconds?: number | null;
  sideTimerSeconds?: number | null;
  timerEnforcement?: 'none' | 'random-after-timeout';
  roomImportCode?: string;
  createdAt: string;
}

export interface SessionSummary {
  sessionId: string;
  presetId: string;
  presetName: string;
  format: string;
  mapPool: string[];
  teamAName: string;
  teamBName: string;
  coinFlipWinner: 'a' | 'b' | null;
  actions: ConfirmedAction[];
  finalResult: { mapId: string; pickedBy: string; side: string; sidePickedBy: string }[];
  completedAt: string;
  role: 'a' | 'b' | 'spectator';
}

const RECENT_SESSIONS_KEY = 'strinobans_recent_sessions';
const SESSION_CONFIG_KEY = 'strinobans_session_config';
const SESSION_HISTORY_KEY = 'strinobans_session_history';
const MAX_RECENT = 25;
const MAX_AGE_DAYS = 60;
const MAX_HISTORY = 25;
const MAX_HISTORY_AGE_DAYS = 60;

function readRecords(): SessionRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SessionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(records: SessionRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(records));
  } catch {
    // ignore storage errors
  }
}

function prune(records: SessionRecord[]): SessionRecord[] {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const sorted = records
    .filter((r) => new Date(r.createdAt).getTime() > cutoff)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sorted.slice(0, MAX_RECENT);
}

export function saveRecentSession(record: SessionRecord): void {
  const records = prune(readRecords().filter((r) => r.sessionId !== record.sessionId));
  records.unshift(record);
  writeRecords(prune(records));
}

export function getRecentSessions(): SessionRecord[] {
  return prune(readRecords());
}

export function removeRecentSession(sessionId: string): void {
  writeRecords(prune(readRecords().filter((r) => r.sessionId !== sessionId)));
}

export function saveSessionConfig(sessionId: string, config: Omit<SessionRecord, 'sessionId' | 'createdAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    const record: SessionRecord = {
      ...config,
      sessionId,
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem(`${SESSION_CONFIG_KEY}:${sessionId}`, JSON.stringify(record));
    saveRecentSession(record);
  } catch {
    // ignore storage errors
  }
}

export function getSessionConfig(sessionId: string): SessionRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${SESSION_CONFIG_KEY}:${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as SessionRecord;
  } catch {
    return null;
  }
}

function readHistory(): SessionSummary[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SESSION_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SessionSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(summaries: SessionSummary[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(summaries));
  } catch {
    // ignore storage errors
  }
}

function pruneHistory(summaries: SessionSummary[]): SessionSummary[] {
  const cutoff = Date.now() - MAX_HISTORY_AGE_DAYS * 24 * 60 * 60 * 1000;
  const sorted = summaries
    .filter((s) => new Date(s.completedAt).getTime() > cutoff)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  return sorted.slice(0, MAX_HISTORY);
}

export function getSessionHistory(): SessionSummary[] {
  return pruneHistory(readHistory());
}

export function saveCompletedSession(summary: Omit<SessionSummary, 'completedAt'>): void {
  if (typeof window === 'undefined') return;
  const completed: SessionSummary = { ...summary, completedAt: new Date().toISOString() };
  const list = pruneHistory(readHistory().filter((s) => s.sessionId !== completed.sessionId));
  list.unshift(completed);
  writeHistory(pruneHistory(list));
}

export function removeSessionHistory(sessionId: string): void {
  writeHistory(pruneHistory(readHistory().filter((s) => s.sessionId !== sessionId)));
}

export function downloadSessionTranscript(summary: SessionSummary): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `strinobans-${summary.sessionId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
