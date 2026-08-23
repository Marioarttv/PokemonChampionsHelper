import { describe, expect, it } from "vitest";
import { calculateRoughDamage } from "../damage";
import { getDefaultDamageAbilityId } from "../damageAbilities";
import { getDamageItemOptions, normalizeDamageItemId } from "../damageItems";
import { makePokemon } from "../engine/__tests__/fixtures";

describe("damage ability handling", () => {
  it("applies Adaptability for Basculegion STAB damage", () => {
    const basculegion = makePokemon("Basculegion", {
      types: ["Water", "Ghost"],
      baseStats: { atk: 112 },
      abilities: { "0": "Swift Swim", "1": "Adaptability", H: "Mold Breaker" },
    });
    const defender = makePokemon("Neutral Target", {
      types: ["Normal"],
      baseStats: { hp: 100, def: 100 },
    });

    const defaultAbility = getDefaultDamageAbilityId(basculegion);
    const adaptabilityEstimate = calculateRoughDamage({
      attacker: basculegion,
      defender,
      attackType: "water",
      moveName: "Wave Crash",
      basePower: 120,
      category: "physical",
      isSpreadMove: false,
      attackerAbility: defaultAbility,
    });
    const normalStabEstimate = calculateRoughDamage({
      attacker: basculegion,
      defender,
      attackType: "water",
      moveName: "Wave Crash",
      basePower: 120,
      category: "physical",
      isSpreadMove: false,
      attackerAbility: "none",
    });

    expect(defaultAbility).toBe("adaptability");
    expect(adaptabilityEstimate.stabMultiplier).toBe(2);
    expect(normalStabEstimate.stabMultiplier).toBe(1.5);
    expect(adaptabilityEstimate.maxDamage).toBeGreaterThan(normalStabEstimate.maxDamage);
  });

  it("applies Parental Bond for Mega Kangaskhan damage", () => {
    const megaKangaskhan = makePokemon("Kangaskhan-Mega", {
      types: ["Normal"],
      baseStats: { atk: 125 },
      abilities: { "0": "Parental Bond" },
    });
    const defender = makePokemon("Neutral Target", {
      types: ["Normal"],
      baseStats: { hp: 100, def: 100 },
    });

    const defaultAbility = getDefaultDamageAbilityId(megaKangaskhan);
    const parentalBondEstimate = calculateRoughDamage({
      attacker: megaKangaskhan,
      defender,
      attackType: "normal",
      moveName: "Double-Edge",
      basePower: 120,
      category: "physical",
      isSpreadMove: false,
      attackerAbility: defaultAbility,
    });
    const noAbilityEstimate = calculateRoughDamage({
      attacker: megaKangaskhan,
      defender,
      attackType: "normal",
      moveName: "Double-Edge",
      basePower: 120,
      category: "physical",
      isSpreadMove: false,
      attackerAbility: "none",
    });

    expect(defaultAbility).toBe("parentalbond");
    expect(parentalBondEstimate.attackerAbilityMultiplier).toBe(1.25);
    expect(parentalBondEstimate.maxDamage).toBeGreaterThan(noAbilityEstimate.maxDamage);
  });

  it("applies Tough Claws to Breaking Swipe for Mega Charizard X", () => {
    const megaCharizardX = makePokemon("Charizard-Mega-X", {
      types: ["Fire", "Dragon"],
      baseStats: { atk: 130 },
      abilities: { "0": "Tough Claws" },
    });
    const defender = makePokemon("Neutral Target", {
      types: ["Normal"],
      baseStats: { hp: 100, def: 100 },
    });

    const defaultAbility = getDefaultDamageAbilityId(megaCharizardX);
    const toughClawsEstimate = calculateRoughDamage({
      attacker: megaCharizardX,
      defender,
      attackType: "dragon",
      moveName: "Breaking Swipe",
      basePower: 60,
      category: "physical",
      isSpreadMove: true,
      attackerAbility: defaultAbility,
    });
    const noAbilityEstimate = calculateRoughDamage({
      attacker: megaCharizardX,
      defender,
      attackType: "dragon",
      moveName: "Breaking Swipe",
      basePower: 60,
      category: "physical",
      isSpreadMove: true,
      attackerAbility: "none",
    });

    expect(defaultAbility).toBe("toughclaws");
    expect(toughClawsEstimate.attackerAbilityMultiplier).toBe(1.3);
    expect(toughClawsEstimate.maxDamage).toBeGreaterThan(noAbilityEstimate.maxDamage);
  });

  it("applies Tough Claws to Ice Fang for Mega Aerodactyl", () => {
    const megaAerodactyl = makePokemon("Aerodactyl-Mega", {
      types: ["Rock", "Flying"],
      baseStats: { atk: 135 },
      abilities: { "0": "Tough Claws" },
    });
    const defender = makePokemon("Neutral Target", {
      types: ["Normal"],
      baseStats: { hp: 100, def: 100 },
    });

    const defaultAbility = getDefaultDamageAbilityId(megaAerodactyl);
    const toughClawsEstimate = calculateRoughDamage({
      attacker: megaAerodactyl,
      defender,
      attackType: "ice",
      moveName: "Ice Fang",
      basePower: 65,
      category: "physical",
      isSpreadMove: false,
      attackerAbility: defaultAbility,
    });
    const noAbilityEstimate = calculateRoughDamage({
      attacker: megaAerodactyl,
      defender,
      attackType: "ice",
      moveName: "Ice Fang",
      basePower: 65,
      category: "physical",
      isSpreadMove: false,
      attackerAbility: "none",
    });

    expect(defaultAbility).toBe("toughclaws");
    expect(toughClawsEstimate.attackerAbilityMultiplier).toBe(1.3);
    expect(toughClawsEstimate.maxDamage).toBeGreaterThan(noAbilityEstimate.maxDamage);
  });
});

