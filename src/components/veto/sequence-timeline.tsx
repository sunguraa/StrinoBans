"use client";

import { getFormatSteps, type ConfirmedAction, type CoinFlipResult } from "@/lib/state-machine";
import { MAP_POOL } from "@/lib/maps";
import type { Format, Team } from "@/types/veto";
import { cn } from "@/lib/utils";

interface SequenceTimelineProps {
  format: Format;
  mapPool: string[];
  actions: ConfirmedAction[];
  currentStepIndex: number;
  teamNames: Record<Team, string>;
  coinFlip: CoinFlipResult | null;
  customSteps?: { team: "a" | "b"; type: "ban" | "pick" | "side"; forPickIndex?: number; forDecider?: boolean }[];
  choicePending?: boolean;
}

const TAG_STYLES: Record<string, string> = {
  ban: "bg-ban/15 text-ban",
  pick: "bg-pick/15 text-pick",
  side: "bg-side/15 text-side",
};

export function SequenceTimeline({
  format,
  mapPool,
  actions,
  currentStepIndex,
  teamNames,
  coinFlip,
  customSteps,
  choicePending,
}: SequenceTimelineProps) {
  const steps = getFormatSteps(format, mapPool.length, coinFlip?.winner ?? null, customSteps);
  const actionByStep = new Map(actions.map((a) => [a.stepIndex, a]));
  const mapName = (id?: string) => MAP_POOL.find((m) => m.id === id)?.name ?? id ?? "—";
  // Before the flip winner has chosen first mover, A/B don't map to real names yet
  const displayNames: Record<Team, string> = choicePending
    ? { a: "Team A", b: "Team B" }
    : teamNames;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Action Feed
        </h3>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {Math.min(currentStepIndex, steps.length)} / {steps.length}
        </span>
      </div>
      <ol>
        {steps.map((step, index) => {
          const action = actionByStep.get(index);
          const isCurrent = index === currentStepIndex;
          const done = action !== undefined && !isCurrent;
          const teamName = step.team === "a" ? displayNames.a : displayNames.b;
          const detail = action
            ? step.type === "side"
              ? action.side
              : mapName(action.mapId)
            : isCurrent
              ? "in progress…"
              : "";

          return (
            <li
              key={index}
              className={cn(
                "grid grid-cols-[1.5rem_auto_1fr] items-center gap-2 border-b border-border px-4 py-2 text-sm last:border-b-0",
                isCurrent && "bg-accent/10",
                !done && !isCurrent && "opacity-45",
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide",
                    TAG_STYLES[step.type] ?? "bg-muted text-muted-foreground",
                  )}
                >
                  {step.type}
                </span>
                <span className={cn("truncate", isCurrent && "font-medium")}>{teamName}</span>
              </span>
              <span
                className={cn(
                  "truncate text-right text-xs",
                  done ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {detail}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
