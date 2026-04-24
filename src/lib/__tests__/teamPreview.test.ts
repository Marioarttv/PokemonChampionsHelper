import { describe, expect, it } from "vitest";
import { recommendTeamPreview, type TeamPreviewOptions } from "../teamPreview";
import { createMoveLookup, makeCandidateMove, makeMember, makeMove, makePokemon } from "../engine/__tests__/fixtures";

const MOVES = {
  heatWave: makeMove("Heat Wave", { type: "Fire", category: "Special", basePower: 95, target: "allAdjacentFoes" }),
  solarBeam: makeMove("Solar Beam", { type: "Grass", category: "Special", basePower: 120 }),
  closeCombat: makeMove("Close Combat", { type: "Fighting", category: "Physical", basePower: 120 }),
  fakeOut: makeMove("Fake Out", { type: "Normal", category: "Physical", basePower: 40, priority: 3 }),
  rockSlide: makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" }),
  flareBlitz: makeMove("Flare Blitz", { type: "Fire", category: "Physical", basePower: 120 }),
  earthquake: makeMove("Earthquake", { type: "Ground", category: "Physical", basePower: 100, target: "allAdjacent" }),
  spore: makeMove("Spore", { type: "Grass", category: "Status", basePower: 0 }),
  hurricane: makeMove("Hurricane", { type: "Flying", category: "Special", basePower: 110 }),
  muddyWater: makeMove("Muddy Water", { type: "Water", category: "Special", basePower: 90, target: "allAdjacentFoes" }),
  hydroPump: makeMove("Hydro Pump", { type: "Water", category: "Special", basePower: 110 }),
  waveCrash: makeMove("Wave Crash", { type: "Water", category: "Physical", basePower: 120 }),
  grassyGlide: makeMove("Grassy Glide", { type: "Grass", category: "Physical", basePower: 70, priority: 1 }),
  moonblast: makeMove("Moonblast", { type: "Fairy", category: "Special", basePower: 95 }),
  iceBeam: makeMove("Ice Beam", { type: "Ice", category: "Special", basePower: 90 }),
  dragonClaw: makeMove("Dragon Claw", { type: "Dragon", category: "Physical", basePower: 80 }),
  meteorMash: makeMove("Meteor Mash", { type: "Steel", category: "Physical", basePower: 90 }),
  shadowBall: makeMove("Shadow Ball", { type: "Ghost", category: "Special", basePower: 80 }),
  taunt: makeMove("Taunt", { type: "Dark", category: "Status", basePower: 0 }),
  trickRoom: makeMove("Trick Room", { type: "Psychic", category: "Status", basePower: 0, target: "all" }),
  tailwind: makeMove("Tailwind", { type: "Flying", category: "Status", basePower: 0, target: "self" }),
  wideGuard: makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, priority: 3, target: "self" }),
  icyWind: makeMove("Icy Wind", { type: "Ice", category: "Special", basePower: 55, target: "allAdjacentFoes" }),
  protect: makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 }),
  psychic: makeMove("Psychic", { type: "Psychic", category: "Special", basePower: 90 }),
  eruption: makeMove("Eruption", { type: "Fire", category: "Special", basePower: 150, target: "allAdjacentFoes" }),
  dazzlingGleam: makeMove("Dazzling Gleam", { type: "Fairy", category: "Special", basePower: 80, target: "allAdjacentFoes" }),
  thunderbolt: makeMove("Thunderbolt", { type: "Electric", category: "Special", basePower: 90 }),
};

const MOVE_LOOKUP = createMoveLookup(...Object.values(MOVES));

function robustPreview(args: Omit<TeamPreviewOptions, "moveByKey">) {
  return recommendTeamPreview({
    solverMode: "robust",
    timeBudgetMs: 400,
    ...args,
    moveByKey: MOVE_LOOKUP,
  });
}

function topEnemyFoursContain(
  recommendation: NonNullable<ReturnType<typeof recommendTeamPreview>>,
  teamIndices: number[],
  topN = 2,
) {
  return (recommendation.predictedEnemyFours ?? []).slice(0, topN).some((entry) =>
    teamIndices.every((teamIndex) => entry.four.includes(teamIndex)),
  );
}

