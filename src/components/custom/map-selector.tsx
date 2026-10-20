'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { MAP_POOL } from '@/lib/maps';
import { getCachedIntroPath } from '@/lib/wiki/cache';
import { cn } from '@/lib/utils';

interface MapSelectorProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function MapSelector({ selected, onChange }: MapSelectorProps) {
  const toggle = (mapId: string) => {
    if (selected.includes(mapId)) {
      onChange(selected.filter((id) => id !== mapId));
    } else {
      onChange([...selected, mapId]);
    }
  };

  const allSelected = useMemo(
    () => selected.length === MAP_POOL.length,
    [selected.length]
  );

  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(MAP_POOL.map((m) => m.id));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {selected.length} of {MAP_POOL.length} maps selected.
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleAll}
          aria-label={allSelected ? 'Deselect all maps' : 'Select all maps'}
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
        {MAP_POOL.map((map) => {
          const isSelected = selected.includes(map.id);
          return (
            <Button
              key={map.id}
              type="button"
              variant="ghost"
              onClick={() => toggle(map.id)}
              aria-pressed={isSelected}
              aria-label={
                isSelected ? `${map.name}, included` : `${map.name}, excluded`
              }
              className={cn(
                'flex h-auto min-h-11 min-w-0 flex-col items-stretch gap-2 whitespace-normal rounded-md border p-2 text-left motion-reduce:transition-none',
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-accent'
              )}
            >
              <span className="relative block aspect-video w-full overflow-hidden rounded-sm bg-muted">
                <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
                  Map image unavailable
                </span>
                <img
                  src={getCachedIntroPath(map.id)}
                  alt=""
                  loading="lazy"
                  className="relative h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.visibility = 'hidden';
                  }}
                />
              </span>
              <span className="break-words text-sm font-medium">
                {map.name}
              </span>
              <span
                className={cn(
                  'text-xs',
                  isSelected ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {isSelected ? 'Included' : 'Excluded'}
                {!map.inDefaultPool ? ' · Custom pool' : ''}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
