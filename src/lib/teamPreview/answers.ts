import { getMultiplier } from "../effectiveness";
import { getDamagePreview, type BattleState } from "../engine";
import { calculateMatchupEloScore } from "../matchupElo";
import type {
  AnswerClass,
  AnswerScore,
  CoverageSummaryEntry,
  EnemyThreat,
  FourCoverageEvaluation,
  LeadAlignmentEvaluation,
  MustAnswerThreatExplanation,
  PredictedEnemyLead,
  PreviewCombatantMeta,
  UncoveredThreatExplanation,
} from "./types";
import { getWeatherSetterKinds } from "./threats";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pairKey(allyTeamIndex: number, threatId: string) {
  return `${allyTeamIndex}::${threatId}`;
}

function getThreatMembers(threat: EnemyThreat, enemyMetaByIndex: Map<number, PreviewCombatantMeta>) {
  return threat.memberTeamIndices
    .map((teamIndex) => enemyMetaByIndex.get(teamIndex) ?? null)
    .filter((entry): entry is PreviewCombatantMeta => Boolean(entry));
}

function getMoveAverageDamage(
  state: BattleState,
  attacker: PreviewCombatantMeta,
  defender: PreviewCombatantMeta,
  moveId: string,
  cache: Map<string, number>,
) {
  const key = `${attacker.combatant.id}:${defender.combatant.id}:${moveId}`;
  const cached = cache.get(key);
  if (typeof cached === "number") {
    return cached;
  }

  const move =
    attacker.damagingBeliefs.find((entry) => entry.move.id === moveId)?.move ??
    attacker.damagingMoves.find((entry) => entry.id === moveId) ??
    attacker.believedMoves.find((entry) => entry.move.id === moveId)?.move;
  const value = move ? getDamagePreview(state, attacker.combatant.id, defender.combatant.id, move)?.estimate.averagePercent ?? 0 : 0;
  cache.set(key, value);
  return value;
}

function getBestOutgoingDamage(
  state: BattleState,
  attacker: PreviewCombatantMeta,
  defender: PreviewCombatantMeta,
  cache: Map<string, number>,
) {
  let bestAverage = 0;
  let bestMax = 0;
  let confidence = 0;
  let moveName = "";

  for (const belief of attacker.damagingBeliefs) {
    const average = getMoveAverageDamage(state, attacker, defender, belief.move.id, cache);
    const max = getDamagePreview(state, attacker.combatant.id, defender.combatant.id, belief.move)?.estimate.maxPercent ?? 0;
    const weighted = average * (0.55 + belief.certainty * 0.45);
    if (weighted > bestAverage || (weighted === bestAverage && max > bestMax)) {
      bestAverage = weighted;
      bestMax = max;
      confidence = belief.certainty;
      moveName = belief.move.name;
    }
  }

  return { average: bestAverage, max: bestMax, confidence, moveName };
}

function getBestReturnHit(
  state: BattleState,
  attacker: PreviewCombatantMeta,
  defender: PreviewCombatantMeta,
  cache: Map<string, number>,
) {
  let bestAverage = 0;
  let bestConfidence = 0;
  for (const belief of attacker.damagingBeliefs) {
    const average = getMoveAverageDamage(state, attacker, defender, belief.move.id, cache) * (0.45 + belief.certainty * 0.55);
    if (average > bestAverage) {
      bestAverage = average;
      bestConfidence = belief.certainty;
    }
  }
  return { average: bestAverage, confidence: bestConfidence };
}

function evaluateDamageIntoThreat(
  state: BattleState,
  ally: PreviewCombatantMeta,
  threatMembers: PreviewCombatantMeta[],
  cache: Map<string, number>,
) {
  if (threatMembers.length === 0) {
    return { damagePressure: 0, guaranteedOhko: false, possibleOhko: false, strongTwoHko: false, meaningfulChip: false, confidence: 0, reasons: [] as string[] };
  }

  const targetSummaries = threatMembers.map((target) => getBestOutgoingDamage(state, ally, target, cache));
  const best = targetSummaries.reduce(
    (current, entry) =>
      entry.average > current.average || (entry.average === current.average && entry.max > current.max) ? entry : current,
    targetSummaries[0],
  );
  const averageDamage = targetSummaries.reduce((sum, entry) => sum + entry.average, 0) / targetSummaries.length;
  const maxDamage = Math.max(...targetSummaries.map((entry) => entry.max));
  const guaranteedOhko = maxDamage >= 100 && averageDamage >= 95;
  const possibleOhko = maxDamage >= 100;
  const strongTwoHko = averageDamage >= 55;
  const meaningfulChip = averageDamage >= 35;
  const reasons: string[] = [];
  if (guaranteedOhko) {
    reasons.push(`can reliably remove ${best.moveName || "the threat"}`);
  } else if (possibleOhko) {
    reasons.push("has real OHKO pressure");
  } else if (strongTwoHko) {
    reasons.push("applies strong two-hit pressure");
  } else if (meaningfulChip) {
    reasons.push("chips the threat meaningfully");
  }

  return {
    damagePressure: clamp(averageDamage * 1.5 + (guaranteedOhko ? 75 : possibleOhko ? 46 : strongTwoHko ? 28 : meaningfulChip ? 10 : -12), -15, 220),
    guaranteedOhko,
    possibleOhko,
    strongTwoHko,
    meaningfulChip,
    confidence: best.confidence,
    reasons,
  };
}

