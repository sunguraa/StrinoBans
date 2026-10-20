'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useVetoSession } from '@/lib/yjs/use-veto-session';
import { Header } from '@/components/layout/header';
import { Branding } from '@/components/layout/branding';
import { ReadyUp } from './ready-up';
import { CoinFlip } from './coin-flip';
import { MapGrid } from './map-grid';
import { SequenceTimeline } from './sequence-timeline';
import { TeamPanel } from './team-panel';
import { ActionBar } from './action-bar';
import { Timer } from './timer';
import { ResultsScreen } from './results-screen';
import { ShareModal } from './share-modal';
import { Button } from '@/components/ui/button';
import { RulesSummary } from './rules-summary';
import { getFormatSteps } from '@/lib/state-machine';
import { saveCompletedSession, type SessionSummary } from '@/lib/storage';
import { isNameClean } from '@/lib/filters';
import type { Team, Side } from '@/types/veto';

export function VetoRoom() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('s') || undefined;
  const token = searchParams.get('t') || undefined;
  const session = useVetoSession({ sessionId, token });
  const [showShare, setShowShare] = useState(false); // Closed by default
  const [coinRevealed, setCoinRevealed] = useState(false);
  const [reportFeedback, setReportFeedback] = useState('');
  const savedHistoryRef = useRef(false);

  const handleTeamNameChange = (team: Team, name: string) => {
    if (team !== session.role) return;
    if (!isNameClean(name)) return;
    session.setTeamName(name);
  };

  const handleReadyToggle = (team: Team) => {
    if (team === session.role) session.setReady(!session.readyState[team]);
  };

  const handleChoiceTimeout = useCallback(() => {
    const team: Team = Math.random() < 0.5 ? 'a' : 'b';
    session.chooseFirstActor(team);
  }, [session]);

  const handleTimeout = useCallback(() => {
    const step = session.vetoState.currentStep;
    if (!step) return;
    if (step.type === 'side') {
      const side: Side = Math.random() < 0.5 ? 'attacker' : 'defender';
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
      rules: session.meta?.presetSnapshot ?? {
        name: session.meta?.presetName,
        format: session.meta?.format,
        mapPool: session.meta?.mapPool,
        firstActorMode: session.meta?.firstActorMode,
        steps: session.meta?.steps,
      },
      initiative: session.firstActorResult,
      actions: session.actions,
      vetoState: session.vetoState,
    };
    const blob = new Blob([JSON.stringify(transcript, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veto-${session.meta?.sessionId ?? 'unknown'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [session, sessionId]);

  // Persist a completed veto to local history (each client saves its own copy).
  useEffect(() => {
    if (
      !session.vetoState.isComplete ||
      savedHistoryRef.current ||
      !session.meta
    )
      return;
    savedHistoryRef.current = true;
    const decider = session.vetoState.deciderMap;
    const deciderSide = decider
      ? session.actions.find((a) => a.type === 'side' && a.mapId === decider)
      : undefined;
    const finalResult: SessionSummary['finalResult'] =
      session.vetoState.pickedMaps.map((p) => ({
        mapId: p.mapId,
        pickedBy: p.pickedBy,
        side: p.side,
        sidePickedBy: p.sidePickedBy,
      }));
    if (decider) {
      finalResult.push({
        mapId: decider,
        pickedBy: '',
        side: deciderSide?.side ?? '',
        sidePickedBy: deciderSide?.team ?? '',
      });
    }
    saveCompletedSession({
      sessionId: session.meta.sessionId,
      presetId: session.meta.presetId,
      presetName: session.meta.presetName ?? session.meta.presetId,
      format: session.meta.format,
      mapPool: session.meta.mapPool,
      teamAName: session.teamNames.a,
      teamBName: session.teamNames.b,
      firstActor: session.firstActorResult?.firstActor ?? null,
      presetSnapshot: session.meta.presetSnapshot,
      firstActorMode: session.meta.firstActorMode,
      actions: session.actions,
      finalResult,
      role: session.role,
    });
  }, [session]);

  const bothReady = session.readyState.a && session.readyState.b;
  // Once the veto has started (rejoin/spectator arriving mid-veto) skip the reveal.
  const vetoStarted = session.actions.length > 0;
  const isFinal = session.meta?.firstActorMode === 'upper-bracket-choice';
  const noCoinFlip =
    session.meta?.firstActorMode !== 'random' &&
    session.meta?.firstActorMode !== 'coinflip';
  const showBoard =
    session.firstActorResult !== null &&
    (noCoinFlip || coinRevealed || vetoStarted);
  const showCoinFlip = bothReady && !showBoard && !noCoinFlip;
  const isMyTurn =
    session.vetoState.currentTeam === session.role && session.isConnected;
  const choicePending = !!session.firstActorResult?.choicePending;
  const chooserTeam =
    session.firstActorResult?.chooserTeam ??
    session.firstActorResult?.flipWinner;

  // During setup the host sees all links. Once the first actor is established,
  // each participant can share only their own team link and the spectator link.
  const setupPhase = session.firstActorResult === null;
  const canShare = !!session.shareLinks && !session.vetoState.isComplete;
  const shareShowAll = setupPhase && session.isHost;
  const shareButton = canShare ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setShowShare(true)}
      aria-label="Share room links"
    >
      Share Links
    </Button>
  ) : undefined;

  const totalSteps = getFormatSteps(
    session.meta?.format ?? 'bo1',
    session.meta?.mapPool?.length ?? 0,
    session.firstActorResult?.firstActor ?? null,
    session.meta?.steps
  ).length;
  const phaseStep = Math.min(session.vetoState.currentStepIndex, totalSteps);
  const phasePct = totalSteps > 0 ? (phaseStep / totalSteps) * 100 : 0;

  const myTeamIntents =
    session.role === 'a'
      ? session.intents.teamA
      : session.role === 'b'
        ? session.intents.teamB
        : [];

  return (
    <div className="flex h-full flex-col">
      <Header leftSlot={shareButton} />

      <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {session.meta && (
          <RulesSummary
            rules={session.meta}
            starter={session.firstActorResult?.firstActor}
            teamNames={session.teamNames}
          />
        )}
        {session.storageWarning && (
          <p
            className="mx-auto w-full max-w-6xl text-sm text-muted-foreground"
            role="status"
          >
            {session.storageWarning}
          </p>
        )}
        {(session.connectionError ||
          session.connectionStatus.phase === 'error') && (
          <div
            className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-4"
            role="status"
          >
            <p className="max-w-prose text-sm">
              {session.connectionError ??
                'Could not connect automatically. Keep both captains’ rooms open and retry. Some networks still prevent peer connections.'}
            </p>
            <Button variant="outline" onClick={session.retryConnection}>
              Retry connection
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    JSON.stringify(
                      {
                        version: 1,
                        protocol: 'yjs-v2',
                        phase: session.connectionStatus.phase,
                        peerCount: session.peerCount,
                        rulesReady: !!session.meta,
                        acceptedActions: session.actions.length,
                        online: navigator.onLine,
                      },
                      null,
                      2
                    )
                  );
                  setReportFeedback(
                    'Connection report copied. No room links, tokens, or IP addresses are included.'
                  );
                } catch {
                  setReportFeedback('Could not copy the connection report.');
                }
              }}
            >
              Copy connection report
            </Button>
            {reportFeedback && (
              <p className="w-full text-xs text-muted-foreground">
                {reportFeedback}
              </p>
            )}
          </div>
        )}
        {vetoStarted &&
          !session.isConnected &&
          session.connectionStatus.phase !== 'error' && (
            <p
              className="mx-auto w-full max-w-6xl text-sm text-muted-foreground"
              role="status"
            >
              Reconnecting… Your veto progress is kept while recovery runs.
            </p>
          )}
        {session.loading &&
          !session.connectionError &&
          session.connectionStatus.phase !== 'error' && (
            <div
              className="flex flex-1 items-center justify-center"
              role="status"
              aria-live="polite"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="ml-3">
                Connecting to veto room… Keep the creator’s room open.
              </span>
            </div>
          )}

        {!session.loading && session.vetoState.isComplete && (
          <div className="flex flex-1 items-start justify-center pt-8">
            <ResultsScreen
              vetoState={session.vetoState}
              teamNames={session.teamNames}
              actions={session.actions}
              sessionId={session.meta?.sessionId ?? sessionId ?? ''}
              format={session.meta?.format ?? 'bo1'}
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
              isHost={session.isHost}
              links={session.shareLinks}
            />
          </div>
        )}

        {!session.loading && !session.vetoState.isComplete && showCoinFlip && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <CoinFlip
              teamNames={session.teamNames}
              result={session.firstActorResult}
              onRevealComplete={() => setCoinRevealed(true)}
            />
          </div>
        )}

        {!session.loading && !session.vetoState.isComplete && showBoard && (
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TeamPanel
                team="a"
                label={
                  session.displayRole === 'a' && session.role !== 'spectator'
                    ? 'Team A (You)'
                    : 'Team A'
                }
                name={session.teamNames.a}
                isMe={session.displayRole === 'a'}
                isReady={session.readyState.a}
                isActing={session.vetoState.currentTeam === 'a'}
                editable={false}
              />
              <TeamPanel
                team="b"
                label={
                  session.displayRole === 'b' && session.role !== 'spectator'
                    ? 'Team B (You)'
                    : 'Team B'
                }
                name={session.teamNames.b}
                isMe={session.displayRole === 'b'}
                isReady={session.readyState.b}
                isActing={session.vetoState.currentTeam === 'b'}
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

            {choicePending ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
                <p className="flex-1 text-sm font-medium">
                  {session.role === chooserTeam
                    ? session.firstActorResult?.mode === 'coinflip'
                      ? 'You won the coin flip! Choose which team starts the veto:'
                      : isFinal
                        ? 'Choose which team picks first:'
                        : 'Choose which team starts the veto:'
                    : `Waiting for ${chooserTeam === 'a' ? session.teamNames.a : session.teamNames.b} to choose…`}
                </p>
                {session.role === chooserTeam && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => session.chooseFirstActor('a')}
                      disabled={!session.isConnected}
                      aria-label={`${session.teamNames.a} ${isFinal ? 'picks first' : 'goes first'}`}
                    >
                      {session.teamNames.a} {isFinal ? 'picks first' : 'First'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => session.chooseFirstActor('b')}
                      disabled={!session.isConnected}
                      aria-label={`${session.teamNames.b} ${isFinal ? 'picks first' : 'goes first'}`}
                    >
                      {session.teamNames.b} {isFinal ? 'picks first' : 'First'}
                    </Button>
                  </div>
                )}
                <Timer
                  stepIndex={-1}
                  stepType="side"
                  seconds={Math.max(20, session.meta?.sideTimerSeconds ?? 35)}
                  isMyTurn={session.role === chooserTeam && session.isConnected}
                  enforcement={session.meta?.timerEnforcement ?? 'none'}
                  onTimeout={handleChoiceTimeout}
                />
              </div>
            ) : (
              <ActionBar
                currentStepIndex={session.vetoState.currentStepIndex}
                currentStep={session.vetoState.currentStep}
                isMyTurn={isMyTurn}
                selectedMapId={session.selectedMapId}
                teamNames={session.teamNames}
                pickBanSeconds={Math.max(
                  30,
                  session.meta?.pickBanTimerSeconds ?? 50
                )}
                sideSeconds={Math.max(20, session.meta?.sideTimerSeconds ?? 35)}
                timerEnforcement={session.meta?.timerEnforcement ?? 'none'}
                onConfirm={() =>
                  session.selectedMapId &&
                  session.submitMapAction(session.selectedMapId)
                }
                onTimeout={handleTimeout}
                onSide={session.submitSide}
              />
            )}

            <MapGrid
              mapPool={session.meta?.mapPool ?? []}
              vetoState={session.vetoState}
              selectedMapId={session.selectedMapId}
              role={session.role}
              isMyTurn={isMyTurn && !choicePending}
              currentStepType={session.vetoState.currentActionType}
              intents={myTeamIntents}
              onSelectMap={session.selectMap}
              onSide={session.submitSide}
            />

            <SequenceTimeline
              format={session.meta?.format ?? 'bo1'}
              mapPool={session.meta?.mapPool ?? []}
              actions={session.actions}
              currentStepIndex={session.vetoState.currentStepIndex}
              teamNames={session.teamNames}
              firstActorResult={session.firstActorResult}
              customSteps={session.meta?.steps}
              choicePending={choicePending}
            />
          </div>
        )}
      </main>

      <Branding />

      {showShare && canShare && session.shareLinks && (
        <ShareModal
          links={session.shareLinks}
          roomImportCode={session.meta?.roomImportCode}
          role={session.role}
          showAll={shareShowAll}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