describe("team preview must-answer coverage", () => {
  it("keeps the only hard answer to a dragon or ground threat in the bring four and explains it", () => {
    const sylveon = makePokemon("Sylveon", { types: ["Fairy"], baseStats: { hp: 95, spa: 110, spd: 130, spe: 60 } });
    const incineroar = makePokemon("Incineroar", { types: ["Fire", "Dark"], baseStats: { atk: 115, spe: 60 }, abilities: { "0": "Intimidate" } });
    const amoonguss = makePokemon("Amoonguss", { types: ["Grass", "Poison"], baseStats: { hp: 114, spa: 85, spe: 30 } });
    const metagross = makePokemon("Metagross", { types: ["Steel", "Psychic"], baseStats: { atk: 135, spe: 70 } });
    const volcarona = makePokemon("Volcarona", { types: ["Bug", "Fire"], baseStats: { spa: 135, spe: 100 } });
    const grimmsnarl = makePokemon("Grimmsnarl", { types: ["Dark", "Fairy"], baseStats: { atk: 120, spe: 60 } });

    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { atk: 130, spe: 102 } });
    const pelipper = makePokemon("Pelipper", { types: ["Water", "Flying"], baseStats: { spa: 95, spe: 65 }, abilities: { "0": "Drizzle" } });
    const ironHands = makePokemon("Iron Hands", { types: ["Fighting", "Electric"], baseStats: { atk: 140, spe: 50 } });
    const amoongussEnemy = makePokemon("Amoonguss", { types: ["Grass", "Poison"], baseStats: { hp: 114, spa: 85, spe: 30 } });
    const gholdengo = makePokemon("Gholdengo", { types: ["Steel", "Ghost"], baseStats: { spa: 133, spe: 84 } });
    const rillaboom = makePokemon("Rillaboom", { types: ["Grass"], baseStats: { atk: 125, spe: 85 } });

    const recommendation = robustPreview({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: incineroar, moveNames: ["Fake Out", "Flare Blitz"], abilityName: "Intimidate" }),
        makeMember({ side: "ally", slot: 1, pokemon: amoonguss, moveNames: ["Spore"] }),
        makeMember({ side: "ally", slot: 2, pokemon: metagross, moveNames: ["Meteor Mash"] }),
        makeMember({ side: "ally", slot: 3, pokemon: volcarona, moveNames: ["Heat Wave"] }),
        makeMember({ side: "ally", slot: 4, pokemon: sylveon, moveNames: ["Moonblast", "Protect"] }),
        makeMember({ side: "ally", slot: 5, pokemon: grimmsnarl, moveNames: ["Taunt", "Fake Out"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: garchomp, moveNames: ["Earthquake", "Dragon Claw"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: pelipper, moveNames: ["Hurricane", "Muddy Water"], abilityName: "Drizzle" }),
        makeMember({ side: "enemy", slot: 2, pokemon: ironHands, moveNames: ["Close Combat", "Fake Out"] }),
        makeMember({ side: "enemy", slot: 3, pokemon: amoongussEnemy, moveNames: ["Spore"] }),
        makeMember({ side: "enemy", slot: 4, pokemon: gholdengo, moveNames: ["Shadow Ball"] }),
        makeMember({ side: "enemy", slot: 5, pokemon: rillaboom, moveNames: ["Grassy Glide", "Fake Out"] }),
      ],
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.bestFour).toContain(4);
    expect(
      recommendation?.mustAnswerThreats?.some(
        (threat) => /garchomp/i.test(threat.label) && threat.recommendedAnswerSlots.includes(4) && /only hard answer/i.test(threat.note),
      ),
    ).toBe(true);
    expect(recommendation?.uncoveredThreats?.length ?? 0).toBeLessThan(2);
  });
});

