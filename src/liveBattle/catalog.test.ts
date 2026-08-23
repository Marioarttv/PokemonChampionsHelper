import { describe, expect, it } from "vitest";
import {
  createChampionsCatalogIndex,
  formatWeatherName,
  resolveSnapshotSpecies,
} from "./catalog";
import type { ChampionsCatalog, SnapshotPokemon } from "./types";

const catalog: ChampionsCatalog = {
  species: [
    {
      num: 260,
      id: "swampert",
      name: "Swampert",
      baseSpecies: "Swampert",
      forme: null,
      types: ["Water", "Ground"],
    },
    {
      num: 260,
      id: "swampertmega",
      name: "Swampert-Mega",
      baseSpecies: "Swampert",
      forme: "Mega",
      types: ["Water", "Ground"],
    },
  ],
  moves: [
    { num: 834, id: "wavecrash", name: "Wave Crash", type: "Water", category: "Physical" },
  ],
  items: [{ num: 752, id: "swampertite", name: "Swampertite" }],
  abilities: [{ num: 33, id: "swiftswim", name: "Swift Swim" }],
  weather: { none: 0, rain: 2, heavyRain: 5 },
};

function pokemon(megaMode: boolean): SnapshotPokemon {
  return {
    personal_id: 260,
    form_no: 0,
    group_index: 0,
    side_index: 0,
    position_index: 0,
    is_local_team: true,
    current_hp: 189,
    max_hp: 189,
    raw_hp_ratio: 10_000,
    fainted: false,
    status_condition: 0,
    item_md_id: 752,
    ability_md_id: 33,
    mega_mode: megaMode,
    needs_change: false,
    selection_order: 0,
    moves: [],
    stat_stages: {
      attack: 0,
      defense: 0,
      special_attack: 0,
      special_defense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
      critical: 0,
    },
    volatile_effects: [],
    field_effects: [],
  };
}

describe("Live Battle Lab catalog", () => {
  it("resolves the captured Mega flag to the Mega species entry", () => {
    const index = createChampionsCatalogIndex(catalog);
    expect(resolveSnapshotSpecies(pokemon(false), index)?.id).toBe("swampert");
    expect(resolveSnapshotSpecies(pokemon(true), index)?.id).toBe("swampertmega");
  });

  it("builds numeric mechanics lookups and readable weather labels", () => {
    const index = createChampionsCatalogIndex(catalog);
    expect(index.movesByNumber.get(834)?.name).toBe("Wave Crash");
    expect(index.itemsByNumber.get(752)?.name).toBe("Swampertite");
    expect(index.abilitiesByNumber.get(33)?.name).toBe("Swift Swim");
    expect(formatWeatherName(index.weatherByNumber.get(5))).toBe("Heavy Rain");
    expect(formatWeatherName(index.weatherByNumber.get(0))).toBe("Clear skies");
  });
});
