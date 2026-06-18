// Internal navigation hrefs (for next/navigation router.push and <Link>) must
// NOT include the basePath — Next.js prepends it automatically. Share links that
// leave the app use toAbsoluteUrl() instead (see token.ts), which adds basePath.
export function getVetoHref(params: { s?: string; t?: string }): string {
  const url = new URL('/veto', 'http://localhost');
  if (params.s) url.searchParams.set('s', params.s);
  if (params.t) url.searchParams.set('t', params.t);
  return `${url.pathname}${url.search}`;
}

export function getTeamHref(sessionId: string, token: string): string {
  return getVetoHref({ s: sessionId, t: token });
}

export function getSpectatorHref(sessionId: string): string {
  return getVetoHref({ s: sessionId });
}

export function getPlanLink(mapId: string): string {
  return `https://sunguraa.github.io/StrinoPlant/map/${encodeURIComponent(mapId)}/edit`;
}
