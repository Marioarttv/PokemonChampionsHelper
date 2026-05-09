import { describe, expect, it } from "vitest";

import {
  getOpponentPreset,
  getOpponentPresetMoveNames,
  OPPONENT_MOVE_PRESET_KEY_SET,
} from "../opponentMovePresets";
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
});
