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
