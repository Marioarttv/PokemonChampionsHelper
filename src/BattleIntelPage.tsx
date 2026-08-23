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
import {
  getOpponentPreset,
  getOpponentPresetKnownMoves,
} from "./lib/opponentMovePresets";
import {
  createBattleState,
  getDamagePreview,
  getEffectiveSpeed,
  type BattleCombatantState,
  type BattleMoveOption,
  type BattleSide,
  type BattleState,
  type BattleStateMemberInput,
  type BattleStatusCondition,
} from "./lib/engine";
import {
  getWeightBasedDamageMoveCategory,
  isHpBasedDamageMove,
  isWeightBasedDamageMove,
  type DamageTerrain,
  type DamageWeather,
} from "./lib/damage";
import { formatMultiplier } from "./lib/effectiveness";
import type { ChampionsStatSpread } from "./lib/championsStats";

export type BattleIntelSlotInput = {
  slotIndex: number;
  pokemon: PokemonRecord | null;
  savedAttacks?: PersistedSavedAttack[];
  knownMoves?: PersistedKnownMove[];
  presetMoveNames?: string[];
  abilityName?: string | null;
  itemName?: string | null;
  statSpread?: ChampionsStatSpread | null;
};

type BattleIntelPageProps = {
  embedded?: boolean;
  allyName?: string;
  enemyName?: string;
  allySlots?: BattleIntelSlotInput[];
  enemySlots?: BattleIntelSlotInput[];
  moveByKey?: ReadonlyMap<string, MoveRecord>;
  initialWeather?: DamageWeather;
  initialTerrain?: DamageTerrain;
};

type TeamSource =
  | {
      kind: "default";
      id: string;
      name: string;
      members: string[];
    }
  | {
      kind: "saved";
      id: string;
      name: string;
      slots: PersistedTeamSlot[];
    }
  | {
      kind: "provided";
      id: string;
      name: string;
      slots: BattleIntelSlotInput[];
    };

type MemberRuntime = {
  hpPercent: number;
  speedStage: number;
  statusCondition: BattleStatusCondition;
};

type RuntimeByKey = Record<string, MemberRuntime>;

type FieldControls = {
  allyTailwind: boolean;
  enemyTailwind: boolean;
  trickRoom: boolean;
  weather: DamageWeather;
  terrain: DamageTerrain;
};

type SelectedMove = {
  actorId: string;
  moveId: string;
};

type SelectedMovesBySide = Record<BattleSide, SelectedMove[]>;

type MoveEffectivenessSummary = {
  multiplier: number | null;
  label: string;
  tone: "extreme" | "strong" | "neutral" | "resisted" | "immune" | "status";
  targetLabel: string | null;
};

type SelectedMoveProjection = {
  key: string;
  actor: BattleCombatantState;
  move: BattleMoveOption;
  color: string;
  index: number;
};

