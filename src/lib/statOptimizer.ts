import type { PokemonType } from "../data/typeChart";
import {
  calculateRoughDamage,
  type DamageCategory,
  type DamageTerrain,
  type DamageWeather,
} from "./damage";
import {
  CHAMPIONS_MAX_STAT_POINTS_PER_STAT,
  CHAMPIONS_STAT_ORDER,
  CHAMPIONS_TOTAL_STAT_POINTS,
  getChampionsComputedStats,
  getChampionsNatureMultiplier,
  getChampionsNatureOptions,
  type ChampionsComputedStats,
  type ChampionsNatureId,
  type ChampionsNonHpStatId,
  type ChampionsStatId,
  type ChampionsStatSpread,
} from "./championsStats";
import { getDefaultDamageAbilityId, type DamageAbilityId } from "./damageAbilities";
import type { DamageItemId } from "./damageItems";
import type { PokemonRecord } from "./pokemonDb";

export type TrainingRemainderMode = "auto" | "attack" | "specialAttack" | "speed";

export type TrainingOptimizerAttack = {
  id: string;
  attacker: PokemonRecord;
  label: string;
  type: PokemonType;
  basePower: number;
  category: DamageCategory;
  isSpreadMove: boolean;
  attackerAbility?: DamageAbilityId;
  attackerAbilityName?: string | null;
  attackerItem?: DamageItemId;
  attackerStatSpread?: ChampionsStatSpread | null;
  attackerGrounded?: boolean;
  movesetSource?: "custom" | "preset" | "none";
};

export type TrainingOptimizerSettings = {
  weather: DamageWeather;
  terrain: DamageTerrain;
  defenderGrounded: boolean;
  attackerStatStage: number;
  defenderStatStage: number;
  defenderAbility?: DamageAbilityId;
  defenderItem?: DamageItemId;
  reflect?: boolean;
  lightScreen?: boolean;
  auroraVeil?: boolean;
};

export type TrainingOptimizerThreatDetail = {
  attackerId: string;
  attackerName: string;
  attackId: string;
  moveLabel: string;
  attackType: PokemonType;
  category: DamageCategory;
  minDamage: number;
  maxDamage: number;
  minPercent: number;
  maxPercent: number;
  averagePercent: number;
  guaranteedHitsSurvived: number;
  attackerItem?: DamageItemId;
  movesetSource?: "custom" | "preset" | "none";
};

export type TrainingOptimizerBreakpointGain = {
  attackerId: string;
  attackerName: string;
  moveLabel: string;
  attackType: PokemonType;
  category: DamageCategory;
  previousHitsSurvived: number;
  nextHitsSurvived: number;
  previousKoLabel: string;
  nextKoLabel: string;
  previousMaxPercent: number;
  nextMaxPercent: number;
};

export type TrainingOptimizerSummary = {
  evaluatedThreatCount: number;
  totalGuaranteedHits: number;
  survivesOneHitCount: number;
  survivesTwoHitCount: number;
  survivesThreeHitCount: number;
  worstMaxPercent: number;
  averageMaxPercent: number;
  score: number;
};

export type TrainingOptimizerResult = {
  spread: ChampionsStatSpread;
  stats: ChampionsComputedStats;
  summary: TrainingOptimizerSummary;
  threatDetails: TrainingOptimizerThreatDetail[];
};

type TrainingThreatGroup = {
  attackerId: string;
  attackerName: string;
  attacks: TrainingOptimizerAttack[];
};

type DefensivePointAllocation = {
  hp: number;
  def: number;
  spd: number;
};

const DEFENSIVE_STATS: ChampionsStatId[] = ["hp", "def", "spd"];
const SCORE_HIT_CAP = 4;
const EMPTY_SUMMARY: TrainingOptimizerSummary = {
  evaluatedThreatCount: 0,
  totalGuaranteedHits: 0,
  survivesOneHitCount: 0,
  survivesTwoHitCount: 0,
  survivesThreeHitCount: 0,
  worstMaxPercent: 0,
  averageMaxPercent: 0,
  score: 0,
};

export function getGuaranteedHitsSurvived(maxHp: number, maxDamage: number) {
  if (!Number.isFinite(maxHp) || maxHp <= 0) {
    return 0;
  }

  if (!Number.isFinite(maxDamage) || maxDamage <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.floor((maxHp - 1) / maxDamage));
}

