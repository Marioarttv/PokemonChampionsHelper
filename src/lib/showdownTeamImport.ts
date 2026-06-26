import { normalizePokemonNameKey } from "../data/championsLegalPokemon";
import { getTypeFromLabel } from "../data/typeChart";
import { isSpreadTarget, type MoveRecord } from "./battleData";
import {
  isChampionsPlayableBaseForm,
  isChampionsSuppressedBaseForm,
} from "./championsPlayableForms";
import { isWeightBasedDamageMove } from "./damage";
import type { PokemonRecord } from "./pokemonDb";
import type {
  PersistedAttackCategory,
  PersistedKnownMove,
  PersistedSavedAttack,
  PersistedTeamSlot,
} from "./savedTeams";

type ParsedShowdownSet = {
  speciesName: string;
  gender: "M" | "F" | null;
  itemName: string | null;
  moveNames: string[];
};

export type ShowdownImportResult = {
  slots: PersistedTeamSlot[];
  importedPokemonCount: number;
  extraPokemonCount: number;
  unresolvedSpecies: string[];
  unknownMoves: string[];
  skippedStatusMoves: string[];
};

type ShowdownImportOptions = {
  pokemonEntries: PokemonRecord[];
  moveByKey: ReadonlyMap<string, MoveRecord>;
  maxTeamSize: number;
  maxMovesPerSlot: number;
};

const SHOWDOWN_BLOCK_SPLIT_REGEX = /\n\s*\n+/;
const SHOWDOWN_MOVE_LINE_REGEX = /^[-•]\s*/;
const GENDER_TOKEN_REGEX = /\((M|F)\)/i;

function normalizeTextKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function createSavedAttackId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `imported-attack-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseShowdownHeader(line: string) {
  const [rawPokemonPart, ...rawItemParts] = line.split("@");
  const pokemonPart = rawPokemonPart?.trim() ?? "";
  const itemName = rawItemParts.join("@").trim() || null;
  const genderMatch = pokemonPart.match(GENDER_TOKEN_REGEX);
  const gender = genderMatch?.[1]?.toUpperCase() === "M" || genderMatch?.[1]?.toUpperCase() === "F"
    ? (genderMatch[1].toUpperCase() as "M" | "F")
    : null;
  const parenValues = Array.from(pokemonPart.matchAll(/\(([^()]+)\)/g))
    .map((match) => match[1].trim())
    .filter((value) => value.length > 0 && !/^(M|F)$/i.test(value));
  const speciesName = (
    parenValues[parenValues.length - 1] ??
    pokemonPart.replace(/\s*\((M|F)\)\s*$/i, "").trim()
  ).trim();

  return {
    speciesName,
    gender,
    itemName,
  };
}

function parseShowdownSet(block: string): ParsedShowdownSet | null {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  const { speciesName, gender, itemName } = parseShowdownHeader(lines[0]);
  const moveNames = lines
    .filter((line) => SHOWDOWN_MOVE_LINE_REGEX.test(line))
    .map((line) => line.replace(SHOWDOWN_MOVE_LINE_REGEX, "").trim())
    .filter(Boolean);

  if (!speciesName) {
    return null;
  }

  return {
    speciesName,
    gender,
    itemName,
    moveNames,
  };
}

function buildPokemonLookup(pokemonEntries: PokemonRecord[]) {
  const byNameKey = new Map<string, PokemonRecord>();
  const megaCandidatesByBaseSpeciesKey = new Map<string, PokemonRecord[]>();
  const basePokemonBySpeciesKey = new Map<string, PokemonRecord>();

  for (const pokemon of pokemonEntries) {
    const keys = new Set([
      normalizePokemonNameKey(pokemon.id),
      normalizePokemonNameKey(pokemon.name),
      normalizePokemonNameKey(pokemon.baseSpecies),
    ]);

    for (const key of keys) {
      if (!byNameKey.has(key)) {
        byNameKey.set(key, pokemon);
      }
    }

    const baseSpeciesKey = normalizePokemonNameKey(pokemon.baseSpecies || pokemon.name);
    if (isChampionsPlayableBaseForm(pokemon)) {
      basePokemonBySpeciesKey.set(baseSpeciesKey, pokemon);
    } else if (!pokemon.forme && !isChampionsSuppressedBaseForm(pokemon) && !basePokemonBySpeciesKey.has(baseSpeciesKey)) {
      basePokemonBySpeciesKey.set(baseSpeciesKey, pokemon);
    }

    if (pokemon.forme && /(mega|primal)/i.test(pokemon.forme)) {
      const megaBaseSpeciesKey = normalizePokemonNameKey(pokemon.baseSpecies);
      const bucket = megaCandidatesByBaseSpeciesKey.get(megaBaseSpeciesKey) ?? [];
      bucket.push(pokemon);
      megaCandidatesByBaseSpeciesKey.set(megaBaseSpeciesKey, bucket);
    }
  }

  return {
    byNameKey,
    megaCandidatesByBaseSpeciesKey,
    basePokemonBySpeciesKey,
  };
}

function resolveMegaOrPrimalForm(
  pokemon: PokemonRecord,
  itemName: string | null,
  megaCandidatesByBaseSpeciesKey: ReadonlyMap<string, PokemonRecord[]>,
) {
  if (!itemName || (pokemon.forme && /(mega|primal)/i.test(pokemon.forme))) {
    return pokemon;
  }

  const candidates = megaCandidatesByBaseSpeciesKey.get(normalizePokemonNameKey(pokemon.baseSpecies)) ?? [];

  if (candidates.length === 0) {
    return pokemon;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const normalizedItemKey = normalizePokemonNameKey(itemName);

  if (normalizedItemKey.endsWith("x")) {
    return candidates.find((candidate) => /mega-x/i.test(candidate.name) || /mega-x/i.test(candidate.forme ?? "")) ?? pokemon;
  }

  if (normalizedItemKey.endsWith("y")) {
    return candidates.find((candidate) => /mega-y/i.test(candidate.name) || /mega-y/i.test(candidate.forme ?? "")) ?? pokemon;
  }

  return candidates[0] ?? pokemon;
}

function resolveImportedPokemon(
  parsedSet: ParsedShowdownSet,
  lookup: ReturnType<typeof buildPokemonLookup>,
) {
  const speciesKey = normalizePokemonNameKey(parsedSet.speciesName);
  const explicitGenderFormKey =
    parsedSet.gender && !speciesKey.endsWith(parsedSet.gender.toLowerCase())
      ? normalizePokemonNameKey(`${parsedSet.speciesName}-${parsedSet.gender}`)
      : null;
  const exactMatch =
    (explicitGenderFormKey ? lookup.byNameKey.get(explicitGenderFormKey) : null) ??
    lookup.byNameKey.get(speciesKey) ??
    null;

  if (!exactMatch) {
    return null;
  }

  const baseSpeciesKey = normalizePokemonNameKey(exactMatch.baseSpecies || exactMatch.name);
  const playableExactMatch = isChampionsSuppressedBaseForm(exactMatch)
    ? lookup.basePokemonBySpeciesKey.get(baseSpeciesKey) ?? exactMatch
    : exactMatch;
  const pokemon = resolveMegaOrPrimalForm(playableExactMatch, parsedSet.itemName, lookup.megaCandidatesByBaseSpeciesKey);
  const basePokemon =
    pokemon.forme && /(mega|primal)/i.test(pokemon.forme)
      ? lookup.basePokemonBySpeciesKey.get(normalizePokemonNameKey(pokemon.baseSpecies)) ?? playableExactMatch
      : pokemon;

  return {
    pokemon,
    basePokemon,
  };
}

function buildImportedSavedAttack(move: MoveRecord): PersistedSavedAttack | null {
  const basePower = getImportedMoveBasePower(move);

  if (move.category === "Status" || basePower === undefined) {
    return null;
  }

  const type = getTypeFromLabel(move.type);

  if (!type) {
    return null;
  }

  return {
    id: createSavedAttackId(),
    label: move.name,
    type,
    basePower,
    category: move.category.toLowerCase() as PersistedAttackCategory,
    isSpreadMove: isSpreadTarget(move.target),
  };
}

function getImportedMoveBasePower(move: MoveRecord) {
  if (move.basePower > 0) {
    return move.basePower;
  }

  return isWeightBasedDamageMove(move.name) ? 0 : undefined;
}

function buildImportedKnownMove(move: MoveRecord): PersistedKnownMove | null {
  const type = getTypeFromLabel(move.type);

  return {
    id: createSavedAttackId(),
    name: move.name,
    label: move.name,
    type: type ?? undefined,
    basePower: getImportedMoveBasePower(move),
    category: move.category.toLowerCase() as PersistedKnownMove["category"],
    isSpreadMove: isSpreadTarget(move.target),
  };
}

function getResolvedMove(moveName: string, moveByKey: ReadonlyMap<string, MoveRecord>) {
  const trimmed = moveName.trim();

  if (!trimmed) {
    return null;
  }

  return moveByKey.get(trimmed.toLowerCase()) ?? moveByKey.get(normalizeTextKey(trimmed)) ?? null;
}

export function importShowdownTeamText(
  text: string,
  options: ShowdownImportOptions,
): ShowdownImportResult {
  const parsedSets = text
    .trim()
    .split(SHOWDOWN_BLOCK_SPLIT_REGEX)
    .map(parseShowdownSet)
    .filter((entry): entry is ParsedShowdownSet => entry !== null);
  const lookup = buildPokemonLookup(options.pokemonEntries);
  const slots: PersistedTeamSlot[] = [];
  const unresolvedSpecies: string[] = [];
  const unknownMoves: string[] = [];
  const skippedStatusMoves: string[] = [];

  for (const parsedSet of parsedSets.slice(0, options.maxTeamSize)) {
    const resolved = resolveImportedPokemon(parsedSet, lookup);

    if (!resolved) {
      unresolvedSpecies.push(parsedSet.speciesName);
      slots.push({
        query: parsedSet.speciesName,
        pokemonId: null,
        activeFormPokemonId: null,
        itemName: parsedSet.itemName,
        knownMoves: [],
        savedAttacks: [],
      });
      continue;
    }

    const { pokemon, basePokemon } = resolved;
    const knownMoves: PersistedKnownMove[] = [];
    const savedAttacks: PersistedSavedAttack[] = [];

    for (const moveName of parsedSet.moveNames) {
      if (knownMoves.length >= options.maxMovesPerSlot) {
        break;
      }

      const move = getResolvedMove(moveName, options.moveByKey);

      if (!move) {
        unknownMoves.push(moveName);
        continue;
      }

      const knownMove = buildImportedKnownMove(move);

      if (!knownMove) {
        continue;
      }

      knownMoves.push(knownMove);

      const savedAttack = buildImportedSavedAttack(move);
      if (savedAttack) {
        savedAttacks.push(savedAttack);
      }
    }

    slots.push({
      query: basePokemon.name,
      pokemonId: basePokemon.id,
      activeFormPokemonId: pokemon.id !== basePokemon.id ? pokemon.id : null,
      itemName: parsedSet.itemName,
      knownMoves,
      savedAttacks,
    });
  }

  return {
    slots,
    importedPokemonCount: slots.filter((slot) => Boolean(slot.pokemonId)).length,
    extraPokemonCount: Math.max(0, parsedSets.length - options.maxTeamSize),
    unresolvedSpecies,
    unknownMoves,
    skippedStatusMoves,
  };
}
