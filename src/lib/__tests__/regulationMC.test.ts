import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET, normalizePokemonNameKey } from "../../data/championsLegalPokemon";
import { getOpponentPreset, getOpponentPresetKnownMoves } from "../opponentMovePresets";
import { inferMegaEvolutionItemName, isChampionsMegaEntry } from "../championsMegaForms";
import { calculateRoughDamage } from "../damage";
import { getDefaultChampionsStatSpreadForPokemon } from "../championsStats";
import { getDefaultDamageAbilityId } from "../damageAbilities";
import type { PokemonDatabase, PokemonRecord } from "../pokemonDb";
import type { BattleData } from "../battleData";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const source = read("data/regulation-m-c.json");
const database = read("public/data/pokemon-db.json") as PokemonDatabase;
const battle = read("public/data/battle-data.json") as BattleData;
const learnsets = read("public/data/champions-learnsets.json");
const pokemon = (id: string) => database.pokemon.find((entry) => entry.id === id)!;
const moves = new Map(battle.moves.map((move) => [move.name.toLowerCase(), move]));
const required = `wigglytuff persian persianalola farfetchd mrmime swalot absolmegaz salamence salamencemega garchompmegaz lucariomegaz gogoat golisopod golisopodmega rillaboom cinderace inteleon thievul toxtricity toxtricitylowkey grapploct perrserker sirfetchd pincurchin indeedee indeedeef pawmot arboliva squawkabilly squawkabillyblue squawkabillyyellow squawkabillywhite mabosstiff baxcalibur baxcaliburmega`.split(" ");

describe("Regulation M-C across the website data and selectors", () => {
  it("exposes every announced entry and its usable four-move preset", () => {
    expect(learnsets.meta.regulation).toBe("Regulation M-C");
    expect(Object.keys(source.presets).sort()).toEqual([...required].sort());
    for (const id of required) {
      const mon = pokemon(id);
      expect(mon, id).toBeDefined();
      expect(POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET.has(normalizePokemonNameKey(mon.baseSpecies)), id).toBe(true);
      const training = getDefaultChampionsStatSpreadForPokemon(mon);
      expect(training.nature, id).toBe(source.presets[id].nature);
      expect(Object.values(training.statPoints).reduce((sum, value) => sum + value, 0), id).toBe(66);
      expect(training.statPoints.spe, id).toBe(source.presets[id].trainingPoints.speed);
      const preset = getOpponentPreset(mon)!;
      expect(preset, id).toBeDefined();
      expect(Object.values(mon.abilities), id).toContain(preset.abilityName);
      expect(battle.items.some((item) => item.name === preset.itemName), id).toBe(true);
      const knownMoves = getOpponentPresetKnownMoves(mon, moves);
      expect(knownMoves.length, id).toBe(4);
      expect(knownMoves.map((move) => move.name), id).toEqual(preset.moveNames);
      const legal = learnsets.learnsets.find((entry: {speciesId: string}) => entry.speciesId === id).moveIds;
      for (const name of preset.moveNames) expect(legal, `${id}: ${name}`).toContain(moves.get(name.toLowerCase())!.id);
      if (preset.itemName === "Assault Vest") {
        expect(preset.moveNames.every((name) => moves.get(name.toLowerCase())!.category !== "Status"), id).toBe(true);
      }
    }
    expect(getOpponentPreset(pokemon("rillaboom"))!.moveNames).toEqual(["Wood Hammer", "Grassy Glide", "Fake Out", "Protect"]);
    expect(source.learnsets.rillaboom).toContain("uturn");
    expect(source.learnsets.indeedee).not.toContain("followme");
    expect(source.learnsets.indeedeef).toContain("followme");
    expect(learnsets.learnsets.some((entry: {speciesId: string}) => ["farfetchdgalar", "mrmimegalar"].includes(entry.speciesId))).toBe(false);
  });

  it("offers each new Mega with its actual ability and exact stone", () => {
    for (const [id, ability, stone] of [
      ["absolmegaz", "Sharpness", "Absolite Z"],
      ["garchompmegaz", "Levitate", "Garchompite Z"],
      ["lucariomegaz", "Aura Guard", "Lucarionite Z"],
      ["salamencemega", "Aerilate", "Salamencite"],
      ["golisopodmega", "Tough Claws", "Golisopite"],
      ["baxcaliburmega", "Thermal Exchange", "Baxcalibrite"],
    ]) {
      const mon = pokemon(id);
      expect(isChampionsMegaEntry(mon), id).toBe(true);
      expect(mon.abilities["0"], id).toBe(ability);
      expect(inferMegaEvolutionItemName(mon, battle.items), id).toBe(stone);
    }
    expect(inferMegaEvolutionItemName(pokemon("absolmega"), battle.items)).toBe("Absolite");
    expect(inferMegaEvolutionItemName(pokemon("charizardmegay"), battle.items)).toBe("Charizardite Y");
    expect(pokemon("golisopodmega").types).toEqual(["Bug", "Steel"]);
    expect(pokemon("lucariomegaz").baseStats.spe).toBe(151);
  });
});

