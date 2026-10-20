import type { PresetIndex, VetoPreset } from '@/types/preset';
import { withBasePath } from '@/lib/base-path';
import { validatePreset } from '@/lib/preset-rules';

const PRESETS_BASE_URL = withBasePath('/presets');

let cachedIndex: PresetIndex | null = null;

export async function fetchPresetIndex(): Promise<PresetIndex> {
  if (cachedIndex) return cachedIndex;
  const res = await fetch(`${PRESETS_BASE_URL}/index.json`);
  if (!res.ok) throw new Error('Failed to fetch preset index');
  const value: unknown = await res.json();
  if (
    !value ||
    typeof value !== 'object' ||
    !('groups' in value) ||
    !('version' in value) ||
    !Number.isInteger(value.version) ||
    !Array.isArray(value.groups) ||
    value.groups.length > 32
  ) {
    throw new Error('Invalid preset index');
  }
  const groups: PresetIndex['groups'] = [];
  const ids = new Set<string>();
  for (const entry of value.groups) {
    if (!entry || typeof entry !== 'object')
      throw new Error('Invalid preset group');
    const group = entry as Record<string, unknown>;
    for (const key of ['id', 'name', 'author', 'description', 'updatedAt']) {
      if (
        typeof group[key] !== 'string' ||
        (group[key] as string).length > 2000
      ) {
        throw new Error('Invalid preset group metadata');
      }
    }
    if (
      !/^[a-zA-Z0-9_-]{1,100}$/.test(group.id as string) ||
      ids.has(group.id as string) ||
      !Array.isArray(group.stages) ||
      group.stages.length < 1 ||
      group.stages.length > 4
    ) {
      throw new Error('Invalid preset group stages');
    }
    ids.add(group.id as string);
    const stages = group.stages.map((stage: unknown) => {
      if (!stage || typeof stage !== 'object')
        throw new Error('Invalid preset stage');
      const item = stage as Record<string, unknown>;
      if (
        !['bo1', 'bo3', 'bo5', 'bo7'].includes(item.format as string) ||
        typeof item.presetId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(item.presetId)
      ) {
        throw new Error('Invalid preset stage');
      }
      return { format: item.format as string, presetId: item.presetId };
    });
    groups.push({
      id: group.id as string,
      name: group.name as string,
      author: group.author as string,
      description: group.description as string,
      updatedAt: group.updatedAt as string,
      stages,
    });
  }
  cachedIndex = { version: value.version as number, groups };
  return cachedIndex;
}

export async function fetchPreset(id: string): Promise<VetoPreset> {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid preset id');
  const res = await fetch(`${PRESETS_BASE_URL}/${id}.json`);
  if (!res.ok) throw new Error(`Failed to fetch preset ${id}`);
  const result = validatePreset(await res.json());
  if (!result.preset)
    throw new Error(`Invalid preset ${id}: ${result.errors.join('; ')}`);
  if (result.preset.id !== id)
    throw new Error('Preset id does not match requested file');
  return result.preset;
}