describe("team preview weather packages", () => {
  it("predicts the rain package and prioritizes weather control", () => {
    const megaCharizardY = makePokemon("Charizard-Mega-Y", {
      types: ["Fire", "Flying"],
      baseStats: { spa: 159, spe: 100 },
      abilities: { "0": "Drought" },
    });
    const sneasler = makePokemon("Sneasler", { types: ["Fighting", "Poison"], baseStats: { atk: 130, spe: 120 } });
    const aerodactyl = makePokemon("Aerodactyl", { types: ["Rock", "Flying"], baseStats: { atk: 105, spe: 130 } });
    const incineroar = makePokemon("Incineroar", { types: ["Fire", "Dark"], baseStats: { atk: 115, spe: 60 }, abilities: { "0": "Intimidate" } });
    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { atk: 130, spe: 102 } });
    const amoonguss = makePokemon("Amoonguss", { types: ["Grass", "Poison"], baseStats: { spa: 85, spe: 30 } });

    const pelipper = makePokemon("Pelipper", { types: ["Water", "Flying"], baseStats: { spa: 95, spe: 65 }, abilities: { "0": "Drizzle" } });
    const ludicolo = makePokemon("Ludicolo", { types: ["Water", "Grass"], baseStats: { spa: 90, spe: 70 }, abilities: { "0": "Swift Swim" } });
    const basculegion = makePokemon("Basculegion", { types: ["Water", "Ghost"], baseStats: { atk: 112, spe: 78 } });
    const kingdra = makePokemon("Kingdra", { types: ["Water", "Dragon"], baseStats: { spa: 95, spe: 85 }, abilities: { "0": "Swift Swim" } });
    const ironHands = makePokemon("Iron Hands", { types: ["Fighting", "Electric"], baseStats: { atk: 140, spe: 50 } });
    const rillaboom = makePokemon("Rillaboom", { types: ["Grass"], baseStats: { atk: 125, spe: 85 } });

    const recommendation = robustPreview({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: megaCharizardY, moveNames: ["Heat Wave", "Solar Beam"], abilityName: "Drought" }),
        makeMember({ side: "ally", slot: 1, pokemon: sneasler, moveNames: ["Close Combat", "Fake Out"] }),
        makeMember({ side: "ally", slot: 2, pokemon: aerodactyl, moveNames: ["Rock Slide"] }),
        makeMember({ side: "ally", slot: 3, pokemon: incineroar, moveNames: ["Flare Blitz", "Fake Out"], abilityName: "Intimidate" }),
        makeMember({ side: "ally", slot: 4, pokemon: garchomp, moveNames: ["Earthquake", "Rock Slide"] }),
        makeMember({ side: "ally", slot: 5, pokemon: amoonguss, moveNames: ["Spore"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: pelipper, moveNames: ["Hurricane", "Muddy Water"], abilityName: "Drizzle" }),
        makeMember({ side: "enemy", slot: 1, pokemon: ludicolo, moveNames: ["Hydro Pump"], abilityName: "Swift Swim" }),
        makeMember({ side: "enemy", slot: 2, pokemon: basculegion, moveNames: ["Wave Crash"] }),
        makeMember({ side: "enemy", slot: 3, pokemon: kingdra, moveNames: ["Hydro Pump"], abilityName: "Swift Swim" }),
        makeMember({ side: "enemy", slot: 4, pokemon: ironHands, moveNames: ["Close Combat"] }),
        makeMember({ side: "enemy", slot: 5, pokemon: rillaboom, moveNames: ["Grassy Glide", "Fake Out"] }),
      ],
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.bestFour).toContain(0);
    expect(recommendation?.primaryLead).toContain(0);
    expect(topEnemyFoursContain(recommendation!, [0, 1]) || topEnemyFoursContain(recommendation!, [0, 3])).toBe(true);
    expect(recommendation?.reasons.some((reason) => /weather/i.test(reason.label))).toBe(true);
  });
});

describe("team preview Trick Room packages", () => {
  it("values Taunt or Fake Out into an explicit Trick Room package", () => {
    const whimsicott = makePokemon("Whimsicott", { types: ["Grass", "Fairy"], baseStats: { spa: 77, spe: 116 } });
    const incineroar = makePokemon("Incineroar", { types: ["Fire", "Dark"], baseStats: { atk: 115, spe: 60 }, abilities: { "0": "Intimidate" } });
    const gholdengo = makePokemon("Gholdengo", { types: ["Steel", "Ghost"], baseStats: { spa: 133, spe: 84 } });
    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { atk: 130, spe: 102 } });
    const amoonguss = makePokemon("Amoonguss", { types: ["Grass", "Poison"], baseStats: { hp: 114, spa: 85, spe: 30 } });
    const hariyama = makePokemon("Hariyama", { types: ["Fighting"], baseStats: { hp: 144, atk: 120, spe: 50 } });

    const farigiraf = makePokemon("Farigiraf", { types: ["Normal", "Psychic"], baseStats: { hp: 120, spa: 110, spe: 60 } });
    const ursaluna = makePokemon("Ursaluna", { types: ["Ground", "Normal"], baseStats: { hp: 130, atk: 140, spe: 50 } });
    const torkoal = makePokemon("Torkoal", { types: ["Fire"], baseStats: { hp: 70, spa: 120, spe: 20 }, abilities: { "0": "Drought" } });
    const amoongussEnemy = makePokemon("Amoonguss", { types: ["Grass", "Poison"], baseStats: { hp: 114, spa: 85, spe: 30 } });
    const ironHands = makePokemon("Iron Hands", { types: ["Fighting", "Electric"], baseStats: { atk: 140, spe: 50 } });
    const pelipper = makePokemon("Pelipper", { types: ["Water", "Flying"], baseStats: { spa: 95, spe: 65 } });

    const recommendation = robustPreview({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: whimsicott, moveNames: ["Taunt", "Tailwind"] }),
        makeMember({ side: "ally", slot: 1, pokemon: incineroar, moveNames: ["Fake Out", "Flare Blitz"], abilityName: "Intimidate" }),
        makeMember({ side: "ally", slot: 2, pokemon: gholdengo, moveNames: ["Shadow Ball"] }),
        makeMember({ side: "ally", slot: 3, pokemon: garchomp, moveNames: ["Earthquake", "Dragon Claw"] }),
        makeMember({ side: "ally", slot: 4, pokemon: amoonguss, moveNames: ["Spore"] }),
        makeMember({ side: "ally", slot: 5, pokemon: hariyama, moveNames: ["Wide Guard", "Close Combat"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: farigiraf, moveNames: ["Trick Room", "Psychic"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: ursaluna, moveNames: ["Earthquake"] }),
        makeMember({ side: "enemy", slot: 2, pokemon: torkoal, moveNames: ["Eruption", "Heat Wave"], abilityName: "Drought" }),
        makeMember({ side: "enemy", slot: 3, pokemon: amoongussEnemy, moveNames: ["Spore"] }),
        makeMember({ side: "enemy", slot: 4, pokemon: ironHands, moveNames: ["Close Combat", "Fake Out"] }),
        makeMember({ side: "enemy", slot: 5, pokemon: pelipper, moveNames: ["Hurricane"] }),
      ],
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.bestFour.some((slot) => slot === 0 || slot === 1)).toBe(true);
    expect(topEnemyFoursContain(recommendation!, [0, 1])).toBe(true);
    expect(recommendation?.mustAnswerThreats?.some((threat) => /trick room/i.test(threat.label))).toBe(true);
  });
});