function evaluateSurvivalAndSafety(
  state: BattleState,
  ally: PreviewCombatantMeta,
  threatMembers: PreviewCombatantMeta[],
  cache: Map<string, number>,
) {
  if (threatMembers.length === 0) {
    return { survival: 0, boardSafety: 0, survivesLikelyHit: null as boolean | null, likelyReturnDamage: 0, reasons: [] as string[] };
  }

  const returnHits = threatMembers.map((member) => getBestReturnHit(state, member, ally, cache));
  const worstHit = Math.max(...returnHits.map((entry) => entry.average));
  const survivesLikelyHit = worstHit <= 90 ? true : worstHit >= 110 ? false : null;
  const typeSafety =
    threatMembers.reduce((sum, member) => {
      const strongestTypeWeight = member.likelyAttackTypes[0];
      if (!strongestTypeWeight || !ally.primaryType) {
        return sum;
      }
      return sum + (2 - getMultiplier(strongestTypeWeight.type, ally.primaryType, ally.secondaryType)) * 18;
    }, 0) / threatMembers.length;

  const survival =
    (survivesLikelyHit === true ? 68 : survivesLikelyHit === false ? -88 : -12) +
    clamp((100 - worstHit) * 0.65, -80, 80) +
    ally.bulkyScore / 1500;
  const boardSafety = clamp(typeSafety + (worstHit <= 50 ? 28 : worstHit <= 80 ? 12 : worstHit >= 120 ? -28 : 0), -40, 70);
  const reasons: string[] = [];
  if (survivesLikelyHit === true) {
    reasons.push("survives the likely return hit");
  } else if (survivesLikelyHit === false) {
    reasons.push("is unstable into the likely return hit");
  }
  if (boardSafety >= 24) {
    reasons.push("has good resist or immunity value");
  }

  return { survival, boardSafety, survivesLikelyHit, likelyReturnDamage: worstHit, reasons };
}

function evaluateSpeedAndDenial(
  ally: PreviewCombatantMeta,
  threat: EnemyThreat,
  threatMembers: PreviewCombatantMeta[],
) {
  const fastestThreatSpeed = Math.max(...threatMembers.map((member) => member.speed), 0);
  const slowestThreatSpeed = Math.min(...threatMembers.map((member) => member.speed), Infinity);
  const directSpeed = ally.speed > fastestThreatSpeed ? 1 : ally.speed >= slowestThreatSpeed ? 0.5 : 0;

  let speedControl = directSpeed > 0 ? 58 + directSpeed * 24 : 0;
  if (ally.supportFlags.tailwind >= 0.45 && ally.speed * 2 > slowestThreatSpeed) {
    speedControl += 38;
  }
  if (ally.supportFlags.trickRoom >= 0.45 && ally.speed < fastestThreatSpeed) {
    speedControl += 42;
  }
  if (ally.supportFlags.priority >= 0.45) {
    speedControl += 20;
  }
  if (ally.supportFlags.speedControl >= 0.45) {
    speedControl += 24;
  }

  let supportDenial = 0;
  const reasons: string[] = [];
  const tagSet = new Set(threat.modeTags);
  if ((tagSet.has("trickRoom") || threat.explanationTags.some((tag) => tag.includes("Trick Room"))) && ally.supportFlags.taunt >= 0.45) {
    supportDenial += 80;
    reasons.push("Taunt can deny their Trick Room line");
  }
  if ((tagSet.has("setup") || threat.explanationTags.some((tag) => tag.includes("setup"))) && ally.supportFlags.fakeOut >= 0.45) {
    supportDenial += 60;
    reasons.push("Fake Out can stop the setup turn");
  }
  if ((tagSet.has("setup") || tagSet.has("tempo")) && (ally.supportFlags.encore >= 0.45 || ally.supportFlags.disable >= 0.45)) {
    supportDenial += 48;
    reasons.push("Encore or Disable can punish their setup cycle");
  }
  if (tagSet.has("spread") && ally.supportFlags.wideGuard >= 0.45) {
    supportDenial += 86;
    reasons.push("Wide Guard blocks the spread line");
  }
  if (tagSet.has("fakeOut") && ally.supportFlags.quickGuard >= 0.45) {
    supportDenial += 54;
    reasons.push("Quick Guard checks their priority tempo");
  }
  if (!tagSet.has("spread") && ally.supportFlags.redirection >= 0.45) {
    supportDenial += 45;
    reasons.push("redirection can shield the board from single-target pressure");
  }
  if (tagSet.has("weather") && ally.supportFlags.weatherSetting >= 0.45) {
    supportDenial += 70;
    reasons.push("weather control can break the package");
  }

  return { speedControl, supportDenial, reasons };
}

