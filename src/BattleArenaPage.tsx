import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  TYPE_META,
  getTypeFromLabel,
  type PokemonType,
} from "./data/typeChart";
import {
  POKEMON_CHAMPIONS_ACTIVE_REGULATION,
  POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET,
  normalizePokemonNameKey,
} from "./data/championsLegalPokemon";
import {
  createBattleState,
  generateJointActionPlans,
  recommendBestPlan,
  resolveTurn,
  type BattleCombatantState,
  type BattleMoveOption,
  type BattleSide,
  type BattleState,
  type BattleStateMemberInput,
  type JointActionPlan,
  type PlannedAction,
  type SearchRecommendation,
  type TurnEvent,
} from "./lib/engine";
import {
  getMovePokemonType,
  isSpreadTarget,
  loadBattleData,
  type MoveRecord,
} from "./lib/battleData";
import {
  getPokemonBaseSpriteUrl,
  getPokemonSpriteUrl,
  loadPokemonDatabase,
  type PokemonRecord,
} from "./lib/pokemonDb";
import {
  listSavedTeams,
  type PersistedKnownMove,
  type PersistedSavedAttack,
  type PersistedTeam,
  type PersistedTeamSlot,
} from "./lib/savedTeams";
import {
  listSpeciesMovesets,
  type PersistedSpeciesMoveset,
} from "./lib/speciesMovesets";
import { getDefaultChampionsStatSpreadForPokemon } from "./lib/championsStats";
import {
  getOpponentPreset,
  getOpponentPresetKnownMoves,
} from "./lib/opponentMovePresets";
import {
  recommendTeamPreview,
  type TeamPreviewRecommendation,
} from "./lib/teamPreview";

type ArenaMovePick =
  | { kind: "move"; moveId: string; targetId: string | null }
  | { kind: "switch"; switchInId: string }
  | { kind: "pass" };

type ArenaTeamMemberSpec = {
  species: string;
  abilityName?: string;
  itemName?: string;
  moves?: string[];
  role: string;
};

type ArenaTrainer = {
  id: string;
  name: string;
  title: string;
  spriteIndex: number;
  accent: string;
  specialty: string;
  temperament: string;
  defaultLeads: [number, number];
  team: ArenaTeamMemberSpec[];
};

type TeamSource =
  | { kind: "saved"; id: string; name: string; slots: PersistedTeamSlot[] }
  | { kind: "rental"; id: string; name: string; team: ArenaTeamMemberSpec[] };

type SimulationRun = {
  startState: BattleState;
  finalState: BattleState;
  events: TurnEvent[];
  allyPlan: JointActionPlan;
  enemyPlan: JointActionPlan;
  recommendation: SearchRecommendation | null;
};

type EventTone = "attack" | "protect" | "status" | "switch" | "faint" | "neutral";

const TRAINER_SHEET_URL = `${import.meta.env.BASE_URL}trainers/champions-trainer-sheet.png`;
const ARENA_EVENT_STEP_MS = 980;
const RENTAL_TEAM_ID = "rental-champions-core";

const ARENA_TRAINERS: ArenaTrainer[] = [
  {
    id: "rook",
    name: "Rook Valen",
    title: "Champion Analyst",
    spriteIndex: 0,
    accent: "#ff5565",
    specialty: "Fake Out / pivots / redirection",
    temperament: "Balanced",
    defaultLeads: [0, 1],
    team: [
      { species: "Incineroar", role: "tempo pivot" },
      { species: "Sneasler", role: "fast Fake Out" },
      { species: "Garchomp", role: "spread pressure" },
      { species: "Sinistcha", role: "redirection room" },
      { species: "Kingambit", role: "endgame cleaner" },
      { species: "Basculegion", role: "revenge cleaner" },
    ],
  },
  {
    id: "volta",
    name: "Volta Nix",
    title: "Circuit Prodigy",
    spriteIndex: 1,
    accent: "#ffcf5c",
    specialty: "Tailwind / Wide Guard / fast pressure",
    temperament: "Aggressive",
    defaultLeads: [0, 1],
    team: [
      { species: "Whimsicott", role: "speed lead" },
      { species: "Aerodactyl", role: "wide guard lead" },
      { species: "Dragonite", role: "tailwind breaker" },
      { species: "Charizard", role: "sun attacker" },
      { species: "Rotom-Wash", role: "electric pivot" },
      { species: "Delphox", role: "encore trapper" },
    ],
  },
  {
    id: "nocturne",
    name: "Nocturne Vale",
    title: "Dimension Curator",
    spriteIndex: 2,
    accent: "#c4a3ff",
    specialty: "Trick Room / Follow Me / slow nukes",
    temperament: "Defensive",
    defaultLeads: [0, 1],
    team: [
      { species: "Farigiraf", role: "priority shield" },
      { species: "Hatterene", role: "room setter" },
      { species: "Torkoal", role: "sun sweeper" },
      { species: "Oranguru", role: "instruct room" },
      { species: "Mimikyu", role: "backup room" },
      { species: "Reuniclus", role: "slow nuke" },
    ],
  },
  {
    id: "marina",
    name: "Marina Quell",
    title: "Rain Captain",
    spriteIndex: 3,
    accent: "#3dd8b8",
    specialty: "Rain / wide pressure / stamina pivots",
    temperament: "Reactive",
    defaultLeads: [0, 1],
    team: [
      { species: "Pelipper", role: "rain setter" },
      { species: "Archaludon", role: "rain artillery" },
      { species: "Basculegion", role: "rain cleaner" },
      { species: "Palafin", role: "priority water" },
      { species: "Milotic", role: "stamina support" },
      { species: "Clawitzer", role: "coverage cannon" },
    ],
  },
  {
    id: "atlas",
    name: "Atlas Garr",
    title: "Sand Marshal",
    spriteIndex: 4,
    accent: "#d6a35d",
    specialty: "Sand / spread damage / recovery walls",
    temperament: "Attrition",
    defaultLeads: [0, 1],
    team: [
      { species: "Tyranitar", role: "weather anchor" },
      { species: "Excadrill", role: "sand sweeper" },
      { species: "Garchomp", role: "spread pressure" },
      { species: "Garganacl", role: "iron wall" },
      { species: "Corviknight", role: "speed reset" },
      { species: "Hippowdon", role: "ground wall" },
    ],
  },
];

const RENTAL_TEAM: ArenaTeamMemberSpec[] = [
  { species: "Incineroar", role: "pivot" },
  { species: "Sneasler", role: "fast support" },
  { species: "Sinistcha", role: "redirection" },
  { species: "Garchomp", role: "spread pressure" },
  { species: "Kingambit", role: "endgame" },
  { species: "Basculegion", role: "revenge cleaner" },
];

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getMoveRecordByName(moveName: string, moveByKey: ReadonlyMap<string, MoveRecord>) {
  const trimmed = moveName.trim();
  if (!trimmed) {
    return null;
  }
  return moveByKey.get(trimmed.toLowerCase()) ?? moveByKey.get(normalizeKey(trimmed)) ?? null;
}

function getPokemonFromLookup(value: string | null | undefined, pokemonByKey: ReadonlyMap<string, PokemonRecord>) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return pokemonByKey.get(trimmed.toLowerCase()) ?? pokemonByKey.get(normalizeKey(trimmed)) ?? null;
}

function getKnownMoveName(move: Pick<PersistedKnownMove, "label" | "name">) {
  return move.name?.trim() || move.label.trim();
}

function coercePokemonType(value: string | null | undefined): PokemonType | null {
  if (!value) {
    return null;
  }
  return getTypeFromLabel(value) ?? null;
}

function toKnownMoveFromRecord(move: MoveRecord): PersistedKnownMove {
  const category = move.category === "Status" ? "status" : (move.category.toLowerCase() as "physical" | "special");
  return {
    id: move.id,
    name: move.name,
    label: move.name,
    type: getMovePokemonType(move) ?? undefined,
    basePower: category === "status" || move.basePower <= 0 ? undefined : move.basePower,
    category,
    isSpreadMove: isSpreadTarget(move.target),
  };
}