describe("team preview spread pressure", () => {
  it("surfaces Wide Guard value into spread plus speed-control packages", () => {
    const whimsicott = makePokemon("Whimsicott", { types: ["Grass", "Fairy"], baseStats: { spa: 77, spe: 116 } });
    const incineroar = makePokemon("Incineroar", { types: ["Fire", "Dark"], baseStats: { atk: 115, spe: 60 }, abilities: { "0": "Intimidate" } });
    const gholdengo = makePokemon("Gholdengo", { types: ["Steel", "Ghost"], baseStats: { spa: 133, spe: 84 } });
    const rotomWash = makePokemon("Rotom-Wash", { types: ["Electric", "Water"], baseStats: { spa: 105, spe: 86 } });
    const rillaboom = makePokemon("Rillaboom", { types: ["Grass"], baseStats: { atk: 125, spe: 85 } });
    const hariyama = makePokemon("Hariyama", { types: ["Fighting"], baseStats: { hp: 144, atk: 120, spe: 50 } });

    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { atk: 130, spe: 102 } });
    const talonflame = makePokemon("Talonflame", { types: ["Fire", "Flying"], baseStats: { atk: 81, spe: 126 } });
    const charizard = makePokemon("Charizard", { types: ["Fire", "Flying"], baseStats: { spa: 109, spe: 100 } });
    const pelipper = makePokemon("Pelipper", { types: ["Water", "Flying"], baseStats: { spa: 95, spe: 65 } });
    const ironHands = makePokemon("Iron Hands", { types: ["Fighting", "Electric"], baseStats: { atk: 140, spe: 50 } });
    const amoonguss = makePokemon("Amoonguss", { types: ["Grass", "Poison"], baseStats: { hp: 114, spa: 85, spe: 30 } });

    const recommendation = robustPreview({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: whimsicott, moveNames: ["Tailwind", "Taunt"] }),
        makeMember({ side: "ally", slot: 1, pokemon: incineroar, moveNames: ["Fake Out", "Flare Blitz"], abilityName: "Intimidate" }),
        makeMember({ side: "ally", slot: 2, pokemon: gholdengo, moveNames: ["Shadow Ball"] }),
        makeMember({ side: "ally", slot: 3, pokemon: rotomWash, moveNames: ["Hydro Pump", "Thunderbolt"] }),
        makeMember({ side: "ally", slot: 4, pokemon: rillaboom, moveNames: ["Grassy Glide", "Fake Out"] }),
        makeMember({ side: "ally", slot: 5, pokemon: hariyama, moveNames: ["Wide Guard", "Close Combat"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: garchomp, moveNames: ["Earthquake", "Rock Slide"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: talonflame, moveNames: ["Tailwind"] }),
        makeMember({ side: "enemy", slot: 2, pokemon: charizard, moveNames: ["Heat Wave"] }),
        makeMember({ side: "enemy", slot: 3, pokemon: pelipper, moveNames: ["Hurricane", "Muddy Water"] }),
        makeMember({ side: "enemy", slot: 4, pokemon: ironHands, moveNames: ["Close Combat", "Fake Out"] }),
        makeMember({ side: "enemy", slot: 5, pokemon: amoonguss, moveNames: ["Spore"] }),
      ],
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.bestFour).toContain(5);
    expect(topEnemyFoursContain(recommendation!, [0, 1]) || topEnemyFoursContain(recommendation!, [0, 2])).toBe(true);
  });

  it("keeps matchup-specific spread answers even when the ally four beam is narrow", () => {
    const whimsicott = makePokemon("Whimsicott", { types: ["Grass", "Fairy"], baseStats: { spa: 77, spe: 116 } });
    const incineroar = makePokemon("Incineroar", { types: ["Fire", "Dark"], baseStats: { atk: 115, spe: 60 }, abilities: { "0": "Intimidate" } });
    const gholdengo = makePokemon("Gholdengo", { types: ["Steel", "Ghost"], baseStats: { spa: 133, spe: 84 } });
    const rotomWash = makePokemon("Rotom-Wash", { types: ["Electric", "Water"], baseStats: { spa: 105, spe: 86 } });
    const rillaboom = makePokemon("Rillaboom", { types: ["Grass"], baseStats: { atk: 125, spe: 85 } });
    const hariyama = makePokemon("Hariyama", { types: ["Fighting"], baseStats: { hp: 144, atk: 120, spe: 50 } });

    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { atk: 130, spe: 102 } });
    const talonflame = makePokemon("Talonflame", { types: ["Fire", "Flying"], baseStats: { atk: 81, spe: 126 } });
    const charizard = makePokemon("Charizard", { types: ["Fire", "Flying"], baseStats: { spa: 109, spe: 100 } });
    const pelipper = makePokemon("Pelipper", { types: ["Water", "Flying"], baseStats: { spa: 95, spe: 65 } });
    const ironHands = makePokemon("Iron Hands", { types: ["Fighting", "Electric"], baseStats: { atk: 140, spe: 50 } });
    const amoonguss = makePokemon("Amoonguss", { types: ["Grass", "Poison"], baseStats: { hp: 114, spa: 85, spe: 30 } });

    const recommendation = robustPreview({
      allyFourCandidates: 1,
      maxThreatLines: 4,
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: whimsicott, moveNames: ["Tailwind", "Taunt"] }),
        makeMember({ side: "ally", slot: 1, pokemon: incineroar, moveNames: ["Fake Out", "Flare Blitz"], abilityName: "Intimidate" }),
        makeMember({ side: "ally", slot: 2, pokemon: gholdengo, moveNames: ["Shadow Ball"] }),
        makeMember({ side: "ally", slot: 3, pokemon: rotomWash, moveNames: ["Hydro Pump", "Thunderbolt"] }),
        makeMember({ side: "ally", slot: 4, pokemon: rillaboom, moveNames: ["Grassy Glide", "Fake Out"] }),
        makeMember({ side: "ally", slot: 5, pokemon: hariyama, moveNames: ["Wide Guard", "Close Combat"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: garchomp, moveNames: ["Earthquake", "Rock Slide"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: talonflame, moveNames: ["Tailwind"] }),
        makeMember({ side: "enemy", slot: 2, pokemon: charizard, moveNames: ["Heat Wave"] }),
        makeMember({ side: "enemy", slot: 3, pokemon: pelipper, moveNames: ["Hurricane", "Muddy Water"] }),
        makeMember({ side: "enemy", slot: 4, pokemon: ironHands, moveNames: ["Close Combat", "Fake Out"] }),
        makeMember({ side: "enemy", slot: 5, pokemon: amoonguss, moveNames: ["Spore"] }),
      ],
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.candidateCounts.allyFourCandidates).toBe(1);
    expect(recommendation?.bestFour).toContain(5);
  });
});

