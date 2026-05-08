import { normalizePokemonNameKey } from "../data/championsLegalPokemon";
import type { DamageTerrain, DamageWeather } from "./damage";
import { getOpponentPreset, getOpponentPresetMoveNames } from "./opponentMovePresets";
import type { MoveRecord } from "./battleData";
import type { PokemonRecord } from "./pokemonDb";
import type {
  BattleStateMemberInput,
  BattleStatusCondition,
  CandidateMove,
  SetHypothesis,
} from "./engine";
import type { BattleFieldState, BattleSideState } from "./engine/types";

export type ShowdownBridgeSnapshot = {
  source: "pokemon-showdown";
  capturedAt: string;
  url: string;
  room: {
    id: string;
    type: "battle";
    side: "p1" | "p2" | "p3" | "p4" | "";
    requestType: "move" | "switch" | "team" | "wait" | null;
    rqid: number | null;
    request: ShowdownRequestSnapshot | null;
  };
  battle: {
    id: string;
    roomid: string;
    tier: string;
    gameType: string;
    gen: number;
    turn: number;
    ended: boolean;
    weather: string;
    weatherTimeLeft: number;
    weatherMinTimeLeft: number;
    pseudoWeather: Array<[string, number?, number?]>;
    teamPreviewCount: number;
    pokemonControlled: number;
    mySide: string;
    nearSide: string;
    farSide: string;
    sides: Partial<Record<"p1" | "p2", ShowdownSideSnapshot>>;
  };
};

export type ShowdownSideSnapshot = {
  sideid: "p1" | "p2" | "";
  id: string;
  name: string;
  totalPokemon: number;
  openTeamSheet?: boolean;
  sideConditions: Record<string, unknown>;
  active: Array<ShowdownPokemonSnapshot | null>;
  pokemon: ShowdownPokemonSnapshot[];
};

export type ShowdownPokemonSnapshot = {
  name: string;
  speciesForme: string;
  ident: string;
  details: string;
  searchid: string;
  slot: number;
  fainted: boolean;
  hp: number;
  maxhp: number;
  level: number;
  gender: "M" | "F" | "N" | string;
  ability: string;
  baseAbility: string;
  item: string;
  itemEffect: string;
  prevItem: string;
  prevItemEffect: string;
  status: string;
  statusData: { sleepTurns?: number; toxicTurns?: number };
  boosts: Record<string, number>;
  volatiles: string[];
  turnstatuses: string[];
  movestatuses: string[];
  lastMove: string;
  moveTrack: unknown[];
  moves: string[];
  teraType: string;
  terastallized: string;
};

export type ShowdownRequestSnapshot = {
  active?: Array<{
    moves?: Array<{
      move: string;
      id: string;
      pp: number;
      maxpp: number;
      target: string;
      disabled?: boolean | string;
    }>;
    canMegaEvo?: boolean;
    canMegaEvoX?: boolean;
    canMegaEvoY?: boolean;
    canZMove?: unknown;
    canDynamax?: boolean;
    maxMoves?: unknown;
    canTerastallize?: string;
    trapped?: boolean;
    maybeTrapped?: boolean;
  }>;
  side?: {
    id: "p1" | "p2" | "p3" | "p4" | "";
    pokemon: Array<{
      ident: string;
      details: string;
      condition: string;
      active?: boolean;
      stats?: Record<string, number>;
      moves?: string[];
      baseAbility?: string;
      item?: string;
      pokeball?: string;
      teraType?: string;
      canMegaEvo?: boolean;
      canMegaEvoX?: boolean;
      canMegaEvoY?: boolean;
    }>;
  } | null;
  wait?: boolean;
  forceSwitch?: boolean | boolean[];
  teamPreview?: boolean;
};

export type ShowdownBridgeBattleInput = {
  ally: BattleStateMemberInput[];
  enemy: BattleStateMemberInput[];
  weather: DamageWeather;
  terrain: DamageTerrain;
  allySide: Partial<BattleSideState>;
  enemySide: Partial<BattleSideState>;
  fieldState: Partial<BattleFieldState>;
};

