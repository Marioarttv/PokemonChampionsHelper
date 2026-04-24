import type { PokemonType } from "../data/typeChart";
import { getMultiplier } from "./effectiveness";
import type { MoveRecord } from "./battleData";
import type { DamageTerrain, DamageWeather } from "./damage";
import {
  createBattleState,
  buildMechanicSupportReport,
  getDamagePreview,
  recommendBestPlan,
  type BattleState,
  type BattleStateMemberInput,
  type MechanicSupportReport,
  type SearchBranchModel,
  type SearchDiagnostics,
  type UnsupportedMechanicMarker,
} from "./engine";
import {
  buildScenarioMatrixSummary,
  type EnemyBringDistributionEntry,
  type TeamPreviewConfidence,
  type TeamPreviewScenarioMatrixSummary,
} from "./teamPreview/scenarioModel";
import {
  buildCoverageDangerNotes,
  buildCoverageReasons,
  buildObjectiveBreakdown,
  buildPredictedEnemyFoursSummary,
} from "./teamPreview/explain";
import {
  collectThreatCentrality,
  inferFourLikelihoodReasons,
  predictEnemyBringDistribution,
  predictEnemyLeadDistribution,
  type EnemyFourLikelihoodInput,
  type EnemyLeadLikelihoodInput,
} from "./teamPreview/likelihood";
import {
  applyThreatLikelihoods,
  buildEnemyThreats,
  buildPreviewCombatantMetas,
  buildPreviewDamageMatrix,
  buildPreviewThreatProfile,
  getWeakTypes,
  getWeatherSetterKinds,
  hasWeatherAbuser,
  hasWeatherSetter,
} from "./teamPreview/threats";
import { buildThreatAnswerMatrix, evaluateFourThreatCoverage, evaluateLeadAlignment } from "./teamPreview/answers";
import type {
  AnswerScore,
  CoverageSummaryEntry,
  EnemyThreat,
  FourCoverageEvaluation,
  LeadAlignmentEvaluation,
  MustAnswerThreatExplanation,
  PredictedEnemyFour,
  PreviewCombatantMeta,
  PreviewDamageSnapshot,
  PreviewObjectiveBreakdown,
  PreviewRoleTag,
  PreviewThreatProfile,
  TeamPreviewObjectiveMode,
  UncoveredThreatExplanation,
} from "./teamPreview/types";

type StrategyScoreBreakdown = Record<string, number>;

type PreviewStrategy = {
  key: string;
  four: number[];
  lead: [number, number];
};

type ScoredPreviewStrategy = {
  strategy: PreviewStrategy;
  coarseScore: number;
  breakdown: StrategyScoreBreakdown;
};

type PreviewFourChoice = {
  key: string;
  four: number[];
};

type ScoredPreviewFourChoice = {
  choice: PreviewFourChoice;
  coarseScore: number;
  breakdown: StrategyScoreBreakdown;
  members: PreviewCombatantMeta[];
  profile: PreviewThreatProfile;
};

type PreviewThreatLine = {
  candidate: ScoredPreviewStrategy;
  sourceFour: ScoredPreviewFourChoice;
  threatScore: number;
  vector: number[];
  probability: number;
  threatIds: string[];
};

type PreviewStrategyCandidate = {
  candidate: ScoredPreviewStrategy;
  sourceFour: ScoredPreviewFourChoice;
  cheapRobustScore: number;
  cheapAverageScore: number;
};

type RankedPreviewStrategy = {
  entry: PreviewStrategyCandidate;
  summary: MatrixSummary;
};

type MatrixSummary = {
  robustScore: number;
  likelyScore: number;
  hybridScore: number;
  previewValue: number;
};

type PreviewPreparation = {
  rankedAllyFours: ScoredPreviewFourChoice[];
  rankedEnemyFours: ScoredPreviewFourChoice[];
  enemyPredictions: PredictedEnemyFour[];
  enemyThreats: EnemyThreat[];
  answerMap: Map<string, AnswerScore>;
  coverageByFourKey: Map<string, FourCoverageEvaluation>;
  objectiveMode: TeamPreviewObjectiveMode;
  coarseStageMs: number;
  allyFourChoiceCount: number;
  enemyFourChoiceCount: number;
  allAllyFours: number[][];
  allEnemyFours: number[][];
  scenarioMatrix: TeamPreviewScenarioMatrixSummary;
};

type TacticalCellEvaluation = {
  score: number;
  diagnostics: SearchDiagnostics;
};

type PreviewTacticalProfile = {
  key: string;
  depth: number;
  maxJointPlansPerSide: number;
  maxIndividualActionsPerActor: number;
  branchModel: SearchBranchModel;
};

export type TeamPreviewSolverMode = "robust";

export type TeamPreviewDiagnostics = {
  solverMode: TeamPreviewSolverMode;
  timeBudgetMs: number;
  elapsedMs: number;
  coarseStageMs: number;
  tacticalStageMs: number;
  verifiedCells: number;
  threatLineCount: number;
  stoppedByBudget: boolean;
  refinementRan: boolean;
  searchNodes: number;
  resolveTurnCalls: number;
  generatedJointPlans: number;
  planPairEvaluations: number;
  searchedScenarioCount: number;
  searchDepth: number;
  objective: TeamPreviewObjectiveMode;
  topLineSummary: string | null;
  tacticalRiskNotes: string[];
  mechanicsSupportReport: MechanicSupportReport;
};

export type TeamPreviewReason = {
  feature: string;
  label: string;
  delta: number;
};

export type TeamPreviewAlternative = {
  four: number[];
  lead: [number, number];
  robustScore: number;
  averageScore: number;
  previewValue: number;
};

export type TeamPreviewRecommendation = {
  bestFour: number[];
  primaryLead: [number, number];
  altLead: [number, number] | null;
  previewValue: number;
  robustScore: number;
  averageScore: number;
  reasons: TeamPreviewReason[];
  dangerNotes: string[];
  alternatives: TeamPreviewAlternative[];
  predictedEnemyFours?: Array<{ four: number[]; lead?: [number, number] | null; probability: number; reasons: string[] }>;
  mustAnswerThreats?: MustAnswerThreatExplanation[];
  uncoveredThreats?: UncoveredThreatExplanation[];
  coverageSummary?: CoverageSummaryEntry[];
  objectiveBreakdown?: PreviewObjectiveBreakdown;
  confidence?: TeamPreviewConfidence;
  confidenceReasons?: string[];
  unsupportedMechanics?: UnsupportedMechanicMarker[];
  scenarioMatrix?: TeamPreviewScenarioMatrixSummary;
  omittedSlotExplanations?: Array<{ slotIndex: number; explanation: string }>;
  enemyBringDistribution?: EnemyBringDistributionEntry[];
  leadRiskNotes?: string[];
  lowProbabilityHighRegretNotes?: string[];
  candidateCounts: {
    allyStrategies: number;
    enemyStrategies: number;
    allyCandidates: number;
    enemyCandidates: number;
    allyFourCandidates: number;
    enemyFourCandidates: number;
    threatLines: number;
    matrixCells: number;
  };
  diagnostics: TeamPreviewDiagnostics;
};

export type TeamPreviewOptions = {
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
  solverMode?: TeamPreviewSolverMode;
  timeBudgetMs?: number;
  allyFourCandidates?: number;
  enemyFourCandidates?: number;
  maxThreatLines?: number;
  maxLeadsPerFour?: number;
  refinementMargin?: number;
  previewObjectiveMode?: TeamPreviewObjectiveMode;
  infoMode?: "openTeamSheet" | "closedSheet" | "custom";
  enemyBringTemperature?: number;
  enemyBringProbabilityFloor?: number;
  enemyLeadTemperature?: number;
  enemyTopMassRetention?: number;
  mustAnswerThreatWeight?: number;
  overloadPenaltyWeight?: number;
};

const DEFAULT_SOLVER_MODE: TeamPreviewSolverMode = "robust";
const DEFAULT_TIME_BUDGET_MS = 250;
const DEFAULT_ALLY_FOUR_CANDIDATES = 3;
const DEFAULT_ENEMY_FOUR_CANDIDATES = 4;
const DEFAULT_MAX_THREAT_LINES = 4;
const DEFAULT_MAX_LEADS_PER_FOUR = 2;
const DEFAULT_REFINEMENT_MARGIN = 1_600;
const DEFAULT_PREVIEW_OBJECTIVE_MODE: TeamPreviewObjectiveMode = "robust";
const DEFAULT_ENEMY_BRING_TEMPERATURE = 650;
const DEFAULT_ENEMY_LEAD_TEMPERATURE = 320;
const DEFAULT_ENEMY_PROBABILITY_FLOOR = 0.03;
const DEFAULT_ENEMY_TOP_MASS_RETENTION = 0.88;

const PREVIEW_FAST_PROFILE: PreviewTacticalProfile = {
  key: "preview-fast",
  depth: 1,
  maxJointPlansPerSide: 3,
  maxIndividualActionsPerActor: 3,
  branchModel: "expectedPlusRisk",
};

const PREVIEW_REFINE_PROFILE: PreviewTacticalProfile = {
  key: "preview-refine",
  depth: 2,
  maxJointPlansPerSide: 3,
  maxIndividualActionsPerActor: 3,
  branchModel: "expectedOnly",
};

const FEATURE_LABELS: Record<string, string> = {
  offensive_pressure: "Offensive pressure",
  defensive_reliability: "Defensive reliability",
  tailwind_value: "Tailwind speed flips",
  trick_room_value: "Trick Room mode value",
  redirection_value: "Redirection support",
  wide_guard_value: "Wide Guard into spread pressure",
  quick_guard_value: "Quick Guard into priority",
  fake_out_value: "Fake Out tempo",
  weather_value: "Weather mode coherence",
  weather_control_value: "Weather control value",
  priority_value: "Priority cleanup value",
  utility_value: "Support utility",
  lead_pair_pressure: "Lead pair opening pressure",
  lead_pair_synergy: "Lead pair synergy",
  flexibility_value: "Flexible lead options",
  redundancy_penalty: "Redundancy penalty",
  weakness_overlap_penalty: "Shared weakness penalty",
  stat_drop_punish_risk: "Stat-drop punish risk",
  speed_trigger_value: "Triggered speed swing",
  anti_speed_synergy: "Speed-mode conflict",
  must_answer_coverage: "Must-answer threat coverage",
  answer_overload: "Overloaded answer tax",
  lead_alignment: "Lead alignment into likely enemy leads",
  conditional_matchup: "Conditional matchup floor",
  conditional_lead_coverage: "Conditional lead coverage",
};

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function cloneBreakdown(breakdown: StrategyScoreBreakdown) {
  return { ...breakdown };
}

function createPreviewDiagnostics(
  solverMode: TeamPreviewSolverMode,
  timeBudgetMs: number,
): TeamPreviewDiagnostics {
  return {
    solverMode,
    timeBudgetMs,
    elapsedMs: 0,
    coarseStageMs: 0,
    tacticalStageMs: 0,
    verifiedCells: 0,
    threatLineCount: 0,
    stoppedByBudget: false,
    refinementRan: false,
    searchNodes: 0,
    resolveTurnCalls: 0,
    generatedJointPlans: 0,
    planPairEvaluations: 0,
    searchedScenarioCount: 0,
    searchDepth: 0,
    objective: DEFAULT_PREVIEW_OBJECTIVE_MODE,
    topLineSummary: null,
    tacticalRiskNotes: [],
    mechanicsSupportReport: buildMechanicSupportReport(),
  };
}

function mergeSearchDiagnostics(target: TeamPreviewDiagnostics, source: SearchDiagnostics) {
  target.searchNodes += source.searchNodes;
  target.resolveTurnCalls += source.resolveTurnCalls;
  target.generatedJointPlans += source.generatedJointPlans;
  target.planPairEvaluations += source.planPairEvaluations;
  target.mechanicsSupportReport = buildMechanicSupportReport([
    ...target.mechanicsSupportReport.markers,
    ...(source.unsupportedMechanics ?? []),
  ]);
}

function createReferenceState(options: TeamPreviewOptions) {
  const ally = options.ally.map((member, index) => ({
    ...member,
    isActive: false,
  }));
  const enemy = options.enemy.map((member, index) => ({
    ...member,
    isActive: false,
  }));

  return createBattleState({
    ally,
    enemy,
    moveByKey: options.moveByKey,
    weather: options.weather,
    terrain: options.terrain,
    allyTailwind: options.allyTailwind,
    enemyTailwind: options.enemyTailwind,
    trickRoom: options.trickRoom,
    attackStage: options.attackStage,
    defenseStage: options.defenseStage,
    universalProtect: true,
    applyInitialEntryEffects: false,
  });
}