describe("team preview answer overload", () => {
  it("prefers a second answer when one slot would otherwise cover multiple top threats alone", () => {
    const incineroar = makePokemon("Incineroar", { types: ["Fire", "Dark"], baseStats: { atk: 115, spe: 60 }, abilities: { "0": "Intimidate" } });
    const rillaboom = makePokemon("Rillaboom", { types: ["Grass"], baseStats: { atk: 125, spe: 85 } });
    const metagross = makePokemon("Metagross", { types: ["Steel", "Psychic"], baseStats: { atk: 135, spe: 70 } });
    const rotomWash = makePokemon("Rotom-Wash", { types: ["Electric", "Water"], baseStats: { spa: 105, spe: 86 } });
    const sylveon = makePokemon("Sylveon", { types: ["Fairy"], baseStats: { hp: 95, spa: 110, spd: 130, spe: 60 } });
    const lapras = makePokemon("Lapras", { types: ["Water", "Ice"], baseStats: { hp: 130, spa: 85, spe: 60 } });

    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { atk: 130, spe: 102 } });
    const salamence = makePokemon("Salamence", { types: ["Dragon", "Flying"], baseStats: { atk: 135, spe: 100 } });
    const pelipper = makePokemon("Pelipper", { types: ["Water", "Flying"], baseStats: { spa: 95, spe: 65 }, abilities: { "0": "Drizzle" } });
    const ironHands = makePokemon("Iron Hands", { types: ["Fighting", "Electric"], baseStats: { atk: 140, spe: 50 } });
    const amoonguss = makePokemon("Amoonguss", { types: ["Grass", "Poison"], baseStats: { hp: 114, spa: 85, spe: 30 } });
    const gholdengo = makePokemon("Gholdengo", { types: ["Steel", "Ghost"], baseStats: { spa: 133, spe: 84 } });

    const recommendation = robustPreview({
      allyFourCandidates: 6,
      maxThreatLines: 6,
      maxLeadsPerFour: 3,
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: incineroar, moveNames: ["Fake Out", "Flare Blitz"], abilityName: "Intimidate" }),
        makeMember({ side: "ally", slot: 1, pokemon: rillaboom, moveNames: ["Grassy Glide", "Fake Out"] }),
        makeMember({ side: "ally", slot: 2, pokemon: metagross, moveNames: ["Meteor Mash"] }),
        makeMember({ side: "ally", slot: 3, pokemon: rotomWash, moveNames: ["Hydro Pump", "Thunderbolt"] }),
        makeMember({ side: "ally", slot: 4, pokemon: sylveon, moveNames: ["Moonblast"] }),
        makeMember({ side: "ally", slot: 5, pokemon: lapras, moveNames: ["Ice Beam", "Hydro Pump"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: garchomp, moveNames: ["Earthquake", "Dragon Claw"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: salamence, moveNames: ["Dragon Claw", "Tailwind"] }),
        makeMember({ side: "enemy", slot: 2, pokemon: pelipper, moveNames: ["Hurricane", "Muddy Water"], abilityName: "Drizzle" }),
        makeMember({ side: "enemy", slot: 3, pokemon: ironHands, moveNames: ["Close Combat", "Fake Out"] }),
        makeMember({ side: "enemy", slot: 4, pokemon: amoonguss, moveNames: ["Spore"] }),
        makeMember({ side: "enemy", slot: 5, pokemon: gholdengo, moveNames: ["Shadow Ball"] }),
      ],
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.bestFour).toContain(4);
    expect(recommendation?.bestFour).toContain(5);
  });
});