export type ShowdownBridgeImportResult = {
  input: ShowdownBridgeBattleInput | null;
  summary: string;
  warnings: string[];
  unresolvedSpecies: string[];
};

type ShowdownSideRole = "ally" | "enemy";
type ShowdownRequestPokemon = NonNullable<NonNullable<ShowdownRequestSnapshot["side"]>["pokemon"]>[number];

type PokemonLookup = {
  byKey: Map<string, PokemonRecord>;
};

type HpParseResult = {
  hpPercent: number;
  fainted: boolean;
};

const STATUS_MAP: Record<string, BattleStatusCondition> = {
  "": "none",
  brn: "burn",
  frz: "freeze",
  par: "paralysis",
  psn: "poison",
  slp: "sleep",
  tox: "badPoison",
  fnt: "none",
};

const WEATHER_MAP: Record<string, DamageWeather> = {
  "": "none",
  none: "none",
  raindance: "rain",
  rain: "rain",
  sunnyday: "sun",
  sun: "sun",
  desolateland: "sun",
  sandstorm: "sand",
  sand: "sand",
  snow: "snow",
  hail: "snow",
};

const TERRAIN_MAP: Record<string, DamageTerrain> = {
  electricterrain: "electric",
  grassyterrain: "grassy",
  psychicterrain: "psychic",
  mistyterrain: "misty",
};

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(100, value));
}

function clampStage(value: unknown) {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(-6, Math.min(6, Math.round(numberValue)));
}

function uniq(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function buildPokemonLookup(pokemonEntries: PokemonRecord[]): PokemonLookup {
  const byKey = new Map<string, PokemonRecord>();
  for (const pokemon of pokemonEntries) {
    const keys = uniq([
      pokemon.id,
      pokemon.name,
      pokemon.baseSpecies,
      pokemon.forme ? `${pokemon.baseSpecies}-${pokemon.forme}` : null,
    ]);
    for (const key of keys) {
      const normalized = normalizePokemonNameKey(key);
      if (!byKey.has(normalized)) byKey.set(normalized, pokemon);
    }
  }
  return { byKey };
}

function parseSpeciesFromDetails(details: string) {
  return details.split(",")[0]?.trim() ?? "";
}

function parseNameFromIdent(ident: string) {
  const colonIndex = ident.indexOf(":");
  return (colonIndex >= 0 ? ident.slice(colonIndex + 1) : ident).trim();
}

function getPokemonCandidateNames(pokemon: ShowdownPokemonSnapshot) {
  const detailsSpecies = parseSpeciesFromDetails(pokemon.details);
  const identName = parseNameFromIdent(pokemon.ident);
  const gender = pokemon.gender && pokemon.gender !== "N" ? pokemon.gender : "";
  return uniq([
    pokemon.speciesForme,
    detailsSpecies,
    gender ? `${detailsSpecies}-${gender}` : null,
    pokemon.name,
    identName,
  ]);
}

function resolvePokemonRecord(
  pokemon: ShowdownPokemonSnapshot,
  lookup: PokemonLookup,
) {
  for (const candidate of getPokemonCandidateNames(pokemon)) {
    const resolved = lookup.byKey.get(normalizePokemonNameKey(candidate));
    if (resolved) return resolved;
  }
  return null;
}

function parseHpCondition(condition: string | null | undefined, fallbackHp: number, fallbackMaxHp: number): HpParseResult {
  const text = condition?.trim() ?? "";
  const hpToken = text.split(/\s+/)[0] ?? "";

  if (text.includes(" fnt") || hpToken === "0" || hpToken === "0.0") {
    return { hpPercent: 0, fainted: true };
  }

  if (hpToken.includes("/")) {
    const [currentRaw, maxRaw] = hpToken.split("/");
    const current = Number.parseFloat(currentRaw ?? "");
    const max = Number.parseFloat(maxRaw ?? "");
    if (Number.isFinite(current) && Number.isFinite(max) && max > 0) {
      return { hpPercent: clampPercent((current / max) * 100), fainted: current <= 0 };
    }
  }

  const percent = Number.parseFloat(hpToken);
  if (Number.isFinite(percent)) {
    return { hpPercent: clampPercent(percent), fainted: percent <= 0 };
  }

  if (Number.isFinite(fallbackHp) && Number.isFinite(fallbackMaxHp) && fallbackMaxHp > 0) {
    return { hpPercent: clampPercent((fallbackHp / fallbackMaxHp) * 100), fainted: fallbackHp <= 0 };
  }

  return { hpPercent: 100, fainted: false };
}

function parseStatusFromCondition(condition: string | null | undefined) {
  const parts = condition?.trim().split(/\s+/).slice(1) ?? [];
  return parts.find((part) => STATUS_MAP[normalizeKey(part)]) ?? "";
}

function mapStatus(status: string | null | undefined, warnings: string[], label: string): BattleStatusCondition {
  const key = normalizeKey(status ?? "");
  const mapped = STATUS_MAP[key];
  if (mapped) return mapped;
  if (key) warnings.push(`${label} has unsupported status "${status}".`);
  return "none";
}

function getToxicTurns(pokemon: ShowdownPokemonSnapshot, statusCondition: BattleStatusCondition) {
  if (statusCondition !== "badPoison") {
    return 0;
  }

  const toxicTurns = pokemon.statusData?.toxicTurns;
  return typeof toxicTurns === "number" && Number.isFinite(toxicTurns) ? Math.max(1, Math.round(toxicTurns)) : 1;
}

function cleanPublicName(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "(exists)" || trimmed === "(mail)" || trimmed === "???") return null;
  return trimmed;
}

