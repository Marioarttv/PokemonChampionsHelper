import { getTypeFromLabel, type PokemonType } from "../data/typeChart";
import { getMultiplier } from "./effectiveness";
import type { MoveRecord } from "./battleData";
import type { DamageTerrain, DamageWeather } from "./damage";
import {
  createBattleState,
  getDamagePreview,
  getEffectiveSpeed,
  recommendBestPlan,
  type BattleCombatantState,
  type BattleMoveOption,
  type BattleState,
  type BattleStateMemberInput,
  type SearchBranchModel,
  type SearchDiagnostics,
} from "./engine";
import { getMoveRoleTags } from "./engine/moveRegistry";

type PreviewRoleTag =
  | "physical"
  | "special"
  | "priority"
  | "spread"
  | "tailwind"
  | "trickRoom"
  | "speedControl"
  | "redirection"
  | "wideGuard"
  | "quickGuard"
  | "fakeOut"
  | "protect"
  | "setup"
  | "healing"
  | "taunt"
  | "encore"
  | "disable"
  | "helpingHand"
  | "status"
  | "weatherRain"
  | "weatherSun"
  | "weatherSand"
  | "weatherSnow"
  | "weatherRainAbuser"
  | "weatherSunAbuser"
  | "weatherSandAbuser"
  | "weatherSnowAbuser"
  | "intimidate"
  | "statDropPunisher"
  | "statDropPressure"
  | "slowBreaker"
  | "fastPressure";

type StrategyScoreBreakdown = Record<string, number>;

type PreviewWeather = "rain" | "sun" | "sand" | "snow";

type PreviewDamageSnapshot = {
  averagePercent: number;
  maxPercent: number;
  move: BattleMoveOption | null;
};

type PreviewCombatantMeta = {
  member: BattleStateMemberInput;
  combatant: BattleCombatantState;
  roleTags: Set<PreviewRoleTag>;
  abilityKey: string;
  speed: number;
  damagingMoves: BattleMoveOption[];
  primaryType: PokemonType | null;
  secondaryType: PokemonType | null;
  bulkyScore: number;
};

type PreviewThreatProfile = {
  physicalShare: number;
  specialShare: number;
  spreadShare: number;
  singleTargetShare: number;
  priorityShare: number;
  tailwindModeStrength: number;
  trickRoomModeStrength: number;
  weatherStrength: Record<PreviewWeather, number>;
  statDropPunisherRisk: number;
};

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
  averageScore: number;
  previewValue: number;
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

export type TeamPreviewSolverMode = "sparse" | "dense";

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
  maxCandidatesPerSide?: number;
  tacticalDepth?: number;
  maxJointPlansPerSide?: number;
  maxIndividualActionsPerActor?: number;
};

const DEFAULT_SOLVER_MODE: TeamPreviewSolverMode = "sparse";
const DEFAULT_TIME_BUDGET_MS = 250;
const DEFAULT_ALLY_FOUR_CANDIDATES = 3;
const DEFAULT_ENEMY_FOUR_CANDIDATES = 4;
const DEFAULT_MAX_THREAT_LINES = 4;
const DEFAULT_MAX_LEADS_PER_FOUR = 2;
const DEFAULT_REFINEMENT_MARGIN = 1_600;
const DEFAULT_MAX_CANDIDATES = 8;
const DEFAULT_TACTICAL_DEPTH = 2;
const DEFAULT_MAX_JOINT_PLANS = 6;
const DEFAULT_MAX_INDIVIDUAL_ACTIONS = 4;

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

const WEATHER_SETTER_ABILITIES: Record<PreviewWeather, string[]> = {
  rain: ["drizzle"],
  sun: ["drought"],
  sand: ["sandstream"],
  snow: ["snowwarning"],
};

const WEATHER_ABUSER_ABILITIES: Record<PreviewWeather, string[]> = {
  rain: ["swiftswim", "raindish", "hydration"],
  sun: ["chlorophyll", "solarpower"],
  sand: ["sandrush", "sandforce", "sandveil"],
  snow: ["slushrush", "icebody", "snowcloak"],
};

