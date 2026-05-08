import {
  CHAMPIONS_STAT_LABELS,
  CHAMPIONS_STAT_ORDER,
  getChampionsNatureLabel,
  normalizeChampionsStatSpread,
  type ChampionsStatSpread,
} from "./championsStats";
import type { MoveRecord } from "./battleData";
import type { PokemonRecord } from "./pokemonDb";
import type { PersistedKnownMove, PersistedSavedAttack } from "./savedTeams";

export type ShowdownExportSlot = {
  pokemon: PokemonRecord | null;
  battleFormPokemon?: PokemonRecord | null;
  itemName?: string | null;
  abilityName?: string | null;
  statSpread?: ChampionsStatSpread | null;
  knownMoves?: PersistedKnownMove[] | null;
  savedAttacks?: PersistedSavedAttack[] | null;
};

export type ShowdownTeamExportResult = {
  text: string;
  exportedPokemonCount: number;
  warnings: string[];
};

export type ShowdownTeamExportOptions = {
  slots: ShowdownExportSlot[];
  moveByKey: ReadonlyMap<string, MoveRecord>;
  maxMovesPerSlot?: number;
  level?: number;
};

const DEFAULT_SHOWDOWN_LEVEL = 50;
const DEFAULT_MAX_SHOWDOWN_MOVES = 4;

function normalizeTextKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getResolvedText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getKnownMoveName(move: Pick<PersistedKnownMove, "label" | "name">) {
  return move.name?.trim() || move.label.trim();
}

function resolveMoveName(moveName: string, moveByKey: ReadonlyMap<string, MoveRecord>) {
  const trimmed = moveName.trim();
  if (!trimmed) return null;

  return moveByKey.get(trimmed.toLowerCase())?.name ?? moveByKey.get(normalizeTextKey(trimmed))?.name ?? trimmed;
}

function getPrimaryAbilityName(pokemon: PokemonRecord) {
  return getResolvedText(pokemon.abilities["0"]) ?? getResolvedText(Object.values(pokemon.abilities)[0]);
}

function isMegaOrPrimalPokemon(pokemon: PokemonRecord | null | undefined) {
  return Boolean(pokemon?.forme && /(mega|primal)/i.test(pokemon.forme));
}

function inferMegaEvolutionItemName(pokemon: PokemonRecord | null | undefined) {
  if (!pokemon || !isMegaOrPrimalPokemon(pokemon)) {
    return null;
  }

  const baseSpecies = pokemon.baseSpecies || pokemon.name;
  const baseKey = normalizeTextKey(baseSpecies);

  if (/primal/i.test(pokemon.forme ?? "")) {
    if (baseKey === "groudon") return "Red Orb";
    if (baseKey === "kyogre") return "Blue Orb";
  }

  if (/mega-x/i.test(pokemon.forme ?? "") || /mega-x/i.test(pokemon.name)) {
    return `${baseSpecies}ite X`;
  }

  if (/mega-y/i.test(pokemon.forme ?? "") || /mega-y/i.test(pokemon.name)) {
    return `${baseSpecies}ite Y`;
  }

  return `${baseSpecies}ite`;
}

function buildHeaderLine(slot: ShowdownExportSlot) {
  const pokemonName = slot.pokemon?.name.trim();
  if (!pokemonName) return null;

  const itemName = getResolvedText(slot.itemName) ?? inferMegaEvolutionItemName(slot.battleFormPokemon);
  return itemName ? `${pokemonName} @ ${itemName}` : pokemonName;
}

function buildStatSpreadLines(spread: ChampionsStatSpread | null | undefined) {
  if (!spread) return [];

  const normalized = normalizeChampionsStatSpread(spread);
  const evParts = CHAMPIONS_STAT_ORDER
    .map((statId) => ({
      label: CHAMPIONS_STAT_LABELS[statId],
      value: normalized.statPoints[statId],
    }))
    .filter((entry) => entry.value > 0)
    .map((entry) => `${entry.value} ${entry.label}`);
  const lines: string[] = [];

  if (evParts.length > 0) {
    lines.push(`EVs: ${evParts.join(" / ")}`);
  }

  lines.push(`${getChampionsNatureLabel(normalized.nature)} Nature`);
  return lines;
}

function buildMoveLines(
  slot: ShowdownExportSlot,
  moveByKey: ReadonlyMap<string, MoveRecord>,
  maxMovesPerSlot: number,
  warnings: string[],
) {
  const seenMoveKeys = new Set<string>();
  const moveLines: string[] = [];
  const knownMoves = Array.isArray(slot.knownMoves) ? slot.knownMoves : [];
  const savedAttacks = Array.isArray(slot.savedAttacks) ? slot.savedAttacks : [];

  const addMove = (moveName: string, allowUnresolved: boolean) => {
    if (moveLines.length >= maxMovesPerSlot) return;

    const resolvedMoveName = resolveMoveName(moveName, moveByKey);
    if (!resolvedMoveName) return;

    const moveKey = normalizeTextKey(resolvedMoveName);
    if (!moveKey || seenMoveKeys.has(moveKey)) return;

    const isKnownMove = Boolean(
      moveByKey.get(resolvedMoveName.toLowerCase()) ?? moveByKey.get(moveKey),
    );
    if (!isKnownMove && !allowUnresolved) {
      warnings.push(`Skipped "${moveName}" because it is not a confirmed Showdown move.`);
      return;
    }

    seenMoveKeys.add(moveKey);
    moveLines.push(`- ${resolvedMoveName}`);
  };

  for (const move of knownMoves) {
    addMove(getKnownMoveName(move), true);
  }

  if (moveLines.length === 0) {
    for (const attack of savedAttacks) {
      addMove(attack.label, false);
    }
  }

  return moveLines;
}

export function exportShowdownTeamText(options: ShowdownTeamExportOptions): ShowdownTeamExportResult {
  const maxMovesPerSlot = Math.max(1, Math.round(options.maxMovesPerSlot ?? DEFAULT_MAX_SHOWDOWN_MOVES));
  const level = Math.max(1, Math.round(options.level ?? DEFAULT_SHOWDOWN_LEVEL));
  const warnings: string[] = [];
  const blocks: string[] = [];

  for (const slot of options.slots) {
    if (!slot.pokemon) continue;

    const headerLine = buildHeaderLine(slot);
    if (!headerLine) continue;

    const lines = [headerLine];
    const abilityName = getResolvedText(slot.abilityName) ?? getPrimaryAbilityName(slot.pokemon);

    if (abilityName) {
      lines.push(`Ability: ${abilityName}`);
    }

    lines.push(`Level: ${level}`);
    lines.push(...buildStatSpreadLines(slot.statSpread));

    const moveLines = buildMoveLines(slot, options.moveByKey, maxMovesPerSlot, warnings);
    if (moveLines.length === 0) {
      warnings.push(`${slot.pokemon.name} has no Showdown-exportable moves.`);
    }

    lines.push(...moveLines);
    blocks.push(lines.join("\n"));
  }

  return {
    text: blocks.join("\n\n"),
    exportedPokemonCount: blocks.length,
    warnings,
  };
}
