import type { PokemonType } from "../../../data/typeChart";
import type { MoveRecord } from "../../battleData";
import { createBattleState, type BattleSide, type BattleState, type BattleStateMemberInput, type JointActionPlan } from "..";
import type { PokemonRecord } from "../../pokemonDb";

type FixturePokemonOptions = {
  id?: string;
  baseSpecies?: string;
  types?: string[];
  baseStats?: Partial<PokemonRecord["baseStats"]>;
  abilities?: Record<string, string>;
};

type FixtureMoveOptions = {
  id?: string;
  type?: string;
  category?: MoveRecord["category"];
  basePower?: number;
  accuracy?: number | true;
  pp?: number;
  priority?: number;
  target?: string;
  shortDesc?: string;
  desc?: string;
};

type FixtureMemberOptions = {
  side: BattleSide;
  slot: number;
  pokemon: PokemonRecord;
  moveNames?: string[];
  currentHpPercent?: number;
  statusCondition?: BattleStateMemberInput["statusCondition"];
  sleepTurns?: number;
  turnsActive?: number;
  isActive?: boolean;
};

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function makePokemon(name: string, options: FixturePokemonOptions = {}): PokemonRecord {
  return {
    id: options.id ?? normalizeKey(name),
    name,
    num: 1,
    baseSpecies: options.baseSpecies ?? name,
    forme: null,
    types: options.types ?? ["Normal"],
    baseStats: {
      hp: options.baseStats?.hp ?? 100,
      atk: options.baseStats?.atk ?? 100,
      def: options.baseStats?.def ?? 100,
      spa: options.baseStats?.spa ?? 100,
      spd: options.baseStats?.spd ?? 100,
      spe: options.baseStats?.spe ?? 100,
    },
    bst: 600,
    abilities: options.abilities ?? { "0": "Pressure" },
    heightm: 1,
    weightkg: 50,
    color: null,
    prevo: null,
    evos: [],
    gen: 9,
    tier: null,
    doublesTier: null,
    isNonstandard: null,
  };
}

export function makeMove(name: string, options: FixtureMoveOptions = {}): MoveRecord {
  return {
    id: options.id ?? normalizeKey(name),
    name,
    type: options.type ?? "Normal",
    category: options.category ?? "Physical",
    basePower: options.basePower ?? 50,
    accuracy: options.accuracy ?? 100,
    pp: options.pp ?? 16,
    priority: options.priority ?? 0,
    target: options.target ?? "normal",
    shortDesc: options.shortDesc ?? "",
    desc: options.desc ?? "",
  };
}

export function createMoveLookup(...moves: MoveRecord[]) {
  const moveByKey = new Map<string, MoveRecord>();

  for (const move of moves) {
    moveByKey.set(move.id, move);
    moveByKey.set(move.name.toLowerCase(), move);
    moveByKey.set(normalizeKey(move.name), move);
  }

  return moveByKey;
}

export function makeMember(options: FixtureMemberOptions): BattleStateMemberInput {
  return {
    id: `${options.side}-${options.slot}`,
    label: `${options.side}-${options.slot}`,
    pokemon: options.pokemon,
    teamIndex: options.slot,
    moveNames: options.moveNames ?? [],
    currentHpPercent: options.currentHpPercent ?? 100,
    statusCondition: options.statusCondition ?? "none",
    sleepTurns: options.sleepTurns ?? 0,
    turnsActive: options.turnsActive ?? 0,
    isActive: options.isActive ?? true,
  };
}

export function createTestBattleState(options: {
  ally: BattleStateMemberInput[];
  enemy: BattleStateMemberInput[];
  moves: MoveRecord[];
  weather?: "none" | "sun" | "rain" | "sand" | "snow";
  terrain?: "none" | "electric" | "grassy" | "psychic" | "misty";
  universalProtect?: boolean;
}) {
  return createBattleState({
    ally: options.ally,
    enemy: options.enemy,
    moveByKey: createMoveLookup(...options.moves),
    weather: options.weather,
    terrain: options.terrain,
    universalProtect: options.universalProtect ?? false,
  });
}

export function findMoveId(state: BattleState, actorId: string, moveName: string) {
  const move = state.combatants[actorId]?.knownMoves.find((entry) => normalizeKey(entry.name) === normalizeKey(moveName));
  if (!move) {
    throw new Error(`Move ${moveName} was not found for ${actorId}.`);
  }
  return move.id;
}

export function buildMovePlan(
  state: BattleState,
  side: BattleSide,
  entries: Array<{ actorId: string; moveName: string; targetId?: string | null }>,
): JointActionPlan {
  return {
    side,
    actions: entries.map(({ actorId, moveName, targetId }) => ({
      actorId,
      actorLabel: state.combatants[actorId]?.pokemon.name ?? actorId,
      summary: `${state.combatants[actorId]?.pokemon.name ?? actorId}: ${moveName}`,
      heuristicScore: 0,
      action: {
        type: "move" as const,
        actorId,
        moveId: findMoveId(state, actorId, moveName),
        targetId: targetId ?? null,
      },
    })),
    summary: entries.map(({ actorId, moveName }) => `${state.combatants[actorId]?.pokemon.name ?? actorId}: ${moveName}`).join(" | "),
    heuristicScore: 0,
  };
}

export function buildPassPlan(state: BattleState, side: BattleSide, actorIds: string[]): JointActionPlan {
  return {
    side,
    actions: actorIds.map((actorId) => ({
      actorId,
      actorLabel: state.combatants[actorId]?.pokemon.name ?? actorId,
      summary: `${state.combatants[actorId]?.pokemon.name ?? actorId}: pass`,
      heuristicScore: 0,
      action: {
        type: "pass" as const,
        actorId,
      },
    })),
    summary: `${side} pass`,
    heuristicScore: 0,
  };
}

export function makeSavedAttack(name: string, type: PokemonType, category: "physical" | "special", basePower = 50) {
  return {
    id: `saved-${normalizeKey(name)}`,
    label: name,
    type,
    category,
    basePower,
    isSpreadMove: false,
  };
}