export function getKoThresholdLabel(guaranteedHitsSurvived: number) {
  if (!Number.isFinite(guaranteedHitsSurvived)) {
    return "immune";
  }

  if (guaranteedHitsSurvived <= 0) {
    return "OHKO";
  }

  return `${guaranteedHitsSurvived + 1}HKO`;
}

function getPreferredOffenseOrder(
  pokemon: PokemonRecord,
  mode: TrainingRemainderMode,
): ChampionsNonHpStatId[] {
  const primary = pokemon.baseStats.atk >= pokemon.baseStats.spa ? "atk" : "spa";
  const secondary = primary === "atk" ? "spa" : "atk";

  if (mode === "attack") {
    return ["atk", "spe", "spa"];
  }

  if (mode === "specialAttack") {
    return ["spa", "spe", "atk"];
  }

  if (mode === "speed") {
    return ["spe", primary, secondary];
  }

  return [primary, "spe", secondary];
}

export function buildTrainingStatSpread(
  pokemon: PokemonRecord,
  allocation: DefensivePointAllocation,
  nature: ChampionsNatureId,
  remainderMode: TrainingRemainderMode,
): ChampionsStatSpread {
  const statPoints = {
    hp: allocation.hp,
    atk: 0,
    def: allocation.def,
    spa: 0,
    spd: allocation.spd,
    spe: 0,
  } satisfies Record<ChampionsStatId, number>;
  let remaining =
    CHAMPIONS_TOTAL_STAT_POINTS - allocation.hp - allocation.def - allocation.spd;

  for (const statId of getPreferredOffenseOrder(pokemon, remainderMode)) {
    if (remaining <= 0) {
      break;
    }

    const added = Math.min(CHAMPIONS_MAX_STAT_POINTS_PER_STAT, remaining);
    statPoints[statId] = added;
    remaining -= added;
  }

  return {
    nature,
    statPoints,
  };
}

function groupTrainingAttacks(attacks: readonly TrainingOptimizerAttack[]) {
  const groups = new Map<string, TrainingThreatGroup>();

  for (const attack of attacks) {
    const attackerId = attack.attacker.id;
    const existing = groups.get(attackerId);

    if (existing) {
      existing.attacks.push(attack);
      continue;
    }

    groups.set(attackerId, {
      attackerId,
      attackerName: attack.attacker.name,
      attacks: [attack],
    });
  }

  return [...groups.values()];
}

function buildThreatDetail(options: {
  attack: TrainingOptimizerAttack;
  defender: PokemonRecord;
  defenderSpread: ChampionsStatSpread;
  settings: TrainingOptimizerSettings;
}) {
  const { attack, defender, defenderSpread, settings } = options;
  const estimate = calculateRoughDamage({
    attacker: attack.attacker,
    defender,
    attackType: attack.type,
    moveName: attack.label,
    basePower: attack.basePower,
    category: attack.category,
    isSpreadMove: attack.isSpreadMove,
    weather: settings.weather,
    terrain: settings.terrain,
    attackerGrounded: attack.attackerGrounded ?? true,
    defenderGrounded: settings.defenderGrounded,
    attackerStatStage: settings.attackerStatStage,
    defenderStatStage: settings.defenderStatStage,
    attackerAbility: attack.attackerAbility ?? getDefaultDamageAbilityId(attack.attacker),
    attackerAbilityName: attack.attackerAbilityName ?? null,
    defenderAbility: settings.defenderAbility ?? getDefaultDamageAbilityId(defender),
    attackerItem: attack.attackerItem ?? "none",
    defenderItem: settings.defenderItem ?? "none",
    reflect: settings.reflect ?? false,
    lightScreen: settings.lightScreen ?? false,
    auroraVeil: settings.auroraVeil ?? false,
    attackerStatSpread: attack.attackerStatSpread ?? null,
    defenderStatSpread: defenderSpread,
  });

  return {
    attackerId: attack.attacker.id,
    attackerName: attack.attacker.name,
    attackId: attack.id,
    moveLabel: attack.label,
    attackType: estimate.effectiveAttackType,
    category: attack.category,
    minDamage: estimate.minDamage,
    maxDamage: estimate.maxDamage,
    minPercent: estimate.minPercent,
    maxPercent: estimate.maxPercent,
    averagePercent: estimate.averagePercent,
    guaranteedHitsSurvived: getGuaranteedHitsSurvived(estimate.defenderHp, estimate.maxDamage),
    attackerItem: attack.attackerItem,
    movesetSource: attack.movesetSource,
  } satisfies TrainingOptimizerThreatDetail;
}

