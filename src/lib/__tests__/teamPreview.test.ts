import { describe, expect, it } from "vitest";
import { recommendTeamPreview } from "../teamPreview";
import { createMoveLookup, makeMember, makeMove, makePokemon } from "../engine/__tests__/fixtures";

describe("team preview weather scoring", () => {
  it("keeps Drought Mega Charizard in the bring four into rain-heavy water teams", () => {
    const megaCharizardY = makePokemon("Charizard-Mega-Y", {
      types: ["Fire", "Flying"],
      baseStats: { spa: 159, spe: 100 },
      abilities: { "0": "Drought" },
    });
    const sneasler = makePokemon("Sneasler", {
      types: ["Fighting", "Poison"],
      baseStats: { atk: 130, spe: 120 },
    });
    const aerodactyl = makePokemon("Aerodactyl", {
      types: ["Rock", "Flying"],
      baseStats: { atk: 105, spe: 130 },
    });
    const incineroar = makePokemon("Incineroar", {
      types: ["Fire", "Dark"],
      baseStats: { atk: 115, spe: 60 },
      abilities: { "0": "Intimidate" },
    });
    const garchomp = makePokemon("Garchomp", {
      types: ["Dragon", "Ground"],
      baseStats: { atk: 130, spe: 102 },
    });
    const amoonguss = makePokemon("Amoonguss", {
      types: ["Grass", "Poison"],
      baseStats: { spa: 85, spe: 30 },
    });

    const pelipper = makePokemon("Pelipper", {
      types: ["Water", "Flying"],
      baseStats: { spa: 95, spe: 65 },
      abilities: { "0": "Drizzle" },
    });
    const ludicolo = makePokemon("Ludicolo", {
      types: ["Water", "Grass"],
      baseStats: { spa: 90, spe: 70 },
      abilities: { "0": "Swift Swim" },
    });
    const basculegion = makePokemon("Basculegion", {
      types: ["Water", "Ghost"],
      baseStats: { atk: 112, spe: 78 },
    });
    const kingdra = makePokemon("Kingdra", {
      types: ["Water", "Dragon"],
      baseStats: { spa: 95, spe: 85 },
      abilities: { "0": "Swift Swim" },
    });
    const ironHands = makePokemon("Iron Hands", {
      types: ["Fighting", "Electric"],
      baseStats: { atk: 140, spe: 50 },
    });
    const rillaboom = makePokemon("Rillaboom", {
      types: ["Grass"],
      baseStats: { atk: 125, spe: 85 },
    });

    const heatWave = makeMove("Heat Wave", {
      type: "Fire",
      category: "Special",
      basePower: 95,
      target: "allAdjacentFoes",
    });
    const solarBeam = makeMove("Solar Beam", {
      type: "Grass",
      category: "Special",
      basePower: 120,
    });
    const closeCombat = makeMove("Close Combat", {
      type: "Fighting",
      category: "Physical",
      basePower: 120,
    });
    const fakeOut = makeMove("Fake Out", {
      type: "Normal",
      category: "Physical",
      basePower: 40,
      priority: 3,
    });
    const rockSlide = makeMove("Rock Slide", {
      type: "Rock",
      category: "Physical",
      basePower: 75,
      target: "allAdjacentFoes",
    });
    const flareBlitz = makeMove("Flare Blitz", {
      type: "Fire",
      category: "Physical",
      basePower: 120,
    });
    const earthquake = makeMove("Earthquake", {
      type: "Ground",
      category: "Physical",
      basePower: 100,
      target: "allAdjacent",
    });
    const spore = makeMove("Spore", {
      type: "Grass",
      category: "Status",
      basePower: 0,
    });
    const hurricane = makeMove("Hurricane", {
      type: "Flying",
      category: "Special",
      basePower: 110,
    });
    const muddyWater = makeMove("Muddy Water", {
      type: "Water",
      category: "Special",
      basePower: 90,
      target: "allAdjacentFoes",
    });
    const hydroPump = makeMove("Hydro Pump", {
      type: "Water",
      category: "Special",
      basePower: 110,
    });
    const waveCrash = makeMove("Wave Crash", {
      type: "Water",
      category: "Physical",
      basePower: 120,
    });
    const grassyGlide = makeMove("Grassy Glide", {
      type: "Grass",
      category: "Physical",
      basePower: 70,
      priority: 1,
    });

    const recommendation = recommendTeamPreview({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: megaCharizardY,
          moveNames: ["Heat Wave", "Solar Beam"],
          abilityName: "Drought",
        }),
        makeMember({ side: "ally", slot: 1, pokemon: sneasler, moveNames: ["Close Combat", "Fake Out"] }),
        makeMember({ side: "ally", slot: 2, pokemon: aerodactyl, moveNames: ["Rock Slide"] }),
        makeMember({
          side: "ally",
          slot: 3,
          pokemon: incineroar,
          moveNames: ["Flare Blitz", "Fake Out"],
          abilityName: "Intimidate",
        }),
        makeMember({ side: "ally", slot: 4, pokemon: garchomp, moveNames: ["Earthquake", "Rock Slide"] }),
        makeMember({ side: "ally", slot: 5, pokemon: amoonguss, moveNames: ["Spore"] }),
      ],
      enemy: [
        makeMember({
          side: "enemy",
          slot: 0,
          pokemon: pelipper,
          moveNames: ["Hurricane", "Muddy Water"],
          abilityName: "Drizzle",
        }),
        makeMember({
          side: "enemy",
          slot: 1,
          pokemon: ludicolo,
          moveNames: ["Hydro Pump"],
          abilityName: "Swift Swim",
        }),
        makeMember({ side: "enemy", slot: 2, pokemon: basculegion, moveNames: ["Wave Crash"] }),
        makeMember({
          side: "enemy",
          slot: 3,
          pokemon: kingdra,
          moveNames: ["Hydro Pump"],
          abilityName: "Swift Swim",
        }),
        makeMember({ side: "enemy", slot: 4, pokemon: ironHands, moveNames: ["Close Combat"] }),
        makeMember({ side: "enemy", slot: 5, pokemon: rillaboom, moveNames: ["Grassy Glide", "Fake Out"] }),
      ],
      moveByKey: createMoveLookup(
        heatWave,
        solarBeam,
        closeCombat,
        fakeOut,
        rockSlide,
        flareBlitz,
        earthquake,
        spore,
        hurricane,
        muddyWater,
        hydroPump,
        waveCrash,
        grassyGlide,
      ),
      solverMode: "sparse",
      timeBudgetMs: 250,
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.bestFour).toContain(0);
    expect(recommendation?.reasons.some((reason) => reason.feature === "weather_control_value")).toBe(true);
  });
});