function classifyAnswer(total: number, damage: ReturnType<typeof evaluateDamageIntoThreat>, survival: ReturnType<typeof evaluateSurvivalAndSafety>, denial: number): AnswerClass {
  if (total >= 220 && (damage.possibleOhko || damage.strongTwoHko || denial >= 75) && survival.survivesLikelyHit !== false) {
    return "hard";
  }
  if (total >= 130 && (damage.meaningfulChip || denial >= 45 || survival.survivesLikelyHit === true)) {
    return "soft";
  }
  if (total >= 55 && (damage.meaningfulChip || denial >= 32 || damage.possibleOhko)) {
    return "emergency";
  }
  return "none";
}

export function buildThreatAnswerMatrix(
  state: BattleState,
  allyMetas: PreviewCombatantMeta[],
  enemyMetas: PreviewCombatantMeta[],
  threats: EnemyThreat[],
) {
  const enemyMetaByIndex = new Map(enemyMetas.map((meta) => [meta.member.teamIndex, meta] as const));
  const damageCache = new Map<string, number>();
  const answerMap = new Map<string, AnswerScore>();

  for (const threat of threats) {
    const threatMembers = getThreatMembers(threat, enemyMetaByIndex);
    for (const ally of allyMetas) {
      const damage = evaluateDamageIntoThreat(state, ally, threatMembers, damageCache);
      const survival = evaluateSurvivalAndSafety(state, ally, threatMembers, damageCache);
      const denial = evaluateSpeedAndDenial(ally, threat, threatMembers);
      const confidencePenalty = damage.confidence > 0 ? (1 - damage.confidence) * 28 : 10;
      const total =
        calculateMatchupEloScore({
          guaranteedOhko: damage.guaranteedOhko,
          possibleOhko: damage.possibleOhko,
          survivesBestIncomingHit: survival.survivesLikelyHit,
          speedDelta: ally.speed - Math.max(...threatMembers.map((member) => member.speed), 0),
          offensivePressure: damage.damagePressure + denial.supportDenial * 0.45,
          conservativePressure: survival.boardSafety + denial.speedControl * 0.55 - confidencePenalty,
        }) +
        survival.survival +
        denial.supportDenial * 0.85;

      answerMap.set(
        pairKey(ally.member.teamIndex, threat.id),
        {
          allyTeamIndex: ally.member.teamIndex,
          threatId: threat.id,
          classification: classifyAnswer(total, damage, survival, denial.supportDenial),
          total,
          damagePressure: damage.damagePressure,
          survival: survival.survival,
          speedControl: denial.speedControl,
          boardSafety: survival.boardSafety,
          supportDenial: denial.supportDenial,
          confidencePenalty,
          guaranteedOhko: damage.guaranteedOhko,
          possibleOhko: damage.possibleOhko,
          strongTwoHko: damage.strongTwoHko,
          meaningfulChip: damage.meaningfulChip,
          survivesLikelyHit: survival.survivesLikelyHit,
          likelyReturnDamage: survival.likelyReturnDamage,
          reasons: [...damage.reasons, ...survival.reasons, ...denial.reasons].slice(0, 4),
        } satisfies AnswerScore,
      );
    }
  }

  return answerMap;
}

function getAnswer(answerMap: Map<string, AnswerScore>, allyTeamIndex: number, threatId: string) {
  return answerMap.get(pairKey(allyTeamIndex, threatId));
}

