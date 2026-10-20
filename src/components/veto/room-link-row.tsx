'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function RoomLinkRow({
  label,
  url,
  isGameCode = false,
}: {
  label: string;
  url: string;
  isGameCode?: boolean;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const fieldLabel = isGameCode ? label : `${label} link`;
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label
          className="w-full text-sm font-medium sm:w-28"
          htmlFor={`share-${label.replace(/\W/g, '-')}`}
        >
          {label}
        </label>
        <input
          id={`share-${label.replace(/\W/g, '-')}`}
          type="text"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          aria-label={fieldLabel}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        />
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          aria-label={`Copy ${fieldLabel}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setStatus('copied');
            } catch {
              setStatus('failed');
            }
          }}
        >
          {status === 'copied' ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {status === 'failed'
          ? 'Could not copy. Select the field and copy it manually.'
          : status === 'copied'
            ? `${fieldLabel} copied.`
            : ''}
      </p>
    </div>
  );
}
