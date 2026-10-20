import type { FirstActorMode } from '@/types/veto';
import type { VetoStep } from '@/lib/state-machine';
import type { SequencePattern } from '@/lib/preset-rules';

export interface PresetMeta {
  id: string;
  name: string;
  author: string;
  description: string;
  updatedAt: string;
  format: string;
  ruleset: string;
}

export interface VetoPreset extends PresetMeta {
  schemaVersion?: 1;
  sequencePattern?: SequencePattern;
  mapPool: string[];
  firstActorMode: FirstActorMode;
  steps?: VetoStep[];
  pickBanTimerSeconds?: number | null;
  sideTimerSeconds?: number | null;
  timerEnforcement?: 'none' | 'random-after-timeout';
  roomImportCode?: string;
  notes?: string;
}

/** One series length (Bo1/Bo3/...) within a preset group, pointing at a stage file. */
export interface PresetStage {
  format: string;
  presetId: string;
}

/**
 * A tournament's veto ruleset. The group carries the name/author/description; each
 * stage is the same ruleset run at a different series length. Tournament organisers
 * add their ruleset as one group with a stage per best-of they run.
 */
export interface PresetGroup {
  id: string;
  name: string;
  author: string;
  description: string;
  updatedAt: string;
  stages: PresetStage[];
}

export interface PresetIndex {
  version: number;
  groups: PresetGroup[];
}
