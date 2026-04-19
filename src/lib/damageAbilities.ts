import type { PokemonType } from "../data/typeChart";
import type { DamageCategory, DamageWeather } from "./damage";
import type { PokemonRecord } from "./pokemonDb";

export type DamageAbilityRole = "attacker" | "defender";

export type DamageAbilityId =
  | "none"
  | "adaptability"
  | "aerilate"
  | "pixilate"
  | "refrigerate"
  | "galvanize"
  | "fairyaura"
  | "darkaura"
  | "sandforce"
  | "solarpower"
  | "technician"
  | "hugepower"
  | "purepower"
  | "toughclaws"
  | "ironfist"
  | "strongjaw"
  | "megalauncher"
  | "sharpness"
  | "reckless"
  | "punkrock"
  | "thickfat"
  | "filter"
  | "solidrock"
  | "prismarmor"
  | "furcoat"
  | "icescales"
  | "heatproof"
  | "levitate"
  | "flashfire"
  | "waterabsorb"
  | "stormdrain"
  | "dryskin"
  | "voltabsorb"
  | "lightningrod"
  | "motordrive"
  | "sapsipper"
  | "eartheater"
  | "bulletproof"
  | "soundproof";

export type DamageAbilityOption = {
  id: DamageAbilityId;
  label: string;
  roles: DamageAbilityRole[];
  description: string;
};

