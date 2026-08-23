import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Dex } from "@pkmn/dex";
import { Dex as SimulatorDex } from "@pkmn/sim";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const learnsetsPath = resolve(repositoryRoot, "public/data/champions-learnsets.json");
const packagePath = resolve(repositoryRoot, "node_modules/@pkmn/dex/package.json");
const simulatorPackagePath = resolve(repositoryRoot, "node_modules/@pkmn/sim/package.json");
const outputDirectory = resolve(repositoryRoot, "native/ChampionsAdvisorHost/engine/data");
const outputPath = resolve(outputDirectory, "champions-mechanics-v1.json");
const checksumPath = `${outputPath}.sha256`;
const championsNatureOrder = [
  "hardy",
  "lonely",
  "brave",
  "adamant",
  "naughty",
  "bold",
  "docile",
  "relaxed",
  "impish",
  "lax",
  "timid",
  "hasty",
  "serious",
  "jolly",
  "naive",
  "modest",
  "mild",
  "quiet",
  "bashful",
  "rash",
  "calm",
  "gentle",
  "sassy",
  "careful",
  "quirky",
];

function sortByNumberThenId(left, right) {
  return left.num - right.num || left.id.localeCompare(right.id);
}

function compactJsonValue(value) {
  if (value === undefined || typeof value === "function") {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(compactJsonValue).filter((entry) => entry !== undefined);
  }
  if (value && typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      const compacted = compactJsonValue(value[key]);
      if (compacted !== undefined) {
        output[key] = compacted;
      }
    }
    return output;
  }
  return value;
}

function callbackKeys(effect) {
  return Object.keys(effect)
    .filter((key) => typeof effect[key] === "function")
    .sort((left, right) => left.localeCompare(right));
}

function normalizeMultihit(raw) {
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 1) {
    return raw;
  }
  if (
    Array.isArray(raw) &&
    raw.length === 2 &&
    raw.every((value) => Number.isInteger(value) && value > 0) &&
    raw[1] >= raw[0]
  ) {
    return raw[0] === raw[1] ? raw[0] : raw;
  }
  return null;
}

function abilityReference(slot, name) {
  const ability = Dex.abilities.get(name);
  return {
    slot,
    num: ability.num,
    id: ability.id,
    name: ability.name,
  };
}

function moveRecord(move) {
  const simulatorMove = SimulatorDex.moves.get(move.id);
  return compactJsonValue({
    num: move.num,
    id: move.id,
    name: move.name,
    type: move.type,
    category: move.category,
    basePower: move.basePower,
    accuracy: move.accuracy,
    pp: move.pp,
    noPpBoosts: move.noPPBoosts || false,
    priority: move.priority,
    target: move.target,
    callbackKeys: callbackKeys(simulatorMove),
    multihit: normalizeMultihit(move.multihit),
    flags: move.flags || {},
    critRatio: move.critRatio,
    willCrit: move.willCrit || false,
    damage: move.damage,
    status: move.status,
    volatileStatus: move.volatileStatus,
    boosts: move.boosts,
    self: move.self,
    secondaries: move.secondaries,
    weather: move.weather,
    sideCondition: move.sideCondition,
    slotCondition: move.slotCondition,
    pseudoWeather: move.pseudoWeather,
    heal: move.heal,
    drain: move.drain,
    recoil: move.recoil,
    selfDestruct: move.selfdestruct,
    breaksProtect: move.breaksProtect || false,
    forceSwitch: move.forceSwitch || false,
    selfSwitch: move.selfSwitch,
    ignoreAbility: move.ignoreAbility || false,
    ignoreDefensive: move.ignoreDefensive || false,
    ignoreEvasion: move.ignoreEvasion || false,
    ignoreImmunity: move.ignoreImmunity || false,
    ignoreNegativeOffensive: move.ignoreNegativeOffensive || false,
    ignoreOffensive: move.ignoreOffensive || false,
    ignorePositiveDefensive: move.ignorePositiveDefensive || false,
    multiAccuracy: move.multiaccuracy || false,
    shortDesc: move.shortDesc || "",
    desc: move.desc || "",
  });
}

const [learnsetsDocument, dexPackageDocument, simulatorPackageDocument] = await Promise.all([
  readFile(learnsetsPath, "utf8").then(JSON.parse),
  readFile(packagePath, "utf8").then(JSON.parse),
  readFile(simulatorPackagePath, "utf8").then(JSON.parse),
]);

const legalSpeciesIds = [...new Set(learnsetsDocument.learnsets.map((entry) => entry.speciesId))];
const systemMoveIds = ["struggle"];
const legalMoveIds = [
  ...new Set([
    ...learnsetsDocument.learnsets.flatMap((entry) => entry.moveIds),
    ...systemMoveIds,
  ]),
];

const species = legalSpeciesIds
  .map((speciesId) => Dex.species.get(speciesId))
  .filter((entry) => entry.exists && entry.num > 0)
  .map((entry) => ({
    num: entry.num,
    id: entry.id,
    name: entry.name,
    baseSpecies: entry.baseSpecies,
    forme: entry.forme || null,
    types: entry.types,
    baseStats: entry.baseStats,
    abilities: Object.entries(entry.abilities)
      .map(([slot, name]) => abilityReference(slot, name))
      .sort((left, right) => left.slot.localeCompare(right.slot)),
    heightM: entry.heightm ?? null,
    weightKg: entry.weightkg ?? null,
  }))
  .sort(sortByNumberThenId);

