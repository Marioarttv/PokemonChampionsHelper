import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Dex } from "@pkmn/dex";
import * as ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public", "data");
const pokemonOutputFile = path.join(outputDir, "pokemon-db.json");
const battleOutputFile = path.join(outputDir, "battle-data.json");
const championsLearnsetsOutputFile = path.join(outputDir, "champions-learnsets.json");
const championsLegalPokemonFile = path.join(rootDir, "src", "data", "championsLegalPokemon.ts");
const learnsetDex = Dex.mod("gen9");

function toDexId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function readStringConst(sourceFile, constName) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === constName &&
        declaration.initializer &&
        ts.isStringLiteral(declaration.initializer)
      ) {
        return declaration.initializer.text;
      }
    }
  }

  throw new Error(`Could not read ${constName} from ${path.relative(rootDir, championsLegalPokemonFile)}.`);
}

function readStringArrayConst(sourceFile, constName) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== constName || !declaration.initializer) {
        continue;
      }

      const initializer = ts.isAsExpression(declaration.initializer)
        ? declaration.initializer.expression
        : declaration.initializer;

      if (!ts.isArrayLiteralExpression(initializer)) {
        continue;
      }

      return initializer.elements.map((element) => {
        if (!ts.isStringLiteral(element)) {
          throw new Error(`${constName} contains a non-string entry.`);
        }

        return element.text;
      });
    }
  }

  throw new Error(`Could not read ${constName} from ${path.relative(rootDir, championsLegalPokemonFile)}.`);
}

async function collectLearnsetMoveIds(pokemon) {
  const moveIds = new Set();
  const visitedSpeciesIds = new Set();

  async function collectFromSpeciesId(rawSpeciesId) {
    const speciesId = toDexId(rawSpeciesId);

    if (!speciesId || visitedSpeciesIds.has(speciesId)) {
      return;
    }

    visitedSpeciesIds.add(speciesId);

    const speciesEntry = Dex.species.get(speciesId);
    const learnset = await learnsetDex.learnsets.get(speciesId);

    for (const moveId of Object.keys(learnset.learnset ?? {})) {
      moveIds.add(moveId);
    }

    for (const event of learnset.eventData ?? []) {
      for (const moveName of event.moves ?? []) {
        const eventMoveId = Dex.moves.get(moveName).id || toDexId(moveName);

        if (eventMoveId) {
          moveIds.add(eventMoveId);
        }
      }
    }

    if (speciesEntry.prevo) {
      await collectFromSpeciesId(speciesEntry.prevo);
    }

    const baseSpeciesId = toDexId(speciesEntry.baseSpecies);
    if (baseSpeciesId && baseSpeciesId !== speciesId) {
      await collectFromSpeciesId(baseSpeciesId);
    }

    if (speciesEntry.changesFrom) {
      await collectFromSpeciesId(speciesEntry.changesFrom);
    }
  }

  await collectFromSpeciesId(pokemon.id);

  return [...moveIds].sort((a, b) => a.localeCompare(b));
}

const championsLegalPokemonSource = await readFile(championsLegalPokemonFile, "utf8");
const championsLegalPokemonAst = ts.createSourceFile(
  championsLegalPokemonFile,
  championsLegalPokemonSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const championsActiveRegulation = readStringConst(championsLegalPokemonAst, "POKEMON_CHAMPIONS_ACTIVE_REGULATION");
const championsActiveRegulationWindow = readStringConst(
  championsLegalPokemonAst,
  "POKEMON_CHAMPIONS_ACTIVE_REGULATION_WINDOW",
);
const championsLegalSpeciesNames = readStringArrayConst(
  championsLegalPokemonAst,
  "POKEMON_CHAMPIONS_LEGAL_SPECIES_NAMES",
);
const championsLegalSpeciesKeySet = new Set(championsLegalSpeciesNames.map(toDexId));
const championsLegalOrderByKey = new Map(
  championsLegalSpeciesNames.map((name, index) => [toDexId(name), index]),
);

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

const items = Dex.items
  .all()
  .filter((item) => item.exists)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((item) => ({
    id: item.id,
    name: item.name,
    shortDesc: item.shortDesc || "",
    desc: item.desc || "",
  }));

const PER_HIT_BASE_POWER_OVERRIDES = {
  tripleaxel: 40,
  triplekick: 20,
};

function normalizeMultihit(raw) {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 1) {
    return raw;
  }

  if (Array.isArray(raw) && raw.length === 2) {
    const min = Number(raw[0]);
    const max = Number(raw[1]);

    if (Number.isFinite(min) && Number.isFinite(max) && max > 1 && max >= min) {
      return min === max ? max : [min, max];
    }
  }

  return null;
}

const moves = Dex.moves
  .all()
  .filter((move) => move.exists)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((move) => {
    const multihit = normalizeMultihit(move.multihit);
    const basePowerOverride = PER_HIT_BASE_POWER_OVERRIDES[move.id];

    return {
      id: move.id,
      name: move.name,
      type: move.type,
      category: move.category,
      basePower: basePowerOverride ?? move.basePower,
      accuracy: move.accuracy,
      pp: move.pp,
      priority: move.priority,
      target: move.target,
      multihit,
      shortDesc: move.shortDesc || "",
      desc: move.desc || "",
    };
  });

const championsLearnsetSpecies = species
  .filter((pokemon) => championsLegalSpeciesKeySet.has(toDexId(pokemon.baseSpecies || pokemon.name)))
  .sort((left, right) => {
    const leftOrder = championsLegalOrderByKey.get(toDexId(left.baseSpecies || left.name)) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = championsLegalOrderByKey.get(toDexId(right.baseSpecies || right.name)) ?? Number.MAX_SAFE_INTEGER;

    return leftOrder - rightOrder || left.name.localeCompare(right.name);
  });
const championsLearnsets = [];

for (const pokemon of championsLearnsetSpecies) {
  const moveIds = await collectLearnsetMoveIds(pokemon);

  if (moveIds.length > 0) {
    championsLearnsets.push({
      speciesId: pokemon.id,
      moveIds,
    });
  }
}

const battleData = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: "@pkmn/dex",
    abilityCount: abilities.length,
    itemCount: items.length,
    moveCount: moves.length,
  },
  abilities,
  items,
  moves,
};

const championsLearnsetsData = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: "@pkmn/dex gen9 learnsets",
    regulation: championsActiveRegulation,
    regulationWindow: championsActiveRegulationWindow,
    legalSpeciesCount: championsLegalSpeciesNames.length,
    learnsetCount: championsLearnsets.length,
  },
  learnsets: championsLearnsets,
};

await mkdir(outputDir, { recursive: true });
await writeFile(pokemonOutputFile, `${JSON.stringify(database, null, 2)}\n`, "utf8");
await writeFile(battleOutputFile, `${JSON.stringify(battleData, null, 2)}\n`, "utf8");
await writeFile(championsLearnsetsOutputFile, `${JSON.stringify(championsLearnsetsData, null, 2)}\n`, "utf8");

console.log(`Generated ${species.length} Pokemon entries at ${path.relative(rootDir, pokemonOutputFile)}`);
console.log(
  `Generated ${moves.length} moves, ${abilities.length} abilities, and ${items.length} items at ${path.relative(rootDir, battleOutputFile)}`,
);
console.log(
  `Generated ${championsLearnsets.length} ${championsActiveRegulation} learnsets at ${path.relative(rootDir, championsLearnsetsOutputFile)}`,
);
