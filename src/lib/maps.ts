export interface MapInfo {
  id: string;
  name: string;
  wikiUrl: string;
  /** Part of the Season 3 competitive/ranked pool. Non-ranked maps are custom-only. */
  ranked: boolean;
}

export const MAP_POOL: MapInfo[] = [
  { id: 'area-88', name: 'Area 88', wikiUrl: 'https://strinova.org/wiki/Area_88', ranked: true },
  { id: 'base-404', name: 'Base 404', wikiUrl: 'https://strinova.org/wiki/Base_404', ranked: true },
  { id: 'cauchy-street', name: 'Cauchy Street', wikiUrl: 'https://strinova.org/wiki/Cauchy_Street', ranked: true },
  { id: 'cosmite', name: 'Cosmite', wikiUrl: 'https://strinova.org/wiki/Cosmite', ranked: true },
  { id: 'le-brun-city', name: 'Lebrun City', wikiUrl: 'https://strinova.org/wiki/Lebrun_City', ranked: true },
  { id: 'ocarnus', name: 'Ocarnus', wikiUrl: 'https://strinova.org/wiki/Ocarnus', ranked: true },
  { id: 'space-lab', name: 'Space Lab', wikiUrl: 'https://strinova.org/wiki/Space_Lab', ranked: true },
  { id: 'windy-town', name: 'Windy Town', wikiUrl: 'https://strinova.org/wiki/Windy_Town', ranked: true },
  // Not in the Season 3 ranked pool, but available for custom map pools.
  { id: 'port-euler', name: 'Port Euler', wikiUrl: 'https://strinova.org/wiki/Port_Euler', ranked: false },
];

/** The Season 3 competitive pool (excludes custom-only maps like Port Euler). */
export const RANKED_MAP_POOL = MAP_POOL.filter((m) => m.ranked);
