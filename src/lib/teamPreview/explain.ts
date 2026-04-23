import type {
  FourCoverageEvaluation,
  PredictedEnemyFour,
  PreviewObjectiveBreakdown,
} from "./types";

function roundImportance(value: number) {
  return Math.round(value * 10) / 10;
}

export function buildCoverageReasons(coverage: FourCoverageEvaluation) {
  const reasons: Array<{ feature: string; label: string; delta: number }> = [];

  for (const threat of coverage.mustAnswerThreats.slice(0, 2)) {
    if (threat.recommendedAnswerSlots.length === 1) {
      reasons.push({
        feature: "must_answer_threat",
        label: `Bring slot ${threat.recommendedAnswerSlots[0]} because it is your only hard answer to ${threat.label}.`,
        delta: threat.importance * 0.3,
      });
    } else {
      reasons.push({
        feature: "must_answer_threat",
        label: `Respect ${threat.label}; your reliable answers are slots ${threat.recommendedAnswerSlots.join(", ")}.`,
        delta: threat.importance * 0.2,
      });
    }
  }

  if (coverage.packageDenialBonus > 0) {
    reasons.push({
      feature: "package_denial",
      label: "This four has real package-denial coverage against their likely mode.",
      delta: coverage.packageDenialBonus,
    });
  }

  if (coverage.overloadPenalty > 0) {
    reasons.push({
      feature: "answer_overload",
      label: "Avoid overloading one slot as the only answer to multiple top threats.",
      delta: -coverage.overloadPenalty,
    });
  }

  return reasons;
}

export function buildCoverageDangerNotes(coverage: FourCoverageEvaluation) {
  return coverage.uncoveredThreats.slice(0, 3).map((threat) => threat.note);
}

export function buildPredictedEnemyFoursSummary(predictions: PredictedEnemyFour[]) {
  return predictions.slice(0, 4).map((prediction) => ({
    four: prediction.four,
    lead: prediction.lead ?? prediction.leads[0]?.lead ?? null,
    probability: prediction.probability,
    reasons: prediction.reasons,
  }));
}

export function buildObjectiveBreakdown(modeScores: PreviewObjectiveBreakdown) {
  return {
    robustScore: roundImportance(modeScores.robustScore),
    likelyScore: roundImportance(modeScores.likelyScore),
    hybridScore: roundImportance(modeScores.hybridScore),
  };
}
