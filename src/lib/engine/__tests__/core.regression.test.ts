import { describe, expect, it } from "vitest";
import { generateJointActionPlans, getDamagePreview, getEffectiveSpeed, getGroundedState, getSetHypotheses, recommendBestPlan, resolveTurn } from "..";
import {
  buildMovePlan,
  buildPassPlan,
  buildSwitchPlan,
  createTestBattleState,
  makeCandidateMove,
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

  it("uses Weather Ball's weather type for typing immunity checks", () => {
    const attacker = makePokemon("Weather Attacker", {
      types: ["Normal"],
      baseStats: { spa: 120 },
    });
    const ghost = makePokemon("Ghost Target", {
      types: ["Ghost"],
      baseStats: { hp: 100, spd: 90 },
    });
    const weatherBall = makeMove("Weather Ball", {
      type: "Normal",
      category: "Special",
      basePower: 50,
      target: "normal",
    });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 50, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: attacker, moveNames: ["Weather Ball"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: ghost, moveNames: ["Tackle"] })],
      moves: [weatherBall, tackle],
      weather: "rain",
    });
    const preview = getDamagePreview(state, "ally-0", "enemy-0", state.combatants["ally-0"].knownMoves[0]!);

    expect(preview?.estimate.effectiveAttackType).toBe("water");
    expect(preview?.estimate.effectiveBasePower).toBe(100);

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Weather Ball", targetId: "enemy-0" }]),
      buildPassPlan(state, "enemy", ["enemy-0"]),
    );

    expect(result.state.combatants["enemy-0"].currentHp).toBeLessThan(result.state.combatants["enemy-0"].maxHp);
  });

  it("resolves Mega Sol Weather Ball as user-only sun even while rain stays active", () => {
    const meganium = makePokemon("Meganium-Mega", {
      types: ["Grass", "Fairy"],
      baseStats: { spa: 122 },
    });
    const steelTarget = makePokemon("Steel Target", {
      types: ["Steel"],
      baseStats: { hp: 100, spd: 100 },
    });
    const weatherBall = makeMove("Weather Ball", {
      type: "Normal",
      category: "Special",
      basePower: 50,
      target: "normal",
    });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 50, target: "normal" });
    const state = createTestBattleState({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: meganium,
          moveNames: ["Weather Ball"],
          abilityName: "Mega Sol",
        }),
      ],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: steelTarget, moveNames: ["Tackle"] })],
      moves: [weatherBall, tackle],
      weather: "rain",
    });

    const preview = getDamagePreview(state, "ally-0", "enemy-0", state.combatants["ally-0"].knownMoves[0]!);

    expect(state.field.weather).toBe("rain");
    expect(preview?.estimate.effectiveAttackType).toBe("fire");
    expect(preview?.estimate.effectiveBasePower).toBe(100);
    expect(preview?.estimate.weatherMultiplier).toBe(1.5);
    expect(preview?.estimate.typeMultiplier).toBe(2);
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

  it("retargets queued attacks onto the switch-in occupying that slot", () => {
    const sneasler = makePokemon("Sneasler", { baseStats: { hp: 100, def: 80, spe: 120 } });
    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { hp: 120, def: 95, spe: 102 } });
    const enemySneasler = makePokemon("Enemy Sneasler", { baseStats: { atk: 130, spe: 120 } });
    const fakeOut = makeMove("Fake Out", {
      type: "Normal",
      category: "Physical",
      basePower: 40,
      priority: 3,
      target: "normal",
    });
    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: sneasler, moveNames: [] }),
        makeMember({ side: "ally", slot: 1, pokemon: garchomp, moveNames: [], isActive: false }),
      ],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: enemySneasler, moveNames: ["Fake Out"] })],
      moves: [fakeOut],
    });

    const result = resolveTurn(
      state,
      buildSwitchPlan(state, "ally", [{ actorId: "ally-0", switchInId: "ally-1" }]),
      buildMovePlan(state, "enemy", [{ actorId: "enemy-0", moveName: "Fake Out", targetId: "ally-0" }]),
    );

    expect(result.state.sides.ally.activeIds[0]).toBe("ally-1");
    expect(result.state.combatants["ally-0"].currentHp).toBe(result.state.combatants["ally-0"].maxHp);
    expect(result.state.combatants["ally-1"].currentHp).toBeLessThan(result.state.combatants["ally-1"].maxHp);
    expect(result.events.some((event) => event.text.includes("uses Fake Out on Garchomp"))).toBe(true);
    expect(result.events.some((event) => event.text.includes("Sneasler flinches from Fake Out"))).toBe(false);
  });

  it("does not generate Fake Out into Ghost-type targets", () => {
    const fakeOutUser = makePokemon("Fake Out User", { baseStats: { atk: 110, spe: 120 } });
    const partner = makePokemon("Partner");
    const ghostTarget = makePokemon("Ghost Target", { types: ["Ghost"], baseStats: { hp: 120, def: 110 } });
    const normalTarget = makePokemon("Normal Target", { types: ["Normal"], baseStats: { hp: 120, def: 110 } });
    const fakeOut = makeMove("Fake Out", {
      type: "Normal",
      category: "Physical",
      basePower: 40,
      priority: 3,
      target: "normal",
    });
    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: fakeOutUser, moveNames: ["Fake Out"] }),
        makeMember({ side: "ally", slot: 1, pokemon: partner, moveNames: [] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: ghostTarget, moveNames: [] }),
        makeMember({ side: "enemy", slot: 1, pokemon: normalTarget, moveNames: [] }),
      ],
      moves: [fakeOut],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxIndividualActionsPerActor: 8,
      maxJointPlans: 20,
    });
    const fakeOutActions = plans.flatMap((plan) =>
      plan.actions.filter(
        (entry) => entry.actorId === "ally-0" && entry.action.type === "move" && entry.summary.includes("Fake Out"),
      ),
    );

    expect(
      fakeOutActions.some(
        (entry) => entry.action.type === "move" && entry.action.targetId === "enemy-0",
      ),
    ).toBe(false);
    expect(
      fakeOutActions.some(
        (entry) => entry.action.type === "move" && entry.action.targetId === "enemy-1",
      ),
    ).toBe(true);
  });

  it("does not generate Fake Out after the user's first active turn", () => {
    const fakeOutUser = makePokemon("Fake Out User", { baseStats: { atk: 110, spe: 120 } });
    const target = makePokemon("Target", { baseStats: { hp: 120, def: 110 } });
    const fakeOut = makeMove("Fake Out", {
      type: "Normal",
      category: "Physical",
      basePower: 40,
      priority: 3,
      target: "normal",
    });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: fakeOutUser, moveNames: ["Fake Out", "Tackle"], turnsActive: 1 })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: target, moveNames: [] })],
      moves: [fakeOut, tackle],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxIndividualActionsPerActor: 8,
      maxJointPlans: 12,
    });

    expect(
      plans.some((plan) =>
        plan.actions.some(
          (entry) => entry.actorId === "ally-0" && entry.action.type === "move" && entry.summary.includes(": Fake Out"),
        ),
      ),
    ).toBe(false);
  });

  it("does not let Fake Out flinch Ghost-type targets", () => {
    const fakeOutUser = makePokemon("Fake Out User", { baseStats: { atk: 110, spe: 120 } });
    const ghostTarget = makePokemon("Ghost Target", { types: ["Ghost"], baseStats: { hp: 120, def: 110, spe: 90 } });
    const fakeOut = makeMove("Fake Out", {
      type: "Normal",
      category: "Physical",
      basePower: 40,
      priority: 3,
      target: "normal",
    });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 50, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: fakeOutUser, moveNames: ["Fake Out"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: ghostTarget, moveNames: ["Tackle"] })],
      moves: [fakeOut, tackle],
    });

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Fake Out", targetId: "enemy-0" }]),
      buildMovePlan(state, "enemy", [{ actorId: "enemy-0", moveName: "Tackle", targetId: "ally-0" }]),
    );

    expect(result.events.some((event) => event.text.includes("is unaffected"))).toBe(true);
    expect(result.events.some((event) => event.text.includes("flinches from Fake Out"))).toBe(false);
    expect(result.events.some((event) => event.text.includes("Ghost Target uses Tackle"))).toBe(true);
  });

  it("fails consecutive Protect in the expected branch", () => {
    const protector = makePokemon("Protector", { baseStats: { hp: 120, def: 110 } });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: protector, moveNames: ["Protect"], protectStreak: 1 })],
      enemy: [],
      moves: [protect],
    });

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Protect" }]),
      null,
      "average",
      { accuracyMode: "expected" },
    );

    expect(result.events.some((event) => event.text.includes("Protect fails"))).toBe(true);
    expect(result.state.combatants["ally-0"].isProtected).toBe(false);
    expect(result.state.combatants["ally-0"].protectStreak).toBe(0);
  });

  it("carries Wide Guard's protection streak into a following Protect", () => {
    const guardUser = makePokemon("Guard User", { baseStats: { hp: 120, def: 110 } });
    const wideGuard = makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, target: "self", priority: 3 });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: guardUser, moveNames: ["Wide Guard", "Protect"] })],
      enemy: [],
      moves: [wideGuard, protect],
    });

    const guarded = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Wide Guard" }]),
      null,
    );

    expect(guarded.state.combatants["ally-0"].protectStreak).toBe(1);

    const protectAttempt = resolveTurn(
      guarded.state,
      buildMovePlan(guarded.state, "ally", [{ actorId: "ally-0", moveName: "Protect" }]),
      null,
      "average",
      { accuracyMode: "expected" },
    );

    expect(protectAttempt.events.some((event) => event.text.includes("Protect fails"))).toBe(true);
    expect(protectAttempt.state.combatants["ally-0"].protectStreak).toBe(0);
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

  it("does not infer Wide Guard unless Wide Guard is in the move pool", () => {
    const defender = makePokemon("Defender");
    const spreadAttacker = makePokemon("Spread Attacker", { baseStats: { spa: 140 } });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
    const dazzlingGleam = makeMove("Dazzling Gleam", { type: "Fairy", category: "Special", basePower: 100, target: "allAdjacentFoes" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: defender, moveNames: ["Protect"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: spreadAttacker, moveNames: ["Dazzling Gleam"] })],
      moves: [protect, dazzlingGleam],
      universalProtect: true,
    });

    const moveNames = state.combatants["ally-0"].knownMoves
      .concat(state.combatants["ally-0"].candidateMoves)
      .map((move) => move.name);
    const plans = generateJointActionPlans(state, "ally", {
      maxJointPlans: 8,
      maxIndividualActionsPerActor: 8,
    });

    expect(moveNames).not.toContain("Wide Guard");
    expect(plans.some((plan) => plan.summary.includes("Wide Guard"))).toBe(false);
  });

  it("still allows assumed Protect when Wide Guard is the only protection-family move", () => {
    const defender = makePokemon("Defender");
    const wideGuard = makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, target: "self", priority: 3 });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: defender, moveNames: ["Wide Guard"] })],
      enemy: [],
      moves: [wideGuard],
      universalProtect: true,
    });

    const moveNames = state.combatants["ally-0"].knownMoves.map((move) => move.name);

    expect(moveNames).toContain("Wide Guard");
    expect(moveNames).toContain("Protect");
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

  it("does not generate Spore into represented powder-immune targets", () => {
    const sporer = makePokemon("Sporer", { types: ["Grass"] });
    const grassTarget = makePokemon("Grass Target", { types: ["Grass"] });
    const gogglesTarget = makePokemon("Goggles Target", { types: ["Normal"] });
    const overcoatTarget = makePokemon("Overcoat Target", { types: ["Normal"] });
    const spore = makeMove("Spore", { type: "Grass", category: "Status", basePower: 0, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: sporer, moveNames: ["Spore"] })],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: grassTarget, moveNames: [] }),
        makeMember({ side: "enemy", slot: 1, pokemon: gogglesTarget, moveNames: [], itemName: "Safety Goggles" }),
        makeMember({ side: "enemy", slot: 2, pokemon: overcoatTarget, moveNames: [], abilityName: "Overcoat", isActive: false }),
      ],
      moves: [spore],
    });

    const activePlans = generateJointActionPlans(state, "ally", {
      maxIndividualActionsPerActor: 8,
      maxJointPlans: 12,
    });

    expect(activePlans.some((plan) => plan.summary.includes(": Spore"))).toBe(false);
  });

  it("fires lead Intimidate so White Herb activates and Unburden doubles speed", () => {
    const unburdenUser = makePokemon("Combo User", { baseStats: { atk: 120, spe: 80 } });
    const partner = makePokemon("Partner", { baseStats: { spe: 70 } });
    const intimidator = makePokemon("Intimidator", { baseStats: { spe: 60 } });
    const fasterEnemy = makePokemon("Faster Enemy", { baseStats: { spe: 120 } });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: unburdenUser,
          moveNames: ["Tackle"],
          abilityName: "Unburden",
          itemName: "White Herb",
        }),
        makeMember({ side: "ally", slot: 1, pokemon: partner, moveNames: [] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: intimidator, moveNames: [], abilityName: "Intimidate" }),
        makeMember({ side: "enemy", slot: 1, pokemon: fasterEnemy, moveNames: ["Tackle"] }),
      ],
      moves: [tackle],
    });

    expect(state.combatants["ally-0"].stages.attack).toBe(0);
    expect(state.combatants["ally-0"].itemConsumed).toBe(true);
    expect(getEffectiveSpeed(state, "ally-0")).toBeGreaterThan(getEffectiveSpeed(state, "enemy-1"));
  });

  it("applies lead weather abilities so weather abusers use the correct speed", () => {
    const pelipper = makePokemon("Pelipper", { baseStats: { spa: 95, spe: 65 } });
    const ludicolo = makePokemon("Ludicolo", { baseStats: { spa: 90, spe: 70 } });
    const fastEnemy = makePokemon("Fast Enemy", { baseStats: { spe: 110 } });
    const partner = makePokemon("Partner", { baseStats: { spe: 70 } });
    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: pelipper, moveNames: [], abilityName: "Drizzle" }),
        makeMember({ side: "ally", slot: 1, pokemon: ludicolo, moveNames: [], abilityName: "Swift Swim" }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: fastEnemy, moveNames: [] }),
        makeMember({ side: "enemy", slot: 1, pokemon: partner, moveNames: [] }),
      ],
      moves: [],
    });

    expect(state.field.weather).toBe("rain");
    expect(getEffectiveSpeed(state, "ally-1")).toBeGreaterThan(getEffectiveSpeed(state, "enemy-0"));
  });

  it("applies switch-in weather before the rest of the turn is resolved", () => {
    const rainLead = makePokemon("Rain Lead", { baseStats: { spe: 80 } });
    const sunSetter = makePokemon("Sun Setter", { baseStats: { spe: 40 } });
    const attacker = makePokemon("Attacker", { baseStats: { atk: 120, spe: 100 } });
    const target = makePokemon("Target", { baseStats: { hp: 100, def: 80, spe: 60 } });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: rainLead, moveNames: [], abilityName: "Drizzle" }),
        makeMember({ side: "ally", slot: 1, pokemon: attacker, moveNames: ["Tackle"] }),
        makeMember({ side: "ally", slot: 2, pokemon: sunSetter, moveNames: [], abilityName: "Drought", isActive: false }),
      ],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: target, moveNames: [] })],
      moves: [tackle],
    });

    expect(state.field.weather).toBe("rain");

    const result = resolveTurn(
      state,
      {
        side: "ally",
        actions: [
          ...buildSwitchPlan(state, "ally", [{ actorId: "ally-0", switchInId: "ally-2" }]).actions,
          ...buildMovePlan(state, "ally", [{ actorId: "ally-1", moveName: "Tackle", targetId: "enemy-0" }]).actions,
        ],
        summary: "ally weather switch + attack",
        heuristicScore: 0,
      },
      buildPassPlan(state, "enemy", ["enemy-0"]),
    );

    expect(result.state.field.weather).toBe("sun");
    expect(result.events.some((event) => event.text.includes("made it sun"))).toBe(true);
  });

  it("applies Choice Scarf speed when ordering actions", () => {
    const scarfUser = makePokemon("Scarf User", { baseStats: { atk: 120, spe: 100 } });
    const fasterTarget = makePokemon("Faster Target", { baseStats: { atk: 110, spe: 110 } });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: scarfUser, moveNames: ["Tackle"], itemName: "Choice Scarf" })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: fasterTarget, moveNames: ["Tackle"] })],
      moves: [tackle],
    });

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Tackle", targetId: "enemy-0" }]),
      buildMovePlan(state, "enemy", [{ actorId: "enemy-0", moveName: "Tackle", targetId: "ally-0" }]),
    );

    const firstAttackEvent = result.events.find((event) => event.text.includes("uses Tackle on"));
    expect(firstAttackEvent?.actorId).toBe("ally-0");
  });

  it("prioritizes Trick Room as the enemy counterplay when their board is slower", () => {
    const sneasler = makePokemon("Sneasler", { baseStats: { atk: 130, spe: 120 } });
    const aerodactyl = makePokemon("Aerodactyl", { baseStats: { atk: 105, spe: 130 } });
    const oranguru = makePokemon("Oranguru", { baseStats: { hp: 110, def: 110, spd: 110, spe: 60 } });
    const meowstic = makePokemon("Meowstic", { baseStats: { spa: 95, spe: 104 } });
    const fakeOut = makeMove("Fake Out", {
      type: "Normal",
      category: "Physical",
      basePower: 40,
      priority: 3,
      target: "normal",
    });
    const tailwind = makeMove("Tailwind", { type: "Flying", category: "Status", basePower: 0, target: "self", priority: 0 });
    const trickRoom = makeMove("Trick Room", { type: "Psychic", category: "Status", basePower: 0, target: "all" });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
    const psychic = makeMove("Psychic", { type: "Psychic", category: "Special", basePower: 90, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: sneasler, moveNames: ["Fake Out"] }),
        makeMember({ side: "ally", slot: 1, pokemon: aerodactyl, moveNames: ["Tailwind"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: oranguru, moveNames: ["Trick Room", "Protect"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: meowstic, moveNames: ["Psychic"] }),
      ],
      moves: [fakeOut, tailwind, trickRoom, protect, psychic],
    });

    const recommendation = recommendBestPlan(state, {
      depth: 2,
      maxJointPlansPerSide: 8,
      maxIndividualActionsPerActor: 5,
    });

    expect(recommendation.bestPlan?.summary).toContain("Fake Out");
    expect(recommendation.bestPlan?.summary).toContain("Tailwind");
    expect(recommendation.enemyBestResponse?.summary).toContain("Trick Room");
  });

  it("applies switch-in Intimidate before move order for the rest of the turn", () => {
    const unburdenUser = makePokemon("Combo User", { baseStats: { atk: 120, spe: 80 } });
    const allyPartner = makePokemon("Ally Partner", { baseStats: { spe: 70 } });
    const enemyLead = makePokemon("Enemy Lead", { baseStats: { spe: 50 } });
    const fasterEnemy = makePokemon("Faster Enemy", { baseStats: { atk: 110, spe: 120 } });
    const intimidator = makePokemon("Intimidator", { baseStats: { spe: 60 } });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: unburdenUser,
          moveNames: ["Tackle"],
          abilityName: "Unburden",
          itemName: "White Herb",
        }),
        makeMember({ side: "ally", slot: 1, pokemon: allyPartner, moveNames: [] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: enemyLead, moveNames: [] }),
        makeMember({ side: "enemy", slot: 1, pokemon: fasterEnemy, moveNames: ["Tackle"] }),
        makeMember({ side: "enemy", slot: 2, pokemon: intimidator, moveNames: [], abilityName: "Intimidate", isActive: false }),
      ],
      moves: [tackle],
    });

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Tackle", targetId: "enemy-1" }]),
      {
        side: "enemy",
        actions: [
          ...buildSwitchPlan(state, "enemy", [{ actorId: "enemy-0", switchInId: "enemy-2" }]).actions,
          ...buildMovePlan(state, "enemy", [{ actorId: "enemy-1", moveName: "Tackle", targetId: "ally-0" }]).actions,
        ],
        summary: "enemy switch + attack",
        heuristicScore: 0,
      },
    );

    expect(result.state.combatants["ally-0"].itemConsumed).toBe(true);
    const firstAttackEvent = result.events.find((event) => event.text.includes("uses Tackle on"));
    expect(firstAttackEvent?.actorId).toBe("ally-0");
  });

  it("triggers Competitive when Intimidate switches in against Milotic", () => {
    const milotic = makePokemon("Milotic", { baseStats: { spa: 100, spe: 81 } });
    const allyPartner = makePokemon("Ally Partner");
    const enemyLead = makePokemon("Enemy Lead");
    const incin = makePokemon("Incineroar");
    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: milotic, moveNames: [], abilityName: "Competitive" }),
        makeMember({ side: "ally", slot: 1, pokemon: allyPartner, moveNames: [] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: enemyLead, moveNames: [] }),
        makeMember({ side: "enemy", slot: 1, pokemon: allyPartner, moveNames: [] }),
        makeMember({ side: "enemy", slot: 2, pokemon: incin, moveNames: [], abilityName: "Intimidate", isActive: false }),
      ],
      moves: [],
    });

    const result = resolveTurn(
      state,
      buildPassPlan(state, "ally", ["ally-0", "ally-1"]),
      {
        side: "enemy",
        actions: [
          ...buildSwitchPlan(state, "enemy", [{ actorId: "enemy-0", switchInId: "enemy-2" }]).actions,
          ...buildPassPlan(state, "enemy", ["enemy-1"]).actions,
        ],
        summary: "enemy switch",
        heuristicScore: 0,
      },
    );

    expect(result.state.combatants["ally-0"].stages.attack).toBe(-1);
    expect(result.state.combatants["ally-0"].stages.specialAttack).toBe(2);
  });

  it("redirects single-target Water moves into Storm Drain and grants the boost", () => {
    const attacker = makePokemon("Water Attacker", { baseStats: { spa: 120, spe: 100 } });
    const stormDrainUser = makePokemon("Storm Drain User", { baseStats: { spd: 110, spe: 70 } });
    const originalTarget = makePokemon("Original Target", { baseStats: { hp: 100, spd: 80 } });
    const waterPulse = makeMove("Water Pulse", { type: "Water", category: "Special", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: attacker, moveNames: ["Water Pulse"] })],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: stormDrainUser, moveNames: [], abilityName: "Storm Drain" }),
        makeMember({ side: "enemy", slot: 1, pokemon: originalTarget, moveNames: [] }),
      ],
      moves: [waterPulse],
    });

    const originalTargetHp = state.combatants["enemy-1"].currentHp;
    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Water Pulse", targetId: "enemy-1" }]),
      buildPassPlan(state, "enemy", ["enemy-0", "enemy-1"]),
    );

    expect(result.state.combatants["enemy-0"].stages.specialAttack).toBe(1);
    expect(result.state.combatants["enemy-1"].currentHp).toBe(originalTargetHp);
  });

  it("does not generate redirection with no active partner to protect", () => {
    const redirector = makePokemon("Solo Redirector", { baseStats: { hp: 120, def: 100 } });
    const target = makePokemon("Target", { baseStats: { hp: 120 } });
    const followMe = makeMove("Follow Me", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 2 });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: redirector, moveNames: ["Follow Me", "Tackle"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: target, moveNames: [] })],
      moves: [followMe, tackle],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxIndividualActionsPerActor: 8,
      maxJointPlans: 8,
    });

    expect(plans.some((plan) => plan.summary.includes("Follow Me"))).toBe(false);
  });

  it("restores HP with Regenerator on switch out", () => {
    const regeneratorMon = makePokemon("Regenerator Mon", { baseStats: { hp: 120 } });
    const benchMon = makePokemon("Bench Mon");
    const enemy = makePokemon("Enemy");
    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: regeneratorMon, moveNames: [], abilityName: "Regenerator", currentHpPercent: 50 }),
        makeMember({ side: "ally", slot: 1, pokemon: benchMon, moveNames: [], isActive: false }),
      ],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: enemy, moveNames: [] })],
      moves: [],
    });

    const before = state.combatants["ally-0"].currentHp;
    const result = resolveTurn(
      state,
      buildSwitchPlan(state, "ally", [{ actorId: "ally-0", switchInId: "ally-1" }]),
      buildPassPlan(state, "enemy", ["enemy-0"]),
    );

    expect(result.state.combatants["ally-0"].currentHp).toBeGreaterThan(before);
  });

  it("blocks spread damage with Wide Guard", () => {
    const attacker = makePokemon("Spread Attacker", { baseStats: { atk: 120 } });
    const defenderOne = makePokemon("Defender One");
    const defenderTwo = makePokemon("Defender Two");
    const rockSlide = makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" });
    const wideGuard = makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, target: "self", priority: 3 });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: attacker, moveNames: ["Rock Slide"] })],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: defenderOne, moveNames: ["Wide Guard"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: defenderTwo, moveNames: [] }),
      ],
      moves: [rockSlide, wideGuard],
    });

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Rock Slide" }]),
      {
        side: "enemy",
        actions: [
          ...buildMovePlan(state, "enemy", [{ actorId: "enemy-0", moveName: "Wide Guard" }]).actions,
          ...buildPassPlan(state, "enemy", ["enemy-1"]).actions,
        ],
        summary: "wide guard",
        heuristicScore: 0,
      },
    );

    expect(result.state.combatants["enemy-0"].currentHp).toBe(result.state.combatants["enemy-0"].maxHp);
    expect(result.state.combatants["enemy-1"].currentHp).toBe(result.state.combatants["enemy-1"].maxHp);
  });

  it("lets Focus Sash preserve a combatant at 1 HP only once", () => {
    const attacker = makePokemon("Big Hitter", { baseStats: { atk: 180, spe: 110 } });
    const sashHolder = makePokemon("Sash Holder", { baseStats: { hp: 90, def: 70, spe: 70 } });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 150, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: attacker, moveNames: ["Tackle"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: sashHolder, moveNames: [], itemName: "Focus Sash" })],
      moves: [tackle],
    });

    const firstTurn = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Tackle", targetId: "enemy-0" }]),
      buildPassPlan(state, "enemy", ["enemy-0"]),
    );

    expect(firstTurn.state.combatants["enemy-0"].currentHp).toBe(1);
    expect(firstTurn.state.combatants["enemy-0"].itemConsumed).toBe(true);

    const secondTurn = resolveTurn(
      firstTurn.state,
      buildMovePlan(firstTurn.state, "ally", [{ actorId: "ally-0", moveName: "Tackle", targetId: "enemy-0" }]),
      buildPassPlan(firstTurn.state, "enemy", ["enemy-0"]),
    );

    expect(secondTurn.state.combatants["enemy-0"].currentHp).toBe(0);
  });

  it("consumes resist berries so later damage previews no longer get the reduction", () => {
    const attacker = makePokemon("Fire Attacker", { types: ["Fire"], baseStats: { spa: 150, spe: 110 } });
    const defender = makePokemon("Grass Defender", { types: ["Grass"], baseStats: { hp: 200, spd: 130, spe: 70 } });
    const flamethrower = makeMove("Flamethrower", {
      type: "Fire",
      category: "Special",
      basePower: 90,
      target: "normal",
    });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: attacker, moveNames: ["Flamethrower"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: defender, moveNames: [], itemName: "Occa Berry" })],
      moves: [flamethrower],
    });

    const before = getDamagePreview(state, "ally-0", "enemy-0", state.combatants["ally-0"].knownMoves[0]!);
    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Flamethrower", targetId: "enemy-0" }]),
      buildPassPlan(state, "enemy", ["enemy-0"]),
    );
    const after = getDamagePreview(result.state, "ally-0", "enemy-0", result.state.combatants["ally-0"].knownMoves[0]!);

    expect(result.state.combatants["enemy-0"].itemConsumed).toBe(true);
    expect(after?.estimate.averageDamage).toBeGreaterThan(before?.estimate.averageDamage ?? 0);
  });

  it("triggers Sitrus Berry after dropping to half HP or lower", () => {
    const attacker = makePokemon("Berry Breaker", { baseStats: { atk: 170, spe: 110 } });
    const defender = makePokemon("Berry Holder", { baseStats: { hp: 180, def: 75, spe: 70 } });
    const crunch = makeMove("Crunch", { type: "Dark", category: "Physical", basePower: 120, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: attacker, moveNames: ["Crunch"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: defender, moveNames: [], itemName: "Sitrus Berry", currentHpPercent: 60 })],
      moves: [crunch],
    });

    const preview = getDamagePreview(state, "ally-0", "enemy-0", state.combatants["ally-0"].knownMoves[0]!);
    const startingHp = state.combatants["enemy-0"].currentHp;
    const expectedHeal = Math.max(1, Math.floor(state.combatants["enemy-0"].maxHp * 0.25));
    expect((startingHp - (preview?.estimate.averageDamage ?? 0)) / state.combatants["enemy-0"].maxHp).toBeLessThanOrEqual(0.5);

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Crunch", targetId: "enemy-0" }]),
      buildPassPlan(state, "enemy", ["enemy-0"]),
    );

    expect(result.state.combatants["enemy-0"].itemConsumed).toBe(true);
    expect(result.state.combatants["enemy-0"].currentHp).toBe(
      startingHp - (preview?.estimate.averageDamage ?? 0) + expectedHeal,
    );
  });

  it("heals at end of turn with Leftovers", () => {
    const holder = makePokemon("Leftovers Holder");
    const enemy = makePokemon("Enemy");
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: holder, moveNames: [], currentHpPercent: 75, itemName: "Leftovers" })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: enemy, moveNames: [] })],
      moves: [],
    });

    const startingHp = state.combatants["ally-0"].currentHp;
    const result = resolveTurn(
      state,
      buildPassPlan(state, "ally", ["ally-0"]),
      buildPassPlan(state, "enemy", ["enemy-0"]),
    );

    expect(result.state.combatants["ally-0"].currentHp).toBeGreaterThan(startingHp);
  });

  it("heals Poison-types and damages non-Poison holders with Black Sludge", () => {
    const poisonHolder = makePokemon("Poison Holder", { types: ["Poison"] });
    const sludgeVictim = makePokemon("Sludge Victim", { types: ["Normal"] });
    const state = createTestBattleState({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: poisonHolder,
          moveNames: [],
          currentHpPercent: 75,
          itemName: "Black Sludge",
        }),
      ],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: sludgeVictim, moveNames: [], itemName: "Black Sludge" })],
      moves: [],
    });

    const allyStartingHp = state.combatants["ally-0"].currentHp;
    const enemyStartingHp = state.combatants["enemy-0"].currentHp;
    const result = resolveTurn(
      state,
      buildPassPlan(state, "ally", ["ally-0"]),
      buildPassPlan(state, "enemy", ["enemy-0"]),
    );

    expect(result.state.combatants["ally-0"].currentHp).toBeGreaterThan(allyStartingHp);
    expect(result.state.combatants["enemy-0"].currentHp).toBeLessThan(enemyStartingHp);
  });

  it("reaches depth 3 in deep mode on low-branch positions and returns PV diagnostics", () => {
    const ally = makePokemon("Closer", { baseStats: { atk: 120, spe: 105 } });
    const enemy = makePokemon("Wall", { baseStats: { hp: 110, def: 110, spe: 70 } });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: ally, moveNames: ["Tackle"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: enemy, moveNames: ["Tackle"] })],
      moves: [tackle],
    });

    const recommendation = recommendBestPlan(state, {
      searchMode: "deep",
      objectiveMode: "robust",
      maxJointPlansPerSide: 3,
      maxIndividualActionsPerActor: 2,
    });

    expect(recommendation.depthReached).toBe(3);
    expect(recommendation.diagnostics.depthReached).toBe(3);
    expect(recommendation.diagnostics.pv.length).toBeGreaterThan(0);
    expect(recommendation.diagnostics.ttStores).toBeGreaterThan(0);
  });

  it("uses candidate enemy beliefs when likely mode values Trick Room denial", () => {
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

    const state = createTestBattleState({
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

    const recommendation = recommendBestPlan(state, {
      searchMode: "balanced",
      objectiveMode: "likely",
      maxJointPlansPerSide: 8,
      maxIndividualActionsPerActor: 5,
    });

    expect(recommendation.bestPlan?.summary).toContain("Fake Out");
    expect(
      recommendation.diagnostics.enemyBeliefs.some(
        (entry) => entry.moves.some((move) => move.moveName === "Trick Room" && move.policyWeight > 0.3),
      ),
    ).toBe(true);
  });

  it("prefers Wide Guard into double spread pressure", () => {
    const wideGuardUser = makePokemon("Hariyama", { baseStats: { hp: 120, atk: 120, spe: 50 } });
    const allyPartner = makePokemon("Fragile Partner", { baseStats: { hp: 70, def: 70, spd: 70, spe: 90 } });
    const rockSlider = makePokemon("Tyranitar", { baseStats: { atk: 134, spe: 61 } });
    const heatWaver = makePokemon("Charizard", { baseStats: { spa: 130, spe: 100 } });
    const wideGuard = makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, target: "self", priority: 3 });
    const closeCombat = makeMove("Close Combat", { type: "Fighting", category: "Physical", basePower: 120, target: "normal" });
    const rockSlide = makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" });
    const heatWave = makeMove("Heat Wave", { type: "Fire", category: "Special", basePower: 95, target: "allAdjacentFoes" });

    const state = createTestBattleState({
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

    const recommendation = recommendBestPlan(state, {
      searchMode: "balanced",
      objectiveMode: "robust",
      maxJointPlansPerSide: 8,
      maxIndividualActionsPerActor: 5,
    });

    expect(recommendation.bestPlan?.summary).toContain("Wide Guard");
  });

  it("does not treat Wide Guard as Fake Out counterplay when no spread attack is threatened", () => {
    const fakeOutUser = makePokemon("Sneasler", { baseStats: { atk: 130, spe: 120 } });
    const partner = makePokemon("Partner", { baseStats: { spa: 115, spe: 90 } });
    const charizard = makePokemon("Charizard Y", { types: ["Fire", "Flying"], baseStats: { hp: 100, def: 90, spd: 100, spe: 100 } });
    const aerodactyl = makePokemon("Aerodactyl", { types: ["Rock", "Flying"], baseStats: { atk: 105, spd: 80, spe: 130 } });
    const fakeOut = makeMove("Fake Out", {
      type: "Normal",
      category: "Physical",
      basePower: 40,
      priority: 3,
      target: "normal",
    });
    const thunderbolt = makeMove("Thunderbolt", { type: "Electric", category: "Special", basePower: 90, target: "normal" });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
    const wideGuard = makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, target: "self", priority: 3 });
    const heatWave = makeMove("Heat Wave", { type: "Fire", category: "Special", basePower: 95, target: "allAdjacentFoes" });
    const rockSlide = makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: fakeOutUser, moveNames: ["Fake Out"] }),
        makeMember({ side: "ally", slot: 1, pokemon: partner, moveNames: ["Thunderbolt"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: charizard, moveNames: ["Protect", "Heat Wave"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: aerodactyl, moveNames: ["Wide Guard", "Rock Slide"] }),
      ],
      moves: [fakeOut, thunderbolt, protect, wideGuard, heatWave, rockSlide],
    });

    const enemyPlans = generateJointActionPlans(state, "enemy", {
      maxJointPlans: 8,
      maxIndividualActionsPerActor: 5,
    });

    expect(enemyPlans[0]?.summary).not.toContain("Aerodactyl: Wide Guard");

    const recommendation = recommendBestPlan(state, {
      searchMode: "balanced",
      objectiveMode: "likely",
      maxJointPlansPerSide: 8,
      maxIndividualActionsPerActor: 5,
    });

    expect(recommendation.predictedEnemyResponse?.summary).not.toContain("Aerodactyl: Wide Guard");
  });

  it("values Wide Guard when it saves Charizard from Garchomp's Rock Slide", () => {
    const charizard = makePokemon("Charizard", { types: ["Fire", "Flying"], baseStats: { hp: 90, spa: 130, def: 80, spe: 100 } });
    const aerodactyl = makePokemon("Aerodactyl", { types: ["Rock", "Flying"], baseStats: { atk: 105, def: 75, spe: 130 } });
    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { atk: 170, spe: 102 } });
    const enemyPartner = makePokemon("Enemy Partner", { baseStats: { hp: 110, def: 100, spe: 70 } });
    const wideGuard = makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, target: "self", priority: 3 });
    const weatherBall = makeMove("Weather Ball", { type: "Fire", category: "Special", basePower: 100, target: "normal" });
    const rockSlide = makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 40, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: charizard, moveNames: ["Weather Ball"], currentHpPercent: 35 }),
        makeMember({ side: "ally", slot: 1, pokemon: aerodactyl, moveNames: ["Wide Guard", "Tackle"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: garchomp, moveNames: ["Rock Slide"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: enemyPartner, moveNames: ["Tackle"] }),
      ],
      moves: [wideGuard, weatherBall, rockSlide, tackle],
    });

    const recommendation = recommendBestPlan(state, {
      searchMode: "balanced",
      objectiveMode: "robust",
      maxJointPlansPerSide: 8,
      maxIndividualActionsPerActor: 5,
    });

    expect(recommendation.bestPlan?.summary).toContain("Aerodactyl: Wide Guard");
  });

  it("allows Protect plus Wide Guard when they cover distinct lethal threats", () => {
    const charizard = makePokemon("Charizard", { types: ["Fire", "Flying"], baseStats: { hp: 90, def: 80, spd: 85, spe: 100 } });
    const aerodactyl = makePokemon("Aerodactyl", { types: ["Rock", "Flying"], baseStats: { hp: 80, def: 65, spd: 75, spe: 130 } });
    const miraidon = makePokemon("Miraidon", { types: ["Electric", "Dragon"], baseStats: { spa: 180, spe: 135 } });
    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { atk: 170, spe: 102 } });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
    const wideGuard = makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, target: "self", priority: 3 });
    const thunderbolt = makeMove("Thunderbolt", { type: "Electric", category: "Special", basePower: 90, target: "normal" });
    const rockSlide = makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 40, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: charizard, moveNames: ["Protect", "Tackle"], currentHpPercent: 30 }),
        makeMember({ side: "ally", slot: 1, pokemon: aerodactyl, moveNames: ["Wide Guard", "Tackle"], currentHpPercent: 45 }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: miraidon, moveNames: ["Thunderbolt"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: garchomp, moveNames: ["Rock Slide"] }),
      ],
      moves: [protect, wideGuard, thunderbolt, rockSlide, tackle],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxJointPlans: 12,
      maxIndividualActionsPerActor: 5,
    });

    expect(plans[0]?.summary).toContain("Charizard: Protect");
    expect(plans[0]?.summary).toContain("Aerodactyl: Wide Guard");
  });

  it("does not reward Wide Guard when its only valuable spread target is already protecting", () => {
    const charizard = makePokemon("Charizard", { types: ["Fire", "Flying"], baseStats: { hp: 90, def: 80, spe: 100 } });
    const steelix = makePokemon("Steelix", { types: ["Steel", "Ground"], baseStats: { hp: 120, atk: 105, def: 220, spe: 30 } });
    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { atk: 155, spe: 102 } });
    const enemyPartner = makePokemon("Enemy Partner", { baseStats: { hp: 110, def: 100, spe: 70 } });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
    const wideGuard = makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, target: "self", priority: 3 });
    const heavySlam = makeMove("Heavy Slam", { type: "Steel", category: "Physical", basePower: 80, target: "normal" });
    const rockSlide = makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 40, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: charizard, moveNames: ["Protect"], currentHpPercent: 25 }),
        makeMember({ side: "ally", slot: 1, pokemon: steelix, moveNames: ["Wide Guard", "Heavy Slam"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: garchomp, moveNames: ["Rock Slide"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: enemyPartner, moveNames: ["Tackle"] }),
      ],
      moves: [protect, wideGuard, heavySlam, rockSlide, tackle],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxJointPlans: 12,
      maxIndividualActionsPerActor: 5,
    });
    const protectWideGuard = plans.find(
      (plan) => plan.summary.includes("Charizard: Protect") && plan.summary.includes("Steelix: Wide Guard"),
    );
    const protectAttack = plans.find(
      (plan) => plan.summary.includes("Charizard: Protect") && plan.summary.includes("Steelix: Heavy Slam"),
    );

    expect(protectWideGuard?.heuristicScore ?? Number.NEGATIVE_INFINITY).toBeLessThan(
      protectAttack?.heuristicScore ?? Number.POSITIVE_INFINITY,
    );
  });

  it("lets a partner attack when a faster ally KOs the threatening enemy first", () => {
    const fastAttacker = makePokemon("Fast Attacker", { baseStats: { atk: 170, spe: 150 } });
    const charizard = makePokemon("Charizard", { types: ["Fire", "Flying"], baseStats: { hp: 90, spa: 130, def: 80, spe: 100 } });
    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { hp: 90, def: 70, atk: 165, spe: 102 } });
    const enemyPartner = makePokemon("Enemy Partner", { types: ["Steel"], baseStats: { hp: 120, def: 150, spd: 75, spe: 70 } });
    const icePunch = makeMove("Ice Punch", { type: "Ice", category: "Physical", basePower: 120, target: "normal" });
    const weatherBall = makeMove("Weather Ball", { type: "Fire", category: "Special", basePower: 120, target: "normal" });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
    const rockSlide = makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 40, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: fastAttacker, moveNames: ["Ice Punch"] }),
        makeMember({ side: "ally", slot: 1, pokemon: charizard, moveNames: ["Weather Ball", "Protect"], currentHpPercent: 30 }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: garchomp, moveNames: ["Rock Slide"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: enemyPartner, moveNames: ["Tackle"] }),
      ],
      moves: [icePunch, weatherBall, protect, rockSlide, tackle],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxJointPlans: 12,
      maxIndividualActionsPerActor: 5,
    });

    expect(plans[0]?.summary).toContain("Fast Attacker: Ice Punch into Garchomp");
    expect(plans[0]?.summary).toContain("Charizard: Weather Ball into Enemy Partner");
    expect(plans[0]?.summary).not.toContain("Charizard: Protect");
  });

  it("uses setup when a partner creates faster lethal Protect pressure", () => {
    const garchomp = makePokemon("Garchomp", { types: ["Dragon", "Ground"], baseStats: { atk: 190, spe: 150 } });
    const floette = makePokemon("Mega-Floette", { types: ["Fairy"], baseStats: { hp: 100, spa: 155, spd: 120, spe: 92 } });
    const charizard = makePokemon("Charizard Y", { types: ["Fire", "Flying"], baseStats: { hp: 100, def: 80, spa: 170, spe: 100 } });
    const enemyWall = makePokemon("Enemy Wall", { types: ["Steel"], baseStats: { hp: 130, def: 150, spd: 160, spe: 70 } });
    const stoneEdge = makeMove("Stone Edge", { type: "Rock", category: "Physical", basePower: 150, target: "normal" });
    const calmMind = makeMove("Calm Mind", { type: "Psychic", category: "Status", basePower: 0, target: "self" });
    const moonblast = makeMove("Moonblast", { type: "Fairy", category: "Special", basePower: 95, target: "normal" });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
    const heatWave = makeMove("Heat Wave", { type: "Fire", category: "Special", basePower: 95, target: "allAdjacentFoes" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 35, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: garchomp, moveNames: ["Stone Edge"] }),
        makeMember({ side: "ally", slot: 1, pokemon: floette, moveNames: ["Calm Mind", "Moonblast"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: charizard, moveNames: ["Protect", "Heat Wave"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: enemyWall, moveNames: ["Tackle"] }),
      ],
      moves: [stoneEdge, calmMind, moonblast, protect, heatWave, tackle],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxJointPlans: 12,
      maxIndividualActionsPerActor: 6,
    });

    expect(plans[0]?.summary).toContain("Garchomp: Stone Edge into Charizard Y");
    expect(plans[0]?.summary).toContain("Mega-Floette: Calm Mind");
  });

  it("uses setup when Fake Out covers the damaging threat", () => {
    const sneasler = makePokemon("Sneasler", { baseStats: { atk: 130, spe: 120 } });
    const floette = makePokemon("Mega-Floette", { types: ["Fairy"], baseStats: { hp: 105, spa: 155, spd: 120, spe: 92 } });
    const miraidon = makePokemon("Miraidon", { types: ["Electric"], baseStats: { hp: 115, spa: 180, spd: 125, spe: 135 } });
    const enemyWall = makePokemon("Enemy Wall", { types: ["Steel"], baseStats: { hp: 130, def: 150, spd: 165, spe: 70 } });
    const fakeOut = makeMove("Fake Out", { type: "Normal", category: "Physical", basePower: 40, priority: 3, target: "normal" });
    const calmMind = makeMove("Calm Mind", { type: "Psychic", category: "Status", basePower: 0, target: "self" });
    const moonblast = makeMove("Moonblast", { type: "Fairy", category: "Special", basePower: 95, target: "normal" });
    const flashCannon = makeMove("Flash Cannon", { type: "Steel", category: "Special", basePower: 120, target: "normal" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 35, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: sneasler, moveNames: ["Fake Out"] }),
        makeMember({ side: "ally", slot: 1, pokemon: floette, moveNames: ["Calm Mind", "Moonblast"], currentHpPercent: 70 }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: miraidon, moveNames: ["Flash Cannon"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: enemyWall, moveNames: ["Tackle"] }),
      ],
      moves: [fakeOut, calmMind, moonblast, flashCannon, tackle],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxJointPlans: 12,
      maxIndividualActionsPerActor: 6,
    });

    expect(plans[0]?.summary).toContain("Sneasler: Fake Out into Miraidon");
    expect(plans[0]?.summary).toContain("Mega-Floette: Calm Mind");
  });

  it("does not use setup when the setup user remains exposed to a faster KO", () => {
    const partner = makePokemon("Partner", { baseStats: { atk: 95, spe: 80 } });
    const floette = makePokemon("Mega-Floette", { types: ["Fairy"], baseStats: { hp: 100, spa: 155, spd: 110, spe: 92 } });
    const gengar = makePokemon("Gengar", { types: ["Ghost", "Poison"], baseStats: { hp: 100, spa: 190, spe: 150 } });
    const enemyPartner = makePokemon("Enemy Partner", { baseStats: { hp: 110, atk: 80, spe: 70 } });
    const calmMind = makeMove("Calm Mind", { type: "Psychic", category: "Status", basePower: 0, target: "self" });
    const moonblast = makeMove("Moonblast", { type: "Fairy", category: "Special", basePower: 95, target: "normal" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 45, target: "normal" });
    const sludgeBomb = makeMove("Sludge Bomb", { type: "Poison", category: "Special", basePower: 120, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: partner, moveNames: ["Tackle"] }),
        makeMember({ side: "ally", slot: 1, pokemon: floette, moveNames: ["Calm Mind", "Moonblast"], currentHpPercent: 45 }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: gengar, moveNames: ["Sludge Bomb"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: enemyPartner, moveNames: ["Tackle"] }),
      ],
      moves: [calmMind, moonblast, tackle, sludgeBomb],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxJointPlans: 12,
      maxIndividualActionsPerActor: 6,
    });

    expect(plans[0]?.summary).not.toContain("Mega-Floette: Calm Mind");
  });

  it("does not reward setup when the boost has no useful payoff", () => {
    const sneasler = makePokemon("Sneasler", { baseStats: { atk: 130, spe: 120 } });
    const physicalAttacker = makePokemon("Physical Attacker", { baseStats: { atk: 150, spa: 55, spe: 95 } });
    const enemyThreat = makePokemon("Enemy Threat", { baseStats: { hp: 110, atk: 130, spe: 100 } });
    const enemyPartner = makePokemon("Enemy Partner", { baseStats: { hp: 110, def: 95, spd: 95, spe: 70 } });
    const fakeOut = makeMove("Fake Out", { type: "Normal", category: "Physical", basePower: 40, priority: 3, target: "normal" });
    const calmMind = makeMove("Calm Mind", { type: "Psychic", category: "Status", basePower: 0, target: "self" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 80, target: "normal" });
    const bodySlam = makeMove("Body Slam", { type: "Normal", category: "Physical", basePower: 90, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: sneasler, moveNames: ["Fake Out"] }),
        makeMember({ side: "ally", slot: 1, pokemon: physicalAttacker, moveNames: ["Calm Mind", "Tackle"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: enemyThreat, moveNames: ["Body Slam"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: enemyPartner, moveNames: ["Tackle"] }),
      ],
      moves: [fakeOut, calmMind, tackle, bodySlam],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxJointPlans: 12,
      maxIndividualActionsPerActor: 6,
    });

    expect(plans[0]?.summary).toContain("Sneasler: Fake Out into Enemy Threat");
    expect(plans[0]?.summary).not.toContain("Physical Attacker: Calm Mind");
  });

  it("protects against combined spread plus directional lethal damage", () => {
    const charizard = makePokemon("Charizard", { types: ["Fire", "Flying"], baseStats: { hp: 100, spa: 90, spd: 95, spe: 100 } });
    const partner = makePokemon("Partner", { baseStats: { atk: 80, spe: 70 } });
    const flutter = makePokemon("Flutter Mane", { types: ["Ghost", "Fairy"], baseStats: { hp: 110, spa: 170, spd: 135, spe: 135 } });
    const miraidon = makePokemon("Miraidon", { types: ["Electric", "Dragon"], baseStats: { hp: 120, spa: 165, spd: 115, spe: 135 } });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
    const weatherBall = makeMove("Weather Ball", { type: "Fire", category: "Special", basePower: 70, target: "normal" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 45, target: "normal" });
    const dazzlingGleam = makeMove("Dazzling Gleam", { type: "Fairy", category: "Special", basePower: 100, target: "allAdjacentFoes" });
    const thunderbolt = makeMove("Thunderbolt", { type: "Electric", category: "Special", basePower: 75, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: charizard, moveNames: ["Protect", "Weather Ball"], currentHpPercent: 62 }),
        makeMember({ side: "ally", slot: 1, pokemon: partner, moveNames: ["Tackle"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: flutter, moveNames: ["Dazzling Gleam"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: miraidon, moveNames: ["Thunderbolt"] }),
      ],
      moves: [protect, weatherBall, tackle, dazzlingGleam, thunderbolt],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxJointPlans: 12,
      maxIndividualActionsPerActor: 6,
    });

    expect(plans[0]?.summary).toContain("Charizard: Protect");
  });

  it("values Wide Guard when it breaks a spread plus directional KO bundle", () => {
    const charizard = makePokemon("Charizard", { types: ["Fire", "Flying"], baseStats: { hp: 100, spa: 110, spd: 95, spe: 100 } });
    const aerodactyl = makePokemon("Aerodactyl", { types: ["Rock", "Flying"], baseStats: { atk: 105, spd: 80, spe: 130 } });
    const flutter = makePokemon("Flutter Mane", { types: ["Ghost", "Fairy"], baseStats: { hp: 110, spa: 165, spd: 135, spe: 135 } });
    const miraidon = makePokemon("Miraidon", { types: ["Electric", "Dragon"], baseStats: { hp: 120, spa: 165, spd: 115, spe: 135 } });
    const weatherBall = makeMove("Weather Ball", { type: "Fire", category: "Special", basePower: 70, target: "normal" });
    const wideGuard = makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, target: "self", priority: 3 });
    const rockSlide = makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" });
    const dazzlingGleam = makeMove("Dazzling Gleam", { type: "Fairy", category: "Special", basePower: 100, target: "allAdjacentFoes" });
    const thunderbolt = makeMove("Thunderbolt", { type: "Electric", category: "Special", basePower: 75, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: charizard, moveNames: ["Weather Ball"], currentHpPercent: 62 }),
        makeMember({ side: "ally", slot: 1, pokemon: aerodactyl, moveNames: ["Wide Guard", "Rock Slide"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: flutter, moveNames: ["Dazzling Gleam"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: miraidon, moveNames: ["Thunderbolt"] }),
      ],
      moves: [weatherBall, wideGuard, rockSlide, dazzlingGleam, thunderbolt],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxJointPlans: 12,
      maxIndividualActionsPerActor: 6,
    });

    expect(plans[0]?.summary).toContain("Aerodactyl: Wide Guard");
  });

  it("does not overvalue Wide Guard when the directional hit still KOs after blocking spread damage", () => {
    const charizard = makePokemon("Charizard", { types: ["Fire", "Flying"], baseStats: { hp: 100, spa: 110, spd: 95, spe: 100 } });
    const aerodactyl = makePokemon("Aerodactyl", { types: ["Rock", "Flying"], baseStats: { atk: 105, spd: 80, spe: 130 } });
    const flutter = makePokemon("Flutter Mane", { types: ["Ghost", "Fairy"], baseStats: { hp: 110, spa: 165, spd: 135, spe: 135 } });
    const miraidon = makePokemon("Miraidon", { types: ["Electric", "Dragon"], baseStats: { hp: 120, spa: 185, spd: 115, spe: 135 } });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
    const weatherBall = makeMove("Weather Ball", { type: "Fire", category: "Special", basePower: 70, target: "normal" });
    const wideGuard = makeMove("Wide Guard", { type: "Rock", category: "Status", basePower: 0, target: "self", priority: 3 });
    const rockSlide = makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" });
    const dazzlingGleam = makeMove("Dazzling Gleam", { type: "Fairy", category: "Special", basePower: 80, target: "allAdjacentFoes" });
    const thunderbolt = makeMove("Thunderbolt", { type: "Electric", category: "Special", basePower: 95, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: charizard, moveNames: ["Protect", "Weather Ball"], currentHpPercent: 48 }),
        makeMember({ side: "ally", slot: 1, pokemon: aerodactyl, moveNames: ["Wide Guard", "Rock Slide"] }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: flutter, moveNames: ["Dazzling Gleam"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: miraidon, moveNames: ["Thunderbolt"] }),
      ],
      moves: [protect, weatherBall, wideGuard, rockSlide, dazzlingGleam, thunderbolt],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxJointPlans: 12,
      maxIndividualActionsPerActor: 6,
    });
    const protectAttack = plans.find(
      (plan) => plan.summary.includes("Charizard: Protect") && plan.summary.includes("Aerodactyl: Rock Slide"),
    );
    const attackWideGuard = plans.find(
      (plan) => plan.summary.includes("Charizard: Weather Ball") && plan.summary.includes("Aerodactyl: Wide Guard"),
    );

    expect(attackWideGuard?.heuristicScore ?? Number.NEGATIVE_INFINITY).toBeLessThan(
      protectAttack?.heuristicScore ?? Number.POSITIVE_INFINITY,
    );
  });

  it("does not use setup when spread plus directional damage combine to KO the setup user", () => {
    const partner = makePokemon("Partner", { baseStats: { atk: 95, spe: 80 } });
    const floette = makePokemon("Mega-Floette", { types: ["Fairy"], baseStats: { hp: 100, spa: 155, spd: 120, spe: 92 } });
    const flutter = makePokemon("Flutter Mane", { types: ["Ghost", "Fairy"], baseStats: { hp: 110, spa: 165, spd: 135, spe: 135 } });
    const gengar = makePokemon("Gengar", { types: ["Ghost", "Poison"], baseStats: { hp: 100, spa: 165, spe: 120 } });
    const calmMind = makeMove("Calm Mind", { type: "Psychic", category: "Status", basePower: 0, target: "self" });
    const moonblast = makeMove("Moonblast", { type: "Fairy", category: "Special", basePower: 95, target: "normal" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 45, target: "normal" });
    const dazzlingGleam = makeMove("Dazzling Gleam", { type: "Fairy", category: "Special", basePower: 80, target: "allAdjacentFoes" });
    const sludgeBomb = makeMove("Sludge Bomb", { type: "Poison", category: "Special", basePower: 80, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: partner, moveNames: ["Tackle"] }),
        makeMember({ side: "ally", slot: 1, pokemon: floette, moveNames: ["Calm Mind", "Moonblast"], currentHpPercent: 58 }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: flutter, moveNames: ["Dazzling Gleam"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: gengar, moveNames: ["Sludge Bomb"] }),
      ],
      moves: [calmMind, moonblast, tackle, dazzlingGleam, sludgeBomb],
    });

    const plans = generateJointActionPlans(state, "ally", {
      maxJointPlans: 12,
      maxIndividualActionsPerActor: 6,
    });

    expect(plans[0]?.summary).not.toContain("Mega-Floette: Calm Mind");
  });

  it("can recommend a defensive switch when the current active is in immediate danger", () => {
    const threatened = makePokemon("Gyarados", { types: ["Water", "Flying"], baseStats: { hp: 95, def: 79, spd: 100, spe: 81 } });
    const partner = makePokemon("Partner", { baseStats: { hp: 100, def: 100, spd: 100, spe: 80 } });
    const groundSwitch = makePokemon("Clodsire", { types: ["Poison", "Ground"], baseStats: { hp: 130, def: 75, spd: 100, spe: 20 } });
    const electricEnemy = makePokemon("Miraidon", { types: ["Electric", "Dragon"], baseStats: { spa: 135, spe: 135 } });
    const enemyPartner = makePokemon("Enemy Partner", { baseStats: { atk: 100, spe: 70 } });
    const earthPower = makeMove("Earth Power", { type: "Ground", category: "Special", basePower: 90, target: "normal" });
    const thunderbolt = makeMove("Thunderbolt", { type: "Electric", category: "Special", basePower: 90, target: "normal" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });

    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: threatened, moveNames: [], currentHpPercent: 12 }),
        makeMember({ side: "ally", slot: 1, pokemon: partner, moveNames: ["Tackle"] }),
        makeMember({ side: "ally", slot: 2, pokemon: groundSwitch, moveNames: ["Earth Power"], isActive: false }),
      ],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: electricEnemy, moveNames: ["Thunderbolt"] }),
        makeMember({ side: "enemy", slot: 1, pokemon: enemyPartner, moveNames: ["Tackle"] }),
      ],
      moves: [earthPower, thunderbolt, tackle],
    });

    const recommendation = recommendBestPlan(state, {
      searchMode: "balanced",
      objectiveMode: "robust",
      maxJointPlansPerSide: 8,
      maxIndividualActionsPerActor: 5,
    });

    expect(recommendation.bestPlan?.summary).toContain("switch to Clodsire");
  });

  it("annotates equal-speed ties instead of silently awarding one order", () => {
    const ally = makePokemon("Tie Ally", { baseStats: { atk: 120, spe: 100 } });
    const enemy = makePokemon("Tie Enemy", { baseStats: { atk: 120, spe: 100 } });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: ally, moveNames: ["Tackle"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: enemy, moveNames: ["Tackle"] })],
      moves: [tackle],
    });

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Tackle", targetId: "enemy-0" }]),
      buildMovePlan(state, "enemy", [{ actorId: "enemy-0", moveName: "Tackle", targetId: "ally-0" }]),
    );

    expect(result.events.some((event) => /depends on speed tie/i.test(event.text))).toBe(true);
    expect(result.events.some((event) => event.unsupportedMechanic?.mechanic === "speed tie")).toBe(true);
  });

  it("reports speed-tie uncertainty through search diagnostics", () => {
    const ally = makePokemon("Tie Ally", { baseStats: { atk: 120, spe: 100 } });
    const enemy = makePokemon("Tie Enemy", { baseStats: { atk: 120, spe: 100 } });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: ally, moveNames: ["Tackle"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: enemy, moveNames: ["Tackle"] })],
      moves: [tackle],
    });

    const recommendation = recommendBestPlan(state, {
      searchMode: "fast",
      objectiveMode: "robust",
      maxJointPlansPerSide: 2,
      maxIndividualActionsPerActor: 1,
    });

    expect(recommendation.diagnostics.unsupportedMechanics.some((marker) => marker.mechanic === "speed tie")).toBe(true);
    expect(recommendation.diagnostics.mechanicsSupportReport?.approximate).toContain("speed tie");
  });

  it("computes represented groundedness from Gravity, Iron Ball, and Air Balloon", () => {
    const flying = makePokemon("Flying Target", { types: ["Flying"] });
    const state = createTestBattleState({
      ally: [
        makeMember({ side: "ally", slot: 0, pokemon: flying, moveNames: [], itemName: "Air Balloon" }),
        makeMember({ side: "ally", slot: 1, pokemon: flying, moveNames: [], itemName: "Iron Ball" }),
      ],
      enemy: [],
      moves: [],
    });

    expect(getGroundedState(state.combatants["ally-0"], state.field).grounded).toBe(false);
    expect(getGroundedState(state.combatants["ally-1"], state.field).grounded).toBe(true);
    expect(getGroundedState(state.combatants["ally-0"], { ...state.field, gravityTurns: 3 }).grounded).toBe(true);
  });

  it("blocks priority with Psychic Terrain only against grounded targets", () => {
    const fakeOutUser = makePokemon("Fake Out User", { baseStats: { atk: 110, spe: 120 } });
    const grounded = makePokemon("Grounded Target", { types: ["Normal"], baseStats: { hp: 120, def: 110 } });
    const flying = makePokemon("Flying Target", { types: ["Flying"], baseStats: { hp: 120, def: 110 } });
    const fakeOut = makeMove("Fake Out", { type: "Normal", category: "Physical", basePower: 40, priority: 3, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: fakeOutUser, moveNames: ["Fake Out"] })],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: grounded, moveNames: [] }),
        makeMember({ side: "enemy", slot: 1, pokemon: flying, moveNames: [] }),
      ],
      moves: [fakeOut],
      terrain: "psychic",
    });

    const groundedResult = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Fake Out", targetId: "enemy-0" }]),
      buildPassPlan(state, "enemy", ["enemy-0", "enemy-1"]),
    );
    const flyingResult = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Fake Out", targetId: "enemy-1" }]),
      buildPassPlan(state, "enemy", ["enemy-0", "enemy-1"]),
    );

    expect(groundedResult.events.some((event) => /blocks/i.test(event.text))).toBe(true);
    expect(flyingResult.state.combatants["enemy-1"].currentHp).toBeLessThan(state.combatants["enemy-1"].maxHp);
  });

  it("blocks priority through Armor Tail-style abilities when represented", () => {
    const fakeOutUser = makePokemon("Fake Out User", { baseStats: { atk: 110, spe: 120 } });
    const target = makePokemon("Target", { baseStats: { hp: 120, def: 110 } });
    const armorTail = makePokemon("Armor Tail Ally", { abilities: { "0": "Armor Tail" } });
    const fakeOut = makeMove("Fake Out", { type: "Normal", category: "Physical", basePower: 40, priority: 3, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: fakeOutUser, moveNames: ["Fake Out"] })],
      enemy: [
        makeMember({ side: "enemy", slot: 0, pokemon: target, moveNames: [] }),
        makeMember({ side: "enemy", slot: 1, pokemon: armorTail, moveNames: [], abilityName: "Armor Tail" }),
      ],
      moves: [fakeOut],
    });

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Fake Out", targetId: "enemy-0" }]),
      buildPassPlan(state, "enemy", ["enemy-0", "enemy-1"]),
    );

    expect(result.events.some((event) => /blocks/i.test(event.text))).toBe(true);
    expect(result.state.combatants["enemy-0"].currentHp).toBe(state.combatants["enemy-0"].maxHp);
  });

  it("lets Grass, Overcoat, and Safety Goggles ignore Rage Powder redirection", () => {
    const attacker = makePokemon("Attacker", { baseStats: { spa: 120, spe: 100 } });
    const redirector = makePokemon("Redirector", { baseStats: { hp: 120, spd: 90 } });
    const ragePowder = makeMove("Rage Powder", { type: "Bug", category: "Status", basePower: 0, target: "self", priority: 2 });
    const psychic = makeMove("Psychic", { type: "Psychic", category: "Special", basePower: 90, target: "normal" });
    const cases = [
      { pokemon: makePokemon("Grass Target", { types: ["Grass"], baseStats: { hp: 120, spd: 90 } }) },
      { pokemon: makePokemon("Overcoat Target", { baseStats: { hp: 120, spd: 90 } }), abilityName: "Overcoat" },
      { pokemon: makePokemon("Goggles Target", { baseStats: { hp: 120, spd: 90 } }), itemName: "Safety Goggles" },
    ];

    for (const targetCase of cases) {
      const state = createTestBattleState({
        ally: [makeMember({ side: "ally", slot: 0, pokemon: attacker, moveNames: ["Psychic"] })],
        enemy: [
          makeMember({
            side: "enemy",
            slot: 0,
            pokemon: targetCase.pokemon,
            moveNames: [],
            abilityName: targetCase.abilityName,
            itemName: targetCase.itemName,
          }),
          makeMember({ side: "enemy", slot: 1, pokemon: redirector, moveNames: ["Rage Powder"] }),
        ],
        moves: [ragePowder, psychic],
      });

      const result = resolveTurn(
        state,
        buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Psychic", targetId: "enemy-0" }]),
        buildMovePlan(state, "enemy", [{ actorId: "enemy-1", moveName: "Rage Powder" }]),
      );

      expect(result.state.combatants["enemy-0"].currentHp).toBeLessThan(state.combatants["enemy-0"].maxHp);
      expect(result.state.combatants["enemy-1"].currentHp).toBe(state.combatants["enemy-1"].maxHp);
    }
  });

  it("respects known Fake Out prevention from item or ability", () => {
    const fakeOutUser = makePokemon("Fake Out User", { baseStats: { atk: 110, spe: 120 } });
    const target = makePokemon("Target", { baseStats: { hp: 120, def: 110, spe: 90 } });
    const fakeOut = makeMove("Fake Out", { type: "Normal", category: "Physical", basePower: 40, priority: 3, target: "normal" });
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 50, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: fakeOutUser, moveNames: ["Fake Out"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: target, moveNames: ["Tackle"], itemName: "Covert Cloak" })],
      moves: [fakeOut, tackle],
    });

    const result = resolveTurn(
      state,
      buildMovePlan(state, "ally", [{ actorId: "ally-0", moveName: "Fake Out", targetId: "enemy-0" }]),
      buildMovePlan(state, "enemy", [{ actorId: "enemy-0", moveName: "Tackle", targetId: "ally-0" }]),
    );

    expect(result.events.some((event) => /protected from Fake Out/i.test(event.text))).toBe(true);
    expect(result.events.some((event) => /Target uses Tackle/i.test(event.text))).toBe(true);
  });

  it("uses open-team-sheet data as fixed and keeps closed-sheet set hypotheses", () => {
    const otsMon = makePokemon("OTS Mon");
    const closedMon = makePokemon("Closed Mon");
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 50, target: "normal" });
    const trickRoom = makeMove("Trick Room", { type: "Psychic", category: "Status", basePower: 0, target: "all" });
    const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: otsMon, moveNames: ["Tackle"], candidateMoves: [makeCandidateMove("Trick Room", 1)], infoMode: "openTeamSheet" })],
      enemy: [
        makeMember({
          side: "enemy",
          slot: 0,
          pokemon: closedMon,
          moveNames: [],
          infoMode: "closedSheet",
          setHypotheses: [
            { moves: ["Trick Room", "Protect"], item: "Covert Cloak", ability: "Inner Focus", probability: 0.6, source: "preset" },
            { moves: ["Tackle", "Protect"], item: "Safety Goggles", ability: "Overcoat", probability: 0.4, source: "inferred" },
          ],
        }),
      ],
      moves: [tackle, trickRoom, protect],
    });

    expect(state.combatants["ally-0"].candidateMoves.map((move) => move.name)).not.toContain("Trick Room");
    expect(getSetHypotheses(state.combatants["enemy-0"])).toHaveLength(2);
  });
});
