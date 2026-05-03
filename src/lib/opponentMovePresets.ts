import { CHAMPIONS_META_MOVESETS_RAW } from "../data/championsMetaMovesetsRaw";
import { getTypeFromLabel } from "../data/typeChart";
import { isSpreadTarget, type MoveRecord } from "./battleData";
import { isLowKickMove } from "./damage";
import type { PokemonRecord } from "./pokemonDb";
import type { PersistedKnownMove, PersistedSavedAttack } from "./savedTeams";

export type OpponentPresetMeta = {
  title: string;
  source: string;
  exportedAt: string;
};

export type OpponentPresetRecord = {
  speciesKey: string;
  speciesName: string;
  displayName: string;
  types: string[];
  usageCount: number;
  abilityName: string;
  itemName: string;
  moveNames: string[];
  rating: number;
  teamCount: number;
};

const DISPLAY_NAME_KEY_OVERRIDES: Record<string, string> = {
  "Floette [Eternal Flower]": "floetteeternal",
  "Rotom [Wash Rotom]": "rotomwash",
  "Rotom [Heat Rotom]": "rotomheat",
  "Rotom [Frost Rotom]": "rotomfrost",
  "Rotom [Mow Rotom]": "rotommow",
  "Rotom [Fan Rotom]": "rotomfan",
  "Ninetales [Alolan Form]": "ninetalesalola",
  "Arcanine [Hisuian Form]": "arcaninehisui",
  "Typhlosion [Hisuian Form]": "typhlosionhisui",
  "Zoroark [Hisuian Form]": "zoroarkhisui",
  "Tauros [Paldean Form (Aqua Breed)]": "taurospaldeaaqua",
  "Tauros [Paldean Form (Blaze Breed)]": "taurospaldeablaze",
  "Goodra [Hisuian Form]": "goodrahisui",
  "Slowking [Galarian Form]": "slowkinggalar",
  "Slowbro [Galarian Form]": "slowbrogalar",
  "Decidueye [Hisuian Form]": "decidueyehisui",
  "Samurott [Hisuian Form]": "samurotthisui",
  "Raichu [Alolan Form]": "raichualola",
  "Meowstic [Female]": "meowsticf",
  "Mr. Rime": "mrrime",
};

const MOVE_NAME_ALIASES: Record<string, string> = {
  waterball: "Weather Ball",
};

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseUsageCount(line: string) {
  const match = line.match(/^Usage:\s*(\d+)\s+uses$/);
  return match ? Number(match[1]) : 0;
}

function parseRatingAndTeams(line: string) {
  const normalized = line.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^Usage:\s*([0-9.]+)\s+rating\s+[·-]\s+(\d+)\s+teams$/);

  if (!match) {
    return { rating: 0, teamCount: 0 };
  }

  return {
    rating: Number(match[1]),
    teamCount: Number(match[2]),
  };
}

function parseOpponentPresetBlock(block: string): OpponentPresetRecord | null {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 8) {
    return null;
  }

  const displayName = lines[0];
  const typesLine = lines.find((line) => line.startsWith("Types: "));
  const usageLine = lines.find((line, index) => index < 4 && line.startsWith("Usage: "));
  const abilityLine = lines.find((line) => line.startsWith("Ability: "));
  const itemLine = lines.find((line) => line.startsWith("Item: "));
  const movesLine = lines.find((line) => line.startsWith("Moves: "));
  const ratingLine = [...lines].reverse().find((line) => line.startsWith("Usage: "));

  if (!typesLine || !usageLine || !abilityLine || !itemLine || !movesLine || !ratingLine) {
    return null;
  }

  const types = typesLine
    .slice("Types: ".length)
    .split(" / ")
    .map((type) => type.trim())
    .filter(Boolean);
  const usageCount = parseUsageCount(usageLine);
  const abilityName = abilityLine.slice("Ability: ".length).trim();
  const itemName = itemLine.slice("Item: ".length).trim();
  const moveNames = movesLine
    .slice("Moves: ".length)
    .split(" / ")
    .map((moveName) => moveName.trim())
    .filter(Boolean);
  const { rating, teamCount } = parseRatingAndTeams(ratingLine);
  const speciesKey = DISPLAY_NAME_KEY_OVERRIDES[displayName] ?? normalizeKey(displayName);
  const speciesName = displayName.replace(/\s*\[.*\]\s*/g, "").trim();

  return {
    speciesKey,
    speciesName,
    displayName,
    types,
    usageCount,
    abilityName,
    itemName,
    moveNames,
    rating,
    teamCount,
  };
}

