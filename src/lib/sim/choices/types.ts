import type { BattleSideId } from "../state/battleState";

export type ChoiceRequestKind = "teamPreview" | "turn" | "forcedReplacement";

export type ChosenAction =
  | {
      type: "move";
      actorId: string;
      moveId: string;
      targetId: string | null;
      terastallize?: boolean;
    }
  | {
      type: "switch";
      actorId: string;
      switchInId: string;
    }
  | {
      type: "pass";
      actorId: string;
    }
  | {
      type: "teamPreview";
      leadIds: string[];
    }
  | {
      type: "jointPlan";
      summary: string;
      payload: unknown;
    };

export type ChoiceOption = {
  id: string;
  label: string;
  action: ChosenAction;
  disabledReason: string | null;
};

export type ChoiceRequest = {
  requestId: string;
  sideId: BattleSideId;
  kind: ChoiceRequestKind;
  actorIds: string[];
  forced: boolean;
  options: ChoiceOption[];
  source: "approximate" | "authoritative";
};
