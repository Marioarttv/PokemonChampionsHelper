import { describe, expect, it } from "vitest";
import { buildEnemyBattleStateMember } from "../lib/engine";
import { buildBattleEngineInputSignature } from "../lib/engine/signature";
import { createMoveLookup, makePokemon, makeSavedAttack, makeMove } from "../lib/engine/__tests__/fixtures";
import type { BattleStateMemberInput } from "../lib/engine";

function makeMember(overrides: Partial<BattleStateMemberInput> = {}): BattleStateMemberInput {
  return {
    id: overrides.id ?? "ally-0",
    label: overrides.label ?? "Slot 1",
    pokemon: overrides.pokemon ?? makePokemon("Adapter Mon"),
    teamIndex: overrides.teamIndex ?? 0,
    savedAttacks: overrides.savedAttacks ?? [makeSavedAttack("Tackle", "normal", "physical", 50)],
    moveNames: overrides.moveNames ?? ["Tackle"],
    inferredMoveNames: overrides.inferredMoveNames ?? [],
    abilityName: overrides.abilityName ?? "Pressure",
    itemName: overrides.itemName ?? "Leftovers",
    knowledge: overrides.knowledge ?? "known",
    currentHpPercent: overrides.currentHpPercent ?? 100,
    statusCondition: overrides.statusCondition ?? "none",
    sleepTurns: overrides.sleepTurns ?? 0,
    turnsActive: overrides.turnsActive ?? 0,
    isActive: overrides.isActive ?? true,
  };
}

function buildSignature(overrides: {
  allyMembers?: BattleStateMemberInput[];
  enemyMembers?: BattleStateMemberInput[];
} = {}) {
  return buildBattleEngineInputSignature({
    allySelection: [0, 1],
    enemySelection: [0, 1],
    allyMembers: overrides.allyMembers ?? [makeMember({ id: "ally-0" }), makeMember({ id: "ally-1", teamIndex: 1 })],
    enemyMembers:
      overrides.enemyMembers ??
      [
        makeMember({ id: "enemy-0", teamIndex: 0, knowledge: "partial" }),
        makeMember({ id: "enemy-1", teamIndex: 1, knowledge: "unknown" }),
      ],
    weather: "none",
    terrain: "none",
    allyTailwind: false,
    enemyTailwind: false,
    trickRoom: false,
  });
}

describe("battle engine adapter smoke coverage", () => {
  it("sanity: marks the signature stale when HP changes", () => {
    const base = buildSignature();
    const changed = buildSignature({
      allyMembers: [makeMember({ id: "ally-0", currentHpPercent: 80 }), makeMember({ id: "ally-1", teamIndex: 1 })],
    });

    expect(changed).not.toBe(base);
  });

  it("marks the signature stale when move knowledge changes", () => {
    const base = buildSignature();
    const changed = buildSignature({
      allyMembers: [
        makeMember({ id: "ally-0", moveNames: ["Tackle"], savedAttacks: [makeSavedAttack("Tackle", "normal", "physical", 50)] }),
        makeMember({ id: "ally-1", teamIndex: 1, moveNames: ["Protect"], savedAttacks: [makeSavedAttack("Protect", "normal", "physical", 0)] }),
      ],
    });

    expect(changed).not.toBe(base);
  });

  it("marks the signature stale when ability, item, or inferred moves change", () => {
    const base = buildSignature();
    const changed = buildSignature({
      enemyMembers: [
        makeMember({ id: "enemy-0", knowledge: "partial", abilityName: "Intimidate", inferredMoveNames: ["Protect"] }),
        makeMember({ id: "enemy-1", teamIndex: 1, knowledge: "unknown", itemName: "Life Orb" }),
      ],
    });

    expect(changed).not.toBe(base);
  });

  it("uses only the stored preset enemy move quartet without speculative candidates", () => {
    const incineroar = makePokemon("Incineroar", {
      id: "incineroar",
      baseSpecies: "Incineroar",
      types: ["Fire", "Dark"],
      baseStats: { hp: 95, atk: 115, def: 90, spa: 80, spd: 90, spe: 60 },
    });
    const moves = [
      makeMove("Fake Out", { type: "Normal", category: "Physical", basePower: 40, priority: 3, target: "normal" }),
      makeMove("Flare Blitz", { type: "Fire", category: "Physical", basePower: 120, target: "normal" }),
      makeMove("Knock Off", { type: "Dark", category: "Physical", basePower: 65, target: "normal" }),
      makeMove("Taunt", { type: "Dark", category: "Status", basePower: 0, target: "normal" }),
      makeMove("Trick Room", { type: "Psychic", category: "Status", basePower: 0, target: "all" }),
    ];

    const member = buildEnemyBattleStateMember({
      slotIndex: 0,
      pokemon: incineroar,
      resolvedMoveset: {
        savedAttacks: [],
        knownMoves: [],
        allMoveNames: ["Fake Out", "Flare Blitz", "Knock Off", "Taunt"],
        abilityName: "Intimidate",
        itemName: "Sitrus Berry",
        statSpread: null,
        movesetSource: "preset",
      },
      runtime: {
        hpPercent: 100,
        attackStage: 0,
        defenseStage: 0,
        specialAttackStage: 0,
        specialDefenseStage: 0,
        speedStage: 0,
        statusCondition: "none",
        sleepTurns: 0,
        tauntTurns: 0,
        encoreTurns: 0,
        encoredMoveId: null,
        disableTurns: 0,
        disabledMoveId: null,
        helpingHandTurns: 0,
        lastMoveId: null,
        turnsActive: 0,
        protectStreak: 0,
      },
      isActive: true,
      moveByKey: createMoveLookup(...moves),
    });

    expect(member.knownMoves.map((move) => move.name)).toEqual(["Fake Out", "Flare Blitz", "Knock Off", "Taunt"]);
    expect(member.moveNames).toEqual(["Fake Out", "Flare Blitz", "Knock Off", "Taunt"]);
    expect(member.candidateMoves).toEqual([]);
    expect(member.knowledge).toBe("known");
    expect(member.knownMoves.some((move) => move.name === "Trick Room")).toBe(false);
  });
});
