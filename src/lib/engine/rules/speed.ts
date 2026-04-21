import { normalizeMoveKey } from "../moveRegistry";
import type { BattleCombatantState, BattleState } from "../types";
import { getLevel50OtherStatValue, getStatStageMultiplier } from "../../damage";

const WEATHER_SPEED_ABILITIES: Record<string, BattleState["field"]["weather"]> = {
  swiftswim: "rain",
  chlorophyll: "sun",
  sandrush: "sand",
  slushrush: "snow",
};

export function getSpeedModifierMultiplier(state: BattleState, combatant: BattleCombatantState) {
  let multiplier = 1;

  if (state.sides[combatant.side].tailwindTurns > 0) {
    multiplier *= 2;
  }

  if (combatant.statusCondition === "paralysis") {
    multiplier *= 0.5;
  }

  const abilityKey = normalizeMoveKey(combatant.abilityName ?? combatant.abilityId);
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
  const baseSpeed = getLevel50OtherStatValue(combatant.pokemon.baseStats.spe);
  return Math.floor(baseSpeed * speedStageMultiplier * getSpeedModifierMultiplier(state, combatant));
}