function getMatrixEntry(
  matrix: Map<string, PreviewDamageSnapshot>,
  attackerId: string,
  defenderId: string,
) {
  return matrix.get(`${attackerId}->${defenderId}`) ?? { averagePercent: 0, maxPercent: 0, move: null };
}

function addScore(breakdown: StrategyScoreBreakdown, feature: string, value: number) {
  if (value === 0) {
    return;
  }
  breakdown[feature] = (breakdown[feature] ?? 0) + value;
}

function sumScores(breakdown: StrategyScoreBreakdown) {
  return Object.values(breakdown).reduce((sum, value) => sum + value, 0);
}

function mergeBreakdowns(target: StrategyScoreBreakdown, source: StrategyScoreBreakdown) {
  for (const [feature, value] of Object.entries(source)) {
    addScore(target, feature, value);
  }
}

function getSpeedFlipValue(
  source: PreviewCombatantMeta,
  allies: PreviewCombatantMeta[],
  enemies: PreviewCombatantMeta[],
  mode: "tailwind" | "trickRoom",
) {
  return allies.reduce((sum, ally) => {
    if (mode === "tailwind") {
      const flips = enemies.filter((enemy) => ally.speed <= enemy.speed && ally.speed * 2 > enemy.speed).length;
      return sum + flips * 14;
    }

    const flips = enemies.filter((enemy) => ally.speed >= enemy.speed && ally.speed > 0 && ally.speed / 2 < enemy.speed).length;
    return sum + flips * 13;
  }, source.roleTags.has(mode === "tailwind" ? "tailwind" : "trickRoom") ? 22 : 0);
}

function getWeatherModeValue(meta: PreviewCombatantMeta, allyProfile: PreviewThreatProfile) {
  let value = 0;
  if (meta.roleTags.has("weatherRain")) {
    value += allyProfile.weatherStrength.rain * 70 + 30;
  }
  if (meta.roleTags.has("weatherSun")) {
    value += allyProfile.weatherStrength.sun * 70 + 30;
  }
  if (meta.roleTags.has("weatherSand")) {
    value += allyProfile.weatherStrength.sand * 70 + 30;
  }
  if (meta.roleTags.has("weatherSnow")) {
    value += allyProfile.weatherStrength.snow * 70 + 30;
  }
  if (meta.roleTags.has("weatherRainAbuser")) {
    value += allyProfile.weatherStrength.rain * 55;
  }
  if (meta.roleTags.has("weatherSunAbuser")) {
    value += allyProfile.weatherStrength.sun * 55;
  }
  if (meta.roleTags.has("weatherSandAbuser")) {
    value += allyProfile.weatherStrength.sand * 55;
  }
  if (meta.roleTags.has("weatherSnowAbuser")) {
    value += allyProfile.weatherStrength.snow * 55;
  }
  return value;
}

function getTypeMatchCount(team: PreviewCombatantMeta[], type: PokemonType) {
  return team.filter((meta) => meta.primaryType === type || meta.secondaryType === type).length;
}

function getDamagingMoveTypeShare(team: PreviewCombatantMeta[], type: PokemonType) {
  const moves = team.flatMap((meta) => meta.damagingMoves);
  const totalPower = moves.reduce((sum, move) => sum + Math.max(1, move.basePower ?? 0), 0);
  if (totalPower <= 0) {
    return 0;
  }

  const typePower = moves
    .filter((move) => normalizeKey(move.type) === type)
    .reduce((sum, move) => sum + Math.max(1, move.basePower ?? 0), 0);
  return typePower / totalPower;
}

function hasDamagingMoveType(meta: PreviewCombatantMeta, type: PokemonType) {
  return meta.damagingMoves.some((move) => normalizeKey(move.type) === type);
}

function getWeatherControlValue(
  meta: PreviewCombatantMeta,
  enemies: PreviewCombatantMeta[],
  enemyProfile: PreviewThreatProfile,
) {
  let value = 0;

  for (const ownWeather of getWeatherSetterKinds(meta)) {
    const conflictingEnemyWeatherStrength = (["rain", "sun", "sand", "snow"] as const)
      .filter((weather) => weather !== ownWeather)
      .reduce((sum, weather) => sum + enemyProfile.weatherStrength[weather], 0);
    const conflictingEnemySetters = enemies.filter(
      (enemy) => getWeatherSetterKinds(enemy).some((weather) => weather !== ownWeather),
    ).length;
    const conflictingEnemyAbusers = enemies.filter((enemy) =>
      (["rain", "sun", "sand", "snow"] as const).some(
        (weather) => weather !== ownWeather && hasWeatherAbuser(enemy, weather),
      ),
    ).length;

    value += conflictingEnemyWeatherStrength * 115;
    value += conflictingEnemySetters * 24;
    value += conflictingEnemyAbusers * 15;

    if (ownWeather === "sun") {
      const enemyWaterTypes = getTypeMatchCount(enemies, "water");
      const enemyWaterMoveShare = getDamagingMoveTypeShare(enemies, "water");
      value += enemyWaterTypes * (hasDamagingMoveType(meta, "grass") ? 30 : 14);
      value += enemyWaterMoveShare * 105;
      if (hasDamagingMoveType(meta, "fire")) {
        value += enemyProfile.weatherStrength.rain * 42;
      }
    }

    if (ownWeather === "rain") {
      const enemyFireTypes = getTypeMatchCount(enemies, "fire");
      const enemyFireMoveShare = getDamagingMoveTypeShare(enemies, "fire");
      value += enemyFireTypes * 16;
      value += enemyFireMoveShare * 95;
    }
  }

  return value;
}

function hasWhiteHerbUnburdenCombo(meta: PreviewCombatantMeta) {
  return meta.abilityKey === "unburden" && meta.itemKey === "whiteherb";
}

function getSupportActionValue(meta: PreviewCombatantMeta, enemyProfile: PreviewThreatProfile, enemies: PreviewCombatantMeta[]) {
  let value = 0;

  if (meta.roleTags.has("tailwind")) {
    value += getSpeedFlipValue(meta, [meta], enemies, "tailwind");
  }
  if (meta.roleTags.has("trickRoom")) {
    value += getSpeedFlipValue(meta, [meta], enemies, "trickRoom");
  }
  if (meta.roleTags.has("redirection")) {
    value += enemyProfile.singleTargetShare * 70 - enemyProfile.spreadShare * 28;
  }
  if (meta.roleTags.has("wideGuard")) {
    value += enemyProfile.spreadShare * 125;
  }
  if (meta.roleTags.has("quickGuard")) {
    value += enemyProfile.priorityShare * 90;
  }
  if (meta.roleTags.has("fakeOut")) {
    value += 48 + (enemyProfile.tailwindModeStrength + enemyProfile.trickRoomModeStrength) * 28;
  }
  if (meta.roleTags.has("helpingHand")) {
    value += 28;
  }
  if (meta.roleTags.has("taunt")) {
    value += (enemyProfile.tailwindModeStrength + enemyProfile.trickRoomModeStrength) * 42;
  }
  if (meta.roleTags.has("encore") || meta.roleTags.has("disable")) {
    value += 22;
  }
  if (meta.roleTags.has("priority")) {
    value += 18 + enemyProfile.tailwindModeStrength * 22;
  }

  return value;
}

function scoreCombatant(
  meta: PreviewCombatantMeta,
  allies: PreviewCombatantMeta[],
  enemies: PreviewCombatantMeta[],
  state: BattleState,
  outgoingMatrix: Map<string, PreviewDamageSnapshot>,
  incomingMatrix: Map<string, PreviewDamageSnapshot>,
  allyProfile: PreviewThreatProfile,
  enemyProfile: PreviewThreatProfile,
) {
  const breakdown: StrategyScoreBreakdown = {};

  const offenseEntries = enemies.map((enemy) => getMatrixEntry(outgoingMatrix, meta.combatant.id, enemy.combatant.id));
  const offense =
    offenseEntries.reduce(
      (sum, entry, index) =>
        sum +
        entry.averagePercent * 0.75 +
        (entry.maxPercent >= 100 ? 40 : entry.averagePercent >= 70 ? 18 : 0) +
        (meta.speed > enemies[index].speed ? 10 : meta.speed === enemies[index].speed ? 4 : 0),
      0,
    ) / Math.max(1, enemies.length);
  addScore(breakdown, "offensive_pressure", offense);

  const defenseEntries = enemies.map((enemy) => getMatrixEntry(incomingMatrix, enemy.combatant.id, meta.combatant.id));
  const defense =
    defenseEntries.reduce(
      (sum, entry) =>
        sum +
        Math.max(0, 100 - entry.averagePercent) * 0.52 +
        (entry.maxPercent < 100 ? 26 : -34),
      0,
    ) / Math.max(1, enemies.length);
  addScore(breakdown, "defensive_reliability", defense);

  if (meta.roleTags.has("tailwind")) {
    addScore(breakdown, "tailwind_value", getSpeedFlipValue(meta, allies, enemies, "tailwind"));
  }
  if (meta.roleTags.has("trickRoom")) {
    addScore(breakdown, "trick_room_value", getSpeedFlipValue(meta, allies, enemies, "trickRoom"));
  }
  if (meta.roleTags.has("redirection")) {
    addScore(
      breakdown,
      "redirection_value",
      enemyProfile.singleTargetShare * 82 - enemyProfile.spreadShare * 36 + (meta.bulkyScore / 600),
    );
  }
  if (meta.roleTags.has("wideGuard")) {
    addScore(breakdown, "wide_guard_value", enemyProfile.spreadShare * 130);
  }
  if (meta.roleTags.has("quickGuard")) {
    addScore(breakdown, "quick_guard_value", enemyProfile.priorityShare * 80);
  }
  if (meta.roleTags.has("fakeOut")) {
    addScore(
      breakdown,
      "fake_out_value",
      34 + (enemyProfile.tailwindModeStrength + enemyProfile.trickRoomModeStrength) * 34,
    );
  }
  if (meta.roleTags.has("priority")) {
    addScore(breakdown, "priority_value", 15 + enemyProfile.tailwindModeStrength * 20);
  }

  const supportValue = getSupportActionValue(meta, enemyProfile, enemies);
  if (supportValue > 0) {
    addScore(breakdown, "utility_value", supportValue);
  }

  const weatherValue = getWeatherModeValue(meta, allyProfile);
  if (weatherValue > 0) {
    addScore(breakdown, "weather_value", weatherValue);
  }

  const weatherControlValue = getWeatherControlValue(meta, enemies, enemyProfile);
  if (weatherControlValue > 0) {
    addScore(breakdown, "weather_control_value", weatherControlValue);
  }

  if (hasWhiteHerbUnburdenCombo(meta) && enemyProfile.statDropPressure > 0) {
    addScore(
      breakdown,
      "speed_trigger_value",
      60 + enemyProfile.statDropPressure * 120 + enemyProfile.tailwindModeStrength * 18,
    );
  }

  if (meta.roleTags.has("intimidate")) {
    addScore(
      breakdown,
      "utility_value",
      enemyProfile.physicalShare * 85 - enemyProfile.statDropPunisherRisk * 95,
    );
  }

  if (
    (meta.roleTags.has("intimidate") || meta.roleTags.has("statDropPressure")) &&
    enemyProfile.statDropPunisherRisk > 0
  ) {
    addScore(
      breakdown,
      "stat_drop_punish_risk",
      -(enemyProfile.statDropPunisherRisk * (meta.roleTags.has("intimidate") ? 100 : 72)),
    );
  }

  if (meta.roleTags.has("trickRoom") && meta.speed > 130) {
    addScore(breakdown, "anti_speed_synergy", -28);
  }

  if (meta.damagingMoves.length === 0 && supportValue < 40) {
    addScore(breakdown, "redundancy_penalty", -40);
  }

  return breakdown;
}

function estimatePairSpreadThreat(
  pair: [PreviewCombatantMeta, PreviewCombatantMeta],
  enemies: PreviewCombatantMeta[],
  state: BattleState,
) {
  let threat = 0;
  for (const enemy of enemies) {
    for (const move of enemy.damagingMoves) {
      if (!move.isSpreadMove) {
        continue;
      }
      for (const ally of pair) {
        threat += getDamagePreview(state, enemy.combatant.id, ally.combatant.id, move)?.estimate.averagePercent ?? 0;
      }
    }
  }
  return threat;
}

