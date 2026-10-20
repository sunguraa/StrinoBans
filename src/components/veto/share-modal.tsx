'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { SessionLinks } from '@/lib/token';
import type { Team } from '@/types/veto';
import { RoomLinkRow } from './room-link-row';

interface ShareModalProps {
  links: SessionLinks;
  roomImportCode?: string;
  role: Team | 'spectator';
  /** Setup phase host view: show every link. Otherwise show role-scoped links. */
  showAll: boolean;
  onClose: () => void;
}

export function ShareModal({
  links,
  roomImportCode,
  role,
  showAll,
  onClose,
}: ShareModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-lg border border-border bg-card p-0 text-foreground backdrop:bg-black/60"
      onCancel={onClose}
      onClose={onClose}
      aria-label="Share room links"
    >
      <Card className="w-full space-y-4 p-5">
        <h2 className="text-xl font-semibold">Share room links</h2>
        <p className="text-sm text-muted-foreground">
          {showAll
            ? 'Send each team their private link. Spectators can watch in real time.'
            : "Share your team's link with teammates, or the spectator link with anyone who wants to watch."}
        </p>
        <div className="space-y-3">
          {roomImportCode && (
            <RoomLinkRow
              label="Preset Room Code"
              url={roomImportCode}
              isGameCode
            />
          )}

          {showAll ? (
            <>
              <RoomLinkRow label="Team A" url={links.teamA} />
              <RoomLinkRow label="Team B" url={links.teamB} />
              <RoomLinkRow label="Spectator" url={links.spectator} />
            </>
          ) : (
            <>
              {role === 'a' && (
                <RoomLinkRow label="Your team (A)" url={links.teamA} />
              )}
              {role === 'b' && (
                <RoomLinkRow label="Your team (B)" url={links.teamB} />
              )}
              <RoomLinkRow label="Spectator" url={links.spectator} />
            </>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </dialog>
  );
}
