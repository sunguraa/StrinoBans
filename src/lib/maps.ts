export interface MapInfo {
  id: string;
  name: string;
  wikiUrl: string;
  /** Included in the app's Default pool, not a claim about an official ranked pool. */
  inDefaultPool: boolean;
}

export const MAP_POOL: MapInfo[] = [
  {
    id: 'area-88',
    name: 'Area 88',
    wikiUrl: 'https://strinova.org/wiki/Area_88',
    inDefaultPool: true,
  },
  {
    id: 'base-404',
    name: 'Base 404',
    wikiUrl: 'https://strinova.org/wiki/Base_404',
    inDefaultPool: true,
  },
  {
    id: 'cauchy-street',
    name: 'Cauchy Street',
    wikiUrl: 'https://strinova.org/wiki/Cauchy_Street',
    inDefaultPool: true,
  },
  {
    id: 'cosmite',
    name: 'Cosmite',
    wikiUrl: 'https://strinova.org/wiki/Cosmite',
    inDefaultPool: false,
  },
  {
    id: 'le-brun-city',
    name: 'Lebrun City',
    wikiUrl: 'https://strinova.org/wiki/Lebrun_City',
    inDefaultPool: true,
  },
  {
    id: 'ocarnus',
    name: 'Ocarnus',
    wikiUrl: 'https://strinova.org/wiki/Ocarnus',
    inDefaultPool: true,
  },
  {
    id: 'space-lab',
    name: 'Space Lab',
    wikiUrl: 'https://strinova.org/wiki/Space_Lab',
    inDefaultPool: true,
  },
  {
    id: 'windy-town',
    name: 'Windy Town',
    wikiUrl: 'https://strinova.org/wiki/Windy_Town',
    inDefaultPool: true,
  },
  {
    id: 'port-euler',
    name: 'Port Euler',
    wikiUrl: 'https://strinova.org/wiki/Port_Euler',
    inDefaultPool: false,
  },
];

export const DEFAULT_MAP_POOL = MAP_POOL.filter((map) => map.inDefaultPool);