function scoreThreatCoverage(
  threat: EnemyThreat,
  answerMap: Map<string, AnswerScore>,
  chosenFour: number[],
) {
  const answers = chosenFour
    .map((teamIndex) => getAnswer(answerMap, teamIndex, threat.id))
    .filter((entry): entry is AnswerScore => Boolean(entry))
    .sort((left, right) => right.total - left.total);
  const hardAnswers = answers.filter((entry) => entry.classification === "hard");
  const softAnswers = answers.filter((entry) => entry.classification === "soft");
  const emergencyAnswers = answers.filter((entry) => entry.classification === "emergency");
  const importanceWeight = threat.importance * (0.65 + threat.likelyBringContribution * 0.25 + threat.likelyLeadContribution * 0.1);

  let totalScore = 0;
  let uncoveredPenalty = 0;
  let secondaryCoverageBonus = 0;
  const mustAnswerThreats: MustAnswerThreatExplanation[] = [];
  const uncoveredThreats: UncoveredThreatExplanation[] = [];

  if (hardAnswers.length === 0 && softAnswers.length === 0 && emergencyAnswers.length === 0) {
    uncoveredPenalty += importanceWeight * 1.15;
    uncoveredThreats.push({
      threatId: threat.id,
      label: threat.label,
      severity: importanceWeight,
      note: `No clear bring in this four reliably checks ${threat.label}.`,
    });
  } else if (hardAnswers.length === 0 && softAnswers.length > 0) {
    uncoveredPenalty += importanceWeight * 0.45;
    mustAnswerThreats.push({
      threatId: threat.id,
      label: threat.label,
      importance: threat.importance,
      likelyBringWeight: threat.likelyBringContribution,
      recommendedAnswerSlots: softAnswers.map((entry) => entry.allyTeamIndex),
      note: `${softAnswers[0]?.allyTeamIndex ?? "A slot"} is only a soft answer into ${threat.label}.`,
    });
    totalScore += softAnswers[0].total * 0.18;
  } else if (hardAnswers.length > 0) {
    totalScore += hardAnswers[0].total * 0.22 + importanceWeight * 0.16;
    if (hardAnswers.length === 1) {
      mustAnswerThreats.push({
        threatId: threat.id,
        label: threat.label,
        importance: threat.importance,
        likelyBringWeight: threat.likelyBringContribution,
        recommendedAnswerSlots: [hardAnswers[0].allyTeamIndex],
        note: `${hardAnswers[0].allyTeamIndex} is your only hard answer to ${threat.label}.`,
      });
      uncoveredPenalty += importanceWeight * 0.18;
    }
    if (hardAnswers.length > 1) {
      secondaryCoverageBonus += Math.min(importanceWeight * 0.3, hardAnswers[1].total * 0.12);
    } else if (softAnswers.length > 0) {
      secondaryCoverageBonus += Math.min(importanceWeight * 0.15, softAnswers[0].total * 0.08);
    }
  } else if (emergencyAnswers.length > 0) {
    uncoveredPenalty += importanceWeight * 0.7;
    mustAnswerThreats.push({
      threatId: threat.id,
      label: threat.label,
      importance: threat.importance,
      likelyBringWeight: threat.likelyBringContribution,
      recommendedAnswerSlots: emergencyAnswers.map((entry) => entry.allyTeamIndex),
      note: `${threat.label} is covered only by emergency checks in this four.`,
    });
  }

  return {
    answers,
    hardAnswers,
    softAnswers,
    emergencyAnswers,
    totalScore,
    uncoveredPenalty,
    secondaryCoverageBonus,
    mustAnswerThreats,
    uncoveredThreats,
  };
}

