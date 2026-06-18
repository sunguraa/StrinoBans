"use client";

import { useEffect, useRef, useState } from "react";
import type { StepType } from "@/lib/state-machine";

interface TimerProps {
  stepIndex: number;
  stepType: StepType;
  seconds: number;
  leniency?: number;
  isMyTurn: boolean;
  enforcement: "none" | "random-after-timeout";
  onTimeout: () => void;
}

export function Timer({
  stepIndex,
  stepType,
  seconds,
  leniency = 5,
  isMyTurn,
  enforcement,
  onTimeout,
}: TimerProps) {
  const [remaining, setRemaining] = useState(seconds);
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const deadline = Date.now() + seconds * 1000;

    const tick = () => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((deadline - now) / 1000));
      setRemaining(left);

      if (isMyTurn && enforcement === "random-after-timeout" && !firedRef.current && now > deadline + leniency * 1000) {
        firedRef.current = true;
        onTimeout();
      }
    };

    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [stepIndex, stepType, seconds, leniency, isMyTurn, enforcement, onTimeout]);

  const label = stepType === "side" ? "Side" : "Pick/Ban";
  const color = remaining <= 10 ? "text-destructive" : remaining <= 20 ? "text-yellow-400" : "text-foreground";

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2" role="timer" aria-label={`${label} timer`}>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className={`font-mono text-xl font-bold ${color}`} aria-live="polite">
        {remaining}s
      </span>
    </div>
  );
}
