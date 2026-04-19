export type MatchupEloTargetLike = {
  possibleOhko: boolean;
  guaranteedOhko: boolean;
  survivesBestIncomingHit: boolean | null;
  speedDelta: number;
  targetScore: number;
};

export type MatchupEloSummary = {
  coverageCount: number;
  guaranteedCount: number;
  surviveCount: number;
  nonLosingSurviveCount: number;
  fasterCount: number;
  notSlowerCount: number;
  minTargetScore: number;
  averageTargetScore: number;
};

export function calculateMatchupEloScore(options: {
  guaranteedOhko: boolean;
  possibleOhko: boolean;
  survivesBestIncomingHit: boolean | null;
  speedDelta: number;
  offensivePressure: number;
  conservativePressure: number;
}) {
  const {
    guaranteedOhko,
    possibleOhko,
    survivesBestIncomingHit,
    speedDelta,
    offensivePressure,
    conservativePressure,
  } = options;

  return (
    (guaranteedOhko ? 900 : possibleOhko ? 620 : 0) +
    (survivesBestIncomingHit === true ? 230 : survivesBestIncomingHit === false ? -260 : 35) +
    (speedDelta > 0 ? 150 : speedDelta === 0 ? 70 : 0) +
    offensivePressure +
    conservativePressure
  );
}

export function summarizeMatchupElo<T extends MatchupEloTargetLike>(targetResults: T[]): MatchupEloSummary {
  if (targetResults.length === 0) {
    return {
      coverageCount: 0,
      guaranteedCount: 0,
      surviveCount: 0,
      nonLosingSurviveCount: 0,
      fasterCount: 0,
      notSlowerCount: 0,
      minTargetScore: 0,
      averageTargetScore: 0,
    };
  }

  const coverageCount = targetResults.filter((result) => result.possibleOhko).length;
  const guaranteedCount = targetResults.filter((result) => result.guaranteedOhko).length;
  const surviveCount = targetResults.filter((result) => result.survivesBestIncomingHit === true).length;
  const nonLosingSurviveCount = targetResults.filter((result) => result.survivesBestIncomingHit !== false).length;
  const fasterCount = targetResults.filter((result) => result.speedDelta > 0).length;
  const notSlowerCount = targetResults.filter((result) => result.speedDelta >= 0).length;
  const minTargetScore = Math.min(...targetResults.map((result) => result.targetScore));
  const averageTargetScore =
    targetResults.reduce((total, result) => total + result.targetScore, 0) / targetResults.length;

  return {
    coverageCount,
    guaranteedCount,
    surviveCount,
    nonLosingSurviveCount,
    fasterCount,
    notSlowerCount,
    minTargetScore,
    averageTargetScore,
  };
}

export function compareMatchupEloSummaries(left: MatchupEloSummary, right: MatchupEloSummary) {
  if (left.coverageCount !== right.coverageCount) {
    return right.coverageCount - left.coverageCount;
  }

  if (left.guaranteedCount !== right.guaranteedCount) {
    return right.guaranteedCount - left.guaranteedCount;
  }

  if (left.surviveCount !== right.surviveCount) {
    return right.surviveCount - left.surviveCount;
  }

  if (left.fasterCount !== right.fasterCount) {
    return right.fasterCount - left.fasterCount;
  }

  if (left.minTargetScore !== right.minTargetScore) {
    return right.minTargetScore - left.minTargetScore;
  }

  return right.averageTargetScore - left.averageTargetScore;
}
