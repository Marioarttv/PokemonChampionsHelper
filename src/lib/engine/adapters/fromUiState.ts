import { getTypeFromLabel } from "../../../data/typeChart";
import type { MoveRecord } from "../../battleData";
import {
  getChampionsComputedStats,
  normalizeChampionsStatSpread,
  type ChampionsStatSpread,
} from "../../championsStats";
import { getOpponentPreset, getOpponentPresetKnownMoves } from "../../opponentMovePresets";
import type { PokemonRecord } from "../../pokemonDb";
import type { PersistedKnownMove, PersistedSavedAttack } from "../../savedTeams";
import type { PersistedSpeciesMoveset } from "../../speciesMovesets";
import { buildBattleEngineInputSignature } from "../signature";
import { buildEnemyMoveKnowledge } from "../knowledge";
import type { BattleStateMemberInput } from "../types";

type StoredMovesetSource = "custom" | "preset" | "none";

export type ResolvedUiMoveset = {
  savedAttacks: PersistedSavedAttack[];
  knownMoves: PersistedKnownMove[];
  allMoveNames: string[];
  abilityName: string | null;
  itemName: string | null;
  statSpread: ChampionsStatSpread | null;
  movesetSource: StoredMovesetSource;
};

type RuntimeBattleState = {
  hpPercent: number;
  attackStage: number;
  defenseStage: number;
  specialAttackStage: number;
  specialDefenseStage: number;
  speedStage: number;
  statusCondition: BattleStateMemberInput["statusCondition"];
  sleepTurns: number;
  tauntTurns: number;
  encoreTurns: number;
  encoredMoveId: string | null;
  disableTurns: number;
  disabledMoveId: string | null;
  helpingHandTurns: number;
  lastMoveId: string | null;
  turnsActive: number;
  protectStreak: number;
};

type ResolveStoredOrPresetMovesetInput = {
  pokemon: PokemonRecord;
  speciesMovesetByKey: ReadonlyMap<string, PersistedSpeciesMoveset>;
  moveByKey: ReadonlyMap<string, MoveRecord>;
  limit?: number;
  normalizePokemonNameKey: (value: string) => string;
  getResolvedPresetAbilityName: (
    pokemon: PokemonRecord,
    preset: { speciesKey: string; abilityName: string } | null | undefined,
  ) => string | null;
  isChampionsMegaEntry: (pokemon: Pick<PokemonRecord, "baseSpecies" | "name" | "forme">) => boolean;
  getInheritedMovesetKey: (pokemon: Pick<PokemonRecord, "baseSpecies" | "forme" | "id" | "name">) => string | null;
  sanitizeSavedAttacks: (
    savedAttacks: PersistedSavedAttack[] | null | undefined,
    pokemon?: PokemonRecord | null,
    limit?: number,
  ) => PersistedSavedAttack[];
  sanitizeKnownMovesToSavedAttacks: (
    knownMoves: PersistedKnownMove[] | null | undefined,
    pokemon?: PokemonRecord | null,
    limit?: number,
  ) => PersistedSavedAttack[];
};

type InferEngineMoveNamesInput = {
  pokemon: PokemonRecord;
  knownMoveNames: string[];
  presetMoveNames: string[];
  moveByKey: ReadonlyMap<string, MoveRecord>;
  movesetSource: StoredMovesetSource;
};

type AllyMemberInput = {
  slotIndex: number;
  pokemon: PokemonRecord;
  slotSavedAttacks: PersistedSavedAttack[];
  resolvedMoveset: ResolvedUiMoveset;
  runtime: RuntimeBattleState;
  isActive: boolean;
};

type EnemyMemberInput = {
  slotIndex: number;
  pokemon: PokemonRecord;
  resolvedMoveset: ResolvedUiMoveset;
  runtime: RuntimeBattleState;
  isActive: boolean;
  moveByKey: ReadonlyMap<string, MoveRecord>;
};

function normalizeMoveKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getMoveName(move: Pick<PersistedKnownMove, "label" | "name"> | Pick<PersistedSavedAttack, "label">) {
  return ("name" in move ? move.name : undefined)?.trim() || move.label.trim();
}

function toKnownMove(savedAttack: PersistedSavedAttack, moveByKey: ReadonlyMap<string, MoveRecord>) {
  const move = moveByKey.get(savedAttack.label.toLowerCase()) ?? moveByKey.get(normalizeMoveKey(savedAttack.label)) ?? null;
  return {
    id: savedAttack.id,
    name: move?.name ?? savedAttack.label,
    label: move?.name ?? savedAttack.label,
    type: savedAttack.type,
    basePower: savedAttack.basePower,
    category: savedAttack.category,
    isSpreadMove: savedAttack.isSpreadMove,
  } satisfies PersistedKnownMove;
}

