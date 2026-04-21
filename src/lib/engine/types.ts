import type { PokemonType } from "../../data/typeChart";
import type { MoveRecord } from "../battleData";
import type { DamageAbilityId } from "../damageAbilities";
import type { DamageCategory, DamageTerrain, DamageWeather } from "../damage";
import type { DamageItemId } from "../damageItems";
import type { PokemonRecord } from "../pokemonDb";
import type { PersistedSavedAttack } from "../savedTeams";

export type BattleSide = "ally" | "enemy";
export type DamageRollMode = "min" | "average" | "max";
export type BattleStatusCondition = "none" | "burn" | "paralysis" | "sleep";
export type BattleScreenKind = "reflect" | "lightScreen" | "auroraVeil";
export type BattleGuardKind = "quickGuard" | "wideGuard";
export type BattleStageDelta = Partial<Record<keyof BattleStatStages, number>>;
export type KnowledgeLevel = "known" | "partial" | "unknown";
export type MoveEffectKind =
  | "damage"
  | "fakeOut"
  | "protect"
  | "tailwind"
  | "trickRoom"
  | "safeguard"
  | "allySwitch"
  | "encore"
  | "disable"
  | "helpingHand"
  | "redirection"
  | "screen"
  | "guard"
  | "taunt"
  | "status"
  | "boost"
  | "heal"
  | "unsupported";
export type MoveTargetKind =
  | "singleOpponent"
  | "allOpponents"
  | "singleAlly"
  | "allAllies"
  | "self"
  | "field";

export type BattleMoveEffectData = {
  selfStages?: BattleStageDelta;
  targetStages?: BattleStageDelta;
  allyStages?: BattleStageDelta;
  statusCondition?: BattleStatusCondition;
  healFraction?: number;
  healAlliesFraction?: number;
  screen?: BattleScreenKind;
  guard?: BattleGuardKind;
  setsRedirection?: boolean;
  helpingHand?: boolean;
  tauntTurns?: number;
  safeguardTurns?: number;
  encoreTurns?: number;
  disableTurns?: number;
  breaksProtect?: boolean;
  breaksGuards?: boolean;
  secondaryChance?: number;
  flinchChance?: number;
};

export type BattleMoveOption = {
  id: string;
  name: string;
  effectKind: MoveEffectKind;
  targetKind: MoveTargetKind;
  priority: number;
  accuracy: number;
  source: "savedAttack" | "presetMove" | "assumed" | "inferred";
  savedAttack: PersistedSavedAttack | null;
  moveRecord: MoveRecord | null;
  type: PokemonType | null;
  basePower: number | null;
  category: DamageCategory | null;
  isSpreadMove: boolean;
  shortDesc: string;
  effectData: BattleMoveEffectData | null;
};

export type BattleStatStages = {
  attack: number;
  defense: number;
  speed: number;
};

export type BattleCombatantState = {
  id: string;
  side: BattleSide;
  teamIndex: number;
  label: string;
  pokemon: PokemonRecord;
  maxHp: number;
  currentHp: number;
  turnsActive: number;
  abilityId: DamageAbilityId;
  abilityName: string | null;
  itemId: DamageItemId;
  itemName: string | null;
  stages: BattleStatStages;
  statusCondition: BattleStatusCondition;
  sleepTurns: number;
  tauntTurns: number;
  encoreTurns: number;
  encoredMoveId: string | null;
  disableTurns: number;
  disabledMoveId: string | null;
  helpingHandTurns: number;
  knownMoves: BattleMoveOption[];
  lastMoveId: string | null;
  isProtected: boolean;
  isFlinched: boolean;
  wasSwitchedInThisTurn: boolean;
};

export type BattleSideState = {
  activeIds: [string | null, string | null];
  benchIds: string[];
  tailwindTurns: number;
  reflectTurns: number;
  lightScreenTurns: number;
  auroraVeilTurns: number;
  safeguardTurns: number;
  quickGuardActive: boolean;
  wideGuardActive: boolean;
  redirectionTargetId: string | null;
  allySwitchPair: [string, string] | null;
};

export type BattleFieldState = {
  weather: DamageWeather;
  terrain: DamageTerrain;
  trickRoomTurns: number;
  turn: number;
};

export type BattleState = {
  combatants: Record<string, BattleCombatantState>;
  sides: Record<BattleSide, BattleSideState>;
  field: BattleFieldState;
};

export type BattleAction =
  | {
      type: "move";
      actorId: string;
      moveId: string;
      targetId: string | null;
    }
  | {
      type: "switch";
      actorId: string;
      switchInId: string;
    }
  | {
      type: "pass";
      actorId: string;
    };

export type PlannedAction = {
  actorId: string;
  actorLabel: string;
  action: BattleAction;
  summary: string;
  heuristicScore: number;
};

export type JointActionPlan = {
  side: BattleSide;
  actions: PlannedAction[];
  summary: string;
  heuristicScore: number;
};

export type TurnEvent = {
  actorId?: string;
  targetId?: string;
  text: string;
};

export type TurnResult = {
  state: BattleState;
  events: TurnEvent[];
};

export type SearchPlanScore = {
  plan: JointActionPlan;
  score: number;
  enemyBestResponse: JointActionPlan | null;
  preview: TurnResult | null;
};

export type SearchRecommendation = {
  rootScore: number;
  depth: number;
  bestPlan: JointActionPlan | null;
  enemyBestResponse: JointActionPlan | null;
  preview: TurnResult | null;
  consideredPlans: SearchPlanScore[];
  diagnostics: SearchDiagnostics;
};

export type BattleStateMemberInput = {
  id: string;
  label: string;
  pokemon: PokemonRecord;
  teamIndex: number;
  currentHpPercent?: number;
  abilityName?: string | null;
  itemName?: string | null;
  savedAttacks?: PersistedSavedAttack[];
  moveNames?: string[];
  inferredMoveNames?: string[];
  knowledge?: KnowledgeLevel;
  isActive: boolean;
};

export type CreateBattleStateInput = {
  ally: BattleStateMemberInput[];
  enemy: BattleStateMemberInput[];
  moveByKey: ReadonlyMap<string, MoveRecord>;
  weather?: DamageWeather;
  terrain?: DamageTerrain;
  allyTailwind?: boolean;
  enemyTailwind?: boolean;
  trickRoom?: boolean;
  attackStage?: number;
  defenseStage?: number;
  universalProtect?: boolean;
};

export type SearchBranchModel = "full" | "expectedOnly" | "expectedPlusRisk";

export type SearchDiagnostics = {
  searchNodes: number;
  resolveTurnCalls: number;
  generatedJointPlans: number;
  planPairEvaluations: number;
};

export type SearchOptions = {
  depth?: number;
  maxJointPlansPerSide?: number;
  maxIndividualActionsPerActor?: number;
  branchModel?: SearchBranchModel;
  damageModeWeights?: Array<{
    mode: DamageRollMode;
    weight: number;
  }>;
};
