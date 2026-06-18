'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Header } from '@/components/layout/header';
import { Branding } from '@/components/layout/branding';
import { HistorySidebar } from '@/components/veto/history-sidebar';
import { MapSelector } from '@/components/custom/map-selector';
import { fetchPresetIndex, fetchPreset } from '@/lib/presets';
import type { PresetGroup } from '@/types/preset';
import type { VetoPreset } from '@/types/preset';
import type { Format } from '@/types/veto';
import { bestOfForFormat, minMapsForBestOf } from '@/lib/state-machine';
import { generateToken } from '@/lib/token';
import { saveSessionConfig } from '@/lib/storage';
import { getTeamHref } from '@/lib/routes';
import { withBasePath } from '@/lib/base-path';
import { MAP_POOL, RANKED_MAP_POOL } from '@/lib/maps';
import { playBeep } from '@/lib/sound';
import { cn } from '@/lib/utils';
import { getCachedIntroPath } from '@/lib/wiki/cache';

const FORMATS: { key: Format; label: string; plays: string }[] = [
  { key: 'bo1', label: 'Bo1', plays: '1 map' },
  { key: 'bo3', label: 'Bo3', plays: '3 maps' },
  { key: 'bo5', label: 'Bo5', plays: '5 maps' },
  { key: 'bo7', label: 'Bo7', plays: '7 maps' },
];

const FORMAT_LABEL: Record<string, string> = {
  bo1: 'Bo1',
  bo3: 'Bo3',
  bo5: 'Bo5',
  bo7: 'Bo7',
  custom: 'Custom',
};