const DAMAGE_ABILITY_OPTIONS: DamageAbilityOption[] = [
  {
    id: "none",
    label: "None",
    roles: ["attacker", "defender"],
    description: "Ignore ability-based damage modifiers.",
  },
  {
    id: "adaptability",
    label: "Adaptability",
    roles: ["attacker"],
    description: "Raises STAB from 1.5x to 2x.",
  },
  {
    id: "aerilate",
    label: "Aerilate",
    roles: ["attacker"],
    description: "Normal moves become Flying and gain a 1.2x boost.",
  },
  {
    id: "pixilate",
    label: "Pixilate",
    roles: ["attacker"],
    description: "Normal moves become Fairy and gain a 1.2x boost.",
  },
  {
    id: "refrigerate",
    label: "Refrigerate",
    roles: ["attacker"],
    description: "Normal moves become Ice and gain a 1.2x boost.",
  },
  {
    id: "galvanize",
    label: "Galvanize",
    roles: ["attacker"],
    description: "Normal moves become Electric and gain a 1.2x boost.",
  },
  {
    id: "fairyaura",
    label: "Fairy Aura",
    roles: ["attacker", "defender"],
    description: "Fairy moves on the field are boosted by 1.33x.",
  },
  {
    id: "darkaura",
    label: "Dark Aura",
    roles: ["attacker", "defender"],
    description: "Dark moves on the field are boosted by 1.33x.",
  },
  {
    id: "sandforce",
    label: "Sand Force",
    roles: ["attacker"],
    description: "Boosts Rock, Ground, and Steel moves in sand by 1.3x.",
  },
  {
    id: "solarpower",
    label: "Solar Power",
    roles: ["attacker"],
    description: "Boosts special attacks in sun by 1.5x.",
  },
  {
    id: "technician",
    label: "Technician",
    roles: ["attacker"],
    description: "Boosts moves with 60 base power or less by 1.5x.",
  },
  {
    id: "hugepower",
    label: "Huge Power",
    roles: ["attacker"],
    description: "Doubles physical damage.",
  },
  {
    id: "purepower",
    label: "Pure Power",
    roles: ["attacker"],
    description: "Doubles physical damage.",
  },
  {
    id: "toughclaws",
    label: "Tough Claws",
    roles: ["attacker"],
    description: "Boosts supported contact moves by 1.3x.",
  },
  {
    id: "ironfist",
    label: "Iron Fist",
    roles: ["attacker"],
    description: "Boosts supported punching moves by 1.2x.",
  },
  {
    id: "strongjaw",
    label: "Strong Jaw",
    roles: ["attacker"],
    description: "Boosts supported biting moves by 1.5x.",
  },
  {
    id: "megalauncher",
    label: "Mega Launcher",
    roles: ["attacker"],
    description: "Boosts supported pulse and aura moves by 1.5x.",
  },
  {
    id: "sharpness",
    label: "Sharpness",
    roles: ["attacker"],
    description: "Boosts supported slicing moves by 1.5x.",
  },
  {
    id: "reckless",
    label: "Reckless",
    roles: ["attacker"],
    description: "Boosts supported recoil and crash moves by 1.2x.",
  },
  {
    id: "punkrock",
    label: "Punk Rock",
    roles: ["attacker", "defender"],
    description: "Boosts the user's sound moves by 1.3x and cuts incoming sound damage in half.",
  },
  {
    id: "thickfat",
    label: "Thick Fat",
    roles: ["defender"],
    description: "Halves incoming Fire and Ice damage.",
  },
  {
    id: "filter",
    label: "Filter",
    roles: ["defender"],
    description: "Reduces super-effective damage to 0.75x.",
  },
  {
    id: "solidrock",
    label: "Solid Rock",
    roles: ["defender"],
    description: "Reduces super-effective damage to 0.75x.",
  },
  {
    id: "prismarmor",
    label: "Prism Armor",
    roles: ["defender"],
    description: "Reduces super-effective damage to 0.75x.",
  },
  {
    id: "furcoat",
    label: "Fur Coat",
    roles: ["defender"],
    description: "Halves incoming physical damage.",
  },
  {
    id: "icescales",
    label: "Ice Scales",
    roles: ["defender"],
    description: "Halves incoming special damage.",
  },
  {
    id: "heatproof",
    label: "Heatproof",
    roles: ["defender"],
    description: "Halves incoming Fire damage.",
  },
  {
    id: "levitate",
    label: "Levitate",
    roles: ["defender"],
    description: "Grants Ground immunity.",
  },
  {
    id: "flashfire",
    label: "Flash Fire",
    roles: ["defender"],
    description: "Grants Fire immunity.",
  },
  {
    id: "waterabsorb",
    label: "Water Absorb",
    roles: ["defender"],
    description: "Grants Water immunity.",
  },
  {
    id: "stormdrain",
    label: "Storm Drain",
    roles: ["defender"],
    description: "Grants Water immunity.",
  },
  {
    id: "dryskin",
    label: "Dry Skin",
    roles: ["defender"],
    description: "Grants Water immunity and makes Fire deal 1.25x damage.",
  },
  {
    id: "voltabsorb",
    label: "Volt Absorb",
    roles: ["defender"],
    description: "Grants Electric immunity.",
  },
  {
    id: "lightningrod",
    label: "Lightning Rod",
    roles: ["defender"],
    description: "Grants Electric immunity.",
  },
  {
    id: "motordrive",
    label: "Motor Drive",
    roles: ["defender"],
    description: "Grants Electric immunity.",
  },
  {
    id: "sapsipper",
    label: "Sap Sipper",
    roles: ["defender"],
    description: "Grants Grass immunity.",
  },
  {
    id: "eartheater",
    label: "Earth Eater",
    roles: ["defender"],
    description: "Grants Ground immunity.",
  },
  {
    id: "bulletproof",
    label: "Bulletproof",
    roles: ["defender"],
    description: "Grants immunity to supported ball and bomb moves.",
  },
  {
    id: "soundproof",
    label: "Soundproof",
    roles: ["defender"],
    description: "Grants immunity to supported sound moves.",
  },
];

const DAMAGE_ABILITY_BY_ID = new Map(
  DAMAGE_ABILITY_OPTIONS.map((option) => [option.id, option] as const),
);

const POKEMON_ABILITY_OVERRIDE_NAMES: Record<string, readonly string[]> = {
  floettemega: ["Fairy Aura"],
};

