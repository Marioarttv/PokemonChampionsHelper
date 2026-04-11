import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Dex } from "@pkmn/dex";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public", "data");
const pokemonOutputFile = path.join(outputDir, "pokemon-db.json");
const battleOutputFile = path.join(outputDir, "battle-data.json");

const species = Dex.species
  .all()
  .filter((pokemon) => pokemon.exists && pokemon.num > 0)
  .sort((a, b) => {
    if (a.num !== b.num) {
      return a.num - b.num;
    }

    return a.name.localeCompare(b.name);
  })
  .map((pokemon) => ({
    id: pokemon.id,
    name: pokemon.name,
    num: pokemon.num,
    baseSpecies: pokemon.baseSpecies,
    forme: pokemon.forme || null,
    types: pokemon.types,
    baseStats: pokemon.baseStats,
    bst: pokemon.bst,
    abilities: pokemon.abilities,
    heightm: pokemon.heightm ?? null,
    weightkg: pokemon.weightkg ?? null,
    color: pokemon.color || null,
    prevo: pokemon.prevo || null,
    evos: pokemon.evos ?? [],
    gen: pokemon.gen,
    tier: pokemon.tier ?? null,
    doublesTier: pokemon.doublesTier ?? null,
    isNonstandard: pokemon.isNonstandard ?? null,
  }));

const database = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: "@pkmn/dex",
    speciesCount: species.length,
  },
  pokemon: species,
};

const abilities = Dex.abilities
  .all()
  .filter((ability) => ability.exists)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((ability) => ({
    id: ability.id,
    name: ability.name,
    shortDesc: ability.shortDesc || "",
    desc: ability.desc || "",
  }));

const moves = Dex.moves
  .all()
  .filter((move) => move.exists)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((move) => ({
    id: move.id,
    name: move.name,
    type: move.type,
    category: move.category,
    basePower: move.basePower,
    accuracy: move.accuracy,
    pp: move.pp,
    priority: move.priority,
    target: move.target,
    shortDesc: move.shortDesc || "",
    desc: move.desc || "",
  }));

const battleData = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: "@pkmn/dex",
    abilityCount: abilities.length,
    moveCount: moves.length,
  },
  abilities,
  moves,
};

await mkdir(outputDir, { recursive: true });
await writeFile(pokemonOutputFile, `${JSON.stringify(database, null, 2)}\n`, "utf8");
await writeFile(battleOutputFile, `${JSON.stringify(battleData, null, 2)}\n`, "utf8");

console.log(`Generated ${species.length} Pokemon entries at ${path.relative(rootDir, pokemonOutputFile)}`);
console.log(
  `Generated ${moves.length} moves and ${abilities.length} abilities at ${path.relative(rootDir, battleOutputFile)}`,
);
