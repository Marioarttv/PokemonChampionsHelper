import { normalizePokemonNameKey } from "../data/championsLegalPokemon";
import { getOpponentPreset } from "./opponentMovePresets";
import type { PokemonRecord } from "./pokemonDb";

export type ChampionsStatId = keyof PokemonRecord["baseStats"];
export type ChampionsNonHpStatId = Exclude<ChampionsStatId, "hp">;
export type ChampionsNatureId =
  | "adamant"
  | "bold"
  | "brave"
  | "calm"
  | "careful"
  | "impish"
  | "jolly"
  | "modest"
  | "quiet"
  | "relaxed"
  | "sassy"
  | "timid";
export type ChampionsTemplateId =
  | "fastPhysicalAttacker"
  | "fastSpecialAttacker"
  | "focusSashLeadPhysical"
  | "focusSashLeadSpecial"
  | "physicalBreaker"
  | "specialBreaker"
  | "physicalPivot"
  | "specialPivot"
  | "speedControlSupport"
  | "bulkySupport"
  | "redirectionSupport"
  | "physicalWall"
  | "specialWall"
  | "trickRoomSetter"
  | "trickRoomPhysical"
  | "trickRoomSpecial";

export type ChampionsStatTemplate = {
  id: ChampionsTemplateId;
  label: string;
  description: string;
  nature: ChampionsNatureId;
  statPoints: Record<ChampionsStatId, number>;
};

export type ChampionsStatSpread = {
  nature: ChampionsNatureId;
  statPoints: Record<ChampionsStatId, number>;
};

export type ChampionsAppliedTemplate = Omit<ChampionsStatTemplate, "id"> & {
  id: ChampionsTemplateId | "custom";
};

export type ChampionsComputedStats = PokemonRecord["baseStats"] & {
  template: ChampionsAppliedTemplate;
};

type NatureMeta = {
  label: string;
  increased: ChampionsNonHpStatId;
  decreased: ChampionsNonHpStatId;
};

const CHAMPIONS_LEVEL = 50;
const FIXED_IV = 31;
export const CHAMPIONS_MAX_STAT_POINTS_PER_STAT = 32;
export const CHAMPIONS_TOTAL_STAT_POINTS = 66;
export const CHAMPIONS_STAT_ORDER: ChampionsStatId[] = ["hp", "atk", "def", "spa", "spd", "spe"];
export const CHAMPIONS_STAT_LABELS: Record<ChampionsStatId, string> = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};

const NATURES: Record<ChampionsNatureId, NatureMeta> = {
  adamant: { label: "Adamant", increased: "atk", decreased: "spa" },
  bold: { label: "Bold", increased: "def", decreased: "atk" },
  brave: { label: "Brave", increased: "atk", decreased: "spe" },
  calm: { label: "Calm", increased: "spd", decreased: "atk" },
  careful: { label: "Careful", increased: "spd", decreased: "spa" },
  impish: { label: "Impish", increased: "def", decreased: "spa" },
  jolly: { label: "Jolly", increased: "spe", decreased: "spa" },
  modest: { label: "Modest", increased: "spa", decreased: "atk" },
  quiet: { label: "Quiet", increased: "spa", decreased: "spe" },
  relaxed: { label: "Relaxed", increased: "def", decreased: "spe" },
  sassy: { label: "Sassy", increased: "spd", decreased: "spe" },
  timid: { label: "Timid", increased: "spe", decreased: "atk" },
};

