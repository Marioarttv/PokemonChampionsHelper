import { getBelievedMoves } from "./beliefs";
import {
  getActiveIds,
  getBenchIds,
  getDamagePreview,
  getEffectiveSpeed,
  getOpponentSide,
  getSideSummary,
  getTerminalWinner,
} from "./core";
import type { BattleSide, BattleState } from "./types";

function getPressureScore(state: BattleState, side: BattleSide) {
  const opponentSide = getOpponentSide(side);

  return getActiveIds(state, side).reduce((sum, actorId) => {
    const actor = state.combatants[actorId];
    const bestHit = Math.max(
      0,
      ...getBelievedMoves(actor, { topN: 6 }).flatMap((entry) =>
        getActiveIds(state, opponentSide).map(
          (targetId) =>
            (getDamagePreview(state, actorId, targetId, entry.move)?.estimate.averagePercent ?? 0) *
            (0.55 + entry.certainty * 0.45),
        ),
      ),
    );
    return sum + bestHit;
  }, 0);
}

function getKoSwingScore(state: BattleState, side: BattleSide) {
  const opponentSide = getOpponentSide(side);
  return getActiveIds(state, side).reduce((sum, actorId) => {
    const actor = state.combatants[actorId];
    return (
      sum +
      getBelievedMoves(actor, { topN: 6 }).reduce((moveSum, entry) => {
        const koCount = getActiveIds(state, opponentSide).filter(
          (targetId) => (getDamagePreview(state, actorId, targetId, entry.move)?.estimate.maxPercent ?? 0) >= 100,
        ).length;
        return moveSum + koCount * entry.policyWeight * 55;
      }, 0)
    );
  }, 0);
}

function getSpeedControlScore(state: BattleState) {
  const allySpeeds = getActiveIds(state, "ally").map((combatantId) => getEffectiveSpeed(state, combatantId));
  const enemySpeeds = getActiveIds(state, "enemy").map((combatantId) => getEffectiveSpeed(state, combatantId));
  const allyAverage = allySpeeds.length > 0 ? allySpeeds.reduce((sum, speed) => sum + speed, 0) / allySpeeds.length : 0;
  const enemyAverage = enemySpeeds.length > 0 ? enemySpeeds.reduce((sum, speed) => sum + speed, 0) / enemySpeeds.length : 0;
  const baseDelta = allyAverage - enemyAverage;
  const turnOrderDelta = state.field.trickRoomTurns > 0 ? -baseDelta : baseDelta;

  let score = turnOrderDelta * 5;
  if (state.sides.ally.tailwindTurns > 0) {
    score += 180 + state.sides.ally.tailwindTurns * 25;
  }
  if (state.sides.enemy.tailwindTurns > 0) {
    score -= 180 + state.sides.enemy.tailwindTurns * 25;
  }
  if (state.field.trickRoomTurns > 0) {
    score += baseDelta < 0 ? 85 : -85;
    score += (state.field.trickRoomTurns === 1 ? 24 : 0) * (baseDelta < 0 ? 1 : -1);
  }

  return score;
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
      } else if (combatant.statusCondition === "badPoison") {
        score -= 85 + Math.max(0, combatant.toxicTurns - 1) * 12;
      } else if (combatant.statusCondition === "poison") {
        score -= 60;
      }

      score -= combatant.tauntTurns * 18;
      score -= combatant.encoreTurns * 20;
      score -= combatant.disableTurns * 16;
      return sum + score;
    }, 0);
}

function getSideConditionScore(state: BattleState, side: BattleSide) {
  const sideState = state.sides[side];
  let score = 0;
  score += sideState.tailwindTurns * 80;
  score += sideState.reflectTurns * 40;
  score += sideState.lightScreenTurns * 40;
  score += sideState.auroraVeilTurns * 52;
  score += sideState.safeguardTurns * 26;
  score += sideState.redirectionTargetId ? 34 : 0;
  score += sideState.allySwitchPair ? 18 : 0;
  score += sideState.quickGuardActive ? 22 : 0;
  score += sideState.wideGuardActive ? 26 : 0;
  return score;
}

