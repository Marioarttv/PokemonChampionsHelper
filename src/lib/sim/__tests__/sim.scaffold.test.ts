import { describe, expect, it } from "vitest";
import { makeMember, makeMove, makePokemon, createTestBattleState } from "../../engine/__tests__/fixtures";
import { ApproximateEngineAdapter } from "../adapters/approximate/ApproximateEngineAdapter";
import { AuthoritativeKernelAdapter } from "../adapters/authoritative/AuthoritativeKernelAdapter";
import { createAuthoritativeKernel } from "../kernel/authoritativeKernel";
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
  it("clones authoritative combatants on battle-state creation", () => {
    const original = makeAuthoritativeCombatant();
    const state = createAuthoritativeBattleState({
      seed: 5,
      sides: {
        p1: {
          name: "Alice",
          activeCombatantIds: ["p1-a"],
          benchCombatantIds: [],
          combatants: [original],
        },
        p2: {
          name: "Bob",
          activeCombatantIds: ["p2-a"],
          benchCombatantIds: [],
          combatants: [makeAuthoritativeCombatant({ id: "p2-a", sideId: "p2" })],
        },
      },
    });

    original.currentHp = 12;
    original.moves[0]!.name = "Mutated";

    expect(state.combatants["p1-a"]?.currentHp).toBe(100);
    expect(state.combatants["p1-a"]?.moves[0]?.name).toBe("Thunderbolt");
  });

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

    publicState.format.label = "Changed";
    publicState.field.weather = "rain";

    expect(publicState.phase).toBe("teamPreview");
    expect(publicState.combatants["p1-a"]?.abilityId).toBe("static");
    expect(publicState.combatants["p2-a"]?.abilityId).toBeNull();
    expect(publicState.combatants["p2-a"]?.itemId).toBeNull();
    expect(publicState.combatants["p2-a"]?.moves).toHaveLength(1);
    expect(state.format.label).toBe("Gen 9 Doubles / VGC");
    expect(state.field.weather).toBe("none");
    expect(adapter.legalChoices(state, "p1").requestId).toBe("p1:teamPreview");
  });

  it("generates real team-preview requests and validates lead application", () => {
    const adapter = new AuthoritativeKernelAdapter();
    const state = createAuthoritativeBattleState({
      seed: 8,
      sides: {
        p1: {
          name: "Alice",
          activeCombatantIds: ["p1-a", "p1-b"],
          benchCombatantIds: ["p1-c"],
          teamOrder: ["p1-a", "p1-b", "p1-c"],
          combatants: [
            makeAuthoritativeCombatant({ id: "p1-a", position: null }),
            makeAuthoritativeCombatant({ id: "p1-b", position: null, speciesId: "gyarados", speciesName: "Gyarados" }),
            makeAuthoritativeCombatant({ id: "p1-c", position: null, speciesId: "amoonguss", speciesName: "Amoonguss" }),
          ],
        },
        p2: {
          name: "Bob",
          activeCombatantIds: ["p2-a", "p2-b"],
          benchCombatantIds: ["p2-c"],
          teamOrder: ["p2-a", "p2-b", "p2-c"],
          combatants: [
            makeAuthoritativeCombatant({ id: "p2-a", sideId: "p2", position: null }),
            makeAuthoritativeCombatant({ id: "p2-b", sideId: "p2", position: null, speciesId: "arcanine", speciesName: "Arcanine" }),
            makeAuthoritativeCombatant({ id: "p2-c", sideId: "p2", position: null, speciesId: "rillaboom", speciesName: "Rillaboom" }),
          ],
        },
      },
    });

    const p1Request = adapter.legalChoices(state, "p1");
    const p2Request = adapter.legalChoices(state, "p2");
    const applied = adapter.applyChoices(state, {
      p1: { type: "teamPreview", leadIds: ["p1-b", "p1-c"] },
      p2: { type: "teamPreview", leadIds: ["p2-a", "p2-c"] },
    });

    expect(p1Request.kind).toBe("teamPreview");
    expect(p1Request.actorIds).toEqual(["p1-a", "p1-b", "p1-c"]);
    expect(p1Request.options.length).toBe(3);
    expect(p2Request.options.length).toBe(3);
    expect(applied.state.phase).toBe("switchIn");
    expect(applied.state.sides.p1.activeCombatantIds).toEqual(["p1-b", "p1-c"]);
    expect(applied.state.sides.p1.benchCombatantIds).toEqual(["p1-a"]);
    expect(applied.state.combatants["p1-b"]?.position).toBe(0);
    expect(applied.state.combatants["p1-c"]?.position).toBe(1);
    expect(applied.state.combatants["p1-a"]?.position).toBeNull();
  });

  it("rejects illegal team-preview lead selections", () => {
    const adapter = new AuthoritativeKernelAdapter();
    const state = createAuthoritativeBattleState({
      seed: 11,
      sides: {
        p1: {
          name: "Alice",
          activeCombatantIds: ["p1-a", "p1-b"],
          benchCombatantIds: [],
          combatants: [
            makeAuthoritativeCombatant({ id: "p1-a" }),
            makeAuthoritativeCombatant({ id: "p1-b", speciesId: "gyarados", speciesName: "Gyarados" }),
          ],
        },
        p2: {
          name: "Bob",
          activeCombatantIds: ["p2-a", "p2-b"],
          benchCombatantIds: [],
          combatants: [
            makeAuthoritativeCombatant({ id: "p2-a", sideId: "p2" }),
            makeAuthoritativeCombatant({ id: "p2-b", sideId: "p2", speciesId: "arcanine", speciesName: "Arcanine" }),
          ],
        },
      },
    });

    expect(() =>
      adapter.applyChoices(state, {
        p1: { type: "teamPreview", leadIds: ["p1-a", "p1-a"] },
        p2: { type: "teamPreview", leadIds: ["p2-a", "p2-b"] },
      }),
    ).toThrow(/Duplicate lead ids/);
  });

  it("persists RNG snapshot inside battle state across kernel steps", () => {
    const kernel = createAuthoritativeKernel();
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
          combatants: [makeAuthoritativeCombatant({ id: "p2-a", sideId: "p2" })],
        },
      },
    });
    const externalRng = new SeededRNG(99);
    externalRng.nextFloat("advance");

    const previewLocked = kernel.applyChoices(
      state,
      {
        p1: { type: "teamPreview", leadIds: ["p1-a"] },
        p2: { type: "teamPreview", leadIds: ["p2-a"] },
      },
      externalRng,
    );

    expect(previewLocked.state.rng.state).toBe(externalRng.snapshot().state);
    expect(previewLocked.state.rng.seed).toBe(externalRng.snapshot().seed);
  });

  it("uses the dedicated forcedReplacement request kind", () => {
    const adapter = new AuthoritativeKernelAdapter();
    const state = createAuthoritativeBattleState({
      seed: 17,
      sides: {
        p1: {
          name: "Alice",
          activeCombatantIds: ["p1-a"],
          benchCombatantIds: ["p1-b"],
          combatants: [
            makeAuthoritativeCombatant({ id: "p1-a", currentHp: 0, fainted: true }),
            makeAuthoritativeCombatant({ id: "p1-b", position: null, speciesId: "gyarados", speciesName: "Gyarados" }),
          ],
        },
        p2: {
          name: "Bob",
          activeCombatantIds: ["p2-a"],
          benchCombatantIds: [],
          combatants: [makeAuthoritativeCombatant({ id: "p2-a", sideId: "p2" })],
        },
      },
    });

    const forcedState = {
      ...state,
      phase: "forcedReplacement" as const,
      pendingRequestIds: ["p1:forcedReplacement"],
    };
    const request = adapter.legalChoices(forcedState, "p1");

    expect(request.kind).toBe("forcedReplacement");
    expect(request.forced).toBe(true);
    expect(request.actorIds).toEqual(["p1-a"]);
    expect(request.options[0]?.action.type).toBe("switch");
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