describe("damage item handling", () => {
  it("includes Life Orb and applies its attacker damage boost", () => {
    const attacker = makePokemon("Life Orb Attacker", {
      types: ["Fire"],
      baseStats: { spa: 120 },
    });
    const defender = makePokemon("Neutral Target", {
      types: ["Normal"],
      baseStats: { hp: 100, spd: 100 },
    });

    const noItemEstimate = calculateRoughDamage({
      attacker,
      defender,
      attackType: "fire",
      moveName: "Flamethrower",
      basePower: 90,
      category: "special",
      isSpreadMove: false,
    });
    const lifeOrbEstimate = calculateRoughDamage({
      attacker,
      defender,
      attackType: "fire",
      moveName: "Flamethrower",
      basePower: 90,
      category: "special",
      isSpreadMove: false,
      attackerItem: "lifeorb",
    });

    expect(normalizeDamageItemId("Life Orb")).toBe("lifeorb");
    expect(getDamageItemOptions("attacker").some((item) => item.id === "lifeorb")).toBe(true);
    expect(lifeOrbEstimate.attackerItemMultiplier).toBe(1.3);
    expect(lifeOrbEstimate.maxDamage).toBeGreaterThan(noItemEstimate.maxDamage);
  });
});

describe("move-specific damage handling", () => {
  it.each([
    [0, 20],
    [9.9, 20],
    [10, 40],
    [24.9, 40],
    [25, 60],
    [49.9, 60],
    [50, 80],
    [99.9, 80],
    [100, 100],
    [199.9, 100],
    [200, 120],
    [999.9, 120],
  ])("resolves Low Kick against a %s kg target as %i BP", (weightkg, expectedBasePower) => {
    const attacker = makePokemon("Low Kick Attacker", {
      types: ["Fighting"],
      baseStats: { atk: 120 },
    });
    const defender = makePokemon("Weighted Target", {
      types: ["Normal"],
      baseStats: { hp: 100, def: 100 },
      weightkg,
    });

    const estimate = calculateRoughDamage({
      attacker,
      defender,
      attackType: "fighting",
      moveName: "Low Kick",
      basePower: 0,
      category: "physical",
      isSpreadMove: false,
    });

    expect(estimate.inputBasePower).toBe(0);
    expect(estimate.effectiveBasePower).toBe(expectedBasePower);
  });

  it("resolves Farigiraf's Grass Knot against Mega Swampert as 100 BP", () => {
    const farigiraf = makePokemon("Farigiraf", {
      types: ["Normal", "Psychic"],
      baseStats: { hp: 120, atk: 90, def: 70, spa: 110, spd: 70, spe: 60 },
      weightkg: 160,
    });
    const megaSwampert = makePokemon("Swampert-Mega", {
      types: ["Water", "Ground"],
      baseStats: { hp: 100, atk: 150, def: 110, spa: 95, spd: 110, spe: 70 },
      weightkg: 102,
    });

    const estimate = calculateRoughDamage({
      attacker: farigiraf,
      defender: megaSwampert,
      attackType: "grass",
      moveName: "Grass Knot",
      basePower: 0,
      category: "special",
      isSpreadMove: false,
    });

    expect(estimate.inputBasePower).toBe(0);
    expect(estimate.effectiveBasePower).toBe(100);
    expect(estimate.effectiveAttackType).toBe("grass");
    expect(estimate.typeMultiplier).toBe(4);
    expect(estimate.minDamage).toBeGreaterThan(0);
  });

  it.each(["Eruption", "Water Spout", "Dragon Energy"])(
    "%s scales from 150 BP with the user's current HP",
    (moveName) => {
    const attacker = makePokemon("HP Scaler", {
      types: [moveName === "Eruption" ? "Fire" : moveName === "Water Spout" ? "Water" : "Dragon"],
      baseStats: { hp: 100, spa: 120 },
    });
    const defender = makePokemon("Neutral Target", {
      types: ["Normal"],
      baseStats: { hp: 100, spd: 100 },
    });
    const full = calculateRoughDamage({
      attacker,
      defender,
      attackType: moveName === "Eruption" ? "fire" : moveName === "Water Spout" ? "water" : "dragon",
      moveName,
      basePower: 150,
      category: "special",
      isSpreadMove: true,
    });
    const currentHp = Math.ceil(full.attackerHp / 2);
    const damaged = calculateRoughDamage({
      attacker,
      defender,
      attackType: moveName === "Eruption" ? "fire" : moveName === "Water Spout" ? "water" : "dragon",
      moveName,
      basePower: 150,
      category: "special",
      isSpreadMove: true,
      attackerCurrentHp: currentHp,
    });
    const oneHp = calculateRoughDamage({
      attacker,
      defender,
      attackType: moveName === "Eruption" ? "fire" : moveName === "Water Spout" ? "water" : "dragon",
      moveName,
      basePower: 150,
      category: "special",
      isSpreadMove: true,
      attackerCurrentHp: 1,
    });

    expect(full.effectiveBasePower).toBe(150);
    expect(damaged.effectiveBasePower).toBe(Math.floor((currentHp * 150) / full.attackerHp));
    expect(oneHp.effectiveBasePower).toBe(1);
    },
  );

  it.each(["Flail", "Reversal"])("%s follows its user-HP power brackets", (moveName) => {
    const attacker = makePokemon("HP Bracket Attacker", {
      types: [moveName === "Flail" ? "Normal" : "Fighting"],
      baseStats: { hp: 100, atk: 120 },
    });
    const defender = makePokemon("Neutral Target", {
      types: ["Normal"],
      baseStats: { hp: 100, def: 100 },
    });
    const full = calculateRoughDamage({
      attacker,
      defender,
      attackType: moveName === "Flail" ? "normal" : "fighting",
      moveName,
      basePower: 0,
      category: "physical",
      isSpreadMove: false,
    });
    const oneHp = calculateRoughDamage({
      attacker,
      defender,
      attackType: moveName === "Flail" ? "normal" : "fighting",
      moveName,
      basePower: 0,
      category: "physical",
      isSpreadMove: false,
      attackerCurrentHp: 1,
    });

    expect(full.effectiveBasePower).toBe(20);
    expect(oneHp.effectiveBasePower).toBe(200);
  });

  it.each([
    ["Wring Out", 120, "special"],
    ["Crush Grip", 120, "physical"],
    ["Hard Press", 100, "physical"],
  ] as const)("%s scales with the target's current HP", (moveName, maximumPower, category) => {
    const attacker = makePokemon("Target HP Attacker", {
      types: [moveName === "Hard Press" ? "Steel" : "Normal"],
      baseStats: { atk: 120, spa: 120 },
    });
    const defender = makePokemon("HP Target", {
      types: ["Normal"],
      baseStats: { hp: 100, def: 100, spd: 100 },
    });
    const full = calculateRoughDamage({
      attacker,
      defender,
      attackType: moveName === "Hard Press" ? "steel" : "normal",
      moveName,
      basePower: 0,
      category,
      isSpreadMove: false,
    });
    const oneHp = calculateRoughDamage({
      attacker,
      defender,
      attackType: moveName === "Hard Press" ? "steel" : "normal",
      moveName,
      basePower: 0,
      category,
      isSpreadMove: false,
      defenderCurrentHp: 1,
    });

    expect(full.effectiveBasePower).toBe(maximumPower);
    expect(oneHp.effectiveBasePower).toBe(1);
  });

  it.each([
    ["sun", "fire"],
    ["rain", "water"],
    ["sand", "rock"],
    ["snow", "ice"],
  ] as const)("resolves Weather Ball as 100 BP %s weather damage", (weather, expectedType) => {
    const attacker = makePokemon("Weather Attacker", {
      types: ["Normal"],
      baseStats: { spa: 120 },
    });
    const defender = makePokemon("Neutral Target", {
      types: ["Normal"],
      baseStats: { hp: 100, spd: 100 },
    });

    const estimate = calculateRoughDamage({
      attacker,
      defender,
      attackType: "normal",
      moveName: "Weather Ball",
      basePower: 50,
      category: "special",
      isSpreadMove: false,
      weather,
    });

    expect(estimate.inputBasePower).toBe(50);
    expect(estimate.effectiveBasePower).toBe(100);
    expect(estimate.effectiveAttackType).toBe(expectedType);
  });

  it("keeps Weather Ball at its supplied power and type without weather", () => {
    const attacker = makePokemon("Weather Attacker", {
      types: ["Normal"],
      baseStats: { spa: 120 },
    });
    const defender = makePokemon("Neutral Target", {
      types: ["Normal"],
      baseStats: { hp: 100, spd: 100 },
    });

    const estimate = calculateRoughDamage({
      attacker,
      defender,
      attackType: "normal",
      moveName: "Weather Ball",
      basePower: 50,
      category: "special",
      isSpreadMove: false,
      weather: "none",
    });

    expect(estimate.effectiveBasePower).toBe(50);
    expect(estimate.effectiveAttackType).toBe("normal");
  });

  it("treats Mega Sol as user-only sun for Weather Ball even in rain", () => {
    const attacker = makePokemon("Meganium-Mega", {
      types: ["Grass", "Fairy"],
      baseStats: { spa: 120 },
    });
    const defender = makePokemon("Steel Target", {
      types: ["Steel"],
      baseStats: { hp: 100, spd: 100 },
    });

    const estimate = calculateRoughDamage({
      attacker,
      defender,
      attackType: "normal",
      moveName: "Weather Ball",
      basePower: 50,
      category: "special",
      isSpreadMove: false,
      weather: "rain",
      attackerAbilityName: "Mega Sol",
    });

    expect(estimate.effectiveBasePower).toBe(100);
    expect(estimate.effectiveAttackType).toBe("fire");
    expect(estimate.weatherMultiplier).toBe(1.5);
    expect(estimate.typeMultiplier).toBe(2);
  });
});