const STAT_DROP_PUNISH_ABILITIES = new Set([
  "defiant",
  "competitive",
  "contrary",
  "mirrorarmor",
]);

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
  priority_value: "Priority cleanup value",
  utility_value: "Support utility",
  lead_pair_pressure: "Lead pair opening pressure",
  lead_pair_synergy: "Lead pair synergy",
  flexibility_value: "Flexible lead options",
  redundancy_penalty: "Redundancy penalty",
  weakness_overlap_penalty: "Shared weakness penalty",
  stat_drop_punish_risk: "Stat-drop punish risk",
  anti_speed_synergy: "Speed-mode conflict",
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
  };
}

function mergeSearchDiagnostics(target: TeamPreviewDiagnostics, source: SearchDiagnostics) {
  target.searchNodes += source.searchNodes;
  target.resolveTurnCalls += source.resolveTurnCalls;
  target.generatedJointPlans += source.generatedJointPlans;
  target.planPairEvaluations += source.planPairEvaluations;
}

function createReferenceState(options: TeamPreviewOptions) {
  const ally = options.ally.map((member, index) => ({
    ...member,
    isActive: index < 2,
  }));
  const enemy = options.enemy.map((member, index) => ({
    ...member,
    isActive: index < 2,
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
  });
}

function getRoleTags(combatant: BattleCombatantState) {
  const tags = new Set<PreviewRoleTag>();
  const abilityKey = normalizeKey(combatant.abilityName ?? combatant.abilityId);

  if (abilityKey === "intimidate") {
    tags.add("intimidate");
    tags.add("statDropPressure");
  }
  if (STAT_DROP_PUNISH_ABILITIES.has(abilityKey)) {
    tags.add("statDropPunisher");
  }

  for (const [weather, abilities] of Object.entries(WEATHER_SETTER_ABILITIES) as Array<[PreviewWeather, string[]]>) {
    if (abilities.includes(abilityKey)) {
      tags.add(
        weather === "rain"
          ? "weatherRain"
          : weather === "sun"
            ? "weatherSun"
            : weather === "sand"
              ? "weatherSand"
              : "weatherSnow",
      );
    }
  }

  for (const [weather, abilities] of Object.entries(WEATHER_ABUSER_ABILITIES) as Array<[PreviewWeather, string[]]>) {
    if (abilities.includes(abilityKey)) {
      tags.add(
        weather === "rain"
          ? "weatherRainAbuser"
          : weather === "sun"
            ? "weatherSunAbuser"
            : weather === "sand"
              ? "weatherSandAbuser"
              : "weatherSnowAbuser",
      );
    }
  }

  for (const move of combatant.knownMoves) {
    for (const roleTag of getMoveRoleTags(move)) {
      tags.add(roleTag as PreviewRoleTag);
    }
  }

  return tags;
}

function buildMeta(state: BattleState, members: BattleStateMemberInput[]) {
  return members
    .map<PreviewCombatantMeta | null>((member) => {
      const combatant = state.combatants[member.id];
      if (!combatant) {
        return null;
      }

      const primaryType = getTypeFromLabel(combatant.pokemon.types[0]) ?? null;
      const secondaryType = getTypeFromLabel(combatant.pokemon.types[1] ?? "") ?? null;
      const speed = getEffectiveSpeed(state, combatant.id);
      const bulkyScore =
        combatant.maxHp *
        ((combatant.pokemon.baseStats.def + combatant.pokemon.baseStats.spd) / 2);
      const roleTags = getRoleTags(combatant);

      if (speed <= 95 && combatant.knownMoves.some((move) => move.category !== null)) {
        roleTags.add("slowBreaker");
      }
      if (speed >= 140 && combatant.knownMoves.some((move) => move.category !== null)) {
        roleTags.add("fastPressure");
      }

      return {
        member,
        combatant,
        roleTags,
        abilityKey: normalizeKey(combatant.abilityName ?? combatant.abilityId),
        speed,
        damagingMoves: combatant.knownMoves.filter((move) => move.category !== null),
        primaryType,
        secondaryType,
        bulkyScore,
      } satisfies PreviewCombatantMeta;
    })
    .filter((entry): entry is PreviewCombatantMeta => Boolean(entry));
}

function getBestDamageSnapshot(state: BattleState, attacker: PreviewCombatantMeta, defender: PreviewCombatantMeta) {
  return attacker.damagingMoves.reduce<PreviewDamageSnapshot>(
    (best, move) => {
      const preview = getDamagePreview(state, attacker.combatant.id, defender.combatant.id, move);
      if (!preview) {
        return best;
      }

      if (preview.estimate.averagePercent > best.averagePercent) {
        return {
          averagePercent: preview.estimate.averagePercent,
          maxPercent: preview.estimate.maxPercent,
          move,
        };
      }

      if (
        preview.estimate.averagePercent === best.averagePercent &&
        preview.estimate.maxPercent > best.maxPercent
      ) {
        return {
          averagePercent: preview.estimate.averagePercent,
          maxPercent: preview.estimate.maxPercent,
          move,
        };
      }

      return best;
    },
    { averagePercent: 0, maxPercent: 0, move: null },
  );
}

function buildDamageMatrix(
  state: BattleState,
  attackers: PreviewCombatantMeta[],
  defenders: PreviewCombatantMeta[],
) {
  const matrix = new Map<string, PreviewDamageSnapshot>();

  for (const attacker of attackers) {
    for (const defender of defenders) {
      matrix.set(
        `${attacker.combatant.id}->${defender.combatant.id}`,
        getBestDamageSnapshot(state, attacker, defender),
      );
    }
  }

  return matrix;
}

function getMatrixEntry(
  matrix: Map<string, PreviewDamageSnapshot>,
  attackerId: string,
  defenderId: string,
) {
  return matrix.get(`${attackerId}->${defenderId}`) ?? { averagePercent: 0, maxPercent: 0, move: null };
}

function buildThreatProfile(team: PreviewCombatantMeta[]) {
  const damagingMoves = team.flatMap((meta) => meta.damagingMoves);
  const damageWeight = Math.max(
    1,
    damagingMoves.reduce((sum, move) => sum + Math.max(1, move.basePower ?? 0), 0),
  );

  const physicalWeight = damagingMoves
    .filter((move) => move.category === "physical")
    .reduce((sum, move) => sum + Math.max(1, move.basePower ?? 0), 0);
  const specialWeight = damagingMoves
    .filter((move) => move.category === "special")
    .reduce((sum, move) => sum + Math.max(1, move.basePower ?? 0), 0);
  const spreadWeight = damagingMoves
    .filter((move) => move.isSpreadMove)
    .reduce((sum, move) => sum + Math.max(1, move.basePower ?? 0), 0);
  const priorityMoves = damagingMoves.filter((move) => move.priority > 0).length;

  const weatherStrength = {
    rain: 0,
    sun: 0,
    sand: 0,
    snow: 0,
  };

  for (const meta of team) {
    if (meta.roleTags.has("weatherRain")) {
      weatherStrength.rain += 0.7;
    }
    if (meta.roleTags.has("weatherRainAbuser")) {
      weatherStrength.rain += 0.5;
    }
    if (meta.roleTags.has("weatherSun")) {
      weatherStrength.sun += 0.7;
    }
    if (meta.roleTags.has("weatherSunAbuser")) {
      weatherStrength.sun += 0.5;
    }
    if (meta.roleTags.has("weatherSand")) {
      weatherStrength.sand += 0.7;
    }
    if (meta.roleTags.has("weatherSandAbuser")) {
      weatherStrength.sand += 0.5;
    }
    if (meta.roleTags.has("weatherSnow")) {
      weatherStrength.snow += 0.7;
    }
    if (meta.roleTags.has("weatherSnowAbuser")) {
      weatherStrength.snow += 0.5;
    }
  }

  return {
    physicalShare: physicalWeight / damageWeight,
    specialShare: specialWeight / damageWeight,
    spreadShare: spreadWeight / damageWeight,
    singleTargetShare: clamp(1 - spreadWeight / damageWeight, 0, 1),
    priorityShare: damagingMoves.length > 0 ? priorityMoves / damagingMoves.length : 0,
    tailwindModeStrength: clamp(
      team.reduce(
        (sum, meta) =>
          sum +
          (meta.roleTags.has("tailwind") ? 0.8 : 0) +
          (meta.roleTags.has("speedControl") ? 0.25 : 0) +
          (meta.roleTags.has("fastPressure") ? 0.2 : 0),
        0,
      ) / Math.max(1, team.length),
      0,
      1,
    ),
    trickRoomModeStrength: clamp(
      team.reduce(
        (sum, meta) =>
          sum +
          (meta.roleTags.has("trickRoom") ? 0.9 : 0) +
          (meta.roleTags.has("slowBreaker") ? 0.3 : 0),
        0,
      ) / Math.max(1, team.length),
      0,
      1,
    ),
    weatherStrength: {
      rain: clamp(weatherStrength.rain / Math.max(1, team.length), 0, 1),
      sun: clamp(weatherStrength.sun / Math.max(1, team.length), 0, 1),
      sand: clamp(weatherStrength.sand / Math.max(1, team.length), 0, 1),
      snow: clamp(weatherStrength.snow / Math.max(1, team.length), 0, 1),
    },
    statDropPunisherRisk: clamp(
      team.filter((meta) => meta.roleTags.has("statDropPunisher")).length / Math.max(1, team.length),
      0,
      1,
    ),
  } satisfies PreviewThreatProfile;
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

function hasWeatherSetter(meta: PreviewCombatantMeta, weather: PreviewWeather) {
  return (
    (weather === "rain" && meta.roleTags.has("weatherRain")) ||
    (weather === "sun" && meta.roleTags.has("weatherSun")) ||
    (weather === "sand" && meta.roleTags.has("weatherSand")) ||
    (weather === "snow" && meta.roleTags.has("weatherSnow"))
  );
}

function hasWeatherAbuser(meta: PreviewCombatantMeta, weather: PreviewWeather) {
  return (
    (weather === "rain" && meta.roleTags.has("weatherRainAbuser")) ||
    (weather === "sun" && meta.roleTags.has("weatherSunAbuser")) ||
    (weather === "sand" && meta.roleTags.has("weatherSandAbuser")) ||
    (weather === "snow" && meta.roleTags.has("weatherSnowAbuser"))
  );
}

function getWeakTypes(meta: PreviewCombatantMeta) {
  const primaryType = meta.primaryType;
  const secondaryType = meta.secondaryType;

  if (!primaryType) {
    return [] as PokemonType[];
  }

  return (["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"] as PokemonType[])
    .filter((attackType) => getMultiplier(attackType, primaryType, secondaryType) > 1);
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
  const chosenProfile = buildThreatProfile(chosen);
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
    (count, weather) => count + chosen.filter((meta) => hasWeatherSetter(meta, weather as PreviewWeather)).length,
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
    return {
      robustScore: entry.cheapRobustScore,
      averageScore: entry.cheapAverageScore,
      previewValue: sigmoid(entry.cheapRobustScore / 14_000),
    } satisfies MatrixSummary;
  }

  const scores = threatLines.map((threat) => {
    const refineCell = refineCells.get(`${PREVIEW_REFINE_PROFILE.key}::${entry.candidate.strategy.key}__${threat.candidate.strategy.key}`);
    if (refineCell) {
      return refineCell.score;
    }
    return fastCells.get(`${PREVIEW_FAST_PROFILE.key}::${entry.candidate.strategy.key}__${threat.candidate.strategy.key}`)?.score ?? Number.NEGATIVE_INFINITY;
  });

  const robustScore = Math.min(...scores);
  const averageScore = scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length);
  return {
    robustScore,
    averageScore,
    previewValue: sigmoid(robustScore / 14_000),
  } satisfies MatrixSummary;
}