const neutral = pokemon("mabosstiff");
const estimate = (attacker: PokemonRecord, extra: Partial<Parameters<typeof calculateRoughDamage>[0]> = {}) => calculateRoughDamage({
  attacker, defender: neutral, attackType: "normal", moveName: "Tackle", basePower: 40,
  category: "physical", isSpreadMove: false, ...extra,
});

describe("M-C damage mechanics", () => {
  it("uses Aura Guard only for contact, with Long Reach bypass", () => {
    expect(getDefaultDamageAbilityId(pokemon("lucariomegaz"))).toBe("auraguard");
    const contact = estimate(pokemon("rillaboom"), { defenderAbility: "auraguard" });
    const normal = estimate(pokemon("rillaboom"));
    expect(contact.defenderAbilityMultiplier).toBe(0.5);
    expect(contact.maxDamage).toBeLessThan(normal.maxDamage);
    expect(estimate(pokemon("rillaboom"), { defenderAbility: "auraguard", moveName: "Earthquake" }).defenderAbilityMultiplier).toBe(1);
    expect(estimate(pokemon("rillaboom"), { defenderAbility: "auraguard", attackerAbility: "longreach" }).defenderAbilityMultiplier).toBe(1);
  });

  it("uses move flags for the new contact, sound and slicing moves", () => {
    expect(estimate(pokemon("golisopodmega"), { moveName: "First Impression", attackerAbility: "toughclaws" }).attackerAbilityMultiplier).toBe(1.3);
    expect(estimate(pokemon("absolmegaz"), { moveName: "Night Slash", attackerAbility: "sharpness" }).attackerAbilityMultiplier).toBe(1.5);
    const sound = estimate(pokemon("toxtricity"), { moveName: "Boomburst", defenderAbility: "punkrock" });
    expect(sound.typeMultiplier).not.toBe(0);
    expect(sound.defenderAbilityMultiplier).toBe(0.5);
  });

  it("applies M-C item and terrain boosts without losing immunity", () => {
    const grassy = estimate(pokemon("rillaboom"), { attackType: "grass", moveName: "Grassy Glide", basePower: 55, terrain: "grassy", attackerItem: "miracleseed" });
    expect(grassy.attackerItemMultiplier).toBe(1.2);
    expect(grassy.terrainMultiplier).toBe(1.3);
    expect(estimate(pokemon("farfetchd"), { attackerItem: "normalgem" }).attackerItemMultiplier).toBe(1.3);
    expect(estimate(pokemon("garchomp"), { attackType: "ground", moveName: "Earthquake", defenderItem: "airballoon" }).maxDamage).toBe(0);
    expect(estimate(pokemon("garchomp"), { attackType: "ground", moveName: "Earthquake", terrain: "grassy" }).terrainMultiplier).toBe(0.5);
    const force = estimate(pokemon("indeedee"), { moveName: "Expanding Force", attackType: "psychic", basePower: 80, category: "special", terrain: "psychic" });
    expect(force.effectiveBasePower).toBe(120);
    expect(force.spreadMultiplier).toBe(0.75);
    const voltage = estimate(pokemon("pincurchin"), { moveName: "Rising Voltage", attackType: "electric", basePower: 70, category: "special", terrain: "electric" });
    expect(voltage.effectiveBasePower).toBe(140);
    expect(estimate(pokemon("sirfetchd"), { attackType: "fighting", attackerAbility: "scrappy", defender: pokemon("sinistcha") }).typeMultiplier).not.toBe(0);
  });
});