function getRequestPokemonByIdent(request: ShowdownRequestSnapshot | null) {
  const byIdent = new Map<string, ShowdownRequestPokemon>();
  for (const pokemon of request?.side?.pokemon ?? []) {
    if (pokemon.ident) byIdent.set(pokemon.ident, pokemon);
  }
  return byIdent;
}

function getRequestActiveSlot(
  snapshot: ShowdownBridgeSnapshot,
  role: ShowdownSideRole,
  activeSlot: number | null,
) {
  if (role !== "ally" || activeSlot == null) return null;
  return snapshot.room.request?.active?.[activeSlot] ?? null;
}

function getMoveNamesFromRequestActive(
  active: ReturnType<typeof getRequestActiveSlot>,
) {
  return active?.moves?.map((move) => move.move || move.id).filter(Boolean) ?? [];
}

function getKnownMoveNames(
  role: ShowdownSideRole,
  pokemon: ShowdownPokemonSnapshot,
  requestPokemon: ShowdownRequestPokemon | null,
  requestActive: ReturnType<typeof getRequestActiveSlot>,
) {
  const requestMoves = role === "ally" ? requestPokemon?.moves ?? [] : [];
  const activeMoves = getMoveNamesFromRequestActive(requestActive);
  const publicMoves = pokemon.moves ?? [];
  return uniq([...activeMoves, ...requestMoves, ...publicMoves]);
}

function getCandidateMoves(
  role: ShowdownSideRole,
  pokemon: PokemonRecord,
  knownMoveNames: string[],
): CandidateMove[] {
  if (role !== "enemy") return [];
  const knownMoveKeys = new Set(knownMoveNames.map(normalizeKey));
  return getOpponentPresetMoveNames(pokemon)
    .filter((moveName) => !knownMoveKeys.has(normalizeKey(moveName)))
    .map((name) => ({
      name,
      source: "preset",
      confidence: "candidate",
      weight: 0.55,
    }));
}