function parseOpponentPresetSource(raw: string) {
  const [headerBlock, ...entryBlocks] = raw.trim().split(/\n\s*\n/);
  const headerLines = headerBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const meta: OpponentPresetMeta = {
    title: headerLines[0] ?? "Pokemon Champions Meta Sets",
    source: headerLines.find((line) => line.startsWith("Source: "))?.slice("Source: ".length).trim() ?? "",
    exportedAt: headerLines.find((line) => line.startsWith("Exported: "))?.slice("Exported: ".length).trim() ?? "",
  };

  const records = entryBlocks
    .map(parseOpponentPresetBlock)
    .filter((record): record is OpponentPresetRecord => record !== null);

  return { meta, records };
}

function resolvePresetMoveName(moveName: string) {
  return MOVE_NAME_ALIASES[normalizeKey(moveName)] ?? moveName;
}

function getPresetMoveLookupKey(moveName: string) {
  return moveName.toLowerCase();
}

function getPresetMoveBasePower(move: MoveRecord) {
  if (move.basePower > 0) {
    return move.basePower;
  }

  return isLowKickMove(move.name) ? 0 : undefined;
}

function buildPresetKnownMove(
  _pokemon: PokemonRecord,
  move: MoveRecord,
  index: number,
): PersistedKnownMove | null {
  const type = getTypeFromLabel(move.type);

  return {
    id: `preset-${move.id}-${index}`,
    name: move.name,
    label: move.name,
    type: type ?? undefined,
    basePower: getPresetMoveBasePower(move),
    category: move.category.toLowerCase() as PersistedKnownMove["category"],
    isSpreadMove: isSpreadTarget(move.target),
  };
}

function buildPresetSavedAttack(
  pokemon: PokemonRecord,
  move: MoveRecord,
  index: number,
): PersistedSavedAttack | null {
  const knownMove = buildPresetKnownMove(pokemon, move, index);

  if (!knownMove?.type || knownMove.category === "status") {
    return null;
  }

  return {
    id: knownMove.id,
    label: knownMove.label,
    type: knownMove.type,
    basePower: knownMove.basePower,
    category: knownMove.category,
    isSpreadMove: knownMove.isSpreadMove,
  };
}

function getPresetKeys(pokemon: PokemonRecord) {
  return [
    normalizeKey(pokemon.id),
    normalizeKey(pokemon.name),
    normalizeKey(pokemon.baseSpecies),
  ];
}

const PARSED_PRESET_SOURCE = parseOpponentPresetSource(CHAMPIONS_META_MOVESETS_RAW);
const OPPONENT_PRESET_BY_KEY = new Map(
  PARSED_PRESET_SOURCE.records.map((record) => [record.speciesKey, record] as const),
);

export const OPPONENT_PRESET_META = PARSED_PRESET_SOURCE.meta;
export const OPPONENT_PRESET_RECORDS = PARSED_PRESET_SOURCE.records;
export const OPPONENT_MOVE_PRESET_KEY_SET = new Set(OPPONENT_PRESET_RECORDS.map((record) => record.speciesKey));

export function getOpponentPreset(pokemon: PokemonRecord) {
  for (const key of getPresetKeys(pokemon)) {
    const preset = OPPONENT_PRESET_BY_KEY.get(key);

    if (preset) {
      return preset;
    }
  }

  return null;
}

export function getOpponentPresetMoveNames(pokemon: PokemonRecord) {
  const preset = getOpponentPreset(pokemon);
  return preset?.moveNames ? [...preset.moveNames] : [];
}

export function getOpponentPresetSavedAttacks(
  pokemon: PokemonRecord,
  moveByKey: ReadonlyMap<string, MoveRecord>,
) {
  return getOpponentPresetMoveNames(pokemon)
    .map((rawMoveName, index) => {
      const moveName = resolvePresetMoveName(rawMoveName);
      const move =
        moveByKey.get(getPresetMoveLookupKey(moveName)) ??
        moveByKey.get(normalizeKey(moveName)) ??
        null;

      return move ? buildPresetSavedAttack(pokemon, move, index) : null;
    })
    .filter((attack): attack is PersistedSavedAttack => attack !== null);
}

export function getOpponentPresetKnownMoves(
  pokemon: PokemonRecord,
  moveByKey: ReadonlyMap<string, MoveRecord>,
) {
  return getOpponentPresetMoveNames(pokemon)
    .map((rawMoveName, index) => {
      const moveName = resolvePresetMoveName(rawMoveName);
      const move =
        moveByKey.get(getPresetMoveLookupKey(moveName)) ??
        moveByKey.get(normalizeKey(moveName)) ??
        null;

      return move ? buildPresetKnownMove(pokemon, move, index) : null;
    })
    .filter((attack): attack is PersistedKnownMove => attack !== null);
}
