import type { PokemonType } from "../data/typeChart";
import { getTypeFromLabel } from "../data/typeChart";
import { getMultiplier } from "./effectiveness";
import {
  getAbilityAdjustedAttackType,
  getAttackerAbilityModifier,
  getDefenderAbilityModifier,
  getDefenderAbilityTypeMultiplier,
  getFieldAbilityModifier,
  getDamageAbilityLabel,
  type DamageAbilityId,
} from "./damageAbilities";
import {
  getAttackerItemModifier,
  getDamageItemLabel,
  getDefenderItemModifier,
  type DamageItemId,
} from "./damageItems";
import {
  calculateChampionsHpStat,
  calculateChampionsOtherStat,
  getChampionsComputedStats,
  type ChampionsStatSpread,
} from "./championsStats";
import type { PokemonRecord } from "./pokemonDb";

export type DamageCategory = "physical" | "special";
export type DamageWeather = "none" | "sun" | "rain" | "sand" | "snow";
export type DamageTerrain = "none" | "electric" | "grassy" | "psychic" | "misty";
export type DamageBattleRole = "attacker" | "defender";

export type MultihitInput = number | [number, number];

export type DamageEstimateInput = {
  attacker: PokemonRecord;
  defender: PokemonRecord;
  attackType: PokemonType;
  moveName?: string;
  basePower: number;
  category: DamageCategory;
  isSpreadMove: boolean;
  multihit?: MultihitInput | null;
  weather?: DamageWeather;
  terrain?: DamageTerrain;
  attackerGrounded?: boolean;
  defenderGrounded?: boolean;
  attackerStatStage?: number;
  defenderStatStage?: number;
  attackerAbility?: DamageAbilityId;
  attackerAbilityName?: string | null;
  defenderAbility?: DamageAbilityId;
  attackerItem?: DamageItemId;
  defenderItem?: DamageItemId;
  helpingHand?: boolean;
  reflect?: boolean;
  lightScreen?: boolean;
  auroraVeil?: boolean;
  attackerStatSpread?: ChampionsStatSpread | null;
  defenderStatSpread?: ChampionsStatSpread | null;
};

export type DamageEstimate = {
  inputBasePower: number;
  effectiveBasePower: number;
  baseDamage: number;
  minDamage: number;
  maxDamage: number;
  averageDamage: number;
  minPercent: number;
  maxPercent: number;
  averagePercent: number;
  hits: number;
  hitRange: { min: number; max: number };
  perHitMinDamage: number;
  perHitMaxDamage: number;
  perHitAverageDamage: number;
  attackStat: number;
  defenseStat: number;
  defenderHp: number;
  stabMultiplier: number;
  typeMultiplier: number;
  effectiveAttackType: PokemonType;
  spreadMultiplier: number;
  weatherMultiplier: number;
  terrainMultiplier: number;
  attackerAbilityMultiplier: number;
  defenderAbilityMultiplier: number;
  fieldAbilityMultiplier: number;
  abilityMultiplier: number;
  attackerItemMultiplier: number;
  defenderItemMultiplier: number;
  itemMultiplier: number;
  helpingHandMultiplier: number;
  screenMultiplier: number;
  finalModifier: number;
  attackerStageMultiplier: number;
  defenderStageMultiplier: number;
  attackerAbilityName: string;
  defenderAbilityName: string;
  attackerItemName: string;
  defenderItemName: string;
};

const LEVEL_FACTOR = 22;
const MIN_RANDOM_MULTIPLIER = 0.85;
const AVG_RANDOM_MULTIPLIER = 0.925;
const MAX_RANDOM_MULTIPLIER = 1;
const STAB_MULTIPLIER = 1.5;
export const SPREAD_MOVE_MULTIPLIER = 0.75;
export const DOUBLES_SCREEN_MULTIPLIER = 2 / 3;
const AEGISLASH_SHIELD_STATS = {
  atk: 50,
  def: 140,
  spa: 50,
  spd: 140,
} as const;
const AEGISLASH_BLADE_STATS = {
  atk: 140,
  def: 50,
  spa: 140,
  spd: 50,
} as const;
const WEATHER_BALL_TYPES: Partial<Record<DamageWeather, PokemonType>> = {
  sun: "fire",
  rain: "water",
  sand: "rock",
  snow: "ice",
};

export function getLevel50HpValue(baseHp: number) {
  return calculateChampionsHpStat(baseHp, 0);
}

export function getLevel50OtherStatValue(baseStat: number) {
  return calculateChampionsOtherStat(baseStat, 0, 1);
}

export function getStatStageMultiplier(stage: number) {
  if (stage >= 0) {
    return (2 + stage) / 2;
  }

  return 2 / (2 - stage);
}