function getSetHypotheses(
  role: ShowdownSideRole,
  pokemon: PokemonRecord,
  knownMoveNames: string[],
  publicAbilityName: string | null,
  publicItemName: string | null,
): SetHypothesis[] {
  if (role !== "enemy") return [];
  const preset = getOpponentPreset(pokemon);
  if (!preset) return [];
  return [
    {
      moves: knownMoveNames.length > 0 ? uniq([...knownMoveNames, ...preset.moveNames]).slice(0, 4) : preset.moveNames,
      ability: publicAbilityName ?? preset.abilityName,
      item: publicItemName ?? preset.itemName,
      probability: 0.55,
      source: "preset",
    },
  ];
}

function getStageBlock(boosts: Record<string, number> | null | undefined) {
  return {
    attack: clampStage(boosts?.atk),
    defense: clampStage(boosts?.def),
    specialAttack: clampStage(boosts?.spa),
    specialDefense: clampStage(boosts?.spd),
    speed: clampStage(boosts?.spe),
  };
}

function isProtected(pokemon: ShowdownPokemonSnapshot) {
  return pokemon.turnstatuses.includes("protect") || pokemon.movestatuses.includes("protect");
}

function isFlinched(pokemon: ShowdownPokemonSnapshot) {
  return pokemon.turnstatuses.includes("flinch") || pokemon.movestatuses.includes("flinch");
}

