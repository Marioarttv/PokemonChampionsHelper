import { getTypeFromLabel, type PokemonType } from "../data/typeChart";

export type AbilityRecord = {
  id: string;
  name: string;
  shortDesc: string;
  desc: string;
};

export type ItemRecord = {
  id: string;
  name: string;
  shortDesc: string;
  desc: string;
};

export type MoveMultihit = number | [number, number];

export type MoveRecord = {
  id: string;
  name: string;
  type: string;
  category: "Physical" | "Special" | "Status";
  basePower: number;
  accuracy: number | true;
  pp: number;
  priority: number;
  target: string;
  multihit?: MoveMultihit | null;
  shortDesc: string;
  desc: string;
};

export function getMoveMultihit(move: Pick<MoveRecord, "multihit">): MoveMultihit | null {
  const value = move.multihit;

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

export type BattleData = {
  meta: {
    generatedAt: string;
    source: string;
    abilityCount: number;
    itemCount: number;
    moveCount: number;
  };
  abilities: AbilityRecord[];
  items: ItemRecord[];
  moves: MoveRecord[];
};

let battleDataPromise: Promise<BattleData> | null = null;

export function loadBattleData() {
  if (!battleDataPromise) {
    const dataUrl = `${import.meta.env.BASE_URL}data/battle-data.json`;

    battleDataPromise = fetch(dataUrl).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load local battle data: ${response.status}`);
      }

      return (await response.json()) as BattleData;
    });
  }

  return battleDataPromise;
}

export function getMovePokemonType(move: MoveRecord): PokemonType | null {
  return getTypeFromLabel(move.type) ?? null;
}

export function isSpreadTarget(target: string) {
  return target === "allAdjacentFoes" || target === "allAdjacent";
}
