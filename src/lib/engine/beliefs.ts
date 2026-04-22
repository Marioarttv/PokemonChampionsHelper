import { normalizeMoveKey } from "./moveRegistry";
import type {
  BattleCombatantState,
  BattleMoveOption,
  BattleState,
  EnemyAssumptionSummary,
} from "./types";

export type BelievedMove = {
  move: BattleMoveOption;
  certainty: number;
  membershipWeight: number;
  policyWeight: number;
  rawMembershipWeight: number;
  inferred: boolean;
};

type BeliefOptions = {
  topN?: number;
  minimumCandidateWeight?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getBelievedMoves(
  combatant: BattleCombatantState,
  options: BeliefOptions = {},
): BelievedMove[] {
  const minimumCandidateWeight = options.minimumCandidateWeight ?? 0.05;
  const byMoveKey = new Map<string, BelievedMove>();

  for (const move of combatant.knownMoves) {
    byMoveKey.set(normalizeMoveKey(move.name), {
      move,
      certainty: 1,
      membershipWeight: 0,
      policyWeight: 0,
      rawMembershipWeight: 1,
      inferred: false,
    });
  }

  for (const move of combatant.candidateMoves) {
    const key = normalizeMoveKey(move.name);
    if (byMoveKey.has(key)) {
      continue;
    }

    byMoveKey.set(key, {
      move,
      certainty: clamp(move.candidateWeight, minimumCandidateWeight, 1),
      membershipWeight: 0,
      policyWeight: 0,
      rawMembershipWeight: clamp(move.candidateWeight, minimumCandidateWeight, 1),
      inferred: move.source === "inferred" || move.source === "candidate",
    });
  }

  const ordered = [...byMoveKey.values()].sort((left, right) => {
    if (left.certainty !== right.certainty) {
      return right.certainty - left.certainty;
    }
    if (left.rawMembershipWeight !== right.rawMembershipWeight) {
      return right.rawMembershipWeight - left.rawMembershipWeight;
    }
    return left.move.name.localeCompare(right.move.name);
  });

  const truncated = typeof options.topN === "number" ? ordered.slice(0, options.topN) : ordered;
  const totalWeight = truncated.reduce((sum, entry) => sum + entry.rawMembershipWeight, 0) || 1;

  return truncated.map((entry) => ({
    ...entry,
    membershipWeight: entry.rawMembershipWeight / totalWeight,
    // `policyWeight` remains the normalized move-on-set belief for existing consumers.
    policyWeight: entry.rawMembershipWeight / totalWeight,
  }));
}

export function findBelievedMoveWeight(
  combatant: BattleCombatantState,
  moveId: string,
  options?: BeliefOptions,
) {
  return getBelievedMoves(combatant, options).find((entry) => entry.move.id === moveId)?.policyWeight ?? 0;
}

export function summarizeEnemyBeliefs(
  state: BattleState,
  options: BeliefOptions = {},
): EnemyAssumptionSummary[] {
  return Object.values(state.combatants)
    .filter((combatant) => combatant.side === "enemy")
    .map((combatant) => {
      const moves = getBelievedMoves(combatant, {
        topN: options.topN ?? 4,
        minimumCandidateWeight: options.minimumCandidateWeight,
      });
      const dependsOnInferredMoves = moves.some((entry) => entry.inferred);
      const averageConfidence =
        moves.length > 0 ? moves.reduce((sum, entry) => sum + entry.certainty, 0) / moves.length : 0;

      return {
        combatantId: combatant.id,
        label: combatant.label,
        dependsOnInferredMoves,
        confidenceSummary:
          averageConfidence >= 0.85 ? "high" : averageConfidence >= 0.55 ? "medium" : "low",
        moves: moves.map((entry) => ({
          moveName: entry.move.name,
          certainty: entry.certainty,
          policyWeight: entry.policyWeight,
          source: entry.move.source,
          inferred: entry.inferred,
        })),
      } satisfies EnemyAssumptionSummary;
    });
}
