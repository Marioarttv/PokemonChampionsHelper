import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  getOpponentPreset,
  getOpponentPresetKnownMoves,
  getOpponentPresetMoveNames,
  OPPONENT_MOVE_PRESET_KEY_SET,
} from "../opponentMovePresets";
import type { MoveRecord } from "../battleData";
import type { PokemonRecord } from "../pokemonDb";

function makePokemon(options: Pick<PokemonRecord, "id" | "name" | "baseSpecies" | "forme">): PokemonRecord {
  return {
    ...options,
    num: 670,
    types: ["Fairy"],
    baseStats: { hp: 74, atk: 85, def: 87, spa: 155, spd: 148, spe: 102 },
    bst: 651,
    abilities: { "0": "Flower Veil" },
    heightm: null,
    weightkg: 100.8,
    color: null,
    prevo: null,
    evos: [],
    gen: 9,
    tier: "Illegal",
    doublesTier: "Illegal",
    isNonstandard: "Future",
  };
}

const REGULATION_MB_PRESETS = [
  {
    id: "vileplume",
    name: "Vileplume",
    baseSpecies: "Vileplume",
    forme: null,
    displayName: "Vileplume",
    itemName: "Big Root",
    moveNames: ["Giga Drain", "Sludge Bomb", "Sleep Powder", "Strength Sap"],
  },
  {
    id: "qwilfish",
    name: "Qwilfish",
    baseSpecies: "Qwilfish",
    forme: null,
    displayName: "Qwilfish",
    itemName: "Focus Sash",
    moveNames: ["Crunch", "Icy Wind", "Poison Jab", "Taunt"],
  },
  {
    id: "sceptilemega",
    name: "Sceptile-Mega",
    baseSpecies: "Sceptile",
    forme: "Mega",
    displayName: "Sceptile-Mega",
    itemName: "Sceptilite",
    moveNames: ["Dragon Claw", "Leaf Blade", "Protect", "Rock Slide"],
  },
  {
    id: "blazikenmega",
    name: "Blaziken-Mega",
    baseSpecies: "Blaziken",
    forme: "Mega",
    displayName: "Blaziken-Mega",
    itemName: "Blazikenite",
    moveNames: ["Close Combat", "Flare Blitz", "Protect", "Swords Dance"],
  },
  {
    id: "swampertmega",
    name: "Swampert-Mega",
    baseSpecies: "Swampert",
    forme: "Mega",
    displayName: "Swampert-Mega",
    itemName: "Swampertite",
    moveNames: ["High Horsepower", "Ice Punch", "Liquidation", "Protect"],
  },
  {
    id: "mawilemega",
    name: "Mawile-Mega",
    baseSpecies: "Mawile",
    forme: "Mega",
    displayName: "Mawile-Mega",
    itemName: "Mawilite",
    moveNames: ["Iron Head", "Play Rough", "Protect", "Sucker Punch"],
  },
  {
    id: "metagrossmega",
    name: "Metagross-Mega",
    baseSpecies: "Metagross",
    forme: "Mega",
    displayName: "Metagross-Mega",
    itemName: "Metagrossite",
    moveNames: ["Iron Head", "Protect", "Psychic Fangs", "Stomping Tantrum"],
  },
  {
    id: "staraptormega",
    name: "Staraptor-Mega",
    baseSpecies: "Staraptor",
    forme: "Mega",
    displayName: "Staraptor-Mega",
    itemName: "Staraptite",
    moveNames: ["Brave Bird", "Close Combat", "Double-Edge", "Protect"],
  },
  {
    id: "musharna",
    name: "Musharna",
    baseSpecies: "Musharna",
    forme: null,
    displayName: "Musharna",
    itemName: "Sitrus Berry",
    moveNames: ["Helping Hand", "Moonblast", "Protect", "Trick Room"],
  },
  {
    id: "scolipedemega",
    name: "Scolipede-Mega",
    baseSpecies: "Scolipede",
    forme: "Mega",
    displayName: "Scolipede-Mega",
    itemName: "Scolipite",
    moveNames: ["Megahorn", "Poison Jab", "Protect", "Swords Dance"],
  },
  {
    id: "scraftymega",
    name: "Scrafty-Mega",
    baseSpecies: "Scrafty",
    forme: "Mega",
    displayName: "Scrafty-Mega",
    itemName: "Scraftinite",
    moveNames: ["Drain Punch", "Fake Out", "Knock Off", "Protect"],
  },
  {
    id: "eelektrossmega",
    name: "Eelektross-Mega",
    baseSpecies: "Eelektross",
    forme: "Mega",
    displayName: "Eelektross-Mega",
    itemName: "Eelektrossite",
    moveNames: ["Flamethrower", "Giga Drain", "Protect", "Thunderbolt"],
  },
  {
    id: "pyroarmega",
    name: "Pyroar-Mega",
    baseSpecies: "Pyroar",
    forme: "Mega",
    displayName: "Pyroar-Mega",
    itemName: "Pyroarite",
    moveNames: ["Heat Wave", "Hyper Voice", "Protect", "Snarl"],
  },
  {
    id: "malamarmega",
    name: "Malamar-Mega",
    baseSpecies: "Malamar",
    forme: "Mega",
    displayName: "Malamar-Mega",
    itemName: "Malamarite",
    moveNames: ["Knock Off", "Protect", "Psycho Cut", "Superpower"],
  },
  {
    id: "barbaraclemega",
    name: "Barbaracle-Mega",
    baseSpecies: "Barbaracle",
    forme: "Mega",
    displayName: "Barbaracle-Mega",
    itemName: "Barbaracite",
    moveNames: ["Cross Chop", "Protect", "Rock Slide", "Shell Smash"],
  },
  {
    id: "dragalgemega",
    name: "Dragalge-Mega",
    baseSpecies: "Dragalge",
    forme: "Mega",
    displayName: "Dragalge-Mega",
    itemName: "Dragalgite",
    moveNames: ["Draco Meteor", "Hydro Pump", "Protect", "Sludge Bomb"],
  },
  {
    id: "grimmsnarl",
    name: "Grimmsnarl",
    baseSpecies: "Grimmsnarl",
    forme: null,
    displayName: "Grimmsnarl",
    itemName: "Light Clay",
    moveNames: ["Light Screen", "Reflect", "Spirit Break", "Thunder Wave"],
  },
  {
    id: "falinksmega",
    name: "Falinks-Mega",
    baseSpecies: "Falinks",
    forme: "Mega",
    displayName: "Falinks-Mega",
    itemName: "Falinksite",
    moveNames: ["Close Combat", "No Retreat", "Protect", "Throat Chop"],
  },
  {
    id: "overqwil",
    name: "Overqwil",
    baseSpecies: "Overqwil",
    forme: null,
    displayName: "Overqwil",
    itemName: "Black Sludge",
    moveNames: ["Barb Barrage", "Crunch", "Icy Wind", "Protect"],
  },
  {
    id: "houndstone",
    name: "Houndstone",
    baseSpecies: "Houndstone",
    forme: null,
    displayName: "Houndstone",
    itemName: "Spell Tag",
    moveNames: ["Last Respects", "Protect", "Shadow Sneak", "Will-O-Wisp"],
  },
  {
    id: "annihilape",
    name: "Annihilape",
    baseSpecies: "Annihilape",
    forme: null,
    displayName: "Annihilape",
    itemName: "Leftovers",
    moveNames: ["Bulk Up", "Drain Punch", "Protect", "Rage Fist"],
  },
  {
    id: "gholdengo",
    name: "Gholdengo",
    baseSpecies: "Gholdengo",
    forme: null,
    displayName: "Gholdengo",
    itemName: "Life Orb",
    moveNames: ["Make It Rain", "Nasty Plot", "Protect", "Shadow Ball"],
  },
] as const;

