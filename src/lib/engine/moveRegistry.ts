import type { BattleMoveEffectData, BattleMoveOption } from "./types";

const DEFAULT_TAUNT_TURNS = 3;
const DEFAULT_SCREEN_TURNS = 5;

export type SpecialMoveDefinition = {
  effectKind: BattleMoveOption["effectKind"];
  targetKind: BattleMoveOption["targetKind"];
  effectData?: BattleMoveEffectData;
};

const PROTECT_FAMILY_MOVE_KEYS = new Set([
  "protect",
  "detect",
  "banefulbunker",
  "burninbulwark",
  "burningbulwark",
  "kingsshield",
  "obstruct",
  "quickguard",
  "silktrap",
  "spikyshield",
  "wideguard",
]);

const SELF_PROTECT_MOVE_KEYS = new Set([
  "protect",
  "detect",
  "banefulbunker",
  "burninbulwark",
  "burningbulwark",
  "kingsshield",
  "obstruct",
  "silktrap",
  "spikyshield",
]);

const MOVE_ROLE_TAGS_BY_KEY: Record<string, string[]> = {
  raindance: ["weatherRain"],
  sunnyday: ["weatherSun"],
  sandstorm: ["weatherSand"],
  snowscape: ["weatherSnow"],
  hail: ["weatherSnow"],
};

