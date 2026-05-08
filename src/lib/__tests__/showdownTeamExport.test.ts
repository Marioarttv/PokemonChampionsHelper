import { describe, expect, it } from "vitest";
import { exportShowdownTeamText } from "../showdownTeamExport";
import { createMoveLookup, makeMove, makePokemon } from "../engine/__tests__/fixtures";

describe("exportShowdownTeamText", () => {
  it("exports website team slots as paste-ready Showdown text", () => {
    const charizard = makePokemon("Charizard", {
      id: "charizard",
      baseSpecies: "Charizard",
      types: ["Fire", "Flying"],
      abilities: { "0": "Blaze", H: "Solar Power" },
    });
    const megaCharizardY = {
      ...makePokemon("Charizard-Mega-Y", {
        id: "charizardmegay",
        baseSpecies: "Charizard",
        types: ["Fire", "Flying"],
        abilities: { "0": "Drought" },
      }),
      forme: "Mega-Y",
    };
    const moveByKey = createMoveLookup(
      makeMove("Heat Wave", { id: "heatwave", type: "Fire", category: "Special", target: "allAdjacentFoes" }),
      makeMove("Protect", { id: "protect", type: "Normal", category: "Status", basePower: 0, target: "self" }),
    );

    const result = exportShowdownTeamText({
      moveByKey,
      slots: [
        {
          pokemon: charizard,
          battleFormPokemon: megaCharizardY,
          itemName: "Charizardite Y",
          abilityName: "Blaze",
          statSpread: {
            nature: "modest",
            statPoints: { hp: 0, atk: 0, def: 2, spa: 32, spd: 0, spe: 32 },
          },
          knownMoves: [
            { id: "move-1", name: "Heat Wave", label: "Heat Wave", category: "special" },
            { id: "move-2", name: "Protect", label: "Protect", category: "status" },
          ],
        },
      ],
    });

    expect(result.text).toBe([
      "Charizard @ Charizardite Y",
      "Ability: Blaze",
      "Level: 50",
      "EVs: 2 Def / 32 SpA / 32 Spe",
      "Modest Nature",
      "- Heat Wave",
      "- Protect",
    ].join("\n"));
    expect(result.exportedPokemonCount).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("falls back to confirmed saved attack labels for legacy teams", () => {
    const kyogre = makePokemon("Kyogre", {
      abilities: { "0": "Drizzle" },
      types: ["Water"],
    });
    const moveByKey = createMoveLookup(
      makeMove("Water Spout", { id: "waterspout", type: "Water", category: "Special", target: "allAdjacentFoes" }),
    );

    const result = exportShowdownTeamText({
      moveByKey,
      slots: [
        {
          pokemon: kyogre,
          savedAttacks: [
            { id: "move-1", label: "Water Spout", type: "water", category: "special" },
            { id: "move-2", label: "Water STAB", type: "water", category: "special" },
          ],
        },
      ],
    });

    expect(result.text).toContain("Ability: Drizzle");
    expect(result.text).toContain("- Water Spout");
    expect(result.text).not.toContain("- Water STAB");
    expect(result.warnings).toContain("Skipped \"Water STAB\" because it is not a confirmed Showdown move.");
  });
});
