'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import type { Team } from '@/types/veto';
import type { FirstActorResult } from '@/lib/state-machine';

interface CoinFlipProps {
  teamNames: Record<Team, string>;
  result: FirstActorResult | null;
  onRevealComplete?: () => void;
}

const SETTLE_MS = 1500;
const HOLD_MS = 2200;

type Phase = 'waiting' | 'settling' | 'revealed';

function CoinFace({
  label,
  sub,
  back,
}: {
  label: string;
  sub: string;
  back?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center rounded-full border-2 border-accent/60 bg-gradient-to-br from-accent/25 to-accent/5 backface-hidden"
      style={back ? { transform: 'rotateY(180deg)' } : undefined}
    >
      <span className="text-3xl font-bold text-accent">{label}</span>
      <span className="mt-0.5 max-w-[5.5rem] truncate px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {sub}
      </span>
    </div>
  );
}

export function CoinFlip({
  teamNames,
  result,
  onRevealComplete,
}: CoinFlipProps) {
  const [phase, setPhase] = useState<Phase>('waiting');
  const onRevealRef = useRef(onRevealComplete);
  useEffect(() => {
    onRevealRef.current = onRevealComplete;
  });

  useEffect(() => {
    if (!result) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase('waiting');
      return;
    }
    // Only start animation if we're in waiting phase (first time or reset)
    if (phase === 'waiting') {
      setPhase('settling');
      const t1 = setTimeout(() => setPhase('revealed'), SETTLE_MS);
      // When choice is pending the board takes over — transition faster so the
      // interactive UI appears promptly. Otherwise hold the result on screen.
      const holdMs = result.choicePending ? 800 : HOLD_MS;
      const t2 = setTimeout(() => onRevealRef.current?.(), SETTLE_MS + holdMs);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.flipSeed]);

  const firstActor = result?.firstActor ?? 'a';
  const flipWinner = result?.flipWinner ?? firstActor;
  // Land on the flip winner's face: front = Team A, back (180°) = Team B. Add
  // full turns so the settle reads as a real spin.
  const restTransform = `rotateY(${1440 + (flipWinner === 'b' ? 180 : 0)}deg)`;

  const spinning = phase === 'settling';
  return (
    <Card className="flex w-full max-w-md flex-col items-center gap-5 p-8 text-center">
      <h2 className="font-serif text-2xl font-medium">Coin Flip</h2>

      <div className="[perspective:900px]">
        <div
          className={`relative h-28 w-28 preserve-3d ${spinning ? 'animate-coin-spin' : ''}`}
          style={
            spinning
              ? undefined
              : {
                  transform: restTransform,
                  transition: `transform ${SETTLE_MS}ms cubic-bezier(.18,.7,.2,1)`,
                }
          }
          aria-label={
            spinning
              ? 'Flipping coin'
              : `${flipWinner === 'a' ? teamNames.a : teamNames.b} won the flip`
          }
        >
          <CoinFace label="A" sub={teamNames.a} />
          <CoinFace label="B" sub={teamNames.b} back />
        </div>
      </div>

      <div className="min-h-12 h-auto w-full">
        {phase === 'revealed' && result ? (
          result.choicePending ? (
            // Choice is pending — show brief result only; choice UI lives in the board
            <div className="space-y-1" aria-live="polite">
              <div className="text-xl font-semibold">
                {result.flipWinner === 'a' ? teamNames.a : teamNames.b}{' '}
                <span className="text-muted-foreground">won the flip</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Choosing first mover…
              </p>
            </div>
          ) : (
            <div className="space-y-1" aria-live="polite">
              <div className="text-xl font-semibold">
                {firstActor === 'a' ? teamNames.a : teamNames.b}{' '}
                <span className="text-muted-foreground">goes first</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {result.mode === 'coinflip'
                  ? `Coin-flip winner: ${result.flipWinner === 'a' ? teamNames.a : teamNames.b}`
                  : 'Random coin flip'}
              </p>
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Flipping for first mover…
          </p>
        )}
      </div>
    </Card>
  );
}
