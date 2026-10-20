'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Disclosure({
  title,
  children,
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const id = useId();
  return (
    <section
      className={cn(
        'min-w-0 overflow-clip rounded-lg border border-border bg-card',
        className
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          const next = !open;
          if (controlledOpen === undefined) setLocalOpen(next);
          onOpenChange?.(next);
        }}
        className="flex min-h-11 w-full items-center justify-between gap-3 p-4 text-left text-sm font-semibold transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {title}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180'
          )}
        />
      </button>
      <div
        id={id}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="min-h-0 min-w-0 overflow-clip">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </section>
  );
}
