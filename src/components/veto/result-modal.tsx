"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MAP_POOL } from "@/lib/maps";
import { getCachedIntroPath } from "@/lib/wiki/cache";
import { cn } from "@/lib/utils";
import {
  buildResultImageDataFromSummary,
  copyVetoResultImage,
  formatLabel,
} from "@/lib/result-image";
import { downloadSessionTranscript, type SessionSummary } from "@/lib/storage";
import type { Side } from "@/types/veto";

const opposite = (side: Side): Side => (side === "attacker" ? "defender" : "attacker");

function SideTag({ team, side }: { team: string; side: Side }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
        side === "attacker"
          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
          : "bg-sky-500/15 text-sky-600 dark:text-sky-400",
      )}
    >
      <span className="truncate">{team}</span>
      <span className="font-mono font-bold uppercase">{side === "attacker" ? "ATK" : "DEF"}</span>
    </span>
  );
}

export function ResultModal({ summary, onClose }: { summary: SessionSummary; onClose: () => void }) {
  const [imageState, setImageState] = useState<"idle" | "copied" | "downloaded">("idle");
  const mapName = (id: string) => MAP_POOL.find((m) => m.id === id)?.name ?? id;

  const copyImage = async () => {
    try {
      const result = await copyVetoResultImage(buildResultImageDataFromSummary(summary));
      setImageState(result);
      setTimeout(() => setImageState("idle"), 1800);
    } catch {
      /* ignore */
    }
  };

  const playedIds = new Set(summary.finalResult.map((r) => r.mapId));
  const banned = summary.mapPool.filter((id) => !playedIds.has(id));

  const bannedByMap = new Map<string, "a" | "b" | string>();
  if (summary.actions) {
    summary.actions.forEach((action) => {
      if (action.type === "ban" && action.mapId) {
        bannedByMap.set(action.mapId, action.team);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Veto result"
    >
      <Card className="w-full max-w-2xl max-h-[85vh] space-y-5 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-medium">Veto Result</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.teamAName} vs {summary.teamBName} · {formatLabel(summary.format)}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>

        <ol className="space-y-2.5">
          {summary.finalResult.map((r, index) => {
            const isDecider = !r.pickedBy;
            const side = (r.side as Side) || null;
            const teamASide = side ? (r.sidePickedBy === "a" ? side : opposite(side)) : null;
            const teamBSide = side ? (r.sidePickedBy === "b" ? side : opposite(side)) : null;
            const pickedByName = r.pickedBy === "a" ? summary.teamAName : r.pickedBy === "b" ? summary.teamBName : "";

            return (
              <li
                key={`${r.mapId}-${index}`}
                className={cn(
                  "flex items-center gap-3 rounded-lg border bg-card p-3",
                  isDecider ? "border-side/60" : "border-border",
                )}
              >
                <span className="w-5 shrink-0 text-center font-mono text-lg font-bold tabular-nums">
                  {index + 1}
                </span>
                <img
                  src={getCachedIntroPath(r.mapId)}
                  alt=""
                  className="h-12 w-20 shrink-0 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{mapName(r.mapId)}</span>
                    {isDecider && (
                      <span className="shrink-0 rounded bg-side/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-side">
                        Decider
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {isDecider
                      ? `Last map standing${r.sidePickedBy ? ` — Side chosen by ${r.sidePickedBy === "a" ? summary.teamAName : summary.teamBName}` : ""}`
                      : pickedByName ? `Picked by ${pickedByName}` : ""}
                  </div>
                  {teamASide && teamBSide && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <SideTag team={summary.teamAName} side={teamASide} />
                      <SideTag team={summary.teamBName} side={teamBSide} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {banned.length > 0 && (
          <div>
            <h3 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Banned
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {banned.map((id) => {
                const banner = bannedByMap.get(id);
                const bannerName = banner === "a" ? summary.teamAName : banner === "b" ? summary.teamBName : undefined;
                return (
                  <span
                    key={id}
                    className="rounded bg-ban/10 px-2 py-0.5 text-xs text-muted-foreground"
                    title={bannerName ? `Banned by ${bannerName}` : undefined}
                  >
                    <span className="line-through">{mapName(id)}</span>
                    {bannerName && (
                      <span className="ml-1 font-mono text-[9px] text-ban">(by {bannerName.slice(0, 8)})</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={copyImage} aria-label="Copy result as image">
            {imageState === "copied" ? "Copied image!" : imageState === "downloaded" ? "Image downloaded" : "Copy as Image"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadSessionTranscript(summary)}
            aria-label="Download JSON"
          >
            Download JSON
          </Button>
        </div>
      </Card>
    </div>
  );
}
