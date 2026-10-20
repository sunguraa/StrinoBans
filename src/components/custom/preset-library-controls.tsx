'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Disclosure } from '@/components/ui/disclosure';
import type { VetoPreset } from '@/types/preset';
import {
  changePresetLibrary,
  exportPresetJson,
  importPresetJson,
  MAX_PRESET_JSON_BYTES,
  PRESET_LIBRARY_KEY,
  readPresetLibrary,
  type LibraryChange,
  type LibrarySnapshot,
} from '@/lib/preset-library';

function download(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' })
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function subscribeToLibrary(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}
function readLibraryRaw() {
  try {
    return window.localStorage.getItem(PRESET_LIBRARY_KEY);
  } catch {
    return 'storage-unavailable';
  }
}
const serverLibraryRaw = () => null;

export function PresetLibraryControls({
  preset,
  onLoad,
  onError,
}: {
  preset: VetoPreset | null;
  onLoad: (preset: VetoPreset) => boolean;
  onError: (message: string) => void;
}) {
  const raw = useSyncExternalStore(
    subscribeToLibrary,
    readLibraryRaw,
    serverLibraryRaw
  );
  const externalSnapshot = useMemo<LibrarySnapshot>(() => {
    if (raw === null)
      return {
        raw: null,
        library: { version: 1, revision: 0, entries: [] },
        error: null,
      };
    try {
      return readPresetLibrary(window.localStorage);
    } catch {
      return {
        raw: null,
        library: { version: 1, revision: 0, entries: [] },
        error:
          'Browser storage is unavailable. Your draft can still be exported.',
      };
    }
  }, [raw]);
  const [updatedSnapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const snapshot = updatedSnapshot ?? externalSnapshot;
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [rename, setRename] = useState('');
  const [preview, setPreview] = useState<VetoPreset | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const entry = snapshot?.library.entries.find((item) => item.id === selected);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === PRESET_LIBRARY_KEY || event.key === null)
        setMessage(
          'Library changed in another tab. Refresh library before saving; your draft is unchanged.'
        );
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  function refresh() {
    try {
      setSnapshot(readPresetLibrary(window.localStorage));
      setMessage('Library refreshed. Your draft is unchanged.');
    } catch {
      setMessage('Browser storage is unavailable. Export your draft instead.');
    }
  }
  async function change(value: LibraryChange, success: string) {
    if (!snapshot) return;
    try {
      if (!navigator.locks)
        throw new Error(
          'Safe cross-tab saving is unavailable in this browser. Use a current browser on HTTPS, or export JSON to keep your draft.'
        );
      const updated = await navigator.locks.request(PRESET_LIBRARY_KEY, () =>
        changePresetLibrary(window.localStorage, snapshot, value)
      );
      setSnapshot(updated);
      if (value.type === 'save') setSelected(value.id);
      if (value.type === 'duplicate') setSelected(value.newId);
      if (value.type === 'delete') setSelected('');
      setMessage(success);
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : 'Could not update library. Your draft is unchanged.';
      setMessage(text);
      onError(text);
    }
  }
  return (
    <Disclosure title="Browser preset library & JSON backup">
      <div className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Saved on this browser/device only. Clearing site data removes this
          library. Export JSON for backup; exporting does not create or share a
          room.
        </p>
        {snapshot?.error && (
          <p role="alert" className="text-sm text-destructive">
            {snapshot.error}
          </p>
        )}
        <label className="block text-sm">
          Saved preset
          <Select
            value={selected}
            onValueChange={(value) => {
              setSnapshot(snapshot);
              setSelected(value);
              setRename(
                snapshot?.library.entries.find((item) => item.id === value)
                  ?.preset.name ?? ''
              );
            }}
          >
            <SelectTrigger
              className="mt-1"
              aria-label="Saved preset"
              placeholder="Choose a saved preset"
            />
            <SelectContent>
              {snapshot?.library.entries.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!entry}
            onClick={() => {
              if (entry && onLoad(structuredClone(entry.preset)))
                setMessage(
                  'Loaded for editing. Changes are not saved automatically.'
                );
            }}
          >
            Load / Edit
          </Button>
          <Button type="button" variant="outline" onClick={refresh}>
            Refresh library
          </Button>
          <Button
            type="button"
            disabled={!preset || !snapshot || !!snapshot.error}
            onClick={() => {
              if (preset)
                change(
                  { type: 'save', id: crypto.randomUUID(), preset },
                  'Saved as a new browser preset.'
                );
            }}
          >
            Save as new
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!preset || !entry || !!snapshot?.error}
            onClick={() => {
              if (
                preset &&
                entry &&
                window.confirm(
                  `Overwrite “${entry.preset.name}” with the current draft?`
                )
              )
                change(
                  { type: 'save', id: entry.id, preset, overwrite: true },
                  'Saved over selected browser preset.'
                );
            }}
          >
            Overwrite selected
          </Button>
        </div>
        {entry && (
          <div className="space-y-2">
            <label className="block text-sm">
              Library name
              <input
                className="mt-1 min-h-11 w-full rounded-md border bg-background p-2"
                value={rename}
                onChange={(event) => setRename(event.target.value)}
                maxLength={120}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  change(
                    { type: 'rename', id: entry.id, name: rename },
                    'Preset renamed. Current draft is unchanged.'
                  )
                }
              >
                Rename
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  change(
                    {
                      type: 'duplicate',
                      id: entry.id,
                      newId: crypto.randomUUID(),
                      name: rename,
                    },
                    'Preset duplicated. Choose Load / Edit to edit the copy.'
                  )
                }
              >
                Duplicate with this name
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete “${entry.preset.name}” from this browser? Existing rooms are not affected.`
                    )
                  )
                    change(
                      { type: 'delete', id: entry.id },
                      'Preset deleted. Your draft and existing rooms are unchanged.'
                    );
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!preset}
            onClick={() => {
              try {
                if (preset) {
                  download(exportPresetJson(preset), 'strinobans-preset.json');
                  setMessage(
                    'Exported preset definition only. No room was created.'
                  );
                }
              } catch (error) {
                onError(
                  error instanceof Error
                    ? error.message
                    : 'Could not export preset.'
                );
              }
            }}
          >
            Export draft JSON
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => input.current?.click()}
          >
            Import JSON for preview
          </Button>
          {snapshot?.error && snapshot.raw !== null && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                download(snapshot.raw!, 'strinobans-library-recovery.json')
              }
            >
              Back up unreadable library
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-label="Import preset JSON"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            try {
              if (file.size > MAX_PRESET_JSON_BYTES)
                throw new Error('Preset JSON is too large (maximum 64 KB).');
              setPreview(importPresetJson(await file.text()));
              setMessage(
                'Review the imported definition below before replacing your draft.'
              );
            } catch (error) {
              setPreview(null);
              const text =
                error instanceof Error
                  ? error.message
                  : 'Could not read preset JSON.';
              setMessage(text);
              onError(text);
            }
          }}
        />
        {preview && (
          <section
            className="space-y-2 rounded-md border p-3"
            aria-label="Imported preset preview"
          >
            <h4 className="break-words font-medium">{preview.name}</h4>
            <p className="text-sm">
              {preview.format.toUpperCase()} · {preview.mapPool.length} maps ·{' '}
              {preview.firstActorMode}
            </p>
            <p className="break-words text-sm">{preview.mapPool.join(', ')}</p>
            <ol className="list-inside list-decimal text-sm">
              {preview.steps?.map((step, index) => (
                <li key={index}>
                  {step.actor === 'upper-bracket'
                    ? 'Team A (upper bracket)'
                    : step.team === 'a'
                      ? 'Team 1'
                      : 'Team 2'}
                  : {step.type}
                  {step.forDecider
                    ? ' for final decider'
                    : step.forPickIndex !== undefined
                      ? ` for pick ${step.forPickIndex + 1}`
                      : ''}
                </li>
              ))}
            </ol>
            <p className="text-sm">
              Pick/ban timer: {preview.pickBanTimerSeconds ?? 'Default (50s)'};
              side timer: {preview.sideTimerSeconds ?? 'Default (35s)'};
              enforcement: {preview.timerEnforcement ?? 'none'}.{' '}
              {preview.roomImportCode
                ? `Preset Room Code: ${preview.roomImportCode}.`
                : 'No Preset Room Code.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  if (onLoad(preview)) {
                    setPreview(null);
                    setMessage(
                      'Imported into draft only. Save as new or explicitly overwrite a selected entry.'
                    );
                  }
                }}
              >
                Accept into draft
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreview(null)}
              >
                Cancel import
              </Button>
            </div>
          </section>
        )}
        <p role="status" aria-live="polite" className="text-sm break-words">
          {message}
        </p>
      </div>
    </Disclosure>
  );
}
