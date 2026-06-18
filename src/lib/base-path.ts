export const BASE_PATH = '/StrinoBans';

export function withBasePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}

export function toAbsoluteUrl(path: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${BASE_PATH}${normalized}`;
}