const battleData = JSON.parse(
  readFileSync(new URL("../../../public/data/battle-data.json", import.meta.url), "utf8"),
) as { moves: MoveRecord[]; items: Array<{ name: string }> };
const championsLearnsets = JSON.parse(
  readFileSync(new URL("../../../public/data/champions-learnsets.json", import.meta.url), "utf8"),
) as { learnsets: Array<{ speciesId: string; moveIds: string[] }> };
const moveByKey = new Map(battleData.moves.flatMap((move) => [[move.id, move], [move.name.toLowerCase(), move]] as const));
const itemNameSet = new Set(battleData.items.map((item) => item.name.toLowerCase()));
const learnsetBySpeciesId = new Map(
  championsLearnsets.learnsets.map((learnset) => [learnset.speciesId, new Set(learnset.moveIds)] as const),
);

describe("opponent move presets", () => {
  it("has presets for all previously missing current-regulation entries", () => {
    const expectedPresets = [
      ["Forretress", ["Body Press", "Iron Defense", "Protect", "Volt Switch"]],
      ["Rampardos", ["Hammer Arm", "Iron Head", "Protect", "Rock Slide"]],
      ["Samurott", ["Hydro Pump", "Ice Beam", "Substitute", "Vacuum Wave"]],
      ["Patrat", ["Super Fang", "Hypnosis", "Crunch", "Detect"]],
      ["Simisage", ["Bullet Seed", "Fake Out", "Rock Slide", "Taunt"]],
      ["Simipour", ["Fake Out", "Flip Turn", "Icy Wind", "Scald"]],
      ["Garbodor", ["Clear Smog", "Explosion", "Stockpile", "Toxic Spikes"]],
      ["Stunfisk", ["Earth Power", "Protect", "Thunder", "Thunderbolt"]],
      ["Floette", ["Calm Mind", "Dazzling Gleam", "Moonblast", "Protect"]],
      ["Furfrou", ["Cotton Guard", "Fire Fang", "Protect", "Sucker Punch"]],
      ["Slurpuff", ["Dazzling Gleam", "Helping Hand", "Protect", "String Shot"]],
      ["Toucannon", ["Beak Blast", "Brave Bird", "Bullet Seed", "Protect"]],
      ["Appletun", ["Apple Acid", "Dragon Pulse", "Leech Seed", "Protect"]],
      ["Sandaconda", ["Body Press", "High Horsepower", "Iron Defense", "Minimize"]],
      ["Polteageist", ["Giga Drain", "Protect", "Shadow Ball", "Trick Room"]],
    ] as const;

    for (const [name, moveNames] of expectedPresets) {
      const pokemon = makePokemon({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
        name,
        baseSpecies: name,
        forme: null,
      });

      expect(getOpponentPresetMoveNames(pokemon), name).toEqual(moveNames);
    }
  });

  it("keeps the Eternal Flower Floette preset available for the Eternal form", () => {
    const floetteEternal = makePokemon({
      id: "floetteeternal",
      name: "Floette-Eternal",
      baseSpecies: "Floette",
      forme: "Eternal",
    });

    expect(getOpponentPresetMoveNames(floetteEternal)).toEqual([
      "Calm Mind",
      "Dazzling Gleam",
      "Moonblast",
      "Protect",
    ]);
  });

  it("aliases the Eternal Flower Floette preset to Floette-Mega", () => {
    const floetteMega = makePokemon({
      id: "floettemega",
      name: "Floette-Mega",
      baseSpecies: "Floette",
      forme: "Mega",
    });

    const preset = getOpponentPreset(floetteMega);

    expect(preset?.displayName).toBe("Floette [Eternal Flower]");
    expect(preset?.itemName).toBe("Floettite");
    expect(getOpponentPresetMoveNames(floetteMega)).toEqual([
      "Calm Mind",
      "Dazzling Gleam",
      "Moonblast",
      "Protect",
    ]);
    expect(OPPONENT_MOVE_PRESET_KEY_SET.has("floettemega")).toBe(true);
  });

  it("has probable Regulation M-B presets with locally resolvable moves and items", () => {
    for (const entry of REGULATION_MB_PRESETS) {
      const pokemon = makePokemon(entry);
      const preset = getOpponentPreset(pokemon);
      const knownMoves = getOpponentPresetKnownMoves(pokemon, moveByKey);
      const learnsetMoveIds = learnsetBySpeciesId.get(entry.id);

      expect(preset?.displayName, entry.name).toBe(entry.displayName);
      expect(preset?.itemName, entry.name).toBe(entry.itemName);
      expect(getOpponentPresetMoveNames(pokemon), entry.name).toEqual(entry.moveNames);
      expect(knownMoves.map((move) => move.name), entry.name).toEqual(entry.moveNames);
      expect(itemNameSet.has(entry.itemName.toLowerCase()), entry.name).toBe(true);
      expect(learnsetMoveIds, entry.name).toBeDefined();

      for (const moveName of entry.moveNames) {
        const move = moveByKey.get(moveName.toLowerCase());
        expect(move, `${entry.name} ${moveName}`).toBeDefined();
        expect(learnsetMoveIds?.has(move!.id), `${entry.name} ${moveName}`).toBe(true);
      }
    }
  });

  it("aliases Regulation M-B Mega presets back to their base species", () => {
    const megaPresets = REGULATION_MB_PRESETS.filter((entry) => entry.forme === "Mega");

    for (const entry of megaPresets) {
      const basePokemon = makePokemon({
        id: entry.baseSpecies.toLowerCase().replace(/[^a-z0-9]+/g, ""),
        name: entry.baseSpecies,
        baseSpecies: entry.baseSpecies,
        forme: null,
      });

      expect(getOpponentPreset(basePokemon)?.displayName, entry.baseSpecies).toBe(entry.displayName);
      expect(getOpponentPresetMoveNames(basePokemon), entry.baseSpecies).toEqual(entry.moveNames);
    }
  });
});
