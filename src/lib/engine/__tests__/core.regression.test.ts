import { describe, expect, it } from "vitest";
import { getDamagePreview, resolveTurn } from "..";
import {
  buildMovePlan,
  buildPassPlan,
  createTestBattleState,
  makeMember,
  makeMove,
  makePokemon,
} from "./fixtures";

describe("engine regression coverage", () => {
  it("sanity: direct damage resolves against a legal target", () => {
    const attacker = makePokemon("Attacker");
    const defender = makePokemon("Defender");
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: attacker, moveNames: ["Tackle"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: defender, moveNames: ["Tackle"] })],
      moves: [tackle],
    });

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Tackle", targetId: "enemy-0" }]),
      buildPassPlan(state, "enemy", ["enemy-0"]),
    );

    expect(result.state.combatants["enemy-0"].currentHp).toBeLessThan(result.state.combatants["enemy-0"].maxHp);
  });

  it("classifies Fake Out so turn-one flinch logic is reachable", () => {
    const ally = makePokemon("Ally Lead", { baseStats: { atk: 110, spe: 120 } });
    const enemy = makePokemon("Enemy Lead", { baseStats: { hp: 120, def: 110, spe: 90 } });
    const fakeOut = makeMove("Fake Out", {
      type: "Normal",
      category: "Physical",
      basePower: 40,
      priority: 3,
      target: "normal",
    });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 50, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: ally, moveNames: ["Fake Out"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: enemy, moveNames: ["Tackle"] })],
      moves: [fakeOut, tackle],
    });

    expect(state.combatants["ally-0"].knownMoves[0]?.effectKind).toBe("fakeOut");

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Fake Out", targetId: "enemy-0" }]),
      buildMovePlan(state, "enemy", [{ actorId: "enemy-0", moveName: "Tackle", targetId: "ally-0" }]),
    );

    expect(result.events.some((event) => event.text.includes("flinches from Fake Out"))).toBe(true);
    expect(result.events.some((event) => event.text.includes("Enemy Lead uses Tackle"))).toBe(false);
  });

  it("wakes a sleeping active even when that actor only passes for the turn", () => {
    const sleeper = makePokemon("Sleeper");
    const enemy = makePokemon("Enemy");
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 50, target: "normal" });
    const state = createTestBattleState({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: sleeper,
          moveNames: ["Tackle"],
          statusCondition: "sleep",
          sleepTurns: 1,
        }),
      ],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: enemy, moveNames: ["Tackle"] })],
      moves: [tackle],
    });

    const result = resolveTurn(
      state,
      buildPassPlan(state, "ally", ["ally-0"]),
      buildPassPlan(state, "enemy", ["enemy-0"]),
    );

    expect(result.state.combatants["ally-0"].statusCondition).toBe("none");
    expect(result.state.combatants["ally-0"].sleepTurns).toBe(0);
  });

  it("applies allAdjacent collateral to the user's ally partner", () => {
    const bulldozer = makePokemon("Bulldozer", { types: ["Ground"], baseStats: { atk: 120 } });
    const partner = makePokemon("Partner", { types: ["Normal"], baseStats: { hp: 110, def: 90 } });
    const enemyOne = makePokemon("Enemy One", { types: ["Normal"] });
    const enemyTwo = makePokemon("Enemy Two", { types: ["Normal"] });
    const bulldoze = makeMove("Bulldoze", {
      type: "Ground",
      category: "Physical",
      basePower: 60,
      target: "allAdjacent",
    });
    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: bulldozer, moveNames: ["Bulldoze"] }),
        makeMember({ side: "ally", slot: 1, pokemon: partner, moveNames: [] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: enemyOne, moveNames: [] }),
        makeMember({ side: "enemy", slot: 1, pokemon: enemyTwo, moveNames: [] }),
      ],
      moves: [bulldoze],
    });

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Bulldoze" }]),
      buildPassPlan(state, "enemy", ["enemy-0", "enemy-1"]),
    );

    expect(result.state.combatants["ally-1"].currentHp).toBeLessThan(result.state.combatants["ally-1"].maxHp);
  });

  it("does not add assumed Protect when a protect-family move is already known", () => {
    const defender = makePokemon("Defender");
    const detect = makeMove("Detect", {
      type: "Fighting",
      category: "Status",
      basePower: 0,
      target: "self",
    });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: defender, moveNames: ["Detect"] })],
      enemy: [],
      moves: [detect],
      universalProtect: true,
    });

    const protectLikeMoves = state.combatants["ally-0"].knownMoves.filter((move) =>
      ["Protect", "Detect", "King's Shield", "Spiky Shield", "Silk Trap", "Baneful Bunker", "Burning Bulwark", "Obstruct"].includes(move.name),
    );

    expect(protectLikeMoves).toHaveLength(1);
    expect(protectLikeMoves[0]?.name).toBe("Detect");
  });

  it("does not let Nasty Plot boost physical damage", () => {
    const setupMon = makePokemon("Setup Mon", { baseStats: { atk: 105, spa: 125 } });
    const target = makePokemon("Target", { baseStats: { hp: 120, def: 100, spd: 100 } });
    const nastyPlot = makeMove("Nasty Plot", { type: "Dark", category: "Status", basePower: 0, target: "self" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: setupMon, moveNames: ["Nasty Plot", "Tackle"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: target, moveNames: [] })],
      moves: [nastyPlot, tackle],
    });

    const before = getDamagePreview(state, "ally-0", "enemy-0", state.combatants["ally-0"].knownMoves.find((move) => move.name === "Tackle")!);
    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Nasty Plot" }]),
      null,
    );
    const after = getDamagePreview(
      result.state,
      "ally-0",
      "enemy-0",
      result.state.combatants["ally-0"].knownMoves.find((move) => move.name === "Tackle")!,
    );

    expect(after?.estimate.averageDamage).toBe(before?.estimate.averageDamage);
  });

  it("does not let Calm Mind reduce incoming physical damage", () => {
    const calmMindUser = makePokemon("Calm Mind User", { baseStats: { hp: 120, def: 95, spd: 120 } });
    const attacker = makePokemon("Physical Attacker", { baseStats: { atk: 125 } });
    const calmMind = makeMove("Calm Mind", { type: "Psychic", category: "Status", basePower: 0, target: "self" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: calmMindUser, moveNames: ["Calm Mind"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: attacker, moveNames: ["Tackle"] })],
      moves: [calmMind, tackle],
    });

    const before = getDamagePreview(state, "enemy-0", "ally-0", state.combatants["enemy-0"].knownMoves[0]!);
    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Calm Mind" }]),
      buildPassPlan(state, "enemy", ["enemy-0"]),
    );
    const after = getDamagePreview(result.state, "enemy-0", "ally-0", result.state.combatants["enemy-0"].knownMoves[0]!);

    expect(after?.estimate.averageDamage).toBe(before?.estimate.averageDamage);
  });

  it("does not let Snarl reduce the target's physical damage output", () => {
    const snarler = makePokemon("Snarler", { baseStats: { spa: 120 } });
    const bruiser = makePokemon("Bruiser", { baseStats: { atk: 130 } });
    const victim = makePokemon("Victim");
    const snarl = makeMove("Snarl", { type: "Dark", category: "Special", basePower: 55, target: "allAdjacentFoes" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: victim, moveNames: [] }),
        makeMember({ side: "ally", slot: 1, pokemon: victim, moveNames: [] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: bruiser, moveNames: ["Tackle"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: snarler, moveNames: ["Snarl"] }),
      ],
      moves: [snarl, tackle],
    });

    const before = getDamagePreview(state, "enemy-0", "ally-0", state.combatants["enemy-0"].knownMoves[0]!);
    const result = resolveTurn(
      state,
      buildPassPlan(state, "ally", ["ally-0", "ally-1"]),
      buildMovePlan(state, "enemy", [{ actorId: "enemy-1", moveName: "Snarl" }]),
    );
    const after = getDamagePreview(result.state, "enemy-0", "ally-0", result.state.combatants["enemy-0"].knownMoves[0]!);

    expect(after?.estimate.averageDamage).toBe(before?.estimate.averageDamage);
  });

  it("does not apply Spore to Grass-type targets", () => {
    const sporer = makePokemon("Sporer", { types: ["Grass"] });
    const grassTarget = makePokemon("Grass Target", { types: ["Grass"] });
    const spore = makeMove("Spore", { type: "Grass", category: "Status", basePower: 0, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: sporer, moveNames: ["Spore"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: grassTarget, moveNames: [] })],
      moves: [spore],
    });

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Spore", targetId: "enemy-0" }]),
      null,
    );

    expect(result.state.combatants["enemy-0"].statusCondition).toBe("none");
  });
});
