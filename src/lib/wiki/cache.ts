import { withBasePath } from '../base-path';

export function getCachedMinimapPath(mapId: string): string {
  return withBasePath(`/wiki-cache/maps/minimap-${mapId}.png`);
}

export function getCachedIntroPath(mapId: string): string {
  return withBasePath(`/wiki-cache/maps/intro-${mapId}.jpg`);
}

export function getCachedMapImagePath(
  mapId: string,
  type: 'minimap' | 'intro'
): string {
  return type === 'minimap'
    ? getCachedMinimapPath(mapId)
    : getCachedIntroPath(mapId);
}
