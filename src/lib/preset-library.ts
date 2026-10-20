import type { VetoPreset } from '@/types/preset';
import type { Format, Team } from '@/types/veto';
import { createTemplateSteps, validatePreset } from '@/lib/preset-rules';

export const PRESET_LIBRARY_KEY = 'strinobans_preset_library_v1';
export const MAX_PRESET_JSON_BYTES = 64 * 1024;
const MAX_LIBRARY_BYTES = 1024 * 1024;
export interface LibraryEntry {
  id: string;
  createdAt: string;
  updatedAt: string;
  preset: VetoPreset;
}
export interface PresetLibrary {
  version: 1;
  revision: number;
  entries: LibraryEntry[];
}
export interface LibrarySnapshot {
  raw: string | null;
  library: PresetLibrary;
  error: string | null;
}
export type LibraryStorage = Pick<Storage, 'getItem' | 'setItem'>;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** Export an allowlisted definition, never room/session or library metadata. */
export function presetDefinition(preset: VetoPreset): VetoPreset {
  return {
    id: preset.id,
    name: preset.name,
    author: preset.author,
    description: preset.description,
    updatedAt: preset.updatedAt,
    format: preset.format,
    ruleset: preset.ruleset,
    schemaVersion: preset.schemaVersion,
    sequencePattern: preset.sequencePattern,
    mapPool: [...preset.mapPool],
    firstActorMode: preset.firstActorMode,
    steps: preset.steps?.map((step) => ({
      team: step.team,
      type: step.type,
      ...(step.actor ? { actor: step.actor } : {}),
      ...(step.forPickIndex !== undefined
        ? { forPickIndex: step.forPickIndex }
        : {}),
      ...(step.forDecider ? { forDecider: true } : {}),
    })),
    pickBanTimerSeconds: preset.pickBanTimerSeconds,
    sideTimerSeconds: preset.sideTimerSeconds,
    timerEnforcement: preset.timerEnforcement,
    roomImportCode: preset.roomImportCode,
    notes: preset.notes,
  };
}

export function importPresetJson(text: string): VetoPreset {
  if (byteLength(text) > MAX_PRESET_JSON_BYTES)
    throw new Error('Preset JSON is too large (maximum 64 KB).');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      'This is not valid JSON. Choose a preset definition JSON file.'
    );
  }
  const result = validatePreset(value);
  if (!result.preset) throw new Error(result.errors.join(' '));
  const preset = presetDefinition(result.preset);
  if (!preset.steps) {
    preset.steps = createTemplateSteps(
      preset.sequencePattern ?? 'legacy-split-bans',
      preset.format as Format,
      preset.mapPool.length
    );
    preset.sequencePattern = preset.sequencePattern ?? 'legacy-split-bans';
    preset.schemaVersion = 1;
  }
  return preset;
}

export function exportPresetJson(preset: VetoPreset): string {
  const result = validatePreset(preset);
  if (!result.preset) throw new Error(result.errors.join(' '));
  return JSON.stringify(presetDefinition(result.preset), null, 2);
}

export function readPresetLibrary(storage: LibraryStorage): LibrarySnapshot {
  let raw: string | null = null;
  try {
    raw = storage.getItem(PRESET_LIBRARY_KEY);
    if (raw === null)
      return {
        raw,
        library: { version: 1, revision: 0, entries: [] },
        error: null,
      };
    if (byteLength(raw) > MAX_LIBRARY_BYTES)
      throw new Error('Library exceeds the supported size.');
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1)
      throw new Error('Unsupported library version.');
    if (
      !Number.isSafeInteger(value.revision) ||
      (value.revision as number) < 0 ||
      !Array.isArray(value.entries)
    )
      throw new Error('Malformed library.');
    const ids = new Set<string>();
    const entries = value.entries.map((entry: unknown): LibraryEntry => {
      if (
        !record(entry) ||
        typeof entry.id !== 'string' ||
        !entry.id ||
        ids.has(entry.id) ||
        typeof entry.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(entry.createdAt)) ||
        typeof entry.updatedAt !== 'string' ||
        !Number.isFinite(Date.parse(entry.updatedAt))
      )
        throw new Error('Malformed library entry.');
      ids.add(entry.id);
      const result = validatePreset(entry.preset);
      if (!result.preset) throw new Error('Invalid preset in library.');
      return {
        id: entry.id,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        preset: presetDefinition(result.preset),
      };
    });
    return {
      raw,
      library: { version: 1, revision: value.revision as number, entries },
      error: null,
    };
  } catch (error) {
    return {
      raw,
      library: { version: 1, revision: 0, entries: [] },
      error: `${error instanceof SyntaxError ? 'Library JSON is malformed.' : error instanceof Error ? error.message : 'Browser storage is unavailable.'} Stored data was not changed. Your draft is safe; export it as JSON.`,
    };
  }
}