function getPartnerActionValue(
  partner: PreviewCombatantMeta,
  enemies: PreviewCombatantMeta[],
  outgoingMatrix: Map<string, PreviewDamageSnapshot>,
) {
  const bestHit = Math.max(
    0,
    ...enemies.map((enemy) => getMatrixEntry(outgoingMatrix, partner.combatant.id, enemy.combatant.id).averagePercent),
  );

  let value = bestHit * 0.7;
  if (partner.roleTags.has("setup")) {
    value += 42;
  }
  if (partner.roleTags.has("tailwind") || partner.roleTags.has("trickRoom")) {
    value += 32;
  }
  if (partner.roleTags.has("spread")) {
    value += 18;
  }
  return value;
}

function scorePair(
  pair: [PreviewCombatantMeta, PreviewCombatantMeta],
  allies: PreviewCombatantMeta[],
  enemies: PreviewCombatantMeta[],
  state: BattleState,
  outgoingMatrix: Map<string, PreviewDamageSnapshot>,
  enemyProfile: PreviewThreatProfile,
) {
  const [left, right] = pair;
  const breakdown: StrategyScoreBreakdown = {};
  const pairSpreadThreat = estimatePairSpreadThreat(pair, enemies, state);

  const leadPressure =
    enemies.reduce((sum, enemy) => {
      const leftPressure = getMatrixEntry(outgoingMatrix, left.combatant.id, enemy.combatant.id).averagePercent;
      const rightPressure = getMatrixEntry(outgoingMatrix, right.combatant.id, enemy.combatant.id).averagePercent;
      return sum + Math.max(leftPressure, rightPressure);
    }, 0) / Math.max(1, enemies.length);
  addScore(breakdown, "lead_pair_pressure", leadPressure * 0.55);

  const synergy = (() => {
    let value = 0;

    if (left.roleTags.has("redirection")) {
      value +=
        enemyProfile.singleTargetShare *
        getPartnerActionValue(right, enemies, outgoingMatrix) *
        0.55;
    }
    if (right.roleTags.has("redirection")) {
      value +=
        enemyProfile.singleTargetShare *
        getPartnerActionValue(left, enemies, outgoingMatrix) *
        0.55;
    }

    if (left.roleTags.has("wideGuard") || right.roleTags.has("wideGuard")) {
      value += enemyProfile.spreadShare * pairSpreadThreat * 0.35;
    }

    if (left.roleTags.has("fakeOut")) {
      value += getPartnerActionValue(right, enemies, outgoingMatrix) * 0.28;
    }
    if (right.roleTags.has("fakeOut")) {
      value += getPartnerActionValue(left, enemies, outgoingMatrix) * 0.28;
    }

    if (left.roleTags.has("tailwind") || right.roleTags.has("tailwind")) {
      value += getSpeedFlipValue(left, [left, right], enemies, "tailwind") * 0.45;
      value += getSpeedFlipValue(right, [left, right], enemies, "tailwind") * 0.45;
    }

    if (left.roleTags.has("trickRoom") || right.roleTags.has("trickRoom")) {
      value += getSpeedFlipValue(left, [left, right], enemies, "trickRoom") * 0.45;
      value += getSpeedFlipValue(right, [left, right], enemies, "trickRoom") * 0.45;
    }

    for (const weather of ["rain", "sun", "sand", "snow"] as const) {
      if (
        (hasWeatherSetter(left, weather) && hasWeatherAbuser(right, weather)) ||
        (hasWeatherSetter(right, weather) && hasWeatherAbuser(left, weather))
      ) {
        value += 65;
      }
    }

    return value;
  })();
  addScore(breakdown, "lead_pair_synergy", synergy);

  const leftWeakTypes = getWeakTypes(left);
  const rightWeakTypes = getWeakTypes(right);
  const overlapCount = leftWeakTypes.filter((type) => rightWeakTypes.includes(type)).length;
  if (overlapCount > 0) {
    addScore(breakdown, "weakness_overlap_penalty", -(overlapCount * 24));
  }

  if (
    (left.roleTags.has("trickRoom") && right.roleTags.has("fastPressure")) ||
    (right.roleTags.has("trickRoom") && left.roleTags.has("fastPressure"))
  ) {
    addScore(breakdown, "anti_speed_synergy", -22);
  }

  if (left.roleTags.has("setup") && right.roleTags.has("setup")) {
    addScore(breakdown, "redundancy_penalty", -18);
  }

  return breakdown;
}

function enumerateStrategies(members: PreviewCombatantMeta[]) {
  const indices = members.map((meta) => meta.member.teamIndex).sort((left, right) => left - right);
  const strategies: PreviewStrategy[] = [];

  for (let i = 0; i < indices.length; i += 1) {
    for (let j = i + 1; j < indices.length; j += 1) {
      for (let k = j + 1; k < indices.length; k += 1) {
        for (let l = k + 1; l < indices.length; l += 1) {
          const four = [indices[i], indices[j], indices[k], indices[l]];
          for (let a = 0; a < four.length; a += 1) {
            for (let b = a + 1; b < four.length; b += 1) {
              const lead = [four[a], four[b]] as [number, number];
              strategies.push({
                key: `four:${four.join(",")}|lead:${lead.join(",")}`,
                four,
                lead,
              });
            }
          }
        }
      }
    }
  }

  return strategies;
}

function enumerateFourChoices(members: PreviewCombatantMeta[]) {
  const indices = members.map((meta) => meta.member.teamIndex).sort((left, right) => left - right);
  const choices: PreviewFourChoice[] = [];

  for (let i = 0; i < indices.length; i += 1) {
    for (let j = i + 1; j < indices.length; j += 1) {
      for (let k = j + 1; k < indices.length; k += 1) {
        for (let l = k + 1; l < indices.length; l += 1) {
          const four = [indices[i], indices[j], indices[k], indices[l]];
          choices.push({
            key: `four:${four.join(",")}`,
            four,
          });
        }
      }
    }
  }

  return choices;
}

function enumerateLeadPairs(four: number[]) {
  const leads: Array<[number, number]> = [];
  for (let left = 0; left < four.length; left += 1) {
    for (let right = left + 1; right < four.length; right += 1) {
      leads.push([four[left], four[right]]);
    }
  }
  return leads;
}

function createStrategy(four: number[], lead: [number, number]) {
  return {
    key: `four:${four.join(",")}|lead:${lead.join(",")}`,
    four,
    lead,
  } satisfies PreviewStrategy;
}

function getMetaByTeamIndex(metas: PreviewCombatantMeta[]) {
  return new Map(metas.map((meta) => [meta.member.teamIndex, meta] as const));
}

function getChosenMetas(choice: PreviewFourChoice, metaByIndex: Map<number, PreviewCombatantMeta>) {
  return choice.four
    .map((teamIndex) => metaByIndex.get(teamIndex) ?? null)
    .filter((entry): entry is PreviewCombatantMeta => Boolean(entry));
}

function scoreFourChoice(
  choice: PreviewFourChoice,
  metas: PreviewCombatantMeta[],
  opponents: PreviewCombatantMeta[],
  state: BattleState,
  outgoingMatrix: Map<string, PreviewDamageSnapshot>,
  incomingMatrix: Map<string, PreviewDamageSnapshot>,
  allyProfile: PreviewThreatProfile,
  enemyProfile: PreviewThreatProfile,
) {
  const metaByIndex = getMetaByTeamIndex(metas);
  const chosen = getChosenMetas(choice, metaByIndex);
  const chosenProfile = buildPreviewThreatProfile(chosen);
  const breakdown: StrategyScoreBreakdown = {};

  for (const meta of chosen) {
    mergeBreakdowns(
      breakdown,
      scoreCombatant(meta, chosen, opponents, state, outgoingMatrix, incomingMatrix, chosenProfile, enemyProfile),
    );
  }

  for (let index = 0; index < chosen.length; index += 1) {
    for (let inner = index + 1; inner < chosen.length; inner += 1) {
      mergeBreakdowns(
        breakdown,
        scorePair([chosen[index], chosen[inner]], chosen, opponents, state, outgoingMatrix, enemyProfile),
      );
    }
  }

  const viableLeadCount = enumerateLeadPairs(choice.four).filter((lead) => {
    const pair = lead
      .map((teamIndex) => metaByIndex.get(teamIndex) ?? null)
      .filter((entry): entry is PreviewCombatantMeta => Boolean(entry)) as [PreviewCombatantMeta, PreviewCombatantMeta];
    return sumScores(scorePair(pair, chosen, opponents, state, outgoingMatrix, enemyProfile)) > 90;
  }).length;
  addScore(breakdown, "flexibility_value", viableLeadCount * 18);

  const supportCount = chosen.filter(
    (meta) =>
      meta.roleTags.has("tailwind") ||
      meta.roleTags.has("trickRoom") ||
      meta.roleTags.has("redirection") ||
      meta.roleTags.has("wideGuard") ||
      meta.roleTags.has("helpingHand"),
  ).length;
  const lowDamageCount = chosen.filter((meta) => meta.damagingMoves.length === 0).length;
  if (supportCount >= 3 && lowDamageCount >= 2) {
    addScore(breakdown, "redundancy_penalty", -35);
  }

  const weatherSetters = (["rain", "sun", "sand", "snow"] as const).reduce(
    (count, weather) => count + chosen.filter((meta) => hasWeatherSetter(meta, weather)).length,
    0,
  );
  if (weatherSetters > 1) {
    addScore(breakdown, "redundancy_penalty", -(weatherSetters - 1) * 18);
  }

  const chosenWeatherBias = Math.max(...Object.values(chosenProfile.weatherStrength));
  if (chosenWeatherBias > 0.45 && Math.max(...Object.values(allyProfile.weatherStrength)) > 0.55) {
    addScore(breakdown, "weather_value", chosenWeatherBias * 18);
  }

  return {
    choice,
    coarseScore: sumScores(breakdown),
    breakdown,
    members: chosen,
    profile: chosenProfile,
  } satisfies ScoredPreviewFourChoice;
}

function scoreStrategy(
  strategy: PreviewStrategy,
  metas: PreviewCombatantMeta[],
  opponents: PreviewCombatantMeta[],
  state: BattleState,
  outgoingMatrix: Map<string, PreviewDamageSnapshot>,
  incomingMatrix: Map<string, PreviewDamageSnapshot>,
  allyProfile: PreviewThreatProfile,
  enemyProfile: PreviewThreatProfile,
) {
  const metaByIndex = getMetaByTeamIndex(metas);
  const chosen = strategy.four
    .map((teamIndex) => metaByIndex.get(teamIndex) ?? null)
    .filter((entry): entry is PreviewCombatantMeta => Boolean(entry));
  const lead = strategy.lead
    .map((teamIndex) => metaByIndex.get(teamIndex) ?? null)
    .filter((entry): entry is PreviewCombatantMeta => Boolean(entry)) as [PreviewCombatantMeta, PreviewCombatantMeta];

  const breakdown: StrategyScoreBreakdown = {};

  for (const meta of chosen) {
    mergeBreakdowns(
      breakdown,
      scoreCombatant(meta, chosen, opponents, state, outgoingMatrix, incomingMatrix, allyProfile, enemyProfile),
    );
  }

  for (let index = 0; index < chosen.length; index += 1) {
    for (let inner = index + 1; inner < chosen.length; inner += 1) {
      mergeBreakdowns(
        breakdown,
        scorePair([chosen[index], chosen[inner]], chosen, opponents, state, outgoingMatrix, enemyProfile),
      );
    }
  }

  if (lead.length === 2) {
    mergeBreakdowns(
      breakdown,
      scorePair(lead, chosen, opponents, state, outgoingMatrix, enemyProfile),
    );
  }

  const viableLeadCount = (() => {
    let count = 0;
    for (let index = 0; index < chosen.length; index += 1) {
      for (let inner = index + 1; inner < chosen.length; inner += 1) {
        const pairScore = sumScores(
          scorePair([chosen[index], chosen[inner]], chosen, opponents, state, outgoingMatrix, enemyProfile),
        );
        if (pairScore > 90) {
          count += 1;
        }
      }
    }
    return count;
  })();
  addScore(breakdown, "flexibility_value", viableLeadCount * 18);

  const supportCount = chosen.filter(
    (meta) =>
      meta.roleTags.has("tailwind") ||
      meta.roleTags.has("trickRoom") ||
      meta.roleTags.has("redirection") ||
      meta.roleTags.has("wideGuard") ||
      meta.roleTags.has("helpingHand"),
  ).length;
  const lowDamageCount = chosen.filter((meta) => meta.damagingMoves.length === 0).length;
  if (supportCount >= 3 && lowDamageCount >= 2) {
    addScore(breakdown, "redundancy_penalty", -35);
  }

  const weatherSetters = ["rain", "sun", "sand", "snow"].reduce(
    (count, weather) => count + chosen.filter((meta) => hasWeatherSetter(meta, weather as "rain" | "sun" | "sand" | "snow")).length,
    0,
  );
  if (weatherSetters > 1) {
    addScore(breakdown, "redundancy_penalty", -(weatherSetters - 1) * 18);
  }

  return {
    strategy,
    coarseScore: sumScores(breakdown),
    breakdown,
  } satisfies ScoredPreviewStrategy;
}