describe("screen damage handling", () => {
  const attacker = makePokemon("Screen Attacker", {
    types: ["Normal"],
    baseStats: { atk: 120, spa: 120 },
  });
  const defender = makePokemon("Screen Defender", {
    types: ["Normal"],
    baseStats: { hp: 100, def: 100, spd: 100 },
  });

  it("reduces physical damage through Reflect", () => {
    const noScreen = calculateRoughDamage({
      attacker,
      defender,
      attackType: "normal",
      moveName: "Body Slam",
      basePower: 85,
      category: "physical",
      isSpreadMove: false,
    });
    const reflect = calculateRoughDamage({
      attacker,
      defender,
      attackType: "normal",
      moveName: "Body Slam",
      basePower: 85,
      category: "physical",
      isSpreadMove: false,
      reflect: true,
    });

    expect(reflect.screenMultiplier).toBeCloseTo(2 / 3);
    expect(reflect.averageDamage).toBeLessThan(noScreen.averageDamage);
  });

  it("reduces special damage through Light Screen", () => {
    const noScreen = calculateRoughDamage({
      attacker,
      defender,
      attackType: "normal",
      moveName: "Hyper Voice",
      basePower: 90,
      category: "special",
      isSpreadMove: true,
    });
    const lightScreen = calculateRoughDamage({
      attacker,
      defender,
      attackType: "normal",
      moveName: "Hyper Voice",
      basePower: 90,
      category: "special",
      isSpreadMove: true,
      lightScreen: true,
    });

    expect(lightScreen.screenMultiplier).toBeCloseTo(2 / 3);
    expect(lightScreen.averageDamage).toBeLessThan(noScreen.averageDamage);
  });

  it("uses Aurora Veil as the active screen for both categories", () => {
    const estimate = calculateRoughDamage({
      attacker,
      defender,
      attackType: "normal",
      moveName: "Body Slam",
      basePower: 85,
      category: "physical",
      isSpreadMove: false,
      reflect: true,
      auroraVeil: true,
    });

    expect(estimate.screenMultiplier).toBeCloseTo(2 / 3);
  });
});