export const SPECIAL_MOVE_DEFINITIONS: Record<string, SpecialMoveDefinition> = {
  protect: { effectKind: "protect", targetKind: "self" },
  detect: { effectKind: "protect", targetKind: "self" },
  banefulbunker: { effectKind: "protect", targetKind: "self" },
  burninbulwark: { effectKind: "protect", targetKind: "self" },
  burningbulwark: { effectKind: "protect", targetKind: "self" },
  kingsshield: { effectKind: "protect", targetKind: "self" },
  obstruct: { effectKind: "protect", targetKind: "self" },
  silktrap: { effectKind: "protect", targetKind: "self" },
  spikyshield: { effectKind: "protect", targetKind: "self" },
  fakeout: { effectKind: "fakeOut", targetKind: "singleOpponent" },
  quickguard: { effectKind: "guard", targetKind: "field", effectData: { guard: "quickGuard" } },
  wideguard: { effectKind: "guard", targetKind: "field", effectData: { guard: "wideGuard" } },
  tailwind: { effectKind: "tailwind", targetKind: "field" },
  trickroom: { effectKind: "trickRoom", targetKind: "field" },
  raindance: { effectKind: "weather", targetKind: "field", effectData: { weather: "rain" } },
  sunnyday: { effectKind: "weather", targetKind: "field", effectData: { weather: "sun" } },
  sandstorm: { effectKind: "weather", targetKind: "field", effectData: { weather: "sand" } },
  snowscape: { effectKind: "weather", targetKind: "field", effectData: { weather: "snow" } },
  hail: { effectKind: "weather", targetKind: "field", effectData: { weather: "snow" } },
  safeguard: { effectKind: "safeguard", targetKind: "field", effectData: { safeguardTurns: DEFAULT_SCREEN_TURNS } },
  allyswitch: { effectKind: "allySwitch", targetKind: "self" },
  feint: {
    effectKind: "damage",
    targetKind: "singleOpponent",
    effectData: { breaksProtect: true, breaksGuards: true },
  },
  encore: { effectKind: "encore", targetKind: "singleOpponent", effectData: { encoreTurns: 3 } },
  disable: { effectKind: "disable", targetKind: "singleOpponent", effectData: { disableTurns: 3 } },
  helpinghand: { effectKind: "helpingHand", targetKind: "singleAlly", effectData: { helpingHand: true } },
  followme: { effectKind: "redirection", targetKind: "self", effectData: { setsRedirection: true } },
  ragepowder: { effectKind: "redirection", targetKind: "self", effectData: { setsRedirection: true, powderMove: true } },
  taunt: { effectKind: "taunt", targetKind: "singleOpponent", effectData: { tauntTurns: DEFAULT_TAUNT_TURNS } },
  thunderwave: { effectKind: "status", targetKind: "singleOpponent", effectData: { statusCondition: "paralysis" } },
  glare: { effectKind: "status", targetKind: "singleOpponent", effectData: { statusCondition: "paralysis" } },
  stunspore: {
    effectKind: "status",
    targetKind: "singleOpponent",
    effectData: { statusCondition: "paralysis", powderMove: true },
  },
  willowisp: { effectKind: "status", targetKind: "singleOpponent", effectData: { statusCondition: "burn" } },
  toxic: { effectKind: "status", targetKind: "singleOpponent", effectData: { statusCondition: "badPoison" } },
  poisonpowder: {
    effectKind: "status",
    targetKind: "singleOpponent",
    effectData: { statusCondition: "poison", powderMove: true },
  },
  poisongas: { effectKind: "status", targetKind: "allOpponents", effectData: { statusCondition: "poison" } },
  toxicthread: {
    effectKind: "status",
    targetKind: "singleOpponent",
    effectData: { statusCondition: "poison", targetStages: { speed: -1 } },
  },
  spore: {
    effectKind: "status",
    targetKind: "singleOpponent",
    effectData: { statusCondition: "sleep", powderMove: true },
  },
  sleeppowder: {
    effectKind: "status",
    targetKind: "singleOpponent",
    effectData: { statusCondition: "sleep", powderMove: true },
  },
  hypnosis: { effectKind: "status", targetKind: "singleOpponent", effectData: { statusCondition: "sleep" } },
  reflect: { effectKind: "screen", targetKind: "field", effectData: { screen: "reflect" } },
  lightscreen: { effectKind: "screen", targetKind: "field", effectData: { screen: "lightScreen" } },
  auroraveil: { effectKind: "screen", targetKind: "field", effectData: { screen: "auroraVeil" } },
  swordsdance: { effectKind: "boost", targetKind: "self", effectData: { selfStages: { attack: 2 } } },
  nastyplot: { effectKind: "boost", targetKind: "self", effectData: { selfStages: { specialAttack: 2 } } },
  calmmind: {
    effectKind: "boost",
    targetKind: "self",
    effectData: { selfStages: { specialAttack: 1, specialDefense: 1 } },
  },
  dragondance: { effectKind: "boost", targetKind: "self", effectData: { selfStages: { attack: 1, speed: 1 } } },
  agility: { effectKind: "boost", targetKind: "self", effectData: { selfStages: { speed: 2 } } },
  irondefense: { effectKind: "boost", targetKind: "self", effectData: { selfStages: { defense: 2 } } },
  bulkup: { effectKind: "boost", targetKind: "self", effectData: { selfStages: { attack: 1, defense: 1 } } },
  recover: { effectKind: "heal", targetKind: "self", effectData: { healFraction: 0.5 } },
  roost: { effectKind: "heal", targetKind: "self", effectData: { healFraction: 0.5 } },
  slackoff: { effectKind: "heal", targetKind: "self", effectData: { healFraction: 0.5 } },
  softboiled: { effectKind: "heal", targetKind: "self", effectData: { healFraction: 0.5 } },
  moonlight: { effectKind: "heal", targetKind: "self", effectData: { healFraction: 0.5 } },
  morningsun: { effectKind: "heal", targetKind: "self", effectData: { healFraction: 0.5 } },
  synthesis: { effectKind: "heal", targetKind: "self", effectData: { healFraction: 0.5 } },
  lifedew: { effectKind: "heal", targetKind: "allAllies", effectData: { healAlliesFraction: 0.25 } },
  icywind: { effectKind: "damage", targetKind: "allOpponents", effectData: { targetStages: { speed: -1 } } },
  electroweb: { effectKind: "damage", targetKind: "allOpponents", effectData: { targetStages: { speed: -1 } } },
  bulldoze: { effectKind: "damage", targetKind: "allAdjacent", effectData: { targetStages: { speed: -1 } } },
  rocktomb: { effectKind: "damage", targetKind: "singleOpponent", effectData: { targetStages: { speed: -1 } } },
  nuzzle: { effectKind: "damage", targetKind: "singleOpponent", effectData: { statusCondition: "paralysis" } },
  icebeam: { effectKind: "damage", targetKind: "singleOpponent", effectData: { statusCondition: "freeze", secondaryChance: 10 } },
  blizzard: { effectKind: "damage", targetKind: "allOpponents", effectData: { statusCondition: "freeze", secondaryChance: 10 } },
  freezedry: { effectKind: "damage", targetKind: "singleOpponent", effectData: { statusCondition: "freeze", secondaryChance: 10 } },
  icepunch: { effectKind: "damage", targetKind: "singleOpponent", effectData: { statusCondition: "freeze", secondaryChance: 10 } },
  mortalspin: { effectKind: "damage", targetKind: "allOpponents", effectData: { statusCondition: "poison" } },
  poisonjab: { effectKind: "damage", targetKind: "singleOpponent", effectData: { statusCondition: "poison", secondaryChance: 30 } },
  sludgebomb: { effectKind: "damage", targetKind: "singleOpponent", effectData: { statusCondition: "poison", secondaryChance: 30 } },
  sludgewave: { effectKind: "damage", targetKind: "allAdjacent", effectData: { statusCondition: "poison", secondaryChance: 10 } },
  poisonfang: { effectKind: "damage", targetKind: "singleOpponent", effectData: { statusCondition: "badPoison", secondaryChance: 50 } },
  snarl: { effectKind: "damage", targetKind: "allOpponents", effectData: { targetStages: { specialAttack: -1 } } },
  breakingswipe: { effectKind: "damage", targetKind: "allOpponents", effectData: { targetStages: { attack: -1 } } },
  chillingwater: { effectKind: "damage", targetKind: "singleOpponent", effectData: { targetStages: { attack: -1 } } },
  rockslide: { effectKind: "damage", targetKind: "allOpponents", effectData: { flinchChance: 30 } },
  airslash: { effectKind: "damage", targetKind: "singleOpponent", effectData: { flinchChance: 30 } },
  heatwave: { effectKind: "damage", targetKind: "allOpponents", effectData: { statusCondition: "burn", secondaryChance: 10 } },
  scaryface: { effectKind: "status", targetKind: "singleOpponent", effectData: { targetStages: { speed: -2 } } },
  cottonspore: {
    effectKind: "status",
    targetKind: "singleOpponent",
    effectData: { targetStages: { speed: -3 }, powderMove: true },
  },
};