export type LibraryChange =
  | { type: 'save'; preset: VetoPreset; id: string; overwrite?: boolean }
  | { type: 'rename'; id: string; name: string }
  | { type: 'duplicate'; id: string; newId: string; name: string }
  | { type: 'delete'; id: string };

/** Synchronous read/compare/write prevents stale tabs overwriting newer revisions. */
export function changePresetLibrary(
  storage: LibraryStorage,
  snapshot: LibrarySnapshot,
  change: LibraryChange
): LibrarySnapshot {
  if (snapshot.error)
    throw new Error(
      'Library is read-only until its stored data can be read. Export your draft to keep it.'
    );
  let current: string | null;
  try {
    current = storage.getItem(PRESET_LIBRARY_KEY);
  } catch {
    throw new Error(
      'Browser storage is unavailable. Your draft has not changed. Export JSON instead.'
    );
  }
  if (current !== snapshot.raw)
    throw new Error(
      'The library changed in another tab. Refresh library, then choose Save as new or explicitly overwrite. Your draft is unchanged.'
    );
  const entries = snapshot.library.entries.map((entry) => ({ ...entry }));
  const now = new Date().toISOString();
  const index = entries.findIndex((entry) => entry.id === change.id);
  if (change.type === 'delete') {
    if (index < 0)
      throw new Error('That preset no longer exists. Refresh library.');
    entries.splice(index, 1);
  } else {
    let preset: VetoPreset;
    let id: string;
    if (change.type === 'save') {
      if (index >= 0 && !change.overwrite)
        throw new Error(
          'This preset already exists. Choose Overwrite selected or Save as new.'
        );
      preset = { ...presetDefinition(change.preset), updatedAt: now };
      id = change.id;
    } else {
      if (index < 0)
        throw new Error('That preset no longer exists. Refresh library.');
      preset = {
        ...entries[index].preset,
        name: change.name.trim(),
        updatedAt: now,
      };
      id = change.type === 'duplicate' ? change.newId : change.id;
      if (
        change.type === 'duplicate' &&
        entries.some((entry) => entry.id === id)
      )
        throw new Error('That ID is already in use. Try Duplicate again.');
    }
    const result = validatePreset(preset);
    if (!result.preset) throw new Error(result.errors.join(' '));
    if (
      entries.some(
        (entry) =>
          entry.id !== id &&
          entry.preset.name.trim().toLocaleLowerCase() ===
            preset.name.trim().toLocaleLowerCase()
      )
    )
      throw new Error(
        'A preset with this name already exists. Use a different name or load it and explicitly overwrite.'
      );
    const existing = entries.findIndex((entry) => entry.id === id);
    const entry = {
      id,
      createdAt: existing >= 0 ? entries[existing].createdAt : now,
      updatedAt: now,
      preset: presetDefinition(result.preset),
    };
    if (existing >= 0) entries[existing] = entry;
    else entries.push(entry);
  }
  const library: PresetLibrary = {
    version: 1,
    revision: snapshot.library.revision + 1,
    entries,
  };
  const raw = JSON.stringify(library);
  if (byteLength(raw) > MAX_LIBRARY_BYTES)
    throw new Error(
      'Library is full. Export a backup and remove unneeded presets. Your draft is unchanged.'
    );
  try {
    storage.setItem(PRESET_LIBRARY_KEY, raw);
  } catch {
    throw new Error(
      'Could not save: browser storage is full or disabled. Your draft is unchanged. Export JSON instead.'
    );
  }
  return { raw, library, error: null };
}

export interface SequenceBlock {
  id: string;
  type: 'ban' | 'pick';
  team: Team;
  sideTeam: Team;
  actor?: 'upper-bracket';
}
export function moveSequenceBlock(
  blocks: SequenceBlock[],
  id: string,
  target: number
): SequenceBlock[] {
  const index = blocks.findIndex((block) => block.id === id);
  if (index < 0 || target < 0 || target >= blocks.length || index === target)
    return blocks;
  const result = [...blocks];
  const [block] = result.splice(index, 1);
  result.splice(target, 0, block);
  return result;
}
export function compileSequenceBlocks(
  blocks: SequenceBlock[],
  deciderTeam: Team
): NonNullable<VetoPreset['steps']> {
  let pickIndex = 0;
  const steps: NonNullable<VetoPreset['steps']> = [];
  for (const block of blocks) {
    steps.push({
      type: block.type,
      team: block.team,
      ...(block.actor ? { actor: block.actor } : {}),
    });
    if (block.type === 'pick')
      steps.push({
        type: 'side',
        team: block.sideTeam,
        forPickIndex: pickIndex++,
      });
  }
  steps.push({ type: 'side', team: deciderTeam, forDecider: true });
  return steps;
}
