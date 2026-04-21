export type BringSelectionMode = "auto" | "manual";

export type BringSelectionRequirements = {
  bringCount: number;
  benchCount: number;
};

export type ResolveBringSelectionOptions = {
  filledSlotIndices: number[];
  recommendedFourSlotIndices?: number[] | null;
  manualBenchSlotIndices?: number[] | null;
  mode?: BringSelectionMode;
  maxBringCount?: number;
};

export type ResolvedBringSelection = BringSelectionRequirements & {
  bringSlotIndices: number[];
  benchSlotIndices: number[];
  recommendedBenchSlotIndices: number[];
};

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

export function getBringSelectionRequirements(
  filledSlotIndices: number[],
  maxBringCount = 4,
): BringSelectionRequirements {
  const bringCount = Math.min(maxBringCount, filledSlotIndices.length);
  return {
    bringCount,
    benchCount: Math.max(0, filledSlotIndices.length - bringCount),
  };
}

export function getRecommendedBenchSlotIndices(
  filledSlotIndices: number[],
  recommendedFourSlotIndices?: number[] | null,
  benchCount = Math.max(0, filledSlotIndices.length - Math.min(4, filledSlotIndices.length)),
) {
  if (!recommendedFourSlotIndices || recommendedFourSlotIndices.length === 0) {
    return [];
  }

  const filledSet = new Set(filledSlotIndices);
  const recommendedSet = new Set(recommendedFourSlotIndices.filter((slotIndex) => filledSet.has(slotIndex)));
  const bench = filledSlotIndices.filter((slotIndex) => !recommendedSet.has(slotIndex));
  return bench.length === benchCount ? uniqueSorted(bench) : [];
}

export function resolveBringSelection(options: ResolveBringSelectionOptions): ResolvedBringSelection {
  const {
    filledSlotIndices,
    recommendedFourSlotIndices = [],
    manualBenchSlotIndices = [],
    mode = "auto",
    maxBringCount = 4,
  } = options;
  const normalizedFilledSlotIndices = uniqueSorted(filledSlotIndices);
  const { bringCount, benchCount } = getBringSelectionRequirements(normalizedFilledSlotIndices, maxBringCount);
  const filledSet = new Set(normalizedFilledSlotIndices);
  const safeManualBenchSlotIndices = manualBenchSlotIndices ?? [];
  const sanitizedManualBench = uniqueSorted(
    safeManualBenchSlotIndices.filter((slotIndex) => filledSet.has(slotIndex)),
  ).slice(0, benchCount);
  const recommendedBenchSlotIndices = getRecommendedBenchSlotIndices(
    normalizedFilledSlotIndices,
    recommendedFourSlotIndices,
    benchCount,
  );
  const fallbackBenchSlotIndices = normalizedFilledSlotIndices.slice(-benchCount);
  const benchSlotIndices =
    mode === "manual" && sanitizedManualBench.length === benchCount
      ? sanitizedManualBench
      : recommendedBenchSlotIndices.length === benchCount
        ? recommendedBenchSlotIndices
        : fallbackBenchSlotIndices;

  return {
    bringCount,
    benchCount,
    bringSlotIndices: normalizedFilledSlotIndices.filter((slotIndex) => !benchSlotIndices.includes(slotIndex)),
    benchSlotIndices,
    recommendedBenchSlotIndices,
  };
}

export function toggleBenchSelection(options: {
  currentBenchSlotIndices: number[];
  slotIndex: number;
  filledSlotIndices: number[];
  benchCount: number;
}) {
  const { currentBenchSlotIndices, slotIndex, filledSlotIndices, benchCount } = options;
  const filledSet = new Set(filledSlotIndices);
  if (!filledSet.has(slotIndex) || benchCount <= 0) {
    return uniqueSorted(currentBenchSlotIndices.filter((candidate) => filledSet.has(candidate))).slice(0, benchCount);
  }

  const current = currentBenchSlotIndices.filter((candidate) => filledSet.has(candidate));
  if (current.includes(slotIndex)) {
    return current.filter((candidate) => candidate !== slotIndex);
  }
  if (current.length < benchCount) {
    return uniqueSorted([...current, slotIndex]);
  }

  return uniqueSorted([...current.slice(1), slotIndex]);
}
