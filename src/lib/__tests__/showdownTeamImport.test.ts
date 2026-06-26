import { describe, expect, it } from "vitest";
import { importShowdownTeamText } from "../showdownTeamImport";
import { createMoveLookup, makeMove, makePokemon } from "../engine/__tests__/fixtures";

describe("importShowdownTeamText", () => {
  it("keeps a Showdown mega set on its legal base species while tracking the active form", () => {
    const charizard = makePokemon("Charizard", {
      id: "charizard",
      baseSpecies: "Charizard",
      abilities: { "0": "Blaze", H: "Solar Power" },
    });
    const megaCharizardY = {
      ...makePokemon("Charizard-Mega-Y", {
        id: "charizardmegay",
        baseSpecies: "Charizard",
        abilities: { "0": "Drought" },
      }),
      forme: "Mega-Y",
    };
    const moveByKey = createMoveLookup(
      makeMove("Heat Wave", { id: "heatwave", type: "Fire", category: "Special", target: "allAdjacentFoes" }),
      makeMove("Protect", { id: "protect", type: "Normal", category: "Status", basePower: 0, target: "self" }),
    );

    const result = importShowdownTeamText(
      [
        "Charizard @ Charizardite Y",
        "Ability: Blaze",
        "Level: 50",
        "- Heat Wave",
        "- Protect",
      ].join("\n"),
      {
        pokemonEntries: [charizard, megaCharizardY],
        moveByKey,
        maxTeamSize: 6,
        maxMovesPerSlot: 4,
      },
    );

    expect(result.slots[0]).toMatchObject({
      query: "Charizard",
      pokemonId: "charizard",
      activeFormPokemonId: "charizardmegay",
      itemName: "Charizardite Y",
    });
    expect(result.importedPokemonCount).toBe(1);
    expect(result.unresolvedSpecies).toEqual([]);
  });

  it("uses Eternal Flower Floette as the base for Floettite imports", () => {
    const floette = makePokemon("Floette", {
      id: "floette",
      baseSpecies: "Floette",
      abilities: { "0": "Flower Veil" },
    });
    const floetteEternal = {
      ...makePokemon("Floette-Eternal", {
        id: "floetteeternal",
        baseSpecies: "Floette",
        abilities: { "0": "Flower Veil" },
      }),
      forme: "Eternal",
    };
    const floetteMega = {
      ...makePokemon("Floette-Mega", {
        id: "floettemega",
        baseSpecies: "Floette",
        abilities: { "0": "Flower Veil" },
      }),
      forme: "Mega",
    };

    const result = importShowdownTeamText("Floette @ Floettite", {
      pokemonEntries: [floette, floetteEternal, floetteMega],
      moveByKey: createMoveLookup(),
      maxTeamSize: 6,
      maxMovesPerSlot: 4,
    });

    expect(result.slots[0]).toMatchObject({
      query: "Floette-Eternal",
      pokemonId: "floetteeternal",
      activeFormPokemonId: "floettemega",
      itemName: "Floettite",
    });
    expect(result.importedPokemonCount).toBe(1);
    expect(result.unresolvedSpecies).toEqual([]);
  });

  it("imports Grass Knot as a zero-base-power damaging move", () => {
    const farigiraf = makePokemon("Farigiraf", {
      id: "farigiraf",
      baseSpecies: "Farigiraf",
      types: ["Normal", "Psychic"],
      baseStats: { hp: 120, atk: 90, def: 70, spa: 110, spd: 70, spe: 60 },
    });
    const moveByKey = createMoveLookup(
      makeMove("Grass Knot", { id: "grassknot", type: "Grass", category: "Special", basePower: 0, target: "normal" }),
    );

    const result = importShowdownTeamText(
      [
        "Farigiraf @ Colbur Berry",
        "Ability: Armor Tail",
        "Level: 50",
        "- Grass Knot",
      ].join("\n"),
      {
        pokemonEntries: [farigiraf],
        moveByKey,
        maxTeamSize: 6,
        maxMovesPerSlot: 4,
      },
    );

    expect(result.slots[0]?.savedAttacks?.[0]).toMatchObject({
      label: "Grass Knot",
      type: "grass",
      basePower: 0,
      category: "special",
    });
    expect(result.slots[0]?.knownMoves?.[0]).toMatchObject({
      label: "Grass Knot",
      type: "grass",
      basePower: 0,
      category: "special",
    });
  });
});
