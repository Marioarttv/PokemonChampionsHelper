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
});
