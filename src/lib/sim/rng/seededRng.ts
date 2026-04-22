export type RngRoll = {
  kind: "float" | "int";
  state: number;
  result: number;
  label: string | null;
};

export type SeededRngSnapshot = {
  seed: number;
  state: number;
  history: RngRoll[];
};

function normalizeSeed(seed: number) {
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export class SeededRNG {
  private state: number;
  private readonly seed: number;
  private readonly history: RngRoll[];

  constructor(seed: number, history: RngRoll[] = []) {
    this.seed = normalizeSeed(seed);
    this.state = this.seed;
    this.history = [...history];
  }

  clone() {
    return SeededRNG.fromSnapshot(this.snapshot());
  }

  snapshot(): SeededRngSnapshot {
    return {
      seed: this.seed,
      state: this.state,
      history: [...this.history],
    };
  }

  serialize() {
    return JSON.stringify(this.snapshot());
  }

  nextFloat(label: string | null = null) {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const result = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    this.history.push({
      kind: "float",
      state: this.state,
      result,
      label,
    });
    return result;
  }

  nextInt(maxExclusive: number, label: string | null = null) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error(`Expected a positive integer upper bound, received ${maxExclusive}.`);
    }

    const result = Math.floor(this.nextFloat(label) * maxExclusive);
    this.history.push({
      kind: "int",
      state: this.state,
      result,
      label,
    });
    return result;
  }

  static fromSnapshot(snapshot: SeededRngSnapshot) {
    const rng = new SeededRNG(snapshot.seed, snapshot.history);
    rng.state = snapshot.state >>> 0;
    return rng;
  }

  static deserialize(serialized: string) {
    return SeededRNG.fromSnapshot(JSON.parse(serialized) as SeededRngSnapshot);
  }
}
