import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Dex } from "@pkmn/dex";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public", "data");
const outputFile = path.join(outputDir, "pokemon-db.json");

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

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, `${JSON.stringify(database, null, 2)}\n`, "utf8");

console.log(`Generated ${species.length} Pokemon entries at ${path.relative(rootDir, outputFile)}`);
