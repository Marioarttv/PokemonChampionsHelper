import { normalizeMoveKey } from "../moveRegistry";
import type { BattleCombatantState, BattleState } from "../types";
import { getStatStageMultiplier } from "../../damage";
import { getChampionsComputedStats } from "../../championsStats";

const WEATHER_SPEED_ABILITIES: Record<string, BattleState["field"]["weather"]> = {
  swiftswim: "rain",
  chlorophyll: "sun",
  sandrush: "sand",
  slushrush: "snow",
};

export function getSpeedModifierMultiplier(state: BattleState, combatant: BattleCombatantState) {
  let multiplier = 1;
  const abilityKey = normalizeMoveKey(combatant.abilityName ?? combatant.abilityId);

  if (state.sides[combatant.side].tailwindTurns > 0) {
    multiplier *= 2;
  }

  if (combatant.itemId === "choicescarf") {
    multiplier *= 1.5;
  }

  if (combatant.itemId === "ironball") {
    multiplier *= 0.5;
  }

  if (abilityKey === "unburden" && combatant.itemConsumed) {
    multiplier *= 2;
  }

  if (combatant.statusCondition === "paralysis") {
    multiplier *= 0.5;
  }

  const requiredWeather = WEATHER_SPEED_ABILITIES[abilityKey];
  if (requiredWeather && state.field.weather === requiredWeather) {
    multiplier *= 2;
  }

  if (abilityKey === "surgesurfer" && state.field.terrain === "electric") {
    multiplier *= 2;
  }

  if (abilityKey === "quickfeet" && combatant.statusCondition !== "none") {
    multiplier *= 1.5;
  }

  return multiplier;
}

export function getEffectiveSpeedForBattleState(state: BattleState, combatant: BattleCombatantState) {
  const speedStageMultiplier = getStatStageMultiplier(combatant.stages.speed);
  const baseSpeed = getChampionsComputedStats(combatant.pokemon, {
    spread: combatant.statSpread,
  }).spe;
  return Math.floor(baseSpeed * speedStageMultiplier * getSpeedModifierMultiplier(state, combatant));
}