function buildStrategyMembers(
  members: BattleStateMemberInput[],
  strategy: PreviewStrategy,
) {
  return members
    .filter((member) => strategy.four.includes(member.teamIndex))
    .map((member) => ({
      ...member,
      isActive: strategy.lead.includes(member.teamIndex),
    }));
}

function getLeadMembers(
  strategy: PreviewStrategy,
  metaByIndex: Map<number, PreviewCombatantMeta>,
) {
  return strategy.lead
    .map((teamIndex) => metaByIndex.get(teamIndex) ?? null)
    .filter((entry): entry is PreviewCombatantMeta => Boolean(entry)) as [PreviewCombatantMeta, PreviewCombatantMeta];
}

function getPairPressureAgainstTargets(
  pair: [PreviewCombatantMeta, PreviewCombatantMeta],
  targets: PreviewCombatantMeta[],
  matrix: Map<string, PreviewDamageSnapshot>,
) {
  return (
    targets.reduce((sum, target) => {
      const left = getMatrixEntry(matrix, pair[0].combatant.id, target.combatant.id).averagePercent;
      const right = getMatrixEntry(matrix, pair[1].combatant.id, target.combatant.id).averagePercent;
      return sum + Math.max(left, right);
    }, 0) / Math.max(1, targets.length)
  );
}

function getAveragePairSpeed(pair: [PreviewCombatantMeta, PreviewCombatantMeta]) {
  return (pair[0].speed + pair[1].speed) / 2;
}

function buildThreatVector(
  candidate: ScoredPreviewStrategy,
  sourceFour: ScoredPreviewFourChoice,
  metaByIndex: Map<number, PreviewCombatantMeta>,
) {
  const lead = getLeadMembers(candidate.strategy, metaByIndex);
  const leadHas = (tag: PreviewRoleTag) => Number(lead.some((meta) => meta.roleTags.has(tag)));
  return [
    sourceFour.profile.tailwindModeStrength,
    sourceFour.profile.trickRoomModeStrength,
    sourceFour.profile.weatherStrength.rain,
    sourceFour.profile.weatherStrength.sun,
    sourceFour.profile.weatherStrength.sand,
    sourceFour.profile.weatherStrength.snow,
    sourceFour.profile.spreadShare,
    sourceFour.profile.priorityShare,
    leadHas("redirection"),
    leadHas("wideGuard"),
    leadHas("fakeOut"),
  ];
}

function getVectorDistance(left: number[], right: number[]) {
  let distance = 0;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    distance += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }
  return distance;
}

function rankLeadStrategies(
  sourceFour: ScoredPreviewFourChoice,
  metas: PreviewCombatantMeta[],
  opponents: PreviewCombatantMeta[],
  state: BattleState,
  outgoingMatrix: Map<string, PreviewDamageSnapshot>,
  incomingMatrix: Map<string, PreviewDamageSnapshot>,
  allyProfile: PreviewThreatProfile,
  enemyProfile: PreviewThreatProfile,
) {
  return enumerateLeadPairs(sourceFour.choice.four)
    .map((lead) =>
      scoreStrategy(
        createStrategy(sourceFour.choice.four, lead),
        metas,
        opponents,
        state,
        outgoingMatrix,
        incomingMatrix,
        allyProfile,
        enemyProfile,
      ),
    )
    .sort((left, right) => right.coarseScore - left.coarseScore);
}

function getObjectiveMode(options: TeamPreviewOptions) {
  return options.previewObjectiveMode ?? DEFAULT_PREVIEW_OBJECTIVE_MODE;
}

function getObjectiveScore(summary: MatrixSummary, objectiveMode: TeamPreviewObjectiveMode) {
  if (objectiveMode === "robust") {
    return summary.robustScore;
  }
  if (objectiveMode === "likely") {
    return summary.likelyScore;
  }
  return summary.hybridScore;
}

function sortRowsByObjective(rows: RankedPreviewStrategy[], objectiveMode: TeamPreviewObjectiveMode) {
  return [...rows].sort((left, right) => {
    const objectiveDelta = getObjectiveScore(right.summary, objectiveMode) - getObjectiveScore(left.summary, objectiveMode);
    if (objectiveDelta !== 0) {
      return objectiveDelta;
    }
    if (left.summary.robustScore !== right.summary.robustScore) {
      return right.summary.robustScore - left.summary.robustScore;
    }
    return right.summary.likelyScore - left.summary.likelyScore;
  });
}

function applyCoverageToFours(
  rankedFours: ScoredPreviewFourChoice[],
  threats: EnemyThreat[],
  answerMap: Map<string, AnswerScore>,
  options: TeamPreviewOptions,
) {
  const coverageByFourKey = new Map<string, FourCoverageEvaluation>();
  const reranked = rankedFours
    .map((choice) => {
      const coverage = evaluateFourThreatCoverage({
        chosenFour: choice.choice.four,
        threats,
        answerMap,
        mustAnswerThreatWeight: options.mustAnswerThreatWeight,
        overloadPenaltyWeight: options.overloadPenaltyWeight,
      });
      coverageByFourKey.set(choice.choice.key, coverage);

      const breakdown = cloneBreakdown(choice.breakdown);
      addScore(breakdown, "must_answer_coverage", coverage.totalScore);
      if (coverage.overloadPenalty > 0) {
        addScore(breakdown, "answer_overload", -coverage.overloadPenalty);
      }
      return {
        ...choice,
        coarseScore: choice.coarseScore + coverage.totalScore,
        breakdown,
      } satisfies ScoredPreviewFourChoice;
    })
    .sort((left, right) => right.coarseScore - left.coarseScore);

  return { reranked, coverageByFourKey };
}

function getMetasForTeamIndices(metasByIndex: Map<number, PreviewCombatantMeta>, teamIndices: number[]) {
  return teamIndices
    .map((teamIndex) => metasByIndex.get(teamIndex) ?? null)
    .filter((entry): entry is PreviewCombatantMeta => Boolean(entry));
}

function getThreatsForEnemyFour(threats: EnemyThreat[], enemyFour: number[]) {
  const enemyFourSet = new Set(enemyFour);
  return threats.filter((threat) => threat.memberTeamIndices.some((teamIndex) => enemyFourSet.has(teamIndex)));
}

function scoreConditionalFourMatchup(options: {
  choice: ScoredPreviewFourChoice;
  prediction: PredictedEnemyFour;
  sourceEnemyFour: ScoredPreviewFourChoice;
  allyMetas: PreviewCombatantMeta[];
  referenceState: BattleState;
  allyOutgoingMatrix: Map<string, PreviewDamageSnapshot>;
  allyIncomingMatrix: Map<string, PreviewDamageSnapshot>;
  allyProfile: PreviewThreatProfile;
  threats: EnemyThreat[];
  answerMap: Map<string, AnswerScore>;
  previewOptions: TeamPreviewOptions;
}) {
  const scopedStructural = scoreFourChoice(
    options.choice.choice,
    options.allyMetas,
    options.sourceEnemyFour.members,
    options.referenceState,
    options.allyOutgoingMatrix,
    options.allyIncomingMatrix,
    options.allyProfile,
    options.sourceEnemyFour.profile,
  );
  const relevantThreats = getThreatsForEnemyFour(options.threats, options.prediction.four);
  const scopedCoverage =
    relevantThreats.length > 0
      ? evaluateFourThreatCoverage({
          chosenFour: options.choice.choice.four,
          threats: relevantThreats,
          answerMap: options.answerMap,
          mustAnswerThreatWeight: options.previewOptions.mustAnswerThreatWeight,
          overloadPenaltyWeight: options.previewOptions.overloadPenaltyWeight,
        }).totalScore
      : 0;

  return scopedStructural.coarseScore * 0.55 + scopedCoverage * 0.45;
}

function applyConditionalMatchupsToFours(options: {
  rankedFours: ScoredPreviewFourChoice[];
  predictions: PredictedEnemyFour[];
  rankedEnemyFours: ScoredPreviewFourChoice[];
  allyMetas: PreviewCombatantMeta[];
  referenceState: BattleState;
  allyOutgoingMatrix: Map<string, PreviewDamageSnapshot>;
  allyIncomingMatrix: Map<string, PreviewDamageSnapshot>;
  allyProfile: PreviewThreatProfile;
  threats: EnemyThreat[];
  answerMap: Map<string, AnswerScore>;
  previewOptions: TeamPreviewOptions;
}) {
  if (options.predictions.length === 0) {
    return options.rankedFours;
  }

  const enemyFourByKey = new Map(options.rankedEnemyFours.map((entry) => [entry.choice.four.join(","), entry] as const));
  return options.rankedFours
    .map((choice) => {
      const scored = options.predictions.flatMap((prediction) => {
        const sourceEnemyFour = enemyFourByKey.get(prediction.four.join(","));
        if (!sourceEnemyFour) {
          return [];
        }
        return [
          {
            score: scoreConditionalFourMatchup({
              choice,
              prediction,
              sourceEnemyFour,
              allyMetas: options.allyMetas,
              referenceState: options.referenceState,
              allyOutgoingMatrix: options.allyOutgoingMatrix,
              allyIncomingMatrix: options.allyIncomingMatrix,
              allyProfile: options.allyProfile,
              threats: options.threats,
              answerMap: options.answerMap,
              previewOptions: options.previewOptions,
            }),
            probability: prediction.probability,
          },
        ];
      });

      if (scored.length === 0) {
        return choice;
      }

      const robustConditionalScore = Math.min(...scored.map((entry) => entry.score));
      const probabilityMass = scored.reduce((sum, entry) => sum + entry.probability, 0) || 1;
      const likelyConditionalScore = scored.reduce((sum, entry) => sum + entry.score * entry.probability, 0) / probabilityMass;
      const conditionalScore = choice.coarseScore * 0.25 + robustConditionalScore * 0.55 + likelyConditionalScore * 0.2;
      const breakdown = cloneBreakdown(choice.breakdown);
      addScore(breakdown, "conditional_matchup", conditionalScore - choice.coarseScore);

      return {
        ...choice,
        coarseScore: conditionalScore,
        breakdown,
      } satisfies ScoredPreviewFourChoice;
    })
    .sort((left, right) => right.coarseScore - left.coarseScore);
}

