import { getTypeFromLabel } from "../../data/typeChart";
import { getMultiplier } from "../effectiveness";
import type { MoveRecord } from "../battleData";
import { calculateRoughDamage, resolveWeatherBallDamageInput } from "../damage";
import { getChampionsComputedStats } from "../championsStats";
import {
  getDefaultDamageAbilityId,
  getDefaultDamageAbilityIdFromNames,
  normalizeDamageAbilityId,
} from "../damageAbilities";
import { doesDefenderItemReduceDamage, isResistBerryItem, normalizeDamageItemId } from "../damageItems";
import { getEffectiveSpeedForBattleState } from "./rules/speed";
import { canApplyStatusCondition } from "./rules/status";
import { getBelievedMoves } from "./beliefs";
import { getGroundedState } from "./mechanicsSupport";
import { getSpecialMoveDefinition, hasSelfProtectMove, isProtectFamilyMoveName, normalizeMoveKey } from "./moveRegistry";
import type {
  BattleAction,
  BattleCombatantState,
  BattleMoveEffectData,
  BattleMoveOption,
  BattleStatStages,
  BattleScreenKind,
  BattleSide,
  BattleStageDelta,
  BattleState,
  BattleStatusCondition,
  CandidateMove,
  CreateBattleStateInput,
  DamageRollMode,
  JointActionPlan,
  PlannedAction,
  TurnEvent,
  TurnResult,
} from "./types";

const DEFAULT_MAX_INDIVIDUAL_ACTIONS = 8;
const DEFAULT_MAX_JOINT_PLANS = 14;
const DEFAULT_TAILWIND_TURNS = 2;
const DEFAULT_TRICK_ROOM_TURNS = 2;
const APPLIED_TAILWIND_TURNS = 4;
const APPLIED_TRICK_ROOM_TURNS = 5;
const DEFAULT_TAUNT_TURNS = 3;
const DEFAULT_SCREEN_TURNS = 5;
const EXTENDED_SCREEN_TURNS = 8;
const DEFAULT_SLEEP_TURNS = 2;
const DOUBLES_SCREEN_MULTIPLIER = 2 / 3;
const SITRUS_BERRY_HEAL_FRACTION = 0.25;
const LEFTOVERS_HEAL_FRACTION = 1 / 16;
const BLACK_SLUDGE_DAMAGE_FRACTION = 1 / 8;
const STAGE_KEYS: Array<keyof BattleStatStages> = ["attack", "defense", "specialAttack", "specialDefense", "speed"];
const WEATHER_ENTRY_ABILITIES: Record<string, BattleState["field"]["weather"]> = {
  drizzle: "rain",
  drought: "sun",
  sandstream: "sand",
  snowwarning: "snow",
};