describe("multi-hit damage handling", () => {
  const attacker = makePokemon("Multihit Attacker", {
    types: ["Flying"],
    baseStats: { atk: 120 },
  });
  const defender = makePokemon("Multihit Target", {
    types: ["Normal"],
    baseStats: { hp: 100, def: 100 },
  });

  const baseInput = {
    attacker,
    defender,
    attackType: "flying" as const,
    moveName: "Dual Wingbeat",
    basePower: 40,
    category: "physical" as const,
    isSpreadMove: false,
  };

  it("treats moves with no multihit as a single hit", () => {
    const estimate = calculateRoughDamage(baseInput);
    expect(estimate.hits).toBe(1);
    expect(estimate.hitRange).toEqual({ min: 1, max: 1 });
    expect(estimate.minDamage).toBe(estimate.perHitMinDamage);
    expect(estimate.maxDamage).toBe(estimate.perHitMaxDamage);
  });

  it("doubles damage for Dual Wingbeat (fixed 2-hit)", () => {
    const single = calculateRoughDamage(baseInput);
    const dual = calculateRoughDamage({ ...baseInput, multihit: 2 });

    expect(dual.hits).toBe(2);
    expect(dual.hitRange).toEqual({ min: 2, max: 2 });
    expect(dual.perHitMaxDamage).toBe(single.maxDamage);
    expect(dual.maxDamage).toBe(Math.floor(single.maxDamage * 2));
    expect(dual.averagePercent).toBeCloseTo(single.averagePercent * 2);
  });

  it("uses the showdown 2-5 weighted average by default", () => {
    const estimate = calculateRoughDamage({
      ...baseInput,
      moveName: "Bullet Seed",
      multihit: [2, 5],
    });
    expect(estimate.hits).toBeCloseTo(3.1);
    expect(estimate.hitRange).toEqual({ min: 2, max: 5 });
  });

  it("forces max hits when Skill Link is active", () => {
    const standard = calculateRoughDamage({ ...baseInput, multihit: [2, 5] });
    const skillLink = calculateRoughDamage({
      ...baseInput,
      multihit: [2, 5],
      attackerAbility: "skilllink",
    });

    expect(skillLink.hits).toBe(5);
    expect(skillLink.averageDamage).toBeGreaterThan(standard.averageDamage);
  });

  it("forces 4-5 hits when Loaded Dice is held", () => {
    const standard = calculateRoughDamage({ ...baseInput, multihit: [2, 5] });
    const loaded = calculateRoughDamage({
      ...baseInput,
      multihit: [2, 5],
      attackerItem: "loadeddice",
    });

    expect(loaded.hits).toBeCloseTo(4.5);
    expect(loaded.averageDamage).toBeGreaterThan(standard.averageDamage);
  });

  it("ignores invalid multihit shapes", () => {
    const estimate = calculateRoughDamage({
      ...baseInput,
      multihit: [0, 0],
    });
    expect(estimate.hits).toBe(1);
  });
});

