import type { DamageCategory } from "./damage";

export type DamageItemRole = "attacker" | "defender";

export type DamageItemId =
  | "none"
  | "lifeorb"
  | "choiceband"
  | "choicespecs"
  | "choicescarf"
  | "expertbelt"
  | "muscleband"
  | "wiseglasses"
  | "focussash"
  | "sitrusberry"
  | "leftovers"
  | "blacksludge"
  | "whiteherb"
  | "airballoon"
  | "ironball"
  | "covertcloak"
  | "safetygoggles"
  | "clearamulet"
  | "charcoal"
  | "mysticwater"
  | "magnet"
  | "blackbelt"
  | "poisonbarb"
  | "sharpbeak"
  | "nevermeltice"
  | "softsand"
  | "spelltag"
  | "fairyfeather"
  | "silkscarf"
  | "blackglasses"
  | "dragonfang"
  | "occaberry"
  | "passhoberry"
  | "wacanberry"
  | "rindoberry"
  | "yacheberry"
  | "chopleberry"
  | "kebiaberry"
  | "shucaberry"
  | "cobaberry"
  | "payapaberry"
  | "tangaberry"
  | "chartiberry"
  | "kasibberry"
  | "habanberry"
  | "colburberry"
  | "babiriberry"
  | "roseliberry"
  | "chilanberry"
  | "loadeddice";

export type DamageItemOption = {
  id: DamageItemId;
  label: string;
  roles: DamageItemRole[];
  description: string;
};