function clampStage(value: number) {
  return Math.max(-6, Math.min(6, value));
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getAbilityKey(combatant: BattleCombatantState) {
  return normalizeMoveKey(combatant.abilityName ?? combatant.abilityId);
}

function getItemKey(combatant: BattleCombatantState) {
  return normalizeMoveKey(combatant.itemName ?? combatant.itemId);
}

function hasAnyAbilityKey(combatant: BattleCombatantState, keys: readonly string[]) {
  return keys.includes(getAbilityKey(combatant));
}

function hasAnyItemKey(combatant: BattleCombatantState, keys: readonly string[]) {
  return keys.includes(getItemKey(combatant));
}

function getMoveFromLookup(moveName: string, moveByKey: ReadonlyMap<string, MoveRecord>) {
  return moveByKey.get(moveName.toLowerCase()) ?? moveByKey.get(normalizeMoveKey(moveName)) ?? moveByKey.get(moveName) ?? null;
}

function isSnowActive(state: BattleState) {
  return state.field.weather === "snow";
}

function getDefaultTargetKind(target: string | null | undefined) {
  if (target === "allAdjacentFoes") {
    return "allOpponents" as const;
  }

  if (target === "allAdjacent") {
    return "allAdjacent" as const;
  }

  return "singleOpponent" as const;
}

function buildBaseMoveOption(
  actorId: string,
  moveName: string,
  moveRecord: MoveRecord | null,
  type: BattleMoveOption["type"],
  basePower: number | null,
  category: BattleMoveOption["category"],
  isSpreadMove: boolean,
  source: BattleMoveOption["source"],
  savedAttack: BattleMoveOption["savedAttack"],
  candidateWeight = 1,
  candidateSource: BattleMoveOption["candidateSource"] = null,
) {
  const effectDefinition = getSpecialMoveDefinition(moveRecord?.name ?? moveName, moveRecord?.category);
  const effectKind = effectDefinition?.effectKind ?? "damage";
  const targetKind = effectDefinition?.targetKind ?? getDefaultTargetKind(moveRecord?.target);
  const accuracy = moveRecord?.accuracy === true || moveRecord?.accuracy === undefined ? 100 : moveRecord.accuracy;

  return {
    id: `${actorId}-${source}-${normalizeMoveKey(moveRecord?.name ?? moveName)}`,
    name: moveRecord?.name ?? moveName,
    effectKind,
    targetKind,
    priority: moveRecord?.priority ?? (effectKind === "protect" ? 4 : 0),
    accuracy,
    source,
    savedAttack,
    moveRecord,
    type,
    basePower,
    category,
    isSpreadMove,
    shortDesc: moveRecord?.shortDesc ?? moveRecord?.desc ?? "",
    effectData: effectDefinition?.effectData ?? null,
    candidateWeight,
    candidateSource,
  } satisfies BattleMoveOption;
}

function buildMoveOptionFromSavedAttack(
  actorId: string,
  savedAttack:
    | NonNullable<CreateBattleStateInput["ally"][number]["savedAttacks"]>[number]
    | NonNullable<CreateBattleStateInput["ally"][number]["knownMoves"]>[number],
  moveByKey: CreateBattleStateInput["moveByKey"],
): BattleMoveOption {
  const moveRecord =
    savedAttack.label && savedAttack.label.trim()
      ? (getMoveFromLookup(savedAttack.label.trim(), moveByKey) as BattleMoveOption["moveRecord"])
      : null;

  const option = buildBaseMoveOption(
    actorId,
    moveRecord?.name ?? ("name" in savedAttack ? savedAttack.name : undefined) ?? savedAttack.label ?? "Saved Move",
    moveRecord,
    savedAttack.type ?? (moveRecord ? getTypeFromLabel(moveRecord.type) ?? null : null),
    savedAttack.basePower ?? moveRecord?.basePower ?? null,
    savedAttack.category === "status"
      ? null
      : savedAttack.category ?? (moveRecord?.category?.toLowerCase() as BattleMoveOption["category"] | undefined) ?? null,
    savedAttack.isSpreadMove ?? (moveRecord?.target === "allAdjacentFoes" || moveRecord?.target === "allAdjacent"),
    "savedAttack",
    savedAttack,
  );

  return {
    ...option,
    id: `${actorId}-saved-${savedAttack.id}`,
  };
}

function buildMoveOptionFromMoveName(
  actorId: string,
  moveName: string,
  moveByKey: CreateBattleStateInput["moveByKey"],
): BattleMoveOption | null {
  const moveRecord = getMoveFromLookup(moveName, moveByKey);
  if (!moveRecord) {
    return null;
  }

  const resolvedType = getTypeFromLabel(moveRecord.type);
  return buildBaseMoveOption(
    actorId,
    moveRecord.name,
    moveRecord,
    resolvedType ?? null,
    moveRecord.basePower > 0 ? moveRecord.basePower : null,
    moveRecord.category === "Status" ? null : (moveRecord.category.toLowerCase() as NonNullable<BattleMoveOption["category"]>),
    moveRecord.target === "allAdjacentFoes" || moveRecord.target === "allAdjacent",
    "presetMove",
    {
      id: `move-${normalizeMoveKey(moveRecord.name)}`,
      name: moveRecord.name,
      label: moveRecord.name,
      type: resolvedType ?? undefined,
      basePower: moveRecord.basePower > 0 ? moveRecord.basePower : undefined,
      category:
        moveRecord.category === "Status"
          ? "status"
          : (moveRecord.category.toLowerCase() as NonNullable<CreateBattleStateInput["ally"][number]["knownMoves"]>[number]["category"]),
      isSpreadMove: moveRecord.target === "allAdjacentFoes" || moveRecord.target === "allAdjacent",
    },
  );
}

function buildMoveOptionFromInferredMoveName(
  actorId: string,
  moveName: string,
  moveByKey: CreateBattleStateInput["moveByKey"],
): BattleMoveOption | null {
  const move = buildMoveOptionFromMoveName(actorId, moveName, moveByKey);
  if (!move) {
    return null;
  }

  return {
    ...move,
    id: `${actorId}-inferred-${normalizeMoveKey(move.name)}`,
    source: "inferred",
    shortDesc: move.shortDesc || "Inferred utility option for hidden-information planning.",
    candidateSource: "inferred",
  };
}

function buildKnownMoves(
  actorId: string,
  savedAttacks: CreateBattleStateInput["ally"][number]["savedAttacks"],
  knownMoves: CreateBattleStateInput["ally"][number]["knownMoves"],
  moveNames: string[] | undefined,
  moveByKey: CreateBattleStateInput["moveByKey"],
  universalProtect: boolean,
  candidateMoves?: CandidateMove[],
  inferredMoveNames?: string[],
) {
  const byId = new Map<string, BattleMoveOption>();
  const byName = new Set<string>();

  for (const savedAttack of savedAttacks ?? []) {
    const move = buildMoveOptionFromSavedAttack(actorId, savedAttack, moveByKey);
    byId.set(move.id, move);
    byName.add(normalizeMoveKey(move.name));
  }

  for (const knownMove of knownMoves ?? []) {
    const move = buildMoveOptionFromSavedAttack(actorId, knownMove, moveByKey);
    const nameKey = normalizeMoveKey(move.name);
    if (byName.has(nameKey)) {
      continue;
    }
    byId.set(move.id, move);
    byName.add(nameKey);
  }

  for (const moveName of moveNames ?? []) {
    const move = buildMoveOptionFromMoveName(actorId, moveName, moveByKey);
    if (!move) {
      continue;
    }
    const nameKey = normalizeMoveKey(move.name);
    if (byName.has(nameKey)) {
      continue;
    }
    byId.set(move.id, move);
    byName.add(nameKey);
  }

  const candidateById = new Map<string, BattleMoveOption>();
  for (const candidateMove of candidateMoves ?? []) {
    const move = buildMoveOptionFromMoveName(actorId, candidateMove.name, moveByKey);
    if (!move) {
      continue;
    }
    const nameKey = normalizeMoveKey(move.name);
    if (byName.has(nameKey)) {
      continue;
    }
    candidateById.set(`${actorId}-candidate-${normalizeMoveKey(move.name)}`, {
      ...move,
      id: `${actorId}-candidate-${normalizeMoveKey(move.name)}`,
      source: "candidate",
      candidateWeight: candidateMove.weight,
      candidateSource: candidateMove.source,
      shortDesc: move.shortDesc || "Candidate move considered during hidden-information search.",
    });
    byName.add(nameKey);
  }

  for (const moveName of inferredMoveNames ?? []) {
    const move = buildMoveOptionFromInferredMoveName(actorId, moveName, moveByKey);
    if (!move) {
      continue;
    }
    const nameKey = normalizeMoveKey(move.name);
    if (byName.has(nameKey)) {
      continue;
    }
    candidateById.set(move.id, move);
    byName.add(nameKey);
  }

  if (universalProtect && !hasSelfProtectMove([...byId.values(), ...candidateById.values()])) {
    byId.set(`${actorId}-assumed-protect`, {
      id: `${actorId}-assumed-protect`,
      name: "Protect",
      effectKind: "protect",
      targetKind: "self",
      priority: 4,
      accuracy: 100,
      source: "assumed",
      savedAttack: null,
      moveRecord: null,
      type: null,
      basePower: null,
      category: null,
      isSpreadMove: false,
      shortDesc: "Assumed universal defensive option for engine planning.",
      effectData: null,
      candidateWeight: 1,
      candidateSource: null,
    });
  }

  return {
    knownMoves: [...byId.values()],
    candidateMoves: [...candidateById.values()],
  };
}

function createCombatantState(
  side: BattleSide,
  member: CreateBattleStateInput["ally"][number],
  moveByKey: CreateBattleStateInput["moveByKey"],
  attackStage: number,
  defenseStage: number,
  specialAttackStage: number,
  specialDefenseStage: number,
  speedStage: number,
  universalProtect: boolean,
): BattleCombatantState {
  const maxHp = getChampionsComputedStats(member.pokemon, {
    spread: member.statSpread,
  }).hp;
  const currentHpPercent = member.currentHpPercent ?? 100;
  const currentHp =
    typeof member.currentHp === "number" && Number.isFinite(member.currentHp)
      ? Math.max(0, Math.min(maxHp, Math.round(member.currentHp)))
      : currentHpPercent <= 0
        ? 0
        : Math.max(1, Math.min(maxHp, Math.round((maxHp * currentHpPercent) / 100)));
  const explicitAbilityId = normalizeDamageAbilityId(member.abilityName);
  const defaultAbilityId =
    member.abilityName && member.abilityName.trim()
      ? getDefaultDamageAbilityIdFromNames([member.abilityName])
      : getDefaultDamageAbilityId(member.pokemon);
  const itemId = normalizeDamageItemId(member.itemName) ?? "none";
  const statusCondition = member.statusCondition ?? "none";
  const sleepTurns =
    statusCondition === "sleep" ? Math.max(1, Math.round(member.sleepTurns ?? DEFAULT_SLEEP_TURNS)) : 0;
  const infoMode = member.infoMode ?? "custom";
  const hypothesisCandidateMoves =
    infoMode === "closedSheet"
      ? (member.setHypotheses ?? []).flatMap((hypothesis) =>
          hypothesis.moves.map((moveName) => ({
            name: moveName,
            source: hypothesis.source === "preset" ? ("preset" as const) : hypothesis.source === "known" || hypothesis.source === "user" ? ("observed" as const) : ("inferred" as const),
            weight: Math.max(0.01, hypothesis.probability),
            confidence: "candidate" as const,
          })),
        )
      : [];
  const candidateMoves = infoMode === "openTeamSheet" ? [] : [...(member.candidateMoves ?? []), ...hypothesisCandidateMoves];
  const inferredMoveNames = infoMode === "openTeamSheet" ? [] : member.inferredMoveNames;
  const moves = buildKnownMoves(
    member.id,
    member.savedAttacks,
    member.knownMoves,
    member.moveNames,
    moveByKey,
    universalProtect,
    candidateMoves,
    inferredMoveNames,
  );
  const inferredProtectStreak =
    typeof member.protectStreak === "number"
      ? Math.max(0, Math.round(member.protectStreak))
      : isProtectFamilyMoveName(
            moves.knownMoves.concat(moves.candidateMoves).find((move) => move.id === (member.lastMoveId ?? ""))?.name,
          )
        ? 1
        : 0;

  return {
    id: member.id,
    side,
    teamIndex: member.teamIndex,
    label: member.label,
    pokemon: member.pokemon,
    statSpread: member.statSpread ?? null,
    maxHp,
    currentHp,
    turnsActive: Math.max(0, Math.round(member.turnsActive ?? 0)),
    abilityId: explicitAbilityId ?? defaultAbilityId,
    abilityName: member.abilityName?.trim() || null,
    itemId,
    itemName: member.itemName?.trim() || null,
    itemConsumed: false,
    flashFireBoosted: false,
    stages: {
      attack: clampStage(member.stages?.attack ?? attackStage),
      defense: clampStage(member.stages?.defense ?? defenseStage),
      specialAttack: clampStage(member.stages?.specialAttack ?? specialAttackStage),
      specialDefense: clampStage(member.stages?.specialDefense ?? specialDefenseStage),
      speed: clampStage(member.stages?.speed ?? speedStage),
    },
    statusCondition,
    sleepTurns,
    tauntTurns: Math.max(0, Math.round(member.tauntTurns ?? 0)),
    encoreTurns: Math.max(0, Math.round(member.encoreTurns ?? 0)),
    encoredMoveId: member.encoredMoveId ?? null,
    disableTurns: Math.max(0, Math.round(member.disableTurns ?? 0)),
    disabledMoveId: member.disabledMoveId ?? null,
    helpingHandTurns: Math.max(0, Math.round(member.helpingHandTurns ?? 0)),
    protectStreak: inferredProtectStreak,
    knownMoves: moves.knownMoves,
    candidateMoves: moves.candidateMoves,
    knowledge: member.knowledge ?? "known",
    lastMoveId: member.lastMoveId ?? null,
    isProtected: member.isProtected ?? false,
    isFlinched: member.isFlinched ?? false,
    wasSwitchedInThisTurn: member.wasSwitchedInThisTurn ?? false,
    infoMode,
    setHypotheses: member.setHypotheses ?? [],
    volatileState: member.volatileState,
  };
}

function createSideState(
  side: BattleSide,
  members: CreateBattleStateInput["ally"],
  moveByKey: CreateBattleStateInput["moveByKey"],
  attackStage: number,
  defenseStage: number,
  specialAttackStage: number,
  specialDefenseStage: number,
  speedStage: number,
  universalProtect: boolean,
) {
  const sorted = [...members].sort((left, right) => left.teamIndex - right.teamIndex);
  const combatants: Record<string, BattleCombatantState> = {};
  const activeIds: Array<string | null> = [];
  const benchIds: string[] = [];

  for (const member of sorted) {
    const combatant = createCombatantState(
      side,
      member,
      moveByKey,
      attackStage,
      defenseStage,
      specialAttackStage,
      specialDefenseStage,
      speedStage,
      universalProtect,
    );
    combatants[combatant.id] = combatant;
    if (member.isActive && activeIds.length < 2) {
      activeIds.push(combatant.id);
    } else {
      benchIds.push(combatant.id);
    }
  }

  while (activeIds.length < 2) {
    activeIds.push(null);
  }

  return {
    combatants,
    sideState: {
      activeIds: [activeIds[0] ?? null, activeIds[1] ?? null] as [string | null, string | null],
      benchIds,
      tailwindTurns: 0,
      reflectTurns: 0,
      lightScreenTurns: 0,
      auroraVeilTurns: 0,
      safeguardTurns: 0,
      quickGuardActive: false,
      wideGuardActive: false,
      redirectionTargetId: null,
      redirectionIsPowder: false,
      allySwitchPair: null,
    },
  };
}

export function createBattleState(input: CreateBattleStateInput): BattleState {
  const attackStage = input.attackStage ?? 0;
  const defenseStage = input.defenseStage ?? 0;
  const specialAttackStage = input.specialAttackStage ?? attackStage;
  const specialDefenseStage = input.specialDefenseStage ?? defenseStage;
  const speedStage = input.speedStage ?? 0;
  const universalProtect = input.universalProtect ?? true;
  const ally = createSideState(
    "ally",
    input.ally,
    input.moveByKey,
    attackStage,
    defenseStage,
    specialAttackStage,
    specialDefenseStage,
    speedStage,
    universalProtect,
  );
  const enemy = createSideState(
    "enemy",
    input.enemy,
    input.moveByKey,
    attackStage,
    defenseStage,
    specialAttackStage,
    specialDefenseStage,
    speedStage,
    universalProtect,
  );
  const allyTailwindTurns = input.allySide?.tailwindTurns ?? (input.allyTailwind ? DEFAULT_TAILWIND_TURNS : 0);
  const enemyTailwindTurns = input.enemySide?.tailwindTurns ?? (input.enemyTailwind ? DEFAULT_TAILWIND_TURNS : 0);
  const trickRoomTurns = input.fieldState?.trickRoomTurns ?? (input.trickRoom ? DEFAULT_TRICK_ROOM_TURNS : 0);

  const state: BattleState = {
    combatants: {
      ...ally.combatants,
      ...enemy.combatants,
    },
    sides: {
      ally: {
        ...ally.sideState,
        ...input.allySide,
        activeIds: ally.sideState.activeIds,
        benchIds: ally.sideState.benchIds,
        tailwindTurns: allyTailwindTurns,
      },
      enemy: {
        ...enemy.sideState,
        ...input.enemySide,
        activeIds: enemy.sideState.activeIds,
        benchIds: enemy.sideState.benchIds,
        tailwindTurns: enemyTailwindTurns,
      },
    },
    field: {
      weather: input.fieldState?.weather ?? input.weather ?? "none",
      terrain: input.fieldState?.terrain ?? input.terrain ?? "none",
      trickRoomTurns,
      gravityTurns: input.fieldState?.gravityTurns ?? 0,
      turn: input.fieldState?.turn ?? 1,
    },
    policies: {
      replacement: input.replacementPolicy ?? "firstAvailable",
    },
  };

  if (input.applyInitialEntryEffects !== false) {
    applyInitialEntryEffects(state);
  }
  return state;
}

export function cloneBattleState(state: BattleState): BattleState {
  return {
    combatants: Object.fromEntries(
      Object.entries(state.combatants).map(([id, combatant]) => [
        id,
        {
          ...combatant,
          stages: { ...combatant.stages },
          knownMoves: [...combatant.knownMoves],
          candidateMoves: [...combatant.candidateMoves],
          setHypotheses: [...combatant.setHypotheses],
          volatileState: combatant.volatileState ? { ...combatant.volatileState } : undefined,
        },
      ]),
    ),
    sides: {
      ally: {
        activeIds: [...state.sides.ally.activeIds] as [string | null, string | null],
        benchIds: [...state.sides.ally.benchIds],
        tailwindTurns: state.sides.ally.tailwindTurns,
        reflectTurns: state.sides.ally.reflectTurns,
        lightScreenTurns: state.sides.ally.lightScreenTurns,
        auroraVeilTurns: state.sides.ally.auroraVeilTurns,
        safeguardTurns: state.sides.ally.safeguardTurns,
        quickGuardActive: state.sides.ally.quickGuardActive,
        wideGuardActive: state.sides.ally.wideGuardActive,
        redirectionTargetId: state.sides.ally.redirectionTargetId,
        redirectionIsPowder: state.sides.ally.redirectionIsPowder,
        allySwitchPair: state.sides.ally.allySwitchPair ? [...state.sides.ally.allySwitchPair] as [string, string] : null,
      },
      enemy: {
        activeIds: [...state.sides.enemy.activeIds] as [string | null, string | null],
        benchIds: [...state.sides.enemy.benchIds],
        tailwindTurns: state.sides.enemy.tailwindTurns,
        reflectTurns: state.sides.enemy.reflectTurns,
        lightScreenTurns: state.sides.enemy.lightScreenTurns,
        auroraVeilTurns: state.sides.enemy.auroraVeilTurns,
        safeguardTurns: state.sides.enemy.safeguardTurns,
        quickGuardActive: state.sides.enemy.quickGuardActive,
        wideGuardActive: state.sides.enemy.wideGuardActive,
        redirectionTargetId: state.sides.enemy.redirectionTargetId,
        redirectionIsPowder: state.sides.enemy.redirectionIsPowder,
        allySwitchPair: state.sides.enemy.allySwitchPair ? [...state.sides.enemy.allySwitchPair] as [string, string] : null,
      },
    },
    field: { ...state.field },
    policies: { ...state.policies },
  };
}

export function getOpponentSide(side: BattleSide): BattleSide {
  return side === "ally" ? "enemy" : "ally";
}

export function isCombatantAlive(state: BattleState, combatantId: string | null | undefined) {
  if (!combatantId) {
    return false;
  }
  return (state.combatants[combatantId]?.currentHp ?? 0) > 0;
}

export function getActiveIds(state: BattleState, side: BattleSide) {
  return state.sides[side].activeIds.filter((combatantId): combatantId is string => isCombatantAlive(state, combatantId));
}

function getOtherActiveAllyIds(state: BattleState, actorId: string) {
  const actor = state.combatants[actorId];
  if (!actor) {
    return [];
  }

  return getActiveIds(state, actor.side).filter((combatantId) => combatantId !== actorId);
}

export function getBenchIds(state: BattleState, side: BattleSide) {
  return state.sides[side].benchIds.filter((combatantId) => isCombatantAlive(state, combatantId));
}

export function isActiveCombatant(state: BattleState, combatantId: string) {
  return state.sides.ally.activeIds.includes(combatantId) || state.sides.enemy.activeIds.includes(combatantId);
}

export function getMoveOption(state: BattleState, actorId: string, moveId: string) {
  const combatant = state.combatants[actorId];
  if (!combatant) {
    return null;
  }

  return [...combatant.knownMoves, ...combatant.candidateMoves].find((move) => move.id === moveId) ?? null;
}

function isNonDamagingMove(move: BattleMoveOption) {
  return move.category === null;
}

export function getEffectiveSpeed(state: BattleState, combatantId: string) {
  const combatant = state.combatants[combatantId];
  if (!combatant) {
    return 0;
  }

  return getEffectiveSpeedForBattleState(state, combatant);
}

export function isGrounded(combatant: BattleCombatantState, state?: BattleState) {
  if (state) {
    return getGroundedState(combatant, state.field).grounded;
  }

  if (combatant.itemId === "ironball") {
    return true;
  }
  if (combatant.itemId === "airballoon" && !combatant.itemConsumed) {
    return false;
  }
  if (combatant.abilityId === "levitate") {
    return false;
  }

  return !combatant.pokemon.types.includes("Flying");
}

function getScreenDamageMultiplier(state: BattleState, defender: BattleCombatantState, move: BattleMoveOption) {
  const sideState = state.sides[defender.side];
  if (sideState.auroraVeilTurns > 0) {
    return DOUBLES_SCREEN_MULTIPLIER;
  }

  if (move.category === "physical" && sideState.reflectTurns > 0) {
    return DOUBLES_SCREEN_MULTIPLIER;
  }

  if (move.category === "special" && sideState.lightScreenTurns > 0) {
    return DOUBLES_SCREEN_MULTIPLIER;
  }

  return 1;
}

function scaleDamageEstimate(
  estimate: ReturnType<typeof calculateRoughDamage>,
  multiplier: number,
) {
  const minDamage = Math.max(0, Math.floor(estimate.minDamage * multiplier));
  const averageDamage = Math.max(0, Math.floor(estimate.averageDamage * multiplier));
  const maxDamage = Math.max(0, Math.floor(estimate.maxDamage * multiplier));

  return {
    ...estimate,
    minDamage,
    averageDamage,
    maxDamage,
    minPercent: (minDamage / estimate.defenderHp) * 100,
    averagePercent: (averageDamage / estimate.defenderHp) * 100,
    maxPercent: (maxDamage / estimate.defenderHp) * 100,
    finalModifier: estimate.finalModifier * multiplier,
  };
}

function getPreviewDefenderItemId(defender: BattleCombatantState) {
  if (defender.itemConsumed && isResistBerryItem(defender.itemId)) {
    return "none";
  }

  return defender.itemId;
}

export function getDamageAmountForMode(
  mode: DamageRollMode,
  estimate: ReturnType<typeof calculateRoughDamage>,
) {
  if (mode === "min") {
    return estimate.minDamage;
  }

  if (mode === "max") {
    return estimate.maxDamage;
  }

  return estimate.averageDamage;
}

export function getDamagePreview(
  state: BattleState,
  actorId: string,
  targetId: string,
  move: BattleMoveOption,
) {
  const attacker = state.combatants[actorId];
  const defender = state.combatants[targetId];

  if (
    !attacker ||
    !defender ||
    !move.type ||
    !move.basePower ||
    !move.category ||
    attacker.currentHp <= 0 ||
    defender.currentHp <= 0
  ) {
    return null;
  }

  let estimate = calculateRoughDamage({
    attacker: attacker.pokemon,
    defender: defender.pokemon,
    attackType: move.type,
    moveName: move.name,
    basePower: move.basePower,
    category: move.category,
    isSpreadMove: move.isSpreadMove,
    weather: state.field.weather,
    terrain: state.field.terrain,
    attackerGrounded: isGrounded(attacker, state),
    defenderGrounded: isGrounded(defender, state),
    attackerStatStage: move.category === "physical" ? attacker.stages.attack : attacker.stages.specialAttack,
    defenderStatStage: move.category === "physical" ? defender.stages.defense : defender.stages.specialDefense,
    attackerAbility: attacker.abilityId,
    defenderAbility: defender.abilityId,
    attackerItem: attacker.itemId,
    defenderItem: getPreviewDefenderItemId(defender),
    helpingHand: attacker.helpingHandTurns > 0,
  });

  let externalMultiplier = 1;
  externalMultiplier *= getScreenDamageMultiplier(state, defender, move);

  if (attacker.statusCondition === "burn" && move.category === "physical") {
    externalMultiplier *= 0.5;
  }

  if (getAbilityKey(attacker) === "flashfire" && attacker.flashFireBoosted && move.type === "fire") {
    externalMultiplier *= 1.5;
  }

  if (externalMultiplier !== 1) {
    estimate = scaleDamageEstimate(estimate, externalMultiplier);
  }

  return {
    estimate,
    minDamage: estimate.minDamage,
    averageDamage: estimate.averageDamage,
    maxDamage: estimate.maxDamage,
  };
}

function getActionPriority(state: BattleState, action: BattleAction) {
  if (action.type === "switch") {
    return 6;
  }

  if (action.type === "pass") {
    return -20;
  }

  const move = getMoveOption(state, action.actorId, action.moveId);
  return move?.priority ?? 0;
}

function compareActionOrder(
  state: BattleState,
  left: PlannedAction,
  right: PlannedAction,
  trickRoomActive: boolean,
) {
  const priorityDelta = getActionPriority(state, right.action) - getActionPriority(state, left.action);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const leftSpeed = getEffectiveSpeed(state, left.actorId);
  const rightSpeed = getEffectiveSpeed(state, right.actorId);
  const speedDelta = trickRoomActive ? leftSpeed - rightSpeed : rightSpeed - leftSpeed;
  if (speedDelta !== 0) {
    return speedDelta;
  }

  return left.actorId.localeCompare(right.actorId);
}

function actionsAreSpeedTied(state: BattleState, left: PlannedAction, right: PlannedAction, trickRoomActive: boolean) {
  if (left.actorId === right.actorId) {
    return false;
  }
  if (getActionPriority(state, left.action) !== getActionPriority(state, right.action)) {
    return false;
  }
  const leftActor = state.combatants[left.actorId];
  const rightActor = state.combatants[right.actorId];
  if (!leftActor || !rightActor || leftActor.side === rightActor.side) {
    return false;
  }
  void trickRoomActive;
  return getEffectiveSpeed(state, left.actorId) === getEffectiveSpeed(state, right.actorId);
}

function sumProjectedDamage(state: BattleState, actorId: string, move: BattleMoveOption, targetIds: string[]) {
  return targetIds.reduce((sum, targetId) => {
    const preview = getDamagePreview(state, actorId, targetId, move);
    return sum + (preview?.estimate.averagePercent ?? 0);
  }, 0);
}

function getBelievedDamagingMoves(state: BattleState, actorId: string) {
  const actor = state.combatants[actorId];
  if (!actor) {
    return [];
  }

  return getBelievedMoves(actor, { topN: 6 }).filter((entry) => entry.move.category !== null);
}

function isTargetImmuneByTyping(
  state: BattleState,
  _actorId: string,
  targetId: string,
  move: BattleMoveOption,
) {
  const target = state.combatants[targetId];
  if (!target || !move.type || !move.category || !move.basePower) {
    return false;
  }

  const [primaryTypeLabel, secondaryTypeLabel] = target.pokemon.types;
  const primaryType = primaryTypeLabel ? getTypeFromLabel(primaryTypeLabel) : null;
  if (!primaryType) {
    return false;
  }

  const secondaryType = secondaryTypeLabel ? getTypeFromLabel(secondaryTypeLabel) : null;
  const resolvedMove = resolveWeatherBallDamageInput({
    attackType: move.type,
    basePower: move.basePower,
    moveName: move.name,
    weather: state.field.weather,
  });

  return getMultiplier(resolvedMove.attackType, primaryType, secondaryType) === 0;
}

function getIncomingThreatsAgainst(state: BattleState, targetIds: string[]) {
  return targetIds.flatMap((targetId) => {
    const target = state.combatants[targetId];
    if (!target) {
      return [];
    }

    return getActiveIds(state, getOpponentSide(target.side)).flatMap((enemyId) => {
      return getBelievedDamagingMoves(state, enemyId).map(
        (entry) =>
          (getDamagePreview(state, enemyId, targetId, entry.move)?.estimate.averagePercent ?? 0) *
          (0.55 + entry.certainty * 0.45),
      );
    });
  });
}

type DefensiveThreatTarget = {
  targetId: string;
  value: number;
};

type DefensiveThreat = {
  attackerId: string;
  move: BattleMoveOption;
  isPriority: boolean;
  isSpread: boolean;
  targets: DefensiveThreatTarget[];
};

type IncomingDamagePiece = {
  attackerId: string;
  move: BattleMoveOption;
  targetId: string;
  averageDamage: number;
  maxDamage: number;
  averagePercent: number;
  isPriority: boolean;
  isSpread: boolean;
};

type IncomingDamageBundle = {
  targetId: string;
  pieces: IncomingDamagePiece[];
  weight: number;
};

type IncomingDamageChoice = {
  attackerId: string;
  move: BattleMoveOption;
  targetIds: string[];
  weight: number;
};

function getProtectSuccessChance(protectStreak: number) {
  if (protectStreak <= 0) {
    return 1;
  }

  return 1 / 3 ** protectStreak;
}

function doesProtectSucceed(protectStreak: number, accuracyMode: "conservative" | "expected" | "optimistic") {
  const successChance = getProtectSuccessChance(protectStreak);
  if (accuracyMode === "optimistic") {
    return successChance >= 1 / 3;
  }
  if (accuracyMode === "expected") {
    return successChance >= 2 / 3;
  }
  return successChance >= 1;
}

function getThreatBeliefWeight(certainty: number, policyWeight: number) {
  return (0.55 + certainty * 0.45) * (0.65 + policyWeight * 0.35);
}

function getDefensiveThreatTargetIds(
  state: BattleState,
  side: BattleSide,
  attacker: BattleCombatantState,
  move: BattleMoveOption,
) {
  const sideActiveIds = getActiveIds(state, side);

  if (move.targetKind === "singleOpponent") {
    return sideActiveIds;
  }

  if (move.targetKind === "allOpponents") {
    return sideActiveIds;
  }

  if (move.targetKind === "allAdjacent") {
    return sideActiveIds.filter((targetId) => targetId !== attacker.id);
  }

  return [];
}

function getDefensiveThreatTargetValue(
  state: BattleState,
  attackerId: string,
  targetId: string,
  move: BattleMoveOption,
  certainty: number,
  policyWeight: number,
) {
  if (isTargetImmuneByTyping(state, attackerId, targetId, move)) {
    return null;
  }

  const preview = getDamagePreview(state, attackerId, targetId, move);
  if (!preview) {
    return null;
  }

  const target = state.combatants[targetId];
  if (!target || target.currentHp <= 0) {
    return null;
  }

  const beliefMultiplier = getThreatBeliefWeight(certainty, policyWeight);
  const damageValue = preview.estimate.averagePercent * beliefMultiplier;
  const averageKoBonus = preview.estimate.averageDamage >= target.currentHp ? 90 : 0;
  const maxKoBonus = preview.estimate.maxDamage >= target.currentHp ? 45 : 0;
  const fakeOutBonus = move.effectKind === "fakeOut" ? 65 : 0;
  const value = damageValue + (averageKoBonus + maxKoBonus + fakeOutBonus) * beliefMultiplier;

  if (value <= 0) {
    return null;
  }

  return {
    targetId,
    value,
  } satisfies DefensiveThreatTarget;
}

function getDefensiveThreats(state: BattleState, side: BattleSide) {
  const opponentSide = getOpponentSide(side);
  const threats: DefensiveThreat[] = [];

  for (const attackerId of getActiveIds(state, opponentSide)) {
    const attacker = state.combatants[attackerId];
    if (!attacker) {
      continue;
    }

    for (const { move, certainty, policyWeight } of getBelievedMoves(attacker, { topN: 6 })) {
      if (move.category === null) {
        continue;
      }

      const targetIds = getDefensiveThreatTargetIds(state, side, attacker, move);
      if (targetIds.length === 0) {
        continue;
      }

      const targets = targetIds
        .map((targetId) => getDefensiveThreatTargetValue(state, attackerId, targetId, move, certainty, policyWeight))
        .filter((target): target is DefensiveThreatTarget => Boolean(target));

      if (targets.length === 0) {
        continue;
      }

      threats.push({
        attackerId,
        move,
        isPriority: move.priority > 0,
        isSpread: move.isSpreadMove,
        targets,
      });
    }
  }

  return threats;
}

function getIncomingDamageChoices(state: BattleState, side: BattleSide, attackerId: string) {
  const attacker = state.combatants[attackerId];
  if (!attacker) {
    return [];
  }

  const choices: IncomingDamageChoice[] = [];
  for (const { move, certainty, policyWeight } of getBelievedMoves(attacker, { topN: 4 })) {
    if (move.category === null) {
      continue;
    }

    const targetIds = getDefensiveThreatTargetIds(state, side, attacker, move);
    if (targetIds.length === 0) {
      continue;
    }

    const weight = getThreatBeliefWeight(certainty, policyWeight);
    if (move.targetKind === "singleOpponent") {
      for (const targetId of targetIds) {
        choices.push({ attackerId, move, targetIds: [targetId], weight });
      }
      continue;
    }

    choices.push({ attackerId, move, targetIds, weight });
  }

  return choices;
}

function getIncomingDamageBundles(state: BattleState, side: BattleSide) {
  const opponentSide = getOpponentSide(side);
  const choicesByAttacker = getActiveIds(state, opponentSide)
    .map((attackerId) => getIncomingDamageChoices(state, side, attackerId))
    .filter((choices) => choices.length > 0);
  const bundles: IncomingDamageBundle[] = [];

  if (choicesByAttacker.length === 0) {
    return bundles;
  }

  const walk = (index: number, current: IncomingDamageChoice[]) => {
    if (index === choicesByAttacker.length) {
      const piecesByTarget = new Map<string, IncomingDamagePiece[]>();
      const weight = current.reduce((product, choice) => product * choice.weight, 1);

      for (const choice of current) {
        for (const targetId of choice.targetIds) {
          if (isTargetImmuneByTyping(state, choice.attackerId, targetId, choice.move)) {
            continue;
          }

          const preview = getDamagePreview(state, choice.attackerId, targetId, choice.move);
          if (!preview) {
            continue;
          }

          const piece: IncomingDamagePiece = {
            attackerId: choice.attackerId,
            move: choice.move,
            targetId,
            averageDamage: preview.estimate.averageDamage,
            maxDamage: preview.estimate.maxDamage,
            averagePercent: preview.estimate.averagePercent,
            isPriority: choice.move.priority > 0,
            isSpread: choice.move.isSpreadMove,
          };
          const pieces = piecesByTarget.get(targetId) ?? [];
          pieces.push(piece);
          piecesByTarget.set(targetId, pieces);
        }
      }

      for (const [targetId, pieces] of piecesByTarget) {
        if (pieces.length > 0) {
          bundles.push({ targetId, pieces, weight });
        }
      }
      return;
    }

    for (const choice of choicesByAttacker[index]) {
      current.push(choice);
      walk(index + 1, current);
      current.pop();
    }
  };

  walk(0, []);
  return bundles;
}

function getStateAfterPassiveTurn(state: BattleState) {
  const projected = cloneBattleState(state);
  decaySideConditions(projected.sides.ally);
  decaySideConditions(projected.sides.enemy);
  projected.field.trickRoomTurns = Math.max(0, projected.field.trickRoomTurns - 1);
  projected.field.gravityTurns = Math.max(0, (projected.field.gravityTurns ?? 0) - 1);
  return projected;
}

function getProtectStallScore(state: BattleState, side: BattleSide) {
  const currentScore = getSpeedAdvantageScore(state, side, state.field.trickRoomTurns > 0);
  const projectedState = getStateAfterPassiveTurn(state);
  const projectedScore = getSpeedAdvantageScore(projectedState, side, projectedState.field.trickRoomTurns > 0);
  const improvement = projectedScore - currentScore;
  if (improvement <= 0) {
    return 0;
  }

  let urgencyBonus = 0;
  if (state.field.trickRoomTurns === 1) {
    urgencyBonus += 28;
  }
  if (state.sides.ally.tailwindTurns === 1 || state.sides.enemy.tailwindTurns === 1) {
    urgencyBonus += 18;
  }

  return improvement * 38 + urgencyBonus;
}

function scoreProtectAction(state: BattleState, actorId: string) {
  const actor = state.combatants[actorId];
  if (!actor) {
    return 0;
  }

  const threats = getDefensiveThreats(state, actor.side).flatMap((threat) =>
    threat.targets.filter((target) => target.targetId === actorId).map((target) => target.value),
  );
  const highestThreat = threats.length > 0 ? Math.max(...threats) : 0;
  const hpPercent = actor.maxHp > 0 ? (actor.currentHp / actor.maxHp) * 100 : 0;
  const baseScore = highestThreat * 1.4 + (100 - hpPercent) * 0.45 + getProtectStallScore(state, actor.side);
  return baseScore * getProtectSuccessChance(actor.protectStreak) - actor.protectStreak * 22;
}

function getSpeedAdvantageScore(state: BattleState, side: BattleSide, trickRoomActive: boolean) {
  const ownIds = getActiveIds(state, side);
  const enemyIds = getActiveIds(state, getOpponentSide(side));
  let score = 0;

  for (const ownId of ownIds) {
    const ownSpeed = getEffectiveSpeed(state, ownId);

    for (const enemyId of enemyIds) {
      const enemySpeed = getEffectiveSpeed(state, enemyId);
      if (ownSpeed === enemySpeed) {
        score += 0.25;
        continue;
      }

      const movesFirst = trickRoomActive ? ownSpeed < enemySpeed : ownSpeed > enemySpeed;
      score += movesFirst ? 1 : -1;
    }
  }

  return score;
}

function scoreTrickRoomAction(state: BattleState, actorId: string) {
  const actor = state.combatants[actorId];
  if (!actor) {
    return 0;
  }

  const currentlyActive = state.field.trickRoomTurns > 0;
  const currentScore = getSpeedAdvantageScore(state, actor.side, currentlyActive);
  const toggledScore = getSpeedAdvantageScore(state, actor.side, !currentlyActive);
  const swing = toggledScore - currentScore;
  const ownActiveIds = getActiveIds(state, actor.side);
  const enemyActiveIds = getActiveIds(state, getOpponentSide(actor.side));
  const ownAverageSpeed =
    ownActiveIds.length > 0
      ? ownActiveIds.reduce((sum, combatantId) => sum + getEffectiveSpeed(state, combatantId), 0) / ownActiveIds.length
      : 0;
  const enemyAverageSpeed =
    enemyActiveIds.length > 0
      ? enemyActiveIds.reduce((sum, combatantId) => sum + getEffectiveSpeed(state, combatantId), 0) / enemyActiveIds.length
      : 0;
  const averageSpeedGap = currentlyActive ? ownAverageSpeed - enemyAverageSpeed : enemyAverageSpeed - ownAverageSpeed;
  const statusScore = actor.currentHp > actor.maxHp * 0.55 ? 18 : -12;

  return 85 + swing * 95 + averageSpeedGap * 0.8 + statusScore;
}

function scoreSwitchAction(state: BattleState, actorId: string, switchInId: string) {
  const incoming = state.combatants[switchInId];
  if (!incoming) {
    return 0;
  }

  const enemySide = getOpponentSide(incoming.side);
  const maxIncoming = Math.max(
    0,
    ...getActiveIds(state, enemySide).flatMap((enemyId) => {
      return getBelievedDamagingMoves(state, enemyId).map(
        (entry) =>
          (getDamagePreview(state, enemyId, switchInId, entry.move)?.estimate.averagePercent ?? 0) *
          (0.55 + entry.certainty * 0.45),
      );
    }),
  );
  const bestOutgoing = Math.max(
    0,
    ...getBelievedDamagingMoves(state, switchInId).flatMap((entry) =>
      getActiveIds(state, enemySide).map(
        (targetId) =>
          (getDamagePreview(state, switchInId, targetId, entry.move)?.estimate.averagePercent ?? 0) *
          (0.6 + entry.policyWeight * 0.4),
      ),
    ),
  );
  return bestOutgoing - maxIncoming * 0.85;
}

function scoreHelpingHandAction(state: BattleState, actorId: string, targetId: string | null) {
  if (!targetId) {
    return 0;
  }

  const ally = state.combatants[targetId];
  if (!ally) {
    return 0;
  }

  const enemyIds = getActiveIds(state, getOpponentSide(ally.side));
  const bestDamage = Math.max(
    0,
    ...getBelievedDamagingMoves(state, targetId).flatMap((entry) =>
      enemyIds.map(
        (enemyId) =>
          (getDamagePreview(state, targetId, enemyId, entry.move)?.estimate.averagePercent ?? 0) *
          (0.6 + entry.policyWeight * 0.4),
      ),
    ),
  );
  return bestDamage * 0.55 + 35;
}

function scoreRedirectionAction(state: BattleState, actorId: string) {
  const partnerIds = getOtherActiveAllyIds(state, actorId);
  const partnerThreat = Math.max(0, ...getIncomingThreatsAgainst(state, partnerIds));
  const actorThreat = Math.max(0, ...getIncomingThreatsAgainst(state, [actorId]));
  return partnerThreat * 1.1 - actorThreat * 0.2 + 40;
}

function scoreScreenAction(state: BattleState, actorId: string, screen: BattleScreenKind | undefined) {
  const actor = state.combatants[actorId];
  if (!actor || !screen) {
    return 0;
  }

  const allyIds = getActiveIds(state, actor.side);
  const enemyIds = getActiveIds(state, getOpponentSide(actor.side));
  const relevantThreats = enemyIds.flatMap((enemyId) =>
    getBelievedDamagingMoves(state, enemyId)
      .filter((move) =>
        screen === "auroraVeil"
          ? move.move.category !== null
          : screen === "reflect"
            ? move.move.category === "physical"
            : move.move.category === "special",
      )
      .flatMap((entry) =>
        allyIds.map(
          (allyId) =>
            (getDamagePreview(state, enemyId, allyId, entry.move)?.estimate.averagePercent ?? 0) *
            (0.55 + entry.certainty * 0.45),
        ),
      ),
  );

  return Math.max(0, ...relevantThreats) * 0.85 + 45;
}

function scoreGuardAction(state: BattleState, actorId: string, guard: BattleMoveEffectData["guard"]) {
  const actor = state.combatants[actorId];
  if (!actor || !guard) {
    return 0;
  }

  let guardedThreat = 0;
  for (const threat of getDefensiveThreats(state, actor.side)) {
    if (guard === "quickGuard" && threat.isPriority) {
      guardedThreat += threat.targets.reduce((sum, target) => sum + target.value, 0);
    }
    if (guard === "wideGuard" && threat.isSpread) {
      guardedThreat += threat.targets.reduce((sum, target) => sum + target.value, 0);
    }
  }

  if (guardedThreat <= 0) {
    return guard === "wideGuard" ? -35 : -25;
  }

  return guardedThreat * (guard === "wideGuard" ? 0.72 : 0.8) - 10;
}

function scoreSafeguardAction(state: BattleState, actorId: string) {
  const actor = state.combatants[actorId];
  if (!actor) {
    return 0;
  }
  const enemyIds = getActiveIds(state, getOpponentSide(actor.side));
  const statusThreats = enemyIds.reduce((sum, enemyId) => {
    return (
      sum +
      getBelievedMoves(state.combatants[enemyId], { topN: 6 }).filter(
        ({ move, certainty }) =>
          certainty >= 0.2 &&
          (move.effectKind === "status" ||
            (move.effectKind === "damage" && Boolean(move.effectData?.statusCondition || move.effectData?.flinchChance))),
      ).length
    );
  }, 0);
  return 25 + statusThreats * 18;
}

function scoreAllySwitchAction(state: BattleState, actorId: string) {
  const partnerIds = getOtherActiveAllyIds(state, actorId);
  const partnerThreat = Math.max(0, ...getIncomingThreatsAgainst(state, partnerIds));
  const selfThreat = Math.max(0, ...getIncomingThreatsAgainst(state, [actorId]));
  return 35 + Math.max(0, partnerThreat - selfThreat) * 0.75;
}

function scoreEncoreAction(state: BattleState, targetId: string | null) {
  if (!targetId) {
    return 0;
  }
  const target = state.combatants[targetId];
  if (!target || !target.lastMoveId || target.encoreTurns > 0) {
    return 8;
  }

  const lastMove = [...target.knownMoves, ...target.candidateMoves].find((move) => move.id === target.lastMoveId);
  if (!lastMove) {
    return 10;
  }

  return isNonDamagingMove(lastMove) ? 75 : 40;
}

function scoreDisableAction(state: BattleState, targetId: string | null) {
  if (!targetId) {
    return 0;
  }
  const target = state.combatants[targetId];
  if (!target || !target.lastMoveId || target.disableTurns > 0) {
    return 8;
  }

  const lastMove = [...target.knownMoves, ...target.candidateMoves].find((move) => move.id === target.lastMoveId);
  if (!lastMove) {
    return 10;
  }

  const averageThreat = Math.max(
    0,
    ...getActiveIds(state, getOpponentSide(target.side)).map(
      (allyId) => getDamagePreview(state, targetId, allyId, lastMove)?.estimate.averagePercent ?? 0,
    ),
  );
  return averageThreat * 0.6 + 25;
}

function scoreTauntAction(state: BattleState, targetId: string | null) {
  if (!targetId) {
    return 0;
  }
  const target = state.combatants[targetId];
  if (!target || target.tauntTurns > 0) {
    return 5;
  }

  const supportCount = getBelievedMoves(target, { topN: 6 }).filter(({ move, certainty }) => isNonDamagingMove(move) && certainty >= 0.2).length;
  return 40 + supportCount * 18;
}

function scoreStatusAction(state: BattleState, move: BattleMoveOption, targetId: string | null) {
  if (!targetId) {
    return 0;
  }
  const target = state.combatants[targetId];
  if (!target || target.statusCondition !== "none") {
    return 8;
  }

  if (move.effectData?.statusCondition === "sleep") {
    return 95;
  }

  if (move.effectData?.statusCondition === "paralysis") {
    return getEffectiveSpeed(state, targetId) * 0.4 + 35;
  }

  if (move.effectData?.statusCondition === "burn") {
    return 50 + Math.max(0, target.stages.attack) * 12;
  }

  return 30;
}

function scoreBoostAction(state: BattleState, actorId: string, effectData: BattleMoveEffectData | null) {
  const actor = state.combatants[actorId];
  if (!actor || !effectData?.selfStages) {
    return 0;
  }

  const pressure = Math.max(
    0,
    ...getBelievedDamagingMoves(state, actorId).flatMap((entry) =>
        getActiveIds(state, getOpponentSide(actor.side)).map(
          (targetId) =>
            (getDamagePreview(state, actorId, targetId, entry.move)?.estimate.averagePercent ?? 0) *
            (0.6 + entry.policyWeight * 0.4),
        ),
      ),
  );
  const stageValue =
    Math.abs(effectData.selfStages.attack ?? 0) * 30 +
    Math.abs(effectData.selfStages.defense ?? 0) * 24 +
    Math.abs(effectData.selfStages.specialAttack ?? 0) * 30 +
    Math.abs(effectData.selfStages.specialDefense ?? 0) * 24 +
    Math.abs(effectData.selfStages.speed ?? 0) * 22;
  return stageValue + pressure * 0.3;
}

function scoreHealAction(state: BattleState, actorId: string, effectData: BattleMoveEffectData | null) {
  const actor = state.combatants[actorId];
  if (!actor || !effectData) {
    return 0;
  }

  if (effectData.healAlliesFraction) {
    const allies = getActiveIds(state, actor.side);
    const missing = allies.reduce((sum, allyId) => sum + (state.combatants[allyId].maxHp - state.combatants[allyId].currentHp), 0);
    return missing * 0.25;
  }

  const missingHp = actor.maxHp - actor.currentHp;
  return missingHp * 0.45;
}

function buildPlannedAction(
  state: BattleState,
  actorId: string,
  action: BattleAction,
): PlannedAction {
  const actor = state.combatants[actorId];
  const actorLabel = actor ? actor.pokemon.name : "Unknown";

  if (action.type === "pass") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: pass`,
      heuristicScore: -10,
    };
  }

  if (action.type === "switch") {
    const switchIn = state.combatants[action.switchInId];
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: switch to ${switchIn?.pokemon.name ?? "bench"}`,
      heuristicScore: scoreSwitchAction(state, actorId, action.switchInId),
    };
  }

  const move = getMoveOption(state, actorId, action.moveId);
  const target = action.targetId ? state.combatants[action.targetId] : null;
  if (!move) {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: unknown move`,
      heuristicScore: -20,
    };
  }

  if (move.effectKind === "protect") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: Protect`,
      heuristicScore: scoreProtectAction(state, actorId),
    };
  }

  if (move.effectKind === "tailwind") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: Tailwind`,
      heuristicScore: state.sides[actor.side].tailwindTurns > 0 ? 10 : 95,
    };
  }

  if (move.effectKind === "trickRoom") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: Trick Room`,
      heuristicScore: scoreTrickRoomAction(state, actorId),
    };
  }

  if (move.effectKind === "helpingHand") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: Helping Hand${target ? ` on ${target.pokemon.name}` : ""}`,
      heuristicScore: scoreHelpingHandAction(state, actorId, action.targetId),
    };
  }

  if (move.effectKind === "redirection") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: ${move.name}`,
      heuristicScore: scoreRedirectionAction(state, actorId),
    };
  }

  if (move.effectKind === "screen") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: ${move.name}`,
      heuristicScore: scoreScreenAction(state, actorId, move.effectData?.screen),
    };
  }

  if (move.effectKind === "guard") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: ${move.name}`,
      heuristicScore: scoreGuardAction(state, actorId, move.effectData?.guard),
    };
  }

  if (move.effectKind === "safeguard") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: Safeguard`,
      heuristicScore: scoreSafeguardAction(state, actorId),
    };
  }

  if (move.effectKind === "allySwitch") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: Ally Switch`,
      heuristicScore: scoreAllySwitchAction(state, actorId),
    };
  }

  if (move.effectKind === "encore") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: Encore${target ? ` on ${target.pokemon.name}` : ""}`,
      heuristicScore: scoreEncoreAction(state, action.targetId),
    };
  }

  if (move.effectKind === "disable") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: Disable${target ? ` on ${target.pokemon.name}` : ""}`,
      heuristicScore: scoreDisableAction(state, action.targetId),
    };
  }

  if (move.effectKind === "taunt") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: Taunt${target ? ` on ${target.pokemon.name}` : ""}`,
      heuristicScore: scoreTauntAction(state, action.targetId),
    };
  }

  if (move.effectKind === "status") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: ${move.name}${target ? ` on ${target.pokemon.name}` : ""}`,
      heuristicScore: scoreStatusAction(state, move, action.targetId),
    };
  }

  if (move.effectKind === "boost") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: ${move.name}`,
      heuristicScore: scoreBoostAction(state, actorId, move.effectData),
    };
  }

  if (move.effectKind === "heal") {
    return {
      actorId,
      actorLabel,
      action,
      summary: `${actorLabel}: ${move.name}`,
      heuristicScore: scoreHealAction(state, actorId, move.effectData),
    };
  }

  const targetIds =
    move.targetKind === "allOpponents"
      ? getActiveIds(state, getOpponentSide(actor.side))
      : action.targetId
        ? [action.targetId]
        : [];
  const projectedDamage = sumProjectedDamage(state, actorId, move, targetIds);
  const koBonus = targetIds.some((targetId) => (getDamagePreview(state, actorId, targetId, move)?.estimate.maxPercent ?? 0) >= 100)
    ? 175
    : 0;
  const fakeOutBonus = move.effectKind === "fakeOut" ? 90 : 0;
  const targetLabel =
    move.targetKind === "allOpponents"
      ? "both foes"
      : target
        ? target.pokemon.name
        : move.targetKind === "singleAlly"
          ? "ally"
          : "target";
  const debuffBonus =
    Math.abs(move.effectData?.targetStages?.attack ?? 0) * 22 +
    Math.abs(move.effectData?.targetStages?.specialAttack ?? 0) * 22 +
    Math.abs(move.effectData?.targetStages?.speed ?? 0) * 18 +
    (move.effectData?.statusCondition === "paralysis" ? 35 : 0);

  const uncertaintyPenalty =
    move.source === "candidate" || move.source === "inferred"
      ? Math.max(10, Math.round((1 - Math.min(1, move.candidateWeight)) * 30) + (move.source === "inferred" ? 10 : 0))
      : 0;

  return {
    actorId,
    actorLabel,
    action,
    summary: `${actorLabel}: ${move.name}${targetLabel ? ` into ${targetLabel}` : ""}`,
    heuristicScore: projectedDamage + koBonus + fakeOutBonus + debuffBonus - uncertaintyPenalty,
  };
}

function generateActionsForActor(
  state: BattleState,
  actorId: string,
  maxIndividualActions: number,
) {
  const actor = state.combatants[actorId];
  if (!actor || actor.currentHp <= 0 || !isActiveCombatant(state, actorId)) {
    return [buildPlannedAction(state, actorId, { type: "pass", actorId })];
  }

  const enemyIds = getActiveIds(state, getOpponentSide(actor.side));
  const allyIds = getOtherActiveAllyIds(state, actorId);
  const actions: PlannedAction[] = [];
  const encoredMoveId = actor.encoreTurns > 0 ? actor.encoredMoveId : null;
  const movePool = [...actor.knownMoves, ...actor.candidateMoves].sort((left, right) => {
    if (left.source === right.source) {
      return right.candidateWeight - left.candidateWeight;
    }
    if (left.source === "candidate" || left.source === "inferred") {
      return 1;
    }
    if (right.source === "candidate" || right.source === "inferred") {
      return -1;
    }
    return 0;
  });

  for (const move of movePool) {
    if (move.effectKind === "unsupported") {
      continue;
    }

    if (actor.disabledMoveId === move.id && actor.disableTurns > 0) {
      continue;
    }

    if (actor.tauntTurns > 0 && isNonDamagingMove(move)) {
      continue;
    }

    if (encoredMoveId && move.id !== encoredMoveId) {
      continue;
    }

    if (move.effectKind === "fakeOut" && actor.turnsActive > 0) {
      continue;
    }

    if (move.effectKind === "redirection" && getOtherActiveAllyIds(state, actorId).length === 0) {
      continue;
    }

    if (
      move.targetKind === "field" ||
      move.targetKind === "self" ||
      move.targetKind === "allOpponents" ||
      move.targetKind === "allAdjacent" ||
      move.targetKind === "allAllies"
    ) {
      actions.push(buildPlannedAction(state, actorId, { type: "move", actorId, moveId: move.id, targetId: null }));
      continue;
    }

    if (move.targetKind === "singleAlly") {
      for (const targetId of allyIds) {
        actions.push(buildPlannedAction(state, actorId, { type: "move", actorId, moveId: move.id, targetId }));
      }
      continue;
    }

    for (const targetId of enemyIds) {
      if ((move.effectKind === "damage" || move.effectKind === "fakeOut") && isTargetImmuneByTyping(state, actorId, targetId, move)) {
        continue;
      }
      if (
        move.effectKind === "status" &&
        move.effectData?.statusCondition &&
        !canApplyStatusCondition(state, state.combatants[targetId], move.effectData.statusCondition, move)
      ) {
        continue;
      }
      actions.push(buildPlannedAction(state, actorId, { type: "move", actorId, moveId: move.id, targetId }));
    }
  }

  for (const switchInId of getBenchIds(state, actor.side)) {
    actions.push(buildPlannedAction(state, actorId, { type: "switch", actorId, switchInId }));
  }

  if (actions.length === 0) {
    actions.push(buildPlannedAction(state, actorId, { type: "pass", actorId }));
  }

  if (actor.statusCondition === "sleep" && actor.sleepTurns > 1) {
    return actions
      .filter((entry) => entry.action.type === "switch" || entry.action.type === "pass")
      .slice(0, maxIndividualActions);
  }

  return actions.sort((left, right) => right.heuristicScore - left.heuristicScore).slice(0, maxIndividualActions);
}

function getPlannedActionMove(state: BattleState, entry: PlannedAction) {
  if (entry.action.type !== "move") {
    return null;
  }

  return getMoveOption(state, entry.actorId, entry.action.moveId);
}

function isDefensiveMove(move: BattleMoveOption | null) {
  return move?.effectKind === "protect" || move?.effectKind === "guard";
}

function isSetupMove(move: BattleMoveOption | null) {
  return move?.effectKind === "boost" && Boolean(move.effectData?.selfStages);
}

function getDefensiveActionScore(state: BattleState, actions: PlannedAction[]) {
  return actions.reduce((sum, entry) => {
    const move = getPlannedActionMove(state, entry);
    return sum + (isDefensiveMove(move) ? entry.heuristicScore : 0);
  }, 0);
}

function getSetupActionScore(state: BattleState, actions: PlannedAction[]) {
  return actions.reduce((sum, entry) => {
    const move = getPlannedActionMove(state, entry);
    return sum + (isSetupMove(move) ? entry.heuristicScore : 0);
  }, 0);
}

function getMoveHitChance(move: BattleMoveOption) {
  return move.accuracy >= 100 ? 1 : Math.max(0.55, Math.min(1, move.accuracy / 100));
}

function getPreemptiveKoConfidence(
  state: BattleState,
  action: PlannedAction,
  move: BattleMoveOption,
  targetId: string,
) {
  const target = state.combatants[targetId];
  if (!target || target.currentHp <= 0 || isTargetImmuneByTyping(state, action.actorId, targetId, move)) {
    return 0;
  }

  const preview = getDamagePreview(state, action.actorId, targetId, move);
  if (!preview) {
    return 0;
  }

  const hitChance = getMoveHitChance(move);
  if (preview.estimate.averageDamage >= target.currentHp) {
    return hitChance;
  }

  if (preview.estimate.maxDamage >= target.currentHp) {
    return hitChance * 0.45;
  }

  return 0;
}

function getThreatControlConfidence(
  state: BattleState,
  actions: PlannedAction[],
  threat: DefensiveThreat,
  options?: {
    excludeActorId?: string;
  },
) {
  const threatSource = state.combatants[threat.attackerId];
  if (!threatSource) {
    return 0;
  }

  let confidence = 0;
  for (const action of actions) {
    if (action.actorId === options?.excludeActorId) {
      continue;
    }

    const move = getPlannedActionMove(state, action);
    const actor = state.combatants[action.actorId];
    if (!move || !actor || actor.side === threatSource.side) {
      continue;
    }

    if (!doesActionMoveBeforeThreat(state, action, threat)) {
      continue;
    }

    const targetIds = getTargetIdsForAction(state, actor, move, action.action.type === "move" ? action.action.targetId : null);
    if (!targetIds.includes(threat.attackerId)) {
      continue;
    }

    if (move.effectKind === "fakeOut" && actor.turnsActive === 0) {
      confidence = Math.max(confidence, getMoveHitChance(move) * 0.95);
      continue;
    }

    if (move.category !== null) {
      const koConfidence = getPreemptiveKoConfidence(state, action, move, threat.attackerId);
      confidence = Math.max(confidence, koConfidence);

      const threatHasProtect = hasSelfProtectMove([...threatSource.knownMoves, ...threatSource.candidateMoves]);
      if (threatHasProtect) {
        confidence = Math.max(confidence, koConfidence * 0.82);
      }
    }
  }

  return clampUnit(confidence);
}

function getDamagePieceControlConfidence(
  state: BattleState,
  actions: PlannedAction[],
  piece: IncomingDamagePiece,
  options?: {
    excludeActorId?: string;
  },
) {
  const threatSource = state.combatants[piece.attackerId];
  if (!threatSource) {
    return 0;
  }

  const pieceAction: PlannedAction = {
    actorId: piece.attackerId,
    actorLabel: threatSource.pokemon.name,
    action: {
      type: "move",
      actorId: piece.attackerId,
      moveId: piece.move.id,
      targetId: piece.targetId,
    },
    summary: `${threatSource.pokemon.name}: ${piece.move.name}`,
    heuristicScore: 0,
  };

  let confidence = 0;
  for (const action of actions) {
    if (action.actorId === options?.excludeActorId) {
      continue;
    }

    const move = getPlannedActionMove(state, action);
    const actor = state.combatants[action.actorId];
    if (!move || !actor || actor.side === threatSource.side) {
      continue;
    }

    if (compareActionOrder(state, action, pieceAction, state.field.trickRoomTurns > 0) >= 0) {
      continue;
    }

    const targetIds = getTargetIdsForAction(state, actor, move, action.action.type === "move" ? action.action.targetId : null);
    if (!targetIds.includes(piece.attackerId)) {
      continue;
    }

    if (move.effectKind === "fakeOut" && actor.turnsActive === 0) {
      confidence = Math.max(confidence, getMoveHitChance(move) * 0.95);
      continue;
    }

    if (move.category !== null) {
      confidence = Math.max(confidence, getPreemptiveKoConfidence(state, action, move, piece.attackerId));
    }
  }

  return clampUnit(confidence);
}

function doesActionMoveBeforeThreat(state: BattleState, action: PlannedAction, threat: DefensiveThreat) {
  const attacker = state.combatants[threat.attackerId];
  if (!attacker) {
    return false;
  }

  const threatAction: PlannedAction = {
    actorId: threat.attackerId,
    actorLabel: attacker.pokemon.name,
    action: {
      type: "move",
      actorId: threat.attackerId,
      moveId: threat.move.id,
      targetId: null,
    },
    summary: `${attacker.pokemon.name}: ${threat.move.name}`,
    heuristicScore: 0,
  };

  return compareActionOrder(state, action, threatAction, state.field.trickRoomTurns > 0) < 0;
}

function getThreatNeutralizationConfidence(
  state: BattleState,
  actions: PlannedAction[],
  threat: DefensiveThreat,
) {
  let confidence = 0;

  for (const action of actions) {
    const move = getPlannedActionMove(state, action);
    const actor = state.combatants[action.actorId];
    if (!move || !actor || actor.side === state.combatants[threat.attackerId]?.side || move.category === null) {
      continue;
    }

    if (!doesActionMoveBeforeThreat(state, action, threat)) {
      continue;
    }

    const targetIds = getTargetIdsForAction(state, actor, move, action.action.type === "move" ? action.action.targetId : null);
    if (!targetIds.includes(threat.attackerId)) {
      continue;
    }

    confidence = Math.max(confidence, getPreemptiveKoConfidence(state, action, move, threat.attackerId));
  }

  return confidence;
}

function getOffensiveTempoScore(state: BattleState, actions: PlannedAction[], threats: DefensiveThreat[]) {
  let score = 0;
  const offensiveActionCount = actions.filter((entry) => {
    const move = getPlannedActionMove(state, entry);
    return move?.category !== null;
  }).length;

  for (const threat of threats) {
    const neutralizationConfidence = getThreatNeutralizationConfidence(state, actions, threat);
    if (neutralizationConfidence <= 0) {
      continue;
    }

    const threatValue = threat.targets.reduce((sum, target) => sum + target.value, 0);
    score += threatValue * neutralizationConfidence * (offensiveActionCount > 1 ? 0.35 : 0.22);
  }

  return score;
}

function getBestProjectedPressure(state: BattleState, actorId: string) {
  const actor = state.combatants[actorId];
  if (!actor) {
    return 0;
  }

  return Math.max(
    0,
    ...getBelievedDamagingMoves(state, actorId).flatMap((entry) =>
      getActiveIds(state, getOpponentSide(actor.side)).map(
        (targetId) =>
          (getDamagePreview(state, actorId, targetId, entry.move)?.estimate.averagePercent ?? 0) *
          (0.6 + entry.policyWeight * 0.4),
      ),
    ),
  );
}

function getSetupOffensivePayoffScore(
  state: BattleState,
  boostedState: BattleState,
  actorId: string,
) {
  const actor = state.combatants[actorId];
  if (!actor) {
    return 0;
  }

  let score = 0;
  for (const entry of getBelievedDamagingMoves(state, actorId)) {
    const moveWeight = 0.6 + entry.policyWeight * 0.4;
    for (const targetId of getActiveIds(state, getOpponentSide(actor.side))) {
      const target = state.combatants[targetId];
      if (!target || target.currentHp <= 0) {
        continue;
      }

      const before = getDamagePreview(state, actorId, targetId, entry.move);
      const after = getDamagePreview(boostedState, actorId, targetId, entry.move);
      if (!before || !after) {
        continue;
      }

      score += Math.max(0, after.estimate.averagePercent - before.estimate.averagePercent) * moveWeight * 1.15;
      if (before.estimate.averageDamage < target.currentHp && after.estimate.averageDamage >= target.currentHp) {
        score += 70 * moveWeight;
      } else if (before.estimate.maxDamage < target.currentHp && after.estimate.maxDamage >= target.currentHp) {
        score += 34 * moveWeight;
      }
    }
  }

  return score;
}

function getSetupDefensivePayoffScore(
  state: BattleState,
  boostedState: BattleState,
  actorId: string,
  threats: DefensiveThreat[],
) {
  const actor = state.combatants[actorId];
  if (!actor) {
    return 0;
  }

  let score = 0;
  for (const threat of threats) {
    if (!threat.targets.some((target) => target.targetId === actorId)) {
      continue;
    }

    const before = getDamagePreview(state, threat.attackerId, actorId, threat.move);
    const after = getDamagePreview(boostedState, threat.attackerId, actorId, threat.move);
    if (!before || !after) {
      continue;
    }

    const preventedPercent = Math.max(0, before.estimate.averagePercent - after.estimate.averagePercent);
    score += preventedPercent * 0.95;
    if (before.estimate.averageDamage >= actor.currentHp && after.estimate.averageDamage < actor.currentHp) {
      score += 64;
    } else if (before.estimate.maxDamage >= actor.currentHp && after.estimate.maxDamage < actor.currentHp) {
      score += 30;
    }
  }

  return score;
}

function getSetupSpeedPayoffScore(
  state: BattleState,
  boostedState: BattleState,
  actorId: string,
  stages: BattleStageDelta,
) {
  if ((stages.speed ?? 0) <= 0) {
    return 0;
  }

  const actor = state.combatants[actorId];
  if (!actor) {
    return 0;
  }

  const beforeSpeed = getEffectiveSpeed(state, actorId);
  const afterSpeed = getEffectiveSpeed(boostedState, actorId);
  let score = 0;
  for (const targetId of getActiveIds(state, getOpponentSide(actor.side))) {
    const targetSpeed = getEffectiveSpeed(state, targetId);
    if (beforeSpeed > targetSpeed || afterSpeed <= targetSpeed) {
      continue;
    }

    const bestDamage = Math.max(
      0,
      ...getBelievedDamagingMoves(state, actorId).map(
        (entry) => getDamagePreview(boostedState, actorId, targetId, entry.move)?.estimate.averagePercent ?? 0,
      ),
    );
    const target = state.combatants[targetId];
    const koBonus =
      target && getBelievedDamagingMoves(state, actorId).some(
        (entry) => (getDamagePreview(boostedState, actorId, targetId, entry.move)?.estimate.maxDamage ?? 0) >= target.currentHp,
      )
        ? 30
        : 0;
    score += 28 + bestDamage * 0.22 + koBonus;
  }

  return score;
}

function getSetupPayoffScore(
  state: BattleState,
  actorId: string,
  stages: BattleStageDelta,
  threats: DefensiveThreat[],
) {
  const actor = state.combatants[actorId];
  if (!actor) {
    return 0;
  }

  const boostedState = cloneBattleState(state);
  const boostedActor = boostedState.combatants[actorId];
  if (!boostedActor) {
    return 0;
  }
  applyStageDelta(boostedActor, stages);

  const appliedStageValue =
    Math.max(0, boostedActor.stages.attack - actor.stages.attack) * 18 +
    Math.max(0, boostedActor.stages.specialAttack - actor.stages.specialAttack) * 18 +
    Math.max(0, boostedActor.stages.defense - actor.stages.defense) * 14 +
    Math.max(0, boostedActor.stages.specialDefense - actor.stages.specialDefense) * 14 +
    Math.max(0, boostedActor.stages.speed - actor.stages.speed) * 14;

  if (appliedStageValue <= 0) {
    return 0;
  }

  const offensivePayoff = getSetupOffensivePayoffScore(state, boostedState, actorId);
  const defensivePayoff = getSetupDefensivePayoffScore(state, boostedState, actorId, threats);
  const speedPayoff = getSetupSpeedPayoffScore(state, boostedState, actorId, stages);
  const currentPressure = getBestProjectedPressure(state, actorId);
  const payoff = appliedStageValue + offensivePayoff + defensivePayoff + speedPayoff + currentPressure * 0.08;

  return Math.min(260, payoff);
}

function getPlanThreatControlRatio(
  state: BattleState,
  actions: PlannedAction[],
  threats: DefensiveThreat[],
  setupActorId: string,
) {
  const setupActor = state.combatants[setupActorId];
  if (!setupActor) {
    return 0;
  }

  let totalThreatValue = 0;
  let controlledThreatValue = 0;
  for (const threat of threats) {
    const threatValue = threat.targets.reduce((sum, target) => sum + target.value, 0);
    if (threatValue <= 0) {
      continue;
    }

    totalThreatValue += threatValue;
    controlledThreatValue += threatValue * getThreatControlConfidence(state, actions, threat, { excludeActorId: setupActorId });
  }

  if (totalThreatValue <= 0) {
    return 0;
  }

  return clampUnit(controlledThreatValue / totalThreatValue);
}

function getSetupSafetyMultiplier(
  state: BattleState,
  actions: PlannedAction[],
  setupAction: PlannedAction,
  threats: DefensiveThreat[],
  bundles: IncomingDamageBundle[],
) {
  const actor = state.combatants[setupAction.actorId];
  if (!actor) {
    return 0;
  }

  let incomingValue = 0;
  let residualValue = 0;
  for (const threat of threats) {
    const actorThreatValue = threat.targets
      .filter((target) => target.targetId === setupAction.actorId)
      .reduce((sum, target) => sum + target.value, 0);
    if (actorThreatValue <= 0) {
      continue;
    }

    incomingValue += actorThreatValue;
    const controlConfidence = getThreatControlConfidence(state, actions, threat, { excludeActorId: setupAction.actorId });
    residualValue += actorThreatValue * (1 - controlConfidence);
  }

  const bundleRisk = getTargetBundleRiskValues(state, actions, bundles, setupAction.actorId, {
    excludeActorId: setupAction.actorId,
  });
  incomingValue += bundleRisk.incoming * 0.85;
  residualValue += bundleRisk.residual * 0.85;

  const personalSafety = incomingValue <= 0 ? 0.82 : clampUnit(1 - residualValue / Math.max(90, incomingValue));
  const boardControl = Math.max(
    getPlanThreatControlRatio(state, actions, threats, setupAction.actorId),
    getPlanBundleControlRatio(state, actions, bundles, setupAction.actorId),
  );
  const hpRatio = actor.maxHp > 0 ? actor.currentHp / actor.maxHp : 0;
  const hpAdjustment = hpRatio < 0.35 && residualValue > 45 ? -0.28 : hpRatio > 0.7 ? 0.08 : 0;

  return Math.max(0, Math.min(1.35, personalSafety + boardControl * 0.48 + hpAdjustment));
}

function getSetupOpportunityScore(
  state: BattleState,
  actions: PlannedAction[],
  threats: DefensiveThreat[],
  bundles: IncomingDamageBundle[],
) {
  return actions.reduce((sum, entry) => {
    const move = getPlannedActionMove(state, entry);
    if (!isSetupMove(move) || !move?.effectData?.selfStages) {
      return sum;
    }

    const payoff = getSetupPayoffScore(state, entry.actorId, move.effectData.selfStages, threats);
    if (payoff <= 18) {
      return sum - 24;
    }

    const safetyMultiplier = getSetupSafetyMultiplier(state, actions, entry, threats, bundles);
    return sum + payoff * safetyMultiplier - 18;
  }, 0);
}

function getBundleRiskValue(
  state: BattleState,
  bundle: IncomingDamageBundle,
  getScale?: (piece: IncomingDamagePiece) => number,
) {
  const target = state.combatants[bundle.targetId];
  if (!target || target.currentHp <= 0) {
    return 0;
  }

  const scaledPieces = bundle.pieces.map((piece) => ({
    piece,
    scale: clampUnit(getScale ? getScale(piece) : 1),
  }));
  const averageDamage = scaledPieces.reduce((sum, entry) => sum + entry.piece.averageDamage * entry.scale, 0);
  const maxDamage = scaledPieces.reduce((sum, entry) => sum + entry.piece.maxDamage * entry.scale, 0);
  const averagePercent = scaledPieces.reduce((sum, entry) => sum + entry.piece.averagePercent * entry.scale, 0);

  if (averageDamage <= 0 && maxDamage <= 0) {
    return 0;
  }

  const individualAverageKo = scaledPieces.some((entry) => entry.piece.averageDamage * entry.scale >= target.currentHp);
  const individualMaxKo = scaledPieces.some((entry) => entry.piece.maxDamage * entry.scale >= target.currentHp);
  const averageKoBonus = averageDamage >= target.currentHp ? (individualAverageKo ? 55 : 155) : 0;
  const maxKoBonus = maxDamage >= target.currentHp ? (individualMaxKo ? 24 : 76) : 0;
  const multiSourceBonus = bundle.pieces.length > 1 && averageDamage >= target.currentHp * 0.82 ? 32 : 0;

  return (averagePercent * 0.38 + averageKoBonus + maxKoBonus + multiSourceBonus) * bundle.weight;
}

function getBundlePiecePreventionConfidence(
  state: BattleState,
  actions: PlannedAction[],
  piece: IncomingDamagePiece,
  options?: {
    excludeActorId?: string;
  },
) {
  let confidence = getDamagePieceControlConfidence(state, actions, piece, options);

  for (const entry of actions) {
    const move = getPlannedActionMove(state, entry);
    if (!move) {
      continue;
    }

    if (move.effectKind === "protect" && entry.actorId === piece.targetId) {
      const protector = state.combatants[entry.actorId];
      confidence = Math.max(confidence, getProtectSuccessChance(protector?.protectStreak ?? 0));
    }

    if (move.effectKind === "guard" && move.effectData?.guard === "wideGuard" && piece.isSpread) {
      confidence = Math.max(confidence, 1);
    }

    if (move.effectKind === "guard" && move.effectData?.guard === "quickGuard" && piece.isPriority) {
      confidence = Math.max(confidence, 1);
    }
  }

  return clampUnit(confidence);
}

function getBundleResidualRiskValue(
  state: BattleState,
  actions: PlannedAction[],
  bundle: IncomingDamageBundle,
  options?: {
    excludeActorId?: string;
  },
) {
  return getBundleRiskValue(
    state,
    bundle,
    (piece) => 1 - getBundlePiecePreventionConfidence(state, actions, piece, options),
  );
}

function getBundlePreventionScore(state: BattleState, actions: PlannedAction[], bundles: IncomingDamageBundle[]) {
  return bundles.reduce((sum, bundle) => {
    const before = getBundleRiskValue(state, bundle);
    if (before <= 0) {
      return sum;
    }

    const after = getBundleResidualRiskValue(state, actions, bundle);
    return sum + Math.max(0, before - after);
  }, 0);
}

function getPlanBundleControlRatio(
  state: BattleState,
  actions: PlannedAction[],
  bundles: IncomingDamageBundle[],
  excludeActorId: string,
) {
  let totalRisk = 0;
  let controlledRisk = 0;
  for (const bundle of bundles) {
    const before = getBundleRiskValue(state, bundle);
    if (before <= 0) {
      continue;
    }

    totalRisk += before;
    controlledRisk += Math.max(0, before - getBundleResidualRiskValue(state, actions, bundle, { excludeActorId }));
  }

  if (totalRisk <= 0) {
    return 0;
  }

  return clampUnit(controlledRisk / totalRisk);
}

function getTargetBundleRiskValues(
  state: BattleState,
  actions: PlannedAction[],
  bundles: IncomingDamageBundle[],
  targetId: string,
  options?: {
    excludeActorId?: string;
  },
) {
  return bundles.reduce(
    (values, bundle) => {
      if (bundle.targetId !== targetId) {
        return values;
      }

      const before = getBundleRiskValue(state, bundle);
      values.incoming += before;
      values.residual += getBundleResidualRiskValue(state, actions, bundle, options);
      return values;
    },
    { incoming: 0, residual: 0 },
  );
}

function getSecuredTargetOvercommitPenalty(state: BattleState, actions: PlannedAction[]) {
  const actionsByTarget = new Map<string, PlannedAction[]>();
  for (const entry of actions) {
    const move = getPlannedActionMove(state, entry);
    if (!move || move.category === null || move.isSpreadMove || entry.action.type !== "move" || !entry.action.targetId) {
      continue;
    }

    const groupedActions = actionsByTarget.get(entry.action.targetId) ?? [];
    groupedActions.push(entry);
    actionsByTarget.set(entry.action.targetId, groupedActions);
  }

  let penalty = 0;
  for (const [targetId, groupedActions] of actionsByTarget) {
    if (groupedActions.length < 2) {
      continue;
    }

    const target = state.combatants[targetId];
    if (!target || target.currentHp <= 0) {
      continue;
    }

    const securedActions = groupedActions.filter((entry) => {
      const move = getPlannedActionMove(state, entry);
      if (!move) {
        return false;
      }

      const preview = getDamagePreview(state, entry.actorId, targetId, move);
      return (preview?.estimate.averageDamage ?? 0) >= target.currentHp;
    });

    if (securedActions.length === 0) {
      continue;
    }

    penalty += (groupedActions.length - 1) * 46;
  }

  return penalty;
}

function getDefensiveCoverageScore(
  state: BattleState,
  actions: PlannedAction[],
  threats: DefensiveThreat[],
) {
  const protectedIds = new Set<string>();
  const switchedOutIds = new Set<string>();
  let wideGuardActive = false;
  let quickGuardActive = false;
  let protectStallScore = 0;

  for (const entry of actions) {
    if (entry.action.type === "switch") {
      switchedOutIds.add(entry.actorId);
      continue;
    }

    const move = getPlannedActionMove(state, entry);
    if (!move) {
      continue;
    }

    if (move.effectKind === "protect") {
      const actor = state.combatants[entry.actorId];
      protectedIds.add(entry.actorId);
      protectStallScore += (actor ? getProtectStallScore(state, actor.side) : 0) * getProtectSuccessChance(actor?.protectStreak ?? 0);
      continue;
    }

    if (move.effectKind === "guard" && move.effectData?.guard === "wideGuard") {
      wideGuardActive = true;
    }
    if (move.effectKind === "guard" && move.effectData?.guard === "quickGuard") {
      quickGuardActive = true;
    }
  }

  if (protectedIds.size === 0 && switchedOutIds.size === 0 && !wideGuardActive && !quickGuardActive) {
    return 0;
  }

  let coveredThreatValue = 0;
  for (const threat of threats) {
    const neutralizationConfidence = getThreatNeutralizationConfidence(state, actions, threat);
    const guardCoversThreat = (wideGuardActive && threat.isSpread) || (quickGuardActive && threat.isPriority);

    for (const target of threat.targets) {
      if (switchedOutIds.has(target.targetId)) {
        continue;
      }

      if (protectedIds.has(target.targetId)) {
        const protector = state.combatants[target.targetId];
        coveredThreatValue += target.value * (1 - neutralizationConfidence) * getProtectSuccessChance(protector?.protectStreak ?? 0);
        continue;
      }

      if (guardCoversThreat) {
        coveredThreatValue += target.value * (1 - neutralizationConfidence);
      }
    }
  }

  const defensiveMoveCount = actions.filter((entry) => isDefensiveMove(getPlannedActionMove(state, entry))).length;
  return coveredThreatValue * 1.25 + protectStallScore * 0.8 - defensiveMoveCount * 8;
}

function combineActionSets(state: BattleState, side: BattleSide, actionGroups: PlannedAction[][]) {
  if (actionGroups.length === 0) {
    return [];
  }

  const plans: JointActionPlan[] = [];

  const walk = (index: number, current: PlannedAction[]) => {
    if (index === actionGroups.length) {
      const switchTargets = current
        .filter((entry) => entry.action.type === "switch")
        .map((entry) => (entry.action.type === "switch" ? entry.action.switchInId : ""));
      if (new Set(switchTargets).size !== switchTargets.length) {
        return;
      }

      const heuristicScore = current.reduce((sum, action) => sum + action.heuristicScore, 0);
      const focusMap = new Map<string, number>();
      for (const action of current) {
        if (action.action.type === "move" && action.action.targetId) {
          focusMap.set(action.action.targetId, (focusMap.get(action.action.targetId) ?? 0) + 1);
        }
      }
      const focusBonus = [...focusMap.values()].reduce((sum, count) => sum + (count >= 2 ? 40 : 0), 0);
      const defensiveThreats = getDefensiveThreats(state, side);
      const incomingDamageBundles = getIncomingDamageBundles(state, side);
      const defensiveCoverageScore = getDefensiveCoverageScore(state, current, defensiveThreats);
      const offensiveTempoScore = getOffensiveTempoScore(state, current, defensiveThreats);
      const comboDamagePreventionScore = getBundlePreventionScore(state, current, incomingDamageBundles) * 0.7;
      const defensiveActionScore = getDefensiveActionScore(state, current);
      const securedTargetOvercommitPenalty = getSecuredTargetOvercommitPenalty(state, current);
      plans.push({
        side,
        actions: [...current].sort((left, right) => left.actorId.localeCompare(right.actorId)),
        summary: current.map((entry) => entry.summary).join(" | "),
        heuristicScore:
          heuristicScore -
          defensiveActionScore -
          getSetupActionScore(state, current) +
          focusBonus +
          defensiveCoverageScore +
          offensiveTempoScore +
          comboDamagePreventionScore +
          getSetupOpportunityScore(state, current, defensiveThreats, incomingDamageBundles) -
          securedTargetOvercommitPenalty,
      });
      return;
    }

    for (const action of actionGroups[index]) {
      current.push(action);
      walk(index + 1, current);
      current.pop();
    }
  };

  walk(0, []);
  return plans;
}

export function generateJointActionPlans(
  state: BattleState,
  side: BattleSide,
  options?: {
    maxIndividualActionsPerActor?: number;
    maxJointPlans?: number;
  },
) {
  const maxIndividualActions = options?.maxIndividualActionsPerActor ?? DEFAULT_MAX_INDIVIDUAL_ACTIONS;
  const maxJointPlans = options?.maxJointPlans ?? DEFAULT_MAX_JOINT_PLANS;
  const activeIds = getActiveIds(state, side);
  const actionGroups = activeIds.map((actorId) => generateActionsForActor(state, actorId, maxIndividualActions));
  return combineActionSets(state, side, actionGroups)
    .sort((left, right) => right.heuristicScore - left.heuristicScore)
    .slice(0, maxJointPlans);
}

function removeBenchId(sideState: BattleState["sides"][BattleSide], combatantId: string) {
  sideState.benchIds = sideState.benchIds.filter((id) => id !== combatantId);
}

function addBenchId(sideState: BattleState["sides"][BattleSide], combatantId: string) {
  if (!sideState.benchIds.includes(combatantId)) {
    sideState.benchIds.push(combatantId);
  }
}

function executeSwitch(
  state: BattleState,
  action: BattleAction & { type: "switch" },
  events: TurnEvent[],
  switchedActiveIds?: Map<string, string>,
) {
  const actor = state.combatants[action.actorId];
  const switchIn = state.combatants[action.switchInId];
  if (!actor || !switchIn || actor.currentHp <= 0 || switchIn.currentHp <= 0) {
    return;
  }

  const sideState = state.sides[actor.side];
  const activeIndex = sideState.activeIds.findIndex((id) => id === actor.id);
  if (activeIndex === -1) {
    return;
  }

  sideState.activeIds[activeIndex] = switchIn.id;
  switchedActiveIds?.set(actor.id, switchIn.id);
  removeBenchId(sideState, switchIn.id);
  addBenchId(sideState, actor.id);
  actor.protectStreak = 0;
  maybeApplyRegenerator(state, actor, events);
  switchIn.wasSwitchedInThisTurn = true;
  actor.wasSwitchedInThisTurn = false;
  events.push({
    actorId: actor.id,
    targetId: switchIn.id,
    text: `${actor.pokemon.name} switches out for ${switchIn.pokemon.name}.`,
  });
  triggerEntryAbility(state, switchIn.id, events);
}

function applyDamage(state: BattleState, targetId: string, damage: number) {
  const target = state.combatants[targetId];
  if (!target) {
    return 0;
  }

  const appliedDamage = Math.min(target.currentHp, Math.max(0, damage));
  target.currentHp -= appliedDamage;
  return appliedDamage;
}

function consumeItem(combatant: BattleCombatantState) {
  combatant.itemConsumed = true;
}

function cloneStages(stages: BattleStatStages): BattleStatStages {
  return { ...stages };
}

function getStageDeltaDifference(before: BattleStatStages, after: BattleStatStages): BattleStageDelta {
  const delta: BattleStageDelta = {};

  for (const stageKey of STAGE_KEYS) {
    const change = after[stageKey] - before[stageKey];
    if (change !== 0) {
      delta[stageKey] = change;
    }
  }

  return delta;
}

function hasAnyStageDelta(delta: BattleStageDelta | undefined) {
  return STAGE_KEYS.some((stageKey) => typeof delta?.[stageKey] === "number" && delta[stageKey] !== 0);
}

function hasNegativeStageDelta(delta: BattleStageDelta | undefined) {
  return STAGE_KEYS.some((stageKey) => typeof delta?.[stageKey] === "number" && (delta[stageKey] ?? 0) < 0);
}

function invertStageDelta(delta: BattleStageDelta | undefined): BattleStageDelta {
  const inverted: BattleStageDelta = {};

  for (const stageKey of STAGE_KEYS) {
    if (typeof delta?.[stageKey] === "number") {
      inverted[stageKey] = -(delta[stageKey] ?? 0);
    }
  }

  return inverted;
}

function getRestoringStageDelta(delta: BattleStageDelta | undefined): BattleStageDelta {
  const restoring: BattleStageDelta = {};

  for (const stageKey of STAGE_KEYS) {
    const change = delta?.[stageKey] ?? 0;
    if (change < 0) {
      restoring[stageKey] = -change;
    }
  }

  return restoring;
}

function getNegativeOnlyStageDelta(delta: BattleStageDelta | undefined): BattleStageDelta {
  const negativeOnly: BattleStageDelta = {};

  for (const stageKey of STAGE_KEYS) {
    const change = delta?.[stageKey] ?? 0;
    if (change < 0) {
      negativeOnly[stageKey] = change;
    }
  }

  return negativeOnly;
}

function stripNegativeStageDelta(delta: BattleStageDelta | undefined): BattleStageDelta {
  const stripped: BattleStageDelta = {};

  for (const stageKey of STAGE_KEYS) {
    const change = delta?.[stageKey] ?? 0;
    if (change > 0) {
      stripped[stageKey] = change;
    }
  }

  return stripped;
}

function canUseFocusSash(target: BattleCombatantState, damage: number) {
  return (
    target.itemId === "focussash" &&
    !target.itemConsumed &&
    target.currentHp === target.maxHp &&
    damage >= target.currentHp
  );
}

function maybeConsumeResistBerry(
  target: BattleCombatantState,
  move: BattleMoveOption,
  preview: NonNullable<ReturnType<typeof getDamagePreview>>,
  appliedDamage: number,
  events: TurnEvent[],
) {
  if (
    appliedDamage <= 0 ||
    target.itemConsumed ||
    !move.type ||
    !doesDefenderItemReduceDamage({
      attackType: move.type,
      defenderItem: target.itemId,
      typeMultiplier: preview.estimate.typeMultiplier,
    })
  ) {
    return;
  }

  consumeItem(target);
  events.push({
    targetId: target.id,
    text: `${target.pokemon.name}'s ${target.itemName ?? "Berry"} is consumed.`,
  });
}

