"use client";

import { Button } from "@/components/ui/button";
import type { Team } from "@/types/veto";
import { isNameClean, NAME_FILTER_ERROR } from "@/lib/filters";

interface TeamPanelProps {
  team: Team;
  label: string;
  name: string;
  isMe: boolean;
  isReady: boolean;
  isActing: boolean;
  editable: boolean;
  onNameChange?: (name: string) => void;
  onReadyToggle?: () => void;
}

export function TeamPanel({
  team,
  label,
  name,
  isMe,
  isReady,
  isActing,
  editable,
  onNameChange,
  onReadyToggle,
}: TeamPanelProps) {
  const nameInvalid = name.trim().length > 0 && !isNameClean(name);

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        isActing ? "border-primary bg-primary/5" : "border-border bg-card"
      }`}
      role="region"
      aria-label={`${label} panel`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          {isMe && <span className="text-xs text-primary">You</span>}
        </div>
        <span className="text-sm font-semibold" aria-live="polite">
          {isReady ? "Ready" : "Not ready"}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {editable ? (
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange?.(e.target.value)}
              placeholder="Enter team name"
              aria-label={`${label} name`}
              aria-invalid={nameInvalid}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring ${
                nameInvalid ? "border-destructive focus:ring-destructive" : "border-input"
              }`}
            />
            {nameInvalid && (
              <p className="mt-1 text-xs text-destructive" role="alert">{NAME_FILTER_ERROR}</p>
            )}
          </div>
        ) : (
          <span className="flex-1 truncate text-lg font-semibold">{name}</span>
        )}
        {onReadyToggle && (
          <Button
            type="button"
            size="sm"
            variant={isReady ? "outline" : "default"}
            onClick={onReadyToggle}
            disabled={!name.trim() || nameInvalid}
            aria-label={isReady ? `Undo ${label} ready` : `Ready up ${label}`}
          >
            {isReady ? "Undo" : "Ready Up"}
          </Button>
        )}
      </div>
    </div>
  );
}