function dedupeKnownMoves(moves: PersistedKnownMove[]) {
  const byKey = new Map<string, PersistedKnownMove>();

  for (const move of moves) {
    const moveName = getMoveName(move);
    const moveKey = normalizeMoveKey(moveName);
    if (!moveKey || byKey.has(moveKey)) {
      continue;
    }
    byKey.set(moveKey, {
      ...move,
      name: move.name ?? moveName,
      label: move.label || moveName,
    });
  }

  return [...byKey.values()];
}

function resolveKnownMoves(
  pokemon: PokemonRecord,
  speciesMoveset: PersistedSpeciesMoveset | null,
  moveByKey: ReadonlyMap<string, MoveRecord>,
) {
  const customKnownMoves = speciesMoveset?.knownMoves?.length
    ? dedupeKnownMoves(speciesMoveset.knownMoves)
    : Array.isArray(speciesMoveset?.savedAttacks)
      ? dedupeKnownMoves(speciesMoveset.savedAttacks)
      : [];
  const presetKnownMoves = dedupeKnownMoves(getOpponentPresetKnownMoves(pokemon, moveByKey));

  if (customKnownMoves.length === 0) {
    return presetKnownMoves;
  }

  const customMoveKeys = new Set(customKnownMoves.map((move) => normalizeMoveKey(getMoveName(move))));
  const presetSupportMoves = presetKnownMoves.filter(
    (move) => move.category === "status" && !customMoveKeys.has(normalizeMoveKey(getMoveName(move))),
  );

  return dedupeKnownMoves([...customKnownMoves, ...presetSupportMoves]);
}

export function inferEngineMoveNames(options: InferEngineMoveNamesInput) {
  const { pokemon, knownMoveNames, presetMoveNames, moveByKey, movesetSource } = options;
  const knownNames = new Set(
    [...knownMoveNames, ...presetMoveNames]
      .map((value) => normalizeMoveKey(value))
      .filter(Boolean),
  );

  const addIfPresent = (bucket: string[], moveName: string) => {
    const key = normalizeMoveKey(moveName);
    if (knownNames.has(key)) {
      return;
    }

    const move = moveByKey.get(moveName.toLowerCase()) ?? moveByKey.get(key) ?? null;
    if (!move) {
      return;
    }

    bucket.push(move.name);
    knownNames.add(key);
  };

  const inferred: string[] = [];
  addIfPresent(inferred, "Protect");

  const bulkScore = pokemon.baseStats.hp + pokemon.baseStats.def + pokemon.baseStats.spd;
  const speed = pokemon.baseStats.spe;

  if (speed <= 60) {
    addIfPresent(inferred, "Trick Room");
  }
  if (speed >= 95) {
    addIfPresent(inferred, "Taunt");
  }
  if (speed >= 105) {
    addIfPresent(inferred, "Feint");
  }
  if (bulkScore >= 290) {
    addIfPresent(inferred, "Safeguard");
  }
  if (bulkScore >= 300 && speed >= 70) {
    addIfPresent(inferred, "Ally Switch");
  }
  if (movesetSource !== "custom" && speed >= 80) {
    addIfPresent(inferred, pokemon.types.includes("Electric") ? "Electroweb" : "Icy Wind");
  }
  if (movesetSource === "none") {
    addIfPresent(inferred, "Disable");
    addIfPresent(inferred, "Encore");
  }

  return inferred.slice(0, 4);
}