function maybeTriggerSitrusBerry(state: BattleState, target: BattleCombatantState, events: TurnEvent[]) {
  if (target.currentHp <= 0 || target.itemId !== "sitrusberry" || target.itemConsumed || target.currentHp > target.maxHp / 2) {
    return;
  }

  const healed = healCombatant(state, target.id, SITRUS_BERRY_HEAL_FRACTION);
  if (healed <= 0) {
    return;
  }

  consumeItem(target);
  events.push({
    targetId: target.id,
    text: `${target.pokemon.name} restores ${healed} HP with Sitrus Berry.`,
  });
}

function healCombatant(state: BattleState, targetId: string, fraction: number) {
  const target = state.combatants[targetId];
  if (!target || target.currentHp <= 0) {
    return 0;
  }

  const missingHp = target.maxHp - target.currentHp;
  const restored = Math.min(missingHp, Math.max(1, Math.floor(target.maxHp * fraction)));
  target.currentHp += restored;
  return restored;
}

function applyStageDelta(combatant: BattleCombatantState, delta: BattleStageDelta | undefined) {
  if (!delta) {
    return;
  }

  if (typeof delta.attack === "number") {
    combatant.stages.attack = clampStage(combatant.stages.attack + delta.attack);
  }
  if (typeof delta.defense === "number") {
    combatant.stages.defense = clampStage(combatant.stages.defense + delta.defense);
  }
  if (typeof delta.specialAttack === "number") {
    combatant.stages.specialAttack = clampStage(combatant.stages.specialAttack + delta.specialAttack);
  }
  if (typeof delta.specialDefense === "number") {
    combatant.stages.specialDefense = clampStage(combatant.stages.specialDefense + delta.specialDefense);
  }
  if (typeof delta.speed === "number") {
    combatant.stages.speed = clampStage(combatant.stages.speed + delta.speed);
  }
}