function getBenchQualityScore(state: BattleState, side: BattleSide) {
  return getBenchIds(state, side).reduce((sum, combatantId) => {
    const combatant = state.combatants[combatantId];
    if (!combatant || combatant.currentHp <= 0) {
      return sum;
    }

    const hpRatio = combatant.maxHp > 0 ? combatant.currentHp / combatant.maxHp : 0;
    const offense = Math.max(
      0,
      ...getBelievedMoves(combatant, { topN: 4 }).flatMap((entry) =>
        getActiveIds(state, getOpponentSide(side)).map(
          (targetId) =>
            (getDamagePreview(state, combatantId, targetId, entry.move)?.estimate.averagePercent ?? 0) *
            entry.policyWeight,
        ),
      ),
    );
    return sum + hpRatio * 55 + offense * 0.35;
  }, 0);
}

function getTempoScore(state: BattleState, side: BattleSide) {
  return getActiveIds(state, side).reduce((sum, actorId) => {
    const actor = state.combatants[actorId];
    const moveScore = getBelievedMoves(actor, { topN: 6 }).reduce((moveSum, entry) => {
      let value = 0;
      if (entry.move.effectKind === "fakeOut") {
        value += 48;
      }
      if (entry.move.priority > 0) {
        value += 18;
      }
      if (entry.move.effectKind === "protect") {
        value += 12;
      }
      if (entry.move.effectKind === "helpingHand") {
        value += 22;
      }
      if (entry.move.effectKind === "redirection") {
        value += 26;
      }
      return moveSum + value * entry.policyWeight;
    }, 0);
    return sum + moveScore;
  }, 0);
}

function getTrapScore(state: BattleState, side: BattleSide) {
  return Object.values(state.combatants)
    .filter((combatant) => combatant.side === side && combatant.currentHp > 0)
    .reduce((sum, combatant) => {
      return (
        sum +
        combatant.tauntTurns * 12 +
        combatant.encoreTurns * 16 +
        combatant.disableTurns * 14 +
        (combatant.isProtected ? 10 : 0)
      );
    }, 0);
}

function getEndgameConversionScore(state: BattleState, side: BattleSide) {
  const ownAlive = Object.values(state.combatants).filter((combatant) => combatant.side === side && combatant.currentHp > 0).length;
  const enemyAlive = Object.values(state.combatants).filter((combatant) => combatant.side !== side && combatant.currentHp > 0).length;
  if (ownAlive > 2 && enemyAlive > 2) {
    return 0;
  }

  const ownSummary = getSideSummary(state, side);
  const enemySummary = getSideSummary(state, getOpponentSide(side));
  return (ownSummary.hpPercent - enemySummary.hpPercent) * 0.8 + (ownAlive - enemyAlive) * 180;
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
  const allyKoSwing = getKoSwingScore(state, "ally");
  const enemyKoSwing = getKoSwingScore(state, "enemy");
  const allyStatus = getStatusScore(state, "ally");
  const enemyStatus = getStatusScore(state, "enemy");
  const allyConditions = getSideConditionScore(state, "ally");
  const enemyConditions = getSideConditionScore(state, "enemy");
  const allyBench = getBenchQualityScore(state, "ally");
  const enemyBench = getBenchQualityScore(state, "enemy");
  const allyTempo = getTempoScore(state, "ally");
  const enemyTempo = getTempoScore(state, "enemy");
  const allyTrap = getTrapScore(state, "enemy");
  const enemyTrap = getTrapScore(state, "ally");
  const endgame = getEndgameConversionScore(state, "ally") - getEndgameConversionScore(state, "enemy");

  return (
    (ally.aliveCount - enemy.aliveCount) * 11_500 +
    (ally.hpTotal - enemy.hpTotal) * 9 +
    (ally.hpPercent - enemy.hpPercent) * 28 +
    (allyPressure - enemyPressure) * 20 +
    (allyKoSwing - enemyKoSwing) * 3.2 +
    (allyStatus - enemyStatus) +
    (allyConditions - enemyConditions) +
    (allyBench - enemyBench) * 1.7 +
    (allyTempo - enemyTempo) * 1.8 +
    (allyTrap - enemyTrap) * 1.5 +
    endgame +
    getSpeedControlScore(state)
  );
}
