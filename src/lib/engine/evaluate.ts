import type { BattleSide, BattleState } from "./types";
import { getActiveIds, getDamagePreview, getEffectiveSpeed, getOpponentSide, getSideSummary, getTerminalWinner } from "./core";

function getPressureScore(state: BattleState, side: BattleSide) {
  const opponentSide = getOpponentSide(side);

  return getActiveIds(state, side).reduce((sum, actorId) => {
    const actor = state.combatants[actorId];
    const bestHit = Math.max(
      0,
      ...actor.knownMoves.flatMap((move) =>
        getActiveIds(state, opponentSide).map((targetId) => getDamagePreview(state, actorId, targetId, move)?.estimate.averagePercent ?? 0),
      ),
    );
    return sum + bestHit;
  }, 0);
}

function getSpeedControlScore(state: BattleState) {
  const allySpeeds = getActiveIds(state, "ally").map((combatantId) => getEffectiveSpeed(state, combatantId));
  const enemySpeeds = getActiveIds(state, "enemy").map((combatantId) => getEffectiveSpeed(state, combatantId));
  const allyAverage = allySpeeds.length > 0 ? allySpeeds.reduce((sum, speed) => sum + speed, 0) / allySpeeds.length : 0;
  const enemyAverage = enemySpeeds.length > 0 ? enemySpeeds.reduce((sum, speed) => sum + speed, 0) / enemySpeeds.length : 0;
  const baseDelta = allyAverage - enemyAverage;

  let bonus = baseDelta * 4;
  if (state.sides.ally.tailwindTurns > 0) {
    bonus += 140;
  }
  if (state.sides.enemy.tailwindTurns > 0) {
    bonus -= 140;
  }
  if (state.field.trickRoomTurns > 0) {
    bonus += baseDelta < 0 ? 90 : -90;
  }

  return bonus;
}

function getStatusScore(state: BattleState, side: BattleSide) {
  return Object.values(state.combatants)
    .filter((combatant) => combatant.side === side && combatant.currentHp > 0)
    .reduce((sum, combatant) => {
      let score = 0;

      if (combatant.statusCondition === "sleep") {
        score -= 180 * Math.max(1, combatant.sleepTurns);
      } else if (combatant.statusCondition === "paralysis") {
        score -= 90;
      } else if (combatant.statusCondition === "burn") {
        score -= 70;
      }

      score -= combatant.tauntTurns * 18;
      score -= combatant.encoreTurns * 16;
      score -= combatant.disableTurns * 14;
      return sum + score;
    }, 0);
}

function getSideConditionScore(state: BattleState, side: BattleSide) {
  const sideState = state.sides[side];
  let score = 0;
  score += sideState.tailwindTurns * 80;
  score += sideState.reflectTurns * 45;
  score += sideState.lightScreenTurns * 45;
  score += sideState.auroraVeilTurns * 55;
  score += sideState.safeguardTurns * 28;
  score += sideState.redirectionTargetId ? 30 : 0;
  score += sideState.allySwitchPair ? 20 : 0;
  score += sideState.quickGuardActive ? 20 : 0;
  score += sideState.wideGuardActive ? 25 : 0;
  return score;
}

export function evaluateBattleState(state: BattleState) {
  const winner = getTerminalWinner(state);
  if (winner === "ally") {
    return 100_000 + getSideSummary(state, "ally").hpTotal;
  }
  if (winner === "enemy") {
    return -100_000 - getSideSummary(state, "enemy").hpTotal;
  }

  const ally = getSideSummary(state, "ally");
  const enemy = getSideSummary(state, "enemy");
  const allyPressure = getPressureScore(state, "ally");
  const enemyPressure = getPressureScore(state, "enemy");
  const allyStatus = getStatusScore(state, "ally");
  const enemyStatus = getStatusScore(state, "enemy");
  const allyConditions = getSideConditionScore(state, "ally");
  const enemyConditions = getSideConditionScore(state, "enemy");

  return (
    (ally.aliveCount - enemy.aliveCount) * 12_000 +
    (ally.hpTotal - enemy.hpTotal) * 9 +
    (ally.hpPercent - enemy.hpPercent) * 28 +
    (allyPressure - enemyPressure) * 22 +
    (allyStatus - enemyStatus) +
    (allyConditions - enemyConditions) +
    getSpeedControlScore(state)
  );
}