function applyStageDeltaDetailed(combatant: BattleCombatantState, delta: BattleStageDelta | undefined) {
  const before = cloneStages(combatant.stages);
  applyStageDelta(combatant, delta);
  return getStageDeltaDifference(before, combatant.stages);
}

function maybeTriggerWhiteHerb(target: BattleCombatantState, actualDelta: BattleStageDelta, events: TurnEvent[]) {
  if (target.itemId !== "whiteherb" || target.itemConsumed || !hasNegativeStageDelta(actualDelta)) {
    return;
  }

  const restoringDelta = getRestoringStageDelta(actualDelta);
  if (!hasAnyStageDelta(restoringDelta)) {
    return;
  }

  applyStageDelta(target, restoringDelta);
  consumeItem(target);
  events.push({
    targetId: target.id,
    text: `${target.pokemon.name} restores its lowered stats with White Herb.`,
  });
}

function maybeTriggerStatDropAbility(
  target: BattleCombatantState,
  source: BattleCombatantState | null,
  actualDelta: BattleStageDelta,
  events: TurnEvent[],
) {
  if (!source || source.side === target.side || !hasNegativeStageDelta(actualDelta)) {
    return;
  }

  const abilityKey = getAbilityKey(target);
  if (abilityKey === "defiant") {
    applyStageDelta(target, { attack: 2 });
    events.push({
      targetId: target.id,
      text: `${target.pokemon.name}'s Defiant sharply raises its Attack.`,
    });
    return;
  }

  if (abilityKey === "competitive") {
    applyStageDelta(target, { specialAttack: 2 });
    events.push({
      targetId: target.id,
      text: `${target.pokemon.name}'s Competitive sharply raises its Special Attack.`,
    });
  }
}

