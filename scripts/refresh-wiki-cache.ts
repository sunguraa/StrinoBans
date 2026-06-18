#!/usr/bin/env npx tsx
/**
 * refresh-wiki-cache.ts
 *
 * Build-time script that downloads Strinova map images from the strinova.org
 * MediaWiki API to public/wiki-cache/maps/.
 *
 * Run: npx tsx scripts/refresh-wiki-cache.ts [--force]
 */

import fs from 'node:fs';
import path from 'node:path';
import { MAP_POOL } from '../src/lib/maps';

const WIKI_API_URL = 'https://strinova.org/w/api.php';
const CACHE_DIR = path.resolve(
  import.meta.dirname ?? __dirname,
  '..',
  'public',
  'wiki-cache',
  'maps'
);
const RATE_LIMIT_MS = 200;

// ponytail: allow the wiki's image CDN; the task asks for strinova.org only,
// but the resolved image URLs are served from static.wikitide.net in practice.
const ALLOWED_HOSTS = new Set(['strinova.org', 'static.wikitide.net']);

interface DownloadTask {
  mapId: string;
  pageName: string;
  kind: 'minimap' | 'intro';
  wikiFileName: string;
  outputPath: string;
}

interface DownloadResult {
  task: DownloadTask;
  success: boolean;
  sourceUrl?: string;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAllowedUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && ALLOWED_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

function pageNameFromWikiUrl(wikiUrl: string): string {
  const parsed = new URL(wikiUrl);
  const last = parsed.pathname.split('/').pop() ?? '';
  return decodeURIComponent(last).replace(/ /g, '_');
}

async function fetchJson<T = unknown>(url: string): Promise<T> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'StrinoBans/1.0 (wiki-cache-refresh)' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  return resp.json() as Promise<T>;
}

interface WikiImageInfoApi {
  query?: {
    pages?: Record<
      string,
      {
        imageinfo?: Array<{ url?: string; width?: number; height?: number }>;
        missing?: boolean;
      }
    >;
  };
}

async function resolveWikiImageUrl(
  wikiFileName: string
): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query',
    titles: `File:${wikiFileName}`,
    prop: 'imageinfo',
    iiprop: 'url|size',
    format: 'json',
    origin: '*',
  });
  const data = await fetchJson<WikiImageInfoApi>(`${WIKI_API_URL}?${params}`);
  const page = Object.values(data.query?.pages ?? {})[0];
  if (!page || page.missing) return null;

  const info = page.imageinfo?.[0];
  if (!info?.url) return null;
  if (!isAllowedUrl(info.url)) {
    throw new Error(`Blocked URL from untrusted host: ${info.url}`);
  }
  return info.url;
}

interface ParseImagesApi {
  parse?: {
    images?: string[];
  };
}

async function findIntroFileName(pageName: string): Promise<string | null> {
  const candidates = [`Intro_${pageName}.jpg`, `Intro_${pageName}.png`];
  for (const name of candidates) {
    const url = await resolveWikiImageUrl(name);
    if (url) return name;
  }

  const params = new URLSearchParams({
    action: 'parse',
    page: pageName,
    prop: 'images',
    format: 'json',
    origin: '*',
  });
  const data = await fetchJson<ParseImagesApi>(`${WIKI_API_URL}?${params}`);
  const images = data.parse?.images ?? [];
  return images.find((name) => /^Intro_/i.test(name)) ?? null;
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'StrinoBans/1.0 (wiki-cache-refresh)' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} downloading ${url}`);

  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buffer);
}

function buildTasks(): DownloadTask[] {
  const tasks: DownloadTask[] = [];
  for (const map of MAP_POOL) {
    const pageName = pageNameFromWikiUrl(map.wikiUrl);
    tasks.push({
      mapId: map.id,
      pageName,
      kind: 'minimap',
      wikiFileName: `Minimap_${pageName}.png`,
      outputPath: `minimap-${map.id}.png`,
    });
    tasks.push({
      mapId: map.id,
      pageName,
      kind: 'intro',
      wikiFileName: `Intro_${pageName}.jpg`,
      outputPath: `intro-${map.id}.jpg`,
    });
  }
  return tasks;
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const manifestPath = path.join(CACHE_DIR, 'manifest.json');
  let previousManifest: Record<string, string> = {};
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed?.images && typeof parsed.images === 'object') {
      previousManifest = parsed.images;
    }
  } catch {
    // No previous manifest yet.
  }

  const tasks = buildTasks();
  const results: DownloadResult[] = [];
  let skipped = 0;

  for (const task of tasks) {
    const destPath = path.join(CACHE_DIR, task.outputPath);

    if (!force && fs.existsSync(destPath)) {
      skipped++;
      results.push({
        task,
        success: true,
        sourceUrl: previousManifest[task.outputPath] || '(cached)',
      });
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    try {
      const wikiFileName =
        task.kind === 'intro'
          ? ((await findIntroFileName(task.pageName)) ?? task.wikiFileName)
          : task.wikiFileName;

      const imageUrl = await resolveWikiImageUrl(wikiFileName);
      if (!imageUrl) {
        const msg = `No image URL found for File:${wikiFileName}`;
        console.log(`  x ${task.outputPath} — ${msg}`);
        results.push({ task, success: false, error: msg });
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      await downloadImage(imageUrl, destPath);
      console.log(`  v ${task.outputPath}`);
      results.push({ task, success: true, sourceUrl: imageUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  x ${task.outputPath} — ${msg}`);
      results.push({ task, success: false, error: msg });
    }

    await sleep(RATE_LIMIT_MS);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    images: Object.fromEntries(
      results
        .filter((r) => r.success && r.sourceUrl)
        .map((r) => [r.task.outputPath, r.sourceUrl])
    ),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`\nSucceeded: ${succeeded} (${skipped} skipped/cached)`);
  if (failed > 0) {
    console.log(`Failed: ${failed}`);
    for (const r of results.filter((r) => !r.success)) {
      console.log(`  - ${r.task.outputPath}: ${r.error}`);
    }
  }
  console.log(`Manifest written to ${manifestPath}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
