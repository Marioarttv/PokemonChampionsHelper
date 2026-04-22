import type { BattleCombatantState, BattleState } from "./types";

function serializeCombatant(combatant: BattleCombatantState) {
  return [
    combatant.id,
    combatant.currentHp,
    combatant.turnsActive,
    combatant.statusCondition,
    combatant.sleepTurns,
    combatant.tauntTurns,
    combatant.encoreTurns,
    combatant.encoredMoveId ?? "",
    combatant.disableTurns,
    combatant.disabledMoveId ?? "",
    combatant.helpingHandTurns,
    combatant.lastMoveId ?? "",
    combatant.isProtected ? 1 : 0,
    combatant.isFlinched ? 1 : 0,
    combatant.wasSwitchedInThisTurn ? 1 : 0,
    combatant.itemConsumed ? 1 : 0,
    combatant.flashFireBoosted ? 1 : 0,
    combatant.stages.attack,
    combatant.stages.defense,
    combatant.stages.specialAttack,
    combatant.stages.specialDefense,
    combatant.stages.speed,
  ].join("|");
}

function serializeSide(state: BattleState, side: "ally" | "enemy") {
  const sideState = state.sides[side];
  return [
    side,
    sideState.activeIds.join(","),
    sideState.benchIds.join(","),
    sideState.tailwindTurns,
    sideState.reflectTurns,
    sideState.lightScreenTurns,
    sideState.auroraVeilTurns,
    sideState.safeguardTurns,
    sideState.quickGuardActive ? 1 : 0,
    sideState.wideGuardActive ? 1 : 0,
    sideState.redirectionTargetId ?? "",
    sideState.allySwitchPair?.join(",") ?? "",
  ].join("|");
}

export function buildSearchStateKey(state: BattleState) {
  const combatants = Object.values(state.combatants)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(serializeCombatant)
    .join("||");

  return [
    `turn:${state.field.turn}`,
    `field:${state.field.weather}|${state.field.terrain}|${state.field.trickRoomTurns}`,
    serializeSide(state, "ally"),
    serializeSide(state, "enemy"),
    combatants,
  ].join("###");
}