describe("team preview lead alignment", () => {
  it("leads the weather-control answer when the likely package pressures turn one", () => {
    const megaCharizardY = makePokemon("Charizard-Mega-Y", {
      types: ["Fire", "Flying"],
      baseStats: { spa: 159, spe: 100 },
      abilities: { "0": "Drought" },
    });
    const whimsicott = makePokemon("Whimsicott", { types: ["Grass", "Fairy"], baseStats: { spe: 116, spa: 77 } });
    const sneasler = makePokemon("Sneasler", { types: ["Fighting", "Poison"], baseStats: { atk: 130, spe: 120 } });
    const incineroar = makePokemon("Incineroar", { types: ["Fire", "Dark"], baseStats: { atk: 115, spe: 60 }, abilities: { "0": "Intimidate" } });
    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { atk: 130, spe: 102 } });
    const amoonguss = makePokemon("Amoonguss", { types: ["Grass", "Poison"], baseStats: { hp: 114, spa: 85, spe: 30 } });

    const pelipper = makePokemon("Pelipper", { types: ["Water", "Flying"], baseStats: { spa: 95, spe: 65 }, abilities: { "0": "Drizzle" } });
    const kingdra = makePokemon("Kingdra", { types: ["Water", "Dragon"], baseStats: { spa: 95, spe: 85 }, abilities: { "0": "Swift Swim" } });
    const ludicolo = makePokemon("Ludicolo", { types: ["Water", "Grass"], baseStats: { spa: 90, spe: 70 }, abilities: { "0": "Swift Swim" } });
    const basculegion = makePokemon("Basculegion", { types: ["Water", "Ghost"], baseStats: { atk: 112, spe: 78 } });
    const ironHands = makePokemon("Iron Hands", { types: ["Fighting", "Electric"], baseStats: { atk: 140, spe: 50 } });
    const rillaboom = makePokemon("Rillaboom", { types: ["Grass"], baseStats: { atk: 125, spe: 85 } });

    const recommendation = robustPreview({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: megaCharizardY, moveNames: ["Heat Wave", "Solar Beam"], abilityName: "Drought" }),
        makeMember({ side: "ally", slot: 1, pokemon: whimsicott, moveNames: ["Tailwind", "Taunt"] }),
        makeMember({ side: "ally", slot: 2, pokemon: sneasler, moveNames: ["Fake Out", "Close Combat"] }),
        makeMember({ side: "ally", slot: 3, pokemon: incineroar, moveNames: ["Fake Out", "Flare Blitz"], abilityName: "Intimidate" }),
        makeMember({ side: "ally", slot: 4, pokemon: garchomp, moveNames: ["Earthquake", "Rock Slide"] }),
        makeMember({ side: "ally", slot: 5, pokemon: amoonguss, moveNames: ["Spore"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: pelipper, moveNames: ["Hurricane", "Muddy Water"], abilityName: "Drizzle" }),
        makeMember({ side: "enemy", slot: 1, pokemon: kingdra, moveNames: ["Hydro Pump"], abilityName: "Swift Swim" }),
        makeMember({ side: "enemy", slot: 2, pokemon: ludicolo, moveNames: ["Hydro Pump"], abilityName: "Swift Swim" }),
        makeMember({ side: "enemy", slot: 3, pokemon: basculegion, moveNames: ["Wave Crash"] }),
        makeMember({ side: "enemy", slot: 4, pokemon: ironHands, moveNames: ["Close Combat"] }),
        makeMember({ side: "enemy", slot: 5, pokemon: rillaboom, moveNames: ["Grassy Glide", "Fake Out"] }),
      ],
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.primaryLead).toContain(0);
    expect((recommendation?.predictedEnemyFours ?? []).some((entry) => entry.lead?.includes(0) && entry.lead?.includes(1))).toBe(true);
  });
});

