import type { UnsupportedMechanicMarker } from "../engine";
import type { FourCoverageEvaluation, PredictedEnemyFour, PreviewObjectiveBreakdown } from "./types";

export type TeamPreviewConfidence = "high" | "medium" | "low";

export type PreviewScenario = {
  allyFourSlotIndices: number[];
  allyLeadSlotIndices: [number, number];
  allyBackSlotIndices: [number, number];
  enemyFourSlotIndices: number[];
  enemyLeadSlotIndices: [number, number];
  enemyBackSlotIndices: [number, number];
  enemyBringProbability: number;
  enemyLeadProbability: number;
  scenarioTags: string[];
  unsupportedMechanics: UnsupportedMechanicMarker[];
};

export type PreviewScenarioScore = {
  scenario: PreviewScenario;
  expectedScore: number;
  robustFloor: number;
  conditionalRegret: number;
  mustAnswerCoverage: number;
  answerOverloadPenalty: number;
  leadStability: number;
  benchValue: number;
  unsupportedPenalty: number;
  finalScore: PreviewObjectiveBreakdown;
};

export type EnemyBringDistributionEntry = {
  four: number[];
  probability: number;
  score: number;
  reasons: string[];
  leads: PredictedEnemyFour["leads"];
  lead?: [number, number] | null;
};

export type TeamPreviewScenarioMatrixSummary = {
  allyFourCount: number;
  enemyFourCount: number;
  allyLeadPairCount: number;
  enemyLeadPairCount: number;
  scenarioCount: number;
  retainedEnemyFourCount: number;
  evaluatedEnemyFourCount: number;
  scoringFormula: string;
};

export function enumerateLeadPairsForFour(four: number[]) {
  const leads: Array<[number, number]> = [];
  for (let left = 0; left < four.length; left += 1) {
    for (let right = left + 1; right < four.length; right += 1) {
      leads.push([four[left], four[right]]);
    }
  }
  return leads;
}

export function getBackSlots(four: number[], lead: [number, number]): [number, number] {
  return four.filter((slot) => !lead.includes(slot)).sort((left, right) => left - right) as [number, number];
}

export function buildScenarioMatrixSummary(options: {
  allyFours: number[][];
  enemyFours: number[][];
  retainedEnemyFourCount: number;
}) {
  const allyLeadPairCount = options.allyFours.reduce((sum, four) => sum + enumerateLeadPairsForFour(four).length, 0);
  const enemyLeadPairCount = options.enemyFours.reduce((sum, four) => sum + enumerateLeadPairsForFour(four).length, 0);
  return {
    allyFourCount: options.allyFours.length,
    enemyFourCount: options.enemyFours.length,
    allyLeadPairCount,
    enemyLeadPairCount,
    scenarioCount: allyLeadPairCount * enemyLeadPairCount,
    retainedEnemyFourCount: options.retainedEnemyFourCount,
    evaluatedEnemyFourCount: options.enemyFours.length,
    scoringFormula:
      "robust: must-answer coverage gate, then robustFloor and regret; likely: expectedScore minus catastrophic regret; hybrid: expectedScore + robustFloor - conditionalRegret - unsupportedPenalty.",
  } satisfies TeamPreviewScenarioMatrixSummary;
}

export function getCoverageGatePenalty(coverage: FourCoverageEvaluation | undefined) {
  return coverage && coverage.uncoveredThreats.length > 0 ? coverage.uncoveredPenalty : 0;
}
