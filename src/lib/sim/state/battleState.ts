import type { SeededRngSnapshot } from "../rng/seededRng";

export type BattleSideId = "p1" | "p2";

export type ClauseSet = {
  speciesClause: boolean;
  itemClause: boolean;
  openTeamSheets: boolean;
  sleepClause: boolean;
  timerEnabled: boolean;
};

export type FormatRules = {
  id: string;
  label: string;
  generation: 9;
  battleType: "doubles";
  clauses: ClauseSet;
  allowTerastallization: boolean;
};

export type BattlePhase =
  | "battleInitialization"
  | "teamPreview"
  | "switchIn"
  | "startTurn"
  | "actionSubmission"
  | "targetResolution"
  | "priorityOrdering"
  | "beforeMove"
  | "moveExecution"
  | "secondaryEffects"
  | "faintQueue"
  | "forcedReplacement"
  | "residual"
  | "endTurn"
  | "resolution"
  | "complete";

export type CombatantStatus =
  | "none"
  | "burn"
  | "paralysis"
  | "sleep"
  | "poison"
  | "badPoison"
  | "freeze";

export type StatStageState = {
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  accuracy: number;
  evasion: number;
};

export type CombatantMoveState = {
  id: string;
  name: string;
  pp: number;
  maxPp: number;
  disabled: boolean;
  revealed: boolean;
};

export type CombatantState = {
  id: string;
  sideId: BattleSideId;
  position: number | null;
  speciesId: string;
  speciesName: string;
  level: number;
  types: string[];
  teraType: string | null;
  terastallized: boolean;
  abilityId: string;
  itemId: string | null;
  maxHp: number;
  currentHp: number;
  fainted: boolean;
  status: CombatantStatus;
  statStages: StatStageState;
  volatileStatuses: string[];
  moves: CombatantMoveState[];
  publicMoveIds: string[];
};

export type SideState = {
  id: BattleSideId;
  name: string;
  activeCombatantIds: string[];
  benchCombatantIds: string[];
  sideConditions: string[];
  hasUsedTera: boolean;
  privateNotes: string[];
};

export type FieldState = {
  turn: number;
  weather: "none" | "sun" | "rain" | "sand" | "snow";
  terrain: "none" | "electric" | "grassy" | "psychic" | "misty";
  trickRoomTurns: number;
  tailwindTurnsBySide: Partial<Record<BattleSideId, number>>;
};

export type PrivateBattleState = {
  sideId: BattleSideId;
  teamOrder: string[];
  hiddenMoveIdsByCombatant: Record<string, string[]>;
  hiddenAbilityIdsByCombatant: Record<string, string | null>;
  hiddenItemIdsByCombatant: Record<string, string | null>;
};

export type PublicCombatantState = Omit<CombatantState, "moves" | "abilityId" | "itemId"> & {
  moves: Array<Pick<CombatantMoveState, "id" | "name" | "disabled" | "revealed">>;
  abilityId: string | null;
  itemId: string | null;
};

export type PublicBattleState = {
  format: FormatRules;
  phase: BattlePhase;
  field: FieldState;
  sides: Record<BattleSideId, Omit<SideState, "privateNotes">>;
  combatants: Record<string, PublicCombatantState>;
  winnerSideId: BattleSideId | null;
};

export type BattlePatch =
  | {
      op: "replace";
      path: string;
      value: unknown;
    }
  | {
      op: "append";
      path: string;
      value: unknown;
    };

export type BattleState = {
  format: FormatRules;
  seed: number;
  rng: SeededRngSnapshot;
  phase: BattlePhase;
  field: FieldState;
  sides: Record<BattleSideId, SideState>;
  combatants: Record<string, CombatantState>;
  privateState: Record<BattleSideId, PrivateBattleState>;
  winnerSideId: BattleSideId | null;
  pendingRequestIds: string[];
};

export type CreateAuthoritativeBattleStateInput = {
  format?: Partial<FormatRules>;
  seed: number;
  sides: Record<
    BattleSideId,
    {
      name: string;
      activeCombatantIds: string[];
      benchCombatantIds: string[];
      privateNotes?: string[];
      teamOrder?: string[];
      combatants: CombatantState[];
      hiddenMoveIdsByCombatant?: Record<string, string[]>;
      hiddenAbilityIdsByCombatant?: Record<string, string | null>;
      hiddenItemIdsByCombatant?: Record<string, string | null>;
    }
  >;
  field?: Partial<FieldState>;
};

export const DEFAULT_GEN9_DOUBLES_RULES: FormatRules = {
  id: "gen9vgc-doubles",
  label: "Gen 9 Doubles / VGC",
  generation: 9,
  battleType: "doubles",
  clauses: {
    speciesClause: true,
    itemClause: false,
    openTeamSheets: false,
    sleepClause: false,
    timerEnabled: true,
  },
  allowTerastallization: true,
};