function normalizeKnownMove(
  move: PersistedKnownMove,
  moveByKey: ReadonlyMap<string, MoveRecord>,
): PersistedKnownMove | null {
  const name = getKnownMoveName(move);
  const record = getMoveRecordByName(name, moveByKey);
  if (record) {
    return toKnownMoveFromRecord(record);
  }

  const type = coercePokemonType(move.type);
  const category = move.category ?? (move.basePower && move.basePower > 0 ? "physical" : "status");
  return {
    id: move.id || `move-${normalizeKey(name)}`,
    name,
    label: name,
    type: type ?? undefined,
    basePower: category === "status" ? undefined : move.basePower,
    category,
    isSpreadMove: Boolean(move.isSpreadMove),
  };
}

function knownMoveFromSavedAttack(
  attack: PersistedSavedAttack,
  moveByKey: ReadonlyMap<string, MoveRecord>,
): PersistedKnownMove | null {
  const record = getMoveRecordByName(attack.label, moveByKey);
  if (record) {
    return toKnownMoveFromRecord(record);
  }
  return {
    id: attack.id || `attack-${normalizeKey(attack.label)}`,
    name: attack.label,
    label: attack.label,
    type: attack.type,
    basePower: attack.basePower,
    category: attack.category ?? "physical",
    isSpreadMove: attack.isSpreadMove,
  };
}

function knownMoveFromName(moveName: string, moveByKey: ReadonlyMap<string, MoveRecord>) {
  const record = getMoveRecordByName(moveName, moveByKey);
  return record ? toKnownMoveFromRecord(record) : null;
}

function dedupeKnownMoves(moves: Array<PersistedKnownMove | null | undefined>) {
  const byKey = new Map<string, PersistedKnownMove>();
  for (const move of moves) {
    if (!move) {
      continue;
    }
    const key = normalizeKey(getKnownMoveName(move));
    if (!key || byKey.has(key)) {
      continue;
    }
    byKey.set(key, move);
  }
  return [...byKey.values()].slice(0, 4);
}

function knownMoveToSavedAttack(move: PersistedKnownMove): PersistedSavedAttack | null {
  if (!move.type || move.category === "status") {
    return null;
  }
  return {
    id: move.id,
    label: getKnownMoveName(move),
    type: move.type,
    basePower: move.basePower,
    category: move.category,
    isSpreadMove: move.isSpreadMove,
  };
}

function buildStabFallbackMoves(pokemon: PokemonRecord): PersistedKnownMove[] {
  const category = pokemon.baseStats.atk >= pokemon.baseStats.spa ? "physical" : "special";
  return pokemon.types.reduce<PersistedKnownMove[]>((moves, typeLabel, index) => {
    const type = getTypeFromLabel(typeLabel);
    if (!type) {
      return moves;
    }
    moves.push({
      id: `stab-${pokemon.id}-${type}-${index}`,
      name: `${typeLabel} STAB`,
      label: `${typeLabel} STAB`,
      type,
      basePower: 80,
      category,
      isSpreadMove: false,
    });
    return moves;
  }, []);
}

function isCurrentRegulationLegalPokemon(pokemon: PokemonRecord) {
  return POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET.has(normalizePokemonNameKey(pokemon.baseSpecies || pokemon.name));
}

function normalizePresetItemName(itemName: string | null | undefined) {
  const item = itemName?.trim();
  return item && item !== "Unknown" ? item : null;
}

function buildEmergencyFallbackMoves(
  pokemon: PokemonRecord,
  moveByKey: ReadonlyMap<string, MoveRecord>,
) {
  return [
    ...buildStabFallbackMoves(pokemon),
    knownMoveFromName("Protect", moveByKey),
    knownMoveFromName("Tera Blast", moveByKey),
    knownMoveFromName("Helping Hand", moveByKey),
    knownMoveFromName("Facade", moveByKey),
  ];
}

function completeToFourKnownMoves(
  pokemon: PokemonRecord,
  seedMoves: Array<PersistedKnownMove | null | undefined>,
  moveByKey: ReadonlyMap<string, MoveRecord>,
) {
  return dedupeKnownMoves([
    ...seedMoves,
    ...getOpponentPresetKnownMoves(pokemon, moveByKey),
    ...buildEmergencyFallbackMoves(pokemon, moveByKey),
  ]);
}

function getSpeciesMoveset(
  pokemon: PokemonRecord,
  speciesMovesetByKey: ReadonlyMap<string, PersistedSpeciesMoveset>,
) {
  return (
    speciesMovesetByKey.get(normalizeKey(pokemon.id)) ??
    speciesMovesetByKey.get(normalizeKey(pokemon.baseSpecies || pokemon.name)) ??
    null
  );
}

function buildKnownMovesForSavedSlot(
  slot: PersistedTeamSlot,
  pokemon: PokemonRecord,
  speciesMoveset: PersistedSpeciesMoveset | null,
  moveByKey: ReadonlyMap<string, MoveRecord>,
) {
  const slotKnown = (slot.knownMoves ?? []).map((move) => normalizeKnownMove(move, moveByKey));
  const slotAttacks = (slot.savedAttacks ?? []).map((move) => knownMoveFromSavedAttack(move, moveByKey));
  const speciesKnown = (speciesMoveset?.knownMoves ?? []).map((move) => normalizeKnownMove(move, moveByKey));
  const speciesAttacks = (speciesMoveset?.savedAttacks ?? []).map((move) => normalizeKnownMove(move, moveByKey));
  return completeToFourKnownMoves(
    pokemon,
    [...slotKnown, ...slotAttacks, ...speciesKnown, ...speciesAttacks],
    moveByKey,
  );
}

function buildMemberInput(options: {
  side: BattleSide;
  slotIndex: number;
  pokemon: PokemonRecord;
  moves: PersistedKnownMove[];
  abilityName?: string | null;
  itemName?: string | null;
  statSpread?: PersistedTeamSlot["statSpread"];
  role?: string;
  isActive: boolean;
}) {
  const savedAttacks = options.moves
    .map(knownMoveToSavedAttack)
    .filter((move): move is PersistedSavedAttack => Boolean(move));

  return {
    id: `${options.side}-${options.slotIndex}`,
    label: options.side === "ally" ? `Slot ${options.slotIndex + 1}` : `Enemy ${options.slotIndex + 1}`,
    pokemon: options.pokemon,
    statSpread: options.statSpread ?? null,
    teamIndex: options.slotIndex,
    abilityName: options.abilityName ?? null,
    itemName: options.itemName ?? null,
    savedAttacks,
    knownMoves: options.moves,
    moveNames: options.moves.map(getKnownMoveName),
    inferredMoveNames: [],
    candidateMoves: [],
    knowledge: "known",
    infoMode: "openTeamSheet",
    isActive: options.isActive,
  } satisfies BattleStateMemberInput;
}

function buildTrainerMembers(
  trainer: ArenaTrainer,
  pokemonByKey: ReadonlyMap<string, PokemonRecord>,
  moveByKey: ReadonlyMap<string, MoveRecord>,
) {
  return trainer.team.flatMap((member, slotIndex) => {
    const pokemon = getPokemonFromLookup(member.species, pokemonByKey);
    if (!pokemon || !isCurrentRegulationLegalPokemon(pokemon)) {
      return [];
    }
    const preset = getOpponentPreset(pokemon);
    const literalMoves = (member.moves ?? []).map((moveName) => knownMoveFromName(moveName, moveByKey));
    const moves = completeToFourKnownMoves(
      pokemon,
      [...getOpponentPresetKnownMoves(pokemon, moveByKey), ...literalMoves],
      moveByKey,
    );
    return [
      buildMemberInput({
        side: "enemy",
        slotIndex,
        pokemon,
        moves,
        abilityName: preset?.abilityName ?? member.abilityName,
        itemName: normalizePresetItemName(preset?.itemName) ?? member.itemName,
        statSpread: getDefaultChampionsStatSpreadForPokemon(pokemon),
        role: member.role,
        isActive: trainer.defaultLeads.includes(slotIndex),
      }),
    ];
  });
}