function buildMembersForSide(
  snapshot: ShowdownBridgeSnapshot,
  side: ShowdownSideSnapshot,
  role: ShowdownSideRole,
  lookup: PokemonLookup,
  warnings: string[],
  unresolvedSpecies: string[],
) {
  const requestByIdent = role === "ally" ? getRequestPokemonByIdent(snapshot.room.request) : new Map();
  const activeIdentityKeys = new Set(side.active.filter(Boolean).map((pokemon) => getShowdownPokemonIdentityKey(pokemon!)));
  const orderedPokemon = [
    ...side.active.filter((pokemon): pokemon is ShowdownPokemonSnapshot => Boolean(pokemon)),
    ...side.pokemon.filter((pokemon) => !activeIdentityKeys.has(getShowdownPokemonIdentityKey(pokemon))),
  ];
  const seen = new Set<string>();
  const uniquePokemon = orderedPokemon.filter((pokemon) => {
    const key = getShowdownPokemonIdentityKey(pokemon);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const activeSlotByKey = new Map(
    side.active
      .map((pokemon, index) => (pokemon ? [getShowdownPokemonIdentityKey(pokemon), index] as const : null))
      .filter((entry): entry is readonly [string, number] => Boolean(entry)),
  );
  const members: BattleStateMemberInput[] = [];

  uniquePokemon.forEach((showdownPokemon, teamIndex) => {
    const pokemon = resolvePokemonRecord(showdownPokemon, lookup);
    const label = showdownPokemon.speciesForme || parseSpeciesFromDetails(showdownPokemon.details) || showdownPokemon.name;
    if (!pokemon) {
      unresolvedSpecies.push(label || showdownPokemon.ident || "unknown");
      return;
    }

    const activeSlot = activeSlotByKey.get(getShowdownPokemonIdentityKey(showdownPokemon)) ?? null;
    const requestPokemon = requestByIdent.get(showdownPokemon.ident) ?? null;
    const requestActive = getRequestActiveSlot(snapshot, role, activeSlot);
    const hp = parseHpCondition(
      requestPokemon?.condition,
      showdownPokemon.hp,
      showdownPokemon.maxhp,
    );
    const statusCondition = mapStatus(showdownPokemon.status || parseStatusFromCondition(requestPokemon?.condition), warnings, pokemon.name);
    const knownMoveNames = getKnownMoveNames(role, showdownPokemon, requestPokemon, requestActive);
    const publicAbilityName = cleanPublicName(showdownPokemon.ability || showdownPokemon.baseAbility);
    const publicItemName = cleanPublicName(showdownPokemon.item);
    const requestAbilityName = cleanPublicName(requestPokemon?.baseAbility);
    const requestItemName = cleanPublicName(requestPokemon?.item);
    const abilityName = role === "ally" ? publicAbilityName ?? requestAbilityName : publicAbilityName;
    const itemName = role === "ally" ? publicItemName ?? requestItemName : publicItemName;
    const candidateMoves = getCandidateMoves(role, pokemon, knownMoveNames);

    members.push({
      id: `${role}-${teamIndex}`,
      label: role === "ally" ? `Showdown ${teamIndex + 1}` : `Enemy ${teamIndex + 1}`,
      pokemon,
      statSpread: null,
      teamIndex,
      currentHpPercent: showdownPokemon.fainted || hp.fainted ? 0 : hp.hpPercent,
      abilityName,
      itemName,
      savedAttacks: [],
      knownMoves: [],
      moveNames: role === "enemy" && knownMoveNames.length === 0 ? [] : knownMoveNames,
      inferredMoveNames: [],
      candidateMoves,
      knowledge: role === "ally" ? "known" : knownMoveNames.length > 0 ? "partial" : "unknown",
      stages: getStageBlock(showdownPokemon.boosts),
      statusCondition,
      sleepTurns: statusCondition === "sleep" ? Math.max(1, showdownPokemon.statusData?.sleepTurns ?? 1) : 0,
      toxicTurns: getToxicTurns(showdownPokemon, statusCondition),
      tauntTurns: showdownPokemon.volatiles.includes("taunt") ? 1 : 0,
      encoreTurns: showdownPokemon.volatiles.includes("encore") ? 1 : 0,
      encoredMoveId: null,
      disableTurns: showdownPokemon.volatiles.includes("disable") ? 1 : 0,
      disabledMoveId: null,
      helpingHandTurns: showdownPokemon.turnstatuses.includes("helpinghand") ? 1 : 0,
      lastMoveId: null,
      turnsActive: activeSlot == null ? 0 : 1,
      protectStreak: isProtected(showdownPokemon) ? 1 : 0,
      isProtected: isProtected(showdownPokemon),
      isFlinched: isFlinched(showdownPokemon),
      wasSwitchedInThisTurn: false,
      infoMode: role === "ally" ? "openTeamSheet" : side.openTeamSheet ? "openTeamSheet" : "closedSheet",
      setHypotheses: getSetHypotheses(role, pokemon, knownMoveNames, publicAbilityName, publicItemName),
      isActive: activeSlot != null && !showdownPokemon.fainted && !hp.fainted,
    });
  });

  return members;
}

function getShowdownPokemonIdentityKey(pokemon: ShowdownPokemonSnapshot) {
  return pokemon.ident || pokemon.searchid || `${pokemon.details}|${pokemon.name}|${pokemon.slot}`;
}

function mapWeather(weather: string): DamageWeather {
  return WEATHER_MAP[normalizeKey(weather)] ?? "none";
}

function mapTerrain(pseudoWeather: Array<[string, number?, number?]>): DamageTerrain {
  for (const entry of pseudoWeather) {
    const key = normalizeKey(String(entry[0] ?? ""));
    const terrain = TERRAIN_MAP[key];
    if (terrain) return terrain;
  }
  return "none";
}

function getPseudoWeatherTurns(pseudoWeather: Array<[string, number?, number?]>, id: string) {
  const entry = pseudoWeather.find((value) => normalizeKey(String(value[0] ?? "")) === id);
  if (!entry) return 0;
  return Math.max(1, Math.round(Number(entry[2] ?? entry[1] ?? 1)));
}

function getSideConditionTurns(side: ShowdownSideSnapshot, conditionId: string) {
  const entry = Object.entries(side.sideConditions ?? {}).find(([key, value]) => {
    const normalizedKey = normalizeKey(key);
    if (normalizedKey === conditionId) return true;
    if (Array.isArray(value) && normalizeKey(String(value[0] ?? "")) === conditionId) return true;
    return false;
  })?.[1];
  if (!entry) return 0;

  if (Array.isArray(entry)) {
    return Math.max(1, Math.round(Number(entry[2] ?? entry[1] ?? 1)));
  }

  return 1;
}

function buildSideRuntime(side: ShowdownSideSnapshot): Partial<BattleSideState> {
  return {
    tailwindTurns: getSideConditionTurns(side, "tailwind"),
    reflectTurns: getSideConditionTurns(side, "reflect"),
    lightScreenTurns: getSideConditionTurns(side, "lightscreen"),
    auroraVeilTurns: getSideConditionTurns(side, "auroraveil"),
    safeguardTurns: getSideConditionTurns(side, "safeguard"),
    quickGuardActive: getSideConditionTurns(side, "quickguard") > 0,
    wideGuardActive: getSideConditionTurns(side, "wideguard") > 0,
  };
}

function getAllyAndEnemySides(snapshot: ShowdownBridgeSnapshot) {
  const p1 = snapshot.battle.sides.p1 ?? null;
  const p2 = snapshot.battle.sides.p2 ?? null;
  if (!p1 || !p2) return null;

  const allySideId = snapshot.room.side || snapshot.battle.mySide || snapshot.battle.nearSide || "p1";
  const allyShowdownSide = allySideId === "p2" ? p2 : p1;
  const enemyShowdownSide = allyShowdownSide.sideid === p2.sideid ? p1 : p2;

  return { allyShowdownSide, enemyShowdownSide };
}

export function showdownSnapshotToBattleInput(
  snapshot: ShowdownBridgeSnapshot,
  options: {
    pokemonEntries: PokemonRecord[];
    moveByKey: ReadonlyMap<string, MoveRecord>;
  },
): ShowdownBridgeImportResult {
  void options.moveByKey;
  const warnings: string[] = [];
  const unresolvedSpecies: string[] = [];
  const sides = getAllyAndEnemySides(snapshot);
  if (!sides) {
    return {
      input: null,
      summary: "No complete Showdown battle sides found.",
      warnings: ["The Showdown snapshot did not include both p1 and p2."],
      unresolvedSpecies,
    };
  }

  const lookup = buildPokemonLookup(options.pokemonEntries);
  const ally = buildMembersForSide(
    snapshot,
    sides.allyShowdownSide,
    "ally",
    lookup,
    warnings,
    unresolvedSpecies,
  );
  const enemy = buildMembersForSide(
    snapshot,
    sides.enemyShowdownSide,
    "enemy",
    lookup,
    warnings,
    unresolvedSpecies,
  );
  const weather = mapWeather(snapshot.battle.weather);
  const terrain = mapTerrain(snapshot.battle.pseudoWeather ?? []);
  const allyActiveCount = ally.filter((member) => member.isActive).length;
  const enemyActiveCount = enemy.filter((member) => member.isActive).length;

  if (allyActiveCount === 0) warnings.push("No active ally Pokemon found in the Showdown snapshot.");
  if (enemyActiveCount === 0) warnings.push("No active enemy Pokemon found in the Showdown snapshot.");

  return {
    input: {
      ally,
      enemy,
      weather,
      terrain,
      allySide: buildSideRuntime(sides.allyShowdownSide),
      enemySide: buildSideRuntime(sides.enemyShowdownSide),
      fieldState: {
        turn: Math.max(1, snapshot.battle.turn || 1),
        weather,
        terrain,
        trickRoomTurns: getPseudoWeatherTurns(snapshot.battle.pseudoWeather ?? [], "trickroom"),
      },
    },
    summary: `${sides.allyShowdownSide.name || "Ally"} vs ${sides.enemyShowdownSide.name || "Enemy"} · Turn ${Math.max(1, snapshot.battle.turn || 1)}`,
    warnings,
    unresolvedSpecies,
  };
}
