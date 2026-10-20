import { getFormatSteps, type VetoStep } from '@/lib/state-machine';
import { MAP_POOL } from '@/lib/maps';
import type { FirstActorMode, Format, Team } from '@/types/veto';

const POLICIES: Record<string, string> = {
  coinflip: 'Coin flip: winner chooses the starter',
  'team-a-choice': 'Seeded: Team A chooses the starter',
  'team-a': 'Fixed: Team A starts',
  random: 'Legacy random: coin winner starts',
  'upper-bracket-choice': 'Upper-bracket finalist chooses its veto position',
};

export function RulesSummary({
  rules,
  starter,
  teamNames,
}: {
  rules: {
    presetName?: string;
    presetId?: string;
    format: string;
    mapPool: string[];
    firstActorMode?: FirstActorMode;
    steps?: VetoStep[];
  };
  starter?: Team;
  teamNames: Record<Team, string>;
}) {
  const steps = getFormatSteps(
    rules.format as Format,
    rules.mapPool.length,
    starter,
    rules.steps
  );
  const isFinal = rules.firstActorMode === 'upper-bracket-choice';
  return (
    <details className="mx-auto w-full min-w-0 max-w-6xl rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer leading-relaxed wrap-anywhere">
        <span className="font-semibold">
          {rules.presetName ?? rules.presetId ?? 'Custom preset'}
        </span>{' '}
        · {rules.format.toUpperCase()} · {rules.mapPool.length} maps
        <span className="ml-2 text-muted-foreground">
          {starter
            ? `${teamNames[starter]} ${isFinal ? 'picks first' : 'starts the veto'}`
            : isFinal
              ? 'First pick pending'
              : 'Starter pending'}
        </span>
      </summary>
      <p className="mt-3">{POLICIES[rules.firstActorMode ?? 'random']}</p>
      {isFinal && (
        <p className="mt-1 text-muted-foreground">
          BO5 only. The upper-bracket finalist (Team A) gets both bans as its
          reward for coming from the winners bracket.
        </p>
      )}
      <p className="mt-2 leading-relaxed text-muted-foreground">
        Pool:{' '}
        {rules.mapPool
          .map((id) => MAP_POOL.find((map) => map.id === id)?.name ?? id)
          .join(', ')}
        .
      </p>
      <ol className="mt-3 list-inside list-decimal space-y-1">
        {steps.map((step, index) => (
          <li key={index}>
            {step.actor === 'upper-bracket'
              ? teamNames.a
              : starter
                ? teamNames[step.team]
                : step.team === 'a'
                  ? 'First veto role'
                  : 'Second veto role'}
            :{' '}
            {step.type === 'side'
              ? `chooses own starting side for ${step.forDecider ? 'the decider' : `pick ${(step.forPickIndex ?? 0) + 1}`}`
              : step.type}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Starting the veto does not necessarily mean making the first map pick.
      </p>
    </details>
  );
}
