import type { EnemyThreat, PredictedEnemyFour, PredictedEnemyLead, PreviewCombatantMeta } from "./types";
import { getWeatherSetterKinds, hasWeatherAbuser } from "./threats";

export type EnemyFourLikelihoodInput = {
  four: number[];
  coarseScore: number;
  members: PreviewCombatantMeta[];
  threatCentrality: number;
  leadFlexibility: number;
  bestLeadScore: number;
  antiLikelyCoreScore?: number;
  reasons: string[];
};

export type EnemyLeadLikelihoodInput = {
  four: number[];
  lead: [number, number];
  coarseScore: number;
  threatIds: string[];
  modePressure: number;
  antiLikelyCoreScore?: number;
  reasons: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function softmaxScores(scores: number[], temperature: number, floor: number) {
  if (scores.length === 0) {
    return [];
  }

  const safeTemperature = Math.max(0.1, temperature);
  const shifted = scores.map((score) => score / safeTemperature);
  const maxScore = Math.max(...shifted);
  const raw = shifted.map((score) => Math.exp(score - maxScore));
  const total = raw.reduce((sum, value) => sum + value, 0) || 1;
  const normalized = raw.map((value) => value / total);
  const floored = normalized.map((value) => Math.max(floor, value));
  const renormalizedTotal = floored.reduce((sum, value) => sum + value, 0) || 1;
  return floored.map((value) => value / renormalizedTotal);
}

export function collectThreatCentrality(threats: EnemyThreat[], four: number[]) {
  const fourSet = new Set(four);
  return threats.reduce((sum, threat) => {
    const hitCount = threat.memberTeamIndices.filter((teamIndex) => fourSet.has(teamIndex)).length;
    if (hitCount === 0) {
      return sum;
    }
    if (threat.kind === "package") {
      return sum + threat.importance * (hitCount === threat.memberTeamIndices.length ? 1.1 : 0.35);
    }
    return sum + threat.importance * 0.55;
  }, 0);
}

export function inferFourLikelihoodReasons(members: PreviewCombatantMeta[]) {
  const reasons: string[] = [];
  for (const weather of ["rain", "sun", "sand", "snow"] as const) {
    if (
      members.some((member) => getWeatherSetterKinds(member).includes(weather)) &&
      members.some((member) => hasWeatherAbuser(member, weather))
    ) {
      reasons.push(`${weather[0].toUpperCase()}${weather.slice(1)} package is complete`);
    }
  }
  if (members.some((member) => member.supportFlags.trickRoom >= 0.45) && members.some((member) => member.roleTags.has("slowBreaker"))) {
    reasons.push("Trick Room mode is complete");
  }
  if (members.some((member) => member.supportFlags.fakeOut >= 0.45) && members.some((member) => member.supportFlags.setup >= 0.35 || member.supportFlags.speedControl >= 0.45)) {
    reasons.push("Fake Out supports their tempo line");
  }
  if (members.some((member) => member.roleTags.has("spread")) && members.some((member) => member.supportFlags.speedControl >= 0.45)) {
    reasons.push("spread pressure pairs with speed control");
  }
  return reasons.slice(0, 3);
}

export function predictEnemyBringDistribution(options: {
  choices: EnemyFourLikelihoodInput[];
  temperature?: number;
  floor?: number;
  topMassRetention?: number;
}) {
  const { choices } = options;
  const temperature = options.temperature ?? 650;
  const floor = options.floor ?? 0.03;
  void clamp(options.topMassRetention ?? 0.88, 0.55, 1);

  const scores = choices.map((choice) => {
    return (
      choice.coarseScore * 0.45 +
      choice.threatCentrality * 0.42 +
      choice.leadFlexibility * 14 +
      choice.bestLeadScore * 0.28 +
      (choice.antiLikelyCoreScore ?? 0) * 0.2
    );
  });
  const probabilities = softmaxScores(scores, temperature, floor);
  const ranked = choices
    .map((choice, index) => ({
      four: choice.four,
      probability: probabilities[index] ?? 0,
      score: scores[index] ?? 0,
      reasons: [...choice.reasons].slice(0, 3),
      leads: [] as PredictedEnemyLead[],
      lead: null,
    }))
    .sort((left, right) => right.probability - left.probability);

  const total = ranked.reduce((sum, entry) => sum + entry.probability, 0) || 1;

  return ranked.map((entry) => ({
    ...entry,
    probability: entry.probability / total,
  })) satisfies PredictedEnemyFour[];
}

export function predictEnemyLeadDistribution(options: {
  candidates: EnemyLeadLikelihoodInput[];
  temperature?: number;
  floor?: number;
}) {
  const { candidates } = options;
  const temperature = options.temperature ?? 320;
  const floor = options.floor ?? 0.05;
  const scores = candidates.map((candidate) => {
    return candidate.coarseScore * 0.6 + candidate.modePressure * 110 + (candidate.antiLikelyCoreScore ?? 0) * 0.28;
  });
  const probabilities = softmaxScores(scores, temperature, floor);

  return candidates
    .map((candidate, index) => ({
      lead: candidate.lead,
      probability: probabilities[index] ?? 0,
      score: scores[index] ?? 0,
      reasons: [...candidate.reasons].slice(0, 3),
      threatIds: candidate.threatIds,
    }))
    .sort((left, right) => right.probability - left.probability) satisfies PredictedEnemyLead[];
}
