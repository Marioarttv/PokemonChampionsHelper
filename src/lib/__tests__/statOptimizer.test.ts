import { describe, expect, it } from "vitest";
import {
  buildTrainingStatSpread,
  evaluateTrainingBaseline,
  findOptimalTrainingSpreads,
  getDefensivePointTotal,
  getGuaranteedHitsSurvived,
  getKoThresholdLabel,
  getTrainingAttackBreakpointGains,
  getTrainingBreakpointGains,
  type TrainingOptimizerAttack,
} from "../statOptimizer";
import { getDefaultChampionsStatSpreadForPokemon } from "../championsStats";
import { makePokemon } from "../engine/__tests__/fixtures";

function makeTrainingAttack(
  overrides: Partial<TrainingOptimizerAttack> = {},
): TrainingOptimizerAttack {
  const attacker =
    overrides.attacker ??
    makePokemon("Physical Attacker", {
      types: ["Fighting"],
      baseStats: { atk: 135, spa: 70 },
    });

  return {
    id: overrides.id ?? "physical-attacker-close-combat",
    attacker,
    label: overrides.label ?? "Close Combat",
    type: overrides.type ?? "fighting",
    basePower: overrides.basePower ?? 120,
    category: overrides.category ?? "physical",
    isSpreadMove: overrides.isSpreadMove ?? false,
    attackerAbility: overrides.attackerAbility ?? "none",
    attackerItem: overrides.attackerItem ?? "none",
    attackerGrounded: overrides.attackerGrounded ?? true,
    attackerStatSpread: overrides.attackerStatSpread ?? null,
    movesetSource: overrides.movesetSource ?? "preset",
  };
}

describe("training stat optimizer", () => {
  it("uses strict worst-roll hit survival thresholds", () => {
    expect(getGuaranteedHitsSurvived(180, 180)).toBe(0);
    expect(getGuaranteedHitsSurvived(180, 179)).toBe(1);
    expect(getGuaranteedHitsSurvived(180, 90)).toBe(1);
    expect(getGuaranteedHitsSurvived(180, 89)).toBe(2);
    expect(getKoThresholdLabel(0)).toBe("OHKO");
    expect(getKoThresholdLabel(1)).toBe("2HKO");
    expect(getKoThresholdLabel(2)).toBe("3HKO");
  });

  it("fills a legal full Champions spread after defensive points are chosen", () => {
    const target = makePokemon("Training Target", {
      baseStats: { hp: 100, atk: 120, def: 90, spa: 70, spd: 90, spe: 80 },
    });
    const spread = buildTrainingStatSpread(
      target,
      { hp: 32, def: 20, spd: 10 },
      "impish",
      "auto",
    );

    expect(Object.values(spread.statPoints).reduce((sum, value) => sum + value, 0)).toBe(66);
    expect(Math.max(...Object.values(spread.statPoints))).toBeLessThanOrEqual(32);
    expect(getDefensivePointTotal(spread)).toBe(62);
    expect(spread.statPoints.atk).toBe(4);
  });

  it("ranks physically bulky spreads above the default spread into a physical threat", () => {
    const target = makePokemon("Training Target", {
      types: ["Normal"],
      baseStats: { hp: 90, atk: 80, def: 70, spa: 80, spd: 95, spe: 70 },
    });
    const attacks = [makeTrainingAttack()];
    const settings = {
      weather: "none",
      terrain: "none",
      defenderGrounded: true,
      attackerStatStage: 0,
      defenderStatStage: 0,
    } as const;
    const baseline = evaluateTrainingBaseline({
      defender: target,
      spread: getDefaultChampionsStatSpreadForPokemon(target),
      attacks,
      settings,
    });
    const optimized = findOptimalTrainingSpreads({
      defender: target,
      attacks,
      settings,
      resultLimit: 5,
    });

    expect(optimized.candidateCount).toBeGreaterThan(90_000);
    expect(optimized.results[0].stats.hp).toBeGreaterThanOrEqual(baseline?.stats.hp ?? 0);
    expect(optimized.results[0].stats.def).toBeGreaterThan(baseline?.stats.def ?? 0);
    expect(optimized.results[0].summary.totalGuaranteedHits).toBeGreaterThanOrEqual(
      baseline?.summary.totalGuaranteedHits ?? 0,
    );
    expect(optimized.results[0].threatDetails[0].attackerName).toBe("Physical Attacker");
  });

  it("scores one selected meta Pokemon by its strongest configured hit", () => {
    const target = makePokemon("Training Target", {
      types: ["Normal"],
      baseStats: { hp: 100, def: 100, spd: 100 },
    });
    const attacker = makePokemon("Mixed Attacker", {
      types: ["Fire"],
      baseStats: { atk: 120, spa: 120 },
    });
    const attacks = [
      makeTrainingAttack({
        id: "weak-hit",
        attacker,
        label: "Flame Charge",
        type: "fire",
        basePower: 50,
      }),
      makeTrainingAttack({
        id: "strong-hit",
        attacker,
        label: "Flare Blitz",
        type: "fire",
        basePower: 120,
      }),
    ];
    const result = findOptimalTrainingSpreads({
      defender: target,
      attacks,
      settings: {
        weather: "none",
        terrain: "none",
        defenderGrounded: true,
        attackerStatStage: 0,
        defenderStatStage: 0,
      },
      resultLimit: 1,
    });

    expect(result.evaluatedThreatCount).toBe(1);
    expect(result.results[0].summary.evaluatedThreatCount).toBe(1);
    expect(result.results[0].threatDetails[0].moveLabel).toBe("Flare Blitz");
  });

  it("explains breakpoint gains against the baseline's hardest hit per attacker", () => {
    const target = makePokemon("Training Target", {
      types: ["Normal"],
      baseStats: { hp: 95, def: 72, spd: 90, atk: 85, spa: 85 },
    });
    const attacks = [makeTrainingAttack({ basePower: 105, label: "Heavy Slam" })];
    const settings = {
      weather: "none",
      terrain: "none",
      defenderGrounded: true,
      attackerStatStage: 0,
      defenderStatStage: 0,
    } as const;
    const baseline = evaluateTrainingBaseline({
      defender: target,
      spread: buildTrainingStatSpread(target, { hp: 0, def: 0, spd: 0 }, "modest", "auto"),
      attacks,
      settings,
    });
    const optimized = findOptimalTrainingSpreads({
      defender: target,
      attacks,
      settings,
      resultLimit: 1,
    });
    const gains = getTrainingBreakpointGains(optimized.results[0], baseline);
    const attackGains = getTrainingAttackBreakpointGains({
      defender: target,
      result: optimized.results[0],
      baselineSpread: buildTrainingStatSpread(target, { hp: 0, def: 0, spd: 0 }, "modest", "auto"),
      attacks,
      settings,
    });

    expect(gains.length).toBeGreaterThan(0);
    expect(gains[0].attackerName).toBe("Physical Attacker");
    expect(gains[0].moveLabel).toBe("Heavy Slam");
    expect(gains[0].nextHitsSurvived).toBeGreaterThan(gains[0].previousHitsSurvived);
    expect(gains[0].nextKoLabel).toMatch(/HKO$/);
    expect(attackGains[0].moveLabel).toBe("Heavy Slam");
    expect(attackGains[0].nextHitsSurvived).toBeGreaterThan(attackGains[0].previousHitsSurvived);
  });
});
