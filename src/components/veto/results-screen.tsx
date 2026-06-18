"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { withBasePath } from "@/lib/base-path";
import { getPlanLink } from "@/lib/routes";
import { MAP_POOL } from "@/lib/maps";
import { getCachedIntroPath } from "@/lib/wiki/cache";
import { cn } from "@/lib/utils";
import { buildResultImageData, copyVetoResultImage } from "@/lib/result-image";
import type { Team, Side } from "@/types/veto";
import type { Format } from "@/types/veto";
import type { VetoState, ConfirmedAction } from "@/lib/state-machine";

interface ResultsScreenProps {
  vetoState: VetoState;
  teamNames: Record<Team, string>;
  actions: ConfirmedAction[];
  sessionId: string;
  format: Format;
  roomImportCode?: string;
  onDownloadTranscript: () => void;
}

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

export function ResultsScreen({
  vetoState,
  teamNames,
  actions,
  sessionId,
  format,
  roomImportCode,
  onDownloadTranscript,
}: ResultsScreenProps) {
  const [copied, setCopied] = useState(false);
  const [imageState, setImageState] = useState<"idle" | "copied" | "downloaded">("idle");
  const mapName = (id: string) => MAP_POOL.find((m) => m.id === id)?.name ?? id;
  const teamName = (t: Team) => (t === "a" ? teamNames.a : teamNames.b);

  const copyImage = async () => {
    try {
      const result = await copyVetoResultImage(
        buildResultImageData({ vetoState, actions, teamNames, format }),
      );
      setImageState(result);
      setTimeout(() => setImageState("idle"), 1800);
    } catch {
      /* ignore */
    }
  };

  const copyRoomCode = async () => {
    if (!roomImportCode) return;
    try {
      await navigator.clipboard.writeText(roomImportCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  // The maps in the order they'll be played: picks in pick order, decider last.
  const played: {
    mapId: string;
    pickedBy: Team | null;
    side: Side | null;
    sidePickedBy: Team | null;
    isDecider: boolean;
  }[] = vetoState.pickedMaps.map((p) => ({
    mapId: p.mapId,
    pickedBy: p.pickedBy,
    side: p.side,
    sidePickedBy: p.sidePickedBy,
    isDecider: false,
  }));

  if (vetoState.deciderMap) {
    const deciderSide = actions.find(
      (a) => a.type === "side" && a.mapId === vetoState.deciderMap,
    );
    played.push({
      mapId: vetoState.deciderMap,
      pickedBy: null,
      side: deciderSide?.side ?? null,
      sidePickedBy: deciderSide?.team ?? null,
      isDecider: true,
    });
  }

  return (
    <Card className="w-full max-w-3xl space-y-5 p-6">
      <div>
        <h2 className="font-serif text-2xl font-medium">Veto Complete</h2>
        {roomImportCode && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Room code:</span>
            <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm font-semibold">{roomImportCode}</code>
            <button
              type="button"
              onClick={copyRoomCode}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Copy room code"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {played.length} map{played.length === 1 ? "" : "s"} in play order.
        </p>
      </div>

      <ol className="space-y-2.5">
        {played.map((m, index) => {
          const teamASide = m.side ? (m.sidePickedBy === "a" ? m.side : opposite(m.side)) : null;
          const teamBSide = m.side ? (m.sidePickedBy === "b" ? m.side : opposite(m.side)) : null;

          return (
            <li
              key={`${m.mapId}-${index}`}
              className={cn(
                "flex items-center gap-3 rounded-lg border bg-card p-3",
                m.isDecider ? "border-side/60" : "border-border",
              )}
            >
              <div className="flex shrink-0 flex-col items-center gap-1">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Map
                </span>
                <span className="font-mono text-lg font-bold leading-none tabular-nums">
                  {index + 1}
                </span>
              </div>

              <img
                src={getCachedIntroPath(m.mapId)}
                alt=""
                className="h-14 w-20 shrink-0 rounded object-cover"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{mapName(m.mapId)}</span>
                  {m.isDecider && (
                    <span className="shrink-0 rounded bg-side/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-side">
                      Decider
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {m.isDecider
                    ? "Last map standing"
                    : m.pickedBy
                      ? `Picked by ${teamName(m.pickedBy)}`
                      : ""}
                </div>
                {teamASide && teamBSide && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <SideTag team={teamNames.a} side={teamASide} />
                    <SideTag team={teamNames.b} side={teamBSide} />
                  </div>
                )}
              </div>

              <Button asChild size="sm" className="shrink-0">
                <a
                  href={getPlanLink(m.mapId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${mapName(m.mapId)} in StrinoPlant`}
                >
                  StrinoPlant
                </a>
              </Button>
            </li>
          );
        })}
      </ol>

      {vetoState.bannedMaps.length > 0 && (
        <div>
          <h3 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Banned
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {vetoState.bannedMaps.map((id) => (
              <span
                key={id}
                className="rounded bg-ban/10 px-2 py-0.5 text-xs text-muted-foreground line-through"
              >
                {mapName(id)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={copyImage}
          aria-label="Copy result as image"
        >
          {imageState === "copied" ? "Copied image!" : imageState === "downloaded" ? "Image downloaded" : "Copy as Image"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDownloadTranscript}
          aria-label="Download transcript"
        >
          Download Transcript
        </Button>
        <Button
          type="button"
          onClick={() => (window.location.href = withBasePath("/"))}
          aria-label="Create new room"
        >
          New Room
        </Button>
      </div>
    </Card>
  );
}
