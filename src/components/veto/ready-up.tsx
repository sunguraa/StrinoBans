'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TeamPanel } from './team-panel';
import type { Team } from '@/types/veto';
import type { SessionLinks } from '@/lib/token';
import { useState } from 'react';

interface ReadyUpProps {
  role: Team | 'spectator';
  teamNames: Record<Team, string>;
  readyState: Record<Team, boolean>;
  onTeamNameChange: (team: Team, name: string) => void;
  onReadyToggle: (team: Team) => void;
  isHost: boolean;
  links: SessionLinks | null;
}

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <Button
        type="button"
        size="sm"
        onClick={handleCopy}
        aria-label={`Copy ${label} link`}
      >
        {copied ? 'Copied' : 'Copy Link'}
      </Button>
    </div>
  );
}

export function ReadyUp({
  role,
  teamNames,
  readyState,
  onTeamNameChange,
  onReadyToggle,
  isHost,
  links,
}: ReadyUpProps) {
  const bothReady = readyState.a && readyState.b;

  const showTeamA = isHost || role === 'a';
  const showTeamB = isHost || role === 'b';
  const showSpectator = true;

  // Let's hide the Ready buttons if the name is completely empty
  const nameAEmpty = !teamNames.a.trim();
  const nameBEmpty = !teamNames.b.trim();

  return (
    <div className="w-full max-w-xl space-y-5">
      <Card className="space-y-5 p-6">
        <div className="text-center">
          <h2 className="font-serif text-2xl font-medium">Ready up</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Both teams enter a name and ready up before the veto begins.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(['a', 'b'] as Team[]).map((team) => {
            const isEmpty = !teamNames[team].trim();
            return (
              <TeamPanel
                key={team}
                team={team}
                label={team === 'a' ? 'Team A' : 'Team B'}
                name={teamNames[team]}
                isMe={role === team}
                isReady={readyState[team]}
                isActing={false}
                editable={role === team}
                onNameChange={
                  role === team
                    ? (name) => onTeamNameChange(team, name)
                    : undefined
                }
                onReadyToggle={
                  role === team && !isEmpty
                    ? () => onReadyToggle(team)
                    : undefined
                }
              />
            );
          })}
        </div>

        <p
          className={`text-center text-sm ${bothReady ? 'font-medium text-accent' : 'text-muted-foreground'}`}
          aria-live="polite"
        >
          {bothReady
            ? 'Both teams ready — starting veto…'
            : 'Waiting for both teams to ready up.'}
        </p>
      </Card>

      {/* Share Links Panel - Displayed directly below the card on host/setup screens */}
      {links && !bothReady && (
        <Card className="p-6 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground tracking-wide uppercase">
            Share Links
          </h3>
          <p className="text-xs text-muted-foreground">
            {isHost
              ? 'Distribute these links to each team and spectator. Do not share team links with the opposing team.'
              : 'Share these links with teammates or spectating helpers.'}
          </p>
          <div className="space-y-2">
            {showTeamA && <LinkRow label="Team A Link" url={links.teamA} />}
            {showTeamB && <LinkRow label="Team B Link" url={links.teamB} />}
            {showSpectator && (
              <LinkRow label="Spectator Link" url={links.spectator} />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
