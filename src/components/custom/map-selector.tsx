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
      <div className="flex items-center justify-between">
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
      {/* flex-wrap + justify-center centers an incomplete final row; widths size each card */}
      <div className="flex flex-wrap justify-center gap-3">
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
                isSelected ? `${map.name} selected` : `${map.name} not selected`
              }
              className={cn(
                'flex h-auto w-[calc(50%-0.375rem)] flex-col items-center gap-2 rounded-md border p-2 transition-colors sm:w-[calc(33.333%-0.5rem)] md:w-[calc(20%-0.6rem)]',
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-accent'
              )}
            >
              <img
                src={getCachedIntroPath(map.id)}
                alt=""
                className="h-24 w-full rounded-sm object-cover"
              />
              <span className="text-sm font-medium">{map.name}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
