import type {
  CatalogMove,
  CatalogNamedEntry,
  CatalogSpecies,
  ChampionsCatalog,
  SnapshotPokemon,
} from "./types";

export type ChampionsCatalogIndex = {
  speciesByNumber: Map<number, CatalogSpecies[]>;
  movesByNumber: Map<number, CatalogMove>;
  itemsByNumber: Map<number, CatalogNamedEntry>;
  abilitiesByNumber: Map<number, CatalogNamedEntry>;
  weatherByNumber: Map<number, string>;
};

function groupedSpecies(species: CatalogSpecies[]) {
  const result = new Map<number, CatalogSpecies[]>();
  for (const entry of species) {
    const group = result.get(entry.num) ?? [];
    group.push(entry);
    result.set(entry.num, group);
  }
  return result;
}

export function createChampionsCatalogIndex(catalog: ChampionsCatalog): ChampionsCatalogIndex {
  return {
    speciesByNumber: groupedSpecies(catalog.species),
    movesByNumber: new Map(catalog.moves.map((move) => [move.num, move])),
    itemsByNumber: new Map(catalog.items.map((item) => [item.num, item])),
    abilitiesByNumber: new Map(catalog.abilities.map((ability) => [ability.num, ability])),
    weatherByNumber: new Map(
      Object.entries(catalog.weather).map(([name, value]) => [value, name]),
    ),
  };
}

export function resolveSnapshotSpecies(
  pokemon: SnapshotPokemon,
  catalog: ChampionsCatalogIndex,
): CatalogSpecies | null {
  const candidates = catalog.speciesByNumber.get(pokemon.personal_id) ?? [];
  if (pokemon.mega_mode) {
    const mega = candidates.find((candidate) => candidate.forme?.toLowerCase().includes("mega"));
    if (mega) {
      return mega;
    }
  }
  return candidates.find((candidate) => candidate.forme === null) ?? candidates[0] ?? null;
}

export function formatWeatherName(value: string | undefined) {
  if (!value || value === "none") {
    return "Clear skies";
  }
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}
