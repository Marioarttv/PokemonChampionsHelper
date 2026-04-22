import { describe, expect, it } from "vitest";
import { makeMember, makeMove, makePokemon, createTestBattleState } from "../../engine/__tests__/fixtures";
import { ApproximateEngineAdapter } from "../adapters/approximate/ApproximateEngineAdapter";
import { AuthoritativeKernelAdapter } from "../adapters/authoritative/AuthoritativeKernelAdapter";
import { SeededRNG } from "../rng/seededRng";
import {
  createAuthoritativeBattleState,
  createEmptyStatStages,
  type CombatantState,
} from "../state/battleState";

function makeAuthoritativeCombatant(overrides: Partial<CombatantState> = {}): CombatantState {
  return {
    id: overrides.id ?? "p1-a",
    sideId: overrides.sideId ?? "p1",
    position: overrides.position ?? 0,
    speciesId: overrides.speciesId ?? "pikachu",
    speciesName: overrides.speciesName ?? "Pikachu",
    level: overrides.level ?? 50,
    types: overrides.types ?? ["Electric"],
    teraType: overrides.teraType ?? "Electric",
    terastallized: overrides.terastallized ?? false,
    abilityId: overrides.abilityId ?? "static",
    itemId: overrides.itemId ?? "lightball",
    maxHp: overrides.maxHp ?? 100,
    currentHp: overrides.currentHp ?? 100,
    fainted: overrides.fainted ?? false,
    status: overrides.status ?? "none",
    statStages: overrides.statStages ?? createEmptyStatStages(),
    volatileStatuses: overrides.volatileStatuses ?? [],
    moves: overrides.moves ?? [
      {
        id: "thunderbolt",
        name: "Thunderbolt",
        pp: 16,
        maxPp: 16,
        disabled: false,
        revealed: true,
      },
      {
        id: "protect",
        name: "Protect",
        pp: 16,
        maxPp: 16,
        disabled: false,
        revealed: false,
      },
    ],
    publicMoveIds: overrides.publicMoveIds ?? ["thunderbolt"],
  };
}

describe("simulator scaffold", () => {
  it("keeps seeded RNG deterministic across clone and deserialize", () => {
    const rng = new SeededRNG(12345);
    const first = [rng.nextFloat("a"), rng.nextInt(100, "b"), rng.nextFloat("c")];
    const clone = rng.clone();
    const serialized = rng.serialize();

    expect(clone.nextFloat("d")).toBe(SeededRNG.deserialize(serialized).nextFloat("d"));
    expect(first).toEqual([
      0.9797282677609473,
      30,
      0.484205421525985,
    ]);
  });

  it("wraps the approximate engine behind a simulator adapter interface", () => {
    const attacker = makePokemon("Attacker");
    const defender = makePokemon("Defender");
    const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 60, target: "normal" });
    const state = createTestBattleState({
      ally: [makeMember({ side: "ally", slot: 0, pokemon: attacker, moveNames: ["Tackle"] })],
      enemy: [makeMember({ side: "enemy", slot: 0, pokemon: defender, moveNames: ["Tackle"] })],
      moves: [tackle],
    });
    const adapter = new ApproximateEngineAdapter();

    const allyChoices = adapter.legalChoices(state, "ally");
    const enemyChoices = adapter.legalChoices(state, "enemy");
    const result = adapter.applyChoices(state, {
      ally: allyChoices.options[0]?.action,
      enemy: enemyChoices.options[0]?.action,
    });

    expect(allyChoices.options.length).toBeGreaterThan(0);
    expect(enemyChoices.options.length).toBeGreaterThan(0);
    expect(result.state.combatants["enemy-0"].currentHp).toBeLessThan(state.combatants["enemy-0"].maxHp);
    expect(adapter.getReplayEvents(result).length).toBeGreaterThan(0);
  });

  it("keeps authoritative public state separate from private side truth", () => {
    const state = createAuthoritativeBattleState({
      seed: 7,
      sides: {
        p1: {
          name: "Alice",
          activeCombatantIds: ["p1-a"],
          benchCombatantIds: [],
          combatants: [makeAuthoritativeCombatant()],
        },
        p2: {
          name: "Bob",
          activeCombatantIds: ["p2-a"],
          benchCombatantIds: [],
          combatants: [
            makeAuthoritativeCombatant({
              id: "p2-a",
              sideId: "p2",
              speciesId: "gastrodon",
              speciesName: "Gastrodon",
              abilityId: "stormdrain",
              itemId: "sitrusberry",
              moves: [
                {
                  id: "earthpower",
                  name: "Earth Power",
                  pp: 16,
                  maxPp: 16,
                  disabled: false,
                  revealed: true,
                },
                {
                  id: "recover",
                  name: "Recover",
                  pp: 16,
                  maxPp: 16,
                  disabled: false,
                  revealed: false,
                },
              ],
              publicMoveIds: ["earthpower"],
            }),
          ],
        },
      },
    });
    const adapter = new AuthoritativeKernelAdapter();
    const publicState = adapter.getPublicState(state, "p1");

    expect(publicState.phase).toBe("teamPreview");
    expect(publicState.combatants["p1-a"]?.abilityId).toBe("static");
    expect(publicState.combatants["p2-a"]?.abilityId).toBeNull();
    expect(publicState.combatants["p2-a"]?.itemId).toBeNull();
    expect(publicState.combatants["p2-a"]?.moves).toHaveLength(1);
    expect(adapter.legalChoices(state, "p1").requestId).toBe("p1:teamPreview");
  });

  it("marks authoritative turn resolution as unsupported until mechanics are implemented", () => {
    const adapter = new AuthoritativeKernelAdapter();
    const state = createAuthoritativeBattleState({
      seed: 9,
      sides: {
        p1: {
          name: "Alice",
          activeCombatantIds: ["p1-a"],
          benchCombatantIds: [],
          combatants: [makeAuthoritativeCombatant()],
        },
        p2: {
          name: "Bob",
          activeCombatantIds: ["p2-a"],
          benchCombatantIds: [],
          combatants: [
            makeAuthoritativeCombatant({
              id: "p2-a",
              sideId: "p2",
            }),
          ],
        },
      },
    });

    const previewLocked = adapter.applyChoices(state, {
      p1: { type: "teamPreview", leadIds: ["p1-a"] },
      p2: { type: "teamPreview", leadIds: ["p2-a"] },
    });
    const unresolvedTurn = adapter.applyChoices(
      {
        ...previewLocked.state,
        phase: "startTurn",
      },
      {
        p1: { type: "pass", actorId: "p1-a" },
        p2: { type: "pass", actorId: "p2-a" },
      },
    );

    expect(previewLocked.state.phase).toBe("switchIn");
    expect(unresolvedTurn.unsupportedMechanics).toContain("startTurn:turn-resolution");
  });
});
