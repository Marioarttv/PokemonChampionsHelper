import type { SearchPvStep } from "./types";

export type CachedSearchBundle = {
  robustScore: number;
  likelyScore: number;
  hybridScore: number;
  pv: SearchPvStep[];
};

type TranspositionEntry = {
  key: string;
  depth: number;
  value: CachedSearchBundle;
};

export class TranspositionTable {
  private readonly entries = new Map<string, TranspositionEntry>();

  get(key: string, depth: number) {
    const existing = this.entries.get(key);
    if (!existing || existing.depth < depth) {
      return null;
    }
    return existing.value;
  }

  set(key: string, depth: number, value: CachedSearchBundle) {
    const existing = this.entries.get(key);
    if (!existing || depth >= existing.depth) {
      this.entries.set(key, { key, depth, value });
    }
  }

  clear() {
    this.entries.clear();
  }
}