function applyReactiveStageDelta(
  target: BattleCombatantState,
  delta: BattleStageDelta | undefined,
  events: TurnEvent[],
  options?: {
    source?: BattleCombatantState | null;
    cause?: "intimidate" | "move" | "other";
    allowReflection?: boolean;
  },
) {
  const source = options?.source ?? null;
  const cause = options?.cause ?? "other";
  const allowReflection = options?.allowReflection ?? true;
  const abilityKey = getAbilityKey(target);
  let adjustedDelta = abilityKey === "contrary" ? invertStageDelta(delta) : delta;

  if (source && source.side !== target.side && hasNegativeStageDelta(adjustedDelta)) {
    const negativeDelta = getNegativeOnlyStageDelta(adjustedDelta);

    if (
      abilityKey === "clearbody" ||
      abilityKey === "whitesmoke" ||
      abilityKey === "fullmetalbody" ||
      target.itemId === "clearamulet" ||
      (cause === "intimidate" &&
        (abilityKey === "innerfocus" ||
          abilityKey === "owntempo" ||
          abilityKey === "scrappy" ||
          abilityKey === "oblivious"))
    ) {
      adjustedDelta = stripNegativeStageDelta(adjustedDelta);
      if (hasAnyStageDelta(negativeDelta)) {
        events.push({
          targetId: target.id,
          text: `${target.pokemon.name}'s ${target.itemId === "clearamulet" ? (target.itemName ?? "Clear Amulet") : (target.abilityName ?? "ability")} prevents the stat drop.`,
        });
      }
    } else if (abilityKey === "mirrorarmor" && allowReflection) {
      adjustedDelta = stripNegativeStageDelta(adjustedDelta);
      if (hasAnyStageDelta(negativeDelta)) {
        events.push({
          targetId: target.id,
          text: `${target.pokemon.name}'s Mirror Armor reflects the stat drop.`,
        });
        applyReactiveStageDelta(source, negativeDelta, events, {
          source: target,
          cause,
          allowReflection: false,
        });
      }
    }
  }

  const actualDelta = applyStageDeltaDetailed(target, adjustedDelta);

  if (!hasAnyStageDelta(actualDelta)) {
    return actualDelta;
  }

  maybeTriggerWhiteHerb(target, actualDelta, events);
  maybeTriggerStatDropAbility(target, source, actualDelta, events);
  return actualDelta;
}

