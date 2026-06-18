import { toAbsoluteUrl } from '@/lib/base-path';
import type { Team } from '@/types/veto';

export function generateToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface ParsedUrlTokens {
  sessionId: string | null;
  token: string | null;
}

export function parseUrlTokens(params: { get: (key: string) => string | null | undefined }): ParsedUrlTokens {
  const sessionId = params.get('s') ?? null;
  const token = params.get('t') ?? null;
  return { sessionId, token };
}

export function getRoleFromToken(token: string | null, teamAToken: string | null, teamBToken: string | null): Team | 'spectator' {
  if (!token) return 'spectator';
  if (teamAToken && token === teamAToken) return 'a';
  if (teamBToken && token === teamBToken) return 'b';
  return 'spectator';
}

export interface SessionLinks {
  teamA: string;
  teamB: string;
  spectator: string;
}

export function generateSessionLinks(sessionId: string, teamAToken: string, teamBToken: string): SessionLinks {
  const teamA = toAbsoluteUrl(`/veto?s=${encodeURIComponent(sessionId)}&t=${encodeURIComponent(teamAToken)}`);
  const teamB = toAbsoluteUrl(`/veto?s=${encodeURIComponent(sessionId)}&t=${encodeURIComponent(teamBToken)}`);
  const spectator = toAbsoluteUrl(`/veto?s=${encodeURIComponent(sessionId)}`);
  return { teamA, teamB, spectator };
}