const CONTACT_MOVE_KEYS = new Set([
  "aquajet",
  "aquastep",
  "bravebird",
  "bitterblade",
  "bulletpunch",
  "bugbite",
  "closecombat",
  "crunch",
  "direclaw",
  "doubleedge",
  "dragonclaw",
  "dualwingbeat",
  "extremespeed",
  "fakeout",
  "flareblitz",
  "flipturn",
  "flowertrick",
  "gigatonhammer",
  "icehammer",
  "jetpunch",
  "knockoff",
  "kowtowcleave",
  "lastrespects",
  "leafblade",
  "liquidation",
  "lowkick",
  "machpunch",
  "playrough",
  "poltergeist",
  "poisonjab",
  "populationbomb",
  "psychicfangs",
  "ragingbull",
  "rockblast",
  "sacredsword",
  "shadowclaw",
  "shadowsneak",
  "stoneaxe",
  "suckerpunch",
  "throatchop",
  "triplearrows",
  "tripleaxel",
  "tropkick",
  "uturn",
  "upperhand",
  "waterfall",
  "wavecrash",
  "woodhammer",
  "xscissor",
  "zenheadbutt",
]);

const PUNCHING_MOVE_KEYS = new Set([
  "bulletpunch",
  "drainpunch",
  "firepunch",
  "focuspunch",
  "icepunch",
  "machpunch",
  "thunderpunch",
]);

const BITING_MOVE_KEYS = new Set([
  "bite",
  "crunch",
  "firefang",
  "hyperfang",
  "icefang",
  "jawlock",
  "poisonfang",
  "psychicfangs",
  "thunderfang",
]);

const PULSE_MOVE_KEYS = new Set([
  "aurasphere",
  "darkpulse",
  "dragonpulse",
  "healpulse",
  "originpulse",
  "terrainpulse",
  "waterpulse",
]);

const SLICING_MOVE_KEYS = new Set([
  "ceaselessedge",
  "leafblade",
  "nightslash",
  "psychocut",
  "razorshell",
  "sacredsword",
  "shadowclaw",
  "slash",
  "solarblade",
  "stoneaxe",
  "tripleaxel",
  "xscissor",
]);

const RECKLESS_MOVE_KEYS = new Set([
  "bravebird",
  "doubleedge",
  "flareblitz",
  "headcharge",
  "headsmash",
  "highjumpkick",
  "jumpkick",
  "lightofruin",
  "takedown",
  "volttackle",
  "wavecrash",
  "wildcharge",
  "woodhammer",
]);

const SOUND_MOVE_KEYS = new Set([
  "alluringvoice",
  "boomburst",
  "bugbuzz",
  "clangingscales",
  "disarmingvoice",
  "echoedvoice",
  "hypervoice",
  "nobleroar",
  "overdrive",
  "partingshot",
  "relicsong",
  "snarl",
  "sparklingaria",
  "torchsong",
]);

const BALL_OR_BOMB_MOVE_KEYS = new Set([
  "electroball",
  "energyball",
  "focusblast",
  "gyroball",
  "mistball",
  "mudbomb",
  "octazooka",
  "pollenpuff",
  "pyroball",
  "rockblast",
  "seedbomb",
  "shadowball",
  "sludgebomb",
  "weatherball",
  "zapcannon",
]);

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isSupportedMoveKey(set: ReadonlySet<string>, moveName?: string | null) {
  if (!moveName) {
    return false;
  }

  return set.has(normalizeKey(moveName));
}

export function getDamageAbilityOptions(role?: DamageAbilityRole) {
  if (!role) {
    return DAMAGE_ABILITY_OPTIONS;
  }

  return DAMAGE_ABILITY_OPTIONS.filter((option) => option.roles.includes(role));
}

export function getDamageAbilityLabel(abilityId: DamageAbilityId) {
  return DAMAGE_ABILITY_BY_ID.get(abilityId)?.label ?? "None";
}

