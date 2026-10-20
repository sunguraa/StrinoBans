'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Disclosure } from '@/components/ui/disclosure';
import { SequenceBlocks } from '@/components/custom/sequence-blocks';
import { MapSelector } from '@/components/custom/map-selector';
import { PresetLibraryControls } from '@/components/custom/preset-library-controls';
import {
  createTemplateSteps,
  validatePreset,
  type SequencePattern,
} from '@/lib/preset-rules';
import {
  compileSequenceBlocks,
  moveSequenceBlock,
  type SequenceBlock,
} from '@/lib/preset-library';
import type { VetoPreset } from '@/types/preset';
import type { FirstActorMode, Format, Team } from '@/types/veto';
import { DEFAULT_MAP_POOL } from '@/lib/maps';

const DEFAULT_MAPS = DEFAULT_MAP_POOL.map((map) => map.id);
const field =
  'mt-1 min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring';
const opposite = (team: Team): Team => (team === 'a' ? 'b' : 'a');
function blocksFromSteps(
  steps: NonNullable<VetoPreset['steps']>
): SequenceBlock[] {
  let pickIndex = 0;
  return steps
    .filter((step) => step.type !== 'side')
    .map((step, index) => {
      const side =
        step.type === 'pick'
          ? steps.find(
              (item) =>
                item.type === 'side' &&
                !item.forDecider &&
                item.forPickIndex === pickIndex
            )
          : undefined;
      if (step.type === 'pick') pickIndex++;
      return {
        id: `block-${index}`,
        type: step.type as 'ban' | 'pick',
        team: step.team,
        sideTeam: side?.team ?? opposite(step.team),
        ...(step.actor ? { actor: step.actor } : {}),
      };
    });
}