export function createEmptyStatStages(): StatStageState {
  return {
    attack: 0,
    defense: 0,
    specialAttack: 0,
    specialDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  };
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createInitialRngSnapshot(seed: number): SeededRngSnapshot {
  const normalizedSeed = seed >>> 0 || 0x6d2b79f5;
  return {
    seed: normalizedSeed,
    state: normalizedSeed,
    history: [],
  };
}

export function createAuthoritativeBattleState(input: CreateAuthoritativeBattleStateInput): BattleState {
  const combatants = Object.fromEntries(
    Object.values(input.sides)
      .flatMap((side) => side.combatants)
      .map((combatant) => [combatant.id, cloneValue(combatant)]),
  );
  const normalizedSeed = input.seed >>> 0;

  return {
    format: {
      ...DEFAULT_GEN9_DOUBLES_RULES,
      ...input.format,
      clauses: {
        ...DEFAULT_GEN9_DOUBLES_RULES.clauses,
        ...input.format?.clauses,
      },
    },
    seed: normalizedSeed,
    rng: createInitialRngSnapshot(normalizedSeed),
    phase: "teamPreview",
    field: {
      turn: input.field?.turn ?? 0,
      weather: input.field?.weather ?? "none",
      terrain: input.field?.terrain ?? "none",
      trickRoomTurns: input.field?.trickRoomTurns ?? 0,
      tailwindTurnsBySide: cloneValue(input.field?.tailwindTurnsBySide ?? {}),
    },
    sides: {
      p1: {
        id: "p1",
        name: input.sides.p1.name,
        activeCombatantIds: [...input.sides.p1.activeCombatantIds],
        benchCombatantIds: [...input.sides.p1.benchCombatantIds],
        sideConditions: [],
        hasUsedTera: false,
        privateNotes: [...(input.sides.p1.privateNotes ?? [])],
      },
      p2: {
        id: "p2",
        name: input.sides.p2.name,
        activeCombatantIds: [...input.sides.p2.activeCombatantIds],
        benchCombatantIds: [...input.sides.p2.benchCombatantIds],
        sideConditions: [],
        hasUsedTera: false,
        privateNotes: [...(input.sides.p2.privateNotes ?? [])],
      },
    },
    combatants,
    privateState: {
      p1: {
        sideId: "p1",
        teamOrder: [...(input.sides.p1.teamOrder ?? [...input.sides.p1.activeCombatantIds, ...input.sides.p1.benchCombatantIds])],
        hiddenMoveIdsByCombatant: cloneValue(input.sides.p1.hiddenMoveIdsByCombatant ?? {}),
        hiddenAbilityIdsByCombatant: cloneValue(input.sides.p1.hiddenAbilityIdsByCombatant ?? {}),
        hiddenItemIdsByCombatant: cloneValue(input.sides.p1.hiddenItemIdsByCombatant ?? {}),
      },
      p2: {
        sideId: "p2",
        teamOrder: [...(input.sides.p2.teamOrder ?? [...input.sides.p2.activeCombatantIds, ...input.sides.p2.benchCombatantIds])],
        hiddenMoveIdsByCombatant: cloneValue(input.sides.p2.hiddenMoveIdsByCombatant ?? {}),
        hiddenAbilityIdsByCombatant: cloneValue(input.sides.p2.hiddenAbilityIdsByCombatant ?? {}),
        hiddenItemIdsByCombatant: cloneValue(input.sides.p2.hiddenItemIdsByCombatant ?? {}),
      },
    },
    winnerSideId: null,
    pendingRequestIds: ["p1:teamPreview", "p2:teamPreview"],
  };
}

export function getPublicBattleState(state: BattleState, viewerSideId: BattleSideId): PublicBattleState {
  const combatants = Object.fromEntries(
    Object.values(state.combatants).map((combatant) => {
      const isViewerOwned = combatant.sideId === viewerSideId;
      return [
        combatant.id,
        {
          ...combatant,
          moves: combatant.moves
            .filter((move) => isViewerOwned || combatant.publicMoveIds.includes(move.id))
            .map((move) => ({
              id: move.id,
              name: move.name,
              disabled: move.disabled,
              revealed: move.revealed,
            })),
          abilityId: isViewerOwned ? combatant.abilityId : null,
          itemId: isViewerOwned ? combatant.itemId : null,
        } satisfies PublicCombatantState,
      ];
    }),
  );

  return {
    format: cloneValue(state.format),
    phase: state.phase,
    field: cloneValue(state.field),
    sides: {
      p1: {
        id: state.sides.p1.id,
        name: state.sides.p1.name,
        activeCombatantIds: [...state.sides.p1.activeCombatantIds],
        benchCombatantIds: [...state.sides.p1.benchCombatantIds],
        sideConditions: [...state.sides.p1.sideConditions],
        hasUsedTera: state.sides.p1.hasUsedTera,
      },
      p2: {
        id: state.sides.p2.id,
        name: state.sides.p2.name,
        activeCombatantIds: [...state.sides.p2.activeCombatantIds],
        benchCombatantIds: [...state.sides.p2.benchCombatantIds],
        sideConditions: [...state.sides.p2.sideConditions],
        hasUsedTera: state.sides.p2.hasUsedTera,
      },
    },
    combatants,
    winnerSideId: state.winnerSideId,
  };
}