function buildRentalMembers(
  team: ArenaTeamMemberSpec[],
  activeIndices: number[],
  pokemonByKey: ReadonlyMap<string, PokemonRecord>,
  moveByKey: ReadonlyMap<string, MoveRecord>,
) {
  return team.flatMap((member, slotIndex) => {
    const pokemon = getPokemonFromLookup(member.species, pokemonByKey);
    if (!pokemon || !isCurrentRegulationLegalPokemon(pokemon)) {
      return [];
    }
    const preset = getOpponentPreset(pokemon);
    const literalMoves = (member.moves ?? []).map((moveName) => knownMoveFromName(moveName, moveByKey));
    const moves = completeToFourKnownMoves(
      pokemon,
      [...getOpponentPresetKnownMoves(pokemon, moveByKey), ...literalMoves],
      moveByKey,
    );
    return [
      buildMemberInput({
        side: "ally",
        slotIndex,
        pokemon,
        moves,
        abilityName: preset?.abilityName ?? member.abilityName,
        itemName: normalizePresetItemName(preset?.itemName) ?? member.itemName,
        statSpread: getDefaultChampionsStatSpreadForPokemon(pokemon),
        isActive: activeIndices.includes(slotIndex),
      }),
    ];
  });
}

function buildSavedTeamMembers(
  source: TeamSource & { kind: "saved" },
  activeIndices: number[],
  pokemonByKey: ReadonlyMap<string, PokemonRecord>,
  moveByKey: ReadonlyMap<string, MoveRecord>,
  speciesMovesetByKey: ReadonlyMap<string, PersistedSpeciesMoveset>,
) {
  return source.slots.flatMap((slot, slotIndex) => {
    const pokemon = getPokemonFromLookup(slot.pokemonId ?? slot.query, pokemonByKey);
    if (!pokemon || !isCurrentRegulationLegalPokemon(pokemon)) {
      return [];
    }
    const preset = getOpponentPreset(pokemon);
    const speciesMoveset = getSpeciesMoveset(pokemon, speciesMovesetByKey);
    const moves = buildKnownMovesForSavedSlot(slot, pokemon, speciesMoveset, moveByKey);
    return [
      buildMemberInput({
        side: "ally",
        slotIndex,
        pokemon,
        moves,
        abilityName: speciesMoveset?.abilityName ?? preset?.abilityName ?? null,
        itemName: slot.itemName ?? speciesMoveset?.itemName ?? normalizePresetItemName(preset?.itemName),
        statSpread: slot.statSpread ?? speciesMoveset?.statSpread ?? getDefaultChampionsStatSpreadForPokemon(pokemon),
        isActive: activeIndices.includes(slotIndex),
      }),
    ];
  });
}

function getActiveCombatants(state: BattleState | null, side: BattleSide) {
  if (!state) {
    return [];
  }
  return state.sides[side].activeIds
    .map((id) => (id ? state.combatants[id] ?? null : null))
    .filter((combatant): combatant is BattleCombatantState => Boolean(combatant));
}

function getBenchCombatants(state: BattleState | null, side: BattleSide) {
  if (!state) {
    return [];
  }
  return state.sides[side].benchIds
    .map((id) => state.combatants[id] ?? null)
    .filter((combatant): combatant is BattleCombatantState => Boolean(combatant));
}

function getAllCombatants(state: BattleState | null, side: BattleSide) {
  if (!state) {
    return [];
  }
  return Object.values(state.combatants)
    .filter((combatant) => combatant.side === side)
    .sort((left, right) => left.teamIndex - right.teamIndex);
}

