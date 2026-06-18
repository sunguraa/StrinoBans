'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Team } from '@/types/veto';
import type { CoinFlipResult } from '@/lib/state-machine';

interface CoinFlipProps {
  teamNames: Record<Team, string>;
  coinFlip: CoinFlipResult | null;
  seededPick?: boolean;
  role: Team | 'spectator';
  onChooseFirstActor?: (firstActor: Team) => void;
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
  coinFlip,
  seededPick,
  role,
  onChooseFirstActor,
  onRevealComplete,
}: CoinFlipProps) {
  const [phase, setPhase] = useState<Phase>('waiting');
  const onRevealRef = useRef(onRevealComplete);
  useEffect(() => {
    onRevealRef.current = onRevealComplete;
  });

  useEffect(() => {
    if (!coinFlip) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase('waiting');
      return;
    }
    // Only start animation if we're in waiting phase (first time or reset)
    if (phase === 'waiting') {
      setPhase('settling');
      const t1 = setTimeout(() => setPhase('revealed'), SETTLE_MS);
      const t2 = setTimeout(() => onRevealRef.current?.(), SETTLE_MS + HOLD_MS);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coinFlip?.seed]);

  // Seeded pick: Team A chooses the first mover instead of a coin flip.
  if (seededPick && !coinFlip) {
    if (role !== 'a') {
      return (
        <Card className="w-full max-w-md p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Waiting for {teamNames.a} to choose the first mover…
          </p>
        </Card>
      );
    }
    return (
      <Card className="w-full max-w-md space-y-4 p-6 text-center">
        <h2 className="font-serif text-2xl font-medium">Seeded pick</h2>
        <p className="text-sm text-muted-foreground">
          Choose who picks/bans first.
        </p>
        <div className="flex justify-center gap-3">
          <Button
            type="button"
            onClick={() => onChooseFirstActor?.('a')}
            aria-label={`${teamNames.a} first`}
          >
            {teamNames.a} first
          </Button>
          <Button
            type="button"
            onClick={() => onChooseFirstActor?.('b')}
            aria-label={`${teamNames.b} first`}
          >
            {teamNames.b} first
          </Button>
        </div>
      </Card>
    );
  }

  const winner = coinFlip?.winner ?? 'a';
  // Land on the winner's face: front = Team A, back (180°) = Team B. Add full
  // turns so the settle reads as a real spin.
  const restTransform = `rotateY(${1440 + (winner === 'b' ? 180 : 0)}deg)`;

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
              : `${winner === 'a' ? teamNames.a : teamNames.b} won the flip`
          }
        >
          <CoinFace label="A" sub={teamNames.a} />
          <CoinFace label="B" sub={teamNames.b} back />
        </div>
      </div>

      <div className="h-12">
        {phase === 'revealed' && coinFlip ? (
          <div className="space-y-1" aria-live="polite">
            <div className="text-xl font-semibold">
              {winner === 'a' ? teamNames.a : teamNames.b}{' '}
              <span className="text-muted-foreground">goes first</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {coinFlip.method === 'seeded-pick'
                ? 'Seeded — chosen by Team A'
                : 'Random coin flip'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Flipping for first mover…
          </p>
        )}
      </div>
    </Card>
  );
}