function applyIntimidate(state: BattleState, source: BattleCombatantState, events: TurnEvent[]) {
  for (const targetId of getActiveIds(state, getOpponentSide(source.side))) {
    const target = state.combatants[targetId];
    if (!target || target.currentHp <= 0) {
      continue;
    }

    const actualDelta = applyReactiveStageDelta(target, { attack: -1 }, events, { source, cause: "intimidate" });
    if (hasAnyStageDelta(actualDelta)) {
      events.push({
        actorId: source.id,
        targetId: target.id,
        text: `${source.pokemon.name}'s Intimidate lowers ${target.pokemon.name}'s Attack.`,
      });
    }
  }
}

function triggerEntryAbility(state: BattleState, combatantId: string, events: TurnEvent[]) {
  const combatant = state.combatants[combatantId];
  if (!combatant || combatant.currentHp <= 0 || !isActiveCombatant(state, combatantId)) {
    return;
  }

  const abilityKey = getAbilityKey(combatant);
  const weather = WEATHER_ENTRY_ABILITIES[abilityKey];
  if (weather && state.field.weather !== weather) {
    state.field.weather = weather;
    events.push({
      actorId: combatant.id,
      text: `${combatant.pokemon.name}'s ${combatant.abilityName ?? combatant.abilityId} made it ${weather}.`,
    });
  }

  if (abilityKey === "intimidate") {
    applyIntimidate(state, combatant, events);
  }
}

function applyInitialEntryEffects(state: BattleState) {
  const initialActiveIds = [...state.sides.ally.activeIds, ...state.sides.enemy.activeIds].filter(
    (combatantId): combatantId is string => Boolean(combatantId),
  );
  const getEntryOrderSpeed = (combatantId: string) => {
    const combatant = state.combatants[combatantId];
    return combatant ? getEffectiveSpeedForBattleState(state, combatant) : 0;
  };
  const orderedActiveIds = initialActiveIds.sort(
    (left, right) => getEntryOrderSpeed(right) - getEntryOrderSpeed(left),
  );

  for (const combatantId of orderedActiveIds) {
    triggerEntryAbility(state, combatantId, []);
  }
}

function getAbsorbRedirectTargetId(state: BattleState, side: BattleSide, move: BattleMoveOption) {
  if (move.targetKind !== "singleOpponent" || !move.type) {
    return null;
  }

  const redirectAbility =
    move.type === "water" ? "stormdrain" : move.type === "electric" ? "lightningrod" : null;
  if (!redirectAbility) {
    return null;
  }

  return (
    getActiveIds(state, side).find((combatantId) => {
      const combatant = state.combatants[combatantId];
      return combatant ? getAbilityKey(combatant) === redirectAbility : false;
    }) ?? null
  );
}

function maybeApplyRegenerator(state: BattleState, combatant: BattleCombatantState, events: TurnEvent[]) {
  if (getAbilityKey(combatant) !== "regenerator" || combatant.currentHp <= 0) {
    return;
  }

  const missingHp = combatant.maxHp - combatant.currentHp;
  const restored = Math.min(missingHp, Math.max(1, Math.floor(combatant.maxHp / 3)));
  if (restored <= 0) {
    return;
  }

  combatant.currentHp += restored;
  events.push({
    targetId: combatant.id,
    text: `${combatant.pokemon.name} restores ${restored} HP with Regenerator.`,
  });
}

function maybeTriggerAbilityAbsorb(
  state: BattleState,
  actor: BattleCombatantState,
  target: BattleCombatantState,
  move: BattleMoveOption,
  events: TurnEvent[],
) {
  if (!move.type) {
    return false;
  }

  const abilityKey = getAbilityKey(target);
  if (move.type === "water" && abilityKey === "waterabsorb") {
    const healed = healCombatant(state, target.id, 0.25);
    events.push({ actorId: actor.id, targetId: target.id, text: `${target.pokemon.name}'s Water Absorb nullifies ${move.name}.${healed > 0 ? ` It restores ${healed} HP.` : ""}` });
    return true;
  }

  if (move.type === "electric" && abilityKey === "voltabsorb") {
    const healed = healCombatant(state, target.id, 0.25);
    events.push({ actorId: actor.id, targetId: target.id, text: `${target.pokemon.name}'s Volt Absorb nullifies ${move.name}.${healed > 0 ? ` It restores ${healed} HP.` : ""}` });
    return true;
  }

  if (move.type === "ground" && abilityKey === "eartheater") {
    const healed = healCombatant(state, target.id, 0.25);
    events.push({ actorId: actor.id, targetId: target.id, text: `${target.pokemon.name}'s Earth Eater nullifies ${move.name}.${healed > 0 ? ` It restores ${healed} HP.` : ""}` });
    return true;
  }

  if (move.type === "fire" && abilityKey === "flashfire") {
    target.flashFireBoosted = true;
    events.push({ actorId: actor.id, targetId: target.id, text: `${target.pokemon.name}'s Flash Fire nullifies ${move.name} and powers up its Fire moves.` });
    return true;
  }

  if (move.type === "water" && abilityKey === "stormdrain") {
    applyStageDelta(target, { specialAttack: 1 });
    events.push({ actorId: actor.id, targetId: target.id, text: `${target.pokemon.name}'s Storm Drain nullifies ${move.name} and raises its Special Attack.` });
    return true;
  }

  if (move.type === "electric" && abilityKey === "lightningrod") {
    applyStageDelta(target, { specialAttack: 1 });
    events.push({ actorId: actor.id, targetId: target.id, text: `${target.pokemon.name}'s Lightning Rod nullifies ${move.name} and raises its Special Attack.` });
    return true;
  }

  if (move.type === "electric" && abilityKey === "motordrive") {
    applyStageDelta(target, { speed: 1 });
    events.push({ actorId: actor.id, targetId: target.id, text: `${target.pokemon.name}'s Motor Drive nullifies ${move.name} and raises its Speed.` });
    return true;
  }

  if (move.type === "grass" && abilityKey === "sapsipper") {
    applyStageDelta(target, { attack: 1 });
    events.push({ actorId: actor.id, targetId: target.id, text: `${target.pokemon.name}'s Sap Sipper nullifies ${move.name} and raises its Attack.` });
    return true;
  }

  return false;
}