function getWinner(state: BattleState | null): BattleSide | null {
  if (!state) {
    return null;
  }
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

function getHpPercent(combatant: BattleCombatantState) {
  return combatant.maxHp > 0 ? Math.max(0, Math.min(100, (combatant.currentHp / combatant.maxHp) * 100)) : 0;
}

function classifyHp(percent: number) {
  if (percent <= 25) {
    return "danger";
  }
  if (percent <= 50) {
    return "warn";
  }
  return "healthy";
}

function getMoveTypeColor(move: BattleMoveOption) {
  return move.type ? TYPE_META[move.type].color : "#a0aacb";
}

function getMoveMeta(move: BattleMoveOption) {
  if (move.effectKind !== "damage" && move.effectKind !== "fakeOut") {
    return move.effectKind === "protect" ? "Guard" : "Status";
  }
  return `${move.basePower ?? "--"} BP`;
}

function getAvailableMoves(combatant: BattleCombatantState) {
  const seen = new Set<string>();
  return [...combatant.knownMoves, ...combatant.candidateMoves].filter((move) => {
    const key = normalizeKey(move.name);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, 4);
}

function getDefaultTargetForMove(
  state: BattleState,
  actor: BattleCombatantState,
  move: BattleMoveOption,
) {
  if (move.targetKind === "self") {
    return actor.id;
  }
  if (move.targetKind === "singleAlly") {
    return state.sides[actor.side].activeIds.find((id): id is string => Boolean(id) && id !== actor.id) ?? actor.id;
  }
  if (move.targetKind === "singleOpponent") {
    const opponentSide: BattleSide = actor.side === "ally" ? "enemy" : "ally";
    const mirrorIndex = state.sides[actor.side].activeIds.findIndex((id) => id === actor.id);
    return state.sides[opponentSide].activeIds[mirrorIndex] ?? state.sides[opponentSide].activeIds.find((id): id is string => Boolean(id)) ?? null;
  }
  return null;
}

function getTargetOptions(state: BattleState, actor: BattleCombatantState, move: BattleMoveOption) {
  if (move.targetKind === "self") {
    return [actor];
  }
  if (move.targetKind === "singleAlly") {
    return getActiveCombatants(state, actor.side).filter((combatant) => combatant.id !== actor.id);
  }
  if (move.targetKind === "singleOpponent") {
    return getActiveCombatants(state, actor.side === "ally" ? "enemy" : "ally");
  }
  return [];
}

function moveNeedsManualTarget(move: BattleMoveOption | null) {
  return move?.targetKind === "singleOpponent" || move?.targetKind === "singleAlly";
}

function getMoveById(combatant: BattleCombatantState, moveId: string) {
  return getAvailableMoves(combatant).find((move) => move.id === moveId) ?? null;
}

function buildPlannedAction(
  state: BattleState,
  combatant: BattleCombatantState,
  pick: ArenaMovePick | undefined,
  fallback: PlannedAction | null,
): PlannedAction {
  if (!pick) {
    return fallback ?? {
      actorId: combatant.id,
      actorLabel: combatant.pokemon.name,
      action: { type: "pass", actorId: combatant.id },
      summary: `${combatant.pokemon.name}: pass`,
      heuristicScore: 0,
    };
  }

  if (pick.kind === "pass") {
    return {
      actorId: combatant.id,
      actorLabel: combatant.pokemon.name,
      action: { type: "pass", actorId: combatant.id },
      summary: `${combatant.pokemon.name}: pass`,
      heuristicScore: 0,
    };
  }

  if (pick.kind === "switch") {
    const incoming = state.combatants[pick.switchInId];
    return {
      actorId: combatant.id,
      actorLabel: combatant.pokemon.name,
      action: { type: "switch", actorId: combatant.id, switchInId: pick.switchInId },
      summary: `${combatant.pokemon.name}: switch to ${incoming?.pokemon.name ?? "bench"}`,
      heuristicScore: 0,
    };
  }

  const move = getMoveById(combatant, pick.moveId);
  const target = pick.targetId ? state.combatants[pick.targetId] ?? null : null;
  const targetText =
    move?.targetKind === "allOpponents"
      ? " into both foes"
      : target && move?.targetKind !== "self"
        ? ` into ${target.pokemon.name}`
        : "";
  return {
    actorId: combatant.id,
    actorLabel: combatant.pokemon.name,
    action: { type: "move", actorId: combatant.id, moveId: pick.moveId, targetId: pick.targetId },
    summary: `${combatant.pokemon.name}: ${move?.name ?? "move"}${targetText}`,
    heuristicScore: 0,
  };
}

function buildJointPlanFromChoices(
  state: BattleState,
  side: BattleSide,
  choices: Record<string, ArenaMovePick>,
  fallback: JointActionPlan | null,
): JointActionPlan {
  const actions = getActiveCombatants(state, side).map((combatant) =>
    buildPlannedAction(
      state,
      combatant,
      choices[combatant.id],
      fallback?.actions.find((action) => action.actorId === combatant.id) ?? null,
    ),
  );
  return {
    side,
    actions,
    summary: actions.map((action) => action.summary).join(" + ") || `${side}: pass`,
    heuristicScore: 0,
  };
}

function isArenaChoiceComplete(
  state: BattleState,
  combatant: BattleCombatantState,
  pick: ArenaMovePick | undefined,
) {
  if (!pick) {
    return false;
  }
  if (pick.kind === "pass") {
    return true;
  }
  if (pick.kind === "switch") {
    return Boolean(state.combatants[pick.switchInId]);
  }
  const move = getMoveById(combatant, pick.moveId);
  if (!move) {
    return false;
  }
  if (!moveNeedsManualTarget(move)) {
    return true;
  }
  return Boolean(pick.targetId && getTargetOptions(state, combatant, move).some((target) => target.id === pick.targetId));
}

function emptyPlan(side: BattleSide): JointActionPlan {
  return { side, actions: [], summary: `${side}: pass`, heuristicScore: 0 };
}

function uniqueOrderedNumbers(values: number[]) {
  return [...new Set(values)];
}

function getMemberTeamIndices(members: BattleStateMemberInput[]) {
  return members.map((member) => member.teamIndex).sort((left, right) => left - right);
}

function fillOrderedIndices(
  requested: number[],
  available: number[],
  count: number,
) {
  const availableSet = new Set(available);
  const selected = uniqueOrderedNumbers(requested.filter((slotIndex) => availableSet.has(slotIndex))).slice(0, count);
  for (const slotIndex of available) {
    if (selected.length >= Math.min(count, available.length)) {
      break;
    }
    if (!selected.includes(slotIndex)) {
      selected.push(slotIndex);
    }
  }
  return selected;
}

function getLeadPairFromBringOrder(bringIndices: number[]) {
  return bringIndices.slice(0, 2);
}

function orderFourWithLead(four: number[], lead: number[]) {
  const fourSet = new Set(four);
  return uniqueOrderedNumbers([
    ...lead.filter((slotIndex) => fourSet.has(slotIndex)),
    ...four,
  ]).slice(0, 4);
}

function getSolverSuggestedBringOrder(recommendation: TeamPreviewRecommendation | null) {
  if (!recommendation) {
    return [];
  }
  return orderFourWithLead(recommendation.bestFour, recommendation.primaryLead);
}

function getAiPreviewSelection(
  recommendation: TeamPreviewRecommendation | null,
  trainerMembers: BattleStateMemberInput[],
  fallbackLeadIndices: number[],
) {
  const available = getMemberTeamIndices(trainerMembers);
  const distributionPrediction = recommendation?.enemyBringDistribution?.[0] ?? null;
  const summaryPrediction = recommendation?.predictedEnemyFours?.[0] ?? null;
  const prediction = distributionPrediction ?? summaryPrediction;
  const predictedFour = prediction?.four ?? [];
  const predictedLead =
    distributionPrediction?.lead ??
    distributionPrediction?.leads?.[0]?.lead ??
    summaryPrediction?.lead ??
    fallbackLeadIndices;
  const bringIndices = fillOrderedIndices(orderFourWithLead(predictedFour, predictedLead), available, 4);
  const leadIndices = fillOrderedIndices(predictedLead, bringIndices, 2);

  return {
    bringIndices,
    leadIndices,
    probability: prediction?.probability ?? null,
    reasons: prediction?.reasons ?? [],
  };
}

function markMembersForBattle(
  members: BattleStateMemberInput[],
  bringIndices: number[],
  leadIndices: number[],
) {
  const bringSet = new Set(bringIndices);
  const leadSet = new Set(leadIndices);
  return members
    .filter((member) => bringSet.has(member.teamIndex))
    .map((member) => ({
      ...member,
      isActive: leadSet.has(member.teamIndex),
    }));
}

function classifyEvent(event: TurnEvent | null): EventTone {
  if (!event) {
    return "neutral";
  }
  const text = event.text.toLowerCase();
  if (text.includes("faints")) {
    return "faint";
  }
  if (text.includes("switches out") || text.includes("enters the battle")) {
    return "switch";
  }
  if (text.includes("protect") || text.includes("wide guard") || text.includes("quick guard") || text.includes("blocks")) {
    return "protect";
  }
  if (
    text.includes("tailwind") ||
    text.includes("trick room") ||
    text.includes("dimensions") ||
    text.includes("helping hand") ||
    text.includes("boost") ||
    text.includes("taunt") ||
    text.includes("spore") ||
    text.includes("sleep") ||
    text.includes("burn") ||
    text.includes("paralysis") ||
    text.includes("redirect") ||
    text.includes("sets ")
  ) {
    return "status";
  }
  if (event.actorId && (event.targetId || text.includes("uses"))) {
    return "attack";
  }
  return "neutral";
}

function getDamageFromEvent(event: TurnEvent | null) {
  const match = event?.text.match(/for (\d+) HP/i);
  return match ? Number(match[1]) : null;
}

function getEventClassForCombatant(combatant: BattleCombatantState, event: TurnEvent | null) {
  if (!event) {
    return "";
  }
  const tone = classifyEvent(event);
  const isActor = event.actorId === combatant.id;
  const isTarget = event.targetId === combatant.id;
  if (tone === "attack" && isActor) {
    return "is-attacking";
  }
  if (tone === "attack" && isTarget) {
    return "is-hit";
  }
  if (tone === "protect" && (isActor || isTarget)) {
    return "is-protecting";
  }
  if (tone === "status" && (isActor || isTarget)) {
    return "is-statused";
  }
  if (tone === "switch" && (isActor || isTarget)) {
    return "is-switching";
  }
  if (tone === "faint" && (isActor || isTarget)) {
    return "is-fainting";
  }
  return "";
}

function getPlanMoveNames(plan: JointActionPlan | null) {
  return plan?.actions.map((action) => action.summary).join(" / ") || "No plan";
}

function PokemonSprite({
  pokemon,
  className,
}: {
  pokemon: Pick<PokemonRecord, "id" | "name" | "baseSpecies">;
  className?: string;
}) {
  const [src, setSrc] = useState(() => getPokemonSpriteUrl(pokemon.id));

  useEffect(() => {
    setSrc(getPokemonSpriteUrl(pokemon.id));
  }, [pokemon.id]);

  return (
    <img
      className={className}
      src={src}
      alt={pokemon.name}
      loading="lazy"
      onError={() => {
        const fallback = getPokemonBaseSpriteUrl(pokemon.baseSpecies);
        if (src !== fallback) {
          setSrc(fallback);
        }
      }}
    />
  );
}

function TrainerSprite({
  trainer,
  className = "",
}: {
  trainer: Pick<ArenaTrainer, "name" | "spriteIndex">;
  className?: string;
}) {
  return (
    <div
      className={`arena-trainer-sprite ${className}`}
      role="img"
      aria-label={trainer.name}
      style={
        {
          "--trainer-position": `${trainer.spriteIndex * 25}%`,
          backgroundImage: `url("${TRAINER_SHEET_URL}")`,
        } as CSSProperties
      }
    />
  );
}

function TypePill({ type }: { type: string }) {
  const pokemonType = getTypeFromLabel(type);
  if (!pokemonType) {
    return null;
  }
  return (
    <span
      className="arena-type-pill"
      style={
        {
          "--type-color": TYPE_META[pokemonType].color,
          "--type-accent": TYPE_META[pokemonType].accent,
        } as CSSProperties
      }
    >
      {TYPE_META[pokemonType].label}
    </span>
  );
}

function CombatantSlot({
  combatant,
  event,
  side,
  targetable = false,
  selectedTarget = false,
  targeting = false,
  onSelectTarget,
}: {
  combatant: BattleCombatantState | null;
  event: TurnEvent | null;
  side: BattleSide;
  targetable?: boolean;
  selectedTarget?: boolean;
  targeting?: boolean;
  onSelectTarget?: (combatant: BattleCombatantState) => void;
}) {
  if (!combatant) {
    return <div className={`arena-combatant-slot ${side} empty`}>Empty</div>;
  }
  const hpPercent = getHpPercent(combatant);
  const eventClass = getEventClassForCombatant(combatant, event);
  const damage = event?.targetId === combatant.id ? getDamageFromEvent(event) : null;
  const status = combatant.statusCondition !== "none" ? combatant.statusCondition : null;

  return (
    <article
      className={`arena-combatant-slot ${side} ${eventClass} ${targeting ? "targeting" : ""} ${
        targetable ? "targetable" : ""
      } ${selectedTarget ? "selected-target" : ""}`}
      role={targetable ? "button" : undefined}
      tabIndex={targetable ? 0 : undefined}
      onClick={() => {
        if (targetable) {
          onSelectTarget?.(combatant);
        }
      }}
      onKeyDown={(event) => {
        if (targetable && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelectTarget?.(combatant);
        }
      }}
      aria-label={targetable ? `Target ${combatant.pokemon.name}` : undefined}
    >
      <div className="arena-combatant-head">
        <strong>{combatant.pokemon.name}</strong>
        {status ? <span className={`arena-status ${status}`}>{status}</span> : null}
      </div>
      <div className="arena-sprite-stage">
        <PokemonSprite pokemon={combatant.pokemon} className="arena-pokemon-sprite" />
        {eventClass === "is-attacking" ? <span className={`arena-projectile ${side}`} /> : null}
        {eventClass === "is-hit" ? <span className="arena-impact-ring" /> : null}
        {eventClass === "is-protecting" ? <span className="arena-shield" /> : null}
        {eventClass === "is-statused" ? <span className="arena-status-aura" /> : null}
        {damage ? <span className="arena-damage-pop">-{damage}</span> : null}
        {targetable ? <span className="arena-target-reticle" /> : null}
      </div>
      <div className="arena-hp-row">
        <div className="arena-hp-bar">
          <span className={classifyHp(hpPercent)} style={{ width: `${hpPercent}%` }} />
        </div>
        <small>
          {combatant.currentHp}/{combatant.maxHp}
        </small>
      </div>
      <div className="arena-type-row">
        {combatant.pokemon.types.map((type) => <TypePill key={`${combatant.id}-${type}`} type={type} />)}
      </div>
    </article>
  );
}

function RosterStrip({
  state,
  side,
}: {
  state: BattleState | null;
  side: BattleSide;
}) {
  const activeIds = new Set(getActiveCombatants(state, side).map((combatant) => combatant.id));
  const combatants = getAllCombatants(state, side);
  return (
    <div className={`arena-roster-strip ${side}`}>
      {combatants.map((combatant) => {
        const hpPercent = getHpPercent(combatant);
        return (
          <div
            key={combatant.id}
            className={`arena-roster-token ${activeIds.has(combatant.id) ? "active" : ""} ${
              combatant.currentHp <= 0 ? "fainted" : ""
            }`}
            title={`${combatant.pokemon.name} ${Math.round(hpPercent)}%`}
          >
            <PokemonSprite pokemon={combatant.pokemon} />
            <span>{combatant.pokemon.name}</span>
          </div>
        );
      })}
    </div>
  );
}

function MoveButton({
  move,
  selected,
  onClick,
  disabled,
}: {
  move: BattleMoveOption;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`arena-move-button ${selected ? "selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
      style={
        {
          "--move-color": getMoveTypeColor(move),
        } as CSSProperties
      }
      title={move.shortDesc || move.name}
    >
      <span className="arena-move-name">{move.name}</span>
      <span className="arena-move-meta">{getMoveMeta(move)}</span>
    </button>
  );
}

function CommandCard({
  state,
  combatant,
  pick,
  onPick,
  onMovePick,
  disabled,
  targeting = false,
}: {
  state: BattleState;
  combatant: BattleCombatantState;
  pick: ArenaMovePick | undefined;
  onPick: (pick: ArenaMovePick) => void;
  onMovePick: (move: BattleMoveOption) => void;
  disabled: boolean;
  targeting?: boolean;
}) {
  const moves = getAvailableMoves(combatant);
  const selectedMove = pick?.kind === "move" ? getMoveById(combatant, pick.moveId) : null;
  const bench = getBenchCombatants(state, combatant.side).filter((entry) => entry.currentHp > 0);
  const selectedTargetName =
    pick?.kind === "move" && pick.targetId ? state.combatants[pick.targetId]?.pokemon.name ?? null : null;
  const needsTarget = moveNeedsManualTarget(selectedMove);

  return (
    <article className={`arena-command-card ${targeting ? "targeting" : ""}`}>
      <div className="arena-command-card-head">
        <PokemonSprite pokemon={combatant.pokemon} className="arena-command-sprite" />
        <div>
          <strong>{combatant.pokemon.name}</strong>
          <span>{combatant.itemName ?? "No item"} / {combatant.abilityName ?? "default ability"}</span>
        </div>
      </div>
      <div className="arena-move-grid">
        {moves.map((move) => {
          const selected = pick?.kind === "move" && pick.moveId === move.id;
          return (
            <MoveButton
              key={move.id}
              move={move}
              selected={selected}
              disabled={disabled}
              onClick={() => onMovePick(move)}
            />
          );
        })}
      </div>
      <div className={`arena-target-hint ${targeting ? "targeting" : ""} ${selectedTargetName ? "locked" : ""}`}>
        {selectedMove && needsTarget
          ? selectedTargetName
            ? `Target: ${selectedTargetName}`
            : "Click a highlighted Pokémon on the field."
          : selectedMove
            ? "No target selection needed."
            : "Pick a move or switch."}
      </div>
      <div className="arena-command-footer">
        <select
          value={pick?.kind === "switch" ? pick.switchInId : ""}
          onChange={(event) => {
            if (event.target.value) {
              onPick({ kind: "switch", switchInId: event.target.value });
            }
          }}
          disabled={disabled || bench.length === 0}
          aria-label={`Switch ${combatant.pokemon.name}`}
        >
          <option value="">Switch...</option>
          {bench.map((benchCombatant) => (
            <option key={benchCombatant.id} value={benchCombatant.id}>
              {benchCombatant.pokemon.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={pick?.kind === "pass" ? "selected" : ""}
          onClick={() => onPick({ kind: "pass" })}
          disabled={disabled}
        >
          Pass
        </button>
      </div>
    </article>
  );
}

function MovesetChipList({ moveNames }: { moveNames?: string[] }) {
  return (
    <div className="arena-moveset-chip-list">
      {(moveNames ?? []).slice(0, 4).map((moveName) => (
        <span key={moveName}>{moveName}</span>
      ))}
    </div>
  );
}

function getPreviewPickLabel(teamIndex: number, bringOrder: number[]) {
  const order = bringOrder.indexOf(teamIndex);
  if (order < 0) {
    return null;
  }
  return order < 2 ? `Lead ${order + 1}` : `Pick ${order + 1}`;
}

function TeamPreviewRoster({
  members,
  bringOrder,
  onToggleBring,
  suggestedBringOrder = [],
  readOnly = false,
  title,
}: {
  members: BattleStateMemberInput[];
  bringOrder: number[];
  onToggleBring?: (slotIndex: number) => void;
  suggestedBringOrder?: number[];
  readOnly?: boolean;
  title?: string;
}) {
  const suggestedSet = new Set(suggestedBringOrder);
  return (
    <div className="arena-preview-roster detailed" aria-label={title}>
      {members.map((member) => {
        const pickLabel = getPreviewPickLabel(member.teamIndex, bringOrder);
        const suggested = suggestedSet.has(member.teamIndex);
        const className = [
          "arena-preview-token",
          "detailed",
          pickLabel ? "selected" : "",
          pickLabel?.startsWith("Lead") ? "lead" : "",
          suggested ? "suggested" : "",
          readOnly ? "static" : "",
        ].filter(Boolean).join(" ");
        const content = (
          <>
            <PokemonSprite pokemon={member.pokemon} />
            <span>
              <strong>{member.pokemon.name}</strong>
              <small>{member.itemName ?? "No item"} / {member.abilityName ?? "Ability open"}</small>
              <MovesetChipList moveNames={member.moveNames} />
            </span>
            {pickLabel ? <em>{pickLabel}</em> : suggested ? <em>Suggested</em> : null}
          </>
        );
        return readOnly ? (
          <div key={`preview-${member.id}`} className={className}>
            {content}
          </div>
        ) : (
          <button
            key={`preview-${member.id}`}
            type="button"
            className={className}
            onClick={() => onToggleBring?.(member.teamIndex)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function BattleArenaPage() {
  const [pokemonDb, setPokemonDb] = useState<PokemonRecord[]>([]);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [savedTeams, setSavedTeams] = useState<PersistedTeam[]>([]);
  const [speciesMovesets, setSpeciesMovesets] = useState<PersistedSpeciesMoveset[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState(RENTAL_TEAM_ID);
  const [selectedTrainerId, setSelectedTrainerId] = useState(ARENA_TRAINERS[0]!.id);
  const [playerBringIndices, setPlayerBringIndices] = useState<number[]>([0, 1, 2, 3]);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [choices, setChoices] = useState<Record<string, ArenaMovePick>>({});
  const [targetingActorId, setTargetingActorId] = useState<string | null>(null);
  const [turnLog, setTurnLog] = useState<TurnEvent[]>([]);
  const [simulation, setSimulation] = useState<SimulationRun | null>(null);
  const [lastSimulation, setLastSimulation] = useState<SimulationRun | null>(null);
  const [showAiLines, setShowAiLines] = useState(false);
  const [eventIndex, setEventIndex] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([loadPokemonDatabase(), loadBattleData(), listSavedTeams(), listSpeciesMovesets()])
      .then(([database, battleData, teams, movesets]) => {
        if (!active) {
          return;
        }
        setPokemonDb(database.pokemon);
        setMoves(battleData.moves);
        setSavedTeams(teams);
        setSpeciesMovesets(movesets);
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Failed to load battle arena data.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const pokemonByKey = useMemo(() => {
    const map = new Map<string, PokemonRecord>();
    for (const pokemon of pokemonDb) {
      map.set(pokemon.id, pokemon);
      map.set(pokemon.name.toLowerCase(), pokemon);
      map.set(normalizeKey(pokemon.name), pokemon);
      if (!pokemon.forme || !map.has(normalizeKey(pokemon.baseSpecies))) {
        map.set(normalizeKey(pokemon.baseSpecies), pokemon);
      }
    }
    return map;
  }, [pokemonDb]);

  const moveByKey = useMemo(() => {
    const map = new Map<string, MoveRecord>();
    for (const move of moves) {
      map.set(move.id, move);
      map.set(move.name.toLowerCase(), move);
      map.set(normalizeKey(move.name), move);
    }
    return map;
  }, [moves]);

  const speciesMovesetByKey = useMemo(() => {
    const map = new Map<string, PersistedSpeciesMoveset>();
    for (const moveset of speciesMovesets) {
      map.set(normalizeKey(moveset.speciesKey), moveset);
    }
    return map;
  }, [speciesMovesets]);

  const teamSources = useMemo<TeamSource[]>(
    () => [
      { kind: "rental", id: RENTAL_TEAM_ID, name: "Rental: Champions Core", team: RENTAL_TEAM },
      ...savedTeams.map((team) => ({
        kind: "saved" as const,
        id: team.id,
        name: team.name,
        slots: team.slots,
      })),
    ],
    [savedTeams],
  );

  const playerLeadIndices = useMemo(() => getLeadPairFromBringOrder(playerBringIndices), [playerBringIndices]);
  const selectedTrainer = ARENA_TRAINERS.find((trainer) => trainer.id === selectedTrainerId) ?? ARENA_TRAINERS[0]!;
  const selectedTeam = teamSources.find((team) => team.id === selectedTeamId) ?? teamSources[0] ?? null;

  const previewPlayerMembers = useMemo(() => {
    if (!selectedTeam || pokemonByKey.size === 0 || moveByKey.size === 0) {
      return [];
    }
    if (selectedTeam.kind === "rental") {
      return buildRentalMembers(selectedTeam.team, [], pokemonByKey, moveByKey);
    }
    return buildSavedTeamMembers(selectedTeam, [], pokemonByKey, moveByKey, speciesMovesetByKey);
  }, [moveByKey, pokemonByKey, selectedTeam, speciesMovesetByKey]);

  const previewTrainerMembers = useMemo(() => {
    if (pokemonByKey.size === 0 || moveByKey.size === 0) {
      return [];
    }
    return buildTrainerMembers(selectedTrainer, pokemonByKey, moveByKey);
  }, [moveByKey, pokemonByKey, selectedTrainer]);

  const teamPreviewRecommendation = useMemo(
    () => {
      if (previewPlayerMembers.length < 4 || previewTrainerMembers.length < 4 || moveByKey.size === 0) {
        return null;
      }
      return recommendTeamPreview({
        ally: previewPlayerMembers.map((member) => ({ ...member, isActive: false })),
        enemy: previewTrainerMembers.map((member) => ({ ...member, isActive: false })),
        moveByKey,
        solverMode: "robust",
        timeBudgetMs: 180,
        allyFourCandidates: 3,
        enemyFourCandidates: 4,
        maxThreatLines: 4,
        maxLeadsPerFour: 2,
        previewObjectiveMode: "robust",
      });
    },
    [moveByKey, previewPlayerMembers, previewTrainerMembers],
  );

  const suggestedPlayerBringOrder = useMemo(
    () => getSolverSuggestedBringOrder(teamPreviewRecommendation),
    [teamPreviewRecommendation],
  );
  const aiPreviewSelection = useMemo(
    () => getAiPreviewSelection(teamPreviewRecommendation, previewTrainerMembers, selectedTrainer.defaultLeads),
    [previewTrainerMembers, selectedTrainer.defaultLeads, teamPreviewRecommendation],
  );

  useEffect(() => {
    const filled = previewPlayerMembers.map((member) => member.teamIndex);
    if (filled.length === 0) {
      return;
    }
    setPlayerBringIndices((current) => {
      const next = fillOrderedIndices(current, filled, 4);
      if (next.length === current.length && next.every((slotIndex, index) => slotIndex === current[index])) {
        return current;
      }
      return next;
    });
  }, [previewPlayerMembers]);

  useEffect(() => {
    if (!battleState || simulation) {
      return;
    }
    setChoices((current) => {
      const next = { ...current };
      let changed = false;
      for (const combatant of getActiveCombatants(battleState, "ally")) {
        if (next[combatant.id]) {
          continue;
        }
        const move = getAvailableMoves(combatant)[0];
        if (move) {
          changed = true;
          next[combatant.id] = {
            kind: "move",
            moveId: move.id,
            targetId: getDefaultTargetForMove(battleState, combatant, move),
          };
        }
      }
      return changed ? next : current;
    });
  }, [battleState, simulation]);

  useEffect(() => {
    if (!simulation) {
      return;
    }
    if (simulation.events.length === 0) {
      setBattleState(simulation.finalState);
      setTurnLog((current) => [...current, ...simulation.events]);
      setLastSimulation(simulation);
      setChoices({});
      setTargetingActorId(null);
      setSimulation(null);
      return;
    }
    const timer = window.setTimeout(() => {
      if (eventIndex < simulation.events.length - 1) {
        setEventIndex((current) => current + 1);
        return;
      }
      setBattleState(simulation.finalState);
      setTurnLog((current) => [...current, ...simulation.events]);
      setLastSimulation(simulation);
      setChoices({});
      setTargetingActorId(null);
      setSimulation(null);
      setEventIndex(0);
    }, ARENA_EVENT_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [eventIndex, simulation]);

  const togglePlayerBring = (slotIndex: number) => {
    const filled = previewPlayerMembers.map((member) => member.teamIndex);
    setPlayerBringIndices((current) => {
      if (!filled.includes(slotIndex)) {
        return current;
      }
      if (current.includes(slotIndex)) {
        return current.filter((value) => value !== slotIndex);
      }
      if (current.length >= 4) {
        return current;
      }
      return [...current, slotIndex];
    });
  };

  const applySuggestedPreview = () => {
    if (suggestedPlayerBringOrder.length >= 4) {
      setPlayerBringIndices(suggestedPlayerBringOrder.slice(0, 4));
    }
  };

  const handleMovePick = (combatant: BattleCombatantState, move: BattleMoveOption) => {
    const needsTarget = moveNeedsManualTarget(move);
    setChoices((current) => ({
      ...current,
      [combatant.id]: {
        kind: "move",
        moveId: move.id,
        targetId: needsTarget ? null : getDefaultTargetForMove(battleState!, combatant, move),
      },
    }));
    setTargetingActorId(needsTarget ? combatant.id : null);
  };

  const handlePick = (combatant: BattleCombatantState, pick: ArenaMovePick) => {
    setChoices((current) => ({ ...current, [combatant.id]: pick }));
    if (targetingActorId === combatant.id) {
      setTargetingActorId(null);
    }
  };

  const handleSelectFieldTarget = (target: BattleCombatantState) => {
    if (!battleState || !targetingActorId || simulation) {
      return;
    }
    const actor = battleState.combatants[targetingActorId];
    const pick = choices[targetingActorId];
    if (!actor || pick?.kind !== "move") {
      return;
    }
    const move = getMoveById(actor, pick.moveId);
    if (!move || !getTargetOptions(battleState, actor, move).some((entry) => entry.id === target.id)) {
      return;
    }
    setChoices((current) => ({
      ...current,
      [actor.id]: { kind: "move", moveId: move.id, targetId: target.id },
    }));
    setTargetingActorId(null);
  };

  const startBattle = () => {
    const playerLeadSelection = getLeadPairFromBringOrder(playerBringIndices);
    const enemyLeadSelection = aiPreviewSelection.leadIndices;
    const ally = markMembersForBattle(previewPlayerMembers, playerBringIndices, playerLeadSelection);
    const enemy = markMembersForBattle(previewTrainerMembers, aiPreviewSelection.bringIndices, enemyLeadSelection);
    const allyActiveMembers = ally.filter((member) => member.isActive);
    const enemyActiveMembers = enemy.filter((member) => member.isActive);
    if (ally.length !== 4 || enemy.length !== 4 || allyActiveMembers.length !== 2 || enemyActiveMembers.length !== 2) {
      return;
    }
    const state = createBattleState({
      ally,
      enemy,
      moveByKey,
      universalProtect: false,
      applyInitialEntryEffects: true,
      fieldState: { turn: 1 },
    });
    setBattleState(state);
    setTurnLog([]);
    setChoices({});
    setTargetingActorId(null);
    setSimulation(null);
    setLastSimulation(null);
    setShowAiLines(false);
    setEventIndex(0);
  };

  const resetBattle = () => {
    setBattleState(null);
    setChoices({});
    setTargetingActorId(null);
    setTurnLog([]);
    setSimulation(null);
    setLastSimulation(null);
    setShowAiLines(false);
    setEventIndex(0);
  };

  const lockTurn = () => {
    if (!battleState || simulation) {
      return;
    }
    const currentChoicesReady = getActiveCombatants(battleState, "ally")
      .every((combatant) => isArenaChoiceComplete(battleState, combatant, choices[combatant.id]));
    if (!currentChoicesReady) {
      return;
    }
    const recommendation = recommendBestPlan(battleState, {
      searchMode: "balanced",
      objectiveMode: "likely",
      maxJointPlansPerSide: 8,
      maxIndividualActionsPerActor: 5,
      maxNodes: 1400,
      maxMs: 90,
    });
    const enemyPlan =
      recommendation.predictedEnemyResponse ??
      recommendation.enemyBestResponse ??
      generateJointActionPlans(battleState, "enemy", {
        maxIndividualActionsPerActor: 5,
        maxJointPlans: 1,
      })[0] ??
      emptyPlan("enemy");
    const allyPlan = buildJointPlanFromChoices(battleState, "ally", choices, null);
    const result = resolveTurn(battleState, allyPlan, enemyPlan, "average");
    const nextSimulation = {
      startState: battleState,
      finalState: result.state,
      events: result.events,
      allyPlan,
      enemyPlan,
      recommendation,
    };
    setSimulation(nextSimulation);
    setLastSimulation(nextSimulation);
    setShowAiLines(false);
    setEventIndex(0);
  };

  const visibleEvents = simulation
    ? [...turnLog, ...simulation.events.slice(0, eventIndex + 1)]
    : turnLog;
  const currentEvent = simulation?.events[eventIndex] ?? null;
  const displayedSimulation = simulation ?? lastSimulation;
  const aiLinesAvailable = Boolean(displayedSimulation);
  const winner = getWinner(battleState);
  const activePreviewPlayerCount = previewPlayerMembers.filter((member) => playerLeadIndices.includes(member.teamIndex)).length;
  const activePreviewTrainerCount = previewTrainerMembers.filter((member) => aiPreviewSelection.leadIndices.includes(member.teamIndex)).length;
  const canStart =
    playerBringIndices.length === 4 &&
    aiPreviewSelection.bringIndices.length === 4 &&
    activePreviewPlayerCount === 2 &&
    activePreviewTrainerCount === 2 &&
    moveByKey.size > 0;
  const activeAllyCombatants = getActiveCombatants(battleState, "ally");
  const choicesReady = battleState
    ? activeAllyCombatants.every((combatant) => isArenaChoiceComplete(battleState, combatant, choices[combatant.id]))
    : false;
  const targetingActor = battleState && targetingActorId ? battleState.combatants[targetingActorId] ?? null : null;
  const targetingPick = targetingActor ? choices[targetingActor.id] : null;
  const targetingMove = targetingActor && targetingPick?.kind === "move" ? getMoveById(targetingActor, targetingPick.moveId) : null;
  const targetableIds = new Set(
    battleState && targetingActor && targetingMove
      ? getTargetOptions(battleState, targetingActor, targetingMove).map((target) => target.id)
      : [],
  );
  const selectedTargetIds = new Set(
    Object.values(choices)
      .map((pick) => (pick.kind === "move" ? pick.targetId : null))
      .filter((targetId): targetId is string => Boolean(targetId)),
  );
  const canLockTurn = Boolean(battleState && !simulation && !winner && choicesReady);

  if (loadError) {
    return (
      <section className="board-panel arena-page">
        <div className="arena-empty-state">{loadError}</div>
      </section>
    );
  }

  return (
    <section className="arena-page">
      <div className="arena-hero">
        <div className="arena-hero-copy">
          <p className="eyebrow">Battle Arena</p>
          <h2>Build the board, lock the turn, watch the line resolve</h2>
        </div>
        <div className="arena-hero-trainers" aria-hidden="true">
          {ARENA_TRAINERS.map((trainer) => (
            <TrainerSprite key={`hero-trainer-${trainer.id}`} trainer={trainer} />
          ))}
        </div>
      </div>

      {!battleState ? (
        <div className="arena-setup-grid">
          <section className="arena-setup-panel trainer-select-panel">
            <div className="arena-section-heading">
              <p className="eyebrow">Opposing Trainer</p>
              <h3>Choose a specialist</h3>
            </div>
            <div className="arena-trainer-grid">
              {ARENA_TRAINERS.map((trainer) => {
                const selected = selectedTrainer.id === trainer.id;
                return (
                  <button
                    key={trainer.id}
                    type="button"
                    className={`arena-trainer-card ${selected ? "selected" : ""}`}
                    onClick={() => setSelectedTrainerId(trainer.id)}
                    style={{ "--trainer-accent": trainer.accent } as CSSProperties}
                  >
                    <TrainerSprite trainer={trainer} />
                    <span>
                      <strong>{trainer.name}</strong>
                      <small>{trainer.title}</small>
                    </span>
                    <em>{trainer.temperament}</em>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="arena-setup-panel">
            <div className="arena-section-heading">
              <p className="eyebrow">Your Team</p>
              <h3>Pick four; first two lead</h3>
            </div>
            <div className="arena-team-select-row">
              <select
                value={selectedTeamId}
                onChange={(event) => {
                  setSelectedTeamId(event.target.value);
                  setPlayerBringIndices([0, 1, 2, 3]);
                }}
                aria-label="Select saved team"
              >
                {teamSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
              <span>{POKEMON_CHAMPIONS_ACTIVE_REGULATION}</span>
            </div>
            <div className="arena-preview-control-row">
              <span>{playerBringIndices.length}/4 selected</span>
              <button
                type="button"
                className="reset-button"
                onClick={applySuggestedPreview}
                disabled={suggestedPlayerBringOrder.length < 4}
              >
                Apply Solver Pick
              </button>
            </div>
            <TeamPreviewRoster
              members={previewPlayerMembers}
              bringOrder={playerBringIndices}
              suggestedBringOrder={suggestedPlayerBringOrder}
              onToggleBring={togglePlayerBring}
              title="Your team preview selection"
            />
          </section>

          <section className="arena-setup-panel arena-match-card" style={{ "--trainer-accent": selectedTrainer.accent } as CSSProperties}>
            <div className="arena-match-top">
              <TrainerSprite trainer={selectedTrainer} />
              <div>
                <p className="eyebrow">{selectedTrainer.title}</p>
                <h3>{selectedTrainer.name}</h3>
                <p>{selectedTrainer.specialty}</p>
              </div>
            </div>
            <div className="arena-preview-control-row enemy">
              <span>
                {aiPreviewSelection.probability
                  ? `${Math.round(aiPreviewSelection.probability * 100)}% AI line`
                  : "AI line ready"}
              </span>
              <span>{aiPreviewSelection.bringIndices.length}/4 picked</span>
            </div>
            <TeamPreviewRoster
              members={previewTrainerMembers}
              bringOrder={orderFourWithLead(aiPreviewSelection.bringIndices, aiPreviewSelection.leadIndices)}
              readOnly
              title="Trainer team preview selection"
            />
            <button type="button" className="primary-button arena-start-button" disabled={!canStart} onClick={startBattle}>
              Lock Preview and Battle
            </button>
          </section>
        </div>
      ) : (
        <div className="arena-battle-grid">
          <section className="arena-field-shell" style={{ "--trainer-accent": selectedTrainer.accent } as CSSProperties}>
            <div className="arena-field-topbar">
              <div>
                <p className="eyebrow">Turn {battleState.field.turn}</p>
                <h3>{selectedTeam?.name ?? "Your team"} vs {selectedTrainer.name}</h3>
              </div>
              <div className="arena-field-tags">
                <span>Weather {battleState.field.weather}</span>
                <span>Terrain {battleState.field.terrain}</span>
                <span>Trick Room {battleState.field.trickRoomTurns}</span>
                <span>Tailwind {battleState.sides.ally.tailwindTurns}/{battleState.sides.enemy.tailwindTurns}</span>
              </div>
            </div>

            <div className="arena-field">
              <div className="arena-side-band enemy">
                <TrainerSprite trainer={selectedTrainer} className="small" />
                <RosterStrip state={battleState} side="enemy" />
              </div>
              <div className="arena-board-row enemy">
                {battleState.sides.enemy.activeIds.map((id, index) => (
                  <CombatantSlot
                    key={`enemy-slot-${index}-${id ?? "empty"}`}
                    combatant={id ? battleState.combatants[id] ?? null : null}
                    event={currentEvent}
                    side="enemy"
                    targeting={Boolean(targetingActorId)}
                    targetable={Boolean(id && targetableIds.has(id) && !simulation)}
                    selectedTarget={Boolean(id && selectedTargetIds.has(id))}
                    onSelectTarget={handleSelectFieldTarget}
                  />
                ))}
              </div>
              <div className="arena-centerline">
                {currentEvent ? <span className={`arena-event-banner ${classifyEvent(currentEvent)}`}>{currentEvent.text}</span> : null}
              </div>
              <div className="arena-board-row ally">
                {battleState.sides.ally.activeIds.map((id, index) => (
                  <CombatantSlot
                    key={`ally-slot-${index}-${id ?? "empty"}`}
                    combatant={id ? battleState.combatants[id] ?? null : null}
                    event={currentEvent}
                    side="ally"
                    targeting={Boolean(targetingActorId)}
                    targetable={Boolean(id && targetableIds.has(id) && !simulation)}
                    selectedTarget={Boolean(id && selectedTargetIds.has(id))}
                    onSelectTarget={handleSelectFieldTarget}
                  />
                ))}
              </div>
              <div className="arena-side-band ally">
                <RosterStrip state={battleState} side="ally" />
              </div>
            </div>

            {winner ? (
              <div className={`arena-result ${winner}`}>
                <strong>{winner === "ally" ? "Victory" : "Defeat"}</strong>
                <button type="button" onClick={resetBattle}>New Battle</button>
              </div>
            ) : null}
          </section>

          <aside className="arena-command-panel">
            <div className="arena-section-heading">
              <p className="eyebrow">Your Orders</p>
              <h3>{simulation ? "Resolving turn" : "Choose actions"}</h3>
            </div>
            <div className="arena-command-stack">
              {getActiveCombatants(battleState, "ally").map((combatant) => (
                <CommandCard
                  key={combatant.id}
                  state={battleState}
                  combatant={combatant}
                  pick={choices[combatant.id]}
                  disabled={Boolean(simulation)}
                  targeting={targetingActorId === combatant.id}
                  onMovePick={(move) => handleMovePick(combatant, move)}
                  onPick={(pick) => handlePick(combatant, pick)}
                />
              ))}
            </div>
            <button type="button" className="primary-button arena-lock-button" disabled={!canLockTurn} onClick={lockTurn}>
              Lock Turn
            </button>
            <button type="button" className="reset-button arena-reset-button" onClick={resetBattle}>
              Back to Setup
            </button>
          </aside>

          <aside className="arena-ai-panel">
            <div className="arena-section-heading">
              <p className="eyebrow">Engine AI</p>
              <h3>Independent opponent line</h3>
            </div>
            <button
              type="button"
              className="arena-reveal-button"
              disabled={!aiLinesAvailable}
              onClick={() => setShowAiLines((current) => !current)}
            >
              {showAiLines ? "Hide AI lines" : "Reveal AI lines"}
            </button>
            {showAiLines && aiLinesAvailable ? (
              <>
                <div className="arena-ai-card">
                  <strong>Last player line</strong>
                  <p>{getPlanMoveNames(displayedSimulation?.allyPlan ?? null)}</p>
                </div>
                <div className="arena-ai-card enemy">
                  <strong>Last trainer line</strong>
                  <p>{getPlanMoveNames(displayedSimulation?.enemyPlan ?? null)}</p>
                </div>
              </>
            ) : (
              <div className="arena-ai-card hidden-lines">
                <strong>AI lines hidden</strong>
                <p>{aiLinesAvailable ? "Reveal them when you want to inspect the locked turn." : "The trainer line is generated when the turn locks."}</p>
              </div>
            )}
            <div className="arena-ai-card">
              <strong>Search readout</strong>
              <p>
                {displayedSimulation?.recommendation && showAiLines
                  ? `Score ${Math.round(displayedSimulation.recommendation.rootScore)} / depth ${displayedSimulation.recommendation.depthReached}`
                  : aiLinesAvailable
                    ? "Search result locked behind reveal."
                    : "Waiting for a locked turn."}
              </p>
            </div>
            <ol className="arena-log-list">
              {visibleEvents.slice(-12).map((event, index) => (
                <li key={`arena-log-${index}-${event.text}`} className={classifyEvent(event)}>
                  <span>{visibleEvents.length - Math.min(12, visibleEvents.length) + index + 1}</span>
                  <p>{event.text}</p>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </section>
  );
}

export default BattleArenaPage;
