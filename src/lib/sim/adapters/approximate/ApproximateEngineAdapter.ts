import {
  evaluateBattleState,
  generateJointActionPlans,
  resolveTurn,
  type BattleSide,
  type BattleState,
  type JointActionPlan,
} from "../../../engine";
import type { ChosenAction, ChoiceRequest } from "../../choices/types";
import { createReplayLog } from "../../replay/replayLog";
import type { BattleEvent } from "../../replay/replayLog";
import type { AdapterApplyChoicesResult, BattleSimulatorAdapter } from "../types";

export type ApproximateAdapterChoice = {
  side: BattleSide;
  plan: JointActionPlan;
};

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createPlanChoiceRequest(state: BattleState, side: BattleSide): ChoiceRequest {
  const plans = generateJointActionPlans(state, side);
  return {
    requestId: `approximate:${side}:${state.field.turn}`,
    sideId: side === "ally" ? "p1" : "p2",
    kind: "turn",
    actorIds: plans.flatMap((plan) => plan.actions.map((action) => action.actorId)),
    forced: false,
    source: "approximate",
    options: plans.map((plan, index) => ({
      id: `${side}-plan-${index}`,
      label: plan.summary,
      disabledReason: null,
      action: {
        type: "jointPlan",
        summary: plan.summary,
        payload: {
          side,
          plan,
        } satisfies ApproximateAdapterChoice,
      },
    })),
  };
}

export class ApproximateEngineAdapter
  implements BattleSimulatorAdapter<BattleState, BattleSide, BattleState>
{
  readonly id = "approximate-engine";

  clone(state: BattleState) {
    return cloneState(state);
  }

  serialize(state: BattleState) {
    return JSON.stringify(state);
  }

  deserialize(serialized: string) {
    return JSON.parse(serialized) as BattleState;
  }

  legalChoices(state: BattleState, side: BattleSide) {
    return createPlanChoiceRequest(state, side);
  }

  applyChoices(
    state: BattleState,
    choices: Partial<Record<string, ChosenAction>>,
  ): AdapterApplyChoicesResult<BattleState> {
    const allyChoice = choices.ally;
    const enemyChoice = choices.enemy;
    const allyPlan =
      allyChoice?.type === "jointPlan"
        ? (allyChoice.payload as ApproximateAdapterChoice).plan
        : null;
    const enemyPlan =
      enemyChoice?.type === "jointPlan"
        ? (enemyChoice.payload as ApproximateAdapterChoice).plan
        : null;

    if (!allyPlan || !enemyPlan) {
      throw new Error("ApproximateEngineAdapter.applyChoices requires both ally and enemy joint plans.");
    }

    const result = resolveTurn(state, allyPlan, enemyPlan);
    const replay = createReplayLog(this.id, state.field.turn, JSON.stringify(state));
    const events: BattleEvent[] = result.events.map((event, index) => ({
      id: `approx:${state.field.turn}:${index}`,
      turn: state.field.turn,
      phase: "moveExecution",
      type: "approximate.turnEvent",
      actorId: event.actorId,
      targetId: event.targetId,
      text: event.text,
    }));
    replay.events.push(...events);

    return {
      state: result.state,
      events,
      patches: [],
      replay,
      terminalScore: this.evaluateTerminal(result.state),
      unsupportedMechanics: [],
    };
  }

  evaluateTerminal(state: BattleState) {
    const allyAlive = Object.values(state.combatants).some((combatant) => combatant.side === "ally" && combatant.currentHp > 0);
    const enemyAlive = Object.values(state.combatants).some((combatant) => combatant.side === "enemy" && combatant.currentHp > 0);

    if (allyAlive && enemyAlive) {
      return null;
    }

    return evaluateBattleState(state);
  }

  getPublicState(state: BattleState) {
    return state;
  }

  getReplayEvents(result: AdapterApplyChoicesResult<BattleState>) {
    return result.events;
  }
}
