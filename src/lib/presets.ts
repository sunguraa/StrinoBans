import type { PresetIndex, VetoPreset } from '@/types/preset';
import { withBasePath } from '@/lib/base-path';

const PRESETS_BASE_URL = withBasePath('/presets');

let cachedIndex: PresetIndex | null = null;

export async function fetchPresetIndex(): Promise<PresetIndex> {
  if (cachedIndex) return cachedIndex;
  const res = await fetch(`${PRESETS_BASE_URL}/index.json`);
  if (!res.ok) throw new Error('Failed to fetch preset index');
  cachedIndex = (await res.json()) as PresetIndex;
  return cachedIndex;
}

export async function fetchPreset(id: string): Promise<VetoPreset> {
  const res = await fetch(`${PRESETS_BASE_URL}/${id}.json`);
  if (!res.ok) throw new Error(`Failed to fetch preset ${id}`);
  return (await res.json()) as VetoPreset;
}