function getBestThreatDetail(options: {
  group: TrainingThreatGroup;
  defender: PokemonRecord;
  defenderSpread: ChampionsStatSpread;
  settings: TrainingOptimizerSettings;
}) {
  let best: TrainingOptimizerThreatDetail | null = null;

  for (const attack of options.group.attacks) {
    const detail = buildThreatDetail({
      attack,
      defender: options.defender,
      defenderSpread: options.defenderSpread,
      settings: options.settings,
    });

    if (!best || detail.maxPercent > best.maxPercent) {
      best = detail;
      continue;
    }

    if (detail.maxPercent === best.maxPercent && detail.averagePercent > best.averagePercent) {
      best = detail;
    }
  }

  return best;
}

function calculateSummary(details: readonly TrainingOptimizerThreatDetail[]) {
  if (details.length === 0) {
    return EMPTY_SUMMARY;
  }

  let totalGuaranteedHits = 0;
  let survivesOneHitCount = 0;
  let survivesTwoHitCount = 0;
  let survivesThreeHitCount = 0;
  let worstMaxPercent = 0;
  let maxPercentTotal = 0;

  for (const detail of details) {
    const cappedHits = Math.min(detail.guaranteedHitsSurvived, SCORE_HIT_CAP);
    totalGuaranteedHits += cappedHits;

    if (detail.guaranteedHitsSurvived >= 1) {
      survivesOneHitCount += 1;
    }

    if (detail.guaranteedHitsSurvived >= 2) {
      survivesTwoHitCount += 1;
    }

    if (detail.guaranteedHitsSurvived >= 3) {
      survivesThreeHitCount += 1;
    }

    worstMaxPercent = Math.max(worstMaxPercent, detail.maxPercent);
    maxPercentTotal += detail.maxPercent;
  }

  const averageMaxPercent = maxPercentTotal / details.length;
  const score =
    totalGuaranteedHits * 100 +
    survivesTwoHitCount * 25 +
    survivesThreeHitCount * 35 +
    survivesOneHitCount * 5 -
    worstMaxPercent / 10 -
    averageMaxPercent / 20;

  return {
    evaluatedThreatCount: details.length,
    totalGuaranteedHits,
    survivesOneHitCount,
    survivesTwoHitCount,
    survivesThreeHitCount,
    worstMaxPercent,
    averageMaxPercent,
    score,
  } satisfies TrainingOptimizerSummary;
}

function evaluateTrainingSpread(options: {
  defender: PokemonRecord;
  defenderSpread: ChampionsStatSpread;
  groups: readonly TrainingThreatGroup[];
  settings: TrainingOptimizerSettings;
}): TrainingOptimizerResult {
  const threatDetails = options.groups
    .map((group) =>
      getBestThreatDetail({
        group,
        defender: options.defender,
        defenderSpread: options.defenderSpread,
        settings: options.settings,
      }),
    )
    .filter((detail): detail is TrainingOptimizerThreatDetail => detail !== null)
    .sort((left, right) => right.maxPercent - left.maxPercent);

  return {
    spread: options.defenderSpread,
    stats: getChampionsComputedStats(options.defender, { spread: options.defenderSpread }),
    summary: calculateSummary(threatDetails),
    threatDetails,
  };
}

function compareTrainingOptimizerResults(
  left: TrainingOptimizerResult,
  right: TrainingOptimizerResult,
) {
  return (
    right.summary.totalGuaranteedHits - left.summary.totalGuaranteedHits ||
    right.summary.survivesTwoHitCount - left.summary.survivesTwoHitCount ||
    right.summary.survivesThreeHitCount - left.summary.survivesThreeHitCount ||
    right.summary.survivesOneHitCount - left.summary.survivesOneHitCount ||
    left.summary.worstMaxPercent - right.summary.worstMaxPercent ||
    left.summary.averageMaxPercent - right.summary.averageMaxPercent ||
    right.stats.spe - left.stats.spe ||
    right.stats.atk + right.stats.spa - (left.stats.atk + left.stats.spa) ||
    getSpreadSortValue(right.spread) - getSpreadSortValue(left.spread)
  );
}

function getSpreadSortValue(spread: ChampionsStatSpread) {
  return CHAMPIONS_STAT_ORDER.reduce((total, statId, index) => {
    return total + spread.statPoints[statId] * (index + 1);
  }, 0);
}