const DEFAULT_ALLY_SOURCE_ID = "default-ally-core";
const DEFAULT_ENEMY_SOURCE_ID = "default-enemy-tailwind";
const MAX_SELECTED_MOVES_PER_SIDE = 2;
const SELECTED_MOVE_COLORS = ["#60a5fa", "#ffcf5c"] as const;
const STATUS_OPTIONS: Array<{ value: BattleStatusCondition; label: string }> = [
  { value: "none", label: "None" },
  { value: "paralysis", label: "Paralysis" },
  { value: "burn", label: "Burn" },
  { value: "poison", label: "Poison" },
  { value: "badPoison", label: "Toxic" },
  { value: "sleep", label: "Sleep" },
  { value: "freeze", label: "Freeze" },
];
const STAGE_OPTIONS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6] as const;
const WEATHER_OPTIONS: DamageWeather[] = ["none", "sun", "rain", "sand", "snow"];
const TERRAIN_OPTIONS: DamageTerrain[] = ["none", "electric", "grassy", "psychic", "misty"];
const DEFAULT_ALLY_TEAM = ["Incineroar", "Sneasler", "Sinistcha", "Garchomp", "Kingambit", "Basculegion"];
const DEFAULT_ENEMY_TEAM = ["Whimsicott", "Aerodactyl", "Dragonite", "Charizard", "Rotom-Wash", "Delphox"];
const DEFAULT_FIELD_CONTROLS: FieldControls = {
  allyTailwind: false,
  enemyTailwind: false,
  trickRoom: false,
  weather: "none",
  terrain: "none",
};
const DEFAULT_RUNTIME: MemberRuntime = {
  hpPercent: 100,
  speedStage: 0,
  statusCondition: "none",
};

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function formatOptionLabel(value: string) {
  if (value === "none") {
    return "None";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getMoveName(move: Pick<PersistedKnownMove, "label" | "name"> | Pick<PersistedSavedAttack, "label">) {
  return ("name" in move ? move.name : undefined)?.trim() || move.label.trim();
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

function getSpeciesMoveset(pokemon: PokemonRecord, speciesMovesetByKey: ReadonlyMap<string, PersistedSpeciesMoveset>) {
  return (
    speciesMovesetByKey.get(normalizeKey(pokemon.id)) ??
    speciesMovesetByKey.get(normalizeKey(pokemon.baseSpecies)) ??
    null
  );
}

function toKnownMoveFromRecord(move: MoveRecord): PersistedKnownMove {
  const category = move.category === "Status" ? "status" : (move.category.toLowerCase() as "physical" | "special");
  return {
    id: move.id,
    name: move.name,
    label: move.name,
    type: getMovePokemonType(move) ?? undefined,
    basePower:
      category === "status"
        ? undefined
        : move.basePower > 0
          ? move.basePower
          : isWeightBasedDamageMove(move.name) || isHpBasedDamageMove(move.name)
            ? 0
            : undefined,
    category,
    isSpreadMove: isSpreadTarget(move.target),
  };
}

function normalizeKnownMove(move: PersistedKnownMove, moveByKey: ReadonlyMap<string, MoveRecord>) {
  const moveName = getMoveName(move);
  const record = getMoveRecordByName(moveName, moveByKey);
  if (record) {
    return toKnownMoveFromRecord(record);
  }

  const type = move.type ?? null;
  if (!type && move.category !== "status") {
    return null;
  }

  return {
    id: move.id || `move-${normalizeKey(moveName)}`,
    name: move.name ?? moveName,
    label: move.label || moveName,
    type: type ?? undefined,
    basePower:
      move.category === "status"
        ? undefined
        : move.basePower ?? (isWeightBasedDamageMove(moveName) || isHpBasedDamageMove(moveName) ? 0 : undefined),
    category: move.category ?? getWeightBasedDamageMoveCategory(moveName) ?? (move.basePower && move.basePower > 0 ? "physical" : "status"),
    isSpreadMove: Boolean(move.isSpreadMove),
  } satisfies PersistedKnownMove;
}

function knownMoveFromSavedAttack(attack: PersistedSavedAttack, moveByKey: ReadonlyMap<string, MoveRecord>) {
  const record = getMoveRecordByName(attack.label, moveByKey);
  if (record) {
    return toKnownMoveFromRecord(record);
  }

  return {
    id: attack.id,
    name: attack.label,
    label: attack.label,
    type: attack.type,
    basePower: attack.basePower,
    category: attack.category,
    isSpreadMove: attack.isSpreadMove,
  } satisfies PersistedKnownMove;
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
    const key = normalizeKey(getMoveName(move));
    if (!key || byKey.has(key)) {
      continue;
    }
    byKey.set(key, {
      ...move,
      name: move.name ?? getMoveName(move),
      label: move.label || getMoveName(move),
    });
  }
  return [...byKey.values()];
}

function buildEmergencyMoves(pokemon: PokemonRecord, moveByKey: ReadonlyMap<string, MoveRecord>) {
  const fallbackType = getTypeFromLabel(pokemon.types[0]) ?? "normal";
  return dedupeKnownMoves([
    knownMoveFromName("Protect", moveByKey),
    knownMoveFromName("Tera Blast", moveByKey),
    {
      id: `fallback-${pokemon.id}-${fallbackType}`,
      name: `${pokemon.types[0] ?? "Normal"} STAB`,
      label: `${pokemon.types[0] ?? "Normal"} STAB`,
      type: fallbackType,
      basePower: 80,
      category: pokemon.baseStats.atk >= pokemon.baseStats.spa ? "physical" : "special",
      isSpreadMove: false,
    },
  ]);
}

function buildKnownMovesForSlot(options: {
  pokemon: PokemonRecord;
  slot?: PersistedTeamSlot | null;
  providedSlot?: BattleIntelSlotInput | null;
  speciesMoveset: PersistedSpeciesMoveset | null;
  moveByKey: ReadonlyMap<string, MoveRecord>;
}) {
  const { pokemon, slot, providedSlot, speciesMoveset, moveByKey } = options;
  const providedKnownMoves = (providedSlot?.knownMoves ?? []).map((move) => normalizeKnownMove(move, moveByKey));
  const providedSavedAttacks = (providedSlot?.savedAttacks ?? []).map((attack) => knownMoveFromSavedAttack(attack, moveByKey));
  const providedPresetNames = (providedSlot?.presetMoveNames ?? []).map((moveName) => knownMoveFromName(moveName, moveByKey));
  const slotKnownMoves = (slot?.knownMoves ?? []).map((move) => normalizeKnownMove(move, moveByKey));
  const slotSavedAttacks = (slot?.savedAttacks ?? []).map((attack) => knownMoveFromSavedAttack(attack, moveByKey));
  const speciesKnownMoves = (speciesMoveset?.knownMoves ?? []).map((move) => normalizeKnownMove(move, moveByKey));
  const speciesSavedAttacks = (speciesMoveset?.savedAttacks ?? []).map((move) => normalizeKnownMove(move, moveByKey));
  const presetKnownMoves = getOpponentPresetKnownMoves(pokemon, moveByKey).map((move) => normalizeKnownMove(move, moveByKey));
  return dedupeKnownMoves([
    ...providedKnownMoves,
    ...providedSavedAttacks,
    ...slotKnownMoves,
    ...slotSavedAttacks,
    ...speciesKnownMoves,
    ...speciesSavedAttacks,
    ...providedPresetNames,
    ...presetKnownMoves,
    ...buildEmergencyMoves(pokemon, moveByKey),
  ]).slice(0, 4);
}

function getSourceSlotCount(source: TeamSource) {
  return source.kind === "default" ? 6 : Math.max(6, source.slots.length);
}

function getRuntimeKey(side: BattleSide, sourceId: string, teamIndex: number) {
  return `${side}:${sourceId}:${teamIndex}`;
}

function getRuntime(runtimeByKey: RuntimeByKey, side: BattleSide, sourceId: string, teamIndex: number) {
  return runtimeByKey[getRuntimeKey(side, sourceId, teamIndex)] ?? DEFAULT_RUNTIME;
}

function buildMembersFromSource(options: {
  source: TeamSource | null;
  side: BattleSide;
  activeIndices: number[];
  pokemonByKey: ReadonlyMap<string, PokemonRecord>;
  moveByKey: ReadonlyMap<string, MoveRecord>;
  speciesMovesetByKey: ReadonlyMap<string, PersistedSpeciesMoveset>;
  runtimeByKey: RuntimeByKey;
}) {
  const { source, side, activeIndices, pokemonByKey, moveByKey, speciesMovesetByKey, runtimeByKey } = options;
  if (!source || moveByKey.size === 0 || (source.kind !== "provided" && pokemonByKey.size === 0)) {
    return [];
  }

  const specs =
    source.kind === "saved"
      ? source.slots.map((slot, teamIndex) => ({
          teamIndex,
          slot,
          providedSlot: null,
          species: slot.activeFormPokemonId ?? slot.pokemonId ?? slot.query,
        }))
      : source.kind === "provided"
        ? source.slots.map((providedSlot) => ({
            teamIndex: providedSlot.slotIndex,
            slot: null,
            providedSlot,
            species: providedSlot.pokemon?.id ?? null,
          }))
        : source.members.map((species, teamIndex) => ({
            teamIndex,
            slot: null,
            providedSlot: null,
            species,
          }));

  return specs.flatMap<BattleStateMemberInput>((spec) => {
    const pokemon = spec.providedSlot?.pokemon ?? getPokemonFromLookup(spec.species, pokemonByKey);
    if (!pokemon) {
      return [];
    }

    const speciesMoveset = getSpeciesMoveset(pokemon, speciesMovesetByKey);
    const preset = getOpponentPreset(pokemon);
    const knownMoves = buildKnownMovesForSlot({
      pokemon,
      slot: spec.slot,
      speciesMoveset,
      providedSlot: spec.providedSlot,
      moveByKey,
    });
    const runtime = getRuntime(runtimeByKey, side, source.id, spec.teamIndex);
    const sideLabel = side === "ally" ? "Your" : "Enemy";

    return [
      {
        id: `${side}-${spec.teamIndex}`,
        label: `${sideLabel} ${spec.teamIndex + 1}`,
        pokemon,
        statSpread: spec.providedSlot?.statSpread ?? spec.slot?.statSpread ?? speciesMoveset?.statSpread ?? null,
        teamIndex: spec.teamIndex,
        currentHpPercent: runtime.hpPercent,
        abilityName: spec.providedSlot?.abilityName?.trim() || speciesMoveset?.abilityName?.trim() || preset?.abilityName?.trim() || null,
        itemName: spec.providedSlot?.itemName?.trim() || spec.slot?.itemName?.trim() || speciesMoveset?.itemName?.trim() || preset?.itemName?.trim() || null,
        savedAttacks: spec.providedSlot?.savedAttacks ?? spec.slot?.savedAttacks ?? [],
        knownMoves,
        moveNames: knownMoves.map(getMoveName),
        inferredMoveNames: [],
        candidateMoves: [],
        knowledge: "known",
        stages: { speed: runtime.speedStage },
        statusCondition: runtime.statusCondition,
        isActive: activeIndices.includes(spec.teamIndex),
      },
    ];
  });
}

function ensureActivePair(current: number[], available: number[]) {
  const availableSet = new Set(available);
  const next = current.filter((slotIndex) => availableSet.has(slotIndex)).slice(0, 2);
  for (const slotIndex of available) {
    if (next.length >= Math.min(2, available.length)) {
      break;
    }
    if (!next.includes(slotIndex)) {
      next.push(slotIndex);
    }
  }
  if (next.length === current.length && next.every((slotIndex, index) => slotIndex === current[index])) {
    return current;
  }
  return next;
}

function selectActiveIndex(current: number[], clickedIndex: number, available: number[]) {
  if (!available.includes(clickedIndex)) {
    return current;
  }
  if (current.includes(clickedIndex)) {
    return current;
  }
  if (current.length < 2) {
    return [...current, clickedIndex];
  }
  return [current[1]!, clickedIndex];
}

function getActiveCombatants(state: BattleState | null, side: BattleSide) {
  if (!state) {
    return [];
  }
  return state.sides[side].activeIds
    .map((combatantId) => (combatantId ? state.combatants[combatantId] ?? null : null))
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

function getMoveById(combatant: BattleCombatantState, moveId: string) {
  return combatant.knownMoves.find((move) => move.id === moveId) ?? null;
}

function getMoveColor(move: BattleMoveOption) {
  return move.type ? TYPE_META[move.type].color : "#a0aacb";
}

function getHpPercent(combatant: BattleCombatantState) {
  return combatant.maxHp > 0 ? Math.max(0, Math.min(100, (combatant.currentHp / combatant.maxHp) * 100)) : 0;
}

function getHpTone(percent: number) {
  if (percent <= 25) {
    return "danger";
  }
  if (percent <= 50) {
    return "warn";
  }
  return "healthy";
}

function getOpposingSide(side: BattleSide): BattleSide {
  return side === "ally" ? "enemy" : "ally";
}

function getTargetCombatantsForMove(state: BattleState, actor: BattleCombatantState, move: BattleMoveOption) {
  if (
    move.targetKind === "singleOpponent" ||
    move.targetKind === "allOpponents" ||
    move.targetKind === "allAdjacent"
  ) {
    return getActiveCombatants(state, getOpposingSide(actor.side));
  }
  return [];
}

function getMoveEffectivenessSummary(
  state: BattleState,
  actor: BattleCombatantState,
  move: BattleMoveOption,
): MoveEffectivenessSummary {
  if (!move.category || !move.type || move.basePower === null) {
    return {
      multiplier: null,
      label: "Status / support",
      tone: "status",
      targetLabel: null,
    };
  }

  let bestMultiplier = -1;
  let bestTarget: BattleCombatantState | null = null;
  for (const target of getTargetCombatantsForMove(state, actor, move)) {
    const preview = getDamagePreview(state, actor.id, target.id, move);
    if (!preview) {
      continue;
    }
    if (preview.estimate.typeMultiplier > bestMultiplier) {
      bestMultiplier = preview.estimate.typeMultiplier;
      bestTarget = target;
    }
  }

  if (bestMultiplier < 0) {
    return {
      multiplier: null,
      label: "No direct target",
      tone: "status",
      targetLabel: null,
    };
  }

  const multiplierLabel = formatMultiplier(bestMultiplier);
  if (bestMultiplier === 0) {
    return {
      multiplier: bestMultiplier,
      label: `No effect ${multiplierLabel}`,
      tone: "immune",
      targetLabel: bestTarget?.pokemon.name ?? null,
    };
  }
  if (bestMultiplier >= 4) {
    return {
      multiplier: bestMultiplier,
      label: `Extreme ${multiplierLabel}`,
      tone: "extreme",
      targetLabel: bestTarget?.pokemon.name ?? null,
    };
  }
  if (bestMultiplier > 1) {
    return {
      multiplier: bestMultiplier,
      label: `Super effective ${multiplierLabel}`,
      tone: "strong",
      targetLabel: bestTarget?.pokemon.name ?? null,
    };
  }
  if (bestMultiplier < 1) {
    return {
      multiplier: bestMultiplier,
      label: `Not very effective ${multiplierLabel}`,
      tone: "resisted",
      targetLabel: bestTarget?.pokemon.name ?? null,
    };
  }
  return {
    multiplier: bestMultiplier,
    label: `Neutral ${multiplierLabel}`,
    tone: "neutral",
    targetLabel: bestTarget?.pokemon.name ?? null,
  };
}

function getActorPressureSummary(state: BattleState, actor: BattleCombatantState) {
  const multipliers = actor.knownMoves
    .map((move) => getMoveEffectivenessSummary(state, actor, move).multiplier)
    .filter((multiplier): multiplier is number => multiplier !== null);

  if (multipliers.length === 0) {
    return "Support moves only";
  }
  if (multipliers.some((multiplier) => multiplier >= 4)) {
    return "4x pressure available";
  }
  if (multipliers.some((multiplier) => multiplier > 1)) {
    return "Super effective pressure";
  }
  if (multipliers.every((multiplier) => multiplier > 0 && multiplier < 1)) {
    return "Only resisted damage";
  }
  if (multipliers.every((multiplier) => multiplier === 0)) {
    return "No direct damage lands";
  }
  return "Neutral pressure";
}

function getSelectedMoveKey(move: SelectedMove) {
  return `${move.actorId}:${move.moveId}`;
}

function getSelectedMoveProjections(state: BattleState | null, moves: SelectedMove[]) {
  if (!state) {
    return [];
  }
  return moves.flatMap<SelectedMoveProjection>((selection, index) => {
    const actor = state.combatants[selection.actorId];
    const move = actor ? getMoveById(actor, selection.moveId) : null;
    if (!actor || !move || !state.sides[actor.side].activeIds.includes(actor.id)) {
      return [];
    }
    return [
      {
        key: `${selection.actorId}:${selection.moveId}`,
        actor,
        move,
        color: SELECTED_MOVE_COLORS[index % SELECTED_MOVE_COLORS.length],
        index,
      },
    ];
  });
}

function getSpeedAbilityNote(state: BattleState, combatant: BattleCombatantState) {
  const abilityKey = normalizeKey(combatant.abilityName ?? combatant.abilityId);
  if ((abilityKey === "swiftswim" && state.field.weather === "rain") ||
    (abilityKey === "chlorophyll" && state.field.weather === "sun") ||
    (abilityKey === "sandrush" && state.field.weather === "sand") ||
    (abilityKey === "slushrush" && state.field.weather === "snow")) {
    return combatant.abilityName ?? "Weather ability";
  }
  if (abilityKey === "surgesurfer" && state.field.terrain === "electric") {
    return combatant.abilityName ?? "Surge Surfer";
  }
  if (abilityKey === "quickfeet" && combatant.statusCondition !== "none") {
    return combatant.abilityName ?? "Quick Feet";
  }
  return null;
}

function getSpeedNotes(state: BattleState, combatant: BattleCombatantState) {
  const notes: string[] = [];
  if (state.sides[combatant.side].tailwindTurns > 0) {
    notes.push("Tailwind");
  }
  if (combatant.stages.speed !== 0) {
    notes.push(`Spe ${combatant.stages.speed > 0 ? "+" : ""}${combatant.stages.speed}`);
  }
  if (combatant.itemId === "choicescarf") {
    notes.push("Choice Scarf");
  }
  if (combatant.itemId === "ironball") {
    notes.push("Iron Ball");
  }
  if (combatant.statusCondition === "paralysis") {
    notes.push("Paralysis");
  }
  const abilityNote = getSpeedAbilityNote(state, combatant);
  if (abilityNote) {
    notes.push(abilityNote);
  }
  return notes;
}

function PokemonSprite({ pokemon, className = "" }: { pokemon: PokemonRecord; className?: string }) {
  const [src, setSrc] = useState(() => getPokemonSpriteUrl(pokemon.id));

  useEffect(() => {
    setSrc(getPokemonSpriteUrl(pokemon.id));
  }, [pokemon.id]);

  return (
    <img
      className={className}
      src={src}
      alt={pokemon.name}
      onError={() => setSrc(getPokemonBaseSpriteUrl(pokemon.baseSpecies))}
    />
  );
}

function BattleIntelRoster({
  state,
  source,
  side,
  activeIndices,
  onSelectActive,
}: {
  state: BattleState | null;
  source: TeamSource | null;
  side: BattleSide;
  activeIndices: number[];
  onSelectActive: (slotIndex: number) => void;
}) {
  const combatants = getAllCombatants(state, side);
  const combatantByIndex = new Map(combatants.map((combatant) => [combatant.teamIndex, combatant]));
  const slotCount = source ? getSourceSlotCount(source) : 6;

  return (
    <div className={`battle-intel-roster ${side}`}>
      {Array.from({ length: slotCount }, (_, slotIndex) => {
        const combatant = combatantByIndex.get(slotIndex) ?? null;
        const active = activeIndices.includes(slotIndex);
        if (!combatant) {
          return (
            <div key={`empty-${side}-${slotIndex}`} className="battle-intel-roster-token empty">
              <span>{slotIndex + 1}</span>
            </div>
          );
        }

        return (
          <button
            key={combatant.id}
            type="button"
            className={`battle-intel-roster-token ${active ? "active" : ""}`}
            onClick={() => onSelectActive(slotIndex)}
            aria-pressed={active}
          >
            <PokemonSprite pokemon={combatant.pokemon} />
            <span>{combatant.pokemon.name}</span>
            <em>{active ? "Active" : `Slot ${slotIndex + 1}`}</em>
          </button>
        );
      })}
    </div>
  );
}

function BattleIntelActiveCard({
  combatant,
  sourceId,
  onUpdateRuntime,
}: {
  combatant: BattleCombatantState | null;
  sourceId: string;
  onUpdateRuntime: (side: BattleSide, sourceId: string, teamIndex: number, patch: Partial<MemberRuntime>) => void;
}) {
  if (!combatant) {
    return <div className="battle-intel-active-card empty">Empty</div>;
  }

  const hpPercent = Math.round(getHpPercent(combatant));
  const hpTone = getHpTone(hpPercent);

  return (
    <article className={`battle-intel-active-card ${combatant.side}`}>
      <div className="battle-intel-active-main">
        <PokemonSprite pokemon={combatant.pokemon} className="battle-intel-active-sprite" />
        <div>
          <span className="battle-intel-slot-label">{combatant.label}</span>
          <h3>{combatant.pokemon.name}</h3>
          <div className="battle-intel-type-row">
            {combatant.pokemon.types.map((typeLabel) => (
              <span key={`${combatant.id}-${typeLabel}`}>{typeLabel}</span>
            ))}
          </div>
          <div className="battle-intel-item-row">
            {combatant.abilityName ? <span>{combatant.abilityName}</span> : null}
            {combatant.itemName ? <span>{combatant.itemName}</span> : null}
          </div>
        </div>
      </div>
      <div className="battle-intel-hp-row">
        <div className="battle-intel-hp-bar" aria-label={`${combatant.pokemon.name} HP ${hpPercent}%`}>
          <span className={hpTone} style={{ width: `${hpPercent}%` }} />
        </div>
        <strong>{hpPercent}%</strong>
      </div>
      <div className="battle-intel-runtime-controls">
        <label>
          <span>HP</span>
          <input
            type="range"
            min="1"
            max="100"
            value={hpPercent}
            onChange={(event) =>
              onUpdateRuntime(combatant.side, sourceId, combatant.teamIndex, {
                hpPercent: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          <span>Spe</span>
          <select
            value={combatant.stages.speed}
            onChange={(event) =>
              onUpdateRuntime(combatant.side, sourceId, combatant.teamIndex, {
                speedStage: Number(event.target.value),
              })
            }
          >
            {STAGE_OPTIONS.map((stage) => (
              <option key={stage} value={stage}>
                {stage > 0 ? `+${stage}` : stage}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={combatant.statusCondition}
            onChange={(event) =>
              onUpdateRuntime(combatant.side, sourceId, combatant.teamIndex, {
                statusCondition: event.target.value as BattleStatusCondition,
              })
            }
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}

function BattleIntelCompactActiveControls({
  state,
  allySourceId,
  enemySourceId,
  onUpdateRuntime,
}: {
  state: BattleState | null;
  allySourceId: string;
  enemySourceId: string;
  onUpdateRuntime: (side: BattleSide, sourceId: string, teamIndex: number, patch: Partial<MemberRuntime>) => void;
}) {
  const active = state ? [...getActiveCombatants(state, "ally"), ...getActiveCombatants(state, "enemy")] : [];

  return (
    <aside className="battle-intel-compact-active">
      <div className="battle-intel-panel-heading">
        <p className="eyebrow">Active State</p>
        <h3>HP, speed, status</h3>
      </div>
      <div className="battle-intel-compact-active-list">
        {active.length > 0 ? (
          active.map((combatant) => {
            const hpPercent = Math.round(getHpPercent(combatant));
            const sourceId = combatant.side === "ally" ? allySourceId : enemySourceId;

            return (
              <article key={`compact-active-${combatant.id}`} className={`battle-intel-compact-active-card ${combatant.side}`}>
                <div className="battle-intel-compact-active-head">
                  <PokemonSprite pokemon={combatant.pokemon} />
                  <div>
                    <strong>{combatant.pokemon.name}</strong>
                    <small>
                      {combatant.side === "ally" ? "Our" : "Enemy"} Slot {combatant.teamIndex + 1}
                    </small>
                  </div>
                </div>
                <div className="battle-intel-compact-runtime">
                  <label>
                    <span>HP%</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={hpPercent}
                      onChange={(event) =>
                        onUpdateRuntime(combatant.side, sourceId, combatant.teamIndex, {
                          hpPercent: Math.min(100, Math.max(1, Number(event.target.value) || 1)),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Spe</span>
                    <select
                      value={combatant.stages.speed}
                      onChange={(event) =>
                        onUpdateRuntime(combatant.side, sourceId, combatant.teamIndex, {
                          speedStage: Number(event.target.value),
                        })
                      }
                    >
                      {STAGE_OPTIONS.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage > 0 ? `+${stage}` : stage}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Status</span>
                    <select
                      value={combatant.statusCondition}
                      onChange={(event) =>
                        onUpdateRuntime(combatant.side, sourceId, combatant.teamIndex, {
                          statusCondition: event.target.value as BattleStatusCondition,
                        })
                      }
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </article>
            );
          })
        ) : (
          <p className="battle-intel-empty-note">Select active Pokemon on both sides.</p>
        )}
      </div>
    </aside>
  );
}

function BattleIntelTurnOrder({ state }: { state: BattleState | null }) {
  const ordered = useMemo(() => {
    if (!state) {
      return [];
    }
    const active = [...getActiveCombatants(state, "ally"), ...getActiveCombatants(state, "enemy")];
    return active
      .map((combatant) => ({
        combatant,
        speed: getEffectiveSpeed(state, combatant.id),
        notes: getSpeedNotes(state, combatant),
      }))
      .sort((left, right) => {
        if (state.field.trickRoomTurns > 0) {
          return left.speed - right.speed || left.combatant.id.localeCompare(right.combatant.id);
        }
        return right.speed - left.speed || left.combatant.id.localeCompare(right.combatant.id);
      });
  }, [state]);

  return (
    <aside className="battle-intel-turn-order">
      <div className="battle-intel-panel-heading">
        <p className="eyebrow">Turn Order</p>
        <h3>{state?.field.trickRoomTurns ? "Slowest first" : "Fastest first"}</h3>
      </div>
      <ol>
        {ordered.map((entry, index) => (
          <li key={entry.combatant.id} className={entry.combatant.side}>
            <span className="battle-intel-turn-rank">{index + 1}</span>
            <PokemonSprite pokemon={entry.combatant.pokemon} />
            <div>
              <strong>{entry.combatant.pokemon.name}</strong>
              <small>
                Speed {entry.speed}
                {entry.notes.length > 0 ? ` · ${entry.notes.join(" · ")}` : ""}
              </small>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function BattleIntelFieldControls({
  value,
  onChange,
}: {
  value: FieldControls;
  onChange: (patch: Partial<FieldControls>) => void;
}) {
  return (
    <div className="battle-intel-field-controls">
      <label className={value.allyTailwind ? "on" : ""}>
        <input
          type="checkbox"
          checked={value.allyTailwind}
          onChange={(event) => onChange({ allyTailwind: event.target.checked })}
        />
        <span>Our Tailwind</span>
      </label>
      <label className={value.enemyTailwind ? "on" : ""}>
        <input
          type="checkbox"
          checked={value.enemyTailwind}
          onChange={(event) => onChange({ enemyTailwind: event.target.checked })}
        />
        <span>Enemy Tailwind</span>
      </label>
      <label className={value.trickRoom ? "on" : ""}>
        <input
          type="checkbox"
          checked={value.trickRoom}
          onChange={(event) => onChange({ trickRoom: event.target.checked })}
        />
        <span>Trick Room</span>
      </label>
      <label>
        <span>Weather</span>
        <select value={value.weather} onChange={(event) => onChange({ weather: event.target.value as DamageWeather })}>
          {WEATHER_OPTIONS.map((weather) => (
            <option key={weather} value={weather}>
              {formatOptionLabel(weather)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Terrain</span>
        <select value={value.terrain} onChange={(event) => onChange({ terrain: event.target.value as DamageTerrain })}>
          {TERRAIN_OPTIONS.map((terrain) => (
            <option key={terrain} value={terrain}>
              {formatOptionLabel(terrain)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function BattleIntelMoveCard({
  state,
  actor,
  move,
  selected,
  onToggle,
}: {
  state: BattleState;
  actor: BattleCombatantState;
  move: BattleMoveOption;
  selected: boolean;
  onToggle: (actorId: string, moveId: string) => void;
}) {
  const summary = getMoveEffectivenessSummary(state, actor, move);
  const moveColor = getMoveColor(move);

  return (
    <button
      type="button"
      className={`battle-intel-move-card ${selected ? "selected" : ""} ${summary.tone}`}
      onClick={() => onToggle(actor.id, move.id)}
      style={{ "--move-color": moveColor } as CSSProperties}
      title={move.shortDesc || move.name}
    >
      <span className="battle-intel-move-title">
        <strong>{move.name}</strong>
        <em>{move.type ? TYPE_META[move.type].label : "Status"}</em>
      </span>
      <span className="battle-intel-move-meta">
        {move.category ? `${move.basePower ?? "--"} BP` : "Status"}
        {move.isSpreadMove ? " · Spread" : ""}
      </span>
      <span className={`battle-intel-effectiveness ${summary.tone}`}>
        {summary.label}
        {summary.targetLabel ? <small>{summary.targetLabel}</small> : null}
      </span>
    </button>
  );
}

function BattleIntelMovesetPanel({
  state,
  side,
  selectedMoves,
  onToggleMove,
}: {
  state: BattleState | null;
  side: BattleSide;
  selectedMoves: SelectedMove[];
  onToggleMove: (actorId: string, moveId: string) => void;
}) {
  if (!state) {
    return null;
  }

  const active = getActiveCombatants(state, side);
  const selectedKeys = new Set(selectedMoves.map(getSelectedMoveKey));

  return (
    <section className={`battle-intel-moveset-panel ${side}`}>
      <div className="battle-intel-panel-heading">
        <p className="eyebrow">{side === "ally" ? "Our Moves" : "Opponent Moves"}</p>
        <h3>{side === "ally" ? "Pressure into enemy actives" : "Pressure into our actives"}</h3>
      </div>
      <div className="battle-intel-actor-move-stack">
        {active.map((actor) => (
          <article key={actor.id} className="battle-intel-actor-moves">
            <div className="battle-intel-actor-head">
              <PokemonSprite pokemon={actor.pokemon} />
              <div>
                <strong>{actor.pokemon.name}</strong>
                <small>{getActorPressureSummary(state, actor)}</small>
              </div>
            </div>
            <div className="battle-intel-move-grid">
              {actor.knownMoves.map((move) => (
                <BattleIntelMoveCard
                  key={move.id}
                  state={state}
                  actor={actor}
                  move={move}
                  selected={selectedKeys.has(`${actor.id}:${move.id}`)}
                  onToggle={onToggleMove}
                />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function BattleIntelDamageProjection({
  state,
  targetSide,
  selectedMoves,
  title,
}: {
  state: BattleState | null;
  targetSide: BattleSide;
  selectedMoves: SelectedMove[];
  title: string;
}) {
  const projections = getSelectedMoveProjections(state, selectedMoves);
  const targets = state ? getActiveCombatants(state, targetSide) : [];

  return (
    <section className={`battle-intel-damage-panel ${targetSide}`}>
      <div className="battle-intel-panel-heading">
        <p className="eyebrow">Damage Stack</p>
        <h3>{title}</h3>
      </div>
      {projections.length > 0 ? (
        <div className="battle-intel-selected-move-legend">
          {projections.map((projection) => (
            <span key={projection.key} style={{ "--stack-color": projection.color } as CSSProperties}>
              {projection.actor.pokemon.name}: {projection.move.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="battle-intel-empty-note">No moves selected.</p>
      )}
      <div className="battle-intel-target-stack">
        {targets.map((target) => {
          const hpPercent = getHpPercent(target);
          let consumedPercent = 0;
          let averageDamage = 0;
          let maxDamage = 0;
          const rows = projections.map((projection) => {
            const preview = state ? getDamagePreview(state, projection.actor.id, target.id, projection.move) : null;
            const damagePercent = preview?.estimate.averagePercent ?? 0;
            const visibleWidth = Math.max(0, Math.min(damagePercent, hpPercent - consumedPercent));
            const left = Math.max(0, hpPercent - consumedPercent - visibleWidth);
            consumedPercent += damagePercent;
            averageDamage += preview?.estimate.averageDamage ?? 0;
            maxDamage += preview?.estimate.maxDamage ?? 0;
            return {
              projection,
              preview,
              left,
              visibleWidth,
            };
          });
          const koTone = averageDamage >= target.currentHp ? "average" : maxDamage >= target.currentHp ? "roll" : "survives";
          const remainingPercent = Math.max(0, hpPercent - consumedPercent);

          return (
            <article key={target.id} className={`battle-intel-target-card ${koTone}`}>
              <div className="battle-intel-target-head">
                <PokemonSprite pokemon={target.pokemon} />
                <div>
                  <strong>{target.pokemon.name}</strong>
                  <small>
                    {Math.round(remainingPercent)}% after avg
                    {koTone === "average" ? " · avg KO" : koTone === "roll" ? " · roll KO" : ""}
                  </small>
                </div>
              </div>
              <div className="battle-intel-stack-bar" aria-label={`${target.pokemon.name} projected HP`}>
                <span className={`battle-intel-stack-hp ${getHpTone(hpPercent)}`} style={{ width: `${hpPercent}%` }} />
                {rows.map((row) => (
                  <span
                    key={`${target.id}-${row.projection.key}`}
                    className="battle-intel-stack-segment"
                    style={{
                      "--stack-color": row.projection.color,
                      left: `${row.left}%`,
                      width: `${row.visibleWidth}%`,
                    } as CSSProperties}
                  />
                ))}
              </div>
              <ul className="battle-intel-damage-lines">
                {rows.map((row) => (
                  <li key={`${target.id}-line-${row.projection.key}`}>
                    <span style={{ "--stack-color": row.projection.color } as CSSProperties} />
                    <p>
                      <strong>{row.projection.move.name}</strong>
                      {row.preview ? (
                        <>
                          {` ${Math.round(row.preview.estimate.minPercent)}-${Math.round(row.preview.estimate.maxPercent)}%`}
                          <small>
                            avg {Math.round(row.preview.estimate.averagePercent)}% · type{" "}
                            {formatMultiplier(row.preview.estimate.typeMultiplier)}
                            {row.projection.move.isSpreadMove ? " · spread" : ""}
                          </small>
                        </>
                      ) : (
                        <small>No direct damage</small>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BattleIntelPage({
  embedded = false,
  allyName = "Current team",
  enemyName = "Enemy board",
  allySlots,
  enemySlots,
  moveByKey: providedMoveByKey,
  initialWeather = "none",
  initialTerrain = "none",
}: BattleIntelPageProps) {
  const [pokemonDb, setPokemonDb] = useState<PokemonRecord[]>([]);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [savedTeams, setSavedTeams] = useState<PersistedTeam[]>([]);
  const [speciesMovesets, setSpeciesMovesets] = useState<PersistedSpeciesMoveset[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allySourceId, setAllySourceId] = useState(DEFAULT_ALLY_SOURCE_ID);
  const [enemySourceId, setEnemySourceId] = useState(DEFAULT_ENEMY_SOURCE_ID);
  const [allyActiveIndices, setAllyActiveIndices] = useState<number[]>([0, 1]);
  const [enemyActiveIndices, setEnemyActiveIndices] = useState<number[]>([0, 1]);
  const [runtimeByKey, setRuntimeByKey] = useState<RuntimeByKey>({});
  const [fieldControls, setFieldControls] = useState<FieldControls>(() => ({
    ...DEFAULT_FIELD_CONTROLS,
    weather: initialWeather,
    terrain: initialTerrain,
  }));
  const [selectedMoves, setSelectedMoves] = useState<SelectedMovesBySide>({ ally: [], enemy: [] });

  useEffect(() => {
    if (embedded && providedMoveByKey) {
      return;
    }

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
          setLoadError(error instanceof Error ? error.message : "Failed to load battle intel data.");
        }
      });

    return () => {
      active = false;
    };
  }, [embedded, providedMoveByKey]);

  const pokemonByKey = useMemo(() => {
    const map = new Map<string, PokemonRecord>();
    for (const pokemon of pokemonDb) {
      map.set(pokemon.id.toLowerCase(), pokemon);
      map.set(pokemon.name.toLowerCase(), pokemon);
      map.set(normalizeKey(pokemon.name), pokemon);
      if (!pokemon.forme || !map.has(normalizeKey(pokemon.baseSpecies))) {
        map.set(normalizeKey(pokemon.baseSpecies), pokemon);
      }
    }
    return map;
  }, [pokemonDb]);

  const loadedMoveByKey = useMemo(() => {
    const map = new Map<string, MoveRecord>();
    for (const move of moves) {
      map.set(move.id, move);
      map.set(move.name.toLowerCase(), move);
      map.set(normalizeKey(move.name), move);
    }
    return map;
  }, [moves]);
  const moveByKey = providedMoveByKey ?? loadedMoveByKey;

  const speciesMovesetByKey = useMemo(() => {
    const map = new Map<string, PersistedSpeciesMoveset>();
    for (const moveset of speciesMovesets) {
      map.set(normalizeKey(moveset.speciesKey), moveset);
    }
    return map;
  }, [speciesMovesets]);

  const allySources = useMemo<TeamSource[]>(() => {
    if (embedded && allySlots) {
      return [{ kind: "provided", id: "team-builder-ally", name: allyName, slots: allySlots }];
    }

    return [
      { kind: "default", id: DEFAULT_ALLY_SOURCE_ID, name: "Default: Champions Core", members: DEFAULT_ALLY_TEAM },
      ...savedTeams.map((team) => ({
        kind: "saved" as const,
        id: `saved:${team.id}`,
        name: team.name,
        slots: team.slots,
      })),
    ];
  }, [allyName, allySlots, embedded, savedTeams]);

  const enemySources = useMemo<TeamSource[]>(() => {
    if (embedded && enemySlots) {
      return [{ kind: "provided", id: "team-builder-enemy", name: enemyName, slots: enemySlots }];
    }

    return [
      { kind: "default", id: DEFAULT_ENEMY_SOURCE_ID, name: "Default: Tailwind Offense", members: DEFAULT_ENEMY_TEAM },
      ...savedTeams.map((team) => ({
        kind: "saved" as const,
        id: `saved:${team.id}`,
        name: team.name,
        slots: team.slots,
      })),
    ];
  }, [embedded, enemyName, enemySlots, savedTeams]);

  const allySource = allySources.find((source) => source.id === allySourceId) ?? allySources[0] ?? null;
  const enemySource = enemySources.find((source) => source.id === enemySourceId) ?? enemySources[0] ?? null;

  useEffect(() => {
    if (allySources.length > 0 && !allySources.some((source) => source.id === allySourceId)) {
      setAllySourceId(allySources[0]?.id ?? DEFAULT_ALLY_SOURCE_ID);
    }
  }, [allySourceId, allySources]);

  useEffect(() => {
    if (enemySources.length > 0 && !enemySources.some((source) => source.id === enemySourceId)) {
      setEnemySourceId(enemySources[0]?.id ?? DEFAULT_ENEMY_SOURCE_ID);
    }
  }, [enemySourceId, enemySources]);

  const baseAllyMembers = useMemo(
    () =>
      buildMembersFromSource({
        source: allySource,
        side: "ally",
        activeIndices: allyActiveIndices,
        pokemonByKey,
        moveByKey,
        speciesMovesetByKey,
        runtimeByKey,
      }),
    [allyActiveIndices, allySource, moveByKey, pokemonByKey, runtimeByKey, speciesMovesetByKey],
  );

  const baseEnemyMembers = useMemo(
    () =>
      buildMembersFromSource({
        source: enemySource,
        side: "enemy",
        activeIndices: enemyActiveIndices,
        pokemonByKey,
        moveByKey,
        speciesMovesetByKey,
        runtimeByKey,
      }),
    [enemyActiveIndices, enemySource, moveByKey, pokemonByKey, runtimeByKey, speciesMovesetByKey],
  );

  const allyAvailableIndices = useMemo(() => baseAllyMembers.map((member) => member.teamIndex), [baseAllyMembers]);
  const enemyAvailableIndices = useMemo(() => baseEnemyMembers.map((member) => member.teamIndex), [baseEnemyMembers]);
  const allyAvailableKey = allyAvailableIndices.join("|");
  const enemyAvailableKey = enemyAvailableIndices.join("|");

  useEffect(() => {
    setAllyActiveIndices((current) => ensureActivePair(current, allyAvailableIndices));
  }, [allyAvailableKey, allyAvailableIndices]);

  useEffect(() => {
    setEnemyActiveIndices((current) => ensureActivePair(current, enemyAvailableIndices));
  }, [enemyAvailableKey, enemyAvailableIndices]);

  const battleState = useMemo(() => {
    if (baseAllyMembers.length === 0 || baseEnemyMembers.length === 0 || moveByKey.size === 0) {
      return null;
    }
    return createBattleState({
      ally: baseAllyMembers,
      enemy: baseEnemyMembers,
      moveByKey,
      universalProtect: false,
      applyInitialEntryEffects: false,
      allySide: { tailwindTurns: fieldControls.allyTailwind ? 4 : 0 },
      enemySide: { tailwindTurns: fieldControls.enemyTailwind ? 4 : 0 },
      fieldState: {
        weather: fieldControls.weather,
        terrain: fieldControls.terrain,
        trickRoomTurns: fieldControls.trickRoom ? 5 : 0,
        turn: 1,
      },
    });
  }, [baseAllyMembers, baseEnemyMembers, fieldControls, moveByKey]);

  const updateRuntime = (
    side: BattleSide,
    sourceId: string,
    teamIndex: number,
    patch: Partial<MemberRuntime>,
  ) => {
    const key = getRuntimeKey(side, sourceId, teamIndex);
    setRuntimeByKey((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? DEFAULT_RUNTIME),
        ...patch,
      },
    }));
  };

  const updateFieldControls = (patch: Partial<FieldControls>) => {
    setFieldControls((current) => ({ ...current, ...patch }));
  };

  const selectAllyActive = (slotIndex: number) => {
    setAllyActiveIndices((current) => selectActiveIndex(current, slotIndex, allyAvailableIndices));
  };

  const selectEnemyActive = (slotIndex: number) => {
    setEnemyActiveIndices((current) => selectActiveIndex(current, slotIndex, enemyAvailableIndices));
  };

  const toggleSelectedMove = (actorId: string, moveId: string) => {
    if (!battleState) {
      return;
    }
    const actor = battleState.combatants[actorId];
    if (!actor) {
      return;
    }

    setSelectedMoves((current) => {
      const sideMoves = current[actor.side];
      const key = `${actorId}:${moveId}`;
      if (sideMoves.some((move) => getSelectedMoveKey(move) === key)) {
        return {
          ...current,
          [actor.side]: sideMoves.filter((move) => getSelectedMoveKey(move) !== key),
        };
      }
      return {
        ...current,
        [actor.side]: [...sideMoves, { actorId, moveId }].slice(-MAX_SELECTED_MOVES_PER_SIDE),
      };
    });
  };

  if (loadError) {
    return (
      <section className="board-panel battle-intel-page">
        <p className="battle-intel-empty-note">{loadError}</p>
      </section>
    );
  }

  const movesetSection = (
    <section className="battle-intel-bottom board-panel">
      <div className="battle-intel-panel-heading">
        <p className="eyebrow">Movesets</p>
        <h3>Type pressure and stacked damage</h3>
      </div>
      <div className="battle-intel-bottom-grid">
        <div className="battle-intel-side-analysis">
          <BattleIntelMovesetPanel
            state={battleState}
            side="ally"
            selectedMoves={selectedMoves.ally}
            onToggleMove={toggleSelectedMove}
          />
          <BattleIntelDamageProjection
            state={battleState}
            targetSide="enemy"
            selectedMoves={selectedMoves.ally}
            title="Into opponent"
          />
        </div>
        <div className="battle-intel-side-analysis">
          <BattleIntelMovesetPanel
            state={battleState}
            side="enemy"
            selectedMoves={selectedMoves.enemy}
            onToggleMove={toggleSelectedMove}
          />
          <BattleIntelDamageProjection
            state={battleState}
            targetSide="ally"
            selectedMoves={selectedMoves.enemy}
            title="Into us"
          />
        </div>
      </div>
    </section>
  );

  if (embedded) {
    return (
      <section className="battle-intel-page embedded">
        <section className="battle-intel-compact-shell board-panel">
          <div className="battle-intel-compact-head">
            <div>
              <p className="eyebrow">Battle Intel</p>
              <h2>Current-board pressure</h2>
            </div>
            <div className="battle-intel-context-summary">
              <span>{allySource?.name ?? allyName}</span>
              <span>{enemySource?.name ?? enemyName}</span>
            </div>
          </div>

          <BattleIntelFieldControls value={fieldControls} onChange={updateFieldControls} />

          <div className="battle-intel-compact-grid">
            <div className="battle-intel-compact-side ally">
              <div className="battle-intel-panel-heading">
                <p className="eyebrow">Our Six</p>
                <h3>Click two active</h3>
              </div>
              <BattleIntelRoster
                state={battleState}
                source={allySource}
                side="ally"
                activeIndices={allyActiveIndices}
                onSelectActive={selectAllyActive}
              />
            </div>

            <div className="battle-intel-compact-side enemy">
              <div className="battle-intel-panel-heading">
                <p className="eyebrow">Enemy Six</p>
                <h3>Click two active</h3>
              </div>
              <BattleIntelRoster
                state={battleState}
                source={enemySource}
                side="enemy"
                activeIndices={enemyActiveIndices}
                onSelectActive={selectEnemyActive}
              />
            </div>

            <div className="battle-intel-compact-sidecar">
              <BattleIntelTurnOrder state={battleState} />
            </div>
          </div>

          <BattleIntelCompactActiveControls
            state={battleState}
            allySourceId={allySource?.id ?? allySourceId}
            enemySourceId={enemySource?.id ?? enemySourceId}
            onUpdateRuntime={updateRuntime}
          />
        </section>

        {movesetSection}
      </section>
    );
  }

  return (
    <section className={`battle-intel-page ${embedded ? "embedded" : ""}`}>
      <div className="battle-intel-hero board-panel">
        <div>
          <p className="eyebrow">Battle Intel</p>
          <h2>Current-board pressure without prediction</h2>
          <p className="selector-note">
            Select active Pokemon, speed conditions, and moves to inspect immediate turn possibilities.
          </p>
        </div>
        {embedded ? (
          <div className="battle-intel-context-summary">
            <span>{allySource?.name ?? allyName}</span>
            <span>{enemySource?.name ?? enemyName}</span>
          </div>
        ) : (
          <div className="battle-intel-team-selectors">
            <label>
              <span>Our team</span>
              <select
                value={allySource?.id ?? allySourceId}
                onChange={(event) => {
                  setAllySourceId(event.target.value);
                  setAllyActiveIndices([0, 1]);
                  setSelectedMoves((current) => ({ ...current, ally: [] }));
                }}
              >
                {allySources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Opponent</span>
              <select
                value={enemySource?.id ?? enemySourceId}
                onChange={(event) => {
                  setEnemySourceId(event.target.value);
                  setEnemyActiveIndices([0, 1]);
                  setSelectedMoves((current) => ({ ...current, enemy: [] }));
                }}
              >
                {enemySources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <section className="battle-intel-canvas board-panel">
        <div className="battle-intel-canvas-top">
          <div className="battle-intel-panel-heading">
            <p className="eyebrow">Battle Canvas</p>
            <h3>{allySource?.name ?? "Our team"} vs {enemySource?.name ?? "Opponent"}</h3>
          </div>
          <BattleIntelFieldControls value={fieldControls} onChange={updateFieldControls} />
        </div>

        <div className="battle-intel-board-grid">
          <div className="battle-intel-side-column ally">
            <div className="battle-intel-panel-heading">
              <p className="eyebrow">Our Six</p>
              <h3>Left side</h3>
            </div>
            <BattleIntelRoster
              state={battleState}
              source={allySource}
              side="ally"
              activeIndices={allyActiveIndices}
              onSelectActive={selectAllyActive}
            />
          </div>

          <div className="battle-intel-field">
            <div className="battle-intel-field-row enemy">
              {battleState?.sides.enemy.activeIds.map((combatantId, index) => (
                <BattleIntelActiveCard
                  key={`enemy-active-${index}-${combatantId ?? "empty"}`}
                  combatant={combatantId ? battleState.combatants[combatantId] ?? null : null}
                  sourceId={enemySource?.id ?? enemySourceId}
                  onUpdateRuntime={updateRuntime}
                />
              ))}
            </div>
            <div className="battle-intel-field-divider">
              <span>{fieldControls.trickRoom ? "Trick Room" : "Normal order"}</span>
              <span>{fieldControls.weather === "none" ? "No weather" : formatOptionLabel(fieldControls.weather)}</span>
              <span>{fieldControls.terrain === "none" ? "No terrain" : `${formatOptionLabel(fieldControls.terrain)} terrain`}</span>
            </div>
            <div className="battle-intel-field-row ally">
              {battleState?.sides.ally.activeIds.map((combatantId, index) => (
                <BattleIntelActiveCard
                  key={`ally-active-${index}-${combatantId ?? "empty"}`}
                  combatant={combatantId ? battleState.combatants[combatantId] ?? null : null}
                  sourceId={allySource?.id ?? allySourceId}
                  onUpdateRuntime={updateRuntime}
                />
              ))}
            </div>
          </div>

          <div className="battle-intel-side-column enemy">
            <div className="battle-intel-panel-heading">
              <p className="eyebrow">Enemy Six</p>
              <h3>Right side</h3>
            </div>
            <BattleIntelRoster
              state={battleState}
              source={enemySource}
              side="enemy"
              activeIndices={enemyActiveIndices}
              onSelectActive={selectEnemyActive}
            />
            <BattleIntelTurnOrder state={battleState} />
          </div>
        </div>
      </section>

      {movesetSection}
    </section>
  );
}

export default BattleIntelPage;