const DAMAGE_ITEM_OPTIONS: DamageItemOption[] = [
  { id: "none", label: "None", roles: ["attacker", "defender"], description: "Ignore item-based damage modifiers." },
  { id: "lifeorb", label: "Life Orb", roles: ["attacker"], description: "Boosts move damage by 1.3x." },
  { id: "choiceband", label: "Choice Band", roles: ["attacker"], description: "Boosts physical damage by 1.5x." },
  { id: "choicespecs", label: "Choice Specs", roles: ["attacker"], description: "Boosts special damage by 1.5x." },
  { id: "choicescarf", label: "Choice Scarf", roles: ["attacker"], description: "Boosts Speed by 1.5x." },
  { id: "expertbelt", label: "Expert Belt", roles: ["attacker"], description: "Boosts super-effective damage by 1.2x." },
  { id: "muscleband", label: "Muscle Band", roles: ["attacker"], description: "Boosts physical damage by 1.1x." },
  { id: "wiseglasses", label: "Wise Glasses", roles: ["attacker"], description: "Boosts special damage by 1.1x." },
  { id: "focussash", label: "Focus Sash", roles: ["defender"], description: "Survive one lethal hit from full HP with 1 HP." },
  { id: "sitrusberry", label: "Sitrus Berry", roles: ["defender"], description: "Restores 25% HP when dropping to half HP or lower." },
  { id: "leftovers", label: "Leftovers", roles: ["defender"], description: "Restores 1/16 max HP at the end of each turn." },
  { id: "blacksludge", label: "Black Sludge", roles: ["defender"], description: "Restores Poison-types each turn and damages other holders." },
  { id: "whiteherb", label: "White Herb", roles: ["attacker", "defender"], description: "Restores lowered stats once, then is consumed." },
  { id: "airballoon", label: "Air Balloon", roles: ["defender"], description: "Grants Ground immunity until consumed." },
  { id: "ironball", label: "Iron Ball", roles: ["attacker", "defender"], description: "Grounds the holder and halves Speed." },
  { id: "covertcloak", label: "Covert Cloak", roles: ["defender"], description: "Blocks supported added effects such as Fake Out flinching." },
  { id: "safetygoggles", label: "Safety Goggles", roles: ["defender"], description: "Blocks supported powder moves." },
  { id: "clearamulet", label: "Clear Amulet", roles: ["defender"], description: "Prevents supported stat drops from opposing effects." },
  { id: "charcoal", label: "Charcoal", roles: ["attacker"], description: "Boosts Fire-type damage by 1.2x." },
  { id: "mysticwater", label: "Mystic Water", roles: ["attacker"], description: "Boosts Water-type damage by 1.2x." },
  { id: "magnet", label: "Magnet", roles: ["attacker"], description: "Boosts Electric-type damage by 1.2x." },
  { id: "blackbelt", label: "Black Belt", roles: ["attacker"], description: "Boosts Fighting-type damage by 1.2x." },
  { id: "poisonbarb", label: "Poison Barb", roles: ["attacker"], description: "Boosts Poison-type damage by 1.2x." },
  { id: "sharpbeak", label: "Sharp Beak", roles: ["attacker"], description: "Boosts Flying-type damage by 1.2x." },
  { id: "nevermeltice", label: "Never-Melt Ice", roles: ["attacker"], description: "Boosts Ice-type damage by 1.2x." },
  { id: "softsand", label: "Soft Sand", roles: ["attacker"], description: "Boosts Ground-type damage by 1.2x." },
  { id: "spelltag", label: "Spell Tag", roles: ["attacker"], description: "Boosts Ghost-type damage by 1.2x." },
  { id: "fairyfeather", label: "Fairy Feather", roles: ["attacker"], description: "Boosts Fairy-type damage by 1.2x." },
  { id: "silkscarf", label: "Silk Scarf", roles: ["attacker"], description: "Boosts Normal-type damage by 1.2x." },
  { id: "blackglasses", label: "Black Glasses", roles: ["attacker"], description: "Boosts Dark-type damage by 1.2x." },
  { id: "dragonfang", label: "Dragon Fang", roles: ["attacker"], description: "Boosts Dragon-type damage by 1.2x." },
  { id: "occaberry", label: "Occa Berry", roles: ["defender"], description: "Halves one super-effective Fire hit." },
  { id: "passhoberry", label: "Passho Berry", roles: ["defender"], description: "Halves one super-effective Water hit." },
  { id: "wacanberry", label: "Wacan Berry", roles: ["defender"], description: "Halves one super-effective Electric hit." },
  { id: "rindoberry", label: "Rindo Berry", roles: ["defender"], description: "Halves one super-effective Grass hit." },
  { id: "yacheberry", label: "Yache Berry", roles: ["defender"], description: "Halves one super-effective Ice hit." },
  { id: "chopleberry", label: "Chople Berry", roles: ["defender"], description: "Halves one super-effective Fighting hit." },
  { id: "kebiaberry", label: "Kebia Berry", roles: ["defender"], description: "Halves one super-effective Poison hit." },
  { id: "shucaberry", label: "Shuca Berry", roles: ["defender"], description: "Halves one super-effective Ground hit." },
  { id: "cobaberry", label: "Coba Berry", roles: ["defender"], description: "Halves one super-effective Flying hit." },
  { id: "payapaberry", label: "Payapa Berry", roles: ["defender"], description: "Halves one super-effective Psychic hit." },
  { id: "tangaberry", label: "Tanga Berry", roles: ["defender"], description: "Halves one super-effective Bug hit." },
  { id: "chartiberry", label: "Charti Berry", roles: ["defender"], description: "Halves one super-effective Rock hit." },
  { id: "kasibberry", label: "Kasib Berry", roles: ["defender"], description: "Halves one super-effective Ghost hit." },
  { id: "habanberry", label: "Haban Berry", roles: ["defender"], description: "Halves one super-effective Dragon hit." },
  { id: "colburberry", label: "Colbur Berry", roles: ["defender"], description: "Halves one super-effective Dark hit." },
  { id: "babiriberry", label: "Babiri Berry", roles: ["defender"], description: "Halves one super-effective Steel hit." },
  { id: "roseliberry", label: "Roseli Berry", roles: ["defender"], description: "Halves one super-effective Fairy hit." },
  { id: "chilanberry", label: "Chilan Berry", roles: ["defender"], description: "Halves one Normal hit." },
  {
    id: "loadeddice",
    label: "Loaded Dice",
    roles: ["attacker"],
    description: "Variable-hit moves (e.g., Rock Blast, Bullet Seed) hit 4-5 times instead of 2-5.",
  },
];