const TEMPLATE_DEFINITIONS: Record<ChampionsTemplateId, ChampionsStatTemplate> = {
  fastPhysicalAttacker: {
    id: "fastPhysicalAttacker",
    label: "Fast Physical Attacker",
    description: "Max attack and speed for standard physical sweepers and cleaners.",
    nature: "jolly",
    statPoints: { hp: 0, atk: 32, def: 2, spa: 0, spd: 0, spe: 32 },
  },
  fastSpecialAttacker: {
    id: "fastSpecialAttacker",
    label: "Fast Special Attacker",
    description: "Max special attack and speed for standard special sweepers and cleaners.",
    nature: "timid",
    statPoints: { hp: 0, atk: 0, def: 2, spa: 32, spd: 0, spe: 32 },
  },
  focusSashLeadPhysical: {
    id: "focusSashLeadPhysical",
    label: "Focus Sash Lead",
    description: "Lead spread that maximizes physical pressure while preserving sash utility.",
    nature: "jolly",
    statPoints: { hp: 0, atk: 32, def: 2, spa: 0, spd: 0, spe: 32 },
  },
  focusSashLeadSpecial: {
    id: "focusSashLeadSpecial",
    label: "Focus Sash Lead",
    description: "Lead spread that maximizes special pressure while preserving sash utility.",
    nature: "timid",
    statPoints: { hp: 0, atk: 0, def: 2, spa: 32, spd: 0, spe: 32 },
  },
  physicalBreaker: {
    id: "physicalBreaker",
    label: "Physical Breaker",
    description: "HP plus attack investment for slower wallbreakers and bruisers.",
    nature: "adamant",
    statPoints: { hp: 32, atk: 32, def: 2, spa: 0, spd: 0, spe: 0 },
  },
  specialBreaker: {
    id: "specialBreaker",
    label: "Special Breaker",
    description: "HP plus special attack investment for bulky special attackers.",
    nature: "modest",
    statPoints: { hp: 32, atk: 0, def: 2, spa: 32, spd: 0, spe: 0 },
  },
  physicalPivot: {
    id: "physicalPivot",
    label: "Physical Pivot",
    description: "Common Incineroar or Scizor style pivot spread with bulk and enough attack.",
    nature: "careful",
    statPoints: { hp: 32, atk: 20, def: 0, spa: 0, spd: 14, spe: 0 },
  },
  specialPivot: {
    id: "specialPivot",
    label: "Special Pivot",
    description: "Bulky special attacker or pivot with some power and some special bulk.",
    nature: "modest",
    statPoints: { hp: 32, atk: 0, def: 0, spa: 20, spd: 14, spe: 0 },
  },
  speedControlSupport: {
    id: "speedControlSupport",
    label: "Speed Control Support",
    description: "Max HP and speed for Tailwind, Icy Wind, Thunder Wave, and Fake Out leads.",
    nature: "jolly",
    statPoints: { hp: 32, atk: 0, def: 2, spa: 0, spd: 0, spe: 32 },
  },
  bulkySupport: {
    id: "bulkySupport",
    label: "Bulky Support",
    description: "General support spread with HP and mixed bulk, skewed slightly toward defense.",
    nature: "bold",
    statPoints: { hp: 32, atk: 0, def: 20, spa: 0, spd: 14, spe: 0 },
  },
  redirectionSupport: {
    id: "redirectionSupport",
    label: "Redirection Support",
    description: "HP-heavy support spread for Follow Me, Rage Powder, and board control.",
    nature: "calm",
    statPoints: { hp: 32, atk: 0, def: 20, spa: 0, spd: 14, spe: 0 },
  },
  physicalWall: {
    id: "physicalWall",
    label: "Physical Wall",
    description: "HP and defense investment for physically bulky support pieces.",
    nature: "impish",
    statPoints: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 },
  },
  specialWall: {
    id: "specialWall",
    label: "Special Wall",
    description: "HP and special defense investment for special tanks and stall pieces.",
    nature: "calm",
    statPoints: { hp: 32, atk: 0, def: 14, spa: 0, spd: 20, spe: 0 },
  },
  trickRoomSetter: {
    id: "trickRoomSetter",
    label: "Trick Room Setter",
    description: "HP and defense investment for dedicated Trick Room setup.",
    nature: "relaxed",
    statPoints: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 },
  },
  trickRoomPhysical: {
    id: "trickRoomPhysical",
    label: "Trick Room Attacker",
    description: "HP and attack investment for slow physical attackers under Trick Room.",
    nature: "brave",
    statPoints: { hp: 32, atk: 32, def: 2, spa: 0, spd: 0, spe: 0 },
  },
  trickRoomSpecial: {
    id: "trickRoomSpecial",
    label: "Trick Room Attacker",
    description: "HP and special attack investment for slow special attackers under Trick Room.",
    nature: "quiet",
    statPoints: { hp: 32, atk: 0, def: 2, spa: 32, spd: 0, spe: 0 },
  },
};

