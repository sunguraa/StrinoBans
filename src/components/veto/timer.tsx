"use client";

import { useEffect, useRef, useState } from "react";
import type { StepType } from "@/lib/state-machine";
import { playTickSound, playUrgentSound } from "@/lib/sound";

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
  leniency = 3,
  isMyTurn,
  enforcement,
  onTimeout,
}: TimerProps) {
  const [remaining, setRemaining] = useState(seconds);

  // Keep the latest callback/flags in refs so the countdown effect can read them
  // without listing them as dependencies. The deadline must only reset when the
  // step (or its duration) changes — never when a peer's presence pings or a map
  // hover rebuilds the parent `session` object and hands us a new `onTimeout`.
  const onTimeoutRef = useRef(onTimeout);
  const isMyTurnRef = useRef(isMyTurn);
  const enforcementRef = useRef(enforcement);
  const leniencyRef = useRef(leniency);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
    isMyTurnRef.current = isMyTurn;
    enforcementRef.current = enforcement;
    leniencyRef.current = leniency;
  });

  useEffect(() => {
    let fired = false;
    let tickPlayed = false;
    let urgentPlayed = false;
    const deadline = Date.now() + seconds * 1000;

    const tick = () => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((deadline - now) / 1000));
      setRemaining(left);

      if (!tickPlayed && left <= 10 && left > 5) {
        tickPlayed = true;
        playTickSound();
      }
      if (!urgentPlayed && left <= 5 && left > 0) {
        urgentPlayed = true;
        playUrgentSound();
      }

      if (
        isMyTurnRef.current &&
        enforcementRef.current === "random-after-timeout" &&
        !fired &&
        now > deadline + leniencyRef.current * 1000
      ) {
        fired = true;
        onTimeoutRef.current();
      }
    };

    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [stepIndex, stepType, seconds]);

  const label = stepType === "side" ? "Side" : "Pick/Ban";
  const isUrgent = remaining <= 5;
  const isWarning = remaining <= 10 && remaining > 5;
  const color = isUrgent ? "text-destructive animate-pulse" : isWarning ? "text-yellow-400" : "text-foreground";

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2" role="timer" aria-label={`${label} timer`}>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className={`font-mono text-xl font-bold ${color}`} aria-live="polite">
        {remaining}s
      </span>
      {isUrgent && <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" aria-hidden="true" />}
    </div>
  );
}
