import { describe, expect, it } from "vitest";
import { evaluateBattleState, recommendBestPlan } from "..";
import { buildSearchStateKey } from "../hash";
import {
  createTestBattleState,
  makeCandidateMove,
  makeMember,
  makeMove,
  makePokemon,
} from "./fixtures";

function createTrickRoomBeliefState() {
  const sneasler = makePokemon("Sneasler", { baseStats: { atk: 130, spe: 120 } });
  const partner = makePokemon("Partner", { baseStats: { spa: 100, spe: 100 } });
  const oranguru = makePokemon("Oranguru", { baseStats: { hp: 110, def: 110, spd: 110, spe: 60 } });
  const meowstic = makePokemon("Meowstic", { baseStats: { spa: 95, spe: 104 } });
  const fakeOut = makeMove("Fake Out", {
    type: "Normal",
    category: "Physical",
    basePower: 40,
    priority: 3,
    target: "normal",
  });
  const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
  const trickRoom = makeMove("Trick Room", { type: "Psychic", category: "Status", basePower: 0, target: "all" });
  const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });

  return createTestBattleState({
    ally: [
      makeMember({ side: "ally", slot: 0, pokemon: sneasler, moveNames: ["Fake Out"] }),
      makeMember({ side: "ally", slot: 1, pokemon: partner, moveNames: ["Tackle"] }),
    ],
    enemy: [
      makeMember({
        side: "enemy",
        slot: 0,
        pokemon: oranguru,
        moveNames: ["Protect"],
        candidateMoves: [makeCandidateMove("Trick Room", 0.8, "preset")],
        knowledge: "partial",
      }),
      makeMember({ side: "enemy", slot: 1, pokemon: meowstic, moveNames: ["Tackle"] }),
    ],
    moves: [fakeOut, tackle, trickRoom, protect],
  });
}

function createStageFilteringState() {
  const wideGuardUser = makePokemon("Hariyama", { baseStats: { hp: 120, atk: 120, spe: 50 } });
  const allyPartner = makePokemon("Fragile Partner", { baseStats: { hp: 70, def: 70, spd: 70, spe: 90 } });
  const rockSlider = makePokemon("Tyranitar", { baseStats: { atk: 134, spe: 61 } });
  const heatWaver = makePokemon("Charizard", { baseStats: { spa: 130, spe: 100 } });
  const wideGuard = makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, target: "self", priority: 3 });
  const closeCombat = makeMove("Close Combat", { type: "Fighting", category: "Physical", basePower: 120, target: "normal" });
  const rockSlide = makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" });
  const heatWave = makeMove("Heat Wave", { type: "Fire", category: "Special", basePower: 95, target: "allAdjacentFoes" });

  return createTestBattleState({
    ally: [
      makeMember({ side: "ally", slot: 0, pokemon: wideGuardUser, moveNames: ["Wide Guard", "Close Combat"] }),
      makeMember({ side: "ally", slot: 1, pokemon: allyPartner, moveNames: ["Close Combat"] }),
    ],
    enemy: [
      makeMember({ side: "enemy", slot: 0, pokemon: rockSlider, moveNames: ["Rock Slide"] }),
      makeMember({ side: "enemy", slot: 1, pokemon: heatWaver, moveNames: ["Heat Wave"] }),
    ],
    moves: [wideGuard, closeCombat, rockSlide, heatWave],
  });
}

