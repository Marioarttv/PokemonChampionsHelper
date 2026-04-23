import { describe, expect, it } from "vitest";
import type { BattleStateMemberInput } from "..";
import { applyRuntimeToBattleStateMembers, type BattleRuntimeSnapshot } from "../adapters/fromSimulatorState";
import { makePokemon } from "./fixtures";

function makeMember(teamIndex: number, isActive = false): BattleStateMemberInput {
  return {
    id: `ally-${teamIndex}`,
    label: `Slot ${teamIndex + 1}`,
    pokemon: makePokemon(`Pokemon ${teamIndex + 1}`),
    teamIndex,
    moveNames: ["Tackle"],
    currentHpPercent: 100,
    statusCondition: "none",
    sleepTurns: 0,
    isActive,
  };
}

describe("battle simulator runtime adapter", () => {
  it("hydrates selected members with live runtime and active flags", () => {
    const members = [makeMember(0), makeMember(2)];
    const runtimeByTeamIndex = new Map<number, BattleRuntimeSnapshot>([
      [
        0,
        {
          hpPercent: 72,
          attackStage: 1,
          defenseStage: 0,
          specialAttackStage: 2,
          specialDefenseStage: -1,
          speedStage: -1,
          statusCondition: "burn",
          sleepTurns: 0,
          tauntTurns: 0,
          encoreTurns: 0,
          encoredMoveId: null,
          disableTurns: 0,
          disabledMoveId: null,
          helpingHandTurns: 0,
          lastMoveId: "ally-0-saved-tackle",
          turnsActive: 2,
          protectStreak: 1,
        },
      ],
      [
        2,
        {
          hpPercent: 38,
          attackStage: -2,
          defenseStage: 3,
          specialAttackStage: 1,
          specialDefenseStage: -2,
          speedStage: 0,
          statusCondition: "sleep",
          sleepTurns: 2,
          tauntTurns: 1,
          encoreTurns: 2,
          encoredMoveId: "ally-2-saved-protect",
          disableTurns: 0,
          disabledMoveId: null,
          helpingHandTurns: 0,
          lastMoveId: "ally-2-saved-protect",
          turnsActive: 1,
          protectStreak: 1,
        },
      ],
    ]);

    const hydrated = applyRuntimeToBattleStateMembers(members, [2, 5], (member) => runtimeByTeamIndex.get(member.teamIndex)!);

    expect(hydrated[0]?.isActive).toBe(false);
    expect(hydrated[0]?.currentHpPercent).toBe(72);
    expect(hydrated[0]?.stages).toEqual({ attack: 1, defense: 0, specialAttack: 2, specialDefense: -1, speed: -1 });
    expect(hydrated[0]?.statusCondition).toBe("burn");
    expect(hydrated[0]?.lastMoveId).toBe("ally-0-saved-tackle");
    expect(hydrated[0]?.turnsActive).toBe(2);
    expect(hydrated[0]?.protectStreak).toBe(1);
    expect(hydrated[1]?.isActive).toBe(true);
    expect(hydrated[1]?.currentHpPercent).toBe(38);
    expect(hydrated[1]?.stages).toEqual({ attack: -2, defense: 3, specialAttack: 1, specialDefense: -2, speed: 0 });
    expect(hydrated[1]?.statusCondition).toBe("sleep");
    expect(hydrated[1]?.sleepTurns).toBe(2);
    expect(hydrated[1]?.tauntTurns).toBe(1);
    expect(hydrated[1]?.encoreTurns).toBe(2);
    expect(hydrated[1]?.lastMoveId).toBe("ally-2-saved-protect");
  });

  it("does not mutate the original member inputs", () => {
    const original = makeMember(1);
    const hydrated = applyRuntimeToBattleStateMembers([original], [1], () => ({
      hpPercent: 50,
      attackStage: 2,
      defenseStage: -1,
      specialAttackStage: 3,
      specialDefenseStage: -2,
      speedStage: 1,
      statusCondition: "paralysis",
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
    }));

    expect(original.isActive).toBe(false);
    expect(original.currentHpPercent).toBe(100);
    expect(original.stages).toBeUndefined();
    expect(hydrated[0]).not.toBe(original);
  });
});
