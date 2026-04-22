import type { BattlePhase, BattlePatch, BattleSideId } from "../state/battleState";

export type BattleEvent = {
  id: string;
  turn: number;
  phase: BattlePhase;
  type: string;
  actorId?: string;
  targetId?: string;
  sideId?: BattleSideId;
  text: string;
  payload?: unknown;
};

export type ReplayLog = {
  formatId: string;
  seed: number;
  initialState: string;
  events: BattleEvent[];
  patches: BattlePatch[];
};

export function createReplayLog(formatId: string, seed: number, initialState: string): ReplayLog {
  return {
    formatId,
    seed,
    initialState,
    events: [],
    patches: [],
  };
}
