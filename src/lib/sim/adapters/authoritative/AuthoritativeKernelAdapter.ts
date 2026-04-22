import type { ChosenAction, ChoiceRequest } from "../../choices/types";
import { createAuthoritativeKernel } from "../../kernel/authoritativeKernel";
import type { BattleEvent } from "../../replay/replayLog";
import type {
  BattleSideId,
  BattleState,
  PublicBattleState,
} from "../../state/battleState";
import type { AdapterApplyChoicesResult, BattleSimulatorAdapter } from "../types";

export class AuthoritativeKernelAdapter
  implements BattleSimulatorAdapter<BattleState, BattleSideId, PublicBattleState>
{
  readonly id = "authoritative-kernel";
  private readonly kernel = createAuthoritativeKernel();

  clone(state: BattleState) {
    return JSON.parse(JSON.stringify(state)) as BattleState;
  }

  serialize(state: BattleState) {
    return JSON.stringify(state);
  }

  deserialize(serialized: string) {
    return JSON.parse(serialized) as BattleState;
  }

  legalChoices(state: BattleState, side: BattleSideId): ChoiceRequest {
    return (
      this.kernel.getChoiceRequests(state).find((request) => request.sideId === side) ?? {
        requestId: `${side}:${state.phase}:${state.field.turn}`,
        sideId: side,
        kind: state.phase === "teamPreview" ? "teamPreview" : "turn",
        actorIds: [],
        forced: false,
        options: [],
        source: "authoritative",
      }
    );
  }

  applyChoices(
    state: BattleState,
    choices: Partial<Record<string, ChosenAction>>,
  ): AdapterApplyChoicesResult<BattleState> {
    const result = this.kernel.applyChoices(state, {
      p1: choices.p1,
      p2: choices.p2,
    });

    return {
      state: result.state,
      events: result.events,
      patches: result.patches,
      replay: result.replay,
      terminalScore: result.terminalScore,
      unsupportedMechanics: result.unsupported.map((entry) => `${entry.phase}:${entry.mechanic}`),
    };
  }

  evaluateTerminal(state: BattleState) {
    return state.winnerSideId ? (state.winnerSideId === "p1" ? 1 : -1) : null;
  }

  getPublicState(state: BattleState, side: BattleSideId) {
    return this.kernel.getPublicState(state, side);
  }

  getReplayEvents(result: AdapterApplyChoicesResult<BattleState>): BattleEvent[] {
    return result.events;
  }
}
