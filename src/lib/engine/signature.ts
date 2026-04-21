import type { DamageTerrain, DamageWeather } from "../damage";
import type { BattleStateMemberInput } from "./types";

type BattleEngineInputSignatureOptions = {
  allySelection: ReadonlyArray<number | null>;
  enemySelection: ReadonlyArray<number | null>;
  allyMembers: BattleStateMemberInput[];
  enemyMembers: BattleStateMemberInput[];
  weather: DamageWeather;
  terrain: DamageTerrain;
  allyTailwind: boolean;
  enemyTailwind: boolean;
  trickRoom: boolean;
};

export function buildBattleEngineInputSignature(options: BattleEngineInputSignatureOptions) {
  return JSON.stringify({
    allySelection: options.allySelection,
    enemySelection: options.enemySelection,
    allyMembers: options.allyMembers.map((member) => ({
      id: member.id,
      hp: member.currentHp ?? member.currentHpPercent ?? 100,
      stages: member.stages ?? null,
      statusCondition: member.statusCondition ?? "none",
      sleepTurns: member.sleepTurns ?? 0,
      active: member.isActive,
    })),
    enemyMembers: options.enemyMembers.map((member) => ({
      id: member.id,
      hp: member.currentHpPercent ?? 100,
      stages: member.stages ?? null,
      statusCondition: member.statusCondition ?? "none",
      sleepTurns: member.sleepTurns ?? 0,
      active: member.isActive,
    })),
    weather: options.weather,
    terrain: options.terrain,
    allyTailwind: options.allyTailwind,
    enemyTailwind: options.enemyTailwind,
    trickRoom: options.trickRoom,
  });
}