function computeEnemyPredictions(options: {
  rankedEnemyFours: ScoredPreviewFourChoice[];
  enemyMetas: PreviewCombatantMeta[];
  allyMetas: PreviewCombatantMeta[];
  referenceState: BattleState;
  enemyOutgoingMatrix: Map<string, PreviewDamageSnapshot>;
  enemyIncomingMatrix: Map<string, PreviewDamageSnapshot>;
  enemyProfile: PreviewThreatProfile;
  allyProfile: PreviewThreatProfile;
  threats: EnemyThreat[];
  previewOptions: TeamPreviewOptions;
  allyFocusFours?: number[][];
}) {
  const inputs: EnemyFourLikelihoodInput[] = options.rankedEnemyFours.map((choice) => {
    const rankedLeads = rankLeadStrategies(
      choice,
      options.enemyMetas,
      options.allyMetas,
      options.referenceState,
      options.enemyOutgoingMatrix,
      options.enemyIncomingMatrix,
      options.enemyProfile,
      options.allyProfile,
    );
    const leadFlexibility = rankedLeads.filter((entry) => entry.coarseScore >= rankedLeads[0]?.coarseScore - 60).length;
    const threatCentrality = collectThreatCentrality(options.threats, choice.choice.four);
    let antiLikelyCoreScore = 0;
    if (options.allyFocusFours?.length) {
      antiLikelyCoreScore =
        options.allyFocusFours.reduce((sum, allyFour) => {
          const overlapPressure = allyFour.filter((teamIndex) => choice.choice.four.includes(teamIndex)).length;
          return sum - overlapPressure * 12;
        }, 0) / options.allyFocusFours.length;
    }

    return {
      four: choice.choice.four,
      coarseScore: choice.coarseScore,
      members: choice.members,
      threatCentrality,
      leadFlexibility,
      bestLeadScore: rankedLeads[0]?.coarseScore ?? choice.coarseScore,
      antiLikelyCoreScore,
      reasons: inferFourLikelihoodReasons(choice.members),
    };
  });

  const predictions = predictEnemyBringDistribution({
    choices: inputs,
    temperature: options.previewOptions.enemyBringTemperature ?? DEFAULT_ENEMY_BRING_TEMPERATURE,
    floor: options.previewOptions.enemyBringProbabilityFloor ?? DEFAULT_ENEMY_PROBABILITY_FLOOR,
    topMassRetention: options.previewOptions.enemyTopMassRetention ?? DEFAULT_ENEMY_TOP_MASS_RETENTION,
  });

  return predictions.map((prediction) => {
    const sourceFour = options.rankedEnemyFours.find((entry) => entry.choice.four.join(",") === prediction.four.join(","));
    if (!sourceFour) {
      return prediction;
    }
    const rankedLeads = rankLeadStrategies(
      sourceFour,
      options.enemyMetas,
      options.allyMetas,
      options.referenceState,
      options.enemyOutgoingMatrix,
      options.enemyIncomingMatrix,
      options.enemyProfile,
      options.allyProfile,
    );
    const leadInputs: EnemyLeadLikelihoodInput[] = rankedLeads.slice(0, options.previewOptions.maxLeadsPerFour ?? DEFAULT_MAX_LEADS_PER_FOUR).map((lead) => {
      const leadSet = new Set(lead.strategy.lead);
      const threatIds = options.threats
        .filter((threat) => threat.memberTeamIndices.some((teamIndex) => leadSet.has(teamIndex)))
        .sort((left, right) => right.importance - left.importance)
        .slice(0, 3)
        .map((threat) => threat.id);
      const modePressure = options.threats.reduce((sum, threat) => {
        const memberHits = threat.memberTeamIndices.filter((teamIndex) => leadSet.has(teamIndex)).length;
        if (memberHits === 0) {
          return sum;
        }
        return sum + threat.importance * (threat.kind === "package" ? (memberHits === threat.memberTeamIndices.length ? 0.012 : 0.005) : 0.008);
      }, 0);

      return {
        four: prediction.four,
        lead: lead.strategy.lead,
        coarseScore: lead.coarseScore,
        threatIds,
        modePressure,
        reasons: threatIds.length > 0 ? [`lead threatens ${threatIds.length} top mode(s)`] : ["lead keeps their plan flexible"],
      };
    });
    const leads = predictEnemyLeadDistribution({
      candidates: leadInputs,
      temperature: options.previewOptions.enemyLeadTemperature ?? DEFAULT_ENEMY_LEAD_TEMPERATURE,
      floor: Math.max(0.04, (options.previewOptions.enemyBringProbabilityFloor ?? DEFAULT_ENEMY_PROBABILITY_FLOOR) * 1.5),
    });

    return {
      ...prediction,
      leads,
      lead: leads[0]?.lead ?? null,
    };
  });
}

function buildThreatWeightsFromPredictions(predictions: PredictedEnemyFour[]) {
  const bringWeights = new Map<number, number>();
  const leadWeights = new Map<number, number>();
  for (const prediction of predictions) {
    for (const member of prediction.four) {
      bringWeights.set(member, (bringWeights.get(member) ?? 0) + prediction.probability);
    }
    for (const lead of prediction.leads) {
      for (const member of lead.lead) {
        leadWeights.set(member, (leadWeights.get(member) ?? 0) + prediction.probability * lead.probability);
      }
    }
  }
  return { bringWeights, leadWeights };
}

function flattenEnemyLeads(predictions: PredictedEnemyFour[]) {
  return predictions.flatMap((prediction) =>
    prediction.leads.map((lead) => ({
      ...lead,
      four: prediction.four,
      probability: prediction.probability * lead.probability,
    })),
  );
}

function scoreLeadConditionalCoverage(options: {
  allyLead: [number, number];
  chosenFour: number[];
  allyMetaByIndex: Map<number, PreviewCombatantMeta>;
  enemyMetaByIndex: Map<number, PreviewCombatantMeta>;
  predictedEnemyLeads: ReturnType<typeof flattenEnemyLeads>;
  allyOutgoingMatrix: Map<string, PreviewDamageSnapshot>;
  enemyIntoAllyMatrix: Map<string, PreviewDamageSnapshot>;
}) {
  const allyLead = getMetasForTeamIndices(options.allyMetaByIndex, options.allyLead);
  if (allyLead.length !== 2 || options.predictedEnemyLeads.length === 0) {
    return 0;
  }

  const allyLeadPair = allyLead as [PreviewCombatantMeta, PreviewCombatantMeta];
  const scored = options.predictedEnemyLeads.flatMap((predictedLead) => {
    const enemyLead = getMetasForTeamIndices(options.enemyMetaByIndex, predictedLead.lead);
    const enemyFour = getMetasForTeamIndices(options.enemyMetaByIndex, predictedLead.four);
    const chosen = getMetasForTeamIndices(options.allyMetaByIndex, options.chosenFour);
    if (enemyLead.length !== 2 || enemyFour.length === 0 || chosen.length === 0) {
      return [];
    }

    const enemyLeadPair = enemyLead as [PreviewCombatantMeta, PreviewCombatantMeta];
    const liveLeadPressure =
      getPairPressureAgainstTargets(allyLeadPair, enemyLeadPair, options.allyOutgoingMatrix) -
      getPairPressureAgainstTargets(enemyLeadPair, allyLeadPair, options.enemyIntoAllyMatrix);
    const enemyFourPressure =
      getPairPressureAgainstTargets(allyLeadPair, enemyFour, options.allyOutgoingMatrix) -
      getPairPressureAgainstTargets(enemyLeadPair, chosen, options.enemyIntoAllyMatrix);
    const speedScore = (getAveragePairSpeed(allyLeadPair) - getAveragePairSpeed(enemyLeadPair)) * 0.3;

    return [
      {
        score: liveLeadPressure * 2.2 + enemyFourPressure * 0.85 + speedScore,
        probability: predictedLead.probability,
      },
    ];
  });

  if (scored.length === 0) {
    return 0;
  }

  const robustScore = Math.min(...scored.map((entry) => entry.score));
  const probabilityMass = scored.reduce((sum, entry) => sum + entry.probability, 0) || 1;
  const likelyScore = scored.reduce((sum, entry) => sum + entry.score * entry.probability, 0) / probabilityMass;
  return robustScore * 0.65 + likelyScore * 0.35;
}

function scoreLeadWeatherControl(options: {
  allyLead: [number, number];
  chosenFour: number[];
  allyMetaByIndex: Map<number, PreviewCombatantMeta>;
  enemyMetaByIndex: Map<number, PreviewCombatantMeta>;
  predictedEnemyLeads: ReturnType<typeof flattenEnemyLeads>;
}) {
  const allyLeadSet = new Set(options.allyLead);
  const allyLeadWeather = options.allyLead.flatMap((teamIndex) => {
    const meta = options.allyMetaByIndex.get(teamIndex);
    return meta ? getWeatherSetterKinds(meta) : [];
  });
  const allyBenchWeather = options.chosenFour
    .filter((teamIndex) => !allyLeadSet.has(teamIndex))
    .flatMap((teamIndex) => {
      const meta = options.allyMetaByIndex.get(teamIndex);
      return meta ? getWeatherSetterKinds(meta) : [];
    });

  if (allyLeadWeather.length === 0 && allyBenchWeather.length === 0) {
    return 0;
  }

  let score = 0;
  for (const predictedLead of options.predictedEnemyLeads) {
    const enemyLead = predictedLead.lead
      .map((teamIndex) => options.enemyMetaByIndex.get(teamIndex))
      .filter((entry): entry is PreviewCombatantMeta => Boolean(entry));
    const enemyWeatherModes = new Set(enemyLead.flatMap(getWeatherSetterKinds));
    if (enemyWeatherModes.size === 0) {
      continue;
    }

    const enemyWeatherAbuserCount = enemyLead.filter((enemy) =>
      [...enemyWeatherModes].some((weather) => hasWeatherAbuser(enemy, weather)),
    ).length;
    const conflictWeight = 150 + enemyWeatherAbuserCount * 55;

    for (const allyWeather of allyLeadWeather) {
      for (const enemyWeather of enemyWeatherModes) {
        if (allyWeather !== enemyWeather) {
          score += predictedLead.probability * conflictWeight;
        }
      }
    }

    for (const allyWeather of allyBenchWeather) {
      for (const enemyWeather of enemyWeatherModes) {
        if (allyWeather !== enemyWeather) {
          score -= predictedLead.probability * 95;
        }
      }
    }
  }

  return score;
}

function buildAllyStrategyCandidates(options: {
  sourceFours: ScoredPreviewFourChoice[];
  allyMetas: PreviewCombatantMeta[];
  enemyMetas: PreviewCombatantMeta[];
  referenceState: BattleState;
  allyOutgoingMatrix: Map<string, PreviewDamageSnapshot>;
  allyIncomingMatrix: Map<string, PreviewDamageSnapshot>;
  allyProfile: PreviewThreatProfile;
  enemyProfile: PreviewThreatProfile;
  flattenedEnemyLeads: ReturnType<typeof flattenEnemyLeads>;
  threats: EnemyThreat[];
  answerMap: Map<string, AnswerScore>;
  maxLeadsPerFour: number;
}) {
  const allyMetaByIndex = getMetaByTeamIndex(options.allyMetas);
  const enemyMetaByIndex = getMetaByTeamIndex(options.enemyMetas);

  return options.sourceFours
    .flatMap((sourceFour) =>
      rankLeadStrategies(
        sourceFour,
        options.allyMetas,
        options.enemyMetas,
        options.referenceState,
        options.allyOutgoingMatrix,
        options.allyIncomingMatrix,
        options.allyProfile,
        options.enemyProfile,
      )
        .map((candidate) => {
          const conditionalFourScore = sourceFour.breakdown.conditional_matchup ?? 0;
          const leadAlignment = evaluateLeadAlignment({
            allyLead: candidate.strategy.lead,
            chosenFour: candidate.strategy.four,
            threats: options.threats,
            answerMap: options.answerMap,
            predictedEnemyLeads: options.flattenedEnemyLeads,
          });
          const weatherLeadControl = scoreLeadWeatherControl({
            allyLead: candidate.strategy.lead,
            chosenFour: candidate.strategy.four,
            allyMetaByIndex,
            enemyMetaByIndex,
            predictedEnemyLeads: options.flattenedEnemyLeads,
          });
          const conditionalLeadCoverage = scoreLeadConditionalCoverage({
            allyLead: candidate.strategy.lead,
            chosenFour: candidate.strategy.four,
            allyMetaByIndex,
            enemyMetaByIndex,
            predictedEnemyLeads: options.flattenedEnemyLeads,
            allyOutgoingMatrix: options.allyOutgoingMatrix,
            enemyIntoAllyMatrix: options.allyIncomingMatrix,
          });
          const breakdown = cloneBreakdown(candidate.breakdown);
          addScore(breakdown, "conditional_matchup", conditionalFourScore);
          addScore(breakdown, "lead_alignment", leadAlignment.score);
          addScore(breakdown, "weather_control_value", weatherLeadControl);
          addScore(breakdown, "conditional_lead_coverage", conditionalLeadCoverage);
          const leadScore = conditionalFourScore + leadAlignment.score + weatherLeadControl + conditionalLeadCoverage;
          return {
            candidate: {
              ...candidate,
              coarseScore: candidate.coarseScore + leadScore,
              breakdown,
            },
            sourceFour,
            cheapRobustScore: candidate.coarseScore + leadScore,
            cheapAverageScore: candidate.coarseScore + leadScore,
          } satisfies PreviewStrategyCandidate;
        })
        .sort((left, right) => right.candidate.coarseScore - left.candidate.coarseScore)
        .slice(0, options.maxLeadsPerFour),
    )
    .sort((left, right) => right.candidate.coarseScore - left.candidate.coarseScore);
}