describe("team preview hidden-info beliefs", () => {
  it("uses candidate moves to respect a hidden Trick Room package", () => {
    const whimsicott = makePokemon("Whimsicott", { types: ["Grass", "Fairy"], baseStats: { spa: 77, spe: 116 } });
    const incineroar = makePokemon("Incineroar", { types: ["Fire", "Dark"], baseStats: { atk: 115, spe: 60 }, abilities: { "0": "Intimidate" } });
    const gholdengo = makePokemon("Gholdengo", { types: ["Steel", "Ghost"], baseStats: { spa: 133, spe: 84 } });
    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { atk: 130, spe: 102 } });
    const amoonguss = makePokemon("Amoonguss", { types: ["Grass", "Poison"], baseStats: { hp: 114, spa: 85, spe: 30 } });
    const hariyama = makePokemon("Hariyama", { types: ["Fighting"], baseStats: { hp: 144, atk: 120, spe: 50 } });

    const farigiraf = makePokemon("Farigiraf", { types: ["Normal", "Psychic"], baseStats: { hp: 120, spa: 110, spe: 60 } });
    const ursaluna = makePokemon("Ursaluna", { types: ["Ground", "Normal"], baseStats: { hp: 130, atk: 140, spe: 50 } });
    const torkoal = makePokemon("Torkoal", { types: ["Fire"], baseStats: { hp: 70, spa: 120, spe: 20 }, abilities: { "0": "Drought" } });
    const amoongussEnemy = makePokemon("Amoonguss", { types: ["Grass", "Poison"], baseStats: { hp: 114, spa: 85, spe: 30 } });
    const ironHands = makePokemon("Iron Hands", { types: ["Fighting", "Electric"], baseStats: { atk: 140, spe: 50 } });
    const pelipper = makePokemon("Pelipper", { types: ["Water", "Flying"], baseStats: { spa: 95, spe: 65 } });

    const recommendation = robustPreview({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: whimsicott, moveNames: ["Taunt", "Tailwind"] }),
        makeMember({ side: "ally", slot: 1, pokemon: incineroar, moveNames: ["Fake Out", "Flare Blitz"], abilityName: "Intimidate" }),
        makeMember({ side: "ally", slot: 2, pokemon: gholdengo, moveNames: ["Shadow Ball"] }),
        makeMember({ side: "ally", slot: 3, pokemon: garchomp, moveNames: ["Earthquake", "Dragon Claw"] }),
        makeMember({ side: "ally", slot: 4, pokemon: amoonguss, moveNames: ["Spore"] }),
        makeMember({ side: "ally", slot: 5, pokemon: hariyama, moveNames: ["Wide Guard", "Close Combat"] }),
      ],
      enemy: [
        makeMember({
          side: "enemy",
          slot: 0,
          pokemon: farigiraf,
          moveNames: ["Psychic"],
          candidateMoves: [makeCandidateMove("Trick Room", 0.85, "preset")],
        }),
        makeMember({ side: "enemy", slot: 1, pokemon: ursaluna, moveNames: ["Earthquake"] }),
        makeMember({ side: "enemy", slot: 2, pokemon: torkoal, moveNames: ["Eruption", "Heat Wave"], abilityName: "Drought" }),
        makeMember({ side: "enemy", slot: 3, pokemon: amoongussEnemy, moveNames: ["Spore"] }),
        makeMember({ side: "enemy", slot: 4, pokemon: ironHands, moveNames: ["Close Combat", "Fake Out"] }),
        makeMember({ side: "enemy", slot: 5, pokemon: pelipper, moveNames: ["Hurricane"] }),
      ],
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.bestFour.some((slot) => slot === 0 || slot === 1)).toBe(true);
    expect(recommendation?.mustAnswerThreats?.some((threat) => /trick room/i.test(threat.label))).toBe(true);
    expect(topEnemyFoursContain(recommendation!, [0, 1])).toBe(true);
  });
});

