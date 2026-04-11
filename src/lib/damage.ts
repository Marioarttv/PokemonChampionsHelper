import type { PokemonType } from "../data/typeChart";
import { getTypeFromLabel } from "../data/typeChart";
import { getMultiplier } from "./effectiveness";
import type { PokemonRecord } from "./pokemonDb";

export type DamageCategory = "physical" | "special";
export type DamageWeather = "none" | "sun" | "rain" | "sand" | "snow";
export type DamageTerrain = "none" | "electric" | "grassy" | "psychic" | "misty";

export type DamageEstimateInput = {
  attacker: PokemonRecord;
  defender: PokemonRecord;
  attackType: PokemonType;
  basePower: number;
  category: DamageCategory;
  isSpreadMove: boolean;
  weather?: DamageWeather;
  terrain?: DamageTerrain;
  attackerGrounded?: boolean;
  defenderGrounded?: boolean;
};

export type DamageEstimate = {
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
  spreadMultiplier: number;
  weatherMultiplier: number;
  terrainMultiplier: number;
  finalModifier: number;
};

const LEVEL_FACTOR = 22;
const MIN_RANDOM_MULTIPLIER = 0.85;
const AVG_RANDOM_MULTIPLIER = 0.925;
const MAX_RANDOM_MULTIPLIER = 1;
const STAB_MULTIPLIER = 1.5;
export const SPREAD_MOVE_MULTIPLIER = 0.75;

export function getLevel50HpValue(baseHp: number) {
  return baseHp + 60;
}

export function getLevel50OtherStatValue(baseStat: number) {
  return baseStat + 5;
}

export function calculateRoughDamage({
  attacker,
  defender,
  attackType,
  basePower,
  category,
  isSpreadMove,
  weather = "none",
  terrain = "none",
  attackerGrounded = true,
  defenderGrounded = true,
}: DamageEstimateInput): DamageEstimate {
  const baseAttackStat =
    category === "physical" ? attacker.baseStats.atk : attacker.baseStats.spa;
  const baseDefenseStat =
    category === "physical" ? defender.baseStats.def : defender.baseStats.spd;
  const weatherDefenseMultiplier =
    weather === "sand" && category === "special" && defender.types.includes("Rock")
      ? 1.5
      : weather === "snow" && category === "physical" && defender.types.includes("Ice")
        ? 1.5
        : 1;
  const attackStat = getLevel50OtherStatValue(baseAttackStat);
  const defenseStat = Math.floor(getLevel50OtherStatValue(baseDefenseStat) * weatherDefenseMultiplier);
  const defenderHp = getLevel50HpValue(defender.baseStats.hp);
  const primaryType = getTypeFromLabel(defender.types[0]);
  const secondaryType = defender.types[1] ? getTypeFromLabel(defender.types[1]) : null;
  const typeMultiplier = primaryType ? getMultiplier(attackType, primaryType, secondaryType) : 1;
  const stabMultiplier = attacker.types.some((typeLabel) => getTypeFromLabel(typeLabel) === attackType)
    ? STAB_MULTIPLIER
    : 1;
  const spreadMultiplier = isSpreadMove ? SPREAD_MOVE_MULTIPLIER : 1;
  const weatherMultiplier =
    weather === "sun"
      ? attackType === "fire"
        ? 1.5
        : attackType === "water"
          ? 0.5
          : 1
      : weather === "rain"
        ? attackType === "water"
          ? 1.5
          : attackType === "fire"
            ? 0.5
            : 1
        : 1;
  const terrainMultiplier =
    terrain === "electric" && attackType === "electric" && attackerGrounded
      ? 1.3
      : terrain === "psychic" && attackType === "psychic" && attackerGrounded
        ? 1.3
        : terrain === "grassy" && attackType === "grass" && attackerGrounded
          ? 1.3
          : terrain === "misty" && attackType === "dragon" && defenderGrounded
            ? 0.5
            : 1;
  const baseDamage =
    Math.floor(Math.floor((LEVEL_FACTOR * Math.max(basePower, 0) * attackStat) / defenseStat) / 50) + 2;
  const modifier = stabMultiplier * typeMultiplier * spreadMultiplier * weatherMultiplier * terrainMultiplier;
  const minDamage = Math.floor(baseDamage * modifier * MIN_RANDOM_MULTIPLIER);
  const maxDamage = Math.floor(baseDamage * modifier * MAX_RANDOM_MULTIPLIER);
  const averageDamage = Math.floor(baseDamage * modifier * AVG_RANDOM_MULTIPLIER);

  return {
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
    spreadMultiplier,
    weatherMultiplier,
    terrainMultiplier,
    finalModifier: modifier,
  };
}