function buildThreatLinesFromPredictions(options: {
  predictions: PredictedEnemyFour[];
  rankedEnemyFours: ScoredPreviewFourChoice[];
  enemyMetas: PreviewCombatantMeta[];
  allyMetas: PreviewCombatantMeta[];
  referenceState: BattleState;
  enemyOutgoingMatrix: Map<string, PreviewDamageSnapshot>;
  enemyIncomingMatrix: Map<string, PreviewDamageSnapshot>;
  enemyProfile: PreviewThreatProfile;
  allyProfile: PreviewThreatProfile;
  enemyMetaByIndex: Map<number, PreviewCombatantMeta>;
  threats: EnemyThreat[];
  coverageByFourKey: Map<string, FourCoverageEvaluation>;
  allyFourBeam: ScoredPreviewFourChoice[];
  maxThreatLines: number;
}) {
  const raw = options.predictions.flatMap((prediction) => {
    const sourceFour = options.rankedEnemyFours.find((entry) => entry.choice.four.join(",") === prediction.four.join(","));
    if (!sourceFour) {
      return [];
    }
    return prediction.leads.map((leadPrediction) => {
      const strategy = createStrategy(prediction.four, leadPrediction.lead);
      const candidate = scoreStrategy(
        strategy,
        options.enemyMetas,
        options.allyMetas,
        options.referenceState,
        options.enemyOutgoingMatrix,
        options.enemyIncomingMatrix,
        options.enemyProfile,
        options.allyProfile,
      );
      const leadSet = new Set(leadPrediction.lead);
      const representedThreats = options.threats
        .filter((threat) => threat.memberTeamIndices.some((teamIndex) => leadSet.has(teamIndex)))
        .sort((left, right) => right.importance - left.importance)
        .slice(0, 3);
      const uncoveredPressure = options.allyFourBeam.reduce((sum, allyFour) => {
        const coverage = options.coverageByFourKey.get(allyFour.choice.key);
        return sum + (coverage?.uncoveredThreats.some((entry) => representedThreats.some((threat) => threat.id === entry.threatId)) ? 1 : 0);
      }, 0);
      const threatScore =
        candidate.coarseScore * 0.55 +
        representedThreats.reduce((sum, threat) => sum + threat.importance * 0.18, 0) +
        leadPrediction.probability * prediction.probability * 850 +
        uncoveredPressure * 42;
      return {
        candidate,
        sourceFour,
        threatScore,
        vector: buildThreatVector(candidate, sourceFour, options.enemyMetaByIndex),
        probability: prediction.probability * leadPrediction.probability,
        threatIds: representedThreats.map((threat) => threat.id),
      } satisfies PreviewThreatLine;
    });
  });

  const selected = selectDiverseThreatLines(raw, options.maxThreatLines);
  const majorUncoveredThreatIds = options.allyFourBeam
    .flatMap((four) => options.coverageByFourKey.get(four.choice.key)?.uncoveredThreats ?? [])
    .sort((left, right) => right.severity - left.severity)
    .slice(0, 3)
    .map((threat) => threat.threatId);

  for (const threatId of majorUncoveredThreatIds) {
    if (selected.some((line) => line.threatIds.includes(threatId))) {
      continue;
    }
    const candidate = raw
      .filter((line) => line.threatIds.includes(threatId))
      .sort((left, right) => right.probability - left.probability || right.threatScore - left.threatScore)[0];
    if (candidate) {
      selected.push(candidate);
    }
  }

  return selectDiverseThreatLines(selected, options.maxThreatLines);
}

function scoreCheapLeadMatchup(
  allyCandidate: PreviewStrategyCandidate,
  enemyThreat: PreviewThreatLine,
  allyMetaByIndex: Map<number, PreviewCombatantMeta>,
  enemyMetaByIndex: Map<number, PreviewCombatantMeta>,
  referenceState: BattleState,
  allyOutgoingMatrix: Map<string, PreviewDamageSnapshot>,
  enemyOutgoingMatrix: Map<string, PreviewDamageSnapshot>,
) {
  const allyLead = getLeadMembers(allyCandidate.candidate.strategy, allyMetaByIndex);
  const enemyLead = getLeadMembers(enemyThreat.candidate.strategy, enemyMetaByIndex);

  const allyLeadSynergy = sumScores(
    scorePair(
      allyLead,
      allyCandidate.sourceFour.members,
      enemyThreat.sourceFour.members,
      referenceState,
      allyOutgoingMatrix,
      enemyThreat.sourceFour.profile,
    ),
  );
  const enemyLeadSynergy = sumScores(
    scorePair(
      enemyLead,
      enemyThreat.sourceFour.members,
      allyCandidate.sourceFour.members,
      referenceState,
      enemyOutgoingMatrix,
      allyCandidate.sourceFour.profile,
    ),
  );

  const liveLeadPressure =
    getPairPressureAgainstTargets(allyLead, enemyLead, allyOutgoingMatrix) -
    getPairPressureAgainstTargets(enemyLead, allyLead, enemyOutgoingMatrix);
  const fullFourPressure =
    getPairPressureAgainstTargets(allyLead, enemyThreat.sourceFour.members, allyOutgoingMatrix) -
    getPairPressureAgainstTargets(enemyLead, allyCandidate.sourceFour.members, enemyOutgoingMatrix);

  const allySupport = allyLead.reduce(
    (sum, meta) => sum + getSupportActionValue(meta, enemyThreat.sourceFour.profile, enemyThreat.sourceFour.members),
    0,
  );
  const enemySupport = enemyLead.reduce(
    (sum, meta) => sum + getSupportActionValue(meta, allyCandidate.sourceFour.profile, allyCandidate.sourceFour.members),
    0,
  );

  const speedDelta = getAveragePairSpeed(allyLead) - getAveragePairSpeed(enemyLead);
  const structuralDelta = allyCandidate.sourceFour.coarseScore - enemyThreat.sourceFour.coarseScore;

  return (
    structuralDelta * 0.35 +
    (allyLeadSynergy - enemyLeadSynergy) * 0.85 +
    liveLeadPressure * 2.15 +
    fullFourPressure * 0.9 +
    (allySupport - enemySupport) * 0.4 +
    speedDelta * 0.35
  );
}

function selectDiverseThreatLines(
  candidates: PreviewThreatLine[],
  maxThreatLines: number,
) {
  const pool = [...candidates].sort((left, right) => right.threatScore - left.threatScore);
  const selected: PreviewThreatLine[] = [];

  while (selected.length < maxThreatLines && pool.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const minDistance =
        selected.length === 0
          ? 0
          : Math.min(...selected.map((entry) => getVectorDistance(candidate.vector, entry.vector)));
      const diversityScore = candidate.threatScore + minDistance * 140;
      if (diversityScore > bestScore) {
        bestScore = diversityScore;
        bestIndex = index;
      }
    }

    selected.push(pool.splice(bestIndex, 1)[0]);
  }

  return selected.sort((left, right) => right.threatScore - left.threatScore);
}

function summarizeCandidateAgainstThreats(
  entry: PreviewStrategyCandidate,
  threatLines: PreviewThreatLine[],
  fastCells: Map<string, TacticalCellEvaluation>,
  refineCells: Map<string, TacticalCellEvaluation>,
) {
  if (threatLines.length === 0) {
    const robustScore = entry.cheapRobustScore;
    const likelyScore = entry.cheapAverageScore;
    const hybridScore = robustScore * 0.6 + likelyScore * 0.4;
    return {
      robustScore,
      likelyScore,
      hybridScore,
      previewValue: sigmoid(hybridScore / 14_000),
    } satisfies MatrixSummary;
  }

  const scoredThreats = threatLines.map((threat) => {
    const refineCell = refineCells.get(`${PREVIEW_REFINE_PROFILE.key}::${entry.candidate.strategy.key}__${threat.candidate.strategy.key}`);
    if (refineCell) {
      return { score: refineCell.score, probability: threat.probability };
    }
    return {
      score: fastCells.get(`${PREVIEW_FAST_PROFILE.key}::${entry.candidate.strategy.key}__${threat.candidate.strategy.key}`)?.score ?? Number.NEGATIVE_INFINITY,
      probability: threat.probability,
    };
  });

  const robustScore = Math.min(...scoredThreats.map((entry) => entry.score));
  const probabilityMass = scoredThreats.reduce((sum, entry) => sum + entry.probability, 0) || 1;
  const likelyScore = scoredThreats.reduce((sum, threat) => sum + threat.score * threat.probability, 0) / probabilityMass;
  const hybridScore = robustScore * 0.6 + likelyScore * 0.4;
  return {
    robustScore,
    likelyScore,
    hybridScore,
    previewValue: sigmoid(hybridScore / 14_000),
  } satisfies MatrixSummary;
}

function rankCandidatesAgainstThreats(
  allyCandidates: PreviewStrategyCandidate[],
  threatLines: PreviewThreatLine[],
  fastCells: Map<string, TacticalCellEvaluation>,
  refineCells: Map<string, TacticalCellEvaluation>,
  objectiveMode: TeamPreviewObjectiveMode,
) {
  return sortRowsByObjective(
    allyCandidates
    .map((entry) => ({
      entry,
      summary: summarizeCandidateAgainstThreats(entry, threatLines, fastCells, refineCells),
    })),
    objectiveMode,
  );
}

function areTopCandidatesClose(
  rows: RankedPreviewStrategy[],
  refinementMargin: number,
  objectiveMode: TeamPreviewObjectiveMode,
) {
  if (rows.length < 2) {
    return false;
  }
  return getObjectiveScore(rows[0].summary, objectiveMode) - getObjectiveScore(rows[1].summary, objectiveMode) <= refinementMargin;
}

function evaluateTacticalCell(
  allyMembers: BattleStateMemberInput[],
  enemyMembers: BattleStateMemberInput[],
  allyStrategy: PreviewStrategy,
  enemyStrategy: PreviewStrategy,
  options: TeamPreviewOptions,
  profile: PreviewTacticalProfile,
  cache: Map<string, TacticalCellEvaluation>,
  diagnostics: TeamPreviewDiagnostics,
) {
  const key = `${profile.key}::${allyStrategy.key}__${enemyStrategy.key}`;
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const state = createBattleState({
    ally: buildStrategyMembers(allyMembers, allyStrategy),
    enemy: buildStrategyMembers(enemyMembers, enemyStrategy),
    moveByKey: options.moveByKey,
    weather: options.weather,
    terrain: options.terrain,
    allyTailwind: options.allyTailwind,
    enemyTailwind: options.enemyTailwind,
    trickRoom: options.trickRoom,
    attackStage: options.attackStage,
    defenseStage: options.defenseStage,
    universalProtect: true,
  });

  const recommendation = recommendBestPlan(state, {
    depth: profile.depth,
    maxJointPlansPerSide: profile.maxJointPlansPerSide,
    maxIndividualActionsPerActor: profile.maxIndividualActionsPerActor,
    branchModel: profile.branchModel,
  });

  const evaluation = {
    score: recommendation.rootScore,
    diagnostics: recommendation.diagnostics,
  } satisfies TacticalCellEvaluation;

  cache.set(key, evaluation);
  diagnostics.verifiedCells += 1;
  mergeSearchDiagnostics(diagnostics, recommendation.diagnostics);
  return evaluation;
}

function tryEvaluateThreatLine(
  allyCandidates: PreviewStrategyCandidate[],
  threatLine: PreviewThreatLine,
  options: TeamPreviewOptions,
  profile: PreviewTacticalProfile,
  deadline: number,
  cache: Map<string, TacticalCellEvaluation>,
  diagnostics: TeamPreviewDiagnostics,
) {
  for (const allyCandidate of allyCandidates) {
    if (nowMs() > deadline) {
      diagnostics.stoppedByBudget = true;
      return false;
    }
    evaluateTacticalCell(
      options.ally,
      options.enemy,
      allyCandidate.candidate.strategy,
      threatLine.candidate.strategy,
      options,
      profile,
      cache,
      diagnostics,
    );
  }
  return true;
}

function selectNextThreatLine(
  currentBest: PreviewStrategyCandidate,
  threatLines: PreviewThreatLine[],
  activeThreats: PreviewThreatLine[],
  allyMetaByIndex: Map<number, PreviewCombatantMeta>,
  enemyMetaByIndex: Map<number, PreviewCombatantMeta>,
  referenceState: BattleState,
  allyOutgoingMatrix: Map<string, PreviewDamageSnapshot>,
  enemyOutgoingMatrix: Map<string, PreviewDamageSnapshot>,
) {
  const activeKeys = new Set(activeThreats.map((entry) => entry.candidate.strategy.key));
  return threatLines
    .filter((entry) => !activeKeys.has(entry.candidate.strategy.key))
    .map((entry) => ({
      entry,
      dangerScore: scoreCheapLeadMatchup(
        currentBest,
        entry,
        allyMetaByIndex,
        enemyMetaByIndex,
        referenceState,
        allyOutgoingMatrix,
        enemyOutgoingMatrix,
      ),
    }))
    .sort((left, right) => left.dangerScore - right.dangerScore || right.entry.threatScore - left.entry.threatScore)[0]?.entry ?? null;
}