export function resolveStoredOrPresetMoveset(input: ResolveStoredOrPresetMovesetInput): ResolvedUiMoveset {
  const {
    pokemon,
    speciesMovesetByKey,
    moveByKey,
    limit = 4,
    normalizePokemonNameKey,
    getResolvedPresetAbilityName,
    isChampionsMegaEntry,
    getInheritedMovesetKey,
    sanitizeSavedAttacks,
    sanitizeKnownMovesToSavedAttacks,
  } = input;
  const movesetKey = normalizePokemonNameKey(pokemon.id);
  const inheritedMovesetKey = getInheritedMovesetKey(pokemon);
  const directSpeciesMoveset = speciesMovesetByKey.get(movesetKey) ?? null;
  const inheritedSpeciesMoveset = inheritedMovesetKey ? speciesMovesetByKey.get(inheritedMovesetKey) ?? null : null;
  const speciesMoveset = directSpeciesMoveset ?? inheritedSpeciesMoveset;
  const preset = getOpponentPreset(pokemon);
  const knownMoves = resolveKnownMoves(pokemon, speciesMoveset, moveByKey).slice(0, limit);
  const customSavedAttacks = knownMoves.length > 0
    ? sanitizeKnownMovesToSavedAttacks(knownMoves, pokemon, limit)
    : [];
  const presetSavedAttacks = sanitizeKnownMovesToSavedAttacks(getOpponentPresetKnownMoves(pokemon, moveByKey), pokemon, limit);
  const directCustomAbilityName = directSpeciesMoveset?.abilityName?.trim() || null;
  const inheritedCustomAbilityName = inheritedSpeciesMoveset?.abilityName?.trim() || null;
  const customItemName = speciesMoveset?.itemName?.trim() || null;
  const customStatSpread = speciesMoveset?.statSpread ? normalizeChampionsStatSpread(speciesMoveset.statSpread) : null;
  const presetAbilityName = getResolvedPresetAbilityName(pokemon, preset);
  const presetItemName = preset?.itemName?.trim() || null;
  const resolvedCustomAbilityName = directCustomAbilityName ?? (isChampionsMegaEntry(pokemon) ? null : inheritedCustomAbilityName);
  const hasCustomOverride = Boolean(
    speciesMoveset && (knownMoves.length > 0 || resolvedCustomAbilityName || customItemName || customStatSpread),
  );

  return {
    savedAttacks:
      customSavedAttacks.length > 0
        ? sanitizeSavedAttacks(customSavedAttacks, pokemon, limit)
        : presetSavedAttacks,
    knownMoves,
    allMoveNames: knownMoves.length > 0 ? knownMoves.map((move) => getMoveName(move)) : preset?.moveNames ? [...preset.moveNames] : [],
    abilityName: resolvedCustomAbilityName ?? presetAbilityName,
    itemName: customItemName ?? presetItemName,
    statSpread: customStatSpread,
    movesetSource: hasCustomOverride ? "custom" : preset ? "preset" : "none",
  };
}

function toStageBlock(runtime: RuntimeBattleState) {
  return {
    attack: runtime.attackStage,
    defense: runtime.defenseStage,
    specialAttack: runtime.specialAttackStage,
    specialDefense: runtime.specialDefenseStage,
    speed: runtime.speedStage,
  };
}

function buildExplicitKnownMoves(
  slotSavedAttacks: PersistedSavedAttack[],
  resolvedMoveset: ResolvedUiMoveset,
  moveByKey: ReadonlyMap<string, MoveRecord>,
) {
  if (slotSavedAttacks.length > 0) {
    return slotSavedAttacks.map((savedAttack) => toKnownMove(savedAttack, moveByKey));
  }

  return resolvedMoveset.knownMoves;
}

function buildStabProxyKnownMoves(pokemon: PokemonRecord) {
  const fallbackType = getTypeFromLabel(pokemon.types[0]) ?? "normal";

  return [
    {
      id: `stab-${pokemon.id}-${fallbackType}`,
      name: `${fallbackType} stab`,
      label: pokemon.types[0] ? `${pokemon.types[0]} STAB` : "STAB",
      type: fallbackType,
      basePower: 80,
      category: "physical" as const,
      isSpreadMove: false,
    },
  ];
}

export function buildAllyBattleStateMember(input: AllyMemberInput & { moveByKey: ReadonlyMap<string, MoveRecord> }) {
  const maxHp = getChampionsComputedStats(input.pokemon, {
    spread: input.resolvedMoveset.statSpread,
  }).hp;
  const explicitKnownMoves = buildExplicitKnownMoves(input.slotSavedAttacks, input.resolvedMoveset, input.moveByKey);

  return {
    id: `ally-${input.slotIndex}`,
    label: `Slot ${input.slotIndex + 1}`,
    pokemon: input.pokemon,
    statSpread: input.resolvedMoveset.statSpread,
    teamIndex: input.slotIndex,
    currentHp: Math.max(0, Math.min(maxHp, Math.round((maxHp * input.runtime.hpPercent) / 100))),
    abilityName: input.resolvedMoveset.abilityName,
    itemName: input.resolvedMoveset.itemName,
    savedAttacks: input.slotSavedAttacks.length > 0 ? input.slotSavedAttacks : input.resolvedMoveset.savedAttacks,
    knownMoves: explicitKnownMoves.length > 0 ? explicitKnownMoves : buildStabProxyKnownMoves(input.pokemon),
    moveNames: input.resolvedMoveset.allMoveNames,
    inferredMoveNames: [],
    candidateMoves: [],
    knowledge: "known",
    stages: toStageBlock(input.runtime),
    statusCondition: input.runtime.statusCondition,
    sleepTurns: input.runtime.statusCondition === "sleep" ? input.runtime.sleepTurns : 0,
    tauntTurns: input.runtime.tauntTurns,
    encoreTurns: input.runtime.encoreTurns,
    encoredMoveId: input.runtime.encoredMoveId,
    disableTurns: input.runtime.disableTurns,
    disabledMoveId: input.runtime.disabledMoveId,
    helpingHandTurns: input.runtime.helpingHandTurns,
    lastMoveId: input.runtime.lastMoveId,
    turnsActive: input.runtime.turnsActive,
    protectStreak: input.runtime.protectStreak,
    isActive: input.isActive,
  } satisfies BattleStateMemberInput;
}