const EXPLICIT_SPECIES_TEMPLATE_OVERRIDES: Record<string, ChampionsTemplateId> = {
  aegislash: "physicalBreaker",
  aerodactyl: "speedControlSupport",
  armarouge: "trickRoomSpecial",
  basculegion: "fastPhysicalAttacker",
  charizard: "fastSpecialAttacker",
  clefable: "redirectionSupport",
  corviknight: "physicalWall",
  dragapult: "fastPhysicalAttacker",
  excadrill: "fastPhysicalAttacker",
  farigiraf: "trickRoomSpecial",
  froslass: "focusSashLeadSpecial",
  garchomp: "fastPhysicalAttacker",
  gengar: "fastSpecialAttacker",
  glimmora: "fastSpecialAttacker",
  golurk: "trickRoomPhysical",
  incineroar: "physicalPivot",
  kingambit: "physicalBreaker",
  maushold: "redirectionSupport",
  meganium: "bulkySupport",
  milotic: "bulkySupport",
  mimikyu: "trickRoomSetter",
  ninetalesalola: "speedControlSupport",
  oranguru: "trickRoomSetter",
  pelipper: "physicalWall",
  politoed: "bulkySupport",
  primarina: "specialBreaker",
  rotomheat: "specialPivot",
  rotomwash: "specialPivot",
  scizor: "physicalPivot",
  sinistcha: "redirectionSupport",
  slowbro: "bulkySupport",
  slowking: "bulkySupport",
  sylveon: "specialBreaker",
  talonflame: "speedControlSupport",
  torkoal: "trickRoomSpecial",
  tyranitar: "physicalBreaker",
  typhlosionhisui: "fastSpecialAttacker",
  venusaur: "fastSpecialAttacker",
  volcarona: "redirectionSupport",
  whimsicott: "speedControlSupport",
};

const REDIRECTION_MOVES = new Set(["followme", "ragepowder"]);
const TRICK_ROOM_MOVES = new Set(["trickroom"]);
const SPEED_CONTROL_MOVES = new Set([
  "tailwind",
  "icywind",
  "thunderwave",
  "electroweb",
  "bulldoze",
  "scaryface",
]);
const PIVOT_MOVES = new Set(["partingshot", "uturn", "voltswitch", "flipturn"]);
const SETUP_MOVES = new Set([
  "swordsdance",
  "calmmind",
  "nastyplot",
  "bulkup",
  "dragondance",
  "clangoroussoul",
  "agility",
]);
const PURE_SUPPORT_MOVES = new Set([
  "helpinghand",
  "lifedew",
  "strengthsap",
  "recover",
  "roost",
  "wideguard",
  "quickguard",
  "willowisp",
  "encore",
  "perishsong",
  "disable",
  "taunt",
  "trickroom",
  "protect",
  "spikyshield",
]);

export function getChampionsNatureLabel(nature: ChampionsNatureId) {
  return NATURES[nature].label;
}

export function getChampionsNatureOptions() {
  return (Object.keys(NATURES) as ChampionsNatureId[]).map((natureId) => ({
    id: natureId,
    label: getChampionsNatureLabel(natureId),
    increased: NATURES[natureId].increased,
    decreased: NATURES[natureId].decreased,
  }));
}

export function getChampionsNatureMultiplier(
  nature: ChampionsNatureId,
  stat: ChampionsNonHpStatId,
) {
  if (NATURES[nature].increased === stat) {
    return 1.1;
  }

  if (NATURES[nature].decreased === stat) {
    return 0.9;
  }

  return 1;
}

export function calculateChampionsHpStat(baseHp: number, statPoints = 0) {
  return Math.floor(((2 * baseHp + FIXED_IV + statPoints) * CHAMPIONS_LEVEL) / 100) + CHAMPIONS_LEVEL + 10;
}

export function calculateChampionsOtherStat(
  baseStat: number,
  statPoints = 0,
  natureMultiplier = 1,
) {
  const preNature = Math.floor(((2 * baseStat + FIXED_IV + statPoints) * CHAMPIONS_LEVEL) / 100) + 5;
  return Math.floor(preNature * natureMultiplier);
}

export function getChampionsTemplate(templateId: ChampionsTemplateId) {
  return TEMPLATE_DEFINITIONS[templateId];
}

export function getTotalChampionsStatPoints(statPoints: Partial<Record<ChampionsStatId, number>> | null | undefined) {
  return CHAMPIONS_STAT_ORDER.reduce((total, statId) => total + Math.max(0, statPoints?.[statId] ?? 0), 0);
}

