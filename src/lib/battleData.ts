import { getTypeFromLabel, type PokemonType } from "../data/typeChart";

export type AbilityRecord = {
  id: string;
  name: string;
  shortDesc: string;
  desc: string;
};

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
  shortDesc: string;
  desc: string;
};

export type BattleData = {
  meta: {
    generatedAt: string;
    source: string;
    abilityCount: number;
    moveCount: number;
  };
  abilities: AbilityRecord[];
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