describe("Final Gambit damage handling", () => {
  const attacker = makePokemon("Final Gambit User", {
    types: ["Fighting"],
    baseStats: { hp: 100, spa: 120 },
  });
  const neutralDefender = makePokemon("Neutral Target", {
    types: ["Normal"],
    baseStats: { hp: 100, spd: 100 },
  });

  it("deals fixed damage equal to the user's current HP", () => {
    const estimate = calculateRoughDamage({
      attacker,
      defender: neutralDefender,
      attackType: "fighting",
      moveName: "Final Gambit",
      basePower: 0,
      category: "special",
      isSpreadMove: false,
      attackerCurrentHp: 123,
      helpingHand: true,
      lightScreen: true,
    });

    expect(estimate.fixedDamageSource).toBe("finalgambit");
    expect(estimate.attackerHp).toBe(123);
    expect(estimate.minDamage).toBe(123);
    expect(estimate.maxDamage).toBe(123);
    expect(estimate.averageDamage).toBe(123);
    expect(estimate.stabMultiplier).toBe(1);
    expect(estimate.helpingHandMultiplier).toBe(1);
    expect(estimate.screenMultiplier).toBe(1);
    expect(estimate.hits).toBe(1);
  });

  it("does no damage into Fighting immunity", () => {
    const ghostDefender = makePokemon("Ghost Target", {
      types: ["Ghost"],
      baseStats: { hp: 100, spd: 100 },
    });

    const estimate = calculateRoughDamage({
      attacker,
      defender: ghostDefender,
      attackType: "fighting",
      moveName: "Final Gambit",
      basePower: 0,
      category: "special",
      isSpreadMove: false,
      attackerCurrentHp: 123,
    });

    expect(estimate.typeMultiplier).toBe(0);
    expect(estimate.minDamage).toBe(0);
    expect(estimate.maxDamage).toBe(0);
    expect(estimate.averageDamage).toBe(0);
  });
});
