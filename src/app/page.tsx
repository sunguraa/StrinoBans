'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Disclosure } from '@/components/ui/disclosure';
import { ChevronDown } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Branding } from '@/components/layout/branding';
import { HistorySidebar } from '@/components/veto/history-sidebar';
import { PresetBuilder } from '@/components/custom/preset-builder';
import { fetchPresetIndex, fetchPreset } from '@/lib/presets';
import type { PresetGroup, VetoPreset } from '@/types/preset';
import type { FirstActorMode, Format, Team } from '@/types/veto';
import { getFormatSteps } from '@/lib/state-machine';
import { validatePreset, createTemplateSteps } from '@/lib/preset-rules';
import { generateToken } from '@/lib/token';
import { saveSessionConfig } from '@/lib/storage';
import { getTeamHref } from '@/lib/routes';
import { withBasePath } from '@/lib/base-path';
import { MAP_POOL, DEFAULT_MAP_POOL } from '@/lib/maps';
import { getCachedIntroPath } from '@/lib/wiki/cache';
import { cn } from '@/lib/utils';

const POLICY_LABELS: Record<string, string> = {
  coinflip: 'Coin flip — winner chooses who starts',
  'team-a-choice': 'Seeded — Team A chooses who starts',
  'team-a': 'Fixed — Team A starts',
  random: 'Legacy random — coin winner starts',
  'upper-bracket-choice': 'Upper-bracket finalist chooses its veto position',
};

const FORMAT_LABEL: Record<string, string> = {
  bo1: 'Bo1',
  bo3: 'Bo3',
  bo5: 'Bo5',
  bo7: 'Bo7',
};

