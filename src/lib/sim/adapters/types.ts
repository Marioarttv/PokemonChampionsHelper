import type { ChoiceRequest, ChosenAction } from "../choices/types";
import type { BattleEvent, ReplayLog } from "../replay/replayLog";
import type { BattlePatch } from "../state/battleState";

export type AdapterApplyChoicesResult<TState> = {
  state: TState;
  events: BattleEvent[];
  patches: BattlePatch[];
  replay: ReplayLog;
  terminalScore: number | null;
  unsupportedMechanics: string[];
};

export interface BattleSimulatorAdapter<TState, TSide, TPublicState> {
  readonly id: string;
  clone(state: TState): TState;
  serialize(state: TState): string;
  deserialize(serialized: string): TState;
  legalChoices(state: TState, side: TSide): ChoiceRequest;
  applyChoices(
    state: TState,
    choices: Partial<Record<string, ChosenAction>>,
  ): AdapterApplyChoicesResult<TState>;
  evaluateTerminal(state: TState): number | null;
  getPublicState(state: TState, side: TSide): TPublicState;
  getReplayEvents(result: AdapterApplyChoicesResult<TState>): BattleEvent[];
}