function maybeTriggerOnHitAbility(
  target: BattleCombatantState,
  actor: BattleCombatantState,
  move: BattleMoveOption,
  appliedDamage: number,
  previousHp: number,
  events: TurnEvent[],
) {
  if (appliedDamage <= 0 || !move.type) {
    return;
  }

  const abilityKey = getAbilityKey(target);
  if (abilityKey === "stamina") {
    applyStageDelta(target, { defense: 1 });
    events.push({ targetId: target.id, text: `${target.pokemon.name}'s Stamina raises its Defense.` });
  }

  if (abilityKey === "weakarmor" && move.category === "physical") {
    applyReactiveStageDelta(target, { defense: -1, speed: 2 }, events, { source: actor, cause: "move" });
    events.push({ targetId: target.id, text: `${target.pokemon.name}'s Weak Armor trades Defense for Speed.` });
  }

  if (abilityKey === "berserk" && target.currentHp > 0 && previousHp > target.maxHp / 2 && target.currentHp <= target.maxHp / 2) {
    applyStageDelta(target, { specialAttack: 1 });
    events.push({ targetId: target.id, text: `${target.pokemon.name}'s Berserk raises its Special Attack.` });
  }

  if (abilityKey === "justified" && move.type === "dark") {
    applyStageDelta(target, { attack: 1 });
    events.push({ targetId: target.id, text: `${target.pokemon.name}'s Justified raises its Attack.` });
  }

  if (abilityKey === "rattled" && (move.type === "bug" || move.type === "ghost" || move.type === "dark")) {
    applyStageDelta(target, { speed: 1 });
    events.push({ targetId: target.id, text: `${target.pokemon.name}'s Rattled raises its Speed.` });
  }
}

function maybeTriggerKoAbility(actor: BattleCombatantState, events: TurnEvent[]) {
  const abilityKey = getAbilityKey(actor);
  if (abilityKey === "moxie") {
    applyStageDelta(actor, { attack: 1 });
    events.push({ actorId: actor.id, text: `${actor.pokemon.name}'s Moxie raises its Attack.` });
    return;
  }

  if (abilityKey === "grimneigh") {
    applyStageDelta(actor, { specialAttack: 1 });
    events.push({ actorId: actor.id, text: `${actor.pokemon.name}'s Grim Neigh raises its Special Attack.` });
    return;
  }

  if (abilityKey !== "beastboost") {
    return;
  }

  const stats = getChampionsComputedStats(actor.pokemon, {
    spread: actor.statSpread,
  });
  const rankedStats: Array<[keyof BattleStatStages, number]> = [
    ["attack", stats.atk],
    ["defense", stats.def],
    ["specialAttack", stats.spa],
    ["specialDefense", stats.spd],
    ["speed", stats.spe],
  ];
  const highestStat = rankedStats.sort((left, right) => right[1] - left[1])[0]?.[0];

  if (highestStat) {
    applyStageDelta(actor, { [highestStat]: 1 } as BattleStageDelta);
    events.push({ actorId: actor.id, text: `${actor.pokemon.name}'s Beast Boost raises its ${highestStat}.` });
  }
}

function applyStatusCondition(
  state: BattleState,
  target: BattleCombatantState,
  statusCondition: BattleStatusCondition | undefined,
  move: BattleMoveOption,
) {
  if (!statusCondition || statusCondition === "none" || target.statusCondition !== "none") {
    return false;
  }

  if (!canApplyStatusCondition(state, target, statusCondition, move)) {
    return false;
  }

  target.statusCondition = statusCondition;
  target.sleepTurns = statusCondition === "sleep" ? DEFAULT_SLEEP_TURNS : 0;
  return true;
}

function getScreenTurns(actor: BattleCombatantState) {
  return normalizeMoveKey(actor.itemName ?? "") === "lightclay" ? EXTENDED_SCREEN_TURNS : DEFAULT_SCREEN_TURNS;
}

function resolveSingleTarget(state: BattleState, actor: BattleCombatantState, originalTargetId: string, move: BattleMoveOption) {
  const originalTarget = state.combatants[originalTargetId];
  if (!originalTarget || originalTarget.side === actor.side) {
    return originalTargetId;
  }

  const allySwitchPair = state.sides[originalTarget.side].allySwitchPair;
  if (
    allySwitchPair &&
    move.targetKind === "singleOpponent" &&
    (originalTargetId === allySwitchPair[0] || originalTargetId === allySwitchPair[1])
  ) {
    return originalTargetId === allySwitchPair[0] ? allySwitchPair[1] : allySwitchPair[0];
  }

  const redirectedId = state.sides[originalTarget.side].redirectionTargetId;
  if (!redirectedId || !isCombatantAlive(state, redirectedId) || move.targetKind !== "singleOpponent") {
    const abilityRedirectId = getAbsorbRedirectTargetId(state, originalTarget.side, move);
    return abilityRedirectId ?? originalTargetId;
  }

  if (state.sides[originalTarget.side].redirectionIsPowder && isPowderImmune(originalTarget)) {
    const abilityRedirectId = getAbsorbRedirectTargetId(state, originalTarget.side, move);
    return abilityRedirectId ?? originalTargetId;
  }

  return redirectedId;
}

function isPowderImmune(target: BattleCombatantState) {
  return (
    target.pokemon.types.includes("Grass") ||
    hasAnyAbilityKey(target, ["overcoat"]) ||
    hasAnyItemKey(target, ["safetygoggles"])
  );
}

function isPriorityBlockedByAbility(state: BattleState, attacker: BattleCombatantState, target: BattleCombatantState, move: BattleMoveOption) {
  if (move.priority <= 0 || attacker.side === target.side) {
    return false;
  }

  return getActiveIds(state, target.side).some((combatantId) => {
    const ally = state.combatants[combatantId];
    return ally ? hasAnyAbilityKey(ally, ["queenlymajesty", "dazzling", "armortail"]) : false;
  });
}

function isPriorityBlockedByTerrain(state: BattleState, attacker: BattleCombatantState, target: BattleCombatantState, move: BattleMoveOption) {
  return (
    move.priority > 0 &&
    attacker.side !== target.side &&
    state.field.terrain === "psychic" &&
    getGroundedState(target, state.field).grounded
  );
}

function isFakeOutFlinchPrevented(target: BattleCombatantState) {
  return hasAnyAbilityKey(target, ["innerfocus", "shielddust"]) || hasAnyItemKey(target, ["covertcloak"]);
}

function shouldMoveHit(move: BattleMoveOption, accuracyMode: "conservative" | "expected" | "optimistic") {
  if (move.accuracy >= 100) {
    return true;
  }

  if (accuracyMode === "optimistic") {
    return true;
  }

  if (accuracyMode === "conservative") {
    return move.accuracy >= 90;
  }

  return move.accuracy >= 75;
}

function shouldSecondaryProc(
  move: BattleMoveOption,
  secondaryMode: "off" | "expected" | "on",
) {
  const chance = move.effectData?.secondaryChance ?? move.effectData?.flinchChance ?? 100;
  if (secondaryMode === "on") {
    return chance > 0;
  }
  if (secondaryMode === "off") {
    return chance >= 100;
  }

  return chance >= 30;
}

function getTargetIdsForAction(state: BattleState, actor: BattleCombatantState, move: BattleMoveOption, targetId: string | null) {
  if (move.targetKind === "self") {
    return [actor.id];
  }

  if (move.targetKind === "allAllies") {
    return getActiveIds(state, actor.side);
  }

  if (move.targetKind === "singleAlly") {
    return targetId && isCombatantAlive(state, targetId) ? [targetId] : [];
  }

  if (move.targetKind === "allOpponents") {
    return getActiveIds(state, getOpponentSide(actor.side));
  }

  if (move.targetKind === "allAdjacent") {
    return [...getActiveIds(state, actor.side), ...getActiveIds(state, getOpponentSide(actor.side))].filter(
      (combatantId) => combatantId !== actor.id,
    );
  }

  if (move.targetKind === "singleOpponent") {
    if (!targetId || !isCombatantAlive(state, targetId)) {
      return [];
    }
    return [resolveSingleTarget(state, actor, targetId, move)];
  }

  return [];
}

function remapMoveTargetAfterSwitches(action: PlannedAction, switchedActiveIds: Map<string, string>) {
  if (action.action.type !== "move" || !action.action.targetId) {
    return action;
  }

  const remappedTargetId = switchedActiveIds.get(action.action.targetId);
  if (!remappedTargetId) {
    return action;
  }

  return {
    ...action,
    action: {
      ...action.action,
      targetId: remappedTargetId,
    },
  };
}

function isBlockedByGuard(state: BattleState, attacker: BattleCombatantState, target: BattleCombatantState, move: BattleMoveOption) {
  if (attacker.side === target.side) {
    return false;
  }

  const targetSide = state.sides[target.side];
  if (isPriorityBlockedByTerrain(state, attacker, target, move) || isPriorityBlockedByAbility(state, attacker, target, move)) {
    return true;
  }

  if (targetSide.quickGuardActive && move.priority > 0) {
    return true;
  }

  if (targetSide.wideGuardActive && move.isSpreadMove) {
    return true;
  }

  return false;
}

function applyOnHitEffects(
  state: BattleState,
  target: BattleCombatantState,
  move: BattleMoveOption,
  events: TurnEvent[],
  actor: BattleCombatantState,
  shouldProcSecondary: boolean,
  actedIds: Set<string>,
) {
  const chanceGated = (move.effectData?.secondaryChance ?? move.effectData?.flinchChance ?? 100) < 100;
  if (move.effectData?.targetStages && (!chanceGated || shouldProcSecondary)) {
    applyReactiveStageDelta(target, move.effectData.targetStages, events, { source: actor, cause: "move" });
    events.push({
      targetId: target.id,
      text: `${target.pokemon.name}'s stats shift after ${actor.pokemon.name}'s ${move.name}.`,
    });
  }

  if (
    move.effectData?.statusCondition &&
    (!chanceGated || shouldProcSecondary) &&
    applyStatusCondition(state, target, move.effectData.statusCondition, move)
  ) {
    events.push({
      targetId: target.id,
      text: `${target.pokemon.name} is now ${move.effectData.statusCondition}.`,
    });
  }

  if (move.effectData?.flinchChance && shouldProcSecondary && target.currentHp > 0 && !actedIds.has(target.id)) {
    target.isFlinched = true;
    events.push({
      targetId: target.id,
      text: `${target.pokemon.name} flinches after ${actor.pokemon.name}'s ${move.name}.`,
    });
  }
}

function resolveStartOfTurnSleep(state: BattleState, events: TurnEvent[]) {
  const asleepThisTurn = new Set<string>();

  for (const actorId of [...getActiveIds(state, "ally"), ...getActiveIds(state, "enemy")]) {
    const actor = state.combatants[actorId];
    if (!actor || actor.statusCondition !== "sleep") {
      continue;
    }

    if (actor.sleepTurns <= 1) {
      actor.statusCondition = "none";
      actor.sleepTurns = 0;
      events.push({ actorId: actor.id, text: `${actor.pokemon.name} woke up.` });
      continue;
    }

    actor.sleepTurns -= 1;
    asleepThisTurn.add(actor.id);
  }

  return asleepThisTurn;
}

type TurnResolutionOptions = {
  accuracyMode?: "conservative" | "expected" | "optimistic";
  secondaryMode?: "off" | "expected" | "on";
};