function getDangerNotes(
  best: ScoredPreviewStrategy,
  allyMetas: PreviewCombatantMeta[],
  enemyProfile: PreviewThreatProfile,
) {
  const notes: string[] = [];
  const chosen = allyMetas.filter((meta) => best.strategy.four.includes(meta.member.teamIndex));

  if (
    enemyProfile.statDropPunisherRisk > 0 &&
    chosen.some((meta) => meta.roleTags.has("intimidate") || meta.roleTags.has("statDropPressure"))
  ) {
    notes.push("Avoid leaning on Intimidate or stat drops into their Defiant or Competitive punishers.");
  }

  if (
    enemyProfile.spreadShare > 0.4 &&
    chosen.some((meta) => meta.roleTags.has("redirection")) &&
    !chosen.some((meta) => meta.roleTags.has("wideGuard"))
  ) {
    notes.push("Their spread pressure limits Follow Me and Rage Powder turns unless you preserve positioning.");
  }

  if (
    enemyProfile.trickRoomModeStrength > 0.45 &&
    !chosen.some((meta) => meta.roleTags.has("taunt") || meta.roleTags.has("encore") || meta.roleTags.has("trickRoom"))
  ) {
    notes.push("They have a real Trick Room mode, so keep immediate pressure on setters from turn one.");
  }

  if (
    enemyProfile.tailwindModeStrength > 0.45 &&
    !chosen.some((meta) => meta.roleTags.has("tailwind") || meta.roleTags.has("priority") || meta.roleTags.has("speedControl"))
  ) {
    notes.push("Their speed control can outpace this four if you do not force damage early.");
  }

  if (
    Object.values(enemyProfile.weatherStrength).some((value) => value > 0.55) &&
    !chosen.some(
      (meta) =>
        meta.roleTags.has("weatherRain") ||
        meta.roleTags.has("weatherSun") ||
        meta.roleTags.has("weatherSand") ||
        meta.roleTags.has("weatherSnow"),
    )
  ) {
    notes.push("If they bring weather, you do not have a direct override in this four.");
  }

  return notes.slice(0, 3);
}

function buildReasons(breakdown: StrategyScoreBreakdown) {
  return Object.entries(breakdown)
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .map(([feature, delta]) => ({
      feature,
      label: FEATURE_LABELS[feature] ?? feature,
      delta,
    }))
    .filter((entry) => entry.delta > 0)
    .slice(0, 5);
}

function buildPriorityReason(feature: string, delta: number): TeamPreviewReason {
  return {
    feature,
    label: FEATURE_LABELS[feature] ?? feature,
    delta,
  };
}

function buildOmittedSlotExplanations(bestFour: number[], allyMetas: PreviewCombatantMeta[], coverage: FourCoverageEvaluation) {
  const chosenSet = new Set(bestFour);
  const answerSlots = new Set(coverage.uniqueAnswerSlots);
  return allyMetas
    .filter((meta) => !chosenSet.has(meta.member.teamIndex))
    .map((meta) => {
      const tags = [...meta.roleTags].slice(0, 3);
      const roleText = tags.length > 0 ? ` (${tags.join(", ")})` : "";
      const answerText = answerSlots.has(meta.member.teamIndex)
        ? " It has matchup answers, but the selected four covers the higher-weight threats with less overload."
        : " It was not a required answer for the highest-weight threat coverage.";
      return {
        slotIndex: meta.member.teamIndex,
        explanation: `${meta.member.pokemon.name}${roleText} was benched because this four scored better on coverage, lead stability, and endgame value.${answerText}`,
      };
    });
}

function buildLeadRiskNotes(best: RankedPreviewStrategy, predictions: PredictedEnemyFour[]) {
  const leadSet = new Set(best.entry.candidate.strategy.lead);
  return predictions
    .flatMap((prediction) =>
      prediction.leads.map((lead) => ({
        probability: prediction.probability * lead.probability,
        note: `Enemy lead ${lead.lead.join("+")} is a notable turn-one line into ${[...leadSet].join("+")}.`,
      })),
    )
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 3)
    .map((entry) => entry.note);
}

function buildLowProbabilityHighRegretNotes(
  bestFour: number[],
  preparation: PreviewPreparation,
) {
  const bestCoverage = preparation.coverageByFourKey.get(`four:${bestFour.join(",")}`);
  const uncoveredIds = new Set(bestCoverage?.uncoveredThreats.map((threat) => threat.threatId) ?? []);
  if (uncoveredIds.size === 0) {
    return [];
  }

  return preparation.enemyPredictions
    .filter((prediction) => prediction.probability < 0.12)
    .flatMap((prediction) => {
      const relevantThreats = preparation.enemyThreats.filter(
        (threat) =>
          uncoveredIds.has(threat.id) &&
          threat.memberTeamIndices.some((teamIndex) => prediction.four.includes(teamIndex)),
      );
      if (relevantThreats.length === 0) {
        return [];
      }
      return [
        `Low-probability enemy four ${prediction.four.join(",")} has high regret because it exposes ${relevantThreats
          .map((threat) => threat.label)
          .slice(0, 2)
          .join(" and ")}.`,
      ];
    })
    .slice(0, 3);
}

function getRecommendationConfidence(options: {
  preparation: PreviewPreparation;
  diagnostics: TeamPreviewDiagnostics;
  uncoveredThreatCount: number;
  stoppedByBudget: boolean;
}) {
  const reasons: string[] = [];
  if (options.preparation.enemyPredictions.length === options.preparation.enemyFourChoiceCount) {
    reasons.push("All legal enemy fours were retained for robust/regret scoring.");
  }
  if (options.uncoveredThreatCount > 0) {
    reasons.push("Selected four leaves at least one must-answer threat partially uncovered.");
  }
  if (options.stoppedByBudget) {
    reasons.push("Tactical refinement stopped on the time budget.");
  }
  if (options.diagnostics.mechanicsSupportReport.markers.length > 0) {
    reasons.push("One or more mechanics were approximated or unsupported.");
  }

  const confidence: TeamPreviewConfidence =
    options.uncoveredThreatCount > 0 || options.stoppedByBudget
      ? "low"
      : options.diagnostics.mechanicsSupportReport.markers.length > 0
        ? "medium"
        : "high";
  return { confidence, confidenceReasons: reasons };
}

function preparePreviewContext(
  options: TeamPreviewOptions,
  referenceState: BattleState,
  allyMetas: PreviewCombatantMeta[],
  enemyMetas: PreviewCombatantMeta[],
  allyProfile: PreviewThreatProfile,
  enemyProfile: PreviewThreatProfile,
  allyOutgoingMatrix: Map<string, PreviewDamageSnapshot>,
  allyIncomingMatrix: Map<string, PreviewDamageSnapshot>,
  enemyOutgoingMatrix: Map<string, PreviewDamageSnapshot>,
  enemyIncomingMatrix: Map<string, PreviewDamageSnapshot>,
) {
  const coarseStarted = nowMs();
  const objectiveMode = getObjectiveMode(options);
  const allyFourChoices = enumerateFourChoices(allyMetas);
  const enemyFourChoices = enumerateFourChoices(enemyMetas);

  const rankedAllyFoursStructural = allyFourChoices
    .map((choice) =>
      scoreFourChoice(
        choice,
        allyMetas,
        enemyMetas,
        referenceState,
        allyOutgoingMatrix,
        allyIncomingMatrix,
        allyProfile,
        enemyProfile,
      ),
    )
    .sort((left, right) => right.coarseScore - left.coarseScore);

  const rankedEnemyFours = enemyFourChoices
    .map((choice) =>
      scoreFourChoice(
        choice,
        enemyMetas,
        allyMetas,
        referenceState,
        enemyOutgoingMatrix,
        enemyIncomingMatrix,
        enemyProfile,
        allyProfile,
      ),
    )
    .sort((left, right) => right.coarseScore - left.coarseScore);

  const initialThreats = buildEnemyThreats(referenceState, enemyMetas, allyMetas);
  const initialPredictions = computeEnemyPredictions({
    rankedEnemyFours,
    enemyMetas,
    allyMetas,
    referenceState,
    enemyOutgoingMatrix,
    enemyIncomingMatrix,
    enemyProfile,
    allyProfile,
    threats: initialThreats,
    previewOptions: options,
  });
  const initialWeights = buildThreatWeightsFromPredictions(initialPredictions);
  const weightedThreats = applyThreatLikelihoods(initialThreats, initialWeights.bringWeights, initialWeights.leadWeights);
  const initialAnswerMap = buildThreatAnswerMatrix(referenceState, allyMetas, enemyMetas, weightedThreats);
  const initialCoverage = applyCoverageToFours(rankedAllyFoursStructural, weightedThreats, initialAnswerMap, options);
  const allyFocusFours = initialCoverage.reranked
    .slice(0, options.allyFourCandidates ?? DEFAULT_ALLY_FOUR_CANDIDATES)
    .map((entry) => entry.choice.four);

  const refinedPredictions = computeEnemyPredictions({
    rankedEnemyFours,
    enemyMetas,
    allyMetas,
    referenceState,
    enemyOutgoingMatrix,
    enemyIncomingMatrix,
    enemyProfile,
    allyProfile,
    threats: weightedThreats,
    previewOptions: options,
    allyFocusFours,
  });
  const refinedWeights = buildThreatWeightsFromPredictions(refinedPredictions);
  const enemyThreats = applyThreatLikelihoods(initialThreats, refinedWeights.bringWeights, refinedWeights.leadWeights);
  const answerMap = buildThreatAnswerMatrix(referenceState, allyMetas, enemyMetas, enemyThreats);
  const { reranked: coveredAllyFours, coverageByFourKey } = applyCoverageToFours(
    rankedAllyFoursStructural,
    enemyThreats,
    answerMap,
    options,
  );
  const rankedAllyFours = applyConditionalMatchupsToFours({
    rankedFours: coveredAllyFours,
    predictions: refinedPredictions,
    rankedEnemyFours,
    allyMetas,
    referenceState,
    allyOutgoingMatrix,
    allyIncomingMatrix,
    allyProfile,
    threats: enemyThreats,
    answerMap,
    previewOptions: options,
  });

  return {
    rankedAllyFours,
    rankedEnemyFours,
    enemyPredictions: refinedPredictions,
    enemyThreats,
    answerMap,
    coverageByFourKey,
    objectiveMode,
    coarseStageMs: nowMs() - coarseStarted,
    allyFourChoiceCount: allyFourChoices.length,
    enemyFourChoiceCount: enemyFourChoices.length,
    allAllyFours: allyFourChoices.map((choice) => choice.four),
    allEnemyFours: enemyFourChoices.map((choice) => choice.four),
    scenarioMatrix: buildScenarioMatrixSummary({
      allyFours: allyFourChoices.map((choice) => choice.four),
      enemyFours: enemyFourChoices.map((choice) => choice.four),
      retainedEnemyFourCount: refinedPredictions.length,
    }),
  } satisfies PreviewPreparation;
}

