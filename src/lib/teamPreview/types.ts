import type { PokemonType } from "../../data/typeChart";
import type { BattleCombatantState, BattleMoveOption, BattleStateMemberInput } from "../engine";
import type { BelievedMove } from "../engine/beliefs";

export type PreviewRoleTag =
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

export type PreviewWeather = "rain" | "sun" | "sand" | "snow";

export type TeamPreviewObjectiveMode = "robust" | "likely" | "hybrid";

export type PreviewDamageSnapshot = {
  averagePercent: number;
  maxPercent: number;
  move: BattleMoveOption | null;
};

export type PreviewSupportFlags = {
  priority: number;
  fakeOut: number;
  tailwind: number;
  trickRoom: number;
  speedControl: number;
  redirection: number;
  wideGuard: number;
  quickGuard: number;
  taunt: number;
  encore: number;
  disable: number;
  helpingHand: number;
  weatherSetting: number;
  weatherAbuse: number;
  setup: number;
  healing: number;
  status: number;
};

export type PreviewMoveBelief = BelievedMove & {
  roleTags: PreviewRoleTag[];
  stab: boolean;
  weightedPower: number;
};

export type PreviewCombatantMeta = {
  member: BattleStateMemberInput;
  combatant: BattleCombatantState;
  roleTags: Set<PreviewRoleTag>;
  roleConfidence: Partial<Record<PreviewRoleTag, number>>;
  supportFlags: PreviewSupportFlags;
  abilityKey: string;
  itemKey: string;
  speed: number;
  believedMoves: PreviewMoveBelief[];
  damagingBeliefs: PreviewMoveBelief[];
  damagingMoves: BattleMoveOption[];
  likelyAttackTypes: Array<{ type: PokemonType; weight: number; stabWeight: number }>;
  offensiveLean: "physical" | "special" | "mixed" | "support";
  primaryType: PokemonType | null;
  secondaryType: PokemonType | null;
  bulkyScore: number;
};

export type PreviewThreatProfile = {
  physicalShare: number;
  specialShare: number;
  spreadShare: number;
  singleTargetShare: number;
  priorityShare: number;
  tailwindModeStrength: number;
  trickRoomModeStrength: number;
  weatherStrength: Record<PreviewWeather, number>;
  statDropPressure: number;
  statDropPunisherRisk: number;
};

export type EnemyThreat = {
  id: string;
  label: string;
  kind: "single" | "package";
  memberTeamIndices: number[];
  modeTags: string[];
  importance: number;
  offensivePressure: number;
  speedPressure: number;
  removalDifficulty: number;
  disruptionValue: number;
  modeAnchorValue: number;
  packageCoherence: number;
  antiUsMatchupValue: number;
  likelyBringContribution: number;
  likelyLeadContribution: number;
  explanationTags: string[];
};

export type AnswerClass = "hard" | "soft" | "emergency" | "none";

export type AnswerScore = {
  allyTeamIndex: number;
  threatId: string;
  classification: AnswerClass;
  total: number;
  damagePressure: number;
  survival: number;
  speedControl: number;
  boardSafety: number;
  supportDenial: number;
  confidencePenalty: number;
  guaranteedOhko: boolean;
  possibleOhko: boolean;
  strongTwoHko: boolean;
  meaningfulChip: boolean;
  survivesLikelyHit: boolean | null;
  likelyReturnDamage: number;
  reasons: string[];
};

export type PredictedEnemyLead = {
  lead: [number, number];
  probability: number;
  score: number;
  reasons: string[];
  threatIds: string[];
};

export type PredictedEnemyFour = {
  four: number[];
  probability: number;
  score: number;
  reasons: string[];
  leads: PredictedEnemyLead[];
  lead?: [number, number] | null;
};

export type MustAnswerThreatExplanation = {
  threatId: string;
  label: string;
  importance: number;
  likelyBringWeight: number;
  recommendedAnswerSlots: number[];
  note: string;
};

export type UncoveredThreatExplanation = {
  threatId: string;
  label: string;
  severity: number;
  note: string;
};

export type CoverageSummaryEntry = {
  enemyLabel: string;
  hardAnswers: number[];
  softAnswers: number[];
  emergencyAnswers: number[];
};

export type FourCoverageEvaluation = {
  totalScore: number;
  uncoveredPenalty: number;
  overloadPenalty: number;
  secondaryCoverageBonus: number;
  packageDenialBonus: number;
  leadAlignmentBase: number;
  mustAnswerThreats: MustAnswerThreatExplanation[];
  uncoveredThreats: UncoveredThreatExplanation[];
  coverageSummary: CoverageSummaryEntry[];
  uniqueAnswerSlots: number[];
};

export type LeadAlignmentEvaluation = {
  score: number;
  reasons: string[];
};

export type PreviewObjectiveBreakdown = {
  robustScore: number;
  likelyScore: number;
  hybridScore: number;
};
