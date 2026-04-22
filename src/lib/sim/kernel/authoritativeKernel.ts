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

function getLeadCount(state: BattleState, sideId: BattleSideId) {
  return Math.max(1, Math.min(2, state.privateState[sideId].teamOrder.length));
}

function buildCombinationOptions(values: string[], size: number) {
  if (size <= 0 || values.length < size) {
    return [];
  }

  const results: string[][] = [];
  const current: string[] = [];

  const walk = (startIndex: number) => {
    if (current.length === size) {
      results.push([...current]);
      return;
    }

    for (let index = startIndex; index < values.length; index += 1) {
      current.push(values[index]!);
      walk(index + 1);
      current.pop();
    }
  };

  walk(0);
  return results;
}

function getTeamPreviewOptions(state: BattleState, sideId: BattleSideId): ChoiceRequest["options"] {
  const teamOrder = state.privateState[sideId].teamOrder.filter((combatantId) => {
    const combatant = state.combatants[combatantId];
    return Boolean(combatant && !combatant.fainted && combatant.currentHp > 0);
  });
  const leadCount = getLeadCount(state, sideId);

  return buildCombinationOptions(teamOrder, leadCount).map((leadIds) => ({
    id: `${sideId}:teamPreview:${leadIds.join(",")}`,
    label: `Lead ${leadIds.join(" / ")}`,
    disabledReason: null,
    action: {
      type: "teamPreview",
      leadIds,
    },
  }));
}

function getForcedReplacementActorIds(state: BattleState, sideId: BattleSideId) {
  return state.sides[sideId].activeCombatantIds.filter((combatantId) => {
    const combatant = state.combatants[combatantId];
    return Boolean(combatant && (combatant.fainted || combatant.currentHp <= 0));
  });
}

function getForcedReplacementOptions(state: BattleState, sideId: BattleSideId): ChoiceRequest["options"] {
  const actorIds = getForcedReplacementActorIds(state, sideId);
  const activeIds = new Set(state.sides[sideId].activeCombatantIds);
  const benchIds = state.sides[sideId].benchCombatantIds.filter((combatantId) => {
    const combatant = state.combatants[combatantId];
    return Boolean(combatant && !combatant.fainted && combatant.currentHp > 0 && !activeIds.has(combatantId));
  });

  return actorIds.flatMap((actorId) =>
    benchIds.map((switchInId) => ({
      id: `${sideId}:forcedReplacement:${actorId}:${switchInId}`,
      label: `${actorId} -> ${switchInId}`,
      disabledReason: null,
      action: {
        type: "switch",
        actorId,
        switchInId,
      },
    })),
  );
}

function getChoiceRequestKind(state: BattleState): ChoiceRequest["kind"] {
  if (state.phase === "teamPreview") {
    return "teamPreview";
  }
  if (state.phase === "forcedReplacement") {
    return "forcedReplacement";
  }
  return "turn";
}

function validateTeamPreviewChoice(state: BattleState, sideId: BattleSideId, action: ChosenAction | undefined) {
  if (!action || action.type !== "teamPreview") {
    throw new Error(`Expected a teamPreview action for ${sideId}.`);
  }

  const leadIds = [...action.leadIds];
  const teamOrder = state.privateState[sideId].teamOrder;
  const leadCount = getLeadCount(state, sideId);
  if (leadIds.length !== leadCount) {
    throw new Error(`Expected exactly ${leadCount} lead ids for ${sideId}, received ${leadIds.length}.`);
  }
  if (new Set(leadIds).size !== leadIds.length) {
    throw new Error(`Duplicate lead ids are not legal for ${sideId}.`);
  }

  for (const leadId of leadIds) {
    const combatant = state.combatants[leadId];
    if (!teamOrder.includes(leadId)) {
      throw new Error(`${leadId} is not on ${sideId}'s team preview roster.`);
    }
    if (!combatant || combatant.sideId !== sideId || combatant.fainted || combatant.currentHp <= 0) {
      throw new Error(`${leadId} is not a legal living lead for ${sideId}.`);
    }
  }

  return leadIds;
}

function applyTeamPreviewChoice(
  state: BattleState,
  sideId: BattleSideId,
  leadIds: string[],
  patches: BattlePatch[],
) {
  const sideState = state.sides[sideId];
  const teamOrder = state.privateState[sideId].teamOrder;
  const benchIds = teamOrder.filter((combatantId) => !leadIds.includes(combatantId));

  sideState.activeCombatantIds = [...leadIds];
  sideState.benchCombatantIds = [...benchIds];
  patches.push({
    op: "replace",
    path: `/sides/${sideId}/activeCombatantIds`,
    value: [...sideState.activeCombatantIds],
  });
  patches.push({
    op: "replace",
    path: `/sides/${sideId}/benchCombatantIds`,
    value: [...sideState.benchCombatantIds],
  });

  for (const combatantId of teamOrder) {
    const nextPosition = leadIds.indexOf(combatantId);
    state.combatants[combatantId]!.position = nextPosition >= 0 ? nextPosition : null;
    patches.push({
      op: "replace",
      path: `/combatants/${combatantId}/position`,
      value: state.combatants[combatantId]!.position,
    });
  }
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
      return state.pendingRequestIds.map((requestId) => {
        const sideId = requestId.startsWith("p2") ? "p2" : "p1";
        const kind = getChoiceRequestKind(state);
        return {
          requestId,
          sideId,
          kind,
          actorIds:
            kind === "teamPreview"
              ? [...state.privateState[sideId].teamOrder]
              : kind === "forcedReplacement"
                ? getForcedReplacementActorIds(state, sideId)
                : [...state.sides[sideId].activeCombatantIds],
          forced: kind === "forcedReplacement",
          options:
            kind === "teamPreview"
              ? getTeamPreviewOptions(state, sideId)
              : kind === "forcedReplacement"
                ? getForcedReplacementOptions(state, sideId)
                : [],
          source: "authoritative",
        } satisfies ChoiceRequest;
      });
    },
    applyChoices(state, choices, rng) {
      const nextState = cloneState(state);
      const localRng = rng ? rng.clone() : SeededRNG.fromSnapshot(state.rng);
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
          rng: localRng.snapshot(),
        },
      });

      if (nextState.phase === "teamPreview") {
        const p1Leads = validateTeamPreviewChoice(nextState, "p1", choices.p1);
        const p2Leads = validateTeamPreviewChoice(nextState, "p2", choices.p2);

        applyTeamPreviewChoice(nextState, "p1", p1Leads, patches);
        applyTeamPreviewChoice(nextState, "p2", p2Leads, patches);
        if (p1Leads.length > 0 && p2Leads.length > 0) {
          nextState.phase = "switchIn";
          nextState.pendingRequestIds = [];
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
            text: "Team preview choices validated and applied.",
            payload: {
              p1Leads,
              p2Leads,
            },
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

      nextState.rng = localRng.snapshot();
      patches.push({
        op: "replace",
        path: "/rng",
        value: nextState.rng,
      });

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