export function getDamageAbilityDescription(abilityId: DamageAbilityId) {
  return DAMAGE_ABILITY_BY_ID.get(abilityId)?.description ?? "Ignore ability-based damage modifiers.";
}

export function normalizeDamageAbilityId(value: string | null | undefined): DamageAbilityId | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeKey(value);
  return DAMAGE_ABILITY_BY_ID.has(normalized as DamageAbilityId) ? (normalized as DamageAbilityId) : null;
}

export function getPokemonAbilityNames(pokemon: PokemonRecord | null | undefined) {
  if (!pokemon) {
    return [];
  }

  const overrideAbilityNames = POKEMON_ABILITY_OVERRIDE_NAMES[normalizeKey(pokemon.id)];

  if (overrideAbilityNames?.length) {
    return [...overrideAbilityNames];
  }

  return Array.from(
    new Set(
      Object.values(pokemon.abilities)
        .map((ability) => ability?.trim())
        .filter((ability): ability is string => Boolean(ability)),
    ),
  );
}

export function getDefaultDamageAbilityId(pokemon: PokemonRecord | null | undefined): DamageAbilityId {
  return getDefaultDamageAbilityIdFromNames(getPokemonAbilityNames(pokemon));
}

export function getDefaultDamageAbilityIdFromNames(abilityNames: readonly string[]) {
  for (const abilityName of abilityNames) {
    const normalizedAbilityId = normalizeDamageAbilityId(abilityName);

    if (normalizedAbilityId && normalizedAbilityId !== "none") {
      return normalizedAbilityId;
    }
  }

  return "none";
}

export function getAbilityAdjustedAttackType(attackType: PokemonType, attackerAbility: DamageAbilityId) {
  if (attackType !== "normal") {
    return attackType;
  }

  if (attackerAbility === "aerilate") {
    return "flying";
  }

  if (attackerAbility === "pixilate") {
    return "fairy";
  }

  if (attackerAbility === "refrigerate") {
    return "ice";
  }

  if (attackerAbility === "galvanize") {
    return "electric";
  }

  return attackType;
}

export function getAttackerAbilityModifier(options: {
  originalAttackType: PokemonType;
  effectiveAttackType: PokemonType;
  basePower: number;
  category: DamageCategory;
  weather: DamageWeather;
  attackerAbility: DamageAbilityId;
  moveName?: string | null;
}) {
  const {
    originalAttackType,
    effectiveAttackType,
    basePower,
    category,
    weather,
    attackerAbility,
    moveName,
  } = options;

  if (
    originalAttackType === "normal" &&
    (attackerAbility === "aerilate" ||
      attackerAbility === "pixilate" ||
      attackerAbility === "refrigerate" ||
      attackerAbility === "galvanize")
  ) {
    return 1.2;
  }

  if (attackerAbility === "sandforce" && weather === "sand") {
    return effectiveAttackType === "rock" || effectiveAttackType === "ground" || effectiveAttackType === "steel"
      ? 1.3
      : 1;
  }

  if (attackerAbility === "solarpower") {
    return weather === "sun" && category === "special" ? 1.5 : 1;
  }

  if (attackerAbility === "technician") {
    return basePower <= 60 ? 1.5 : 1;
  }

  if (attackerAbility === "hugepower" || attackerAbility === "purepower") {
    return category === "physical" ? 2 : 1;
  }

  if (attackerAbility === "toughclaws") {
    return isSupportedMoveKey(CONTACT_MOVE_KEYS, moveName) ? 1.3 : 1;
  }

  if (attackerAbility === "ironfist") {
    return isSupportedMoveKey(PUNCHING_MOVE_KEYS, moveName) ? 1.2 : 1;
  }

  if (attackerAbility === "strongjaw") {
    return isSupportedMoveKey(BITING_MOVE_KEYS, moveName) ? 1.5 : 1;
  }

  if (attackerAbility === "megalauncher") {
    return isSupportedMoveKey(PULSE_MOVE_KEYS, moveName) ? 1.5 : 1;
  }

  if (attackerAbility === "sharpness") {
    return isSupportedMoveKey(SLICING_MOVE_KEYS, moveName) ? 1.5 : 1;
  }

  if (attackerAbility === "reckless") {
    return isSupportedMoveKey(RECKLESS_MOVE_KEYS, moveName) ? 1.2 : 1;
  }

  if (attackerAbility === "punkrock") {
    return isSupportedMoveKey(SOUND_MOVE_KEYS, moveName) ? 1.3 : 1;
  }

  return 1;
}

