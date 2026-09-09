import { describe, expect, it } from "vitest";
import { getMoveOption, getDamagePreview, resolveTurn } from "../core";
import { buildMovePlan, buildPassPlan, createTestBattleState, makeMember, makeMove, makePokemon } from "./fixtures";

const glide = makeMove("Grassy Glide", { type: "Grass", basePower: 55 });
const tackle = makeMove("Tackle", { basePower: 40 });

describe("M-C turn behavior", () => {
  it("sets Grassy Terrain and lets a slower grounded Grassy Glide move first", () => {
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: makePokemon("Rillaboom", { abilities: {"0": "Grassy Surge"}, baseStats: {spe: 30}, types: ["Grass"] }), moveNames: [glide.name] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: makePokemon("Fast target", {baseStats: {spe: 180}}), moveNames: [tackle.name] })],
      moves: [glide, tackle],
    });
    expect(state.field.terrain).toBe("grassy");
    const id = state.combatants["ally-0"]!.knownMoves[0]!.id;
    expect(getMoveOption(state, "ally-0", id)!.priority).toBe(1);
    const result = resolveTurn(state,
      buildMovePlan(state, "ally", [{actorId: "ally-0", moveName: glide.name, targetId: "enemy-0"}]),
      buildMovePlan(state, "enemy", [{actorId: "enemy-0", moveName: tackle.name, targetId: "ally-0"}]));
    expect(result.events.find((event) => event.text.includes(" uses "))!.actorId).toBe("ally-0");
    state.combatants["ally-0"]!.itemName = "Air Balloon";
    state.combatants["ally-0"]!.itemId = "airballoon";
    expect(getMoveOption(state, "ally-0", id)!.priority).toBe(0);
    state.combatants["ally-0"]!.itemConsumed = true;
    expect(getMoveOption(state, "ally-0", id)!.priority).toBe(1);
  });

  it("applies allied Steely Spirit only while the ally is active", () => {
    const ironHead = makeMove("Iron Head", {type: "Steel", basePower: 80});
    const state = createTestBattleState({
      ally: [
        makeMember({side: "ally", slot: 0, pokemon: makePokemon("Steel attacker"), moveNames: [ironHead.name]}),
        makeMember({side: "ally", slot: 1, pokemon: makePokemon("Perrserker", {abilities: {"0": "Steely Spirit"}})}),
      ],
      enemy: [makeMember({side: "enemy", slot: 0, pokemon: makePokemon("Target")})],
      moves: [ironHead],
    });
    const move = state.combatants["ally-0"]!.knownMoves[0]!;
    const boosted = getDamagePreview(state, "ally-0", "enemy-0", move)!;
    state.sides.ally.activeIds[1] = null;
    const base = getDamagePreview(state, "ally-0", "enemy-0", move)!;
    expect(boosted.maxDamage).toBe(Math.floor(base.maxDamage * 1.5));
  });

  it("consumes Normal Gem and triggers Arboliva's Seed Sower after damage", () => {
    const state = createTestBattleState({
      ally: [makeMember({side: "ally", slot: 0, pokemon: makePokemon("Farfetchd"), itemName: "Normal Gem", moveNames: [tackle.name]})],
      enemy: [makeMember({side: "enemy", slot: 0, pokemon: makePokemon("Arboliva", {abilities: {"0": "Seed Sower"}})})],
      moves: [tackle],
    });
    const move = state.combatants["ally-0"]!.knownMoves[0]!;
    expect(getDamagePreview(state, "ally-0", "enemy-0", move)!.estimate.attackerItemMultiplier).toBe(1.3);
    const result = resolveTurn(state,
      buildMovePlan(state, "ally", [{actorId: "ally-0", moveName: tackle.name, targetId: "enemy-0"}]),
      buildPassPlan(state, "enemy", ["enemy-0"]));
    expect(result.state.field.terrain).toBe("grassy");
    expect(result.state.combatants["ally-0"]!.itemConsumed).toBe(true);
    expect(getDamagePreview(result.state, "ally-0", "enemy-0", move)!.estimate.attackerItemMultiplier).toBe(1);
  });
});
