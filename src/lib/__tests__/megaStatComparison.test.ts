import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getMegaBasePokemon } from "../championsMegaForms";
import { getChampionsComputedStats, type ChampionsStatSpread } from "../championsStats";
import type { PokemonDatabase } from "../pokemonDb";
import type { BattleData } from "../battleData";

const database = JSON.parse(readFileSync("public/data/pokemon-db.json", "utf8")) as PokemonDatabase;
const battle = JSON.parse(readFileSync("public/data/battle-data.json", "utf8")) as BattleData;
const species = (id: string) => database.pokemon.find((entry) => entry.id === id)!;
const base = (id: string) => getMegaBasePokemon(species(id), database.pokemon, battle.items);

describe("Mega stat comparisons", () => {
  it("compares each Mega variant with the correct pre-Mega form", () => {
    for (const [mega, normal] of [
      ["salamencemega", "salamence"], ["garchompmega", "garchomp"], ["garchompmegaz", "garchomp"],
      ["charizardmegax", "charizard"], ["charizardmegay", "charizard"],
      ["meowsticfmega", "meowsticf"], ["meowsticmmega", "meowstic"], ["floettemega", "floetteeternal"],
    ]) expect(base(mega)?.id, mega).toBe(normal);
    expect(base("salamence")).toBeNull();
    expect(getMegaBasePokemon(species("salamencemega"), [], battle.items)).toBeNull();
    expect(species("salamencemega").baseStats.atk - base("salamencemega")!.baseStats.atk).toBe(10);
    expect(species("salamencemega").baseStats.def - base("salamencemega")!.baseStats.def).toBe(50);
    expect(species("garchompmega").baseStats.spe - base("garchompmega")!.baseStats.spe).toBe(-10);
  });

  it("isolates form changes at identical training and nature, including rounding", () => {
    const spread: ChampionsStatSpread = { nature: "adamant", statPoints: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } };
    const normal = getChampionsComputedStats(base("salamencemega")!, { spread });
    const mega = getChampionsComputedStats(species("salamencemega"), { spread });
    expect(mega.atk - normal.atk).toBe(11);
    expect(mega.def - normal.def).toBe(50);
    expect(mega.spa - normal.spa).toBe(9);
    expect(mega.hp - normal.hp).toBe(0);
  });
});
