import type { ChoiceRequest, ChosenAction } from "../choices/types";
import { createReplayLog, type BattleEvent, type ReplayLog } from "../replay/replayLog";
import {
  createAuthoritativeBattleState,
  getPublicBattleState,
  type BattlePatch,
  type BattleSideId,
  type BattleState,
  type CreateAuthoritativeBattleStateInput,
  type PublicBattleState,
} from "../state/battleState";
import { SeededRNG } from "../rng/seededRng";

export const AUTHORITATIVE_PHASE_HOOKS = [
  "onSwitchIn",
  "onStartTurn",
  "onBeforeMove",
  "onTryMove",
  "onModifyPriority",
  "onRedirectTarget",
  "onImmunityCheck",
  "onModifyDamage",
  "onAfterDamage",
  "onAfterMove",
  "onFaint",
  "onResidual",
  "onEndTurn",
] as const;

export type AuthoritativePhaseHook = (typeof AUTHORITATIVE_PHASE_HOOKS)[number];

export type UnsupportedMechanic = {
  kind: "unsupportedMechanic";
  phase: BattleState["phase"];
  mechanic: string;
  message: string;
};

export type AuthoritativeStepResult = {
  state: BattleState;
  patches: BattlePatch[];
  replay: ReplayLog;
  events: BattleEvent[];
  unsupported: UnsupportedMechanic[];
  terminalScore: number | null;
};

export type AuthoritativeKernel = {
  createBattle(input: CreateAuthoritativeBattleStateInput): BattleState;
  createRng(seed: number): SeededRNG;
  getPublicState(state: BattleState, viewerSideId: BattleSideId): PublicBattleState;
  getChoiceRequests(state: BattleState): ChoiceRequest[];
  applyChoices(
    state: BattleState,
    choices: Partial<Record<BattleSideId, ChosenAction>>,
    rng?: SeededRNG,
  ): AuthoritativeStepResult;
};

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function appendReplayEvent(replay: ReplayLog, event: BattleEvent) {
  replay.events.push(event);
}

export function createAuthoritativeKernel(): AuthoritativeKernel {
  return {
    createBattle(input) {
      return createAuthoritativeBattleState(input);
    },
    createRng(seed) {
      return new SeededRNG(seed);
    },
    getPublicState(state, viewerSideId) {
      return getPublicBattleState(state, viewerSideId);
    },
    getChoiceRequests(state) {
      return state.pendingRequestIds.map((requestId) => ({
        requestId,
        sideId: requestId.startsWith("p2") ? "p2" : "p1",
        kind: state.phase === "teamPreview" ? "teamPreview" : "turn",
        actorIds: [],
        forced: state.phase === "forcedReplacement",
        options: [],
        source: "authoritative",
      }));
    },
    applyChoices(state, choices, rng = new SeededRNG(state.seed)) {
      const nextState = cloneState(state);
      const replay = createReplayLog(nextState.format.id, nextState.seed, JSON.stringify(state));
      const patches: BattlePatch[] = [];
      const events: BattleEvent[] = [];
      const unsupported: UnsupportedMechanic[] = [];

      appendReplayEvent(replay, {
        id: `step-${nextState.field.turn}-${nextState.phase}`,
        turn: nextState.field.turn,
        phase: nextState.phase,
        type: "kernel.step",
        text: `Kernel step at ${nextState.phase}`,
        payload: {
          choiceSides: Object.keys(choices),
          rng: rng.snapshot(),
        },
      });

      if (nextState.phase === "teamPreview") {
        const bothSidesLocked =
          choices.p1?.type === "teamPreview" &&
          choices.p2?.type === "teamPreview";
        if (bothSidesLocked) {
          nextState.phase = "switchIn";
          nextState.pendingRequestIds = ["p1:switchIn", "p2:switchIn"];
          patches.push({
            op: "replace",
            path: "/phase",
            value: "switchIn",
          });
          patches.push({
            op: "replace",
            path: "/pendingRequestIds",
            value: [...nextState.pendingRequestIds],
          });
          events.push({
            id: "team-preview-locked",
            turn: nextState.field.turn,
            phase: "teamPreview",
            type: "teamPreview.locked",
            text: "Team preview choices locked.",
          });
        }
      } else {
        unsupported.push({
          kind: "unsupportedMechanic",
          phase: nextState.phase,
          mechanic: "turn-resolution",
          message:
            "Authoritative move resolution is scaffolded but not implemented yet; use the approximate adapter for live turn simulation.",
        });
      }

      replay.events.push(...events);
      replay.patches.push(...patches);

      return {
        state: nextState,
        patches,
        replay,
        events,
        unsupported,
        terminalScore: nextState.winnerSideId ? (nextState.winnerSideId === "p1" ? 1 : -1) : null,
      };
    },
  };
}