describe("search regression coverage", () => {
  it("does not predict Wide Guard into a selected single-target plus Protect line", () => {
    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { hp: 108, atk: 130, def: 95, spe: 102 } });
    const milotic = makePokemon("Milotic", { types: ["Water"], baseStats: { hp: 125, spa: 100, def: 95, spd: 125, spe: 81 } });
    const charizard = makePokemon("Charizard-Mega-Y", { types: ["Fire", "Flying"], baseStats: { hp: 100, spa: 159, def: 78, spd: 115, spe: 100 } });
    const aerodactyl = makePokemon("Aerodactyl", { types: ["Rock", "Flying"], baseStats: { hp: 100, atk: 105, def: 65, spd: 75, spe: 130 } });
    const dragonClaw = makeMove("Dragon Claw", { type: "Dragon", category: "Physical", basePower: 80, target: "normal" });
    const rockSlide = makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
    const scald = makeMove("Scald", { type: "Water", category: "Special", basePower: 80, target: "normal" });
    const weatherBall = makeMove("Weather Ball", { type: "Fire", category: "Special", basePower: 100, target: "normal" });
    const tailwind = makeMove("Tailwind", { type: "Flying", category: "Status", basePower: 0, target: "self" });
    const wideGuard = makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, target: "self", priority: 3 });
    const dualWingbeat = makeMove("Dual Wingbeat", { type: "Flying", category: "Physical", basePower: 80, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: garchomp, moveNames: ["Dragon Claw", "Rock Slide", "Protect"] }),
        makeMember({ side: "ally", slot: 1, pokemon: milotic, moveNames: ["Scald", "Protect"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: charizard, moveNames: ["Weather Ball", "Protect", "Tailwind"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: aerodactyl, moveNames: ["Dual Wingbeat", "Rock Slide", "Tailwind", "Wide Guard"] }),
      ],
      moves: [dragonClaw, rockSlide, protect, scald, weatherBall, tailwind, wideGuard, dualWingbeat],
      weather: "sun",
    });

    const recommendation = recommendBestPlan(state, {
      searchMode: "balanced",
      objectiveMode: "robust",
      maxJointPlansPerSide: 12,
      maxIndividualActionsPerActor: 6,
      maxDepth: 1,
    });

    expect(recommendation.bestPlan?.summary).toContain("Garchomp: Dragon Claw into Aerodactyl");
    expect(recommendation.predictedEnemyResponse?.summary).not.toContain("Aerodactyl: Wide Guard");
    expect(recommendation.predictedEnemyResponse?.summary).toContain("Aerodactyl: Tailwind");
  });

  it("keeps root scores finite when no legal enemy plans exist", () => {
    const tailwindUser = makePokemon("Tailwind User", { baseStats: { spe: 120 } });
    const tailwind = makeMove("Tailwind", { type: "Flying", category: "Status", basePower: 0, target: "self" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: tailwindUser, moveNames: ["Tailwind"] })],
      enemy: [],
      moves: [tailwind],
    });

    const scalar = evaluateBattleState(state);
    const recommendation = recommendBestPlan(state, {
      searchMode: "balanced",
      objectiveMode: "robust",
      maxJointPlansPerSide: 4,
      maxIndividualActionsPerActor: 4,
    });

    expect(recommendation.bestPlan?.summary).toContain("Tailwind");
    expect(recommendation.consideredPlans).toHaveLength(1);
    expect(recommendation.rootScore).toBe(scalar);
    expect(recommendation.consideredPlans[0]?.score).toBe(scalar);
    expect(recommendation.consideredPlans[0]?.enemyBestResponse).toBeNull();
    expect(Number.isFinite(recommendation.rootScore)).toBe(true);
    expect(Number.isFinite(recommendation.consideredPlans[0]?.robustScore ?? Number.NaN)).toBe(true);
  });

  it("supports 2v1 endgame boards", () => {
    const closer = makePokemon("Closer", { baseStats: { atk: 128, spe: 108 } });
    const partner = makePokemon("Partner", { baseStats: { spa: 118, spe: 96 } });
    const wall = makePokemon("Wall", { baseStats: { hp: 115, def: 125, spd: 110, spe: 62 } });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: closer, moveNames: ["Tackle", "Protect"] }),
        makeMember({ side: "ally", slot: 1, pokemon: partner, moveNames: ["Tackle", "Protect"] }),
      ],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: wall, moveNames: ["Tackle", "Protect"] })],
      moves: [tackle, protect],
    });

    const recommendation = recommendBestPlan(state, {
      searchMode: "balanced",
      objectiveMode: "robust",
      maxJointPlansPerSide: 4,
      maxIndividualActionsPerActor: 4,
    });

    expect(recommendation.bestPlan).not.toBeNull();
    expect(recommendation.predictedEnemyResponse).not.toBeNull();
    expect(recommendation.bestPlan?.actions).toHaveLength(2);
    expect(recommendation.predictedEnemyResponse?.actions).toHaveLength(1);
    expect(recommendation.consideredPlans.length).toBeGreaterThan(0);
    expect(Number.isFinite(recommendation.rootScore)).toBe(true);
  });

  it("supports true 1v1 endgame boards", () => {
    const closer = makePokemon("Closer", { baseStats: { atk: 128, spe: 108 } });
    const wall = makePokemon("Wall", { baseStats: { hp: 115, def: 125, spd: 110, spe: 62 } });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });

    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: closer, moveNames: ["Tackle", "Protect"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: wall, moveNames: ["Tackle", "Protect"] })],
      moves: [tackle, protect],
    });

    const recommendation = recommendBestPlan(state, {
      searchMode: "balanced",
      objectiveMode: "robust",
      maxJointPlansPerSide: 4,
      maxIndividualActionsPerActor: 4,
    });

    expect(recommendation.bestPlan).not.toBeNull();
    expect(recommendation.predictedEnemyResponse).not.toBeNull();
    expect(recommendation.bestPlan?.actions).toHaveLength(1);
    expect(recommendation.predictedEnemyResponse?.actions).toHaveLength(1);
    expect(recommendation.consideredPlans.length).toBeGreaterThan(0);
    expect(Number.isFinite(recommendation.rootScore)).toBe(true);
  });

  it("keeps likely and robust objectives distinct when hidden-info priors favor Trick Room", () => {
    const state = createTrickRoomBeliefState();

    const robust = recommendBestPlan(state, {
      searchMode: "balanced",
      objectiveMode: "robust",
      maxJointPlansPerSide: 8,
      maxIndividualActionsPerActor: 5,
    });
    const likely = recommendBestPlan(state, {
      searchMode: "balanced",
      objectiveMode: "likely",
      maxJointPlansPerSide: 8,
      maxIndividualActionsPerActor: 5,
    });

    expect(likely.rootScore).toBeGreaterThan(robust.rootScore);
    expect(likely.predictedEnemyResponse?.summary).toContain("Trick Room");
    expect(
      likely.consideredPlans.some(
        (plan) =>
          plan.enemyBestResponse?.summary !== plan.predictedEnemyResponse?.summary &&
          plan.enemyBestResponse?.summary?.includes("Protect"),
      ),
    ).toBe(true);
  });

  it("keeps hybrid scores between robust and likely scores", () => {
    const state = createTrickRoomBeliefState();
    const recommendation = recommendBestPlan(state, {
      searchMode: "balanced",
      objectiveMode: "hybrid",
      maxJointPlansPerSide: 8,
      maxIndividualActionsPerActor: 5,
    });

    const floor = Math.min(recommendation.robustScore, recommendation.likelyScore);
    const ceiling = Math.max(recommendation.robustScore, recommendation.likelyScore);
    expect(recommendation.rootScore).toBe(recommendation.hybridScore);
    expect(recommendation.hybridScore).toBeGreaterThanOrEqual(floor);
    expect(recommendation.hybridScore).toBeLessThanOrEqual(ceiling);
  });

  it("filters deep-mode staged candidates without changing the top plan on the same state", () => {
    const state = createStageFilteringState();

    const unfiltered = recommendBestPlan(state, {
      searchMode: "deep",
      objectiveMode: "robust",
      stageTopK: 0,
      maxJointPlansPerSide: 8,
      maxIndividualActionsPerActor: 5,
    });
    const filtered = recommendBestPlan(state, {
      searchMode: "deep",
      objectiveMode: "robust",
      stageTopK: 2,
      maxJointPlansPerSide: 8,
      maxIndividualActionsPerActor: 5,
    });

    expect(unfiltered.consideredPlans.length).toBeGreaterThan(2);
    expect(filtered.consideredPlans).toHaveLength(2);
    expect(filtered.bestPlan?.summary).toBe(unfiltered.bestPlan?.summary);
    expect(filtered.diagnostics.generatedJointPlans).toBeLessThan(unfiltered.diagnostics.generatedJointPlans);
  });

  it("keeps transposition keys and deep-search results stable for equivalent states", () => {
    const attacker = makePokemon("Closer", { baseStats: { atk: 120, spe: 105 } });
    const defender = makePokemon("Wall", { baseStats: { hp: 110, def: 110, spe: 70 } });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const originalState = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: attacker, moveNames: ["Tackle"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: defender, moveNames: ["Tackle"] })],
      moves: [tackle],
    });
    const clonedState = JSON.parse(JSON.stringify(originalState)) as typeof originalState;

    expect(buildSearchStateKey(clonedState)).toBe(buildSearchStateKey(originalState));

    const first = recommendBestPlan(originalState, {
      searchMode: "deep",
      objectiveMode: "robust",
      maxJointPlansPerSide: 3,
      maxIndividualActionsPerActor: 2,
    });
    const second = recommendBestPlan(clonedState, {
      searchMode: "deep",
      objectiveMode: "robust",
      maxJointPlansPerSide: 3,
      maxIndividualActionsPerActor: 2,
    });

    expect(first.rootScore).toBe(second.rootScore);
    expect(first.bestPlan?.summary).toBe(second.bestPlan?.summary);
    expect(first.pv.map((step) => step.allyPlan?.summary ?? null)).toEqual(
      second.pv.map((step) => step.allyPlan?.summary ?? null),
    );
    expect(first.diagnostics.ttHits).toBeGreaterThan(0);
    expect(second.diagnostics.ttHits).toBeGreaterThan(0);
  });
});