export function buildEnemyBattleStateMember(input: EnemyMemberInput) {
  const resolvedKnownMoveNames = input.resolvedMoveset.knownMoves.map((move) => getMoveName(move));
  const observedKnownMoveNames =
    input.resolvedMoveset.movesetSource === "custom" ? resolvedKnownMoveNames : [];
  const inferredMoveNames = inferEngineMoveNames({
    pokemon: input.pokemon,
    knownMoveNames: observedKnownMoveNames,
    presetMoveNames: input.resolvedMoveset.allMoveNames,
    moveByKey: input.moveByKey,
    movesetSource: input.resolvedMoveset.movesetSource,
  });
  const knowledge = buildEnemyMoveKnowledge({
    knownMoveNames: observedKnownMoveNames,
    presetMoveNames: input.resolvedMoveset.allMoveNames,
    inferredMoveNames,
    movesetSource: input.resolvedMoveset.movesetSource,
  });

  return {
    id: `enemy-${input.slotIndex}`,
    label: `Enemy ${input.slotIndex + 1}`,
    pokemon: input.pokemon,
    statSpread: input.resolvedMoveset.statSpread,
    teamIndex: input.slotIndex,
    currentHpPercent: input.runtime.hpPercent,
    abilityName: input.resolvedMoveset.abilityName,
    itemName: input.resolvedMoveset.itemName,
    savedAttacks: input.resolvedMoveset.movesetSource === "custom" ? input.resolvedMoveset.savedAttacks : [],
    knownMoves: input.resolvedMoveset.movesetSource === "custom" ? input.resolvedMoveset.knownMoves : [],
    moveNames: knowledge.moveNames,
    inferredMoveNames: [],
    candidateMoves: knowledge.candidateMoves,
    knowledge: knowledge.knowledge,
    stages: toStageBlock(input.runtime),
    statusCondition: input.runtime.statusCondition,
    sleepTurns: input.runtime.statusCondition === "sleep" ? input.runtime.sleepTurns : 0,
    tauntTurns: input.runtime.tauntTurns,
    encoreTurns: input.runtime.encoreTurns,
    encoredMoveId: input.runtime.encoredMoveId,
    disableTurns: input.runtime.disableTurns,
    disabledMoveId: input.runtime.disabledMoveId,
    helpingHandTurns: input.runtime.helpingHandTurns,
    lastMoveId: input.runtime.lastMoveId,
    turnsActive: input.runtime.turnsActive,
    protectStreak: input.runtime.protectStreak,
    isActive: input.isActive,
  } satisfies BattleStateMemberInput;
}

export function buildPreviewEnemyBattleStateMember(
  input: Omit<EnemyMemberInput, "runtime" | "isActive"> & { isActive?: boolean },
) {
  return buildEnemyBattleStateMember({
    ...input,
    runtime: {
      hpPercent: 100,
      attackStage: 0,
      defenseStage: 0,
      specialAttackStage: 0,
      specialDefenseStage: 0,
      speedStage: 0,
      statusCondition: "none",
      sleepTurns: 0,
      tauntTurns: 0,
      encoreTurns: 0,
      encoredMoveId: null,
      disableTurns: 0,
      disabledMoveId: null,
      helpingHandTurns: 0,
      lastMoveId: null,
      turnsActive: 0,
      protectStreak: 0,
    },
    isActive: input.isActive ?? input.slotIndex < 2,
  });
}

export function buildBattleEngineUiSignature(options: Parameters<typeof buildBattleEngineInputSignature>[0]) {
  return buildBattleEngineInputSignature(options);
}
