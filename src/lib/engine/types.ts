import type { PokemonType } from "../../data/typeChart";
import type { MoveRecord } from "../battleData";
import type { DamageAbilityId } from "../damageAbilities";
import type { DamageCategory, DamageTerrain, DamageWeather } from "../damage";
import type { DamageItemId } from "../damageItems";
import type { PokemonRecord } from "../pokemonDb";
import type { PersistedKnownMove, PersistedSavedAttack } from "../savedTeams";
import type { ChampionsStatSpread } from "../championsStats";

export type BattleSide = "ally" | "enemy";
export type DamageRollMode = "min" | "average" | "max";
export type BattleStatusCondition = "none" | "burn" | "paralysis" | "sleep";
export type BattleScreenKind = "reflect" | "lightScreen" | "auroraVeil";
export type BattleGuardKind = "quickGuard" | "wideGuard";
export type BattleStageDelta = Partial<Record<keyof BattleStatStages, number>>;
export type KnowledgeLevel = "known" | "partial" | "unknown";
export type ReplacementPolicyId = "firstAvailable";
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
  | "allAdjacent"
  | "singleAlly"
  | "allAllies"
  | "self"
  | "field";

export type CandidateMoveSource = "observed" | "preset" | "inferred";

export type CandidateMove = {
  name: string;
  source: CandidateMoveSource;
  weight: number;
  confidence: "known" | "candidate";
};

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
  powderMove?: boolean;
};

export type BattleMoveSource = "savedAttack" | "presetMove" | "assumed" | "inferred" | "candidate";

export type BattleMoveOption = {
  id: string;
  name: string;
  effectKind: MoveEffectKind;
  targetKind: MoveTargetKind;
  priority: number;
  accuracy: number;
  source: BattleMoveSource;
  savedAttack: PersistedKnownMove | null;
  moveRecord: MoveRecord | null;
  type: PokemonType | null;
  basePower: number | null;
  category: DamageCategory | null;
  isSpreadMove: boolean;
  shortDesc: string;
  effectData: BattleMoveEffectData | null;
  candidateWeight: number;
  candidateSource: CandidateMoveSource | null;
};

export type BattleStatStages = {
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
};

export type BattleCombatantState = {
  id: string;
  side: BattleSide;
  teamIndex: number;
  label: string;
  pokemon: PokemonRecord;
  statSpread: ChampionsStatSpread | null;
  maxHp: number;
  currentHp: number;
  turnsActive: number;
  abilityId: DamageAbilityId;
  abilityName: string | null;
  itemId: DamageItemId;
  itemName: string | null;
  itemConsumed: boolean;
  flashFireBoosted: boolean;
  stages: BattleStatStages;
  statusCondition: BattleStatusCondition;
  sleepTurns: number;
  tauntTurns: number;
  encoreTurns: number;
  encoredMoveId: string | null;
  disableTurns: number;
  disabledMoveId: string | null;
  helpingHandTurns: number;
  protectStreak: number;
  knownMoves: BattleMoveOption[];
  candidateMoves: BattleMoveOption[];
  knowledge: KnowledgeLevel;
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
  policies: {
    replacement: ReplacementPolicyId;
  };
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
  robustScore: number;
  likelyScore: number;
  hybridScore: number;
  enemyBestResponse: JointActionPlan | null;
  predictedEnemyResponse: JointActionPlan | null;
  preview: TurnResult | null;
  pv: SearchPvStep[];
  enemyPolicyWeight: number;
  dependsOnInferredMoves: boolean;
};

export type SearchMode = "fast" | "balanced" | "deep";
export type ObjectiveMode = "robust" | "likely" | "hybrid";

export type SearchPvStep = {
  ply: number;
  turn: number;
  allyPlan: JointActionPlan | null;
  enemyPlan: JointActionPlan | null;
  robustScore: number;
  likelyScore: number;
  hybridScore: number;
  preview: TurnResult | null;
  extensionReasons: string[];
};

export type EnemyMoveAssumption = {
  moveName: string;
  certainty: number;
  policyWeight: number;
  source: BattleMoveSource;
  inferred: boolean;
};