function buildRecommendationFromRows(
  rows: RankedPreviewStrategy[],
  objectiveMode: TeamPreviewObjectiveMode,
  allyMetas: PreviewCombatantMeta[],
  enemyProfile: PreviewThreatProfile,
  preparation: PreviewPreparation,
  candidateCounts: TeamPreviewRecommendation["candidateCounts"],
  diagnostics: TeamPreviewDiagnostics,
) {
  const best = rows[0];
  if (!best) {
    return null;
  }

  const bestFourKey = best.entry.candidate.strategy.four.join(",");
  const altLead =
    rows.find(
      (entry) =>
        entry.entry.candidate.strategy.four.join(",") === bestFourKey &&
        entry.entry.candidate.strategy.lead.join(",") !== best.entry.candidate.strategy.lead.join(","),
    )?.entry.candidate.strategy.lead ?? null;

  const alternatives = rows
    .filter((entry) => entry.entry.candidate.strategy.key !== best.entry.candidate.strategy.key)
    .filter(
      (entry, index, currentRows) =>
        currentRows.findIndex(
          (row) => row.entry.candidate.strategy.four.join(",") === entry.entry.candidate.strategy.four.join(","),
        ) === index,
    )
    .slice(0, 2)
    .map((entry) => ({
      four: entry.entry.candidate.strategy.four,
      lead: entry.entry.candidate.strategy.lead,
      robustScore: entry.summary.robustScore,
      averageScore: entry.summary.likelyScore,
      previewValue: entry.summary.previewValue,
    }));

  const bestCoverage =
    preparation.coverageByFourKey.get(`four:${best.entry.candidate.strategy.four.join(",")}`) ??
    ({
      totalScore: 0,
      uncoveredPenalty: 0,
      overloadPenalty: 0,
      secondaryCoverageBonus: 0,
      packageDenialBonus: 0,
      leadAlignmentBase: 0,
      mustAnswerThreats: [],
      uncoveredThreats: [],
      coverageSummary: [],
      uniqueAnswerSlots: [],
    } satisfies FourCoverageEvaluation);
  const structuralReasons = buildReasons(best.entry.candidate.breakdown);
  const priorityFeatures = ["wide_guard_value", "lead_alignment"] as const;
  for (const feature of priorityFeatures) {
    const delta = best.entry.candidate.breakdown[feature] ?? 0;
    if (delta > 0 && !structuralReasons.some((reason) => reason.feature === feature)) {
      structuralReasons.push(buildPriorityReason(feature, delta));
    }
  }
  const reasons = [
    ...buildCoverageReasons(bestCoverage),
    ...structuralReasons,
  ].slice(0, 7);
  const dangerNotes = [
    ...getDangerNotes(best.entry.candidate, allyMetas, enemyProfile),
    ...buildCoverageDangerNotes(bestCoverage),
  ].slice(0, 5);
  const objectiveSummary = {
    robustScore: best.summary.robustScore,
    likelyScore: best.summary.likelyScore,
    hybridScore: best.summary.hybridScore,
  };
  const unsupportedMechanics = diagnostics.mechanicsSupportReport.markers;
  const lowProbabilityHighRegretNotes = buildLowProbabilityHighRegretNotes(best.entry.candidate.strategy.four, preparation);
  const confidence = getRecommendationConfidence({
    preparation,
    diagnostics,
    uncoveredThreatCount: bestCoverage.uncoveredThreats.length,
    stoppedByBudget: diagnostics.stoppedByBudget,
  });

  return {
    bestFour: best.entry.candidate.strategy.four,
    primaryLead: best.entry.candidate.strategy.lead,
    altLead,
    previewValue: sigmoid(getObjectiveScore(best.summary, objectiveMode) / 14_000),
    robustScore: best.summary.robustScore,
    averageScore: best.summary.likelyScore,
    reasons,
    dangerNotes,
    alternatives,
    predictedEnemyFours: buildPredictedEnemyFoursSummary(preparation.enemyPredictions),
    mustAnswerThreats: bestCoverage.mustAnswerThreats.slice(0, 5),
    uncoveredThreats: bestCoverage.uncoveredThreats.slice(0, 5),
    coverageSummary: bestCoverage.coverageSummary,
    objectiveBreakdown: buildObjectiveBreakdown(objectiveSummary),
    confidence: confidence.confidence,
    confidenceReasons: confidence.confidenceReasons,
    unsupportedMechanics,
    scenarioMatrix: preparation.scenarioMatrix,
    omittedSlotExplanations: buildOmittedSlotExplanations(best.entry.candidate.strategy.four, allyMetas, bestCoverage),
    enemyBringDistribution: preparation.enemyPredictions,
    leadRiskNotes: buildLeadRiskNotes(best, preparation.enemyPredictions),
    lowProbabilityHighRegretNotes,
    candidateCounts,
    diagnostics,
  } satisfies TeamPreviewRecommendation;
}

function recommendTeamPreviewSparse(
  options: TeamPreviewOptions,
  preparation: PreviewPreparation,
  referenceState: BattleState,
  allyMetas: PreviewCombatantMeta[],
  enemyMetas: PreviewCombatantMeta[],
  allyProfile: PreviewThreatProfile,
  enemyProfile: PreviewThreatProfile,
  allyOutgoingMatrix: Map<string, PreviewDamageSnapshot>,
  allyIncomingMatrix: Map<string, PreviewDamageSnapshot>,
  enemyOutgoingMatrix: Map<string, PreviewDamageSnapshot>,
  enemyIncomingMatrix: Map<string, PreviewDamageSnapshot>,
) {
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const diagnostics = createPreviewDiagnostics("robust", timeBudgetMs);
  diagnostics.objective = preparation.objectiveMode;
  diagnostics.searchDepth = PREVIEW_FAST_PROFILE.depth;
  const startedAt = nowMs();
  const deadline = startedAt + timeBudgetMs;
  const allyMetaByIndex = getMetaByTeamIndex(allyMetas);
  const enemyMetaByIndex = getMetaByTeamIndex(enemyMetas);

  const allyStrategies = enumerateStrategies(allyMetas);
  const enemyStrategies = enumerateStrategies(enemyMetas);
  diagnostics.coarseStageMs = preparation.coarseStageMs;

  const allyFourBeam = preparation.rankedAllyFours.slice(0, options.allyFourCandidates ?? DEFAULT_ALLY_FOUR_CANDIDATES);
  const maxLeadsPerFour = options.maxLeadsPerFour ?? DEFAULT_MAX_LEADS_PER_FOUR;
  const maxThreatLines = options.maxThreatLines ?? DEFAULT_MAX_THREAT_LINES;
  const flattenedEnemyLeads = flattenEnemyLeads(preparation.enemyPredictions);
  const threatLines = buildThreatLinesFromPredictions({
    predictions: preparation.enemyPredictions,
    rankedEnemyFours: preparation.rankedEnemyFours,
    enemyMetas,
    allyMetas,
    referenceState,
    enemyOutgoingMatrix,
    enemyIncomingMatrix,
    enemyProfile,
    allyProfile,
    enemyMetaByIndex,
    threats: preparation.enemyThreats,
    coverageByFourKey: preparation.coverageByFourKey,
    allyFourBeam,
    maxThreatLines,
  });

  const allyCandidates = buildAllyStrategyCandidates({
    sourceFours: allyFourBeam,
    allyMetas,
    enemyMetas,
    referenceState,
    allyOutgoingMatrix,
    allyIncomingMatrix,
    allyProfile,
    enemyProfile,
    flattenedEnemyLeads,
    threats: preparation.enemyThreats,
    answerMap: preparation.answerMap,
    maxLeadsPerFour,
  }).map((entry) => {
    const cheapScores = threatLines.map((threat) =>
      scoreCheapLeadMatchup(
        entry,
        threat,
        allyMetaByIndex,
        enemyMetaByIndex,
        referenceState,
        allyOutgoingMatrix,
        enemyOutgoingMatrix,
      ),
    );
    const cheapRobustScore = cheapScores.length > 0 ? Math.min(...cheapScores) : entry.candidate.coarseScore;
    const cheapAverageScore =
      cheapScores.length > 0 ? cheapScores.reduce((sum, score) => sum + score, 0) / cheapScores.length : entry.candidate.coarseScore;
    return {
      ...entry,
      candidate: {
        ...entry.candidate,
        coarseScore: entry.candidate.coarseScore * 0.42 + cheapRobustScore * 0.42 + cheapAverageScore * 0.16,
      },
      cheapRobustScore,
      cheapAverageScore,
    } satisfies PreviewStrategyCandidate;
  }).sort((left, right) => right.candidate.coarseScore - left.candidate.coarseScore);

  const fastCells = new Map<string, TacticalCellEvaluation>();
  const refineCells = new Map<string, TacticalCellEvaluation>();
  const activeThreats: PreviewThreatLine[] = [];
  const tacticalStarted = nowMs();

  for (const threat of threatLines.slice(0, Math.min(2, threatLines.length))) {
    if (!tryEvaluateThreatLine(allyCandidates, threat, options, PREVIEW_FAST_PROFILE, deadline, fastCells, diagnostics)) {
      break;
    }
    activeThreats.push(threat);
  }

  let rankedRows = rankCandidatesAgainstThreats(
    allyCandidates,
    activeThreats,
    fastCells,
    refineCells,
    preparation.objectiveMode,
  );
  const refinementMargin = options.refinementMargin ?? DEFAULT_REFINEMENT_MARGIN;

  while (nowMs() <= deadline && activeThreats.length < threatLines.length && rankedRows.length > 0) {
    const nextThreat = selectNextThreatLine(
      rankedRows[0].entry,
      threatLines,
      activeThreats,
      allyMetaByIndex,
      enemyMetaByIndex,
      referenceState,
      allyOutgoingMatrix,
      enemyOutgoingMatrix,
    );
    if (!nextThreat) {
      break;
    }

    const expandThreatPool =
      activeThreats.length < Math.min(3, threatLines.length) ||
      areTopCandidatesClose(rankedRows, refinementMargin, preparation.objectiveMode) ||
      scoreCheapLeadMatchup(
        rankedRows[0].entry,
        nextThreat,
        allyMetaByIndex,
        enemyMetaByIndex,
        referenceState,
        allyOutgoingMatrix,
        enemyOutgoingMatrix,
      ) < 0;

    if (!expandThreatPool) {
      break;
    }

    if (!tryEvaluateThreatLine(allyCandidates, nextThreat, options, PREVIEW_FAST_PROFILE, deadline, fastCells, diagnostics)) {
      break;
    }
    activeThreats.push(nextThreat);
    rankedRows = rankCandidatesAgainstThreats(
      allyCandidates,
      activeThreats,
      fastCells,
      refineCells,
      preparation.objectiveMode,
    );
  }

  if (nowMs() <= deadline && areTopCandidatesClose(rankedRows, refinementMargin, preparation.objectiveMode) && activeThreats.length > 0) {
    const finalists = rankedRows.slice(0, 2).map((row) => row.entry);
    const criticalThreats = [...activeThreats]
      .map((threat) => ({
        threat,
        risk:
          finalists.reduce(
            (sum, finalist) =>
              sum +
              (fastCells.get(`${PREVIEW_FAST_PROFILE.key}::${finalist.candidate.strategy.key}__${threat.candidate.strategy.key}`)?.score ??
                Number.POSITIVE_INFINITY),
            0,
          ) / Math.max(1, finalists.length),
      }))
      .sort((left, right) => left.risk - right.risk)
      .slice(0, Math.min(2, activeThreats.length))
      .map((entry) => entry.threat);

    diagnostics.refinementRan = criticalThreats.length > 0;
    for (const threat of criticalThreats) {
      if (!tryEvaluateThreatLine(finalists, threat, options, PREVIEW_REFINE_PROFILE, deadline, refineCells, diagnostics)) {
        break;
      }
    }
    rankedRows = rankCandidatesAgainstThreats(
      allyCandidates,
      activeThreats,
      fastCells,
      refineCells,
      preparation.objectiveMode,
    );
  }

  diagnostics.tacticalStageMs = nowMs() - tacticalStarted;
  diagnostics.threatLineCount = activeThreats.length;
  diagnostics.searchedScenarioCount = diagnostics.verifiedCells;
  diagnostics.topLineSummary = rankedRows[0]?.entry.candidate.strategy.key ?? null;
  diagnostics.tacticalRiskNotes = activeThreats
    .slice(0, 3)
    .map((threat) => `Refined enemy ${threat.candidate.strategy.key} because probability=${threat.probability.toFixed(3)} threatScore=${Math.round(threat.threatScore)}.`);
  diagnostics.elapsedMs = nowMs() - startedAt;

  return buildRecommendationFromRows(rankedRows, preparation.objectiveMode, allyMetas, enemyProfile, preparation, {
    allyStrategies: allyStrategies.length,
    enemyStrategies: enemyStrategies.length,
    allyCandidates: allyCandidates.length,
    enemyCandidates: activeThreats.length,
    allyFourCandidates: allyFourBeam.length,
    enemyFourCandidates: preparation.rankedEnemyFours.length,
    threatLines: threatLines.length,
    matrixCells: diagnostics.verifiedCells,
  }, diagnostics);
}

export function recommendTeamPreview(options: TeamPreviewOptions): TeamPreviewRecommendation | null {
  if (options.ally.length < 4 || options.enemy.length < 4) {
    return null;
  }

  const referenceState = createReferenceState(options);
  const allyMetas = buildPreviewCombatantMetas(referenceState, options.ally);
  const enemyMetas = buildPreviewCombatantMetas(referenceState, options.enemy);

  if (allyMetas.length < 4 || enemyMetas.length < 4) {
    return null;
  }

  const allyProfile = buildPreviewThreatProfile(allyMetas);
  const enemyProfile = buildPreviewThreatProfile(enemyMetas);
  const allyOutgoingMatrix = buildPreviewDamageMatrix(referenceState, allyMetas, enemyMetas);
  const allyIncomingMatrix = buildPreviewDamageMatrix(referenceState, enemyMetas, allyMetas);
  const enemyOutgoingMatrix = buildPreviewDamageMatrix(referenceState, enemyMetas, allyMetas);
  const enemyIncomingMatrix = buildPreviewDamageMatrix(referenceState, allyMetas, enemyMetas);
  const preparation = preparePreviewContext(
    options,
    referenceState,
    allyMetas,
    enemyMetas,
    allyProfile,
    enemyProfile,
    allyOutgoingMatrix,
    allyIncomingMatrix,
    enemyOutgoingMatrix,
    enemyIncomingMatrix,
  );

  const solverMode = options.solverMode ?? DEFAULT_SOLVER_MODE;
  return recommendTeamPreviewSparse(
    { ...options, solverMode },
    preparation,
    referenceState,
    allyMetas,
    enemyMetas,
    allyProfile,
    enemyProfile,
    allyOutgoingMatrix,
    allyIncomingMatrix,
    enemyOutgoingMatrix,
    enemyIncomingMatrix,
  );
}
