import type { BattleStateMemberInput, BattleStatusCondition } from "../types";

export type BattleRuntimeSnapshot = {
  hpPercent: number;
  attackStage: number;
  defenseStage: number;
  specialAttackStage: number;
  specialDefenseStage: number;
  speedStage: number;
  statusCondition: BattleStatusCondition;
  sleepTurns: number;
  tauntTurns: number;
  encoreTurns: number;
  encoredMoveId: string | null;
  disableTurns: number;
  disabledMoveId: string | null;
  helpingHandTurns: number;
  lastMoveId: string | null;
  turnsActive: number;
  protectStreak: number;
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
        specialAttack: runtime.specialAttackStage,
        specialDefense: runtime.specialDefenseStage,
        speed: runtime.speedStage,
      },
      statusCondition: runtime.statusCondition,
      sleepTurns: runtime.sleepTurns,
      tauntTurns: runtime.tauntTurns,
      encoreTurns: runtime.encoreTurns,
      encoredMoveId: runtime.encoredMoveId,
      disableTurns: runtime.disableTurns,
      disabledMoveId: runtime.disabledMoveId,
      helpingHandTurns: runtime.helpingHandTurns,
      lastMoveId: runtime.lastMoveId,
      turnsActive: runtime.turnsActive,
      protectStreak: runtime.protectStreak,
      isActive: selectedIndexSet.has(member.teamIndex),
    } satisfies BattleStateMemberInput;
  });
}
