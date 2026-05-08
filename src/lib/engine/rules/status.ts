import { normalizeMoveKey } from "../moveRegistry";
import { getGroundedState } from "../mechanicsSupport";
import type { BattleCombatantState, BattleMoveOption, BattleState, BattleStatusCondition } from "../types";

function blocksStatusByTerrain(state: BattleState, target: BattleCombatantState, statusCondition: BattleStatusCondition) {
  if (!getGroundedState(target, state.field).grounded) {
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

  if ((statusCondition === "poison" || statusCondition === "badPoison") && target.pokemon.types.includes("Poison")) {
    return true;
  }

  if ((statusCondition === "poison" || statusCondition === "badPoison") && target.pokemon.types.includes("Steel")) {
    return true;
  }

  if (
    move?.effectData?.powderMove &&
    (normalizeMoveKey(target.abilityName ?? target.abilityId) === "overcoat" ||
      normalizeMoveKey(target.itemName ?? target.itemId) === "safetygoggles")
  ) {
    return true;
  }

  return false;
}

function blocksPowderMove(target: BattleCombatantState, move: BattleMoveOption | null) {
  if (!move?.effectData?.powderMove) {
    return false;
  }

  return (
    target.pokemon.types.includes("Grass") ||
    normalizeMoveKey(target.abilityName ?? target.abilityId) === "overcoat" ||
    normalizeMoveKey(target.itemName ?? target.itemId) === "safetygoggles"
  );
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

  if (blocksPowderMove(target, move)) {
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