function rankCandidatesAgainstThreats(
  allyCandidates: PreviewStrategyCandidate[],
  threatLines: PreviewThreatLine[],
  fastCells: Map<string, TacticalCellEvaluation>,
  refineCells: Map<string, TacticalCellEvaluation>,
) {
  return allyCandidates
    .map((entry) => ({
      entry,
      summary: summarizeCandidateAgainstThreats(entry, threatLines, fastCells, refineCells),
    }))
    .sort((left, right) => {
      if (left.summary.robustScore !== right.summary.robustScore) {
        return right.summary.robustScore - left.summary.robustScore;
      }
      return right.summary.averageScore - left.summary.averageScore;
    });
}

function areTopCandidatesClose(rows: RankedPreviewStrategy[], refinementMargin: number) {
  if (rows.length < 2) {
    return false;
  }
  return rows[0].summary.robustScore - rows[1].summary.robustScore <= refinementMargin;
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

function buildRecommendationFromRows(
  rows: RankedPreviewStrategy[],
  allyMetas: PreviewCombatantMeta[],
  enemyProfile: PreviewThreatProfile,
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
      averageScore: entry.summary.averageScore,
      previewValue: entry.summary.previewValue,
    }));

  return {
    bestFour: best.entry.candidate.strategy.four,
    primaryLead: best.entry.candidate.strategy.lead,
    altLead,
    previewValue: best.summary.previewValue,
    robustScore: best.summary.robustScore,
    averageScore: best.summary.averageScore,
    reasons: buildReasons(best.entry.candidate.breakdown),
    dangerNotes: getDangerNotes(best.entry.candidate, allyMetas, enemyProfile),
    alternatives,
    candidateCounts,
    diagnostics,
  } satisfies TeamPreviewRecommendation;
}