function hasNamedAbility(pokemon: PokemonRecord, abilityName: string) {
  return Object.values(pokemon.abilities).some((value) => value === abilityName);
}

function isAegislashWithStanceChange(pokemon: PokemonRecord) {
  return pokemon.baseSpecies === "Aegislash" && hasNamedAbility(pokemon, "Stance Change");
}

function normalizeMoveNameKey(moveName: string) {
  return moveName.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hasMegaSolAbility(abilityName: string | null | undefined) {
  return abilityName ? normalizeMoveNameKey(abilityName) === "megasol" : false;
}

function isWeatherBallMove(moveName: string | null | undefined) {
  return moveName ? normalizeMoveNameKey(moveName) === "weatherball" : false;
}

export function isLowKickMove(moveName: string | null | undefined) {
  return moveName ? normalizeMoveNameKey(moveName) === "lowkick" : false;
}

export function getLowKickBasePowerFromWeightKg(weightkg: number | null | undefined) {
  if (typeof weightkg !== "number" || !Number.isFinite(weightkg) || weightkg < 10) {
    return 20;
  }

  if (weightkg < 25) {
    return 40;
  }

  if (weightkg < 50) {
    return 60;
  }

  if (weightkg < 100) {
    return 80;
  }

  if (weightkg < 200) {
    return 100;
  }

  return 120;
}

export function getAttackerEffectiveWeather({
  weather = "none",
  attackerAbilityName,
}: {
  weather?: DamageWeather;
  attackerAbilityName?: string | null;
}) {
  return hasMegaSolAbility(attackerAbilityName) ? "sun" : weather;
}

export function getDamageScreenMultiplier({
  category,
  reflect = false,
  lightScreen = false,
  auroraVeil = false,
}: {
  category: DamageCategory;
  reflect?: boolean;
  lightScreen?: boolean;
  auroraVeil?: boolean;
}) {
  if (auroraVeil) {
    return DOUBLES_SCREEN_MULTIPLIER;
  }

  if (category === "physical" && reflect) {
    return DOUBLES_SCREEN_MULTIPLIER;
  }

  if (category === "special" && lightScreen) {
    return DOUBLES_SCREEN_MULTIPLIER;
  }

  return 1;
}

export function resolveWeatherBallDamageInput({
  attackType,
  basePower,
  moveName,
  weather = "none",
}: {
  attackType: PokemonType;
  basePower: number;
  moveName?: string | null;
  weather?: DamageWeather;
}) {
  const weatherBallType = isWeatherBallMove(moveName) ? WEATHER_BALL_TYPES[weather] : undefined;

  if (!weatherBallType) {
    return {
      attackType,
      basePower,
    };
  }

  return {
    attackType: weatherBallType,
    basePower: 100,
  };
}

export function resolveLowKickDamageInput({
  basePower,
  defender,
  moveName,
}: {
  basePower: number;
  defender: PokemonRecord;
  moveName?: string | null;
}) {
  if (!isLowKickMove(moveName)) {
    return {
      basePower,
    };
  }

  return {
    basePower: getLowKickBasePowerFromWeightKg(defender.weightkg),
  };
}

export function normalizeMultihitInput(multihit: MultihitInput | null | undefined): MultihitInput | null {
  if (typeof multihit === "number" && Number.isFinite(multihit) && multihit > 1) {
    return multihit;
  }

  if (Array.isArray(multihit) && multihit.length === 2) {
    const [min, max] = multihit;
    if (Number.isFinite(min) && Number.isFinite(max) && max > 1 && max >= min) {
      return min === max ? max : [min, max];
    }
  }

  return null;
}

export function getMultihitHitRange(multihit: MultihitInput | null | undefined): { min: number; max: number } {
  const normalized = normalizeMultihitInput(multihit);
  if (normalized == null) {
    return { min: 1, max: 1 };
  }
  if (typeof normalized === "number") {
    return { min: normalized, max: normalized };
  }
  return { min: normalized[0], max: normalized[1] };
}

export function getExpectedHits(
  multihit: MultihitInput | null | undefined,
  options: { ability?: DamageAbilityId; item?: DamageItemId } = {},
): number {
  const normalized = normalizeMultihitInput(multihit);
  if (normalized == null) {
    return 1;
  }

  if (typeof normalized === "number") {
    return normalized;
  }

  const [min, max] = normalized;

  if (options.ability === "skilllink") {
    return max;
  }

  if (options.item === "loadeddice") {
    // Loaded Dice forces variable-hit moves into the top of their range (4-5 for 2-5 moves).
    return (Math.max(min, max - 1) + max) / 2;
  }

  // Showdown's roll distribution for 2-5 hit moves: 35% 2, 35% 3, 15% 4, 15% 5 ≈ 3.10 avg.
  if (min === 2 && max === 5) {
    return 3.1;
  }

  return (min + max) / 2;
}

export function resolveDamageMoveInput({
  attackType,
  basePower,
  defender,
  moveName,
  weather = "none",
}: {
  attackType: PokemonType;
  basePower: number;
  defender: PokemonRecord;
  moveName?: string | null;
  weather?: DamageWeather;
}) {
  const weatherResolvedMove = resolveWeatherBallDamageInput({
    attackType,
    basePower,
    moveName,
    weather,
  });
  const basePowerResolvedMove = resolveLowKickDamageInput({
    basePower: weatherResolvedMove.basePower,
    defender,
    moveName,
  });

  return {
    attackType: weatherResolvedMove.attackType,
    basePower: basePowerResolvedMove.basePower,
  };
}

export function getEffectiveDamageBaseStats(
  pokemon: PokemonRecord,
  role: DamageBattleRole,
): PokemonRecord["baseStats"] {
  if (!isAegislashWithStanceChange(pokemon)) {
    return pokemon.baseStats;
  }

  return role === "attacker"
    ? { ...pokemon.baseStats, ...AEGISLASH_BLADE_STATS }
    : { ...pokemon.baseStats, ...AEGISLASH_SHIELD_STATS };
}

export function calculateRoughDamage({
  attacker,
  defender,
  attackType,
  moveName,
  basePower,
  category,
  isSpreadMove,
  multihit = null,
  weather = "none",
  terrain = "none",
  attackerGrounded = true,
  defenderGrounded = true,
  attackerStatStage = 0,
  defenderStatStage = 0,
  attackerAbility = "none",
  attackerAbilityName = null,
  defenderAbility = "none",
  attackerItem = "none",
  defenderItem = "none",
  helpingHand = false,
  reflect = false,
  lightScreen = false,
  auroraVeil = false,
  attackerStatSpread = null,
  defenderStatSpread = null,
}: DamageEstimateInput): DamageEstimate {
  const attackerEffectiveWeather = getAttackerEffectiveWeather({
    weather,
    attackerAbilityName,
  });
  const resolvedMove = resolveDamageMoveInput({
    attackType,
    basePower,
    defender,
    moveName,
    weather: attackerEffectiveWeather,
  });
  const weatherAdjustedAttackType = resolvedMove.attackType;
  const effectiveBasePower = resolvedMove.basePower;
  const effectiveAttackerStats = getEffectiveDamageBaseStats(attacker, "attacker");
  const effectiveDefenderStats = getEffectiveDamageBaseStats(defender, "defender");
  const attackerStats = getChampionsComputedStats(attacker, {
    baseStats: effectiveAttackerStats,
    spread: attackerStatSpread,
  });
  const defenderStats = getChampionsComputedStats(defender, {
    baseStats: effectiveDefenderStats,
    spread: defenderStatSpread,
  });
  const baseAttackStat = category === "physical" ? attackerStats.atk : attackerStats.spa;
  const baseDefenseStat = category === "physical" ? defenderStats.def : defenderStats.spd;
  const weatherDefenseMultiplier =
    weather === "sand" && category === "special" && defender.types.includes("Rock")
      ? 1.5
      : weather === "snow" && category === "physical" && defender.types.includes("Ice")
        ? 1.5
        : 1;
  const attackerStageMultiplier = getStatStageMultiplier(attackerStatStage);
  const defenderStageMultiplier = getStatStageMultiplier(defenderStatStage);
  const attackStat = Math.floor(baseAttackStat * attackerStageMultiplier);
  const defenseStat = Math.floor(baseDefenseStat * weatherDefenseMultiplier * defenderStageMultiplier);
  const defenderHp = defenderStats.hp;
  const primaryType = getTypeFromLabel(defender.types[0]);
  const secondaryType = defender.types[1] ? getTypeFromLabel(defender.types[1]) : null;
  const effectiveAttackType = getAbilityAdjustedAttackType(weatherAdjustedAttackType, attackerAbility);
  const baseTypeMultiplier = primaryType ? getMultiplier(effectiveAttackType, primaryType, secondaryType) : 1;
  const typeMultiplier = getDefenderAbilityTypeMultiplier({
    typeMultiplier: baseTypeMultiplier,
    attackType: effectiveAttackType,
    defenderAbility,
    moveName,
  });
  const stabMultiplier = attacker.types.some((typeLabel) => getTypeFromLabel(typeLabel) === effectiveAttackType)
    ? attackerAbility === "adaptability"
      ? 2
      : STAB_MULTIPLIER
    : 1;
  const spreadMultiplier = isSpreadMove ? SPREAD_MOVE_MULTIPLIER : 1;
  const weatherMultiplier =
    attackerEffectiveWeather === "sun"
      ? effectiveAttackType === "fire"
        ? 1.5
        : effectiveAttackType === "water"
          ? 0.5
          : 1
      : attackerEffectiveWeather === "rain"
        ? effectiveAttackType === "water"
          ? 1.5
          : effectiveAttackType === "fire"
            ? 0.5
            : 1
        : 1;
  const terrainMultiplier =
    terrain === "electric" && effectiveAttackType === "electric" && attackerGrounded
      ? 1.3
      : terrain === "psychic" && effectiveAttackType === "psychic" && attackerGrounded
        ? 1.3
        : terrain === "grassy" && effectiveAttackType === "grass" && attackerGrounded
          ? 1.3
          : terrain === "misty" && effectiveAttackType === "dragon" && defenderGrounded
            ? 0.5
            : 1;
  const attackerAbilityMultiplier = getAttackerAbilityModifier({
    originalAttackType: weatherAdjustedAttackType,
    effectiveAttackType,
    basePower: effectiveBasePower,
    category,
    weather: attackerEffectiveWeather,
    attackerAbility,
    moveName,
  });
  const fieldAbilityMultiplier = getFieldAbilityModifier(effectiveAttackType, attackerAbility, defenderAbility);
  const defenderAbilityMultiplier = getDefenderAbilityModifier({
    attackType: effectiveAttackType,
    category,
    defenderAbility,
    typeMultiplier,
    moveName,
  });
  const abilityMultiplier = attackerAbilityMultiplier * fieldAbilityMultiplier * defenderAbilityMultiplier;
  const attackerItemMultiplier = getAttackerItemModifier({
    attackType: effectiveAttackType,
    category,
    attackerItem,
    typeMultiplier,
  });
  const defenderItemMultiplier = getDefenderItemModifier({
    attackType: effectiveAttackType,
    defenderItem,
    typeMultiplier,
  });
  const itemMultiplier = attackerItemMultiplier * defenderItemMultiplier;
  const helpingHandMultiplier = helpingHand ? 1.5 : 1;
  const screenMultiplier = getDamageScreenMultiplier({ category, reflect, lightScreen, auroraVeil });
  const baseDamage =
    Math.floor(Math.floor((LEVEL_FACTOR * Math.max(effectiveBasePower, 0) * attackStat) / defenseStat) / 50) + 2;
  const modifier =
    stabMultiplier *
    typeMultiplier *
    spreadMultiplier *
    weatherMultiplier *
    terrainMultiplier *
    abilityMultiplier *
    itemMultiplier *
    helpingHandMultiplier *
    screenMultiplier;
  const perHitMinDamage = Math.floor(baseDamage * modifier * MIN_RANDOM_MULTIPLIER);
  const perHitMaxDamage = Math.floor(baseDamage * modifier * MAX_RANDOM_MULTIPLIER);
  const perHitAverageDamage = Math.floor(baseDamage * modifier * AVG_RANDOM_MULTIPLIER);
  const normalizedMultihit = normalizeMultihitInput(multihit);
  const hits = getExpectedHits(normalizedMultihit, {
    ability: attackerAbility,
    item: attackerItem,
  });
  const hitRange = getMultihitHitRange(normalizedMultihit);
  const minDamage = Math.floor(perHitMinDamage * hits);
  const maxDamage = Math.floor(perHitMaxDamage * hits);
  const averageDamage = Math.floor(perHitAverageDamage * hits);

  return {
    inputBasePower: basePower,
    effectiveBasePower,
    baseDamage,
    minDamage,
    maxDamage,
    averageDamage,
    minPercent: (minDamage / defenderHp) * 100,
    maxPercent: (maxDamage / defenderHp) * 100,
    averagePercent: (averageDamage / defenderHp) * 100,
    hits,
    hitRange,
    perHitMinDamage,
    perHitMaxDamage,
    perHitAverageDamage,
    attackStat,
    defenseStat,
    defenderHp,
    stabMultiplier,
    typeMultiplier,
    effectiveAttackType,
    spreadMultiplier,
    weatherMultiplier,
    terrainMultiplier,
    attackerAbilityMultiplier,
    defenderAbilityMultiplier,
    fieldAbilityMultiplier,
    abilityMultiplier,
    attackerItemMultiplier,
    defenderItemMultiplier,
    itemMultiplier,
    helpingHandMultiplier,
    screenMultiplier,
    finalModifier: modifier,
    attackerStageMultiplier,
    defenderStageMultiplier,
    attackerAbilityName: getDamageAbilityLabel(attackerAbility),
    defenderAbilityName: getDamageAbilityLabel(defenderAbility),
    attackerItemName: getDamageItemLabel(attackerItem),
    defenderItemName: getDamageItemLabel(defenderItem),
  };
}