export function PresetBuilder({
  onCreate,
  onError,
  active = true,
}: {
  onCreate: (preset: VetoPreset) => void | Promise<void>;
  onError?: (message: string) => void;
  active?: boolean;
}) {
  const [name, setName] = useState('My custom preset');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [metadata, setMetadata] = useState(() => ({
    id: 'custom-definition',
    author: 'Local builder',
    description: 'Custom veto sequence',
    updatedAt: new Date().toISOString(),
    ruleset: 'custom',
  }));
  const [maps, setMaps] = useState(DEFAULT_MAPS);
  const [format, setFormat] = useState<Format>('bo3');
  const [initiative, setInitiative] = useState<FirstActorMode>('coinflip');
  const [pattern, setPattern] = useState<SequencePattern>('standard');
  const [template, setTemplate] =
    useState<Exclude<SequencePattern, 'manual'>>('standard');
  const [blocks, setBlocks] = useState(() =>
    blocksFromSteps(createTemplateSteps('standard', 'bo3', 7))
  );
  const [deciderChoice, setDeciderChoice] = useState<Team>(
    () =>
      createTemplateSteps('standard', 'bo3', 7).find((step) => step.forDecider)!
        .team
  );
  const [builtFor, setBuiltFor] = useState(`bo3:${DEFAULT_MAPS.join(',')}`);
  const [pickTimer, setPickTimer] = useState('50');
  const [sideTimer, setSideTimer] = useState('35');
  const [enforcement, setEnforcement] = useState<
    'none' | 'random-after-timeout'
  >('none');
  const [gameCode, setGameCode] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [pending, setPending] = useState(false);
  const stale = builtFor !== `${format}:${maps.join(',')}`;
  const deciderTeam: Team =
    initiative === 'upper-bracket-choice' ? 'b' : deciderChoice;
  const steps = useMemo(
    () => compileSequenceBlocks(blocks, deciderTeam),
    [blocks, deciderTeam]
  );
  const draft: VetoPreset = {
    ...metadata,
    name,
    schemaVersion: 1,
    sequencePattern: pattern,
    mapPool: maps,
    format,
    firstActorMode: initiative,
    steps,
    pickBanTimerSeconds: pickTimer === '' ? null : Number(pickTimer),
    sideTimerSeconds: sideTimer === '' ? null : Number(sideTimer),
    timerEnforcement: enforcement,
    ...(gameCode ? { roomImportCode: gameCode } : {}),
    ...(notes ? { notes } : {}),
  };
  const validation = validatePreset(draft);
  const errors = [
    ...(stale
      ? [
          'Pool or series changed. Rebuild a template, or explicitly keep and validate your edited sequence below.',
        ]
      : []),
    ...validation.errors,
  ];
  const validPreset = errors.length === 0 ? validation.preset : null;
  const expectedPicks = Number(format.slice(2)) - 1;
  const picks = blocks.filter((block) => block.type === 'pick').length;
  const bans = blocks.length - picks;
  const gates = (['standard', 'picks-first', 'legacy-split-bans'] as const).map(
    (value) => {
      try {
        createTemplateSteps(value, format, maps.length);
        return { value, reason: '' };
      } catch (cause) {
        return {
          value,
          reason:
            cause instanceof Error
              ? cause.message
              : 'Not available for this pool and series.',
        };
      }
    }
  );
  function report(message: string) {
    setError(message);
    onError?.(message);
  }
  function move(id: string, target: number, announce = true) {
    setBlocks((current) => moveSequenceBlock(current, id, target));
    setPattern('manual');
    if (announce) setAnnouncement(`Moved to position ${target + 1}.`);
  }
  function updateBlock(id: string, changes: Partial<SequenceBlock>) {
    setBlocks((current) =>
      current.map((block) =>
        block.id === id ? { ...block, ...changes } : block
      )
    );
    setPattern('manual');
  }
  function load(preset: VetoPreset) {
    if (
      !window.confirm(
        'Replace the current draft? Unsaved draft edits will be replaced.'
      )
    )
      return false;
    try {
      const source =
        preset.steps ??
        createTemplateSteps(
          preset.sequencePattern ?? 'legacy-split-bans',
          preset.format as Format,
          preset.mapPool.length
        );
      setName(preset.name);
      setMaps([...preset.mapPool]);
      setFormat(preset.format as Format);
      setInitiative(preset.firstActorMode);
      setMetadata({
        id: preset.id,
        author: preset.author,
        description: preset.description,
        updatedAt: preset.updatedAt,
        ruleset: preset.ruleset,
      });
      setBlocks(blocksFromSteps(source));
      setPattern(preset.sequencePattern ?? 'manual');
      setDeciderChoice(source.find((step) => step.forDecider)?.team ?? 'a');
      setBuiltFor(`${preset.format}:${preset.mapPool.join(',')}`);
      setPickTimer(
        preset.pickBanTimerSeconds == null
          ? ''
          : String(preset.pickBanTimerSeconds)
      );
      setSideTimer(
        preset.sideTimerSeconds == null ? '' : String(preset.sideTimerSeconds)
      );
      setEnforcement(preset.timerEnforcement ?? 'none');
      setGameCode(preset.roomImportCode ?? '');
      setNotes(preset.notes ?? '');
      setError('');
      setAnnouncement('Preset loaded into the draft.');
      return true;
    } catch {
      report(
        'This preset cannot be rebuilt here. Check its explicit sequence and format before importing again.'
      );
      return false;
    }
  }
  return (
    <div className="min-w-0 space-y-6">
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          Custom Presets &amp; Rulesets
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Choose maps and a series, then create a room directly. Saving a
          reusable preset is optional.
        </p>
      </div>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <label className="min-w-0 text-sm font-medium">
              Preset name
              <input
                className={field}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="text-sm font-medium">
              Series
              <Select
                value={format}
                onValueChange={(value) => setFormat(value as Format)}
              >
                <SelectTrigger className="mt-1" aria-label="Series" />
                <SelectContent>
                  {(['bo1', 'bo3', 'bo5', 'bo7'] as const).map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <section
            aria-label="Map pool"
            className="space-y-3 rounded-lg border border-border bg-card p-4"
          >
            <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              Map Pool
            </h3>
            <MapSelector selected={maps} onChange={setMaps} />
          </section>
          <section
            className="space-y-3 rounded-lg border border-border bg-card p-4"
            aria-label="Sequence template"
          >
            <label className="block text-sm font-medium">
              Starting template
              <Select
                value={template}
                onValueChange={(value) => setTemplate(value as typeof template)}
              >
                <SelectTrigger
                  className="mt-1"
                  aria-label="Starting template"
                />
                <SelectContent>
                  {gates.map(({ value, reason }) => (
                    <SelectItem key={value} value={value} disabled={!!reason}>
                      {value === 'standard'
                        ? 'Standard'
                        : value === 'picks-first'
                          ? 'Picks first'
                          : 'Legacy split bans'}
                      {reason ? ' — unavailable' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {gates
              .filter((gate) => gate.reason)
              .map((gate) => (
                <p key={gate.value} className="text-sm text-muted-foreground">
                  {gate.value === 'standard'
                    ? 'Standard'
                    : gate.value === 'picks-first'
                      ? 'Picks first'
                      : 'Legacy split bans'}
                  : {gate.reason}
                </p>
              ))}
            {format === 'bo7' && maps.length === 7 && (
              <p className="text-sm text-muted-foreground">
                With seven maps in BO7, all available templates have the same
                sequence.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={
                !!gates.find((gate) => gate.value === template)?.reason ||
                initiative === 'upper-bracket-choice'
              }
              onClick={() => {
                if (
                  !window.confirm(
                    'Rebuild the sequence from this template? This replaces your sequence edits.'
                  )
                )
                  return;
                try {
                  const source = createTemplateSteps(
                    template,
                    format,
                    maps.length
                  );
                  setBlocks(blocksFromSteps(source));
                  setDeciderChoice(
                    source.find((step) => step.forDecider)!.team
                  );
                  setPattern(template);
                  setBuiltFor(`${format}:${maps.join(',')}`);
                  setError('');
                  setAnnouncement('Sequence rebuilt.');
                } catch {
                  report(
                    'This template is not available for the selected pool and series. Choose a different template or edit the sequence manually.'
                  );
                }
              }}
            >
              Rebuild from template
            </Button>
            {stale && (
              <div
                role="alert"
                className="space-y-2 rounded-md border border-destructive p-3 text-sm"
              >
                <p>
                  Your sequence is stale. Your edits have been kept. Rebuild
                  above, or keep them and check the validation errors.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setBuiltFor(`${format}:${maps.join(',')}`);
                    setPattern('manual');
                  }}
                >
                  Keep sequence and validate
                </Button>
              </div>
            )}
          </section>
        </div>
        <div className="min-w-0 space-y-6">
          <Disclosure
            title="Advanced Settings"
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
          >
            <div className="mt-4 space-y-5">
              <label className="block text-sm font-medium">
                Who decides the starter?
                <Select
                  value={initiative}
                  onValueChange={(value) =>
                    setInitiative(value as FirstActorMode)
                  }
                >
                  <SelectTrigger
                    className="mt-1"
                    aria-label="Who decides the starter?"
                  />
                  <SelectContent>
                    <SelectItem value="coinflip">
                      Coin flip winner chooses first or second
                    </SelectItem>
                    <SelectItem value="team-a-choice">
                      Team A chooses first or second
                    </SelectItem>
                    <SelectItem value="random">Random starter</SelectItem>
                    <SelectItem value="team-a">Team A always starts</SelectItem>
                    {initiative === 'upper-bracket-choice' && (
                      <SelectItem value="upper-bracket-choice">
                        Team A chooses (grand final)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Pick / ban timer (seconds; blank = Default (50s))
                  <input
                    className={field}
                    type="number"
                    min={30}
                    max={3600}
                    step={1}
                    value={pickTimer}
                    placeholder="Default (50s)"
                    onChange={(event) => setPickTimer(event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Side timer (seconds; blank = Default (35s))
                  <input
                    className={field}
                    type="number"
                    min={20}
                    max={3600}
                    step={1}
                    value={sideTimer}
                    placeholder="Default (35s)"
                    onChange={(event) => setSideTimer(event.target.value)}
                  />
                </label>
              </div>
              <label className="block text-sm">
                On timeout
                <Select
                  value={enforcement}
                  onValueChange={(value) =>
                    setEnforcement(value as typeof enforcement)
                  }
                >
                  <SelectTrigger className="mt-1" aria-label="On timeout" />
                  <SelectContent>
                    <SelectItem value="none">
                      Advisory timer — no automatic action
                    </SelectItem>
                    <SelectItem value="random-after-timeout">
                      Random legal action after timeout
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="block text-sm">
                Preset Room Code
                <input
                  className={field}
                  value={gameCode}
                  onChange={(event) => setGameCode(event.target.value)}
                  maxLength={128}
                  placeholder="Optional game code"
                />
              </label>
              <label className="block text-sm">
                Notes
                <textarea
                  className={field}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={4000}
                />
              </label>
              <section aria-label="Edit sequence" className="space-y-3">
                <h3 className="text-sm font-semibold">Sequence blocks</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Team 1 acts first; Team 2 acts second. Either can be room Team
                  A or B. Drag the grip to reorder, or use the move buttons.
                </p>
                <SequenceBlocks
                  enabled={active && advancedOpen}
                  blocks={blocks}
                  onMove={move}
                  onUpdate={updateBlock}
                  onRemove={(id) => {
                    setBlocks((current) =>
                      current.filter((block) => block.id !== id)
                    );
                    setPattern('manual');
                    setAnnouncement('Block removed.');
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  {(['ban', 'pick'] as const).map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const team = blocks.length
                          ? opposite(blocks[blocks.length - 1].team)
                          : 'a';
                        setBlocks((current) => [
                          ...current,
                          {
                            id: crypto.randomUUID(),
                            type,
                            team,
                            sideTeam: opposite(team),
                          },
                        ]);
                        setPattern('manual');
                      }}
                    >
                      Add {type === 'pick' ? 'pick + side' : 'ban'}
                    </Button>
                  ))}
                </div>
                <div className="rounded-md bg-muted p-3 text-sm">
                  <p>
                    Final decider — the map left over. This block stays last.
                  </p>
                  <label className="mt-2 block">
                    Who chooses Side?
                    <Select
                      value={deciderTeam}
                      disabled={initiative === 'upper-bracket-choice'}
                      onValueChange={(value) => {
                        setDeciderChoice(value as Team);
                        setPattern('manual');
                      }}
                    >
                      <SelectTrigger
                        className="mt-1"
                        aria-label="Decider: Who chooses Side?"
                      />
                      <SelectContent>
                        <SelectItem value="a">Team 1</SelectItem>
                        <SelectItem value="b">Team 2</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              </section>
            </div>
          </Disclosure>
          <section
            aria-label="Live sequence preview"
            className="space-y-3 rounded-lg border border-border bg-card p-4"
          >
            <h3 className="text-sm font-semibold">
              Example sequence when Team A goes first
            </h3>
            <p className="text-sm">
              {maps.length} maps · {bans}/
              {Math.max(0, maps.length - Number(format.slice(2)))} bans ·{' '}
              {picks}/{expectedPicks} picks · {picks} immediate side choices · 1
              final decider
            </p>
            <ol className="list-inside list-decimal space-y-1 text-sm">
              {steps.map((step, index) => (
                <li key={index} className="break-words">
                  Team {(step.actor ? 'a' : step.team).toUpperCase()}{' '}
                  {step.type === 'ban'
                    ? 'bans'
                    : step.type === 'pick'
                      ? 'picks'
                      : 'chooses side'}
                  {step.forDecider
                    ? ' — final decider'
                    : step.forPickIndex !== undefined
                      ? ` — map ${step.forPickIndex + 1}`
                      : ''}
                </li>
              ))}
            </ol>
          </section>
          {errors.length > 0 && (
            <section
              aria-label="Draft validation"
              className="rounded-md border border-destructive p-3"
            >
              <h3 className="font-medium">Fix before saving or creating</h3>
              <ul className="list-inside list-disc text-sm">
                {errors.map((message, index) => (
                  <li key={index} className="break-words">
                    {message}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <PresetLibraryControls
            preset={validPreset}
            onLoad={load}
            onError={report}
          />
          {error && (
            <p role="alert" className="break-words text-sm text-destructive">
              {error}
            </p>
          )}
          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>
          <Button
            type="button"
            size="lg"
            className="min-h-11 w-full sm:w-auto"
            disabled={!validPreset || pending}
            onClick={async () => {
              if (!validPreset || pending) return;
              setPending(true);
              setError('');
              try {
                await onCreate(structuredClone(validPreset));
              } catch {
                report(
                  'Could not create the room. Your draft is still here. Check browser storage and connection, then try again.'
                );
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? 'Creating room…' : 'Create room from this draft'}
          </Button>
        </div>
      </div>
    </div>
  );
}