const DAMAGE_ITEM_BY_ID = new Map(DAMAGE_ITEM_OPTIONS.map((option) => [option.id, option] as const));

const TYPE_BOOST_ITEM_MULTIPLIERS: Partial<Record<DamageItemId, string>> = {
  charcoal: "fire",
  mysticwater: "water",
  magnet: "electric",
  blackbelt: "fighting",
  poisonbarb: "poison",
  sharpbeak: "flying",
  nevermeltice: "ice",
  softsand: "ground",
  spelltag: "ghost",
  fairyfeather: "fairy",
  silkscarf: "normal",
  blackglasses: "dark",
  dragonfang: "dragon",
};

const RESIST_BERRY_ATTACK_TYPES: Partial<Record<DamageItemId, string>> = {
  occaberry: "fire",
  passhoberry: "water",
  wacanberry: "electric",
  rindoberry: "grass",
  yacheberry: "ice",
  chopleberry: "fighting",
  kebiaberry: "poison",
  shucaberry: "ground",
  cobaberry: "flying",
  payapaberry: "psychic",
  tangaberry: "bug",
  chartiberry: "rock",
  kasibberry: "ghost",
  habanberry: "dragon",
  colburberry: "dark",
  babiriberry: "steel",
  roseliberry: "fairy",
  chilanberry: "normal",
};

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function getDamageItemOptions(role?: DamageItemRole) {
  if (!role) {
    return DAMAGE_ITEM_OPTIONS;
  }

  return DAMAGE_ITEM_OPTIONS.filter((option) => option.roles.includes(role));
}

export function getDamageItemLabel(itemId: DamageItemId) {
  return DAMAGE_ITEM_BY_ID.get(itemId)?.label ?? "None";
}

export function getDamageItemDescription(itemId: DamageItemId) {
  return DAMAGE_ITEM_BY_ID.get(itemId)?.description ?? "Ignore item-based damage modifiers.";
}

export function normalizeDamageItemId(value: string | null | undefined): DamageItemId | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeKey(value);
  return DAMAGE_ITEM_BY_ID.has(normalized as DamageItemId) ? (normalized as DamageItemId) : null;
}

export function getAttackerItemModifier(options: {
  attackType: string;
  category: DamageCategory;
  attackerItem: DamageItemId;
  typeMultiplier: number;
}) {
  const { attackType, category, attackerItem, typeMultiplier } = options;

  if (attackerItem === "choiceband" && category === "physical") {
    return 1.5;
  }

  if (attackerItem === "choicespecs" && category === "special") {
    return 1.5;
  }

  if (attackerItem === "lifeorb") {
    return 1.3;
  }

  if (attackerItem === "expertbelt" && typeMultiplier > 1) {
    return 1.2;
  }

  if (attackerItem === "muscleband" && category === "physical") {
    return 1.1;
  }

  if (attackerItem === "wiseglasses" && category === "special") {
    return 1.1;
  }

  const boostedType = TYPE_BOOST_ITEM_MULTIPLIERS[attackerItem];
  if (boostedType && boostedType === attackType) {
    return 1.2;
  }

  return 1;
}

export function getDefenderItemModifier(options: {
  attackType: string;
  defenderItem: DamageItemId;
  typeMultiplier: number;
}) {
  const { attackType, defenderItem, typeMultiplier } = options;
  const resistedType = RESIST_BERRY_ATTACK_TYPES[defenderItem];

  if (!resistedType) {
    return 1;
  }

  if (defenderItem === "chilanberry") {
    return attackType === "normal" ? 0.5 : 1;
  }

  return typeMultiplier > 1 && resistedType === attackType ? 0.5 : 1;
}

export function isResistBerryItem(itemId: DamageItemId) {
  return Object.prototype.hasOwnProperty.call(RESIST_BERRY_ATTACK_TYPES, itemId);
}

export function doesDefenderItemReduceDamage(options: {
  attackType: string;
  defenderItem: DamageItemId;
  typeMultiplier: number;
}) {
  return getDefenderItemModifier(options) < 1;
}
