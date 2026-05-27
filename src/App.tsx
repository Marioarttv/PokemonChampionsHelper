import {
  memo,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import {
  POKEMON_CHAMPIONS_ACTIVE_REGULATION,
  POKEMON_CHAMPIONS_ACTIVE_REGULATION_WINDOW,
  POKEMON_CHAMPIONS_LEGAL_LIST_SOURCED_AT,
  POKEMON_CHAMPIONS_LEGAL_SPECIES_NAMES,
  POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET,
  normalizePokemonNameKey,
} from "./data/championsLegalPokemon";
import {
  TYPE_META,
  TYPE_ORDER,
  getTypeFromLabel,
  getTypeIconUrl,
  type PokemonType,
} from "./data/typeChart";
import {
  bucketAttackEntries,
  bucketDefenseEntries,
  getCoveredDefendingTypes,
  getDefenseEntries,
  formatMultiplier,
  getMultiplier,
  getTypeLabel,
} from "./lib/effectiveness";
import {
  getPokemonBaseSpriteUrl,
  getPokemonSpriteUrl,
  loadPokemonDatabase,
  type PokemonRecord,
} from "./lib/pokemonDb";
import {
  getOpponentPreset,
  getOpponentPresetMoveNames,
  OPPONENT_PRESET_RECORDS,
  OPPONENT_MOVE_PRESET_KEY_SET,
  type OpponentPresetRecord,
} from "./lib/opponentMovePresets";
import {
  getMoveMultihit,
  getMovePokemonType,
  isSpreadTarget,
  loadBattleData,
  type AbilityRecord,
  type ItemRecord,
  type MoveRecord,
} from "./lib/battleData";
import {
  loadChampionsLearnsets,
  type ChampionsLearnsetRecord,
} from "./lib/championsLearnsets";
import {
  isChampionsPlayableBaseForm,
  isChampionsSuppressedBaseForm,
} from "./lib/championsPlayableForms";
import {
  SPREAD_MOVE_MULTIPLIER,
  calculateRoughDamage,
  getEffectiveDamageBaseStats,
  getStatStageMultiplier,
  isLowKickMove,
  type DamageCategory,
  type DamageTerrain,
  type DamageWeather,
} from "./lib/damage";
import {
  CHAMPIONS_MAX_STAT_POINTS_PER_STAT,
  CHAMPIONS_STAT_LABELS,
  CHAMPIONS_STAT_ORDER,
  CHAMPIONS_TOTAL_STAT_POINTS,
  formatChampionsTemplateSummary,
  getChampionsNatureLabel,
  getChampionsNatureOptions,
  getChampionsComputedStats,
  getDefaultChampionsStatSpreadForPokemon,
  getTotalChampionsStatPoints,
  normalizeChampionsStatSpread,
  type ChampionsNatureId,
  type ChampionsStatId,
  type ChampionsStatSpread,
} from "./lib/championsStats";
import {
  getDamageAbilityDescription,
  getDamageAbilityOptions,
  getDefaultDamageAbilityId,
  getDefaultDamageAbilityIdFromNames,
  getPokemonAbilityNames,
  type DamageAbilityId,
} from "./lib/damageAbilities";
import {
  getDamageItemDescription,
  getDamageItemOptions,
  normalizeDamageItemId,
  type DamageItemId,
} from "./lib/damageItems";
import {
  evaluateTrainingBaseline,
  findOptimalTrainingSpreads,
  getKoThresholdLabel,
  getTrainingAttackBreakpointGains,
  getTrainingBreakpointGains,
  type TrainingOptimizerBreakpointGain,
  type TrainingOptimizerAttack,
  type TrainingOptimizerResult,
  type TrainingOptimizerSummary,
  type TrainingOptimizerThreatDetail,
  type TrainingRemainderMode,
} from "./lib/statOptimizer";
import {
  createBattleState,
  getEffectiveSpeed,
  recommendBestPlan,
  resolveTurn,
  type BattleAction,
  type BattleCombatantState,
  type BattleMoveOption,
  type BattleSide,
  type BattleState,
  type BattleStatusCondition,
  type BattleStateMemberInput,
  type JointActionPlan,
  type ObjectiveMode,
  type PlannedAction,
  type SearchPlanScore,
  type SearchMode,
  type SearchRecommendation,
  type TurnEvent,
} from "./lib/engine";
import { buildBattleEngineInputSignature } from "./lib/engine/signature";
import {
  buildAllyBattleStateMember,
  buildEnemyBattleStateMember,
  buildPreviewEnemyBattleStateMember,
  resolveStoredOrPresetMoveset,
} from "./lib/engine/adapters/fromUiState";
import {
  calculateMatchupEloScore,
  compareMatchupEloSummaries,
  summarizeMatchupElo,
  type MatchupEloSummary,
} from "./lib/matchupElo";
import {
  recommendTeamPreview,
  type TeamPreviewRecommendation,
} from "./lib/teamPreview";
import {
  rememberBringSelectionSlot,
  resolveBringSelection,
  resolveKnownBring,
  toggleBringSelection,
  type BringSelectionMode,
} from "./lib/bringSelection";
import {
  deleteSavedTeam,
  listSavedTeams,
  saveTeam,
  type PersistedKnownMove,
  type PersistedMoveMultihit,
  type PersistedOpenerSelection,
  type PersistedSavedAttack,
  type PersistedTeam,
  type PersistedTeamSlot,
} from "./lib/savedTeams";
import {
  deleteMatchHistoryEntry,
  listMatchHistoryEntries,
  saveMatchHistoryEntry,
  type MatchResult,
  type PersistedMatchHistoryEntry,
} from "./lib/matchHistory";
import { getLoadedOpponentEntries } from "./lib/opponentRoster";
import {
  deleteSpeciesMoveset,
  listSpeciesMovesets,
  saveSpeciesMoveset,
  type PersistedSpeciesMoveset,
} from "./lib/speciesMovesets";
import { importShowdownTeamText } from "./lib/showdownTeamImport";
import {
  showdownSnapshotToBattleInput,
  type ShowdownBridgeImportResult,
  type ShowdownBridgeSnapshot,
} from "./lib/showdownBridge";
import { exportShowdownTeamText } from "./lib/showdownTeamExport";
import BattleArenaPage from "./BattleArenaPage";
import BattleIntelPage, { type BattleIntelSlotInput } from "./BattleIntelPage";

type SiteMode =
  | "calculator"
  | "team"
  | "battle"
  | "movesets"
  | "moveFinder"
  | "speed"
  | "ohko"
  | "training"
  | "history"
  | "settings";
type CalculatorMode = "defense" | "attack";
type MatchHistoryTeamSort = "latest" | "name" | "matches" | "winRate";
type SpeedTierSort = "boosted" | "neutral" | "base" | "name";
type MoveFinderSpeedMetric = "base" | "neutral" | "boosted";
type MoveFinderSpeedComparator = "any" | "atLeast" | "atMost";
type ShowdownBridgeStatus = "idle" | "ready" | "installed" | "waiting" | "error";
type HiddenFeatureId =
  | "typeCalculator"
  | "teamBuilder"
  | "battleArena"
  | "battleIntel"
  | "movesets"
  | "moveFinder"
  | "speedTiers"
  | "ohkoFinder"
  | "trainingOptimizer"
  | "matchHistory"
  | "teamPreview"
  | "battleEngine";
type FeatureVisibilitySettings = Record<HiddenFeatureId, boolean>;
type FeatureDefinition = {
  id: HiddenFeatureId;
  label: string;
  description: string;
  group: "Main pages" | "Team Builder tools";
};

type TypePoolProps = {
  selectedTypes: PokemonType[];
  onToggle: (type: PokemonType) => void;
  onClear: () => void;
  mode: CalculatorMode;
};

type MatchupGroupProps = {
  label: string;
  multiplier: string;
  tone: "danger" | "warn" | "neutral" | "good" | "great" | "muted";
  entries: PokemonType[];
  compact?: boolean;
};

type TeamSlotState = {
  query: string;
  pokemonId: string | null;
  activeFormPokemonId: string | null;
  itemName: string | null;
  statSpread: ChampionsStatSpread | null;
  knownMoves: PersistedKnownMove[];
  savedAttacks: PersistedSavedAttack[];
};
type TeamFormOption = {
  pokemon: PokemonRecord;
  activeFormPokemonId: string | null;
  label: string;
  isBase: boolean;
};
type LoadedTeamSlot = TeamSlotState & {
  pokemon: PokemonRecord | null;
  basePokemon: PokemonRecord | null;
  formOptions: TeamFormOption[];
  abilityName: string | null;
  defaultStatSpread: ChampionsStatSpread | null;
  resolvedStatSpread: ChampionsStatSpread | null;
};

type TeamMatrixMode = "defense" | "offense";
type DamageCalcMode = "attack" | "defend";
type TeamBuilderFormat = "all" | "regulationMA";
type LeadSummary = {
  slotIndex: number;
  pokemon: PokemonRecord;
  weakTypes: PokemonType[];
  resistTypes: PokemonType[];
  immuneTypes: PokemonType[];
  coverTypes: PokemonType[];
  attackTypes: PokemonType[];
};
type DamageMoveConfig = {
  power: string;
  category: DamageCategory;
  isSpreadMove: boolean;
};
type ManualDamageMoveConfig = DamageMoveConfig & {
  attackType: PokemonType;
};
type EnemyStatSpreadOverrideMap = Record<string, ChampionsStatSpread>;
type OpponentRosterEntry = {
  slotIndex: number;
  query: string;
  pokemon: PokemonRecord | null;
  savedAttacks: PersistedSavedAttack[];
  knownMoves: PersistedKnownMove[];
  presetMoveNames: string[];
  abilityName: string | null;
  itemName: string | null;
  defaultStatSpread: ChampionsStatSpread | null;
  statSpread: ChampionsStatSpread | null;
  movesetSource: "custom" | "preset" | "none";
};
type LoadedOpponentEntry = Omit<OpponentRosterEntry, "pokemon"> & {
  pokemon: PokemonRecord;
};
type StoredMovesetSource = "custom" | "preset" | "none";
type ResolvedSpeciesMoveset = {
  savedAttacks: PersistedSavedAttack[];
  knownMoves: PersistedKnownMove[];
  allMoveNames: string[];
  abilityName: string | null;
  itemName: string | null;
  statSpread: ChampionsStatSpread | null;
  movesetSource: StoredMovesetSource;
};
type SpeedTierRow = {
  pokemon: PokemonRecord;
  baseSpeed: number;
  maxSpeed: number;
  boostedSpeed: number;
};
type MoveLearnerRow = {
  pokemon: PokemonRecord;
  abilityNames: string[];
  speed: SpeedTierRow;
  learnsetMoveCount: number;
  presetHasMove: boolean;
};
type OhkoSpeedFilter = "any" | "outspeeds" | "notSlower" | "slowerOrTie";
type OhkoSurvivalFilter = "any" | "survivesBestHit";
type TrainingMetaRow = {
  pokemon: PokemonRecord;
  moveset: ResolvedSpeciesMoveset;
  damagingAttackCount: number;
};
type TrainingOptimizerScan = {
  results: TrainingOptimizerResult[];
  baseline: TrainingOptimizerResult | null;
  candidateCount: number;
  evaluatedThreatCount: number;
};
type DamagePickerCardProps = {
  label: string;
  isSelected: boolean;
  isDisabled?: boolean;
  pokemon: PokemonRecord | null;
  subtitle: string;
  footer: string;
  onClick: () => void;
};
type BattleIconProps = {
  className?: string;
};
type OpenerSelection = [number | null, number | null];
type SingleDamageCalculatorPanelProps = {
  attackerSlotIndex: number | null;
  attackerSlot: LoadedTeamSlot | null;
  defenderSlotIndex: number | null;
  defenderEntry: LoadedOpponentEntry | null;
  basePokemonBySpeciesKey: ReadonlyMap<string, PokemonRecord>;
  megaFormsByBaseSpeciesKey: ReadonlyMap<string, PokemonRecord[]>;
  onAttackerBattleFormChange: (slotIndex: number, activeFormPokemonId: string | null) => void;
  onDefenderBattleFormChange: (slotIndex: number, pokemon: PokemonRecord) => void;
  onEditEnemyStatSpread: (slotIndex: number) => void;
  enemyStatSpreadOverrides: EnemyStatSpreadOverrideMap;
  damageCalcMode: DamageCalcMode;
  setDamageCalcMode: Dispatch<SetStateAction<DamageCalcMode>>;
  damageWeather: DamageWeather;
  setDamageWeather: Dispatch<SetStateAction<DamageWeather>>;
  damageTerrain: DamageTerrain;
  setDamageTerrain: Dispatch<SetStateAction<DamageTerrain>>;
  damageAttackerGrounded: boolean;
  setDamageAttackerGrounded: Dispatch<SetStateAction<boolean>>;
  damageDefenderGrounded: boolean;
  setDamageDefenderGrounded: Dispatch<SetStateAction<boolean>>;
  damageAttackStage: number;
  setDamageAttackStage: Dispatch<SetStateAction<number>>;
  damageDefenseStage: number;
  setDamageDefenseStage: Dispatch<SetStateAction<number>>;
  damageAttackerAbility: DamageAbilityId;
  setDamageAttackerAbility: Dispatch<SetStateAction<DamageAbilityId>>;
  damageDefenderAbility: DamageAbilityId;
  setDamageDefenderAbility: Dispatch<SetStateAction<DamageAbilityId>>;
  damageAttackerItem: DamageItemId;
  setDamageAttackerItem: Dispatch<SetStateAction<DamageItemId>>;
  damageDefenderItem: DamageItemId;
  setDamageDefenderItem: Dispatch<SetStateAction<DamageItemId>>;
  damageHelpingHand: boolean;
  setDamageHelpingHand: Dispatch<SetStateAction<boolean>>;
  damageReflect: boolean;
  setDamageReflect: Dispatch<SetStateAction<boolean>>;
  damageLightScreen: boolean;
  setDamageLightScreen: Dispatch<SetStateAction<boolean>>;
  damageAuroraVeil: boolean;
  setDamageAuroraVeil: Dispatch<SetStateAction<boolean>>;
  damageMoveConfigs: Record<string, Partial<Record<string, DamageMoveConfig>>>;
  setDamageMoveConfigs: Dispatch<SetStateAction<Record<string, Partial<Record<string, DamageMoveConfig>>>>>;
  defenseMoveConfigs: Record<string, ManualDamageMoveConfig>;
  setDefenseMoveConfigs: Dispatch<SetStateAction<Record<string, ManualDamageMoveConfig>>>;
  moveByKey: ReadonlyMap<string, MoveRecord>;
};
type OpenerSummary = {
  label: string;
  members: LeadSummary[];
  sharedWeakTypes: PokemonType[];
  pivotCoverTypes: PokemonType[];
  sharedResistTypes: PokemonType[];
  combinedCoverTypes: PokemonType[];
  speedTiers: Array<{
    pokemonId: string;
    name: string;
    speed: number;
  }>;
};

const DEFAULT_PRIMARY: PokemonType = "water";
const TEAM_SIZE = 6;
const MAX_ATTACK_TYPES_PER_SLOT = 4;
const MAX_SPECIES_MOVESET_SIZE = 12;
const MAX_OPPONENT_SCOUT_SLOTS = 6;
const WEATHER_OPTIONS: Array<{ value: DamageWeather; label: string }> = [
  { value: "none", label: "No Weather" },
  { value: "sun", label: "Sun" },
  { value: "rain", label: "Rain" },
  { value: "sand", label: "Sand" },
  { value: "snow", label: "Snow" },
];
const TERRAIN_OPTIONS: Array<{ value: DamageTerrain; label: string }> = [
  { value: "none", label: "No Terrain" },
  { value: "electric", label: "Electric Terrain" },
  { value: "grassy", label: "Grassy Terrain" },
  { value: "psychic", label: "Psychic Terrain" },
  { value: "misty", label: "Misty Terrain" },
];
const BATTLE_STATUS_OPTIONS: Array<{ value: BattleStatusCondition; label: string }> = [
  { value: "none", label: "Healthy" },
  { value: "burn", label: "Burn" },
  { value: "paralysis", label: "Paralysis" },
  { value: "sleep", label: "Sleep" },
  { value: "poison", label: "Poison" },
  { value: "badPoison", label: "Badly Poisoned" },
  { value: "freeze", label: "Freeze" },
];
const MOVE_FINDER_SPEED_METRIC_OPTIONS: Array<{ value: MoveFinderSpeedMetric; label: string; shortLabel: string }> = [
  { value: "base", label: "Base Speed", shortLabel: "Base Spe" },
  { value: "neutral", label: "32 Spe", shortLabel: "32 Spe" },
  { value: "boosted", label: "32 Spe + Nature", shortLabel: "32 Spe+Nature" },
];
const MOVE_FINDER_SPEED_COMPARATOR_OPTIONS: Array<{ value: MoveFinderSpeedComparator; label: string }> = [
  { value: "any", label: "Any" },
  { value: "atLeast", label: "At least" },
  { value: "atMost", label: "At most" },
];
const BATTLE_STAGE_OPTIONS = Array.from({ length: 13 }, (_, index) => index - 6);
const LEGAL_ORDER_BY_KEY = new Map(
  POKEMON_CHAMPIONS_LEGAL_SPECIES_NAMES.map((name, index) => [normalizePokemonNameKey(name), index] as const),
);
function createEmptyTeamSlot(): TeamSlotState {
  return {
    query: "",
    pokemonId: null,
    activeFormPokemonId: null,
    itemName: null,
    statSpread: null,
    knownMoves: [],
    savedAttacks: [],
  };
}

function getPreferredDamageCategory(pokemon: PokemonRecord | null | undefined): DamageCategory {
  if (!pokemon) {
    return "special";
  }

  return pokemon.baseStats.atk >= pokemon.baseStats.spa ? "physical" : "special";
}

function getPreferredAttackType(pokemon: PokemonRecord | null | undefined): PokemonType {
  if (!pokemon) {
    return DEFAULT_PRIMARY;
  }

  return getTypeFromLabel(pokemon.types[0]) ?? DEFAULT_PRIMARY;
}

function isLikelyGrounded(pokemon: PokemonRecord | null | undefined) {
  if (!pokemon) {
    return true;
  }

  return !pokemon.types.includes("Flying");
}

function createDefaultDamageMoveConfig(pokemon?: PokemonRecord | null): DamageMoveConfig {
  return {
    power: "",
    category: getPreferredDamageCategory(pokemon),
    isSpreadMove: false,
  };
}

function createDefaultManualDamageMoveConfig(pokemon?: PokemonRecord | null): ManualDamageMoveConfig {
  return {
    ...createDefaultDamageMoveConfig(pokemon),
    power: "80",
    attackType: getPreferredAttackType(pokemon),
  };
}

function createSavedAttackId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `attack-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePersistedMultihit(
  value: PersistedMoveMultihit | null | undefined,
): PersistedMoveMultihit | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 1) {
    return value;
  }
  if (Array.isArray(value) && value.length === 2) {
    const [min, max] = value;
    if (Number.isFinite(min) && Number.isFinite(max) && max > 1 && max >= min) {
      return min === max ? max : [min, max];
    }
  }
  return null;
}

function createSavedAttack(
  pokemon?: PokemonRecord | null,
  overrides: Partial<PersistedSavedAttack> = {},
): PersistedSavedAttack {
  const label = overrides.label ?? "";

  return {
    id: overrides.id ?? createSavedAttackId(),
    label,
    type: overrides.type ?? getPreferredAttackType(pokemon),
    basePower: normalizeSavedMoveBasePower(overrides.basePower, label) ?? 80,
    category: overrides.category ?? getPreferredDamageCategory(pokemon),
    isSpreadMove: overrides.isSpreadMove ?? false,
    multihit: normalizePersistedMultihit(overrides.multihit),
  };
}

function createKnownMove(
  overrides: Partial<PersistedKnownMove> = {},
): PersistedKnownMove {
  const category = overrides.category === "physical" || overrides.category === "special" || overrides.category === "status"
    ? overrides.category
    : undefined;
  const type = typeof overrides.type === "string" ? coercePokemonType(overrides.type) : null;
  const label = overrides.label ?? overrides.name ?? "";
  const name = overrides.name ?? label;

  return {
    id: overrides.id ?? createSavedAttackId(),
    name,
    label,
    type: type ?? undefined,
    basePower: normalizeSavedMoveBasePower(overrides.basePower, name),
    category,
    isSpreadMove: Boolean(overrides.isSpreadMove),
    multihit: normalizePersistedMultihit(overrides.multihit),
  };
}

function getDamageConfigKey(slotIndex: number, pokemonId: string | null) {
  return `${slotIndex}:${pokemonId ?? "empty"}`;
}

function getEnemyStatSpreadOverrideKey(
  slotIndex: number,
  pokemon: PokemonRecord,
  basePokemonBySpeciesKey: ReadonlyMap<string, PokemonRecord>,
) {
  const basePokemon = getBasePokemonForBattleForm(pokemon, basePokemonBySpeciesKey);
  return `${slotIndex}:${basePokemon.id}`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0.0";
  }

  return value.toFixed(value >= 100 ? 0 : 1);
}

function formatSignedScore(value: number) {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded}`;
}

function formatFlatMultiplier(value: number) {
  if (value === 0.25) {
    return "0.25x";
  }

  if (value === 0.5) {
    return "0.5x";
  }

  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}x`;
}

function getDamageOverviewSpeedStat(baseSpeed: number, item: DamageItemId) {
  if (item === "choicescarf") {
    return Math.floor(baseSpeed * 1.5);
  }

  if (item === "ironball") {
    return Math.floor(baseSpeed * 0.5);
  }

  return baseSpeed;
}

function clampStatStage(value: number) {
  return Math.max(-6, Math.min(6, value));
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.max(0, Math.min(100, value));
}

function getLevel50CurrentHpFromPercent(maxHp: number, hpPercent: number) {
  const normalizedPercent = clampPercent(hpPercent);
  if (normalizedPercent <= 0) {
    return 0;
  }

  return Math.max(1, Math.min(maxHp, Math.round((maxHp * normalizedPercent) / 100)));
}

function getBattleSimulatorStateKey(side: "ally" | "enemy", slotIndex: number, pokemonId: string) {
  return `${side}-${slotIndex}-${pokemonId}`;
}

function getAttackBasePowerDisplay(basePower?: number) {
  return typeof basePower === "number" && Number.isFinite(basePower) && basePower > 0 ? String(basePower) : "";
}

function getMoveRecordDamageBasePower(move: Pick<MoveRecord, "name" | "basePower">) {
  if (typeof move.basePower === "number" && Number.isFinite(move.basePower) && move.basePower > 0) {
    return Math.floor(move.basePower);
  }

  return isLowKickMove(move.name) ? 0 : undefined;
}

function normalizeSavedMoveBasePower(
  basePower: number | null | undefined,
  moveName: string | null | undefined,
) {
  if (typeof basePower === "number" && Number.isFinite(basePower)) {
    if (basePower > 0) {
      return Math.floor(basePower);
    }

    if (basePower === 0 && isLowKickMove(moveName)) {
      return 0;
    }
  }

  return isLowKickMove(moveName) ? 0 : undefined;
}

function formatMoveBasePowerLabel(basePower: number | null | undefined, moveName: string | null | undefined) {
  const normalizedBasePower = normalizeSavedMoveBasePower(basePower, moveName);

  if (normalizedBasePower === 0 && isLowKickMove(moveName)) {
    return "Weight BP";
  }

  return typeof normalizedBasePower === "number" ? `${normalizedBasePower} BP` : "Base power not set";
}

function getDamageInputBasePower(
  configPower: string,
  defaultPower: number | null,
  moveName: string | null | undefined,
) {
  if (isLowKickMove(moveName)) {
    return 0;
  }

  const parsedPower = configPower.trim() ? Number(configPower) : defaultPower;
  return Number.isFinite(parsedPower) && (parsedPower ?? 0) > 0 ? parsedPower : null;
}

function getAttackLabel(attack: PersistedSavedAttack) {
  return attack.label?.trim() || TYPE_META[attack.type].label;
}

function getKnownMoveName(move: Pick<PersistedKnownMove, "label" | "name">) {
  return move.name?.trim() || move.label.trim();
}

function getKnownMoveType(move: PersistedKnownMove) {
  return move.type ? coercePokemonType(move.type) : null;
}

function getKnownMoveBasePower(move: PersistedKnownMove) {
  return normalizeSavedMoveBasePower(move.basePower, getKnownMoveName(move)) ?? null;
}

function getKnownMoveCategory(move: PersistedKnownMove, pokemon?: PokemonRecord | null) {
  if (move.category === "physical" || move.category === "special" || move.category === "status") {
    return move.category;
  }

  return getKnownMoveBasePower(move) !== null ? getPreferredDamageCategory(pokemon) : "status";
}

function sanitizeKnownMoves(
  knownMoves: PersistedKnownMove[] | null | undefined,
  moveByKey: ReadonlyMap<string, MoveRecord>,
  limit = MAX_ATTACK_TYPES_PER_SLOT,
) {
  if (!Array.isArray(knownMoves)) {
    return [];
  }

  const deduped = new Map<string, PersistedKnownMove>();

  for (const move of knownMoves) {
    const moveName = getKnownMoveName(move);
    const normalizedName = moveName.trim();
    const matchedMove = getMoveRecordByName(normalizedName, moveByKey);
    const resolvedType = matchedMove ? getMovePokemonType(matchedMove) : getKnownMoveType(move);
    const resolvedCategory = matchedMove
      ? matchedMove.category.toLowerCase() as PersistedKnownMove["category"]
      : getKnownMoveCategory(move);
    const resolvedBasePower = matchedMove
      ? getMoveRecordDamageBasePower(matchedMove)
      : getKnownMoveBasePower(move) ?? undefined;
    const resolvedLabel = matchedMove?.name ?? normalizedName;
    const normalizedKey = normalizeTextKey(resolvedLabel);

    if (!normalizedKey || deduped.has(normalizedKey)) {
      continue;
    }

    const resolvedMultihit = matchedMove ? getMoveMultihit(matchedMove) : normalizePersistedMultihit(move.multihit);

    deduped.set(
      normalizedKey,
      createKnownMove({
        id: typeof move.id === "string" && move.id.trim() ? move.id : undefined,
        name: matchedMove?.name ?? normalizedName,
        label: resolvedLabel,
        type: resolvedType ?? undefined,
        basePower: resolvedCategory === "status" ? undefined : resolvedBasePower,
        category: resolvedCategory,
        isSpreadMove: matchedMove ? isSpreadTarget(matchedMove.target) : Boolean(move.isSpreadMove),
        multihit: resolvedMultihit,
      }),
    );
  }

  return [...deduped.values()].slice(0, limit);
}

function getResolvedFieldValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getStatSpreadSummary(spread: ChampionsStatSpread) {
  const entries = CHAMPIONS_STAT_ORDER
    .filter((statId) => spread.statPoints[statId] > 0)
    .map((statId) => `${spread.statPoints[statId]} ${CHAMPIONS_STAT_LABELS[statId]}`);

  return `${getChampionsNatureLabel(spread.nature)} · ${entries.join(" / ")}`;
}

function isStatSpreadEqual(left: ChampionsStatSpread | null | undefined, right: ChampionsStatSpread | null | undefined) {
  if (!left || !right) {
    return false;
  }

  if (left.nature !== right.nature) {
    return false;
  }

  return CHAMPIONS_STAT_ORDER.every((statId) => left.statPoints[statId] === right.statPoints[statId]);
}

function normalizeTextKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getMoveRecordByName(moveName: string, moveByKey: ReadonlyMap<string, MoveRecord>) {
  const trimmed = moveName.trim();

  if (!trimmed) {
    return null;
  }

  return moveByKey.get(trimmed.toLowerCase()) ?? moveByKey.get(normalizeTextKey(trimmed)) ?? null;
}

function coercePokemonType(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return TYPE_ORDER.find((type) => type === normalized) ?? getTypeFromLabel(value) ?? null;
}

function getPokemonMovesetKey(pokemon: Pick<PokemonRecord, "id">) {
  return normalizePokemonNameKey(pokemon.id);
}

function getPokemonBaseSpeciesKey(pokemon: Pick<PokemonRecord, "baseSpecies" | "name">) {
  return normalizePokemonNameKey(pokemon.baseSpecies || pokemon.name);
}

function getPokemonBaseFormKey(pokemon: Pick<PokemonRecord, "baseSpecies" | "name">) {
  return normalizePokemonNameKey(pokemon.baseSpecies || pokemon.name);
}

function getInheritedMovesetKey(pokemon: Pick<PokemonRecord, "baseSpecies" | "forme" | "id" | "name">) {
  if (!pokemon.forme) {
    return null;
  }

  const baseSpeciesKey = getPokemonBaseSpeciesKey(pokemon);
  return baseSpeciesKey !== getPokemonMovesetKey(pokemon) ? baseSpeciesKey : null;
}

function isChampionsMegaEntry(pokemon: Pick<PokemonRecord, "baseSpecies" | "name" | "forme">) {
  if (!pokemon.forme) {
    return false;
  }

  if (!POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET.has(getPokemonBaseSpeciesKey(pokemon))) {
    return false;
  }

  return (
    /^Mega(?:-[XY])?$/.test(pokemon.forme) ||
    /^[FM]-Mega$/.test(pokemon.forme) ||
    pokemon.forme === "Original-Mega" ||
    pokemon.forme === "Primal"
  );
}

function getBasePokemonForBattleForm(
  pokemon: PokemonRecord,
  basePokemonBySpeciesKey: ReadonlyMap<string, PokemonRecord>,
) {
  if (isChampionsSuppressedBaseForm(pokemon)) {
    return basePokemonBySpeciesKey.get(getPokemonBaseFormKey(pokemon)) ?? pokemon;
  }

  if (!isChampionsMegaEntry(pokemon)) {
    return pokemon;
  }

  return basePokemonBySpeciesKey.get(getPokemonBaseFormKey(pokemon)) ?? pokemon;
}

function isCompatibleBattleForm(basePokemon: PokemonRecord, formPokemon: PokemonRecord) {
  return isChampionsMegaEntry(formPokemon) && getPokemonBaseFormKey(basePokemon) === getPokemonBaseFormKey(formPokemon);
}

function getBattleFormLabel(pokemon: PokemonRecord) {
  if (!isChampionsMegaEntry(pokemon)) {
    return "Normal";
  }

  if (pokemon.forme === "Mega-X") {
    return "Mega X";
  }

  if (pokemon.forme === "Mega-Y") {
    return "Mega Y";
  }

  if (pokemon.forme === "Primal") {
    return "Primal";
  }

  return pokemon.forme?.replace(/-/g, " ") ?? pokemon.name;
}

function getTeamFormOptions(
  basePokemon: PokemonRecord | null,
  megaFormsByBaseSpeciesKey: ReadonlyMap<string, PokemonRecord[]>,
): TeamFormOption[] {
  if (!basePokemon) {
    return [];
  }

  const forms = megaFormsByBaseSpeciesKey.get(getPokemonBaseFormKey(basePokemon)) ?? [];
  return [
    {
      pokemon: basePokemon,
      activeFormPokemonId: null,
      label: "Normal",
      isBase: true,
    },
    ...forms.map((pokemon) => ({
      pokemon,
      activeFormPokemonId: pokemon.id,
      label: getBattleFormLabel(pokemon),
      isBase: false,
    })),
  ];
}

function getBattleLabActivePokemon(
  basePokemon: PokemonRecord | null,
  activeFormPokemonId: string | null | undefined,
  pokemonByKey: ReadonlyMap<string, PokemonRecord>,
) {
  if (!basePokemon) {
    return null;
  }

  const activeFormPokemon = activeFormPokemonId ? pokemonByKey.get(activeFormPokemonId) ?? null : null;
  return activeFormPokemon && isCompatibleBattleForm(basePokemon, activeFormPokemon) ? activeFormPokemon : basePokemon;
}

function getSavedMegaFormOptions(
  basePokemon: PokemonRecord | null,
  activeFormPokemonId: string | null | undefined,
  pokemonByKey: ReadonlyMap<string, PokemonRecord>,
  megaFormsByBaseSpeciesKey: ReadonlyMap<string, PokemonRecord[]>,
) {
  if (!basePokemon || !activeFormPokemonId) {
    return [];
  }

  const savedMegaPokemon = pokemonByKey.get(activeFormPokemonId) ?? null;
  if (!savedMegaPokemon || !isCompatibleBattleForm(basePokemon, savedMegaPokemon)) {
    return [];
  }

  return getTeamFormOptions(basePokemon, megaFormsByBaseSpeciesKey).filter(
    (option) => option.isBase || option.activeFormPokemonId === savedMegaPokemon.id,
  );
}

function inferMegaEvolutionItemName(
  megaPokemon: PokemonRecord | null | undefined,
  itemOptions: readonly ItemRecord[] = [],
) {
  if (!megaPokemon || !isChampionsMegaEntry(megaPokemon)) {
    return null;
  }

  const baseSpecies = megaPokemon.baseSpecies || megaPokemon.name;
  const baseSpeciesKey = normalizePokemonNameKey(baseSpecies);

  if (megaPokemon.forme === "Primal") {
    if (baseSpeciesKey === "groudon") {
      return "Red Orb";
    }
    if (baseSpeciesKey === "kyogre") {
      return "Blue Orb";
    }
  }

  const formSuffix =
    megaPokemon.forme === "Mega-X"
      ? "x"
      : megaPokemon.forme === "Mega-Y"
        ? "y"
        : null;
  const candidateItems = itemOptions.filter((item) => {
    const itemKey = normalizePokemonNameKey(item.name);
    const itemTextKey = normalizePokemonNameKey(`${item.shortDesc} ${item.desc}`);
    return (
      itemKey.includes(baseSpeciesKey) ||
      itemTextKey.includes(`heldbya${baseSpeciesKey}`) ||
      itemTextKey.includes(`heldbyan${baseSpeciesKey}`)
    );
  });
  const matchedItem =
    (formSuffix
      ? candidateItems.find((item) => normalizePokemonNameKey(item.name).endsWith(formSuffix))
      : candidateItems.find((item) => !/[xy]$/.test(normalizePokemonNameKey(item.name)))) ??
    candidateItems[0] ??
    null;

  if (matchedItem) {
    return matchedItem.name;
  }

  const spacedSuffix =
    megaPokemon.forme === "Mega-X" ? " X" : megaPokemon.forme === "Mega-Y" ? " Y" : "";
  return `${baseSpecies}ite${spacedSuffix}`;
}

function isMegaEvolutionItemForBasePokemon(
  itemName: string | null | undefined,
  basePokemon: PokemonRecord | null | undefined,
  megaFormsByBaseSpeciesKey: ReadonlyMap<string, PokemonRecord[]>,
  itemOptions: readonly ItemRecord[] = [],
) {
  if (!itemName || !basePokemon) {
    return false;
  }

  const itemKey = normalizePokemonNameKey(itemName);
  const megaForms = megaFormsByBaseSpeciesKey.get(getPokemonBaseFormKey(basePokemon)) ?? [];
  return megaForms.some((megaForm) => {
    const megaItemName = inferMegaEvolutionItemName(megaForm, itemOptions);
    return Boolean(megaItemName && normalizePokemonNameKey(megaItemName) === itemKey);
  });
}

function getAllowedTeamSlotItemName(options: {
  itemName: string | null | undefined;
  basePokemon: PokemonRecord | null | undefined;
  activeFormPokemonId: string | null | undefined;
  megaFormsByBaseSpeciesKey: ReadonlyMap<string, PokemonRecord[]>;
  itemOptions: readonly ItemRecord[];
}) {
  const itemName = getResolvedFieldValue(options.itemName);
  if (!itemName || options.activeFormPokemonId) {
    return itemName;
  }

  return isMegaEvolutionItemForBasePokemon(
    itemName,
    options.basePokemon,
    options.megaFormsByBaseSpeciesKey,
    options.itemOptions,
  )
    ? null
    : itemName;
}

function getPokemonPrimaryAbilityName(pokemon: PokemonRecord | null | undefined) {
  return getResolvedFieldValue(getPokemonAbilityNames(pokemon)[0]);
}

function getResolvedPresetAbilityName(
  pokemon: PokemonRecord,
  preset: Pick<OpponentPresetRecord, "speciesKey" | "abilityName"> | null | undefined,
) {
  const presetAbilityName = getResolvedFieldValue(preset?.abilityName);

  if (!isChampionsMegaEntry(pokemon)) {
    return presetAbilityName;
  }

  const matchedPokemonKey = preset?.speciesKey === getPokemonMovesetKey(pokemon);

  if (matchedPokemonKey) {
    return presetAbilityName ?? getPokemonPrimaryAbilityName(pokemon);
  }

  return getPokemonPrimaryAbilityName(pokemon) ?? presetAbilityName;
}

function getAttackTypesFromSavedAttacks(savedAttacks: PersistedSavedAttack[]) {
  return savedAttacks.map((attack) => attack.type);
}

function getUniqueAttackTypesFromSavedAttacks(savedAttacks: PersistedSavedAttack[]) {
  return Array.from(new Set(getAttackTypesFromSavedAttacks(savedAttacks)));
}

function sanitizeSavedAttacks(
  savedAttacks: PersistedSavedAttack[] | null | undefined,
  pokemon?: PokemonRecord | null,
  limit = MAX_ATTACK_TYPES_PER_SLOT,
): PersistedSavedAttack[] {
  if (!Array.isArray(savedAttacks)) {
    return [];
  }

  return savedAttacks
    .map((attack) => {
      const type = typeof attack?.type === "string" ? coercePokemonType(attack.type) : null;

      if (!type) {
        return null;
      }

      const basePower = normalizeSavedMoveBasePower(attack.basePower, typeof attack.label === "string" ? attack.label : "");
      const category = attack.category === "physical" || attack.category === "special"
        ? attack.category
        : undefined;

      return createSavedAttack(pokemon, {
        id: typeof attack.id === "string" && attack.id.trim() ? attack.id : undefined,
        label: typeof attack.label === "string" ? attack.label : "",
        type,
        basePower,
        category,
        isSpreadMove: Boolean(attack.isSpreadMove),
        multihit: normalizePersistedMultihit(attack.multihit),
      });
    })
    .filter((attack): attack is PersistedSavedAttack => attack !== null)
    .slice(0, limit);
}

function sanitizeKnownMovesToSavedAttacks(
  knownMoves: PersistedKnownMove[] | null | undefined,
  pokemon?: PokemonRecord | null,
  limit = MAX_ATTACK_TYPES_PER_SLOT,
) {
  if (!Array.isArray(knownMoves)) {
    return [];
  }

  return sanitizeSavedAttacks(
    knownMoves
      .filter((move) => Boolean(move.type) && move.category !== "status")
      .map((move) => ({
        id: move.id,
        label: getKnownMoveName(move),
        type: move.type!,
        basePower: move.basePower,
        category: move.category === "status" ? undefined : move.category,
        isSpreadMove: move.isSpreadMove,
        multihit: move.multihit ?? null,
      })),
    pokemon,
    limit,
  );
}

function buildPersistedKnownMovesFromDraftAttacks(
  draftAttacks: PersistedSavedAttack[] | null | undefined,
  moveByKey: ReadonlyMap<string, MoveRecord>,
  fallbackKnownMoves: PersistedKnownMove[] = [],
  limit = MAX_ATTACK_TYPES_PER_SLOT,
) {
  const byKey = new Map<string, PersistedKnownMove>();

  const addMove = (move: PersistedKnownMove) => {
    const moveName = (move.name?.trim() || move.label.trim());
    const key = normalizeTextKey(moveName);
    if (!key || byKey.has(key)) {
      return;
    }
    byKey.set(key, {
      ...move,
      name: move.name ?? moveName,
      label: move.label || moveName,
    });
  };

  for (const move of fallbackKnownMoves) {
    if (move.category === "status") {
      addMove(move);
    }
  }

  for (const attack of draftAttacks ?? []) {
    const moveName = attack.label.trim();
    if (!moveName) {
      continue;
    }

    const matchedMove = getMoveRecordByName(moveName, moveByKey);
    const matchedType = matchedMove ? getMovePokemonType(matchedMove) : null;

    addMove({
      id: attack.id,
      name: matchedMove?.name ?? attack.label,
      label: matchedMove?.name ?? attack.label,
      type: matchedType ?? attack.type,
      basePower: matchedMove
        ? getMoveRecordDamageBasePower(matchedMove)
        : normalizeSavedMoveBasePower(attack.basePower, attack.label),
      category:
        matchedMove
          ? (matchedMove.category.toLowerCase() as PersistedKnownMove["category"])
          : attack.category,
      isSpreadMove: matchedMove ? isSpreadTarget(matchedMove.target) : attack.isSpreadMove,
      multihit: matchedMove ? getMoveMultihit(matchedMove) : normalizePersistedMultihit(attack.multihit),
    });
  }

  return [...byKey.values()].slice(0, limit);
}

function buildLegacySavedAttacks(slot: PersistedTeamSlot): PersistedSavedAttack[] {
  const legacyTypes = Array.isArray(slot.attackTypes) ? slot.attackTypes : [];
  const savedAttacks: PersistedSavedAttack[] = [];

  legacyTypes.forEach((type, index) => {
    if (savedAttacks.length >= MAX_ATTACK_TYPES_PER_SLOT) {
      return;
    }

    const normalizedType = coercePokemonType(type);

    if (!normalizedType) {
      return;
    }

    const legacyPower = slot.attackTypeDefaults?.[normalizedType];

    savedAttacks.push({
      id: createSavedAttackId(),
      label: `${TYPE_META[normalizedType].label} ${index + 1}`,
      type: normalizedType,
      basePower:
        typeof legacyPower === "number" && Number.isFinite(legacyPower) && legacyPower > 0
          ? Math.floor(legacyPower)
          : undefined,
      isSpreadMove: Boolean(slot.attackTypeSpreadDefaults?.[normalizedType]),
    });
  });

  return savedAttacks;
}

function buildKnownMovesFromSavedAttacks(
  savedAttacks: PersistedSavedAttack[] | null | undefined,
  moveByKey: ReadonlyMap<string, MoveRecord>,
  limit = MAX_ATTACK_TYPES_PER_SLOT,
) {
  return sanitizeKnownMoves(
    buildPersistedKnownMovesFromDraftAttacks(savedAttacks, moveByKey, [], limit),
    moveByKey,
    limit,
  );
}

function getCoverageTypesFromSavedAttacks(savedAttacks: PersistedSavedAttack[]) {
  return getCoveredDefendingTypes(getUniqueAttackTypesFromSavedAttacks(savedAttacks));
}

function getResolvedAttackCategory(
  attack: PersistedSavedAttack,
  pokemon: PokemonRecord | null | undefined,
): DamageCategory {
  return attack.category ?? getPreferredDamageCategory(pokemon);
}

function getResolvedAttackSpread(attack: PersistedSavedAttack) {
  return Boolean(attack.isSpreadMove);
}

function getResolvedAttackBasePower(attack: PersistedSavedAttack) {
  return normalizeSavedMoveBasePower(attack.basePower, attack.label) ?? (isLowKickMove(attack.label) ? 0 : null);
}

function getResolvedAttackMultihit(
  attack: PersistedSavedAttack,
  moveByKey?: ReadonlyMap<string, MoveRecord>,
): PersistedMoveMultihit | null {
  const stored = normalizePersistedMultihit(attack.multihit);
  if (stored != null) {
    return stored;
  }
  if (!moveByKey) {
    return null;
  }
  const matched = getMoveRecordByName(attack.label, moveByKey);
  return matched ? getMoveMultihit(matched) : null;
}

function formatMoveAccuracy(accuracy: number | true) {
  return accuracy === true ? "Always hits" : `${accuracy}%`;
}

function formatMoveTarget(target: string) {
  const labels: Record<string, string> = {
    normal: "Single target",
    adjacentAlly: "Adjacent ally",
    adjacentAllyOrSelf: "Ally or self",
    adjacentFoe: "Adjacent foe",
    allAdjacent: "All adjacent",
    allAdjacentFoes: "All adjacent foes",
    allySide: "Ally side",
    foeSide: "Foe side",
    all: "All Pokemon",
    scripted: "Scripted",
    self: "Self",
    any: "Any target",
    randomNormal: "Random foe",
  };

  return labels[target] ?? target;
}

function getPokemonDefensiveMultiplier(pokemon: PokemonRecord, attackType: PokemonType) {
  const firstType = getTypeFromLabel(pokemon.types[0]);
  const secondType = pokemon.types[1] ? getTypeFromLabel(pokemon.types[1]) : null;

  if (!firstType) {
    return null;
  }

  return getMultiplier(attackType, firstType, secondType);
}

function getBestOffensiveMultiplier(attackTypes: PokemonType[], defendingType: PokemonType) {
  if (attackTypes.length === 0) {
    return null;
  }

  return attackTypes.reduce((best, attackType) => {
    const multiplier = getMultiplier(attackType, defendingType);
    return multiplier > best ? multiplier : best;
  }, 0);
}

function getBestSavedAttacksAgainstPokemon(
  savedAttacks: PersistedSavedAttack[],
  pokemon: PokemonRecord,
): { multiplier: number | null; attacks: PersistedSavedAttack[] } {
  const firstType = getTypeFromLabel(pokemon.types[0]);
  const secondType = pokemon.types[1] ? getTypeFromLabel(pokemon.types[1]) : null;

  if (!firstType || savedAttacks.length === 0) {
    return { multiplier: null, attacks: [] };
  }

  let bestMultiplier = 0;
  let bestAttacks: PersistedSavedAttack[] = [];

  for (const attack of savedAttacks) {
    const multiplier = getMultiplier(attack.type, firstType, secondType);

    if (multiplier > bestMultiplier) {
      bestMultiplier = multiplier;
      bestAttacks = [attack];
    } else if (multiplier === bestMultiplier) {
      bestAttacks.push(attack);
    }
  }

  return {
    multiplier: bestMultiplier === 0 ? 0 : bestMultiplier,
    attacks: bestAttacks,
  };
}

function getBestDamageEstimateAgainstPokemon(
  attackerPokemon: PokemonRecord,
  defenderPokemon: PokemonRecord,
  savedAttacks: PersistedSavedAttack[],
  options: {
    weather: DamageWeather;
    terrain: DamageTerrain;
    attackerGrounded: boolean;
    defenderGrounded: boolean;
    attackerStatStage: number;
    defenderStatStage: number;
    attackerAbility?: DamageAbilityId;
    attackerAbilityName?: string | null;
    defenderAbility?: DamageAbilityId;
  attackerItem?: DamageItemId;
  defenderItem?: DamageItemId;
  helpingHand?: boolean;
  reflect?: boolean;
  lightScreen?: boolean;
  auroraVeil?: boolean;
  attackerStatSpread?: ChampionsStatSpread | null;
    defenderStatSpread?: ChampionsStatSpread | null;
  },
) {
  let best:
    | {
        attack: PersistedSavedAttack;
        estimate: ReturnType<typeof calculateRoughDamage>;
      }
    | null = null;

  for (const attack of savedAttacks) {
    const basePower = getResolvedAttackBasePower(attack);

    if (basePower === null) {
      continue;
    }

    const estimate = calculateRoughDamage({
      attacker: attackerPokemon,
      defender: defenderPokemon,
      attackType: attack.type,
      moveName: attack.label?.trim() || undefined,
      basePower,
      category: getResolvedAttackCategory(attack, attackerPokemon),
      isSpreadMove: getResolvedAttackSpread(attack),
      multihit: getResolvedAttackMultihit(attack) ?? null,
      weather: options.weather,
      terrain: options.terrain,
      attackerGrounded: options.attackerGrounded,
      defenderGrounded: options.defenderGrounded,
      attackerStatStage: options.attackerStatStage,
      defenderStatStage: options.defenderStatStage,
      attackerAbility: options.attackerAbility ?? getDefaultDamageAbilityId(attackerPokemon),
      attackerAbilityName: options.attackerAbilityName ?? null,
      defenderAbility: options.defenderAbility ?? getDefaultDamageAbilityId(defenderPokemon),
      attackerItem: options.attackerItem ?? "none",
      defenderItem: options.defenderItem ?? "none",
      helpingHand: options.helpingHand ?? false,
      reflect: options.reflect ?? false,
      lightScreen: options.lightScreen ?? false,
      auroraVeil: options.auroraVeil ?? false,
      attackerStatSpread: options.attackerStatSpread ?? null,
      defenderStatSpread: options.defenderStatSpread ?? null,
    });

    if (!best || estimate.maxPercent > best.estimate.maxPercent) {
      best = {
        attack,
        estimate,
      };
    }
  }

  return best;
}

type MatchupEloHit = ReturnType<typeof getBestDamageEstimateAgainstPokemon>;

type MatchupEloTargetResult = {
  targetPokemon: PokemonRecord;
  targetSlotIndex?: number;
  bestOutgoingHit: MatchupEloHit;
  bestIncomingHit: MatchupEloHit;
  survivesBestIncomingHit: boolean | null;
  speedDelta: number;
  possibleOhko: boolean;
  guaranteedOhko: boolean;
  targetScore: number;
};

type AutomaticDamageRow = {
  attack: PersistedSavedAttack;
  basePower: number;
  category: DamageCategory;
  isSpreadMove: boolean;
  estimate: ReturnType<typeof calculateRoughDamage>;
};

type CombinedDamageSummary = {
  first: AutomaticDamageRow;
  second: AutomaticDamageRow;
  minPercent: number;
  maxPercent: number;
  averagePercent: number;
  guaranteedKo: boolean;
  possibleKo: boolean;
};

type DoublesMemberRuntime = {
  hpPercent: number;
  protect: boolean;
  priority: boolean;
};

type BattleSimulatorMemberState = {
  activeFormPokemonId: string | null;
  hpPercent: number;
  attackStage: number;
  defenseStage: number;
  specialAttackStage: number;
  specialDefenseStage: number;
  speedStage: number;
  statusCondition: BattleStatusCondition;
  sleepTurns: number;
  toxicTurns: number;
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

type BattleFieldRuntimeState = {
  turn: number;
  allyTailwindTurns: number;
  enemyTailwindTurns: number;
  trickRoomTurns: number;
};

const DEFAULT_DOUBLES_RUNTIME: DoublesMemberRuntime = {
  hpPercent: 100,
  protect: false,
  priority: false,
};

const DEFAULT_BATTLE_SIMULATOR_MEMBER_STATE: BattleSimulatorMemberState = {
  activeFormPokemonId: null,
  hpPercent: 100,
  attackStage: 0,
  defenseStage: 0,
  specialAttackStage: 0,
  specialDefenseStage: 0,
  speedStage: 0,
  statusCondition: "none",
  sleepTurns: 0,
  toxicTurns: 0,
  tauntTurns: 0,
  encoreTurns: 0,
  encoredMoveId: null,
  disableTurns: 0,
  disabledMoveId: null,
  helpingHandTurns: 0,
  lastMoveId: null,
  turnsActive: 0,
  protectStreak: 0,
};

const DEFAULT_BATTLE_FIELD_RUNTIME_STATE: BattleFieldRuntimeState = {
  turn: 1,
  allyTailwindTurns: 0,
  enemyTailwindTurns: 0,
  trickRoomTurns: 0,
};

const DEFAULT_ACTIVE_SPEED_CONTROL_TURNS = 2;

const BATTLE_LAB_STAGE_CONTROLS = [
  ["Atk", "attackStage"],
  ["Def", "defenseStage"],
  ["SpA", "specialAttackStage"],
  ["SpD", "specialDefenseStage"],
  ["Spe", "speedStage"],
] as const;

type DoublesSelectedMember = {
  side: "ally" | "enemy";
  slotIndex: number;
  pokemon: PokemonRecord;
  savedAttacks: PersistedSavedAttack[];
  statSpread: ChampionsStatSpread | null;
  abilityName: string | null;
  movesetSourceLabel: string;
  speedStat: number;
  hpPercent: number;
  protect: boolean;
  priority: boolean;
};

type ThreatTurnSettings = {
  allyTailwind: boolean;
  enemyTailwind: boolean;
  trickRoom: boolean;
};

type ThreatLine = {
  attacker: DoublesSelectedMember;
  bestRow: AutomaticDamageRow | null;
  timing: "before" | "tie" | "after";
  effectiveSpeed: number;
};

type ThreatCard = {
  target: DoublesSelectedMember;
  lines: ThreatLine[];
  strongestLine: ThreatLine | null;
};

type DoublesSingleLineSummary = {
  member: DoublesSelectedMember;
  bestRow: AutomaticDamageRow | null;
  speedRelation: "before" | "tie" | "after";
  timingSummary: string;
};

type DoublesComboTiming = {
  relation: "before" | "tie" | "split" | "after";
  summary: string;
};

type DoublesTargetSummary = {
  target: DoublesSelectedMember;
  singles: DoublesSingleLineSummary[];
  bestDoubleUp: CombinedDamageSummary | null;
  bestDoubleUpTiming: DoublesComboTiming | null;
  bestSpreadSingle: CombinedDamageSummary | null;
  bestSpreadSingleTiming: DoublesComboTiming | null;
};

type DoublesVisualPlan = {
  kind: "double" | "spread" | "single" | "none";
  guaranteedKo: boolean;
  possibleKo: boolean;
  relation: "before" | "tie" | "split" | "after";
  statusLabel: string;
  timingLabel: string;
  tone: "great" | "good" | "warn" | "danger" | "neutral";
  actorsLabel: string;
  attacksLabel: string;
  rangeLabel: string;
  note: string;
  averagePercent: number;
};

function buildMatchupEloTargetResult(options: {
  attackerPokemon: PokemonRecord;
  attackerSavedAttacks: PersistedSavedAttack[];
  attackerStatSpread?: ChampionsStatSpread | null;
  targetPokemon: PokemonRecord;
  targetSavedAttacks: PersistedSavedAttack[];
  targetStatSpread?: ChampionsStatSpread | null;
  weather: DamageWeather;
  terrain: DamageTerrain;
  attackerGrounded: boolean;
  targetGrounded: boolean;
  attackerStatStage: number;
  defenderStatStage: number;
  targetSlotIndex?: number;
}): MatchupEloTargetResult {
  const {
    attackerPokemon,
    attackerSavedAttacks,
    attackerStatSpread,
    targetPokemon,
    targetSavedAttacks,
    targetStatSpread,
    weather,
    terrain,
    attackerGrounded,
    targetGrounded,
    attackerStatStage,
    defenderStatStage,
    targetSlotIndex,
  } = options;
  const bestOutgoingHit = getBestDamageEstimateAgainstPokemon(
    attackerPokemon,
    targetPokemon,
    attackerSavedAttacks,
    {
      weather,
      terrain,
      attackerGrounded,
      defenderGrounded: targetGrounded,
      attackerStatStage,
      defenderStatStage,
      attackerStatSpread,
      defenderStatSpread: targetStatSpread,
    },
  );
  const bestIncomingHit =
    targetSavedAttacks.length > 0
      ? getBestDamageEstimateAgainstPokemon(targetPokemon, attackerPokemon, targetSavedAttacks, {
          weather,
          terrain,
          attackerGrounded: targetGrounded,
          defenderGrounded: attackerGrounded,
          attackerStatStage,
          defenderStatStage,
          attackerStatSpread: targetStatSpread,
          defenderStatSpread: attackerStatSpread,
        })
      : null;
  const survivesBestIncomingHit = bestIncomingHit ? bestIncomingHit.estimate.maxPercent < 100 : null;
  const speedDelta =
    getChampionsComputedStats(attackerPokemon, { spread: attackerStatSpread }).spe -
    getChampionsComputedStats(targetPokemon, { spread: targetStatSpread }).spe;
  const possibleOhko = Boolean(bestOutgoingHit && bestOutgoingHit.estimate.maxPercent >= 100);
  const guaranteedOhko = Boolean(bestOutgoingHit && bestOutgoingHit.estimate.minPercent >= 100);
  const offensivePressure = bestOutgoingHit ? bestOutgoingHit.estimate.averagePercent : 0;
  const conservativePressure = bestOutgoingHit ? Math.min(bestOutgoingHit.estimate.minPercent, 100) : 0;

  return {
    targetPokemon,
    targetSlotIndex,
    bestOutgoingHit,
    bestIncomingHit,
    survivesBestIncomingHit,
    speedDelta,
    possibleOhko,
    guaranteedOhko,
    targetScore: calculateMatchupEloScore({
      guaranteedOhko,
      possibleOhko,
      survivesBestIncomingHit,
      speedDelta,
      offensivePressure,
      conservativePressure,
    }),
  };
}

function getAutomaticDamageRows(options: {
  attackerPokemon: PokemonRecord;
  defenderPokemon: PokemonRecord;
  savedAttacks: PersistedSavedAttack[];
  attackerStatSpread?: ChampionsStatSpread | null;
  defenderStatSpread?: ChampionsStatSpread | null;
  weather: DamageWeather;
  terrain: DamageTerrain;
  attackerGrounded: boolean;
  defenderGrounded: boolean;
  attackerStatStage: number;
  defenderStatStage: number;
  attackerAbility?: DamageAbilityId;
  attackerAbilityName?: string | null;
  defenderAbility?: DamageAbilityId;
  reflect?: boolean;
  lightScreen?: boolean;
  auroraVeil?: boolean;
}) {
  const {
    attackerPokemon,
    defenderPokemon,
    savedAttacks,
    attackerStatSpread,
    defenderStatSpread,
    weather,
    terrain,
    attackerGrounded,
    defenderGrounded,
    attackerStatStage,
    defenderStatStage,
    attackerAbility,
    attackerAbilityName,
    defenderAbility,
    reflect,
    lightScreen,
    auroraVeil,
  } = options;

  return savedAttacks.flatMap((attack) => {
    const basePower = getResolvedAttackBasePower(attack);

    if (basePower === null) {
      return [];
    }

    const category = getResolvedAttackCategory(attack, attackerPokemon);
    const isSpreadMove = getResolvedAttackSpread(attack);
    const estimate = calculateRoughDamage({
      attacker: attackerPokemon,
      defender: defenderPokemon,
      attackType: attack.type,
      moveName: attack.label?.trim() || undefined,
      basePower,
      category,
      isSpreadMove,
      multihit: getResolvedAttackMultihit(attack) ?? null,
      weather,
      terrain,
      attackerGrounded,
      defenderGrounded,
      attackerStatStage,
      defenderStatStage,
      attackerAbility: attackerAbility ?? getDefaultDamageAbilityId(attackerPokemon),
      attackerAbilityName: attackerAbilityName ?? null,
      defenderAbility: defenderAbility ?? getDefaultDamageAbilityId(defenderPokemon),
      reflect: reflect ?? false,
      lightScreen: lightScreen ?? false,
      auroraVeil: auroraVeil ?? false,
      attackerStatSpread: attackerStatSpread ?? null,
      defenderStatSpread: defenderStatSpread ?? null,
    });

    return [
      {
        attack,
        basePower: estimate.effectiveBasePower,
        category,
        isSpreadMove,
        estimate,
      },
    ];
  });
}

function getBestAutomaticDamageRow(rows: AutomaticDamageRow[]) {
  return rows.reduce<AutomaticDamageRow | null>((best, row) => {
    if (!best) {
      return row;
    }

    if (row.estimate.averagePercent !== best.estimate.averagePercent) {
      return row.estimate.averagePercent > best.estimate.averagePercent ? row : best;
    }

    if (row.estimate.maxPercent !== best.estimate.maxPercent) {
      return row.estimate.maxPercent > best.estimate.maxPercent ? row : best;
    }

    return row.estimate.minPercent > best.estimate.minPercent ? row : best;
  }, null);
}

function getThreatCardTone(
  strongestLine: ThreatLine | null,
  perspective: "incoming" | "outgoing",
): "neutral" | "warn" | "danger" | "good" | "great" {
  if (!strongestLine?.bestRow) {
    return "neutral";
  }

  const maxPercent = strongestLine.bestRow.estimate.maxPercent;

  if (perspective === "incoming") {
    if (maxPercent >= 100) {
      return "danger";
    }

    if (maxPercent >= 70) {
      return "warn";
    }

    return "neutral";
  }

  if (maxPercent >= 100) {
    return "great";
  }

  if (maxPercent >= 70) {
    return "good";
  }

  return "neutral";
}

function formatDamageHpRange(row: AutomaticDamageRow) {
  return `${row.estimate.minDamage}-${row.estimate.maxDamage} HP`;
}

function formatDamagePercentRange(row: AutomaticDamageRow) {
  return `${formatPercent(row.estimate.minPercent)}% - ${formatPercent(row.estimate.maxPercent)}%`;
}

function formatThreatTimingLabel(timing: ThreatLine["timing"]) {
  if (timing === "before") {
    return "Moves first";
  }

  if (timing === "after") {
    return "Moves second";
  }

  return "Speed tie";
}

function getThreatEffectiveSpeed(member: DoublesSelectedMember, settings: ThreatTurnSettings) {
  const hasTailwind =
    (member.side === "ally" && settings.allyTailwind) ||
    (member.side === "enemy" && settings.enemyTailwind);

  return member.speedStat * (hasTailwind ? 2 : 1);
}

function compareThreatTurnOrder(
  left: DoublesSelectedMember,
  right: DoublesSelectedMember,
  settings: ThreatTurnSettings,
) {
  const leftSpeed = getThreatEffectiveSpeed(left, settings);
  const rightSpeed = getThreatEffectiveSpeed(right, settings);

  if (leftSpeed !== rightSpeed) {
    return settings.trickRoom ? leftSpeed - rightSpeed : rightSpeed - leftSpeed;
  }

  if (left.side !== right.side) {
    return left.side === "ally" ? -1 : 1;
  }

  return left.slotIndex - right.slotIndex;
}

function getThreatTiming(
  attacker: DoublesSelectedMember,
  target: DoublesSelectedMember,
  settings: ThreatTurnSettings,
): ThreatLine["timing"] {
  const attackerSpeed = getThreatEffectiveSpeed(attacker, settings);
  const targetSpeed = getThreatEffectiveSpeed(target, settings);

  if (attackerSpeed === targetSpeed) {
    return "tie";
  }

  if (settings.trickRoom) {
    return attackerSpeed < targetSpeed ? "before" : "after";
  }

  return attackerSpeed > targetSpeed ? "before" : "after";
}

function getStrongestThreatLine(lines: ThreatLine[]) {
  return lines.reduce<ThreatLine | null>((best, line) => {
    if (!line.bestRow) {
      return best;
    }

    if (!best?.bestRow) {
      return line;
    }

    if (line.bestRow.estimate.maxPercent !== best.bestRow.estimate.maxPercent) {
      return line.bestRow.estimate.maxPercent > best.bestRow.estimate.maxPercent ? line : best;
    }

    if (line.bestRow.estimate.averagePercent !== best.bestRow.estimate.averagePercent) {
      return line.bestRow.estimate.averagePercent > best.bestRow.estimate.averagePercent ? line : best;
    }

    return line.bestRow.estimate.minPercent > best.bestRow.estimate.minPercent ? line : best;
  }, null);
}

function buildThreatCards(options: {
  attackers: [DoublesSelectedMember, DoublesSelectedMember];
  targets: [DoublesSelectedMember, DoublesSelectedMember];
  buildRows: (member: DoublesSelectedMember, target: DoublesSelectedMember) => AutomaticDamageRow[];
  turnSettings: ThreatTurnSettings;
}) {
  const { attackers, targets, buildRows, turnSettings } = options;

  return targets.map<ThreatCard>((target) => {
    const lines = attackers.map<ThreatLine>((attacker) => ({
      attacker,
      bestRow: getBestAutomaticDamageRow(buildRows(attacker, target)),
      timing: getThreatTiming(attacker, target, turnSettings),
      effectiveSpeed: getThreatEffectiveSpeed(attacker, turnSettings),
    }));

    return {
      target,
      lines,
      strongestLine: getStrongestThreatLine(lines),
    };
  });
}

function getCombinedDamageSummary(
  first: AutomaticDamageRow,
  second: AutomaticDamageRow,
  hpPercent: number = 100,
): CombinedDamageSummary {
  const minPercent = first.estimate.minPercent + second.estimate.minPercent;
  const maxPercent = first.estimate.maxPercent + second.estimate.maxPercent;
  const averagePercent = first.estimate.averagePercent + second.estimate.averagePercent;
  const threshold = Math.max(0, hpPercent);

  return {
    first,
    second,
    minPercent,
    maxPercent,
    averagePercent,
    guaranteedKo: minPercent >= threshold,
    possibleKo: maxPercent >= threshold,
  };
}

function actsBeforeTarget(
  actor: DoublesSelectedMember,
  target: DoublesSelectedMember,
): "before" | "tie" | "after" {
  if (actor.priority !== target.priority) {
    return actor.priority ? "before" : "after";
  }

  if (actor.speedStat > target.speedStat) {
    return "before";
  }

  if (actor.speedStat < target.speedStat) {
    return "after";
  }

  return "tie";
}

function compareDoublesTurnOrder(left: DoublesSelectedMember, right: DoublesSelectedMember) {
  if (left.priority !== right.priority) {
    return left.priority ? -1 : 1;
  }

  if (left.speedStat !== right.speedStat) {
    return right.speedStat - left.speedStat;
  }

  if (left.side !== right.side) {
    return left.side === "ally" ? -1 : 1;
  }

  return left.slotIndex - right.slotIndex;
}

function getSpeedRelationSummary(actor: DoublesSelectedMember, target: DoublesSelectedMember) {
  const relation = actsBeforeTarget(actor, target);
  const priorityNote =
    actor.priority && !target.priority
      ? ` (via priority)`
      : !actor.priority && target.priority
        ? ` (they have priority)`
        : "";

  if (relation === "before") {
    return {
      relation: "before" as const,
      summary: `${actor.pokemon.name} moves before ${target.pokemon.name}${priorityNote}.`,
    };
  }

  if (relation === "after") {
    return {
      relation: "after" as const,
      summary: `${actor.pokemon.name} moves after ${target.pokemon.name}${priorityNote}.`,
    };
  }

  return {
    relation: "tie" as const,
    summary: `${actor.pokemon.name} speed-ties ${target.pokemon.name}.`,
  };
}

function getComboTimingSummary(
  actors: [DoublesSelectedMember, DoublesSelectedMember],
  target: DoublesSelectedMember,
): DoublesComboTiming {
  const orderedActors = [...actors].sort(compareDoublesTurnOrder);
  const relations = orderedActors.map((actor) => actsBeforeTarget(actor, target));
  const fasterCount = relations.filter((relation) => relation === "before").length;
  const tieCount = relations.filter((relation) => relation === "tie").length;

  if (fasterCount === 2) {
    return {
      relation: "before",
      summary: `${orderedActors[0].pokemon.name} and ${orderedActors[1].pokemon.name} both land before ${target.pokemon.name} moves.`,
    };
  }

  if (fasterCount === 1 && tieCount === 1) {
    return {
      relation: "tie",
      summary: `${orderedActors[0].pokemon.name} moves first, then the follow-up is in a speed tie with ${target.pokemon.name}.`,
    };
  }

  if (fasterCount === 0 && tieCount === 2) {
    return {
      relation: "tie",
      summary: `Both hits are in a speed tie with ${target.pokemon.name}.`,
    };
  }

  if (fasterCount === 1) {
    return {
      relation: "split",
      summary: `${orderedActors[0].pokemon.name} lands first, but ${target.pokemon.name} can act before ${orderedActors[1].pokemon.name}.`,
    };
  }

  if (tieCount === 1) {
    return {
      relation: "split",
      summary: `One hit ties ${target.pokemon.name}; the other lands after it moves.`,
    };
  }

  return {
    relation: "after",
    summary: `${target.pokemon.name} moves before either hit lands.`,
  };
}

function buildDoublesTargetSummary(
  attackers: [DoublesSelectedMember, DoublesSelectedMember],
  target: DoublesSelectedMember,
  buildRows: (member: DoublesSelectedMember, target: DoublesSelectedMember) => AutomaticDamageRow[],
): DoublesTargetSummary {
  const attackerRows = attackers.map((member) => ({
    member,
    rows: member.protect ? [] : buildRows(member, target),
  })) as [
    { member: DoublesSelectedMember; rows: AutomaticDamageRow[] },
    { member: DoublesSelectedMember; rows: AutomaticDamageRow[] },
  ];

  const hpThreshold = Math.max(0, target.hpPercent);

  return {
    target,
    singles: attackerRows.map(({ member, rows }) => {
      const speedOutcome = getSpeedRelationSummary(member, target);

      return {
        member,
        bestRow: getBestAutomaticDamageRow(rows),
        speedRelation: speedOutcome.relation,
        timingSummary: member.protect
          ? `${member.pokemon.name} is using Protect this turn.`
          : speedOutcome.summary,
      };
    }),
    bestDoubleUp: getBestCombinedDamageSummary(attackerRows[0].rows, attackerRows[1].rows, "any", hpThreshold),
    bestDoubleUpTiming: getComboTimingSummary([attackerRows[0].member, attackerRows[1].member], target),
    bestSpreadSingle: getBestCombinedDamageSummary(
      attackerRows[0].rows,
      attackerRows[1].rows,
      "spreadAndSingle",
      hpThreshold,
    ),
    bestSpreadSingleTiming: getComboTimingSummary([attackerRows[0].member, attackerRows[1].member], target),
  };
}

function getDoublesRelationPriority(relation: DoublesVisualPlan["relation"]) {
  switch (relation) {
    case "before":
      return 4;
    case "tie":
      return 3;
    case "split":
      return 2;
    case "after":
    default:
      return 1;
  }
}

function formatDoublesTimingLabel(
  relation: DoublesVisualPlan["relation"],
  perspective: "ally" | "enemy",
) {
  if (relation === "before") {
    return perspective === "ally" ? "Before Move" : "Before Your Move";
  }

  if (relation === "tie") {
    return "Speed Tie";
  }

  if (relation === "split") {
    return "Acts Between";
  }

  return perspective === "ally" ? "After Move" : "After Your Move";
}

function getDoublesPlanTone(options: {
  guaranteedKo: boolean;
  possibleKo: boolean;
  averagePercent: number;
  perspective: "ally" | "enemy";
}) {
  const { guaranteedKo, possibleKo, averagePercent, perspective } = options;

  if (perspective === "ally") {
    if (guaranteedKo) {
      return "great" as const;
    }

    if (possibleKo) {
      return "good" as const;
    }

    if (averagePercent >= 70) {
      return "warn" as const;
    }

    return "neutral" as const;
  }

  if (guaranteedKo) {
    return "danger" as const;
  }

  if (possibleKo) {
    return "warn" as const;
  }

  if (averagePercent >= 70) {
    return "warn" as const;
  }

  return "neutral" as const;
}

function formatDoublesStatusLabel(options: {
  guaranteedKo: boolean;
  possibleKo: boolean;
  averagePercent: number;
  perspective: "ally" | "enemy";
}) {
  const { guaranteedKo, possibleKo, averagePercent, perspective } = options;

  if (guaranteedKo) {
    return "Guaranteed KO";
  }

  if (possibleKo) {
    return perspective === "ally" ? "Roll KO" : "KO Threat";
  }

  if (averagePercent >= 70) {
    return perspective === "ally" ? "Heavy Pressure" : "Heavy Threat";
  }

  if (averagePercent >= 40) {
    return perspective === "ally" ? "Pressure" : "Threat";
  }

  return perspective === "ally" ? "Safe For Now" : "Low Threat";
}

function createComboVisualPlan(options: {
  summary: CombinedDamageSummary;
  timing: DoublesComboTiming;
  perspective: "ally" | "enemy";
  kind: "double" | "spread";
}) {
  const { summary, timing, perspective, kind } = options;
  const averagePercent = summary.averagePercent;
  const statusLabel = formatDoublesStatusLabel({
    guaranteedKo: summary.guaranteedKo,
    possibleKo: summary.possibleKo,
    averagePercent,
    perspective,
  });

  return {
    kind,
    guaranteedKo: summary.guaranteedKo,
    possibleKo: summary.possibleKo,
    relation: timing.relation,
    statusLabel,
    timingLabel: formatDoublesTimingLabel(timing.relation, perspective),
    tone: getDoublesPlanTone({
      guaranteedKo: summary.guaranteedKo,
      possibleKo: summary.possibleKo,
      averagePercent,
      perspective,
    }),
    actorsLabel:
      kind === "spread"
        ? `${getAttackLabel(summary.first.attack)} + ${getAttackLabel(summary.second.attack)}`
        : `${summary.first.attack.label?.trim() ? summary.first.attack.label : getAttackLabel(summary.first.attack)} + ${
            summary.second.attack.label?.trim() ? summary.second.attack.label : getAttackLabel(summary.second.attack)
          }`,
    attacksLabel: `${TYPE_META[summary.first.estimate.effectiveAttackType].label} + ${
      TYPE_META[summary.second.estimate.effectiveAttackType].label
    }`,
    rangeLabel: `${formatPercent(summary.minPercent)}% - ${formatPercent(summary.maxPercent)}%`,
    note: timing.summary,
    averagePercent,
  } satisfies DoublesVisualPlan;
}

function createBlockedVisualPlan(
  target: DoublesSelectedMember,
  perspective: "ally" | "enemy",
): DoublesVisualPlan {
  return {
    kind: "none",
    guaranteedKo: false,
    possibleKo: false,
    relation: "tie",
    statusLabel: "Blocked by Protect",
    timingLabel: "Protect",
    tone: "neutral",
    actorsLabel: target.pokemon.name,
    attacksLabel: `${target.pokemon.name} is using Protect this turn`,
    rangeLabel: "--",
    note: perspective === "ally" ? "No damage goes through — plan around it." : "You are safe this turn.",
    averagePercent: 0,
  };
}

function createSingleVisualPlan(options: {
  summary: DoublesSingleLineSummary;
  perspective: "ally" | "enemy";
  targetHpPercent: number;
}) {
  const { summary, perspective, targetHpPercent } = options;

  if (summary.member.protect) {
    return {
      kind: "none",
      guaranteedKo: false,
      possibleKo: false,
      relation: "after",
      statusLabel: perspective === "ally" ? "Protecting" : "Protecting",
      timingLabel: "Protect",
      tone: "neutral",
      actorsLabel: summary.member.pokemon.name,
      attacksLabel: `${summary.member.pokemon.name} is using Protect`,
      rangeLabel: "--",
      note: summary.timingSummary,
      averagePercent: 0,
    } satisfies DoublesVisualPlan;
  }

  if (!summary.bestRow) {
    return {
      kind: "none",
      guaranteedKo: false,
      possibleKo: false,
      relation: "after",
      statusLabel: perspective === "ally" ? "No Line" : "No Threat",
      timingLabel: "No Damage",
      tone: "neutral",
      actorsLabel: summary.member.pokemon.name,
      attacksLabel: "No damaging move found",
      rangeLabel: "--",
      note: summary.timingSummary,
      averagePercent: 0,
    } satisfies DoublesVisualPlan;
  }

  const threshold = Math.max(0, targetHpPercent);
  const guaranteedKo = summary.bestRow.estimate.minPercent >= threshold;
  const possibleKo = summary.bestRow.estimate.maxPercent >= threshold;
  const averagePercent = summary.bestRow.estimate.averagePercent;

  return {
    kind: "single",
    guaranteedKo,
    possibleKo,
    relation: summary.speedRelation,
    statusLabel: formatDoublesStatusLabel({
      guaranteedKo,
      possibleKo,
      averagePercent,
      perspective,
    }),
    timingLabel: formatDoublesTimingLabel(summary.speedRelation, perspective),
    tone: getDoublesPlanTone({
      guaranteedKo,
      possibleKo,
      averagePercent,
      perspective,
    }),
    actorsLabel: summary.member.pokemon.name,
    attacksLabel: getAttackLabel(summary.bestRow.attack),
    rangeLabel: `${formatPercent(summary.bestRow.estimate.minPercent)}% - ${formatPercent(summary.bestRow.estimate.maxPercent)}%`,
    note: summary.timingSummary,
    averagePercent,
  } satisfies DoublesVisualPlan;
}

function getDoublesVisualPlanScore(plan: DoublesVisualPlan) {
  return (
    (plan.guaranteedKo ? 10000 : plan.possibleKo ? 7000 : 0) +
    getDoublesRelationPriority(plan.relation) * 1000 +
    Math.round(plan.averagePercent)
  );
}

function getBestDoublesVisualPlan(summary: DoublesTargetSummary, perspective: "ally" | "enemy") {
  if (summary.target.protect) {
    return createBlockedVisualPlan(summary.target, perspective);
  }

  const plans: DoublesVisualPlan[] = [];

  if (summary.bestDoubleUp && summary.bestDoubleUpTiming) {
    plans.push(
      createComboVisualPlan({
        summary: summary.bestDoubleUp,
        timing: summary.bestDoubleUpTiming,
        perspective,
        kind: "double",
      }),
    );
  }

  if (summary.bestSpreadSingle && summary.bestSpreadSingleTiming) {
    plans.push(
      createComboVisualPlan({
        summary: summary.bestSpreadSingle,
        timing: summary.bestSpreadSingleTiming,
        perspective,
        kind: "spread",
      }),
    );
  }

  for (const singleSummary of summary.singles) {
    plans.push(
      createSingleVisualPlan({
        summary: singleSummary,
        perspective,
        targetHpPercent: summary.target.hpPercent,
      }),
    );
  }

  if (plans.length === 0) {
    return {
      kind: "none",
      guaranteedKo: false,
      possibleKo: false,
      relation: "after",
      statusLabel: perspective === "ally" ? "No Line" : "No Threat",
      timingLabel: "No Damage",
      tone: "neutral",
      actorsLabel: summary.target.pokemon.name,
      attacksLabel: "No attacking line found",
      rangeLabel: "--",
      note: "",
      averagePercent: 0,
    } satisfies DoublesVisualPlan;
  }

  return plans.slice(1).reduce<DoublesVisualPlan>(
    (best, current) => (getDoublesVisualPlanScore(current) > getDoublesVisualPlanScore(best) ? current : best),
    plans[0],
  );
}

type DoublesAssignmentHit = {
  attacker: DoublesSelectedMember;
  row: AutomaticDamageRow;
  landsBeforeTarget: boolean;
};

type DoublesStrategyTargetResult = {
  target: DoublesSelectedMember;
  hits: DoublesAssignmentHit[];
  minPercent: number;
  maxPercent: number;
  averagePercent: number;
  guaranteedKo: boolean;
  possibleKo: boolean;
  koBeforeTarget: boolean;
  overkillPercent: number;
  rangeLabel: string;
  statusLabel: string;
  tone: "great" | "good" | "warn" | "danger" | "neutral";
  timingLabel: string;
  relation: "before" | "tie" | "split" | "after";
};

type DoublesStrategyAssignment = {
  attacker: DoublesSelectedMember;
  target: DoublesSelectedMember;
  row: AutomaticDamageRow | null;
  landsBeforeTarget: boolean;
  mode: "attack" | "protect";
};

type DoublesStrategyPlan = {
  id: string;
  label: string;
  assignments: DoublesStrategyAssignment[];
  targetResults: DoublesStrategyTargetResult[];
  score: number;
  koCount: number;
  preemptiveKoCount: number;
  protectSlots: number[];
};

function computeDoublesStrategyTargetResult(
  target: DoublesSelectedMember,
  rawHits: Array<{ attacker: DoublesSelectedMember; row: AutomaticDamageRow | null }>,
  perspective: "ally" | "enemy",
): DoublesStrategyTargetResult {
  if (target.protect) {
    return {
      target,
      hits: [],
      minPercent: 0,
      maxPercent: 0,
      averagePercent: 0,
      guaranteedKo: false,
      possibleKo: false,
      koBeforeTarget: false,
      overkillPercent: 0,
      rangeLabel: "--",
      statusLabel: "Blocked by Protect",
      tone: "neutral",
      timingLabel: "Protect",
      relation: "tie",
    };
  }

  const hits: DoublesAssignmentHit[] = rawHits
    .filter(
      (entry): entry is { attacker: DoublesSelectedMember; row: AutomaticDamageRow } =>
        Boolean(entry.row) && !entry.attacker.protect,
    )
    .map((entry) => ({
      attacker: entry.attacker,
      row: entry.row,
      landsBeforeTarget: actsBeforeTarget(entry.attacker, target) === "before",
    }));

  if (hits.length === 0) {
    return {
      target,
      hits: [],
      minPercent: 0,
      maxPercent: 0,
      averagePercent: 0,
      guaranteedKo: false,
      possibleKo: false,
      koBeforeTarget: false,
      overkillPercent: 0,
      rangeLabel: "--",
      statusLabel: perspective === "ally" ? "Ignored" : "Safe",
      tone: "neutral",
      timingLabel: "No Hit",
      relation: "after",
    };
  }

  const hpThreshold = Math.max(0, target.hpPercent);
  const minPercent = hits.reduce((sum, hit) => sum + hit.row.estimate.minPercent, 0);
  const maxPercent = hits.reduce((sum, hit) => sum + hit.row.estimate.maxPercent, 0);
  const averagePercent = hits.reduce((sum, hit) => sum + hit.row.estimate.averagePercent, 0);
  const guaranteedKo = minPercent >= hpThreshold;
  const possibleKo = maxPercent >= hpThreshold;
  const koBeforeTarget = hits.every((hit) => hit.landsBeforeTarget);
  const overkillPercent = guaranteedKo ? Math.max(0, minPercent - hpThreshold) : 0;

  const statusLabel = formatDoublesStatusLabel({
    guaranteedKo,
    possibleKo,
    averagePercent,
    perspective,
  });
  const tone = getDoublesPlanTone({
    guaranteedKo,
    possibleKo,
    averagePercent,
    perspective,
  });

  let relation: DoublesStrategyTargetResult["relation"];
  if (hits.length === 1) {
    const single = actsBeforeTarget(hits[0].attacker, target);
    relation = single;
  } else {
    const relations = hits.map((hit) => actsBeforeTarget(hit.attacker, target));
    const beforeCount = relations.filter((r) => r === "before").length;
    const afterCount = relations.filter((r) => r === "after").length;
    const tieCount = relations.filter((r) => r === "tie").length;
    if (beforeCount === relations.length) {
      relation = "before";
    } else if (afterCount === relations.length) {
      relation = "after";
    } else if (beforeCount === 0 && tieCount > 0) {
      relation = "tie";
    } else {
      relation = "split";
    }
  }

  return {
    target,
    hits,
    minPercent,
    maxPercent,
    averagePercent,
    guaranteedKo,
    possibleKo,
    koBeforeTarget,
    overkillPercent,
    rangeLabel: `${formatPercent(minPercent)}% - ${formatPercent(maxPercent)}%`,
    statusLabel,
    tone,
    timingLabel: formatDoublesTimingLabel(relation, perspective),
    relation,
  };
}

function scoreDoublesStrategyResults(results: DoublesStrategyTargetResult[]): {
  score: number;
  koCount: number;
  preemptiveKoCount: number;
} {
  let score = 0;
  let koCount = 0;
  let preemptiveKoCount = 0;

  for (const result of results) {
    if (result.target.protect) {
      continue;
    }

    if (result.guaranteedKo) {
      score += result.koBeforeTarget ? 12000 : 7000;
      score -= result.overkillPercent * 4;
      koCount += 1;
      if (result.koBeforeTarget) {
        preemptiveKoCount += 1;
      }
    } else if (result.possibleKo) {
      score += result.koBeforeTarget ? 4500 : 2500;
      score += Math.min(result.averagePercent, result.target.hpPercent) * 0.2;
    } else {
      score += Math.min(result.averagePercent, result.target.hpPercent);
    }
  }

  if (koCount >= 2) {
    score += 6000;
  }

  return { score, koCount, preemptiveKoCount };
}

function buildDoublesStrategies(
  attackers: [DoublesSelectedMember, DoublesSelectedMember],
  targets: [DoublesSelectedMember, DoublesSelectedMember],
  summaryByTarget: DoublesTargetSummary[],
  perspective: "ally" | "enemy",
): DoublesStrategyPlan[] {
  if (summaryByTarget.length !== 2) {
    return [];
  }

  const [sumT0, sumT1] = summaryByTarget;
  const plans: DoublesStrategyPlan[] = [];

  const makeAssignment = (
    attacker: DoublesSelectedMember,
    target: DoublesSelectedMember,
    row: AutomaticDamageRow | null,
  ): DoublesStrategyAssignment => ({
    attacker,
    target,
    row,
    landsBeforeTarget: actsBeforeTarget(attacker, target) === "before",
    mode: "attack",
  });

  const makeProtectAssignment = (attacker: DoublesSelectedMember): DoublesStrategyAssignment => ({
    attacker,
    target: attacker,
    row: null,
    landsBeforeTarget: false,
    mode: "protect",
  });

  const pushPlan = (
    id: DoublesStrategyPlan["id"],
    label: string,
    assignments: DoublesStrategyAssignment[],
    targetResults: DoublesStrategyTargetResult[],
  ) => {
    const { score, koCount, preemptiveKoCount } = scoreDoublesStrategyResults(targetResults);
    const protectSlots = assignments
      .filter((a) => a.mode === "protect")
      .map((a) => a.attacker.slotIndex);
    plans.push({ id, label, assignments, targetResults, score, koCount, preemptiveKoCount, protectSlots });
  };

  if (sumT0.bestDoubleUp) {
    const combo = sumT0.bestDoubleUp;
    const res0 = computeDoublesStrategyTargetResult(
      targets[0],
      [
        { attacker: attackers[0], row: combo.first },
        { attacker: attackers[1], row: combo.second },
      ],
      perspective,
    );
    const res1 = computeDoublesStrategyTargetResult(targets[1], [], perspective);
    pushPlan(
      "focus-t0",
      `Focus fire ${targets[0].pokemon.name}`,
      [
        makeAssignment(attackers[0], targets[0], combo.first),
        makeAssignment(attackers[1], targets[0], combo.second),
      ],
      [res0, res1],
    );
  }

  if (sumT1.bestDoubleUp) {
    const combo = sumT1.bestDoubleUp;
    const res0 = computeDoublesStrategyTargetResult(targets[0], [], perspective);
    const res1 = computeDoublesStrategyTargetResult(
      targets[1],
      [
        { attacker: attackers[0], row: combo.first },
        { attacker: attackers[1], row: combo.second },
      ],
      perspective,
    );
    pushPlan(
      "focus-t1",
      `Focus fire ${targets[1].pokemon.name}`,
      [
        makeAssignment(attackers[0], targets[1], combo.first),
        makeAssignment(attackers[1], targets[1], combo.second),
      ],
      [res0, res1],
    );
  }

  {
    const rowAT0 = sumT0.singles[0]?.bestRow ?? null;
    const rowBT1 = sumT1.singles[1]?.bestRow ?? null;
    const res0 = computeDoublesStrategyTargetResult(
      targets[0],
      [{ attacker: attackers[0], row: rowAT0 }],
      perspective,
    );
    const res1 = computeDoublesStrategyTargetResult(
      targets[1],
      [{ attacker: attackers[1], row: rowBT1 }],
      perspective,
    );
    pushPlan(
      "split-ab",
      `${attackers[0].pokemon.name} → ${targets[0].pokemon.name}, ${attackers[1].pokemon.name} → ${targets[1].pokemon.name}`,
      [makeAssignment(attackers[0], targets[0], rowAT0), makeAssignment(attackers[1], targets[1], rowBT1)],
      [res0, res1],
    );
  }

  {
    const rowAT1 = sumT1.singles[0]?.bestRow ?? null;
    const rowBT0 = sumT0.singles[1]?.bestRow ?? null;
    const res0 = computeDoublesStrategyTargetResult(
      targets[0],
      [{ attacker: attackers[1], row: rowBT0 }],
      perspective,
    );
    const res1 = computeDoublesStrategyTargetResult(
      targets[1],
      [{ attacker: attackers[0], row: rowAT1 }],
      perspective,
    );
    pushPlan(
      "split-ba",
      `${attackers[0].pokemon.name} → ${targets[1].pokemon.name}, ${attackers[1].pokemon.name} → ${targets[0].pokemon.name}`,
      [makeAssignment(attackers[0], targets[1], rowAT1), makeAssignment(attackers[1], targets[0], rowBT0)],
      [res0, res1],
    );
  }

  if (!attackers[0].protect && !attackers[1].protect) {
    const protectTemplates: Array<{
      id: DoublesStrategyPlan["id"];
      protectingIndex: 0 | 1;
      attackingIndex: 0 | 1;
      targetIndex: 0 | 1;
    }> = [
      { id: "protect-a-hit-t0", protectingIndex: 0, attackingIndex: 1, targetIndex: 0 },
      { id: "protect-a-hit-t1", protectingIndex: 0, attackingIndex: 1, targetIndex: 1 },
      { id: "protect-b-hit-t0", protectingIndex: 1, attackingIndex: 0, targetIndex: 0 },
      { id: "protect-b-hit-t1", protectingIndex: 1, attackingIndex: 0, targetIndex: 1 },
    ];

    for (const template of protectTemplates) {
      const protector = attackers[template.protectingIndex];
      const attacker = attackers[template.attackingIndex];
      const target = targets[template.targetIndex];
      const row = summaryByTarget[template.targetIndex].singles[template.attackingIndex]?.bestRow ?? null;

      const hits = [{ attacker, row }];
      const otherTargetIndex = template.targetIndex === 0 ? 1 : 0;
      const resultAttacked = computeDoublesStrategyTargetResult(target, hits, perspective);
      const resultIdle = computeDoublesStrategyTargetResult(targets[otherTargetIndex], [], perspective);

      const results =
        template.targetIndex === 0 ? [resultAttacked, resultIdle] : [resultIdle, resultAttacked];

      const assignments =
        template.protectingIndex === 0
          ? [makeProtectAssignment(protector), makeAssignment(attacker, target, row)]
          : [makeAssignment(attacker, target, row), makeProtectAssignment(protector)];

      pushPlan(
        template.id,
        `Protect ${protector.pokemon.name}, ${attacker.pokemon.name} → ${target.pokemon.name}`,
        assignments,
        results,
      );
    }
  }

  return plans;
}

function adjustDoublesStrategyWithTargetProtect(
  strategy: DoublesStrategyPlan,
  protectedTargetSlotIndices: Set<number>,
): DoublesStrategyPlan {
  if (protectedTargetSlotIndices.size === 0) {
    return strategy;
  }

  const adjustedResults = strategy.targetResults.map((result) => {
    if (protectedTargetSlotIndices.has(result.target.slotIndex)) {
      return {
        ...result,
        hits: [],
        minPercent: 0,
        maxPercent: 0,
        averagePercent: 0,
        guaranteedKo: false,
        possibleKo: false,
        koBeforeTarget: false,
        overkillPercent: 0,
        rangeLabel: "--",
        statusLabel: "Blocked by Protect",
        tone: "neutral" as const,
        timingLabel: "Protect",
        relation: "tie" as const,
      };
    }
    return result;
  });

  const { score, koCount, preemptiveKoCount } = scoreDoublesStrategyResults(adjustedResults);

  return {
    ...strategy,
    targetResults: adjustedResults,
    score,
    koCount,
    preemptiveKoCount,
  };
}

function getBestCombinedDamageSummary(
  leftRows: AutomaticDamageRow[],
  rightRows: AutomaticDamageRow[],
  mode: "any" | "spreadAndSingle",
  hpPercent: number = 100,
) {
  let best: CombinedDamageSummary | null = null;

  for (const left of leftRows) {
    for (const right of rightRows) {
      if (mode === "spreadAndSingle" && left.isSpreadMove === right.isSpreadMove) {
        continue;
      }

      const combined = getCombinedDamageSummary(left, right, hpPercent);

      if (!best) {
        best = combined;
        continue;
      }

      if (combined.averagePercent !== best.averagePercent) {
        best = combined.averagePercent > best.averagePercent ? combined : best;
        continue;
      }

      if (combined.maxPercent !== best.maxPercent) {
        best = combined.maxPercent > best.maxPercent ? combined : best;
        continue;
      }

      if (combined.minPercent !== best.minPercent) {
        best = combined.minPercent > best.minPercent ? combined : best;
      }
    }
  }

  return best;
}

function getPokemonAttackTypeOptions(pokemon: PokemonRecord) {
  return pokemon.types
    .map((typeLabel) => getTypeFromLabel(typeLabel))
    .filter((type): type is PokemonType => Boolean(type));
}

function createStabProxySavedAttacks(pokemon: PokemonRecord) {
  return getPokemonAttackTypeOptions(pokemon).map((type, index) =>
    createSavedAttack(pokemon, {
      id: `stab-${pokemon.id}-${type}-${index}`,
      label: `${TYPE_META[type].label} STAB`,
      type,
    }),
  );
}

function getInferredEngineMoveNames(options: {
  pokemon: PokemonRecord;
  savedAttacks: PersistedSavedAttack[];
  presetMoveNames: string[];
  moveByKey: ReadonlyMap<string, MoveRecord>;
  movesetSource: "custom" | "preset" | "none";
}) {
  void options;
  return [];
}

function getStoredOrPresetSavedAttacks(
  pokemon: PokemonRecord,
  speciesMovesetByKey: ReadonlyMap<string, PersistedSpeciesMoveset>,
  moveByKey: ReadonlyMap<string, MoveRecord>,
  limit = MAX_SPECIES_MOVESET_SIZE,
): ResolvedSpeciesMoveset {
  return resolveStoredOrPresetMoveset({
    pokemon,
    speciesMovesetByKey,
    moveByKey,
    limit,
    normalizePokemonNameKey,
    getResolvedPresetAbilityName,
    isChampionsMegaEntry,
    getInheritedMovesetKey,
    sanitizeSavedAttacks,
    sanitizeKnownMovesToSavedAttacks,
  });
}

function buildPreviewBattleEngineAllyMembersFromTeam(
  team: LoadedTeamSlot[],
  speciesMovesetByKey: ReadonlyMap<string, PersistedSpeciesMoveset>,
  moveByKey: ReadonlyMap<string, MoveRecord>,
) {
  return team.flatMap((slot, slotIndex) => {
    if (!slot.pokemon) {
      return [];
    }

    const resolvedMoveset = resolveStoredOrPresetMoveset({
      pokemon: slot.pokemon,
      speciesMovesetByKey,
      moveByKey,
      limit: MAX_SPECIES_MOVESET_SIZE,
      normalizePokemonNameKey,
      getResolvedPresetAbilityName,
      isChampionsMegaEntry,
      getInheritedMovesetKey,
      sanitizeSavedAttacks,
      sanitizeKnownMovesToSavedAttacks,
    });

    return [
      buildAllyBattleStateMember({
        slotIndex,
        pokemon: slot.pokemon,
        slotSavedAttacks: slot.savedAttacks,
        resolvedMoveset: {
          ...resolvedMoveset,
          itemName: slot.itemName,
          statSpread: slot.resolvedStatSpread,
        },
        moveByKey,
        runtime: DEFAULT_BATTLE_SIMULATOR_MEMBER_STATE,
        isActive: false,
      }),
    ];
  });
}

function getEditablePokemonEntries(
  database: PokemonRecord[] | null,
  speciesMovesetByKey: ReadonlyMap<string, PersistedSpeciesMoveset>,
) {
  return (database ?? [])
    .filter((pokemon) => {
      if (isChampionsSuppressedBaseForm(pokemon)) {
        return false;
      }

      const movesetKey = getPokemonMovesetKey(pokemon);

      return (
        isChampionsPlayableBaseForm(pokemon) ||
        isChampionsMegaEntry(pokemon) ||
        OPPONENT_MOVE_PRESET_KEY_SET.has(movesetKey) ||
        speciesMovesetByKey.has(movesetKey)
      );
    })
    .sort((left, right) => {
      const leftOrder = LEGAL_ORDER_BY_KEY.get(getPokemonBaseSpeciesKey(left)) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = LEGAL_ORDER_BY_KEY.get(getPokemonBaseSpeciesKey(right)) ?? Number.MAX_SAFE_INTEGER;

      return leftOrder - rightOrder || left.name.localeCompare(right.name);
    });
}

function getTeamBuilderFormatEntries(
  database: PokemonRecord[] | null,
  speciesMovesetByKey: ReadonlyMap<string, PersistedSpeciesMoveset>,
  format: TeamBuilderFormat,
) {
  if (format === "all") {
    return database ?? [];
  }

  return (database ?? []).filter((pokemon) => {
    if (isChampionsSuppressedBaseForm(pokemon)) {
      return false;
    }

    const movesetKey = getPokemonMovesetKey(pokemon);
    const baseSpeciesKey = getPokemonBaseSpeciesKey(pokemon);
    const isSupportedLegalForm =
      pokemon.forme !== null &&
      POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET.has(baseSpeciesKey) &&
      (OPPONENT_MOVE_PRESET_KEY_SET.has(movesetKey) || speciesMovesetByKey.has(movesetKey));

    return isChampionsPlayableBaseForm(pokemon) || isChampionsMegaEntry(pokemon) || isSupportedLegalForm;
  });
}

function getChampionsSpeedTierEntries(database: PokemonRecord[] | null) {
  return (database ?? []).filter((pokemon) => {
    return isChampionsPlayableBaseForm(pokemon) || isChampionsMegaEntry(pokemon);
  });
}

function getCurrentRegulationMoveFinderEntries(database: PokemonRecord[] | null) {
  return (database ?? [])
    .filter((pokemon) => {
      if (isChampionsSuppressedBaseForm(pokemon)) {
        return false;
      }

      const movesetKey = getPokemonMovesetKey(pokemon);

      return (
        isChampionsPlayableBaseForm(pokemon) ||
        isChampionsMegaEntry(pokemon) ||
        OPPONENT_MOVE_PRESET_KEY_SET.has(movesetKey)
      );
    })
    .sort((left, right) => {
      const leftOrder = LEGAL_ORDER_BY_KEY.get(getPokemonBaseSpeciesKey(left)) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = LEGAL_ORDER_BY_KEY.get(getPokemonBaseSpeciesKey(right)) ?? Number.MAX_SAFE_INTEGER;

      return leftOrder - rightOrder || left.name.localeCompare(right.name);
    });
}

function getLearnsetMoveIdsForPokemon(
  pokemon: PokemonRecord,
  learnsetBySpeciesId: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const moveIds = new Set<string>();
  const ownLearnset = learnsetBySpeciesId.get(getPokemonMovesetKey(pokemon));

  for (const moveId of ownLearnset ?? []) {
    moveIds.add(moveId);
  }

  const baseSpeciesKey = getPokemonBaseSpeciesKey(pokemon);
  if (baseSpeciesKey !== getPokemonMovesetKey(pokemon)) {
    for (const moveId of learnsetBySpeciesId.get(baseSpeciesKey) ?? []) {
      moveIds.add(moveId);
    }
  }

  return moveIds;
}

function buildSpeedTierRow(pokemon: PokemonRecord): SpeedTierRow {
  const maxSpeedSpread: ChampionsStatSpread = {
    nature: "adamant",
    statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: CHAMPIONS_MAX_STAT_POINTS_PER_STAT },
  };
  const boostedSpeedSpread: ChampionsStatSpread = {
    ...maxSpeedSpread,
    nature: "jolly",
  };

  return {
    pokemon,
    baseSpeed: pokemon.baseStats.spe,
    maxSpeed: getChampionsComputedStats(pokemon, { spread: maxSpeedSpread }).spe,
    boostedSpeed: getChampionsComputedStats(pokemon, { spread: boostedSpeedSpread }).spe,
  };
}

function getMoveFinderSpeedValue(row: SpeedTierRow, metric: MoveFinderSpeedMetric) {
  if (metric === "base") {
    return row.baseSpeed;
  }

  return metric === "neutral" ? row.maxSpeed : row.boostedSpeed;
}

function getMoveFinderSpeedMetricLabel(metric: MoveFinderSpeedMetric) {
  return MOVE_FINDER_SPEED_METRIC_OPTIONS.find((option) => option.value === metric)?.shortLabel ?? "Speed";
}

function parseMoveFinderSpeedThreshold(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

function getTrainingOptimizerEntries(
  database: PokemonRecord[] | null,
  speciesMovesetByKey: ReadonlyMap<string, PersistedSpeciesMoveset>,
) {
  return getEditablePokemonEntries(database, speciesMovesetByKey);
}

function buildTrainingOptimizerAttacks(options: {
  row: TrainingMetaRow;
  includeAttackerItems: boolean;
  includeAttackerAbilities: boolean;
}) {
  const { row, includeAttackerAbilities, includeAttackerItems } = options;
  const attackerAbility = includeAttackerAbilities
    ? getDefaultDamageAbilityIdFromNames(row.moveset.abilityName ? [row.moveset.abilityName] : getPokemonAbilityNames(row.pokemon))
    : "none";
  const attackerItem = includeAttackerItems
    ? normalizeDamageItemId(row.moveset.itemName) ?? "none"
    : "none";

  return row.moveset.savedAttacks.flatMap<TrainingOptimizerAttack>((attack, index) => {
    const basePower = getResolvedAttackBasePower(attack);

    if (basePower === null) {
      return [];
    }

    return [
      {
        id: `${row.pokemon.id}-${attack.id}-${index}`,
        attacker: row.pokemon,
        label: getAttackLabel(attack),
        type: attack.type,
        basePower,
        category: getResolvedAttackCategory(attack, row.pokemon),
        isSpreadMove: getResolvedAttackSpread(attack),
        multihit: getResolvedAttackMultihit(attack) ?? null,
        attackerAbility,
        attackerAbilityName: row.moveset.abilityName,
        attackerItem,
        attackerStatSpread: row.moveset.statSpread,
        attackerGrounded: isLikelyGrounded(row.pokemon),
        movesetSource: row.moveset.movesetSource,
      },
    ];
  });
}

function formatTrainingHits(value: number) {
  if (!Number.isFinite(value)) {
    return "Immune";
  }

  return `${value} hit${value === 1 ? "" : "s"}`;
}

function formatTrainingKoLabel(value: number) {
  return getKoThresholdLabel(value).toUpperCase();
}

function formatTrainingStatAllocation(
  spread: ChampionsStatSpread,
  statIds: ChampionsStatId[],
  includeZeroFallback = false,
) {
  const entries = statIds
    .filter((statId) => spread.statPoints[statId] > 0)
    .map((statId) => `${spread.statPoints[statId]} ${CHAMPIONS_STAT_LABELS[statId]}`);

  if (entries.length > 0) {
    return entries.join(" / ");
  }

  return includeZeroFallback
    ? statIds.map((statId) => `0 ${CHAMPIONS_STAT_LABELS[statId]}`).join(" / ")
    : "No extra points";
}

function formatTrainingDefensiveAllocation(spread: ChampionsStatSpread) {
  return formatTrainingStatAllocation(spread, ["hp", "def", "spd"], true);
}

function formatTrainingRemainderAllocation(spread: ChampionsStatSpread) {
  return formatTrainingStatAllocation(spread, ["atk", "spa", "spe"]);
}

function formatTrainingMetricDelta(value: number) {
  if (!Number.isFinite(value) || value === 0) {
    return "0";
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

function getTrainingSummaryDelta(
  result: TrainingOptimizerSummary,
  baseline: TrainingOptimizerSummary | null | undefined,
  key: keyof Pick<
    TrainingOptimizerSummary,
    "totalGuaranteedHits" | "survivesOneHitCount" | "survivesTwoHitCount" | "survivesThreeHitCount"
  >,
) {
  return result[key] - (baseline?.[key] ?? 0);
}

function getTrainingBreakpointLead(
  gains: readonly TrainingOptimizerBreakpointGain[],
  result: TrainingOptimizerResult,
  baseline: TrainingOptimizerResult | null | undefined,
) {
  if (gains.length > 0) {
    const firstGain = gains[0];

    return `${gains.length} breakpoint${gains.length === 1 ? "" : "s"} improved; ${firstGain.attackerName} ${firstGain.moveLabel} changes from ${firstGain.previousKoLabel} to ${firstGain.nextKoLabel}.`;
  }

  if (baseline) {
    const worstReduction = baseline.summary.worstMaxPercent - result.summary.worstMaxPercent;

    if (worstReduction > 0.05) {
      return `No new hit-count breakpoint, but worst max damage drops by ${formatPercent(worstReduction)} percentage points.`;
    }
  }

  return "Same hit-count breakpoints as baseline; ranked by lower worst-case damage and better fallback stats.";
}

function getTrainingThreatTone(detail: TrainingOptimizerThreatDetail) {
  if (detail.guaranteedHitsSurvived >= 2) {
    return "strong";
  }

  if (detail.guaranteedHitsSurvived >= 1) {
    return "good";
  }

  return "danger";
}

function formatMatrixCell(multiplier: number | null, mode: TeamMatrixMode) {
  if (multiplier === null) {
    return "";
  }

  if (multiplier === 1) {
    return "";
  }

  if (multiplier === 0) {
    return mode === "defense" ? "Immune" : "0x";
  }

  return formatMultiplier(multiplier);
}

function getMatrixCellTone(multiplier: number | null) {
  if (multiplier === null) {
    return "empty";
  }

  if (multiplier === 0) {
    return "immune";
  }

  if (multiplier >= 4) {
    return "ultra";
  }

  if (multiplier > 1) {
    return "strong";
  }

  if (multiplier < 1) {
    return "resist";
  }

  return "neutral";
}

function buildLeadSummary(
  slotIndex: number,
  pokemon: PokemonRecord,
  attackTypes: PokemonType[],
): LeadSummary | null {
  const weakTypes: PokemonType[] = [];
  const resistTypes: PokemonType[] = [];
  const immuneTypes: PokemonType[] = [];

  for (const attackType of TYPE_ORDER) {
    const multiplier = getPokemonDefensiveMultiplier(pokemon, attackType);

    if (multiplier === null) {
      continue;
    }

    if (multiplier === 0) {
      immuneTypes.push(attackType);
    } else if (multiplier > 1) {
      weakTypes.push(attackType);
    } else if (multiplier < 1) {
      resistTypes.push(attackType);
    }
  }

  return {
    slotIndex,
    pokemon,
    weakTypes,
    resistTypes,
    immuneTypes,
    coverTypes: getCoveredDefendingTypes(attackTypes),
    attackTypes,
  };
}

function buildOpenerSummary(label: string, members: LeadSummary[]): OpenerSummary | null {
  if (members.length === 0) {
    return null;
  }

  const sharedWeakTypes: PokemonType[] = [];
  const pivotCoverTypes: PokemonType[] = [];
  const sharedResistTypes: PokemonType[] = [];

  for (const attackType of TYPE_ORDER) {
    const memberMultipliers = members
      .map((member) => getPokemonDefensiveMultiplier(member.pokemon, attackType))
      .filter((value): value is number => value !== null);

    if (memberMultipliers.length !== members.length) {
      continue;
    }

    const allWeak = memberMultipliers.every((multiplier) => multiplier > 1);
    const allResistOrImmune = memberMultipliers.every((multiplier) => multiplier < 1);
    const hasWeakMember = memberMultipliers.some((multiplier) => multiplier > 1);
    const hasResistOrImmuneMember = memberMultipliers.some((multiplier) => multiplier < 1);

    if (allWeak) {
      sharedWeakTypes.push(attackType);
    }

    if (allResistOrImmune) {
      sharedResistTypes.push(attackType);
    }

    if (hasWeakMember && hasResistOrImmuneMember) {
      pivotCoverTypes.push(attackType);
    }
  }

  return {
    label,
    members,
    sharedWeakTypes,
    pivotCoverTypes,
    sharedResistTypes,
    combinedCoverTypes: Array.from(new Set(members.flatMap((member) => member.coverTypes))),
    speedTiers: [...members]
      .sort((left, right) => right.pokemon.baseStats.spe - left.pokemon.baseStats.spe)
      .map((member) => ({
        pokemonId: member.pokemon.id,
        name: member.pokemon.name,
        speed: member.pokemon.baseStats.spe,
      })),
  };
}

type PokemonSpriteProps = {
  pokemon: Pick<PokemonRecord, "id" | "name" | "baseSpecies">;
  className?: string;
};

function PokemonSprite({ pokemon, className }: PokemonSpriteProps) {
  const [src, setSrc] = useState(() => getPokemonSpriteUrl(pokemon.id));

  useEffect(() => {
    setSrc(getPokemonSpriteUrl(pokemon.id));
  }, [pokemon.id]);

  return (
    <img
      className={className}
      src={src}
      alt={pokemon.name}
      loading="lazy"
      onError={() => {
        const fallbackSrc = getPokemonBaseSpriteUrl(pokemon.baseSpecies);
        if (src !== fallbackSrc) {
          setSrc(fallbackSrc);
        }
      }}
    />
  );
}

function DamagePickerCard({
  label,
  isSelected,
  isDisabled = false,
  pokemon,
  subtitle,
  footer,
  onClick,
}: DamagePickerCardProps) {
  return (
    <button
      type="button"
      className={`damage-picker-card ${isSelected ? "selected" : ""}`}
      onClick={onClick}
      disabled={isDisabled}
    >
      <span className="damage-picker-label">{label}</span>
      <div className={`damage-picker-sprite-frame ${pokemon ? "filled" : ""}`}>
        {pokemon ? <PokemonSprite pokemon={pokemon} className="damage-picker-sprite" /> : <span>?</span>}
      </div>
      <strong>{pokemon ? pokemon.name : "Empty Slot"}</strong>
      <span>{subtitle}</span>
      <em>{footer}</em>
    </button>
  );
}

type DamageRosterTileProps = {
  label: string;
  pokemon: PokemonRecord | null;
  footer: string;
  side: "ally" | "enemy";
  isSelected: boolean;
  isDisabled?: boolean;
  onClick: () => void;
};

function DamageRosterTile({
  label,
  pokemon,
  footer,
  side,
  isSelected,
  isDisabled = false,
  onClick,
}: DamageRosterTileProps) {
  return (
    <button
      type="button"
      className={`damage-roster-tile ${side} ${isSelected ? "selected" : ""}`}
      onClick={onClick}
      disabled={isDisabled}
      title={pokemon ? pokemon.name : label}
    >
      <span className="damage-roster-tile-label">{label}</span>
      <div className={`damage-roster-tile-frame ${pokemon ? "filled" : ""}`}>
        {pokemon ? (
          <PokemonSprite pokemon={pokemon} className="damage-roster-tile-sprite" />
        ) : (
          <span>?</span>
        )}
      </div>
      <strong>{pokemon ? pokemon.name : "Empty"}</strong>
      <em>{footer}</em>
    </button>
  );
}

type BattleSimulatorCardProps = {
  side: "ally" | "enemy";
  slotIndex: number;
  rankLabel: string;
  pokemon: PokemonRecord;
  state: BattleSimulatorMemberState;
  onChange: (patch: Partial<BattleSimulatorMemberState>) => void;
};

function BattleSimulatorCard({
  side,
  slotIndex,
  rankLabel,
  pokemon,
  state,
  onChange,
}: BattleSimulatorCardProps) {
  const computedStats = getChampionsComputedStats(pokemon);
  const maxHp = computedStats.hp;
  const actualHp = getLevel50CurrentHpFromPercent(maxHp, state.hpPercent);
  const boardLabel = side === "ally" ? `Slot ${slotIndex + 1}` : `Enemy ${slotIndex + 1}`;

  return (
    <article className={`battle-simulator-card ${side}`}>
      <div className="battle-simulator-card-head">
        <div className="battle-simulator-card-identity">
          <span className={`battle-simulator-rank ${side}`}>{rankLabel}</span>
          <PokemonSprite pokemon={pokemon} className="battle-simulator-sprite" />
          <div>
            <strong>{pokemon.name}</strong>
            <p>{boardLabel}</p>
          </div>
        </div>
        <span className="mini-type-pill neutral-pill">Spe {computedStats.spe}</span>
      </div>

      <div className="battle-simulator-card-grid">
        <label className="battle-simulator-field">
          <span>{side === "ally" ? "Current HP" : "Enemy HP %"}</span>
          <input
            type="number"
            min={0}
            max={side === "ally" ? maxHp : 100}
            step={side === "ally" ? 1 : 0.1}
            value={side === "ally" ? actualHp : Number(state.hpPercent.toFixed(1))}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              if (!Number.isFinite(nextValue)) {
                return;
              }

              if (side === "ally") {
                const normalizedHp = Math.max(0, Math.min(maxHp, Math.round(nextValue)));
                onChange({
                  hpPercent: maxHp > 0 ? (normalizedHp / maxHp) * 100 : 0,
                });
                return;
              }

              onChange({
                hpPercent: clampPercent(nextValue),
              });
            }}
          />
          <small>
            {side === "ally" ? `${formatPercent(state.hpPercent)}% of ${maxHp}` : `${actualHp} / ${maxHp} approx.`}
          </small>
        </label>

        <label className="battle-simulator-field">
          <span>Status</span>
          <select
            value={state.statusCondition}
            onChange={(event) => {
              const statusCondition = event.target.value as BattleStatusCondition;
              onChange({
                statusCondition,
                sleepTurns:
                  statusCondition === "sleep"
                    ? Math.max(1, state.sleepTurns || DEFAULT_BATTLE_SIMULATOR_MEMBER_STATE.sleepTurns || 2)
                    : 0,
                toxicTurns: statusCondition === "badPoison" ? Math.max(1, state.toxicTurns || 1) : 0,
              });
            }}
          >
            {BATTLE_STATUS_OPTIONS.map((option) => (
              <option key={`battle-status-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {state.statusCondition === "sleep" ? (
          <label className="battle-simulator-field">
            <span>Sleep turns</span>
            <select
              value={Math.max(1, state.sleepTurns || 2)}
              onChange={(event) =>
                onChange({
                  sleepTurns: Math.max(1, Number(event.target.value) || 2),
                })
              }
            >
              {[1, 2, 3].map((turnCount) => (
                <option key={`battle-sleep-turns-${turnCount}`} value={turnCount}>
                  {turnCount}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {state.statusCondition === "badPoison" ? (
          <label className="battle-simulator-field">
            <span>Toxic turns</span>
            <select
              value={Math.max(1, state.toxicTurns || 1)}
              onChange={(event) =>
                onChange({
                  toxicTurns: Math.max(1, Number(event.target.value) || 1),
                })
              }
            >
              {Array.from({ length: 15 }, (_, index) => index + 1).map((turnCount) => (
                <option key={`battle-toxic-turns-${turnCount}`} value={turnCount}>
                  {turnCount}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {([
          ["Atk", "attackStage"],
          ["Def", "defenseStage"],
          ["Spe", "speedStage"],
        ] as const).map(([label, field]) => (
          <label key={`battle-stage-${side}-${slotIndex}-${field}`} className="battle-simulator-field compact">
            <span>{label}</span>
            <select
              value={state[field]}
              onChange={(event) =>
                onChange({
                  [field]: clampStatStage(Number(event.target.value) || 0),
                })
              }
            >
              {BATTLE_STAGE_OPTIONS.map((stageValue) => (
                <option key={`battle-stage-option-${stageValue}`} value={stageValue}>
                  {stageValue >= 0 ? `+${stageValue}` : stageValue}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </article>
  );
}

type BattleScenarioOption = {
  id: string;
  label: string;
  subtitle: string;
  state: BattleState;
  events: TurnEvent[];
};

function formatBattlefieldStatusLabel(statusCondition: BattleStatusCondition, sleepTurns: number, toxicTurns = 0) {
  switch (statusCondition) {
    case "burn":
      return "BRN";
    case "paralysis":
      return "PAR";
    case "sleep":
      return `SLP ${Math.max(1, sleepTurns || 1)}`;
    case "poison":
      return "PSN";
    case "badPoison":
      return `TOX ${Math.max(1, toxicTurns || 1)}`;
    case "freeze":
      return "FRZ";
    default:
      return null;
  }
}

function getBattlefieldStageChips(state: BattleState, combatantId: string | null) {
  if (!combatantId) {
    return [];
  }

  const combatant = state.combatants[combatantId];
  if (!combatant) {
    return [];
  }

  return ([
    ["Atk", combatant.stages.attack],
    ["Def", combatant.stages.defense],
    ["Spe", combatant.stages.speed],
  ] as const)
    .filter(([, value]) => value !== 0)
    .map(([label, value]) => ({
      label,
      value,
      tone: value > 0 ? "boost" : "drop",
    }));
}

type BattlefieldPokemonSlotProps = {
  state: BattleState;
  combatantId: string | null;
  side: "ally" | "enemy";
  rankLabel: string;
};

function BattlefieldPokemonSlot({ state, combatantId, side, rankLabel }: BattlefieldPokemonSlotProps) {
  const combatant = combatantId ? state.combatants[combatantId] ?? null : null;
  if (!combatant) {
    return (
      <article className={`battlefield-slot ${side} empty`}>
        <span className="battlefield-slot-rank">{rankLabel}</span>
        <div className="battlefield-slot-empty">Open slot</div>
      </article>
    );
  }

  const hpPercent = combatant.maxHp > 0 ? clampPercent((combatant.currentHp / combatant.maxHp) * 100) : 0;
  const statusLabel = formatBattlefieldStatusLabel(combatant.statusCondition, combatant.sleepTurns, combatant.toxicTurns);
  const stageChips = getBattlefieldStageChips(state, combatantId);
  const sideLabel = side === "ally" ? `Slot ${combatant.teamIndex + 1}` : `Enemy ${combatant.teamIndex + 1}`;

  return (
    <article className={`battlefield-slot ${side}`}>
      <div className="battlefield-slot-head">
        <span className="battlefield-slot-rank">{rankLabel}</span>
        <span className="battlefield-slot-side">{sideLabel}</span>
      </div>
      <PokemonSprite pokemon={combatant.pokemon} className="battlefield-slot-sprite" />
      <div className="battlefield-slot-copy">
        <strong>{combatant.pokemon.name}</strong>
        <span>{combatant.pokemon.types.join(" / ")}</span>
      </div>
      <div className="battlefield-slot-hp">
        <div className="battlefield-slot-hp-bar">
          <span
            className={`battlefield-slot-hp-fill ${
              hpPercent <= 25 ? "danger" : hpPercent <= 50 ? "warn" : "healthy"
            }`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
        <small>
          {combatant.currentHp}/{combatant.maxHp} HP
        </small>
      </div>
      <div className="battlefield-slot-meta">
        {statusLabel ? <span className="battlefield-meta-pill status">{statusLabel}</span> : null}
        {combatant.isProtected ? <span className="battlefield-meta-pill">Protect</span> : null}
        {combatant.isFlinched ? <span className="battlefield-meta-pill">Flinch</span> : null}
        {combatant.encoreTurns > 0 ? <span className="battlefield-meta-pill">Encore</span> : null}
        {combatant.disableTurns > 0 ? <span className="battlefield-meta-pill">Disable</span> : null}
      </div>
      {stageChips.length > 0 ? (
        <div className="battlefield-stage-list">
          {stageChips.map((chip) => (
            <span key={`battlefield-stage-${combatant.id}-${chip.label}`} className={`battlefield-stage-pill ${chip.tone}`}>
              {chip.label} {chip.value > 0 ? `+${chip.value}` : chip.value}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

type BattlefieldStateViewProps = {
  state: BattleState;
  title: string;
  subtitle: string;
  events?: TurnEvent[];
  onApply?: () => void;
  applyDisabled?: boolean;
};

function BattlefieldStateView({
  state,
  title,
  subtitle,
  events = [],
  onApply,
  applyDisabled = false,
}: BattlefieldStateViewProps) {
  const allyActives = state.sides.ally.activeIds;
  const enemyActives = state.sides.enemy.activeIds;
  const fieldPills = [
    state.field.weather !== "none" ? `Weather ${state.field.weather}` : null,
    state.field.terrain !== "none" ? `Terrain ${state.field.terrain}` : null,
    state.field.trickRoomTurns > 0 ? `Trick Room ${state.field.trickRoomTurns}` : null,
    state.sides.ally.tailwindTurns > 0 ? `My Tailwind ${state.sides.ally.tailwindTurns}` : null,
    state.sides.enemy.tailwindTurns > 0 ? `Enemy Tailwind ${state.sides.enemy.tailwindTurns}` : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <section className="battlefield-preview">
      <div className="coverage-preview-header">
        <div>
          <p className="eyebrow">Projected Battlefield</p>
          <h3>{title}</h3>
        </div>
        {onApply ? (
          <button type="button" className="secondary-button" onClick={onApply} disabled={applyDisabled}>
            Apply To Board
          </button>
        ) : null}
      </div>
      <p className="selector-note battlefield-preview-note">{subtitle}</p>

      <div className="battlefield-board">
        <div className="battlefield-side enemy">
          {(["A", "B"] as const).map((rankLabel, index) => (
            <BattlefieldPokemonSlot
              key={`battlefield-enemy-${rankLabel}`}
              state={state}
              combatantId={enemyActives[index] ?? null}
              side="enemy"
              rankLabel={rankLabel}
            />
          ))}
        </div>

        <div className="battlefield-center">
          <div className="battlefield-center-ring">
            <span className="battlefield-center-turn">Turn {state.field.turn}</span>
            <div className="battlefield-center-pills">
              {fieldPills.length > 0 ? fieldPills.map((pill) => <span key={pill} className="battlefield-meta-pill">{pill}</span>) : <span className="battlefield-meta-pill">Neutral field</span>}
            </div>
            <small>
              Ally bench {state.sides.ally.benchIds.length} · Enemy bench {state.sides.enemy.benchIds.length}
            </small>
          </div>
        </div>

        <div className="battlefield-side ally">
          {(["A", "B"] as const).map((rankLabel, index) => (
            <BattlefieldPokemonSlot
              key={`battlefield-ally-${rankLabel}`}
              state={state}
              combatantId={allyActives[index] ?? null}
              side="ally"
              rankLabel={rankLabel}
            />
          ))}
        </div>
      </div>

      {events.length > 0 ? (
        <div className="battlefield-event-list">
          {events.slice(0, 8).map((event, index) => (
            <p key={`battlefield-event-${index}`}>{event.text}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

type ModChip = { key: string; label: string; tone?: "boost" | "cut" | "stab" | "se" | "ne" };

function buildDamageModChips(
  estimate: ReturnType<typeof calculateRoughDamage>,
  category: DamageCategory,
): ModChip[] {
  const chips: ModChip[] = [];
  chips.push({
    key: "atk",
    label: `${category === "physical" ? "Atk" : "SpA"} ${estimate.attackStat}`,
  });
  chips.push({
    key: "def",
    label: `${category === "physical" ? "Def" : "SpD"} ${estimate.defenseStat}`,
  });
  if (estimate.stabMultiplier !== 1) {
    chips.push({
      key: "stab",
      label: `STAB ${formatFlatMultiplier(estimate.stabMultiplier)}`,
      tone: "stab",
    });
  }
  if (estimate.typeMultiplier !== 1) {
    chips.push({
      key: "type",
      label: `Type ${formatFlatMultiplier(estimate.typeMultiplier)}`,
      tone: estimate.typeMultiplier > 1 ? "se" : estimate.typeMultiplier === 0 ? "ne" : "cut",
    });
  }
  if (estimate.effectiveBasePower !== estimate.inputBasePower) {
    chips.push({
      key: "basePower",
      label: `BP ${estimate.effectiveBasePower}`,
      tone: "boost",
    });
  }
  if (estimate.spreadMultiplier !== 1) {
    chips.push({
      key: "spread",
      label: `Spread ${formatFlatMultiplier(estimate.spreadMultiplier)}`,
      tone: "cut",
    });
  }
  if (estimate.weatherMultiplier !== 1) {
    chips.push({
      key: "weather",
      label: `Weather ${formatFlatMultiplier(estimate.weatherMultiplier)}`,
      tone: estimate.weatherMultiplier > 1 ? "boost" : "cut",
    });
  }
  if (estimate.terrainMultiplier !== 1) {
    chips.push({
      key: "terrain",
      label: `Terrain ${formatFlatMultiplier(estimate.terrainMultiplier)}`,
      tone: estimate.terrainMultiplier > 1 ? "boost" : "cut",
    });
  }
  if (estimate.abilityMultiplier !== 1) {
    chips.push({
      key: "ability",
      label: `Ability ${formatFlatMultiplier(estimate.abilityMultiplier)}`,
      tone: estimate.abilityMultiplier > 1 ? "boost" : "cut",
    });
  }
  if (estimate.itemMultiplier !== 1) {
    chips.push({
      key: "item",
      label: `Item ${formatFlatMultiplier(estimate.itemMultiplier)}`,
      tone: estimate.itemMultiplier > 1 ? "boost" : "cut",
    });
  }
  if (estimate.helpingHandMultiplier !== 1) {
    chips.push({
      key: "hh",
      label: `Helping Hand ${formatFlatMultiplier(estimate.helpingHandMultiplier)}`,
      tone: "boost",
    });
  }
  if (estimate.screenMultiplier !== 1) {
    chips.push({
      key: "screen",
      label: `Screen ${formatFlatMultiplier(estimate.screenMultiplier)}`,
      tone: "cut",
    });
  }
  if (estimate.attackerStageMultiplier !== 1) {
    chips.push({
      key: "atkStage",
      label: `Atk ${formatFlatMultiplier(estimate.attackerStageMultiplier)}`,
      tone: estimate.attackerStageMultiplier > 1 ? "boost" : "cut",
    });
  }
  if (estimate.defenderStageMultiplier !== 1) {
    chips.push({
      key: "defStage",
      label: `Def ${formatFlatMultiplier(estimate.defenderStageMultiplier)}`,
      tone: estimate.defenderStageMultiplier > 1 ? "boost" : "cut",
    });
  }
  return chips;
}

function SwordIcon({ className }: BattleIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 4h6v6" />
      <path d="M20 4 9 15" />
      <path d="m8 16-1.5 3.5L10 18l1.5-3.5" />
      <path d="M5 19h6" />
      <path d="M7 17v4" />
    </svg>
  );
}

function ShieldIcon({ className }: BattleIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 19 6v5c0 4.6-2.8 7.9-7 10-4.2-2.1-7-5.4-7-10V6l7-3Z" />
      <path d="M12 7v9" />
      <path d="M8.5 10.5H15.5" />
    </svg>
  );
}

const SingleDamageCalculatorPanel = memo(function SingleDamageCalculatorPanel({
  attackerSlotIndex,
  attackerSlot,
  defenderSlotIndex,
  defenderEntry,
  basePokemonBySpeciesKey,
  megaFormsByBaseSpeciesKey,
  onAttackerBattleFormChange,
  onDefenderBattleFormChange,
  onEditEnemyStatSpread,
  enemyStatSpreadOverrides,
  damageCalcMode,
  setDamageCalcMode,
  damageWeather,
  setDamageWeather,
  damageTerrain,
  setDamageTerrain,
  damageAttackerGrounded,
  setDamageAttackerGrounded,
  damageDefenderGrounded,
  setDamageDefenderGrounded,
  damageAttackStage,
  setDamageAttackStage,
  damageDefenseStage,
  setDamageDefenseStage,
  damageAttackerAbility,
  setDamageAttackerAbility,
  damageDefenderAbility,
  setDamageDefenderAbility,
  damageAttackerItem,
  setDamageAttackerItem,
  damageDefenderItem,
  setDamageDefenderItem,
  damageHelpingHand,
  setDamageHelpingHand,
  damageReflect,
  setDamageReflect,
  damageLightScreen,
  setDamageLightScreen,
  damageAuroraVeil,
  setDamageAuroraVeil,
  damageMoveConfigs,
  setDamageMoveConfigs,
  defenseMoveConfigs,
  setDefenseMoveConfigs,
  moveByKey,
}: SingleDamageCalculatorPanelProps) {
  const selectedDamageSavedAttacks = attackerSlot?.savedAttacks ?? [];
  const selectedDamageEnemySavedAttacks = defenderEntry?.savedAttacks ?? [];
  const selectedDamageAttackerPokemon = attackerSlot?.pokemon ?? null;
  const selectedDamageDefenderPokemon = defenderEntry?.pokemon ?? null;
  const selectedDamageAttackerSpread = attackerSlot?.resolvedStatSpread ?? null;
  const selectedDamageDefenderSpread = defenderEntry?.statSpread ?? null;
  const selectedDamageAttackerFormOptions = useMemo(() => {
    if (!selectedDamageAttackerPokemon) {
      return [];
    }

    const basePokemon = getBasePokemonForBattleForm(selectedDamageAttackerPokemon, basePokemonBySpeciesKey);
    return getTeamFormOptions(basePokemon, megaFormsByBaseSpeciesKey);
  }, [basePokemonBySpeciesKey, megaFormsByBaseSpeciesKey, selectedDamageAttackerPokemon]);
  const selectedDamageDefenderFormOptions = useMemo(() => {
    if (!selectedDamageDefenderPokemon) {
      return [];
    }

    const basePokemon = getBasePokemonForBattleForm(selectedDamageDefenderPokemon, basePokemonBySpeciesKey);
    return getTeamFormOptions(basePokemon, megaFormsByBaseSpeciesKey);
  }, [basePokemonBySpeciesKey, megaFormsByBaseSpeciesKey, selectedDamageDefenderPokemon]);
  const currentDamageAttackerPokemon =
    damageCalcMode === "attack" ? selectedDamageAttackerPokemon : selectedDamageDefenderPokemon;
  const currentDamageDefenderPokemon =
    damageCalcMode === "attack" ? selectedDamageDefenderPokemon : selectedDamageAttackerPokemon;
  const currentDamageAttackerAbilityName =
    damageCalcMode === "attack" ? attackerSlot?.abilityName ?? null : defenderEntry?.abilityName ?? null;
  const currentDamageAttackerSpread =
    damageCalcMode === "attack" ? selectedDamageAttackerSpread : selectedDamageDefenderSpread;
  const currentDamageDefenderSpread =
    damageCalcMode === "attack" ? selectedDamageDefenderSpread : selectedDamageAttackerSpread;
  const currentDamageAttackerStats = currentDamageAttackerPokemon
    ? getChampionsComputedStats(currentDamageAttackerPokemon, {
        baseStats: getEffectiveDamageBaseStats(currentDamageAttackerPokemon, "attacker"),
        spread: currentDamageAttackerSpread,
      })
    : null;
  const currentDamageDefenderStats = currentDamageDefenderPokemon
    ? getChampionsComputedStats(currentDamageDefenderPokemon, {
        baseStats: getEffectiveDamageBaseStats(currentDamageDefenderPokemon, "defender"),
        spread: currentDamageDefenderSpread,
      })
    : null;
  const defenseMoveConfigKey = getDamageConfigKey(
    defenderSlotIndex ?? -1,
    selectedDamageDefenderPokemon?.id ?? null,
  );
  const defenseMoveConfig =
    defenseMoveConfigs[defenseMoveConfigKey] ?? createDefaultManualDamageMoveConfig(selectedDamageDefenderPokemon);
  const defenseAttackTypeOptions = selectedDamageDefenderPokemon
    ? getPokemonAttackTypeOptions(selectedDamageDefenderPokemon)
    : [];
  const damageAbilityOptions = useMemo(() => getDamageAbilityOptions(), []);
  const damageAttackerItemOptions = useMemo(() => getDamageItemOptions("attacker"), []);
  const damageDefenderItemOptions = useMemo(() => getDamageItemOptions("defender"), []);

  useEffect(() => {
    setDamageAttackerGrounded(isLikelyGrounded(selectedDamageAttackerPokemon));
  }, [selectedDamageAttackerPokemon, setDamageAttackerGrounded]);

  useEffect(() => {
    setDamageDefenderGrounded(isLikelyGrounded(selectedDamageDefenderPokemon));
  }, [selectedDamageDefenderPokemon, setDamageDefenderGrounded]);

  useEffect(() => {
    setDamageAttackerAbility(getDefaultDamageAbilityId(selectedDamageAttackerPokemon));
  }, [selectedDamageAttackerPokemon?.id, setDamageAttackerAbility]);

  useEffect(() => {
    const defaultAbilityId =
      defenderEntry?.abilityName
        ? getDefaultDamageAbilityIdFromNames([defenderEntry.abilityName])
        : getDefaultDamageAbilityId(selectedDamageDefenderPokemon);
    setDamageDefenderAbility(defaultAbilityId);
  }, [defenderEntry?.abilityName, selectedDamageDefenderPokemon?.id, setDamageDefenderAbility]);

  const updateDamageMoveConfig = (
    pokemonId: string,
    attackId: string,
    baseConfig: DamageMoveConfig,
    patch: Partial<DamageMoveConfig>,
  ) => {
    const configKey = getDamageConfigKey(attackerSlotIndex ?? -1, pokemonId);

    setDamageMoveConfigs((current) => ({
      ...current,
      [configKey]: {
        ...current[configKey],
        [attackId]: {
          ...(current[configKey]?.[attackId] ?? baseConfig),
          ...patch,
        },
      },
    }));
  };

  const updateDefenseMoveConfig = (
    pokemonId: string,
    patch: Partial<ManualDamageMoveConfig>,
  ) => {
    const configKey = getDamageConfigKey(defenderSlotIndex ?? -1, pokemonId);

    setDefenseMoveConfigs((current) => ({
      ...current,
      [configKey]: {
        ...(current[configKey] ?? createDefaultManualDamageMoveConfig(selectedDamageDefenderPokemon)),
        ...patch,
      },
    }));
  };

  const damageMoveRows = useMemo(() => {
    if (!selectedDamageAttackerPokemon || !selectedDamageDefenderPokemon) {
      return [];
    }

    const configKey = getDamageConfigKey(attackerSlotIndex ?? -1, selectedDamageAttackerPokemon.id);
    const storedConfigs = damageMoveConfigs[configKey] ?? {};

    return selectedDamageSavedAttacks.map((attack) => {
      const config = storedConfigs[attack.id] ?? {
        ...createDefaultDamageMoveConfig(selectedDamageAttackerPokemon),
        category: getResolvedAttackCategory(attack, selectedDamageAttackerPokemon),
        isSpreadMove: getResolvedAttackSpread(attack),
      };
      const defaultPower = getResolvedAttackBasePower(attack);
      const basePower = getDamageInputBasePower(config.power, defaultPower, attack.label);

      return {
        attack,
        config,
        defaultPower,
        estimate:
          basePower !== null
            ? calculateRoughDamage({
                attacker: selectedDamageAttackerPokemon,
                defender: selectedDamageDefenderPokemon,
                attackType: attack.type,
                moveName: attack.label?.trim() || undefined,
                basePower,
                category: config.category,
                isSpreadMove: config.isSpreadMove,
                multihit: getResolvedAttackMultihit(attack, moveByKey) ?? null,
                weather: damageWeather,
                terrain: damageTerrain,
                attackerGrounded: damageAttackerGrounded,
                defenderGrounded: damageDefenderGrounded,
                attackerStatStage: damageAttackStage,
                defenderStatStage: damageDefenseStage,
                attackerAbility: damageAttackerAbility,
                attackerAbilityName: attackerSlot?.abilityName ?? null,
                defenderAbility: damageDefenderAbility,
                attackerItem: damageAttackerItem,
                defenderItem: damageDefenderItem,
                helpingHand: damageHelpingHand,
                reflect: damageReflect,
                lightScreen: damageLightScreen,
                auroraVeil: damageAuroraVeil,
                attackerStatSpread: selectedDamageAttackerSpread,
                defenderStatSpread: selectedDamageDefenderSpread,
              })
            : null,
      };
    });
  }, [
    attackerSlot?.abilityName,
    attackerSlotIndex,
    damageAttackStage,
    damageAttackerAbility,
    damageAttackerGrounded,
    damageAttackerItem,
    damageDefenseStage,
    damageDefenderAbility,
    damageDefenderGrounded,
    damageDefenderItem,
    damageHelpingHand,
    damageReflect,
    damageLightScreen,
    damageAuroraVeil,
    damageMoveConfigs,
    damageTerrain,
    damageWeather,
    selectedDamageAttackerPokemon,
    selectedDamageAttackerSpread,
    selectedDamageDefenderPokemon,
    selectedDamageDefenderSpread,
    selectedDamageSavedAttacks,
  ]);

  const bestEnemyIncomingHit = useMemo(() => {
    if (!selectedDamageAttackerPokemon || !selectedDamageDefenderPokemon || selectedDamageEnemySavedAttacks.length === 0) {
      return null;
    }

    return getBestDamageEstimateAgainstPokemon(
      selectedDamageDefenderPokemon,
      selectedDamageAttackerPokemon,
      selectedDamageEnemySavedAttacks,
      {
        weather: damageWeather,
        terrain: damageTerrain,
        attackerGrounded: damageDefenderGrounded,
        defenderGrounded: damageAttackerGrounded,
        attackerStatStage: 0,
        defenderStatStage: 0,
        attackerAbility: damageDefenderAbility,
        attackerAbilityName: defenderEntry?.abilityName ?? null,
        defenderAbility: damageAttackerAbility,
        attackerItem: damageDefenderItem,
        defenderItem: damageAttackerItem,
        helpingHand: false,
        reflect: damageReflect,
        lightScreen: damageLightScreen,
        auroraVeil: damageAuroraVeil,
        attackerStatSpread: selectedDamageDefenderSpread,
        defenderStatSpread: selectedDamageAttackerSpread,
      },
    );
  }, [
    defenderEntry?.abilityName,
    damageAttackerAbility,
    damageAttackerGrounded,
    damageAttackerItem,
    damageDefenderAbility,
    damageDefenderGrounded,
    damageDefenderItem,
    damageReflect,
    damageLightScreen,
    damageAuroraVeil,
    damageTerrain,
    damageWeather,
    selectedDamageAttackerPokemon,
    selectedDamageAttackerSpread,
    selectedDamageDefenderPokemon,
    selectedDamageDefenderSpread,
    selectedDamageEnemySavedAttacks,
  ]);

  const defensePresetMoveRows = useMemo(() => {
    if (!selectedDamageDefenderPokemon || !selectedDamageAttackerPokemon) {
      return [];
    }

    return selectedDamageEnemySavedAttacks.map((attack) => {
      const basePower = getResolvedAttackBasePower(attack);
      const category = getResolvedAttackCategory(attack, selectedDamageDefenderPokemon);
      const isSpreadMove = getResolvedAttackSpread(attack);
      const estimate =
        basePower !== null
          ? calculateRoughDamage({
              attacker: selectedDamageDefenderPokemon,
              defender: selectedDamageAttackerPokemon,
              attackType: attack.type,
              moveName: attack.label?.trim() || undefined,
              basePower,
              category,
              isSpreadMove,
              multihit: getResolvedAttackMultihit(attack, moveByKey) ?? null,
              weather: damageWeather,
              terrain: damageTerrain,
              attackerGrounded: damageDefenderGrounded,
              defenderGrounded: damageAttackerGrounded,
              attackerStatStage: damageAttackStage,
              defenderStatStage: damageDefenseStage,
              attackerAbility: damageDefenderAbility,
              attackerAbilityName: defenderEntry?.abilityName ?? null,
              defenderAbility: damageAttackerAbility,
              attackerItem: damageAttackerItem,
              defenderItem: damageDefenderItem,
              helpingHand: damageHelpingHand,
              reflect: damageReflect,
              lightScreen: damageLightScreen,
              auroraVeil: damageAuroraVeil,
              attackerStatSpread: selectedDamageDefenderSpread,
              defenderStatSpread: selectedDamageAttackerSpread,
            })
          : null;

      return {
        attack,
        basePower: estimate?.effectiveBasePower ?? basePower,
        category,
        isSpreadMove,
        estimate,
      };
    });
  }, [
    defenderEntry?.abilityName,
    damageAttackStage,
    damageAttackerAbility,
    damageAttackerGrounded,
    damageAttackerItem,
    damageDefenseStage,
    damageDefenderAbility,
    damageDefenderGrounded,
    damageDefenderItem,
    damageHelpingHand,
    damageReflect,
    damageLightScreen,
    damageAuroraVeil,
    damageTerrain,
    damageWeather,
    selectedDamageAttackerPokemon,
    selectedDamageAttackerSpread,
    selectedDamageDefenderPokemon,
    selectedDamageDefenderSpread,
    selectedDamageEnemySavedAttacks,
  ]);

  const defenseMoveEstimate = useMemo(() => {
    const parsedPower = Number(defenseMoveConfig.power);
    const basePower = Number.isFinite(parsedPower) && parsedPower > 0 ? parsedPower : null;

    if (!selectedDamageDefenderPokemon || !selectedDamageAttackerPokemon || basePower === null) {
      return null;
    }

    return calculateRoughDamage({
      attacker: selectedDamageDefenderPokemon,
      defender: selectedDamageAttackerPokemon,
      attackType: defenseMoveConfig.attackType,
      basePower,
      category: defenseMoveConfig.category,
      isSpreadMove: defenseMoveConfig.isSpreadMove,
      weather: damageWeather,
      terrain: damageTerrain,
      attackerGrounded: damageDefenderGrounded,
      defenderGrounded: damageAttackerGrounded,
      attackerStatStage: damageAttackStage,
      defenderStatStage: damageDefenseStage,
      attackerAbility: damageDefenderAbility,
      attackerAbilityName: defenderEntry?.abilityName ?? null,
      defenderAbility: damageAttackerAbility,
      attackerItem: damageAttackerItem,
      defenderItem: damageDefenderItem,
      helpingHand: damageHelpingHand,
      reflect: damageReflect,
      lightScreen: damageLightScreen,
      auroraVeil: damageAuroraVeil,
      attackerStatSpread: selectedDamageDefenderSpread,
      defenderStatSpread: selectedDamageAttackerSpread,
    });
  }, [
    defenderEntry?.abilityName,
    damageAttackStage,
    damageAttackerAbility,
    damageAttackerGrounded,
    damageAttackerItem,
    damageDefenseStage,
    damageDefenderAbility,
    damageDefenderGrounded,
    damageDefenderItem,
    damageHelpingHand,
    damageReflect,
    damageLightScreen,
    damageAuroraVeil,
    damageTerrain,
    damageWeather,
    defenseMoveConfig,
    selectedDamageAttackerPokemon,
    selectedDamageAttackerSpread,
    selectedDamageDefenderPokemon,
  ]);

  if (!currentDamageAttackerPokemon || !currentDamageDefenderPokemon) {
    return (
      <section className="damage-center-panel">
        <div className="matchup-empty-board">
          Select one filled Pokemon from your six and one filled Pokemon from the enemy six.
        </div>
      </section>
    );
  }

  const attackerSideAbility = damageCalcMode === "attack" ? damageAttackerAbility : damageDefenderAbility;
  const setAttackerSideAbility = damageCalcMode === "attack" ? setDamageAttackerAbility : setDamageDefenderAbility;
  const defenderSideAbility = damageCalcMode === "attack" ? damageDefenderAbility : damageAttackerAbility;
  const setDefenderSideAbility = damageCalcMode === "attack" ? setDamageDefenderAbility : setDamageAttackerAbility;

  const attackerSideItem = damageCalcMode === "attack" ? damageAttackerItem : damageDefenderItem;
  const setAttackerSideItem = damageCalcMode === "attack" ? setDamageAttackerItem : setDamageDefenderItem;
  const defenderSideItem = damageCalcMode === "attack" ? damageDefenderItem : damageAttackerItem;
  const setDefenderSideItem = damageCalcMode === "attack" ? setDamageDefenderItem : setDamageAttackerItem;

  const attackerSideItemOptions = damageCalcMode === "attack" ? damageAttackerItemOptions : damageDefenderItemOptions;
  const defenderSideItemOptions = damageCalcMode === "attack" ? damageDefenderItemOptions : damageAttackerItemOptions;

  const attackerSideGrounded = damageCalcMode === "attack" ? damageAttackerGrounded : damageDefenderGrounded;
  const setAttackerSideGrounded = damageCalcMode === "attack" ? setDamageAttackerGrounded : setDamageDefenderGrounded;
  const defenderSideGrounded = damageCalcMode === "attack" ? damageDefenderGrounded : damageAttackerGrounded;
  const setDefenderSideGrounded = damageCalcMode === "attack" ? setDamageDefenderGrounded : setDamageAttackerGrounded;

  const renderSideCard = (side: "attacker" | "defender") => {
    const isAttacker = side === "attacker";
    const pokemon = isAttacker ? currentDamageAttackerPokemon : currentDamageDefenderPokemon;
    const stats = isAttacker ? currentDamageAttackerStats : currentDamageDefenderStats;
    const sourceSide: "ally" | "enemy" = isAttacker
      ? damageCalcMode === "attack"
        ? "ally"
        : "enemy"
      : damageCalcMode === "attack"
        ? "enemy"
        : "ally";
    const formOptions = sourceSide === "ally" ? selectedDamageAttackerFormOptions : selectedDamageDefenderFormOptions;
    const selectedFormPokemonId =
      sourceSide === "ally"
        ? attackerSlot?.activeFormPokemonId ?? null
        : isChampionsMegaEntry(pokemon)
          ? pokemon.id
          : null;
    const abilityValue = isAttacker ? attackerSideAbility : defenderSideAbility;
    const setAbilityValue = isAttacker ? setAttackerSideAbility : setDefenderSideAbility;
    const itemValue = isAttacker ? attackerSideItem : defenderSideItem;
    const setItemValue = isAttacker ? setAttackerSideItem : setDefenderSideItem;
    const itemOptions = isAttacker ? attackerSideItemOptions : defenderSideItemOptions;
    const groundedValue = isAttacker ? attackerSideGrounded : defenderSideGrounded;
    const setGroundedValue = isAttacker ? setAttackerSideGrounded : setDefenderSideGrounded;
    const stageValue = isAttacker ? damageAttackStage : damageDefenseStage;
    const setStageValue = isAttacker ? setDamageAttackStage : setDamageDefenseStage;
    const stageLabel = isAttacker ? "Atk Boost" : "Def Boost";
    const roleLabel = isAttacker ? "Attacker" : "Defender";
    const overviewSpeed = getDamageOverviewSpeedStat(stats?.spe ?? 0, itemValue);
    const sourceSlotIndex = sourceSide === "ally" ? attackerSlotIndex : defenderSlotIndex;
    const enemyOverrideKey =
      sourceSide === "enemy" && sourceSlotIndex !== null
        ? getEnemyStatSpreadOverrideKey(sourceSlotIndex, pokemon, basePokemonBySpeciesKey)
        : null;
    const hasEnemyStatSpreadOverride = Boolean(enemyOverrideKey && enemyStatSpreadOverrides[enemyOverrideKey]);
    const handleFormChange = (option: TeamFormOption) => {
      if (sourceSide === "ally") {
        if (attackerSlotIndex === null) {
          return;
        }

        onAttackerBattleFormChange(attackerSlotIndex, option.activeFormPokemonId);
        return;
      }

      if (defenderSlotIndex === null) {
        return;
      }

      onDefenderBattleFormChange(defenderSlotIndex, option.pokemon);
    };

    const statEntries = isAttacker
      ? [
          ["Atk", stats?.atk ?? 0],
          ["SpA", stats?.spa ?? 0],
          ["Spe", overviewSpeed],
        ]
      : [
          ["HP", stats?.hp ?? 0],
          ["Def", stats?.def ?? 0],
          ["SpD", stats?.spd ?? 0],
          ["Spe", overviewSpeed],
        ];

    return (
      <article className={`damage-side-card ${side}`}>
        <div className="damage-side-top">
          <PokemonSprite pokemon={pokemon} className="damage-side-sprite" />
          <div className="damage-side-id">
            <p className="eyebrow">{roleLabel}</p>
            <h3>{pokemon.name}</h3>
            <div className="team-type-list compact">
              {pokemon.types.map((typeLabel: string) => {
                const type = getTypeFromLabel(typeLabel);
                if (!type) {
                  return null;
                }

                return (
                  <span
                    key={`${pokemon.id}-${type}`}
                    className="inline-type-pill"
                    style={
                      {
                        "--type-color": TYPE_META[type].color,
                        "--type-accent": TYPE_META[type].accent,
                      } as CSSProperties
                    }
                  >
                    <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
                    {TYPE_META[type].label}
                  </span>
                );
              })}
            </div>
            <p className="damage-template-note">{stats ? formatChampionsTemplateSummary(stats.template) : ""}</p>
            {sourceSide === "enemy" && sourceSlotIndex !== null ? (
              <button
                type="button"
                className={`damage-stat-edit-button ${hasEnemyStatSpreadOverride ? "active" : ""}`}
                onClick={() => onEditEnemyStatSpread(sourceSlotIndex)}
                aria-haspopup="dialog"
              >
                {hasEnemyStatSpreadOverride ? "Edit calc spread" : "Edit spread"}
              </button>
            ) : null}
          </div>
        </div>

        {formOptions.length > 1 ? (
          <div className="damage-form-switcher" role="group" aria-label={`${pokemon.name} battle form`}>
            {formOptions.map((option) => {
              const isSelected = selectedFormPokemonId === option.activeFormPokemonId;
              return (
                <button
                  key={`${side}-form-${option.pokemon.id}`}
                  type="button"
                  className={`damage-form-option${isSelected ? " is-selected" : ""}`}
                  onClick={() => handleFormChange(option)}
                  aria-pressed={isSelected}
                  title={`Use ${option.pokemon.name} in this damage slot`}
                >
                  <PokemonSprite pokemon={option.pokemon} className="damage-form-option__sprite" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="damage-stat-strip">
          {statEntries.map(([label, value]) => (
            <span key={`${side}-stat-${label}`}>
              {label} {value}
            </span>
          ))}
        </div>

        <div className="damage-side-controls">
          <div className="damage-side-control-pair">
            <label className="damage-inline-field tight">
              <span>Abl</span>
              <select
                value={abilityValue}
                onChange={(event) => setAbilityValue(event.target.value as DamageAbilityId)}
                title={getDamageAbilityDescription(abilityValue)}
              >
                {damageAbilityOptions.map((option) => (
                  <option key={`damage-${side}-ability-${option.id}`} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="damage-inline-field tight">
              <span>Itm</span>
              <select
                value={itemValue}
                onChange={(event) => setItemValue(event.target.value as DamageItemId)}
                title={getDamageItemDescription(itemValue)}
              >
                {itemOptions.map((option) => (
                  <option key={`damage-${side}-item-${option.id}`} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="damage-side-controls-row">
            <label className={`damage-inline-toggle ${groundedValue ? "active" : ""}`}>
              <input
                type="checkbox"
                checked={groundedValue}
                onChange={(event) => setGroundedValue(event.target.checked)}
              />
              <span>Grounded</span>
            </label>

            <div className="damage-inline-stage">
              <span>{stageLabel}</span>
              <div className="damage-stage-stepper">
                <button
                  type="button"
                  className="damage-stage-button"
                  onClick={() => setStageValue((current) => clampStatStage(current - 1))}
                  aria-label={`Decrease ${stageLabel}`}
                >
                  -
                </button>
                <strong>{stageValue >= 0 ? `+${stageValue}` : stageValue}</strong>
                <button
                  type="button"
                  className="damage-stage-button"
                  onClick={() => setStageValue((current) => clampStatStage(current + 1))}
                  aria-label={`Increase ${stageLabel}`}
                >
                  +
                </button>
              </div>
              <em>{formatFlatMultiplier(getStatStageMultiplier(stageValue))}</em>
            </div>
          </div>
        </div>
      </article>
    );
  };

  const renderMoveResult = (
    estimate: ReturnType<typeof calculateRoughDamage> | null,
    emptyStrong: string,
    emptyBody: string,
    hpLabel: "dealt" | "taken",
    category: DamageCategory,
  ) => {
    if (!estimate) {
      return (
        <div className="damage-result-card">
          <strong>{emptyStrong}</strong>
          <p>{emptyBody}</p>
        </div>
      );
    }

    const chips = buildDamageModChips(estimate, category);

    return (
      <div className="damage-result-card ready">
        <div className="damage-result-topline">
          <strong>{formatPercent(estimate.averagePercent)}%</strong>
          <span>
            {formatPercent(estimate.minPercent)}% – {formatPercent(estimate.maxPercent)}%
          </span>
        </div>
        <p>
          Avg {estimate.averageDamage} HP {hpLabel === "taken" ? "taken" : ""}
          {estimate.typeMultiplier === 0 ? " · no effect" : ""}
        </p>
        {chips.length > 0 ? (
          <div className="damage-modifier-row compact">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className={`damage-mod-chip ${chip.tone ? `tone-${chip.tone}` : ""}`}
              >
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="damage-center-panel">
      <div className="damage-battle-board">
        {renderSideCard("attacker")}

        <div className="damage-center-switch">
          <div className="damage-versus-pill">vs</div>
          <div className="damage-mode-toggle" aria-label="Damage calculator modes">
            <button
              type="button"
              className={`damage-mode-button attack ${damageCalcMode === "attack" ? "active" : ""}`}
              onClick={() => setDamageCalcMode("attack")}
            >
              <SwordIcon className="battle-mode-icon" />
              <span>Attack</span>
            </button>
            <button
              type="button"
              className={`damage-mode-button defend ${damageCalcMode === "defend" ? "active" : ""}`}
              onClick={() => setDamageCalcMode("defend")}
            >
              <ShieldIcon className="battle-mode-icon" />
              <span>Defend</span>
            </button>
          </div>
        </div>

        {renderSideCard("defender")}
      </div>

      <div className="damage-field-bar">
        <label className="damage-inline-field">
          <span>Weather</span>
          <select
            value={damageWeather}
            onChange={(event) => setDamageWeather(event.target.value as DamageWeather)}
          >
            {WEATHER_OPTIONS.map((option) => (
              <option key={`weather-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="damage-inline-field">
          <span>Terrain</span>
          <select
            value={damageTerrain}
            onChange={(event) => setDamageTerrain(event.target.value as DamageTerrain)}
          >
            {TERRAIN_OPTIONS.map((option) => (
              <option key={`terrain-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={`damage-inline-toggle ${damageHelpingHand ? "active" : ""}`}>
          <input
            type="checkbox"
            checked={damageHelpingHand}
            onChange={(event) => setDamageHelpingHand(event.target.checked)}
          />
          <span>Helping Hand</span>
        </label>

        <label className={`damage-inline-toggle ${damageReflect ? "active" : ""}`}>
          <input
            type="checkbox"
            checked={damageReflect}
            onChange={(event) => setDamageReflect(event.target.checked)}
          />
          <span>Reflect</span>
        </label>

        <label className={`damage-inline-toggle ${damageLightScreen ? "active" : ""}`}>
          <input
            type="checkbox"
            checked={damageLightScreen}
            onChange={(event) => setDamageLightScreen(event.target.checked)}
          />
          <span>Light Screen</span>
        </label>

        <label className={`damage-inline-toggle ${damageAuroraVeil ? "active" : ""}`}>
          <input
            type="checkbox"
            checked={damageAuroraVeil}
            onChange={(event) => setDamageAuroraVeil(event.target.checked)}
          />
          <span>Aurora Veil</span>
        </label>

        <details className="damage-assumptions">
          <summary>Assumptions</summary>
          <div className="damage-assumption-row">
            <span className="damage-assumption-pill">Level 50</span>
            <span className="damage-assumption-pill">0 IV / 0 EV</span>
            <span className="damage-assumption-pill">Neutral nature</span>
            <span className="damage-assumption-pill">Supported items and berries</span>
            <span className="damage-assumption-pill">Helping Hand toggle</span>
            <span className="damage-assumption-pill">Screens use doubles reduction</span>
            <span className="damage-assumption-pill">Supported ability effects only</span>
            <span className="damage-assumption-pill">Aegislash auto-swaps stances</span>
            <span className="damage-assumption-pill">Spread toggle = {SPREAD_MOVE_MULTIPLIER}x</span>
          </div>
        </details>
      </div>

      {damageCalcMode === "attack" ? (
        selectedDamageSavedAttacks.length > 0 ? (
          <div className="damage-move-block">
            {bestEnemyIncomingHit ? (
              <p className="damage-return-fire">
                <strong>Return fire:</strong> {selectedDamageDefenderPokemon!.name} hits back with{" "}
                {getAttackLabel(bestEnemyIncomingHit.attack)} for{" "}
                <strong>
                  {formatPercent(bestEnemyIncomingHit.estimate.minPercent)}% –{" "}
                  {formatPercent(bestEnemyIncomingHit.estimate.maxPercent)}%
                </strong>
                .
              </p>
            ) : null}
            <div className="damage-move-grid">
              {damageMoveRows.map((row) => {
                const effectiveType = row.estimate?.effectiveAttackType ?? row.attack.type;
                const isWeightBasedPowerMove = isLowKickMove(row.attack.label);
                return (
                  <article key={`damage-row-${row.attack.id}`} className="damage-move-card">
                    <header className="damage-move-card-head">
                      <span
                        className="inline-type-pill"
                        style={
                          {
                            "--type-color": TYPE_META[effectiveType].color,
                            "--type-accent": TYPE_META[effectiveType].accent,
                          } as CSSProperties
                        }
                      >
                        <img src={getTypeIconUrl(effectiveType)} alt="" aria-hidden="true" />
                        {TYPE_META[effectiveType].label}
                      </span>
                      <strong>{getAttackLabel(row.attack)}</strong>
                    </header>

                    <div className="damage-move-card-controls">
                      <label className="damage-power-field compact">
                        <span>BP</span>
                        <input
                          type="number"
                          min={isWeightBasedPowerMove ? "0" : "1"}
                          step="1"
                          inputMode="numeric"
                          value={isWeightBasedPowerMove ? "" : row.config.power || (row.defaultPower ? String(row.defaultPower) : "")}
                          disabled={isWeightBasedPowerMove}
                          onChange={(event) =>
                            updateDamageMoveConfig(
                              selectedDamageAttackerPokemon!.id,
                              row.attack.id,
                              row.config,
                              { power: event.target.value },
                            )
                          }
                          placeholder={isWeightBasedPowerMove ? "Weight" : row.defaultPower ? String(row.defaultPower) : "80"}
                        />
                      </label>

                      <div className="damage-category-toggle compact" role="group" aria-label="Move category">
                        {(["physical", "special"] as const).map((category) => (
                          <button
                            key={`${row.attack.id}-${category}`}
                            type="button"
                            className={`damage-category-button ${row.config.category === category ? "active" : ""}`}
                            onClick={() =>
                              updateDamageMoveConfig(
                                selectedDamageAttackerPokemon!.id,
                                row.attack.id,
                                row.config,
                                { category },
                              )
                            }
                          >
                            {category === "physical" ? "Phys" : "Spec"}
                          </button>
                        ))}
                      </div>

                      <label className={`damage-inline-toggle compact ${row.config.isSpreadMove ? "active" : ""}`}>
                        <input
                          type="checkbox"
                          checked={row.config.isSpreadMove}
                          onChange={(event) =>
                            updateDamageMoveConfig(
                              selectedDamageAttackerPokemon!.id,
                              row.attack.id,
                              row.config,
                              { isSpreadMove: event.target.checked },
                            )
                          }
                        />
                        <span>Spread</span>
                      </label>
                    </div>

                    {renderMoveResult(
                      row.estimate,
                      "Enter power",
                      row.defaultPower
                        ? `Add base power to calc. Saved default: ${row.defaultPower}.`
                        : "Add base power to calc a rough percentage.",
                      "dealt",
                      row.config.category,
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="matchup-empty-board">
            Add saved attacks to {selectedDamageAttackerPokemon!.name} above to unlock move rows here.
          </div>
        )
      ) : (
        <div className="damage-move-block">
          <article className="damage-move-card damage-defend-card">
            <header className="damage-move-card-head">
              <span className="damage-defend-heading">Custom Incoming Hit</span>
            </header>

            {selectedDamageEnemySavedAttacks.length > 0 ? (
              <div className="damage-type-shortcuts" aria-label="Enemy preset move defaults">
                {selectedDamageEnemySavedAttacks.map((attack) => {
                  const basePower = getResolvedAttackBasePower(attack);
                  const category = getResolvedAttackCategory(attack, selectedDamageDefenderPokemon);
                  const isSpreadMove = getResolvedAttackSpread(attack);
                  const buttonPower = basePower ? String(basePower) : "";
                  const isActive =
                    defenseMoveConfig.attackType === attack.type &&
                    defenseMoveConfig.power === buttonPower &&
                    defenseMoveConfig.category === category &&
                    defenseMoveConfig.isSpreadMove === isSpreadMove;

                  return (
                    <button
                      key={`defense-preset-${attack.id}`}
                      type="button"
                      className={`damage-type-shortcut ${isActive ? "active" : ""}`}
                      style={
                        {
                          "--type-color": TYPE_META[attack.type].color,
                          "--type-accent": TYPE_META[attack.type].accent,
                        } as CSSProperties
                      }
                      onClick={() =>
                        updateDefenseMoveConfig(selectedDamageDefenderPokemon?.id ?? "", {
                          attackType: attack.type,
                          power: buttonPower,
                          category,
                          isSpreadMove,
                        })
                      }
                    >
                      <img src={getTypeIconUrl(attack.type)} alt="" aria-hidden="true" />
                      <span>{getAttackLabel(attack)}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {defenseAttackTypeOptions.length > 0 ? (
              <div className="damage-type-shortcuts" aria-label="Enemy attack type defaults">
                {defenseAttackTypeOptions.map((type) => (
                  <button
                    key={`defense-type-shortcut-${type}`}
                    type="button"
                    className={`damage-type-shortcut ${defenseMoveConfig.attackType === type ? "active" : ""}`}
                    style={
                      {
                        "--type-color": TYPE_META[type].color,
                        "--type-accent": TYPE_META[type].accent,
                      } as CSSProperties
                    }
                    onClick={() =>
                      updateDefenseMoveConfig(selectedDamageDefenderPokemon?.id ?? "", { attackType: type })
                    }
                  >
                    <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
                    <span>{TYPE_META[type].label}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="damage-move-card-controls">
              <label className="damage-inline-field">
                <span>Type</span>
                <select
                  value={defenseMoveConfig.attackType}
                  onChange={(event) =>
                    updateDefenseMoveConfig(selectedDamageDefenderPokemon?.id ?? "", {
                      attackType: event.target.value as PokemonType,
                    })
                  }
                >
                  {TYPE_ORDER.map((type) => (
                    <option key={`defense-type-${type}`} value={type}>
                      {TYPE_META[type].label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="damage-power-field compact">
                <span>BP</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={defenseMoveConfig.power}
                  onChange={(event) =>
                    updateDefenseMoveConfig(selectedDamageDefenderPokemon?.id ?? "", {
                      power: event.target.value,
                    })
                  }
                  placeholder="80"
                />
              </label>

              <div className="damage-category-toggle compact" role="group" aria-label="Incoming move category">
                {(["physical", "special"] as const).map((category) => (
                  <button
                    key={`defense-${category}`}
                    type="button"
                    className={`damage-category-button ${defenseMoveConfig.category === category ? "active" : ""}`}
                    onClick={() =>
                      updateDefenseMoveConfig(selectedDamageDefenderPokemon?.id ?? "", { category })
                    }
                  >
                    {category === "physical" ? "Phys" : "Spec"}
                  </button>
                ))}
              </div>

              <label className={`damage-inline-toggle compact ${defenseMoveConfig.isSpreadMove ? "active" : ""}`}>
                <input
                  type="checkbox"
                  checked={defenseMoveConfig.isSpreadMove}
                  onChange={(event) =>
                    updateDefenseMoveConfig(selectedDamageDefenderPokemon?.id ?? "", {
                      isSpreadMove: event.target.checked,
                    })
                  }
                />
                <span>Spread</span>
              </label>
            </div>

            {renderMoveResult(
              defenseMoveEstimate,
              "Enter power",
              "Pick an incoming attack type and base power to calc rough damage taken.",
              "taken",
              defenseMoveConfig.category,
            )}
          </article>

          {defensePresetMoveRows.length > 0 ? (
            <div className="damage-move-grid">
              {defensePresetMoveRows.map((row) => {
                const effectiveType = row.estimate?.effectiveAttackType ?? row.attack.type;
                return (
                  <article key={`defense-loaded-${row.attack.id}`} className="damage-move-card">
                    <header className="damage-move-card-head">
                      <span
                        className="inline-type-pill"
                        style={
                          {
                            "--type-color": TYPE_META[effectiveType].color,
                            "--type-accent": TYPE_META[effectiveType].accent,
                          } as CSSProperties
                        }
                      >
                        <img src={getTypeIconUrl(effectiveType)} alt="" aria-hidden="true" />
                        {TYPE_META[effectiveType].label}
                      </span>
                      <strong>{getAttackLabel(row.attack)}</strong>
                      <span className="damage-move-card-meta">
                        {row.category === "physical" ? "Phys" : "Spec"}
                        {row.basePower !== null ? ` · BP ${row.basePower}` : " · BP ?"}
                        {row.isSpreadMove ? " · Spread" : ""}
                      </span>
                    </header>

                    {renderMoveResult(
                      row.estimate,
                      "No rough percentage",
                      "This loaded move does not have a supported base power in the current data.",
                      "taken",
                      row.category,
                    )}
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
});

function normalizeOpenerSelection(
  selection: OpenerSelection,
  availableIndices: number[],
  preferredOffset: number,
): OpenerSelection {
  if (availableIndices.length === 0) {
    return [null, null];
  }

  const fallbackFirst = availableIndices[preferredOffset] ?? availableIndices[0] ?? null;
  const fallbackSecond =
    availableIndices[preferredOffset + 1] ??
    availableIndices.find((index) => index !== fallbackFirst) ??
    fallbackFirst;

  const first =
    selection[0] !== null && availableIndices.includes(selection[0]) ? selection[0] : fallbackFirst;
  let second =
    selection[1] !== null && availableIndices.includes(selection[1]) ? selection[1] : fallbackSecond;

  if (availableIndices.length > 1 && second === first) {
    second = availableIndices.find((index) => index !== first) ?? second;
  }

  return [first, second];
}

function normalizePairSelection(
  selection: OpenerSelection,
  availableIndices: number[],
  preferredOffset: number,
): OpenerSelection {
  if (availableIndices.length === 0) {
    return [null, null];
  }

  const fallbackFirst = availableIndices[preferredOffset] ?? availableIndices[0] ?? null;
  const fallbackSecond =
    availableIndices[preferredOffset + 1] ??
    availableIndices.find((index) => index !== fallbackFirst) ??
    null;

  const first =
    selection[0] !== null && availableIndices.includes(selection[0]) ? selection[0] : fallbackFirst;
  let second: number | null =
    selection[1] !== null && availableIndices.includes(selection[1]) && selection[1] !== first
      ? selection[1]
      : fallbackSecond;

  if (second === first) {
    second = availableIndices.find((index) => index !== first) ?? null;
  }

  return [first, second];
}

function normalizeSparsePairSelection(
  selection: OpenerSelection,
  availableIndices: number[],
  preferredOffset: number,
): OpenerSelection {
  const normalized = normalizePairSelection(selection, availableIndices, preferredOffset);
  const firstWasValid = selection[0] !== null && availableIndices.includes(selection[0]);

  if (firstWasValid && selection[1] === null) {
    return [normalized[0], null];
  }

  return normalized;
}

function togglePairSelection(selection: OpenerSelection, slotIndex: number): OpenerSelection {
  const current = selection.filter((entry): entry is number => entry !== null);

  if (current.includes(slotIndex)) {
    const next = current.filter((entry) => entry !== slotIndex);
    return [next[0] ?? null, next[1] ?? null];
  }

  if (current.length === 0) {
    return [slotIndex, null];
  }

  if (current.length === 1) {
    return [current[0], slotIndex];
  }

  return [current[0], slotIndex];
}

function assignPairSelectionSlot(selection: OpenerSelection, slotIndex: number, memberIndex: 0 | 1): OpenerSelection {
  const next: OpenerSelection = [...selection];
  const existingIndex = next.indexOf(slotIndex) as -1 | 0 | 1;

  if (existingIndex === memberIndex) {
    return next;
  }

  if (existingIndex !== -1) {
    const currentAtTarget = next[memberIndex];
    next[memberIndex] = slotIndex;
    next[existingIndex] = currentAtTarget;
    return next;
  }

  next[memberIndex] = slotIndex;
  return next;
}

function normalizeTeamSlots(
  slots: PersistedTeamSlot[],
  moveByKey: ReadonlyMap<string, MoveRecord>,
): TeamSlotState[] {
  return Array.from({ length: TEAM_SIZE }, (_, index) => {
    const slot = slots[index];

    if (!slot) {
      return createEmptyTeamSlot();
    }

    const savedAttacks = Array.isArray(slot.savedAttacks)
      ? sanitizeSavedAttacks(slot.savedAttacks)
      : buildLegacySavedAttacks(slot);
    const knownMoves = Array.isArray(slot.knownMoves) && slot.knownMoves.length > 0
      ? sanitizeKnownMoves(slot.knownMoves, moveByKey, MAX_ATTACK_TYPES_PER_SLOT)
      : buildKnownMovesFromSavedAttacks(savedAttacks, moveByKey, MAX_ATTACK_TYPES_PER_SLOT);

    return {
      query: slot.query ?? "",
      pokemonId: slot.pokemonId ?? null,
      activeFormPokemonId: slot.activeFormPokemonId ?? null,
      itemName: getResolvedFieldValue(slot.itemName),
      statSpread: slot.statSpread ? normalizeChampionsStatSpread(slot.statSpread) : null,
      knownMoves,
      savedAttacks:
        knownMoves.length > 0
          ? sanitizeKnownMovesToSavedAttacks(knownMoves, null, MAX_ATTACK_TYPES_PER_SLOT)
          : savedAttacks,
    };
  });
}

function normalizePersistedOpenerSelections(
  openerSelections?: PersistedOpenerSelection[],
): [OpenerSelection, OpenerSelection] {
  const fallback: [OpenerSelection, OpenerSelection] = [
    [null, null],
    [null, null],
  ];

  if (!Array.isArray(openerSelections)) {
    return fallback;
  }

  return fallback.map((pair, pairIndex) => {
    const candidate = openerSelections[pairIndex];

    if (!Array.isArray(candidate)) {
      return pair;
    }

    return [
      typeof candidate[0] === "number" ? candidate[0] : null,
      typeof candidate[1] === "number" ? candidate[1] : null,
    ];
  }) as [OpenerSelection, OpenerSelection];
}

function formatImportIssueList(values: string[], maxVisible = 3) {
  const uniqueValues = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

  if (uniqueValues.length === 0) {
    return "";
  }

  const visibleValues = uniqueValues.slice(0, maxVisible).join(", ");

  if (uniqueValues.length <= maxVisible) {
    return visibleValues;
  }

  return `${visibleValues}, +${uniqueValues.length - maxVisible} more`;
}

function createEmptyOpponentSlots() {
  return Array.from({ length: MAX_OPPONENT_SCOUT_SLOTS }, () => "");
}

function sanitizeSlotIndices(values: number[], availableSlotIndices: Set<number>, limit: number) {
  const next: number[] = [];

  for (const value of values) {
    if (!availableSlotIndices.has(value) || next.includes(value)) {
      continue;
    }

    next.push(value);
    if (next.length >= limit) {
      break;
    }
  }

  return next;
}

function buildMatchPokemonSnapshot(
  slots: Array<{ slotIndex: number; pokemon: PokemonRecord | null }>,
  slotIndices: number[],
) {
  return slotIndices.flatMap((slotIndex) => {
    const slot = slots.find((entry) => entry.slotIndex === slotIndex);
    return slot?.pokemon
      ? [
          {
            slotIndex,
            pokemonId: slot.pokemon.id,
            name: slot.pokemon.name,
          },
        ]
      : [];
  });
}

function formatMatchPokemonNames(entries: Array<{ name: string }>) {
  return entries.length > 0 ? entries.map((entry) => entry.name).join(", ") : "Not recorded";
}

function getMatchHistorySlotName(slot: PersistedTeamSlot, slotIndex: number) {
  return slot.query.trim() || slot.pokemonId || `Slot ${slotIndex + 1}`;
}

function buildPersistedMatchPokemonSnapshot(slots: PersistedTeamSlot[], slotIndices: number[]) {
  return slotIndices.flatMap((slotIndex) => {
    const slot = slots[slotIndex];
    return slot?.pokemonId
      ? [
          {
            slotIndex,
            pokemonId: slot.pokemonId,
            name: getMatchHistorySlotName(slot, slotIndex),
          },
        ]
      : [];
  });
}

function TypePool({ selectedTypes, onToggle, onClear, mode }: TypePoolProps) {
  const slotCount = mode === "defense" ? 2 : 1;

  return (
    <section className="selector-panel">
      <div className="selector-topbar">
        <div className="selector-copy">
          <p className="eyebrow">{mode === "defense" ? "Type Calculator" : "Attack Coverage"}</p>
          <h2>{mode === "defense" ? "Pick one or two types" : "Pick one attacking type"}</h2>
          <p className="selector-note">
            {mode === "defense"
              ? "One type gives a mono-type profile. Two types combine into the final defensive matchup."
              : "Select a move type to see what it hits super effectively, neutrally, poorly, or not at all."}
          </p>
        </div>

        <div className="selector-actions">
          <div className="selected-slots" aria-label="Selected types">
            {Array.from({ length: slotCount }, (_, slotIndex) => {
              const type = selectedTypes[slotIndex] ?? null;

              return (
                <div key={slotIndex} className={`selected-slot ${type ? "filled" : ""}`}>
                  {type ? (
                    <>
                      <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
                      <span>{TYPE_META[type].label}</span>
                    </>
                  ) : (
                    <span>Empty</span>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="reset-button"
            onClick={onClear}
            disabled={selectedTypes.length === 0}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="type-grid" role="list" aria-label="Pokemon types">
        {TYPE_ORDER.map((type) => {
          const meta = TYPE_META[type];
          const selected = selectedTypes.includes(type);

          return (
            <button
              key={type}
              type="button"
              aria-pressed={selected}
              className={`type-token ${selected ? "selected" : ""}`}
              style={
                {
                  "--type-color": meta.color,
                  "--type-accent": meta.accent,
                } as CSSProperties
              }
              onClick={() => onToggle(type)}
            >
              <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MatchupGroup({ label, multiplier, tone, entries, compact = false }: MatchupGroupProps) {
  return (
    <section className={`matchup-group ${tone} ${compact ? "compact" : ""}`}>
      <header className="matchup-group-header">
        <div>
          <p>{label}</p>
          <strong>{multiplier}</strong>
        </div>
        <span>{entries.length}</span>
      </header>

      <div className="matchup-icons">
        {entries.length > 0 ? (
          entries.map((type) => (
            <div
              key={type}
              className="matchup-icon-tile"
              style={
                {
                  "--type-color": TYPE_META[type].color,
                  "--type-accent": TYPE_META[type].accent,
                } as CSSProperties
              }
              title={getTypeLabel(type)}
            >
              <img src={getTypeIconUrl(type)} alt={getTypeLabel(type)} />
              <span>{getTypeLabel(type)}</span>
            </div>
          ))
        ) : (
          <div className="matchup-empty">None</div>
        )}
      </div>
    </section>
  );
}

type TeamSlotCardProps = {
  slot: LoadedTeamSlot;
  slotIndex: number;
  databaseLoaded: boolean;
  loadError: string | null;
  moveByKey: Map<string, MoveRecord>;
  itemOptions: ItemRecord[];
  itemByKey: ReadonlyMap<string, ItemRecord>;
  onQueryChange: (slotIndex: number, query: string) => void;
  onClear: (slotIndex: number) => void;
  onApplySlotMoveset: (slotIndex: number, config: { knownMoves: PersistedKnownMove[]; itemName: string | null }) => void;
  onApplySlotStatSpread: (slotIndex: number, statSpread: ChampionsStatSpread | null) => void;
  onBattleFormChange: (slotIndex: number, activeFormPokemonId: string | null) => void;
};

function TeamSlotCard({
  slot,
  slotIndex,
  databaseLoaded,
  loadError,
  moveByKey,
  itemOptions,
  itemByKey,
  onQueryChange,
  onClear,
  onApplySlotMoveset,
  onApplySlotStatSpread,
  onBattleFormChange,
}: TeamSlotCardProps) {
  const [isEditingAttacks, setIsEditingAttacks] = useState(false);
  const [isEditingStatSpread, setIsEditingStatSpread] = useState(false);
  const [showStatsDetails, setShowStatsDetails] = useState(false);
  const [draftKnownMoves, setDraftKnownMoves] = useState<PersistedKnownMove[]>(slot.knownMoves);
  const [draftItemName, setDraftItemName] = useState(slot.itemName ?? "");
  const [draftStatSpread, setDraftStatSpread] = useState<ChampionsStatSpread | null>(slot.resolvedStatSpread);

  useEffect(() => {
    setDraftKnownMoves(slot.knownMoves);
    setDraftItemName(slot.itemName ?? "");
    setDraftStatSpread(slot.resolvedStatSpread);
  }, [slot.activeFormPokemonId, slot.itemName, slot.knownMoves, slot.pokemonId, slot.resolvedStatSpread]);

  useEffect(() => {
    setShowStatsDetails(false);
  }, [slot.activeFormPokemonId, slot.pokemonId]);

  const pokemon = slot.pokemon;
  const pokemonQueryValue = slot.basePokemon?.name ?? slot.query;
  const coveredTypes = useMemo(
    () => getCoverageTypesFromSavedAttacks(slot.savedAttacks),
    [slot.savedAttacks],
  );
  const weakTypes = useMemo(() => {
    if (!pokemon) {
      return [];
    }

    return TYPE_ORDER.filter(
      (attackType) => (getPokemonDefensiveMultiplier(pokemon, attackType) ?? 1) > 1,
    );
  }, [pokemon]);
  const resolvedItemName = getResolvedFieldValue(draftItemName);
  const resolvedItem = resolvedItemName ? itemByKey.get(resolvedItemName.toLowerCase()) ?? null : null;
  const natureOptions = useMemo(() => getChampionsNatureOptions(), []);
  const activeStatSpread = slot.resolvedStatSpread;
  const defaultStatSpread = slot.defaultStatSpread;
  const draftSpreadComputedStats = useMemo(
    () => (pokemon && draftStatSpread ? getChampionsComputedStats(pokemon, { spread: draftStatSpread }) : null),
    [draftStatSpread, pokemon],
  );
  const draftSpreadTotalPoints = draftStatSpread ? getTotalChampionsStatPoints(draftStatSpread.statPoints) : 0;
  const draftSpreadRemainingPoints = CHAMPIONS_TOTAL_STAT_POINTS - draftSpreadTotalPoints;
  const usingCustomSpread =
    Boolean(slot.statSpread) &&
    Boolean(defaultStatSpread) &&
    Boolean(activeStatSpread) &&
    !isStatSpreadEqual(activeStatSpread, defaultStatSpread);

  const updateDraftMove = (moveId: string, patch: Partial<PersistedKnownMove>) => {
    setDraftKnownMoves((current) =>
      current.map((move) => (move.id === moveId ? { ...move, ...patch } : move)),
    );
  };

  const addDraftMove = () => {
    setDraftKnownMoves((current) => {
      if (current.length >= MAX_ATTACK_TYPES_PER_SLOT) {
        return current;
      }

      return [...current, createKnownMove()];
    });
  };

  const removeDraftMove = (moveId: string) => {
    setDraftKnownMoves((current) => current.filter((move) => move.id !== moveId));
  };

  const updateDraftMoveLabel = (moveId: string, nextLabel: string) => {
    const trimmed = nextLabel.trim();
    const matchedMove = getMoveRecordByName(trimmed, moveByKey);

    if (matchedMove) {
      updateDraftMove(moveId, {
        name: matchedMove.name,
        label: matchedMove.name,
        type: getMovePokemonType(matchedMove) ?? undefined,
        basePower: getMoveRecordDamageBasePower(matchedMove),
        category: matchedMove.category.toLowerCase() as PersistedKnownMove["category"],
        isSpreadMove: isSpreadTarget(matchedMove.target),
      });
      return;
    }

    updateDraftMove(moveId, { name: nextLabel, label: nextLabel });
  };

  const applyKnownMoves = () => {
    onApplySlotMoveset(slotIndex, {
      knownMoves: sanitizeKnownMoves(draftKnownMoves, moveByKey, MAX_ATTACK_TYPES_PER_SLOT),
      itemName: resolvedItemName,
    });
    setIsEditingAttacks(false);
  };

  const cancelAttackEdit = () => {
    setDraftKnownMoves(slot.knownMoves);
    setDraftItemName(slot.itemName ?? "");
    setIsEditingAttacks(false);
  };

  const updateDraftNature = (nature: ChampionsNatureId) => {
    if (!defaultStatSpread) {
      return;
    }

    setDraftStatSpread((current) =>
      normalizeChampionsStatSpread(
        {
          ...(current ?? defaultStatSpread),
          nature,
        },
        current ?? defaultStatSpread,
      ),
    );
  };

  const updateDraftStatPoints = (statId: ChampionsStatId, nextValue: number) => {
    if (!defaultStatSpread) {
      return;
    }

    const baseSpread = draftStatSpread ?? defaultStatSpread;
    const currentValue = baseSpread.statPoints[statId];
    const sanitized = Math.max(0, Math.min(CHAMPIONS_MAX_STAT_POINTS_PER_STAT, Math.floor(nextValue)));
    const totalWithoutCurrent = getTotalChampionsStatPoints(baseSpread.statPoints) - currentValue;
    const clampedValue = Math.min(sanitized, CHAMPIONS_TOTAL_STAT_POINTS - totalWithoutCurrent);

    setDraftStatSpread(
      normalizeChampionsStatSpread({
        nature: baseSpread.nature,
        statPoints: {
          ...baseSpread.statPoints,
          [statId]: clampedValue,
        },
      }, defaultStatSpread),
    );
  };

  const applyStatSpread = () => {
    if (!defaultStatSpread || !draftStatSpread) {
      return;
    }

    const normalizedDraft = normalizeChampionsStatSpread(draftStatSpread, defaultStatSpread);
    onApplySlotStatSpread(
      slotIndex,
      isStatSpreadEqual(normalizedDraft, defaultStatSpread) ? null : normalizedDraft,
    );
    setIsEditingStatSpread(false);
  };

  const cancelStatSpreadEdit = () => {
    setDraftStatSpread(activeStatSpread);
    setIsEditingStatSpread(false);
  };

  return (
    <article className="team-slot-card">
      <div className="team-slot-header">
        <div>
          <p className="eyebrow">Slot {slotIndex + 1}</p>
          <h3>{pokemon ? pokemon.name : "Choose a Pokemon"}</h3>
        </div>
        <button type="button" className="clear-slot-button" onClick={() => onClear(slotIndex)}>
          Clear
        </button>
      </div>

      <label className="team-input-label" htmlFor={`team-slot-${slotIndex}`}>
        Pokemon
      </label>
      <div className="team-input-row">
        <input
          id={`team-slot-${slotIndex}`}
          className="team-pokemon-input"
          list="pokemon-options"
          placeholder={databaseLoaded ? "Start typing a legal Pokemon name" : "Loading local database..."}
          value={pokemonQueryValue}
          onChange={(event) => onQueryChange(slotIndex, event.target.value)}
          disabled={!databaseLoaded}
        />
        <div className={`pokemon-sprite-frame ${pokemon ? "filled" : ""}`}>
          {pokemon ? (
            <PokemonSprite pokemon={pokemon} />
          ) : (
            <span>?</span>
          )}
        </div>
      </div>

      {pokemon ? (
        <>
          <div className="team-pokemon-meta">
            <div className="team-type-list">
              {pokemon.types.map((typeLabel) => {
                const type = getTypeFromLabel(typeLabel);
                if (!type) {
                  return null;
                }

                return (
                  <span
                    key={type}
                    className="inline-type-pill"
                    style={
                      {
                        "--type-color": TYPE_META[type].color,
                        "--type-accent": TYPE_META[type].accent,
                      } as CSSProperties
                    }
                  >
                    <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
                    {typeLabel}
                  </span>
                );
              })}
            </div>

            <div className="team-stat-row">
              <span>Spe {pokemon.baseStats.spe}</span>
              <span>BST {pokemon.bst}</span>
              <button
                type="button"
                className="stats-toggle-button"
                onClick={() => setShowStatsDetails((current) => !current)}
              >
                {showStatsDetails ? "Hide Stats" : "Show Stats"}
              </button>
            </div>

            {showStatsDetails ? (
              <div className="pokemon-stats-panel">
                <div className="pokemon-stats-grid">
                  <span className="pokemon-stat-chip">
                    <strong>HP</strong>
                    <em>{pokemon.baseStats.hp}</em>
                  </span>
                  <span className="pokemon-stat-chip">
                    <strong>Atk</strong>
                    <em>{pokemon.baseStats.atk}</em>
                  </span>
                  <span className="pokemon-stat-chip">
                    <strong>Def</strong>
                    <em>{pokemon.baseStats.def}</em>
                  </span>
                  <span className="pokemon-stat-chip">
                    <strong>SpA</strong>
                    <em>{pokemon.baseStats.spa}</em>
                  </span>
                  <span className="pokemon-stat-chip">
                    <strong>SpD</strong>
                    <em>{pokemon.baseStats.spd}</em>
                  </span>
                  <span className="pokemon-stat-chip">
                    <strong>Spe</strong>
                    <em>{pokemon.baseStats.spe}</em>
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {slot.formOptions.length > 1 ? (
            <section className="team-form-switcher" aria-label={`${slot.basePokemon?.name ?? pokemon.name} battle forms`}>
              <div className="team-form-switcher__head">
                <p className="eyebrow">Battle Form</p>
                <span>{slot.basePokemon ? `Base: ${slot.basePokemon.name}` : pokemon.name}</span>
              </div>
              <div className="team-form-switcher__options">
                {slot.formOptions.map((option) => {
                  const isSelected = (slot.activeFormPokemonId ?? null) === option.activeFormPokemonId;
                  return (
                    <button
                      key={`${slotIndex}-${option.pokemon.id}`}
                      type="button"
                      className={`team-form-option${isSelected ? " is-selected" : ""}`}
                      onClick={() => onBattleFormChange(slotIndex, option.activeFormPokemonId)}
                      aria-pressed={isSelected}
                      title={`Use ${option.pokemon.name} as the current battle form`}
                    >
                      <PokemonSprite pokemon={option.pokemon} className="team-form-option__sprite" />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="coverage-preview">
            <div className="coverage-preview-header">
              <p className="eyebrow">Weak To</p>
              <span>{weakTypes.length}</span>
            </div>
            <div className="coverage-chip-list">
              {weakTypes.length > 0 ? (
                weakTypes.map((type) => (
                  <span
                    key={`${pokemon.id}-weak-${type}`}
                    className="mini-type-pill"
                    style={
                      {
                        "--type-color": TYPE_META[type].color,
                        "--type-accent": TYPE_META[type].accent,
                      } as CSSProperties
                    }
                  >
                    {TYPE_META[type].label}
                  </span>
                ))
              ) : (
                <span className="subtle-empty">No weaknesses.</span>
              )}
            </div>
          </div>

          {activeStatSpread && defaultStatSpread ? (
            <section className="moveset-stat-panel">
              <div className="moveset-stat-panel-header">
                <div>
                  <p className="eyebrow">Stat Spread</p>
                  <h3>{usingCustomSpread ? "Team Override" : "Default Spread"}</h3>
                </div>
                <div className="attack-type-actions">
                  <span className="mini-type-pill neutral-pill">
                    {draftSpreadTotalPoints} / {CHAMPIONS_TOTAL_STAT_POINTS} SP
                  </span>
                  <button
                    type="button"
                    className="edit-attacks-button"
                    onClick={() => setIsEditingStatSpread((current) => !current)}
                  >
                    {isEditingStatSpread ? "Close" : "Edit"}
                  </button>
                </div>
              </div>

              <div className="moveset-stat-panel-toolbar">
                {isEditingStatSpread && draftStatSpread ? (
                  <label className="saved-attack-field">
                    <span>Nature</span>
                    <select
                      value={draftStatSpread.nature}
                      onChange={(event) => updateDraftNature(event.target.value as ChampionsNatureId)}
                    >
                      {natureOptions.map((option) => (
                        <option key={`${slotIndex}-${option.id}`} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="moveset-stat-panel-summary">
                    <span>{getStatSpreadSummary(activeStatSpread)}</span>
                    <span>{usingCustomSpread ? "Custom to this team" : "Using database default"}</span>
                  </div>
                )}

                {isEditingStatSpread && draftStatSpread ? (
                  <div className="moveset-stat-panel-summary">
                    <span>{getStatSpreadSummary(draftStatSpread)}</span>
                    <span>{draftSpreadRemainingPoints} SP left</span>
                  </div>
                ) : null}
              </div>

              <p className="selector-note">
                <strong>Default:</strong> {getStatSpreadSummary(defaultStatSpread)}
              </p>

              {isEditingStatSpread && draftStatSpread && draftSpreadComputedStats ? (
                <>
                  <div className="moveset-stat-slider-list">
                    {CHAMPIONS_STAT_ORDER.map((statId) => {
                      const points = draftStatSpread.statPoints[statId];
                      const finalValue = draftSpreadComputedStats[statId];

                      return (
                        <label key={`${pokemon.id}-team-spread-${slotIndex}-${statId}`} className="moveset-stat-slider-card">
                          <div className="moveset-stat-slider-top">
                            <strong>{CHAMPIONS_STAT_LABELS[statId]}</strong>
                            <span>{points} SP</span>
                            <em>{finalValue}</em>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={CHAMPIONS_MAX_STAT_POINTS_PER_STAT}
                            step={1}
                            value={points}
                            onChange={(event) => updateDraftStatPoints(statId, Number(event.target.value))}
                            className="moveset-stat-slider"
                            style={{ "--slider-fill": `${(points / CHAMPIONS_MAX_STAT_POINTS_PER_STAT) * 100}%` } as CSSProperties}
                          />
                          <div className="moveset-stat-slider-scale">
                            <span>0</span>
                            <span>{CHAMPIONS_MAX_STAT_POINTS_PER_STAT}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <div className="attack-editor-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setDraftStatSpread(defaultStatSpread)}
                    >
                      Use Default
                    </button>
                    <button type="button" className="secondary-button" onClick={cancelStatSpreadEdit}>
                      Cancel
                    </button>
                    <button type="button" className="primary-button" onClick={applyStatSpread}>
                      Apply
                    </button>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          <div className="attack-type-section">
            <div className="attack-type-header">
              <p className="eyebrow">Moveset</p>
              <div className="attack-type-actions">
                <span>{slot.knownMoves.length} / 4</span>
                <button
                  type="button"
                  className="edit-attacks-button"
                  onClick={() => setIsEditingAttacks((current) => !current)}
                >
                  {isEditingAttacks ? "Close" : "Edit"}
                </button>
              </div>
            </div>

            <div className="coverage-preview">
              <div className="coverage-preview-header">
                <p className="eyebrow">Item</p>
                <span>{slot.itemName ? "Set" : "Optional"}</span>
              </div>
              <div className="coverage-chip-list">
                {slot.itemName ? (
                  <span className="mini-type-pill neutral-pill">{slot.itemName}</span>
                ) : (
                  <span className="subtle-empty">No item chosen.</span>
                )}
              </div>
              {resolvedItem?.shortDesc || resolvedItem?.desc ? (
                <p className="selector-note" style={{ marginTop: "0.45rem" }}>
                  {resolvedItem.shortDesc || resolvedItem.desc}
                </p>
              ) : null}
            </div>

            <div className="saved-attack-list">
              {slot.knownMoves.length > 0 ? (
                slot.knownMoves.map((move, moveIndex) => {
                  const category = getKnownMoveCategory(move, pokemon);
                  const basePower = getKnownMoveBasePower(move);
                  const moveType = getKnownMoveType(move);

                  return (
                    <article
                      key={move.id}
                      className="saved-attack-chip"
                      style={moveType
                        ? (
                            {
                              "--type-color": TYPE_META[moveType].color,
                              "--type-accent": TYPE_META[moveType].accent,
                            } as CSSProperties
                          )
                        : undefined}
                    >
                      <div className="saved-attack-chip-top">
                        {moveType ? (
                          <span className="inline-type-pill saved-attack-type-pill">
                            <img src={getTypeIconUrl(moveType)} alt="" aria-hidden="true" />
                            {TYPE_META[moveType].label}
                          </span>
                        ) : (
                          <span className="inline-type-pill neutral-pill">Unknown Type</span>
                        )}
                        <strong>{getKnownMoveName(move)}</strong>
                      </div>
                      <p>
                        {category === "status"
                          ? "Status"
                          : `${formatMoveBasePowerLabel(basePower, getKnownMoveName(move))} • ${
                            category === "physical" ? "Physical" : "Special"
                          }`}
                        {category !== "status" && move.isSpreadMove ? " • Spread" : ""}
                      </p>
                    </article>
                  );
                })
              ) : (
                <span className="subtle-empty">No moves saved yet.</span>
              )}
            </div>

            {isEditingAttacks ? (
              <div className="attack-editor">
                <div className="attack-editor-topbar">
                  <p className="selector-note">
                    Save up to four full moves here. Exact move-name matches auto-fill type, category, power, and
                    spread defaults. Coverage and calculator panels will still only use the damaging subset.
                  </p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={addDraftMove}
                    disabled={draftKnownMoves.length >= MAX_ATTACK_TYPES_PER_SLOT}
                  >
                    Add Move
                  </button>
                </div>

                <label className="saved-attack-field wide">
                  <span>Held Item</span>
                  <input
                    list="item-options"
                    className="team-pokemon-input"
                    placeholder="Assault Vest"
                    value={draftItemName}
                    onChange={(event) => setDraftItemName(event.target.value)}
                  />
                </label>

                {resolvedItem ? (
                  <p className="selector-note">{resolvedItem.shortDesc || resolvedItem.desc}</p>
                ) : draftItemName.trim() ? (
                  <p className="selector-note">
                    Item not found in the local battle data yet. It will still be saved as typed.
                  </p>
                ) : (
                  <p className="selector-note">
                    Leave this empty if the slot should have no held item.
                  </p>
                )}

                {draftKnownMoves.length > 0 ? (
                  <div className="saved-attack-editor-list">
                    {draftKnownMoves.map((move, moveIndex) => {
                      const matchedMove = getMoveRecordByName(getKnownMoveName(move), moveByKey);
                      const moveType = getKnownMoveType(move);
                      const category = getKnownMoveCategory(move, pokemon);
                      const basePower = getKnownMoveBasePower(move);
                      const isWeightBasedPowerMove = isLowKickMove(getKnownMoveName(move));

                      return (
                        <article key={move.id} className="saved-attack-editor-card">
                        <div className="saved-attack-editor-header">
                          {moveType ? (
                            <span
                              className="mini-type-pill"
                              style={
                                {
                                  "--type-color": TYPE_META[moveType].color,
                                  "--type-accent": TYPE_META[moveType].accent,
                                } as CSSProperties
                              }
                            >
                              Move {moveIndex + 1}
                            </span>
                          ) : (
                            <span className="mini-type-pill neutral-pill">Move {moveIndex + 1}</span>
                          )}
                          <span className="mini-type-pill neutral-pill">
                            {category === "status"
                              ? "Status"
                              : category === "physical"
                                ? "Physical"
                                : "Special"}
                          </span>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => removeDraftMove(move.id)}
                          >
                            Remove
                          </button>
                        </div>

                        {matchedMove?.desc || matchedMove?.shortDesc ? (
                          <p className="selector-note">{matchedMove?.desc || matchedMove?.shortDesc}</p>
                        ) : null}

                        <label className="saved-attack-field wide">
                          <span>Move Name</span>
                          <input
                            list="move-options"
                            className="team-pokemon-input"
                            placeholder="Protect"
                            value={getKnownMoveName(move)}
                            onChange={(event) => updateDraftMoveLabel(move.id, event.target.value)}
                          />
                        </label>

                        <div className="saved-attack-editor-grid">
                          <label className="saved-attack-field">
                            <span>Type</span>
                            <select
                              value={moveType ?? ""}
                              onChange={(event) =>
                                updateDraftMove(move.id, {
                                  type: event.target.value ? event.target.value as PokemonType : undefined,
                                })
                              }
                            >
                              <option value="">Unknown</option>
                              {TYPE_ORDER.map((type) => (
                                <option key={`${move.id}-${type}`} value={type}>
                                  {TYPE_META[type].label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="saved-attack-field">
                            <span>Base Power</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              placeholder={category === "status" ? "Status" : isWeightBasedPowerMove ? "Weight" : "80"}
                              value={getAttackBasePowerDisplay(basePower ?? undefined)}
                              disabled={category === "status" || isWeightBasedPowerMove}
                              onChange={(event) => {
                                const parsed = Number(event.target.value);
                                updateDraftMove(move.id, {
                                  basePower:
                                    event.target.value.trim() && Number.isFinite(parsed) && parsed > 0
                                      ? Math.floor(parsed)
                                      : undefined,
                                });
                              }}
                            />
                          </label>
                        </div>

                        <div className="saved-attack-editor-controls">
                          <div className="damage-category-toggle" role="group" aria-label="Saved move category">
                            {(["physical", "special", "status"] as const).map((nextCategory) => (
                              <button
                                key={`${move.id}-${nextCategory}`}
                                type="button"
                                className={`damage-category-button ${category === nextCategory ? "active" : ""}`}
                                onClick={() =>
                                  updateDraftMove(move.id, {
                                    category: nextCategory,
                                    basePower: nextCategory === "status" ? undefined : isWeightBasedPowerMove ? 0 : basePower ?? 80,
                                  })}
                              >
                                {nextCategory === "physical"
                                  ? "Physical"
                                  : nextCategory === "special"
                                    ? "Special"
                                    : "Status"}
                              </button>
                            ))}
                          </div>

                          <button
                            type="button"
                            className={`attack-default-toggle ${Boolean(move.isSpreadMove) ? "active" : ""}`}
                            disabled={category === "status"}
                            onClick={() => updateDraftMove(move.id, { isSpreadMove: !Boolean(move.isSpreadMove) })}
                          >
                            {category === "status"
                              ? "Status Move"
                              : Boolean(move.isSpreadMove)
                                ? "Spread Move"
                                : "Single Target"}
                          </button>
                        </div>
                      </article>
                    )})}
                  </div>
                ) : (
                  <div className="team-slot-empty">Add moves here to mirror the full set from the moveset database.</div>
                )}

                <div className="attack-editor-actions">
                  <button type="button" className="secondary-button" onClick={cancelAttackEdit}>
                    Cancel
                  </button>
                  <button type="button" className="primary-button" onClick={applyKnownMoves}>
                    Apply
                  </button>
                </div>
              </div>
            ) : null}

            <div className="coverage-preview">
              <div className="coverage-preview-header">
                <p className="eyebrow">Covered Types</p>
                <span>{coveredTypes.length}</span>
              </div>
              <div className="coverage-chip-list">
                {coveredTypes.length > 0 ? (
                  coveredTypes.map((type) => (
                    <span
                      key={type}
                      className="mini-type-pill"
                      style={
                        {
                          "--type-color": TYPE_META[type].color,
                          "--type-accent": TYPE_META[type].accent,
                        } as CSSProperties
                      }
                    >
                      {TYPE_META[type].label}
                    </span>
                  ))
                ) : (
                  <span className="subtle-empty">No super-effective coverage yet.</span>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="team-slot-empty">
          {loadError ? loadError : "Select a Pokemon to start adding attacks for this slot."}
        </div>
      )}
    </article>
  );
}

// === BATTLE LAB ===

type ChosenAction =
  | { kind: "move"; moveId: string; targetId: string | null }
  | { kind: "switch"; switchInId: string }
  | { kind: "pass" };

type BattleEngineEnemyLineOption = {
  enemyPlan: JointActionPlan;
  responsePlan: JointActionPlan;
  score: number;
  rank: number;
  labels: string[];
  confidence: number;
  riskLabel: string;
  riskTone: "safe" | "watch" | "danger";
  scoreDelta: number;
  tags: string[];
};

type SimulationRun = {
  startState: BattleState;
  finalState: BattleState;
  events: TurnEvent[];
  allyPlan: JointActionPlan;
  enemyPlan: JointActionPlan;
};

type BattleLabSlotCoord = {
  side: BattleSide;
  slotIndex: 0 | 1;
};

type BattleLabEventMotion =
  | {
      kind: "attack";
      key: string;
      actorId: string;
      targetId: string | null;
      actorSlot: BattleLabSlotCoord | null;
      targetSlot: BattleLabSlotCoord | null;
      direction: "up" | "down";
      side: BattleSide;
      isSpread: boolean;
    }
  | {
      kind: "faint";
      key: string;
      combatantId: string | null;
      slot: BattleLabSlotCoord | null;
    }
  | {
      kind: "switch";
      key: string;
      outgoingId: string | null;
      incomingId: string | null;
      slot: BattleLabSlotCoord | null;
      side: BattleSide | null;
    };

type BattleLabManualMotion = {
  serial: number;
  faintedCombatantId?: string;
  faintSlot?: BattleLabSlotCoord;
  incomingCombatantId?: string;
  switchSlot?: BattleLabSlotCoord;
};

type BattleLabSlotMotion = {
  attackKey?: string;
  attackDirection?: "up" | "down";
  targetKey?: string;
  faintKey?: string;
  switchInKey?: string;
  switchOutKey?: string;
};

const BATTLE_LAB_EVENT_STEP_MS = 1050;

const STATUS_PALETTE: Record<BattleStatusCondition, { label: string; tint: string; color: string }> = {
  none: { label: "", tint: "transparent", color: "" },
  burn: { label: "BRN", tint: "rgba(239, 125, 87, 0.28)", color: "#ffb8a5" },
  paralysis: { label: "PAR", tint: "rgba(246, 207, 77, 0.26)", color: "#ffe489" },
  sleep: { label: "SLP", tint: "rgba(122, 160, 255, 0.28)", color: "#b9cfff" },
  poison: { label: "PSN", tint: "rgba(183, 121, 255, 0.24)", color: "#d5b5ff" },
  badPoison: { label: "TOX", tint: "rgba(201, 87, 255, 0.26)", color: "#e1a6ff" },
  freeze: { label: "FRZ", tint: "rgba(125, 211, 252, 0.24)", color: "#b7eaff" },
};

function getBattleLabAvailableMoves(combatant: BattleCombatantState) {
  const seenIds = new Set<string>();
  const moves: BattleMoveOption[] = [];

  for (const move of [...combatant.knownMoves, ...combatant.candidateMoves]) {
    if (seenIds.has(move.id)) {
      continue;
    }

    seenIds.add(move.id);
    moves.push(move);
  }

  return moves;
}

function getDefaultTargetForMove(
  state: BattleState,
  actor: BattleCombatantState,
  move: BattleMoveOption,
): string | null {
  if (move.targetKind === "self") return actor.id;
  if (move.targetKind === "singleAlly") {
    const otherAllyId = state.sides[actor.side].activeIds.find(
      (id): id is string => Boolean(id) && id !== actor.id,
    );
    return otherAllyId ?? actor.id;
  }
  if (
    move.targetKind === "allAllies" ||
    move.targetKind === "allAdjacent" ||
    move.targetKind === "allOpponents" ||
    move.targetKind === "field"
  ) {
    return null;
  }
  const opp: BattleSide = actor.side === "ally" ? "enemy" : "ally";
  const myIdx = state.sides[actor.side].activeIds.findIndex((id) => id === actor.id);
  const oppIds = state.sides[opp].activeIds;
  const preferred = (myIdx >= 0 ? oppIds[myIdx] : null) ?? oppIds.find((id): id is string => Boolean(id));
  return preferred ?? null;
}

function buildActorPlannedAction(
  state: BattleState,
  combatant: BattleCombatantState,
  pick: ChosenAction | undefined,
  fallback: PlannedAction | null,
): PlannedAction {
  const actorLabel = combatant.pokemon.name;

  if (!pick) {
    if (fallback) return fallback;
    return {
      actorId: combatant.id,
      actorLabel,
      action: { type: "pass", actorId: combatant.id },
      summary: `${actorLabel}: pass`,
      heuristicScore: 0,
    };
  }

  if (pick.kind === "pass") {
    return {
      actorId: combatant.id,
      actorLabel,
      action: { type: "pass", actorId: combatant.id },
      summary: `${actorLabel}: pass`,
      heuristicScore: 0,
    };
  }

  if (pick.kind === "switch") {
    const switchIn = state.combatants[pick.switchInId];
    return {
      actorId: combatant.id,
      actorLabel,
      action: { type: "switch", actorId: combatant.id, switchInId: pick.switchInId },
      summary: `${actorLabel}: switch to ${switchIn?.pokemon.name ?? "bench"}`,
      heuristicScore: 0,
    };
  }

  const moveOption =
    [...combatant.knownMoves, ...combatant.candidateMoves].find((m) => m.id === pick.moveId) ?? null;
  const moveName = moveOption?.name ?? "Move";
  const target = pick.targetId ? state.combatants[pick.targetId] ?? null : null;
  const targetLabel =
    moveOption?.targetKind === "allOpponents"
      ? "both foes"
      : moveOption?.targetKind === "self"
        ? ""
        : target
          ? target.pokemon.name
          : "";

  return {
    actorId: combatant.id,
    actorLabel,
    action: { type: "move", actorId: combatant.id, moveId: pick.moveId, targetId: pick.targetId },
    summary: `${actorLabel}: ${moveName}${targetLabel ? ` into ${targetLabel}` : ""}`,
    heuristicScore: 0,
  };
}

function buildJointPlanFromUserChoices(
  state: BattleState,
  side: BattleSide,
  chosen: Record<string, ChosenAction>,
  fallback: JointActionPlan | null,
): JointActionPlan {
  const activeIds = state.sides[side].activeIds.filter((id): id is string => Boolean(id));
  const actions = activeIds
    .map((id) => {
      const combatant = state.combatants[id];
      if (!combatant) return null;
      const fallbackAction = fallback?.actions.find((a) => a.actorId === id) ?? null;
      return buildActorPlannedAction(state, combatant, chosen[id], fallbackAction);
    })
    .filter((a): a is PlannedAction => a !== null);

  return {
    side,
    actions,
    summary: actions.length > 0 ? actions.map((a) => a.summary).join(" + ") : `${side} pass`,
    heuristicScore: 0,
  };
}

function getPlannedActionDetail(action: PlannedAction) {
  return action.summary.replace(`${action.actorLabel}: `, "");
}

function getBattleEngineMechanicTags(...sources: Array<string | null | undefined>) {
  const text = sources.filter(Boolean).join(" ").toLowerCase();
  const tags: string[] = [];
  const add = (tag: string) => {
    if (!tags.includes(tag)) tags.push(tag);
  };

  if (text.includes("protect") || text.includes("guard")) add("Protect line");
  if (text.includes("fake out") || text.includes("sucker") || text.includes("extreme speed") || text.includes("priority")) add("Priority");
  if (text.includes("tailwind") || text.includes("trick room") || text.includes("speed-control") || text.includes("speed control")) add("Speed control");
  if (text.includes("trick room")) add("Trick Room");
  if (text.includes("rain") || text.includes("sun") || text.includes("snow") || text.includes("sand") || text.includes("weather")) add("Weather");
  if (text.includes("focus sash") || text.includes("sash")) add("Focus Sash");
  if (text.includes("intimidate")) add("Intimidate");
  if (text.includes("swords dance") || text.includes("nasty plot") || text.includes("dragon dance") || text.includes("setup")) add("Setup");
  if (text.includes("taunt") || text.includes("encore") || text.includes("disable") || text.includes("spore") || text.includes("sleep")) add("Disruption");
  if (text.includes("follow me") || text.includes("rage powder") || text.includes("redirection")) add("Redirection");
  if (text.includes("ko-race") || text.includes("ko race") || text.includes("close combat") || text.includes("wave crash")) add("KO race");

  return tags.slice(0, 4);
}

function getBattleEngineLineRisk(scoreDelta: number, labels: string[]) {
  if (labels.some((label) => label.toLowerCase().includes("worst")) || scoreDelta <= -800) {
    return { label: "High risk", tone: "danger" as const };
  }
  if (scoreDelta <= -250) {
    return { label: "Watch", tone: "watch" as const };
  }
  return { label: "Stable", tone: "safe" as const };
}

function getBattleEngineLineConfidence(labels: string[], policyWeight: number) {
  const base = labels.some((label) => label.toLowerCase().includes("likely")) ? 58 : 36;
  const normalizedPolicyWeight = Math.max(0, Math.min(1, policyWeight));
  const policyBoost = Math.round(normalizedPolicyWeight * 34);
  const worstPenalty = labels.some((label) => label.toLowerCase().includes("worst")) ? -8 : 0;
  return Math.max(18, Math.min(96, base + policyBoost + worstPenalty));
}

function formatBattleEngineSigned(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function getMoveOptionFromBattleAction(state: BattleState, action: BattleAction) {
  if (action.type !== "move") {
    return null;
  }

  const actor = state.combatants[action.actorId];
  if (!actor) {
    return null;
  }

  return [...actor.knownMoves, ...actor.candidateMoves].find((move) => move.id === action.moveId) ?? null;
}

function isManualDamageMove(move: BattleMoveOption | null) {
  return move?.effectKind === "damage" || move?.effectKind === "fakeOut";
}

function getBattleLabSlotCoord(state: BattleState | null, combatantId: string | null | undefined): BattleLabSlotCoord | null {
  if (!state || !combatantId) {
    return null;
  }

  for (const side of ["ally", "enemy"] as const) {
    const slotIndex = state.sides[side].activeIds.findIndex((id) => id === combatantId);
    if (slotIndex === 0 || slotIndex === 1) {
      return { side, slotIndex };
    }
  }

  return null;
}

function sameBattleLabSlotCoord(left: BattleLabSlotCoord | null | undefined, side: BattleSide, slotIndex: 0 | 1) {
  return Boolean(left && left.side === side && left.slotIndex === slotIndex);
}

function cloneBattleLabState(state: BattleState): BattleState {
  return {
    combatants: Object.fromEntries(
      Object.entries(state.combatants).map(([id, combatant]) => [
        id,
        {
          ...combatant,
          stages: { ...combatant.stages },
          knownMoves: [...combatant.knownMoves],
          candidateMoves: [...combatant.candidateMoves],
        },
      ]),
    ),
    sides: {
      ally: {
        ...state.sides.ally,
        activeIds: [...state.sides.ally.activeIds] as [string | null, string | null],
        benchIds: [...state.sides.ally.benchIds],
        allySwitchPair: state.sides.ally.allySwitchPair
          ? ([...state.sides.ally.allySwitchPair] as [string, string])
          : null,
      },
      enemy: {
        ...state.sides.enemy,
        activeIds: [...state.sides.enemy.activeIds] as [string | null, string | null],
        benchIds: [...state.sides.enemy.benchIds],
        allySwitchPair: state.sides.enemy.allySwitchPair
          ? ([...state.sides.enemy.allySwitchPair] as [string, string])
          : null,
      },
    },
    field: { ...state.field },
    policies: { ...state.policies },
  };
}

function findBattleLabCombatantIdByName(state: BattleState | null, name: string) {
  if (!state) {
    return null;
  }

  const key = normalizePokemonNameKey(name);
  return (
    Object.values(state.combatants).find((combatant) => normalizePokemonNameKey(combatant.pokemon.name) === key)?.id ??
    null
  );
}

function getBattleLabMoveForEvent(state: BattleState, actorId: string | null, moveName: string) {
  if (!actorId) {
    return null;
  }

  const actor = state.combatants[actorId];
  if (!actor) {
    return null;
  }

  const moveKey = normalizePokemonNameKey(moveName);
  return getBattleLabAvailableMoves(actor).find((move) => normalizePokemonNameKey(move.name) === moveKey) ?? null;
}

function clampBattleLabHp(combatant: BattleCombatantState, nextHp: number) {
  combatant.currentHp = Math.max(0, Math.min(combatant.maxHp, Math.round(nextHp)));
}

function getBattleLabEventCombatantId(
  state: BattleState,
  event: TurnEvent,
  role: "actor" | "target",
  fallbackName?: string,
) {
  const explicitId = role === "actor" ? event.actorId : event.targetId;
  return explicitId ?? (fallbackName ? findBattleLabCombatantIdByName(state, fallbackName) : null);
}

function applyBattleLabSwitchEvent(state: BattleState, event: TurnEvent, run: SimulationRun, text: string) {
  let match = text.match(/^(.+?) switches out for (.+?)\.$/i);
  if (match) {
    const outgoingId = getBattleLabEventCombatantId(state, event, "actor", match[1]);
    const incomingId =
      getBattleLabEventCombatantId(state, event, "target", match[2]) ??
      findBattleLabCombatantIdByName(run.finalState, match[2]);
    const outgoing = outgoingId ? state.combatants[outgoingId] : null;
    const incoming = incomingId ? state.combatants[incomingId] : null;
    if (!outgoing || !incoming) {
      return;
    }

    const sideState = state.sides[outgoing.side];
    const activeIndex = sideState.activeIds.findIndex((id) => id === outgoing.id);
    if (activeIndex === 0 || activeIndex === 1) {
      sideState.activeIds[activeIndex] = incoming.id;
      sideState.benchIds = [...sideState.benchIds.filter((id) => id !== incoming.id), outgoing.id];
    }
    return;
  }

  match = text.match(/^(.+?) enters the battle for (ally|enemy)\.$/i);
  if (!match) {
    return;
  }

  const incomingId =
    getBattleLabEventCombatantId(state, event, "target", match[1]) ??
    findBattleLabCombatantIdByName(run.finalState, match[1]);
  const incoming = incomingId ? state.combatants[incomingId] : null;
  if (!incoming) {
    return;
  }

  const side = match[2] as BattleSide;
  const sideState = state.sides[side];
  const activeIndex = sideState.activeIds.findIndex((id) => !id || (state.combatants[id]?.currentHp ?? 0) <= 0);
  if (activeIndex === 0 || activeIndex === 1) {
    sideState.activeIds[activeIndex] = incoming.id;
    sideState.benchIds = sideState.benchIds.filter((id) => id !== incoming.id);
  }
}

function applyBattleLabSideConditionEvent(state: BattleState, event: TurnEvent, run: SimulationRun, text: string) {
  let match = text.match(/^(.+?) sets Tailwind for (ally|enemy)\.$/i);
  if (match) {
    const side = match[2] as BattleSide;
    state.sides[side].tailwindTurns = Math.max(run.finalState.sides[side].tailwindTurns, 1);
    return;
  }

  match = text.match(/^(.+?) twists the dimensions\.$/i);
  if (match) {
    state.field.trickRoomTurns = Math.max(run.finalState.field.trickRoomTurns, 1);
    return;
  }

  match = text.match(/^(.+?) ends Trick Room\.$/i);
  if (match) {
    state.field.trickRoomTurns = 0;
    return;
  }

  match = text.match(/^(.+?) sets (Reflect|Light Screen|Aurora Veil)\.$/i);
  if (match) {
    const actorId = getBattleLabEventCombatantId(state, event, "actor", match[1]);
    const actor = actorId ? state.combatants[actorId] : null;
    if (!actor) {
      return;
    }

    if (/reflect/i.test(match[2])) {
      state.sides[actor.side].reflectTurns = Math.max(run.finalState.sides[actor.side].reflectTurns, 1);
    } else if (/light screen/i.test(match[2])) {
      state.sides[actor.side].lightScreenTurns = Math.max(run.finalState.sides[actor.side].lightScreenTurns, 1);
    } else {
      state.sides[actor.side].auroraVeilTurns = Math.max(run.finalState.sides[actor.side].auroraVeilTurns, 1);
    }
  }
}

function applyBattleLabEventToDisplayState(state: BattleState, event: TurnEvent, run: SimulationRun) {
  const text = event.text.trim();
  let match = text.match(/^(.+?) uses (.+?) on (.+?) for (\d+) HP/i);
  if (match) {
    const targetId = getBattleLabEventCombatantId(state, event, "target", match[3]);
    const target = targetId ? state.combatants[targetId] : null;
    if (target) {
      clampBattleLabHp(target, target.currentHp - Number(match[4]));
    }
    return;
  }

  match = text.match(/^(.+?) heals (\d+) HP from (.+?)\.$/i) ?? text.match(/^(.+?) restores (\d+) HP with (.+?)\.$/i);
  if (match) {
    const targetId = getBattleLabEventCombatantId(state, event, "target", match[1]);
    const target = targetId ? state.combatants[targetId] : null;
    if (target) {
      clampBattleLabHp(target, target.currentHp + Number(match[2]));
    }
    return;
  }

  match = text.match(/^(.+?) is hurt by (.+?) for (\d+) HP\.$/i);
  if (match) {
    const targetId = getBattleLabEventCombatantId(state, event, "target", match[1]);
    const target = targetId ? state.combatants[targetId] : null;
    if (target) {
      clampBattleLabHp(target, target.currentHp - Number(match[3]));
    }
    return;
  }

  match = text.match(/^(.+?) takes (\d+) Life Orb recoil\.$/i);
  if (match) {
    const actorId = getBattleLabEventCombatantId(state, event, "actor", match[1]);
    const actor = actorId ? state.combatants[actorId] : null;
    if (actor) {
      clampBattleLabHp(actor, actor.currentHp - Number(match[2]));
    }
    return;
  }

  match = text.match(/^(.+?) faints(?: from recoil)?\.$/i);
  if (match) {
    const combatantId =
      getBattleLabEventCombatantId(state, event, "target", match[1]) ??
      getBattleLabEventCombatantId(state, event, "actor", match[1]);
    const combatant = combatantId ? state.combatants[combatantId] : null;
    if (combatant) {
      combatant.currentHp = 0;
    }
    return;
  }

  match = text.match(/^(.+?) is now (burned|paralyzed|asleep|poisoned|badly poisoned|frozen)\.$/i);
  if (match) {
    const targetId = getBattleLabEventCombatantId(state, event, "target", match[1]);
    const target = targetId ? state.combatants[targetId] : null;
    if (target) {
      const statusByLabel: Record<string, BattleStatusCondition> = {
        burned: "burn",
        paralyzed: "paralysis",
        asleep: "sleep",
        poisoned: "poison",
        "badly poisoned": "badPoison",
        frozen: "freeze",
      };
      const statusLabel = (match[2] ?? "").toLowerCase();
      target.statusCondition = statusByLabel[statusLabel] ?? "none";
      target.sleepTurns = target.statusCondition === "sleep" ? Math.max(1, target.sleepTurns || 2) : 0;
      target.toxicTurns = target.statusCondition === "badPoison" ? Math.max(1, target.toxicTurns || 1) : 0;
    }
    return;
  }

  if (/ switches out for | enters the battle for /i.test(text)) {
    applyBattleLabSwitchEvent(state, event, run, text);
    return;
  }

  if (/ uses Ally Switch\.$/i.test(text)) {
    const actor = event.actorId ? state.combatants[event.actorId] : null;
    const target = event.targetId ? state.combatants[event.targetId] : null;
    if (actor && target && actor.side === target.side) {
      const activeIds = state.sides[actor.side].activeIds;
      const actorIndex = activeIds.findIndex((id) => id === actor.id);
      const targetIndex = activeIds.findIndex((id) => id === target.id);
      if ((actorIndex === 0 || actorIndex === 1) && (targetIndex === 0 || targetIndex === 1)) {
        activeIds[actorIndex] = target.id;
        activeIds[targetIndex] = actor.id;
      }
    }
    return;
  }

  applyBattleLabSideConditionEvent(state, event, run, text);
}

function buildBattleLabDisplayStateAtEvent(run: SimulationRun, eventIndex: number) {
  if (run.events.length === 0 || eventIndex >= run.events.length) {
    return run.finalState;
  }

  const state = cloneBattleLabState(run.startState);
  const appliedEvents = run.events.slice(0, Math.max(0, eventIndex));
  for (const event of appliedEvents) {
    applyBattleLabEventToDisplayState(state, event, run);
  }
  return state;
}

function buildBattleLabEventMotion(
  run: SimulationRun,
  displayState: BattleState,
  event: TurnEvent,
  eventIndex: number,
): BattleLabEventMotion | null {
  const key = `bl-event-${eventIndex}-${event.actorId ?? "none"}-${event.targetId ?? "none"}`;
  const text = event.text.trim();

  let match = text.match(/^(.+?) uses (.+?) on (.+?) for \d+ HP/i);
  if (match) {
    const actorId = event.actorId ?? findBattleLabCombatantIdByName(run.startState, match[1]) ?? null;
    const actor = actorId ? (displayState.combatants[actorId] ?? run.startState.combatants[actorId]) : null;
    const move = getBattleLabMoveForEvent(run.startState, actorId, match[2]);
    const isSpread = Boolean(
      move &&
        (move.targetKind === "allAdjacent" || move.targetKind === "allOpponents" || move.targetKind === "allAllies"),
    );

    return {
      kind: "attack",
      key,
      actorId: actorId ?? "",
      targetId: event.targetId ?? findBattleLabCombatantIdByName(displayState, match[3]) ?? null,
      actorSlot: getBattleLabSlotCoord(displayState, actorId) ?? getBattleLabSlotCoord(run.startState, actorId),
      targetSlot: getBattleLabSlotCoord(displayState, event.targetId) ?? getBattleLabSlotCoord(run.startState, event.targetId),
      direction: actor?.side === "enemy" ? "down" : "up",
      side: actor?.side ?? "ally",
      isSpread,
    };
  }

  match = text.match(/^(.+?) switches out for (.+?)\.$/i);
  if (match) {
    const outgoingId = event.actorId ?? findBattleLabCombatantIdByName(run.startState, match[1]) ?? null;
    const incomingId = event.targetId ?? findBattleLabCombatantIdByName(displayState, match[2]) ?? null;
    const outgoing = outgoingId ? (run.startState.combatants[outgoingId] ?? displayState.combatants[outgoingId]) : null;
    return {
      kind: "switch",
      key,
      outgoingId,
      incomingId,
      slot: getBattleLabSlotCoord(run.startState, outgoingId) ?? getBattleLabSlotCoord(displayState, incomingId),
      side: outgoing?.side ?? null,
    };
  }

  match = text.match(/^(.+?) enters the battle for (ally|enemy)\.$/i);
  if (match) {
    const incomingId = event.targetId ?? findBattleLabCombatantIdByName(displayState, match[1]) ?? null;
    return {
      kind: "switch",
      key,
      outgoingId: null,
      incomingId,
      slot: getBattleLabSlotCoord(displayState, incomingId) ?? getBattleLabSlotCoord(run.finalState, incomingId),
      side: match[2] as BattleSide,
    };
  }

  match = text.match(/^(.+?) faints(?: from recoil)?\.$/i);
  if (match) {
    const combatantId = event.targetId ?? event.actorId ?? findBattleLabCombatantIdByName(run.startState, match[1]) ?? null;
    return {
      kind: "faint",
      key,
      combatantId,
      slot: getBattleLabSlotCoord(run.startState, combatantId) ?? getBattleLabSlotCoord(displayState, combatantId),
    };
  }

  return null;
}

function buildUtilityOnlyPlan(state: BattleState, plan: JointActionPlan): JointActionPlan {
  return {
    ...plan,
    actions: plan.actions.map((plannedAction) => {
      const move = getMoveOptionFromBattleAction(state, plannedAction.action);

      if (isManualDamageMove(move)) {
        return {
          ...plannedAction,
          action: { type: "pass", actorId: plannedAction.actorId },
          summary: `${plannedAction.actorLabel}: manual board update`,
        };
      }

      return plannedAction;
    }),
  };
}

function applyChosenMoveHistoryToState(state: BattleState, plans: JointActionPlan[]) {
  for (const plan of plans) {
    for (const plannedAction of plan.actions) {
      const actor = state.combatants[plannedAction.actorId];
      if (!actor) {
        continue;
      }

      if (plannedAction.action.type === "move") {
        actor.lastMoveId = plannedAction.action.moveId;
        const move = getMoveOptionFromBattleAction(state, plannedAction.action);
        if (move?.effectKind !== "protect") {
          actor.protectStreak = 0;
        }
      } else if (plannedAction.action.type === "switch") {
        actor.protectStreak = 0;
      }
    }
  }
}

function classifyHpTone(hpPercent: number) {
  if (hpPercent <= 25) return "danger" as const;
  if (hpPercent <= 50) return "warn" as const;
  return "healthy" as const;
}

function summarizeBattleLabEvent(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  let match = trimmed.match(/^(.+?) uses (.+?) on (.+?) for (\d+) HP/i);
  if (match) {
    return `${match[1]} -> ${match[3]}: ${match[2]} -${match[4]}`;
  }

  match = trimmed.match(/^(.+?) uses (Protect|Detect|Quick Guard|Wide Guard)\.$/i);
  if (match) {
    return `${match[1]}: ${match[2]}`;
  }

  match = trimmed.match(/^(.+?) sets Tailwind for (ally|enemy)\.$/i);
  if (match) {
    return `${match[1]}: Tailwind`;
  }

  match = trimmed.match(/^(.+?) twists the dimensions\.$/i);
  if (match) {
    return `${match[1]}: Trick Room`;
  }

  match = trimmed.match(/^(.+?) ends Trick Room\.$/i);
  if (match) {
    return `${match[1]}: end Trick Room`;
  }

  match = trimmed.match(/^(.+?) flinches from Fake Out\.$/i);
  if (match) {
    return `${match[1]} flinched`;
  }

  match = trimmed.match(/^(.+?) flinches after (.+?)'s (.+?)\.$/i);
  if (match) {
    return `${match[1]} flinched`;
  }

  match = trimmed.match(/^(.+?) blocks (.+?) with Protect\.$/i);
  if (match) {
    return `${match[1]} protected`;
  }

  match = trimmed.match(/^(.+?) blocks (.+?)'s (.+?) with Protect\.$/i);
  if (match) {
    return `${match[1]} protected`;
  }

  match = trimmed.match(/^(.+?) switches out for (.+?)\.$/i);
  if (match) {
    return `${match[1]} -> ${match[2]}`;
  }

  match = trimmed.match(/^(.+?) enters the battle for (ally|enemy)\.$/i);
  if (match) {
    return `${match[1]} entered`;
  }

  match = trimmed.match(/^(.+?) wakes? up\.$/i);
  if (match) {
    return `${match[1]} woke up`;
  }

  match = trimmed.match(/^(.+?) is asleep and cannot move\.$/i);
  if (match) {
    return `${match[1]} asleep`;
  }

  match = trimmed.match(/^(.+?) is frozen solid and cannot move\.$/i);
  if (match) {
    return `${match[1]} frozen`;
  }

  match = trimmed.match(/^(.+?)'s (.+?) fails\.$/i);
  if (match) {
    return `${match[1]}: ${match[2]} failed`;
  }

  match = trimmed.match(/^(.+?) faints\.$/i);
  if (match) {
    return `${match[1]} fainted`;
  }

  match = trimmed.match(/^(.+?) restores (\d+) HP with (.+?)\.$/i);
  if (match) {
    return `${match[1]} +${match[2]} ${match[3]}`;
  }

  match = trimmed.match(/^(.+?) is hurt by (.+?) for (\d+) HP\.$/i);
  if (match) {
    return `${match[1]} ${match[2]} -${match[3]}`;
  }

  match = trimmed.match(/^(.+?) takes (\d+) Life Orb recoil\.$/i);
  if (match) {
    return `${match[1]} recoil -${match[2]}`;
  }

  return trimmed;
}

function getBattleLabCombatantTone(combatantId: string | null | undefined) {
  if (!combatantId) {
    return "neutral" as const;
  }

  if (combatantId.startsWith("ally-")) {
    return "ally" as const;
  }

  if (combatantId.startsWith("enemy-")) {
    return "enemy" as const;
  }

  return "neutral" as const;
}

function getBattleLabCombatantName(
  simulationRun: SimulationRun | null,
  fallbackState: BattleState | null,
  combatantId: string | null | undefined,
) {
  if (!combatantId) {
    return null;
  }

  return (
    simulationRun?.finalState.combatants[combatantId]?.pokemon.name ??
    simulationRun?.startState.combatants[combatantId]?.pokemon.name ??
    fallbackState?.combatants[combatantId]?.pokemon.name ??
    combatantId
  );
}

type BattleLabMoveButtonProps = {
  move: BattleMoveOption;
  selected: boolean;
  onClick: () => void;
  target: BattleCombatantState | null;
  onCycleTarget?: () => void;
  canCycleTarget: boolean;
  lastMoveSelected?: boolean;
  onSetLastMove?: () => void;
  canSetLastMove?: boolean;
  disabled?: boolean;
};

function BattleLabMoveButton({
  move,
  selected,
  onClick,
  target,
  onCycleTarget,
  canCycleTarget,
  lastMoveSelected = false,
  onSetLastMove,
  canSetLastMove = false,
  disabled,
}: BattleLabMoveButtonProps) {
  const typeColor = move.type ? TYPE_META[move.type].color : "#9aa3b8";
  const accent = move.type ? TYPE_META[move.type].accent : "#4b5472";
  const labelBp = isLowKickMove(move.name) ? "Weight" : move.basePower ? `${move.basePower}` : move.effectKind === "damage" ? "—" : "STA";
  const labelAcc = move.accuracy >= 100 ? "—" : `${move.accuracy}`;
  const tag =
    move.source === "candidate" ? "?" : move.source === "inferred" ? "i" : null;

  return (
    <div
      className={`bl-move-btn ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
      style={{ ["--type-color" as never]: typeColor, ["--type-accent" as never]: accent }}
    >
      <button
        type="button"
        className="bl-move-btn-main"
        onClick={onClick}
        disabled={disabled}
        title={move.shortDesc || move.name}
      >
        <span className="bl-move-name">{move.name}</span>
        <span className="bl-move-meta">
          <span className="bl-move-bp">BP {labelBp}</span>
          <span className="bl-move-acc">Acc {labelAcc}</span>
        </span>
        {tag ? <span className="bl-move-tag">{tag}</span> : null}
      </button>
      {selected && target ? (
        <button
          type="button"
          className="bl-move-target"
          onClick={onCycleTarget}
          disabled={!canCycleTarget}
          title={canCycleTarget ? "Click to retarget" : "Target locked"}
        >
          ➜ {target.pokemon.name.slice(0, 8)}
        </button>
      ) : selected ? (
        <span className="bl-move-target no-target">spread</span>
      ) : null}
      {canSetLastMove ? (
        <button
          type="button"
          className={`bl-move-last ${lastMoveSelected ? "active" : ""}`}
          onClick={onSetLastMove}
          disabled={disabled}
          title="Set as last used move for board rebuilds"
        >
          {lastMoveSelected ? "Last Move" : "Mark Last"}
        </button>
      ) : null}
    </div>
  );
}

type BattleLabSlotProps = {
  combatant: BattleCombatantState | null;
  rankLabel: string;
  side: BattleSide;
  displayHp: number;
  displayHpPercent: number;
  projectedHp: number | null;
  projectedHpDelta: number | null;
  pulse: number;
  effectFlash: "protect" | "status" | null;
  editing: boolean;
  quickEditing: boolean;
  canFaint: boolean;
  onFaint: () => void;
  onToggleEdit: () => void;
  onEditPatch: (patch: Partial<BattleSimulatorMemberState>) => void;
  simulatorPatch: BattleSimulatorMemberState | null;
  motion?: BattleLabSlotMotion | null;
  formOptions?: TeamFormOption[];
  onBattleFormChange?: (activeFormPokemonId: string | null) => void;
};

function BattleLabSlot({
  combatant,
  rankLabel,
  side,
  displayHp,
  displayHpPercent,
  projectedHp,
  projectedHpDelta,
  pulse,
  effectFlash,
  editing,
  quickEditing,
  canFaint,
  onFaint,
  onToggleEdit,
  onEditPatch,
  simulatorPatch,
  motion = null,
  formOptions = [],
  onBattleFormChange,
}: BattleLabSlotProps) {
  if (!combatant) {
    return (
      <div className={`bl-slot ${side} empty`}>
        <span className="bl-slot-rank">{rankLabel}</span>
        <span className="bl-slot-empty">No Pokemon</span>
      </div>
    );
  }

  const hpTone = classifyHpTone(displayHpPercent);
  const status = STATUS_PALETTE[combatant.statusCondition];
  const availableMoves = getBattleLabAvailableMoves(combatant);
  const lastMove = availableMoves.find((move) => move.id === simulatorPatch?.lastMoveId) ?? null;
  const encoredMove = availableMoves.find((move) => move.id === simulatorPatch?.encoredMoveId) ?? null;
  const disabledMove = availableMoves.find((move) => move.id === simulatorPatch?.disabledMoveId) ?? null;
  const stageChips = (
    [
      ["Atk", combatant.stages.attack],
      ["Def", combatant.stages.defense],
      ["SpA", combatant.stages.specialAttack],
      ["SpD", combatant.stages.specialDefense],
      ["Spe", combatant.stages.speed],
    ] as const
  ).filter(([, v]) => v !== 0);
  const currentFormOption = formOptions.find((option) => option.pokemon.id === combatant.pokemon.id) ?? null;
  const quickFormOptions =
    quickEditing && onBattleFormChange && formOptions.length > 1
      ? formOptions.filter((option) => option.pokemon.id !== combatant.pokemon.id)
      : [];

  return (
    <div
      className={`bl-slot ${side} ${effectFlash ? `flash-${effectFlash}` : ""} ${
        motion?.attackKey ? `is-attacking attack-${motion.attackDirection ?? "up"}` : ""
      } ${motion?.targetKey ? "is-targeted" : ""} ${motion?.faintKey ? "is-fainting" : ""} ${
        motion?.switchInKey ? "is-switching-in" : ""
      } ${motion?.switchOutKey ? "is-switching-out" : ""}`}
      style={{ ["--status-tint" as never]: status.tint }}
    >
      <div className="bl-slot-head">
        <span className={`bl-slot-rank ${side}`}>{rankLabel}</span>
        <strong className="bl-slot-name">{combatant.pokemon.name}</strong>
        <div className="bl-slot-head-actions">
          {canFaint ? (
            <button
              type="button"
              className="bl-slot-faint"
              onClick={onFaint}
              title={`Mark ${combatant.pokemon.name} as fainted`}
              aria-label={`Faint ${combatant.pokemon.name}`}
            >
              KO
            </button>
          ) : null}
          <button
            type="button"
            className={`bl-slot-edit ${editing ? "active" : ""}`}
            onClick={onToggleEdit}
            title="Edit this slot"
            aria-label="Edit slot"
          >
            ⚙
          </button>
        </div>
      </div>

      {quickFormOptions.length > 0 ? (
        <div className="bl-slot-form-quick" aria-label={`${combatant.pokemon.name} battle form shortcuts`}>
          {quickFormOptions.map((option) => {
            const isBase = option.isBase;
            return (
              <button
                key={`${combatant.id}-quick-form-${option.pokemon.id}`}
                type="button"
                className={isBase ? "normal" : "mega"}
                onClick={() => onBattleFormChange?.(option.activeFormPokemonId)}
                title={isBase ? "Switch this slot back to normal form" : `Mega evolve into ${option.pokemon.name}`}
              >
                {isBase ? "Normal" : option.label}
              </button>
            );
          })}
          {currentFormOption && !currentFormOption.isBase ? <span>{currentFormOption.label}</span> : null}
        </div>
      ) : null}

      <div className="bl-slot-sprite-wrap">
        <PokemonSprite pokemon={combatant.pokemon} className="bl-slot-sprite" />
        {motion?.attackKey ? (
          <PokemonSprite
            key={`attack-${motion.attackKey}-${combatant.id}`}
            pokemon={combatant.pokemon}
            className={`bl-attack-ghost ${motion.attackDirection ?? "up"}`}
          />
        ) : null}
        {motion?.targetKey ? <span key={`impact-${motion.targetKey}-${combatant.id}`} className="bl-impact-ring" /> : null}
        {motion?.faintKey ? (
          <span key={`faint-${motion.faintKey}-${combatant.id}`} className="bl-faint-burst" aria-hidden="true">
            <span className="bl-faint-skull">☠</span>
          </span>
        ) : null}
        {motion?.switchInKey ? (
          <span key={`switch-in-${motion.switchInKey}-${combatant.id}`} className="bl-switch-beam" aria-hidden="true">
            <span>IN</span>
          </span>
        ) : null}
        {pulse !== 0 ? (
          <span key={`dmg-${pulse}-${combatant.id}`} className={`bl-damage-pop ${pulse < 0 ? "heal" : "damage"}`}>
            {pulse > 0 ? `-${pulse}` : `+${-pulse}`}
          </span>
        ) : null}
        {effectFlash === "protect" ? <span className="bl-protect-shield">⛨</span> : null}
      </div>

      <div className="bl-slot-hp">
        <div className="bl-slot-hp-bar">
          <span
            className={`bl-slot-hp-fill ${hpTone}`}
            style={{ width: `${Math.max(0, displayHpPercent).toFixed(1)}%` }}
          />
        </div>
        <div className="bl-slot-hp-row">
          <small>
            {Math.round(displayHp)}/{combatant.maxHp}
          </small>
          {status.label ? (
            <small className="bl-slot-status" style={{ color: status.color }}>
              {status.label}
              {combatant.statusCondition === "sleep" && combatant.sleepTurns > 0 ? ` ${combatant.sleepTurns}` : ""}
              {combatant.statusCondition === "badPoison" && combatant.toxicTurns > 0 ? ` ${combatant.toxicTurns}` : ""}
            </small>
          ) : null}
        </div>
        {projectedHpDelta !== null && projectedHp !== null && projectedHpDelta !== 0 ? (
          <div className={`bl-slot-hp-projection ${projectedHpDelta < 0 ? "damage" : "heal"}`}>
            <small>
              Proj {projectedHpDelta > 0 ? `+${projectedHpDelta}` : projectedHpDelta} {"->"} {projectedHp}/{combatant.maxHp}
            </small>
          </div>
        ) : null}
      </div>

      {quickEditing && simulatorPatch ? (
        <div className="bl-slot-hp-quick">
          {side === "ally" ? (
            <>
              <span>HP</span>
              <input
                type="number"
                min={0}
                max={combatant.maxHp}
                step={1}
                value={getLevel50CurrentHpFromPercent(combatant.maxHp, simulatorPatch.hpPercent)}
                onChange={(e) => {
                  const nextHp = Math.max(0, Math.min(combatant.maxHp, Math.round(Number(e.target.value) || 0)));
                  const nextPercent = combatant.maxHp > 0 ? (nextHp / combatant.maxHp) * 100 : 0;
                  onEditPatch({ hpPercent: clampPercent(nextPercent) });
                }}
              />
              <strong>/ {combatant.maxHp}</strong>
            </>
          ) : (
            <>
              <span>HP</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(simulatorPatch.hpPercent)}
                onChange={(e) => onEditPatch({ hpPercent: clampPercent(Number(e.target.value) || 0) })}
              />
              <strong>%</strong>
            </>
          )}
        </div>
      ) : null}

      {stageChips.length > 0 ? (
        <div className="bl-slot-stages">
          {stageChips.map(([label, v]) => (
            <span key={`bl-stage-${combatant.id}-${label}`} className={`bl-stage-pill ${v > 0 ? "up" : "down"}`}>
              {label}
              {v > 0 ? `+${v}` : v}
            </span>
          ))}
        </div>
      ) : null}

      {editing && simulatorPatch && typeof document !== "undefined"
        ? createPortal(
            <div
              className="bl-slot-editor-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`${combatant.pokemon.name} settings`}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  onToggleEdit();
                }
              }}
            >
              <div className={`bl-slot-editor-dialog ${side}`}>
                <div className="bl-slot-editor-header">
                  <div>
                    <span className={`bl-slot-editor-rank ${side}`}>{rankLabel}</span>
                    <h3>{combatant.pokemon.name}</h3>
                  </div>
                  <button
                    type="button"
                    className="bl-slot-editor-close"
                    onClick={onToggleEdit}
                    aria-label="Close slot settings"
                  >
                    ×
                  </button>
                </div>
                <div className={`bl-slot-editor ${side}`}>
                  {formOptions.length > 1 && onBattleFormChange ? (
                    <div className="bl-slot-form-switcher" aria-label={`${combatant.pokemon.name} battle form`}>
                      <span>Battle Form</span>
                      <div className="bl-slot-form-switcher__options">
                        {formOptions.map((option) => {
                          const isSelected = option.pokemon.id === combatant.pokemon.id;
                          return (
                            <button
                              key={`${combatant.id}-${option.pokemon.id}`}
                              type="button"
                              className={isSelected ? "is-selected" : ""}
                              onClick={() => onBattleFormChange(option.activeFormPokemonId)}
                              aria-pressed={isSelected}
                              title={`Use ${option.pokemon.name}`}
                            >
                              <PokemonSprite pokemon={option.pokemon} className="bl-slot-form-switcher__sprite" />
                              <span>{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <label>
                    <span>HP %</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(simulatorPatch.hpPercent)}
                      onChange={(e) => onEditPatch({ hpPercent: clampPercent(Number(e.target.value)) })}
                    />
                    <strong>{Math.round(simulatorPatch.hpPercent)}%</strong>
                  </label>
                  {side === "ally" ? (
                    <label className="bl-slot-editor-hp-input">
                      <span>HP</span>
                      <input
                        type="number"
                        min={0}
                        max={combatant.maxHp}
                        step={1}
                        value={getLevel50CurrentHpFromPercent(combatant.maxHp, simulatorPatch.hpPercent)}
                        onChange={(e) => {
                          const nextHp = Math.max(
                            0,
                            Math.min(combatant.maxHp, Math.round(Number(e.target.value) || 0)),
                          );
                          const nextPercent = combatant.maxHp > 0 ? (nextHp / combatant.maxHp) * 100 : 0;
                          onEditPatch({ hpPercent: clampPercent(nextPercent) });
                        }}
                      />
                      <strong>/ {combatant.maxHp}</strong>
                    </label>
                  ) : (
                    <label className="bl-slot-editor-hp-input">
                      <span>Range</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(simulatorPatch.hpPercent)}
                        onChange={(e) => {
                          onEditPatch({ hpPercent: clampPercent(Number(e.target.value) || 0) });
                        }}
                      />
                      <strong>%</strong>
                    </label>
                  )}
                  <label>
                    <span>Status</span>
                    <select
                      value={simulatorPatch.statusCondition}
                      onChange={(e) => {
                        const next = e.target.value as BattleStatusCondition;
                        onEditPatch({
                          statusCondition: next,
                          sleepTurns: next === "sleep" ? Math.max(1, simulatorPatch.sleepTurns || 2) : 0,
                          toxicTurns: next === "badPoison" ? Math.max(1, simulatorPatch.toxicTurns || 1) : 0,
                        });
                      }}
                    >
                      {BATTLE_STATUS_OPTIONS.map((o) => (
                        <option key={`bl-ed-status-${o.value}`} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <details className="bl-slot-editor-stage-panel">
                    <summary>
                      <span>Stat Stages</span>
                      <span className="bl-slot-editor-stage-summary">
                        {BATTLE_LAB_STAGE_CONTROLS.some(([, key]) => simulatorPatch[key] !== 0) ? (
                          BATTLE_LAB_STAGE_CONTROLS.filter(([, key]) => simulatorPatch[key] !== 0).map(([label, key]) => (
                            <span
                              key={`bl-ed-stage-pill-${combatant.id}-${key}`}
                              className={`bl-stage-pill ${simulatorPatch[key] > 0 ? "up" : "down"}`}
                            >
                              {label}
                              {simulatorPatch[key] > 0 ? `+${simulatorPatch[key]}` : simulatorPatch[key]}
                            </span>
                          ))
                        ) : (
                          <span className="bl-slot-editor-stage-neutral">All neutral</span>
                        )}
                      </span>
                    </summary>
                    <div className="bl-slot-editor-stages">
                      {BATTLE_LAB_STAGE_CONTROLS.map(([label, key]) => (
                        <label key={`bl-ed-stage-${combatant.id}-${key}`}>
                          <span>{label}</span>
                          <div className="bl-stage-ctrl">
                            <button
                              type="button"
                              onClick={() => onEditPatch({ [key]: clampStatStage(simulatorPatch[key] - 1) })}
                            >
                              −
                            </button>
                            <strong>{simulatorPatch[key] >= 0 ? `+${simulatorPatch[key]}` : simulatorPatch[key]}</strong>
                            <button
                              type="button"
                              onClick={() => onEditPatch({ [key]: clampStatStage(simulatorPatch[key] + 1) })}
                            >
                              +
                            </button>
                          </div>
                        </label>
                      ))}
                    </div>
                  </details>
                  <details className="bl-slot-editor-stage-panel">
                    <summary>
                      <span>Turn State</span>
                      <span className="bl-slot-editor-stage-summary">
                        {lastMove ? <span className="bl-stage-pill up">Last: {lastMove.name}</span> : null}
                        {simulatorPatch.turnsActive > 0 ? (
                          <span className="bl-stage-pill up">Active {simulatorPatch.turnsActive}</span>
                        ) : null}
                        {simulatorPatch.protectStreak > 0 ? (
                          <span className="bl-stage-pill down">Protect {simulatorPatch.protectStreak}</span>
                        ) : null}
                        {simulatorPatch.tauntTurns > 0 ? (
                          <span className="bl-stage-pill down">Taunt {simulatorPatch.tauntTurns}</span>
                        ) : null}
                        {simulatorPatch.encoreTurns > 0 ? (
                          <span className="bl-stage-pill down">
                            Encore {simulatorPatch.encoreTurns}
                            {encoredMove ? ` · ${encoredMove.name}` : ""}
                          </span>
                        ) : null}
                        {simulatorPatch.disableTurns > 0 ? (
                          <span className="bl-stage-pill down">
                            Disable {simulatorPatch.disableTurns}
                            {disabledMove ? ` · ${disabledMove.name}` : ""}
                          </span>
                        ) : null}
                        {simulatorPatch.sleepTurns > 0 && simulatorPatch.statusCondition === "sleep" ? (
                          <span className="bl-stage-pill up">Sleep {simulatorPatch.sleepTurns}</span>
                        ) : null}
                        {simulatorPatch.toxicTurns > 0 && simulatorPatch.statusCondition === "badPoison" ? (
                          <span className="bl-stage-pill down">Toxic {simulatorPatch.toxicTurns}</span>
                        ) : null}
                        {!lastMove &&
                        simulatorPatch.turnsActive === 0 &&
                        simulatorPatch.protectStreak === 0 &&
                        simulatorPatch.tauntTurns === 0 &&
                        simulatorPatch.encoreTurns === 0 &&
                        simulatorPatch.disableTurns === 0 &&
                        (simulatorPatch.statusCondition !== "sleep" || simulatorPatch.sleepTurns === 0) &&
                        (simulatorPatch.statusCondition !== "badPoison" || simulatorPatch.toxicTurns === 0) ? (
                          <span className="bl-slot-editor-stage-neutral">No extra turn-state overrides</span>
                        ) : null}
                      </span>
                    </summary>
                    <div className="bl-slot-editor-meta">
                      <label>
                        <span>Turns Active</span>
                        <input
                          type="number"
                          min={0}
                          max={99}
                          step={1}
                          value={simulatorPatch.turnsActive}
                          onChange={(e) =>
                            onEditPatch({ turnsActive: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                          }
                        />
                      </label>
                      <label>
                        <span>Protect Streak</span>
                        <input
                          type="number"
                          min={0}
                          max={9}
                          step={1}
                          value={simulatorPatch.protectStreak}
                          onChange={(e) =>
                            onEditPatch({ protectStreak: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                          }
                        />
                      </label>
                      {simulatorPatch.statusCondition === "sleep" ? (
                        <label>
                          <span>Sleep Turns</span>
                          <input
                            type="number"
                            min={1}
                            max={4}
                            step={1}
                            value={Math.max(1, simulatorPatch.sleepTurns || 1)}
                            onChange={(e) =>
                              onEditPatch({ sleepTurns: Math.max(1, Math.round(Number(e.target.value) || 1)) })
                            }
                          />
                        </label>
                      ) : null}
                      {simulatorPatch.statusCondition === "badPoison" ? (
                        <label>
                          <span>Toxic Turns</span>
                          <input
                            type="number"
                            min={1}
                            max={15}
                            step={1}
                            value={Math.max(1, simulatorPatch.toxicTurns || 1)}
                            onChange={(e) =>
                              onEditPatch({ toxicTurns: Math.max(1, Math.min(15, Math.round(Number(e.target.value) || 1))) })
                            }
                          />
                        </label>
                      ) : null}
                      <label>
                        <span>Taunt Turns</span>
                        <input
                          type="number"
                          min={0}
                          max={4}
                          step={1}
                          value={simulatorPatch.tauntTurns}
                          onChange={(e) =>
                            onEditPatch({ tauntTurns: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                          }
                        />
                      </label>
                      <label>
                        <span>Encore Turns</span>
                        <input
                          type="number"
                          min={0}
                          max={4}
                          step={1}
                          value={simulatorPatch.encoreTurns}
                          onChange={(e) => {
                            const nextTurns = Math.max(0, Math.round(Number(e.target.value) || 0));
                            onEditPatch({
                              encoreTurns: nextTurns,
                              encoredMoveId:
                                nextTurns > 0 ? simulatorPatch.encoredMoveId ?? simulatorPatch.lastMoveId : null,
                            });
                          }}
                        />
                      </label>
                      {simulatorPatch.encoreTurns > 0 ? (
                        <label className="bl-slot-editor-full">
                          <span>Encored Move</span>
                          <select
                            value={simulatorPatch.encoredMoveId ?? ""}
                            onChange={(e) => onEditPatch({ encoredMoveId: e.target.value || null })}
                          >
                            <option value="">None</option>
                            {availableMoves.map((move) => (
                              <option key={`bl-ed-encore-move-${combatant.id}-${move.id}`} value={move.id}>
                                {move.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <label>
                        <span>Disable Turns</span>
                        <input
                          type="number"
                          min={0}
                          max={4}
                          step={1}
                          value={simulatorPatch.disableTurns}
                          onChange={(e) => {
                            const nextTurns = Math.max(0, Math.round(Number(e.target.value) || 0));
                            onEditPatch({
                              disableTurns: nextTurns,
                              disabledMoveId:
                                nextTurns > 0 ? simulatorPatch.disabledMoveId ?? simulatorPatch.lastMoveId : null,
                            });
                          }}
                        />
                      </label>
                      {simulatorPatch.disableTurns > 0 ? (
                        <label className="bl-slot-editor-full">
                          <span>Disabled Move</span>
                          <select
                            value={simulatorPatch.disabledMoveId ?? ""}
                            onChange={(e) => onEditPatch({ disabledMoveId: e.target.value || null })}
                          >
                            <option value="">None</option>
                            {availableMoves.map((move) => (
                              <option key={`bl-ed-disable-move-${combatant.id}-${move.id}`} value={move.id}>
                                {move.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                  </details>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type BattleLabFaintPromptOption = {
  teamIndex: number;
  combatantId: string;
  pokemon: PokemonRecord;
  currentHp: number;
  maxHp: number;
};

type BattleLabFaintPrompt = {
  side: BattleSide;
  slotPosition: 0 | 1;
  rankLabel: "A" | "B";
  faintedCombatantId: string;
  faintedPokemon: PokemonRecord;
  replacementOptions: BattleLabFaintPromptOption[];
};

type BattleLabFaintModalProps = {
  prompt: BattleLabFaintPrompt;
  onChoose: (teamIndex: number) => void;
  onClose: () => void;
};

function BattleLabFaintModal({ prompt, onChoose, onClose }: BattleLabFaintModalProps) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="bl-faint-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bl-faint-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bl-faint-modal__dialog" role="document">
        <header className="bl-faint-modal__header">
          <div>
            <span className="eyebrow">Battle Lab</span>
            <h3 id="bl-faint-modal-title">Choose replacement for {prompt.rankLabel}</h3>
          </div>
          <button
            type="button"
            className="bl-faint-modal__close"
            onClick={onClose}
            aria-label="Close faint replacement picker"
            title="Close"
          >
            ×
          </button>
        </header>
        <div className="bl-faint-modal__body">
          <p>
            {prompt.faintedPokemon.name} is now fainted. Choose the next {prompt.side === "ally" ? "ally" : "enemy"} to
            send into slot {prompt.rankLabel}.
          </p>
          <div className="bl-faint-modal__options">
            {prompt.replacementOptions.map((option) => {
              const hpPercent = option.maxHp > 0 ? clampPercent((option.currentHp / option.maxHp) * 100) : 0;
              return (
                <button
                  key={`bl-faint-option-${prompt.side}-${option.combatantId}`}
                  type="button"
                  className="bl-faint-modal__option"
                  onClick={() => onChoose(option.teamIndex)}
                >
                  <PokemonSprite pokemon={option.pokemon} className="bl-faint-modal__sprite" />
                  <span className="bl-faint-modal__copy">
                    <strong>{option.pokemon.name}</strong>
                    <small>
                      {option.currentHp}/{option.maxHp} HP · {Math.round(hpPercent)}%
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <footer className="bl-faint-modal__footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

type BattleLabRosterStripProps = {
  side: BattleSide;
  entries: BattleCombatantState[];
  activeRanksById: Map<string, "A" | "B">;
  replacementRanks: Array<"A" | "B">;
  editable: boolean;
  onAssign: (rank: "A" | "B", teamIndex: number) => void;
  deployingCombatantId?: string | null;
  recallingCombatantId?: string | null;
};

function BattleLabRosterStrip({
  side,
  entries,
  activeRanksById,
  replacementRanks,
  editable,
  onAssign,
  deployingCombatantId = null,
  recallingCombatantId = null,
}: BattleLabRosterStripProps) {
  return (
    <div className={`bl-bench ${side}`}>
      <div className="bl-bench-head">
        <span>{side === "ally" ? "Your Bring" : "Enemy Team"}</span>
        {replacementRanks.length > 0 ? (
          <strong>Replace {replacementRanks.join(" / ")}</strong>
        ) : (
          <small>{side === "ally" ? "Active, reserve, KO" : "Active, reserve, KO"}</small>
        )}
      </div>
      <div className="bl-bench-track">
        {entries.length > 0 ? (
          entries.map((combatant) => {
            const hpPercent = combatant.maxHp > 0 ? clampPercent((combatant.currentHp / combatant.maxHp) * 100) : 0;
            const status = STATUS_PALETTE[combatant.statusCondition];
            const activeRank = activeRanksById.get(combatant.id) ?? null;
            const isFainted = combatant.currentHp <= 0;
            const canAssign = editable && replacementRanks.length > 0 && !activeRank && !isFainted;
            return (
              <div
                key={`bl-bench-${side}-${combatant.id}`}
                className={`bl-bench-chip ${isFainted ? "fainted" : ""} ${activeRank ? "active" : ""} ${
                  deployingCombatantId === combatant.id ? "deploying" : ""
                } ${recallingCombatantId === combatant.id ? "recalling" : ""}`}
              >
                <div className="bl-bench-avatar">
                  <PokemonSprite pokemon={combatant.pokemon} className="bl-bench-sprite" />
                  {isFainted ? (
                    <span className="bl-bench-skull" aria-hidden="true">
                      ☠
                    </span>
                  ) : null}
                </div>
                <div className="bl-bench-copy">
                  <strong>{combatant.pokemon.name}</strong>
                  <span>
                    {Math.round(hpPercent)}%
                    {status.label ? ` · ${status.label}` : ""}
                  </span>
                </div>
                {canAssign ? (
                  <div className="bl-bench-actions">
                    {replacementRanks.map((rank) => (
                      <button
                        key={`bl-bench-assign-${combatant.id}-${rank}`}
                        type="button"
                        className="bl-bench-assign"
                        onClick={() => onAssign(rank, combatant.teamIndex)}
                        title={`Send in to slot ${rank}`}
                      >
                        {rank}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className={`bl-bench-state ${activeRank ? "active" : ""}`}>
                    {isFainted ? "KO" : activeRank ? `${activeRank} Active` : "Reserve"}
                  </span>
                )}
              </div>
            );
          })
        ) : (
          <div className="bl-bench-empty">No mons loaded</div>
        )}
      </div>
    </div>
  );
}

function CalculatorView() {
  const [mode, setMode] = useState<CalculatorMode>("defense");
  const [selectedTypes, setSelectedTypes] = useState<PokemonType[]>([DEFAULT_PRIMARY]);

  const toggleType = (type: PokemonType) => {
    setSelectedTypes((current) => {
      if (current.includes(type)) {
        return current.filter((entry) => entry !== type);
      }

      if (current.length === 2) {
        return [current[1], type];
      }

      if (mode === "attack") {
        return [type];
      }

      return [...current, type];
    });
  };

  const clearTypes = () => {
    setSelectedTypes([]);
  };

  const switchMode = (nextMode: CalculatorMode) => {
    setMode(nextMode);
    setSelectedTypes((current) => {
      if (nextMode === "attack") {
        return current[0] ? [current[0]] : [];
      }

      return current;
    });
  };

  const primaryType = selectedTypes[0] ?? null;
  const secondaryType = selectedTypes[1] ?? null;
  const entries = primaryType ? getDefenseEntries(primaryType, secondaryType) : [];
  const buckets = bucketDefenseEntries(entries);
  const attackBuckets = primaryType ? bucketAttackEntries(primaryType) : null;

  const profileLabel =
    mode === "defense"
      ? primaryType
        ? secondaryType
          ? `${getTypeLabel(primaryType)} / ${getTypeLabel(secondaryType)}`
          : getTypeLabel(primaryType)
        : "No type selected"
      : primaryType
        ? getTypeLabel(primaryType)
        : "No type selected";

  return (
    <>
      <section className="mode-tabs" aria-label="Calculator modes">
        <button
          type="button"
          className={`mode-tab ${mode === "defense" ? "active" : ""}`}
          onClick={() => switchMode("defense")}
        >
          Defense
        </button>
        <button
          type="button"
          className={`mode-tab ${mode === "attack" ? "active" : ""}`}
          onClick={() => switchMode("attack")}
        >
          Attack
        </button>
      </section>

      <TypePool
        selectedTypes={selectedTypes}
        onToggle={toggleType}
        onClear={clearTypes}
        mode={mode}
      />

      <section className="board-panel">
        <div className="board-header">
          <div>
            <p className="eyebrow">{mode === "defense" ? "Defensive Matchups" : "Attacking Coverage"}</p>
            <h2>{profileLabel}</h2>
          </div>
          <p className="board-note">
            {mode === "defense"
              ? "Matchups are grouped by damage taken, with the most dangerous categories first."
              : "Coverage is grouped by how each defending type responds to the chosen attack type."}
          </p>
        </div>

        {!primaryType ? (
          <div className="matchup-empty-board">
            {mode === "defense"
              ? "Pick one or two types to see the matchup board."
              : "Pick one attack type to see its offensive coverage."}
          </div>
        ) : mode === "defense" ? (
          <>
            <div className="matchup-grid matchup-grid-primary">
              <MatchupGroup
                label="Quad Weak"
                multiplier="4x"
                tone="danger"
                compact
                entries={buckets.ultraWeak.map((entry) => entry.attackType)}
              />
              <MatchupGroup
                label="Weak"
                multiplier="2x"
                tone="warn"
                entries={buckets.weak.map((entry) => entry.attackType)}
              />
              <MatchupGroup
                label="Neutral"
                multiplier="1x"
                tone="neutral"
                entries={buckets.neutral.map((entry) => entry.attackType)}
              />
              <MatchupGroup
                label="Resist"
                multiplier="0.5x"
                tone="good"
                entries={buckets.resist.map((entry) => entry.attackType)}
              />
              <MatchupGroup
                label="Hard Resist"
                multiplier="0.25x"
                tone="great"
                compact
                entries={buckets.quarter.map((entry) => entry.attackType)}
              />
            </div>
            <div className="matchup-grid matchup-grid-secondary">
              <MatchupGroup
                label="Immune"
                multiplier="0x"
                tone="muted"
                compact
                entries={buckets.immune.map((entry) => entry.attackType)}
              />
            </div>
          </>
        ) : attackBuckets ? (
          <div className="matchup-grid matchup-grid-attack">
            <MatchupGroup
              label="Super Effective"
              multiplier="2x"
              tone="good"
              entries={attackBuckets.effective}
            />
            <MatchupGroup
              label="Neutral"
              multiplier="1x"
              tone="neutral"
              entries={attackBuckets.neutral}
            />
            <MatchupGroup
              label="Resisted"
              multiplier="0.5x"
              tone="warn"
              entries={attackBuckets.resisted}
            />
            <MatchupGroup
              label="No Effect"
              multiplier="0x"
              tone="muted"
              compact
              entries={attackBuckets.noEffect}
            />
          </div>
        ) : null}
      </section>
    </>
  );
}

type TeamBuilderViewProps = {
  onStartNewTeam: () => void;
  featureVisibility: FeatureVisibilitySettings;
};

type MatchSaveSelectorProps = {
  title: string;
  options: Array<{ slotIndex: number; pokemon: PokemonRecord | null }>;
  selectedSlotIndices: number[];
  maxSelections: number;
  onChange: Dispatch<SetStateAction<number[]>>;
};

function MatchSaveSelector({
  title,
  options,
  selectedSlotIndices,
  maxSelections,
  onChange,
}: MatchSaveSelectorProps) {
  const filledOptions = options.filter((option) => option.pokemon);

  return (
    <section className="match-save-section">
      <div className="match-save-section__header">
        <strong>{title}</strong>
        <span>
          {selectedSlotIndices.length}/{maxSelections}
        </span>
      </div>
      <div className="match-save-option-grid">
        {filledOptions.length > 0 ? (
          filledOptions.map((option) => {
            const pokemon = option.pokemon;
            if (!pokemon) {
              return null;
            }

            const selected = selectedSlotIndices.includes(option.slotIndex);
            return (
              <button
                key={`${title}-${option.slotIndex}-${pokemon.id}`}
                type="button"
                className={`match-save-option${selected ? " selected" : ""}`}
                onClick={() =>
                  onChange((current) => {
                    if (current.includes(option.slotIndex)) {
                      return current.filter((slotIndex) => slotIndex !== option.slotIndex);
                    }

                    return [...current, option.slotIndex].slice(0, maxSelections);
                  })
                }
                aria-pressed={selected}
              >
                <PokemonSprite pokemon={pokemon} className="match-save-option__sprite" />
                <span>
                  <strong>{pokemon.name}</strong>
                  <small>Slot {option.slotIndex + 1}</small>
                </span>
              </button>
            );
          })
        ) : (
          <p className="selector-note">No Pokemon loaded for this side.</p>
        )}
      </div>
    </section>
  );
}

type EnemyStatSpreadEditorModalProps = {
  entry: LoadedOpponentEntry;
  basePokemonBySpeciesKey: ReadonlyMap<string, PokemonRecord>;
  overrideSpread: ChampionsStatSpread | null;
  onApply: (slotIndex: number, pokemon: PokemonRecord, statSpread: ChampionsStatSpread | null) => void;
  onClose: () => void;
};

function EnemyStatSpreadEditorModal({
  entry,
  basePokemonBySpeciesKey,
  overrideSpread,
  onApply,
  onClose,
}: EnemyStatSpreadEditorModalProps) {
  const pokemon = entry.pokemon;
  const defaultStatSpread = useMemo(
    () => entry.defaultStatSpread ?? getDefaultChampionsStatSpreadForPokemon(pokemon),
    [entry.defaultStatSpread, pokemon],
  );
  const [draftStatSpread, setDraftStatSpread] = useState<ChampionsStatSpread>(() =>
    normalizeChampionsStatSpread(overrideSpread ?? defaultStatSpread, defaultStatSpread),
  );
  const natureOptions = useMemo(() => getChampionsNatureOptions(), []);
  const computedStats = useMemo(
    () => getChampionsComputedStats(pokemon, { spread: draftStatSpread }),
    [draftStatSpread, pokemon],
  );
  const totalPoints = getTotalChampionsStatPoints(draftStatSpread.statPoints);
  const remainingPoints = CHAMPIONS_TOTAL_STAT_POINTS - totalPoints;

  useEffect(() => {
    setDraftStatSpread(normalizeChampionsStatSpread(overrideSpread ?? defaultStatSpread, defaultStatSpread));
  }, [defaultStatSpread, overrideSpread, pokemon.id]);

  const updateDraftNature = (nature: ChampionsNatureId) => {
    setDraftStatSpread((current) =>
      normalizeChampionsStatSpread(
        {
          ...current,
          nature,
        },
        defaultStatSpread,
      ),
    );
  };

  const updateDraftStatPoints = (statId: ChampionsStatId, nextValue: number) => {
    setDraftStatSpread((current) => {
      const currentValue = current.statPoints[statId];
      const sanitized = Math.max(0, Math.min(CHAMPIONS_MAX_STAT_POINTS_PER_STAT, Math.floor(nextValue)));
      const totalWithoutCurrent = getTotalChampionsStatPoints(current.statPoints) - currentValue;
      const clampedValue = Math.min(sanitized, CHAMPIONS_TOTAL_STAT_POINTS - totalWithoutCurrent);

      return normalizeChampionsStatSpread(
        {
          nature: current.nature,
          statPoints: {
            ...current.statPoints,
            [statId]: clampedValue,
          },
        },
        defaultStatSpread,
      );
    });
  };

  const applyDraft = () => {
    const normalizedDraft = normalizeChampionsStatSpread(draftStatSpread, defaultStatSpread);
    onApply(
      entry.slotIndex,
      pokemon,
      isStatSpreadEqual(normalizedDraft, defaultStatSpread) ? null : normalizedDraft,
    );
    onClose();
  };

  const clearOverride = () => {
    onApply(entry.slotIndex, pokemon, null);
    onClose();
  };

  const basePokemon = getBasePokemonForBattleForm(pokemon, basePokemonBySpeciesKey);

  return createPortal(
    <div
      className="showdown-import-modal enemy-spread-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="enemy-spread-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="showdown-import-modal__dialog enemy-spread-modal__dialog" role="document">
        <header className="showdown-import-modal__header">
          <div className="showdown-import-modal__title">
            <span className="eyebrow">Enemy {entry.slotIndex + 1} Calc Override</span>
            <h3 id="enemy-spread-modal-title">Edit {pokemon.name} spread</h3>
          </div>
          <button
            type="button"
            className="showdown-import-modal__close"
            onClick={onClose}
            aria-label="Close enemy spread editor"
            title="Close"
          >
            ×
          </button>
        </header>

        <div className="showdown-import-modal__body enemy-spread-modal__body">
          <div className="enemy-spread-modal__summary">
            <PokemonSprite pokemon={pokemon} className="enemy-spread-modal__sprite" />
            <div>
              <strong>{pokemon.name}</strong>
              <p>
                {basePokemon.id !== pokemon.id ? `Base slot: ${basePokemon.name}. ` : ""}
                This override affects damage calculations until Clear Enemy Team resets the board.
              </p>
            </div>
            <span className="mini-type-pill neutral-pill">
              {totalPoints} / {CHAMPIONS_TOTAL_STAT_POINTS} SP
            </span>
          </div>

          <div className="moveset-stat-panel-toolbar">
            <label className="saved-attack-field">
              <span>Nature</span>
              <select
                value={draftStatSpread.nature}
                onChange={(event) => updateDraftNature(event.target.value as ChampionsNatureId)}
              >
                {natureOptions.map((option) => (
                  <option key={`enemy-spread-nature-${option.id}`} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="moveset-stat-panel-summary">
              <span>{getStatSpreadSummary(draftStatSpread)}</span>
              <span>{remainingPoints} SP left</span>
            </div>
          </div>

          <p className="selector-note">
            <strong>Default:</strong> {getStatSpreadSummary(defaultStatSpread)}
          </p>

          <div className="moveset-stat-slider-list">
            {CHAMPIONS_STAT_ORDER.map((statId) => {
              const points = draftStatSpread.statPoints[statId];
              const finalValue = computedStats[statId];

              return (
                <label key={`${pokemon.id}-enemy-spread-${statId}`} className="moveset-stat-slider-card">
                  <div className="moveset-stat-slider-top">
                    <strong>{CHAMPIONS_STAT_LABELS[statId]}</strong>
                    <span>{points} SP</span>
                    <em>{finalValue}</em>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={CHAMPIONS_MAX_STAT_POINTS_PER_STAT}
                    step={1}
                    value={points}
                    onChange={(event) => updateDraftStatPoints(statId, Number(event.target.value))}
                    className="moveset-stat-slider"
                    style={{ "--slider-fill": `${(points / CHAMPIONS_MAX_STAT_POINTS_PER_STAT) * 100}%` } as CSSProperties}
                  />
                  <div className="moveset-stat-slider-scale">
                    <span>0</span>
                    <span>{CHAMPIONS_MAX_STAT_POINTS_PER_STAT}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <footer className="showdown-import-modal__footer">
          <button type="button" className="secondary-button" onClick={clearOverride} disabled={!overrideSpread}>
            Clear Override
          </button>
          <button type="button" className="secondary-button" onClick={() => setDraftStatSpread(defaultStatSpread)}>
            Use Default
          </button>
          <div className="showdown-import-modal__footer-spacer" />
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={applyDraft}>
            Apply to Calc
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function TeamBuilderView({ onStartNewTeam, featureVisibility }: TeamBuilderViewProps) {
  const showTeamPreviewFeature = isFeatureVisible(featureVisibility, "teamPreview");
  const showBattleEngineFeature = isFeatureVisible(featureVisibility, "battleEngine");
  const showBattleIntelFeature = isFeatureVisible(featureVisibility, "battleIntel");
  const [teamMatrixMode, setTeamMatrixMode] = useState<TeamMatrixMode>("defense");
  const [openerSelections, setOpenerSelections] = useState<[OpenerSelection, OpenerSelection]>([
    [null, null],
    [null, null],
  ]);
  const [opponentQueries, setOpponentQueries] = useState<string[]>(createEmptyOpponentSlots);
  const [analyzedOpponentEntries, setAnalyzedOpponentEntries] = useState<LoadedOpponentEntry[]>([]);
  const [bringSelectionMode, setBringSelectionMode] = useState<BringSelectionMode>("auto");
  const [manualBringSlotIndices, setManualBringSlotIndices] = useState<number[]>([]);
  const [knownEnemyBringSlotIndices, setKnownEnemyBringSlotIndices] = useState<number[]>([]);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [database, setDatabase] = useState<PokemonRecord[] | null>(null);
  const [battleData, setBattleData] = useState<{
    abilities: AbilityRecord[];
    items: ItemRecord[];
    moves: MoveRecord[];
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [battleDataError, setBattleDataError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("My Team");
  const [savedTeams, setSavedTeams] = useState<PersistedTeam[]>([]);
  const [speciesMovesets, setSpeciesMovesets] = useState<PersistedSpeciesMoveset[]>([]);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [matchHistory, setMatchHistory] = useState<PersistedMatchHistoryEntry[]>([]);
  const [matchHistoryError, setMatchHistoryError] = useState<string | null>(null);
  const [saveMatchOpen, setSaveMatchOpen] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult>("won");
  const [matchAllyBroughtSlotIndices, setMatchAllyBroughtSlotIndices] = useState<number[]>([]);
  const [matchEnemyBroughtSlotIndices, setMatchEnemyBroughtSlotIndices] = useState<number[]>([]);
  const [matchAllyLeadSlotIndices, setMatchAllyLeadSlotIndices] = useState<number[]>([]);
  const [matchEnemyLeadSlotIndices, setMatchEnemyLeadSlotIndices] = useState<number[]>([]);
  const [showdownImportText, setShowdownImportText] = useState("");
  const [showdownImportOpen, setShowdownImportOpen] = useState(false);
  const [showdownExportText, setShowdownExportText] = useState("");
  const [showdownExportWarnings, setShowdownExportWarnings] = useState<string[]>([]);
  const [showdownExportOpen, setShowdownExportOpen] = useState(false);
  const [activeSavedTeamId, setActiveSavedTeamId] = useState<string | null>(null);
  const [teamBuilderFormat, setTeamBuilderFormat] = useState<TeamBuilderFormat>("regulationMA");
  const [quickPokemonQuery, setQuickPokemonQuery] = useState("");
  const [quickMoveQuery, setQuickMoveQuery] = useState("");
  const [teamSlots, setTeamSlots] = useState<TeamSlotState[]>(
    Array.from({ length: TEAM_SIZE }, createEmptyTeamSlot),
  );
  const [damageCalcMode, setDamageCalcMode] = useState<DamageCalcMode>("attack");
  const [doublesEnemyScoutDetailsOpen, setDoublesEnemyScoutDetailsOpen] = useState(false);
  const [perSlotMatchupEloOpen, setPerSlotMatchupEloOpen] = useState(false);
  const [teamDetailViewsOpen, setTeamDetailViewsOpen] = useState(false);
  const [damageAttackerSlotIndex, setDamageAttackerSlotIndex] = useState<number | null>(null);
  const [damageDefenderSlotIndex, setDamageDefenderSlotIndex] = useState<number | null>(null);
  const [damageWeather, setDamageWeather] = useState<DamageWeather>("none");
  const [damageTerrain, setDamageTerrain] = useState<DamageTerrain>("none");
  const [damageAttackerGrounded, setDamageAttackerGrounded] = useState(true);
  const [damageDefenderGrounded, setDamageDefenderGrounded] = useState(true);
  const [damageAttackStage, setDamageAttackStage] = useState(0);
  const [damageDefenseStage, setDamageDefenseStage] = useState(0);
  const [damageAttackerAbility, setDamageAttackerAbility] = useState<DamageAbilityId>("none");
  const [damageDefenderAbility, setDamageDefenderAbility] = useState<DamageAbilityId>("none");
  const [damageAttackerItem, setDamageAttackerItem] = useState<DamageItemId>("none");
  const [damageDefenderItem, setDamageDefenderItem] = useState<DamageItemId>("none");
  const [damageHelpingHand, setDamageHelpingHand] = useState(false);
  const [damageReflect, setDamageReflect] = useState(false);
  const [damageLightScreen, setDamageLightScreen] = useState(false);
  const [damageAuroraVeil, setDamageAuroraVeil] = useState(false);
  const [damageMoveConfigs, setDamageMoveConfigs] = useState<
    Record<string, Partial<Record<string, DamageMoveConfig>>>
  >({});
  const [defenseMoveConfigs, setDefenseMoveConfigs] = useState<Record<string, ManualDamageMoveConfig>>({});
  const [enemyStatSpreadOverrides, setEnemyStatSpreadOverrides] = useState<EnemyStatSpreadOverrideMap>({});
  const [editingEnemyStatSpreadSlotIndex, setEditingEnemyStatSpreadSlotIndex] = useState<number | null>(null);
  const [doublesAllySelection, setDoublesAllySelection] = useState<OpenerSelection>([null, null]);
  const [doublesEnemySelection, setDoublesEnemySelection] = useState<OpenerSelection>([null, null]);
  const [doublesAllyTailwind, setDoublesAllyTailwind] = useState(false);
  const [doublesEnemyTailwind, setDoublesEnemyTailwind] = useState(false);
  const [doublesTrickRoom, setDoublesTrickRoom] = useState(false);
  const [doublesRuntime, setDoublesRuntime] = useState<Record<string, DoublesMemberRuntime>>({});
  const [battleSimulatorState, setBattleSimulatorState] = useState<Record<string, BattleSimulatorMemberState>>({});
  const [battleFieldRuntime, setBattleFieldRuntime] = useState<BattleFieldRuntimeState>(DEFAULT_BATTLE_FIELD_RUNTIME_STATE);
  const [battleEngineRecommendation, setBattleEngineRecommendation] = useState<SearchRecommendation | null>(null);
  const [battleEngineSearchMode, setBattleEngineSearchMode] = useState<SearchMode>("balanced");
  const [battleEngineObjectiveMode, setBattleEngineObjectiveMode] = useState<ObjectiveMode>("robust");
  const [battleEngineSearching, setBattleEngineSearching] = useState(false);
  const [battleEngineError, setBattleEngineError] = useState<string | null>(null);
  const [battleEngineAnalysisSignature, setBattleEngineAnalysisSignature] = useState("");
  const [selectedBattleScenarioId, setSelectedBattleScenarioId] = useState<string>("current-board");
  const [showdownBridgeSnapshot, setShowdownBridgeSnapshot] = useState<ShowdownBridgeSnapshot | null>(null);
  const [showdownBridgeStatus, setShowdownBridgeStatus] = useState<ShowdownBridgeStatus>("idle");
  const [showdownBridgeMessage, setShowdownBridgeMessage] = useState("Extension not detected");
  const [pendingShowdownEnemyImport, setPendingShowdownEnemyImport] = useState(false);
  const battleEngineWorkerRef = useRef<Worker | null>(null);
  const battleEngineSearchRequestIdRef = useRef(0);

  // Battle Lab: user-chosen actions per combatant id
  const [userChosenActions, setUserChosenActions] = useState<Record<string, ChosenAction>>({});
  // Battle Lab: simulation playback state
  const [simulationRun, setSimulationRun] = useState<SimulationRun | null>(null);
  const [simEventIndex, setSimEventIndex] = useState(0);
  const [simPlaying, setSimPlaying] = useState(false);
  const [simViewMode, setSimViewMode] = useState<"real" | "sim">("real");
  const [editingSlotKey, setEditingSlotKey] = useState<string | null>(null);
  const [battleLabFaintPrompt, setBattleLabFaintPrompt] = useState<BattleLabFaintPrompt | null>(null);
  const simPlayTimerRef = useRef<number | null>(null);
  const prevDisplayHpRef = useRef<Record<string, number>>({});
  const [damagePulses, setDamagePulses] = useState<Record<string, number>>({});
  const [slotFlashes, setSlotFlashes] = useState<Record<string, "protect" | "status" | null>>({});
  const [battleLabManualMotion, setBattleLabManualMotion] = useState<BattleLabManualMotion | null>(null);
  const pulseClearTimersRef = useRef<Record<string, number>>({});
  const manualMotionTimerRef = useRef<number | null>(null);

  const playBattleLabManualMotion = (motion: Omit<BattleLabManualMotion, "serial">) => {
    const serial = Date.now();
    setBattleLabManualMotion({ ...motion, serial });
    if (manualMotionTimerRef.current) {
      window.clearTimeout(manualMotionTimerRef.current);
    }
    manualMotionTimerRef.current = window.setTimeout(() => {
      setBattleLabManualMotion((current) => (current?.serial === serial ? null : current));
      manualMotionTimerRef.current = null;
    }, 900);
  };

  const getDoublesRuntime = (side: "ally" | "enemy", slotIndex: number): DoublesMemberRuntime =>
    doublesRuntime[`${side}-${slotIndex}`] ?? DEFAULT_DOUBLES_RUNTIME;

  const updateDoublesRuntime = (
    side: "ally" | "enemy",
    slotIndex: number,
    patch: Partial<DoublesMemberRuntime>,
  ) => {
    setDoublesRuntime((current) => {
      const key = `${side}-${slotIndex}`;
      const existing = current[key] ?? DEFAULT_DOUBLES_RUNTIME;
      return { ...current, [key]: { ...existing, ...patch } };
    });
  };

  const resetDoublesTurn = () => {
    setDoublesRuntime({});
  };

  const setAllyTailwindActive = (active: boolean) => {
    setDoublesAllyTailwind(active);
    setBattleFieldRuntime((current) => ({
      ...current,
      allyTailwindTurns: active ? DEFAULT_ACTIVE_SPEED_CONTROL_TURNS : 0,
    }));
  };

  const setEnemyTailwindActive = (active: boolean) => {
    setDoublesEnemyTailwind(active);
    setBattleFieldRuntime((current) => ({
      ...current,
      enemyTailwindTurns: active ? DEFAULT_ACTIVE_SPEED_CONTROL_TURNS : 0,
    }));
  };

  const setTrickRoomActive = (active: boolean) => {
    setDoublesTrickRoom(active);
    setBattleFieldRuntime((current) => ({
      ...current,
      trickRoomTurns: active ? DEFAULT_ACTIVE_SPEED_CONTROL_TURNS : 0,
    }));
  };

  const getBattleSimulatorMemberState = (
    side: "ally" | "enemy",
    slotIndex: number,
    pokemonId: string,
  ): BattleSimulatorMemberState =>
    battleSimulatorState[getBattleSimulatorStateKey(side, slotIndex, pokemonId)] ??
    DEFAULT_BATTLE_SIMULATOR_MEMBER_STATE;

  const updateBattleSimulatorMemberState = (
    side: "ally" | "enemy",
    slotIndex: number,
    pokemonId: string,
    patch: Partial<BattleSimulatorMemberState>,
  ) => {
    setBattleSimulatorState((current) => {
      const key = getBattleSimulatorStateKey(side, slotIndex, pokemonId);
      const existing = current[key] ?? DEFAULT_BATTLE_SIMULATOR_MEMBER_STATE;
      const nextStatusCondition = patch.statusCondition ?? existing.statusCondition;
      const nextSleepTurns =
        nextStatusCondition === "sleep"
          ? Math.max(1, Math.round(patch.sleepTurns ?? existing.sleepTurns ?? 2))
          : 0;
      const nextToxicTurns =
        nextStatusCondition === "badPoison"
          ? Math.max(1, Math.min(15, Math.round(patch.toxicTurns ?? existing.toxicTurns ?? 1)))
          : 0;
      const nextTauntTurns = Math.max(0, Math.round(patch.tauntTurns ?? existing.tauntTurns));
      const nextEncoreTurns = Math.max(0, Math.round(patch.encoreTurns ?? existing.encoreTurns));
      const nextDisableTurns = Math.max(0, Math.round(patch.disableTurns ?? existing.disableTurns));
      const nextHelpingHandTurns = Math.max(0, Math.round(patch.helpingHandTurns ?? existing.helpingHandTurns));
      const nextTurnsActive = Math.max(0, Math.round(patch.turnsActive ?? existing.turnsActive));
      const nextProtectStreak = Math.max(0, Math.round(patch.protectStreak ?? existing.protectStreak));

      return {
        ...current,
        [key]: {
          ...existing,
          ...patch,
          hpPercent: clampPercent(patch.hpPercent ?? existing.hpPercent),
          attackStage: clampStatStage(patch.attackStage ?? existing.attackStage),
          defenseStage: clampStatStage(patch.defenseStage ?? existing.defenseStage),
          specialAttackStage: clampStatStage(patch.specialAttackStage ?? existing.specialAttackStage),
          specialDefenseStage: clampStatStage(patch.specialDefenseStage ?? existing.specialDefenseStage),
          speedStage: clampStatStage(patch.speedStage ?? existing.speedStage),
          statusCondition: nextStatusCondition,
          sleepTurns: nextSleepTurns,
          toxicTurns: nextToxicTurns,
          tauntTurns: nextTauntTurns,
          encoreTurns: nextEncoreTurns,
          encoredMoveId: nextEncoreTurns > 0 ? patch.encoredMoveId ?? existing.encoredMoveId : null,
          disableTurns: nextDisableTurns,
          disabledMoveId: nextDisableTurns > 0 ? patch.disabledMoveId ?? existing.disabledMoveId : null,
          helpingHandTurns: nextHelpingHandTurns,
          lastMoveId: patch.lastMoveId ?? existing.lastMoveId,
          turnsActive: nextTurnsActive,
          protectStreak: nextProtectStreak,
        },
      };
    });
  };

  const getBattleSimulatorMemberStateForPokemon = (
    side: "ally" | "enemy",
    slotIndex: number,
    pokemon: PokemonRecord,
  ) => {
    const basePokemon = getBasePokemonForBattleForm(pokemon, basePokemonBySpeciesKey);
    return getBattleSimulatorMemberState(side, slotIndex, basePokemon.id);
  };

  const updateBattleSimulatorMemberStateForPokemon = (
    side: "ally" | "enemy",
    slotIndex: number,
    pokemon: PokemonRecord,
    patch: Partial<BattleSimulatorMemberState>,
  ) => {
    const basePokemon = getBasePokemonForBattleForm(pokemon, basePokemonBySpeciesKey);
    updateBattleSimulatorMemberState(side, slotIndex, basePokemon.id, patch);
  };

  const resetBattleSimulatorState = () => {
    battleEngineWorkerRef.current?.terminate();
    battleEngineWorkerRef.current = null;
    setBattleEngineSearching(false);
    setBattleEngineError(null);
    setBattleSimulatorState({});
    setBattleFieldRuntime(DEFAULT_BATTLE_FIELD_RUNTIME_STATE);
    resetDoublesTurn();
  };

  const requestShowdownSnapshot = () => {
    window.postMessage({ type: "PCH_REQUEST_SHOWDOWN_SNAPSHOT" }, window.location.origin);
  };

  useEffect(() => {
    const handleShowdownBridgeMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as {
        type?: string;
        snapshot?: ShowdownBridgeSnapshot;
        status?: ShowdownBridgeStatus;
        message?: string;
      };

      if (data?.type === "PCH_SHOWDOWN_SNAPSHOT" && data.snapshot?.source === "pokemon-showdown") {
        setShowdownBridgeSnapshot(data.snapshot);
        setShowdownBridgeStatus("ready");
        setShowdownBridgeMessage("Live Showdown battle connected");
        return;
      }

      if (data?.type === "PCH_SHOWDOWN_BRIDGE_STATUS") {
        setShowdownBridgeStatus(data.status ?? "ready");
        setShowdownBridgeMessage(data.message ?? "Showdown bridge status updated");
      }
    };

    window.addEventListener("message", handleShowdownBridgeMessage);
    requestShowdownSnapshot();
    return () => window.removeEventListener("message", handleShowdownBridgeMessage);
  }, []);

  useEffect(() => {
    let active = true;

    loadPokemonDatabase()
      .then((db) => {
        if (active) {
          setDatabase(db.pokemon);
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Failed to load Pokemon database.");
        }
      });

    loadBattleData()
      .then((data) => {
        if (active) {
          setBattleData({
            abilities: data.abilities,
            items: data.items,
            moves: data.moves,
          });
        }
      })
      .catch((error) => {
        if (active) {
          setBattleDataError(error instanceof Error ? error.message : "Failed to load move and ability data.");
        }
      });

    listSavedTeams()
      .then((teams) => {
        if (active) {
          setSavedTeams(teams);
        }
      })
      .catch((error) => {
        if (active) {
          setStorageError(error instanceof Error ? error.message : "Failed to load saved teams.");
        }
      });

    listSpeciesMovesets()
      .then((movesets) => {
        if (active) {
          setSpeciesMovesets(movesets);
        }
      })
      .catch((error) => {
        if (active) {
          setStorageError(error instanceof Error ? error.message : "Failed to load species movesets.");
        }
      });

    listMatchHistoryEntries()
      .then((entries) => {
        if (active) {
          setMatchHistory(entries);
        }
      })
      .catch((error) => {
        if (active) {
          setMatchHistoryError(error instanceof Error ? error.message : "Failed to load match history.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const pokemonByKey = useMemo(() => {
    const map = new Map<string, PokemonRecord>();

    for (const pokemon of database ?? []) {
      map.set(pokemon.id, pokemon);
      map.set(pokemon.name.toLowerCase(), pokemon);
      map.set(String(pokemon.num), pokemon);
    }

    return map;
  }, [database]);

  const basePokemonBySpeciesKey = useMemo(() => {
    const map = new Map<string, PokemonRecord>();

    for (const pokemon of database ?? []) {
      const baseSpeciesKey = getPokemonBaseFormKey(pokemon);

      if (isChampionsPlayableBaseForm(pokemon)) {
        map.set(baseSpeciesKey, pokemon);
        continue;
      }

      if (pokemon.forme === null && !isChampionsSuppressedBaseForm(pokemon) && !map.has(baseSpeciesKey)) {
        map.set(baseSpeciesKey, pokemon);
      }
    }

    return map;
  }, [database]);

  const megaFormsByBaseSpeciesKey = useMemo(() => {
    const map = new Map<string, PokemonRecord[]>();

    for (const pokemon of database ?? []) {
      if (!isChampionsMegaEntry(pokemon)) {
        continue;
      }

      const baseSpeciesKey = getPokemonBaseFormKey(pokemon);
      const bucket = map.get(baseSpeciesKey) ?? [];
      bucket.push(pokemon);
      map.set(baseSpeciesKey, bucket);
    }

    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.name.localeCompare(b.name));
    }

    return map;
  }, [database]);

  const abilityByKey = useMemo(() => {
    const map = new Map<string, AbilityRecord>();

    for (const ability of battleData?.abilities ?? []) {
      map.set(ability.id, ability);
      map.set(ability.name.toLowerCase(), ability);
    }

    return map;
  }, [battleData]);

  const itemByKey = useMemo(() => {
    const map = new Map<string, ItemRecord>();

    for (const item of battleData?.items ?? []) {
      map.set(item.id, item);
      map.set(item.name.toLowerCase(), item);
    }

    return map;
  }, [battleData]);

  const moveByKey = useMemo(() => {
    const map = new Map<string, MoveRecord>();

    for (const move of battleData?.moves ?? []) {
      map.set(move.id, move);
      map.set(move.name.toLowerCase(), move);
    }

    return map;
  }, [battleData]);

  const showdownBridgeImport = useMemo<ShowdownBridgeImportResult | null>(() => {
    if (!showdownBridgeSnapshot || !database || !battleData) {
      return null;
    }

    return showdownSnapshotToBattleInput(showdownBridgeSnapshot, {
      pokemonEntries: database,
      moveByKey,
    });
  }, [battleData, database, moveByKey, showdownBridgeSnapshot]);
  const showdownBridgeCapturedLabel = useMemo(() => {
    if (!showdownBridgeSnapshot?.capturedAt) return "";
    const capturedAt = new Date(showdownBridgeSnapshot.capturedAt);
    if (Number.isNaN(capturedAt.getTime())) return "";
    return capturedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }, [showdownBridgeSnapshot]);
  const showdownEnemyImportCount = showdownBridgeImport?.input?.enemy.length ?? 0;

  const speciesMovesetByKey = useMemo(() => {
    const map = new Map<string, PersistedSpeciesMoveset>();

    for (const entry of speciesMovesets) {
      map.set(entry.speciesKey, entry);
    }

    return map;
  }, [speciesMovesets]);

  const teamBuilderPokemonPool = useMemo(
    () => getTeamBuilderFormatEntries(database, speciesMovesetByKey, teamBuilderFormat),
    [database, speciesMovesetByKey, teamBuilderFormat],
  );

  const teamBuilderPokemonByKey = useMemo(() => {
    const map = new Map<string, PokemonRecord>();

    for (const pokemon of teamBuilderPokemonPool) {
      map.set(pokemon.id, pokemon);
      map.set(pokemon.name.toLowerCase(), pokemon);
      map.set(String(pokemon.num), pokemon);
    }

    return map;
  }, [teamBuilderPokemonPool]);

  const team = useMemo(
    () =>
      teamSlots.map((slot) => {
        const storedPokemon = slot.pokemonId ? pokemonByKey.get(slot.pokemonId) ?? null : null;
        const basePokemon = storedPokemon
          ? getBasePokemonForBattleForm(storedPokemon, basePokemonBySpeciesKey)
          : null;
        const storedPokemonIsBattleForm =
          storedPokemon && basePokemon && storedPokemon.id !== basePokemon.id && isCompatibleBattleForm(basePokemon, storedPokemon);
        const requestedBattleForm = slot.activeFormPokemonId
          ? pokemonByKey.get(slot.activeFormPokemonId) ?? null
          : null;
        const activeFormPokemon =
          basePokemon && requestedBattleForm && isCompatibleBattleForm(basePokemon, requestedBattleForm)
            ? requestedBattleForm
            : storedPokemonIsBattleForm
              ? storedPokemon
              : null;
        const pokemon = activeFormPokemon ?? basePokemon;
        const formOptions = getTeamFormOptions(basePokemon, megaFormsByBaseSpeciesKey);
        const activeFormPokemonId =
          activeFormPokemon && basePokemon && activeFormPokemon.id !== basePokemon.id ? activeFormPokemon.id : null;
        const resolvedMoveset = pokemon
          ? getStoredOrPresetSavedAttacks(pokemon, speciesMovesetByKey, moveByKey, MAX_SPECIES_MOVESET_SIZE)
          : null;
        const inferredMegaItemName = activeFormPokemon
          ? inferMegaEvolutionItemName(activeFormPokemon, battleData?.items ?? [])
          : null;
        const itemName = getAllowedTeamSlotItemName({
          itemName: slot.itemName ?? inferredMegaItemName,
          basePokemon,
          activeFormPokemonId,
          megaFormsByBaseSpeciesKey,
          itemOptions: battleData?.items ?? [],
        });
        const defaultStatSpread = pokemon
          ? resolvedMoveset?.statSpread ?? getDefaultChampionsStatSpreadForPokemon(pokemon)
          : null;
        const resolvedStatSpread = defaultStatSpread
          ? normalizeChampionsStatSpread(slot.statSpread ?? undefined, defaultStatSpread)
          : null;

        return {
          ...slot,
          itemName,
          pokemonId: basePokemon?.id ?? slot.pokemonId,
          activeFormPokemonId,
          pokemon,
          basePokemon,
          formOptions,
          abilityName: resolvedMoveset?.abilityName ?? null,
          defaultStatSpread,
          resolvedStatSpread,
        };
      }),
    [basePokemonBySpeciesKey, battleData?.items, megaFormsByBaseSpeciesKey, moveByKey, pokemonByKey, speciesMovesetByKey, teamSlots],
  );

  const selectedPokemon = team
    .map((slot) => slot.pokemon)
    .filter((pokemon): pokemon is PokemonRecord => Boolean(pokemon));
  const filledTeamSlotIndices = useMemo(
    () =>
      team
        .map((slot, slotIndex) => (slot.pokemon ? slotIndex : null))
        .filter((slotIndex): slotIndex is number => slotIndex !== null),
    [team],
  );

  const selectedSavedAttackCount = useMemo(
    () => team.reduce((total, slot) => total + slot.savedAttacks.length, 0),
    [team],
  );

  const selectedAttackTypes = useMemo(
    () => Array.from(new Set(team.flatMap((slot) => getUniqueAttackTypesFromSavedAttacks(slot.savedAttacks)))),
    [team],
  );

  const opponentRoster = useMemo<OpponentRosterEntry[]>(
    () =>
      opponentQueries.map((query, slotIndex) => {
        const trimmed = query.trim();

        if (!trimmed) {
          return {
            slotIndex,
            query,
            pokemon: null,
            savedAttacks: [],
            knownMoves: [],
            presetMoveNames: [],
            abilityName: null,
            itemName: null,
            defaultStatSpread: null,
            statSpread: null,
            movesetSource: "none",
          };
        }

        const pokemon =
          teamBuilderPokemonByKey.get(trimmed.toLowerCase()) ?? teamBuilderPokemonByKey.get(trimmed) ?? null;
        const storedMoves = pokemon
          ? resolveStoredOrPresetMoveset({
              pokemon,
              speciesMovesetByKey,
              moveByKey,
              limit: MAX_SPECIES_MOVESET_SIZE,
              normalizePokemonNameKey,
              getResolvedPresetAbilityName,
              isChampionsMegaEntry,
              getInheritedMovesetKey,
              sanitizeSavedAttacks,
              sanitizeKnownMovesToSavedAttacks,
            })
          : {
              savedAttacks: [],
              knownMoves: [],
              allMoveNames: [],
              abilityName: null,
              itemName: null,
              statSpread: null,
              movesetSource: "none" as const,
            };
        const overrideStatSpread =
          pokemon
            ? enemyStatSpreadOverrides[getEnemyStatSpreadOverrideKey(slotIndex, pokemon, basePokemonBySpeciesKey)] ?? null
            : null;
        const defaultStatSpread = pokemon
          ? storedMoves.statSpread ?? getDefaultChampionsStatSpreadForPokemon(pokemon)
          : null;
        const statSpread =
          pokemon && defaultStatSpread
            ? normalizeChampionsStatSpread(overrideStatSpread ?? storedMoves.statSpread ?? undefined, defaultStatSpread)
            : null;

        return {
          slotIndex,
          query,
          pokemon,
          savedAttacks: storedMoves.savedAttacks,
          knownMoves: storedMoves.knownMoves,
          presetMoveNames: storedMoves.allMoveNames,
          abilityName: storedMoves.abilityName,
          itemName: storedMoves.itemName,
          defaultStatSpread,
          statSpread,
          movesetSource: storedMoves.movesetSource,
        };
      }),
    [basePokemonBySpeciesKey, enemyStatSpreadOverrides, moveByKey, opponentQueries, speciesMovesetByKey, teamBuilderPokemonByKey],
  );

  const opponentEntries = useMemo<LoadedOpponentEntry[]>(
    () => getLoadedOpponentEntries(opponentRoster),
    [opponentRoster],
  );
  const battleIntelAllySlots = useMemo<BattleIntelSlotInput[]>(
    () =>
      team.map((slot, slotIndex) => ({
        slotIndex,
        pokemon: slot.pokemon,
        savedAttacks: slot.savedAttacks,
        knownMoves: slot.knownMoves,
        abilityName: slot.abilityName,
        itemName: slot.itemName,
        statSpread: slot.resolvedStatSpread ?? slot.statSpread ?? slot.defaultStatSpread,
      })),
    [team],
  );
  const battleIntelEnemySlots = useMemo<BattleIntelSlotInput[]>(
    () =>
      opponentRoster.map((entry) => ({
        slotIndex: entry.slotIndex,
        pokemon: entry.pokemon,
        savedAttacks: entry.savedAttacks,
        knownMoves: entry.knownMoves,
        presetMoveNames: entry.presetMoveNames,
        abilityName: entry.abilityName,
        itemName: entry.itemName,
        statSpread: entry.statSpread ?? entry.defaultStatSpread,
      })),
    [opponentRoster],
  );
  const scoutingOpponentEntries = useDeferredValue(opponentEntries);
  const canRunOpponentAnalysis = opponentEntries.length > 0 && selectedPokemon.length > 0;
  const opponentAnalysisIsStale =
    analyzedOpponentEntries.length !== opponentEntries.length ||
    analyzedOpponentEntries.some((entry, index) => {
      const current = opponentEntries[index];
      return !current || current.slotIndex !== entry.slotIndex || current.pokemon.id !== entry.pokemon.id;
    });
  const opponentEntryBySlot = useMemo(
    () => new Map(scoutingOpponentEntries.map((entry) => [entry.slotIndex, entry] as const)),
    [scoutingOpponentEntries],
  );
  const loadedOpponentSlotIndices = useMemo(
    () => opponentEntries.map((entry) => entry.slotIndex),
    [opponentEntries],
  );
  const enemyBring = useMemo(
    () =>
      resolveKnownBring({
        filledSlotIndices: loadedOpponentSlotIndices,
        knownBringSlotIndices: knownEnemyBringSlotIndices,
      }),
    [knownEnemyBringSlotIndices, loadedOpponentSlotIndices],
  );
  const enemyBattleSlotSet = useMemo(
    () => new Set(enemyBring.candidateSlotIndices),
    [enemyBring.candidateSlotIndices],
  );
  const enemyBattleEntries = useMemo(
    () => scoutingOpponentEntries.filter((entry) => enemyBattleSlotSet.has(entry.slotIndex)),
    [enemyBattleSlotSet, scoutingOpponentEntries],
  );
  const enemySelectableSlotIndices = useMemo(
    () =>
      enemyBattleEntries
        .filter((entry) => getBattleSimulatorMemberStateForPokemon("enemy", entry.slotIndex, entry.pokemon).hpPercent > 0)
        .map((entry) => entry.slotIndex),
    [battleSimulatorState, enemyBattleEntries],
  );

  const quickPokemon = useMemo(() => {
    const trimmed = quickPokemonQuery.trim();

    if (!trimmed) {
      return null;
    }

    return teamBuilderPokemonByKey.get(trimmed.toLowerCase()) ?? teamBuilderPokemonByKey.get(trimmed) ?? null;
  }, [quickPokemonQuery, teamBuilderPokemonByKey]);

  const quickMove = useMemo(() => {
    const trimmed = quickMoveQuery.trim();

    if (!trimmed) {
      return null;
    }

    return moveByKey.get(trimmed.toLowerCase()) ?? moveByKey.get(trimmed) ?? null;
  }, [moveByKey, quickMoveQuery]);

  const filledLeadOptions = useMemo(
    () =>
      team
        .map((slot, index) => ({ slot, index }))
        .filter((entry): entry is { slot: (typeof team)[number]; index: number } => Boolean(entry.slot.pokemon)),
    [team],
  );

  const defenseMatrixRows = useMemo(
    () =>
      TYPE_ORDER.map((attackType) => {
        const cells = team.map((slot) =>
          slot.pokemon ? getPokemonDefensiveMultiplier(slot.pokemon, attackType) : null,
        );

        return {
          type: attackType,
          cells,
          totalStrong: cells.filter((value) => value !== null && value > 1).length,
          totalResist: cells.filter((value) => value !== null && value < 1).length,
        };
      }),
    [team],
  );

  const offenseMatrixRows = useMemo(
    () =>
      TYPE_ORDER.map((defendingType) => {
        const cells = team.map((slot) =>
          slot.pokemon
            ? getBestOffensiveMultiplier(getUniqueAttackTypesFromSavedAttacks(slot.savedAttacks), defendingType)
            : null,
        );

        return {
          type: defendingType,
          cells,
          totalStrong: cells.filter((value) => value !== null && value > 1).length,
          totalResist: cells.filter((value) => value === 0).length,
        };
      }),
    [team],
  );

  const updateSlotQuery = (slotIndex: number, nextQuery: string) => {
    const match =
      teamBuilderPokemonByKey.get(nextQuery.trim().toLowerCase()) ??
      teamBuilderPokemonByKey.get(nextQuery.trim()) ??
      null;
    const baseMatch = match ? getBasePokemonForBattleForm(match, basePokemonBySpeciesKey) : null;
    const activeFormPokemonId =
      match && baseMatch && match.id !== baseMatch.id && isCompatibleBattleForm(baseMatch, match)
        ? match.id
        : null;
    const resolvedMoveset = match
      ? getStoredOrPresetSavedAttacks(
          match,
          speciesMovesetByKey,
          moveByKey,
          MAX_ATTACK_TYPES_PER_SLOT,
        )
      : null;
    const inferredMegaItemName = activeFormPokemonId
      ? inferMegaEvolutionItemName(match, battleData?.items ?? [])
      : null;
    const defaultItemName = getAllowedTeamSlotItemName({
      itemName: inferredMegaItemName ?? resolvedMoveset?.itemName,
      basePokemon: baseMatch,
      activeFormPokemonId,
      megaFormsByBaseSpeciesKey,
      itemOptions: battleData?.items ?? [],
    });

    setTeamSlots((current) =>
      current.map((slot, index) => {
        if (index !== slotIndex) {
          return slot;
        }

        if (!match || !baseMatch) {
          return {
            ...slot,
            query: nextQuery,
            pokemonId: null,
            activeFormPokemonId: null,
            statSpread: null,
            itemName: null,
            knownMoves: [],
            savedAttacks: [],
          };
        }

        const sameBase = slot.pokemonId === baseMatch.id;
        const activeFormChanged = (slot.activeFormPokemonId ?? null) !== activeFormPokemonId;
        const retainedItemName = getAllowedTeamSlotItemName({
          itemName: slot.itemName,
          basePokemon: baseMatch,
          activeFormPokemonId,
          megaFormsByBaseSpeciesKey,
          itemOptions: battleData?.items ?? [],
        });

        return {
          ...slot,
          query: baseMatch.name,
          pokemonId: baseMatch.id,
          activeFormPokemonId,
          statSpread: sameBase ? slot.statSpread : null,
          itemName: sameBase
            ? inferredMegaItemName && (!slot.itemName || activeFormChanged)
              ? inferredMegaItemName
              : retainedItemName
            : defaultItemName,
          knownMoves: sameBase ? slot.knownMoves : resolvedMoveset?.knownMoves ?? [],
          savedAttacks: sameBase ? slot.savedAttacks : resolvedMoveset?.savedAttacks ?? [],
        };
      }),
    );
  };

  const clearSlot = (slotIndex: number) => {
    setTeamSlots((current) =>
      current.map((slot, index) => (index === slotIndex ? createEmptyTeamSlot() : slot)),
    );
  };

  const applySlotConfig = (
    slotIndex: number,
    config: { knownMoves: PersistedKnownMove[]; itemName: string | null },
  ) => {
    const loadedPokemon = team[slotIndex]?.pokemon ?? null;

    setTeamSlots((current) =>
      current.map((slot, index) => {
        if (index !== slotIndex) {
          return slot;
        }

        const pokemon = loadedPokemon ?? (slot.pokemonId ? pokemonByKey.get(slot.pokemonId) ?? null : null);

        return {
          ...slot,
          itemName: config.itemName,
          knownMoves: config.knownMoves,
          savedAttacks: sanitizeKnownMovesToSavedAttacks(config.knownMoves, pokemon, MAX_ATTACK_TYPES_PER_SLOT),
        };
      }),
    );
  };

  const applySlotStatSpread = (slotIndex: number, statSpread: ChampionsStatSpread | null) => {
    setTeamSlots((current) =>
      current.map((slot, index) =>
        index === slotIndex
          ? {
              ...slot,
              statSpread,
            }
          : slot,
      ),
    );
  };

  const changeTeamSlotBattleForm = (slotIndex: number, activeFormPokemonId: string | null) => {
    const loadedSlot = team[slotIndex];
    const basePokemon = loadedSlot?.basePokemon ?? loadedSlot?.pokemon ?? null;
    const currentPokemon = loadedSlot?.pokemon ?? null;
    const nextFormPokemon = activeFormPokemonId ? pokemonByKey.get(activeFormPokemonId) ?? null : null;
    const nextPokemon = nextFormPokemon ?? basePokemon;

    if (!basePokemon || !nextPokemon) {
      return;
    }

    if (nextFormPokemon && !isCompatibleBattleForm(basePokemon, nextFormPokemon)) {
      return;
    }

    const normalizedActiveFormPokemonId = nextPokemon.id === basePokemon.id ? null : nextPokemon.id;
    const inferredMegaItemName = normalizedActiveFormPokemonId
      ? inferMegaEvolutionItemName(nextPokemon, battleData?.items ?? [])
      : null;

    setTeamSlots((current) =>
      current.map((slot, index) => {
        if (index !== slotIndex) {
          return slot;
        }

        const retainedItemName = getAllowedTeamSlotItemName({
          itemName: slot.itemName,
          basePokemon,
          activeFormPokemonId: normalizedActiveFormPokemonId,
          megaFormsByBaseSpeciesKey,
          itemOptions: battleData?.items ?? [],
        });

        return {
          ...slot,
          query: basePokemon.name,
          pokemonId: basePokemon.id,
          activeFormPokemonId: normalizedActiveFormPokemonId,
          itemName: inferredMegaItemName && (!slot.itemName || (slot.activeFormPokemonId ?? null) !== normalizedActiveFormPokemonId)
            ? inferredMegaItemName
            : retainedItemName,
        };
      }),
    );

    const currentPokemonId = currentPokemon?.id ?? basePokemon.id;
    const baseKey = getBattleSimulatorStateKey("ally", slotIndex, basePokemon.id);
    const oldKey = getBattleSimulatorStateKey("ally", slotIndex, currentPokemonId);
    setBattleSimulatorState((current) => {
      const existing = current[baseKey] ?? current[oldKey];
      if (!existing) {
        return current;
      }

      const { [oldKey]: _discarded, [baseKey]: _baseDiscarded, ...rest } = current;
      return {
        ...rest,
        [baseKey]: {
          ...existing,
          activeFormPokemonId: null,
        },
      };
    });

    setBattleEngineRecommendation(null);
    setBattleEngineAnalysisSignature("");
    setSimulationRun(null);
    setSimViewMode("real");
  };

  const refreshSavedTeams = async () => {
    const teams = await listSavedTeams();
    setSavedTeams(teams);
  };

  const hasTeamBuilderProgress = useMemo(() => {
    if (activeSavedTeamId !== null) {
      return true;
    }

    if (teamName.trim() && teamName.trim() !== "My Team") {
      return true;
    }

    return teamSlots.some(
      (slot) =>
        Boolean(slot.pokemonId) ||
        Boolean(slot.activeFormPokemonId) ||
        slot.query.trim().length > 0 ||
        slot.savedAttacks.length > 0 ||
        Boolean(slot.statSpread),
    );
  }, [activeSavedTeamId, teamName, teamSlots]);

  const handleStartNewTeam = () => {
    if (hasTeamBuilderProgress) {
      const confirmed = window.confirm(
        "Start a new team? Any unsaved changes in the current team builder will be lost.",
      );
      if (!confirmed) {
        return;
      }
    }

    onStartNewTeam();
  };

  const confirmReplaceCurrentTeam = () => {
    if (!hasTeamBuilderProgress) {
      return true;
    }

    return window.confirm(
      "Importing a team will replace the current team builder. Any unsaved changes will be lost.",
    );
  };

  const getPersistableTeamSlots = (): TeamSlotState[] =>
    team.map((slot) => ({
      query: slot.basePokemon?.name ?? slot.query,
      pokemonId: slot.basePokemon?.id ?? slot.pokemonId,
      activeFormPokemonId: slot.activeFormPokemonId ?? null,
      itemName: slot.itemName,
      statSpread: slot.statSpread,
      knownMoves: slot.knownMoves,
      savedAttacks: slot.savedAttacks,
    }));

  const saveCurrentTeam = async () => {
    try {
      setStorageError(null);
      const saved = await saveTeam({
        id: activeSavedTeamId ?? undefined,
        name: teamName.trim() || "My Team",
        slots: getPersistableTeamSlots(),
        openerSelections,
      });
      setActiveSavedTeamId(saved.id);
      setTeamName(saved.name);
      await refreshSavedTeams();
      setStorageMessage(`Saved "${saved.name}" locally.`);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Failed to save team.");
    }
  };

  const loadSavedTeamIntoBuilder = (savedTeam: PersistedTeam) => {
    setTeamName(savedTeam.name);
    setActiveSavedTeamId(savedTeam.id);
    setTeamSlots(normalizeTeamSlots(savedTeam.slots, moveByKey));
    setOpenerSelections(normalizePersistedOpenerSelections(savedTeam.openerSelections));
    setStorageMessage(`Loaded "${savedTeam.name}".`);
    setStorageError(null);
  };

  const removeSavedTeam = async (savedTeam: PersistedTeam) => {
    try {
      setStorageError(null);
      await deleteSavedTeam(savedTeam.id);
      await refreshSavedTeams();

      if (activeSavedTeamId === savedTeam.id) {
        setActiveSavedTeamId(null);
      }

      setStorageMessage(`Deleted "${savedTeam.name}".`);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Failed to delete team.");
    }
  };

  const exportCurrentTeam = () => {
    const payload: PersistedTeam = {
      id: activeSavedTeamId ?? "exported-team",
      name: teamName.trim() || "My Team",
      updatedAt: new Date().toISOString(),
      version: 8,
      slots: getPersistableTeamSlots(),
      openerSelections,
    };

    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const fileName = `${payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "team"}.json`;

    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setStorageMessage(`Exported "${payload.name}" to JSON.`);
    setStorageError(null);
  };

  const buildCurrentShowdownExport = () =>
    exportShowdownTeamText({
      slots: team.map((slot) => {
        const basePokemon = slot.basePokemon ?? slot.pokemon;
        const battleFormPokemon =
          slot.pokemon && basePokemon && slot.pokemon.id !== basePokemon.id ? slot.pokemon : null;
        const baseResolvedMoveset = basePokemon
          ? getStoredOrPresetSavedAttacks(basePokemon, speciesMovesetByKey, moveByKey, MAX_SPECIES_MOVESET_SIZE)
          : null;

        return {
          pokemon: basePokemon,
          battleFormPokemon,
          itemName: slot.itemName ?? inferMegaEvolutionItemName(battleFormPokemon, battleData?.items ?? []),
          abilityName: baseResolvedMoveset?.abilityName ?? getPokemonPrimaryAbilityName(basePokemon),
          statSpread: slot.resolvedStatSpread,
          knownMoves: slot.knownMoves,
          savedAttacks: slot.savedAttacks,
        };
      }),
      moveByKey,
      maxMovesPerSlot: MAX_ATTACK_TYPES_PER_SLOT,
      level: 50,
    });

  const openShowdownExport = () => {
    const exported = buildCurrentShowdownExport();

    if (exported.exportedPokemonCount === 0) {
      setStorageError("Add at least one Pokemon before exporting to Showdown.");
      setStorageMessage(null);
      return;
    }

    setShowdownExportText(exported.text);
    setShowdownExportWarnings(exported.warnings);
    setShowdownExportOpen(true);
    setStorageError(null);
  };

  const copyShowdownExportToClipboard = async () => {
    const text = showdownExportText.trim();

    if (!text) {
      setStorageError("Generate a Showdown export first.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) {
          throw new Error("Clipboard copy failed.");
        }
      }

      setStorageMessage(`Copied ${teamName.trim() || "team"} as Pokemon Showdown text.`);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Failed to copy Showdown text.");
    }
  };

  const openImportPicker = () => {
    importInputRef.current?.click();
  };

  const importTeamFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!confirmReplaceCurrentTeam()) {
      event.target.value = "";
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<PersistedTeam>;

      if (!parsed || !Array.isArray(parsed.slots)) {
        throw new Error("Invalid team file.");
      }

      setTeamName(parsed.name?.trim() || "Imported Team");
      setActiveSavedTeamId(null);
      setTeamSlots(normalizeTeamSlots(parsed.slots, moveByKey));
      setOpenerSelections(normalizePersistedOpenerSelections(parsed.openerSelections));
      setStorageMessage(`Imported "${parsed.name?.trim() || "Imported Team"}". Save it to keep it locally.`);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Failed to import team.");
    } finally {
      event.target.value = "";
    }
  };

  const importTeamFromShowdownText = () => {
    const trimmed = showdownImportText.trim();

    if (!trimmed) {
      setStorageError("Paste a Pokemon Showdown export first.");
      return;
    }

    if (!database || !battleData) {
      setStorageError("The local Pokemon and move databases must finish loading before importing.");
      return;
    }

    if (!confirmReplaceCurrentTeam()) {
      return;
    }

    try {
      const imported = importShowdownTeamText(trimmed, {
        pokemonEntries: database,
        moveByKey,
        maxTeamSize: TEAM_SIZE,
        maxMovesPerSlot: MAX_ATTACK_TYPES_PER_SLOT,
      });

      if (imported.slots.length === 0) {
        throw new Error("No Pokemon sets were found in the pasted Showdown text.");
      }

      const warningParts: string[] = [];

      if (imported.extraPokemonCount > 0) {
        warningParts.push(
          `ignored ${imported.extraPokemonCount} extra Pokemon beyond the first ${TEAM_SIZE}`,
        );
      }

      if (imported.unknownMoves.length > 0) {
        warningParts.push(`couldn't match moves: ${formatImportIssueList(imported.unknownMoves)}`);
      }

      if (imported.unresolvedSpecies.length > 0) {
        warningParts.push(`couldn't match Pokemon: ${formatImportIssueList(imported.unresolvedSpecies)}`);
      }

      setTeamName("Imported Team");
      setActiveSavedTeamId(null);
      setTeamSlots(normalizeTeamSlots(imported.slots, moveByKey));
      setOpenerSelections(normalizePersistedOpenerSelections(undefined));
      setShowdownImportText("");
      setStorageMessage(
        `Imported ${imported.importedPokemonCount} Pokemon from Showdown text${warningParts.length > 0 ? `; ${warningParts.join("; ")}.` : "."}`,
      );
      setStorageError(null);
      setShowdownImportOpen(false);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Failed to import Showdown text.");
    }
  };

  useEffect(() => {
    if (!showdownImportOpen && !showdownExportOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowdownImportOpen(false);
        setShowdownExportOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [showdownExportOpen, showdownImportOpen]);

  useEffect(() => {
    if (filledLeadOptions.length === 0) {
      setOpenerSelections([
        [null, null],
        [null, null],
      ]);
      return;
    }

    const availableIndices = filledLeadOptions.map((entry) => entry.index);
    setOpenerSelections((current) => [
      normalizeOpenerSelection(current[0], availableIndices, 0),
      normalizeOpenerSelection(current[1], availableIndices, 2),
    ]);
  }, [filledLeadOptions]);

  useEffect(() => {
    const availableIndices = filledLeadOptions.map((entry) => entry.index);

    setDamageAttackerSlotIndex((current) => {
      if (current !== null && availableIndices.includes(current)) {
        return current;
      }

      return availableIndices[0] ?? null;
    });
  }, [filledLeadOptions]);
  useEffect(() => {
    const availableIndices = filledLeadOptions.map((entry) => entry.index);
    setDoublesAllySelection((current) => normalizeSparsePairSelection(current, availableIndices, 0));
  }, [filledLeadOptions]);

  useEffect(() => {
    const availableIndices = scoutingOpponentEntries.map((entry) => entry.slotIndex);

    setDamageDefenderSlotIndex((current) => {
      if (current !== null && availableIndices.includes(current)) {
        return current;
      }

      return availableIndices[0] ?? null;
    });
  }, [scoutingOpponentEntries]);
  useEffect(() => {
    setKnownEnemyBringSlotIndices((current) => {
      const next = current
        .filter((slotIndex) => loadedOpponentSlotIndices.includes(slotIndex))
        .slice(0, enemyBring.bringCount);

      return next.length === current.length && next.every((slotIndex, index) => slotIndex === current[index])
        ? current
        : next;
    });
  }, [enemyBring.bringCount, loadedOpponentSlotIndices]);
  useEffect(() => {
    setDoublesEnemySelection((current) => normalizeSparsePairSelection(current, enemySelectableSlotIndices, 0));
  }, [enemySelectableSlotIndices]);

  const openerSummaries = useMemo(
    () =>
      openerSelections.map((selection, openerIndex) => {
        const members = selection
          .map((slotIndex) => {
            if (slotIndex === null) {
              return null;
            }

            const slot = team[slotIndex];
            return slot?.pokemon
              ? buildLeadSummary(
                  slotIndex,
                  slot.pokemon,
                  getUniqueAttackTypesFromSavedAttacks(slot.savedAttacks),
                )
              : null;
          })
          .filter((member): member is LeadSummary => Boolean(member));

        return buildOpenerSummary(`Opener ${openerIndex === 0 ? "A" : "B"}`, members);
      }),
    [openerSelections, team],
  );

  const selectedDamageAttacker =
    damageAttackerSlotIndex !== null && team[damageAttackerSlotIndex]?.pokemon
      ? team[damageAttackerSlotIndex]
      : null;
  const selectedDamageDefender =
    damageDefenderSlotIndex !== null
      ? scoutingOpponentEntries.find((entry) => entry.slotIndex === damageDefenderSlotIndex) ?? null
      : null;
  const editingEnemyStatSpreadEntry =
    editingEnemyStatSpreadSlotIndex !== null
      ? opponentEntryBySlot.get(editingEnemyStatSpreadSlotIndex) ?? null
      : null;
  const editingEnemyStatSpreadOverride =
    editingEnemyStatSpreadEntry
      ? enemyStatSpreadOverrides[
          getEnemyStatSpreadOverrideKey(
            editingEnemyStatSpreadEntry.slotIndex,
            editingEnemyStatSpreadEntry.pokemon,
            basePokemonBySpeciesKey,
          )
        ] ?? null
      : null;
  const selectedDamageAttackerPokemon = selectedDamageAttacker?.pokemon ?? null;
  const selectedDamageDefenderPokemon = selectedDamageDefender?.pokemon ?? null;
  const currentDamageAttackerPokemon =
    damageCalcMode === "attack" ? selectedDamageAttackerPokemon : selectedDamageDefenderPokemon;
  const currentDamageDefenderPokemon =
    damageCalcMode === "attack" ? selectedDamageDefenderPokemon : selectedDamageAttackerPokemon;
  const currentDamageAttackerAbilityName =
    damageCalcMode === "attack" ? selectedDamageAttacker?.abilityName ?? null : selectedDamageDefender?.abilityName ?? null;
  const doublesAllyMembers = useMemo<DoublesSelectedMember[]>(
    () =>
      doublesAllySelection
        .map((slotIndex) => {
          if (slotIndex === null) {
            return null;
          }

          const slot = team[slotIndex];
          if (!slot?.pokemon) {
            return null;
          }

          const basePokemon = slot.basePokemon ?? getBasePokemonForBattleForm(slot.pokemon, basePokemonBySpeciesKey);
          const battleRuntime = getBattleSimulatorMemberState("ally", slotIndex, basePokemon.id);
          const battlePokemon = getBattleLabActivePokemon(basePokemon, battleRuntime.activeFormPokemonId, pokemonByKey) ?? basePokemon;
          const battleMoveset = getStoredOrPresetSavedAttacks(
            battlePokemon,
            speciesMovesetByKey,
            moveByKey,
            MAX_SPECIES_MOVESET_SIZE,
          );
          const runtime = doublesRuntime[`ally-${slotIndex}`] ?? DEFAULT_DOUBLES_RUNTIME;
          const member: DoublesSelectedMember = {
            side: "ally" as const,
            slotIndex,
            pokemon: battlePokemon,
            savedAttacks: slot.savedAttacks,
            statSpread: slot.resolvedStatSpread,
            abilityName: battleMoveset.abilityName,
            movesetSourceLabel: "Saved",
            speedStat: getChampionsComputedStats(battlePokemon, { spread: slot.resolvedStatSpread }).spe,
            hpPercent: runtime.hpPercent,
            protect: runtime.protect,
            priority: runtime.priority,
          };
          return member;
        })
        .filter((entry): entry is DoublesSelectedMember => Boolean(entry)),
    [basePokemonBySpeciesKey, battleSimulatorState, doublesAllySelection, doublesRuntime, moveByKey, pokemonByKey, speciesMovesetByKey, team],
  );
  const doublesEnemyMembers = useMemo<DoublesSelectedMember[]>(
    () =>
      doublesEnemySelection
        .map((slotIndex) => {
          if (slotIndex === null) {
            return null;
          }

          const entry = opponentEntryBySlot.get(slotIndex);
          if (!entry) {
            return null;
          }

          const basePokemon = getBasePokemonForBattleForm(entry.pokemon, basePokemonBySpeciesKey);
          const battleRuntime = getBattleSimulatorMemberState("enemy", slotIndex, basePokemon.id);
          const battlePokemon = getBattleLabActivePokemon(basePokemon, battleRuntime.activeFormPokemonId, pokemonByKey) ?? basePokemon;
          const battleMoveset = getStoredOrPresetSavedAttacks(
            battlePokemon,
            speciesMovesetByKey,
            moveByKey,
            MAX_SPECIES_MOVESET_SIZE,
          );
          const savedAttacks =
            entry.savedAttacks.length > 0 ? entry.savedAttacks : createStabProxySavedAttacks(battlePokemon);

          const runtime = doublesRuntime[`enemy-${slotIndex}`] ?? DEFAULT_DOUBLES_RUNTIME;
          const member: DoublesSelectedMember = {
            side: "enemy" as const,
            slotIndex,
            pokemon: battlePokemon,
            savedAttacks,
            statSpread: entry.statSpread ?? battleMoveset.statSpread,
            abilityName: battleMoveset.abilityName,
            movesetSourceLabel:
              entry.savedAttacks.length > 0
                ? entry.movesetSource === "custom"
                  ? "Custom"
                  : "Preset"
                : "STAB proxy",
            speedStat: getChampionsComputedStats(battlePokemon, { spread: entry.statSpread ?? battleMoveset.statSpread }).spe,
            hpPercent: runtime.hpPercent,
            protect: runtime.protect,
            priority: runtime.priority,
          };
          return member;
        })
        .filter((entry): entry is DoublesSelectedMember => Boolean(entry)),
    [basePokemonBySpeciesKey, battleSimulatorState, doublesEnemySelection, doublesRuntime, moveByKey, opponentEntryBySlot, pokemonByKey, speciesMovesetByKey],
  );
  const selectedDoublesEnemyEntries = useMemo(
    () =>
      doublesEnemySelection
        .map((slotIndex) => (slotIndex === null ? null : opponentEntryBySlot.get(slotIndex) ?? null))
        .filter((entry): entry is LoadedOpponentEntry => Boolean(entry)),
    [doublesEnemySelection, opponentEntryBySlot],
  );
  const battleSimulatorActiveAllies = useMemo(
    () =>
      (["A", "B"] as const)
        .map((rankLabel, rankIndex) => {
          const slotIndex = doublesAllySelection[rankIndex];
          if (slotIndex === null) {
            return null;
          }

          const slot = team[slotIndex];
          if (!slot?.pokemon) {
            return null;
          }

          const basePokemon = slot.basePokemon ?? getBasePokemonForBattleForm(slot.pokemon, basePokemonBySpeciesKey);
          const state = getBattleSimulatorMemberState("ally", slotIndex, basePokemon.id);
          const battlePokemon = getBattleLabActivePokemon(basePokemon, state.activeFormPokemonId, pokemonByKey) ?? basePokemon;
          return {
            rankLabel,
            slotIndex,
            pokemon: battlePokemon,
            state,
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            rankLabel: "A" | "B";
            slotIndex: number;
            pokemon: PokemonRecord;
            state: BattleSimulatorMemberState;
          } => Boolean(entry),
        ),
    [basePokemonBySpeciesKey, battleSimulatorState, doublesAllySelection, pokemonByKey, team],
  );
  const battleSimulatorActiveEnemies = useMemo(
    () =>
      (["A", "B"] as const)
        .map((rankLabel, rankIndex) => {
          const slotIndex = doublesEnemySelection[rankIndex];
          if (slotIndex === null) {
            return null;
          }

          const entry = opponentEntryBySlot.get(slotIndex);
          if (!entry) {
            return null;
          }

          const basePokemon = getBasePokemonForBattleForm(entry.pokemon, basePokemonBySpeciesKey);
          const state = getBattleSimulatorMemberState("enemy", slotIndex, basePokemon.id);
          const battlePokemon = getBattleLabActivePokemon(basePokemon, state.activeFormPokemonId, pokemonByKey) ?? basePokemon;
          return {
            rankLabel,
            slotIndex,
            pokemon: battlePokemon,
            state,
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            rankLabel: "A" | "B";
            slotIndex: number;
            pokemon: PokemonRecord;
            state: BattleSimulatorMemberState;
          } => Boolean(entry),
        ),
    [basePokemonBySpeciesKey, battleSimulatorState, doublesEnemySelection, opponentEntryBySlot, pokemonByKey],
  );
  const doublesTurnOrder = useMemo(
    () => [...doublesAllyMembers, ...doublesEnemyMembers].sort(compareDoublesTurnOrder),
    [doublesAllyMembers, doublesEnemyMembers],
  );
  const doublesOutgoingSummaries = useMemo(() => {
    if (doublesAllyMembers.length !== 2 || doublesEnemyMembers.length !== 2) {
      return [];
    }

    const attackers = [doublesAllyMembers[0], doublesAllyMembers[1]] as [DoublesSelectedMember, DoublesSelectedMember];

    return doublesEnemyMembers.map((target) =>
      buildDoublesTargetSummary(
        attackers,
        target,
        (member, defender) =>
          getAutomaticDamageRows({
            attackerPokemon: member.pokemon,
            defenderPokemon: defender.pokemon,
            savedAttacks: member.savedAttacks,
            attackerStatSpread: member.statSpread,
            defenderStatSpread: defender.statSpread,
            attackerAbilityName: member.abilityName,
            weather: damageWeather,
            terrain: damageTerrain,
            attackerGrounded: isLikelyGrounded(member.pokemon),
            defenderGrounded: isLikelyGrounded(defender.pokemon),
            attackerStatStage: damageAttackStage,
            defenderStatStage: damageDefenseStage,
            reflect: damageReflect,
            lightScreen: damageLightScreen,
            auroraVeil: damageAuroraVeil,
          }),
      ),
    );
  }, [
    damageAttackStage,
    damageDefenseStage,
    damageReflect,
    damageLightScreen,
    damageAuroraVeil,
    damageTerrain,
    damageWeather,
    doublesAllyMembers,
    doublesEnemyMembers,
  ]);
  const doublesIncomingThreatSummaries = useMemo(() => {
    if (doublesAllyMembers.length !== 2 || doublesEnemyMembers.length !== 2) {
      return [];
    }

    const attackers = [doublesEnemyMembers[0], doublesEnemyMembers[1]] as [DoublesSelectedMember, DoublesSelectedMember];

    return doublesAllyMembers.map((target) =>
      buildDoublesTargetSummary(
        attackers,
        target,
        (member, defender) =>
          getAutomaticDamageRows({
            attackerPokemon: member.pokemon,
            defenderPokemon: defender.pokemon,
            savedAttacks: member.savedAttacks,
            attackerStatSpread: member.statSpread,
            defenderStatSpread: defender.statSpread,
            attackerAbilityName: member.abilityName,
            weather: damageWeather,
            terrain: damageTerrain,
            attackerGrounded: isLikelyGrounded(member.pokemon),
            defenderGrounded: isLikelyGrounded(defender.pokemon),
            attackerStatStage: damageAttackStage,
            defenderStatStage: damageDefenseStage,
            reflect: damageReflect,
            lightScreen: damageLightScreen,
            auroraVeil: damageAuroraVeil,
          }),
      ),
    );
  }, [
    damageAttackStage,
    damageDefenseStage,
    damageReflect,
    damageLightScreen,
    damageAuroraVeil,
    damageTerrain,
    damageWeather,
    doublesAllyMembers,
    doublesEnemyMembers,
  ]);
  const doublesOutgoingDoubleKoCount = doublesOutgoingSummaries.filter((entry) => entry.bestDoubleUp?.possibleKo).length;
  const doublesOutgoingSpreadKoCount = doublesOutgoingSummaries.filter(
    (entry) => entry.bestSpreadSingle?.possibleKo,
  ).length;
  const doublesOutgoingPlans = useMemo(
    () =>
      doublesOutgoingSummaries.map((summary) => ({
        summary,
        plan: getBestDoublesVisualPlan(summary, "ally"),
      })),
    [doublesOutgoingSummaries],
  );
  const doublesIncomingDoubleKoCount = doublesIncomingThreatSummaries.filter(
    (entry) => entry.bestDoubleUp?.possibleKo,
  ).length;
  const doublesIncomingSpreadKoCount = doublesIncomingThreatSummaries.filter(
    (entry) => entry.bestSpreadSingle?.possibleKo,
  ).length;
  const doublesIncomingPlans = useMemo(
    () =>
      doublesIncomingThreatSummaries.map((summary) => ({
        summary,
        plan: getBestDoublesVisualPlan(summary, "enemy"),
      })),
    [doublesIncomingThreatSummaries],
  );
  const doublesOutgoingPreMoveKoCount = doublesOutgoingSummaries.filter(
    (entry) => entry.bestDoubleUp?.possibleKo && entry.bestDoubleUpTiming?.relation === "before",
  ).length;
  const doublesIncomingPreMoveKoCount = doublesIncomingThreatSummaries.filter(
    (entry) => entry.bestDoubleUp?.possibleKo && entry.bestDoubleUpTiming?.relation === "before",
  ).length;
  const doublesOutgoingImmediateCount = doublesOutgoingPlans.filter(
    (entry) => entry.plan.possibleKo && entry.plan.relation === "before",
  ).length;
  const doublesIncomingImmediateCount = doublesIncomingPlans.filter(
    (entry) => entry.plan.possibleKo && entry.plan.relation === "before",
  ).length;
  const doublesOutgoingGuaranteedCount = doublesOutgoingPlans.filter((entry) => entry.plan.guaranteedKo).length;
  const doublesIncomingGuaranteedCount = doublesIncomingPlans.filter((entry) => entry.plan.guaranteedKo).length;

  const doublesOwnStrategies = useMemo<DoublesStrategyPlan[]>(() => {
    if (doublesAllyMembers.length !== 2 || doublesEnemyMembers.length !== 2) {
      return [];
    }
    return buildDoublesStrategies(
      [doublesAllyMembers[0], doublesAllyMembers[1]] as [DoublesSelectedMember, DoublesSelectedMember],
      [doublesEnemyMembers[0], doublesEnemyMembers[1]] as [DoublesSelectedMember, DoublesSelectedMember],
      doublesOutgoingSummaries,
      "ally",
    );
  }, [doublesAllyMembers, doublesEnemyMembers, doublesOutgoingSummaries]);

  const doublesEnemyStrategies = useMemo<DoublesStrategyPlan[]>(() => {
    if (doublesAllyMembers.length !== 2 || doublesEnemyMembers.length !== 2) {
      return [];
    }
    return buildDoublesStrategies(
      [doublesEnemyMembers[0], doublesEnemyMembers[1]] as [DoublesSelectedMember, DoublesSelectedMember],
      [doublesAllyMembers[0], doublesAllyMembers[1]] as [DoublesSelectedMember, DoublesSelectedMember],
      doublesIncomingThreatSummaries,
      "enemy",
    );
  }, [doublesAllyMembers, doublesEnemyMembers, doublesIncomingThreatSummaries]);

  const doublesOwnNetEvaluations = useMemo(() => {
    if (doublesOwnStrategies.length === 0 || doublesEnemyStrategies.length === 0) {
      return [];
    }

    const baselineProtectSlots = new Set<number>(
      doublesAllyMembers.filter((ally) => ally.protect).map((ally) => ally.slotIndex),
    );

    return doublesOwnStrategies.map((ownStrategy) => {
      const effectiveProtectSlots = new Set<number>(baselineProtectSlots);
      for (const slot of ownStrategy.protectSlots) {
        effectiveProtectSlots.add(slot);
      }

      const adjustedEnemyStrategies = doublesEnemyStrategies.map((strategy) =>
        adjustDoublesStrategyWithTargetProtect(strategy, effectiveProtectSlots),
      );
      const enemyResponse = adjustedEnemyStrategies.reduce((best, current) =>
        current.score > best.score ? current : best,
      );
      const netScore = ownStrategy.score - enemyResponse.score;

      return { ownStrategy, enemyResponse, netScore };
    });
  }, [doublesAllyMembers, doublesEnemyStrategies, doublesOwnStrategies]);

  const doublesBestOwnEvaluation = useMemo(() => {
    if (doublesOwnNetEvaluations.length === 0) {
      return null;
    }
    return doublesOwnNetEvaluations.reduce((best, current) =>
      current.netScore > best.netScore ? current : best,
    );
  }, [doublesOwnNetEvaluations]);

  const doublesBestOwnStrategy = doublesBestOwnEvaluation?.ownStrategy ?? null;
  const doublesWorstEnemyStrategy = doublesBestOwnEvaluation?.enemyResponse ?? null;

  const doublesTurnVerdict = useMemo(() => {
    if (!doublesBestOwnStrategy || !doublesWorstEnemyStrategy) {
      return null;
    }

    const ownKos = doublesBestOwnStrategy.koCount;
    const ownPreemptive = doublesBestOwnStrategy.preemptiveKoCount;
    const enemyKos = doublesWorstEnemyStrategy.koCount;
    const ownAnyPossibleKo = doublesBestOwnStrategy.targetResults.some((r) => r.possibleKo);

    let verdict: "double-ko" | "kill-first" | "clean-ko" | "trade-ko" | "pressure" | "defensive" | "stall";
    if (ownKos >= 2) {
      verdict = "double-ko";
    } else if (ownKos === 1 && ownPreemptive >= 1 && enemyKos === 0) {
      verdict = "kill-first";
    } else if (ownKos === 1 && enemyKos >= 1) {
      verdict = "trade-ko";
    } else if (ownKos === 1) {
      verdict = "clean-ko";
    } else if (ownAnyPossibleKo) {
      verdict = "pressure";
    } else if (enemyKos >= 1) {
      verdict = "defensive";
    } else {
      verdict = "stall";
    }

    const label =
      verdict === "double-ko"
        ? "Double KO"
        : verdict === "kill-first"
          ? "Kill First"
          : verdict === "clean-ko"
            ? "Clean KO"
            : verdict === "trade-ko"
              ? "Trade KO"
              : verdict === "pressure"
                ? "Apply Pressure"
                : verdict === "defensive"
                  ? "Brace For Hit"
                  : "Stall Turn";

    const tone: "great" | "good" | "warn" | "danger" | "neutral" =
      verdict === "double-ko" || verdict === "kill-first"
        ? "great"
        : verdict === "clean-ko" || verdict === "pressure"
          ? "good"
          : verdict === "trade-ko"
            ? "warn"
            : verdict === "defensive"
              ? "danger"
              : "neutral";

    return { verdict, label, tone } as const;
  }, [doublesBestOwnStrategy, doublesWorstEnemyStrategy]);

  const doublesSwitchSuggestions = useMemo(() => {
    if (doublesAllyMembers.length !== 2 || doublesEnemyMembers.length !== 2) {
      return [] as Array<{
        ally: DoublesSelectedMember;
        enemyResult: DoublesStrategyTargetResult | null;
        candidates: Array<{
          slotIndex: number;
          pokemon: PokemonRecord;
          savedAttacks: PersistedSavedAttack[];
          elo: MatchupEloSummary;
          targetResults: MatchupEloTargetResult[];
          survivesAllHits: boolean;
          guaranteedOhkoCount: number;
          possibleOhkoCount: number;
        }>;
      }>;
    }

    const benchSlots = team
      .map((slot, index) => ({ slot, index }))
      .filter(
        ({ slot, index }) =>
          slot.pokemon &&
          !doublesAllySelection.includes(index),
      );

    if (benchSlots.length === 0) {
      return [];
    }

    const enemyAttackersForMatchup = doublesEnemyMembers;

    return doublesAllyMembers
      .map((ally) => {
        const enemyResult =
          doublesWorstEnemyStrategy?.targetResults.find(
            (result) => result.target.slotIndex === ally.slotIndex,
          ) ?? null;

        const atRisk = Boolean(enemyResult && (enemyResult.guaranteedKo || enemyResult.possibleKo));

        if (!atRisk) {
          return { ally, enemyResult, candidates: [] };
        }

        const candidates = benchSlots
          .map(({ slot, index }) => {
            if (!slot.pokemon) {
              return null;
            }

            const pokemon = slot.pokemon;
            const targetResults = enemyAttackersForMatchup.map((enemy) =>
              buildMatchupEloTargetResult({
                attackerPokemon: pokemon,
                attackerSavedAttacks: slot.savedAttacks,
                targetPokemon: enemy.pokemon,
                targetSavedAttacks: enemy.savedAttacks,
                targetStatSpread: enemy.statSpread ?? null,
                weather: damageWeather,
                terrain: damageTerrain,
                attackerGrounded: isLikelyGrounded(pokemon),
                targetGrounded: isLikelyGrounded(enemy.pokemon),
                attackerStatStage: damageAttackStage,
                defenderStatStage: damageDefenseStage,
                targetSlotIndex: enemy.slotIndex,
              }),
            );
            const elo = summarizeMatchupElo(targetResults);
            const survivesAllHits = targetResults.every(
              (result) => result.survivesBestIncomingHit === true,
            );
            const guaranteedOhkoCount = targetResults.filter((result) => result.guaranteedOhko).length;
            const possibleOhkoCount = targetResults.filter((result) => result.possibleOhko).length;

            return {
              slotIndex: index,
              pokemon,
              savedAttacks: slot.savedAttacks,
              elo,
              targetResults,
              survivesAllHits,
              guaranteedOhkoCount,
              possibleOhkoCount,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
          .sort((a, b) => {
            if (a.survivesAllHits !== b.survivesAllHits) {
              return a.survivesAllHits ? -1 : 1;
            }
            return compareMatchupEloSummaries(a.elo, b.elo);
          })
          .slice(0, 2);

        return { ally, enemyResult, candidates };
      })
      .filter((entry) => entry.candidates.length > 0);
  }, [
    damageAttackStage,
    damageDefenseStage,
    damageTerrain,
    damageWeather,
    doublesAllyMembers,
    doublesAllySelection,
    doublesEnemyMembers,
    doublesWorstEnemyStrategy,
    team,
  ]);
  const threatTurnSettings = useMemo<ThreatTurnSettings>(
    () => ({
      allyTailwind: doublesAllyTailwind,
      enemyTailwind: doublesEnemyTailwind,
      trickRoom: doublesTrickRoom,
    }),
    [doublesAllyTailwind, doublesEnemyTailwind, doublesTrickRoom],
  );
  const battleEngineEnemyMembers = useMemo<BattleStateMemberInput[]>(
    () =>
      enemyBattleEntries.map((entry) => {
        const basePokemon = getBasePokemonForBattleForm(entry.pokemon, basePokemonBySpeciesKey);
        const runtime = getBattleSimulatorMemberState("enemy", entry.slotIndex, basePokemon.id);
        const battlePokemon = getBattleLabActivePokemon(basePokemon, runtime.activeFormPokemonId, pokemonByKey) ?? basePokemon;
        const battleMoveset = getStoredOrPresetSavedAttacks(
          battlePokemon,
          speciesMovesetByKey,
          moveByKey,
          MAX_SPECIES_MOVESET_SIZE,
        );
        return buildEnemyBattleStateMember({
          slotIndex: entry.slotIndex,
          pokemon: battlePokemon,
          resolvedMoveset: {
            savedAttacks: entry.savedAttacks.length > 0 ? entry.savedAttacks : battleMoveset.savedAttacks,
            knownMoves: entry.knownMoves.length > 0 ? entry.knownMoves : battleMoveset.knownMoves,
            allMoveNames: entry.presetMoveNames.length > 0 ? entry.presetMoveNames : battleMoveset.allMoveNames,
            abilityName: battleMoveset.abilityName,
            itemName: entry.itemName ?? battleMoveset.itemName,
            statSpread: entry.statSpread ?? battleMoveset.statSpread,
            movesetSource: entry.movesetSource,
          },
          moveByKey,
          runtime,
          isActive: doublesEnemySelection.includes(entry.slotIndex),
        });
      }),
    [basePokemonBySpeciesKey, battleSimulatorState, doublesEnemySelection, enemyBattleEntries, moveByKey, pokemonByKey, speciesMovesetByKey],
  );
  const teamBuilderBattleLabReady = doublesAllyMembers.length >= 1 && doublesEnemyMembers.length >= 1;
  const doublesThreatReady = doublesAllyMembers.length === 2 && doublesEnemyMembers.length === 2;
  const previewRecommendationSettings = useMemo(
    () => ({
      weather: damageWeather,
      terrain: damageTerrain,
      allyTailwind: doublesAllyTailwind,
      enemyTailwind: doublesEnemyTailwind,
      trickRoom: doublesTrickRoom,
      attackStage: damageAttackStage,
      defenseStage: damageDefenseStage,
    }),
    [
      damageAttackStage,
      damageDefenseStage,
      damageTerrain,
      damageWeather,
      doublesAllyTailwind,
      doublesEnemyTailwind,
      doublesTrickRoom,
    ],
  );
  const deferredAnalyzedOpponentEntries = useDeferredValue(analyzedOpponentEntries);
  const deferredPreviewRecommendationSettings = useDeferredValue(previewRecommendationSettings);
  const teamPreviewRecommendation = useMemo<TeamPreviewRecommendation | null>(() => {
    if (filledTeamSlotIndices.length < 4 || deferredAnalyzedOpponentEntries.length < 4) {
      return null;
    }

    const previewModeOptions = {
      solverMode: "robust" as const,
      timeBudgetMs: 250,
      allyFourCandidates: 3,
      enemyFourCandidates: 4,
      maxThreatLines: 4,
      maxLeadsPerFour: 2,
    };

    const enemy = deferredAnalyzedOpponentEntries.map((entry) => {
      return buildPreviewEnemyBattleStateMember({
        slotIndex: entry.slotIndex,
        pokemon: entry.pokemon,
        resolvedMoveset: {
          savedAttacks: entry.savedAttacks.length > 0 ? entry.savedAttacks : createStabProxySavedAttacks(entry.pokemon),
          knownMoves: entry.knownMoves,
          allMoveNames: entry.presetMoveNames,
          abilityName: entry.abilityName,
          itemName: entry.itemName,
          statSpread: entry.statSpread,
          movesetSource: entry.movesetSource,
        },
        moveByKey,
        isActive: entry.slotIndex < 2,
      });
    });

    const ally = buildPreviewBattleEngineAllyMembersFromTeam(
      team,
      speciesMovesetByKey,
      moveByKey,
    ).map((member) => ({
      ...member,
      isActive: false,
      currentHp: undefined,
      currentHpPercent: 100,
      stages: undefined,
      statusCondition: "none" as const,
      sleepTurns: 0,
      toxicTurns: 0,
      tauntTurns: 0,
      encoreTurns: 0,
      encoredMoveId: null,
      disableTurns: 0,
      disabledMoveId: null,
      helpingHandTurns: 0,
      turnsActive: 0,
      isProtected: false,
      isFlinched: false,
      wasSwitchedInThisTurn: false,
    }));

    if (ally.length < 4) {
      return null;
    }

    return recommendTeamPreview({
      ally,
      enemy,
      moveByKey,
      weather: deferredPreviewRecommendationSettings.weather,
      terrain: deferredPreviewRecommendationSettings.terrain,
      allyTailwind: deferredPreviewRecommendationSettings.allyTailwind,
      enemyTailwind: deferredPreviewRecommendationSettings.enemyTailwind,
      trickRoom: deferredPreviewRecommendationSettings.trickRoom,
      attackStage: deferredPreviewRecommendationSettings.attackStage,
      defenseStage: deferredPreviewRecommendationSettings.defenseStage,
      ...previewModeOptions,
    });
  }, [
    deferredAnalyzedOpponentEntries,
    deferredPreviewRecommendationSettings,
    filledTeamSlotIndices.length,
    moveByKey,
    speciesMovesetByKey,
    team,
  ]);
  const previewBattleEngineAllyMembers = useMemo<BattleStateMemberInput[]>(
    () => buildPreviewBattleEngineAllyMembersFromTeam(team, speciesMovesetByKey, moveByKey),
    [moveByKey, speciesMovesetByKey, team],
  );
  const effectiveTeam = team;
  const solverBringOrder = useMemo(() => {
    if (!teamPreviewRecommendation) {
      return [];
    }

    const leadOrder = teamPreviewRecommendation.primaryLead.filter(
      (slotIndex, index, current) =>
        filledTeamSlotIndices.includes(slotIndex) && current.indexOf(slotIndex) === index,
    );
    const remainingBring = teamPreviewRecommendation.bestFour.filter((slotIndex) => !leadOrder.includes(slotIndex));

    return [...leadOrder, ...remainingBring].slice(0, Math.min(4, filledTeamSlotIndices.length));
  }, [filledTeamSlotIndices, teamPreviewRecommendation]);
  const bringSelection = useMemo(
    () =>
      resolveBringSelection({
        filledSlotIndices: filledTeamSlotIndices,
        recommendedFourSlotIndices: solverBringOrder,
        manualBringSlotIndices,
        mode: bringSelectionMode,
      }),
    [bringSelectionMode, filledTeamSlotIndices, manualBringSlotIndices, solverBringOrder],
  );
  const bringSelectedSlotSet = useMemo(
    () => new Set(bringSelection.bringSlotIndices),
    [bringSelection.bringSlotIndices],
  );
  const lockedBringSlotSet = useMemo(
    () => new Set(bringSelection.lockedBringSlotIndices),
    [bringSelection.lockedBringSlotIndices],
  );
  const autoFilledBringSlotSet = useMemo(
    () => new Set(bringSelection.autoFilledBringSlotIndices),
    [bringSelection.autoFilledBringSlotIndices],
  );
  const bringPickOrderBySlot = useMemo(
    () =>
      new Map(bringSelection.lockedBringSlotIndices.map((slotIndex, index) => [slotIndex, index + 1] as const)),
    [bringSelection.lockedBringSlotIndices],
  );
  const matchAllySlotOptions = useMemo(
    () => team.map((slot, slotIndex) => ({ slotIndex, pokemon: slot.pokemon })),
    [team],
  );
  const matchEnemySlotOptions = useMemo(
    () => opponentRoster.map((slot) => ({ slotIndex: slot.slotIndex, pokemon: slot.pokemon })),
    [opponentRoster],
  );
  const filledMatchAllySlotSet = useMemo(
    () => new Set(matchAllySlotOptions.filter((entry) => entry.pokemon).map((entry) => entry.slotIndex)),
    [matchAllySlotOptions],
  );
  const filledMatchEnemySlotSet = useMemo(
    () => new Set(matchEnemySlotOptions.filter((entry) => entry.pokemon).map((entry) => entry.slotIndex)),
    [matchEnemySlotOptions],
  );

  const buildOpponentHistorySlots = (): PersistedTeamSlot[] =>
    Array.from({ length: MAX_OPPONENT_SCOUT_SLOTS }, (_, slotIndex) => {
      const entry = opponentRoster[slotIndex];
      return {
        query: entry?.query ?? "",
        pokemonId: entry?.pokemon?.id ?? null,
        itemName: entry?.itemName ?? null,
        statSpread: entry?.statSpread ?? null,
        knownMoves: entry?.knownMoves ?? [],
        savedAttacks: entry?.savedAttacks ?? [],
      };
    });

  const openSaveMatchDialog = () => {
    const allyBringDefaults =
      bringSelection.bringSlotIndices.length > 0
        ? bringSelection.bringSlotIndices
        : filledTeamSlotIndices.slice(0, Math.min(4, filledTeamSlotIndices.length));
    const enemyBringDefaults =
      enemyBring.candidateSlotIndices.length > 0
        ? enemyBring.candidateSlotIndices.slice(0, Math.min(4, enemyBring.candidateSlotIndices.length))
        : loadedOpponentSlotIndices.slice(0, Math.min(4, loadedOpponentSlotIndices.length));

    setMatchResult("won");
    setMatchAllyBroughtSlotIndices(sanitizeSlotIndices(allyBringDefaults, filledMatchAllySlotSet, 4));
    setMatchEnemyBroughtSlotIndices(sanitizeSlotIndices(enemyBringDefaults, filledMatchEnemySlotSet, 4));
    setMatchAllyLeadSlotIndices(sanitizeSlotIndices(doublesAllySelection.filter((value): value is number => value !== null), filledMatchAllySlotSet, 2));
    setMatchEnemyLeadSlotIndices(sanitizeSlotIndices(doublesEnemySelection.filter((value): value is number => value !== null), filledMatchEnemySlotSet, 2));
    setSaveMatchOpen(true);
  };

  const refreshMatchHistory = async () => {
    const entries = await listMatchHistoryEntries();
    setMatchHistory(entries);
  };

  const saveCurrentMatchHistory = async () => {
    try {
      setMatchHistoryError(null);
      const saved = await saveMatchHistoryEntry({
        result: matchResult,
        allyTeamName: teamName.trim() || "My Team",
        allySlots: teamSlots,
        enemySlots: buildOpponentHistorySlots(),
        allyBroughtSlotIndices: matchAllyBroughtSlotIndices,
        enemyBroughtSlotIndices: matchEnemyBroughtSlotIndices,
        allyLeadSlotIndices: matchAllyLeadSlotIndices,
        enemyLeadSlotIndices: matchEnemyLeadSlotIndices,
        allyBrought: buildMatchPokemonSnapshot(matchAllySlotOptions, matchAllyBroughtSlotIndices),
        enemyBrought: buildMatchPokemonSnapshot(matchEnemySlotOptions, matchEnemyBroughtSlotIndices),
        allyLeads: buildMatchPokemonSnapshot(matchAllySlotOptions, matchAllyLeadSlotIndices),
        enemyLeads: buildMatchPokemonSnapshot(matchEnemySlotOptions, matchEnemyLeadSlotIndices),
      });

      await refreshMatchHistory();
      setSaveMatchOpen(false);
      setStorageMessage(`Saved ${saved.result === "won" ? "win" : "loss"} vs enemy team to match history.`);
    } catch (error) {
      setMatchHistoryError(error instanceof Error ? error.message : "Failed to save match history.");
    }
  };
  const bringSelectedTeam = useMemo(
    () =>
      bringSelection.bringSlotIndices
        .map((slotIndex) => {
          const slot = effectiveTeam[slotIndex];
          return slot?.pokemon ? { slotIndex, slot, pokemon: slot.pokemon } : null;
        })
        .filter(
          (entry): entry is { slotIndex: number; slot: LoadedTeamSlot; pokemon: PokemonRecord } => Boolean(entry),
        ),
    [bringSelection.bringSlotIndices, effectiveTeam],
  );
  const teamPreviewDetailTeam = useMemo(
    () =>
      effectiveTeam
        .map((slot, slotIndex) => {
          return slot.pokemon ? { slotIndex, slot, pokemon: slot.pokemon } : null;
        })
        .filter(
          (entry): entry is { slotIndex: number; slot: LoadedTeamSlot; pokemon: PokemonRecord } => Boolean(entry),
        ),
    [effectiveTeam],
  );
  const teamPreviewDetailPokemon = useMemo(
    () => teamPreviewDetailTeam.map(({ pokemon }) => pokemon),
    [teamPreviewDetailTeam],
  );
  useEffect(() => {
    setManualBringSlotIndices((current) =>
      current
        .filter((slotIndex) => filledTeamSlotIndices.includes(slotIndex))
        .slice(0, bringSelection.bringCount),
    );

    if (bringSelection.bringCount === 0 && bringSelectionMode !== "auto") {
      setBringSelectionMode("auto");
    }
  }, [bringSelection.bringCount, bringSelectionMode, filledTeamSlotIndices]);
  const seedThreatBoardLeadFromBringOrder = (bringSlotIndices: number[]) => {
    const availableSlotIndices = bringSlotIndices.length > 0 ? bringSlotIndices : filledTeamSlotIndices;
    const nextSelection = normalizePairSelection(
      [bringSlotIndices[0] ?? null, bringSlotIndices[1] ?? null],
      availableSlotIndices,
      0,
    );

    setDoublesAllySelection((current) =>
      current[0] === nextSelection[0] && current[1] === nextSelection[1] ? current : nextSelection,
    );
  };
  useEffect(() => {
    if (bringSelection.bringSlotIndices.length === 0) {
      return;
    }

    seedThreatBoardLeadFromBringOrder(bringSelection.bringSlotIndices);
  }, [bringSelection.bringSlotIndices]);
  const toggleBringSlot = (slotIndex: number) => {
    if (!filledTeamSlotIndices.includes(slotIndex) || bringSelection.bringCount === 0) {
      return;
    }

    setBringSelectionMode("manual");
    setManualBringSlotIndices((current) => {
      const nextManualBringSlotIndices = toggleBringSelection({
        currentBringSlotIndices: current,
        slotIndex,
        filledSlotIndices: filledTeamSlotIndices,
        bringCount: bringSelection.bringCount,
      });
      const nextBringSelection = resolveBringSelection({
        filledSlotIndices: filledTeamSlotIndices,
        recommendedFourSlotIndices: solverBringOrder,
        manualBringSlotIndices: nextManualBringSlotIndices,
        mode: "manual",
      });
      seedThreatBoardLeadFromBringOrder(nextBringSelection.bringSlotIndices);
      return nextManualBringSlotIndices;
    });
  };
  const resetBringSelectionToSolver = () => {
    setBringSelectionMode("auto");
    setManualBringSlotIndices([]);
    seedThreatBoardLeadFromBringOrder(solverBringOrder);
  };
  const battleEngineAllyMembers = useMemo(
    () =>
      team.flatMap((slot, slotIndex) => {
        if (!bringSelectedSlotSet.has(slotIndex) || !slot.pokemon) {
          return [];
        }

        const basePokemon = slot.basePokemon ?? getBasePokemonForBattleForm(slot.pokemon, basePokemonBySpeciesKey);
        const runtime = getBattleSimulatorMemberState("ally", slotIndex, basePokemon.id);
        const battlePokemon = getBattleLabActivePokemon(basePokemon, runtime.activeFormPokemonId, pokemonByKey) ?? basePokemon;
        const battleMoveset = getStoredOrPresetSavedAttacks(
          battlePokemon,
          speciesMovesetByKey,
          moveByKey,
          MAX_SPECIES_MOVESET_SIZE,
        );
        const savedMegaPokemon = slot.activeFormPokemonId ? pokemonByKey.get(slot.activeFormPokemonId) ?? null : null;
        const savedMegaItemName = inferMegaEvolutionItemName(savedMegaPokemon, battleData?.items ?? []);
        const battleItemName = getAllowedTeamSlotItemName({
          itemName: savedMegaItemName ?? slot.itemName ?? battleMoveset.itemName,
          basePokemon,
          activeFormPokemonId: slot.activeFormPokemonId,
          megaFormsByBaseSpeciesKey,
          itemOptions: battleData?.items ?? [],
        });

        return [
          buildAllyBattleStateMember({
            slotIndex,
            pokemon: battlePokemon,
            slotSavedAttacks: slot.savedAttacks,
            resolvedMoveset: {
              ...battleMoveset,
              itemName: battleItemName,
              statSpread: slot.resolvedStatSpread ?? battleMoveset.statSpread,
            },
            moveByKey,
            runtime,
            isActive: doublesAllySelection.includes(slotIndex),
          }),
        ];
      }),
    [
      basePokemonBySpeciesKey,
      battleData?.items,
      battleSimulatorState,
      bringSelectedSlotSet,
      doublesAllySelection,
      moveByKey,
      pokemonByKey,
      speciesMovesetByKey,
      team,
    ],
  );
  const showdownBridgeInput = showdownBridgeImport?.input ?? null;
  const battleEngineUsesShowdown = Boolean(showdownBridgeInput);
  const battleEngineSourceAllyMembers = showdownBridgeInput?.ally ?? battleEngineAllyMembers;
  const battleEngineSourceEnemyMembers = showdownBridgeInput?.enemy ?? battleEngineEnemyMembers;
  const battleEngineWeather = showdownBridgeInput?.weather ?? damageWeather;
  const battleEngineTerrain = showdownBridgeInput?.terrain ?? damageTerrain;
  const battleEngineAllySide = showdownBridgeInput?.allySide ?? { tailwindTurns: battleFieldRuntime.allyTailwindTurns };
  const battleEngineEnemySide = showdownBridgeInput?.enemySide ?? { tailwindTurns: battleFieldRuntime.enemyTailwindTurns };
  const battleEngineFieldState = showdownBridgeInput?.fieldState ?? {
    turn: battleFieldRuntime.turn,
    trickRoomTurns: battleFieldRuntime.trickRoomTurns,
  };
  const battleLabReady =
    battleEngineUsesShowdown
      ? battleEngineSourceAllyMembers.some((member) => member.isActive) &&
        battleEngineSourceEnemyMembers.some((member) => member.isActive)
      : teamBuilderBattleLabReady;
  const battleEngineCurrentState = useMemo(
    () =>
      battleLabReady
        ? createBattleState({
            ally: battleEngineSourceAllyMembers,
            enemy: battleEngineSourceEnemyMembers,
            moveByKey,
            weather: battleEngineWeather,
            terrain: battleEngineTerrain,
            allyTailwind: battleEngineUsesShowdown ? false : doublesAllyTailwind,
            enemyTailwind: battleEngineUsesShowdown ? false : doublesEnemyTailwind,
            trickRoom: battleEngineUsesShowdown ? false : doublesTrickRoom,
            allySide: battleEngineAllySide,
            enemySide: battleEngineEnemySide,
            fieldState: battleEngineFieldState,
            universalProtect: true,
            applyInitialEntryEffects: battleEngineUsesShowdown ? false : undefined,
          })
        : null,
    [
      battleEngineAllySide,
      battleEngineEnemySide,
      battleEngineFieldState,
      battleEngineSourceAllyMembers,
      battleEngineSourceEnemyMembers,
      battleEngineTerrain,
      battleEngineUsesShowdown,
      battleEngineWeather,
      battleLabReady,
      doublesAllyTailwind,
      doublesEnemyTailwind,
      doublesTrickRoom,
      moveByKey,
    ],
  );
  const applyBattleLabFaintResult = (
    side: BattleSide,
    slotPosition: 0 | 1,
    combatant: BattleCombatantState,
    replacementTeamIndex: number | null,
  ) => {
    const incomingCombatant =
      replacementTeamIndex == null
        ? null
        : Object.values(battleEngineCurrentState?.combatants ?? {}).find(
            (entry) => entry.side === side && entry.teamIndex === replacementTeamIndex,
          ) ?? null;
    markBattleLabCombatantFainted(combatant);
    setBattleLabActiveSelectionSlot(side, slotPosition, replacementTeamIndex);
    clearChosenActionForCombatant(combatant.id);
    setEditingSlotKey(null);
    setSelectedBattleScenarioId("current-board");
    setBattleLabFaintPrompt(null);
    playBattleLabManualMotion({
      faintedCombatantId: combatant.id,
      faintSlot: { side, slotIndex: slotPosition },
      incomingCombatantId: incomingCombatant?.id,
      switchSlot: incomingCombatant ? { side, slotIndex: slotPosition } : undefined,
    });
  };
  const triggerBattleLabFaint = (side: BattleSide, slotPosition: 0 | 1, combatantId: string) => {
    if (!battleEngineCurrentState) {
      return;
    }

    const combatant = battleEngineCurrentState.combatants[combatantId];
    if (!combatant || combatant.currentHp <= 0) {
      return;
    }

    playBattleLabManualMotion({
      faintedCombatantId: combatant.id,
      faintSlot: { side, slotIndex: slotPosition },
    });

    const replacementOptions = battleEngineCurrentState.sides[side].benchIds
      .map((benchId) => battleEngineCurrentState.combatants[benchId] ?? null)
      .filter((entry): entry is BattleCombatantState => Boolean(entry && entry.currentHp > 0))
      .map((entry) => ({
        teamIndex: entry.teamIndex,
        combatantId: entry.id,
        pokemon: entry.pokemon,
        currentHp: entry.currentHp,
        maxHp: entry.maxHp,
      }));

    if (replacementOptions.length <= 1) {
      applyBattleLabFaintResult(side, slotPosition, combatant, replacementOptions[0]?.teamIndex ?? null);
      return;
    }

    setBattleLabFaintPrompt({
      side,
      slotPosition,
      rankLabel: slotPosition === 0 ? "A" : "B",
      faintedCombatantId: combatant.id,
      faintedPokemon: combatant.pokemon,
      replacementOptions,
    });
  };
  useEffect(() => {
    if (simViewMode !== "real" && battleLabFaintPrompt) {
      setBattleLabFaintPrompt(null);
    }
  }, [battleLabFaintPrompt, simViewMode]);
  const battleScenarioOptions = useMemo<BattleScenarioOption[]>(() => {
    const options: BattleScenarioOption[] = [];

    if (battleEngineCurrentState) {
      options.push({
        id: "current-board",
        label: "Current board",
        subtitle: "Live editable board before any selected scenario resolves.",
        state: battleEngineCurrentState,
        events: [],
      });
    }

    if (battleEngineRecommendation?.preview?.state) {
      options.push({
        id: "recommended-outcome",
        label: "Recommended outcome",
        subtitle: battleEngineRecommendation.bestPlan?.summary ?? "Projected result of the chosen line.",
        state: battleEngineRecommendation.preview.state,
        events: battleEngineRecommendation.preview.events,
      });
    }

    battleEngineRecommendation?.consideredPlans.slice(1).forEach((plan, index) => {
      if (!plan.preview?.state) {
        return;
      }

      options.push({
        id: `candidate-${index}`,
        label: `Scenario ${index + 2}`,
        subtitle: plan.plan.summary,
        state: plan.preview.state,
        events: plan.preview.events,
      });
    });

    return options;
  }, [battleEngineCurrentState, battleEngineRecommendation]);
  const battleEngineEnemyLineOptions = useMemo<BattleEngineEnemyLineOption[]>(() => {
    if (!battleEngineRecommendation) {
      return [];
    }

    const byEnemySummary = new Map<string, BattleEngineEnemyLineOption>();
    const addEnemyLine = (
      scoreEntry: SearchPlanScore,
      enemyPlan: JointActionPlan | null,
      label: string,
      rank: number,
      policyWeight: number,
    ) => {
      if (!enemyPlan) {
        return;
      }

      const key = enemyPlan.summary;
      const existing = byEnemySummary.get(key);
      const labels = existing?.labels.includes(label) ? existing.labels : [...(existing?.labels ?? []), label];
      const scoreDelta = scoreEntry.score - battleEngineRecommendation.rootScore;
      const risk = getBattleEngineLineRisk(scoreDelta, labels);
      const tags = getBattleEngineMechanicTags(
        enemyPlan.summary,
        scoreEntry.plan.summary,
        ...battleEngineRecommendation.diagnostics.tacticalTriggers,
      );
      const confidence = getBattleEngineLineConfidence(labels, policyWeight);

      if (!existing || scoreEntry.score > existing.score) {
        byEnemySummary.set(key, {
          enemyPlan,
          responsePlan: scoreEntry.plan,
          score: scoreEntry.score,
          rank,
          labels,
          confidence: Math.max(confidence, existing?.confidence ?? 0),
          riskLabel: risk.label,
          riskTone: risk.tone,
          scoreDelta,
          tags: [...new Set([...(existing?.tags ?? []), ...tags])].slice(0, 4),
        });
        return;
      }

      if (!existing.labels.includes(label)) {
        existing.labels.push(label);
      }
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.tags = [...new Set([...existing.tags, ...tags])].slice(0, 4);
      const updatedRisk = getBattleEngineLineRisk(existing.scoreDelta, existing.labels);
      existing.riskLabel = updatedRisk.label;
      existing.riskTone = updatedRisk.tone;
    };

    battleEngineRecommendation.consideredPlans.forEach((scoreEntry, index) => {
      addEnemyLine(scoreEntry, scoreEntry.predictedEnemyResponse, "Likely", index, scoreEntry.enemyPolicyWeight);
      if (scoreEntry.enemyBestResponse?.summary !== scoreEntry.predictedEnemyResponse?.summary) {
        addEnemyLine(scoreEntry, scoreEntry.enemyBestResponse, "Worst case", index, 0.35);
      }
    });

    return [...byEnemySummary.values()]
      .sort((left, right) => left.rank - right.rank || right.score - left.score)
      .slice(0, 4);
  }, [battleEngineRecommendation]);
  const selectedBattleScenario = useMemo(
    () => battleScenarioOptions.find((option) => option.id === selectedBattleScenarioId) ?? battleScenarioOptions[0] ?? null,
    [battleScenarioOptions, selectedBattleScenarioId],
  );
  const battleEngineSelectableAllySlotIndices = useMemo(
    () =>
      bringSelection.bringSlotIndices.length > 0 ? bringSelection.bringSlotIndices : filledLeadOptions.map((entry) => entry.index),
    [bringSelection.bringSlotIndices, filledLeadOptions],
  );
  useEffect(() => {
    if (battleEngineSelectableAllySlotIndices.length === 0) {
      return;
    }

    setDoublesAllySelection((current) =>
      normalizeSparsePairSelection(current, battleEngineSelectableAllySlotIndices, 0),
    );
  }, [battleEngineSelectableAllySlotIndices]);
  const previewBattleEngineAllyMemberBySlot = useMemo(
    () => new Map(previewBattleEngineAllyMembers.map((member) => [member.teamIndex, member] as const)),
    [previewBattleEngineAllyMembers],
  );
  const canRunBattleEngine = battleLabReady;
  const battleEngineInputSignature = useMemo(
    () =>
      buildBattleEngineInputSignature({
        allySelection: doublesAllySelection,
        enemySelection: doublesEnemySelection,
        allyMembers: battleEngineSourceAllyMembers,
        enemyMembers: battleEngineSourceEnemyMembers,
        weather: battleEngineWeather,
        terrain: battleEngineTerrain,
        allyTailwind: (battleEngineAllySide.tailwindTurns ?? 0) > 0,
        enemyTailwind: (battleEngineEnemySide.tailwindTurns ?? 0) > 0,
        trickRoom: (battleEngineFieldState.trickRoomTurns ?? 0) > 0,
        allyTailwindTurns: battleEngineAllySide.tailwindTurns ?? 0,
        enemyTailwindTurns: battleEngineEnemySide.tailwindTurns ?? 0,
        trickRoomTurns: battleEngineFieldState.trickRoomTurns ?? 0,
        turn: battleEngineFieldState.turn ?? 1,
        searchMode: battleEngineSearchMode,
        objectiveMode: battleEngineObjectiveMode,
      }),
    [
      battleEngineAllySide,
      battleEngineEnemySide,
      battleEngineFieldState,
      battleEngineObjectiveMode,
      battleEngineSearchMode,
      battleEngineSourceAllyMembers,
      battleEngineSourceEnemyMembers,
      battleEngineTerrain,
      battleEngineWeather,
      doublesAllySelection,
      doublesEnemySelection,
    ],
  );
  const battleEngineIsStale =
    battleEngineRecommendation !== null && battleEngineAnalysisSignature !== battleEngineInputSignature;
  useEffect(() => {
    if (battleScenarioOptions.length === 0) {
      if (selectedBattleScenarioId !== "current-board") {
        setSelectedBattleScenarioId("current-board");
      }
      return;
    }

    const hasExistingSelection = battleScenarioOptions.some((option) => option.id === selectedBattleScenarioId);
    if (hasExistingSelection) {
      return;
    }

    setSelectedBattleScenarioId(
      battleScenarioOptions.some((option) => option.id === "recommended-outcome")
        ? "recommended-outcome"
        : battleScenarioOptions[0]!.id,
    );
  }, [battleScenarioOptions, selectedBattleScenarioId]);

  const applyBattleStateToBoard = (nextState: BattleState) => {
    const nextBattleSimulatorState: Record<string, BattleSimulatorMemberState> = {};
    const nextDoublesRuntime: Record<string, DoublesMemberRuntime> = {};

    for (const combatant of Object.values(nextState.combatants)) {
      const hpPercent = combatant.maxHp > 0 ? clampPercent((combatant.currentHp / combatant.maxHp) * 100) : 0;
      const basePokemon = getBasePokemonForBattleForm(combatant.pokemon, basePokemonBySpeciesKey);
      nextBattleSimulatorState[getBattleSimulatorStateKey(combatant.side, combatant.teamIndex, basePokemon.id)] = {
        activeFormPokemonId: combatant.pokemon.id !== basePokemon.id ? combatant.pokemon.id : null,
        hpPercent,
        attackStage: clampStatStage(combatant.stages.attack),
        defenseStage: clampStatStage(combatant.stages.defense),
        specialAttackStage: clampStatStage(combatant.stages.specialAttack),
        specialDefenseStage: clampStatStage(combatant.stages.specialDefense),
        speedStage: clampStatStage(combatant.stages.speed),
        statusCondition: combatant.statusCondition,
        sleepTurns: combatant.sleepTurns,
        toxicTurns: combatant.toxicTurns,
        tauntTurns: combatant.tauntTurns,
        encoreTurns: combatant.encoreTurns,
        encoredMoveId: combatant.encoredMoveId,
        disableTurns: combatant.disableTurns,
        disabledMoveId: combatant.disabledMoveId,
        helpingHandTurns: combatant.helpingHandTurns,
        lastMoveId: combatant.lastMoveId,
        turnsActive: combatant.turnsActive,
        protectStreak: combatant.protectStreak,
      };
      nextDoublesRuntime[`${combatant.side}-${combatant.teamIndex}`] = {
        hpPercent,
        protect: combatant.isProtected,
        priority: false,
      };
    }

    setBattleSimulatorState(nextBattleSimulatorState);
    setDoublesRuntime(nextDoublesRuntime);
    setBattleFieldRuntime({
      turn: nextState.field.turn,
      allyTailwindTurns: nextState.sides.ally.tailwindTurns,
      enemyTailwindTurns: nextState.sides.enemy.tailwindTurns,
      trickRoomTurns: nextState.field.trickRoomTurns,
    });
    setDoublesAllySelection([
      nextState.sides.ally.activeIds[0] ? nextState.combatants[nextState.sides.ally.activeIds[0]]?.teamIndex ?? null : null,
      nextState.sides.ally.activeIds[1] ? nextState.combatants[nextState.sides.ally.activeIds[1]]?.teamIndex ?? null : null,
    ]);
    setDoublesEnemySelection([
      nextState.sides.enemy.activeIds[0] ? nextState.combatants[nextState.sides.enemy.activeIds[0]]?.teamIndex ?? null : null,
      nextState.sides.enemy.activeIds[1] ? nextState.combatants[nextState.sides.enemy.activeIds[1]]?.teamIndex ?? null : null,
    ]);
    setDoublesAllyTailwind(nextState.sides.ally.tailwindTurns > 0);
    setDoublesEnemyTailwind(nextState.sides.enemy.tailwindTurns > 0);
    setDoublesTrickRoom(nextState.field.trickRoomTurns > 0);
    setSelectedBattleScenarioId("current-board");
  };

  const applyProjectedBattleScenario = () => {
    if (!selectedBattleScenario) return;
    applyBattleStateToBoard(selectedBattleScenario.state);
  };

  // --- Battle Lab simulation ---
  const battleLabChosenTurn = useMemo(() => {
    if (!battleEngineCurrentState) {
      return null;
    }

    const state = battleEngineCurrentState;
    const engineAllyPlan = battleEngineRecommendation?.bestPlan ?? null;
    const enginePredictedEnemyPlan = battleEngineRecommendation?.predictedEnemyResponse ?? null;
    const allyPlan = buildJointPlanFromUserChoices(state, "ally", userChosenActions, engineAllyPlan);
    const enemyPlan = buildJointPlanFromUserChoices(state, "enemy", userChosenActions, enginePredictedEnemyPlan);

    return {
      state,
      allyPlan,
      enemyPlan,
    };
  }, [battleEngineCurrentState, battleEngineRecommendation, userChosenActions]);

  const battleLabDamageProjection = useMemo(() => {
    if (!battleLabChosenTurn) {
      return null;
    }

    return resolveTurn(battleLabChosenTurn.state, battleLabChosenTurn.allyPlan, battleLabChosenTurn.enemyPlan, "average");
  }, [battleLabChosenTurn]);

  const battleLabUtilityProjection = useMemo(() => {
    if (!battleLabChosenTurn) {
      return null;
    }

    const utilityAllyPlan = buildUtilityOnlyPlan(battleLabChosenTurn.state, battleLabChosenTurn.allyPlan);
    const utilityEnemyPlan = buildUtilityOnlyPlan(battleLabChosenTurn.state, battleLabChosenTurn.enemyPlan);
    const result = resolveTurn(battleLabChosenTurn.state, utilityAllyPlan, utilityEnemyPlan, "average");
    applyChosenMoveHistoryToState(result.state, [battleLabChosenTurn.allyPlan, battleLabChosenTurn.enemyPlan]);
    return result;
  }, [battleLabChosenTurn]);

  const runUserSimulation = () => {
    if (!battleLabChosenTurn || !battleLabDamageProjection) return;
    const { state, allyPlan, enemyPlan } = battleLabChosenTurn;
    const result = battleLabDamageProjection;

    if (simPlayTimerRef.current) {
      window.clearInterval(simPlayTimerRef.current);
      simPlayTimerRef.current = null;
    }

    setSimulationRun({
      startState: state,
      finalState: result.state,
      events: result.events,
      allyPlan,
      enemyPlan,
    });
    setSimEventIndex(0);
    setSimPlaying(true);
    setSimViewMode("sim");
  };

  const pauseUserSimulation = () => {
    if (simPlayTimerRef.current) {
      window.clearInterval(simPlayTimerRef.current);
      simPlayTimerRef.current = null;
    }
    setSimPlaying(false);
  };

  const resetUserSimulation = () => {
    if (simPlayTimerRef.current) {
      window.clearInterval(simPlayTimerRef.current);
      simPlayTimerRef.current = null;
    }
    setSimPlaying(false);
    setSimulationRun(null);
    setSimEventIndex(0);
    setSimViewMode("real");
    setDamagePulses({});
    setSlotFlashes({});
  };

  const stepUserSimulation = () => {
    if (!simulationRun) return;
    if (simPlayTimerRef.current) {
      window.clearInterval(simPlayTimerRef.current);
      simPlayTimerRef.current = null;
    }
    setSimPlaying(false);
    setSimEventIndex((i) => Math.min(simulationRun.events.length, i + 1));
  };

  const applySimulationAsNextTurn = () => {
    if (!simulationRun) return;
    applyBattleStateToBoard(simulationRun.finalState);
    resetUserSimulation();
    setUserChosenActions({});
  };

  const advanceRealBoardToNextTurn = () => {
    if (!battleLabUtilityProjection) {
      return;
    }

    applyBattleStateToBoard(battleLabUtilityProjection.state);
    setEditingSlotKey(null);
    setUserChosenActions({});
    resetUserSimulation();
  };

  // Playback ticker
  useEffect(() => {
    if (!simPlaying || !simulationRun) return;
    const timer = window.setInterval(() => {
      setSimEventIndex((i) => {
        const next = i + 1;
        if (next >= simulationRun.events.length) {
          window.clearInterval(timer);
          simPlayTimerRef.current = null;
          setSimPlaying(false);
          return simulationRun.events.length;
        }
        return next;
      });
    }, BATTLE_LAB_EVENT_STEP_MS);
    simPlayTimerRef.current = timer;
    return () => {
      window.clearInterval(timer);
      if (simPlayTimerRef.current === timer) simPlayTimerRef.current = null;
    };
  }, [simPlaying, simulationRun]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (simPlayTimerRef.current) window.clearInterval(simPlayTimerRef.current);
      if (manualMotionTimerRef.current) window.clearTimeout(manualMotionTimerRef.current);
      Object.values(pulseClearTimersRef.current).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // Reset simulation when inputs change
  useEffect(() => {
    resetUserSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleEngineInputSignature]);

  // Prune chosen actions when active ids change
  useEffect(() => {
    if (!battleEngineCurrentState) {
      if (Object.keys(userChosenActions).length > 0) setUserChosenActions({});
      return;
    }
    const activeIds = new Set<string>([
      ...battleEngineCurrentState.sides.ally.activeIds.filter(Boolean) as string[],
      ...battleEngineCurrentState.sides.enemy.activeIds.filter(Boolean) as string[],
    ]);
    setUserChosenActions((current) => {
      const next: Record<string, ChosenAction> = {};
      let changed = false;
      for (const [k, v] of Object.entries(current)) {
        if (activeIds.has(k)) next[k] = v;
        else changed = true;
      }
      return changed ? next : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleEngineInputSignature]);

  // Event-stepped display state during simulation playback
  const battleLabDisplayState = useMemo<BattleState | null>(() => {
    if (!battleEngineCurrentState) return null;
    if (simViewMode === "real" || !simulationRun) return battleEngineCurrentState;

    return buildBattleLabDisplayStateAtEvent(simulationRun, simEventIndex);
  }, [battleEngineCurrentState, simViewMode, simulationRun, simEventIndex]);

  // Drive damage pulses and effect flashes from display state changes
  useEffect(() => {
    if (!battleLabDisplayState) return;
    const prevByCombatant = prevDisplayHpRef.current;
    const nextPulses: Record<string, number> = {};

    for (const [id, combatant] of Object.entries(battleLabDisplayState.combatants)) {
      const prev = prevByCombatant[id] ?? combatant.currentHp;
      const delta = prev - combatant.currentHp;
      if (delta !== 0 && Math.abs(delta) >= 1) {
        nextPulses[id] = delta; // positive = damage, negative = heal
      }
      prevByCombatant[id] = combatant.currentHp;
    }

    if (Object.keys(nextPulses).length > 0) {
      setDamagePulses((current) => ({ ...current, ...nextPulses }));
      for (const id of Object.keys(nextPulses)) {
        const existing = pulseClearTimersRef.current[id];
        if (existing) window.clearTimeout(existing);
        pulseClearTimersRef.current[id] = window.setTimeout(() => {
          setDamagePulses((c) => {
            const copy = { ...c };
            delete copy[id];
            return copy;
          });
        }, BATTLE_LAB_EVENT_STEP_MS);
      }
    }
  }, [battleLabDisplayState]);

  // Detect event-driven flashes (protect / status)
  useEffect(() => {
    if (!simulationRun) return;
    if (simEventIndex === 0 || simEventIndex > simulationRun.events.length) return;
    const event = simulationRun.events[simEventIndex - 1];
    if (!event) return;

    const text = event.text.toLowerCase();
    let kind: "protect" | "status" | null = null;
    if (text.includes("protect") || text.includes("detect") || text.includes("wide guard") || text.includes("quick guard")) {
      kind = "protect";
    } else if (
      text.includes("burn") ||
      text.includes("burned") ||
      text.includes("paralysis") ||
      text.includes("paralyzed") ||
      text.includes("fell asleep") ||
      text.includes("sleep") ||
      text.includes("asleep") ||
      text.includes("freeze") ||
      text.includes("frozen") ||
      text.includes("poison") ||
      text.includes("poisoned")
    ) {
      kind = "status";
    }

    const targetId = event.targetId ?? event.actorId;
    if (!targetId || !kind) return;

    setSlotFlashes((c) => ({ ...c, [targetId]: kind }));
    const tid = window.setTimeout(() => {
      setSlotFlashes((c) => {
        const copy = { ...c };
        delete copy[targetId];
        return copy;
      });
    }, BATTLE_LAB_EVENT_STEP_MS);
    return () => window.clearTimeout(tid);
  }, [simEventIndex, simulationRun]);

  // Fill default chosen actions whenever active slots or engine recommendation changes
  useEffect(() => {
    if (!battleEngineCurrentState) return;
    const state = battleEngineCurrentState;
    const defaults: Record<string, ChosenAction> = {};
    const engineAllyPlan = battleEngineRecommendation?.bestPlan ?? null;
    const enginePredictedEnemyPlan = battleEngineRecommendation?.predictedEnemyResponse ?? null;

    const seedFor = (combatantId: string, sidePlan: JointActionPlan | null) => {
      const combatant = state.combatants[combatantId];
      if (!combatant) return;
      if (userChosenActions[combatantId]) return; // don't overwrite user picks

      const engineAction = sidePlan?.actions.find((a) => a.actorId === combatantId);
      if (engineAction) {
        const a = engineAction.action;
        if (a.type === "move") {
          defaults[combatantId] = { kind: "move", moveId: a.moveId, targetId: a.targetId };
          return;
        }
        if (a.type === "switch") {
          defaults[combatantId] = { kind: "switch", switchInId: a.switchInId };
          return;
        }
        defaults[combatantId] = { kind: "pass" };
        return;
      }

      const bestMove =
        [...combatant.knownMoves, ...combatant.candidateMoves].sort(
          (l, r) => (r.basePower ?? 0) - (l.basePower ?? 0),
        )[0] ?? null;
      if (bestMove) {
        defaults[combatantId] = {
          kind: "move",
          moveId: bestMove.id,
          targetId: getDefaultTargetForMove(state, combatant, bestMove),
        };
      }
    };

    for (const id of state.sides.ally.activeIds.filter(Boolean) as string[]) {
      seedFor(id, engineAllyPlan);
    }
    for (const id of state.sides.enemy.activeIds.filter(Boolean) as string[]) {
      seedFor(id, enginePredictedEnemyPlan);
    }

    if (Object.keys(defaults).length > 0) {
      setUserChosenActions((c) => ({ ...defaults, ...c }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleEngineInputSignature, battleEngineRecommendation]);

  const setChosenAction = (combatantId: string, action: ChosenAction) => {
    setUserChosenActions((c) => ({ ...c, [combatantId]: action }));
  };

  const applyJointPlansToChosen = (...plans: Array<JointActionPlan | null>) => {
    const next: Record<string, ChosenAction> = {};

    const copyPlan = (plan: JointActionPlan | null) => {
      if (!plan) return;
      for (const p of plan.actions) {
        const a = p.action;
        if (a.type === "move") next[p.actorId] = { kind: "move", moveId: a.moveId, targetId: a.targetId };
        else if (a.type === "switch") next[p.actorId] = { kind: "switch", switchInId: a.switchInId };
        else next[p.actorId] = { kind: "pass" };
      }
    };

    plans.forEach(copyPlan);
    if (Object.keys(next).length > 0) {
      setUserChosenActions((c) => ({ ...c, ...next }));
    }
  };

  const applyEngineRecommendationToChosen = () => {
    if (!battleEngineRecommendation) return;
    applyJointPlansToChosen(
      battleEngineRecommendation.bestPlan,
      battleEngineRecommendation.predictedEnemyResponse,
    );
  };

  useEffect(() => {
    return () => {
      battleEngineWorkerRef.current?.terminate();
      battleEngineWorkerRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!canRunBattleEngine && battleEngineRecommendation) {
      setBattleEngineRecommendation(null);
      setBattleEngineAnalysisSignature("");
    }
    if (!canRunBattleEngine && battleEngineSearching) {
      battleEngineWorkerRef.current?.terminate();
      battleEngineWorkerRef.current = null;
      setBattleEngineSearching(false);
    }
  }, [battleEngineRecommendation, battleEngineSearching, canRunBattleEngine]);
  useEffect(() => {
    if (!battleEngineSearching) {
      return;
    }

    battleEngineWorkerRef.current?.terminate();
    battleEngineWorkerRef.current = null;
    setBattleEngineSearching(false);
  }, [battleEngineInputSignature]);
  const opponentCoverageMap = useMemo(
    () =>
      new Map(
        scoutingOpponentEntries.map((entry) => [
          entry.slotIndex,
          teamPreviewDetailTeam
            .map(({ pokemon, slot, slotIndex }) => {
              const coverage = getBestSavedAttacksAgainstPokemon(slot.savedAttacks, entry.pokemon);

              return {
                slotIndex,
                pokemon,
                multiplier: coverage.multiplier,
                attacks: coverage.attacks,
                speedDelta:
                  getChampionsComputedStats(pokemon, { spread: slot.resolvedStatSpread }).spe -
                  getChampionsComputedStats(entry.pokemon, { spread: entry.statSpread }).spe,
              };
            })
            .sort((left, right) => (right.multiplier ?? 0) - (left.multiplier ?? 0)),
        ]),
      ),
    [scoutingOpponentEntries, teamPreviewDetailTeam],
  );
  const enemyThreatMap = useMemo(
    () =>
      new Map(
        teamPreviewDetailTeam.map(({ pokemon, slot, slotIndex }) => {
          return [
            slotIndex,
            scoutingOpponentEntries
              .map((entry) => {
                const scoutingAttacks =
                  entry.savedAttacks.length > 0 ? entry.savedAttacks : createStabProxySavedAttacks(entry.pokemon);
                const coverage = getBestSavedAttacksAgainstPokemon(scoutingAttacks, pokemon);

                return {
                  slotIndex: entry.slotIndex,
                  pokemon: entry.pokemon,
                  multiplier: coverage.multiplier,
                  attacks: coverage.attacks,
                  movesetSource: entry.movesetSource,
                  speedDelta:
                    getChampionsComputedStats(entry.pokemon, { spread: entry.statSpread }).spe -
                    getChampionsComputedStats(pokemon, { spread: slot.resolvedStatSpread }).spe,
                };
              })
              .sort((left, right) => (right.multiplier ?? 0) - (left.multiplier ?? 0)),
          ] as const;
        }),
      ),
    [scoutingOpponentEntries, teamPreviewDetailTeam],
  );
  const incomingThreatCards = useMemo(() => {
    if (!doublesThreatReady) {
      return [];
    }

    return buildThreatCards({
      attackers: [doublesEnemyMembers[0], doublesEnemyMembers[1]] as [DoublesSelectedMember, DoublesSelectedMember],
      targets: [doublesAllyMembers[0], doublesAllyMembers[1]] as [DoublesSelectedMember, DoublesSelectedMember],
      buildRows: (member, defender) =>
        getAutomaticDamageRows({
          attackerPokemon: member.pokemon,
          defenderPokemon: defender.pokemon,
          savedAttacks: member.savedAttacks,
          attackerStatSpread: member.statSpread,
          defenderStatSpread: defender.statSpread,
          attackerAbilityName: member.abilityName,
          weather: damageWeather,
          terrain: damageTerrain,
          attackerGrounded: isLikelyGrounded(member.pokemon),
          defenderGrounded: isLikelyGrounded(defender.pokemon),
          attackerStatStage: damageAttackStage,
          defenderStatStage: damageDefenseStage,
          reflect: damageReflect,
          lightScreen: damageLightScreen,
          auroraVeil: damageAuroraVeil,
        }),
      turnSettings: threatTurnSettings,
    });
  }, [
    damageAttackStage,
    damageDefenseStage,
    damageTerrain,
    damageWeather,
    doublesAllyMembers,
    doublesEnemyMembers,
    doublesThreatReady,
    threatTurnSettings,
  ]);
  const outgoingThreatCards = useMemo(() => {
    if (!doublesThreatReady) {
      return [];
    }

    return buildThreatCards({
      attackers: [doublesAllyMembers[0], doublesAllyMembers[1]] as [DoublesSelectedMember, DoublesSelectedMember],
      targets: [doublesEnemyMembers[0], doublesEnemyMembers[1]] as [DoublesSelectedMember, DoublesSelectedMember],
      buildRows: (member, defender) =>
        getAutomaticDamageRows({
          attackerPokemon: member.pokemon,
          defenderPokemon: defender.pokemon,
          savedAttacks: member.savedAttacks,
          attackerStatSpread: member.statSpread,
          defenderStatSpread: defender.statSpread,
          attackerAbilityName: member.abilityName,
          weather: damageWeather,
          terrain: damageTerrain,
          attackerGrounded: isLikelyGrounded(member.pokemon),
          defenderGrounded: isLikelyGrounded(defender.pokemon),
          attackerStatStage: damageAttackStage,
          defenderStatStage: damageDefenseStage,
          reflect: damageReflect,
          lightScreen: damageLightScreen,
          auroraVeil: damageAuroraVeil,
        }),
      turnSettings: threatTurnSettings,
    });
  }, [
    damageAttackStage,
    damageDefenseStage,
    damageReflect,
    damageLightScreen,
    damageAuroraVeil,
    damageTerrain,
    damageWeather,
    doublesAllyMembers,
    doublesEnemyMembers,
    doublesThreatReady,
    threatTurnSettings,
  ]);
  const threatTurnOrder = useMemo(() => {
    if (!doublesThreatReady) {
      return [];
    }

    return [...doublesAllyMembers, ...doublesEnemyMembers]
      .sort((left, right) => compareThreatTurnOrder(left, right, threatTurnSettings))
      .map((member) => ({
        member,
        effectiveSpeed: getThreatEffectiveSpeed(member, threatTurnSettings),
        tailwindActive:
          (member.side === "ally" && threatTurnSettings.allyTailwind) ||
          (member.side === "enemy" && threatTurnSettings.enemyTailwind),
      }));
  }, [doublesAllyMembers, doublesEnemyMembers, doublesThreatReady, threatTurnSettings]);

  const opponentOhkoMap = useMemo(
    () =>
      new Map(
        scoutingOpponentEntries.map((entry) => [
          entry.slotIndex,
          teamPreviewDetailTeam
            .flatMap(({ pokemon: attackerPokemon, slot, slotIndex }) => {

              return slot.savedAttacks
                .map((attack) => {
                  const basePower = getResolvedAttackBasePower(attack);

                  if (basePower === null) {
                    return null;
                  }

                  const estimate = calculateRoughDamage({
                    attacker: attackerPokemon,
                    defender: entry.pokemon,
                    attackType: attack.type,
                    moveName: attack.label?.trim() || undefined,
                    basePower,
                    category: getResolvedAttackCategory(attack, attackerPokemon),
                    isSpreadMove: getResolvedAttackSpread(attack),
                    multihit: getResolvedAttackMultihit(attack, moveByKey) ?? null,
                    weather: damageWeather,
                    terrain: damageTerrain,
                    attackerGrounded: isLikelyGrounded(attackerPokemon),
                    defenderGrounded: isLikelyGrounded(entry.pokemon),
                    attackerStatStage: damageAttackStage,
                    defenderStatStage: damageDefenseStage,
                    attackerAbility: getDefaultDamageAbilityId(attackerPokemon),
                    attackerAbilityName: slot.abilityName,
                    defenderAbility: getDefaultDamageAbilityId(entry.pokemon),
                    reflect: damageReflect,
                    lightScreen: damageLightScreen,
                    auroraVeil: damageAuroraVeil,
                    attackerStatSpread: slot.resolvedStatSpread,
                    defenderStatSpread: entry.statSpread ?? null,
                  });

                  if (estimate.maxPercent < 100) {
                    return null;
                  }

                  return {
                    slotIndex,
                    pokemon: attackerPokemon,
                    attack,
                    estimate,
                    speedDelta:
                      getChampionsComputedStats(attackerPokemon, { spread: slot.resolvedStatSpread }).spe -
                      getChampionsComputedStats(entry.pokemon, { spread: entry.statSpread }).spe,
                    guaranteed: estimate.minPercent >= 100,
                  };
                })
                .filter(
                  (
                    ohkoEntry,
                  ): ohkoEntry is {
                    slotIndex: number;
                    pokemon: PokemonRecord;
                    attack: PersistedSavedAttack;
                    estimate: ReturnType<typeof calculateRoughDamage>;
                    speedDelta: number;
                    guaranteed: boolean;
                  } => Boolean(ohkoEntry),
                );
            })
            .sort((left, right) => {
              if (left.guaranteed !== right.guaranteed) {
                return Number(right.guaranteed) - Number(left.guaranteed);
              }

              return right.estimate.averagePercent - left.estimate.averagePercent;
            }),
        ]),
      ),
    [
      damageAttackStage,
      damageDefenseStage,
      damageReflect,
      damageLightScreen,
      damageAuroraVeil,
      damageTerrain,
      damageWeather,
      scoutingOpponentEntries,
      teamPreviewDetailTeam,
    ],
  );

  const teamMatchupEloRows = useMemo(
    () => {
      if (analyzedOpponentEntries.length === 0) {
        return [];
      }

      return effectiveTeam
        .map((slot, slotIndex) => {
          if (!bringSelectedSlotSet.has(slotIndex) || !slot.pokemon) {
            return null;
          }

          const attackerPokemon = slot.pokemon;
          const attackerGrounded = isLikelyGrounded(attackerPokemon);
          const targetResults = analyzedOpponentEntries.map((entry) =>
            buildMatchupEloTargetResult({
              attackerPokemon,
              attackerSavedAttacks: slot.savedAttacks,
              attackerStatSpread: slot.resolvedStatSpread,
              targetPokemon: entry.pokemon,
              targetSavedAttacks:
                entry.savedAttacks.length > 0 ? entry.savedAttacks : createStabProxySavedAttacks(entry.pokemon),
              targetStatSpread: entry.statSpread ?? null,
              weather: damageWeather,
              terrain: damageTerrain,
              attackerGrounded,
              targetGrounded: isLikelyGrounded(entry.pokemon),
              attackerStatStage: damageAttackStage,
              defenderStatStage: damageDefenseStage,
              targetSlotIndex: entry.slotIndex,
            }),
          );

          return {
            slotIndex,
            pokemon: attackerPokemon,
            targetResults,
            ...summarizeMatchupElo(targetResults),
          };
        })
        .filter(
          (
            row,
          ): row is {
            slotIndex: number;
            pokemon: PokemonRecord;
            targetResults: MatchupEloTargetResult[];
            coverageCount: number;
            guaranteedCount: number;
            surviveCount: number;
            nonLosingSurviveCount: number;
            fasterCount: number;
            notSlowerCount: number;
            minTargetScore: number;
            averageTargetScore: number;
          } => Boolean(row),
        )
        .sort((left, right) => compareMatchupEloSummaries(left, right));
    },
    [analyzedOpponentEntries, bringSelectedSlotSet, damageAttackStage, damageDefenseStage, damageTerrain, damageWeather, effectiveTeam],
  );
  const teamMatchupEloCoversAll = teamMatchupEloRows.filter((row) => row.coverageCount === analyzedOpponentEntries.length);
  const teamMatchupEloGuaranteesAll = teamMatchupEloRows.filter(
    (row) => row.guaranteedCount === analyzedOpponentEntries.length,
  );
  const teamMatchupEloLivesAll = teamMatchupEloRows.filter(
    (row) => row.nonLosingSurviveCount === analyzedOpponentEntries.length,
  );

  const quickPokemonAbilities = useMemo(() => {
    if (!quickPokemon) {
      return [];
    }

    return getPokemonAbilityNames(quickPokemon)
      .map((abilityName, index) => {
        const ability = abilityByKey.get(abilityName.toLowerCase()) ?? null;

        return {
          slot: String(index + 1),
          name: abilityName,
          ability,
        };
      })
      .filter((entry) => Boolean(entry.name));
  }, [abilityByKey, quickPokemon]);

  const quickPokemonWeakTypes = useMemo(() => {
    if (!quickPokemon) {
      return [];
    }

    return TYPE_ORDER.filter(
      (attackType) => (getPokemonDefensiveMultiplier(quickPokemon, attackType) ?? 1) > 1,
    );
  }, [quickPokemon]);

  const quickMoveEstimate = useMemo(() => {
    if (!quickMove || !currentDamageAttackerPokemon || !currentDamageDefenderPokemon) {
      return null;
    }

    const quickMoveBasePower = getMoveRecordDamageBasePower(quickMove);

    if (quickMove.category === "Status" || quickMoveBasePower === undefined) {
      return null;
    }

    const moveType = getMovePokemonType(quickMove);

    if (!moveType) {
      return null;
    }

    return calculateRoughDamage({
      attacker: currentDamageAttackerPokemon,
      defender: currentDamageDefenderPokemon,
      attackType: moveType,
      moveName: quickMove.name,
      basePower: quickMoveBasePower,
      category: quickMove.category.toLowerCase() as DamageCategory,
      isSpreadMove: isSpreadTarget(quickMove.target),
      multihit: getMoveMultihit(quickMove) ?? null,
      weather: damageWeather,
      terrain: damageTerrain,
      attackerGrounded: damageCalcMode === "attack" ? damageAttackerGrounded : damageDefenderGrounded,
      defenderGrounded: damageCalcMode === "attack" ? damageDefenderGrounded : damageAttackerGrounded,
      attackerStatStage: damageAttackStage,
      defenderStatStage: damageDefenseStage,
      attackerAbility: damageCalcMode === "attack" ? damageAttackerAbility : damageDefenderAbility,
      attackerAbilityName: currentDamageAttackerAbilityName,
      defenderAbility: damageCalcMode === "attack" ? damageDefenderAbility : damageAttackerAbility,
      reflect: damageReflect,
      lightScreen: damageLightScreen,
      auroraVeil: damageAuroraVeil,
      attackerStatSpread: damageCalcMode === "attack" ? null : selectedDamageDefender?.statSpread ?? null,
      defenderStatSpread: damageCalcMode === "attack" ? selectedDamageDefender?.statSpread ?? null : null,
    });
  }, [
    damageAttackStage,
    damageAttackerAbility,
    currentDamageAttackerAbilityName,
    currentDamageAttackerPokemon,
    currentDamageDefenderPokemon,
    damageAttackerGrounded,
    damageDefenderAbility,
    damageCalcMode,
    damageDefenseStage,
    damageDefenderGrounded,
    damageReflect,
    damageLightScreen,
    damageAuroraVeil,
    damageTerrain,
    damageWeather,
    quickMove,
    selectedDamageDefender?.statSpread,
  ]);

  const updateOpenerSelection = (openerIndex: number, memberIndex: 0 | 1, slotIndex: number) => {
    setOpenerSelections((current) => {
      const next = [...current] as [OpenerSelection, OpenerSelection];
      const pair: OpenerSelection = [...next[openerIndex]] as OpenerSelection;

      pair[memberIndex] = slotIndex;

      if (filledLeadOptions.length > 1 && pair[0] === pair[1]) {
        const fallback = filledLeadOptions.find((entry) => entry.index !== slotIndex)?.index ?? slotIndex;
        pair[memberIndex === 0 ? 1 : 0] = fallback;
      }

      next[openerIndex] = pair;
      return next;
    });
  };
  const toggleDoublesAllySelection = (slotIndex: number) => {
    setDoublesAllySelection((current) => togglePairSelection(current, slotIndex));
  };
  const rememberEnemyBringSlotIndex = (slotIndex: number | null) => {
    setKnownEnemyBringSlotIndices((current) => {
      const next = rememberBringSelectionSlot({
        currentKnownBringSlotIndices: current,
        slotIndex,
        filledSlotIndices: loadedOpponentSlotIndices,
      });

      return next.length === current.length && next.every((candidate, index) => candidate === current[index])
        ? current
        : next;
    });
  };
  const toggleDoublesEnemySelection = (slotIndex: number) => {
    rememberEnemyBringSlotIndex(slotIndex);
    setDoublesEnemySelection((current) => togglePairSelection(current, slotIndex));
  };
  const assignDoublesAllySelection = (slotIndex: number, memberIndex: 0 | 1) => {
    setDoublesAllySelection((current) => assignPairSelectionSlot(current, slotIndex, memberIndex));
  };
  const assignDoublesEnemySelection = (slotIndex: number, memberIndex: 0 | 1) => {
    rememberEnemyBringSlotIndex(slotIndex);
    setDoublesEnemySelection((current) => assignPairSelectionSlot(current, slotIndex, memberIndex));
  };
  const setBattleLabActiveSelectionSlot = (side: BattleSide, memberIndex: 0 | 1, slotIndex: number | null) => {
    if (side === "ally") {
      setDoublesAllySelection((current) => {
        const next: OpenerSelection = [...current];
        next[memberIndex] = slotIndex;
        return next;
      });
      return;
    }

    rememberEnemyBringSlotIndex(slotIndex);
    setDoublesEnemySelection((current) => {
      const next: OpenerSelection = [...current];
      next[memberIndex] = slotIndex;
      return next;
    });
  };
  const markBattleLabCombatantFainted = (combatant: BattleCombatantState) => {
    updateBattleSimulatorMemberStateForPokemon(combatant.side, combatant.teamIndex, combatant.pokemon, {
      hpPercent: 0,
      attackStage: 0,
      defenseStage: 0,
      specialAttackStage: 0,
      specialDefenseStage: 0,
      speedStage: 0,
      statusCondition: "none",
      sleepTurns: 0,
      toxicTurns: 0,
      tauntTurns: 0,
      encoreTurns: 0,
      encoredMoveId: null,
      disableTurns: 0,
      disabledMoveId: null,
      helpingHandTurns: 0,
      lastMoveId: null,
      turnsActive: 0,
      protectStreak: 0,
    });
  };
  const changeBattleLabSlotBattleForm = (
    side: BattleSide,
    slotIndex: number,
    basePokemon: PokemonRecord,
    activeFormPokemonId: string | null,
  ) => {
    const nextPokemon = activeFormPokemonId ? pokemonByKey.get(activeFormPokemonId) ?? null : basePokemon;
    if (nextPokemon && nextPokemon.id !== basePokemon.id && !isCompatibleBattleForm(basePokemon, nextPokemon)) {
      return;
    }

    updateBattleSimulatorMemberState(side, slotIndex, basePokemon.id, {
      activeFormPokemonId: nextPokemon && nextPokemon.id !== basePokemon.id ? nextPokemon.id : null,
    });
    setBattleEngineRecommendation(null);
    setBattleEngineAnalysisSignature("");
    setSimulationRun(null);
    setSimViewMode("real");
  };
  const getThreatBoardAllyDisplay = (slotIndex: number | null | undefined) => {
    if (slotIndex === null || slotIndex === undefined) {
      return null;
    }

    const slot = team[slotIndex];
    if (!slot?.pokemon) {
      return null;
    }

    const basePokemon = slot.basePokemon ?? getBasePokemonForBattleForm(slot.pokemon, basePokemonBySpeciesKey);
    const state = getBattleSimulatorMemberState("ally", slotIndex, basePokemon.id);
    const pokemon = getBattleLabActivePokemon(basePokemon, state.activeFormPokemonId, pokemonByKey) ?? basePokemon;
    const formOptions = getSavedMegaFormOptions(
      basePokemon,
      slot.activeFormPokemonId,
      pokemonByKey,
      megaFormsByBaseSpeciesKey,
    );

    return {
      slot,
      slotIndex,
      basePokemon,
      pokemon,
      state,
      formOptions,
    };
  };
  const getThreatBoardEnemyDisplay = (slotIndex: number | null | undefined) => {
    if (slotIndex === null || slotIndex === undefined) {
      return null;
    }

    const entry = opponentEntryBySlot.get(slotIndex) ?? null;
    if (!entry) {
      return null;
    }

    const basePokemon = getBasePokemonForBattleForm(entry.pokemon, basePokemonBySpeciesKey);
    const state = getBattleSimulatorMemberState("enemy", entry.slotIndex, basePokemon.id);
    const pokemon = getBattleLabActivePokemon(basePokemon, state.activeFormPokemonId, pokemonByKey) ?? basePokemon;
    const formOptions = getTeamFormOptions(basePokemon, megaFormsByBaseSpeciesKey);
    const moveset = getStoredOrPresetSavedAttacks(
      pokemon,
      speciesMovesetByKey,
      moveByKey,
      MAX_SPECIES_MOVESET_SIZE,
    );

    return {
      entry,
      slotIndex,
      basePokemon,
      pokemon,
      state,
      formOptions,
      moveset,
    };
  };
  const renderThreatBoardFormControls = ({
    side,
    slotIndex,
    basePokemon,
    pokemon,
    formOptions,
    compact = false,
  }: {
    side: BattleSide;
    slotIndex: number;
    basePokemon: PokemonRecord;
    pokemon: PokemonRecord;
    formOptions: TeamFormOption[];
    compact?: boolean;
  }) => {
    if (formOptions.length <= 1) {
      return null;
    }

    const currentFormOption = formOptions.find((option) => option.pokemon.id === pokemon.id) ?? null;
    const quickFormOptions = formOptions.filter((option) => option.pokemon.id !== pokemon.id);
    if (quickFormOptions.length === 0) {
      return null;
    }

    return (
      <div
        className={`doubles-lineup-form-toggle ${side} ${compact ? "compact" : ""}`}
        aria-label={`${pokemon.name} battle form shortcuts`}
      >
        {quickFormOptions.map((option) => {
          const isBase = option.isBase;
          return (
            <button
              key={`threat-${side}-${slotIndex}-form-${option.pokemon.id}`}
              type="button"
              className={isBase ? "normal" : "mega"}
              onClick={(event) => {
                event.stopPropagation();
                changeBattleLabSlotBattleForm(side, slotIndex, basePokemon, option.activeFormPokemonId);
              }}
              title={isBase ? "Switch this slot back to normal form" : `Mega evolve into ${option.pokemon.name}`}
            >
              {isBase ? "Normal" : option.label}
            </button>
          );
        })}
        {currentFormOption && !currentFormOption.isBase ? <span>{currentFormOption.label}</span> : null}
      </div>
    );
  };
  const clearChosenActionForCombatant = (combatantId: string) => {
    setUserChosenActions((current) => {
      if (!(combatantId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[combatantId];
      return next;
    });
  };

  const updateOpponentQuery = (slotIndex: number, query: string) => {
    setOpponentQueries((current) => current.map((entry, index) => (index === slotIndex ? query : entry)));
  };

  const changeOpponentSlotBattleForm = (slotIndex: number, nextPokemon: PokemonRecord) => {
    const currentEntry = opponentRoster[slotIndex];
    const currentPokemon = currentEntry?.pokemon ?? null;
    const basePokemon = currentPokemon ? getBasePokemonForBattleForm(currentPokemon, basePokemonBySpeciesKey) : null;

    if (basePokemon && nextPokemon.id !== basePokemon.id && !isCompatibleBattleForm(basePokemon, nextPokemon)) {
      return;
    }

    setOpponentQueries((current) => current.map((entry, index) => (index === slotIndex ? nextPokemon.name : entry)));

    const nextBasePokemon = getBasePokemonForBattleForm(nextPokemon, basePokemonBySpeciesKey);
    const currentPokemonId = currentPokemon?.id ?? null;
    const nextBaseKey = getBattleSimulatorStateKey("enemy", slotIndex, nextBasePokemon.id);
    if (currentPokemonId) {
      const oldKey = getBattleSimulatorStateKey("enemy", slotIndex, currentPokemonId);
      const oldBaseKey = basePokemon ? getBattleSimulatorStateKey("enemy", slotIndex, basePokemon.id) : oldKey;
      setBattleSimulatorState((current) => {
        const existing = current[nextBaseKey] ?? current[oldBaseKey] ?? current[oldKey];
        if (!existing) {
          return current;
        }

        const { [oldKey]: _discarded, [oldBaseKey]: _oldBaseDiscarded, [nextBaseKey]: _nextBaseDiscarded, ...rest } = current;
        return {
          ...rest,
          [nextBaseKey]: {
            ...existing,
            activeFormPokemonId: null,
          },
        };
      });
    }

    setBattleEngineRecommendation(null);
    setBattleEngineAnalysisSignature("");
    setSimulationRun(null);
    setSimViewMode("real");
  };

  const loadSavedTeamAsOpponent = (savedTeam: PersistedTeam) => {
    const filledSlots = Array.from({ length: MAX_OPPONENT_SCOUT_SLOTS }, (_, index) => {
      const slot = savedTeam.slots[index];
      return slot?.query?.trim() ?? "";
    });

    setOpponentQueries(filledSlots);
    setAnalyzedOpponentEntries([]);
    setStorageMessage(`Loaded "${savedTeam.name}" into the enemy board.`);
    setStorageError(null);
  };

  const applyShowdownEnemyTeamImport = (importResult: ShowdownBridgeImportResult | null) => {
    const enemyMembers = importResult?.input?.enemy ?? [];

    if (enemyMembers.length === 0) {
      return false;
    }

    const importedMembers = enemyMembers.slice(0, MAX_OPPONENT_SCOUT_SLOTS);
    const filledSlots = Array.from(
      { length: MAX_OPPONENT_SCOUT_SLOTS },
      (_, index) => importedMembers[index]?.pokemon.name ?? "",
    );
    const importedSlotIndices = importedMembers.map((_, index) => index);
    const warningParts: string[] = [];

    if (enemyMembers.length > MAX_OPPONENT_SCOUT_SLOTS) {
      warningParts.push(`ignored ${enemyMembers.length - MAX_OPPONENT_SCOUT_SLOTS} extra Pokemon`);
    }

    if (importResult?.unresolvedSpecies.length) {
      warningParts.push(`couldn't match Pokemon: ${formatImportIssueList(importResult.unresolvedSpecies)}`);
    }

    setOpponentQueries(filledSlots);
    setAnalyzedOpponentEntries([]);
    setKnownEnemyBringSlotIndices([]);
    setDoublesEnemySelection(normalizeSparsePairSelection([0, 1], importedSlotIndices, 0));
    setDamageDefenderSlotIndex(importedSlotIndices[0] ?? null);
    resetBattleSimulatorState();
    setBattleEngineRecommendation(null);
    setBattleEngineAnalysisSignature("");
    setPendingShowdownEnemyImport(false);
    setStorageMessage(
      `Imported ${importedMembers.length} enemy Pokemon from Showdown${
        showdownBridgeCapturedLabel ? ` snapshot ${showdownBridgeCapturedLabel}` : ""
      }${warningParts.length > 0 ? `; ${warningParts.join("; ")}.` : "."}`,
    );
    setStorageError(null);

    return true;
  };

  const importShowdownEnemyTeam = () => {
    if (!database || !battleData) {
      setStorageError("The local Pokemon and move databases must finish loading before importing from Showdown.");
      setStorageMessage(null);
      return;
    }

    setPendingShowdownEnemyImport(true);
    requestShowdownSnapshot();

    if (showdownBridgeStatus === "error") {
      setPendingShowdownEnemyImport(false);
      setStorageError(showdownBridgeMessage || "Showdown bridge could not be reached.");
      setStorageMessage(null);
      return;
    }

    setStorageMessage("Requested a Showdown enemy snapshot. The enemy board will fill when the bridge responds.");
    setStorageError(null);
  };

  useEffect(() => {
    if (!pendingShowdownEnemyImport) {
      return;
    }

    if (applyShowdownEnemyTeamImport(showdownBridgeImport)) {
      return;
    }

    if (showdownBridgeImport) {
      setPendingShowdownEnemyImport(false);
      setStorageError(
        showdownBridgeImport.unresolvedSpecies.length > 0
          ? `No enemy Pokemon could be imported; couldn't match Pokemon: ${formatImportIssueList(showdownBridgeImport.unresolvedSpecies)}.`
          : showdownBridgeImport.summary || "The latest Showdown snapshot did not include any enemy Pokemon to import.",
      );
      setStorageMessage(null);
      return;
    }

    if (showdownBridgeStatus === "waiting" || showdownBridgeStatus === "idle") {
      setStorageMessage("Waiting for a Showdown battle snapshot. Keep a battle tab open with the bridge extension enabled.");
      setStorageError(null);
    } else if (showdownBridgeStatus === "error") {
      setPendingShowdownEnemyImport(false);
      setStorageError(showdownBridgeMessage || "Showdown bridge could not be reached.");
      setStorageMessage(null);
    }
  }, [pendingShowdownEnemyImport, showdownBridgeImport, showdownBridgeMessage, showdownBridgeStatus]);

  const runOpponentAnalysis = () => {
    if (!canRunOpponentAnalysis) {
      return;
    }

    startTransition(() => {
      setAnalyzedOpponentEntries(opponentEntries);
    });
  };
  const runBattleEngineAnalysis = () => {
    if (!canRunBattleEngine || !battleEngineCurrentState) {
      return;
    }

    const limitsByMode: Record<SearchMode, { maxJointPlansPerSide: number; maxIndividualActionsPerActor: number }> = {
      fast: { maxJointPlansPerSide: 5, maxIndividualActionsPerActor: 4 },
      balanced: { maxJointPlansPerSide: 8, maxIndividualActionsPerActor: 5 },
      deep: { maxJointPlansPerSide: 10, maxIndividualActionsPerActor: 6 },
      tactical: { maxJointPlansPerSide: 9, maxIndividualActionsPerActor: 5 },
    };
    const searchOptions = {
      searchMode: battleEngineSearchMode,
      objectiveMode: battleEngineObjectiveMode,
      ...limitsByMode[battleEngineSearchMode],
    };
    const nextRequestId = battleEngineSearchRequestIdRef.current + 1;
    battleEngineSearchRequestIdRef.current = nextRequestId;
    battleEngineWorkerRef.current?.terminate();

    const finishWithRecommendation = (recommendation: SearchRecommendation) => {
      setBattleEngineRecommendation(recommendation);
      setSelectedBattleScenarioId(recommendation.preview ? "recommended-outcome" : "current-board");
      setBattleEngineAnalysisSignature(battleEngineInputSignature);
    };
    const runMainThreadFallback = (workerMessage: string) => {
      if (nextRequestId !== battleEngineSearchRequestIdRef.current || !battleEngineCurrentState) {
        return;
      }

      battleEngineWorkerRef.current?.terminate();
      battleEngineWorkerRef.current = null;

      try {
        const recommendation = recommendBestPlan(battleEngineCurrentState, searchOptions);
        setBattleEngineSearching(false);
        setBattleEngineError(null);
        finishWithRecommendation(recommendation);
      } catch (error) {
        setBattleEngineSearching(false);
        const fallbackMessage = error instanceof Error ? error.message : "Battle engine search failed.";
        setBattleEngineError(`${workerMessage} Fallback failed: ${fallbackMessage}`);
      }
    };

    let worker: Worker;
    try {
      worker = new Worker(new URL("./lib/engine/search.worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Battle engine worker could not start.";
      runMainThreadFallback(message);
      return;
    }

    battleEngineWorkerRef.current = worker;
    setBattleEngineSearching(true);
    setBattleEngineError(null);

    worker.onmessage = (event: MessageEvent<{ id: number; recommendation?: SearchRecommendation; error?: string }>) => {
      if (event.data.id !== battleEngineSearchRequestIdRef.current) {
        return;
      }

      battleEngineWorkerRef.current?.terminate();
      battleEngineWorkerRef.current = null;
      setBattleEngineSearching(false);

      if (event.data.error || !event.data.recommendation) {
        setBattleEngineError(event.data.error ?? "Battle engine search failed.");
        return;
      }

      finishWithRecommendation(event.data.recommendation);
    };

    worker.onerror = (event) => {
      if (nextRequestId !== battleEngineSearchRequestIdRef.current) {
        return;
      }

      event.preventDefault();
      runMainThreadFallback(event.message ? `Battle engine worker failed: ${event.message}` : "Battle engine worker failed.");
    };

    try {
      worker.postMessage({
        id: nextRequestId,
        state: battleEngineCurrentState,
        options: searchOptions,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Battle engine worker request failed.";
      runMainThreadFallback(message);
    }
  };

  const updateDamageMoveConfig = (
    slotIndex: number,
    pokemonId: string,
    attackId: string,
    baseConfig: DamageMoveConfig,
    patch: Partial<DamageMoveConfig>,
  ) => {
    const configKey = getDamageConfigKey(slotIndex, pokemonId);

    setDamageMoveConfigs((current) => ({
      ...current,
      [configKey]: {
        ...current[configKey],
        [attackId]: {
          ...(current[configKey]?.[attackId] ?? baseConfig),
          ...patch,
        },
      },
    }));
  };

  const updateDefenseMoveConfig = (
    slotIndex: number,
    pokemonId: string,
    patch: Partial<ManualDamageMoveConfig>,
  ) => {
    const configKey = getDamageConfigKey(slotIndex, pokemonId);

    setDefenseMoveConfigs((current) => ({
      ...current,
      [configKey]: {
        ...(current[configKey] ?? createDefaultManualDamageMoveConfig(pokemonByKey.get(pokemonId) ?? null)),
        ...patch,
      },
    }));
  };

  const applyEnemyStatSpreadOverride = (
    slotIndex: number,
    pokemon: PokemonRecord,
    statSpread: ChampionsStatSpread | null,
  ) => {
    const overrideKey = getEnemyStatSpreadOverrideKey(slotIndex, pokemon, basePokemonBySpeciesKey);

    setEnemyStatSpreadOverrides((current) => {
      const { [overrideKey]: _discarded, ...rest } = current;
      return statSpread ? { ...rest, [overrideKey]: statSpread } : rest;
    });
    setAnalyzedOpponentEntries([]);
    setBattleEngineRecommendation(null);
    setBattleEngineAnalysisSignature("");
  };

  const clearOpponentTeam = () => {
    battleEngineWorkerRef.current?.terminate();
    battleEngineWorkerRef.current = null;
    setBattleEngineSearching(false);
    setBattleEngineError(null);
    setOpponentQueries(createEmptyOpponentSlots());
    setEnemyStatSpreadOverrides({});
    setEditingEnemyStatSpreadSlotIndex(null);
    setAnalyzedOpponentEntries([]);
    setKnownEnemyBringSlotIndices([]);
    resetBattleSimulatorState();
    setBattleEngineRecommendation(null);
    setBattleEngineAnalysisSignature("");
  };

  return (
    <>
      {editingEnemyStatSpreadEntry && typeof document !== "undefined" ? (
        <EnemyStatSpreadEditorModal
          entry={editingEnemyStatSpreadEntry}
          basePokemonBySpeciesKey={basePokemonBySpeciesKey}
          overrideSpread={editingEnemyStatSpreadOverride}
          onApply={applyEnemyStatSpreadOverride}
          onClose={() => setEditingEnemyStatSpreadSlotIndex(null)}
        />
      ) : null}

      <section className="team-builder-hero">
        <div>
          <p className="eyebrow">Team Coverage</p>
          <h2>Build a six-Pokemon squad</h2>
          <p className="selector-note">
            Pick six Pokemon from the local database, then save attacks for each slot to inspect
            coverage, matchup pressure, and possible one-hit KOs into the enemy team below.
          </p>
        </div>
        <div className="team-builder-hero-side">
          <label className="team-format-field" htmlFor="team-builder-format">
            <span className="team-input-label">Format</span>
            <select
              id="team-builder-format"
              value={teamBuilderFormat}
              onChange={(event) => setTeamBuilderFormat(event.target.value as TeamBuilderFormat)}
            >
              <option value="regulationMA">{POKEMON_CHAMPIONS_ACTIVE_REGULATION}</option>
              <option value="all">All Local Dex</option>
            </select>
          </label>

          <div className="team-builder-meta">
            <span>{selectedPokemon.length} / 6 selected</span>
            <span>{selectedSavedAttackCount} saved attacks</span>
            <span>{selectedAttackTypes.length} unique attack types</span>
            <span>{teamBuilderPokemonPool.length} available picks</span>
          </div>
        </div>
      </section>

      <section className="team-storage-panel">
        <div className="team-storage-controls">
          <label className="team-input-label" htmlFor="team-name">
            Team Name
          </label>
          <input
            id="team-name"
            className="team-pokemon-input"
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            placeholder="My Team"
          />
          <div className="storage-button-row">
            <button type="button" className="primary-button" onClick={saveCurrentTeam}>
              Save Team
            </button>
            <button type="button" className="secondary-button" onClick={handleStartNewTeam}>
              Start New Team
            </button>
            <button type="button" className="secondary-button" onClick={exportCurrentTeam}>
              Export JSON
            </button>
            <button type="button" className="secondary-button" onClick={openImportPicker}>
              Import JSON
            </button>
          </div>
          <div className="showdown-transfer-grid">
            <button
              type="button"
              className="showdown-import-trigger"
              onClick={() => setShowdownImportOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={showdownImportOpen}
            >
              <span className="showdown-import-trigger__text">
                <span className="showdown-import-trigger__title">Pokemon Showdown Import</span>
                <span className="showdown-import-trigger__hint">
                  {showdownImportText.trim()
                    ? `${showdownImportText.trim().length} chars pasted · click to review`
                    : "Paste Showdown text into this team builder"}
                </span>
              </span>
              <span className="showdown-import-trigger__icon" aria-hidden="true">
                ↙
              </span>
            </button>
            <button
              type="button"
              className="showdown-import-trigger"
              onClick={openShowdownExport}
              aria-haspopup="dialog"
              aria-expanded={showdownExportOpen}
            >
              <span className="showdown-import-trigger__text">
                <span className="showdown-import-trigger__title">Pokemon Showdown Export</span>
                <span className="showdown-import-trigger__hint">
                  {selectedPokemon.length > 0
                    ? `Copy ${selectedPokemon.length} Pokemon for Showdown`
                    : "Add Pokemon before exporting"}
                </span>
              </span>
              <span className="showdown-import-trigger__icon" aria-hidden="true">
                ↗
              </span>
            </button>
          </div>
          <input
            ref={importInputRef}
            className="hidden-file-input"
            type="file"
            accept="application/json"
            onChange={importTeamFromFile}
          />
          {storageMessage ? <p className="storage-message success">{storageMessage}</p> : null}
          {storageError ? <p className="storage-message error">{storageError}</p> : null}
        </div>

        <div className="saved-teams-panel">
          <div className="saved-teams-header">
            <p className="eyebrow">Saved Locally</p>
            <span>{savedTeams.length}</span>
          </div>
          {savedTeams.length > 0 ? (
            <ul className="saved-teams-list">
              {savedTeams.map((savedTeam) => {
                const filledSlots = savedTeam.slots.filter((slot) => slot.pokemonId);
                const updated = new Date(savedTeam.updatedAt);
                const isActive = activeSavedTeamId === savedTeam.id;
                return (
                  <li
                    key={savedTeam.id}
                    className={`saved-team-row${isActive ? " is-active" : ""}`}
                  >
                    <div className="saved-team-row__identity">
                      <strong title={savedTeam.name}>{savedTeam.name}</strong>
                      <span className="saved-team-row__meta">
                        <span className="saved-team-row__slot-count">{filledSlots.length}/6</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={savedTeam.updatedAt} title={updated.toLocaleString()}>
                          {updated.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                      </span>
                    </div>
                    <div className="saved-team-row__sprites" aria-hidden="true">
                      {Array.from({ length: TEAM_SIZE }).map((_, slotIndex) => {
                        const slot = savedTeam.slots[slotIndex];
                        const pokemonId = slot?.pokemonId;
                        return pokemonId ? (
                          <img
                            key={`${savedTeam.id}-${slotIndex}-${pokemonId}`}
                            className="saved-team-row__sprite"
                            src={getPokemonSpriteUrl(pokemonId)}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <span
                            key={`${savedTeam.id}-${slotIndex}-empty`}
                            className="saved-team-row__sprite saved-team-row__sprite--empty"
                          />
                        );
                      })}
                    </div>
                    <div className="saved-team-row__actions">
                      <button
                        type="button"
                        className="saved-team-row__action"
                        onClick={() => loadSavedTeamIntoBuilder(savedTeam)}
                        aria-label={`Load ${savedTeam.name}`}
                        title="Load team"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        className="saved-team-row__action saved-team-row__action--danger"
                        onClick={() => removeSavedTeam(savedTeam)}
                        aria-label={`Delete ${savedTeam.name}`}
                        title="Delete team"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="team-slot-empty">No saved teams yet. Save one locally to keep it offline.</div>
          )}
        </div>

        {showdownImportOpen && typeof document !== "undefined"
          ? createPortal(
          <div
            className="showdown-import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="showdown-import-modal-title"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setShowdownImportOpen(false);
              }
            }}
          >
            <div className="showdown-import-modal__dialog" role="document">
              <header className="showdown-import-modal__header">
                <div className="showdown-import-modal__title">
                  <span className="eyebrow">Import</span>
                  <h3 id="showdown-import-modal-title">Pokemon Showdown Import</h3>
                </div>
                <button
                  type="button"
                  className="showdown-import-modal__close"
                  onClick={() => setShowdownImportOpen(false)}
                  aria-label="Close Showdown import"
                  title="Close"
                >
                  ×
                </button>
              </header>
              <div className="showdown-import-modal__body">
                <textarea
                  id="showdown-import"
                  className="showdown-import-input"
                  rows={12}
                  value={showdownImportText}
                  onChange={(event) => setShowdownImportText(event.target.value)}
                  placeholder={"Charizard @ Charizardite Y\nAbility: Blaze\n- Heat Wave\n- Weather Ball\n- Solar Beam\n- Protect"}
                  aria-label="Pokemon Showdown team export"
                  autoFocus
                />
                <p className="selector-note">
                  Pasted imports ignore EVs and nature. Mega stones resolve to mega forms when possible, and only
                  damaging moves are saved into the current team builder.
                </p>
              </div>
              <footer className="showdown-import-modal__footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowdownImportText("")}
                  disabled={!showdownImportText}
                >
                  Clear Text
                </button>
                <div className="showdown-import-modal__footer-spacer" />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowdownImportOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={importTeamFromShowdownText}
                  disabled={!showdownImportText.trim()}
                >
                  Import Showdown Text
                </button>
              </footer>
            </div>
          </div>,
            document.body,
          )
          : null}

        {showdownExportOpen && typeof document !== "undefined"
          ? createPortal(
          <div
            className="showdown-import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="showdown-export-modal-title"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setShowdownExportOpen(false);
              }
            }}
          >
            <div className="showdown-import-modal__dialog" role="document">
              <header className="showdown-import-modal__header">
                <div className="showdown-import-modal__title">
                  <span className="eyebrow">Export</span>
                  <h3 id="showdown-export-modal-title">Pokemon Showdown Export</h3>
                </div>
                <button
                  type="button"
                  className="showdown-import-modal__close"
                  onClick={() => setShowdownExportOpen(false)}
                  aria-label="Close Showdown export"
                  title="Close"
                >
                  ×
                </button>
              </header>
              <div className="showdown-import-modal__body">
                <textarea
                  className="showdown-import-input"
                  rows={12}
                  value={showdownExportText}
                  onChange={(event) => setShowdownExportText(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="Pokemon Showdown team text"
                  autoFocus
                />
                <p className="selector-note">
                  Champions stat points are written to the EV line so the text stays compatible with
                  Showdown import/export.
                </p>
                {showdownExportWarnings.length > 0 ? (
                  <div className="showdown-export-warnings">
                    {showdownExportWarnings.slice(0, 4).map((warning, index) => (
                      <span key={`showdown-export-warning-${index}`}>{warning}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <footer className="showdown-import-modal__footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    const exported = buildCurrentShowdownExport();
                    setShowdownExportText(exported.text);
                    setShowdownExportWarnings(exported.warnings);
                  }}
                >
                  Regenerate
                </button>
                <div className="showdown-import-modal__footer-spacer" />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowdownExportOpen(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={copyShowdownExportToClipboard}
                  disabled={!showdownExportText.trim()}
                >
                  Copy Showdown Text
                </button>
              </footer>
            </div>
          </div>,
            document.body,
          )
          : null}
      </section>

      <section className="team-grid">
        {team.map((slot, slotIndex) => (
          <TeamSlotCard
            key={slotIndex}
            slot={slot}
            slotIndex={slotIndex}
            databaseLoaded={Boolean(database)}
            loadError={loadError}
            moveByKey={moveByKey}
            itemOptions={battleData?.items ?? []}
            itemByKey={itemByKey}
            onQueryChange={updateSlotQuery}
            onClear={clearSlot}
            onApplySlotMoveset={applySlotConfig}
            onApplySlotStatSpread={applySlotStatSpread}
            onBattleFormChange={changeTeamSlotBattleForm}
          />
        ))}
      </section>

      <section className="team-analysis-layout">
        <section className="board-panel team-matrix-panel">
          <div className="board-header">
            <div>
              <p className="eyebrow">Team Matchup Grid</p>
              <h2>{teamMatrixMode === "defense" ? "Defensive Coverage" : "Offensive Coverage"}</h2>
            </div>
            <div className="matrix-mode-tabs" aria-label="Team matrix modes">
              <button
                type="button"
                className={`mode-tab ${teamMatrixMode === "defense" ? "active" : ""}`}
                onClick={() => setTeamMatrixMode("defense")}
              >
                Defense Grid
              </button>
              <button
                type="button"
                className={`mode-tab ${teamMatrixMode === "offense" ? "active" : ""}`}
                onClick={() => setTeamMatrixMode("offense")}
              >
                Attack Grid
              </button>
            </div>
          </div>

          {selectedPokemon.length === 0 ? (
            <div className="matchup-empty-board">Add Pokemon to start the team matchup matrix.</div>
          ) : teamMatrixMode === "offense" && selectedAttackTypes.length === 0 ? (
            <div className="matchup-empty-board">
              Add saved attacks to your team slots to see the offensive coverage matrix.
            </div>
          ) : (
            <div className="team-matrix-scroll">
              <div className="team-matrix-table">
                <div className="team-matrix-header type-corner">
                  <span>{teamMatrixMode === "defense" ? "Move" : "Target"}</span>
                </div>

                {team.map((slot, slotIndex) => (
                  <div key={`header-${slotIndex}`} className="team-matrix-header pokemon-column-header">
                    {slot.pokemon ? (
                      <>
                        <PokemonSprite pokemon={slot.pokemon} />
                        <span>{slot.pokemon.name}</span>
                      </>
                    ) : (
                      <span className="empty-column-label">Slot {slotIndex + 1}</span>
                    )}
                  </div>
                ))}

                <div className="team-matrix-header total-column-header">
                  <span>{teamMatrixMode === "defense" ? "Total Weak" : "Can Hit"}</span>
                </div>
                <div className="team-matrix-header total-column-header">
                  <span>{teamMatrixMode === "defense" ? "Total Resist" : "No Effect"}</span>
                </div>

                {(teamMatrixMode === "defense" ? defenseMatrixRows : offenseMatrixRows).map((row) => (
                  <div key={row.type} className="team-matrix-row">
                    <div className="team-matrix-type-cell">
                      <img src={getTypeIconUrl(row.type)} alt={getTypeLabel(row.type)} />
                      <span>{getTypeLabel(row.type)}</span>
                    </div>

                    {row.cells.map((multiplier, index) => (
                      <div
                        key={`${row.type}-${index}`}
                        className={`team-matrix-value ${getMatrixCellTone(multiplier)}`}
                      >
                        {formatMatrixCell(multiplier, teamMatrixMode)}
                      </div>
                    ))}

                    <div className="team-matrix-total strong">{row.totalStrong}</div>
                    <div className="team-matrix-total resist">{row.totalResist}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="board-panel quick-search-panel">
          <div className="quick-search-header">
            <p className="eyebrow">Quick Search</p>
            <span className="lead-available-count">
              {battleData ? `${battleData.moves.length} moves loaded` : "Loading data"}
            </span>
          </div>

          <div className="quick-search-stack">
            <section className="quick-search-card">
              <label className="quick-search-field" htmlFor="quick-pokemon-search">
                <span className="quick-search-field-label">Pokemon</span>
                <input
                  id="quick-pokemon-search"
                  list="pokemon-options"
                  className="team-pokemon-input quick-search-input"
                  placeholder={
                    database
                      ? teamBuilderFormat === "regulationMA"
                        ? `Search ${POKEMON_CHAMPIONS_ACTIVE_REGULATION} Pokemon`
                        : "Search Pokemon"
                      : "Loading local database..."
                  }
                  value={quickPokemonQuery}
                  onChange={(event) => setQuickPokemonQuery(event.target.value)}
                  disabled={!database}
                />
                <span className="quick-search-field-status">
                  {quickPokemon ? quickPokemon.name : "Search by name"}
                </span>
              </label>

              {quickPokemon ? (
                <article className="quick-summary-card">
                  <div className="quick-summary-top">
                    <div>
                      <p className="eyebrow">Pokemon</p>
                      <h3>{quickPokemon.name}</h3>
                    </div>
                    <PokemonSprite pokemon={quickPokemon} className="quick-summary-sprite" />
                  </div>

                  <div className="team-type-list">
                    {quickPokemon.types.map((typeLabel) => {
                      const type = getTypeFromLabel(typeLabel);
                      if (!type) {
                        return null;
                      }

                      return (
                        <span
                          key={`${quickPokemon.id}-${type}`}
                          className="inline-type-pill"
                          style={
                            {
                              "--type-color": TYPE_META[type].color,
                              "--type-accent": TYPE_META[type].accent,
                            } as CSSProperties
                          }
                        >
                          <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
                          {TYPE_META[type].label}
                        </span>
                      );
                    })}
                  </div>

                  <div className="quick-meta-row">
                    <span>Dex #{quickPokemon.num}</span>
                    <span>BST {quickPokemon.bst}</span>
                    <span>Tier {quickPokemon.doublesTier ?? quickPokemon.tier ?? "Unlisted"}</span>
                    {quickPokemon.heightm ? <span>{quickPokemon.heightm}m</span> : null}
                    {quickPokemon.weightkg ? <span>{quickPokemon.weightkg}kg</span> : null}
                  </div>

                  <div className="pokemon-stats-panel">
                    <div className="pokemon-stats-grid">
                      <span className="pokemon-stat-chip">
                        <strong>HP</strong>
                        <em>{quickPokemon.baseStats.hp}</em>
                      </span>
                      <span className="pokemon-stat-chip">
                        <strong>Atk</strong>
                        <em>{quickPokemon.baseStats.atk}</em>
                      </span>
                      <span className="pokemon-stat-chip">
                        <strong>Def</strong>
                        <em>{quickPokemon.baseStats.def}</em>
                      </span>
                      <span className="pokemon-stat-chip">
                        <strong>SpA</strong>
                        <em>{quickPokemon.baseStats.spa}</em>
                      </span>
                      <span className="pokemon-stat-chip">
                        <strong>SpD</strong>
                        <em>{quickPokemon.baseStats.spd}</em>
                      </span>
                      <span className="pokemon-stat-chip">
                        <strong>Spe</strong>
                        <em>{quickPokemon.baseStats.spe}</em>
                      </span>
                    </div>
                  </div>

                  <div className="lead-section">
                    <span className="lead-section-label weak">Weak To</span>
                    <div className="coverage-chip-list">
                      {quickPokemonWeakTypes.length > 0 ? (
                        quickPokemonWeakTypes.map((type) => (
                          <span
                            key={`${quickPokemon.id}-quick-weak-${type}`}
                            className="mini-type-pill"
                            style={
                              {
                                "--type-color": TYPE_META[type].color,
                                "--type-accent": TYPE_META[type].accent,
                              } as CSSProperties
                            }
                          >
                            {TYPE_META[type].label}
                          </span>
                        ))
                      ) : (
                        <span className="subtle-empty">No listed weaknesses.</span>
                      )}
                    </div>
                  </div>

                  <div className="lead-section">
                    <span className="lead-section-label cover">Abilities</span>
                    <div className="quick-ability-list">
                      {quickPokemonAbilities.map((entry) => (
                        <article key={`${quickPokemon.id}-${entry.slot}-${entry.name}`} className="quick-ability-card">
                          <div className="quick-ability-header">
                            <strong>{entry.name}</strong>
                          </div>
                          <p>{entry.ability?.desc || entry.ability?.shortDesc || "No description found."}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </article>
              ) : (
                <div className="team-slot-empty">
                  {battleDataError || "Search a Pokemon to see stats, weaknesses, and ability details."}
                </div>
              )}
            </section>

            <section className="quick-search-card">
              <label className="quick-search-field" htmlFor="quick-move-search">
                <span className="quick-search-field-label">Move</span>
                <input
                  id="quick-move-search"
                  list="move-options"
                  className="team-pokemon-input quick-search-input"
                  placeholder={battleData ? "Search moves" : "Loading move data..."}
                  value={quickMoveQuery}
                  onChange={(event) => setQuickMoveQuery(event.target.value)}
                  disabled={!battleData}
                />
                <span className="quick-search-field-status">
                  {quickMove ? quickMove.name : "Search by move name"}
                </span>
              </label>

              {quickMove ? (
                <article className="quick-summary-card">
                  <div className="quick-summary-top">
                    <div>
                      <p className="eyebrow">Move</p>
                      <h3>{quickMove.name}</h3>
                    </div>
                    {(() => {
                      const moveType = getMovePokemonType(quickMove);

                      return moveType ? (
                        <span
                          className="inline-type-pill"
                          style={
                            {
                              "--type-color": TYPE_META[moveType].color,
                              "--type-accent": TYPE_META[moveType].accent,
                            } as CSSProperties
                          }
                        >
                          <img src={getTypeIconUrl(moveType)} alt="" aria-hidden="true" />
                          {TYPE_META[moveType].label}
                        </span>
                      ) : (
                        <span className="lead-available-count">Unknown Type</span>
                      );
                    })()}
                  </div>

                  <div className="quick-meta-row">
                    <span>{quickMove.category}</span>
                    <span>Power {isLowKickMove(quickMove.name) ? "Weight" : quickMove.basePower > 0 ? quickMove.basePower : "--"}</span>
                    <span>Acc {formatMoveAccuracy(quickMove.accuracy)}</span>
                    <span>PP {quickMove.pp}</span>
                    <span>Priority {quickMove.priority >= 0 ? `+${quickMove.priority}` : quickMove.priority}</span>
                    <span>{formatMoveTarget(quickMove.target)}</span>
                    {isSpreadTarget(quickMove.target) ? <span>Spread Penalty</span> : null}
                  </div>

                  <div className="lead-section">
                    <span className="lead-section-label cover">Effect</span>
                    <div className="quick-effect-copy">
                      <p>{quickMove.desc || quickMove.shortDesc || "No effect text found."}</p>
                    </div>
                  </div>

                  {quickMoveEstimate ? (
                    <div className="lead-section">
                      <span className="lead-section-label speed">Damage vs Current Matchup</span>
                      <div className="damage-result-card ready">
                        <div className="damage-result-topline">
                          <strong>{formatPercent(quickMoveEstimate.averagePercent)}%</strong>
                          <span>
                            {formatPercent(quickMoveEstimate.minPercent)}% -{" "}
                            {formatPercent(quickMoveEstimate.maxPercent)}%
                          </span>
                        </div>
                        <p>
                          {currentDamageAttackerPokemon?.name} into {currentDamageDefenderPokemon?.name}
                        </p>
                        <div className="damage-modifier-row">
                          <span>STAB {formatFlatMultiplier(quickMoveEstimate.stabMultiplier)}</span>
                          <span>Type {formatFlatMultiplier(quickMoveEstimate.typeMultiplier)}</span>
                          <span>Spread {formatFlatMultiplier(quickMoveEstimate.spreadMultiplier)}</span>
                          <span>Weather {formatFlatMultiplier(quickMoveEstimate.weatherMultiplier)}</span>
                          <span>Terrain {formatFlatMultiplier(quickMoveEstimate.terrainMultiplier)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="lead-section">
                      <span className="lead-section-label speed">Damage</span>
                      <div className="quick-effect-copy">
                        <p>
                          {quickMove.category === "Status" || getMoveRecordDamageBasePower(quickMove) === undefined
                            ? "Status move, so there is no damage roll to show."
                            : currentDamageAttackerPokemon && currentDamageDefenderPokemon
                              ? "This move could not be converted into a calculator type."
                              : "Pick a matchup in the damage calculator to preview this move’s rough damage."}
                        </p>
                      </div>
                    </div>
                  )}
                </article>
              ) : (
                <div className="team-slot-empty">
                  {battleDataError || "Search a move to see power, targeting, effects, and rough damage."}
                </div>
              )}
            </section>
          </div>
        </aside>
      </section>

      <section className="board-panel opponent-scout-panel">
        <div className="opponent-scout-header">
          <div>
            <p className="eyebrow">Opponent Scout</p>
            <h2>Enemy board</h2>
          </div>
          <div className="opponent-scout-actions">
            <span className="lead-available-count">{opponentEntries.length} / 6 loaded</span>
            <button
              type="button"
              className="secondary-button"
              onClick={importShowdownEnemyTeam}
              title={
                showdownEnemyImportCount > 0
                  ? `Import ${showdownEnemyImportCount} enemy Pokemon from the latest Showdown snapshot`
                  : "Ask the bridge extension for the enemy side from the open Showdown battle"
              }
            >
              {pendingShowdownEnemyImport
                ? "Waiting for Showdown"
                : showdownEnemyImportCount > 0
                  ? `Import Showdown Enemy (${showdownEnemyImportCount})`
                  : "Import Showdown Enemy"}
            </button>
            <label className="opponent-scan-mode">
              <span>Load Saved Team</span>
              <select
                value=""
                onChange={(event) => {
                  const selectedId = event.target.value;
                  if (!selectedId) {
                    return;
                  }
                  const savedTeam = savedTeams.find((team) => team.id === selectedId);
                  if (savedTeam) {
                    loadSavedTeamAsOpponent(savedTeam);
                  }
                  event.target.value = "";
                }}
                disabled={savedTeams.length === 0}
              >
                <option value="">
                  {savedTeams.length === 0 ? "No saved teams" : "Pick a saved team"}
                </option>
                {savedTeams.map((savedTeam) => (
                  <option key={savedTeam.id} value={savedTeam.id}>
                    {savedTeam.name}
                  </option>
                ))}
              </select>
            </label>
            {showTeamPreviewFeature ? (
              <button
                type="button"
                className="primary-button"
                onClick={runOpponentAnalysis}
                disabled={!canRunOpponentAnalysis}
              >
                {analyzedOpponentEntries.length > 0 ? "Recalculate Bring Picks" : "Calculate Bring Picks"}
              </button>
            ) : null}
            <button
              type="button"
              className="secondary-button"
              onClick={openSaveMatchDialog}
              disabled={opponentEntries.length === 0 || selectedPokemon.length === 0}
              aria-haspopup="dialog"
            >
              Save Enemy Team
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={clearOpponentTeam}
              disabled={opponentEntries.length === 0}
            >
              Clear Enemy Team
            </button>
          </div>
        </div>

        {saveMatchOpen && typeof document !== "undefined"
          ? createPortal(
              <div
                className="showdown-import-modal match-save-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="match-save-modal-title"
                onClick={(event) => {
                  if (event.target === event.currentTarget) {
                    setSaveMatchOpen(false);
                  }
                }}
              >
                <div className="showdown-import-modal__dialog match-save-modal__dialog" role="document">
                  <header className="showdown-import-modal__header">
                    <div className="showdown-import-modal__title">
                      <span className="eyebrow">Match Log</span>
                      <h3 id="match-save-modal-title">Save enemy team</h3>
                    </div>
                    <button
                      type="button"
                      className="showdown-import-modal__close"
                      onClick={() => setSaveMatchOpen(false)}
                      aria-label="Close save match dialog"
                      title="Close"
                    >
                      ×
                    </button>
                  </header>
                  <div className="showdown-import-modal__body match-save-modal__body">
                    <div className="match-save-result-toggle" aria-label="Match result">
                      <button
                        type="button"
                        className={matchResult === "won" ? "active" : ""}
                        onClick={() => setMatchResult("won")}
                      >
                        Won
                      </button>
                      <button
                        type="button"
                        className={matchResult === "lost" ? "active" : ""}
                        onClick={() => setMatchResult("lost")}
                      >
                        Lost
                      </button>
                    </div>

                    <MatchSaveSelector
                      title="Who I brought"
                      options={matchAllySlotOptions}
                      selectedSlotIndices={matchAllyBroughtSlotIndices}
                      maxSelections={4}
                      onChange={setMatchAllyBroughtSlotIndices}
                    />
                    <MatchSaveSelector
                      title="My leads"
                      options={matchAllySlotOptions}
                      selectedSlotIndices={matchAllyLeadSlotIndices}
                      maxSelections={2}
                      onChange={setMatchAllyLeadSlotIndices}
                    />
                    <MatchSaveSelector
                      title="Who enemy brought"
                      options={matchEnemySlotOptions}
                      selectedSlotIndices={matchEnemyBroughtSlotIndices}
                      maxSelections={4}
                      onChange={setMatchEnemyBroughtSlotIndices}
                    />
                    <MatchSaveSelector
                      title="Enemy leads"
                      options={matchEnemySlotOptions}
                      selectedSlotIndices={matchEnemyLeadSlotIndices}
                      maxSelections={2}
                      onChange={setMatchEnemyLeadSlotIndices}
                    />

                    {matchHistoryError ? <p className="storage-message error">{matchHistoryError}</p> : null}
                  </div>
                  <footer className="showdown-import-modal__footer">
                    <button type="button" className="secondary-button" onClick={() => setSaveMatchOpen(false)}>
                      Cancel
                    </button>
                    <div className="showdown-import-modal__footer-spacer" />
                    <button
                      type="button"
                      className="primary-button"
                      onClick={saveCurrentMatchHistory}
                      disabled={matchAllyBroughtSlotIndices.length === 0 || matchEnemyBroughtSlotIndices.length === 0}
                    >
                      Save Match
                    </button>
                  </footer>
                </div>
              </div>,
              document.body,
            )
          : null}

        <div className="opponent-search-grid">
          {opponentQueries.map((query, slotIndex) => (
            <label key={`opponent-slot-${slotIndex}`} className="opponent-search">
              <span>Enemy {slotIndex + 1}</span>
              <input
                list="pokemon-options"
                className="team-pokemon-input"
                placeholder={
                  database
                    ? teamBuilderFormat === "regulationMA"
                      ? `Search ${POKEMON_CHAMPIONS_ACTIVE_REGULATION} Pokemon`
                      : "Search Pokemon"
                    : "Loading local database..."
                }
                value={query}
                onChange={(event) => updateOpponentQuery(slotIndex, event.target.value)}
                disabled={!database}
              />
            </label>
          ))}
        </div>

        {showTeamPreviewFeature ? (
          <>
            <p className="selector-note team-elo-note" style={{ marginTop: "1rem" }}>
              Bring-four analysis only runs on demand.
              {analyzedOpponentEntries.length > 0
                ? opponentAnalysisIsStale
                  ? " Current inputs changed after the last run, so the results below are stale until you recalculate."
                  : " Results below match the current enemy board."
                : opponentEntries.length >= 4
                  ? " You have enough enemy slots loaded for a preview recommendation."
                  : opponentEntries.length > 0
                    ? " You can analyze partial scouting now, but the bring-four preview needs at least four loaded enemies."
                    : " Add at least one enemy slot to enable the calculation button."}
            </p>

            {scoutingOpponentEntries.length > 0 ? (
              <section className="team-elo-panel">
            <div className="scout-section-header">
              <p className="eyebrow">Bring Four Preview</p>
              <span>{bringSelection.bringSlotIndices.length} allies scored</span>
            </div>

            {selectedPokemon.length > 0 ? (
              <>
                {analyzedOpponentEntries.length === 0 ? (
                  <p className="selector-note team-elo-note" style={{ marginBottom: "1rem" }}>
                    Run the bring-four analysis when you want. The bring-four preview appears once at least four enemy
                    Pokemon are loaded.
                  </p>
                ) : teamPreviewRecommendation ? (
                  (() => {
                    const rec = teamPreviewRecommendation;
                    const previewPct = Math.min(100, Math.max(0, Math.round(rec.previewValue * 100)));
                    const maxReasonDelta = rec.reasons.reduce(
                      (max, reason) => Math.max(max, Math.abs(reason.delta)),
                      1,
                    );
                    const leadSet = new Set(rec.primaryLead);
                    const altLeadSet = new Set(rec.altLead ?? []);

                    return (
                      <article className="bring-preview">
                        <header className="bring-preview__head">
                          <div className="bring-preview__headline">
                            <span className="bring-preview__eyebrow">
                              Robust Preview · Recommendation
                            </span>
                            <h3 className="bring-preview__title">Bring Into Preview</h3>
                          </div>

                          <div
                            className="bring-preview__gauge"
                            style={{
                              background: `conic-gradient(var(--status-good) ${previewPct * 3.6}deg, rgba(226, 232, 255, 0.08) 0)`,
                            }}
                            role="img"
                            aria-label={`Robust preview value ${previewPct}%`}
                          >
                            <div className="bring-preview__gauge-inner">
                              <strong>{previewPct}%</strong>
                              <span>Robust</span>
                            </div>
                          </div>

                          <dl className="bring-preview__stats">
                            <div>
                              <dt>Maximin</dt>
                              <dd>{Math.round(rec.robustScore).toLocaleString()}</dd>
                            </div>
                            <div>
                              <dt>Average</dt>
                              <dd>{Math.round(rec.averageScore).toLocaleString()}</dd>
                            </div>
                          </dl>

                          <ul className="bring-preview__telemetry" aria-label="Solver diagnostics">
                            <li>
                              <em>{rec.candidateCounts.allyFourCandidates}</em>/15 ally fours
                            </li>
                            <li>
                              <em>{rec.candidateCounts.enemyFourCandidates}</em>/15 enemy fours
                            </li>
                            <li>
                              <em>{rec.candidateCounts.threatLines}</em> threat lines
                            </li>
                            <li>
                              <em>{rec.candidateCounts.matrixCells}</em> cells
                            </li>
                            <li>
                              <em>{Math.round(rec.diagnostics.elapsedMs)}</em>ms
                            </li>
                          </ul>
                        </header>

                        <section className="bring-preview__lineup" aria-label="Recommended four">
                          {rec.bestFour.map((slotIndex) => {
                            const member = previewBattleEngineAllyMemberBySlot.get(slotIndex);
                            if (!member) {
                              return null;
                            }
                            const isLead = leadSet.has(slotIndex);
                            const leadOrder = rec.primaryLead.indexOf(slotIndex);
                            const isAltLead = !isLead && altLeadSet.has(slotIndex);
                            const roleLabel = isLead
                              ? `Lead ${leadOrder + 1}`
                              : isAltLead
                                ? "Alt lead"
                                : "Back";
                            return (
                              <div
                                key={`preview-lineup-${slotIndex}`}
                                className={`bring-preview__slot${isLead ? " is-lead" : ""}${
                                  isAltLead ? " is-alt" : ""
                                }`}
                              >
                                <span className="bring-preview__slot-role">{roleLabel}</span>
                                <PokemonSprite
                                  pokemon={member.pokemon}
                                  className="bring-preview__slot-sprite"
                                />
                                <div className="bring-preview__slot-name">{member.pokemon.name}</div>
                              </div>
                            );
                          })}
                        </section>

                        <section className="bring-preview__data">
                          <article className="bring-preview__panel">
                            <header className="bring-preview__panel-head">
                              <h4>Why this four</h4>
                              <span>
                                Top {rec.reasons.length} contributor
                                {rec.reasons.length === 1 ? "" : "s"}
                              </span>
                            </header>
                            <ul className="bring-preview__reasons">
                              {rec.reasons.map((reason) => {
                                const pct = Math.max(
                                  6,
                                  Math.round((Math.abs(reason.delta) / maxReasonDelta) * 100),
                                );
                                const isNegative = reason.delta < 0;
                                return (
                                  <li
                                    key={`preview-reason-${reason.feature}`}
                                    className={isNegative ? "is-negative" : undefined}
                                  >
                                    <span className="bring-preview__reason-label">{reason.label}</span>
                                    <span className="bring-preview__reason-bar" aria-hidden="true">
                                      <span
                                        className="bring-preview__reason-bar-fill"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </span>
                                    <span className="bring-preview__reason-value">
                                      {formatSignedScore(reason.delta)}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </article>

                          {rec.dangerNotes.length > 0 ? (
                            <article className="bring-preview__panel bring-preview__panel--danger">
                              <header className="bring-preview__panel-head">
                                <h4>Watch-outs</h4>
                                <span>
                                  {rec.dangerNotes.length} flag
                                  {rec.dangerNotes.length === 1 ? "" : "s"}
                                </span>
                              </header>
                              <ul className="bring-preview__dangers">
                                {rec.dangerNotes.map((note) => (
                                  <li key={note}>
                                    <span className="bring-preview__danger-glyph" aria-hidden="true">
                                      !
                                    </span>
                                    <span>{note}</span>
                                  </li>
                                ))}
                              </ul>
                            </article>
                          ) : null}

                          {rec.alternatives.length > 0 ? (
                            <article className="bring-preview__panel bring-preview__panel--alts">
                              <header className="bring-preview__panel-head">
                                <h4>Alternatives</h4>
                                <span>
                                  {rec.alternatives.length} backup line
                                  {rec.alternatives.length === 1 ? "" : "s"}
                                </span>
                              </header>
                              <ul className="bring-preview__alts">
                                {rec.alternatives.map((alternative, index) => {
                                  const altPct = Math.min(
                                    100,
                                    Math.max(0, Math.round(alternative.previewValue * 100)),
                                  );
                                  const leadNames = alternative.lead
                                    .map(
                                      (si) =>
                                        previewBattleEngineAllyMemberBySlot.get(si)?.pokemon.name ??
                                        `#${si + 1}`,
                                    )
                                    .join(" + ");
                                  return (
                                    <li
                                      key={`preview-alt-${alternative.four.join("-")}-${alternative.lead.join("-")}`}
                                    >
                                      <span className="bring-preview__alt-rank">#{index + 2}</span>
                                      <div className="bring-preview__alt-sprites">
                                        {alternative.four.map((si) => {
                                          const m = previewBattleEngineAllyMemberBySlot.get(si);
                                          return m ? (
                                            <PokemonSprite
                                              key={`preview-alt-sprite-${index}-${si}`}
                                              pokemon={m.pokemon}
                                              className="bring-preview__alt-sprite"
                                            />
                                          ) : null;
                                        })}
                                      </div>
                                      <div className="bring-preview__alt-lead">
                                        <span>Lead</span>
                                        <strong>{leadNames}</strong>
                                      </div>
                                      <div className="bring-preview__alt-value">
                                        <span className="bring-preview__alt-bar" aria-hidden="true">
                                          <span
                                            className="bring-preview__alt-bar-fill"
                                            style={{ width: `${altPct}%` }}
                                          />
                                        </span>
                                        <strong>{altPct}%</strong>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </article>
                          ) : null}
                        </section>
                      </article>
                    );
                  })()
                ) : (
                  <p className="selector-note team-elo-note" style={{ marginBottom: "1rem" }}>
                    Load at least four allies and four enemies to run the bring-four preview solver.
                  </p>
                )}

                {bringSelection.bringCount > 0 ? (
                  <article className="bring-order-panel">
                    <div className="bring-order-panel__head">
                      <div className="bring-order-panel__copy">
                        <p className="eyebrow">Bring Order</p>
                        <h3>Pick your {bringSelection.bringCount}</h3>
                        <p className="selector-note team-elo-note">
                          Tap allies to assign Bring 1-4 like the in-game preview. Bring 1 and Bring 2 immediately seed
                          Slot A and Slot B on the 2v2 Threat Board, while the matchup Elo, OHKO scan, and ally threat
                          cards below only score the four you bring.
                        </p>
                      </div>

                      <div className="bring-order-panel__actions">
                        <span className="mini-type-pill neutral-pill">
                          {bringSelectionMode === "manual"
                            ? `${bringSelection.lockedBringSlotIndices.length}/${bringSelection.bringCount} locked`
                            : "Solver order live"}
                        </span>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={resetBringSelectionToSolver}
                          disabled={bringSelectionMode === "auto" && bringSelection.lockedBringSlotIndices.length === 0}
                        >
                          Use Solver Order
                        </button>
                      </div>
                    </div>

                    <div className="bring-order-panel__summary">
                      <div className="bring-order-tray">
                        <span className="bring-order-tray__label">Current bring order</span>
                        <div className="bring-order-tray__slots">
                          {Array.from({ length: bringSelection.bringCount }, (_, orderIndex) => {
                            const slotIndex = bringSelection.bringSlotIndices[orderIndex];
                            const pokemon =
                              slotIndex !== undefined && slotIndex !== null ? effectiveTeam[slotIndex]?.pokemon ?? null : null;
                            const isLocked =
                              slotIndex !== undefined && slotIndex !== null && lockedBringSlotSet.has(slotIndex);
                            const isAutoFilled =
                              slotIndex !== undefined && slotIndex !== null && autoFilledBringSlotSet.has(slotIndex);
                            const roleLabel =
                              orderIndex === 0 ? "Lead A" : orderIndex === 1 ? "Lead B" : `Back ${orderIndex - 1}`;

                            return (
                              <div
                                key={`bring-order-slot-${orderIndex}-${slotIndex ?? "empty"}`}
                                className={`bring-order-chip${isLocked ? " is-locked" : ""}${
                                  isAutoFilled ? " is-autofill" : ""
                                }`}
                              >
                                <span className="bring-order-chip__rank">{orderIndex + 1}</span>
                                <div className="bring-order-chip__body">
                                  <span className="bring-order-chip__role">{roleLabel}</span>
                                  {pokemon ? (
                                    <div className="bring-order-chip__pokemon">
                                      <PokemonSprite pokemon={pokemon} className="bring-order-chip__sprite" />
                                      <strong>{pokemon.name}</strong>
                                    </div>
                                  ) : (
                                    <span className="bring-order-chip__empty">Open</span>
                                  )}
                                </div>
                                <span className="bring-order-chip__source">
                                  {isLocked ? "Picked" : isAutoFilled ? "Solver fill" : "Solver"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="bring-order-tray is-bench">
                        <span className="bring-order-tray__label">
                          Left behind {bringSelection.benchCount > 0 ? `(${bringSelection.benchCount})` : ""}
                        </span>
                        <div className="bring-order-tray__chips">
                          {bringSelection.benchSlotIndices.length > 0 ? (
                            bringSelection.benchSlotIndices.map((slotIndex) => {
                              const pokemon = effectiveTeam[slotIndex]?.pokemon;
                              return pokemon ? (
                                <span key={`bench-chip-${slotIndex}`} className="bring-order-mini-chip is-bench">
                                  <PokemonSprite pokemon={pokemon} className="bring-order-mini-chip__sprite" />
                                  <span>{pokemon.name}</span>
                                </span>
                              ) : null;
                            })
                          ) : (
                            <span className="bring-order-empty">Everyone loaded is currently in the scored group.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bring-order-grid">
                      {filledTeamSlotIndices.map((slotIndex) => {
                        const originalPokemon = team[slotIndex]?.pokemon;
                        const pokemon = effectiveTeam[slotIndex]?.pokemon;
                        if (!pokemon) {
                          return null;
                        }
                        const isMegaAdjusted =
                          originalPokemon !== undefined &&
                          originalPokemon !== null &&
                          originalPokemon.id !== pokemon.id &&
                          isChampionsMegaEntry(originalPokemon);

                        const selectionRank = bringPickOrderBySlot.get(slotIndex);
                        const isLocked = selectionRank !== undefined;
                        const isAutoFilled = autoFilledBringSlotSet.has(slotIndex);
                        const nextBringRank = Math.min(
                          bringSelection.lockedBringSlotIndices.length + 1,
                          bringSelection.bringCount,
                        );
                        const helperLabel = isLocked
                          ? selectionRank <= 2
                            ? "Click to remove and free that lead slot."
                            : "Click to remove from the current bring order."
                          : bringSelection.lockedBringSlotIndices.length < bringSelection.bringCount
                            ? `Click to set Bring ${nextBringRank}.`
                            : "Four picks are locked. Remove a numbered pick to swap.";

                        return (
                          <button
                            key={`bring-order-${slotIndex}`}
                            type="button"
                            className={`bring-order-card${isLocked ? " is-selected" : ""}${
                              isAutoFilled ? " is-autofill" : ""
                            }`}
                            onClick={() => toggleBringSlot(slotIndex)}
                            aria-pressed={isLocked}
                            aria-label={`${pokemon.name}${isLocked ? ` selected as Bring ${selectionRank}` : ` available for Bring ${nextBringRank}`}`}
                          >
                            <span className="bring-order-card__slot">Slot {slotIndex + 1}</span>
                            {isLocked ? (
                              <span className="bring-order-card__badge">{selectionRank}</span>
                            ) : isAutoFilled ? (
                              <span className="bring-order-card__badge is-autofill">Auto</span>
                            ) : null}
                            <PokemonSprite pokemon={pokemon} className="bring-order-card__sprite" />
                            <strong>{pokemon.name}</strong>
                            <span className="bring-order-card__state">
                              {isMegaAdjusted
                                ? "Normal form"
                                : isLocked
                                  ? `Bring ${selectionRank}`
                                  : isAutoFilled
                                    ? "Solver fill"
                                    : "Available"}
                            </span>
                            <span className="bring-order-card__hint">{helperLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ) : null}

                <div className="damage-assumption-row">
                  <span className="damage-assumption-pill">{analyzedOpponentEntries.length} enemies scored</span>
                  <span className="damage-assumption-pill">
                    {teamMatchupEloCoversAll.length} cover all loaded enemies
                  </span>
                  <span className="damage-assumption-pill">
                    {teamMatchupEloGuaranteesAll.length} guarantee every matchup
                  </span>
                  <span className="damage-assumption-pill">
                    {teamMatchupEloLivesAll.length} live every best hit
                  </span>
                </div>

                <div
                  className={`scout-section-header collapsible-section-header${
                    perSlotMatchupEloOpen ? " is-open" : ""
                  }`}
                  style={{ marginTop: "1.5rem" }}
                >
                  <div className="collapsible-section-title">
                    <p className="eyebrow">Per-Slot Matchup Elo</p>
                    <span>{teamMatchupEloRows.length} bring slots ranked</span>
                  </div>
                  <button
                    type="button"
                    className="collapsible-section-toggle"
                    onClick={() => setPerSlotMatchupEloOpen((prev) => !prev)}
                    aria-expanded={perSlotMatchupEloOpen}
                  >
                    <span>{perSlotMatchupEloOpen ? "Hide" : "Show"}</span>
                    <span className="collapsible-section-toggle-chevron" aria-hidden="true">
                      {perSlotMatchupEloOpen ? "−" : "+"}
                    </span>
                  </button>
                </div>

                {perSlotMatchupEloOpen ? (
                  <>
                    <p className="selector-note team-elo-note">
                      Reuses the OHKO Scanner matchup Elo across the full enemy six while only scoring the selected
                      bring four on our side: OHKO coverage first, then guaranteed KOs, survival into the enemy&apos;s
                      best loaded hit, speed control, and worst-case pressure under the current damage assumptions.
                    </p>

                    <div className="ohko-result-list">
                  {teamMatchupEloRows.map((row, rankIndex) => (
                    <article
                      key={`team-elo-${row.slotIndex}`}
                      className={`opponent-coverage-row ohko-result-row ${
                        rankIndex === 0 || row.guaranteedCount === analyzedOpponentEntries.length ? "strong" : ""
                      }`}
                    >
                      <div className="ohko-result-top">
                        <div className="opponent-coverage-main">
                          <PokemonSprite pokemon={row.pokemon} />
                          <div>
                            <strong>{row.pokemon.name}</strong>
                            <p>
                              Rank #{rankIndex + 1} • Covers {row.coverageCount} / {analyzedOpponentEntries.length} matchup
                              {analyzedOpponentEntries.length === 1 ? "" : "s"} • {row.guaranteedCount} guaranteed •{" "}
                              {row.surviveCount} clean survives
                            </p>
                          </div>
                        </div>

                        <div className="ohko-summary-side">
                          <span className="mini-type-pill neutral-pill">Slot {row.slotIndex + 1}</span>
                          <span className="mini-type-pill neutral-pill">
                            Faster into {row.fasterCount} / {analyzedOpponentEntries.length}
                          </span>
                          <span className="mini-type-pill neutral-pill">
                            Worst-case Elo {Math.round(row.minTargetScore)}
                          </span>
                          <span className="mini-type-pill neutral-pill">
                            Avg Elo {Math.round(row.averageTargetScore)}
                          </span>
                        </div>
                      </div>

                      <div className="ohko-breakdown-grid">
                        {row.targetResults.map((result) => (
                          <article
                            key={`${row.slotIndex}-vs-${result.targetSlotIndex ?? result.targetPokemon.id}`}
                            className={`ohko-breakdown-card ${
                              result.guaranteedOhko ? "strong" : result.possibleOhko ? "good" : ""
                            }`}
                          >
                            <div className="ohko-breakdown-top">
                              <div className="opponent-coverage-main">
                                <PokemonSprite pokemon={result.targetPokemon} />
                                <div>
                                  <strong>{result.targetPokemon.name}</strong>
                                  <p>
                                    {result.bestOutgoingHit
                                      ? `${getAttackLabel(result.bestOutgoingHit.attack)} • ${
                                          result.guaranteedOhko
                                            ? "Guaranteed OHKO"
                                            : result.possibleOhko
                                              ? "Possible OHKO"
                                              : "Best pressure"
                                        }`
                                      : "No damaging move found"}
                                  </p>
                                </div>
                              </div>

                              <span
                                className={`speed-matchup-pill ${
                                  result.speedDelta > 0 ? "faster" : result.speedDelta < 0 ? "slower" : "tie"
                                }`}
                              >
                                {result.speedDelta > 0
                                  ? `Outspeeds by ${result.speedDelta}`
                                  : result.speedDelta < 0
                                    ? `Slower by ${Math.abs(result.speedDelta)}`
                                    : "Speed tie"}
                              </span>
                            </div>

                            <div className="coverage-chip-list">
                              {result.bestOutgoingHit ? (
                                <>
                                  <span
                                    className="mini-type-pill"
                                    style={
                                      {
                                        "--type-color": TYPE_META[result.bestOutgoingHit.estimate.effectiveAttackType]
                                          .color,
                                        "--type-accent":
                                          TYPE_META[result.bestOutgoingHit.estimate.effectiveAttackType].accent,
                                      } as CSSProperties
                                    }
                                  >
                                    {TYPE_META[result.bestOutgoingHit.estimate.effectiveAttackType].label}
                                  </span>
                                  <span className="mini-type-pill neutral-pill">
                                    {formatPercent(result.bestOutgoingHit.estimate.minPercent)}% -{" "}
                                    {formatPercent(result.bestOutgoingHit.estimate.maxPercent)}%
                                  </span>
                                  <span className="mini-type-pill neutral-pill">
                                    Elo {Math.round(result.targetScore)}
                                  </span>
                                </>
                              ) : (
                                <span className="mini-type-pill neutral-pill">No pressure</span>
                              )}

                              <span
                                className={`mini-type-pill neutral-pill ${
                                  result.survivesBestIncomingHit === true
                                    ? "survival-pill good"
                                    : result.survivesBestIncomingHit === false
                                      ? "survival-pill bad"
                                      : ""
                                }`}
                              >
                                {result.survivesBestIncomingHit === true
                                  ? "Lives best hit"
                                  : result.survivesBestIncomingHit === false
                                    ? "Loses to best hit"
                                    : "No enemy moves"}
                              </span>
                            </div>

                            {result.bestIncomingHit ? (
                              <p className="ohko-result-subnote">
                                Incoming {getAttackLabel(result.bestIncomingHit.attack)}:{" "}
                                {formatPercent(result.bestIncomingHit.estimate.minPercent)}% -{" "}
                                {formatPercent(result.bestIncomingHit.estimate.maxPercent)}%
                              </p>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </article>
                  ))}
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <div className="team-slot-empty">
                Add Pokemon to your team to rank your selected bring four into the full enemy six.
              </div>
            )}
              </section>
            ) : null}
          </>
        ) : null}

        {showTeamPreviewFeature ? (
          <section className="team-preview-detail-panel">
            <div
              className={`scout-section-header collapsible-section-header team-detail-views-header${
                teamDetailViewsOpen ? " is-open" : ""
              }`}
            >
              <div className="collapsible-section-title">
                <p className="eyebrow">Team Preview 6v6</p>
                <span>
                  {teamPreviewDetailPokemon.length} allies · {scoutingOpponentEntries.length} enemies
                </span>
              </div>
              <button
                type="button"
                className="collapsible-section-toggle"
                onClick={() => setTeamDetailViewsOpen((prev) => !prev)}
                aria-expanded={teamDetailViewsOpen}
              >
                <span>{teamDetailViewsOpen ? "Hide Teams" : "Show Teams"}</span>
                <span className="collapsible-section-toggle-chevron" aria-hidden="true">
                  {teamDetailViewsOpen ? "−" : "+"}
                </span>
              </button>
            </div>

            {teamDetailViewsOpen ? (
              <>
                <div className="scout-section-header">
                  <p className="eyebrow">Enemy Team</p>
                  <span>{scoutingOpponentEntries.length} cards</span>
                </div>
                {scoutingOpponentEntries.length === 0 ? (
                  <div className="matchup-empty-board">
                    Add up to six opposing Pokemon to see full-team stats and super-effective answers.
                  </div>
                ) : (
                  <div className="enemy-grid">
              {scoutingOpponentEntries.map((opponentEntry) => {
                const opponentCoverage = opponentCoverageMap.get(opponentEntry.slotIndex) ?? [];
                const ohkoEntries = opponentOhkoMap.get(opponentEntry.slotIndex) ?? [];
                const seEntries = opponentCoverage.filter((entry) => (entry.multiplier ?? 0) > 1);
                const fallbackEntries = opponentCoverage.filter((entry) => (entry.multiplier ?? 0) <= 1).slice(0, 3);
                const guaranteedOhkos = ohkoEntries.filter((entry) => entry.guaranteed);
                const possibleOhkos = ohkoEntries.filter((entry) => !entry.guaranteed);
                const weakTypes = TYPE_ORDER.filter(
                  (attackType) => (getPokemonDefensiveMultiplier(opponentEntry.pokemon, attackType) ?? 1) > 1,
                );
                const resistTypes = TYPE_ORDER.filter((attackType) => {
                  const multiplier = getPokemonDefensiveMultiplier(opponentEntry.pokemon, attackType);
                  return multiplier !== null && multiplier < 1;
                });

                return (
                  <article key={`enemy-card-${opponentEntry.slotIndex}`} className="enemy-card">
                    <div className="enemy-card-header">
                      <div className="opponent-card-top">
                        <div>
                          <p className="eyebrow">Enemy {opponentEntry.slotIndex + 1}</p>
                          <h3>{opponentEntry.pokemon.name}</h3>
                        </div>
                        <PokemonSprite pokemon={opponentEntry.pokemon} className="opponent-card-sprite" />
                      </div>
                      <span className="enemy-threat-count">{seEntries.length} SE answers</span>
                    </div>

                    <div className="team-type-list">
                      {opponentEntry.pokemon.types.map((typeLabel) => {
                        const type = getTypeFromLabel(typeLabel);
                        if (!type) {
                          return null;
                        }

                        return (
                          <span
                            key={`${opponentEntry.pokemon.id}-${type}`}
                            className="inline-type-pill"
                            style={
                              {
                                "--type-color": TYPE_META[type].color,
                                "--type-accent": TYPE_META[type].accent,
                              } as CSSProperties
                            }
                          >
                            <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
                            {TYPE_META[type].label}
                          </span>
                        );
                      })}
                    </div>

                    <div className="enemy-coverage-block">
                      <div className="coverage-preview-header">
                        <p className="eyebrow">
                          {opponentEntry.movesetSource === "custom" ? "Custom Set" : "Imported Set"}
                        </p>
                        <span>
                          {opponentEntry.savedAttacks.length > 0
                            ? `${opponentEntry.savedAttacks.length} loaded`
                            : opponentEntry.presetMoveNames.length > 0
                            ? `${opponentEntry.presetMoveNames.length} loaded`
                            : "No preset"}
                        </span>
                      </div>

                      {opponentEntry.abilityName || opponentEntry.itemName ? (
                        <div className="quick-meta-row">
                          {opponentEntry.abilityName ? <span>Ability {opponentEntry.abilityName}</span> : null}
                          {opponentEntry.itemName ? <span>Item {opponentEntry.itemName}</span> : null}
                        </div>
                      ) : null}

                      <div className="coverage-chip-list">
                        {opponentEntry.movesetSource === "custom" && opponentEntry.savedAttacks.length > 0 ? (
                          opponentEntry.savedAttacks.map((attack) => (
                            <span
                              key={`${opponentEntry.pokemon.id}-preset-${attack.id}`}
                              className="mini-type-pill"
                              style={
                                {
                                  "--type-color": TYPE_META[attack.type].color,
                                  "--type-accent": TYPE_META[attack.type].accent,
                                } as CSSProperties
                              }
                            >
                              {getAttackLabel(attack)}
                            </span>
                          ))
                        ) : opponentEntry.presetMoveNames.length > 0 ? (
                          opponentEntry.presetMoveNames.map((moveName) => (
                            <span
                              key={`${opponentEntry.pokemon.id}-preset-name-${moveName}`}
                              className="mini-type-pill neutral-pill"
                            >
                              {moveName}
                            </span>
                          ))
                        ) : (
                          <span className="subtle-empty">No built-in move preset yet.</span>
                        )}
                      </div>
                    </div>

                    <div className="enemy-weakness-block">
                      <span className="lead-section-label weak">Weak To</span>
                      <div className="coverage-chip-list">
                        {weakTypes.length > 0 ? (
                          weakTypes.map((type) => (
                            <span
                              key={`${opponentEntry.pokemon.id}-weak-${type}`}
                              className="mini-type-pill"
                              style={
                                {
                                  "--type-color": TYPE_META[type].color,
                                  "--type-accent": TYPE_META[type].accent,
                                } as CSSProperties
                              }
                            >
                              {TYPE_META[type].label}
                            </span>
                          ))
                        ) : (
                          <span className="subtle-empty">No listed weaknesses.</span>
                        )}
                      </div>
                    </div>

                    <div className="enemy-weakness-block">
                      <span className="lead-section-label resist">Resists</span>
                      <div className="coverage-chip-list">
                        {resistTypes.length > 0 ? (
                          resistTypes.map((type) => (
                            <span
                              key={`${opponentEntry.pokemon.id}-resist-${type}`}
                              className="mini-type-pill"
                              style={
                                {
                                  "--type-color": TYPE_META[type].color,
                                  "--type-accent": TYPE_META[type].accent,
                                } as CSSProperties
                              }
                            >
                              {TYPE_META[type].label}
                            </span>
                          ))
                        ) : (
                          <span className="subtle-empty">No listed resistances.</span>
                        )}
                      </div>
                    </div>

                    <div className="pokemon-stats-panel opponent-stats-panel">
                      <div className="pokemon-stats-grid compact">
                        <span className="pokemon-stat-chip">
                          <strong>HP</strong>
                          <em>{opponentEntry.pokemon.baseStats.hp}</em>
                        </span>
                        <span className="pokemon-stat-chip">
                          <strong>Atk</strong>
                          <em>{opponentEntry.pokemon.baseStats.atk}</em>
                        </span>
                        <span className="pokemon-stat-chip">
                          <strong>Def</strong>
                          <em>{opponentEntry.pokemon.baseStats.def}</em>
                        </span>
                        <span className="pokemon-stat-chip">
                          <strong>SpA</strong>
                          <em>{opponentEntry.pokemon.baseStats.spa}</em>
                        </span>
                        <span className="pokemon-stat-chip">
                          <strong>SpD</strong>
                          <em>{opponentEntry.pokemon.baseStats.spd}</em>
                        </span>
                        <span className="pokemon-stat-chip">
                          <strong>Spe</strong>
                          <em>{opponentEntry.pokemon.baseStats.spe}</em>
                        </span>
                      </div>
                    </div>

                    <div className="enemy-coverage-block">
                      <div className="coverage-preview-header">
                        <p className="eyebrow">{seEntries.length > 0 ? "SE Hitters" : "Best Available Hits"}</p>
                        <span>
                          {seEntries.length > 0 ? `${seEntries.length} team members` : `${fallbackEntries.length} shown`}
                        </span>
                      </div>

                      <div className="opponent-coverage-list compact">
                        {(seEntries.length > 0 ? seEntries : fallbackEntries).map((entry) => (
                          <div
                            key={`opponent-${opponentEntry.slotIndex}-coverage-${entry.slotIndex}`}
                            className={`opponent-coverage-row ${(entry.multiplier ?? 0) > 1 ? "strong" : ""}`}
                          >
                            <div className="opponent-coverage-main">
                              <PokemonSprite pokemon={entry.pokemon} />
                              <div>
                                <strong>{entry.pokemon.name}</strong>
                                <p>
                                  {(entry.multiplier ?? 0) > 1
                                    ? `${formatMultiplier(entry.multiplier ?? 1)} damage`
                                    : entry.attacks.length > 0
                                      ? `${formatMultiplier(entry.multiplier ?? 1)} best hit`
                                      : "No saved attacks"}
                                </p>
                              </div>
                            </div>

                            <div className="opponent-coverage-side">
                              <span
                                className={`speed-matchup-pill ${
                                  entry.speedDelta > 0 ? "faster" : entry.speedDelta < 0 ? "slower" : "tie"
                                }`}
                              >
                                {entry.speedDelta > 0
                                  ? `Outspeeds by ${entry.speedDelta}`
                                  : entry.speedDelta < 0
                                    ? `Slower by ${Math.abs(entry.speedDelta)}`
                                    : "Speed tie"}
                              </span>

                              <div className="coverage-chip-list">
                                {entry.attacks.length > 0 ? (
                                  entry.attacks.map((attack) => (
                                    <span
                                      key={`${entry.pokemon.id}-vs-${opponentEntry.pokemon.id}-${attack.id}`}
                                      className="mini-type-pill"
                                      style={
                                        {
                                          "--type-color": TYPE_META[attack.type].color,
                                          "--type-accent": TYPE_META[attack.type].accent,
                                        } as CSSProperties
                                      }
                                    >
                                      {getAttackLabel(attack)}
                                    </span>
                                  ))
                                ) : (
                                  <span className="subtle-empty">No saved attacks.</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}

                        {seEntries.length === 0 && fallbackEntries.length === 0 ? (
                          <div className="team-slot-empty">Add saved attacks to your team to compare coverage.</div>
                        ) : null}
                      </div>
                    </div>

                    <div className="enemy-coverage-block">
                      <div className="coverage-preview-header">
                        <p className="eyebrow">OHKO Scan</p>
                        <span>
                          {guaranteedOhkos.length > 0
                            ? `${guaranteedOhkos.length} guaranteed`
                            : possibleOhkos.length > 0
                              ? `${possibleOhkos.length} rolls`
                              : "None found"}
                        </span>
                      </div>

                      <div className="opponent-coverage-list compact">
                        {(guaranteedOhkos.length > 0 ? guaranteedOhkos : possibleOhkos).map((entry) => (
                          <div
                            key={`ohko-${opponentEntry.slotIndex}-${entry.slotIndex}-${entry.attack.id}`}
                            className={`opponent-coverage-row ${entry.guaranteed ? "strong" : ""}`}
                          >
                            <div className="opponent-coverage-main">
                              <PokemonSprite pokemon={entry.pokemon} />
                              <div>
                                <strong>{entry.pokemon.name}</strong>
                                <p>
                                  {getAttackLabel(entry.attack)} •{" "}
                                  {entry.guaranteed ? "Guaranteed OHKO" : "Possible OHKO"}
                                </p>
                              </div>
                            </div>

                            <div className="opponent-coverage-side">
                              <span
                                className={`speed-matchup-pill ${
                                  entry.speedDelta > 0 ? "faster" : entry.speedDelta < 0 ? "slower" : "tie"
                                }`}
                              >
                                {entry.speedDelta > 0
                                  ? `Outspeeds by ${entry.speedDelta}`
                                  : entry.speedDelta < 0
                                    ? `Slower by ${Math.abs(entry.speedDelta)}`
                                    : "Speed tie"}
                              </span>

                              <div className="coverage-chip-list">
                                <span
                                  className="mini-type-pill"
                                  style={
                                    {
                                      "--type-color": TYPE_META[entry.attack.type].color,
                                      "--type-accent": TYPE_META[entry.attack.type].accent,
                                    } as CSSProperties
                                  }
                                >
                                  {TYPE_META[entry.attack.type].label}
                                </span>
                                <span className="mini-type-pill neutral-pill">
                                  {formatPercent(entry.estimate.minPercent)}% - {formatPercent(entry.estimate.maxPercent)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}

                        {guaranteedOhkos.length === 0 && possibleOhkos.length === 0 ? (
                          <div className="team-slot-empty">
                            No saved attacks are currently reaching OHKO range under the active weather, terrain, and
                            stat-stage assumptions.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
                  </div>
                )}

            <div className="scout-section-header allied">
              <p className="eyebrow">Your Team</p>
              <span>{teamPreviewDetailPokemon.length} cards</span>
            </div>
            {teamPreviewDetailPokemon.length === 0 ? (
              <div className="matchup-empty-board">
                Add Pokemon to your team to see enemy STAB pressure into your full team.
              </div>
            ) : (
              <div className="enemy-grid allied-grid">
                {teamPreviewDetailTeam.map(({ pokemon, slotIndex }) => {
                  const threats = enemyThreatMap.get(slotIndex) ?? [];
                  const seThreats = threats.filter((entry) => (entry.multiplier ?? 0) > 1);
                  const fallbackThreats = threats.filter((entry) => (entry.multiplier ?? 0) <= 1).slice(0, 3);
                  const weakTypes = TYPE_ORDER.filter(
                    (attackType) => (getPokemonDefensiveMultiplier(pokemon, attackType) ?? 1) > 1,
                  );
                  const resistTypes = TYPE_ORDER.filter((attackType) => {
                    const multiplier = getPokemonDefensiveMultiplier(pokemon, attackType);
                    return multiplier !== null && multiplier < 1;
                  });

                  return (
                    <article key={`ally-threat-${slotIndex}`} className="enemy-card allied-card">
                      <div className="enemy-card-header">
                        <div className="opponent-card-top">
                          <div>
                            <p className="eyebrow">Our Slot {slotIndex + 1}</p>
                            <h3>{pokemon.name}</h3>
                          </div>
                          <PokemonSprite pokemon={pokemon} className="opponent-card-sprite" />
                        </div>
                        <span className="enemy-threat-count">
                          {seThreats.length > 0 ? `${seThreats.length} enemy threats` : "No SE STAB"}
                        </span>
                      </div>

                      <div className="team-type-list">
                        {pokemon.types.map((typeLabel) => {
                          const type = getTypeFromLabel(typeLabel);
                          if (!type) {
                            return null;
                          }

                          return (
                            <span
                              key={`${pokemon.id}-${type}`}
                              className="inline-type-pill"
                              style={
                                {
                                  "--type-color": TYPE_META[type].color,
                                  "--type-accent": TYPE_META[type].accent,
                                } as CSSProperties
                              }
                            >
                              <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
                              {TYPE_META[type].label}
                            </span>
                          );
                        })}
                      </div>

                      <div className="quick-meta-row ally-meta-row">
                        <span>Spe {pokemon.baseStats.spe}</span>
                        <span>BST {pokemon.bst}</span>
                      </div>

                      <div className="enemy-weakness-block">
                        <span className="lead-section-label weak">Weak To</span>
                        <div className="coverage-chip-list">
                          {weakTypes.length > 0 ? (
                            weakTypes.map((type) => (
                              <span
                                key={`${pokemon.id}-ally-weak-${type}`}
                                className="mini-type-pill"
                                style={
                                  {
                                    "--type-color": TYPE_META[type].color,
                                    "--type-accent": TYPE_META[type].accent,
                                  } as CSSProperties
                                }
                              >
                                {TYPE_META[type].label}
                              </span>
                            ))
                          ) : (
                            <span className="subtle-empty">No listed weaknesses.</span>
                          )}
                        </div>
                      </div>

                      <div className="enemy-weakness-block">
                        <span className="lead-section-label resist">Resists</span>
                        <div className="coverage-chip-list">
                          {resistTypes.length > 0 ? (
                            resistTypes.map((type) => (
                              <span
                                key={`${pokemon.id}-ally-resist-${type}`}
                                className="mini-type-pill"
                                style={
                                  {
                                    "--type-color": TYPE_META[type].color,
                                    "--type-accent": TYPE_META[type].accent,
                                  } as CSSProperties
                                }
                              >
                                {TYPE_META[type].label}
                              </span>
                            ))
                          ) : (
                            <span className="subtle-empty">No listed resistances.</span>
                          )}
                        </div>
                      </div>

                      <div className="enemy-coverage-block">
                        <div className="coverage-preview-header">
                          <p className="eyebrow">{seThreats.length > 0 ? "Enemy STAB Threats" : "Best Enemy Pressure"}</p>
                          <span>
                            {seThreats.length > 0 ? `${seThreats.length} enemy Pokemon` : `${fallbackThreats.length} shown`}
                          </span>
                        </div>

                        <div className="opponent-coverage-list compact">
                          {(seThreats.length > 0 ? seThreats : fallbackThreats).map((entry) => (
                            <div
                              key={`ally-${slotIndex}-threat-${entry.slotIndex}`}
                              className={`opponent-coverage-row ${(entry.multiplier ?? 0) > 1 ? "strong" : ""}`}
                            >
                              <div className="opponent-coverage-main">
                                <PokemonSprite pokemon={entry.pokemon} />
                                <div>
                                  <strong>{entry.pokemon.name}</strong>
                                  <p>
                                    {(entry.multiplier ?? 0) > 1
                                      ? `${formatMultiplier(entry.multiplier ?? 1)} into ${pokemon.name}`
                                      : entry.movesetSource === "custom"
                                        ? `${formatMultiplier(entry.multiplier ?? 1)} best custom move`
                                        : entry.movesetSource === "preset"
                                          ? `${formatMultiplier(entry.multiplier ?? 1)} best preset move`
                                        : `${formatMultiplier(entry.multiplier ?? 1)} best STAB pressure`}
                                  </p>
                                </div>
                              </div>

                              <div className="opponent-coverage-side">
                                <span
                                  className={`speed-matchup-pill ${
                                    entry.speedDelta > 0 ? "faster" : entry.speedDelta < 0 ? "slower" : "tie"
                                  }`}
                                >
                                  {entry.speedDelta > 0
                                    ? `Outspeeds by ${entry.speedDelta}`
                                    : entry.speedDelta < 0
                                      ? `Slower by ${Math.abs(entry.speedDelta)}`
                                      : "Speed tie"}
                                </span>

                                <div className="coverage-chip-list">
                                  {entry.attacks.length > 0 ? (
                                    entry.attacks.map((attack) => (
                                      <span
                                        key={`${entry.pokemon.id}-threatens-${pokemon.id}-${attack.id}`}
                                        className="mini-type-pill"
                                        style={
                                          {
                                            "--type-color": TYPE_META[attack.type].color,
                                            "--type-accent": TYPE_META[attack.type].accent,
                                          } as CSSProperties
                                        }
                                      >
                                        {getAttackLabel(attack)}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="subtle-empty">No pressure found.</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}

                          {seThreats.length === 0 && fallbackThreats.length === 0 ? (
                            <div className="team-slot-empty">Add enemies to compare their pressure.</div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
              </>
            ) : null}
          </section>
        ) : null}
      </section>

      {showBattleIntelFeature ? (
        <BattleIntelPage
          embedded
          allyName={teamName.trim() || "Current team"}
          enemyName="Enemy board"
          allySlots={battleIntelAllySlots}
          enemySlots={battleIntelEnemySlots}
          moveByKey={moveByKey}
          initialWeather={damageWeather}
          initialTerrain={damageTerrain}
        />
      ) : null}

      <section className="board-panel damage-calculator-panel">
        <div className="board-header">
          <div>
            <p className="eyebrow">Damage Calculator</p>
            <h2>Pick one ally and one enemy</h2>
          </div>
        </div>

        <div className="damage-roster-bar">
          <div className="damage-roster-side">
            <div className="damage-roster-header">
              <p className="eyebrow">My 6</p>
              <span>{selectedPokemon.length} ready</span>
            </div>
            <div className="damage-roster-strip">
              {team.map((slot, slotIndex) => (
                <DamageRosterTile
                  key={`damage-attacker-${slotIndex}`}
                  label={`Slot ${slotIndex + 1}`}
                  isSelected={damageAttackerSlotIndex === slotIndex}
                  isDisabled={!slot.pokemon}
                  pokemon={slot.pokemon}
                  footer={
                    slot.pokemon
                      ? `${slot.savedAttacks.length} ${slot.savedAttacks.length === 1 ? "move" : "moves"}`
                      : loadError
                        ? "Error"
                        : "Empty"
                  }
                  side="ally"
                  onClick={() => setDamageAttackerSlotIndex(slotIndex)}
                />
              ))}
            </div>
          </div>

          <div className="damage-roster-vs" aria-hidden="true">
            vs
          </div>

          <div className="damage-roster-side enemy">
            <div className="damage-roster-header">
              <p className="eyebrow">Enemy 6</p>
              <span>{scoutingOpponentEntries.length} ready</span>
            </div>
            <div className="damage-roster-strip">
              {opponentRoster.map((entry) => (
                <DamageRosterTile
                  key={`damage-defender-${entry.slotIndex}`}
                  label={`Enemy ${entry.slotIndex + 1}`}
                  isSelected={damageDefenderSlotIndex === entry.slotIndex}
                  isDisabled={!entry.pokemon}
                  pokemon={entry.pokemon}
                  footer={
                    entry.pokemon
                      ? entry.movesetSource === "custom" && entry.savedAttacks.length > 0
                        ? `${entry.savedAttacks.length} custom`
                        : entry.movesetSource === "preset" && entry.presetMoveNames.length > 0
                          ? `${entry.presetMoveNames.length} preset`
                          : "Lv. 50"
                      : "Empty"
                  }
                  side="enemy"
                  onClick={() => setDamageDefenderSlotIndex(entry.slotIndex)}
                />
              ))}
            </div>
          </div>
        </div>

        <SingleDamageCalculatorPanel
          attackerSlotIndex={damageAttackerSlotIndex}
          attackerSlot={selectedDamageAttacker}
          defenderSlotIndex={damageDefenderSlotIndex}
          defenderEntry={selectedDamageDefender}
          basePokemonBySpeciesKey={basePokemonBySpeciesKey}
          megaFormsByBaseSpeciesKey={megaFormsByBaseSpeciesKey}
          onAttackerBattleFormChange={changeTeamSlotBattleForm}
          onDefenderBattleFormChange={changeOpponentSlotBattleForm}
          onEditEnemyStatSpread={setEditingEnemyStatSpreadSlotIndex}
          enemyStatSpreadOverrides={enemyStatSpreadOverrides}
          damageCalcMode={damageCalcMode}
          setDamageCalcMode={setDamageCalcMode}
          damageWeather={damageWeather}
          setDamageWeather={setDamageWeather}
          damageTerrain={damageTerrain}
          setDamageTerrain={setDamageTerrain}
          damageAttackerGrounded={damageAttackerGrounded}
          setDamageAttackerGrounded={setDamageAttackerGrounded}
          damageDefenderGrounded={damageDefenderGrounded}
          setDamageDefenderGrounded={setDamageDefenderGrounded}
          damageAttackStage={damageAttackStage}
          setDamageAttackStage={setDamageAttackStage}
          damageDefenseStage={damageDefenseStage}
          setDamageDefenseStage={setDamageDefenseStage}
          damageAttackerAbility={damageAttackerAbility}
          setDamageAttackerAbility={setDamageAttackerAbility}
          damageDefenderAbility={damageDefenderAbility}
          setDamageDefenderAbility={setDamageDefenderAbility}
          damageAttackerItem={damageAttackerItem}
          setDamageAttackerItem={setDamageAttackerItem}
          damageDefenderItem={damageDefenderItem}
          setDamageDefenderItem={setDamageDefenderItem}
          damageHelpingHand={damageHelpingHand}
          setDamageHelpingHand={setDamageHelpingHand}
          damageReflect={damageReflect}
          setDamageReflect={setDamageReflect}
          damageLightScreen={damageLightScreen}
          setDamageLightScreen={setDamageLightScreen}
          damageAuroraVeil={damageAuroraVeil}
          setDamageAuroraVeil={setDamageAuroraVeil}
          damageMoveConfigs={damageMoveConfigs}
          setDamageMoveConfigs={setDamageMoveConfigs}
          defenseMoveConfigs={defenseMoveConfigs}
          setDefenseMoveConfigs={setDefenseMoveConfigs}
          moveByKey={moveByKey}
        />

        <section className="damage-doubles-panel">
          <div className="board-header">
            <div>
              <p className="eyebrow">2v2 Threat Board</p>
              <h2>See the biggest hit on each slot</h2>
            </div>
            <div className="damage-assumption-row">
              <span className="damage-assumption-pill">Uses current weather / terrain / stage settings</span>
              <span className="damage-assumption-pill">Shows each attacker’s best single hit</span>
              <span className="damage-assumption-pill">Turn order uses Speed plus Tailwind / Trick Room</span>
            </div>
          </div>

          <div className="damage-doubles-lineup-grid">
            <article className="damage-doubles-lineup ally">
              <div className="damage-doubles-lineup-topbar">
                <div className="damage-doubles-lineup-copy">
                  <p className="eyebrow">My Side</p>
                  <p className="selector-note">
                    Bring 1 and Bring 2 from the current bring order seed Slot A and Slot B automatically. Tap two
                    allies to override.
                  </p>
                </div>
                <div className="damage-doubles-lineup-actions">
                  <div className="selected-slots" aria-label="Selected allies">
                    {(["A", "B"] as const).map((rankLabel, rankIndex) => {
                      const slotIndex = doublesAllySelection[rankIndex];
                      const display = getThreatBoardAllyDisplay(slotIndex);
                      const pokemon = display?.pokemon ?? null;
                      return (
                        <div
                          key={`doubles-ally-selected-${rankLabel}`}
                          className={`selected-slot doubles-lineup-selected ${pokemon ? "filled" : ""} ${
                            display && display.formOptions.length > 1 ? "has-form-toggle" : ""
                          }`}
                        >
                          <div className="doubles-lineup-selected-main">
                            <span className="doubles-lineup-selected-rank">{rankLabel}</span>
                            {pokemon ? (
                              <>
                                <PokemonSprite pokemon={pokemon} className="doubles-lineup-selected-sprite" />
                                <span className="doubles-lineup-selected-name">{pokemon.name}</span>
                              </>
                            ) : (
                              <span className="doubles-lineup-selected-empty">Empty</span>
                            )}
                          </div>
                          {display ? (
                            renderThreatBoardFormControls({
                              side: "ally",
                              slotIndex: display.slotIndex,
                              basePokemon: display.basePokemon,
                              pokemon: display.pokemon,
                              formOptions: display.formOptions,
                              compact: true,
                            })
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="damage-doubles-lineup-action-buttons">
                    <button
                      type="button"
                      className="reset-button"
                      onClick={() => setDoublesAllySelection([null, null])}
                      disabled={doublesAllyMembers.length === 0}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              <div className="doubles-lineup-track" role="list" aria-label="Team roster">
                {battleEngineSelectableAllySlotIndices.map((slotIndex) => {
                  const slot = team[slotIndex];
                  const selectionRank = doublesAllySelection.indexOf(slotIndex);
                  const isSelected = selectionRank !== -1;
                  const display = getThreatBoardAllyDisplay(slotIndex);
                  const pokemon = display?.pokemon ?? slot.pokemon;

                  return (
                    <div key={`doubles-ally-entry-${slotIndex}`} className="doubles-lineup-entry" role="listitem">
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        disabled={!pokemon}
                        className={`doubles-lineup-token ally ${isSelected ? "selected" : ""} ${
                          pokemon ? "" : "empty"
                        }`}
                        onClick={() => toggleDoublesAllySelection(slotIndex)}
                        title={pokemon ? pokemon.name : `Slot ${slotIndex + 1} empty`}
                      >
                        <span className="doubles-lineup-token-slot">Slot {slotIndex + 1}</span>
                        <div className="doubles-lineup-token-body">
                          {pokemon ? (
                            <PokemonSprite pokemon={pokemon} className="doubles-lineup-token-sprite" />
                          ) : (
                            <div className="doubles-lineup-token-placeholder">?</div>
                          )}
                          <div className="doubles-lineup-token-info">
                            <strong>{pokemon ? pokemon.name : "Empty"}</strong>
                            <span>
                              {pokemon
                                ? pokemon.types.join(" / ")
                                : loadError
                                  ? "Unavailable"
                                  : "Add in Team Builder"}
                            </span>
                          </div>
                        </div>
                        {isSelected ? (
                          <span className="doubles-lineup-token-rank">{selectionRank === 0 ? "A" : "B"}</span>
                        ) : null}
                      </button>
                      {display ? (
                        renderThreatBoardFormControls({
                          side: "ally",
                          slotIndex: display.slotIndex,
                          basePokemon: display.basePokemon,
                          pokemon: display.pokemon,
                          formOptions: display.formOptions,
                        })
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="damage-doubles-lineup enemy">
              <div className="damage-doubles-lineup-topbar">
                <div className="damage-doubles-lineup-copy">
                  <p className="eyebrow">Enemy Side</p>
                  <p className="selector-note">
                    {enemyBring.hasConfirmedBring && enemyBring.eliminatedSlotIndices.length > 0
                      ? `Confirmed enemy four. ${enemyBring.eliminatedSlotIndices.length} benched ${
                          enemyBring.eliminatedSlotIndices.length === 1 ? "mon is" : "mons are"
                        } removed from Battle Lab.`
                      : enemyBring.hasConfirmedBring &&
                          enemyBring.bringCount === 4 &&
                          enemyBring.candidateSlotIndices.length === enemyBring.bringCount
                        ? "Enemy roster is already limited to the brought four."
                      : enemyBring.bringCount === 4 && enemyBring.knownBringSlotIndices.length > 0
                        ? `Tracking enemy bring: ${enemyBring.knownBringSlotIndices.length}/4 seen. Once all four are known, the last two are removed automatically.`
                        : "Pick the two current threats you want to compare against."}
                  </p>
                </div>
                <div className="damage-doubles-lineup-actions">
                  <div className="selected-slots" aria-label="Selected enemies">
                    {(["A", "B"] as const).map((rankLabel, rankIndex) => {
                      const slotIndex = doublesEnemySelection[rankIndex];
                      const display = getThreatBoardEnemyDisplay(slotIndex);
                      const pokemon = display?.pokemon ?? null;
                      return (
                        <div
                          key={`doubles-enemy-selected-${rankLabel}`}
                          className={`selected-slot doubles-lineup-selected enemy ${pokemon ? "filled" : ""} ${
                            display && display.formOptions.length > 1 ? "has-form-toggle" : ""
                          }`}
                        >
                          <div className="doubles-lineup-selected-main">
                            <span className="doubles-lineup-selected-rank">{rankLabel}</span>
                            {pokemon ? (
                              <>
                                <PokemonSprite pokemon={pokemon} className="doubles-lineup-selected-sprite" />
                                <span className="doubles-lineup-selected-name">{pokemon.name}</span>
                              </>
                            ) : (
                              <span className="doubles-lineup-selected-empty">Empty</span>
                            )}
                          </div>
                          {display ? (
                            renderThreatBoardFormControls({
                              side: "enemy",
                              slotIndex: display.slotIndex,
                              basePokemon: display.basePokemon,
                              pokemon: display.pokemon,
                              formOptions: display.formOptions,
                              compact: true,
                            })
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="damage-doubles-lineup-action-buttons">
                    <button
                      type="button"
                      className="reset-button"
                      onClick={() => setDoublesEnemySelection([null, null])}
                      disabled={doublesEnemyMembers.length === 0}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="reset-button"
                      onClick={() => setKnownEnemyBringSlotIndices([])}
                      disabled={knownEnemyBringSlotIndices.length === 0}
                    >
                      Reset 4
                    </button>
                  </div>
                </div>
              </div>

              <div className="doubles-lineup-track" role="list" aria-label="Enemy roster">
                {enemyBattleEntries.map((entry) => {
                  const selectionRank = doublesEnemySelection.indexOf(entry.slotIndex);
                  const isSelected = selectionRank !== -1;
                  const display = getThreatBoardEnemyDisplay(entry.slotIndex);
                  const pokemon = display?.pokemon ?? entry.pokemon;
                  const runtimeState =
                    display?.state ?? getBattleSimulatorMemberStateForPokemon("enemy", entry.slotIndex, entry.pokemon);
                  const isFainted = runtimeState.hpPercent <= 0;
                  const moveCount =
                    entry.movesetSource === "custom"
                      ? entry.savedAttacks.length
                      : display?.moveset.allMoveNames.length ?? entry.presetMoveNames.length;

                  return (
                    <div key={`doubles-enemy-entry-${entry.slotIndex}`} className="doubles-lineup-entry" role="listitem">
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        disabled={!pokemon || isFainted}
                        className={`doubles-lineup-token enemy ${isSelected ? "selected" : ""} ${
                          pokemon ? "" : "empty"
                        }`}
                        onClick={() => toggleDoublesEnemySelection(entry.slotIndex)}
                        title={
                          pokemon
                            ? isFainted
                              ? `${pokemon.name} fainted`
                              : pokemon.name
                            : `Enemy ${entry.slotIndex + 1} empty`
                        }
                      >
                        <span className="doubles-lineup-token-slot">Enemy {entry.slotIndex + 1}</span>
                        <div className="doubles-lineup-token-body">
                          {pokemon ? (
                            <PokemonSprite pokemon={pokemon} className="doubles-lineup-token-sprite" />
                          ) : (
                            <div className="doubles-lineup-token-placeholder">?</div>
                          )}
                          <div className="doubles-lineup-token-info">
                            <strong>{pokemon ? pokemon.name : "Empty"}</strong>
                            <span>
                              {pokemon
                                ? isFainted
                                  ? "Fainted"
                                  : moveCount > 0
                                    ? `${pokemon.types.join(" / ")} · ${moveCount} ${
                                        moveCount === 1 ? "move" : "moves"
                                      }`
                                    : pokemon.types.join(" / ")
                                : "Add above"}
                            </span>
                          </div>
                        </div>
                        {isSelected ? (
                          <span className="doubles-lineup-token-rank">{selectionRank === 0 ? "A" : "B"}</span>
                        ) : null}
                      </button>
                      {display && !isFainted ? (
                        renderThreatBoardFormControls({
                          side: "enemy",
                          slotIndex: display.slotIndex,
                          basePokemon: display.basePokemon,
                          pokemon: display.pokemon,
                          formOptions: display.formOptions,
                        })
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </article>
          </div>

          {selectedDoublesEnemyEntries.length > 0 ? (
            <section className="damage-doubles-block damage-doubles-scout-panel">
              <div className="coverage-preview-header">
                <p className="eyebrow">Selected Enemy Scouting</p>
                <span>{selectedDoublesEnemyEntries.length} shown</span>
              </div>

              <div className="damage-doubles-scout-grid">
                {selectedDoublesEnemyEntries.map((entry) => {
                  const display = getThreatBoardEnemyDisplay(entry.slotIndex);
                  const pokemon = display?.pokemon ?? entry.pokemon;
                  const importedMoveNames = display?.moveset.allMoveNames ?? entry.presetMoveNames;
                  const abilityName = display?.moveset.abilityName ?? entry.abilityName;
                  const itemName = entry.itemName ?? display?.moveset.itemName ?? null;
                  const displayedMoveEntries =
                    entry.movesetSource === "custom" && entry.savedAttacks.length > 0
                      ? entry.savedAttacks.map((attack) => {
                          const name = getAttackLabel(attack);
                          return {
                            name,
                            move: getMoveRecordByName(name, moveByKey),
                          };
                        })
                      : importedMoveNames.map((name) => ({
                          name,
                          move: getMoveRecordByName(name, moveByKey),
                        }));

                  return (
                    <article key={`doubles-enemy-pool-${entry.slotIndex}`} className="damage-doubles-scout-card">
                      <div className="damage-doubles-scout-head">
                        <div className="damage-doubles-scout-identity">
                          <PokemonSprite pokemon={pokemon} className="damage-side-sprite" />
                          <div>
                            <strong>{pokemon.name}</strong>
                            <p>{entry.movesetSource === "custom" ? "Custom set" : "Imported set"}</p>
                          </div>
                        </div>
                        <span className="mini-type-pill neutral-pill">
                          {displayedMoveEntries.length} move{displayedMoveEntries.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      {display ? (
                        renderThreatBoardFormControls({
                          side: "enemy",
                          slotIndex: display.slotIndex,
                          basePokemon: display.basePokemon,
                          pokemon: display.pokemon,
                          formOptions: display.formOptions,
                        })
                      ) : null}

                      <div className="damage-doubles-scout-meta">
                        {abilityName ? <span>Ability {abilityName}</span> : null}
                        {itemName ? <span>Item {itemName}</span> : null}
                      </div>

                      <div className="coverage-chip-list">
                        {displayedMoveEntries.length > 0 ? (
                          displayedMoveEntries.map((moveEntry) => {
                            const resolvedType = moveEntry.move ? getTypeFromLabel(moveEntry.move.type) : null;
                            const chipClassName = resolvedType ? "mini-type-pill" : "mini-type-pill neutral-pill";

                            return (
                              <span
                                key={`doubles-enemy-pool-${entry.slotIndex}-${moveEntry.name}`}
                                className={chipClassName}
                                style={
                                  resolvedType
                                    ? ({
                                        "--type-color": TYPE_META[resolvedType].color,
                                        "--type-accent": TYPE_META[resolvedType].accent,
                                      } as CSSProperties)
                                    : undefined
                                }
                              >
                                {moveEntry.name}
                              </span>
                            );
                          })
                        ) : (
                          <span className="subtle-empty">No saved move data for this enemy yet.</span>
                        )}
                      </div>

                      <div
                        className={`damage-doubles-scout-details${
                          doublesEnemyScoutDetailsOpen ? " is-open" : ""
                        }`}
                      >
                        <button
                          type="button"
                          className="damage-doubles-scout-details-toggle"
                          onClick={() => setDoublesEnemyScoutDetailsOpen((prev) => !prev)}
                          aria-expanded={doublesEnemyScoutDetailsOpen}
                        >
                          <span>Move Details</span>
                          <span className="damage-doubles-scout-details-hint">
                            {doublesEnemyScoutDetailsOpen ? "Collapse" : "Expand"}
                          </span>
                        </button>
                        {doublesEnemyScoutDetailsOpen ? (
                          <div className="damage-doubles-scout-detail-list">
                            {displayedMoveEntries.map((moveEntry) => {
                              const detailType = moveEntry.move ? getTypeFromLabel(moveEntry.move.type) : null;
                              const detailClassName = `damage-doubles-scout-detail${
                                detailType ? " has-type" : ""
                              }`;
                              const detailStyle = detailType
                                ? ({
                                    "--type-color": TYPE_META[detailType].color,
                                    "--type-accent": TYPE_META[detailType].accent,
                                  } as CSSProperties)
                                : undefined;
                              return (
                                <article
                                  key={`doubles-enemy-pool-detail-${entry.slotIndex}-${moveEntry.name}`}
                                  className={detailClassName}
                                  style={detailStyle}
                                >
                                  <div className="damage-doubles-scout-detail-top">
                                    <strong>{moveEntry.name}</strong>
                                    {moveEntry.move ? (
                                      <span className="damage-doubles-scout-detail-meta">
                                        <span className="scout-move-category">
                                          {moveEntry.move.category}
                                        </span>
                                        {moveEntry.move.basePower > 0 || isLowKickMove(moveEntry.move.name) ? (
                                          <span className="scout-move-power">
                                            <span className="scout-move-power-label">Power</span>
                                            <strong className="scout-move-power-value">
                                              {isLowKickMove(moveEntry.move.name) ? "Weight" : moveEntry.move.basePower}
                                            </strong>
                                          </span>
                                        ) : null}
                                      </span>
                                    ) : (
                                      <span className="damage-doubles-scout-detail-meta">Move data not found.</span>
                                    )}
                                  </div>
                                  <p>{moveEntry.move?.shortDesc || moveEntry.move?.desc || "No description found."}</p>
                                </article>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {showBattleEngineFeature ? (
            <>
              <section className={`damage-doubles-block bl-showdown-bridge ${battleEngineUsesShowdown ? "connected" : showdownBridgeStatus}`}>
                <div>
                  <p className="eyebrow">Showdown Live</p>
                  <strong>{battleEngineUsesShowdown ? showdownBridgeImport?.summary : showdownBridgeMessage}</strong>
                  <span>
                    {battleEngineUsesShowdown && showdownBridgeCapturedLabel
                      ? `Snapshot ${showdownBridgeCapturedLabel}`
                      : "Open a Showdown battle tab with the bridge extension enabled."}
                  </span>
                </div>
                <button type="button" className="secondary-button" onClick={requestShowdownSnapshot}>
                  Refresh
                </button>
                {showdownBridgeImport?.unresolvedSpecies.length ? (
                  <p>Unmatched: {showdownBridgeImport.unresolvedSpecies.slice(0, 4).join(", ")}</p>
                ) : null}
                {showdownBridgeImport?.warnings.length ? (
                  <p>{showdownBridgeImport.warnings.slice(0, 2).join(" ")}</p>
                ) : null}
              </section>

              {battleLabReady && battleLabDisplayState ? (
                <>
              {(() => {
              const displayState = battleLabDisplayState;
              const realState = battleEngineCurrentState!;
              const currentEvent =
                simulationRun && simEventIndex > 0 && simEventIndex <= simulationRun.events.length
                  ? simulationRun.events[simEventIndex - 1]
                  : null;
              const currentEventMotion =
                simulationRun && currentEvent
                  ? buildBattleLabEventMotion(simulationRun, displayState, currentEvent, simEventIndex)
                  : null;
              const allyActiveIds = displayState.sides.ally.activeIds;
              const enemyActiveIds = displayState.sides.enemy.activeIds;
              const deckSlots: Array<{
                id: string | null;
                side: BattleSide;
                rankLabel: string;
              }> = [
                { id: allyActiveIds[0] ?? null, side: "ally", rankLabel: "A" },
                { id: allyActiveIds[1] ?? null, side: "ally", rankLabel: "B" },
                { id: enemyActiveIds[0] ?? null, side: "enemy", rankLabel: "A" },
                { id: enemyActiveIds[1] ?? null, side: "enemy", rankLabel: "B" },
              ];
              const simulationReady = !!simulationRun;
              const simulationFinished = simulationReady && simEventIndex >= simulationRun!.events.length;
              const canApplyNext = !simPlaying && Boolean(simulationRun || battleEngineCurrentState);
              const displayedTurnNumber =
                simulationRun && simViewMode === "sim" && !simulationFinished
                  ? simulationRun.startState.field.turn
                  : displayState.field.turn;
              const allyReplacementRanks = (["A", "B"] as const).filter((rank, rankIndex) => {
                const combatantId = realState.sides.ally.activeIds[rankIndex];
                const combatant = combatantId ? realState.combatants[combatantId] ?? null : null;
                return !combatant || combatant.currentHp <= 0;
              });
              const enemyReplacementRanks = (["A", "B"] as const).filter((rank, rankIndex) => {
                const combatantId = realState.sides.enemy.activeIds[rankIndex];
                const combatant = combatantId ? realState.combatants[combatantId] ?? null : null;
                return !combatant || combatant.currentHp <= 0;
              });
              const allyRosterEntries = Object.values(displayState.combatants)
                .filter((combatant) => combatant.side === "ally")
                .sort((left, right) => left.teamIndex - right.teamIndex);
              const enemyRosterEntries = Object.values(displayState.combatants)
                .filter((combatant) => combatant.side === "enemy")
                .sort((left, right) => left.teamIndex - right.teamIndex);
              const allyActiveRanksById = new Map(
                displayState.sides.ally.activeIds
                  .map((combatantId, rankIndex) =>
                    combatantId ? [combatantId, rankIndex === 0 ? "A" : "B"] as const : null,
                  )
                  .filter((entry): entry is readonly [string, "A" | "B"] => Boolean(entry)),
              );
              const enemyActiveRanksById = new Map(
                displayState.sides.enemy.activeIds
                  .map((combatantId, rankIndex) =>
                    combatantId ? [combatantId, rankIndex === 0 ? "A" : "B"] as const : null,
                  )
                  .filter((entry): entry is readonly [string, "A" | "B"] => Boolean(entry)),
              );
              const visibleLogEvents =
                simulationRun?.events.slice(0, simulationFinished ? simulationRun.events.length : simEventIndex) ?? [];
              const activeTimelineIndex =
                simulationRun && simEventIndex > 0 ? Math.min(simEventIndex - 1, simulationRun.events.length - 1) : -1;
              const getSlotMotion = (
                side: BattleSide,
                slotIndex: 0 | 1,
                combatantId: string | null | undefined,
              ): BattleLabSlotMotion | null => {
                const motion: BattleLabSlotMotion = {};

                if (currentEventMotion?.kind === "attack") {
                  if (combatantId && currentEventMotion.actorId === combatantId) {
                    motion.attackKey = currentEventMotion.key;
                    motion.attackDirection = currentEventMotion.direction;
                  }
                  if (combatantId && currentEventMotion.targetId === combatantId) {
                    motion.targetKey = currentEventMotion.key;
                  }
                } else if (currentEventMotion?.kind === "faint") {
                  if (
                    (combatantId && currentEventMotion.combatantId === combatantId) ||
                    sameBattleLabSlotCoord(currentEventMotion.slot, side, slotIndex)
                  ) {
                    motion.faintKey = currentEventMotion.key;
                  }
                } else if (currentEventMotion?.kind === "switch") {
                  if (combatantId && currentEventMotion.outgoingId === combatantId) {
                    motion.switchOutKey = currentEventMotion.key;
                  }
                  if (
                    (combatantId && currentEventMotion.incomingId === combatantId) ||
                    sameBattleLabSlotCoord(currentEventMotion.slot, side, slotIndex)
                  ) {
                    motion.switchInKey = currentEventMotion.key;
                  }
                }

                if (battleLabManualMotion) {
                  const manualKey = `manual-${battleLabManualMotion.serial}`;
                  if (
                    (combatantId && battleLabManualMotion.faintedCombatantId === combatantId) ||
                    sameBattleLabSlotCoord(battleLabManualMotion.faintSlot, side, slotIndex)
                  ) {
                    motion.faintKey = manualKey;
                  }
                  if (
                    (combatantId && battleLabManualMotion.incomingCombatantId === combatantId) ||
                    sameBattleLabSlotCoord(battleLabManualMotion.switchSlot, side, slotIndex)
                  ) {
                    motion.switchInKey = manualKey;
                  }
                }

                return Object.keys(motion).length > 0 ? motion : null;
              };
              const spreadPulse =
                currentEventMotion?.kind === "attack" && currentEventMotion.isSpread ? currentEventMotion : null;
              return (
                <section className="damage-doubles-block bl-shell">
                  <div className="bl-top">
                    <div className="bl-top-title">
                      <p className="eyebrow">Battle Lab</p>
                      <h3>
                        Turn {displayedTurnNumber} ·{" "}
                        <span className={`bl-view-tag ${simViewMode}`}>
                          {simViewMode === "real" ? "Real Board" : simulationFinished ? "Simulation · End" : "Simulation"}
                        </span>
                      </h3>
                    </div>
                    <div className="bl-view-toggle" role="tablist">
                      <button
                        type="button"
                        role="tab"
                        className={simViewMode === "real" ? "active" : ""}
                        onClick={() => setSimViewMode("real")}
                      >
                        Real
                      </button>
                      <button
                        type="button"
                        role="tab"
                        className={simViewMode === "sim" ? "active" : ""}
                        onClick={() => {
                          if (simulationRun) setSimViewMode("sim");
                        }}
                        disabled={!simulationRun}
                      >
                        Sim
                      </button>
                    </div>
                    <div className="bl-top-fields">
                      <label className={`bl-field-pill ally ${
                        (battleEngineUsesShowdown ? displayState.sides.ally.tailwindTurns > 0 : doublesAllyTailwind) ? "on" : ""
                      }`}>
                        <input
                          type="checkbox"
                          checked={battleEngineUsesShowdown ? displayState.sides.ally.tailwindTurns > 0 : doublesAllyTailwind}
                          onChange={(e) => setAllyTailwindActive(e.target.checked)}
                          disabled={battleEngineUsesShowdown}
                        />
                        My TW
                      </label>
                      <label className={`bl-field-pill enemy ${
                        (battleEngineUsesShowdown ? displayState.sides.enemy.tailwindTurns > 0 : doublesEnemyTailwind) ? "on" : ""
                      }`}>
                        <input
                          type="checkbox"
                          checked={battleEngineUsesShowdown ? displayState.sides.enemy.tailwindTurns > 0 : doublesEnemyTailwind}
                          onChange={(e) => setEnemyTailwindActive(e.target.checked)}
                          disabled={battleEngineUsesShowdown}
                        />
                        Enemy TW
                      </label>
                      <label className={`bl-field-pill ${
                        (battleEngineUsesShowdown ? displayState.field.trickRoomTurns > 0 : doublesTrickRoom) ? "on" : ""
                      }`}>
                        <input
                          type="checkbox"
                          checked={battleEngineUsesShowdown ? displayState.field.trickRoomTurns > 0 : doublesTrickRoom}
                          onChange={(e) => setTrickRoomActive(e.target.checked)}
                          disabled={battleEngineUsesShowdown}
                        />
                        Trick Room
                      </label>
                      <select
                        className="bl-field-select"
                        value={battleEngineUsesShowdown ? displayState.field.weather : damageWeather}
                        onChange={(e) => setDamageWeather(e.target.value as DamageWeather)}
                        aria-label="Weather"
                        disabled={battleEngineUsesShowdown}
                      >
                        <option value="none">Weather · none</option>
                        <option value="sun">Sun</option>
                        <option value="rain">Rain</option>
                        <option value="sand">Sand</option>
                        <option value="snow">Snow</option>
                      </select>
                      <select
                        className="bl-field-select"
                        value={battleEngineUsesShowdown ? displayState.field.terrain : damageTerrain}
                        onChange={(e) => setDamageTerrain(e.target.value as DamageTerrain)}
                        aria-label="Terrain"
                        disabled={battleEngineUsesShowdown}
                      >
                        <option value="none">Terrain · none</option>
                        <option value="electric">Electric</option>
                        <option value="grassy">Grassy</option>
                        <option value="psychic">Psychic</option>
                        <option value="misty">Misty</option>
                      </select>
                    </div>
                  </div>

                  <div className="bl-main">
                    <aside className="bl-log">
                      <div className="bl-log-head">
                        <div>
                          <p className="eyebrow">Turn Log</p>
                          <strong>{simulationRun ? "What happened" : "Awaiting sim"}</strong>
                        </div>
                        {simulationRun ? (
                          <span className="bl-log-count">{visibleLogEvents.length}/{simulationRun.events.length}</span>
                        ) : null}
                      </div>
                      {visibleLogEvents.length > 0 ? (
                        <ol className="bl-log-list">
                          {visibleLogEvents.map((event, index) => {
                            const ownerSide =
                              event.actorId?.startsWith("ally-") || event.targetId?.startsWith("ally-")
                                ? "ally"
                                : event.actorId?.startsWith("enemy-") || event.targetId?.startsWith("enemy-")
                                  ? "enemy"
                                  : "neutral";
                            return (
                              <li
                                key={`bl-log-${index}-${event.actorId ?? "none"}-${event.targetId ?? "none"}`}
                                className={`bl-log-item ${ownerSide}${index === visibleLogEvents.length - 1 ? " current" : ""}`}
                                title={event.text}
                              >
                                <span className="bl-log-step">{index + 1}</span>
                                <span className="bl-log-copy">
                                  <span className="bl-log-participants">
                                    {event.actorId ? (
                                      <span className={`bl-log-chip ${getBattleLabCombatantTone(event.actorId)}`}>
                                        {getBattleLabCombatantName(simulationRun, realState, event.actorId)}
                                      </span>
                                    ) : null}
                                    {event.targetId ? (
                                      <span className={`bl-log-chip ${getBattleLabCombatantTone(event.targetId)}`}>
                                        {getBattleLabCombatantName(simulationRun, realState, event.targetId)}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="bl-log-text">{summarizeBattleLabEvent(event.text)}</span>
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      ) : (
                        <div className="bl-log-empty">
                          {simulationRun
                            ? "Step or play the turn to populate the log."
                            : "Press Play Turn to generate a concise event trace."}
                        </div>
                      )}
                    </aside>

                    <div className="bl-board-stage">
                      <div className="bl-side-rail enemy">
                        <BattleLabRosterStrip
                          side="enemy"
                          entries={enemyRosterEntries}
                          activeRanksById={enemyActiveRanksById}
                          replacementRanks={enemyReplacementRanks}
                          editable={simViewMode === "real" && !battleEngineUsesShowdown}
                          deployingCombatantId={
                            currentEventMotion?.kind === "switch" && currentEventMotion.side === "enemy"
                              ? currentEventMotion.incomingId
                              : battleLabManualMotion?.switchSlot?.side === "enemy"
                                ? battleLabManualMotion.incomingCombatantId ?? null
                                : null
                          }
                          recallingCombatantId={
                            currentEventMotion?.kind === "switch" && currentEventMotion.side === "enemy"
                              ? currentEventMotion.outgoingId
                              : null
                          }
                          onAssign={(rank, slotIndex) => assignDoublesEnemySelection(slotIndex, rank === "A" ? 0 : 1)}
                        />
                      </div>

                      <div className="bl-board-wrap">
                        <div className={`bl-board ${spreadPulse ? `has-spread-pulse ${spreadPulse.side}` : ""}`}>
                          {spreadPulse ? (
                            <span key={`spread-${spreadPulse.key}`} className={`bl-spread-pulse ${spreadPulse.side}`} />
                          ) : null}
                          <div className="bl-board-row enemy">
                            {(["A", "B"] as const).map((rank, i) => {
                              const id = enemyActiveIds[i];
                              const combatant = id ? displayState.combatants[id] : null;
                              const slotKey = id ? `enemy-${id}` : `enemy-empty-${rank}`;
                              const teamIndex = combatant?.teamIndex;
                              const basePokemon = combatant
                                ? getBasePokemonForBattleForm(combatant.pokemon, basePokemonBySpeciesKey)
                                : null;
                              const patchState =
                                teamIndex != null && combatant
                                  ? getBattleSimulatorMemberStateForPokemon("enemy", teamIndex, combatant.pokemon)
                                  : null;
                              const projectedCombatant =
                                simViewMode === "real" && id ? battleLabDamageProjection?.state.combatants[id] ?? null : null;
                              const formOptions =
                                !battleEngineUsesShowdown && basePokemon
                                  ? getTeamFormOptions(basePokemon, megaFormsByBaseSpeciesKey)
                                  : [];
                              const handleBattleFormChange =
                                !battleEngineUsesShowdown && teamIndex != null && basePokemon
                                  ? (nextFormPokemonId: string | null) =>
                                      changeBattleLabSlotBattleForm("enemy", teamIndex, basePokemon, nextFormPokemonId)
                                  : undefined;
                              return (
                                <BattleLabSlot
                                  key={slotKey}
                                  combatant={combatant}
                                  rankLabel={rank}
                                  side="enemy"
                                  displayHp={combatant?.currentHp ?? 0}
                                  displayHpPercent={
                                    combatant && combatant.maxHp > 0
                                      ? (combatant.currentHp / combatant.maxHp) * 100
                                      : 0
                                  }
                                  projectedHp={projectedCombatant?.currentHp ?? null}
                                  projectedHpDelta={
                                    combatant && projectedCombatant ? projectedCombatant.currentHp - combatant.currentHp : null
                                  }
                                  pulse={id ? damagePulses[id] ?? 0 : 0}
                                  effectFlash={id ? slotFlashes[id] ?? null : null}
                                  motion={getSlotMotion("enemy", i === 0 ? 0 : 1, id)}
                                  editing={editingSlotKey === slotKey && simViewMode === "real"}
                                  quickEditing={simViewMode === "real" && !battleEngineUsesShowdown}
                                  canFaint={simViewMode === "real" && !battleEngineUsesShowdown && Boolean(combatant && combatant.currentHp > 0)}
                                  onFaint={() => {
                                    if (!id) return;
                                    triggerBattleLabFaint("enemy", i === 0 ? 0 : 1, id);
                                  }}
                                  onToggleEdit={() => {
                                    if (simViewMode !== "real") return;
                                    setEditingSlotKey(editingSlotKey === slotKey ? null : slotKey);
                                  }}
                                  onEditPatch={(patch) => {
                                    if (teamIndex != null && combatant) {
                                      updateBattleSimulatorMemberStateForPokemon("enemy", teamIndex, combatant.pokemon, patch);
                                    }
                                  }}
                                  simulatorPatch={patchState}
                                  formOptions={formOptions}
                                  onBattleFormChange={handleBattleFormChange}
                                />
                              );
                            })}
                          </div>

                          <div className="bl-board-center">
                            <span className="bl-center-turn">Turn {displayedTurnNumber}</span>
                            <div className="bl-center-chips">
                              {displayState.field.weather !== "none" ? (
                                <span className="bl-center-chip">☀ {displayState.field.weather}</span>
                              ) : null}
                              {displayState.field.terrain !== "none" ? (
                                <span className="bl-center-chip">▤ {displayState.field.terrain}</span>
                              ) : null}
                              {displayState.field.trickRoomTurns > 0 ? (
                                <span className="bl-center-chip tr">TR {displayState.field.trickRoomTurns}</span>
                              ) : null}
                              {displayState.sides.ally.tailwindTurns > 0 ? (
                                <span className="bl-center-chip ally">TW·A {displayState.sides.ally.tailwindTurns}</span>
                              ) : null}
                              {displayState.sides.enemy.tailwindTurns > 0 ? (
                                <span className="bl-center-chip enemy">TW·E {displayState.sides.enemy.tailwindTurns}</span>
                              ) : null}
                              {displayState.sides.ally.reflectTurns > 0 ? (
                                <span className="bl-center-chip ally">Reflect</span>
                              ) : null}
                              {displayState.sides.ally.lightScreenTurns > 0 ? (
                                <span className="bl-center-chip ally">L·Screen</span>
                              ) : null}
                              {displayState.sides.enemy.reflectTurns > 0 ? (
                                <span className="bl-center-chip enemy">Reflect</span>
                              ) : null}
                              {displayState.sides.enemy.lightScreenTurns > 0 ? (
                                <span className="bl-center-chip enemy">L·Screen</span>
                              ) : null}
                            </div>
                            {currentEvent ? (
                              <div className="bl-center-ticker">{currentEvent.text}</div>
                            ) : null}
                          </div>

                          <div className="bl-board-row ally">
                            {(["A", "B"] as const).map((rank, i) => {
                              const id = allyActiveIds[i];
                              const combatant = id ? displayState.combatants[id] : null;
                              const slotKey = id ? `ally-${id}` : `ally-empty-${rank}`;
                              const teamIndex = combatant?.teamIndex;
                              const teamSlot = teamIndex != null ? team[teamIndex] ?? null : null;
                              const basePokemon =
                                teamSlot?.basePokemon ??
                                (combatant ? getBasePokemonForBattleForm(combatant.pokemon, basePokemonBySpeciesKey) : null);
                              const patchState =
                                teamIndex != null && combatant
                                  ? getBattleSimulatorMemberStateForPokemon("ally", teamIndex, combatant.pokemon)
                                  : null;
                              const projectedCombatant =
                                simViewMode === "real" && id ? battleLabDamageProjection?.state.combatants[id] ?? null : null;
                              const formOptions =
                                !battleEngineUsesShowdown && basePokemon
                                  ? getSavedMegaFormOptions(
                                      basePokemon,
                                      teamSlot?.activeFormPokemonId,
                                      pokemonByKey,
                                      megaFormsByBaseSpeciesKey,
                                    )
                                  : [];
                              const handleBattleFormChange =
                                !battleEngineUsesShowdown && teamIndex != null && basePokemon
                                  ? (nextFormPokemonId: string | null) =>
                                      changeBattleLabSlotBattleForm("ally", teamIndex, basePokemon, nextFormPokemonId)
                                  : undefined;
                              return (
                                <BattleLabSlot
                                  key={slotKey}
                                  combatant={combatant}
                                  rankLabel={rank}
                                  side="ally"
                                  displayHp={combatant?.currentHp ?? 0}
                                  displayHpPercent={
                                    combatant && combatant.maxHp > 0
                                      ? (combatant.currentHp / combatant.maxHp) * 100
                                      : 0
                                  }
                                  projectedHp={projectedCombatant?.currentHp ?? null}
                                  projectedHpDelta={
                                    combatant && projectedCombatant ? projectedCombatant.currentHp - combatant.currentHp : null
                                  }
                                  pulse={id ? damagePulses[id] ?? 0 : 0}
                                  effectFlash={id ? slotFlashes[id] ?? null : null}
                                  motion={getSlotMotion("ally", i === 0 ? 0 : 1, id)}
                                  editing={editingSlotKey === slotKey && simViewMode === "real"}
                                  quickEditing={simViewMode === "real" && !battleEngineUsesShowdown}
                                  canFaint={simViewMode === "real" && !battleEngineUsesShowdown && Boolean(combatant && combatant.currentHp > 0)}
                                  onFaint={() => {
                                    if (!id) return;
                                    triggerBattleLabFaint("ally", i === 0 ? 0 : 1, id);
                                  }}
                                  onToggleEdit={() => {
                                    if (simViewMode !== "real") return;
                                    setEditingSlotKey(editingSlotKey === slotKey ? null : slotKey);
                                  }}
                                  onEditPatch={(patch) => {
                                    if (teamIndex != null && combatant) {
                                      updateBattleSimulatorMemberStateForPokemon("ally", teamIndex, combatant.pokemon, patch);
                                    }
                                  }}
                                  simulatorPatch={patchState}
                                  formOptions={formOptions}
                                  onBattleFormChange={handleBattleFormChange}
                                />
                              );
                            })}
                          </div>
                        </div>

                        {simulationRun ? (
                          <ol className="bl-turn-order" aria-label="Simulation turn order">
                            {simulationRun.events.map((event, index) => {
                              const stateClass =
                                index < activeTimelineIndex || simulationFinished
                                  ? "done"
                                  : index === activeTimelineIndex
                                    ? "active"
                                    : "pending";
                              const ownerSide =
                                event.actorId?.startsWith("ally-") || event.targetId?.startsWith("ally-")
                                  ? "ally"
                                  : event.actorId?.startsWith("enemy-") || event.targetId?.startsWith("enemy-")
                                    ? "enemy"
                                    : "neutral";
                              return (
                                <li
                                  key={`bl-turn-order-${index}-${event.actorId ?? "none"}-${event.targetId ?? "none"}`}
                                  className={`bl-turn-order-step ${stateClass} ${ownerSide}`}
                                  title={event.text}
                                >
                                  <span className="bl-turn-order-index">{index + 1}</span>
                                  <span className="bl-turn-order-text">{summarizeBattleLabEvent(event.text)}</span>
                                </li>
                              );
                            })}
                          </ol>
                        ) : null}

                        <div className="bl-sim-strip">
                          <button
                            type="button"
                            className="bl-sim-btn play"
                            onClick={runUserSimulation}
                            disabled={simPlaying || !battleEngineCurrentState}
                            title="Play the turn with selected moves"
                          >
                            {simPlaying ? "⏸ Playing" : "▶ Play Turn"}
                          </button>
                          <button
                            type="button"
                            className="bl-sim-btn"
                            onClick={simPlaying ? pauseUserSimulation : stepUserSimulation}
                            disabled={!simulationRun || simulationFinished}
                            title="Step to next event"
                          >
                            {simPlaying ? "⏸" : "⏭"}
                          </button>
                          <button
                            type="button"
                            className="bl-sim-btn"
                            onClick={resetUserSimulation}
                            disabled={!simulationRun && simViewMode === "real"}
                            title="Reset simulation"
                          >
                            ↺
                          </button>
                          <div className="bl-sim-progress">
                            {simulationRun ? (
                              <>
                                <span className="bl-sim-progress-label">
                                  {simEventIndex}/{simulationRun.events.length}
                                </span>
                                <div className="bl-sim-progress-bar">
                                  <span
                                    className="bl-sim-progress-fill"
                                    style={{
                                      width: `${
                                        simulationRun.events.length > 0
                                          ? (simEventIndex / simulationRun.events.length) * 100
                                          : 0
                                      }%`,
                                    }}
                                  />
                                </div>
                              </>
                            ) : (
                              <span className="bl-sim-progress-label muted">
                                Pick moves and press Play Turn
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="bl-sim-btn next"
                            onClick={() => {
                              if (simulationRun) {
                                applySimulationAsNextTurn();
                                return;
                              }
                              advanceRealBoardToNextTurn();
                            }}
                            disabled={!canApplyNext}
                            title={
                              simulationRun
                                ? "Apply the simulated result as the new real board state"
                                : "Advance the edited real board to the next turn"
                            }
                          >
                            {simulationRun ? "Next Turn →" : "Advance Turn →"}
                          </button>
                        </div>

                      </div>

                      <div className="bl-side-rail ally">
                        <BattleLabRosterStrip
                          side="ally"
                          entries={allyRosterEntries}
                          activeRanksById={allyActiveRanksById}
                          replacementRanks={allyReplacementRanks}
                          editable={simViewMode === "real" && !battleEngineUsesShowdown}
                          deployingCombatantId={
                            currentEventMotion?.kind === "switch" && currentEventMotion.side === "ally"
                              ? currentEventMotion.incomingId
                              : battleLabManualMotion?.switchSlot?.side === "ally"
                                ? battleLabManualMotion.incomingCombatantId ?? null
                                : null
                          }
                          recallingCombatantId={
                            currentEventMotion?.kind === "switch" && currentEventMotion.side === "ally"
                              ? currentEventMotion.outgoingId
                              : null
                          }
                          onAssign={(rank, slotIndex) => assignDoublesAllySelection(slotIndex, rank === "A" ? 0 : 1)}
                        />
                      </div>
                    </div>

                    <aside className="bl-engine">
                      <div className="bl-engine-head">
                        <div className="bl-engine-title-row">
                          <div>
                            <p className="eyebrow">Battle Engine</p>
                            <div className="bl-engine-title-line">
                              <strong>Turn planner</strong>
                              <span className={`bl-engine-status ${battleEngineIsStale ? "stale" : ""}`}>
                                {battleEngineSearching
                                  ? "Searching"
                                  : battleEngineRecommendation
                                    ? battleEngineIsStale
                                      ? "Stale"
                                      : `Depth ${battleEngineRecommendation.depthReached}`
                                    : "Ready"}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="primary-button bl-engine-run"
                            onClick={runBattleEngineAnalysis}
                            disabled={!canRunBattleEngine || battleEngineSearching}
                          >
                            {battleEngineSearching ? "..." : battleEngineRecommendation ? "Rerun" : "Run"}
                          </button>
                        </div>
                        <div className="bl-engine-controls">
                          <select
                            value={battleEngineSearchMode}
                            onChange={(e) => setBattleEngineSearchMode(e.target.value as SearchMode)}
                            disabled={battleEngineSearching}
                          >
                            <option value="fast">Fast</option>
                            <option value="balanced">Balanced</option>
                            <option value="tactical">Tactical</option>
                            <option value="deep">Deep</option>
                          </select>
                          <select
                            value={battleEngineObjectiveMode}
                            onChange={(e) => setBattleEngineObjectiveMode(e.target.value as ObjectiveMode)}
                            disabled={battleEngineSearching}
                          >
                            <option value="robust">Robust</option>
                            <option value="likely">Likely</option>
                            <option value="hybrid">Hybrid</option>
                          </select>
                          <span className="bl-engine-budget">
                            {battleEngineRecommendation
                              ? `${Math.round(battleEngineRecommendation.diagnostics.elapsedMs)}ms`
                              : "No run"}
                          </span>
                        </div>
                      </div>

                      {battleEngineError ? (
                        <p className="bl-engine-error">{battleEngineError}</p>
                      ) : null}

                      {battleEngineRecommendation ? (
                        <>
                          <div className="bl-engine-score-grid">
                            <div className="bl-engine-score-cell primary">
                              <span>Score</span>
                              <strong>{Math.round(battleEngineRecommendation.rootScore)}</strong>
                            </div>
                            <div className="bl-engine-score-cell">
                              <span>Robust</span>
                              <strong>{Math.round(battleEngineRecommendation.robustScore)}</strong>
                            </div>
                            <div className="bl-engine-score-cell">
                              <span>Likely</span>
                              <strong>{Math.round(battleEngineRecommendation.likelyScore)}</strong>
                            </div>
                            <div className="bl-engine-score-cell">
                              <span>Nodes</span>
                              <strong>{battleEngineRecommendation.diagnostics.searchNodes}</strong>
                            </div>
                          </div>

                          <div className="bl-engine-mechanic-strip">
                            {getBattleEngineMechanicTags(
                              battleEngineRecommendation.bestPlan?.summary,
                              battleEngineRecommendation.predictedEnemyResponse?.summary,
                              ...battleEngineRecommendation.diagnostics.tacticalTriggers,
                            ).map((tag) => (
                              <span key={`bl-engine-mechanic-${tag}`}>{tag}</span>
                            ))}
                            {battleEngineRecommendation.budget.searchMode === "tactical" ? (
                              <span>Tactical lookahead</span>
                            ) : null}
                          </div>

                          <section className="bl-engine-primary-line">
                            <div className="bl-engine-primary-head">
                              <div>
                                <span>Recommended line</span>
                                <strong>
                                  {battleEngineRecommendation.bestPlan?.summary ?? "No legal ally plan"}
                                </strong>
                              </div>
                              <button
                                type="button"
                                className="bl-engine-apply"
                                onClick={applyEngineRecommendationToChosen}
                              >
                                Use
                              </button>
                            </div>
                            <div className="bl-engine-primary-grid">
                              <div className="bl-engine-plan-block ally">
                                <span>Our plan</span>
                                {battleEngineRecommendation.bestPlan ? (
                                  <ul>
                                    {battleEngineRecommendation.bestPlan.actions.map((a) => (
                                      <li key={`bl-eng-ally-${a.actorId}`}>
                                        <strong>{a.actorLabel}</strong>{" "}
                                        {getPlannedActionDetail(a)}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="bl-engine-muted">No legal ally plan.</p>
                                )}
                              </div>
                              <div className="bl-engine-plan-block enemy">
                                <span>Expected reply</span>
                                {battleEngineRecommendation.predictedEnemyResponse ? (
                                  <ul>
                                    {battleEngineRecommendation.predictedEnemyResponse.actions.map((a) => (
                                      <li key={`bl-eng-enemy-${a.actorId}`}>
                                        <strong>{a.actorLabel}</strong>{" "}
                                        {getPlannedActionDetail(a)}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="bl-engine-muted">No enemy response available.</p>
                                )}
                              </div>
                            </div>
                          </section>

                          {battleEngineEnemyLineOptions.length > 0 ? (
                            <div className="bl-engine-counterplay">
                              <div className="bl-engine-section-head">
                                <span>Enemy options</span>
                                <small>{battleEngineEnemyLineOptions.length} lines</small>
                              </div>
                              {battleEngineEnemyLineOptions.map((option, index) => (
                                <article
                                  key={`bl-eng-enemy-line-${option.enemyPlan.summary}-${index}`}
                                  className="bl-engine-counterline"
                                >
                                  <div className="bl-engine-counterline-head">
                                    <div>
                                      <strong>Line {index + 1}</strong>
                                      <span className={`bl-engine-risk ${option.riskTone}`}>
                                        {option.riskLabel}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      className="bl-engine-apply"
                                      onClick={() => applyJointPlansToChosen(option.responsePlan, option.enemyPlan)}
                                    >
                                      Use
                                    </button>
                                  </div>
                                  <div className="bl-engine-line-meta">
                                    <div className="bl-engine-line-labels">
                                      {option.labels.map((label) => (
                                        <span key={`bl-engine-line-label-${index}-${label}`}>{label}</span>
                                      ))}
                                    </div>
                                    <div className="bl-engine-confidence">
                                      <span>Conf {option.confidence}%</span>
                                      <i>
                                        <b style={{ width: `${option.confidence}%` }} />
                                      </i>
                                    </div>
                                    <em>{formatBattleEngineSigned(option.scoreDelta)}</em>
                                  </div>
                                  {option.tags.length > 0 ? (
                                    <div className="bl-engine-tags">
                                      {option.tags.map((tag) => (
                                        <span key={`bl-engine-line-tag-${index}-${tag}`}>{tag}</span>
                                      ))}
                                    </div>
                                  ) : null}
                                  <div className="bl-engine-line-pair">
                                    <div className="bl-engine-line-side enemy">
                                      <span>Enemy</span>
                                      <ul>
                                        {option.enemyPlan.actions.map((a) => (
                                          <li key={`bl-eng-line-enemy-${index}-${a.actorId}`}>
                                            <strong>{a.actorLabel}</strong>{" "}
                                            {getPlannedActionDetail(a)}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div className="bl-engine-line-side ally">
                                      <span>Answer</span>
                                      <ul>
                                        {option.responsePlan.actions.map((a) => (
                                          <li key={`bl-eng-line-ally-${index}-${a.actorId}`}>
                                            <strong>{a.actorLabel}</strong>{" "}
                                            {getPlannedActionDetail(a)}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : null}

                          {battleEngineRecommendation.pv.length > 0 ? (
                            <div className="bl-engine-future">
                              <div className="bl-engine-section-head">
                                <span>Future preview</span>
                                <small>Primary line</small>
                              </div>
                              <div className="bl-engine-timeline">
                                {battleEngineRecommendation.pv.slice(0, 2).map((step, index) => (
                                  <div key={`bl-engine-pv-${index}`} className="bl-engine-pv-step">
                                    <span>{index === 0 ? `Turn ${step.turn}` : `Turn ${step.turn} next`}</span>
                                    <strong>{step.allyPlan?.summary ?? "Our line pending"}</strong>
                                    <small>{step.enemyPlan?.summary ?? "Enemy line pending"}</small>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {battleEngineRecommendation.consideredPlans.length > 1 ? (
                            <div className="bl-engine-alts">
                              <span className="bl-engine-alts-label">Other ally lines</span>
                              {battleEngineRecommendation.consideredPlans
                                .slice(1, 4)
                                .map((scoreEntry: SearchPlanScore, i) => (
                                  <button
                                    key={`bl-eng-alt-${i}`}
                                    type="button"
                                    className="bl-engine-alt"
                                    onClick={() => applyJointPlansToChosen(scoreEntry.plan, scoreEntry.predictedEnemyResponse)}
                                    title={scoreEntry.plan.summary}
                                  >
                                    <strong>#{i + 2}</strong>
                                    <span>{scoreEntry.plan.summary}</span>
                                    <em>{Math.round(scoreEntry.score)}</em>
                                  </button>
                                ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="bl-engine-muted">
                          Press <strong>Run</strong> to see the engine&apos;s best move + counterplay.
                        </p>
                      )}
                    </aside>
                  </div>

                  <div className="bl-decks">
                    {deckSlots.map((slot) => {
                      if (!slot.id) {
                        return (
                          <div key={`bl-deck-${slot.side}-${slot.rankLabel}`} className={`bl-deck ${slot.side} empty`}>
                            <div className="bl-deck-head">
                              <span className={`bl-slot-rank ${slot.side}`}>{slot.rankLabel}</span>
                              <small>Empty slot</small>
                            </div>
                          </div>
                        );
                      }
                      const combatant = displayState.combatants[slot.id];
                      if (!combatant) return null;
                      const movePool = [...combatant.knownMoves, ...combatant.candidateMoves];
                      const seen = new Set<string>();
                      const uniqueMoves = movePool.filter((m) => {
                        const key = normalizePokemonNameKey(m.name);
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                      });
                      const topMoves = uniqueMoves.slice(0, 4);
                      const chosen = userChosenActions[slot.id];
                      const benchIds = realState.sides[slot.side].benchIds.filter(
                        (id) => realState.combatants[id]?.currentHp > 0,
                      );
                      const currentLastMoveId =
                        combatant.teamIndex != null
                          ? getBattleSimulatorMemberStateForPokemon(slot.side, combatant.teamIndex, combatant.pokemon).lastMoveId
                          : null;

                      return (
                        <div key={`bl-deck-${slot.side}-${slot.id}`} className={`bl-deck ${slot.side}`}>
                          <div className="bl-deck-head">
                            <span className={`bl-slot-rank ${slot.side}`}>{slot.rankLabel}</span>
                            <PokemonSprite pokemon={combatant.pokemon} className="bl-deck-sprite" />
                            <div className="bl-deck-head-copy">
                              <strong>{combatant.pokemon.name}</strong>
                              <small>{slot.side === "ally" ? "You pick" : "Predicted"}</small>
                            </div>
                          </div>

                          <div className="bl-deck-moves">
                            {topMoves.length === 0 ? (
                              <div className="bl-deck-empty">No moves scouted.</div>
                            ) : (
                              topMoves.map((move) => {
                                const isMoveSelected =
                                  chosen?.kind === "move" && chosen.moveId === move.id;
                                const targetId =
                                  isMoveSelected && chosen.kind === "move"
                                    ? chosen.targetId
                                    : getDefaultTargetForMove(realState, combatant, move);
                                const target = targetId ? realState.combatants[targetId] ?? null : null;
                                const canCycleTarget = move.targetKind === "singleOpponent";
                                return (
                                  <BattleLabMoveButton
                                    key={`bl-mv-${slot.id}-${move.id}`}
                                    move={move}
                                    selected={isMoveSelected}
                                    target={target}
                                    canCycleTarget={canCycleTarget}
                                    lastMoveSelected={currentLastMoveId === move.id}
                                    canSetLastMove={simViewMode === "real"}
                                    onClick={() =>
                                      setChosenAction(slot.id!, {
                                        kind: "move",
                                        moveId: move.id,
                                        targetId: getDefaultTargetForMove(realState, combatant, move),
                                      })
                                    }
                                    onSetLastMove={() => {
                                      updateBattleSimulatorMemberStateForPokemon(slot.side, combatant.teamIndex, combatant.pokemon, {
                                        lastMoveId: currentLastMoveId === move.id ? null : move.id,
                                      });
                                    }}
                                    onCycleTarget={() => {
                                      if (!isMoveSelected || !canCycleTarget) return;
                                      const oppSide: BattleSide = slot.side === "ally" ? "enemy" : "ally";
                                      const oppIds = realState.sides[oppSide].activeIds.filter(
                                        (id): id is string => Boolean(id),
                                      );
                                      if (oppIds.length <= 1) return;
                                      const currentIdx = oppIds.indexOf(targetId ?? "");
                                      const nextIdx = (currentIdx + 1) % oppIds.length;
                                      setChosenAction(slot.id!, {
                                        kind: "move",
                                        moveId: move.id,
                                        targetId: oppIds[nextIdx],
                                      });
                                    }}
                                    disabled={simViewMode === "sim"}
                                  />
                                );
                              })
                            )}
                          </div>

                          <div className="bl-deck-alt">
                            {benchIds.length > 0 ? (
                              <select
                                className="bl-deck-switch"
                                value={chosen?.kind === "switch" ? chosen.switchInId : ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) return;
                                  setChosenAction(slot.id!, { kind: "switch", switchInId: v });
                                }}
                                disabled={simViewMode === "sim"}
                              >
                                <option value="">Switch...</option>
                                {benchIds.map((bid) => (
                                  <option key={`bl-sw-${slot.id}-${bid}`} value={bid}>
                                    {realState.combatants[bid]?.pokemon.name ?? "?"}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            <button
                              type="button"
                              className={`bl-deck-pass ${chosen?.kind === "pass" ? "selected" : ""}`}
                              onClick={() => setChosenAction(slot.id!, { kind: "pass" })}
                              disabled={simViewMode === "sim"}
                            >
                              Pass
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <details className="bl-threat-footer">
                    <summary>
                      <span>Threat board · turn order</span>
                      <span className="bl-threat-summary-count">
                        {threatTurnOrder.length > 0
                          ? `${threatTurnOrder[0].member.pokemon.name} moves first`
                          : "no data"}
                      </span>
                    </summary>
                    <div className="bl-threat-body">
                      <div className="bl-threat-columns">
                        <div className="bl-threat-col">
                          <div className="bl-threat-col-head">
                            <strong>Enemy → You</strong>
                            <small>Biggest incoming hit per ally</small>
                          </div>
                          <div className="bl-threat-grid">
                            {incomingThreatCards.map((card) => {
                              const tone = getThreatCardTone(card.strongestLine, "incoming");
                              const line = card.strongestLine;
                              return (
                                <div
                                  key={`bl-inc-${card.target.slotIndex}`}
                                  className={`bl-threat-cell incoming ${tone}`}
                                >
                                  <PokemonSprite
                                    pokemon={card.target.pokemon}
                                    className="bl-threat-cell-sprite"
                                  />
                                  <div className="bl-threat-cell-copy">
                                    <strong>{card.target.pokemon.name}</strong>
                                    <small>
                                      {line?.bestRow
                                        ? `${line.attacker.pokemon.name} · ${getAttackLabel(line.bestRow.attack)}`
                                        : "No hits"}
                                    </small>
                                  </div>
                                  <span className={`bl-threat-cell-badge ${tone}`}>
                                    {line?.bestRow
                                      ? `${formatPercent(line.bestRow.estimate.maxPercent)}%`
                                      : "—"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="bl-threat-col">
                          <div className="bl-threat-col-head">
                            <strong>You → Enemy</strong>
                            <small>Biggest outgoing hit per enemy</small>
                          </div>
                          <div className="bl-threat-grid">
                            {outgoingThreatCards.map((card) => {
                              const tone = getThreatCardTone(card.strongestLine, "outgoing");
                              const line = card.strongestLine;
                              return (
                                <div
                                  key={`bl-out-${card.target.slotIndex}`}
                                  className={`bl-threat-cell outgoing ${tone}`}
                                >
                                  <PokemonSprite
                                    pokemon={card.target.pokemon}
                                    className="bl-threat-cell-sprite"
                                  />
                                  <div className="bl-threat-cell-copy">
                                    <strong>{card.target.pokemon.name}</strong>
                                    <small>
                                      {line?.bestRow
                                        ? `${line.attacker.pokemon.name} · ${getAttackLabel(line.bestRow.attack)}`
                                        : "No hits"}
                                    </small>
                                  </div>
                                  <span className={`bl-threat-cell-badge ${tone}`}>
                                    {line?.bestRow
                                      ? `${formatPercent(line.bestRow.estimate.maxPercent)}%`
                                      : "—"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="bl-threat-col">
                          <div className="bl-threat-col-head">
                            <strong>Turn order</strong>
                            <small>{doublesTrickRoom ? "Trick Room" : "Speed order"}</small>
                          </div>
                          <ol className="bl-threat-order">
                            {threatTurnOrder.map(({ member, effectiveSpeed, tailwindActive }, idx) => (
                              <li
                                key={`bl-ord-${member.side}-${member.slotIndex}`}
                                className={`bl-threat-order-row ${member.side}`}
                              >
                                <span className="bl-threat-order-rank">#{idx + 1}</span>
                                <span className="bl-threat-order-name">{member.pokemon.name}</span>
                                <span className="bl-threat-order-spe">
                                  {effectiveSpeed}
                                  {tailwindActive ? " ↑" : ""}
                                </span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    </div>
                  </details>
                </section>
              );
              })()}
                </>
              ) : (
                <div className="matchup-empty-board">
                  Pick at least one filled ally and one loaded enemy to open Battle Lab. The full threat grid expands
                  automatically once both sides have two active mons.
                </div>
              )}
            </>
          ) : null}
        </section>
      </section>

      {battleLabFaintPrompt ? (
        <BattleLabFaintModal
          prompt={battleLabFaintPrompt}
          onChoose={(teamIndex) => {
            if (!battleEngineCurrentState) {
              setBattleLabFaintPrompt(null);
              return;
            }

            const combatant = battleEngineCurrentState.combatants[battleLabFaintPrompt.faintedCombatantId];
            if (!combatant) {
              setBattleLabFaintPrompt(null);
              return;
            }

            applyBattleLabFaintResult(
              battleLabFaintPrompt.side,
              battleLabFaintPrompt.slotPosition,
              combatant,
              teamIndex,
            );
          }}
          onClose={() => setBattleLabFaintPrompt(null)}
        />
      ) : null}

      <datalist id="pokemon-options">
        {teamBuilderPokemonPool.map((pokemon) => (
          <option key={pokemon.id} value={pokemon.name} />
        ))}
      </datalist>

      <datalist id="move-options">
        {(battleData?.moves ?? []).map((move, index) => (
          <option key={`${move.id}-${move.name}-${index}`} value={move.name} />
        ))}
      </datalist>

      <datalist id="item-options">
        {(battleData?.items ?? []).map((item) => (
          <option key={item.id} value={item.name} />
        ))}
      </datalist>
    </>
  );
}

function MovesetDatabaseView() {
  const [database, setDatabase] = useState<PokemonRecord[] | null>(null);
  const [battleData, setBattleData] = useState<{
    moves: MoveRecord[];
    abilities: AbilityRecord[];
    items: ItemRecord[];
  } | null>(null);
  const [speciesMovesets, setSpeciesMovesets] = useState<PersistedSpeciesMoveset[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [battleDataError, setBattleDataError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpeciesKey, setSelectedSpeciesKey] = useState<string | null>(null);
  const [draftKnownMoves, setDraftKnownMoves] = useState<PersistedKnownMove[]>([]);
  const [draftAbilityName, setDraftAbilityName] = useState("");
  const [draftItemName, setDraftItemName] = useState("");
  const [draftStatSpread, setDraftStatSpread] = useState<ChampionsStatSpread | null>(null);

  useEffect(() => {
    let active = true;

    loadPokemonDatabase()
      .then((db) => {
        if (active) {
          setDatabase(db.pokemon);
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Failed to load Pokemon database.");
        }
      });

    loadBattleData()
      .then((data) => {
        if (active) {
          setBattleData({ moves: data.moves, abilities: data.abilities, items: data.items });
        }
      })
      .catch((error) => {
        if (active) {
          setBattleDataError(error instanceof Error ? error.message : "Failed to load move and ability data.");
        }
      });

    listSpeciesMovesets()
      .then((entries) => {
        if (active) {
          setSpeciesMovesets(entries);
        }
      })
      .catch((error) => {
        if (active) {
          setStorageError(error instanceof Error ? error.message : "Failed to load moveset database.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const abilityByKey = useMemo(() => {
    const map = new Map<string, AbilityRecord>();

    for (const ability of battleData?.abilities ?? []) {
      map.set(ability.id, ability);
      map.set(ability.name.toLowerCase(), ability);
    }

    return map;
  }, [battleData]);

  const itemByKey = useMemo(() => {
    const map = new Map<string, ItemRecord>();

    for (const item of battleData?.items ?? []) {
      map.set(item.id, item);
      map.set(item.name.toLowerCase(), item);
    }

    return map;
  }, [battleData]);

  const moveByKey = useMemo(() => {
    const map = new Map<string, MoveRecord>();

    for (const move of battleData?.moves ?? []) {
      map.set(move.id, move);
      map.set(move.name.toLowerCase(), move);
    }

    return map;
  }, [battleData]);

  const speciesMovesetByKey = useMemo(() => {
    const map = new Map<string, PersistedSpeciesMoveset>();

    for (const entry of speciesMovesets) {
      map.set(entry.speciesKey, entry);
    }

    return map;
  }, [speciesMovesets]);

  const legalPokemon = useMemo(
    () => getEditablePokemonEntries(database, speciesMovesetByKey),
    [database, speciesMovesetByKey],
  );

  const filteredPokemon = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();

    if (!trimmed) {
      return legalPokemon;
    }

    return legalPokemon.filter((pokemon) => {
      const haystack = `${pokemon.name} ${pokemon.types.join(" ")}`.toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [legalPokemon, searchQuery]);

  useEffect(() => {
    if (filteredPokemon.length === 0) {
      setSelectedSpeciesKey(null);
      return;
    }

    setSelectedSpeciesKey((current) => {
      if (current && filteredPokemon.some((pokemon) => getPokemonMovesetKey(pokemon) === current)) {
        return current;
      }

      return getPokemonMovesetKey(filteredPokemon[0]);
    });
  }, [filteredPokemon]);

  const selectedPokemon =
    selectedSpeciesKey !== null
      ? legalPokemon.find((pokemon) => getPokemonMovesetKey(pokemon) === selectedSpeciesKey) ?? null
      : null;

  const selectedCustomMoveset =
    selectedSpeciesKey !== null ? speciesMovesetByKey.get(selectedSpeciesKey) ?? null : null;
  const selectedHasCustomOverride = Boolean(
    selectedCustomMoveset &&
      (
        (selectedCustomMoveset.knownMoves?.length ?? 0) > 0 ||
        selectedCustomMoveset.abilityName ||
        selectedCustomMoveset.itemName ||
        selectedCustomMoveset.statSpread
      ),
  );
  const selectedPreset = useMemo(() => (selectedPokemon ? getOpponentPreset(selectedPokemon) : null), [selectedPokemon]);
  const selectedPresetResolvedAbilityName = useMemo(
    () => (selectedPokemon ? getResolvedPresetAbilityName(selectedPokemon, selectedPreset) : null),
    [selectedPokemon, selectedPreset],
  );
  const selectedPresetAbility = useMemo(
    () =>
      selectedPresetResolvedAbilityName
        ? abilityByKey.get(selectedPresetResolvedAbilityName.toLowerCase()) ?? null
        : null,
    [abilityByKey, selectedPresetResolvedAbilityName],
  );
  const selectedPresetItem = useMemo(
    () =>
      selectedPreset?.itemName
        ? itemByKey.get(selectedPreset.itemName.toLowerCase()) ?? null
        : null,
    [itemByKey, selectedPreset],
  );
  const selectedResolvedMoveset = useMemo(
    () =>
      selectedPokemon
        ? resolveStoredOrPresetMoveset({
            pokemon: selectedPokemon,
            speciesMovesetByKey,
            moveByKey,
            limit: MAX_SPECIES_MOVESET_SIZE,
            normalizePokemonNameKey,
            getResolvedPresetAbilityName,
            isChampionsMegaEntry,
            getInheritedMovesetKey,
            sanitizeSavedAttacks,
            sanitizeKnownMovesToSavedAttacks,
          })
        : {
            savedAttacks: [],
            knownMoves: [],
            allMoveNames: [],
            abilityName: null,
            itemName: null,
            statSpread: null,
            movesetSource: "none" as const,
          },
    [moveByKey, selectedPokemon, speciesMovesetByKey],
  );
  const selectedPresetMoveNames = useMemo(
    () => (selectedPreset ? [...selectedPreset.moveNames] : []),
    [selectedPreset],
  );
  const selectedPresetMoveEntries = useMemo(
    () =>
      selectedPresetMoveNames.map((moveName) => ({
        name: moveName,
        move: getMoveRecordByName(moveName, moveByKey),
      })),
    [moveByKey, selectedPresetMoveNames],
  );
  const selectedCustomMoveEntries = useMemo(
    () =>
      draftKnownMoves.map((move) => {
        const moveName = getKnownMoveName(move);
        return {
          name: moveName,
          move: getMoveRecordByName(moveName, moveByKey),
        };
      }),
    [draftKnownMoves, moveByKey],
  );
  const draftAbilityRecord = useMemo(() => {
    const trimmed = draftAbilityName.trim().toLowerCase();
    return trimmed ? abilityByKey.get(trimmed) ?? null : null;
  }, [abilityByKey, draftAbilityName]);
  const draftItemRecord = useMemo(() => {
    const trimmed = draftItemName.trim().toLowerCase();
    return trimmed ? itemByKey.get(trimmed) ?? null : null;
  }, [draftItemName, itemByKey]);
  const draftSpread = useMemo(
    () =>
      selectedPokemon
        ? normalizeChampionsStatSpread(
            draftStatSpread ?? undefined,
            selectedResolvedMoveset.statSpread ?? getDefaultChampionsStatSpreadForPokemon(selectedPokemon),
          )
        : null,
    [draftStatSpread, selectedPokemon, selectedResolvedMoveset.statSpread],
  );
  const draftSpreadComputedStats = useMemo(
    () => (selectedPokemon && draftSpread ? getChampionsComputedStats(selectedPokemon, { spread: draftSpread }) : null),
    [draftSpread, selectedPokemon],
  );
  const draftSpreadTotalPoints = draftSpread ? getTotalChampionsStatPoints(draftSpread.statPoints) : 0;
  const draftSpreadRemainingPoints = CHAMPIONS_TOTAL_STAT_POINTS - draftSpreadTotalPoints;
  const presetSpread = useMemo(
    () => (selectedPokemon ? getDefaultChampionsStatSpreadForPokemon(selectedPokemon) : null),
    [selectedPokemon],
  );
  const natureOptions = useMemo(() => getChampionsNatureOptions(), []);

  useEffect(() => {
    if (!selectedPokemon) {
      setDraftKnownMoves([]);
      setDraftAbilityName("");
      setDraftItemName("");
      setDraftStatSpread(null);
      return;
    }

    const nextDraft = selectedCustomMoveset?.knownMoves?.length
      ? sanitizeKnownMoves(selectedCustomMoveset.knownMoves, moveByKey, MAX_SPECIES_MOVESET_SIZE)
      : selectedResolvedMoveset.knownMoves;

    setDraftKnownMoves(nextDraft);
    setDraftAbilityName(selectedResolvedMoveset.abilityName ?? "");
    setDraftItemName(selectedResolvedMoveset.itemName ?? "");
    setDraftStatSpread(
      selectedCustomMoveset?.statSpread
        ? normalizeChampionsStatSpread(selectedCustomMoveset.statSpread)
        : selectedResolvedMoveset.statSpread
          ? normalizeChampionsStatSpread(selectedResolvedMoveset.statSpread)
          : getDefaultChampionsStatSpreadForPokemon(selectedPokemon),
    );
  }, [moveByKey, selectedCustomMoveset, selectedPokemon, selectedResolvedMoveset]);

  const updateDraftKnownMove = (moveId: string, patch: Partial<PersistedKnownMove>) => {
    setDraftKnownMoves((current) =>
      current.map((move) => (move.id === moveId ? { ...move, ...patch } : move)),
    );
  };

  const addDraftKnownMove = () => {
    setDraftKnownMoves((current) => {
      if (!selectedPokemon || current.length >= MAX_SPECIES_MOVESET_SIZE) {
        return current;
      }

      return [...current, createKnownMove()];
    });
  };

  const removeDraftKnownMove = (moveId: string) => {
    setDraftKnownMoves((current) => current.filter((move) => move.id !== moveId));
  };

  const updateDraftKnownMoveLabel = (moveId: string, nextLabel: string) => {
    const trimmed = nextLabel.trim();
    const matchedMove = getMoveRecordByName(trimmed, moveByKey);

    if (matchedMove) {
      updateDraftKnownMove(moveId, {
        name: matchedMove.name,
        label: matchedMove.name,
        type: getMovePokemonType(matchedMove) ?? undefined,
        basePower: getMoveRecordDamageBasePower(matchedMove),
        category: matchedMove.category.toLowerCase() as PersistedKnownMove["category"],
        isSpreadMove: isSpreadTarget(matchedMove.target),
      });
      return;
    }

    updateDraftKnownMove(moveId, { name: nextLabel, label: nextLabel });
  };

  const updateDraftNature = (nature: ChampionsNatureId) => {
    if (!selectedPokemon) {
      return;
    }

    setDraftStatSpread((current) =>
      normalizeChampionsStatSpread(
        {
          ...(current ?? getDefaultChampionsStatSpreadForPokemon(selectedPokemon)),
          nature,
        },
        current ?? getDefaultChampionsStatSpreadForPokemon(selectedPokemon),
      ),
    );
  };

  const updateDraftStatPoints = (statId: ChampionsStatId, nextValue: number) => {
    if (!selectedPokemon) {
      return;
    }

    const baseSpread = draftSpread ?? getDefaultChampionsStatSpreadForPokemon(selectedPokemon);
    const currentValue = baseSpread.statPoints[statId];
    const sanitized = Math.max(0, Math.min(CHAMPIONS_MAX_STAT_POINTS_PER_STAT, Math.floor(nextValue)));
    const totalWithoutCurrent = getTotalChampionsStatPoints(baseSpread.statPoints) - currentValue;
    const clampedValue = Math.min(sanitized, CHAMPIONS_TOTAL_STAT_POINTS - totalWithoutCurrent);

    setDraftStatSpread(
      normalizeChampionsStatSpread({
        nature: baseSpread.nature,
        statPoints: {
          ...baseSpread.statPoints,
          [statId]: clampedValue,
        },
      }),
    );
  };

  const persistSpeciesMovesets = async (nextMoves: PersistedKnownMove[]) => {
    if (!selectedPokemon) {
      return;
    }

    try {
      setStorageError(null);
      const knownMoves = sanitizeKnownMoves(nextMoves, moveByKey, MAX_SPECIES_MOVESET_SIZE);
      const saved = await saveSpeciesMoveset(
        getPokemonMovesetKey(selectedPokemon),
        selectedPokemon.name,
        knownMoves,
        {
          abilityName: draftAbilityName.trim() || undefined,
          itemName: draftItemName.trim() || undefined,
          statSpread: draftSpread ?? undefined,
        },
      );
      const entries = await listSpeciesMovesets();
      setSpeciesMovesets(entries);
      setStorageMessage(`Saved moveset database entry for ${saved.speciesName}.`);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Failed to save moveset database entry.");
    }
  };

  const clearSpeciesMoveset = async () => {
    if (!selectedPokemon) {
      return;
    }

    try {
      setStorageError(null);
      await deleteSpeciesMoveset(getPokemonMovesetKey(selectedPokemon));
      const entries = await listSpeciesMovesets();
      setSpeciesMovesets(entries);
      setStorageMessage(`Removed the custom moveset for ${selectedPokemon.name}.`);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Failed to remove moveset database entry.");
    }
  };

  const resetDraftToPreset = () => {
    setDraftKnownMoves(selectedResolvedMoveset.knownMoves);
    setDraftAbilityName(selectedResolvedMoveset.abilityName ?? "");
    setDraftItemName(selectedResolvedMoveset.itemName ?? "");
    setDraftStatSpread(
      selectedResolvedMoveset.statSpread
        ? normalizeChampionsStatSpread(selectedResolvedMoveset.statSpread)
        : selectedPokemon
          ? getDefaultChampionsStatSpreadForPokemon(selectedPokemon)
          : null,
    );
  };

  return (
    <>
      <section className="team-builder-hero">
        <div>
          <p className="eyebrow">Moveset Database</p>
          <h2>Build defaults for legal Pokémon</h2>
          <p className="selector-note">
            This page tracks custom enemy defaults for {POKEMON_CHAMPIONS_ACTIVE_REGULATION}. The legal list is based
            on the current Regulation M-A pool sourced on {POKEMON_CHAMPIONS_LEGAL_LIST_SOURCED_AT}, and the imported
            meta sets now include moves, abilities, and items for enemy auto-fill in Team Builder.
          </p>
        </div>
        <div className="team-builder-meta">
          <span>{POKEMON_CHAMPIONS_LEGAL_SPECIES_NAMES.length} sourced Regulation M-A species</span>
          <span>{legalPokemon.length} editable entries</span>
          <span>{POKEMON_CHAMPIONS_ACTIVE_REGULATION}</span>
          <span>{POKEMON_CHAMPIONS_ACTIVE_REGULATION_WINDOW}</span>
        </div>
      </section>

      <section className="board-panel moveset-database-panel">
        <div className="moveset-database-layout">
          <aside className="moveset-sidebar">
            <div className="moveset-sidebar-header">
              <div>
                <p className="eyebrow">Legal List</p>
                <h2>Choose a Pokémon</h2>
              </div>
              <span>{filteredPokemon.length} shown</span>
            </div>

            <label className="team-input-label" htmlFor="moveset-search">
              Search
            </label>
            <input
              id="moveset-search"
              className="team-pokemon-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={database ? "Search by name or type" : "Loading local database..."}
              disabled={!database}
            />

            <div className="moveset-list">
              {filteredPokemon.length > 0 ? (
                filteredPokemon.map((pokemon) => {
                  const speciesKey = getPokemonMovesetKey(pokemon);
                  const customMoveset = speciesMovesetByKey.get(speciesKey) ?? null;
                  const hasCustomOverride = Boolean(
                    customMoveset &&
                      ((customMoveset.knownMoves?.length ?? 0) > 0 || customMoveset.abilityName || customMoveset.itemName),
                  );
                  const presetMoves = getOpponentPresetMoveNames(pokemon);
                  const isSelected = selectedSpeciesKey === speciesKey;

                  return (
                    <button
                      key={`moveset-pokemon-${speciesKey}`}
                      type="button"
                      className={`moveset-list-card ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedSpeciesKey(speciesKey)}
                    >
                      <div className="moveset-list-card-top">
                        <PokemonSprite pokemon={pokemon} className="moveset-list-sprite" />
                        <div>
                          <strong>{pokemon.name}</strong>
                          <p>
                            {hasCustomOverride
                              ? (customMoveset?.knownMoves?.length ?? 0) > 0
                                ? `${customMoveset?.knownMoves?.length ?? 0} custom move${(customMoveset?.knownMoves?.length ?? 0) === 1 ? "" : "s"}`
                                : customMoveset?.statSpread
                                  ? "Custom spread / overrides"
                                : "Custom ability/item override"
                              : presetMoves.length > 0
                                ? `${presetMoves.length} preset move${presetMoves.length === 1 ? "" : "s"}`
                                : "No preset yet"}
                          </p>
                        </div>
                      </div>

                      <div className="team-type-list">
                        {pokemon.types.map((typeLabel) => {
                          const type = getTypeFromLabel(typeLabel);
                          if (!type) {
                            return null;
                          }

                          return (
                            <span
                              key={`${pokemon.id}-${type}`}
                              className="inline-type-pill"
                              style={
                                {
                                  "--type-color": TYPE_META[type].color,
                                  "--type-accent": TYPE_META[type].accent,
                                } as CSSProperties
                              }
                            >
                              <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
                              {TYPE_META[type].label}
                            </span>
                          );
                        })}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="team-slot-empty">
                  {loadError ? loadError : "No legal Pokémon matched the current search."}
                </div>
              )}
            </div>
          </aside>

          <section className="moveset-detail-panel">
            {selectedPokemon ? (
              <>
                <div className="moveset-detail-header">
                  <div className="moveset-detail-title">
                    <div>
                      <p className="eyebrow">Species Defaults</p>
                      <h2>{selectedPokemon.name}</h2>
                    </div>
                    <PokemonSprite pokemon={selectedPokemon} className="moveset-detail-sprite" />
                  </div>

                  <div className="team-builder-meta">
                    <span>{selectedPokemon.baseSpecies}</span>
                    <span>
                      {selectedHasCustomOverride
                        ? "Using custom moveset"
                        : selectedPresetMoveNames.length > 0
                          ? "Using built-in preset"
                          : "No preset available"}
                    </span>
                    {selectedPreset ? <span>{selectedPreset.usageCount} uses</span> : null}
                    {selectedPreset ? <span>{selectedPreset.rating.toFixed(1)} rating</span> : null}
                    {selectedPreset ? <span>{selectedPreset.teamCount} teams</span> : null}
                  </div>
                </div>

                <div className="team-type-list">
                  {selectedPokemon.types.map((typeLabel) => {
                    const type = getTypeFromLabel(typeLabel);
                    if (!type) {
                      return null;
                    }

                    return (
                      <span
                        key={`${selectedPokemon.id}-${type}`}
                        className="inline-type-pill"
                        style={
                          {
                            "--type-color": TYPE_META[type].color,
                            "--type-accent": TYPE_META[type].accent,
                          } as CSSProperties
                        }
                      >
                        <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
                        {TYPE_META[type].label}
                      </span>
                    );
                  })}
                </div>

                <div className="quick-meta-row">
                  <span>HP {selectedPokemon.baseStats.hp}</span>
                  <span>Atk {selectedPokemon.baseStats.atk}</span>
                  <span>SpA {selectedPokemon.baseStats.spa}</span>
                  <span>Spe {selectedPokemon.baseStats.spe}</span>
                </div>

                {draftSpread && draftSpreadComputedStats ? (
                  <section className="moveset-stat-panel">
                    <div className="moveset-stat-panel-header">
                      <div>
                        <p className="eyebrow">Stat Spread</p>
                        <h3>Champions-style training</h3>
                      </div>
                      <span className="mini-type-pill neutral-pill">
                        {draftSpreadTotalPoints} / {CHAMPIONS_TOTAL_STAT_POINTS} SP
                      </span>
                    </div>

                    <div className="moveset-stat-panel-toolbar">
                      <label className="saved-attack-field">
                        <span>Nature</span>
                        <select
                          value={draftSpread.nature}
                          onChange={(event) => updateDraftNature(event.target.value as ChampionsNatureId)}
                        >
                          {natureOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="moveset-stat-panel-summary">
                        <span>{getStatSpreadSummary(draftSpread)}</span>
                        <span>{draftSpreadRemainingPoints} SP left</span>
                      </div>
                    </div>

                    {presetSpread ? (
                      <p className="selector-note">
                        <strong>Suggested default:</strong> {getStatSpreadSummary(presetSpread)}
                      </p>
                    ) : null}

                    <div className="moveset-stat-slider-list">
                      {CHAMPIONS_STAT_ORDER.map((statId) => {
                        const points = draftSpread.statPoints[statId];
                        const finalValue = draftSpreadComputedStats[statId];

                        return (
                          <label key={`${selectedPokemon.id}-spread-${statId}`} className="moveset-stat-slider-card">
                            <div className="moveset-stat-slider-top">
                              <strong>{CHAMPIONS_STAT_LABELS[statId]}</strong>
                              <span>{points} SP</span>
                              <em>{finalValue}</em>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={CHAMPIONS_MAX_STAT_POINTS_PER_STAT}
                              step={1}
                              value={points}
                              onChange={(event) => updateDraftStatPoints(statId, Number(event.target.value))}
                              className="moveset-stat-slider"
                              style={{ "--slider-fill": `${(points / CHAMPIONS_MAX_STAT_POINTS_PER_STAT) * 100}%` } as CSSProperties}
                            />
                            <div className="moveset-stat-slider-scale">
                              <span>0</span>
                              <span>{CHAMPIONS_MAX_STAT_POINTS_PER_STAT}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                <div className="attack-editor always-open">
                  <div className="attack-editor-topbar">
                    <p className="selector-note">
                      The custom moveset below now stores the full four-move set, including status and support moves.
                      Team Builder mirrors these full movesets, while the damage calculator still filters down to
                      damaging moves only.
                    </p>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={addDraftKnownMove}
                      disabled={draftKnownMoves.length >= MAX_SPECIES_MOVESET_SIZE || !selectedPokemon}
                    >
                      Add Move
                    </button>
                  </div>

                  <div className="saved-attack-editor-grid">
                    <label className="saved-attack-field">
                      <span>Ability</span>
                      <input
                        className="team-pokemon-input"
                        placeholder="Intimidate"
                        value={draftAbilityName}
                        onChange={(event) => setDraftAbilityName(event.target.value)}
                      />
                    </label>
                    <label className="saved-attack-field">
                      <span>Item</span>
                      <input
                        className="team-pokemon-input"
                        placeholder="Sitrus Berry"
                        value={draftItemName}
                        onChange={(event) => setDraftItemName(event.target.value)}
                      />
                    </label>
                  </div>
                  {draftAbilityRecord ? (
                    <p className="selector-note">
                      <strong>{draftAbilityRecord.name}:</strong>{" "}
                      {draftAbilityRecord.desc || draftAbilityRecord.shortDesc}
                    </p>
                  ) : null}
                  {draftItemRecord ? (
                    <p className="selector-note">
                      <strong>{draftItemRecord.name}:</strong> {draftItemRecord.desc || draftItemRecord.shortDesc}
                    </p>
                  ) : null}

                  <div className="moveset-preset-row">
                    <span className="lead-section-label cover">Built-In Preset</span>
                    {selectedPresetResolvedAbilityName || selectedPreset?.itemName ? (
                      <div className="quick-meta-row">
                        {selectedPresetResolvedAbilityName ? <span>Ability {selectedPresetResolvedAbilityName}</span> : null}
                        {selectedPreset?.itemName ? <span>Item {selectedPreset.itemName}</span> : null}
                      </div>
                    ) : null}
                    {selectedPresetAbility ? (
                      <p className="selector-note">
                        <strong>{selectedPresetAbility.name}:</strong>{" "}
                        {selectedPresetAbility.desc || selectedPresetAbility.shortDesc}
                      </p>
                    ) : null}
                    {selectedPresetItem ? (
                      <p className="selector-note">
                        <strong>{selectedPresetItem.name}:</strong>{" "}
                        {selectedPresetItem.desc || selectedPresetItem.shortDesc}
                      </p>
                    ) : null}
                    <div className="coverage-chip-list">
                      {selectedPresetMoveEntries.length > 0 ? (
                        selectedPresetMoveEntries.map((entry) => (
                          <span key={`${selectedPokemon.id}-preset-name-${entry.name}`} className="mini-type-pill neutral-pill">
                            {entry.name}
                          </span>
                        ))
                      ) : (
                        <span className="subtle-empty">No built-in preset for this species yet.</span>
                      )}
                    </div>
                  </div>

                  {selectedPresetMoveEntries.length > 0 ? (
                    <section className="damage-loaded-move-list">
                      <div className="coverage-preview-header">
                        <p className="eyebrow">Imported Movepool</p>
                        <span>{selectedPresetMoveEntries.length} moves</span>
                      </div>

                      {selectedPresetMoveEntries.map((entry) => {
                        const resolvedType = entry.move ? getTypeFromLabel(entry.move.type) : null;

                        return (
                          <article key={`moveset-preset-detail-${selectedPokemon.id}-${entry.name}`} className="damage-loaded-move-row">
                            <div className="damage-loaded-move-top">
                              <div className="damage-loaded-move-main">
                                {resolvedType ? (
                                  <span
                                    className="inline-type-pill"
                                    style={
                                      {
                                        "--type-color": TYPE_META[resolvedType].color,
                                        "--type-accent": TYPE_META[resolvedType].accent,
                                      } as CSSProperties
                                    }
                                  >
                                    <img src={getTypeIconUrl(resolvedType)} alt="" aria-hidden="true" />
                                    {TYPE_META[resolvedType].label}
                                  </span>
                                ) : null}
                                <div className="damage-loaded-move-copy">
                                  <strong>{entry.name}</strong>
                                  <p>
                                    {entry.move
                                      ? `${entry.move.category}${
                                          entry.move.basePower > 0 || isLowKickMove(entry.move.name)
                                            ? ` • Power ${isLowKickMove(entry.move.name) ? "Weight" : entry.move.basePower}`
                                            : ""
                                        }${entry.move.priority !== 0 ? ` • Priority ${entry.move.priority}` : ""}`
                                      : "Move data not found in the local battle database."}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="damage-result-card ready">
                              <p>{entry.move?.desc || entry.move?.shortDesc || "No description found."}</p>
                            </div>
                          </article>
                        );
                      })}
                    </section>
                  ) : null}

                  {draftKnownMoves.length > 0 ? (
                    <div className="saved-attack-editor-list">
                      {draftKnownMoves.map((move, moveIndex) => {
                        const matchedMove = selectedCustomMoveEntries[moveIndex]?.move ?? null;
                        const moveType = getKnownMoveType(move);
                        const category = getKnownMoveCategory(move, selectedPokemon);
                        const basePower = getKnownMoveBasePower(move);
                        const isWeightBasedPowerMove = isLowKickMove(getKnownMoveName(move));

                        return (
                          <article key={move.id} className="saved-attack-editor-card">
                            <div className="saved-attack-editor-header">
                              {moveType ? (
                                <span
                                  className="mini-type-pill"
                                  style={
                                    {
                                      "--type-color": TYPE_META[moveType].color,
                                      "--type-accent": TYPE_META[moveType].accent,
                                    } as CSSProperties
                                  }
                                >
                                  Move {moveIndex + 1}
                                </span>
                              ) : (
                                <span className="mini-type-pill neutral-pill">Move {moveIndex + 1}</span>
                              )}
                              <span className="mini-type-pill neutral-pill">
                                {category === "status"
                                  ? "Status"
                                  : category === "physical"
                                    ? "Physical"
                                    : "Special"}
                              </span>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => removeDraftKnownMove(move.id)}
                              >
                                Remove
                              </button>
                            </div>

                            {matchedMove?.desc || matchedMove?.shortDesc ? (
                              <p className="selector-note">{matchedMove?.desc || matchedMove?.shortDesc}</p>
                            ) : null}

                            <label className="saved-attack-field wide">
                              <span>Move Name</span>
                              <input
                                list="moveset-database-options"
                                className="team-pokemon-input"
                                placeholder="Protect"
                                value={getKnownMoveName(move)}
                                onChange={(event) => updateDraftKnownMoveLabel(move.id, event.target.value)}
                              />
                            </label>

                            <div className="saved-attack-editor-grid">
                              <label className="saved-attack-field">
                                <span>Type</span>
                                <select
                                  value={moveType ?? ""}
                                  onChange={(event) =>
                                    updateDraftKnownMove(move.id, {
                                      type: event.target.value ? event.target.value as PokemonType : undefined,
                                    })
                                  }
                                >
                                  <option value="">Unknown</option>
                                  {TYPE_ORDER.map((type) => (
                                    <option key={`${move.id}-${type}`} value={type}>
                                      {TYPE_META[type].label}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="saved-attack-field">
                                <span>Base Power</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  inputMode="numeric"
                                  placeholder={category === "status" ? "Status" : isWeightBasedPowerMove ? "Weight" : "80"}
                                  value={getAttackBasePowerDisplay(basePower ?? undefined)}
                                  disabled={category === "status" || isWeightBasedPowerMove}
                                  onChange={(event) => {
                                    const parsed = Number(event.target.value);
                                    updateDraftKnownMove(move.id, {
                                      basePower:
                                        event.target.value.trim() && Number.isFinite(parsed) && parsed > 0
                                          ? Math.floor(parsed)
                                          : undefined,
                                    });
                                  }}
                                />
                              </label>
                            </div>

                            <div className="saved-attack-editor-controls">
                              <div className="damage-category-toggle" role="group" aria-label="Saved move category">
                                {(["physical", "special", "status"] as const).map((nextCategory) => (
                                  <button
                                    key={`${move.id}-${nextCategory}`}
                                    type="button"
                                    className={`damage-category-button ${category === nextCategory ? "active" : ""}`}
                                    onClick={() =>
                                      updateDraftKnownMove(move.id, {
                                        category: nextCategory,
                                        basePower: nextCategory === "status" ? undefined : isWeightBasedPowerMove ? 0 : basePower ?? 80,
                                      })}
                                  >
                                    {nextCategory === "physical"
                                      ? "Physical"
                                      : nextCategory === "special"
                                        ? "Special"
                                        : "Status"}
                                  </button>
                                ))}
                              </div>

                              <button
                                type="button"
                                className={`attack-default-toggle ${Boolean(move.isSpreadMove) ? "active" : ""}`}
                                disabled={category === "status"}
                                onClick={() =>
                                  updateDraftKnownMove(move.id, { isSpreadMove: !Boolean(move.isSpreadMove) })}
                              >
                                {category === "status"
                                  ? "Status Move"
                                  : Boolean(move.isSpreadMove)
                                    ? "Spread Move"
                                    : "Single Target"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="team-slot-empty">No moves saved yet for this species.</div>
                  )}

                  <div className="attack-editor-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={resetDraftToPreset}
                      disabled={!selectedPokemon}
                    >
                      Reset To Defaults
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={clearSpeciesMoveset}
                      disabled={!selectedCustomMoveset}
                    >
                      Clear Custom
                    </button>
                    <button type="button" className="primary-button" onClick={() => void persistSpeciesMovesets(draftKnownMoves)}>
                      Save Species Moveset
                    </button>
                  </div>

                  {storageMessage ? <p className="storage-message success">{storageMessage}</p> : null}
                  {storageError ? <p className="storage-message error">{storageError}</p> : null}
                  {!storageError && battleDataError ? <p className="storage-message error">{battleDataError}</p> : null}
                </div>
              </>
            ) : (
              <div className="matchup-empty-board">
                {loadError ? loadError : "Choose a legal Pokémon from the list to edit its default moveset."}
              </div>
            )}
          </section>
        </div>
      </section>

      <datalist id="moveset-database-options">
        {(battleData?.moves ?? []).map((move, index) => (
          <option key={`${move.id}-${move.name}-${index}`} value={move.name} />
        ))}
      </datalist>
    </>
  );
}

function MoveFinderView() {
  const [database, setDatabase] = useState<PokemonRecord[] | null>(null);
  const [battleData, setBattleData] = useState<{ moves: MoveRecord[] } | null>(null);
  const [learnsets, setLearnsets] = useState<ChampionsLearnsetRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [battleDataError, setBattleDataError] = useState<string | null>(null);
  const [moveQuery, setMoveQuery] = useState("");
  const [pokemonQuery, setPokemonQuery] = useState("");
  const [abilityQuery, setAbilityQuery] = useState("");
  const [speedComparator, setSpeedComparator] = useState<MoveFinderSpeedComparator>("any");
  const [speedMetric, setSpeedMetric] = useState<MoveFinderSpeedMetric>("base");
  const [speedValue, setSpeedValue] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([loadPokemonDatabase(), loadBattleData(), loadChampionsLearnsets()])
      .then(([db, data, championsLearnsets]) => {
        if (active) {
          setDatabase(db.pokemon);
          setBattleData({ moves: data.moves });
          setLearnsets(championsLearnsets.learnsets);
        }
      })
      .catch((error) => {
        if (active) {
          const message = error instanceof Error ? error.message : "Failed to load move finder data.";
          setLoadError(message);
          setBattleDataError(message);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const moveByKey = useMemo(() => {
    const map = new Map<string, MoveRecord>();

    for (const move of battleData?.moves ?? []) {
      map.set(move.id, move);
      map.set(move.name.toLowerCase(), move);
    }

    return map;
  }, [battleData]);

  const learnsetBySpeciesId = useMemo(() => {
    const map = new Map<string, ReadonlySet<string>>();

    for (const learnset of learnsets ?? []) {
      map.set(normalizePokemonNameKey(learnset.speciesId), new Set(learnset.moveIds));
    }

    return map;
  }, [learnsets]);

  const legalPokemon = useMemo(() => getCurrentRegulationMoveFinderEntries(database), [database]);
  const abilitySuggestions = useMemo(() => {
    const abilities = new Set<string>();

    for (const pokemon of legalPokemon) {
      for (const abilityName of getPokemonAbilityNames(pokemon)) {
        abilities.add(abilityName);
      }
    }

    return Array.from(abilities).sort((left, right) => left.localeCompare(right));
  }, [legalPokemon]);
  const selectedMove = useMemo(() => getMoveRecordByName(moveQuery, moveByKey), [moveByKey, moveQuery]);
  const selectedMoveType = selectedMove ? getTypeFromLabel(selectedMove.type) : null;
  const normalizedMoveQuery = normalizeTextKey(moveQuery);
  const speedThreshold = useMemo(() => parseMoveFinderSpeedThreshold(speedValue), [speedValue]);
  const selectedSpeedMetricLabel = getMoveFinderSpeedMetricLabel(speedMetric);
  const moveSuggestions = useMemo(() => {
    if (!normalizedMoveQuery || selectedMove) {
      return [];
    }

    return (battleData?.moves ?? [])
      .filter((move) => normalizeTextKey(move.name).includes(normalizedMoveQuery))
      .sort((left, right) => {
        const leftKey = normalizeTextKey(left.name);
        const rightKey = normalizeTextKey(right.name);
        const leftStartsWith = leftKey.startsWith(normalizedMoveQuery);
        const rightStartsWith = rightKey.startsWith(normalizedMoveQuery);

        if (leftStartsWith !== rightStartsWith) {
          return leftStartsWith ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, 8);
  }, [battleData, normalizedMoveQuery, selectedMove]);

  const learnerRows = useMemo<MoveLearnerRow[]>(() => {
    if (!selectedMove) {
      return [];
    }

    const pokemonFilter = normalizeTextKey(pokemonQuery);
    const abilityFilter = normalizeTextKey(abilityQuery);
    const hasSpeedFilter = speedComparator !== "any" && speedThreshold !== null;
    const rows: MoveLearnerRow[] = [];

    for (const pokemon of legalPokemon) {
      const learnsetMoveIds = getLearnsetMoveIdsForPokemon(pokemon, learnsetBySpeciesId);

      if (!learnsetMoveIds.has(selectedMove.id)) {
        continue;
      }

      if (
        pokemonFilter &&
        !normalizeTextKey(pokemon.name).includes(pokemonFilter) &&
        !pokemon.types.some((typeLabel) => normalizeTextKey(typeLabel).includes(pokemonFilter))
      ) {
        continue;
      }

      const abilityNames = getPokemonAbilityNames(pokemon);

      if (abilityFilter && !abilityNames.some((abilityName) => normalizeTextKey(abilityName).includes(abilityFilter))) {
        continue;
      }

      const speed = buildSpeedTierRow(pokemon);
      const selectedSpeed = getMoveFinderSpeedValue(speed, speedMetric);

      if (hasSpeedFilter) {
        if (speedComparator === "atLeast" && selectedSpeed < speedThreshold) {
          continue;
        }

        if (speedComparator === "atMost" && selectedSpeed > speedThreshold) {
          continue;
        }
      }

      const presetHasMove = getOpponentPresetMoveNames(pokemon).some(
        (moveName) => normalizeTextKey(moveName) === selectedMove.id,
      );

      rows.push({
        pokemon,
        abilityNames,
        speed,
        learnsetMoveCount: learnsetMoveIds.size,
        presetHasMove,
      });
    }

    return rows;
  }, [abilityQuery, learnsetBySpeciesId, legalPokemon, pokemonQuery, selectedMove, speedComparator, speedMetric, speedThreshold]);

  return (
    <>
      <section className="team-builder-hero">
        <div>
          <p className="eyebrow">Move Finder</p>
          <h2>Find legal Pokémon by learnable move</h2>
          <p className="selector-note">
            Search the current {POKEMON_CHAMPIONS_ACTIVE_REGULATION} pool against generated @pkmn/dex learnsets.
          </p>
        </div>
        <div className="team-builder-meta">
          <span>{selectedMove ? `${learnerRows.length} match${learnerRows.length === 1 ? "" : "es"}` : "No move selected"}</span>
          <span>{legalPokemon.length} regulation entries</span>
          <span>{POKEMON_CHAMPIONS_ACTIVE_REGULATION_WINDOW}</span>
        </div>
      </section>

      <section className="board-panel move-finder-panel">
        <div className="move-finder-toolbar">
          <div className="move-finder-field">
            <label className="team-input-label" htmlFor="move-finder-move">
              Move
            </label>
            <input
              id="move-finder-move"
              className="team-pokemon-input"
              list="move-finder-options"
              placeholder={battleData ? "Tailwind" : "Loading move data..."}
              value={moveQuery}
              onChange={(event) => setMoveQuery(event.target.value)}
              disabled={!battleData || !learnsets}
            />
          </div>

          <div className="move-finder-field">
            <label className="team-input-label" htmlFor="move-finder-pokemon-filter">
              Pokémon
            </label>
            <input
              id="move-finder-pokemon-filter"
              className="team-pokemon-input"
              placeholder="Name or type"
              value={pokemonQuery}
              onChange={(event) => setPokemonQuery(event.target.value)}
              disabled={!selectedMove}
            />
          </div>

          <div className="move-finder-field">
            <label className="team-input-label" htmlFor="move-finder-ability-filter">
              Ability
            </label>
            <input
              id="move-finder-ability-filter"
              className="team-pokemon-input"
              list="move-finder-ability-options"
              placeholder="Prankster"
              value={abilityQuery}
              onChange={(event) => setAbilityQuery(event.target.value)}
              disabled={!selectedMove}
            />
          </div>

          <div className="move-finder-field move-finder-field--speed">
            <label className="team-input-label" htmlFor="move-finder-speed-value">
              Speed
            </label>
            <div className="move-finder-speed-controls">
              <select
                className="team-select"
                aria-label="Speed comparison"
                value={speedComparator}
                onChange={(event) => setSpeedComparator(event.target.value as MoveFinderSpeedComparator)}
                disabled={!selectedMove}
              >
                {MOVE_FINDER_SPEED_COMPARATOR_OPTIONS.map((option) => (
                  <option key={`move-finder-speed-comparator-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="team-select"
                aria-label="Speed stat"
                value={speedMetric}
                onChange={(event) => setSpeedMetric(event.target.value as MoveFinderSpeedMetric)}
                disabled={!selectedMove}
              >
                {MOVE_FINDER_SPEED_METRIC_OPTIONS.map((option) => (
                  <option key={`move-finder-speed-metric-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                id="move-finder-speed-value"
                className="team-pokemon-input"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="100"
                value={speedValue}
                onChange={(event) => setSpeedValue(event.target.value)}
                disabled={!selectedMove || speedComparator === "any"}
              />
            </div>
          </div>
        </div>

        {loadError || battleDataError ? (
          <p className="storage-message error">{loadError ?? battleDataError}</p>
        ) : selectedMove ? (
          <>
            <article className="move-finder-selected-move">
              <div className="move-finder-selected-move__main">
                {selectedMoveType ? (
                  <span
                    className="inline-type-pill"
                    style={
                      {
                        "--type-color": TYPE_META[selectedMoveType].color,
                        "--type-accent": TYPE_META[selectedMoveType].accent,
                      } as CSSProperties
                    }
                  >
                    <img src={getTypeIconUrl(selectedMoveType)} alt="" aria-hidden="true" />
                    {TYPE_META[selectedMoveType].label}
                  </span>
                ) : null}
                <div>
                  <strong>{selectedMove.name}</strong>
                  <p>
                    {selectedMove.category}
                    {selectedMove.basePower > 0 || isLowKickMove(selectedMove.name)
                      ? ` · Power ${isLowKickMove(selectedMove.name) ? "Weight" : selectedMove.basePower}`
                      : ""}
                    {selectedMove.priority !== 0 ? ` · Priority ${selectedMove.priority}` : ""}
                  </p>
                </div>
              </div>
              <p>{selectedMove.desc || selectedMove.shortDesc || "No description found."}</p>
            </article>

            {learnerRows.length > 0 ? (
              <div className="move-finder-results" role="list" aria-label={`${selectedMove.name} learners`}>
                {learnerRows.map((row) => (
                  <article key={`move-finder-${selectedMove.id}-${row.pokemon.id}`} className="move-finder-result-card" role="listitem">
                    <div className="move-finder-result-main">
                      <PokemonSprite pokemon={row.pokemon} className="move-finder-result-sprite" />
                      <div>
                        <strong>{row.pokemon.name}</strong>
                        <div className="team-type-list">
                          {row.pokemon.types.map((typeLabel) => {
                            const type = getTypeFromLabel(typeLabel);

                            return type ? (
                              <span
                                key={`move-finder-${row.pokemon.id}-${type}`}
                                className="inline-type-pill"
                                style={
                                  {
                                    "--type-color": TYPE_META[type].color,
                                    "--type-accent": TYPE_META[type].accent,
                                  } as CSSProperties
                                }
                              >
                                <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
                                {TYPE_META[type].label}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="move-finder-result-meta">
                      {row.presetHasMove ? <span className="move-finder-preset-pill">Preset Uses Move</span> : null}
                      <span>{selectedSpeedMetricLabel} {getMoveFinderSpeedValue(row.speed, speedMetric)}</span>
                      {row.abilityNames.length > 0 ? (
                        <span className="move-finder-ability-pill" title={row.abilityNames.join(" / ")}>
                          {row.abilityNames.join(" / ")}
                        </span>
                      ) : null}
                      <span>{row.learnsetMoveCount} learnable moves</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="matchup-empty-board">
                No current-regulation Pokémon match {selectedMove.name}
                {pokemonQuery.trim() ? ` with "${pokemonQuery.trim()}"` : ""}.
              </div>
            )}
          </>
        ) : moveSuggestions.length > 0 ? (
          <div className="move-finder-suggestions">
            <div className="coverage-preview-header">
              <p className="eyebrow">Closest Moves</p>
              <span>{moveSuggestions.length} shown</span>
            </div>
            <div className="coverage-chip-list">
              {moveSuggestions.map((move, index) => {
                const moveType = getTypeFromLabel(move.type);

                return (
                  <button
                    key={`move-finder-suggestion-${move.id}-${index}`}
                    type="button"
                    className="move-finder-suggestion-chip"
                    onClick={() => setMoveQuery(move.name)}
                  >
                    {moveType ? (
                      <span
                        className="speed-tier-type-dot"
                        style={{ "--type-color": TYPE_META[moveType].color } as CSSProperties}
                        title={TYPE_META[moveType].label}
                      />
                    ) : null}
                    {move.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="matchup-empty-board">
            {battleData ? "No move selected." : "Loading move finder data..."}
          </div>
        )}
      </section>

      <datalist id="move-finder-options">
        {(battleData?.moves ?? []).map((move, index) => (
          <option key={`move-finder-option-${move.id}-${index}`} value={move.name} />
        ))}
      </datalist>
      <datalist id="move-finder-ability-options">
        {abilitySuggestions.map((abilityName, index) => (
          <option key={`move-finder-ability-option-${normalizeTextKey(abilityName)}-${index}`} value={abilityName} />
        ))}
      </datalist>
    </>
  );
}

function SpeedTiersView() {
  const [database, setDatabase] = useState<PokemonRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SpeedTierSort>("boosted");

  useEffect(() => {
    let active = true;

    loadPokemonDatabase()
      .then((db) => {
        if (active) {
          setDatabase(db.pokemon);
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Failed to load Pokemon database.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const speedRows = useMemo(() => {
    const normalizedQuery = normalizeTextKey(query);
    const rows = getChampionsSpeedTierEntries(database)
      .map(buildSpeedTierRow)
      .filter((row) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          normalizeTextKey(row.pokemon.name).includes(normalizedQuery) ||
          row.pokemon.types.some((typeLabel) => normalizeTextKey(typeLabel).includes(normalizedQuery))
        );
      });

    return rows.sort((left, right) => {
      if (sortMode === "name") {
        return left.pokemon.name.localeCompare(right.pokemon.name);
      }

      const leftValue =
        sortMode === "base" ? left.baseSpeed : sortMode === "neutral" ? left.maxSpeed : left.boostedSpeed;
      const rightValue =
        sortMode === "base" ? right.baseSpeed : sortMode === "neutral" ? right.maxSpeed : right.boostedSpeed;

      return rightValue - leftValue || right.baseSpeed - left.baseSpeed || left.pokemon.name.localeCompare(right.pokemon.name);
    });
  }, [database, query, sortMode]);

  return (
    <>
      <section className="team-builder-hero">
        <div>
          <p className="eyebrow">Speed Tiers</p>
          <h2>Champions speed benchmarks for max Speed spreads</h2>
          <p className="selector-note">
            Compare legal Regulation M-A Pokémon at base Speed, 32 Speed, and 32 Speed with a Speed-boosting nature.
          </p>
        </div>
        <div className="team-builder-meta">
          <span>{speedRows.length} shown</span>
          <span>32 Spe</span>
          <span>Jolly / Timid</span>
        </div>
      </section>

      <section className="board-panel speed-tiers-panel">
        <div className="speed-tiers-toolbar">
          <label className="team-input-label" htmlFor="speed-tier-search">
            Search
          </label>
          <input
            id="speed-tier-search"
            className="team-pokemon-input"
            placeholder={database ? "Search Pokémon or type" : "Loading local database..."}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!database}
          />
          <label className="team-input-label" htmlFor="speed-tier-sort">
            Sort
          </label>
          <select
            id="speed-tier-sort"
            className="team-select speed-tier-sort"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SpeedTierSort)}
          >
            <option value="boosted">32 Spe + Speed Nature</option>
            <option value="neutral">32 Spe</option>
            <option value="base">Base Speed</option>
            <option value="name">Name</option>
          </select>
        </div>

        {loadError ? (
          <p className="storage-message error">{loadError}</p>
        ) : speedRows.length > 0 ? (
          <div className="speed-tier-table" role="table" aria-label="Pokemon Champions speed tiers">
            <div className="speed-tier-table-row speed-tier-table-head" role="row">
              <span role="columnheader">Pokémon</span>
              <span role="columnheader">Base</span>
              <span role="columnheader">32 Spe</span>
              <span role="columnheader">32 Spe + Nature</span>
            </div>
            {speedRows.map((row) => (
              <div key={row.pokemon.id} className="speed-tier-table-row" role="row">
                <div className="speed-tier-pokemon" role="cell">
                  <PokemonSprite pokemon={row.pokemon} className="speed-tier-sprite" />
                  <div>
                    <strong>{row.pokemon.name}</strong>
                    <div className="speed-tier-types">
                      {row.pokemon.types.map((typeLabel) => {
                        const type = getTypeFromLabel(typeLabel);

                        return type ? (
                          <span
                            key={`${row.pokemon.id}-${type}`}
                            className="speed-tier-type-dot"
                            style={{ "--type-color": TYPE_META[type].color } as CSSProperties}
                            title={TYPE_META[type].label}
                          />
                        ) : null;
                      })}
                    </div>
                  </div>
                </div>
                <strong className="speed-tier-number" role="cell">{row.baseSpeed}</strong>
                <strong className="speed-tier-number" role="cell">{row.maxSpeed}</strong>
                <strong className="speed-tier-number boosted" role="cell">{row.boostedSpeed}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="matchup-empty-board">
            {database ? "No Pokémon match that search." : "Loading local database..."}
          </div>
        )}
      </section>
    </>
  );
}

function TrainingOptimizerView() {
  const [database, setDatabase] = useState<PokemonRecord[] | null>(null);
  const [battleData, setBattleData] = useState<{ moves: MoveRecord[] } | null>(null);
  const [speciesMovesets, setSpeciesMovesets] = useState<PersistedSpeciesMoveset[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [battleDataError, setBattleDataError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [targetQuery, setTargetQuery] = useState("");
  const [metaQuery, setMetaQuery] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedMetaIds, setSelectedMetaIds] = useState<string[]>([]);
  const [damageWeather, setDamageWeather] = useState<DamageWeather>("none");
  const [damageTerrain, setDamageTerrain] = useState<DamageTerrain>("none");
  const [targetGrounded, setTargetGrounded] = useState(true);
  const [damageAttackStage, setDamageAttackStage] = useState(0);
  const [damageDefenseStage, setDamageDefenseStage] = useState(0);
  const [includeAttackerItems, setIncludeAttackerItems] = useState(true);
  const [includeAttackerAbilities, setIncludeAttackerAbilities] = useState(true);
  const [damageReflect, setDamageReflect] = useState(false);
  const [damageLightScreen, setDamageLightScreen] = useState(false);
  const [damageAuroraVeil, setDamageAuroraVeil] = useState(false);
  const [remainderMode, setRemainderMode] = useState<TrainingRemainderMode>("auto");
  const [runSignature, setRunSignature] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    loadPokemonDatabase()
      .then((db) => {
        if (active) {
          setDatabase(db.pokemon);
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Failed to load Pokemon database.");
        }
      });

    loadBattleData()
      .then((data) => {
        if (active) {
          setBattleData({ moves: data.moves });
        }
      })
      .catch((error) => {
        if (active) {
          setBattleDataError(error instanceof Error ? error.message : "Failed to load move data.");
        }
      });

    listSpeciesMovesets()
      .then((entries) => {
        if (active) {
          setSpeciesMovesets(entries);
        }
      })
      .catch((error) => {
        if (active) {
          setStorageError(error instanceof Error ? error.message : "Failed to load moveset database.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const moveByKey = useMemo(() => {
    const map = new Map<string, MoveRecord>();

    for (const move of battleData?.moves ?? []) {
      map.set(move.id, move);
      map.set(move.name.toLowerCase(), move);
    }

    return map;
  }, [battleData]);

  const speciesMovesetByKey = useMemo(() => {
    const map = new Map<string, PersistedSpeciesMoveset>();

    for (const entry of speciesMovesets) {
      map.set(entry.speciesKey, entry);
    }

    return map;
  }, [speciesMovesets]);

  const trainingPokemon = useMemo(
    () => getTrainingOptimizerEntries(database, speciesMovesetByKey),
    [database, speciesMovesetByKey],
  );

  const pokemonByKey = useMemo(() => {
    const map = new Map<string, PokemonRecord>();

    for (const pokemon of trainingPokemon) {
      map.set(pokemon.id, pokemon);
      map.set(pokemon.name.toLowerCase(), pokemon);
      map.set(normalizeTextKey(pokemon.name), pokemon);
      map.set(String(pokemon.num), pokemon);
    }

    return map;
  }, [trainingPokemon]);

  const trainingRows = useMemo<TrainingMetaRow[]>(() => {
    return trainingPokemon.map((pokemon) => {
      const moveset = getStoredOrPresetSavedAttacks(
        pokemon,
        speciesMovesetByKey,
        moveByKey,
        MAX_SPECIES_MOVESET_SIZE,
      );
      const damagingAttackCount = moveset.savedAttacks.filter((attack) => getResolvedAttackBasePower(attack) !== null).length;

      return {
        pokemon,
        moveset,
        damagingAttackCount,
      };
    });
  }, [moveByKey, speciesMovesetByKey, trainingPokemon]);

  const trainingRowById = useMemo(() => {
    const map = new Map<string, TrainingMetaRow>();

    for (const row of trainingRows) {
      map.set(row.pokemon.id, row);
    }

    return map;
  }, [trainingRows]);

  const selectableMetaRows = useMemo(
    () => trainingRows.filter((row) => row.damagingAttackCount > 0),
    [trainingRows],
  );

  const selectedTarget = selectedTargetId ? pokemonByKey.get(selectedTargetId) ?? null : null;
  const matchedTarget = useMemo(() => {
    const trimmed = targetQuery.trim();

    if (!trimmed) {
      return null;
    }

    return pokemonByKey.get(trimmed.toLowerCase()) ?? pokemonByKey.get(normalizeTextKey(trimmed)) ?? null;
  }, [pokemonByKey, targetQuery]);
  const matchedMetaRow = useMemo(() => {
    const trimmed = metaQuery.trim();

    if (!trimmed) {
      return null;
    }

    const pokemon = pokemonByKey.get(trimmed.toLowerCase()) ?? pokemonByKey.get(normalizeTextKey(trimmed)) ?? null;
    return pokemon ? trainingRowById.get(pokemon.id) ?? null : null;
  }, [metaQuery, pokemonByKey, trainingRowById]);

  useEffect(() => {
    setTargetGrounded(selectedTarget ? isLikelyGrounded(selectedTarget) : true);
  }, [selectedTarget]);

  const selectedMetaRows = useMemo(
    () =>
      selectedMetaIds
        .map((pokemonId) => trainingRowById.get(pokemonId) ?? null)
        .filter((row): row is TrainingMetaRow => Boolean(row)),
    [selectedMetaIds, trainingRowById],
  );

  const topMetaIds = useMemo(() => {
    const rowByMovesetKey = new Map(
      selectableMetaRows.map((row) => [getPokemonMovesetKey(row.pokemon), row.pokemon.id] as const),
    );
    const ids: string[] = [];
    const sortedPresets = [...OPPONENT_PRESET_RECORDS].sort((left, right) => {
      return (
        right.usageCount - left.usageCount ||
        right.rating - left.rating ||
        right.teamCount - left.teamCount ||
        left.displayName.localeCompare(right.displayName)
      );
    });

    for (const preset of sortedPresets) {
      const pokemonId = rowByMovesetKey.get(preset.speciesKey);

      if (!pokemonId || ids.includes(pokemonId)) {
        continue;
      }

      ids.push(pokemonId);

      if (ids.length >= 8) {
        break;
      }
    }

    return ids;
  }, [selectableMetaRows]);

  const targetMoveset = selectedTarget
    ? getStoredOrPresetSavedAttacks(selectedTarget, speciesMovesetByKey, moveByKey, MAX_SPECIES_MOVESET_SIZE)
    : null;
  const targetBaselineSpread = selectedTarget
    ? targetMoveset?.statSpread ?? getDefaultChampionsStatSpreadForPokemon(selectedTarget)
    : null;
  const targetStats =
    selectedTarget && targetBaselineSpread
      ? getChampionsComputedStats(selectedTarget, { spread: targetBaselineSpread })
      : null;
  const trainingAttacks = useMemo(
    () =>
      selectedMetaRows.flatMap((row) =>
        buildTrainingOptimizerAttacks({
          row,
          includeAttackerAbilities,
          includeAttackerItems,
        }),
      ),
    [includeAttackerAbilities, includeAttackerItems, selectedMetaRows],
  );
  const optimizerSettings = useMemo(
    () => ({
      weather: damageWeather,
      terrain: damageTerrain,
      defenderGrounded: targetGrounded,
      attackerStatStage: damageAttackStage,
      defenderStatStage: damageDefenseStage,
      defenderAbility: selectedTarget ? getDefaultDamageAbilityId(selectedTarget) : "none",
      defenderItem: "none" as DamageItemId,
      reflect: damageReflect,
      lightScreen: damageLightScreen,
      auroraVeil: damageAuroraVeil,
    }),
    [
      damageAttackStage,
      damageAuroraVeil,
      damageDefenseStage,
      damageLightScreen,
      damageReflect,
      damageTerrain,
      damageWeather,
      selectedTarget,
      targetGrounded,
    ],
  );
  const currentRunSignature = useMemo(
    () =>
      JSON.stringify({
        target: selectedTarget?.id ?? null,
        meta: selectedMetaIds,
        weather: damageWeather,
        terrain: damageTerrain,
        targetGrounded,
        damageAttackStage,
        damageDefenseStage,
        includeAttackerItems,
        includeAttackerAbilities,
        damageReflect,
        damageLightScreen,
        damageAuroraVeil,
        remainderMode,
        attacks: trainingAttacks.map((attack) => `${attack.id}:${attack.attackerAbility}:${attack.attackerItem}`),
      }),
    [
      damageAttackStage,
      damageAuroraVeil,
      damageDefenseStage,
      damageLightScreen,
      damageReflect,
      damageTerrain,
      damageWeather,
      includeAttackerAbilities,
      includeAttackerItems,
      remainderMode,
      selectedMetaIds,
      selectedTarget,
      targetGrounded,
      trainingAttacks,
    ],
  );
  const optimizerScan = useMemo<TrainingOptimizerScan | null>(() => {
    if (
      !selectedTarget ||
      !targetBaselineSpread ||
      trainingAttacks.length === 0 ||
      runSignature !== currentRunSignature
    ) {
      return null;
    }

    const optimized = findOptimalTrainingSpreads({
      defender: selectedTarget,
      attacks: trainingAttacks,
      settings: optimizerSettings,
      resultLimit: 12,
      remainderMode,
    });
    const baseline = evaluateTrainingBaseline({
      defender: selectedTarget,
      spread: targetBaselineSpread,
      attacks: trainingAttacks,
      settings: optimizerSettings,
    });

    return {
      ...optimized,
      baseline,
    };
  }, [
    currentRunSignature,
    optimizerSettings,
    remainderMode,
    runSignature,
    selectedTarget,
    targetBaselineSpread,
    trainingAttacks,
  ]);

  const canRunScan = Boolean(selectedTarget && selectedMetaRows.length > 0 && trainingAttacks.length > 0);
  const scanIsCurrent = canRunScan && runSignature === currentRunSignature && Boolean(optimizerScan);
  const scanIsStale = canRunScan && runSignature !== null && runSignature !== currentRunSignature;
  const matchedMetaAlreadyAdded = matchedMetaRow ? selectedMetaIds.includes(matchedMetaRow.pokemon.id) : false;
  const bestResult = optimizerScan?.results[0] ?? null;

  const setMatchedTarget = () => {
    if (!matchedTarget) {
      return;
    }

    setSelectedTargetId(matchedTarget.id);
    setTargetQuery("");
  };

  const addMatchedMeta = () => {
    if (!matchedMetaRow || matchedMetaRow.damagingAttackCount === 0) {
      return;
    }

    setSelectedMetaIds((current) =>
      current.includes(matchedMetaRow.pokemon.id) ? current : [...current, matchedMetaRow.pokemon.id],
    );
    setMetaQuery("");
  };

  const addTopMeta = () => {
    setSelectedMetaIds((current) => Array.from(new Set([...current, ...topMetaIds])));
  };

  const removeMeta = (pokemonId: string) => {
    setSelectedMetaIds((current) => current.filter((entry) => entry !== pokemonId));
  };

  return (
    <>
      <section className="team-builder-hero">
        <div>
          <p className="eyebrow">Training Optimizer</p>
          <h2>Find defensive Champions spreads into selected meta threats</h2>
          <p className="selector-note">
            Optimizes worst-roll survival against each selected meta Pokemon&apos;s strongest configured damaging move.
          </p>
        </div>
        <div className="team-builder-meta">
          <span>{selectedMetaRows.length} meta selected</span>
          <span>{trainingAttacks.length} damaging moves</span>
          <span>{optimizerScan ? `${optimizerScan.candidateCount.toLocaleString()} spreads` : "Unique defensive outcomes"}</span>
        </div>
      </section>

      <section className="board-panel training-optimizer-panel">
        <div className="training-optimizer-topbar">
          <div>
            <p className="eyebrow">Spread Lab</p>
            <h2>{selectedTarget ? selectedTarget.name : "Pick a Pokemon to train"}</h2>
          </div>
          <div className="training-run-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setRunSignature(currentRunSignature)}
              disabled={!canRunScan}
            >
              Run Optimization
            </button>
            <span>
              {scanIsCurrent
                ? "Scan current"
                : scanIsStale
                  ? "Selections changed"
                  : canRunScan
                    ? "Ready"
                    : "Needs target and meta"}
            </span>
          </div>
        </div>

        {loadError || battleDataError || storageError ? (
          <p className="storage-message error">{loadError ?? battleDataError ?? storageError}</p>
        ) : (
          <>
            <div className="training-optimizer-grid">
              <article className="damage-side-card training-picker-card">
                <div className="damage-side-header">
                  <p className="eyebrow">Target</p>
                  {targetMoveset?.statSpread ? (
                    <span className="damage-assumption-pill">Saved spread baseline</span>
                  ) : (
                    <span className="damage-assumption-pill">Template baseline</span>
                  )}
                </div>

                <div className="training-search-stack">
                  <label className="team-input-label" htmlFor="training-target-search">
                    Pokemon
                  </label>
                  <div className="ohko-target-input-row">
                    <input
                      id="training-target-search"
                      className="team-pokemon-input"
                      list="training-target-options"
                      placeholder={database ? "Search a legal Pokemon" : "Loading local database..."}
                      value={targetQuery}
                      onChange={(event) => setTargetQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          setMatchedTarget();
                        }
                      }}
                      disabled={!database}
                    />
                    <button
                      type="button"
                      className="primary-button"
                      onClick={setMatchedTarget}
                      disabled={!matchedTarget}
                    >
                      Set
                    </button>
                  </div>
                </div>

                {selectedTarget && targetStats && targetBaselineSpread ? (
                  <article className="training-selected-target">
                    <div className="ohko-selected-target-top">
                      <PokemonSprite pokemon={selectedTarget} className="damage-side-sprite" />
                      <div>
                        <strong>{selectedTarget.name}</strong>
                        <p>{getStatSpreadSummary(targetBaselineSpread)}</p>
                      </div>
                    </div>
                    <div className="damage-stat-strip">
                      <span>HP {targetStats.hp}</span>
                      <span>Def {targetStats.def}</span>
                      <span>SpD {targetStats.spd}</span>
                      <span>Spe {targetStats.spe}</span>
                    </div>
                  </article>
                ) : (
                  <div className="matchup-empty-board compact">No target selected.</div>
                )}
              </article>

              <article className="damage-center-panel training-picker-card">
                <div className="damage-side-header">
                  <p className="eyebrow">Meta Set</p>
                  <span className="damage-assumption-pill">{selectableMetaRows.length} configured threats</span>
                </div>

                <div className="training-search-stack">
                  <label className="team-input-label" htmlFor="training-meta-search">
                    Meta Pokemon
                  </label>
                  <div className="training-meta-input-row">
                    <input
                      id="training-meta-search"
                      className="team-pokemon-input"
                      list="training-meta-options"
                      placeholder={battleData ? "Search preset or custom threat" : "Loading move data..."}
                      value={metaQuery}
                      onChange={(event) => setMetaQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addMatchedMeta();
                        }
                      }}
                      disabled={!battleData}
                    />
                    <button
                      type="button"
                      className="primary-button"
                      onClick={addMatchedMeta}
                      disabled={!matchedMetaRow || matchedMetaAlreadyAdded || matchedMetaRow.damagingAttackCount === 0}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={addTopMeta}
                      disabled={topMetaIds.length === 0}
                    >
                      Top Meta
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setSelectedMetaIds([])}
                      disabled={selectedMetaIds.length === 0}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {selectedMetaRows.length > 0 ? (
                  <div className="ohko-target-chip-list training-meta-chip-list">
                    {selectedMetaRows.map((row) => (
                      <button
                        key={`training-meta-chip-${row.pokemon.id}`}
                        type="button"
                        className="ohko-target-chip training-meta-chip"
                        onClick={() => removeMeta(row.pokemon.id)}
                      >
                        <PokemonSprite pokemon={row.pokemon} className="training-meta-chip-sprite" />
                        <span>{row.pokemon.name}</span>
                        <strong>{row.damagingAttackCount} moves</strong>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="matchup-empty-board compact">No meta Pokemon selected.</div>
                )}

                <div className="damage-global-controls training-settings-controls">
                  <label className="damage-type-field">
                    <span>Weather</span>
                    <select
                      value={damageWeather}
                      onChange={(event) => setDamageWeather(event.target.value as DamageWeather)}
                    >
                      {WEATHER_OPTIONS.map((option) => (
                        <option key={`training-weather-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="damage-type-field">
                    <span>Terrain</span>
                    <select
                      value={damageTerrain}
                      onChange={(event) => setDamageTerrain(event.target.value as DamageTerrain)}
                    >
                      {TERRAIN_OPTIONS.map((option) => (
                        <option key={`training-terrain-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="damage-type-field">
                    <span>Remainder</span>
                    <select
                      value={remainderMode}
                      onChange={(event) => setRemainderMode(event.target.value as TrainingRemainderMode)}
                    >
                      <option value="auto">Auto Offense</option>
                      <option value="attack">Attack</option>
                      <option value="specialAttack">Special Attack</option>
                      <option value="speed">Speed</option>
                    </select>
                  </label>

                  <label className={`damage-spread-toggle ${targetGrounded ? "active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={targetGrounded}
                      onChange={(event) => setTargetGrounded(event.target.checked)}
                    />
                    <span>Target Grounded</span>
                  </label>

                  <label className={`damage-spread-toggle ${includeAttackerAbilities ? "active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={includeAttackerAbilities}
                      onChange={(event) => setIncludeAttackerAbilities(event.target.checked)}
                    />
                    <span>Meta Abilities</span>
                  </label>

                  <label className={`damage-spread-toggle ${includeAttackerItems ? "active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={includeAttackerItems}
                      onChange={(event) => setIncludeAttackerItems(event.target.checked)}
                    />
                    <span>Meta Items</span>
                  </label>

                  <label className={`damage-spread-toggle ${damageReflect ? "active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={damageReflect}
                      onChange={(event) => setDamageReflect(event.target.checked)}
                    />
                    <span>Reflect</span>
                  </label>

                  <label className={`damage-spread-toggle ${damageLightScreen ? "active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={damageLightScreen}
                      onChange={(event) => setDamageLightScreen(event.target.checked)}
                    />
                    <span>Light Screen</span>
                  </label>

                  <label className={`damage-spread-toggle ${damageAuroraVeil ? "active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={damageAuroraVeil}
                      onChange={(event) => setDamageAuroraVeil(event.target.checked)}
                    />
                    <span>Aurora Veil</span>
                  </label>

                  <div className="damage-stage-control">
                    <span>Attack Boost</span>
                    <div className="damage-stage-stepper">
                      <button
                        type="button"
                        className="damage-stage-button"
                        onClick={() => setDamageAttackStage((current) => clampStatStage(current - 1))}
                      >
                        -
                      </button>
                      <strong>{damageAttackStage >= 0 ? `+${damageAttackStage}` : damageAttackStage}</strong>
                      <button
                        type="button"
                        className="damage-stage-button"
                        onClick={() => setDamageAttackStage((current) => clampStatStage(current + 1))}
                      >
                        +
                      </button>
                    </div>
                    <em>{formatFlatMultiplier(getStatStageMultiplier(damageAttackStage))}</em>
                  </div>

                  <div className="damage-stage-control">
                    <span>Defense Boost</span>
                    <div className="damage-stage-stepper">
                      <button
                        type="button"
                        className="damage-stage-button"
                        onClick={() => setDamageDefenseStage((current) => clampStatStage(current - 1))}
                      >
                        -
                      </button>
                      <strong>{damageDefenseStage >= 0 ? `+${damageDefenseStage}` : damageDefenseStage}</strong>
                      <button
                        type="button"
                        className="damage-stage-button"
                        onClick={() => setDamageDefenseStage((current) => clampStatStage(current + 1))}
                      >
                        +
                      </button>
                    </div>
                    <em>{formatFlatMultiplier(getStatStageMultiplier(damageDefenseStage))}</em>
                  </div>
                </div>
              </article>
            </div>

            {optimizerScan && bestResult ? (
              <>
                <div className="training-summary-grid">
                  <article className="training-summary-card baseline">
                    <p className="eyebrow">Baseline</p>
                    <h3>{optimizerScan.baseline ? getStatSpreadSummary(optimizerScan.baseline.spread) : "No baseline"}</h3>
                    {optimizerScan.baseline ? (
                      <>
                        <div className="training-summary-metrics">
                          <span>{optimizerScan.baseline.summary.survivesTwoHitCount} live 2+</span>
                          <span>{optimizerScan.baseline.summary.totalGuaranteedHits} total hits</span>
                          <span>{formatPercent(optimizerScan.baseline.summary.worstMaxPercent)}% worst</span>
                        </div>
                        <div className="damage-stat-strip">
                          <span>HP {optimizerScan.baseline.stats.hp}</span>
                          <span>Def {optimizerScan.baseline.stats.def}</span>
                          <span>SpD {optimizerScan.baseline.stats.spd}</span>
                        </div>
                      </>
                    ) : null}
                  </article>

                  <article className="training-summary-card best">
                    <p className="eyebrow">Best Spread</p>
                    <h3>{getStatSpreadSummary(bestResult.spread)}</h3>
                    <div className="training-summary-metrics">
                      <span>
                        {bestResult.summary.survivesTwoHitCount} live 2+{" "}
                        <em>
                          {formatTrainingMetricDelta(
                            getTrainingSummaryDelta(
                              bestResult.summary,
                              optimizerScan.baseline?.summary,
                              "survivesTwoHitCount",
                            ),
                          )}
                        </em>
                      </span>
                      <span>
                        {bestResult.summary.totalGuaranteedHits} total hits{" "}
                        <em>
                          {formatTrainingMetricDelta(
                            getTrainingSummaryDelta(
                              bestResult.summary,
                              optimizerScan.baseline?.summary,
                              "totalGuaranteedHits",
                            ),
                          )}
                        </em>
                      </span>
                      <span>{formatPercent(bestResult.summary.worstMaxPercent)}% worst</span>
                    </div>
                    <div className="damage-stat-strip">
                      <span>HP {bestResult.stats.hp}</span>
                      <span>Def {bestResult.stats.def}</span>
                      <span>SpD {bestResult.stats.spd}</span>
                      <span>Spe {bestResult.stats.spe}</span>
                    </div>
                  </article>
                </div>

                <div className="scout-section-header">
                  <p className="eyebrow">Optimal Spreads</p>
                  <span>
                    {optimizerScan.results.length} shown from {optimizerScan.candidateCount.toLocaleString()} candidates
                  </span>
                </div>

                <div className="training-result-list">
                  {optimizerScan.results.map((result, index) => {
                    const breakpointGains =
                      selectedTarget && targetBaselineSpread
                        ? getTrainingAttackBreakpointGains({
                            defender: selectedTarget,
                            result,
                            baselineSpread: targetBaselineSpread,
                            attacks: trainingAttacks,
                            settings: optimizerSettings,
                          })
                        : getTrainingBreakpointGains(result, optimizerScan.baseline);

                    return (
                      <article
                        key={`training-result-${result.spread.nature}-${index}-${result.stats.hp}-${result.stats.def}-${result.stats.spd}`}
                        className={`training-result-card ${index === 0 ? "best" : ""}`}
                      >
                        <div className="training-result-head">
                          <span className="training-result-rank">#{index + 1}</span>
                          <div>
                            <strong>{getStatSpreadSummary(result.spread)}</strong>
                            <p>
                              Score {Math.round(result.summary.score)} · {result.summary.survivesOneHitCount}/
                              {result.summary.evaluatedThreatCount} live one · {result.summary.survivesTwoHitCount}/
                              {result.summary.evaluatedThreatCount} live two
                            </p>
                          </div>
                        </div>

                        <p className="training-breakpoint-lead">
                          {getTrainingBreakpointLead(breakpointGains, result, optimizerScan.baseline)}
                        </p>

                        <div className="training-spread-breakdown">
                          <span>
                            <small>Defensive core</small>
                            <strong>{formatTrainingDefensiveAllocation(result.spread)}</strong>
                          </span>
                          <span>
                            <small>Remainder</small>
                            <strong>{formatTrainingRemainderAllocation(result.spread)}</strong>
                          </span>
                        </div>

                        <div className="damage-stat-strip">
                          <span>HP {result.stats.hp}</span>
                          <span>Def {result.stats.def}</span>
                          <span>SpD {result.stats.spd}</span>
                          <span>Atk {result.stats.atk}</span>
                          <span>SpA {result.stats.spa}</span>
                          <span>Spe {result.stats.spe}</span>
                        </div>

                        <div className="training-result-metrics">
                          <span>
                            2+ hits
                            <strong>{result.summary.survivesTwoHitCount}</strong>
                          </span>
                          <span>
                            3+ hits
                            <strong>{result.summary.survivesThreeHitCount}</strong>
                          </span>
                          <span>
                            Worst
                            <strong>{formatPercent(result.summary.worstMaxPercent)}%</strong>
                          </span>
                          <span>
                            Avg max
                            <strong>{formatPercent(result.summary.averageMaxPercent)}%</strong>
                          </span>
                        </div>

                        {breakpointGains.length > 0 ? (
                          <div className="training-breakpoint-list" aria-label="Breakpoint gains">
                            {breakpointGains.slice(0, 4).map((gain) => (
                              <div key={`${result.spread.nature}-${gain.attackerId}-${gain.moveLabel}`}>
                                <span>
                                  <strong>{gain.attackerName}</strong>
                                  <small>{gain.moveLabel}</small>
                                </span>
                                <em>
                                  {gain.previousKoLabel} → {gain.nextKoLabel}
                                </em>
                                <small>
                                  {formatPercent(gain.previousMaxPercent)}% → {formatPercent(gain.nextMaxPercent)}%
                                </small>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <details className="training-threat-details">
                          <summary>Highest-damage checks</summary>
                          <div className="training-threat-list">
                            {result.threatDetails.slice(0, 6).map((detail) => (
                              <div
                                key={`${result.spread.nature}-${detail.attackerId}-${detail.attackId}`}
                                className={`training-threat-row ${getTrainingThreatTone(detail)}`}
                              >
                                <span>
                                  <strong>{detail.attackerName}</strong>
                                  <small>{detail.moveLabel}</small>
                                </span>
                                <span>{formatPercent(detail.minPercent)}%-{formatPercent(detail.maxPercent)}%</span>
                                <em>{formatTrainingKoLabel(detail.guaranteedHitsSurvived)}</em>
                              </div>
                            ))}
                          </div>
                        </details>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="matchup-empty-board training-empty-board">
                {canRunScan
                  ? scanIsStale
                    ? "Run the optimizer to score the current target and meta set."
                    : "Run the optimizer when ready."
                  : "Choose a target Pokemon and at least one meta Pokemon with damaging moves."}
              </div>
            )}
          </>
        )}
      </section>

      <datalist id="training-target-options">
        {trainingPokemon.map((pokemon) => (
          <option key={`training-target-option-${pokemon.id}`} value={pokemon.name} />
        ))}
      </datalist>

      <datalist id="training-meta-options">
        {selectableMetaRows.map((row) => (
          <option key={`training-meta-option-${row.pokemon.id}`} value={row.pokemon.name} />
        ))}
      </datalist>
    </>
  );
}

function OhkoFinderView() {
  const [database, setDatabase] = useState<PokemonRecord[] | null>(null);
  const [battleData, setBattleData] = useState<{ moves: MoveRecord[] } | null>(null);
  const [speciesMovesets, setSpeciesMovesets] = useState<PersistedSpeciesMoveset[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [battleDataError, setBattleDataError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [targetQuery, setTargetQuery] = useState("");
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [damageWeather, setDamageWeather] = useState<DamageWeather>("none");
  const [damageTerrain, setDamageTerrain] = useState<DamageTerrain>("none");
  const [targetGrounded, setTargetGrounded] = useState(true);
  const [damageAttackStage, setDamageAttackStage] = useState(0);
  const [damageDefenseStage, setDamageDefenseStage] = useState(0);
  const [speedFilter, setSpeedFilter] = useState<OhkoSpeedFilter>("any");
  const [survivalFilter, setSurvivalFilter] = useState<OhkoSurvivalFilter>("any");

  useEffect(() => {
    let active = true;

    loadPokemonDatabase()
      .then((db) => {
        if (active) {
          setDatabase(db.pokemon);
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Failed to load Pokemon database.");
        }
      });

    loadBattleData()
      .then((data) => {
        if (active) {
          setBattleData({ moves: data.moves });
        }
      })
      .catch((error) => {
        if (active) {
          setBattleDataError(error instanceof Error ? error.message : "Failed to load move data.");
        }
      });

    listSpeciesMovesets()
      .then((entries) => {
        if (active) {
          setSpeciesMovesets(entries);
        }
      })
      .catch((error) => {
        if (active) {
          setStorageError(error instanceof Error ? error.message : "Failed to load moveset database.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const pokemonByKey = useMemo(() => {
    const map = new Map<string, PokemonRecord>();

    for (const pokemon of database ?? []) {
      map.set(pokemon.id, pokemon);
      map.set(pokemon.name.toLowerCase(), pokemon);
      map.set(String(pokemon.num), pokemon);
    }

    return map;
  }, [database]);

  const moveByKey = useMemo(() => {
    const map = new Map<string, MoveRecord>();

    for (const move of battleData?.moves ?? []) {
      map.set(move.id, move);
      map.set(move.name.toLowerCase(), move);
    }

    return map;
  }, [battleData]);

  const speciesMovesetByKey = useMemo(() => {
    const map = new Map<string, PersistedSpeciesMoveset>();

    for (const entry of speciesMovesets) {
      map.set(entry.speciesKey, entry);
    }

    return map;
  }, [speciesMovesets]);

  const editablePokemon = useMemo(
    () => getEditablePokemonEntries(database, speciesMovesetByKey),
    [database, speciesMovesetByKey],
  );

  const matchedTargetPokemon = useMemo(() => {
    const trimmed = targetQuery.trim();

    if (!trimmed) {
      return null;
    }

    return pokemonByKey.get(trimmed.toLowerCase()) ?? pokemonByKey.get(trimmed) ?? null;
  }, [pokemonByKey, targetQuery]);

  const selectedTargets = useMemo(
    () =>
      selectedTargetIds
        .map((pokemonId) => pokemonByKey.get(pokemonId) ?? null)
        .filter((pokemon): pokemon is PokemonRecord => Boolean(pokemon)),
    [pokemonByKey, selectedTargetIds],
  );

  useEffect(() => {
    setTargetGrounded(selectedTargets.length > 0 ? selectedTargets.every((pokemon) => isLikelyGrounded(pokemon)) : true);
  }, [selectedTargets]);

  const targetStoredMovesById = useMemo(
    () =>
      new Map(
        selectedTargets.map((pokemon) => [
          pokemon.id,
          getStoredOrPresetSavedAttacks(pokemon, speciesMovesetByKey, moveByKey, MAX_SPECIES_MOVESET_SIZE),
        ]),
      ),
    [moveByKey, selectedTargets, speciesMovesetByKey],
  );

  const addMatchedTarget = () => {
    if (!matchedTargetPokemon) {
      return;
    }

    setSelectedTargetIds((current) =>
      current.includes(matchedTargetPokemon.id) ? current : [...current, matchedTargetPokemon.id],
    );
    setTargetQuery("");
  };

  const removeTarget = (pokemonId: string) => {
    setSelectedTargetIds((current) => current.filter((entry) => entry !== pokemonId));
  };

  const clearTargets = () => {
    setSelectedTargetIds([]);
  };

  const attackerRows = useMemo(() => {
    if (selectedTargets.length === 0) {
      return [];
    }

    const selectedTargetIdSet = new Set(selectedTargets.map((pokemon) => pokemon.id));

    return editablePokemon
      .filter((attackerPokemon) => !selectedTargetIdSet.has(attackerPokemon.id))
      .map((attackerPokemon) => {
        const attackerGrounded = isLikelyGrounded(attackerPokemon);

        const storedMoves = getStoredOrPresetSavedAttacks(
          attackerPokemon,
          speciesMovesetByKey,
          moveByKey,
          MAX_SPECIES_MOVESET_SIZE,
        );

        const targetResults = selectedTargets.map((targetPokemon) => {
          const targetStoredMoves = targetStoredMovesById.get(targetPokemon.id) ?? {
            savedAttacks: [],
            statSpread: null,
            movesetSource: "none" as const,
          };

          return buildMatchupEloTargetResult({
            attackerPokemon,
            attackerSavedAttacks: storedMoves.savedAttacks,
            attackerStatSpread: storedMoves.statSpread,
            targetPokemon,
            targetSavedAttacks: targetStoredMoves.savedAttacks,
            targetStatSpread: targetStoredMoves.statSpread,
            weather: damageWeather,
            terrain: damageTerrain,
            attackerGrounded,
            targetGrounded,
            attackerStatStage: damageAttackStage,
            defenderStatStage: damageDefenseStage,
          });
        });
        const eloSummary = summarizeMatchupElo(targetResults);

        return {
          pokemon: attackerPokemon,
          movesetSource: storedMoves.movesetSource,
          targetResults,
          ...eloSummary,
        };
      })
      .filter((row) => row.coverageCount > 0)
      .filter((row) => {
        const matchesSpeed =
          speedFilter === "any"
            ? true
            : speedFilter === "outspeeds"
              ? row.fasterCount === selectedTargets.length
              : speedFilter === "notSlower"
                ? row.notSlowerCount === selectedTargets.length
                : row.targetResults.every((result) => result.speedDelta <= 0);
        const matchesSurvival =
          survivalFilter === "any"
            ? true
            : row.nonLosingSurviveCount === selectedTargets.length && row.surviveCount > 0;

        return matchesSpeed && matchesSurvival;
      })
      .sort((left, right) => compareMatchupEloSummaries(left, right));
  }, [
    damageAttackStage,
    damageDefenseStage,
    damageTerrain,
    damageWeather,
    editablePokemon,
    moveByKey,
    selectedTargets,
    targetStoredMovesById,
    speedFilter,
    speciesMovesetByKey,
    survivalFilter,
    targetGrounded,
  ]);

  const allTargetsCovered = attackerRows.filter((row) => row.coverageCount === selectedTargets.length);
  const allTargetsGuaranteed = attackerRows.filter((row) => row.guaranteedCount === selectedTargets.length);
  const allTargetsSurvived = attackerRows.filter((row) => row.nonLosingSurviveCount === selectedTargets.length);
  const scannedAttackers = selectedTargets.length > 0
    ? editablePokemon.filter((pokemon) => !selectedTargets.some((target) => target.id === pokemon.id)).length
    : editablePokemon.length;
  const targetTitle =
    selectedTargets.length === 0
      ? "Pick one or more Pokémon to scan"
      : selectedTargets.length <= 3
        ? selectedTargets.map((pokemon) => pokemon.name).join(" + ")
        : `${selectedTargets.length} selected targets`;
  const matchedTargetAlreadyAdded = matchedTargetPokemon ? selectedTargetIds.includes(matchedTargetPokemon.id) : false;

  return (
    <>
      <section className="team-builder-hero">
        <div>
          <p className="eyebrow">OHKO Finder</p>
          <h2>Search one or more targets and scan the field</h2>
          <p className="selector-note">
            This page checks the current Champions moveset database and ranks attackers across the whole selected target
            set, not just one matchup at a time.
          </p>
        </div>
        <div className="team-builder-meta">
          <span>{editablePokemon.length} attackers with configured moves</span>
          <span>Damaging moves only</span>
          <span>Level 50 rough calc</span>
        </div>
      </section>

      <section className="board-panel">
        <div className="ohko-finder-topbar">
          <div>
            <p className="eyebrow">Target Search</p>
            <h2>{targetTitle}</h2>
          </div>
          <div className="ohko-finder-search">
            <label className="team-input-label" htmlFor="ohko-target-search">
              Pokémon
            </label>
            <div className="ohko-target-input-row">
              <input
                id="ohko-target-search"
                className="team-pokemon-input"
                list="ohko-target-options"
                placeholder={database ? "Search any Pokémon in the local dex" : "Loading local database..."}
                value={targetQuery}
                onChange={(event) => setTargetQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addMatchedTarget();
                  }
                }}
                disabled={!database}
              />
              <button
                type="button"
                className="primary-button"
                onClick={addMatchedTarget}
                disabled={!matchedTargetPokemon || matchedTargetAlreadyAdded}
              >
                Add
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={clearTargets}
                disabled={selectedTargets.length === 0}
              >
                Clear
              </button>
            </div>
            {selectedTargets.length > 0 ? (
              <div className="ohko-target-chip-list">
                {selectedTargets.map((pokemon) => (
                  <button
                    key={`target-chip-${pokemon.id}`}
                    type="button"
                    className="ohko-target-chip"
                    onClick={() => removeTarget(pokemon.id)}
                  >
                    <img src={getPokemonSpriteUrl(pokemon.id)} alt="" aria-hidden="true" />
                    <span>{pokemon.name}</span>
                    <strong>Remove</strong>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {selectedTargets.length > 0 ? (
          <>
            <div className="ohko-overview-grid ohko-target-panel">
              <article className="damage-side-card defender ohko-target-card">
                <div className="damage-side-header">
                  <p className="eyebrow">Targets</p>
                  <span className="damage-assumption-pill">{selectedTargets.length} selected</span>
                </div>
                <div className="ohko-selected-target-list">
                  {selectedTargets.map((targetPokemon) => {
                    const targetSpread = targetStoredMovesById.get(targetPokemon.id)?.statSpread ?? null;
                    const targetStats = getChampionsComputedStats(targetPokemon, { spread: targetSpread });
                    const weakTypes = TYPE_ORDER.filter(
                      (attackType) => (getPokemonDefensiveMultiplier(targetPokemon, attackType) ?? 1) > 1,
                    );
                    const strongAgainstTypes = getCoveredDefendingTypes(getPokemonAttackTypeOptions(targetPokemon));

                    return (
                      <article key={`selected-target-${targetPokemon.id}`} className="ohko-selected-target-card">
                        <div className="ohko-selected-target-top">
                          <PokemonSprite pokemon={targetPokemon} className="damage-side-sprite" />
                          <div>
                            <strong>{targetPokemon.name}</strong>
                            <p>Spe {targetStats.spe}</p>
                          </div>
                        </div>
                        <div className="team-type-list">
                          {targetPokemon.types.map((typeLabel) => {
                            const type = getTypeFromLabel(typeLabel);
                            if (!type) {
                              return null;
                            }

                            return (
                              <span
                                key={`${targetPokemon.id}-${type}`}
                                className="inline-type-pill"
                                style={
                                  {
                                    "--type-color": TYPE_META[type].color,
                                    "--type-accent": TYPE_META[type].accent,
                                  } as CSSProperties
                                }
                              >
                                <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
                                {TYPE_META[type].label}
                              </span>
                            );
                          })}
                        </div>
                        <div className="damage-stat-strip">
                          <span>HP {targetStats.hp}</span>
                          <span>Def {targetStats.def}</span>
                          <span>SpD {targetStats.spd}</span>
                        </div>

                        <div className="enemy-weakness-block">
                          <span className="lead-section-label weak">Weak To</span>
                          <div className="coverage-chip-list">
                            {weakTypes.length > 0 ? (
                              weakTypes.map((type) => (
                                <span
                                  key={`${targetPokemon.id}-ohko-weak-${type}`}
                                  className="mini-type-pill"
                                  style={
                                    {
                                      "--type-color": TYPE_META[type].color,
                                      "--type-accent": TYPE_META[type].accent,
                                    } as CSSProperties
                                  }
                                >
                                  {TYPE_META[type].label}
                                </span>
                              ))
                            ) : (
                              <span className="subtle-empty">No listed weaknesses.</span>
                            )}
                          </div>
                        </div>

                        <div className="enemy-weakness-block">
                          <span className="lead-section-label cover">Strong Against</span>
                          <div className="coverage-chip-list">
                            {strongAgainstTypes.length > 0 ? (
                              strongAgainstTypes.map((type) => (
                                <span
                                  key={`${targetPokemon.id}-ohko-strong-${type}`}
                                  className="mini-type-pill"
                                  style={
                                    {
                                      "--type-color": TYPE_META[type].color,
                                      "--type-accent": TYPE_META[type].accent,
                                    } as CSSProperties
                                  }
                                >
                                  {TYPE_META[type].label}
                                </span>
                              ))
                            ) : (
                              <span className="subtle-empty">No STAB pressure shown.</span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </article>

              <article className="damage-center-panel ohko-settings-panel">
                <div className="damage-assumption-row">
                  <span className="damage-assumption-pill">{scannedAttackers} attackers scanned</span>
                  <span className="damage-assumption-pill">{allTargetsCovered.length} cover all targets</span>
                  <span className="damage-assumption-pill">{allTargetsGuaranteed.length} OHKO all targets</span>
                  <span className="damage-assumption-pill">{allTargetsSurvived.length} live all best hits</span>
                  <span className="damage-assumption-pill">No items</span>
                  <span className="damage-assumption-pill">Auto supported abilities</span>
                </div>

                <div className="damage-global-controls">
                  <label className="damage-type-field">
                    <span>Weather</span>
                    <select
                      value={damageWeather}
                      onChange={(event) => setDamageWeather(event.target.value as DamageWeather)}
                    >
                      {WEATHER_OPTIONS.map((option) => (
                        <option key={`ohko-weather-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="damage-type-field">
                    <span>Terrain</span>
                    <select
                      value={damageTerrain}
                      onChange={(event) => setDamageTerrain(event.target.value as DamageTerrain)}
                    >
                      {TERRAIN_OPTIONS.map((option) => (
                        <option key={`ohko-terrain-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={`damage-spread-toggle ${targetGrounded ? "active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={targetGrounded}
                      onChange={(event) => setTargetGrounded(event.target.checked)}
                    />
                    <span>Target Grounded</span>
                  </label>

                  <div className="damage-stage-control">
                    <span>Attack Boost</span>
                    <div className="damage-stage-stepper">
                      <button
                        type="button"
                        className="damage-stage-button"
                        onClick={() => setDamageAttackStage((current) => clampStatStage(current - 1))}
                      >
                        -
                      </button>
                      <strong>{damageAttackStage >= 0 ? `+${damageAttackStage}` : damageAttackStage}</strong>
                      <button
                        type="button"
                        className="damage-stage-button"
                        onClick={() => setDamageAttackStage((current) => clampStatStage(current + 1))}
                      >
                        +
                      </button>
                    </div>
                    <em>{formatFlatMultiplier(getStatStageMultiplier(damageAttackStage))}</em>
                  </div>

                  <div className="damage-stage-control">
                    <span>Defense Boost</span>
                    <div className="damage-stage-stepper">
                      <button
                        type="button"
                        className="damage-stage-button"
                        onClick={() => setDamageDefenseStage((current) => clampStatStage(current - 1))}
                      >
                        -
                      </button>
                      <strong>{damageDefenseStage >= 0 ? `+${damageDefenseStage}` : damageDefenseStage}</strong>
                      <button
                        type="button"
                        className="damage-stage-button"
                        onClick={() => setDamageDefenseStage((current) => clampStatStage(current + 1))}
                      >
                        +
                      </button>
                    </div>
                    <em>{formatFlatMultiplier(getStatStageMultiplier(damageDefenseStage))}</em>
                  </div>
                </div>

                <div className="ohko-filter-grid">
                  <div className="ohko-filter-card">
                    <span>Speed Filter</span>
                    <div className="ohko-filter-chips" role="group" aria-label="OHKO speed filter">
                      {([
                        ["any", "Any"],
                        ["outspeeds", "Faster Than All"],
                        ["notSlower", "Tie Or Faster Into All"],
                        ["slowerOrTie", "Tie Or Slower Into All"],
                      ] as const).map(([value, label]) => (
                        <button
                          key={`speed-filter-${value}`}
                          type="button"
                          className={`ohko-filter-chip ${speedFilter === value ? "active" : ""}`}
                          onClick={() => setSpeedFilter(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="ohko-filter-card">
                    <span>Counter Filter</span>
                    <div className="ohko-filter-chips" role="group" aria-label="OHKO survival filter">
                      {([
                        ["any", "Any KO"],
                        ["survivesBestHit", "Lives All Best Hits"],
                      ] as const).map(([value, label]) => (
                        <button
                          key={`survival-filter-${value}`}
                          type="button"
                          className={`ohko-filter-chip ${survivalFilter === value ? "active" : ""}`}
                          onClick={() => setSurvivalFilter(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="selector-note">
                  Attackers use their stored custom movesets first, then built-in presets. Fixed-damage or status moves
                  are skipped when they cannot be evaluated by the current formula. Matchup Elo prioritizes target
                  coverage first, then guaranteed KOs across the whole set, then clean survival into the selected
                  targets&apos; best configured hits, then speed control, then worst-case matchup quality.
                </p>
              </article>
            </div>

            <div className="scout-section-header">
              <p className="eyebrow">Best Answers</p>
              <span>{attackerRows.length} attackers found</span>
            </div>

            {attackerRows.length > 0 ? (
              <div className="ohko-result-list">
                {attackerRows.map((row) => (
                  <article
                    key={`ohko-attacker-${row.pokemon.id}`}
                    className={`opponent-coverage-row ohko-result-row ${
                      row.guaranteedCount === selectedTargets.length ? "strong" : ""
                    }`}
                  >
                    <div className="ohko-result-top">
                      <div className="opponent-coverage-main">
                        <PokemonSprite pokemon={row.pokemon} />
                        <div>
                          <strong>{row.pokemon.name}</strong>
                          <p>
                            Covers {row.coverageCount} / {selectedTargets.length} target
                            {selectedTargets.length === 1 ? "" : "s"} • {row.guaranteedCount} guaranteed •{" "}
                            {row.surviveCount} clean survives
                          </p>
                        </div>
                      </div>

                      <div className="ohko-summary-side">
                        <span className="mini-type-pill neutral-pill">
                          Worst-case Elo {Math.round(row.minTargetScore)}
                        </span>
                        <span className="mini-type-pill neutral-pill">
                          Avg Elo {Math.round(row.averageTargetScore)}
                        </span>
                        <span className="mini-type-pill neutral-pill">
                          {row.movesetSource === "custom" ? "Custom" : "Preset"}
                        </span>
                      </div>
                    </div>

                    <div className="ohko-breakdown-grid">
                      {row.targetResults.map((result) => (
                        <article
                          key={`${row.pokemon.id}-vs-${result.targetPokemon.id}`}
                          className={`ohko-breakdown-card ${
                            result.guaranteedOhko ? "strong" : result.possibleOhko ? "good" : ""
                          }`}
                        >
                          <div className="ohko-breakdown-top">
                            <div className="opponent-coverage-main">
                              <PokemonSprite pokemon={result.targetPokemon} />
                              <div>
                                <strong>{result.targetPokemon.name}</strong>
                                <p>
                                  {result.bestOutgoingHit
                                    ? `${getAttackLabel(result.bestOutgoingHit.attack)} • ${
                                        result.guaranteedOhko
                                          ? "Guaranteed OHKO"
                                          : result.possibleOhko
                                            ? "Possible OHKO"
                                            : "Best pressure"
                                      }`
                                    : "No damaging move found"}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`speed-matchup-pill ${
                                result.speedDelta > 0 ? "faster" : result.speedDelta < 0 ? "slower" : "tie"
                              }`}
                            >
                              {result.speedDelta > 0
                                ? `Outspeeds by ${result.speedDelta}`
                                : result.speedDelta < 0
                                  ? `Slower by ${Math.abs(result.speedDelta)}`
                                  : "Speed tie"}
                            </span>
                          </div>

                          <div className="coverage-chip-list">
                            {result.bestOutgoingHit ? (
                              <>
                                <span
                                  className="mini-type-pill"
                                  style={
                                    {
                                      "--type-color": TYPE_META[result.bestOutgoingHit.estimate.effectiveAttackType].color,
                                      "--type-accent":
                                        TYPE_META[result.bestOutgoingHit.estimate.effectiveAttackType].accent,
                                    } as CSSProperties
                                  }
                                >
                                  {TYPE_META[result.bestOutgoingHit.estimate.effectiveAttackType].label}
                                </span>
                                <span className="mini-type-pill neutral-pill">
                                  {formatPercent(result.bestOutgoingHit.estimate.minPercent)}% -{" "}
                                  {formatPercent(result.bestOutgoingHit.estimate.maxPercent)}%
                                </span>
                              </>
                            ) : (
                              <span className="mini-type-pill neutral-pill">No pressure</span>
                            )}

                            <span
                              className={`mini-type-pill neutral-pill ${
                                result.survivesBestIncomingHit === true
                                  ? "survival-pill good"
                                  : result.survivesBestIncomingHit === false
                                    ? "survival-pill bad"
                                    : ""
                              }`}
                            >
                              {result.survivesBestIncomingHit === true
                                ? "Lives best hit"
                                : result.survivesBestIncomingHit === false
                                  ? "Loses to best hit"
                                  : "No target moves"}
                            </span>
                          </div>

                          {result.bestIncomingHit ? (
                            <p className="ohko-result-subnote">
                              Incoming {getAttackLabel(result.bestIncomingHit.attack)}:{" "}
                              {formatPercent(result.bestIncomingHit.estimate.minPercent)}% -{" "}
                              {formatPercent(result.bestIncomingHit.estimate.maxPercent)}%
                            </p>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="matchup-empty-board">
                No configured attacker currently covers the selected target set under the active assumptions and
                filters.
              </div>
            )}
          </>
        ) : (
          <div className="matchup-empty-board">
            {loadError || battleDataError || storageError || "Add one or more target Pokémon to run the OHKO scan."}
          </div>
        )}
      </section>

      <datalist id="ohko-target-options">
        {(database ?? []).map((pokemon) => (
          <option key={pokemon.id} value={pokemon.name} />
        ))}
      </datalist>
    </>
  );
}

function MatchHistoryView() {
  const [entries, setEntries] = useState<PersistedMatchHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [teamSort, setTeamSort] = useState<MatchHistoryTeamSort>("latest");
  const [editingEntry, setEditingEntry] = useState<PersistedMatchHistoryEntry | null>(null);
  const [editResult, setEditResult] = useState<MatchResult>("won");
  const [editAllyBroughtSlotIndices, setEditAllyBroughtSlotIndices] = useState<number[]>([]);
  const [editEnemyBroughtSlotIndices, setEditEnemyBroughtSlotIndices] = useState<number[]>([]);
  const [editAllyLeadSlotIndices, setEditAllyLeadSlotIndices] = useState<number[]>([]);
  const [editEnemyLeadSlotIndices, setEditEnemyLeadSlotIndices] = useState<number[]>([]);

  const refresh = async () => {
    const nextEntries = await listMatchHistoryEntries();
    setEntries(nextEntries);
  };

  useEffect(() => {
    refresh().catch((refreshError) => {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to load match history.");
    });
  }, []);

  const removeEntry = async (entry: PersistedMatchHistoryEntry) => {
    try {
      setError(null);
      await deleteMatchHistoryEntry(entry.id);
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete match history entry.");
    }
  };

  const beginEditEntry = (entry: PersistedMatchHistoryEntry) => {
    setEditingEntry(entry);
    setEditResult(entry.result);
    setEditAllyBroughtSlotIndices(entry.allyBroughtSlotIndices);
    setEditEnemyBroughtSlotIndices(entry.enemyBroughtSlotIndices);
    setEditAllyLeadSlotIndices(entry.allyLeadSlotIndices);
    setEditEnemyLeadSlotIndices(entry.enemyLeadSlotIndices);
    setError(null);
  };

  const saveEditedEntry = async () => {
    if (!editingEntry) {
      return;
    }

    try {
      setError(null);
      await saveMatchHistoryEntry({
        id: editingEntry.id,
        playedAt: editingEntry.playedAt,
        result: editResult,
        allyTeamName: editingEntry.allyTeamName,
        allySlots: editingEntry.allySlots,
        enemySlots: editingEntry.enemySlots,
        allyBroughtSlotIndices: editAllyBroughtSlotIndices,
        enemyBroughtSlotIndices: editEnemyBroughtSlotIndices,
        allyLeadSlotIndices: editAllyLeadSlotIndices,
        enemyLeadSlotIndices: editEnemyLeadSlotIndices,
        allyBrought: buildPersistedMatchPokemonSnapshot(editingEntry.allySlots, editAllyBroughtSlotIndices),
        enemyBrought: buildPersistedMatchPokemonSnapshot(editingEntry.enemySlots, editEnemyBroughtSlotIndices),
        allyLeads: buildPersistedMatchPokemonSnapshot(editingEntry.allySlots, editAllyLeadSlotIndices),
        enemyLeads: buildPersistedMatchPokemonSnapshot(editingEntry.enemySlots, editEnemyLeadSlotIndices),
      });
      await refresh();
      setEditingEntry(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update match history entry.");
    }
  };

  const wins = entries.filter((entry) => entry.result === "won").length;
  const losses = entries.length - wins;
  const winRate = entries.length > 0 ? Math.round((wins / entries.length) * 100) : 0;
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, PersistedMatchHistoryEntry[]>();

    for (const entry of entries) {
      const teamName = entry.allyTeamName.trim() || "Unnamed Team";
      groups.set(teamName, [...(groups.get(teamName) ?? []), entry]);
    }

    return Array.from(groups.entries()).map(([teamName, teamEntries]) => {
      const teamWins = teamEntries.filter((entry) => entry.result === "won").length;
      const teamLosses = teamEntries.length - teamWins;
      const latestPlayedAt = teamEntries.reduce(
        (latest, entry) => (entry.playedAt > latest ? entry.playedAt : latest),
        teamEntries[0]?.playedAt ?? "",
      );

      return {
        teamName,
        entries: teamEntries,
        wins: teamWins,
        losses: teamLosses,
        winRate: teamEntries.length > 0 ? Math.round((teamWins / teamEntries.length) * 100) : 0,
        latestPlayedAt,
      };
    }).sort((left, right) => {
      if (teamSort === "name") {
        return left.teamName.localeCompare(right.teamName);
      }

      if (teamSort === "matches") {
        return right.entries.length - left.entries.length || right.latestPlayedAt.localeCompare(left.latestPlayedAt);
      }

      if (teamSort === "winRate") {
        return right.winRate - left.winRate || right.entries.length - left.entries.length;
      }

      return right.latestPlayedAt.localeCompare(left.latestPlayedAt);
    });
  }, [entries, teamSort]);

  return (
    <section className="match-history-page">
      <section className="team-builder-hero">
        <div>
          <p className="eyebrow">Match History</p>
          <h2>Review saved games</h2>
          <p className="selector-note">
            Track results, bring fours, and leads against saved enemy teams so patterns are easier to spot later.
          </p>
        </div>
        <div className="match-history-stats">
          <span>
            <strong>{entries.length}</strong>
            Matches
          </span>
          <span>
            <strong>{wins}</strong>
            Wins
          </span>
          <span>
            <strong>{losses}</strong>
            Losses
          </span>
          <span>
            <strong>{winRate}%</strong>
            Win Rate
          </span>
        </div>
      </section>

      {error ? <p className="storage-message error">{error}</p> : null}

      {entries.length > 0 ? (
        <div className="match-history-team-list">
          <div className="match-history-sort-bar">
            <label htmlFor="match-history-team-sort">
              <span>Sort Teams</span>
              <select
                id="match-history-team-sort"
                value={teamSort}
                onChange={(event) => setTeamSort(event.target.value as MatchHistoryTeamSort)}
              >
                <option value="latest">Latest Match</option>
                <option value="name">Team Name</option>
                <option value="matches">Most Matches</option>
                <option value="winRate">Best Win Rate</option>
              </select>
            </label>
          </div>
          {groupedEntries.map((group) => (
            <section key={group.teamName} className="match-history-team-group">
              <header className="match-history-team-group__header">
                <div>
                  <p className="eyebrow">Played Team</p>
                  <h3>{group.teamName}</h3>
                  <time dateTime={group.latestPlayedAt}>
                    Latest {new Date(group.latestPlayedAt).toLocaleString()}
                  </time>
                </div>
                <div className="match-history-team-group__stats">
                  <span>{group.entries.length} matches</span>
                  <span>{group.wins}W</span>
                  <span>{group.losses}L</span>
                  <span>{group.winRate}%</span>
                </div>
              </header>

              <div className="match-history-list">
                {group.entries.map((entry) => {
                  const playedAt = new Date(entry.playedAt);
                  return (
                    <article key={entry.id} className={`match-history-card ${entry.result}`}>
                      <header className="match-history-card__header">
                        <div>
                          <p className="eyebrow">{entry.result === "won" ? "Win" : "Loss"}</p>
                          <h3>{entry.result === "won" ? "Victory" : "Defeat"}</h3>
                          <time dateTime={entry.playedAt}>{playedAt.toLocaleString()}</time>
                        </div>
                        <div className="match-history-card__actions">
                          <button type="button" className="secondary-button" onClick={() => beginEditEntry(entry)}>
                            Edit
                          </button>
                          <button type="button" className="secondary-button" onClick={() => removeEntry(entry)}>
                            Delete
                          </button>
                        </div>
                      </header>

                      <div className="match-history-grid">
                        <MatchHistoryRoster
                          title="My team"
                          slots={entry.allySlots}
                          broughtSlotIndices={entry.allyBroughtSlotIndices}
                          leadSlotIndices={entry.allyLeadSlotIndices}
                        />
                        <MatchHistoryRoster
                          title="Enemy team"
                          slots={entry.enemySlots}
                          broughtSlotIndices={entry.enemyBroughtSlotIndices}
                          leadSlotIndices={entry.enemyLeadSlotIndices}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="match-history-empty">No match history yet. Save an enemy team from Team Builder after a game.</div>
      )}

      {editingEntry && typeof document !== "undefined"
        ? createPortal(
            <div
              className="showdown-import-modal match-save-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="match-history-edit-title"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setEditingEntry(null);
                }
              }}
            >
              <div className="showdown-import-modal__dialog match-save-modal__dialog" role="document">
                <header className="showdown-import-modal__header">
                  <div className="showdown-import-modal__title">
                    <span className="eyebrow">Match History</span>
                    <h3 id="match-history-edit-title">Edit saved match</h3>
                  </div>
                  <button
                    type="button"
                    className="showdown-import-modal__close"
                    onClick={() => setEditingEntry(null)}
                    aria-label="Close edit match dialog"
                    title="Close"
                  >
                    ×
                  </button>
                </header>
                <div className="showdown-import-modal__body match-save-modal__body">
                  <div className="match-save-result-toggle" aria-label="Match result">
                    <button
                      type="button"
                      className={editResult === "won" ? "active" : ""}
                      onClick={() => setEditResult("won")}
                    >
                      Won
                    </button>
                    <button
                      type="button"
                      className={editResult === "lost" ? "active" : ""}
                      onClick={() => setEditResult("lost")}
                    >
                      Lost
                    </button>
                  </div>

                  <MatchHistoryEditSelector
                    title="Who I brought"
                    slots={editingEntry.allySlots}
                    selectedSlotIndices={editAllyBroughtSlotIndices}
                    maxSelections={4}
                    onChange={setEditAllyBroughtSlotIndices}
                  />
                  <MatchHistoryEditSelector
                    title="My leads"
                    slots={editingEntry.allySlots}
                    selectedSlotIndices={editAllyLeadSlotIndices}
                    maxSelections={2}
                    onChange={setEditAllyLeadSlotIndices}
                  />
                  <MatchHistoryEditSelector
                    title="Who enemy brought"
                    slots={editingEntry.enemySlots}
                    selectedSlotIndices={editEnemyBroughtSlotIndices}
                    maxSelections={4}
                    onChange={setEditEnemyBroughtSlotIndices}
                  />
                  <MatchHistoryEditSelector
                    title="Enemy leads"
                    slots={editingEntry.enemySlots}
                    selectedSlotIndices={editEnemyLeadSlotIndices}
                    maxSelections={2}
                    onChange={setEditEnemyLeadSlotIndices}
                  />
                </div>
                <footer className="showdown-import-modal__footer">
                  <button type="button" className="secondary-button" onClick={() => setEditingEntry(null)}>
                    Cancel
                  </button>
                  <div className="showdown-import-modal__footer-spacer" />
                  <button
                    type="button"
                    className="primary-button"
                    onClick={saveEditedEntry}
                    disabled={editAllyBroughtSlotIndices.length === 0 || editEnemyBroughtSlotIndices.length === 0}
                  >
                    Save Changes
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function MatchHistoryRoster({
  title,
  slots,
  broughtSlotIndices,
  leadSlotIndices,
}: {
  title: string;
  slots: PersistedTeamSlot[];
  broughtSlotIndices: number[];
  leadSlotIndices: number[];
}) {
  const visibleSlots = slots
    .map((slot, slotIndex) => ({ slot, slotIndex }))
    .filter(({ slot }) => Boolean(slot.pokemonId || slot.query.trim()));
  const broughtSlotSet = new Set(broughtSlotIndices);
  const leadSlotSet = new Set(leadSlotIndices);

  return (
    <section className="match-history-group">
      <strong>{title}</strong>
      <div
        className="match-history-roster"
        title={formatMatchPokemonNames(
          visibleSlots.map(({ slot, slotIndex }) => ({
            name: getMatchHistorySlotName(slot, slotIndex),
          })),
        )}
      >
        {visibleSlots.length > 0 ? (
          visibleSlots.map(({ slot, slotIndex }) => {
            const isBrought = broughtSlotSet.has(slotIndex);
            const isLead = leadSlotSet.has(slotIndex);
            return (
              <span
                key={`${title}-${slotIndex}-${slot.pokemonId ?? slot.query}`}
                className={`match-history-pokemon${isBrought ? " brought" : ""}${isLead ? " lead" : ""}`}
              >
                {slot.pokemonId ? <img src={getPokemonSpriteUrl(slot.pokemonId)} alt="" loading="lazy" /> : null}
                <span className="match-history-pokemon__name">{getMatchHistorySlotName(slot, slotIndex)}</span>
                {isLead ? <em>Lead</em> : isBrought ? <em>Brought</em> : <em>Bench</em>}
              </span>
            );
          })
        ) : (
          <span className="subtle-empty">Not recorded</span>
        )}
      </div>
      <div className="match-history-legend" aria-hidden="true">
        <span className="brought">Brought</span>
        <span className="lead">Lead</span>
      </div>
    </section>
  );
}

function MatchHistoryEditSelector({
  title,
  slots,
  selectedSlotIndices,
  maxSelections,
  onChange,
}: {
  title: string;
  slots: PersistedTeamSlot[];
  selectedSlotIndices: number[];
  maxSelections: number;
  onChange: Dispatch<SetStateAction<number[]>>;
}) {
  const visibleSlots = slots
    .map((slot, slotIndex) => ({ slot, slotIndex }))
    .filter(({ slot }) => Boolean(slot.pokemonId || slot.query.trim()));

  return (
    <section className="match-save-section">
      <div className="match-save-section__header">
        <strong>{title}</strong>
        <span>
          {selectedSlotIndices.length}/{maxSelections}
        </span>
      </div>
      <div className="match-save-option-grid">
        {visibleSlots.length > 0 ? (
          visibleSlots.map(({ slot, slotIndex }) => {
            const selected = selectedSlotIndices.includes(slotIndex);
            return (
              <button
                key={`${title}-${slotIndex}-${slot.pokemonId ?? slot.query}`}
                type="button"
                className={`match-save-option${selected ? " selected" : ""}`}
                onClick={() =>
                  onChange((current) => {
                    if (current.includes(slotIndex)) {
                      return current.filter((selectedSlotIndex) => selectedSlotIndex !== slotIndex);
                    }

                    return [...current, slotIndex].slice(0, maxSelections);
                  })
                }
                aria-pressed={selected}
              >
                {slot.pokemonId ? (
                  <img
                    className="match-save-option__sprite"
                    src={getPokemonSpriteUrl(slot.pokemonId)}
                    alt=""
                    loading="lazy"
                  />
                ) : null}
                <span>
                  <strong>{getMatchHistorySlotName(slot, slotIndex)}</strong>
                  <small>Slot {slotIndex + 1}</small>
                </span>
              </button>
            );
          })
        ) : (
          <p className="selector-note">No Pokemon recorded for this side.</p>
        )}
      </div>
    </section>
  );
}

const FEATURE_VISIBILITY_STORAGE_KEY = "pokemon-champions-helper-feature-visibility-v1";
const HIDE_BRING_4_STORAGE_KEY = "pokemon-champions-helper-hide-bring-4-v1";

function loadHideBring4Setting(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const storedValue = window.localStorage.getItem(HIDE_BRING_4_STORAGE_KEY);
    return storedValue === "true";
  } catch {
    return false;
  }
}

function saveHideBring4Setting(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(HIDE_BRING_4_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Settings are optional UI preferences; blocked storage should not break the app.
  }
}

const CUSTOMIZABLE_FEATURES: FeatureDefinition[] = [
  {
    id: "typeCalculator",
    label: "Type Calculator / Type Chart",
    description: "Main type chart, defensive matchup, and attack coverage page.",
    group: "Main pages",
  },
  {
    id: "teamBuilder",
    label: "Team Builder",
    description: "Team construction, saved teams, opponent scouting, and damage board.",
    group: "Main pages",
  },
  {
    id: "battleArena",
    label: "Battle Arena",
    description: "Trainer battle simulator page.",
    group: "Main pages",
  },
  {
    id: "battleIntel",
    label: "Battle Intel",
    description: "Non-predictive battle canvas, turn order, and stacked damage board.",
    group: "Team Builder tools",
  },
  {
    id: "movesets",
    label: "Movesets DB",
    description: "Saved species moveset database.",
    group: "Main pages",
  },
  {
    id: "moveFinder",
    label: "Move Finder",
    description: "Regulation-scoped move lookup page.",
    group: "Main pages",
  },
  {
    id: "speedTiers",
    label: "Speed Tiers",
    description: "Champions speed benchmark table.",
    group: "Main pages",
  },
  {
    id: "ohkoFinder",
    label: "OHKO Finder",
    description: "Targeted knockout scanner page.",
    group: "Main pages",
  },
  {
    id: "trainingOptimizer",
    label: "Training Optimizer",
    description: "Stat spread optimizer and breakpoint planner.",
    group: "Main pages",
  },
  {
    id: "matchHistory",
    label: "Match History",
    description: "Saved opponent teams and result history.",
    group: "Main pages",
  },
  {
    id: "teamPreview",
    label: "Team Preview",
    description: "Bring-four recommendation, team preview cards, and full-team scouting detail.",
    group: "Team Builder tools",
  },
  {
    id: "battleEngine",
    label: "Battle Engine",
    description: "Showdown bridge, Battle Lab, turn planner, and engine recommendations.",
    group: "Team Builder tools",
  },
];

const DEFAULT_FEATURE_VISIBILITY: FeatureVisibilitySettings = {
  typeCalculator: true,
  teamBuilder: true,
  battleArena: true,
  battleIntel: true,
  movesets: true,
  moveFinder: true,
  speedTiers: true,
  ohkoFinder: true,
  trainingOptimizer: true,
  matchHistory: true,
  teamPreview: true,
  battleEngine: true,
};

const SITE_SECTIONS: Array<{ id: SiteMode; index: string; label: string; featureId?: HiddenFeatureId }> = [
  { id: "calculator", index: "01", label: "Type Calculator", featureId: "typeCalculator" },
  { id: "team", index: "02", label: "Team Builder", featureId: "teamBuilder" },
  { id: "battle", index: "03", label: "Battle Arena", featureId: "battleArena" },
  { id: "movesets", index: "04", label: "Movesets DB", featureId: "movesets" },
  { id: "moveFinder", index: "05", label: "Move Finder", featureId: "moveFinder" },
  { id: "speed", index: "06", label: "Speed Tiers", featureId: "speedTiers" },
  { id: "ohko", index: "07", label: "OHKO Finder", featureId: "ohkoFinder" },
  { id: "training", index: "08", label: "Training Optimizer", featureId: "trainingOptimizer" },
  { id: "history", index: "09", label: "Match History", featureId: "matchHistory" },
  { id: "settings", index: "10", label: "Settings" },
];

function createDefaultFeatureVisibility(): FeatureVisibilitySettings {
  return { ...DEFAULT_FEATURE_VISIBILITY };
}

function isFeatureVisible(featureVisibility: FeatureVisibilitySettings, featureId: HiddenFeatureId) {
  return featureVisibility[featureId] !== false;
}

function sanitizeFeatureVisibility(value: unknown): FeatureVisibilitySettings {
  const next = createDefaultFeatureVisibility();

  if (!value || typeof value !== "object") {
    return next;
  }

  for (const feature of CUSTOMIZABLE_FEATURES) {
    const storedValue = (value as Partial<Record<HiddenFeatureId, unknown>>)[feature.id];
    if (typeof storedValue === "boolean") {
      next[feature.id] = storedValue;
    }
  }

  return next;
}

function loadFeatureVisibilitySettings(): FeatureVisibilitySettings {
  if (typeof window === "undefined") {
    return createDefaultFeatureVisibility();
  }

  try {
    const storedValue = window.localStorage.getItem(FEATURE_VISIBILITY_STORAGE_KEY);
    return storedValue ? sanitizeFeatureVisibility(JSON.parse(storedValue)) : createDefaultFeatureVisibility();
  } catch {
    return createDefaultFeatureVisibility();
  }
}

function saveFeatureVisibilitySettings(featureVisibility: FeatureVisibilitySettings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(FEATURE_VISIBILITY_STORAGE_KEY, JSON.stringify(featureVisibility));
  } catch {
    // Settings are optional UI preferences; blocked storage should not break the app.
  }
}

type SettingsViewProps = {
  featureVisibility: FeatureVisibilitySettings;
  onToggleFeature: (featureId: HiddenFeatureId, visible: boolean) => void;
  onResetFeatures: () => void;
  hideBring4: boolean;
  onToggleHideBring4: (value: boolean) => void;
};

type SimpleEnemySlot = {
  query: string;
  pokemonId: string | null;
  abilityName: string | null;
  itemName: string | null;
  moveNames: string[];
  statSpread: ChampionsStatSpread | null;
};

function createEmptySimpleEnemySlot(): SimpleEnemySlot {
  return {
    query: "",
    pokemonId: null,
    abilityName: null,
    itemName: null,
    moveNames: [],
    statSpread: null,
  };
}

function createEmptySimpleEnemySlots(): SimpleEnemySlot[] {
  return Array.from({ length: MAX_OPPONENT_SCOUT_SLOTS }, createEmptySimpleEnemySlot);
}

function SimpleEnemyTeamView() {
  const [database, setDatabase] = useState<PokemonRecord[] | null>(null);
  const [battleData, setBattleData] = useState<{
    abilities: AbilityRecord[];
    items: ItemRecord[];
    moves: MoveRecord[];
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [battleDataError, setBattleDataError] = useState<string | null>(null);

  const [enemySlots, setEnemySlots] = useState<SimpleEnemySlot[]>(createEmptySimpleEnemySlots);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const [showdownImportText, setShowdownImportText] = useState("");
  const [showdownImportOpen, setShowdownImportOpen] = useState(false);

  const [showdownBridgeSnapshot, setShowdownBridgeSnapshot] = useState<ShowdownBridgeSnapshot | null>(null);
  const [showdownBridgeStatus, setShowdownBridgeStatus] = useState<ShowdownBridgeStatus>("idle");
  const [showdownBridgeMessage, setShowdownBridgeMessage] = useState("Extension not detected");
  const [pendingShowdownEnemyImport, setPendingShowdownEnemyImport] = useState(false);

  const requestShowdownSnapshot = () => {
    if (typeof window === "undefined") return;
    window.postMessage({ type: "PCH_REQUEST_SHOWDOWN_SNAPSHOT" }, window.location.origin);
  };

  useEffect(() => {
    const handleShowdownBridgeMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as {
        type?: string;
        snapshot?: ShowdownBridgeSnapshot;
        status?: ShowdownBridgeStatus;
        message?: string;
      };

      if (data?.type === "PCH_SHOWDOWN_SNAPSHOT" && data.snapshot?.source === "pokemon-showdown") {
        setShowdownBridgeSnapshot(data.snapshot);
        setShowdownBridgeStatus("ready");
        setShowdownBridgeMessage("Live Showdown battle connected");
        return;
      }

      if (data?.type === "PCH_SHOWDOWN_BRIDGE_STATUS") {
        setShowdownBridgeStatus(data.status ?? "ready");
        setShowdownBridgeMessage(data.message ?? "Showdown bridge status updated");
      }
    };

    window.addEventListener("message", handleShowdownBridgeMessage);
    requestShowdownSnapshot();
    return () => window.removeEventListener("message", handleShowdownBridgeMessage);
  }, []);

  useEffect(() => {
    let active = true;

    loadPokemonDatabase()
      .then((db) => {
        if (active) {
          setDatabase(db.pokemon);
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Failed to load Pokemon database.");
        }
      });

    loadBattleData()
      .then((data) => {
        if (active) {
          setBattleData({
            abilities: data.abilities,
            items: data.items,
            moves: data.moves,
          });
        }
      })
      .catch((error) => {
        if (active) {
          setBattleDataError(error instanceof Error ? error.message : "Failed to load move data.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const pokemonPool = useMemo(() => {
    if (!database) return [] as PokemonRecord[];
    return database.filter(
      (pokemon) =>
        isChampionsPlayableBaseForm(pokemon) ||
        isChampionsMegaEntry(pokemon) ||
        (pokemon.forme === null && !isChampionsSuppressedBaseForm(pokemon)),
    );
  }, [database]);

  const pokemonByKey = useMemo(() => {
    const map = new Map<string, PokemonRecord>();
    for (const pokemon of pokemonPool) {
      map.set(pokemon.id, pokemon);
      map.set(pokemon.name.toLowerCase(), pokemon);
      map.set(normalizePokemonNameKey(pokemon.name), pokemon);
    }
    return map;
  }, [pokemonPool]);

  const moveByKey = useMemo(() => {
    const map = new Map<string, MoveRecord>();
    for (const move of battleData?.moves ?? []) {
      map.set(move.id, move);
      map.set(move.name.toLowerCase(), move);
    }
    return map;
  }, [battleData]);

  const resolveSlotPokemon = (slot: SimpleEnemySlot): PokemonRecord | null => {
    if (slot.pokemonId) {
      const direct = pokemonByKey.get(slot.pokemonId);
      if (direct) return direct;
    }
    const trimmed = slot.query.trim();
    if (!trimmed) return null;
    return (
      pokemonByKey.get(trimmed) ??
      pokemonByKey.get(trimmed.toLowerCase()) ??
      pokemonByKey.get(normalizePokemonNameKey(trimmed)) ??
      null
    );
  };

  const updateEnemyQuery = (slotIndex: number, query: string) => {
    setEnemySlots((current) =>
      current.map((slot, index) => {
        if (index !== slotIndex) return slot;
        const trimmed = query.trim();
        const matched =
          pokemonByKey.get(trimmed) ??
          pokemonByKey.get(trimmed.toLowerCase()) ??
          pokemonByKey.get(normalizePokemonNameKey(trimmed)) ??
          null;
        const previousPokemonId = slot.pokemonId;
        const nextPokemonId = matched ? matched.id : null;

        if (previousPokemonId && previousPokemonId !== nextPokemonId) {
          return {
            query,
            pokemonId: nextPokemonId,
            abilityName: null,
            itemName: null,
            moveNames: [],
            statSpread: null,
          };
        }

        return {
          ...slot,
          query,
          pokemonId: nextPokemonId,
        };
      }),
    );
  };

  const clearEnemyTeam = () => {
    setEnemySlots(createEmptySimpleEnemySlots());
    setStorageMessage(null);
    setStorageError(null);
  };

  const showdownBridgeImport = useMemo<ShowdownBridgeImportResult | null>(() => {
    if (!showdownBridgeSnapshot || !database || !battleData) {
      return null;
    }
    return showdownSnapshotToBattleInput(showdownBridgeSnapshot, {
      pokemonEntries: database,
      moveByKey,
    });
  }, [battleData, database, moveByKey, showdownBridgeSnapshot]);

  const showdownEnemyImportCount = showdownBridgeImport?.input?.enemy.length ?? 0;

  const showdownBridgeCapturedLabel = useMemo(() => {
    if (!showdownBridgeSnapshot?.capturedAt) return "";
    const capturedAt = new Date(showdownBridgeSnapshot.capturedAt);
    if (Number.isNaN(capturedAt.getTime())) return "";
    return capturedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }, [showdownBridgeSnapshot]);

  const applyShowdownEnemyTeamImport = (importResult: ShowdownBridgeImportResult | null) => {
    const enemyMembers = importResult?.input?.enemy ?? [];

    if (enemyMembers.length === 0) {
      return false;
    }

    const importedMembers = enemyMembers.slice(0, MAX_OPPONENT_SCOUT_SLOTS);
    const filledSlots: SimpleEnemySlot[] = Array.from({ length: MAX_OPPONENT_SCOUT_SLOTS }, (_, index) => {
      const member = importedMembers[index];
      if (!member) return createEmptySimpleEnemySlot();
      const pokemon = member.pokemon;
      const moveNames = (member.moveNames ?? member.knownMoves?.map((move) => move.name ?? move.label) ?? []).filter(
        (name): name is string => Boolean(name),
      );
      return {
        query: pokemon.name,
        pokemonId: pokemon.id,
        abilityName: getResolvedFieldValue(member.abilityName ?? null),
        itemName: getResolvedFieldValue(member.itemName ?? null),
        moveNames,
        statSpread: member.statSpread ?? null,
      };
    });

    const warningParts: string[] = [];
    if (enemyMembers.length > MAX_OPPONENT_SCOUT_SLOTS) {
      warningParts.push(`ignored ${enemyMembers.length - MAX_OPPONENT_SCOUT_SLOTS} extra Pokemon`);
    }
    if (importResult?.unresolvedSpecies.length) {
      warningParts.push(`couldn't match Pokemon: ${formatImportIssueList(importResult.unresolvedSpecies)}`);
    }

    setEnemySlots(filledSlots);
    setPendingShowdownEnemyImport(false);
    setStorageMessage(
      `Imported ${importedMembers.length} enemy Pokemon from Showdown${
        showdownBridgeCapturedLabel ? ` snapshot ${showdownBridgeCapturedLabel}` : ""
      }${warningParts.length > 0 ? `; ${warningParts.join("; ")}.` : "."}`,
    );
    setStorageError(null);

    return true;
  };

  const importShowdownEnemyTeam = () => {
    if (!database || !battleData) {
      setStorageError("The local Pokemon and move databases must finish loading before importing from Showdown.");
      setStorageMessage(null);
      return;
    }

    setPendingShowdownEnemyImport(true);
    requestShowdownSnapshot();

    if (showdownBridgeStatus === "error") {
      setPendingShowdownEnemyImport(false);
      setStorageError(showdownBridgeMessage || "Showdown bridge could not be reached.");
      setStorageMessage(null);
      return;
    }

    setStorageMessage("Requested a Showdown enemy snapshot. The enemy board will fill when the bridge responds.");
    setStorageError(null);
  };

  useEffect(() => {
    if (!pendingShowdownEnemyImport) return;

    if (applyShowdownEnemyTeamImport(showdownBridgeImport)) {
      return;
    }

    if (showdownBridgeImport) {
      setPendingShowdownEnemyImport(false);
      setStorageError(
        showdownBridgeImport.unresolvedSpecies.length > 0
          ? `No enemy Pokemon could be imported; couldn't match Pokemon: ${formatImportIssueList(
              showdownBridgeImport.unresolvedSpecies,
            )}.`
          : showdownBridgeImport.summary || "The latest Showdown snapshot did not include any enemy Pokemon to import.",
      );
      setStorageMessage(null);
      return;
    }

    if (showdownBridgeStatus === "waiting" || showdownBridgeStatus === "idle") {
      setStorageMessage(
        "Waiting for a Showdown battle snapshot. Keep a battle tab open with the bridge extension enabled.",
      );
      setStorageError(null);
    } else if (showdownBridgeStatus === "error") {
      setPendingShowdownEnemyImport(false);
      setStorageError(showdownBridgeMessage || "Showdown bridge could not be reached.");
      setStorageMessage(null);
    }
  }, [pendingShowdownEnemyImport, showdownBridgeImport, showdownBridgeMessage, showdownBridgeStatus]);

  const importEnemyTeamFromShowdownText = () => {
    const trimmed = showdownImportText.trim();
    if (!trimmed) {
      setStorageError("Paste a Pokemon Showdown export first.");
      return;
    }
    if (!database || !battleData) {
      setStorageError("The local Pokemon and move databases must finish loading before importing.");
      return;
    }

    try {
      const imported = importShowdownTeamText(trimmed, {
        pokemonEntries: database,
        moveByKey,
        maxTeamSize: MAX_OPPONENT_SCOUT_SLOTS,
        maxMovesPerSlot: 4,
      });

      if (imported.slots.length === 0) {
        throw new Error("No Pokemon sets were found in the pasted Showdown text.");
      }

      const filledSlots: SimpleEnemySlot[] = Array.from({ length: MAX_OPPONENT_SCOUT_SLOTS }, (_, index) => {
        const slot = imported.slots[index];
        if (!slot || !slot.pokemonId) return createEmptySimpleEnemySlot();
        const pokemon = pokemonByKey.get(slot.pokemonId);
        if (!pokemon) return createEmptySimpleEnemySlot();
        const moveNames = [
          ...(slot.knownMoves ?? []).map((move) => move.name ?? move.label),
          ...(slot.savedAttacks ?? []).map((attack) => attack.label),
        ].filter((name, position, list) => Boolean(name) && list.indexOf(name) === position) as string[];
        return {
          query: pokemon.name,
          pokemonId: pokemon.id,
          abilityName: null,
          itemName: getResolvedFieldValue(slot.itemName ?? null),
          moveNames,
          statSpread: slot.statSpread ?? null,
        };
      });

      const warningParts: string[] = [];
      if (imported.extraPokemonCount > 0) {
        warningParts.push(`ignored ${imported.extraPokemonCount} extra Pokemon beyond the first ${MAX_OPPONENT_SCOUT_SLOTS}`);
      }
      if (imported.unknownMoves.length > 0) {
        warningParts.push(`couldn't match moves: ${formatImportIssueList(imported.unknownMoves)}`);
      }
      if (imported.unresolvedSpecies.length > 0) {
        warningParts.push(`couldn't match Pokemon: ${formatImportIssueList(imported.unresolvedSpecies)}`);
      }

      setEnemySlots(filledSlots);
      setShowdownImportText("");
      setShowdownImportOpen(false);
      setStorageMessage(
        `Imported ${imported.importedPokemonCount} enemy Pokemon from Showdown text${
          warningParts.length > 0 ? `; ${warningParts.join("; ")}.` : "."
        }`,
      );
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Failed to import Showdown text.");
    }
  };

  useEffect(() => {
    if (!showdownImportOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowdownImportOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [showdownImportOpen]);

  const loadedSlotCount = enemySlots.filter((slot) => resolveSlotPokemon(slot)).length;

  return (
    <>
      <section className="team-builder-hero">
        <div>
          <p className="eyebrow">Enemy Scout · Simplified</p>
          <h2>Log the opposing six</h2>
          <p className="selector-note">
            A streamlined version of the Team Builder with no bring-four logic or prediction. Type or import the six
            Pokemon you are facing to keep a quick reference of their species, moves, abilities, and items.
          </p>
        </div>
        <div className="team-builder-hero-side">
          <div className="team-builder-meta">
            <span>{loadedSlotCount} / {MAX_OPPONENT_SCOUT_SLOTS} loaded</span>
            <span>{pokemonPool.length} available picks</span>
          </div>
        </div>
      </section>

      <section className="team-storage-panel">
        <div className="team-storage-controls">
          <div className="storage-button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={importShowdownEnemyTeam}
              disabled={!database || !battleData}
              title={
                showdownEnemyImportCount > 0
                  ? `Import ${showdownEnemyImportCount} enemy Pokemon from the latest Showdown snapshot`
                  : "Ask the bridge extension for the enemy side from the open Showdown battle"
              }
            >
              {pendingShowdownEnemyImport
                ? "Waiting for Showdown"
                : showdownEnemyImportCount > 0
                  ? `Import Showdown Enemy (${showdownEnemyImportCount})`
                  : "Import Showdown Enemy"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={clearEnemyTeam}
              disabled={loadedSlotCount === 0}
            >
              Clear Enemy Team
            </button>
          </div>
          <div className="showdown-transfer-grid">
            <button
              type="button"
              className="showdown-import-trigger"
              onClick={() => setShowdownImportOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={showdownImportOpen}
            >
              <span className="showdown-import-trigger__text">
                <span className="showdown-import-trigger__title">Pokemon Showdown Import</span>
                <span className="showdown-import-trigger__hint">
                  {showdownImportText.trim()
                    ? `${showdownImportText.trim().length} chars pasted · click to review`
                    : "Paste Showdown text to fill the enemy board"}
                </span>
              </span>
              <span className="showdown-import-trigger__icon" aria-hidden="true">
                ↙
              </span>
            </button>
          </div>
          {storageMessage ? <p className="storage-message">{storageMessage}</p> : null}
          {storageError ? <p className="storage-message error">{storageError}</p> : null}
          {loadError ? <p className="storage-message error">{loadError}</p> : null}
          {battleDataError ? <p className="storage-message error">{battleDataError}</p> : null}
        </div>
      </section>

      {showdownImportOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="showdown-import-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="simple-enemy-showdown-import-title"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setShowdownImportOpen(false);
                }
              }}
            >
              <div className="showdown-import-modal__dialog" role="document">
                <header className="showdown-import-modal__header">
                  <div className="showdown-import-modal__title">
                    <span className="eyebrow">Enemy Import</span>
                    <h3 id="simple-enemy-showdown-import-title">Paste Showdown enemy team</h3>
                  </div>
                  <button
                    type="button"
                    className="showdown-import-modal__close"
                    onClick={() => setShowdownImportOpen(false)}
                    aria-label="Close Showdown import dialog"
                    title="Close"
                  >
                    ×
                  </button>
                </header>
                <div className="showdown-import-modal__body">
                  <textarea
                    className="showdown-import-modal__textarea"
                    value={showdownImportText}
                    onChange={(event) => setShowdownImportText(event.target.value)}
                    placeholder={"Paste a Pokemon Showdown export here.\n\nEach set should be separated by a blank line."}
                    spellCheck={false}
                  />
                </div>
                <footer className="showdown-import-modal__footer">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowdownImportText("")}
                    disabled={!showdownImportText}
                  >
                    Clear text
                  </button>
                  <div className="showdown-import-modal__footer-spacer" />
                  <button type="button" className="secondary-button" onClick={() => setShowdownImportOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={importEnemyTeamFromShowdownText}
                    disabled={!showdownImportText.trim()}
                  >
                    Import enemy team
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}

      <section className="board-panel opponent-scout-panel">
        <div className="opponent-scout-header">
          <div>
            <p className="eyebrow">Opponent Scout</p>
            <h2>Enemy board</h2>
          </div>
          <div className="opponent-scout-actions">
            <span className="lead-available-count">
              {loadedSlotCount} / {MAX_OPPONENT_SCOUT_SLOTS} loaded
            </span>
          </div>
        </div>

        <div className="opponent-search-grid">
          {enemySlots.map((slot, slotIndex) => (
            <label key={`simple-enemy-slot-${slotIndex}`} className="opponent-search">
              <span>Enemy {slotIndex + 1}</span>
              <input
                list="simple-enemy-pokemon-options"
                className="team-pokemon-input"
                placeholder={database ? "Search Pokemon" : "Loading local database..."}
                value={slot.query}
                onChange={(event) => updateEnemyQuery(slotIndex, event.target.value)}
                disabled={!database}
              />
            </label>
          ))}
        </div>

        <div className="simple-enemy-grid">
          {enemySlots.map((slot, slotIndex) => {
            const pokemon = resolveSlotPokemon(slot);
            if (!pokemon) {
              const trimmed = slot.query.trim();
              return (
                <article key={`simple-enemy-card-${slotIndex}`} className="enemy-card simple-enemy-card empty">
                  <div className="enemy-card-header">
                    <div className="opponent-card-top">
                      <span className="eyebrow">Enemy {slotIndex + 1}</span>
                    </div>
                  </div>
                  <p className="selector-note" style={{ margin: 0 }}>
                    {trimmed
                      ? `No match for "${trimmed}". Pick from the suggestions or import a team.`
                      : "Type a Pokemon name or import a Showdown team to populate this slot."}
                  </p>
                </article>
              );
            }

            const types = pokemon.types ?? [];
            const fallbackAbility = slot.abilityName ?? getPokemonAbilityNames(pokemon)[0] ?? null;
            const computed = getChampionsComputedStats(
              pokemon,
              slot.statSpread
                ? {
                    spread: normalizeChampionsStatSpread(
                      slot.statSpread,
                      getDefaultChampionsStatSpreadForPokemon(pokemon),
                    ),
                  }
                : undefined,
            );
            const spreadLabel = slot.statSpread
              ? `${getChampionsNatureLabel(slot.statSpread.nature)} · ${CHAMPIONS_STAT_ORDER.map(
                  (statId) => `${statId.toUpperCase()} ${slot.statSpread!.statPoints[statId]}`,
                ).join(" / ")}`
              : "Default spread";

            return (
              <article key={`simple-enemy-card-${slotIndex}`} className="enemy-card simple-enemy-card">
                <div className="enemy-card-header">
                  <div className="opponent-card-top">
                    <PokemonSprite pokemon={pokemon} className="opponent-card-sprite" />
                    <div>
                      <span className="eyebrow">Enemy {slotIndex + 1}</span>
                      <h3>{pokemon.name}</h3>
                    </div>
                  </div>
                </div>

                <div className="team-type-list">
                  {types.map((type) => {
                    const normalizedType = TYPE_ORDER.find(
                      (candidate) => candidate.toLowerCase() === type.toLowerCase(),
                    );
                    if (!normalizedType) return null;
                    return (
                      <span
                        key={`simple-enemy-type-${slotIndex}-${normalizedType}`}
                        className="inline-type-pill"
                        style={
                          {
                            "--type-color": TYPE_META[normalizedType].color,
                            "--type-accent": TYPE_META[normalizedType].accent,
                          } as CSSProperties
                        }
                      >
                        {TYPE_META[normalizedType].label}
                      </span>
                    );
                  })}
                </div>

                <div className="simple-enemy-meta">
                  <div>
                    <span>Ability</span>
                    <strong>{fallbackAbility ?? "Unknown"}</strong>
                  </div>
                  <div>
                    <span>Item</span>
                    <strong>{slot.itemName ?? "Unknown"}</strong>
                  </div>
                  <div>
                    <span>Spread</span>
                    <strong>{spreadLabel}</strong>
                  </div>
                </div>

                <div className="pokemon-stats-grid compact">
                  {CHAMPIONS_STAT_ORDER.map((statId) => (
                    <div key={`simple-enemy-stat-${slotIndex}-${statId}`} className="pokemon-stat-chip">
                      <strong>{statId.toUpperCase()}</strong>
                      <em>{computed[statId]}</em>
                    </div>
                  ))}
                </div>

                <div className="simple-enemy-moves">
                  <span className="lead-section-label cover">Known moves</span>
                  {slot.moveNames.length > 0 ? (
                    <ul>
                      {slot.moveNames.slice(0, 4).map((moveName, moveIndex) => (
                        <li key={`simple-enemy-move-${slotIndex}-${moveIndex}`}>{moveName}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="selector-note" style={{ margin: 0 }}>
                      No moves logged yet. Import a Showdown team to capture them.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <datalist id="simple-enemy-pokemon-options">
        {pokemonPool.map((pokemon) => (
          <option key={pokemon.id} value={pokemon.name} />
        ))}
      </datalist>
    </>
  );
}

function SettingsView({
  featureVisibility,
  onToggleFeature,
  onResetFeatures,
  hideBring4,
  onToggleHideBring4,
}: SettingsViewProps) {
  const hiddenCount = CUSTOMIZABLE_FEATURES.filter((feature) => !isFeatureVisible(featureVisibility, feature.id)).length;
  const groups: Array<FeatureDefinition["group"]> = ["Main pages", "Team Builder tools"];

  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <div className="board-panel settings-hero-panel">
        <div className="board-header settings-hero-header">
          <div>
            <p className="eyebrow">Site Settings</p>
            <h2 id="settings-title">Customize visible features</h2>
            <p className="selector-note">
              Hide tools you do not use. Settings are saved in this browser and can be restored at any time.
            </p>
          </div>
          <div className="settings-summary-card" aria-label="Hidden feature summary">
            <span>Hidden</span>
            <strong>{hiddenCount}</strong>
            <button type="button" className="secondary-button" onClick={onResetFeatures} disabled={hiddenCount === 0}>
              Show All
            </button>
          </div>
        </div>
      </div>

      {groups.map((group) => (
        <section key={group} className="board-panel settings-feature-panel" aria-labelledby={`settings-${group}`}>
          <div className="scout-section-header">
            <p className="eyebrow" id={`settings-${group}`}>
              {group}
            </p>
            <span>
              {CUSTOMIZABLE_FEATURES.filter((feature) => feature.group === group).length} toggles
            </span>
          </div>

          <div className="settings-toggle-grid">
            {CUSTOMIZABLE_FEATURES.filter((feature) => feature.group === group).map((feature) => {
              const visible = isFeatureVisible(featureVisibility, feature.id);

              return (
                <label key={feature.id} className={`settings-toggle-card ${visible ? "visible" : "hidden"}`}>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(event) => onToggleFeature(feature.id, event.target.checked)}
                  />
                  <span className="settings-toggle-switch" aria-hidden="true" />
                  <span className="settings-toggle-copy">
                    <strong>{feature.label}</strong>
                    <small>{feature.description}</small>
                  </span>
                  <span className="settings-toggle-state">{visible ? "Shown" : "Hidden"}</span>
                </label>
              );
            })}
            {group === "Team Builder tools" ? (
              <label className={`settings-toggle-card ${hideBring4 ? "visible" : "hidden"}`}>
                <input
                  type="checkbox"
                  checked={hideBring4}
                  onChange={(event) => onToggleHideBring4(event.target.checked)}
                />
                <span className="settings-toggle-switch" aria-hidden="true" />
                <span className="settings-toggle-copy">
                  <strong>Hide Bring 4</strong>
                  <small>
                    Replace the Team Builder with a simplified enemy-only board (no bring-four logic or prediction).
                    Useful when you only want to log or import the opposing six.
                  </small>
                </span>
                <span className="settings-toggle-state">{hideBring4 ? "Enabled" : "Disabled"}</span>
              </label>
            ) : null}
          </div>
        </section>
      ))}
    </section>
  );
}

function App() {
  const [siteMode, setSiteMode] = useState<SiteMode>("calculator");
  const [teamBuilderResetKey, setTeamBuilderResetKey] = useState(0);
  const [featureVisibility, setFeatureVisibility] = useState<FeatureVisibilitySettings>(loadFeatureVisibilitySettings);
  const [hideBring4, setHideBring4] = useState<boolean>(loadHideBring4Setting);
  const visibleSiteSections = useMemo(
    () =>
      SITE_SECTIONS.filter(
        (section) => !section.featureId || isFeatureVisible(featureVisibility, section.featureId),
      ),
    [featureVisibility],
  );

  useEffect(() => {
    if (!visibleSiteSections.some((section) => section.id === siteMode)) {
      setSiteMode("settings");
    }
  }, [siteMode, visibleSiteSections]);

  useEffect(() => {
    saveFeatureVisibilitySettings(featureVisibility);
  }, [featureVisibility]);

  useEffect(() => {
    saveHideBring4Setting(hideBring4);
  }, [hideBring4]);

  const updateFeatureVisibility = (featureId: HiddenFeatureId, visible: boolean) => {
    setFeatureVisibility((current) => ({
      ...current,
      [featureId]: visible,
    }));
  };

  const resetFeatureVisibility = () => {
    setFeatureVisibility(createDefaultFeatureVisibility());
  };

  return (
    <div className="app-shell">
      <main className="page-layout">
        <header className="site-masthead" role="banner">
          <div className="site-masthead-title">
            <h1>
              Pokémon Champions <em>Helper</em>
            </h1>
            <p className="site-masthead-tag">
              A strategic dossier for competitive doubles — matchups, coverage,
              damage, and tactical lines.
            </p>
          </div>
          <aside className="site-masthead-meta" aria-label="Regulation metadata">
            <span className="meta-row">
              <span className="meta-dot" aria-hidden="true" />
              <span className="meta-label">Format</span>
              <span className="meta-value">
                {POKEMON_CHAMPIONS_ACTIVE_REGULATION}
              </span>
            </span>
            <span className="meta-row">
              <span className="meta-label">Window</span>
              <span className="meta-value">
                {POKEMON_CHAMPIONS_ACTIVE_REGULATION_WINDOW}
              </span>
            </span>
            <span className="meta-row">
              <span className="meta-label">Sourced</span>
              <span className="meta-value">
                {POKEMON_CHAMPIONS_LEGAL_LIST_SOURCED_AT}
              </span>
            </span>
          </aside>
        </header>

        <nav className="site-tabs" aria-label="Site sections">
          {visibleSiteSections.map((section) => (
            <button
              key={section.id}
              type="button"
              data-index={section.index}
              className={`site-tab ${siteMode === section.id ? "active" : ""}`}
              onClick={() => setSiteMode(section.id)}
              aria-current={siteMode === section.id ? "page" : undefined}
            >
              {section.label}
            </button>
          ))}
        </nav>

        {siteMode === "calculator" ? (
          <CalculatorView />
        ) : siteMode === "team" ? (
          hideBring4 ? (
            <SimpleEnemyTeamView />
          ) : (
            <TeamBuilderView
              key={teamBuilderResetKey}
              featureVisibility={featureVisibility}
              onStartNewTeam={() => setTeamBuilderResetKey((value) => value + 1)}
            />
          )
        ) : siteMode === "battle" ? (
          <BattleArenaPage />
        ) : siteMode === "movesets" ? (
          <MovesetDatabaseView />
        ) : siteMode === "moveFinder" ? (
          <MoveFinderView />
        ) : siteMode === "speed" ? (
          <SpeedTiersView />
        ) : siteMode === "ohko" ? (
          <OhkoFinderView />
        ) : siteMode === "training" ? (
          <TrainingOptimizerView />
        ) : siteMode === "settings" ? (
          <SettingsView
            featureVisibility={featureVisibility}
            onToggleFeature={updateFeatureVisibility}
            onResetFeatures={resetFeatureVisibility}
            hideBring4={hideBring4}
            onToggleHideBring4={setHideBring4}
          />
        ) : (
          <MatchHistoryView />
        )}
      </main>
    </div>
  );
}

export default App;