export default function HomePage() {
  const [groups, setGroups] = useState<PresetGroup[]>([]);
  const [tab, setTab] = useState<'presets' | 'custom'>('presets');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<VetoPreset | null>(null);
  const [customMaps, setCustomMaps] = useState<string[]>(
    MAP_POOL.map((m) => m.id)
  );
  const [customFormat, setCustomFormat] = useState<Format | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchPresetIndex()
      .then((index) => setGroups(index.groups))
      .catch((err) => console.error('Failed to load presets', err));
  }, []);

  useEffect(() => {
    if (selectedPresetId) {
      fetchPreset(selectedPresetId)
        .then((preset) => setSelectedPreset(preset))
        .catch((err) => console.error('Failed to load preset', err));
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPreset(null);
    }
  }, [selectedPresetId]);

  // Drop a custom format once the pool shrinks below what it needs.
  useEffect(() => {
    if (
      customFormat &&
      customMaps.length < minMapsForBestOf(bestOfForFormat(customFormat))
    ) {
      // Reset the chosen format once the pool can no longer support it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomFormat(null);
    }
  }, [customMaps, customFormat]);

  const canCreate =
    tab === 'presets'
      ? !!selectedPresetId
      : !!customFormat &&
        customMaps.length >= minMapsForBestOf(bestOfForFormat(customFormat));

  const createRoom = async () => {
    let config: {
      presetId: string;
      mapPool: string[];
      format: string;
      ruleset: string;
      seededPick: boolean;
      pickBanTimerSeconds: number | null;
      sideTimerSeconds: number | null;
      timerEnforcement: 'none' | 'random-after-timeout';
      roomImportCode?: string;
    };

    if (tab === 'presets') {
      if (!selectedPresetId) return;
      const preset = await fetchPreset(selectedPresetId);
      if (!preset) return;
      config = {
        presetId: preset.id,
        mapPool: preset.mapPool,
        format: preset.format,
        ruleset: preset.ruleset,
        seededPick: preset.seededPick ?? false,
        pickBanTimerSeconds: preset.pickBanTimerSeconds ?? null,
        sideTimerSeconds: preset.sideTimerSeconds ?? null,
        timerEnforcement: preset.timerEnforcement ?? 'none',
        roomImportCode: preset.roomImportCode ?? undefined,
      };
    } else {
      if (!customFormat) return;
      if (customMaps.length < minMapsForBestOf(bestOfForFormat(customFormat)))
        return;
      config = {
        presetId: 'custom',
        mapPool: customMaps,
        format: customFormat,
        ruleset: 'default',
        seededPick: false,
        pickBanTimerSeconds: 50,
        sideTimerSeconds: 35,
        timerEnforcement: 'none',
      };
    }

    setCreating(true);
    playBeep();

    const sessionId = generateToken();
    const teamAToken = generateToken();
    const teamBToken = generateToken();

    saveSessionConfig(sessionId, { teamAToken, teamBToken, ...config });
    // Full-page navigation (not router.push): a fresh document load reliably
    // initializes the P2P transport. A client-side push could leave the host's
    // room unconnected until a manual reload.
    window.location.href = withBasePath(getTeamHref(sessionId, teamAToken));
  };

  const summary =
    tab === 'presets' && selectedPresetId
      ? `${groups.find((g) => g.stages.some((s) => s.presetId === selectedPresetId))?.name ?? 'Preset'} · ${
          FORMAT_LABEL[
            groups
              .flatMap((g) => g.stages)
              .find((s) => s.presetId === selectedPresetId)?.format ?? ''
          ] ?? ''
        }`
      : tab === 'custom' && customFormat
        ? `Custom · ${FORMAT_LABEL[customFormat]} · ${customMaps.length} maps`
        : null;

  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <HistorySidebar />
        <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-16">
          {/* Hero — editorial sport: eyebrow + serif heading */}
          <div className="mb-12 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              Map Veto · Completely P2P
            </span>
            <h1 className="mt-3 font-serif text-4xl font-medium leading-[1.1] tracking-tight">
              Run a clean pick-ban,{' '}
              <em className="text-muted-foreground">in real time</em>.
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
              Choose a preset and share links with both teams. Results are saved
              locally and can be exported later.
            </p>
          </div>

          {/* Format selection */}
          <section className="mb-8">
            <div className="mb-4 flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Format
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as 'presets' | 'custom')}
              className="w-full"
            >
              <TabsList
                className="mb-4 grid w-full grid-cols-2"
                role="tablist"
                aria-label="Veto setup method"
              >
                <TabsTrigger value="presets" aria-label="Preset formats">
                  Presets
                </TabsTrigger>
                <TabsTrigger value="custom" aria-label="Custom map pool">
                  Custom
                </TabsTrigger>
              </TabsList>

              <TabsContent value="presets" className="space-y-3">
                {groups.length === 0 && (
                  <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                    Loading presets…
                  </p>
                )}
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-sm font-semibold">{group.name}</h3>
                      <span className="text-[11px] text-muted-foreground">
                        by {group.author}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {group.description}
                    </p>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {group.stages.map((stage) => {
                        const active = selectedPresetId === stage.presetId;
                        return (
                          <button
                            key={stage.presetId}
                            type="button"
                            onClick={() => setSelectedPresetId(stage.presetId)}
                            aria-pressed={active}
                            aria-label={`${group.name} ${FORMAT_LABEL[stage.format] ?? stage.format}`}
                            className={`rounded-md border px-2 py-2 text-sm font-semibold transition-colors ${
                              active
                                ? 'border-accent bg-accent/20 text-foreground ring-1 ring-accent'
                                : 'border-border bg-secondary text-secondary-foreground hover:border-foreground/30'
                            }`}
                          >
                            {FORMAT_LABEL[stage.format] ?? stage.format}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="custom" className="space-y-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <MapSelector selected={customMaps} onChange={setCustomMaps} />
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                    Series length
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Available formats depend on your pool size.
                  </p>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {FORMATS.map((f) => {
                      const min = minMapsForBestOf(bestOfForFormat(f.key));
                      const available = customMaps.length >= min;
                      const active = customFormat === f.key;
                      return (
                        <button
                          key={f.key}
                          type="button"
                          disabled={!available}
                          onClick={() => setCustomFormat(f.key)}
                          aria-pressed={active}
                          aria-label={`Custom ${f.label}`}
                          title={
                            available
                              ? `Plays ${f.plays}`
                              : `Needs at least ${min} maps`
                          }
                          className={`flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            active
                              ? 'border-accent bg-accent/20 text-foreground ring-1 ring-accent'
                              : 'border-border bg-secondary text-secondary-foreground hover:enabled:border-foreground/30'
                          }`}
                        >
                          <span className="text-sm font-semibold">
                            {f.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {available ? f.plays : `${min}+ maps`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </section>

          {/* Create CTA + selection summary */}
          <div className="mb-10 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={createRoom}
              disabled={!canCreate || creating}
              className="inline-flex items-center gap-2 rounded-lg border border-foreground/20 bg-foreground px-6 py-3 text-sm font-semibold text-background transition-all hover:bg-foreground/90 disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              aria-label="Create veto room"
            >
              {creating ? 'Creating…' : 'Create Room'}
              <span className="text-base">→</span>
            </button>
            <span
              className="h-4 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {summary ?? 'Select a format to continue'}
            </span>
          </div>

          {/* Map pool preview — dynamic 3x3 grid based on selected preset */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Map Pool
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  {tab === 'presets' && selectedPreset
                    ? selectedPreset.mapPool.length
                    : tab === 'custom'
                      ? customMaps.length
                      : RANKED_MAP_POOL.length}{' '}
                  maps
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {tab === 'presets' && selectedPreset
                    ? selectedPreset.mapPool.join(', ')
                    : tab === 'custom'
                      ? customMaps.join(', ')
                      : 'Season 3 ranked pool'}
                </span>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-3 gap-2">
                  {MAP_POOL.map((map) => {
                    const isInPool =
                      tab === 'presets' && selectedPreset
                        ? selectedPreset.mapPool.includes(map.id)
                        : tab === 'custom'
                          ? customMaps.includes(map.id)
                          : map.ranked;
                    return (
                      <div
                        key={map.id}
                        className={cn(
                          'relative aspect-[16/10] rounded-lg overflow-hidden border transition-all',
                          isInPool
                            ? 'border-primary/50 opacity-100'
                            : 'border-border opacity-30'
                        )}
                      >
                        <img
                          src={getCachedIntroPath(map.id)}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover brightness-[0.7]"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-2">
                          <span className="text-xs font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                            {map.name}
                          </span>
                        </div>
                        {!isInPool && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span className="text-xs font-medium text-white/70">
                              Not in pool
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
        </main>
      </div>
      <Branding />
    </div>
  );
}
