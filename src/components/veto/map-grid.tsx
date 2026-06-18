"use client";

import { Button } from "@/components/ui/button";
import { getCachedIntroPath } from "@/lib/wiki/cache";
import { MAP_POOL } from "@/lib/maps";
import type { Team, Side } from "@/types/veto";
import type { VetoState } from "@/lib/state-machine";
import type { TeamIntent } from "@/lib/yjs/sync";
import { cn } from "@/lib/utils";

interface MapGridProps {
  mapPool: string[];
  vetoState: VetoState;
  selectedMapId: string | null;
  role: Team | "spectator";
  isMyTurn: boolean;
  currentStepType?: "ban" | "pick" | "side" | null;
  intents: TeamIntent[];
  onSelectMap: (mapId: string | null) => void;
  onSide: (side: Side) => void;
}

export function MapGrid({
  mapPool,
  vetoState,
  selectedMapId,
  role,
  isMyTurn,
  currentStepType,
  intents,
  onSelectMap,
  onSide,
}: MapGridProps) {
  const mapInfo = (id: string) => MAP_POOL.find((m) => m.id === id) ?? { id, name: id };

  const isAvailable = (id: string) => vetoState.remainingMaps.includes(id);
  const isBanned = (id: string) => vetoState.bannedMaps.includes(id);
  const picked = (id: string) => vetoState.pickedMaps.find((p) => p.mapId === id);
  const isDecider = (id: string) => vetoState.deciderMap === id;

  const showSideButtons = (id: string) => {
    if (currentStepType !== "side" || !isMyTurn) return false;
    if (vetoState.currentStep?.forDecider) return id === vetoState.deciderMap;
    return id === vetoState.pendingPick?.mapId;
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {mapPool.map((mapId) => {
        const info = mapInfo(mapId);
        const available = isAvailable(mapId);
        const banned = isBanned(mapId);
        const pick = picked(mapId);
        const decider = isDecider(mapId);
        const selected = selectedMapId === mapId;
        const clickable =
          isMyTurn && (currentStepType === "ban" || currentStepType === "pick") && available;

        let status: string;
        if (pick) status = `Picked by ${pick.pickedBy === "a" ? "Team A" : "Team B"} - ${pick.side}`;
        else if (banned) status = "Banned";
        else if (decider) status = "Decider";
        else status = "Available";

        const teammateIntents = intents.filter((i) => i.selectedMapId === mapId);
        const showSide = showSideButtons(mapId);

        const badge = banned
          ? { label: "BAN", cls: "bg-ban text-white" }
          : pick
            ? { label: "PICK", cls: "bg-pick text-black" }
            : decider
              ? { label: "DECIDER", cls: "bg-side text-black" }
              : null;

        const inner = (
          <>
            <img
              src={getCachedIntroPath(mapId)}
              alt=""
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-all duration-200",
                banned ? "grayscale brightness-[0.4]" : "brightness-[0.78]",
                clickable && "group-hover:brightness-100",
              )}
            />
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

            {badge && (
              <span
                className={cn(
                  "absolute right-2 top-2 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide",
                  badge.cls,
                )}
              >
                {badge.label}
              </span>
            )}

            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-2.5">
              <span className="text-sm font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                {info.name}
              </span>

              {teammateIntents.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {teammateIntents.map((intent) => (
                    <span
                      key={intent.clientId}
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: intent.color, color: "#000" }}
                    >
                      {intent.name}
                    </span>
                  ))}
                </div>
              )}

              {showSide && (
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 flex-1 px-2 text-xs"
                    onClick={() => onSide("attacker")}
                    aria-label={`Choose attacker on ${info.name}`}
                  >
                    Attacker
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 flex-1 px-2 text-xs"
                    onClick={() => onSide("defender")}
                    aria-label={`Choose defender on ${info.name}`}
                  >
                    Defender
                  </Button>
                </div>
              )}
            </div>
          </>
        );

        const className = cn(
          "group relative aspect-[16/10] overflow-hidden rounded-lg border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          decider ? "border-side" : pick ? "border-pick" : "border-border",
          selected && "ring-2 ring-accent",
          clickable ? "cursor-pointer hover:border-foreground/40" : "cursor-default",
        );

        if (clickable) {
          return (
            <button
              key={mapId}
              type="button"
              onClick={() => onSelectMap(selected ? null : mapId)}
              aria-label={`${info.name} - ${status}${selected ? " selected" : ""}`}
              aria-pressed={selected}
              className={className}
            >
              {inner}
            </button>
          );
        }

        return (
          <div key={mapId} className={className} aria-label={`${info.name} - ${status}`}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
