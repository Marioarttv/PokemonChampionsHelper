import type { DamageTerrain, DamageWeather } from "../damage";
import type { BattleStateMemberInput, ObjectiveMode, SearchMode } from "./types";

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
  searchMode?: SearchMode;
  objectiveMode?: ObjectiveMode;
};

export function buildBattleEngineInputSignature(options: BattleEngineInputSignatureOptions) {
  const serializeMember = (member: BattleStateMemberInput, isEnemy: boolean) => ({
    id: member.id,
    hp: member.currentHp ?? member.currentHpPercent ?? 100,
    stages: member.stages ?? null,
    statusCondition: member.statusCondition ?? "none",
    sleepTurns: member.sleepTurns ?? 0,
    active: member.isActive,
    turnsActive: member.turnsActive ?? 0,
    abilityName: member.abilityName ?? null,
    itemName: member.itemName ?? null,
    statSpread: member.statSpread ?? null,
    knowledge: isEnemy ? member.knowledge ?? "known" : undefined,
    savedAttacks:
      member.savedAttacks?.map((attack) => ({
        id: attack.id,
        label: attack.label,
        type: attack.type,
        basePower: attack.basePower ?? null,
        category: attack.category ?? null,
        isSpreadMove: attack.isSpreadMove ?? false,
      })) ?? [],
    knownMoves:
      member.knownMoves?.map((move) => ({
        id: move.id,
        label: move.label,
        name: move.name ?? null,
        type: move.type ?? null,
        basePower: move.basePower ?? null,
        category: move.category ?? null,
        isSpreadMove: move.isSpreadMove ?? false,
      })) ?? [],
    moveNames: member.moveNames ?? [],
    inferredMoveNames: member.inferredMoveNames ?? [],
    candidateMoves:
      member.candidateMoves?.map((move) => ({
        name: move.name,
        source: move.source,
        weight: move.weight,
        confidence: move.confidence,
      })) ?? [],
  });

  return JSON.stringify({
    allySelection: options.allySelection,
    enemySelection: options.enemySelection,
    allyMembers: options.allyMembers.map((member) => serializeMember(member, false)),
    enemyMembers: options.enemyMembers.map((member) => serializeMember(member, true)),
    weather: options.weather,
    terrain: options.terrain,
    allyTailwind: options.allyTailwind,
    enemyTailwind: options.enemyTailwind,
    trickRoom: options.trickRoom,
    searchMode: options.searchMode ?? "balanced",
    objectiveMode: options.objectiveMode ?? "robust",
  });
}