export function normalizeChampionsStatSpread(
  spread: Partial<ChampionsStatSpread> | null | undefined,
  fallback?: Partial<ChampionsStatSpread> | null,
): ChampionsStatSpread {
  const fallbackNature = fallback?.nature ?? "adamant";
  const nextNature =
    spread?.nature && spread.nature in NATURES
      ? spread.nature
      : fallbackNature in NATURES
        ? (fallbackNature as ChampionsNatureId)
        : "adamant";
  const normalizedStatPoints = Object.fromEntries(
    CHAMPIONS_STAT_ORDER.map((statId) => {
      const rawValue = spread?.statPoints?.[statId] ?? fallback?.statPoints?.[statId] ?? 0;
      const normalizedValue = Number.isFinite(rawValue) ? Math.floor(Math.max(0, rawValue)) : 0;
      return [statId, Math.min(CHAMPIONS_MAX_STAT_POINTS_PER_STAT, normalizedValue)];
    }),
  ) as Record<ChampionsStatId, number>;

  let remainingBudget = CHAMPIONS_TOTAL_STAT_POINTS;

  for (const statId of CHAMPIONS_STAT_ORDER) {
    const clampedValue = Math.min(normalizedStatPoints[statId], remainingBudget);
    normalizedStatPoints[statId] = clampedValue;
    remainingBudget -= clampedValue;
  }

  return {
    nature: nextNature,
    statPoints: normalizedStatPoints,
  };
}

function normalizeMoveName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getPokemonKeyCandidates(pokemon: PokemonRecord) {
  return [
    normalizePokemonNameKey(pokemon.id),
    normalizePokemonNameKey(pokemon.name),
    normalizePokemonNameKey(pokemon.baseSpecies),
    pokemon.forme ? normalizePokemonNameKey(`${pokemon.baseSpecies}${pokemon.forme}`) : "",
  ].filter(Boolean);
}

function hasAnyMove(moveNames: Set<string>, options: ReadonlySet<string>) {
  for (const moveName of moveNames) {
    if (options.has(moveName)) {
      return true;
    }
  }

  return false;
}

function countTaggedMoves(moveNames: Set<string>, options: ReadonlySet<string>) {
  let count = 0;

  for (const moveName of moveNames) {
    if (options.has(moveName)) {
      count += 1;
    }
  }

  return count;
}

function getPreferredOffenseStat(pokemon: PokemonRecord) {
  return pokemon.baseStats.atk >= pokemon.baseStats.spa ? "atk" : "spa";
}

function pickTemplateByBulkBias(pokemon: PokemonRecord) {
  if (pokemon.baseStats.def - pokemon.baseStats.spd >= 18) {
    return "physicalWall";
  }

  if (pokemon.baseStats.spd - pokemon.baseStats.def >= 18) {
    return "specialWall";
  }

  return "bulkySupport";
}

function inferTemplateFromPreset(pokemon: PokemonRecord): ChampionsTemplateId | null {
  const preset = getOpponentPreset(pokemon);

  if (!preset) {
    return null;
  }

  const moveNames = new Set(preset.moveNames.map(normalizeMoveName));
  const itemKey = normalizePokemonNameKey(preset.itemName);
  const supportMoveCount = countTaggedMoves(moveNames, PURE_SUPPORT_MOVES);
  const strongerStat = getPreferredOffenseStat(pokemon);
  const offensiveBase = pokemon.baseStats[strongerStat];

  if (hasAnyMove(moveNames, REDIRECTION_MOVES)) {
    return "redirectionSupport";
  }

  if (hasAnyMove(moveNames, TRICK_ROOM_MOVES)) {
    if (supportMoveCount >= 2 && offensiveBase < 110) {
      return "trickRoomSetter";
    }

    return strongerStat === "atk" ? "trickRoomPhysical" : "trickRoomSpecial";
  }

  if (hasAnyMove(moveNames, SPEED_CONTROL_MOVES)) {
    if (itemKey === "focussash") {
      return strongerStat === "atk" ? "focusSashLeadPhysical" : "focusSashLeadSpecial";
    }

    if (offensiveBase >= 120 && pokemon.baseStats.spe >= 95) {
      return strongerStat === "atk" ? "fastPhysicalAttacker" : "fastSpecialAttacker";
    }

    return "speedControlSupport";
  }

  if (itemKey === "focussash") {
    return strongerStat === "atk" ? "focusSashLeadPhysical" : "focusSashLeadSpecial";
  }

  if (itemKey === "assaultvest" || hasAnyMove(moveNames, PIVOT_MOVES)) {
    return strongerStat === "atk" ? "physicalPivot" : "specialPivot";
  }

  if (hasAnyMove(moveNames, SETUP_MOVES)) {
    if (pokemon.baseStats.spe >= 95) {
      return strongerStat === "atk" ? "fastPhysicalAttacker" : "fastSpecialAttacker";
    }

    return strongerStat === "atk" ? "physicalBreaker" : "specialBreaker";
  }

  if (supportMoveCount >= 2) {
    return pickTemplateByBulkBias(pokemon);
  }

  return null;
}

