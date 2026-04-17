import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
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
  getMovePokemonType,
  isSpreadTarget,
  loadBattleData,
  type AbilityRecord,
  type MoveRecord,
} from "./lib/battleData";
import {
  SPREAD_MOVE_MULTIPLIER,
  calculateRoughDamage,
  getLevel50HpValue,
  getLevel50OtherStatValue,
  getStatStageMultiplier,
  type DamageCategory,
  type DamageTerrain,
  type DamageWeather,
} from "./lib/damage";
import {
  deleteSavedTeam,
  listSavedTeams,
  saveTeam,
  type PersistedOpenerSelection,
  type PersistedSavedAttack,
  type PersistedTeam,
  type PersistedTeamSlot,
} from "./lib/savedTeams";

type SiteMode = "calculator" | "team";
type CalculatorMode = "defense" | "attack";

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
  savedAttacks: PersistedSavedAttack[];
};

type TeamMatrixMode = "defense" | "offense";
type DamageCalcMode = "attack" | "defend";
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
type OpponentRosterEntry = {
  slotIndex: number;
  query: string;
  pokemon: PokemonRecord | null;
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
function createEmptyTeamSlot(): TeamSlotState {
  return {
    query: "",
    pokemonId: null,
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

function createSavedAttack(
  pokemon?: PokemonRecord | null,
  overrides: Partial<PersistedSavedAttack> = {},
): PersistedSavedAttack {
  return {
    id: overrides.id ?? createSavedAttackId(),
    label: overrides.label ?? "",
    type: overrides.type ?? getPreferredAttackType(pokemon),
    basePower:
      typeof overrides.basePower === "number" && Number.isFinite(overrides.basePower) && overrides.basePower > 0
        ? Math.floor(overrides.basePower)
        : 80,
    category: overrides.category ?? getPreferredDamageCategory(pokemon),
    isSpreadMove: overrides.isSpreadMove ?? false,
  };
}

function getDamageConfigKey(slotIndex: number, pokemonId: string | null) {
  return `${slotIndex}:${pokemonId ?? "empty"}`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0.0";
  }

  return value.toFixed(value >= 100 ? 0 : 1);
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

function clampStatStage(value: number) {
  return Math.max(-6, Math.min(6, value));
}

function getAttackBasePowerDisplay(basePower?: number) {
  return typeof basePower === "number" && Number.isFinite(basePower) && basePower > 0 ? String(basePower) : "";
}

function getAttackLabel(attack: PersistedSavedAttack) {
  return attack.label?.trim() || TYPE_META[attack.type].label;
}

function coercePokemonType(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return TYPE_ORDER.find((type) => type === normalized) ?? getTypeFromLabel(value) ?? null;
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

      const basePower =
        typeof attack.basePower === "number" && Number.isFinite(attack.basePower) && attack.basePower > 0
          ? Math.floor(attack.basePower)
          : undefined;
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
      });
    })
    .filter((attack): attack is PersistedSavedAttack => attack !== null)
    .slice(0, MAX_ATTACK_TYPES_PER_SLOT);
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
  return typeof attack.basePower === "number" && Number.isFinite(attack.basePower) && attack.basePower > 0
    ? attack.basePower
    : null;
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