describe("team preview scenario-first diagnostics", () => {
  function makeSix(side: "ally" | "enemy", prefix: string) {
    return [
      makeMember({ side, slot: 0, pokemon: makePokemon(`${prefix} Fire`, { types: ["Fire"], baseStats: { spa: 120, spe: 100 } }), moveNames: ["Heat Wave"] }),
      makeMember({ side, slot: 1, pokemon: makePokemon(`${prefix} Water`, { types: ["Water"], baseStats: { spa: 110, spe: 85 } }), moveNames: ["Hydro Pump"] }),
      makeMember({ side, slot: 2, pokemon: makePokemon(`${prefix} Fighter`, { types: ["Fighting"], baseStats: { atk: 125, spe: 75 } }), moveNames: ["Close Combat"] }),
      makeMember({ side, slot: 3, pokemon: makePokemon(`${prefix} Dragon`, { types: ["Dragon"], baseStats: { atk: 125, spe: 102 } }), moveNames: ["Dragon Claw"] }),
      makeMember({ side, slot: 4, pokemon: makePokemon(`${prefix} Fairy`, { types: ["Fairy"], baseStats: { spa: 115, spe: 60 } }), moveNames: ["Moonblast"] }),
      makeMember({ side, slot: 5, pokemon: makePokemon(`${prefix} Support`, { types: ["Grass"], baseStats: { hp: 115, spe: 30 } }), moveNames: ["Spore"] }),
    ];
  }

  it("retains all ally and enemy fours in the scenario matrix for six-Pokemon teams", () => {
    const recommendation = robustPreview({
      ally: makeSix("ally", "Ally"),
      enemy: makeSix("enemy", "Enemy"),
      timeBudgetMs: 120,
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.scenarioMatrix?.allyFourCount).toBe(15);
    expect(recommendation?.scenarioMatrix?.enemyFourCount).toBe(15);
    expect(recommendation?.enemyBringDistribution).toHaveLength(15);
    expect(recommendation?.candidateCounts.enemyFourCandidates).toBe(15);
  });

  it("explains every omitted ally slot and exposes confidence diagnostics", () => {
    const recommendation = robustPreview({
      ally: makeSix("ally", "Ally"),
      enemy: makeSix("enemy", "Enemy"),
      timeBudgetMs: 120,
    });

    expect(recommendation).not.toBeNull();
    const omittedSlots = recommendation?.bestFour ? [0, 1, 2, 3, 4, 5].filter((slot) => !recommendation.bestFour.includes(slot)) : [];
    expect(recommendation?.omittedSlotExplanations?.map((entry) => entry.slotIndex).sort()).toEqual(omittedSlots);
    expect(recommendation?.confidence).toMatch(/high|medium|low/);
    expect(recommendation?.confidenceReasons?.length).toBeGreaterThan(0);
    expect(recommendation?.diagnostics.mechanicsSupportReport).toBeDefined();
  });
});