function inferTemplateFromBaseStats(pokemon: PokemonRecord): ChampionsTemplateId {
  const strongerStat = getPreferredOffenseStat(pokemon);
  const offensiveBase = pokemon.baseStats[strongerStat];
  const bulkScore = pokemon.baseStats.hp + pokemon.baseStats.def + pokemon.baseStats.spd;

  if (pokemon.baseStats.spe <= 60 && offensiveBase >= 115) {
    return strongerStat === "atk" ? "trickRoomPhysical" : "trickRoomSpecial";
  }

  if (pokemon.baseStats.spe >= 100 && offensiveBase >= 100) {
    return strongerStat === "atk" ? "fastPhysicalAttacker" : "fastSpecialAttacker";
  }

  if (bulkScore >= 300 && offensiveBase <= 105) {
    return pickTemplateByBulkBias(pokemon);
  }

  if (offensiveBase >= 120) {
    return strongerStat === "atk" ? "physicalBreaker" : "specialBreaker";
  }

  if (pokemon.baseStats.spe >= 85) {
    return strongerStat === "atk" ? "fastPhysicalAttacker" : "fastSpecialAttacker";
  }

  if (bulkScore >= 280) {
    return strongerStat === "atk" ? "physicalPivot" : "specialPivot";
  }

  return strongerStat === "atk" ? "physicalBreaker" : "specialBreaker";
}

export function getChampionsTemplateIdForPokemon(pokemon: PokemonRecord): ChampionsTemplateId {
  for (const key of getPokemonKeyCandidates(pokemon)) {
    const override = EXPLICIT_SPECIES_TEMPLATE_OVERRIDES[key];

    if (override) {
      return override;
    }
  }

  return inferTemplateFromPreset(pokemon) ?? inferTemplateFromBaseStats(pokemon);
}

export function getChampionsTemplateForPokemon(pokemon: PokemonRecord) {
  return getChampionsTemplate(getChampionsTemplateIdForPokemon(pokemon));
}

export function getDefaultChampionsStatSpreadForPokemon(pokemon: PokemonRecord): ChampionsStatSpread {
  const template = getChampionsTemplateForPokemon(pokemon);

  return {
    nature: template.nature,
    statPoints: { ...template.statPoints },
  };
}

export function getChampionsComputedStats(
  pokemon: PokemonRecord,
  options?: {
    templateId?: ChampionsTemplateId;
    spread?: Partial<ChampionsStatSpread> | null;
    baseStats?: PokemonRecord["baseStats"];
  },
): ChampionsComputedStats {
  const template =
    options?.spread
      ? ({
          id: "custom",
          label: "Custom Spread",
          description: "Custom nature and stat-point allocation stored in the moveset database.",
          ...normalizeChampionsStatSpread(options.spread, getDefaultChampionsStatSpreadForPokemon(pokemon)),
        } satisfies ChampionsAppliedTemplate)
      : options?.templateId
        ? getChampionsTemplate(options.templateId)
        : getChampionsTemplateForPokemon(pokemon);
  const baseStats = options?.baseStats ?? pokemon.baseStats;

  return {
    hp: calculateChampionsHpStat(baseStats.hp, template.statPoints.hp),
    atk: calculateChampionsOtherStat(
      baseStats.atk,
      template.statPoints.atk,
      getChampionsNatureMultiplier(template.nature, "atk"),
    ),
    def: calculateChampionsOtherStat(
      baseStats.def,
      template.statPoints.def,
      getChampionsNatureMultiplier(template.nature, "def"),
    ),
    spa: calculateChampionsOtherStat(
      baseStats.spa,
      template.statPoints.spa,
      getChampionsNatureMultiplier(template.nature, "spa"),
    ),
    spd: calculateChampionsOtherStat(
      baseStats.spd,
      template.statPoints.spd,
      getChampionsNatureMultiplier(template.nature, "spd"),
    ),
    spe: calculateChampionsOtherStat(
      baseStats.spe,
      template.statPoints.spe,
      getChampionsNatureMultiplier(template.nature, "spe"),
    ),
    template,
  };
}

export function formatChampionsTemplateSummary(template: ChampionsAppliedTemplate | ChampionsStatTemplate) {
  const entries: string[] = [];

  for (const [statId, value] of Object.entries(template.statPoints) as Array<[ChampionsStatId, number]>) {
    if (value <= 0) {
      continue;
    }

    entries.push(`${value} ${statId.toUpperCase()}`);
  }

  return `${template.label} · ${getChampionsNatureLabel(template.nature)} · ${entries.join(" / ")}`;
}
