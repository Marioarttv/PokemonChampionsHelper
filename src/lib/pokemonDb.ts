export type PokemonRecord = {
  id: string;
  name: string;
  num: number;
  baseSpecies: string;
  forme: string | null;
  types: string[];
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
  };
  bst: number;
  abilities: Record<string, string>;
  heightm: number | null;
  weightkg: number | null;
  color: string | null;
  prevo: string | null;
  evos: string[];
  gen: number;
  tier: string | null;
  doublesTier: string | null;
  isNonstandard: string | null;
};

export type PokemonDatabase = {
  meta: {
    generatedAt: string;
    source: string;
    speciesCount: number;
  };
  pokemon: PokemonRecord[];
};

let pokemonDbPromise: Promise<PokemonDatabase> | null = null;

const SPRITE_FORM_SUFFIXES = [
  "megax",
  "megay",
  "gmax",
  "mega",
  "alola",
  "galar",
  "hisui",
  "paldea",
  "primal",
  "therian",
  "incarnate",
  "origin",
  "originforme",
  "attack",
  "defense",
  "speed",
  "school",
  "blade",
  "shield",
  "sunshine",
  "overcast",
  "bloodmoon",
] as const;

function toSpriteId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toShowdownDexSpriteId(pokemonId: string) {
  const normalized = toSpriteId(pokemonId);

  for (const suffix of SPRITE_FORM_SUFFIXES) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
      return `${normalized.slice(0, -suffix.length)}-${suffix}`;
    }
  }

  return normalized;
}

export function loadPokemonDatabase() {
  if (!pokemonDbPromise) {
    const dataUrl = `${import.meta.env.BASE_URL}data/pokemon-db.json`;

    pokemonDbPromise = fetch(dataUrl).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load local Pokemon database: ${response.status}`);
      }

      return (await response.json()) as PokemonDatabase;
    });
  }

  return pokemonDbPromise;
}

export function getPokemonSpriteUrl(pokemonId: string) {
  return `https://play.pokemonshowdown.com/sprites/dex/${toShowdownDexSpriteId(pokemonId)}.png`;
}

export function getPokemonBaseSpriteUrl(baseSpecies: string) {
  return `https://play.pokemonshowdown.com/sprites/dex/${toSpriteId(baseSpecies)}.png`;
}