const abilities = Dex.abilities
  .all()
  .filter((entry) => entry.exists && entry.num > 0)
  .map((entry) => {
    const simulatorAbility = SimulatorDex.abilities.get(entry.id);
    return {
      num: entry.num,
      id: entry.id,
      name: entry.name,
      callbackKeys: callbackKeys(simulatorAbility),
      flags: compactJsonValue(simulatorAbility.flags || {}),
      shortDesc: entry.shortDesc || "",
      desc: entry.desc || "",
    };
  })
  .sort(sortByNumberThenId);

const items = Dex.items
  .all()
  .filter((entry) => entry.exists && entry.num > 0)
  .map((entry) => {
    const simulatorItem = SimulatorDex.items.get(entry.id);
    return {
      num: entry.num,
      id: entry.id,
      name: entry.name,
      megaStone: Object.fromEntries(
        Object.entries(entry.megaStone || {}).map(([baseSpecies, megaSpecies]) => [
          Dex.species.get(baseSpecies).id,
          Dex.species.get(megaSpecies).id,
        ]),
      ),
      callbackKeys: callbackKeys(simulatorItem),
      fling: compactJsonValue(entry.fling),
      naturalGift: compactJsonValue(entry.naturalGift),
      shortDesc: entry.shortDesc || "",
      desc: entry.desc || "",
    };
  })
  .sort(sortByNumberThenId);

const moves = legalMoveIds
  .map((moveId) => Dex.moves.get(moveId))
  .filter((entry) => entry.exists && entry.num > 0)
  .map(moveRecord)
  .sort(sortByNumberThenId);

const natures = Dex.natures
  .all()
  .filter((entry) => entry.exists)
  .map((entry) => {
    const championsMdId = championsNatureOrder.indexOf(entry.id);
    if (championsMdId < 0) {
      throw new Error(`Nature ${entry.id} is missing from the Champions nature table`);
    }
    return {
      id: entry.id,
      name: entry.name,
      championsMdId,
      plus: entry.plus || null,
      minus: entry.minus || null,
    };
  })
  .sort((left, right) => left.id.localeCompare(right.id));

const types = Dex.types
  .all()
  .filter((entry) => entry.exists && !entry.isNonstandard)
  .map((entry) => ({
    id: entry.id,
    name: entry.name,
    damageTaken: Object.fromEntries(
      Object.entries(entry.damageTaken).sort(([left], [right]) => left.localeCompare(right)),
    ),
  }))
  .sort((left, right) => left.id.localeCompare(right.id));

const pack = {
  schemaVersion: 1,
  ruleset: "pokemon-champions-doubles-v1",
  source: {
    package: "@pkmn/dex",
    version: dexPackageDocument.version,
    simulatorPackage: "@pkmn/sim",
    simulatorVersion: simulatorPackageDocument.version,
    generation: 9,
    learnsetRegulation: learnsetsDocument.meta.regulation,
    learnsetRegulationWindow: learnsetsDocument.meta.regulationWindow,
  },
  runtimeIdSemantics: {
    PokemonDataPersonalId: "species.num",
    MoveSlotDataMdId: "move.num",
    PokemonDataAbilityMdId: "ability.num",
    PokemonDataItemMdId: "item.num; -1 means redacted or unknown",
  },
  runtimeEnums: {
    weather: {
      none: 0,
      sunnyDay: 1,
      rain: 2,
      snow: 3,
      sandstorm: 4,
      heavyRain: 5,
      harshSunlight: 6,
      turbulence: 7,
      hail: 8,
    },
  },
  damageTakenCodes: {
    neutral: 0,
    weak: 1,
    resistant: 2,
    immune: 3,
  },
  limits: {
    teams: 2,
    pokemonPerTeam: 6,
    selectedPokemonPerTeam: 4,
    activePokemonPerTeam: 2,
    movesPerPokemon: 4,
    statStageMinimum: -6,
    statStageMaximum: 6,
    hpRatioBasisPoints: 10000,
  },
  statRules: {
    level: 50,
    hpBaselineBonus: 75,
    otherStatBaselineBonus: 20,
    maximumPointsPerStat: 32,
    totalPoints: 66,
    natureBoostNumerator: 11,
    natureDropNumerator: 9,
    natureDenominator: 10,
  },
  damageRules: {
    levelFactor: 22,
    spreadNumerator: 3,
    spreadDenominator: 4,
    randomMinimum: 85,
    randomMaximum: 100,
    randomDenominator: 100,
    stabNumerator: 3,
    stabDenominator: 2,
  },
  counts: {
    species: species.length,
    abilities: abilities.length,
    items: items.length,
    moves: moves.length,
    natures: natures.length,
    types: types.length,
  },
  types,
  natures,
  species,
  abilities,
  items,
  moves,
};

const serialized = `${JSON.stringify(pack, null, 2)}\n`;
const checksum = createHash("sha256").update(serialized).digest("hex");
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(outputPath, serialized, "utf8"),
  writeFile(checksumPath, `${checksum}  champions-mechanics-v1.json\n`, "utf8"),
]);

console.log(
  `Generated mechanics pack: ${species.length} species, ${abilities.length} abilities, ${items.length} items, ${moves.length} moves`,
);
console.log(`SHA-256 ${checksum}`);
