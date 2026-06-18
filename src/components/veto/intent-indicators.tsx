"use client";

import type { TeamIntent } from "@/lib/yjs/sync";

interface IntentIndicatorsProps {
  intents: TeamIntent[];
}

export function IntentIndicators({ intents }: IntentIndicatorsProps) {
  if (intents.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {intents.map((intent) => (
        <span
          key={intent.clientId}
          className="rounded-full px-2 py-0.5 text-xs"
          style={{ backgroundColor: intent.color, color: "#000" }}
          aria-label={`${intent.name} is hovering`}
        >
          {intent.name}
        </span>
      ))}
    </div>
  );
}