function recommendTeamPreviewDense(
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
  const diagnostics = createPreviewDiagnostics("dense", options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const start = nowMs();

  const allyStrategies = enumerateStrategies(allyMetas);
  const enemyStrategies = enumerateStrategies(enemyMetas);

  const coarseStarted = nowMs();
  const allyRanked = allyStrategies
    .map((strategy) =>
      scoreStrategy(
        strategy,
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

  const enemyRanked = enemyStrategies
    .map((strategy) =>
      scoreStrategy(
        strategy,
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
  diagnostics.coarseStageMs = nowMs() - coarseStarted;

  const allyCandidates = allyRanked.slice(0, options.maxCandidatesPerSide ?? DEFAULT_MAX_CANDIDATES);
  const enemyCandidates = enemyRanked.slice(0, options.maxCandidatesPerSide ?? DEFAULT_MAX_CANDIDATES);
  const fastCells = new Map<string, TacticalCellEvaluation>();
  const tacticalStarted = nowMs();
  const denseProfile = {
    key: "preview-dense",
    depth: options.tacticalDepth ?? DEFAULT_TACTICAL_DEPTH,
    maxJointPlansPerSide: options.maxJointPlansPerSide ?? DEFAULT_MAX_JOINT_PLANS,
    maxIndividualActionsPerActor: options.maxIndividualActionsPerActor ?? DEFAULT_MAX_INDIVIDUAL_ACTIONS,
    branchModel: "full" as const,
  };

  for (const allyCandidate of allyCandidates) {
    for (const enemyCandidate of enemyCandidates) {
      evaluateTacticalCell(
        options.ally,
        options.enemy,
        allyCandidate.strategy,
        enemyCandidate.strategy,
        options,
        denseProfile,
        fastCells,
        diagnostics,
      );
    }
  }
  diagnostics.tacticalStageMs = nowMs() - tacticalStarted;
  diagnostics.threatLineCount = enemyCandidates.length;
  diagnostics.elapsedMs = nowMs() - start;

  const rows: RankedPreviewStrategy[] = allyCandidates
    .map((candidate) => ({
      entry: {
        candidate,
        sourceFour: {
          choice: { key: `dense:${candidate.strategy.four.join(",")}`, four: candidate.strategy.four },
          coarseScore: candidate.coarseScore,
          breakdown: cloneBreakdown(candidate.breakdown),
          members: allyMetas.filter((meta) => candidate.strategy.four.includes(meta.member.teamIndex)),
          profile: allyProfile,
        },
        cheapRobustScore: candidate.coarseScore,
        cheapAverageScore: candidate.coarseScore,
      },
      summary: {
        robustScore: Math.min(
          ...enemyCandidates.map(
            (enemyCandidate) =>
              fastCells.get(`${denseProfile.key}::${candidate.strategy.key}__${enemyCandidate.strategy.key}`)?.score ??
              Number.NEGATIVE_INFINITY,
          ),
        ),
        averageScore:
          enemyCandidates.reduce(
            (sum, enemyCandidate) =>
              sum +
              (fastCells.get(`${denseProfile.key}::${candidate.strategy.key}__${enemyCandidate.strategy.key}`)?.score ??
                Number.NEGATIVE_INFINITY),
            0,
          ) / Math.max(1, enemyCandidates.length),
        previewValue: 0,
      },
    }))
    .map((row) => ({
      ...row,
      summary: {
        ...row.summary,
        previewValue: sigmoid(row.summary.robustScore / 14_000),
      },
    }))
    .sort((left, right) => {
      if (left.summary.robustScore !== right.summary.robustScore) {
        return right.summary.robustScore - left.summary.robustScore;
      }
      return right.summary.averageScore - left.summary.averageScore;
    });

  return buildRecommendationFromRows(rows, allyMetas, enemyProfile, {
    allyStrategies: allyStrategies.length,
    enemyStrategies: enemyStrategies.length,
    allyCandidates: allyCandidates.length,
    enemyCandidates: enemyCandidates.length,
    allyFourCandidates: allyCandidates.length,
    enemyFourCandidates: enemyCandidates.length,
    threatLines: enemyCandidates.length,
    matrixCells: diagnostics.verifiedCells,
  }, diagnostics);
}

function recommendTeamPreviewSparse(
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
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const diagnostics = createPreviewDiagnostics("sparse", timeBudgetMs);
  const startedAt = nowMs();
  const deadline = startedAt + timeBudgetMs;
  const allyMetaByIndex = getMetaByTeamIndex(allyMetas);
  const enemyMetaByIndex = getMetaByTeamIndex(enemyMetas);

  const allyStrategies = enumerateStrategies(allyMetas);
  const enemyStrategies = enumerateStrategies(enemyMetas);
  const allyFourChoices = enumerateFourChoices(allyMetas);
  const enemyFourChoices = enumerateFourChoices(enemyMetas);

  const coarseStarted = nowMs();
  const rankedAllyFours = allyFourChoices
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
  diagnostics.coarseStageMs = nowMs() - coarseStarted;

  const allyFourBeam = rankedAllyFours.slice(0, options.allyFourCandidates ?? DEFAULT_ALLY_FOUR_CANDIDATES);
  const enemyFourBeam = rankedEnemyFours.slice(0, options.enemyFourCandidates ?? DEFAULT_ENEMY_FOUR_CANDIDATES);
  const maxLeadsPerFour = options.maxLeadsPerFour ?? DEFAULT_MAX_LEADS_PER_FOUR;
  const maxThreatLines = options.maxThreatLines ?? DEFAULT_MAX_THREAT_LINES;

  const rawThreatLines = enemyFourBeam.flatMap((sourceFour) =>
    rankLeadStrategies(
      sourceFour,
      enemyMetas,
      allyMetas,
      referenceState,
      enemyOutgoingMatrix,
      enemyIncomingMatrix,
      enemyProfile,
      allyProfile,
    )
      .slice(0, maxLeadsPerFour)
      .map((candidate) => ({
        candidate,
        sourceFour,
        threatScore: candidate.coarseScore,
        vector: buildThreatVector(candidate, sourceFour, enemyMetaByIndex),
      })),
  );
  const threatLines = selectDiverseThreatLines(rawThreatLines, maxThreatLines);

  const allyCandidates = allyFourBeam
    .flatMap((sourceFour) =>
      rankLeadStrategies(
        sourceFour,
        allyMetas,
        enemyMetas,
        referenceState,
        allyOutgoingMatrix,
        allyIncomingMatrix,
        allyProfile,
        enemyProfile,
      )
        .map((candidate) => {
          const entry = {
            candidate,
            sourceFour,
            cheapRobustScore: candidate.coarseScore,
            cheapAverageScore: candidate.coarseScore,
          } satisfies PreviewStrategyCandidate;
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
          const cheapRobustScore = cheapScores.length > 0 ? Math.min(...cheapScores) : candidate.coarseScore;
          const cheapAverageScore =
            cheapScores.length > 0
              ? cheapScores.reduce((sum, score) => sum + score, 0) / cheapScores.length
              : candidate.coarseScore;
          return {
            candidate: {
              ...candidate,
              coarseScore: candidate.coarseScore * 0.45 + cheapRobustScore * 0.4 + cheapAverageScore * 0.15,
            },
            sourceFour,
            cheapRobustScore,
            cheapAverageScore,
          } satisfies PreviewStrategyCandidate;
        })
        .sort((left, right) => right.candidate.coarseScore - left.candidate.coarseScore)
        .slice(0, maxLeadsPerFour),
    )
    .sort((left, right) => right.candidate.coarseScore - left.candidate.coarseScore);

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

  let rankedRows = rankCandidatesAgainstThreats(allyCandidates, activeThreats, fastCells, refineCells);
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
      areTopCandidatesClose(rankedRows, refinementMargin) ||
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
    rankedRows = rankCandidatesAgainstThreats(allyCandidates, activeThreats, fastCells, refineCells);
  }

  if (nowMs() <= deadline && areTopCandidatesClose(rankedRows, refinementMargin) && activeThreats.length > 0) {
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
    rankedRows = rankCandidatesAgainstThreats(allyCandidates, activeThreats, fastCells, refineCells);
  }

  diagnostics.tacticalStageMs = nowMs() - tacticalStarted;
  diagnostics.threatLineCount = activeThreats.length;
  diagnostics.elapsedMs = nowMs() - startedAt;

  return buildRecommendationFromRows(rankedRows, allyMetas, enemyProfile, {
    allyStrategies: allyStrategies.length,
    enemyStrategies: enemyStrategies.length,
    allyCandidates: allyCandidates.length,
    enemyCandidates: activeThreats.length,
    allyFourCandidates: allyFourBeam.length,
    enemyFourCandidates: enemyFourBeam.length,
    threatLines: threatLines.length,
    matrixCells: diagnostics.verifiedCells,
  }, diagnostics);
}

export function recommendTeamPreview(options: TeamPreviewOptions): TeamPreviewRecommendation | null {
  if (options.ally.length < 4 || options.enemy.length < 4) {
    return null;
  }

  const referenceState = createReferenceState(options);
  const allyMetas = buildMeta(referenceState, options.ally);
  const enemyMetas = buildMeta(referenceState, options.enemy);

  if (allyMetas.length < 4 || enemyMetas.length < 4) {
    return null;
  }

  const allyProfile = buildThreatProfile(allyMetas);
  const enemyProfile = buildThreatProfile(enemyMetas);
  const allyOutgoingMatrix = buildDamageMatrix(referenceState, allyMetas, enemyMetas);
  const allyIncomingMatrix = buildDamageMatrix(referenceState, enemyMetas, allyMetas);
  const enemyOutgoingMatrix = buildDamageMatrix(referenceState, enemyMetas, allyMetas);
  const enemyIncomingMatrix = buildDamageMatrix(referenceState, allyMetas, enemyMetas);

  const solverMode = options.solverMode ?? DEFAULT_SOLVER_MODE;
  if (solverMode === "dense") {
    return recommendTeamPreviewDense(
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
  }

  return recommendTeamPreviewSparse(
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
}
