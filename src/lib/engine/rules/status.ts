import { normalizeMoveKey } from "../moveRegistry";
import type { BattleCombatantState, BattleMoveOption, BattleState, BattleStatusCondition } from "../types";

function isGrounded(combatant: BattleCombatantState) {
  if (normalizeMoveKey(combatant.abilityName ?? combatant.abilityId) === "levitate") {
    return false;
  }

  return !combatant.pokemon.types.includes("Flying");
}

function blocksStatusByTerrain(state: BattleState, target: BattleCombatantState, statusCondition: BattleStatusCondition) {
  if (!isGrounded(target)) {
    return false;
  }

  if (state.field.terrain === "misty" && statusCondition !== "none") {
    return true;
  }

  if (state.field.terrain === "electric" && statusCondition === "sleep") {
    return true;
  }

  return false;
}

function blocksStatusByType(target: BattleCombatantState, statusCondition: BattleStatusCondition, move: BattleMoveOption | null) {
  if (statusCondition === "burn" && target.pokemon.types.includes("Fire")) {
    return true;
  }

  if (statusCondition === "paralysis" && target.pokemon.types.includes("Electric")) {
    return true;
  }

  if (statusCondition === "sleep" && move?.effectData?.powderMove && target.pokemon.types.includes("Grass")) {
    return true;
  }

  return false;
}

export function canApplyStatusCondition(
  state: BattleState,
  target: BattleCombatantState,
  statusCondition: BattleStatusCondition | undefined,
  move: BattleMoveOption | null,
) {
  if (!statusCondition || statusCondition === "none" || target.statusCondition !== "none") {
    return false;
  }

  if (state.sides[target.side].safeguardTurns > 0) {
    return false;
  }

  if (blocksStatusByTerrain(state, target, statusCondition)) {
    return false;
  }

  if (blocksStatusByType(target, statusCondition, move)) {
    return false;
  }

  return true;
}