export function evaluateFourThreatCoverage(options: {
  chosenFour: number[];
  threats: EnemyThreat[];
  answerMap: Map<string, AnswerScore>;
  mustAnswerThreatWeight?: number;
  overloadPenaltyWeight?: number;
}) {
  const { chosenFour, threats, answerMap } = options;
  const mustAnswerThreatWeight = options.mustAnswerThreatWeight ?? 1;
  const overloadPenaltyWeight = options.overloadPenaltyWeight ?? 1;

  let totalScore = 0;
  let uncoveredPenalty = 0;
  let secondaryCoverageBonus = 0;
  let packageDenialBonus = 0;
  const mustAnswerThreats: MustAnswerThreatExplanation[] = [];
  const uncoveredThreats: UncoveredThreatExplanation[] = [];
  const coverageSummary: CoverageSummaryEntry[] = [];
  const uniqueAnswerCounter = new Map<number, number>();

  const importantThreats = threats
    .map((threat) => ({ threat, coverage: scoreThreatCoverage(threat, answerMap, chosenFour) }))
    .sort((left, right) => right.threat.importance - left.threat.importance);

  for (const { threat, coverage } of importantThreats) {
    totalScore += coverage.totalScore;
    uncoveredPenalty += coverage.uncoveredPenalty * mustAnswerThreatWeight;
    secondaryCoverageBonus += coverage.secondaryCoverageBonus;
    mustAnswerThreats.push(...coverage.mustAnswerThreats);
    uncoveredThreats.push(...coverage.uncoveredThreats);
    coverageSummary.push({
      enemyLabel: threat.label,
      hardAnswers: coverage.hardAnswers.map((entry) => entry.allyTeamIndex),
      softAnswers: coverage.softAnswers.map((entry) => entry.allyTeamIndex),
      emergencyAnswers: coverage.emergencyAnswers.map((entry) => entry.allyTeamIndex),
    });

    if (coverage.hardAnswers.length === 1) {
      uniqueAnswerCounter.set(
        coverage.hardAnswers[0].allyTeamIndex,
        (uniqueAnswerCounter.get(coverage.hardAnswers[0].allyTeamIndex) ?? 0) + 1,
      );
    }

    if (threat.kind === "package" && (coverage.hardAnswers.length > 0 || coverage.softAnswers.length >= 2)) {
      packageDenialBonus += threat.importance * (coverage.hardAnswers.length > 0 ? 0.18 : 0.1);
    }
  }

  const overloaded = [...uniqueAnswerCounter.entries()].filter(([, count]) => count > 1);
  const overloadPenalty = overloaded.reduce((sum, [, count]) => sum + (count - 1) * 70, 0) * overloadPenaltyWeight;

  return {
    totalScore: totalScore + secondaryCoverageBonus + packageDenialBonus - uncoveredPenalty - overloadPenalty,
    uncoveredPenalty,
    overloadPenalty,
    secondaryCoverageBonus,
    packageDenialBonus,
    leadAlignmentBase: 0,
    mustAnswerThreats,
    uncoveredThreats,
    coverageSummary: coverageSummary.slice(0, 8),
    uniqueAnswerSlots: overloaded.map(([teamIndex]) => teamIndex),
  } satisfies FourCoverageEvaluation;
}

function getLeadThreatWeight(threat: EnemyThreat, leadSet: Set<number>) {
  const memberHits = threat.memberTeamIndices.filter((teamIndex) => leadSet.has(teamIndex)).length;
  if (memberHits === 0) {
    return 0;
  }
  if (threat.kind === "package") {
    return memberHits === threat.memberTeamIndices.length ? 1 : 0.4;
  }
  return 1;
}

export function evaluateLeadAlignment(options: {
  allyLead: [number, number];
  chosenFour: number[];
  threats: EnemyThreat[];
  answerMap: Map<string, AnswerScore>;
  predictedEnemyLeads: PredictedEnemyLead[];
}) {
  const { allyLead, chosenFour, threats, answerMap, predictedEnemyLeads } = options;
  const allyLeadSet = new Set(allyLead);
  const allyBenchSet = new Set(chosenFour.filter((teamIndex) => !allyLeadSet.has(teamIndex)));
  let score = 0;
  const reasons: string[] = [];

  for (const predictedLead of predictedEnemyLeads) {
    const enemyLeadSet = new Set(predictedLead.lead);
    for (const threat of threats) {
      const leadWeight = getLeadThreatWeight(threat, enemyLeadSet);
      if (leadWeight <= 0) {
        continue;
      }

      const leadAnswers = allyLead
        .map((teamIndex) => getAnswer(answerMap, teamIndex, threat.id))
        .filter((entry): entry is AnswerScore => Boolean(entry));
      const benchAnswers = chosenFour
        .filter((teamIndex) => allyBenchSet.has(teamIndex))
        .map((teamIndex) => getAnswer(answerMap, teamIndex, threat.id))
        .filter((entry): entry is AnswerScore => Boolean(entry));

      const bestLeadAnswer = leadAnswers.sort((left, right) => right.total - left.total)[0] ?? null;
      const bestBenchAnswer = benchAnswers.sort((left, right) => right.total - left.total)[0] ?? null;
      const weight = predictedLead.probability * threat.importance * leadWeight;

      if (bestLeadAnswer?.classification === "hard") {
        score += weight * 0.12;
      } else if (bestLeadAnswer?.classification === "soft") {
        score += weight * 0.05;
      } else if (bestBenchAnswer?.classification === "hard") {
        score -= weight * 0.1;
        reasons.push(`${threat.label} is likely to lead before your best answer hits the field.`);
      } else {
        score -= weight * 0.16;
        reasons.push(`${threat.label} can pressure turn one if they lead it.`);
      }
    }
  }

  return {
    score,
    reasons: [...new Set(reasons)].slice(0, 3),
  } satisfies LeadAlignmentEvaluation;
}
