"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SessionLinks } from "@/lib/token";
import type { Team } from "@/types/veto";

interface ShareModalProps {
  links: SessionLinks;
  roomImportCode?: string;
  role: Team | "spectator";
  /** Setup phase host view: show every link. Otherwise show role-scoped links. */
  showAll: boolean;
  onClose: () => void;
}

function CopyRow({ label, url }: { label: string; url: string }) {
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
    <div className="flex items-center gap-2">
      <div className="w-28 shrink-0 text-sm font-medium">{label}</div>
      <input
        type="text"
        readOnly
        value={url}
        className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
        aria-label={`${label} link`}
      />
      <Button type="button" size="sm" onClick={handleCopy} aria-label={`Copy ${label} link`}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function ShareModal({ links, roomImportCode, role, showAll, onClose }: ShareModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Share room links">
      <Card className="w-full max-w-xl space-y-4 p-6">
        <h2 className="text-xl font-semibold">Share room links</h2>
        <p className="text-sm text-muted-foreground">
          {showAll
            ? "Send each team their private link. Spectators can watch in real time."
            : "Share your team's link with teammates, or the spectator link with anyone who wants to watch."}
        </p>
        <div className="space-y-3">
          {roomImportCode && <CopyRow label="Room code" url={roomImportCode} />}

          {showAll ? (
            <>
              <CopyRow label="Team A" url={links.teamA} />
              <CopyRow label="Team B" url={links.teamB} />
              <CopyRow label="Spectator" url={links.spectator} />
            </>
          ) : (
            <>
              {role === "a" && <CopyRow label="Your team (A)" url={links.teamA} />}
              {role === "b" && <CopyRow label="Your team (B)" url={links.teamB} />}
              <CopyRow label="Spectator" url={links.spectator} />
            </>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>Close</Button>
        </div>
      </Card>
    </div>
  );
}
