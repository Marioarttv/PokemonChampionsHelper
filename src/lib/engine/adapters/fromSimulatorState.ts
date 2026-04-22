import type { BattleStateMemberInput, BattleStatusCondition } from "../types";

export type BattleRuntimeSnapshot = {
  hpPercent: number;
  attackStage: number;
  defenseStage: number;
  speedStage: number;
  statusCondition: BattleStatusCondition;
  sleepTurns: number;
};

export function applyRuntimeToBattleStateMembers(
  members: BattleStateMemberInput[],
  selectedTeamIndices: readonly number[],
  getRuntime: (member: BattleStateMemberInput) => BattleRuntimeSnapshot,
) {
  const selectedIndexSet = new Set(selectedTeamIndices);

  return members.map((member) => {
    const runtime = getRuntime(member);
    return {
      ...member,
      currentHpPercent: runtime.hpPercent,
      stages: {
        attack: runtime.attackStage,
        defense: runtime.defenseStage,
        speed: runtime.speedStage,
      },
      statusCondition: runtime.statusCondition,
      sleepTurns: runtime.sleepTurns,
      isActive: selectedIndexSet.has(member.teamIndex),
    } satisfies BattleStateMemberInput;
  });
}
