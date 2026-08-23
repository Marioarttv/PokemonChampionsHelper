import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const mechanicsPath = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/engine/data/champions-mechanics-v1.json",
);
const learnsetsPath = resolve(repositoryRoot, "public/data/champions-learnsets.json");
const presetSourcePath = resolve(repositoryRoot, "src/data/championsMetaMovesetsRaw.ts");
const outputPath = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/engine/data/opponent-assumptions-v1.json",
);

const DISPLAY_NAME_OVERRIDES = {
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

const MOVE_NAME_ALIASES = {
  waterball: "weatherball",
};

const SUPPORT_MOVE_PRIORITY = [
  "protect",
  "fakeout",
  "tailwind",
  "trickroom",
  "wideguard",
  "helpinghand",
  "followme",
  "ragepowder",
];

function normalizeKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function championsMaximumPp(move) {
  // Champions exposes the fully boosted PP value directly. Most moves follow
  // 4 * (floor(base PP / 5) + 1), capped at 20; Protect is rebalanced to 8.
  if (move.id === "protect") return 8;
  return Math.min(20, 4 * (Math.floor(move.pp / 5) + 1));
}

function extractRawTemplate(source) {
  const startMarker = "String.raw`";
  const start = source.indexOf(startMarker);
  const end = source.lastIndexOf("`;");
  if (start < 0 || end <= start) {
    throw new Error(`Could not read the raw moveset template from ${presetSourcePath}`);
  }
  return source.slice(start + startMarker.length, end);
}

function parsePresetSource(source) {
  const [, ...blocks] = extractRawTemplate(source).trim().split(/\n\s*\n/);
  return blocks.flatMap((block) => {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const displayName = lines[0];
    const ability = lines.find((line) => line.startsWith("Ability: "))?.slice(9).trim();
    const item = lines.find((line) => line.startsWith("Item: "))?.slice(6).trim();
    const moves = lines
      .find((line) => line.startsWith("Moves: "))
      ?.slice(7)
      .split(" / ")
      .map((move) => move.trim());
    if (!displayName || !ability || !item || !moves?.length) {
      return [];
    }
    return [{
      speciesId: DISPLAY_NAME_OVERRIDES[displayName] ?? normalizeKey(displayName),
      displayName,
      ability,
      item,
      moves,
    }];
  });
}

function selectFallbackMoves(species, learnset, moveById) {
  const legalMoves = learnset.moveIds
    .map((id) => moveById.get(id))
    .filter(Boolean);
  const chosen = [];
  const add = (move) => {
    if (move && !chosen.some((entry) => entry.id === move.id) && chosen.length < 4) {
      chosen.push(move);
    }
  };
  const damaging = legalMoves
    .filter((move) => move.basePower > 0 && move.accuracy !== false)
    .sort((left, right) => {
      const leftStab = species.types.includes(left.type) ? 80 : 0;
      const rightStab = species.types.includes(right.type) ? 80 : 0;
      const leftAccuracy = left.accuracy === true ? 100 : Number(left.accuracy || 0);
      const rightAccuracy = right.accuracy === true ? 100 : Number(right.accuracy || 0);
      return rightStab + right.basePower + rightAccuracy / 10
        - (leftStab + left.basePower + leftAccuracy / 10);
    });
  damaging.slice(0, 3).forEach(add);
  SUPPORT_MOVE_PRIORITY.forEach((id) => add(legalMoves.find((move) => move.id === id)));
  legalMoves.forEach(add);
  return chosen;
}

function inferredTraining(moves) {
  const physical = moves
    .filter((move) => move.category === "Physical")
    .reduce((total, move) => total + Math.max(1, move.basePower), 0);
  const special = moves
    .filter((move) => move.category === "Special")
    .reduce((total, move) => total + Math.max(1, move.basePower), 0);
  if (physical > special) {
    return {
      natureId: "adamant",
      trainingPoints: {
        hp: 32,
        attack: 32,
        defense: 0,
        special_attack: 0,
        special_defense: 0,
        speed: 2,
      },
    };
  }
  if (special > physical) {
    return {
      natureId: "modest",
      trainingPoints: {
        hp: 32,
        attack: 0,
        defense: 0,
        special_attack: 32,
        special_defense: 0,
        speed: 2,
      },
    };
  }
  return {
    natureId: "hardy",
    trainingPoints: {
      hp: 32,
      attack: 0,
      defense: 16,
      special_attack: 0,
      special_defense: 16,
      speed: 2,
    },
  };
}

function resolveNamedId(name, records) {
  const key = normalizeKey(name);
  return records.find((entry) => normalizeKey(entry.name) === key || entry.id === key)?.id ?? null;
}

async function main() {
  const [pack, learnsets, presetSource] = await Promise.all([
    readFile(mechanicsPath, "utf8").then(JSON.parse),
    readFile(learnsetsPath, "utf8").then(JSON.parse),
    readFile(presetSourcePath, "utf8"),
  ]);
  const presets = parsePresetSource(presetSource);
  const presetBySpecies = new Map(presets.map((preset) => [preset.speciesId, preset]));
  const speciesById = new Map(pack.species.map((species) => [species.id, species]));
  const moveById = new Map(pack.moves.map((move) => [move.id, move]));

  const profiles = learnsets.learnsets.map((learnset) => {
    const species = speciesById.get(learnset.speciesId);
    if (!species) {
      throw new Error(`Learnset species ${learnset.speciesId} is absent from the mechanics pack`);
    }
    const preset = presetBySpecies.get(species.id);
    const presetMoves = preset?.moves
      .map((name) => MOVE_NAME_ALIASES[normalizeKey(name)] ?? normalizeKey(name))
      .map((id) => moveById.get(id))
      .filter(Boolean) ?? [];
    const moves = presetMoves.length > 0
      ? presetMoves.slice(0, 4)
      : selectFallbackMoves(species, learnset, moveById);
    if (moves.length === 0) {
      throw new Error(`Could not select an assumed move for ${species.id}`);
    }
    const training = inferredTraining(moves);
    const abilityId = preset
      ? resolveNamedId(preset.ability, pack.abilities)
      : species.abilities[0]?.id;
    const itemId = preset && normalizeKey(preset.item) !== "unknown"
      ? resolveNamedId(preset.item, pack.items)
      : "none";
    return {
      species_id: species.id,
      source: preset ? "meta_preset" : "learnset_fallback",
      current_item_id: itemId ?? "none",
      current_ability_id: abilityId ?? species.abilities[0]?.id,
      nature_id: training.natureId,
      training_points: training.trainingPoints,
      moves: moves.map((move) => {
        const maxPp = championsMaximumPp(move);
        return {
          move_id: move.id,
          current_pp: maxPp,
          max_pp: maxPp,
        };
      }),
    };
  });

  const document = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    regulation: learnsets.meta.regulation,
    source: "Pokemon Champions meta presets with legal-learnset fallbacks",
    reconciliation: "Observed snapshot fields override assumptions on every calculation.",
    profile_count: profiles.length,
    profiles,
  };
  const temporaryPath = `${outputPath}.incoming-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  console.log(`Wrote ${profiles.length} opponent assumption profiles to ${outputPath}`);
}

await main();