export type EnemyAssumptionSummary = {
  combatantId: string;
  label: string;
  dependsOnInferredMoves: boolean;
  confidenceSummary: string;
  moves: EnemyMoveAssumption[];
};

export type SearchBudget = {
  maxDepth?: number;
  maxNodes?: number;
  maxMs?: number;
  signal?: AbortSignal | null;
  searchMode?: SearchMode;
  objectiveMode?: ObjectiveMode;
  hybridLambda?: number;
  stageTopK?: number;
  maxSelectiveExtensions?: number;
};

export type SearchBudgetSnapshot = {
  maxDepth: number;
  maxNodes: number;
  maxMs: number;
  searchMode: SearchMode;
  objectiveMode: ObjectiveMode;
  hybridLambda: number;
  stageTopK: number;
  maxSelectiveExtensions: number;
};

export type SearchRecommendation = {
  rootScore: number;
  depth: number;
  depthReached: number;
  robustScore: number;
  likelyScore: number;
  hybridScore: number;
  bestPlan: JointActionPlan | null;
  enemyBestResponse: JointActionPlan | null;
  predictedEnemyResponse: JointActionPlan | null;
  preview: TurnResult | null;
  pv: SearchPvStep[];
  consideredPlans: SearchPlanScore[];
  budget: SearchBudgetSnapshot;
  diagnostics: SearchDiagnostics;
};

export type BattleStateMemberInput = {
  id: string;
  label: string;
  pokemon: PokemonRecord;
  statSpread?: ChampionsStatSpread | null;
  teamIndex: number;
  currentHp?: number;
  currentHpPercent?: number;
  abilityName?: string | null;
  itemName?: string | null;
  savedAttacks?: PersistedSavedAttack[];
  knownMoves?: PersistedKnownMove[];
  moveNames?: string[];
  inferredMoveNames?: string[];
  candidateMoves?: CandidateMove[];
  knowledge?: KnowledgeLevel;
  stages?: Partial<BattleStatStages>;
  statusCondition?: BattleStatusCondition;
  sleepTurns?: number;
  tauntTurns?: number;
  encoreTurns?: number;
  encoredMoveId?: string | null;
  disableTurns?: number;
  disabledMoveId?: string | null;
  helpingHandTurns?: number;
  protectStreak?: number;
  lastMoveId?: string | null;
  turnsActive?: number;
  isProtected?: boolean;
  isFlinched?: boolean;
  wasSwitchedInThisTurn?: boolean;
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
  specialAttackStage?: number;
  specialDefenseStage?: number;
  speedStage?: number;
  universalProtect?: boolean;
  replacementPolicy?: ReplacementPolicyId;
  allySide?: Partial<BattleSideState>;
  enemySide?: Partial<BattleSideState>;
  fieldState?: Partial<BattleFieldState>;
};

export type SearchBranchModel = "full" | "expectedOnly" | "expectedPlusRisk";

export type SearchDiagnostics = {
  elapsedMs: number;
  depthReached: number;
  searchNodes: number;
  resolveTurnCalls: number;
  generatedJointPlans: number;
  planPairEvaluations: number;
  ttHits: number;
  ttStores: number;
  cutoffs: number;
  branchModelUsed: string;
  objectiveMode: ObjectiveMode;
  searchMode: SearchMode;
  completedIterations: number;
  enemyAssumptions: string[];
  enemyBeliefs: EnemyAssumptionSummary[];
  pv: SearchPvStep[];
};

export type SearchOptions = {
  depth?: number;
  maxJointPlansPerSide?: number;
  maxIndividualActionsPerActor?: number;
  branchModel?: SearchBranchModel;
  branchPolicy?: BranchPolicy;
  maxDepth?: number;
  maxNodes?: number;
  maxMs?: number;
  signal?: AbortSignal | null;
  searchMode?: SearchMode;
  objectiveMode?: ObjectiveMode;
  hybridLambda?: number;
  stageTopK?: number;
  maxSelectiveExtensions?: number;
};

export type TurnBranch = {
  label: string;
  damageMode: DamageRollMode;
  accuracyMode: "conservative" | "expected" | "optimistic";
  secondaryMode: "off" | "expected" | "on";
  weight: number;
};

export type BranchPolicy = {
  key: string;
  branches: TurnBranch[];
};
