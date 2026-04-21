import { describe, expect, it } from "vitest";
import {
  calculateChampionsOtherStat,
  getChampionsComputedStats,
  getChampionsTemplateIdForPokemon,
} from "../championsStats";
import type { PokemonRecord } from "../pokemonDb";

function makePokemon(
  name: string,
  baseStats: PokemonRecord["baseStats"],
  options?: Partial<Pick<PokemonRecord, "id" | "baseSpecies" | "types">>,
): PokemonRecord {
  return {
    id: options?.id ?? name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
    name,
    num: 1,
    baseSpecies: options?.baseSpecies ?? name,
    forme: null,
    types: options?.types ?? ["Normal"],
    baseStats,
    bst: Object.values(baseStats).reduce((sum, value) => sum + value, 0),
    abilities: { "0": "Pressure" },
    heightm: 1,
    weightkg: 50,
    color: null,
    prevo: null,
    evos: [],
    gen: 9,
    tier: null,
    doublesTier: null,
    isNonstandard: null,
  };
}

describe("Champions stat math", () => {
  it("computes template-derived Champions stats for a bulky support Incineroar spread", () => {
    const incineroar = makePokemon(
      "Incineroar",
      { hp: 95, atk: 115, def: 90, spa: 80, spd: 90, spe: 60 },
      { types: ["Fire", "Dark"] },
    );

    const stats = getChampionsComputedStats(incineroar, {
      templateId: "bulkySupport",
      baseStats: incineroar.baseStats,
    });

    expect(stats.hp).toBe(186);
    expect(stats.atk).toBe(121);
    expect(stats.def).toBe(132);
    expect(stats.spa).toBe(100);
    expect(stats.spd).toBe(117);
    expect(stats.spe).toBe(80);
  });

  it("preserves the neutral zero-point baseline implied by public Incineroar stats", () => {
    expect(calculateChampionsOtherStat(115, 0, 1)).toBe(135);
    expect(calculateChampionsOtherStat(90, 0, 1)).toBe(110);
    expect(calculateChampionsOtherStat(80, 0, 1)).toBe(100);
    expect(calculateChampionsOtherStat(60, 0, 1)).toBe(80);
  });

  it("shows the breakpoint behavior players see on nature-boosted stats", () => {
    expect(calculateChampionsOtherStat(115, 0, 1.1)).toBe(148);
    expect(calculateChampionsOtherStat(115, 1, 1.1)).toBe(149);
    expect(calculateChampionsOtherStat(115, 2, 1.1)).toBe(149);
  });
});

describe("Champions template assignment", () => {
  it("assigns intuitive templates to common roles", () => {
    const incineroar = makePokemon(
      "Incineroar",
      { hp: 95, atk: 115, def: 90, spa: 80, spd: 90, spe: 60 },
      { types: ["Fire", "Dark"] },
    );
    const garchomp = makePokemon(
      "Garchomp",
      { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
      { types: ["Dragon", "Ground"] },
    );
    const milotic = makePokemon(
      "Milotic",
      { hp: 95, atk: 60, def: 79, spa: 100, spd: 125, spe: 81 },
      { types: ["Water"] },
    );
    const farigiraf = makePokemon(
      "Farigiraf",
      { hp: 120, atk: 90, def: 70, spa: 110, spd: 70, spe: 60 },
      { types: ["Normal", "Psychic"] },
    );

    expect(getChampionsTemplateIdForPokemon(incineroar)).toBe("physicalPivot");
    expect(getChampionsTemplateIdForPokemon(garchomp)).toBe("fastPhysicalAttacker");
    expect(getChampionsTemplateIdForPokemon(milotic)).toBe("bulkySupport");
    expect(getChampionsTemplateIdForPokemon(farigiraf)).toBe("trickRoomSpecial");
  });
});
