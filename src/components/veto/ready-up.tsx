"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TeamPanel } from "./team-panel";
import type { Team } from "@/types/veto";

interface ReadyUpProps {
  role: Team | "spectator";
  teamNames: Record<Team, string>;
  readyState: Record<Team, boolean>;
  onTeamNameChange: (team: Team, name: string) => void;
  onReadyToggle: (team: Team) => void;
  onOpenShare: () => void;
  canShare: boolean;
}

export function ReadyUp({
  role,
  teamNames,
  readyState,
  onTeamNameChange,
  onReadyToggle,
  onOpenShare,
  canShare,
}: ReadyUpProps) {
  const bothReady = readyState.a && readyState.b;

  return (
    <Card className="w-full max-w-xl space-y-5 p-6">
      <div className="text-center">
        <h2 className="font-serif text-2xl font-medium">Ready up</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Both teams enter a name and ready up before the veto begins.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(["a", "b"] as Team[]).map((team) => (
          <TeamPanel
            key={team}
            team={team}
            label={team === "a" ? "Team A" : "Team B"}
            name={teamNames[team]}
            isMe={role === team}
            isReady={readyState[team]}
            isActing={false}
            editable={role === team}
            onNameChange={role === team ? (name) => onTeamNameChange(team, name) : undefined}
            onReadyToggle={role === team ? () => onReadyToggle(team) : undefined}
          />
        ))}
      </div>

      <p
        className={`text-center text-sm ${bothReady ? "font-medium text-accent" : "text-muted-foreground"}`}
        aria-live="polite"
      >
        {bothReady ? "Both teams ready — starting coin flip…" : "Waiting for both teams to ready up."}
      </p>

      {canShare && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenShare}
            aria-label="Open share links"
          >
            Share room links
          </Button>
        </div>
      )}
    </Card>
  );
}