export default function HomePage() {
  const [groups, setGroups] = useState<PresetGroup[]>([]);
  const [tab, setTab] = useState('presets');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(
    'default'
  );
  const [selected, setSelected] = useState<VetoPreset | null>(null);
  const [policy, setPolicy] = useState<FirstActorMode>('coinflip');
  const [previewStarter, setPreviewStarter] = useState<Team>('a');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchPresetIndex()
      .then((index) => {
        if (active) setGroups(index.groups);
      })
      .catch(() => {
        if (active)
          setError('Could not load the preset catalog. Reload to retry.');
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (selectedId === null) return;
    let active = true;
    fetchPreset(selectedId)
      .then((preset) => {
        if (active) {
          setSelected(preset);
          setError(null);
        }
      })
      .catch(() => {
        if (active) {
          setSelected(null);
          setError(
            'Could not load these rules. Choose another format or reload.'
          );
        }
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const preset = useMemo(
    () =>
      selected && selected.id === selectedId
        ? {
            ...selected,
            firstActorMode:
              selected.firstActorMode === 'upper-bracket-choice'
                ? selected.firstActorMode
                : policy,
          }
        : null,
    [selected, selectedId, policy]
  );
  const isFinal = preset?.firstActorMode === 'upper-bracket-choice';
  const pool = preset
    ? MAP_POOL.filter((map) => preset.mapPool.includes(map.id))
    : DEFAULT_MAP_POOL;
  const steps = preset
    ? getFormatSteps(
        preset.format as Format,
        preset.mapPool.length,
        previewStarter,
        preset.steps
      )
    : [];

  const createRoom = async (draft: VetoPreset) => {
    setError(null);
    setCreating(true);
    try {
      const result = validatePreset(draft);
      if (!result.preset) throw new Error(result.errors.join(' '));
      const valid = result.preset;
      const frozen: VetoPreset = {
        ...valid,
        schemaVersion: 1,
        steps:
          valid.steps ??
          createTemplateSteps(
            valid.sequencePattern ?? 'legacy-split-bans',
            valid.format as Format,
            valid.mapPool.length
          ),
      };
      const sessionId = generateToken();
      const teamAToken = generateToken();
      const teamBToken = generateToken();
      saveSessionConfig(sessionId, {
        teamAToken,
        teamBToken,
        presetId: frozen.id,
        presetName: frozen.name,
        presetSnapshot: frozen,
        firstActorMode: frozen.firstActorMode,
      });
      // A fresh document reliably initializes discovery; do not replace this with router.push.
      window.location.href = withBasePath(getTeamHref(sessionId, teamAToken));
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Could not create this room. Retry without closing your draft.';
      setError(message);
      setCreating(false);
      throw new Error(message);
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <HistorySidebar />
        <main className="relative min-w-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              'mx-auto w-full px-6 py-16 pb-28 sm:pb-16',
              tab === 'custom' ? 'max-w-[1200px]' : 'max-w-4xl'
            )}
          >
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
                Choose a preset and share links with both teams. Results are
                saved locally and can be exported later.
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
              <Tabs value={tab} onValueChange={setTab} className="w-full">
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
                {error && (
                  <p
                    role="alert"
                    className="mb-4 rounded-md border border-destructive p-3 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}
                <TabsContent value="presets" className="space-y-3">
                  {groups.length === 0 && !error && (
                    <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                      Loading presets…
                    </p>
                  )}
                  {groups.map((group) => {
                    const expanded = expandedGroupId === group.id;
                    const selectedStage = group.stages.find(
                      (stage) => stage.presetId === selectedId
                    );
                    return (
                      <div
                        key={group.id}
                        className="overflow-clip rounded-lg border border-border bg-card"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedGroupId(expanded ? null : group.id)
                          }
                          aria-expanded={expanded}
                          aria-controls={`formats-${group.id}`}
                          aria-label={`${group.name} formats`}
                          className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <h3 className="text-sm font-semibold">
                                {group.name}
                              </h3>
                              <span className="text-[11px] text-muted-foreground">
                                by {group.author}
                              </span>
                            </div>
                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                              {group.id === 'default'
                                ? `${DEFAULT_MAP_POOL.length}-map Default pool. ${POLICY_LABELS[policy]}. ${group.description}`
                                : group.description}
                            </p>
                            {selectedStage && !expanded && (
                              <span className="mt-2 inline-block rounded-md border border-accent bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                                {FORMAT_LABEL[selectedStage.format] ??
                                  selectedStage.format}{' '}
                                selected
                              </span>
                            )}
                          </div>
                          <ChevronDown
                            aria-hidden="true"
                            className={cn(
                              'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                              expanded && 'rotate-180'
                            )}
                          />
                        </button>
                        <div
                          className={cn(
                            'grid transition-[grid-template-rows] duration-200 ease-out',
                            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                          )}
                        >
                          <div
                            id={`formats-${group.id}`}
                            inert={!expanded}
                            className="min-h-0 min-w-0 overflow-clip"
                          >
                            <div className="grid grid-cols-4 gap-2 px-4 pb-4">
                              {group.stages.map((stage) => (
                                <button
                                  key={stage.presetId}
                                  type="button"
                                  onClick={() => setSelectedId(stage.presetId)}
                                  aria-pressed={selectedId === stage.presetId}
                                  aria-label={`${group.name} ${FORMAT_LABEL[stage.format] ?? stage.format}`}
                                  className={cn(
                                    'min-h-11 rounded-md border px-2 py-2 text-sm font-semibold transition-colors',
                                    selectedId === stage.presetId
                                      ? 'border-accent bg-accent/20 text-foreground ring-1 ring-accent'
                                      : 'border-border bg-secondary text-secondary-foreground hover:border-foreground/30'
                                  )}
                                >
                                  {FORMAT_LABEL[stage.format] ?? stage.format}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {preset && !isFinal && (
                    <Disclosure title="Advanced Settings">
                      <label className="block text-sm">
                        Who starts the veto?
                        <Select
                          value={policy}
                          onValueChange={(value) =>
                            setPolicy(value as FirstActorMode)
                          }
                        >
                          <SelectTrigger
                            className="mt-2"
                            aria-label="First actor policy"
                          />
                          <SelectContent>
                            {(
                              ['coinflip', 'team-a-choice', 'team-a'] as const
                            ).map((mode) => (
                              <SelectItem key={mode} value={mode}>
                                {POLICY_LABELS[mode]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Both teams must be ready. Starting the veto does not
                        necessarily mean picking the first map.
                      </p>
                    </Disclosure>
                  )}
                </TabsContent>
                <TabsContent
                  value="custom"
                  forceMount
                  hidden={tab !== 'custom'}
                  className="data-[state=inactive]:hidden"
                >
                  <PresetBuilder
                    active={tab === 'custom'}
                    onCreate={createRoom}
                    onError={setError}
                  />
                </TabsContent>
              </Tabs>
            </section>

            {tab === 'presets' && (
              <>
                {/* Create CTA + selection summary */}
                <div className="mb-10 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (preset)
                        void createRoom(preset).catch(() => undefined);
                    }}
                    disabled={!preset || creating}
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
                    {preset ? preset.name : 'Select a format to continue'}
                  </span>
                </div>

                {/* Map pool preview */}
                <section>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      Map Pool
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {pool.length} maps
                      </span>
                      <span className="max-w-full text-[11px] text-muted-foreground">
                        {preset ? preset.mapPool.join(', ') : 'Default pool'}
                      </span>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {MAP_POOL.map((map) => {
                          const isInPool = preset
                            ? preset.mapPool.includes(map.id)
                            : map.inDefaultPool;
                          return (
                            <div
                              key={map.id}
                              className={cn(
                                'relative aspect-[16/10] overflow-hidden rounded-lg border transition-all',
                                isInPool
                                  ? 'border-primary/50 opacity-100'
                                  : 'border-border opacity-30'
                              )}
                            >
                              <img
                                src={getCachedIntroPath(map.id)}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover brightness-[0.7]"
                                onError={(event) => {
                                  event.currentTarget.style.visibility =
                                    'hidden';
                                }}
                              />
                              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                              <div className="absolute inset-x-0 bottom-0 p-2">
                                <span className="text-xs font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                                  {map.name}
                                </span>
                              </div>
                              {!isInPool && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
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
                {preset && (
                  <details className="mt-4 rounded-lg border border-border bg-card p-4">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      Exact sequence preview
                    </summary>
                    <label className="mt-4 block text-sm">
                      {isFinal ? 'Preview first pick' : 'Preview starter'}
                      <select
                        value={previewStarter}
                        onChange={(event) =>
                          setPreviewStarter(event.target.value as Team)
                        }
                        className="mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3"
                      >
                        <option value="a">
                          Team A {isFinal ? 'picks first' : 'starts'}
                        </option>
                        <option value="b">
                          Team B {isFinal ? 'picks first' : 'starts'}
                        </option>
                      </select>
                    </label>
                    <ol className="mt-3 list-inside list-decimal space-y-1 text-sm">
                      {steps.map((step, index) => (
                        <li key={index}>
                          Team {step.team.toUpperCase()}{' '}
                          {step.type === 'side'
                            ? `chooses own side (${step.forDecider ? 'decider' : `pick ${(step.forPickIndex ?? 0) + 1}`})`
                            : step.type}
                        </li>
                      ))}
                    </ol>
                    {preset.format === 'bo7' && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        With seven maps, Standard and Picks first BO7 are
                        identical: six picks and one decider.
                      </p>
                    )}
                  </details>
                )}
              </>
            )}
          </div>
        </main>
      </div>
      <Branding />
    </div>
  );
}
