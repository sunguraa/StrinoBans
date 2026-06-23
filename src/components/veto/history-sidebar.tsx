"use client";

import { useEffect, useState } from "react";
import { getSessionHistory, removeSessionHistory, downloadSessionTranscript, type SessionSummary } from "@/lib/storage";
import { formatLabel } from "@/lib/result-image";
import { ResultModal } from "./result-modal";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistorySidebar() {
  // History lives in localStorage. Read it after mount (not via a lazy
  // initializer) so the prerendered empty list matches the first client render.
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<SessionSummary | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessions(getSessionHistory());
  }, []);

  const handleDelete = (sessionId: string, event: React.MouseEvent) => {
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) return;

    const skipConfirm = event.shiftKey;
    if (
      !skipConfirm &&
      !window.confirm(
        `Delete this veto history entry?\n\nHold Shift and click the trash icon to delete without asking.`,
      )
    ) {
      return;
    }

    removeSessionHistory(sessionId);
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
  };

  return (
    <aside
      className="hidden w-72 shrink-0 flex-col overflow-y-auto border-r border-border bg-card/30 lg:flex"
      aria-label="Veto history"
    >
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">History</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Your completed vetos, saved locally.</p>
      </div>

      {sessions.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No completed vetos yet. Finished rooms show up here.
        </p>
      ) : (
        <ul className="flex-1 space-y-1 p-2">
          {sessions.map((s) => (
            <li key={s.sessionId}>
              <div className="group flex items-center gap-2 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-card">
                <button
                  type="button"
                  onClick={() => setSelected(s)}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`View ${s.teamAName} vs ${s.teamBName} result`}
                >
                  <p className="truncate text-sm font-medium">
                    {s.teamAName} <span className="text-muted-foreground">vs</span> {s.teamBName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatDate(s.completedAt)} · {formatLabel(s.format)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => downloadSessionTranscript(s)}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  aria-label={`Download ${s.teamAName} vs ${s.teamBName} JSON`}
                  title="Download JSON"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(s.sessionId, e)}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label={`Delete ${s.teamAName} vs ${s.teamBName} history`}
                  title="Delete (Shift+click to skip confirmation)"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selected && <ResultModal summary={selected} onClose={() => setSelected(null)} />}
    </aside>
  );
}