function executeMove(
  state: BattleState,
  action: BattleAction & { type: "move" },
  events: TurnEvent[],
  damageMode: DamageRollMode,
  resolutionOptions: TurnResolutionOptions,
  actedIds: Set<string>,
  asleepThisTurn: Set<string>,
) {
  const actor = state.combatants[action.actorId];
  const move = getMoveOption(state, action.actorId, action.moveId);
  const accuracyMode = resolutionOptions.accuracyMode ?? "expected";
  const secondaryMode = resolutionOptions.secondaryMode ?? "expected";
  if (!actor || !move || actor.currentHp <= 0 || !isActiveCombatant(state, actor.id)) {
    return;
  }

  if (asleepThisTurn.has(actor.id)) {
    events.push({ actorId: actor.id, text: `${actor.pokemon.name} is asleep and cannot move.` });
    return;
  }

  if (actor.isFlinched) {
    events.push({ actorId: actor.id, text: `${actor.pokemon.name} flinched and could not move.` });
    actor.isFlinched = false;
    return;
  }

  actor.lastMoveId = move.id;

  if (move.effectKind === "protect") {
    if (!doesProtectSucceed(actor.protectStreak, accuracyMode)) {
      actor.protectStreak = 0;
      events.push({ actorId: actor.id, text: `${actor.pokemon.name}'s ${move.name} fails.` });
      return;
    }
    actor.isProtected = true;
    actor.protectStreak += 1;
    events.push({ actorId: actor.id, text: `${actor.pokemon.name} uses ${move.name}.` });
    return;
  }

  if (move.effectKind === "guard") {
    const sideState = state.sides[actor.side];
    if (move.effectData?.guard === "quickGuard") {
      sideState.quickGuardActive = true;
    }
    if (move.effectData?.guard === "wideGuard") {
      sideState.wideGuardActive = true;
    }
    actor.protectStreak += 1;
    events.push({ actorId: actor.id, text: `${actor.pokemon.name} uses ${move.name}.` });
    return;
  }

  actor.protectStreak = 0;

  if (move.effectKind === "tailwind") {
    state.sides[actor.side].tailwindTurns = APPLIED_TAILWIND_TURNS;
    events.push({ actorId: actor.id, text: `${actor.pokemon.name} sets Tailwind for ${actor.side}.` });
    return;
  }

  if (move.effectKind === "trickRoom") {
    state.field.trickRoomTurns = state.field.trickRoomTurns > 0 ? 0 : APPLIED_TRICK_ROOM_TURNS;
    events.push({
      actorId: actor.id,
      text: state.field.trickRoomTurns > 0 ? `${actor.pokemon.name} twists the dimensions.` : `${actor.pokemon.name} ends Trick Room.`,
    });
    return;
  }

  if (move.effectKind === "safeguard") {
    state.sides[actor.side].safeguardTurns = DEFAULT_SCREEN_TURNS;
    events.push({ actorId: actor.id, text: `${actor.pokemon.name} sets Safeguard.` });
    return;
  }

  if (move.effectKind === "allySwitch") {
    const partnerId = getOtherActiveAllyIds(state, actor.id)[0] ?? null;
    if (!partnerId) {
      events.push({ actorId: actor.id, text: `${actor.pokemon.name}'s Ally Switch fails without a partner.` });
      return;
    }
    state.sides[actor.side].allySwitchPair = [actor.id, partnerId];
    events.push({ actorId: actor.id, targetId: partnerId, text: `${actor.pokemon.name} uses Ally Switch.` });
    return;
  }

  if (move.effectKind === "screen") {
    if (move.effectData?.screen === "auroraVeil" && !isSnowActive(state)) {
      events.push({ actorId: actor.id, text: `${actor.pokemon.name}'s Aurora Veil fails without snow.` });
      return;
    }

    const turns = getScreenTurns(actor);
    const sideState = state.sides[actor.side];
    if (move.effectData?.screen === "reflect") {
      sideState.reflectTurns = turns;
    } else if (move.effectData?.screen === "lightScreen") {
      sideState.lightScreenTurns = turns;
    } else if (move.effectData?.screen === "auroraVeil") {
      sideState.auroraVeilTurns = turns;
    }
    events.push({ actorId: actor.id, text: `${actor.pokemon.name} sets ${move.name}.` });
    return;
  }

  if (move.effectKind === "redirection") {
    state.sides[actor.side].redirectionTargetId = actor.id;
    state.sides[actor.side].redirectionIsPowder = Boolean(move.effectData?.powderMove);
    events.push({ actorId: actor.id, text: `${actor.pokemon.name} redirects attention with ${move.name}.` });
    return;
  }

  if (move.effectKind === "helpingHand") {
    const targetIds = getTargetIdsForAction(state, actor, move, action.targetId);
    const target = targetIds[0] ? state.combatants[targetIds[0]] : null;
    if (!target) {
      events.push({ actorId: actor.id, text: `${actor.pokemon.name}'s Helping Hand has no valid ally.` });
      return;
    }
    target.helpingHandTurns = 1;
    events.push({ actorId: actor.id, targetId: target.id, text: `${actor.pokemon.name} boosts ${target.pokemon.name} with Helping Hand.` });
    return;
  }

  if (move.effectKind === "heal") {
    const targetIds = move.effectData?.healAlliesFraction ? getActiveIds(state, actor.side) : [actor.id];
    const fraction = move.effectData?.healAlliesFraction ?? move.effectData?.healFraction ?? 0;
    for (const targetId of targetIds) {
      const healed = healCombatant(state, targetId, fraction);
      if (healed > 0) {
        events.push({ actorId: actor.id, targetId, text: `${state.combatants[targetId].pokemon.name} heals ${healed} HP from ${move.name}.` });
      }
    }
    return;
  }

  const targetIds = getTargetIdsForAction(state, actor, move, action.targetId);
  if (move.effectKind !== "boost" && targetIds.length === 0 && move.targetKind !== "field") {
    events.push({ actorId: actor.id, text: `${actor.pokemon.name}'s ${move.name} has no valid target.` });
    return;
  }

  if (move.effectKind === "boost") {
    applyReactiveStageDelta(actor, move.effectData?.selfStages, events, { source: actor, cause: "move" });
    events.push({ actorId: actor.id, text: `${actor.pokemon.name} powers up with ${move.name}.` });
    return;
  }

  if (move.effectKind === "taunt" || move.effectKind === "status" || move.effectKind === "encore" || move.effectKind === "disable") {
    for (const targetId of targetIds) {
      const target = state.combatants[targetId];
      if (!target || target.currentHp <= 0) {
        continue;
      }

      if (isBlockedByGuard(state, actor, target, move)) {
        events.push({ actorId: actor.id, targetId, text: `${target.pokemon.name}'s side blocks ${move.name}.` });
        continue;
      }

      if (target.isProtected) {
        events.push({ actorId: actor.id, targetId, text: `${target.pokemon.name} blocks ${move.name} with Protect.` });
        continue;
      }

      if (!shouldMoveHit(move, accuracyMode)) {
        events.push({ actorId: actor.id, targetId, text: `${actor.pokemon.name}'s ${move.name} misses ${target.pokemon.name}.` });
        continue;
      }

      if (move.effectKind === "taunt") {
        target.tauntTurns = Math.max(target.tauntTurns, move.effectData?.tauntTurns ?? DEFAULT_TAUNT_TURNS);
        events.push({ actorId: actor.id, targetId, text: `${target.pokemon.name} is taunted by ${actor.pokemon.name}.` });
        continue;
      }

      if (move.effectKind === "encore") {
        if (!target.lastMoveId) {
          events.push({ actorId: actor.id, targetId, text: `${actor.pokemon.name}'s Encore fails on ${target.pokemon.name}.` });
          continue;
        }
        target.encoreTurns = Math.max(target.encoreTurns, move.effectData?.encoreTurns ?? 3);
        target.encoredMoveId = target.lastMoveId;
        events.push({ actorId: actor.id, targetId, text: `${target.pokemon.name} is locked into its last move by Encore.` });
        continue;
      }

      if (move.effectKind === "disable") {
        if (!target.lastMoveId) {
          events.push({ actorId: actor.id, targetId, text: `${actor.pokemon.name}'s Disable fails on ${target.pokemon.name}.` });
          continue;
        }
        target.disableTurns = Math.max(target.disableTurns, move.effectData?.disableTurns ?? 3);
        target.disabledMoveId = target.lastMoveId;
        events.push({ actorId: actor.id, targetId, text: `${target.pokemon.name}'s last move is disabled.` });
        continue;
      }

      let appliedAnything = false;
      if (move.effectData?.targetStages) {
        appliedAnything =
          hasAnyStageDelta(applyReactiveStageDelta(target, move.effectData.targetStages, events, { source: actor, cause: "move" })) ||
          appliedAnything;
      }
      if (move.effectData?.statusCondition && applyStatusCondition(state, target, move.effectData.statusCondition, move)) {
        appliedAnything = true;
        events.push({ actorId: actor.id, targetId, text: `${target.pokemon.name} is now ${move.effectData.statusCondition}.` });
      }
      if (appliedAnything) {
        events.push({ actorId: actor.id, targetId, text: `${actor.pokemon.name} uses ${move.name} on ${target.pokemon.name}.` });
      }
    }
    return;
  }

  if (move.effectKind === "fakeOut" && actor.turnsActive > 0) {
    events.push({ actorId: actor.id, text: `${actor.pokemon.name}'s Fake Out fails after its first active turn.` });
    return;
  }

  let hitAnything = false;
  for (const targetId of targetIds) {
    const target = state.combatants[targetId];
    if (!target || target.currentHp <= 0) {
      continue;
    }

    if (move.effectData?.breaksGuards) {
      state.sides[target.side].quickGuardActive = false;
      state.sides[target.side].wideGuardActive = false;
    }

    if (move.effectData?.breaksProtect) {
      target.isProtected = false;
    }

    if (isBlockedByGuard(state, actor, target, move)) {
      events.push({ actorId: actor.id, targetId, text: `${target.pokemon.name}'s side blocks ${actor.pokemon.name}'s ${move.name}.` });
      continue;
    }

    if (target.isProtected) {
      events.push({
        actorId: actor.id,
        targetId,
        text: `${target.pokemon.name} blocks ${actor.pokemon.name}'s ${move.name} with Protect.`,
      });
      continue;
    }

    if (!shouldMoveHit(move, accuracyMode)) {
      events.push({ actorId: actor.id, targetId, text: `${actor.pokemon.name}'s ${move.name} misses ${target.pokemon.name}.` });
      continue;
    }

    const preview = getDamagePreview(state, actor.id, targetId, move);
    if (!preview) {
      events.push({
        actorId: actor.id,
        targetId,
        text: `${actor.pokemon.name}'s ${move.name} is not supported by the current simulator.`,
      });
      continue;
    }

    if (isTargetImmuneByTyping(state, actor.id, targetId, move)) {
      events.push({
        actorId: actor.id,
        targetId,
        text: `${target.pokemon.name} is unaffected by ${actor.pokemon.name}'s ${move.name}.`,
      });
      continue;
    }

    const previousHp = target.currentHp;
    if (maybeTriggerAbilityAbsorb(state, actor, target, move, events)) {
      continue;
    }

    const damage = getDamageAmountForMode(damageMode, preview.estimate);
    const usedFocusSash = canUseFocusSash(target, damage);
    const appliedDamage = applyDamage(state, targetId, usedFocusSash ? target.currentHp - 1 : damage);
    hitAnything = hitAnything || appliedDamage > 0;
    events.push({
      actorId: actor.id,
      targetId,
      text: `${actor.pokemon.name} uses ${move.name} on ${target.pokemon.name} for ${appliedDamage} HP (${Math.round(
        preview.estimate.averagePercent,
      )}% avg).`,
    });

    maybeConsumeResistBerry(target, move, preview, appliedDamage, events);

    if (usedFocusSash) {
      consumeItem(target);
      events.push({
        targetId,
        text: `${target.pokemon.name} hangs on with Focus Sash.`,
      });
    }

    if (move.effectKind === "fakeOut" && target.currentHp > 0 && !actedIds.has(targetId) && !isFakeOutFlinchPrevented(target)) {
      target.isFlinched = true;
      events.push({
        actorId: actor.id,
        targetId,
        text: `${target.pokemon.name} flinches from Fake Out.`,
      });
    } else if (move.effectKind === "fakeOut" && target.currentHp > 0 && isFakeOutFlinchPrevented(target)) {
      events.push({
        actorId: actor.id,
        targetId,
        text: `${target.pokemon.name} is protected from Fake Out's flinch.`,
      });
    }

    if (appliedDamage > 0) {
      applyOnHitEffects(
        state,
        target,
        move,
        events,
        actor,
        shouldSecondaryProc(move, secondaryMode),
        actedIds,
      );
      maybeTriggerOnHitAbility(target, actor, move, appliedDamage, previousHp, events);
      maybeTriggerSitrusBerry(state, target, events);
    }

    if (target.currentHp <= 0) {
      events.push({
        actorId: actor.id,
        targetId,
        text: `${target.pokemon.name} faints.`,
      });
      maybeTriggerKoAbility(actor, events);
    }
  }

  if (actor.itemId === "lifeorb" && hitAnything && actor.currentHp > 0) {
    const recoil = Math.min(actor.currentHp, Math.max(1, Math.floor(actor.maxHp * 0.1)));
    actor.currentHp -= recoil;
    events.push({ actorId: actor.id, text: `${actor.pokemon.name} takes ${recoil} Life Orb recoil.` });
    if (actor.currentHp <= 0) {
      events.push({ actorId: actor.id, text: `${actor.pokemon.name} faints from recoil.` });
    }
  }
}

function chooseReplacementId(state: BattleState, side: BattleSide) {
  const sideState = state.sides[side];

  switch (state.policies.replacement) {
    case "firstAvailable":
    default:
      return sideState.benchIds.find((candidateId) => isCombatantAlive(state, candidateId)) ?? null;
  }
}

function replaceFaintedActives(state: BattleState, side: BattleSide, events: TurnEvent[]) {
  const sideState = state.sides[side];

  for (let index = 0; index < sideState.activeIds.length; index += 1) {
    const currentId = sideState.activeIds[index];
    if (currentId && isCombatantAlive(state, currentId)) {
      continue;
    }

    sideState.activeIds[index] = null;
    const replacementId = chooseReplacementId(state, side);
    if (!replacementId) {
      continue;
    }

    sideState.activeIds[index] = replacementId;
    removeBenchId(sideState, replacementId);
    state.combatants[replacementId].wasSwitchedInThisTurn = true;
    events.push({
      targetId: replacementId,
      text: `${state.combatants[replacementId].pokemon.name} enters the battle for ${side}.`,
    });
  }
}

function decaySideConditions(sideState: BattleState["sides"][BattleSide]) {
  sideState.tailwindTurns = Math.max(0, sideState.tailwindTurns - 1);
  sideState.reflectTurns = Math.max(0, sideState.reflectTurns - 1);
  sideState.lightScreenTurns = Math.max(0, sideState.lightScreenTurns - 1);
  sideState.auroraVeilTurns = Math.max(0, sideState.auroraVeilTurns - 1);
  sideState.safeguardTurns = Math.max(0, sideState.safeguardTurns - 1);
  sideState.quickGuardActive = false;
  sideState.wideGuardActive = false;
  sideState.redirectionTargetId = null;
  sideState.redirectionIsPowder = false;
  sideState.allySwitchPair = null;
}

function applyEndOfTurnItemEffects(state: BattleState, combatant: BattleCombatantState, events: TurnEvent[]) {
  if (combatant.itemId === "leftovers") {
    const healed = healCombatant(state, combatant.id, LEFTOVERS_HEAL_FRACTION);
    if (healed > 0) {
      events.push({
        targetId: combatant.id,
        text: `${combatant.pokemon.name} restores ${healed} HP with Leftovers.`,
      });
    }
    return;
  }

  if (combatant.itemId !== "blacksludge") {
    return;
  }

  if (combatant.pokemon.types.includes("Poison")) {
    const healed = healCombatant(state, combatant.id, LEFTOVERS_HEAL_FRACTION);
    if (healed > 0) {
      events.push({
        targetId: combatant.id,
        text: `${combatant.pokemon.name} restores ${healed} HP with Black Sludge.`,
      });
    }
    return;
  }

  const damage = Math.max(1, Math.floor(combatant.maxHp * BLACK_SLUDGE_DAMAGE_FRACTION));
  const appliedDamage = applyDamage(state, combatant.id, damage);
  if (appliedDamage <= 0) {
    return;
  }

  events.push({
    targetId: combatant.id,
    text: `${combatant.pokemon.name} is hurt by Black Sludge for ${appliedDamage} HP.`,
  });

  if (combatant.currentHp <= 0) {
    events.push({
      targetId: combatant.id,
      text: `${combatant.pokemon.name} faints.`,
    });
  }
}

function finalizeTurn(state: BattleState, startingActiveIds: Set<string>, events: TurnEvent[]) {
  for (const combatant of Object.values(state.combatants)) {
    if (combatant.currentHp <= 0) {
      combatant.isProtected = false;
      combatant.isFlinched = false;
      combatant.wasSwitchedInThisTurn = false;
      combatant.helpingHandTurns = 0;
      continue;
    }

    applyEndOfTurnItemEffects(state, combatant, events);

    if (combatant.currentHp <= 0) {
      combatant.isProtected = false;
      combatant.isFlinched = false;
      combatant.wasSwitchedInThisTurn = false;
      combatant.helpingHandTurns = 0;
      continue;
    }

    if (isActiveCombatant(state, combatant.id) && startingActiveIds.has(combatant.id) && !combatant.wasSwitchedInThisTurn) {
      combatant.turnsActive += 1;
    }

    combatant.isProtected = false;
    combatant.isFlinched = false;
    combatant.wasSwitchedInThisTurn = false;
    combatant.helpingHandTurns = 0;
    combatant.encoreTurns = Math.max(0, combatant.encoreTurns - 1);
    if (combatant.encoreTurns === 0) {
      combatant.encoredMoveId = null;
    }
    combatant.disableTurns = Math.max(0, combatant.disableTurns - 1);
    if (combatant.disableTurns === 0) {
      combatant.disabledMoveId = null;
    }
    combatant.tauntTurns = Math.max(0, combatant.tauntTurns - 1);
  }

  decaySideConditions(state.sides.ally);
  decaySideConditions(state.sides.enemy);
  state.field.trickRoomTurns = Math.max(0, state.field.trickRoomTurns - 1);
  state.field.gravityTurns = Math.max(0, (state.field.gravityTurns ?? 0) - 1);
  state.field.turn += 1;
}

export function resolveTurn(
  initialState: BattleState,
  allyPlan: JointActionPlan | null,
  enemyPlan: JointActionPlan | null,
  damageMode: DamageRollMode = "average",
  resolutionOptions: TurnResolutionOptions = {},
): TurnResult {
  const state = cloneBattleState(initialState);
  const events: TurnEvent[] = [];
  const startingActiveIds = new Set([...getActiveIds(state, "ally"), ...getActiveIds(state, "enemy")]);
  const asleepThisTurn = resolveStartOfTurnSleep(state, events);
  const allActions = [...(allyPlan?.actions ?? []), ...(enemyPlan?.actions ?? [])];
  const switchedActiveIds = new Map<string, string>();

  for (const action of allActions) {
    if (action.action.type === "switch") {
      executeSwitch(state, action.action, events, switchedActiveIds);
    }
  }

  const actedIds = new Set<string>();
  const unsortedMoveActions = allActions
    .filter((action) => action.action.type !== "switch")
    .map((action) => remapMoveTargetAfterSwitches(action, switchedActiveIds));
  for (let leftIndex = 0; leftIndex < unsortedMoveActions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < unsortedMoveActions.length; rightIndex += 1) {
      const left = unsortedMoveActions[leftIndex];
      const right = unsortedMoveActions[rightIndex];
      if (!actionsAreSpeedTied(state, left, right, state.field.trickRoomTurns > 0)) {
        continue;
      }
      const leftActor = state.combatants[left.actorId];
      const rightActor = state.combatants[right.actorId];
      events.push({
        actorId: left.actorId,
        targetId: right.actorId,
        text: `Line depends on speed tie between ${leftActor?.pokemon.name ?? left.actorId} and ${rightActor?.pokemon.name ?? right.actorId}.`,
        unsupportedMechanic: {
          mechanic: "speed tie",
          supportLevel: "approximate",
          reason: "Equal-priority equal-speed actions are annotated as a 50/50 dependency; this resolver still emits one representative order.",
          affectedCombatantId: left.actorId,
          severity: "warning",
        },
      });
    }
  }
  const moveActions = unsortedMoveActions.sort((left, right) => compareActionOrder(state, left, right, state.field.trickRoomTurns > 0));

  for (const action of moveActions) {
    if (action.action.type === "pass") {
      const actor = state.combatants[action.actorId];
      if (actor) {
        actor.protectStreak = 0;
      }
      actedIds.add(action.actorId);
      continue;
    }

    if (action.action.type !== "move") {
      continue;
    }

    executeMove(state, action.action, events, damageMode, resolutionOptions, actedIds, asleepThisTurn);
    actedIds.add(action.actorId);
  }

  replaceFaintedActives(state, "ally", events);
  replaceFaintedActives(state, "enemy", events);
  finalizeTurn(state, startingActiveIds, events);
  replaceFaintedActives(state, "ally", events);
  replaceFaintedActives(state, "enemy", events);

  return { state, events };
}

export function getSideSummary(state: BattleState, side: BattleSide) {
  const ids = Object.values(state.combatants)
    .filter((combatant) => combatant.side === side)
    .map((combatant) => combatant.id);
  const aliveCount = ids.filter((id) => isCombatantAlive(state, id)).length;
  const hpTotal = ids.reduce((sum, id) => sum + state.combatants[id].currentHp, 0);
  const hpMax = ids.reduce((sum, id) => sum + state.combatants[id].maxHp, 0);
  return {
    aliveCount,
    hpTotal,
    hpPercent: hpMax > 0 ? (hpTotal / hpMax) * 100 : 0,
  };
}

export function getTerminalWinner(state: BattleState): BattleSide | null {
  const allyAlive = Object.values(state.combatants).some((combatant) => combatant.side === "ally" && combatant.currentHp > 0);
  const enemyAlive = Object.values(state.combatants).some((combatant) => combatant.side === "enemy" && combatant.currentHp > 0);

  if (allyAlive && !enemyAlive) {
    return "ally";
  }

  if (enemyAlive && !allyAlive) {
    return "enemy";
  }

  return null;
}

export const ENGINE_DEFAULTS = {
  maxIndividualActionsPerActor: DEFAULT_MAX_INDIVIDUAL_ACTIONS,
  maxJointPlans: DEFAULT_MAX_JOINT_PLANS,
};