function getDefensiveNatureSignature(nature: ChampionsNatureId) {
  return `${getChampionsNatureMultiplier(nature, "def")}:${getChampionsNatureMultiplier(nature, "spd")}`;
}

function getNatureTieBreakScore(pokemon: PokemonRecord, spread: ChampionsStatSpread) {
  const stats = getChampionsComputedStats(pokemon, { spread });
  const primary = pokemon.baseStats.atk >= pokemon.baseStats.spa ? stats.atk : stats.spa;
  const secondary = pokemon.baseStats.atk >= pokemon.baseStats.spa ? stats.spa : stats.atk;

  return primary * 10_000 + stats.spe * 100 + secondary;
}

function getDefensiveNatureRepresentatives(
  pokemon: PokemonRecord,
  allocation: DefensivePointAllocation,
  remainderMode: TrainingRemainderMode,
  natures: readonly ChampionsNatureId[],
) {
  const bySignature = new Map<string, { nature: ChampionsNatureId; score: number }>();

  for (const nature of natures) {
    const spread = buildTrainingStatSpread(pokemon, allocation, nature, remainderMode);
    const signature = getDefensiveNatureSignature(nature);
    const score = getNatureTieBreakScore(pokemon, spread);
    const existing = bySignature.get(signature);

    if (!existing || score > existing.score) {
      bySignature.set(signature, { nature, score });
    }
  }

  return [...bySignature.values()].map((entry) => entry.nature);
}

function getDefensiveResultKey(result: TrainingOptimizerResult) {
  return `${result.stats.hp}:${result.stats.def}:${result.stats.spd}`;
}

function pushProvisionalResult(
  provisionalResults: TrainingOptimizerResult[],
  result: TrainingOptimizerResult,
  limit: number,
) {
  provisionalResults.push(result);
  provisionalResults.sort(compareTrainingOptimizerResults);

  if (provisionalResults.length > limit) {
    provisionalResults.pop();
  }
}

export function findOptimalTrainingSpreads(options: {
  defender: PokemonRecord;
  attacks: readonly TrainingOptimizerAttack[];
  settings: TrainingOptimizerSettings;
  resultLimit?: number;
  remainderMode?: TrainingRemainderMode;
}) {
  const resultLimit = Math.max(1, options.resultLimit ?? 12);
  const provisionalLimit = Math.max(resultLimit * 12, resultLimit + 20);
  const remainderMode = options.remainderMode ?? "auto";
  const groups = groupTrainingAttacks(options.attacks);
  const provisionalResults: TrainingOptimizerResult[] = [];
  let candidateCount = 0;

  if (groups.length === 0) {
    return {
      results: [],
      baseline: null,
      candidateCount,
      evaluatedThreatCount: 0,
    };
  }

  const natures = getChampionsNatureOptions().map((option) => option.id);

  for (let hp = 0; hp <= CHAMPIONS_MAX_STAT_POINTS_PER_STAT; hp += 1) {
    for (let def = 0; def <= CHAMPIONS_MAX_STAT_POINTS_PER_STAT; def += 1) {
      for (let spd = 0; spd <= CHAMPIONS_MAX_STAT_POINTS_PER_STAT; spd += 1) {
        if (hp + def + spd > CHAMPIONS_TOTAL_STAT_POINTS) {
          continue;
        }

        const allocation = { hp, def, spd };
        const representativeNatures = getDefensiveNatureRepresentatives(
          options.defender,
          allocation,
          remainderMode,
          natures,
        );

        for (const nature of representativeNatures) {
          candidateCount += 1;
          const spread = buildTrainingStatSpread(
            options.defender,
            allocation,
            nature,
            remainderMode,
          );
          const result = evaluateTrainingSpread({
            defender: options.defender,
            defenderSpread: spread,
            groups,
            settings: options.settings,
          });

          pushProvisionalResult(provisionalResults, result, provisionalLimit);
        }
      }
    }
  }

  const seenDefensiveResults = new Set<string>();
  const results: TrainingOptimizerResult[] = [];

  for (const result of provisionalResults.sort(compareTrainingOptimizerResults)) {
    const defensiveKey = getDefensiveResultKey(result);

    if (seenDefensiveResults.has(defensiveKey)) {
      continue;
    }

    seenDefensiveResults.add(defensiveKey);
    results.push(result);

    if (results.length >= resultLimit) {
      break;
    }
  }

  return {
    results,
    baseline: null,
    candidateCount,
    evaluatedThreatCount: groups.length,
  };
}

