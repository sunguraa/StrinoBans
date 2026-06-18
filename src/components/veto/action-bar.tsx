"use client";

import { Button } from "@/components/ui/button";
import { Timer } from "./timer";
import type { Team } from "@/types/veto";
import type { VetoStep } from "@/lib/state-machine";

interface ActionBarProps {
  currentStepIndex: number;
  currentStep: VetoStep | null;
  isMyTurn: boolean;
  selectedMapId: string | null;
  teamNames: Record<Team, string>;
  pickBanSeconds: number;
  sideSeconds: number;
  timerEnforcement: "none" | "random-after-timeout";
  onConfirm: () => void;
  onTimeout: () => void;
  onSide: (side: "attacker" | "defender") => void;
}

export function ActionBar({
  currentStepIndex,
  currentStep,
  isMyTurn,
  selectedMapId,
  teamNames,
  pickBanSeconds,
  sideSeconds,
  timerEnforcement,
  onConfirm,
  onTimeout,
  onSide,
}: ActionBarProps) {
  if (!currentStep) return null;

  const isSide = currentStep.type === "side";
  const seconds = isSide ? sideSeconds : pickBanSeconds;
  const actingName = currentStep.team === "a" ? teamNames.a : teamNames.b;
  const prompt = isSide
    ? `${actingName}: choose Attacker or Defender`
    : isMyTurn
      ? `Your turn: ${currentStep.type === "ban" ? "ban" : "pick"} a map`
      : `Waiting for ${actingName} to ${currentStep.type === "ban" ? "ban" : "pick"}`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium">{prompt}</p>
      </div>

      {isSide && isMyTurn && (
        <div className="flex gap-2">
          <Button type="button" onClick={() => onSide("attacker")} aria-label="Choose attacker">
            Attacker
          </Button>
          <Button type="button" onClick={() => onSide("defender")} aria-label="Choose defender">
            Defender
          </Button>
        </div>
      )}

      {!isSide && (
        <Button
          type="button"
          disabled={!isMyTurn || !selectedMapId}
          onClick={onConfirm}
          aria-label={currentStep.type === "ban" ? "Confirm ban" : "Confirm pick"}
        >
          Confirm {currentStep.type === "ban" ? "Ban" : "Pick"}
        </Button>
      )}

      <Timer
        stepIndex={currentStepIndex}
        stepType={currentStep.type}
        seconds={seconds}
        isMyTurn={isMyTurn}
        enforcement={timerEnforcement}
        onTimeout={onTimeout}
      />
    </div>
  );
}
