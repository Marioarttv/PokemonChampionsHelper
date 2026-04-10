import { ATTACK_CHART, TYPE_META, TYPE_ORDER, type PokemonType } from "../data/typeChart";

export type DefenseEntry = {
  attackType: PokemonType;
  multiplier: number;
};

export type DefenseBuckets = {
  immune: DefenseEntry[];
  quarter: DefenseEntry[];
  resist: DefenseEntry[];
  neutral: DefenseEntry[];
  weak: DefenseEntry[];
  ultraWeak: DefenseEntry[];
};

export type AttackBuckets = {
  noEffect: PokemonType[];
  resisted: PokemonType[];
  neutral: PokemonType[];
  effective: PokemonType[];
};

export function getTypeLabel(type: PokemonType) {
  return TYPE_META[type].label;
}

export function getMultiplier(
  attackType: PokemonType,
  primaryType: PokemonType,
  secondaryType?: PokemonType | null,
) {
  const first = ATTACK_CHART[attackType][primaryType] ?? 1;
  const second = secondaryType ? (ATTACK_CHART[attackType][secondaryType] ?? 1) : 1;

  return first * second;
}

export function getDefenseEntries(primaryType: PokemonType, secondaryType?: PokemonType | null) {
  return TYPE_ORDER.map((attackType) => ({
    attackType,
    multiplier: getMultiplier(attackType, primaryType, secondaryType),
  }));
}

export function bucketDefenseEntries(entries: DefenseEntry[]): DefenseBuckets {
  return entries.reduce<DefenseBuckets>(
    (buckets, entry) => {
      if (entry.multiplier === 0) {
        buckets.immune.push(entry);
      } else if (entry.multiplier === 0.25) {
        buckets.quarter.push(entry);
      } else if (entry.multiplier === 0.5) {
        buckets.resist.push(entry);
      } else if (entry.multiplier === 2) {
        buckets.weak.push(entry);
      } else if (entry.multiplier === 4) {
        buckets.ultraWeak.push(entry);
      } else {
        buckets.neutral.push(entry);
      }

      return buckets;
    },
    {
      immune: [],
      quarter: [],
      resist: [],
      neutral: [],
      weak: [],
      ultraWeak: [],
    },
  );
}

export function formatMultiplier(multiplier: number) {
  if (multiplier === 0.25) {
    return "1/4x";
  }

  if (multiplier === 0.5) {
    return "1/2x";
  }

  return `${multiplier}x`;
}

export function bucketAttackEntries(attackType: PokemonType): AttackBuckets {
  return TYPE_ORDER.reduce<AttackBuckets>(
    (buckets, defendingType) => {
      const multiplier = ATTACK_CHART[attackType][defendingType] ?? 1;

      if (multiplier === 0) {
        buckets.noEffect.push(defendingType);
      } else if (multiplier > 1) {
        buckets.effective.push(defendingType);
      } else if (multiplier < 1) {
        buckets.resisted.push(defendingType);
      } else {
        buckets.neutral.push(defendingType);
      }

      return buckets;
    },
    {
      noEffect: [],
      resisted: [],
      neutral: [],
      effective: [],
    },
  );
}

export function getCoveredDefendingTypes(attackTypes: PokemonType[]) {
  return TYPE_ORDER.filter((defendingType) =>
    attackTypes.some((attackType) => (ATTACK_CHART[attackType][defendingType] ?? 1) > 1),
  );
}