function getBestAttackMultiplierAgainstPokemon(
  attackTypes: PokemonType[],
  pokemon: PokemonRecord,
): { multiplier: number | null; attackTypes: PokemonType[] } {
  const firstType = getTypeFromLabel(pokemon.types[0]);
  const secondType = pokemon.types[1] ? getTypeFromLabel(pokemon.types[1]) : null;

  if (!firstType || attackTypes.length === 0) {
    return { multiplier: null, attackTypes: [] };
  }

  let bestMultiplier = 0;
  let bestTypes: PokemonType[] = [];

  for (const attackType of attackTypes) {
    const multiplier = getMultiplier(attackType, firstType, secondType);

    if (multiplier > bestMultiplier) {
      bestMultiplier = multiplier;
      bestTypes = [attackType];
    } else if (multiplier === bestMultiplier) {
      bestTypes.push(attackType);
    }
  }

  return {
    multiplier: bestMultiplier === 0 ? 0 : bestMultiplier,
    attackTypes: bestTypes,
  };
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

function getPokemonAttackTypeOptions(pokemon: PokemonRecord) {
  return pokemon.types
    .map((typeLabel) => getTypeFromLabel(typeLabel))
    .filter((type): type is PokemonType => Boolean(type));
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

function normalizeTeamSlots(slots: PersistedTeamSlot[]): TeamSlotState[] {
  return Array.from({ length: TEAM_SIZE }, (_, index) => {
    const slot = slots[index];

    if (!slot) {
      return createEmptyTeamSlot();
    }

    return {
      query: slot.query ?? "",
      pokemonId: slot.pokemonId ?? null,
      savedAttacks: Array.isArray(slot.savedAttacks)
        ? sanitizeSavedAttacks(slot.savedAttacks)
        : buildLegacySavedAttacks(slot),
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

function createEmptyOpponentSlots() {
  return Array.from({ length: MAX_OPPONENT_SCOUT_SLOTS }, () => "");
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
  slot: TeamSlotState & { pokemon: PokemonRecord | null };
  slotIndex: number;
  databaseLoaded: boolean;
  loadError: string | null;
  moveByKey: Map<string, MoveRecord>;
  onQueryChange: (slotIndex: number, query: string) => void;
  onClear: (slotIndex: number) => void;
  onApplySavedAttacks: (slotIndex: number, savedAttacks: PersistedSavedAttack[]) => void;
};

function TeamSlotCard({
  slot,
  slotIndex,
  databaseLoaded,
  loadError,
  moveByKey,
  onQueryChange,
  onClear,
  onApplySavedAttacks,
}: TeamSlotCardProps) {
  const [isEditingAttacks, setIsEditingAttacks] = useState(false);
  const [showStatsDetails, setShowStatsDetails] = useState(false);
  const [draftSavedAttacks, setDraftSavedAttacks] = useState<PersistedSavedAttack[]>(slot.savedAttacks);

  useEffect(() => {
    setDraftSavedAttacks(slot.savedAttacks);
  }, [slot.savedAttacks, slot.pokemonId]);

  useEffect(() => {
    setShowStatsDetails(false);
  }, [slot.pokemonId]);

  const pokemon = slot.pokemon;
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

  const updateDraftAttack = (attackId: string, patch: Partial<PersistedSavedAttack>) => {
    setDraftSavedAttacks((current) =>
      current.map((attack) => (attack.id === attackId ? { ...attack, ...patch } : attack)),
    );
  };

  const addDraftAttack = () => {
    setDraftSavedAttacks((current) => {
      if (current.length >= MAX_ATTACK_TYPES_PER_SLOT) {
        return current;
      }

      return [...current, createSavedAttack(pokemon)];
    });
  };

  const removeDraftAttack = (attackId: string) => {
    setDraftSavedAttacks((current) => current.filter((attack) => attack.id !== attackId));
  };

  const updateDraftAttackLabel = (attackId: string, nextLabel: string) => {
    const trimmed = nextLabel.trim();
    const matchedMove = moveByKey.get(trimmed.toLowerCase()) ?? moveByKey.get(trimmed) ?? null;

    if (matchedMove && matchedMove.category !== "Status" && matchedMove.basePower > 0) {
      const moveType = getMovePokemonType(matchedMove);

      if (moveType) {
        updateDraftAttack(attackId, {
          label: matchedMove.name,
          type: moveType,
          basePower: matchedMove.basePower,
          category: matchedMove.category.toLowerCase() as DamageCategory,
          isSpreadMove: isSpreadTarget(matchedMove.target),
        });
        return;
      }
    }

    updateDraftAttack(attackId, { label: nextLabel });
  };

  const applySavedAttacks = () => {
    onApplySavedAttacks(slotIndex, sanitizeSavedAttacks(draftSavedAttacks, pokemon));
    setIsEditingAttacks(false);
  };

  const cancelAttackEdit = () => {
    setDraftSavedAttacks(slot.savedAttacks);
    setIsEditingAttacks(false);
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
          placeholder={databaseLoaded ? "Start typing a Pokemon name" : "Loading local database..."}
          value={slot.query}
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

          <div className="attack-type-section">
            <div className="attack-type-header">
              <p className="eyebrow">Saved Attacks</p>
              <div className="attack-type-actions">
                <span>{slot.savedAttacks.length} / 4</span>
                <button
                  type="button"
                  className="edit-attacks-button"
                  onClick={() => setIsEditingAttacks((current) => !current)}
                >
                  {isEditingAttacks ? "Close" : "Edit"}
                </button>
              </div>
            </div>

            <div className="saved-attack-list">
              {slot.savedAttacks.length > 0 ? (
                slot.savedAttacks.map((attack) => {
                  const category = getResolvedAttackCategory(attack, pokemon);
                  const basePower = getResolvedAttackBasePower(attack);

                  return (
                    <article
                      key={attack.id}
                      className="saved-attack-chip"
                      style={
                        {
                          "--type-color": TYPE_META[attack.type].color,
                          "--type-accent": TYPE_META[attack.type].accent,
                        } as CSSProperties
                      }
                    >
                      <div className="saved-attack-chip-top">
                        <span className="inline-type-pill saved-attack-type-pill">
                          <img src={getTypeIconUrl(attack.type)} alt="" aria-hidden="true" />
                          {TYPE_META[attack.type].label}
                        </span>
                        <strong>{getAttackLabel(attack)}</strong>
                      </div>
                      <p>
                        {basePower ? `${basePower} BP` : "Base power not set"} •{" "}
                        {category === "physical" ? "Physical" : "Special"}
                        {getResolvedAttackSpread(attack) ? " • Spread" : ""}
                      </p>
                    </article>
                  );
                })
              ) : (
                <span className="subtle-empty">No saved attacks yet.</span>
              )}
            </div>

            {isEditingAttacks ? (
              <div className="attack-editor">
                <div className="attack-editor-topbar">
                  <p className="selector-note">
                    Save up to four damaging attacks here. Exact move-name matches auto-fill type, power, category,
                    and spread defaults.
                  </p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={addDraftAttack}
                    disabled={draftSavedAttacks.length >= MAX_ATTACK_TYPES_PER_SLOT}
                  >
                    Add Attack
                  </button>
                </div>

                {draftSavedAttacks.length > 0 ? (
                  <div className="saved-attack-editor-list">
                    {draftSavedAttacks.map((attack, attackIndex) => (
                      <article key={attack.id} className="saved-attack-editor-card">
                        <div className="saved-attack-editor-header">
                          <span
                            className="mini-type-pill"
                            style={
                              {
                                "--type-color": TYPE_META[attack.type].color,
                                "--type-accent": TYPE_META[attack.type].accent,
                              } as CSSProperties
                            }
                          >
                            Attack {attackIndex + 1}
                          </span>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => removeDraftAttack(attack.id)}
                          >
                            Remove
                          </button>
                        </div>

                        <label className="saved-attack-field wide">
                          <span>Move Name</span>
                          <input
                            list="move-options"
                            className="team-pokemon-input"
                            placeholder="Moonblast"
                            value={attack.label ?? ""}
                            onChange={(event) => updateDraftAttackLabel(attack.id, event.target.value)}
                          />
                        </label>

                        <div className="saved-attack-editor-grid">
                          <label className="saved-attack-field">
                            <span>Type</span>
                            <select
                              value={attack.type}
                              onChange={(event) =>
                                updateDraftAttack(attack.id, { type: event.target.value as PokemonType })
                              }
                            >
                              {TYPE_ORDER.map((type) => (
                                <option key={`${attack.id}-${type}`} value={type}>
                                  {TYPE_META[type].label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="saved-attack-field">
                            <span>Base Power</span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              placeholder="80"
                              value={getAttackBasePowerDisplay(attack.basePower)}
                              onChange={(event) => {
                                const parsed = Number(event.target.value);
                                updateDraftAttack(attack.id, {
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
                            {(["physical", "special"] as const).map((category) => (
                              <button
                                key={`${attack.id}-${category}`}
                                type="button"
                                className={`damage-category-button ${
                                  getResolvedAttackCategory(attack, pokemon) === category ? "active" : ""
                                }`}
                                onClick={() => updateDraftAttack(attack.id, { category })}
                              >
                                {category === "physical" ? "Physical" : "Special"}
                              </button>
                            ))}
                          </div>

                          <button
                            type="button"
                            className={`attack-default-toggle ${getResolvedAttackSpread(attack) ? "active" : ""}`}
                            onClick={() =>
                              updateDraftAttack(attack.id, { isSpreadMove: !getResolvedAttackSpread(attack) })
                            }
                          >
                            {getResolvedAttackSpread(attack) ? "Spread Move" : "Single Target"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="team-slot-empty">Add attacks here to unlock duplicate types and OHKO checks.</div>
                )}

                <div className="attack-editor-actions">
                  <button type="button" className="secondary-button" onClick={cancelAttackEdit}>
                    Cancel
                  </button>
                  <button type="button" className="primary-button" onClick={applySavedAttacks}>
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

function TeamBuilderView() {
  const [teamMatrixMode, setTeamMatrixMode] = useState<TeamMatrixMode>("defense");
  const [openerSelections, setOpenerSelections] = useState<[OpenerSelection, OpenerSelection]>([
    [null, null],
    [null, null],
  ]);
  const [opponentQueries, setOpponentQueries] = useState<string[]>(createEmptyOpponentSlots);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [database, setDatabase] = useState<PokemonRecord[] | null>(null);
  const [battleData, setBattleData] = useState<{ abilities: AbilityRecord[]; moves: MoveRecord[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [battleDataError, setBattleDataError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("My Team");
  const [savedTeams, setSavedTeams] = useState<PersistedTeam[]>([]);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeSavedTeamId, setActiveSavedTeamId] = useState<string | null>(null);
  const [quickPokemonQuery, setQuickPokemonQuery] = useState("");
  const [quickMoveQuery, setQuickMoveQuery] = useState("");
  const [teamSlots, setTeamSlots] = useState<TeamSlotState[]>(
    Array.from({ length: TEAM_SIZE }, createEmptyTeamSlot),
  );
  const [damageCalcMode, setDamageCalcMode] = useState<DamageCalcMode>("attack");
  const [damageAttackerSlotIndex, setDamageAttackerSlotIndex] = useState<number | null>(null);
  const [damageDefenderSlotIndex, setDamageDefenderSlotIndex] = useState<number | null>(null);
  const [damageWeather, setDamageWeather] = useState<DamageWeather>("none");
  const [damageTerrain, setDamageTerrain] = useState<DamageTerrain>("none");
  const [damageAttackerGrounded, setDamageAttackerGrounded] = useState(true);
  const [damageDefenderGrounded, setDamageDefenderGrounded] = useState(true);
  const [damageAttackStage, setDamageAttackStage] = useState(0);
  const [damageDefenseStage, setDamageDefenseStage] = useState(0);
  const [damageMoveConfigs, setDamageMoveConfigs] = useState<
    Record<string, Partial<Record<string, DamageMoveConfig>>>
  >({});
  const [defenseMoveConfigs, setDefenseMoveConfigs] = useState<Record<string, ManualDamageMoveConfig>>({});

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

  const abilityByKey = useMemo(() => {
    const map = new Map<string, AbilityRecord>();

    for (const ability of battleData?.abilities ?? []) {
      map.set(ability.id, ability);
      map.set(ability.name.toLowerCase(), ability);
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

  const team = useMemo(
    () =>
      teamSlots.map((slot) => {
        const pokemon = slot.pokemonId ? pokemonByKey.get(slot.pokemonId) ?? null : null;

        return {
          ...slot,
          pokemon,
        };
      }),
    [pokemonByKey, teamSlots],
  );

  const selectedPokemon = team
    .map((slot) => slot.pokemon)
    .filter((pokemon): pokemon is PokemonRecord => Boolean(pokemon));

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
          };
        }

        return {
          slotIndex,
          query,
          pokemon: pokemonByKey.get(trimmed.toLowerCase()) ?? pokemonByKey.get(trimmed) ?? null,
        };
      }),
    [opponentQueries, pokemonByKey],
  );

  const opponentEntries = useMemo(
    () =>
      opponentRoster
        .map((entry) =>
          entry.pokemon
            ? {
                slotIndex: entry.slotIndex,
                query: entry.query,
                pokemon: entry.pokemon,
              }
            : null,
        )
        .filter(
          (
            entry,
          ): entry is {
            slotIndex: number;
            query: string;
            pokemon: PokemonRecord;
          } => Boolean(entry),
        ),
    [opponentRoster],
  );

  const quickPokemon = useMemo(() => {
    const trimmed = quickPokemonQuery.trim();

    if (!trimmed) {
      return null;
    }

    return pokemonByKey.get(trimmed.toLowerCase()) ?? pokemonByKey.get(trimmed) ?? null;
  }, [pokemonByKey, quickPokemonQuery]);

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
    const match = pokemonByKey.get(nextQuery.trim().toLowerCase()) ?? pokemonByKey.get(nextQuery.trim()) ?? null;

    setTeamSlots((current) =>
      current.map((slot, index) =>
        index === slotIndex
          ? {
              ...slot,
              query: nextQuery,
              pokemonId: match?.id ?? null,
              savedAttacks: match ? slot.savedAttacks : [],
            }
          : slot,
      ),
    );
  };

  const clearSlot = (slotIndex: number) => {
    setTeamSlots((current) =>
      current.map((slot, index) => (index === slotIndex ? createEmptyTeamSlot() : slot)),
    );
  };

  const applySlotSavedAttacks = (
    slotIndex: number,
    savedAttacks: PersistedSavedAttack[],
  ) => {
    setTeamSlots((current) =>
      current.map((slot, index) => {
        if (index !== slotIndex) {
          return slot;
        }

        return {
          ...slot,
          savedAttacks,
        };
      }),
    );
  };

  const refreshSavedTeams = async () => {
    const teams = await listSavedTeams();
    setSavedTeams(teams);
  };

  const saveCurrentTeam = async () => {
    try {
      setStorageError(null);
      const saved = await saveTeam({
        id: activeSavedTeamId ?? undefined,
        name: teamName.trim() || "My Team",
        slots: teamSlots,
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
    setTeamSlots(normalizeTeamSlots(savedTeam.slots));
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
      version: 5,
      slots: teamSlots,
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

  const openImportPicker = () => {
    importInputRef.current?.click();
  };

  const importTeamFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
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
      setTeamSlots(normalizeTeamSlots(parsed.slots));
      setOpenerSelections(normalizePersistedOpenerSelections(parsed.openerSelections));
      setStorageMessage(`Imported "${parsed.name?.trim() || "Imported Team"}". Save it to keep it locally.`);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Failed to import team.");
    } finally {
      event.target.value = "";
    }
  };

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
    const availableIndices = opponentEntries.map((entry) => entry.slotIndex);

    setDamageDefenderSlotIndex((current) => {
      if (current !== null && availableIndices.includes(current)) {
        return current;
      }

      return availableIndices[0] ?? null;
    });
  }, [opponentEntries]);

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

  const opponentCoverageMap = useMemo(
    () =>
      new Map(
        opponentEntries.map((entry) => [
          entry.slotIndex,
          team
            .map((slot, index) => {
              if (!slot.pokemon) {
                return null;
              }

              const coverage = getBestSavedAttacksAgainstPokemon(slot.savedAttacks, entry.pokemon);

              return {
                slotIndex: index,
                pokemon: slot.pokemon,
                multiplier: coverage.multiplier,
                attacks: coverage.attacks,
                speedDelta: slot.pokemon.baseStats.spe - entry.pokemon.baseStats.spe,
              };
            })
            .filter(
              (
                coverageEntry,
              ): coverageEntry is {
                slotIndex: number;
                pokemon: PokemonRecord;
                multiplier: number | null;
                attacks: PersistedSavedAttack[];
                speedDelta: number;
              } => Boolean(coverageEntry),
            )
            .sort((left, right) => (right.multiplier ?? 0) - (left.multiplier ?? 0)),
        ]),
      ),
    [opponentEntries, team],
  );

  const enemyThreatMap = useMemo(
    () =>
      new Map(
        team
          .map((slot, slotIndex) => {
            if (!slot.pokemon) {
              return null;
            }

            const pokemon = slot.pokemon;

            return [
              slotIndex,
              opponentEntries
                .map((entry) => {
                  const attackTypes = getPokemonAttackTypeOptions(entry.pokemon);
                  const coverage = getBestAttackMultiplierAgainstPokemon(attackTypes, pokemon);

                  return {
                    slotIndex: entry.slotIndex,
                    pokemon: entry.pokemon,
                    multiplier: coverage.multiplier,
                    attackTypes: coverage.attackTypes,
                    speedDelta: entry.pokemon.baseStats.spe - pokemon.baseStats.spe,
                  };
                })
                .sort((left, right) => (right.multiplier ?? 0) - (left.multiplier ?? 0)),
            ] as const;
          })
          .filter((entry): entry is readonly [number, Array<{
            slotIndex: number;
            pokemon: PokemonRecord;
            multiplier: number | null;
            attackTypes: PokemonType[];
            speedDelta: number;
          }>] => Boolean(entry)),
      ),
    [opponentEntries, team],
  );

  const selectedDamageAttacker =
    damageAttackerSlotIndex !== null && team[damageAttackerSlotIndex]?.pokemon
      ? team[damageAttackerSlotIndex]
      : null;
  const selectedDamageDefender =
    damageDefenderSlotIndex !== null
      ? opponentRoster.find((entry) => entry.slotIndex === damageDefenderSlotIndex && entry.pokemon) ?? null
      : null;
  const selectedDamageSavedAttacks = selectedDamageAttacker?.savedAttacks ?? [];
  const selectedDamageAttackerPokemon = selectedDamageAttacker?.pokemon ?? null;
  const selectedDamageDefenderPokemon = selectedDamageDefender?.pokemon ?? null;
  const currentDamageAttackerPokemon =
    damageCalcMode === "attack" ? selectedDamageAttackerPokemon : selectedDamageDefenderPokemon;
  const currentDamageDefenderPokemon =
    damageCalcMode === "attack" ? selectedDamageDefenderPokemon : selectedDamageAttackerPokemon;
  const defenseMoveConfigKey = getDamageConfigKey(
    damageDefenderSlotIndex ?? -1,
    selectedDamageDefenderPokemon?.id ?? null,
  );
  const defenseMoveConfig =
    defenseMoveConfigs[defenseMoveConfigKey] ?? createDefaultManualDamageMoveConfig(selectedDamageDefenderPokemon);
  const defenseAttackTypeOptions = selectedDamageDefenderPokemon
    ? getPokemonAttackTypeOptions(selectedDamageDefenderPokemon)
    : [];

  useEffect(() => {
    setDamageAttackerGrounded(isLikelyGrounded(selectedDamageAttackerPokemon));
  }, [selectedDamageAttackerPokemon]);

  useEffect(() => {
    setDamageDefenderGrounded(isLikelyGrounded(selectedDamageDefenderPokemon));
  }, [selectedDamageDefenderPokemon]);

  const damageMoveRows = useMemo(() => {
    if (!selectedDamageAttackerPokemon || !selectedDamageDefenderPokemon) {
      return [];
    }

    const configKey = getDamageConfigKey(damageAttackerSlotIndex ?? -1, selectedDamageAttackerPokemon.id);
    const storedConfigs = damageMoveConfigs[configKey] ?? {};

    return selectedDamageSavedAttacks.map((attack) => {
      const config = storedConfigs[attack.id] ?? {
        ...createDefaultDamageMoveConfig(selectedDamageAttackerPokemon),
        category: getResolvedAttackCategory(attack, selectedDamageAttackerPokemon),
        isSpreadMove: getResolvedAttackSpread(attack),
      };
      const defaultPower = getResolvedAttackBasePower(attack);
      const parsedPower = config.power.trim() ? Number(config.power) : defaultPower;
      const basePower = Number.isFinite(parsedPower) && (parsedPower ?? 0) > 0 ? parsedPower : null;

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
                basePower,
                category: config.category,
                isSpreadMove: config.isSpreadMove,
                weather: damageWeather,
                terrain: damageTerrain,
                attackerGrounded: damageAttackerGrounded,
                defenderGrounded: damageDefenderGrounded,
                attackerStatStage: damageAttackStage,
                defenderStatStage: damageDefenseStage,
              })
            : null,
      };
    });
  }, [
    damageAttackStage,
    damageAttackerGrounded,
    damageAttackerSlotIndex,
    damageDefenseStage,
    damageDefenderGrounded,
    damageTerrain,
    damageWeather,
    damageMoveConfigs,
    selectedDamageSavedAttacks,
    selectedDamageAttackerPokemon,
    selectedDamageDefenderPokemon,
  ]);

  const opponentOhkoMap = useMemo(
    () =>
      new Map(
        opponentEntries.map((entry) => [
          entry.slotIndex,
          team
            .flatMap((slot, slotIndex) => {
              if (!slot.pokemon) {
                return [];
              }

              const attackerPokemon = slot.pokemon;

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
                    basePower,
                    category: getResolvedAttackCategory(attack, attackerPokemon),
                    isSpreadMove: getResolvedAttackSpread(attack),
                    weather: damageWeather,
                    terrain: damageTerrain,
                    attackerGrounded: isLikelyGrounded(attackerPokemon),
                    defenderGrounded: isLikelyGrounded(entry.pokemon),
                    attackerStatStage: damageAttackStage,
                    defenderStatStage: damageDefenseStage,
                  });

                  if (estimate.maxPercent < 100) {
                    return null;
                  }

                  return {
                    slotIndex,
                    pokemon: attackerPokemon,
                    attack,
                    estimate,
                    speedDelta: attackerPokemon.baseStats.spe - entry.pokemon.baseStats.spe,
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
    [damageAttackStage, damageDefenseStage, damageTerrain, damageWeather, opponentEntries, team],
  );

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
    });
  }, [
    damageAttackStage,
    damageAttackerGrounded,
    damageDefenseStage,
    damageDefenderGrounded,
    damageTerrain,
    damageWeather,
    defenseMoveConfig,
    selectedDamageAttackerPokemon,
    selectedDamageDefenderPokemon,
  ]);

  const quickPokemonAbilities = useMemo(() => {
    if (!quickPokemon) {
      return [];
    }

    return Object.entries(quickPokemon.abilities)
      .map(([slot, abilityName]) => {
        const ability = abilityByKey.get(abilityName.toLowerCase()) ?? null;

        return {
          slot,
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

    if (quickMove.category === "Status" || quickMove.basePower <= 0) {
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
      basePower: quickMove.basePower,
      category: quickMove.category.toLowerCase() as DamageCategory,
      isSpreadMove: isSpreadTarget(quickMove.target),
      weather: damageWeather,
      terrain: damageTerrain,
      attackerGrounded: damageCalcMode === "attack" ? damageAttackerGrounded : damageDefenderGrounded,
      defenderGrounded: damageCalcMode === "attack" ? damageDefenderGrounded : damageAttackerGrounded,
      attackerStatStage: damageAttackStage,
      defenderStatStage: damageDefenseStage,
    });
  }, [
    damageAttackStage,
    currentDamageAttackerPokemon,
    currentDamageDefenderPokemon,
    damageAttackerGrounded,
    damageCalcMode,
    damageDefenseStage,
    damageDefenderGrounded,
    damageTerrain,
    damageWeather,
    quickMove,
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

  const updateOpponentQuery = (slotIndex: number, query: string) => {
    setOpponentQueries((current) => current.map((entry, index) => (index === slotIndex ? query : entry)));
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

  const clearOpponentTeam = () => {
    setOpponentQueries(createEmptyOpponentSlots());
  };

  return (
    <>
      <section className="team-builder-hero">
        <div>
          <p className="eyebrow">Team Coverage</p>
          <h2>Build a six-Pokemon squad</h2>
          <p className="selector-note">
            Pick six Pokemon from the local database, then save attacks for each slot to inspect
            coverage, matchup pressure, and possible one-hit KOs into the enemy team below.
          </p>
        </div>
        <div className="team-builder-meta">
          <span>{selectedPokemon.length} / 6 selected</span>
          <span>{selectedSavedAttackCount} saved attacks</span>
          <span>{selectedAttackTypes.length} unique attack types</span>
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
            <button type="button" className="secondary-button" onClick={exportCurrentTeam}>
              Export JSON
            </button>
            <button type="button" className="secondary-button" onClick={openImportPicker}>
              Import JSON
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
            <div className="saved-teams-list">
              {savedTeams.map((savedTeam) => (
                <article
                  key={savedTeam.id}
                  className={`saved-team-card ${activeSavedTeamId === savedTeam.id ? "active" : ""}`}
                >
                  <div>
                    <strong>{savedTeam.name}</strong>
                    <p>{new Date(savedTeam.updatedAt).toLocaleString()}</p>
                  </div>
                  <div className="saved-team-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => loadSavedTeamIntoBuilder(savedTeam)}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => removeSavedTeam(savedTeam)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="team-slot-empty">No saved teams yet. Save one locally to keep it offline.</div>
          )}
        </div>
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
            onQueryChange={updateSlotQuery}
            onClear={clearSlot}
            onApplySavedAttacks={applySlotSavedAttacks}
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
            <div>
              <p className="eyebrow">Quick Search</p>
              <h2>Pokemon and move lookup</h2>
            </div>
            <span className="lead-available-count">
              {battleData ? `${battleData.moves.length} moves loaded` : "Loading data"}
            </span>
          </div>

          <div className="quick-search-stack">
            <section className="quick-search-card">
              <div className="coverage-preview-header">
                <p className="eyebrow">Pokemon Lookup</p>
                <span>{quickPokemon ? quickPokemon.name : "Search by name"}</span>
              </div>
              <label className="team-input-label" htmlFor="quick-pokemon-search">
                Pokemon
              </label>
              <input
                id="quick-pokemon-search"
                list="pokemon-options"
                className="team-pokemon-input"
                placeholder={database ? "Search Pokemon" : "Loading local database..."}
                value={quickPokemonQuery}
                onChange={(event) => setQuickPokemonQuery(event.target.value)}
                disabled={!database}
              />

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
              <div className="coverage-preview-header">
                <p className="eyebrow">Move Lookup</p>
                <span>{quickMove ? quickMove.name : "Search by move name"}</span>
              </div>
              <label className="team-input-label" htmlFor="quick-move-search">
                Move
              </label>
              <input
                id="quick-move-search"
                list="move-options"
                className="team-pokemon-input"
                placeholder={battleData ? "Search moves" : "Loading move data..."}
                value={quickMoveQuery}
                onChange={(event) => setQuickMoveQuery(event.target.value)}
                disabled={!battleData}
              />

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
                    <span>Power {quickMove.basePower > 0 ? quickMove.basePower : "--"}</span>
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
                          {quickMove.category === "Status" || quickMove.basePower <= 0
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
              onClick={clearOpponentTeam}
              disabled={opponentEntries.length === 0}
            >
              Clear Enemy Team
            </button>
          </div>
        </div>

        <div className="opponent-search-grid">
          {opponentQueries.map((query, slotIndex) => (
            <label key={`opponent-slot-${slotIndex}`} className="opponent-search">
              <span>Enemy {slotIndex + 1}</span>
              <input
                list="pokemon-options"
                className="team-pokemon-input"
                placeholder={database ? "Search Pokemon" : "Loading local database..."}
                value={query}
                onChange={(event) => updateOpponentQuery(slotIndex, event.target.value)}
                disabled={!database}
              />
            </label>
          ))}
        </div>

        {opponentEntries.length === 0 ? (
          <div className="matchup-empty-board">
            Add up to six opposing Pokemon to see their stats and your team’s super-effective answers.
          </div>
        ) : (
          <>
            <div className="scout-section-header">
              <p className="eyebrow">Enemy Team</p>
              <span>{opponentEntries.length} cards</span>
            </div>
            <div className="enemy-grid">
              {opponentEntries.map((opponentEntry) => {
                const opponentCoverage = opponentCoverageMap.get(opponentEntry.slotIndex) ?? [];
                const ohkoEntries = opponentOhkoMap.get(opponentEntry.slotIndex) ?? [];
                const seEntries = opponentCoverage.filter((entry) => (entry.multiplier ?? 0) > 1);
                const fallbackEntries = opponentCoverage.filter((entry) => (entry.multiplier ?? 0) <= 1).slice(0, 3);
                const guaranteedOhkos = ohkoEntries.filter((entry) => entry.guaranteed);
                const possibleOhkos = ohkoEntries.filter((entry) => !entry.guaranteed);
                const weakTypes = TYPE_ORDER.filter(
                  (attackType) => (getPokemonDefensiveMultiplier(opponentEntry.pokemon, attackType) ?? 1) > 1,
                );

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

            <div className="scout-section-header allied">
              <p className="eyebrow">Our Team</p>
              <span>{selectedPokemon.length} cards</span>
            </div>
            {selectedPokemon.length === 0 ? (
              <div className="matchup-empty-board">Add Pokemon to your team to see enemy STAB pressure into them.</div>
            ) : (
              <div className="enemy-grid allied-grid">
                {team.map((slot, slotIndex) => {
                  if (!slot.pokemon) {
                    return null;
                  }

                  const pokemon = slot.pokemon;

                  const threats = enemyThreatMap.get(slotIndex) ?? [];
                  const seThreats = threats.filter((entry) => (entry.multiplier ?? 0) > 1);
                  const fallbackThreats = threats.filter((entry) => (entry.multiplier ?? 0) <= 1).slice(0, 3);
                  const weakTypes = TYPE_ORDER.filter(
                    (attackType) => (getPokemonDefensiveMultiplier(pokemon, attackType) ?? 1) > 1,
                  );

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
                                  {entry.attackTypes.length > 0 ? (
                                    entry.attackTypes.map((type) => (
                                      <span
                                        key={`${entry.pokemon.id}-threatens-${pokemon.id}-${type}`}
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
                                    <span className="subtle-empty">No STAB pressure found.</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}

                          {seThreats.length === 0 && fallbackThreats.length === 0 ? (
                            <div className="team-slot-empty">Add enemies to compare their STAB pressure.</div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      <section className="board-panel damage-calculator-panel">
        <div className="board-header">
          <div>
            <p className="eyebrow">Damage Calculator</p>
            <h2>Pick one ally and one enemy</h2>
          </div>
        </div>

        <div className="damage-calculator-layout">
          <section className="damage-picker-column">
            <div className="damage-picker-header">
              <p className="eyebrow">My 6</p>
              <span>{selectedPokemon.length} ready</span>
            </div>
            <div className="damage-picker-grid">
              {team.map((slot, slotIndex) => (
                <DamagePickerCard
                  key={`damage-attacker-${slotIndex}`}
                  label={`Slot ${slotIndex + 1}`}
                  isSelected={damageAttackerSlotIndex === slotIndex}
                  isDisabled={!slot.pokemon}
                  pokemon={slot.pokemon}
                  subtitle={
                    slot.pokemon
                      ? `${slot.pokemon.types.join(" / ")}`
                      : loadError
                        ? loadError
                        : "Pick a Pokemon above"
                  }
                  footer={
                    slot.pokemon
                      ? `${slot.savedAttacks.length} saved ${slot.savedAttacks.length === 1 ? "attack" : "attacks"}`
                      : "Unavailable"
                  }
                  onClick={() => setDamageAttackerSlotIndex(slotIndex)}
                />
              ))}
            </div>
          </section>

          <section className="damage-center-panel">
            {currentDamageAttackerPokemon && currentDamageDefenderPokemon ? (
              <>
                <div className="damage-matchup-grid">
                  <article className="damage-side-card attacker">
                    <div className="damage-side-header">
                      <p className="eyebrow">Attacker</p>
                      <PokemonSprite pokemon={currentDamageAttackerPokemon} className="damage-side-sprite" />
                    </div>
                    <h3>{currentDamageAttackerPokemon.name}</h3>
                    <div className="team-type-list">
                      {currentDamageAttackerPokemon.types.map((typeLabel) => {
                        const type = getTypeFromLabel(typeLabel);
                        if (!type) {
                          return null;
                        }

                        return (
                          <span
                            key={`${currentDamageAttackerPokemon.id}-${type}`}
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
                      <span>Atk {getLevel50OtherStatValue(currentDamageAttackerPokemon.baseStats.atk)}</span>
                      <span>SpA {getLevel50OtherStatValue(currentDamageAttackerPokemon.baseStats.spa)}</span>
                      <span>Spe {getLevel50OtherStatValue(currentDamageAttackerPokemon.baseStats.spe)}</span>
                    </div>
                  </article>

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

                  <article className="damage-side-card defender">
                    <div className="damage-side-header">
                      <p className="eyebrow">Defender</p>
                      <PokemonSprite pokemon={currentDamageDefenderPokemon} className="damage-side-sprite" />
                    </div>
                    <h3>{currentDamageDefenderPokemon.name}</h3>
                    <div className="team-type-list">
                      {currentDamageDefenderPokemon.types.map((typeLabel) => {
                        const type = getTypeFromLabel(typeLabel);
                        if (!type) {
                          return null;
                        }

                        return (
                          <span
                            key={`${currentDamageDefenderPokemon.id}-${type}`}
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
                      <span>HP {getLevel50HpValue(currentDamageDefenderPokemon.baseStats.hp)}</span>
                      <span>Def {getLevel50OtherStatValue(currentDamageDefenderPokemon.baseStats.def)}</span>
                      <span>SpD {getLevel50OtherStatValue(currentDamageDefenderPokemon.baseStats.spd)}</span>
                      <span>Spe {getLevel50OtherStatValue(currentDamageDefenderPokemon.baseStats.spe)}</span>
                    </div>
                  </article>
                </div>

                <div className="damage-assumption-row">
                  <span className="damage-assumption-pill">Level 50</span>
                  <span className="damage-assumption-pill">0 IV / 0 EV</span>
                  <span className="damage-assumption-pill">Neutral nature</span>
                  <span className="damage-assumption-pill">No items / abilities</span>
                  <span className="damage-assumption-pill">Spread toggle = {SPREAD_MOVE_MULTIPLIER}x</span>
                </div>

                <div className="damage-global-controls">
                  <label className="damage-type-field">
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

                  <label className="damage-type-field">
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

                  <label className={`damage-spread-toggle ${damageAttackerGrounded ? "active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={damageAttackerGrounded}
                      onChange={(event) => setDamageAttackerGrounded(event.target.checked)}
                    />
                    <span>My Pokemon Grounded</span>
                  </label>

                  <label className={`damage-spread-toggle ${damageDefenderGrounded ? "active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={damageDefenderGrounded}
                      onChange={(event) => setDamageDefenderGrounded(event.target.checked)}
                    />
                    <span>Enemy Grounded</span>
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

                {damageCalcMode === "attack" ? (
                  selectedDamageSavedAttacks.length > 0 ? (
                  <div className="damage-move-list">
                    {damageMoveRows.map((row) => (
                      <article key={`damage-row-${row.attack.id}`} className="damage-move-row">
                        <div className="damage-move-main">
                          <span
                            className="inline-type-pill"
                            style={
                              {
                                "--type-color": TYPE_META[row.attack.type].color,
                                "--type-accent": TYPE_META[row.attack.type].accent,
                              } as CSSProperties
                            }
                          >
                            <img src={getTypeIconUrl(row.attack.type)} alt="" aria-hidden="true" />
                            {TYPE_META[row.attack.type].label}
                          </span>

                          <strong>{getAttackLabel(row.attack)}</strong>

                          <label className="damage-power-field">
                            <span>Base Power</span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              value={row.config.power || (row.defaultPower ? String(row.defaultPower) : "")}
                              onChange={(event) =>
                                updateDamageMoveConfig(
                                  damageAttackerSlotIndex ?? 0,
                                  selectedDamageAttackerPokemon!.id,
                                  row.attack.id,
                                  row.config,
                                  { power: event.target.value },
                                )
                              }
                              placeholder={row.defaultPower ? String(row.defaultPower) : "80"}
                            />
                          </label>
                        </div>

                        <div className="damage-move-controls">
                          <div className="damage-category-toggle" role="group" aria-label="Move category">
                            {(["physical", "special"] as const).map((category) => (
                              <button
                                key={`${row.attack.id}-${category}`}
                                type="button"
                                className={`damage-category-button ${
                                  row.config.category === category ? "active" : ""
                                }`}
                                onClick={() =>
                                  updateDamageMoveConfig(
                                    damageAttackerSlotIndex ?? 0,
                                    selectedDamageAttackerPokemon!.id,
                                    row.attack.id,
                                    row.config,
                                    { category },
                                  )
                                }
                              >
                                {category === "physical" ? "Physical" : "Special"}
                              </button>
                            ))}
                          </div>

                          <label className={`damage-spread-toggle ${row.config.isSpreadMove ? "active" : ""}`}>
                            <input
                              type="checkbox"
                              checked={row.config.isSpreadMove}
                              onChange={(event) =>
                                updateDamageMoveConfig(
                                  damageAttackerSlotIndex ?? 0,
                                  selectedDamageAttackerPokemon!.id,
                                  row.attack.id,
                                  row.config,
                                  { isSpreadMove: event.target.checked },
                                )
                              }
                            />
                            <span>Spread Move</span>
                          </label>
                        </div>

                        <div className={`damage-result-card ${row.estimate ? "ready" : ""}`}>
                          {row.estimate ? (
                            <>
                              <div className="damage-result-topline">
                                <strong>{formatPercent(row.estimate.averagePercent)}%</strong>
                                <span>
                                  {formatPercent(row.estimate.minPercent)}% - {formatPercent(row.estimate.maxPercent)}%
                                </span>
                              </div>
                              <p>
                                Avg {row.estimate.averageDamage} HP
                                {row.estimate.typeMultiplier === 0 ? " • no effect" : ""}
                              </p>
                              <div className="damage-modifier-row">
                                <span>
                                  {row.config.category === "physical" ? "Atk" : "SpA"} {row.estimate.attackStat}
                                </span>
                                <span>
                                  {row.config.category === "physical" ? "Def" : "SpD"} {row.estimate.defenseStat}
                                </span>
                                <span>STAB {formatFlatMultiplier(row.estimate.stabMultiplier)}</span>
                                <span>Type {formatFlatMultiplier(row.estimate.typeMultiplier)}</span>
                                <span>Spread {formatFlatMultiplier(row.estimate.spreadMultiplier)}</span>
                                <span>Weather {formatFlatMultiplier(row.estimate.weatherMultiplier)}</span>
                                <span>Terrain {formatFlatMultiplier(row.estimate.terrainMultiplier)}</span>
                                <span>Atk {formatFlatMultiplier(row.estimate.attackerStageMultiplier)}</span>
                                <span>Def {formatFlatMultiplier(row.estimate.defenderStageMultiplier)}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <strong>Enter power</strong>
                              <p>
                                Add the move’s base power to calculate a rough percentage.
                                {row.defaultPower ? ` Default saved value: ${row.defaultPower}.` : ""}
                              </p>
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="matchup-empty-board">
                    Add saved attacks to {selectedDamageAttackerPokemon!.name} above to unlock move rows here.
                  </div>
                )
                ) : (
                  <div className="damage-move-list">
                    <article className="damage-move-row">
                      <div className="damage-move-main defend">
                        <div className="damage-type-picker">
                          {defenseAttackTypeOptions.length > 0 ? (
                            <div className="damage-type-shortcuts" aria-label="Enemy attack type defaults">
                              {defenseAttackTypeOptions.map((type) => (
                                <button
                                  key={`defense-type-shortcut-${type}`}
                                  type="button"
                                  className={`damage-type-shortcut ${
                                    defenseMoveConfig.attackType === type ? "active" : ""
                                  }`}
                                  style={
                                    {
                                      "--type-color": TYPE_META[type].color,
                                      "--type-accent": TYPE_META[type].accent,
                                    } as CSSProperties
                                  }
                                  onClick={() =>
                                    updateDefenseMoveConfig(
                                      damageDefenderSlotIndex ?? 0,
                                      selectedDamageDefenderPokemon?.id ?? "",
                                      { attackType: type },
                                    )
                                  }
                                >
                                  <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" />
                                  <span>{TYPE_META[type].label}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}

                          <label className="damage-type-field">
                            <span>Attack Type</span>
                            <select
                              value={defenseMoveConfig.attackType}
                              onChange={(event) =>
                                updateDefenseMoveConfig(
                                  damageDefenderSlotIndex ?? 0,
                                  selectedDamageDefenderPokemon?.id ?? "",
                                  { attackType: event.target.value as PokemonType },
                                )
                              }
                            >
                              {TYPE_ORDER.map((type) => (
                                <option key={`defense-type-${type}`} value={type}>
                                  {TYPE_META[type].label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <label className="damage-power-field">
                          <span>Base Power</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={defenseMoveConfig.power}
                            onChange={(event) =>
                              updateDefenseMoveConfig(
                                damageDefenderSlotIndex ?? 0,
                                selectedDamageDefenderPokemon?.id ?? "",
                                { power: event.target.value },
                              )
                            }
                            placeholder="80"
                          />
                        </label>
                      </div>

                      <div className="damage-move-controls">
                        <div className="damage-category-toggle" role="group" aria-label="Incoming move category">
                          {(["physical", "special"] as const).map((category) => (
                            <button
                              key={`defense-${category}`}
                              type="button"
                              className={`damage-category-button ${
                                defenseMoveConfig.category === category ? "active" : ""
                              }`}
                              onClick={() =>
                                updateDefenseMoveConfig(
                                  damageDefenderSlotIndex ?? 0,
                                  selectedDamageDefenderPokemon?.id ?? "",
                                  { category },
                                )
                              }
                            >
                              {category === "physical" ? "Physical" : "Special"}
                            </button>
                          ))}
                        </div>

                        <label
                          className={`damage-spread-toggle ${defenseMoveConfig.isSpreadMove ? "active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={defenseMoveConfig.isSpreadMove}
                            onChange={(event) =>
                              updateDefenseMoveConfig(
                                damageDefenderSlotIndex ?? 0,
                                selectedDamageDefenderPokemon?.id ?? "",
                                { isSpreadMove: event.target.checked },
                              )
                            }
                          />
                          <span>Spread Move</span>
                        </label>
                      </div>

                      <div className={`damage-result-card ${defenseMoveEstimate ? "ready" : ""}`}>
                        {defenseMoveEstimate ? (
                          <>
                            <div className="damage-result-topline">
                              <strong>{formatPercent(defenseMoveEstimate.averagePercent)}%</strong>
                              <span>
                                {formatPercent(defenseMoveEstimate.minPercent)}% -{" "}
                                {formatPercent(defenseMoveEstimate.maxPercent)}%
                              </span>
                            </div>
                            <p>
                              Avg {defenseMoveEstimate.averageDamage} HP taken
                              {defenseMoveEstimate.typeMultiplier === 0 ? " • no effect" : ""}
                            </p>
                            <div className="damage-modifier-row">
                              <span>
                                {defenseMoveConfig.category === "physical" ? "Atk" : "SpA"}{" "}
                                {defenseMoveEstimate.attackStat}
                              </span>
                              <span>
                                {defenseMoveConfig.category === "physical" ? "Def" : "SpD"}{" "}
                                {defenseMoveEstimate.defenseStat}
                              </span>
                              <span>STAB {formatFlatMultiplier(defenseMoveEstimate.stabMultiplier)}</span>
                              <span>Type {formatFlatMultiplier(defenseMoveEstimate.typeMultiplier)}</span>
                              <span>Spread {formatFlatMultiplier(defenseMoveEstimate.spreadMultiplier)}</span>
                              <span>Weather {formatFlatMultiplier(defenseMoveEstimate.weatherMultiplier)}</span>
                              <span>Terrain {formatFlatMultiplier(defenseMoveEstimate.terrainMultiplier)}</span>
                              <span>Atk {formatFlatMultiplier(defenseMoveEstimate.attackerStageMultiplier)}</span>
                              <span>Def {formatFlatMultiplier(defenseMoveEstimate.defenderStageMultiplier)}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <strong>Enter power</strong>
                            <p>Pick an incoming attack type and base power to calculate rough damage taken.</p>
                          </>
                        )}
                      </div>
                    </article>
                  </div>
                )}
              </>
            ) : (
              <div className="matchup-empty-board">
                Select one filled Pokemon from your six and one filled Pokemon from the enemy six.
              </div>
            )}
          </section>

          <section className="damage-picker-column enemy">
            <div className="damage-picker-header">
              <p className="eyebrow">Enemy 6</p>
              <span>{opponentEntries.length} ready</span>
            </div>
            <div className="damage-picker-grid">
              {opponentRoster.map((entry) => (
                <DamagePickerCard
                  key={`damage-defender-${entry.slotIndex}`}
                  label={`Enemy ${entry.slotIndex + 1}`}
                  isSelected={damageDefenderSlotIndex === entry.slotIndex}
                  isDisabled={!entry.pokemon}
                  pokemon={entry.pokemon}
                  subtitle={entry.pokemon ? `${entry.pokemon.types.join(" / ")}` : "Pick a Pokemon above"}
                  footer={
                    entry.pokemon
                      ? `HP ${getLevel50HpValue(entry.pokemon.baseStats.hp)} at rough Lv. 50`
                      : "Unavailable"
                  }
                  onClick={() => setDamageDefenderSlotIndex(entry.slotIndex)}
                />
              ))}
            </div>
          </section>
        </div>
      </section>

      <datalist id="pokemon-options">
        {(database ?? []).map((pokemon) => (
          <option key={pokemon.id} value={pokemon.name} />
        ))}
      </datalist>

      <datalist id="move-options">
        {(battleData?.moves ?? []).map((move) => (
          <option key={move.id} value={move.name} />
        ))}
      </datalist>
    </>
  );
}

function App() {
  const [siteMode, setSiteMode] = useState<SiteMode>("calculator");

  return (
    <div className="app-shell">
      <main className="page-layout">
        <section className="site-tabs" aria-label="Site sections">
          <button
            type="button"
            className={`site-tab ${siteMode === "calculator" ? "active" : ""}`}
            onClick={() => setSiteMode("calculator")}
          >
            Type Calculator
          </button>
          <button
            type="button"
            className={`site-tab ${siteMode === "team" ? "active" : ""}`}
            onClick={() => setSiteMode("team")}
          >
            Team Builder
          </button>
        </section>

        {siteMode === "calculator" ? <CalculatorView /> : <TeamBuilderView />}
      </main>
    </div>
  );
}

export default App;
