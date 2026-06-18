"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useVetoSession } from "@/lib/yjs/use-veto-session";
import { Header } from "@/components/layout/header";
import { Branding } from "@/components/layout/branding";
import { ReadyUp } from "./ready-up";
import { CoinFlip } from "./coin-flip";
import { MapGrid } from "./map-grid";
import { SequenceTimeline } from "./sequence-timeline";
import { TeamPanel } from "./team-panel";
import { ActionBar } from "./action-bar";
import { ResultsScreen } from "./results-screen";
import { ShareModal } from "./share-modal";
import { getFormatSteps } from "@/lib/state-machine";
import type { Team, Side } from "@/types/veto";

export function VetoRoom() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("s") || undefined;
  const token = searchParams.get("t") || undefined;
  const session = useVetoSession({ sessionId, token });
  const [showShare, setShowShare] = useState(true);
  const [coinRevealed, setCoinRevealed] = useState(false);

  const handleTeamNameChange = (team: Team, name: string) => {
    if (team === session.role) session.setTeamName(name);
  };

  const handleReadyToggle = (team: Team) => {
    if (team === session.role) session.setReady(!session.readyState[team]);
  };

  const handleTimeout = useCallback(() => {
    const step = session.vetoState.currentStep;
    if (!step) return;
    if (step.type === "side") {
      const side: Side = Math.random() < 0.5 ? "attacker" : "defender";
      session.submitSide(side);
    } else {
      const pool = session.vetoState.remainingMaps;
      if (pool.length > 0) {
        const mapId = pool[Math.floor(Math.random() * pool.length)];
        session.submitMapAction(mapId);
      }
    }
  }, [session]);

  const handleDownloadTranscript = useCallback(() => {
    const transcript = {
      sessionId: session.meta?.sessionId ?? sessionId,
      createdAt: session.meta?.createdAt,
      teamNames: session.teamNames,
      actions: session.actions,
      vetoState: session.vetoState,
    };
    const blob = new Blob([JSON.stringify(transcript, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `veto-${session.meta?.sessionId ?? "unknown"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [session, sessionId]);

  const bothReady = session.readyState.a && session.readyState.b;
  // Once the veto has started (rejoin/spectator arriving mid-veto) skip the reveal.
  const vetoStarted = session.actions.length > 0;
  const showBoard = session.coinFlip !== null && (coinRevealed || vetoStarted);
  const showCoinFlip = bothReady && !showBoard;
  const isMyTurn = session.vetoState.currentTeam === session.role;

  const totalSteps = getFormatSteps(
    session.meta?.format ?? "bo1",
    session.meta?.mapPool?.length ?? 0,
    session.coinFlip?.winner ?? null,
  ).length;
  const phaseStep = Math.min(session.vetoState.currentStepIndex, totalSteps);
  const phasePct = totalSteps > 0 ? (phaseStep / totalSteps) * 100 : 0;

  const myTeamIntents = session.role === "a" ? session.intents.teamA : session.role === "b" ? session.intents.teamB : [];

  return (
    <div className="flex h-full flex-col">
      <Header />

      <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {session.loading && (
          <div className="flex flex-1 items-center justify-center" role="status" aria-live="polite">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="ml-3">Connecting to veto room...</span>
          </div>
        )}

        {!session.loading && session.vetoState.isComplete && (
          <div className="flex flex-1 items-start justify-center pt-8">
            <ResultsScreen
              vetoState={session.vetoState}
              teamNames={session.teamNames}
              actions={session.actions}
              sessionId={session.meta?.sessionId ?? sessionId ?? ""}
              roomImportCode={session.meta?.roomImportCode}
              onDownloadTranscript={handleDownloadTranscript}
            />
          </div>
        )}

        {!session.loading && !session.vetoState.isComplete && !bothReady && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <ReadyUp
              role={session.role}
              teamNames={session.teamNames}
              readyState={session.readyState}
              onTeamNameChange={handleTeamNameChange}
              onReadyToggle={handleReadyToggle}
              onOpenShare={() => setShowShare(true)}
              canShare={session.role !== "spectator" && !!session.shareLinks}
            />
          </div>
        )}

        {!session.loading && !session.vetoState.isComplete && showCoinFlip && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <CoinFlip
              teamNames={session.teamNames}
              coinFlip={session.coinFlip}
              seededPick={session.meta?.seededPick}
              role={session.role}
              onChooseFirstActor={session.chooseSeededFirstActor}
              onRevealComplete={() => setCoinRevealed(true)}
            />
          </div>
        )}

        {!session.loading && !session.vetoState.isComplete && showBoard && (
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TeamPanel
                team="a"
                label={session.displayRole === "a" && session.role !== "spectator" ? "Team A (You)" : "Team A"}
                name={session.teamNames.a}
                isMe={session.displayRole === "a"}
                isReady={session.readyState.a}
                isActing={session.vetoState.currentTeam === "a"}
                editable={false}
              />
              <TeamPanel
                team="b"
                label={session.displayRole === "b" && session.role !== "spectator" ? "Team B (You)" : "Team B"}
                name={session.teamNames.b}
                isMe={session.displayRole === "b"}
                isReady={session.readyState.b}
                isActing={session.vetoState.currentTeam === "b"}
                editable={false}
              />
            </div>

            <div className="flex items-center gap-3 px-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Phase
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${phasePct}%` }}
                />
              </div>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {phaseStep} / {totalSteps}
              </span>
            </div>

            <ActionBar
              currentStepIndex={session.vetoState.currentStepIndex}
              currentStep={session.vetoState.currentStep}
              isMyTurn={isMyTurn}
              selectedMapId={session.selectedMapId}
              teamNames={session.teamNames}
              pickBanSeconds={Math.max(30, session.meta?.pickBanTimerSeconds ?? 50)}
              sideSeconds={Math.max(20, session.meta?.sideTimerSeconds ?? 35)}
              timerEnforcement={session.meta?.timerEnforcement ?? "none"}
              onConfirm={() => session.selectedMapId && session.submitMapAction(session.selectedMapId)}
              onTimeout={handleTimeout}
              onSide={session.submitSide}
            />

            <MapGrid
              mapPool={session.meta?.mapPool ?? []}
              vetoState={session.vetoState}
              selectedMapId={session.selectedMapId}
              role={session.role}
              isMyTurn={isMyTurn}
              currentStepType={session.vetoState.currentActionType}
              intents={myTeamIntents}
              onSelectMap={session.selectMap}
              onSide={session.submitSide}
            />

            <SequenceTimeline
              format={session.meta?.format ?? "bo1"}
              mapPool={session.meta?.mapPool ?? []}
              actions={session.actions}
              currentStepIndex={session.vetoState.currentStepIndex}
              teamNames={session.teamNames}
              coinFlip={session.coinFlip}
            />
          </div>
        )}
      </main>

      <Branding />

      {showShare && session.shareLinks && session.role !== "spectator" && !session.vetoState.isComplete && (
        <ShareModal links={session.shareLinks} roomImportCode={session.meta?.roomImportCode} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}


