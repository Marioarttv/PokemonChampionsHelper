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
});
