import { describe, expect, it } from "vitest";
import { generateJointActionPlans, getDamagePreview, getEffectiveSpeed, recommendBestPlan, resolveTurn } from "..";
import {
  buildMovePlan,
  buildPassPlan,
  buildSwitchPlan,
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
});
