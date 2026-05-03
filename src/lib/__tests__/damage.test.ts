import { describe, expect, it } from "vitest";
import { calculateRoughDamage } from "../damage";
import { getDefaultDamageAbilityId } from "../damageAbilities";
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