export function normalizeMoveKey(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function getSpecialMoveDefinition(moveName: string | undefined, category: string | null | undefined) {
  const key = normalizeMoveKey(moveName);
  if (SPECIAL_MOVE_DEFINITIONS[key]) {
    return SPECIAL_MOVE_DEFINITIONS[key];
  }

  if (category === "Status") {
    return {
      effectKind: "unsupported" as const,
      targetKind: "singleOpponent" as const,
    };
  }

  return null;
}

export function isProtectFamilyMoveName(moveName: string | null | undefined) {
  return PROTECT_FAMILY_MOVE_KEYS.has(normalizeMoveKey(moveName));
}

export function hasProtectFamilyMove(moves: ReadonlyArray<Pick<BattleMoveOption, "name">>) {
  return moves.some((move) => isProtectFamilyMoveName(move.name));
}

export function isSelfProtectMoveName(moveName: string | null | undefined) {
  return SELF_PROTECT_MOVE_KEYS.has(normalizeMoveKey(moveName));
}

export function hasSelfProtectMove(moves: ReadonlyArray<Pick<BattleMoveOption, "name">>) {
  return moves.some((move) => isSelfProtectMoveName(move.name));
}

export function getMoveRoleTags(move: Pick<BattleMoveOption, "name" | "effectKind" | "effectData" | "category" | "isSpreadMove" | "priority">) {
  const tags = new Set<string>();

  if (move.category === "physical") {
    tags.add("physical");
  }
  if (move.category === "special") {
    tags.add("special");
  }
  if (move.priority > 0 && move.category !== null) {
    tags.add("priority");
  }
  if (move.isSpreadMove && move.category !== null) {
    tags.add("spread");
  }

  switch (move.effectKind) {
    case "fakeOut":
      tags.add("fakeOut");
      break;
    case "protect":
      tags.add("protect");
      break;
    case "tailwind":
      tags.add("tailwind");
      tags.add("speedControl");
      break;
    case "trickRoom":
      tags.add("trickRoom");
      tags.add("speedControl");
      break;
    case "weather":
      tags.add("weather");
      if (move.effectData?.weather) {
        tags.add(`weather${move.effectData.weather}`);
      }
      break;
    case "redirection":
      tags.add("redirection");
      break;
    case "guard":
      if (move.effectData?.guard === "wideGuard") {
        tags.add("wideGuard");
      }
      if (move.effectData?.guard === "quickGuard") {
        tags.add("quickGuard");
      }
      break;
    case "boost":
      tags.add("setup");
      break;
    case "heal":
      tags.add("healing");
      break;
    case "taunt":
      tags.add("taunt");
      break;
    case "encore":
      tags.add("encore");
      break;
    case "disable":
      tags.add("disable");
      break;
    case "helpingHand":
      tags.add("helpingHand");
      break;
    case "status":
      tags.add("status");
      if ((move.effectData?.targetStages?.speed ?? 0) < 0 || move.effectData?.statusCondition === "paralysis") {
        tags.add("speedControl");
        tags.add("statDropPressure");
      }
      break;
    case "damage":
      if ((move.effectData?.targetStages?.speed ?? 0) < 0) {
        tags.add("speedControl");
        tags.add("statDropPressure");
      }
      if ((move.effectData?.targetStages?.attack ?? 0) < 0 || (move.effectData?.targetStages?.specialAttack ?? 0) < 0) {
        tags.add("statDropPressure");
      }
      break;
  }

  for (const tag of MOVE_ROLE_TAGS_BY_KEY[normalizeMoveKey(move.name)] ?? []) {
    tags.add(tag);
  }

  return [...tags];
}