export function evaluateTrainingBaseline(options: {
  defender: PokemonRecord;
  spread: ChampionsStatSpread;
  attacks: readonly TrainingOptimizerAttack[];
  settings: TrainingOptimizerSettings;
}) {
  const groups = groupTrainingAttacks(options.attacks);

  if (groups.length === 0) {
    return null;
  }

  return evaluateTrainingSpread({
    defender: options.defender,
    defenderSpread: options.spread,
    groups,
    settings: options.settings,
  });
}

export function getDefensivePointTotal(spread: ChampionsStatSpread) {
  return DEFENSIVE_STATS.reduce((total, statId) => total + spread.statPoints[statId], 0);
}

export function getTrainingBreakpointGains(
  result: TrainingOptimizerResult,
  baseline: TrainingOptimizerResult | null | undefined,
) {
  if (!baseline) {
    return [];
  }

  const baselineByAttacker = new Map(
    baseline.threatDetails.map((detail) => [detail.attackerId, detail] as const),
  );
  const gains: TrainingOptimizerBreakpointGain[] = [];

  for (const detail of result.threatDetails) {
    const previous = baselineByAttacker.get(detail.attackerId);

    if (!previous || detail.guaranteedHitsSurvived <= previous.guaranteedHitsSurvived) {
      continue;
    }

    gains.push({
      attackerId: detail.attackerId,
      attackerName: detail.attackerName,
      moveLabel: detail.moveLabel,
      attackType: detail.attackType,
      category: detail.category,
      previousHitsSurvived: previous.guaranteedHitsSurvived,
      nextHitsSurvived: detail.guaranteedHitsSurvived,
      previousKoLabel: getKoThresholdLabel(previous.guaranteedHitsSurvived),
      nextKoLabel: getKoThresholdLabel(detail.guaranteedHitsSurvived),
      previousMaxPercent: previous.maxPercent,
      nextMaxPercent: detail.maxPercent,
    });
  }

  return gains.sort((left, right) => {
    const leftGain = left.nextHitsSurvived - left.previousHitsSurvived;
    const rightGain = right.nextHitsSurvived - right.previousHitsSurvived;

    return (
      rightGain - leftGain ||
      left.nextMaxPercent - right.nextMaxPercent ||
      left.attackerName.localeCompare(right.attackerName)
    );
  });
}

export function getTrainingAttackBreakpointGains(options: {
  defender: PokemonRecord;
  result: TrainingOptimizerResult;
  baselineSpread: ChampionsStatSpread;
  attacks: readonly TrainingOptimizerAttack[];
  settings: TrainingOptimizerSettings;
}) {
  const attackById = new Map(options.attacks.map((attack) => [attack.id, attack] as const));
  const gains: TrainingOptimizerBreakpointGain[] = [];

  for (const detail of options.result.threatDetails) {
    const attack = attackById.get(detail.attackId);

    if (!attack) {
      continue;
    }

    const previous = buildThreatDetail({
      attack,
      defender: options.defender,
      defenderSpread: options.baselineSpread,
      settings: options.settings,
    });

    if (detail.guaranteedHitsSurvived <= previous.guaranteedHitsSurvived) {
      continue;
    }

    gains.push({
      attackerId: detail.attackerId,
      attackerName: detail.attackerName,
      moveLabel: detail.moveLabel,
      attackType: detail.attackType,
      category: detail.category,
      previousHitsSurvived: previous.guaranteedHitsSurvived,
      nextHitsSurvived: detail.guaranteedHitsSurvived,
      previousKoLabel: getKoThresholdLabel(previous.guaranteedHitsSurvived),
      nextKoLabel: getKoThresholdLabel(detail.guaranteedHitsSurvived),
      previousMaxPercent: previous.maxPercent,
      nextMaxPercent: detail.maxPercent,
    });
  }

  return gains.sort((left, right) => {
    const leftGain = left.nextHitsSurvived - left.previousHitsSurvived;
    const rightGain = right.nextHitsSurvived - right.previousHitsSurvived;

    return (
      rightGain - leftGain ||
      left.nextMaxPercent - right.nextMaxPercent ||
      left.attackerName.localeCompare(right.attackerName)
    );
  });
}
