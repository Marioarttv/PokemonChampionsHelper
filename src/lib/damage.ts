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

export type DamageEstimateInput = {
  attacker: PokemonRecord;
  defender: PokemonRecord;
  attackType: PokemonType;
  moveName?: string;
  basePower: number;
  category: DamageCategory;
  isSpreadMove: boolean;
  weather?: DamageWeather;
  terrain?: DamageTerrain;
  attackerGrounded?: boolean;
  defenderGrounded?: boolean;
  attackerStatStage?: number;
  defenderStatStage?: number;
  attackerAbility?: DamageAbilityId;
  defenderAbility?: DamageAbilityId;
  attackerItem?: DamageItemId;
  defenderItem?: DamageItemId;
  helpingHand?: boolean;
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

function isWeatherBallMove(moveName: string | null | undefined) {
  return moveName ? normalizeMoveNameKey(moveName) === "weatherball" : false;
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
  weather = "none",
  terrain = "none",
  attackerGrounded = true,
  defenderGrounded = true,
  attackerStatStage = 0,
  defenderStatStage = 0,
  attackerAbility = "none",
  defenderAbility = "none",
  attackerItem = "none",
  defenderItem = "none",
  helpingHand = false,
  attackerStatSpread = null,
  defenderStatSpread = null,
}: DamageEstimateInput): DamageEstimate {
  const resolvedMove = resolveWeatherBallDamageInput({
    attackType,
    basePower,
    moveName,
    weather,
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
    weather === "sun"
      ? effectiveAttackType === "fire"
        ? 1.5
        : effectiveAttackType === "water"
          ? 0.5
          : 1
      : weather === "rain"
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
    weather,
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
    helpingHandMultiplier;
  const minDamage = Math.floor(baseDamage * modifier * MIN_RANDOM_MULTIPLIER);
  const maxDamage = Math.floor(baseDamage * modifier * MAX_RANDOM_MULTIPLIER);
  const averageDamage = Math.floor(baseDamage * modifier * AVG_RANDOM_MULTIPLIER);

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
    finalModifier: modifier,
    attackerStageMultiplier,
    defenderStageMultiplier,
    attackerAbilityName: getDamageAbilityLabel(attackerAbility),
    defenderAbilityName: getDamageAbilityLabel(defenderAbility),
    attackerItemName: getDamageItemLabel(attackerItem),
    defenderItemName: getDamageItemLabel(defenderItem),
  };
}