export function getFieldAbilityModifier(
  attackType: PokemonType,
  attackerAbility: DamageAbilityId,
  defenderAbility: DamageAbilityId,
) {
  if ((attackerAbility === "fairyaura" || defenderAbility === "fairyaura") && attackType === "fairy") {
    return 4 / 3;
  }

  if ((attackerAbility === "darkaura" || defenderAbility === "darkaura") && attackType === "dark") {
    return 4 / 3;
  }

  return 1;
}

export function getDefenderAbilityTypeMultiplier(options: {
  typeMultiplier: number;
  attackType: PokemonType;
  defenderAbility: DamageAbilityId;
  moveName?: string | null;
}) {
  const { typeMultiplier, attackType, defenderAbility, moveName } = options;

  if (typeMultiplier === 0) {
    return 0;
  }

  if (
    (defenderAbility === "levitate" || defenderAbility === "eartheater") &&
    attackType === "ground"
  ) {
    return 0;
  }

  if (defenderAbility === "flashfire" && attackType === "fire") {
    return 0;
  }

  if (
    (defenderAbility === "waterabsorb" ||
      defenderAbility === "stormdrain" ||
      defenderAbility === "dryskin") &&
    attackType === "water"
  ) {
    return 0;
  }

  if (
    (defenderAbility === "voltabsorb" ||
      defenderAbility === "lightningrod" ||
      defenderAbility === "motordrive") &&
    attackType === "electric"
  ) {
    return 0;
  }

  if (defenderAbility === "sapsipper" && attackType === "grass") {
    return 0;
  }

  if (defenderAbility === "bulletproof" && isSupportedMoveKey(BALL_OR_BOMB_MOVE_KEYS, moveName)) {
    return 0;
  }

  if ((defenderAbility === "soundproof" || defenderAbility === "punkrock") && isSupportedMoveKey(SOUND_MOVE_KEYS, moveName)) {
    return 0;
  }

  return typeMultiplier;
}

export function getDefenderAbilityModifier(options: {
  attackType: PokemonType;
  category: DamageCategory;
  defenderAbility: DamageAbilityId;
  typeMultiplier: number;
  moveName?: string | null;
}) {
  const { attackType, category, defenderAbility, typeMultiplier, moveName } = options;

  if (typeMultiplier === 0) {
    return 1;
  }

  if (defenderAbility === "thickfat") {
    return attackType === "fire" || attackType === "ice" ? 0.5 : 1;
  }

  if (
    defenderAbility === "filter" ||
    defenderAbility === "solidrock" ||
    defenderAbility === "prismarmor"
  ) {
    return typeMultiplier > 1 ? 0.75 : 1;
  }

  if (defenderAbility === "furcoat") {
    return category === "physical" ? 0.5 : 1;
  }

  if (defenderAbility === "icescales") {
    return category === "special" ? 0.5 : 1;
  }

  if (defenderAbility === "heatproof") {
    return attackType === "fire" ? 0.5 : 1;
  }

  if (defenderAbility === "dryskin") {
    return attackType === "fire" ? 1.25 : 1;
  }

  if (defenderAbility === "punkrock") {
    return isSupportedMoveKey(SOUND_MOVE_KEYS, moveName) ? 0.5 : 1;
  }

  return 1;
}
