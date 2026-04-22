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
          speedStage: -1,
          statusCondition: "burn",
          sleepTurns: 0,
        },
      ],
      [
        2,
        {
          hpPercent: 38,
          attackStage: -2,
          defenseStage: 3,
          speedStage: 0,
          statusCondition: "sleep",
          sleepTurns: 2,
        },
      ],
    ]);

    const hydrated = applyRuntimeToBattleStateMembers(members, [2, 5], (member) => runtimeByTeamIndex.get(member.teamIndex)!);

    expect(hydrated[0]?.isActive).toBe(false);
    expect(hydrated[0]?.currentHpPercent).toBe(72);
    expect(hydrated[0]?.stages).toEqual({ attack: 1, defense: 0, speed: -1 });
    expect(hydrated[0]?.statusCondition).toBe("burn");
    expect(hydrated[1]?.isActive).toBe(true);
    expect(hydrated[1]?.currentHpPercent).toBe(38);
    expect(hydrated[1]?.stages).toEqual({ attack: -2, defense: 3, speed: 0 });
    expect(hydrated[1]?.statusCondition).toBe("sleep");
    expect(hydrated[1]?.sleepTurns).toBe(2);
  });

  it("does not mutate the original member inputs", () => {
    const original = makeMember(1);
    const hydrated = applyRuntimeToBattleStateMembers([original], [1], () => ({
      hpPercent: 50,
      attackStage: 2,
      defenseStage: -1,
      speedStage: 1,
      statusCondition: "paralysis",
      sleepTurns: 0,
    }));

    expect(original.isActive).toBe(false);
    expect(original.currentHpPercent).toBe(100);
    expect(original.stages).toBeUndefined();
    expect(hydrated[0]).not.toBe(original);
  });
});
