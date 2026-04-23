export type BringSelectionMode = "auto" | "manual";

export type BringSelectionRequirements = {
  bringCount: number;
  benchCount: number;
};

export type ResolveBringSelectionOptions = {
  filledSlotIndices: number[];
  recommendedFourSlotIndices?: number[] | null;
  manualBringSlotIndices?: number[] | null;
  mode?: BringSelectionMode;
  maxBringCount?: number;
};

export type ResolveKnownBringOptions = {
  filledSlotIndices: number[];
  knownBringSlotIndices?: number[] | null;
  maxBringCount?: number;
};

export type ResolvedBringSelection = BringSelectionRequirements & {
  bringSlotIndices: number[];
  benchSlotIndices: number[];
  lockedBringSlotIndices: number[];
  autoFilledBringSlotIndices: number[];
  recommendedBringSlotIndices: number[];
  recommendedBenchSlotIndices: number[];
  hasCompleteManualSelection: boolean;
};

export type ResolvedKnownBring = BringSelectionRequirements & {
  knownBringSlotIndices: number[];
  candidateSlotIndices: number[];
  eliminatedSlotIndices: number[];
  hasConfirmedBring: boolean;
};

function uniqueOrdered(values: number[]) {
  return [...new Set(values)];
}

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
    manualBringSlotIndices = [],
    mode = "auto",
    maxBringCount = 4,
  } = options;
  const normalizedFilledSlotIndices = uniqueSorted(filledSlotIndices);
  const { bringCount, benchCount } = getBringSelectionRequirements(normalizedFilledSlotIndices, maxBringCount);
  const filledSet = new Set(normalizedFilledSlotIndices);
  const recommendedBringSlotIndices = uniqueOrdered(
    (recommendedFourSlotIndices ?? []).filter((slotIndex) => filledSet.has(slotIndex)),
  ).slice(0, bringCount);
  const recommendedBenchSlotIndices = getRecommendedBenchSlotIndices(normalizedFilledSlotIndices, recommendedBringSlotIndices, benchCount);
  const fallbackBringSlotIndices = normalizedFilledSlotIndices.slice(0, bringCount);
  const baseBringSlotIndices =
    recommendedBringSlotIndices.length === bringCount ? recommendedBringSlotIndices : fallbackBringSlotIndices;
  const safeManualBringSlotIndices = manualBringSlotIndices ?? [];
  const lockedBringSlotIndices = uniqueOrdered(
    safeManualBringSlotIndices.filter((slotIndex) => filledSet.has(slotIndex)),
  ).slice(0, bringCount);
  const autoFillPool = [...baseBringSlotIndices, ...normalizedFilledSlotIndices];
  const lockedBringSet = new Set(lockedBringSlotIndices);
  const autoFilledBringSlotIndices =
    mode === "manual" && lockedBringSlotIndices.length > 0
      ? autoFillPool.filter((slotIndex) => !lockedBringSet.has(slotIndex)).slice(0, Math.max(0, bringCount - lockedBringSlotIndices.length))
      : [];
  const bringSlotIndices =
    mode === "manual" && lockedBringSlotIndices.length > 0
      ? [...lockedBringSlotIndices, ...autoFilledBringSlotIndices].slice(0, bringCount)
      : baseBringSlotIndices;
  const bringSlotSet = new Set(bringSlotIndices);
  const benchSlotIndices = normalizedFilledSlotIndices.filter((slotIndex) => !bringSlotSet.has(slotIndex));

  return {
    bringCount,
    benchCount,
    bringSlotIndices,
    benchSlotIndices,
    lockedBringSlotIndices,
    autoFilledBringSlotIndices,
    recommendedBringSlotIndices,
    recommendedBenchSlotIndices,
    hasCompleteManualSelection: mode === "manual" && lockedBringSlotIndices.length === bringCount,
  };
}

export function resolveKnownBring(options: ResolveKnownBringOptions): ResolvedKnownBring {
  const { filledSlotIndices, knownBringSlotIndices = [], maxBringCount = 4 } = options;
  const normalizedFilledSlotIndices = uniqueSorted(filledSlotIndices);
  const { bringCount, benchCount } = getBringSelectionRequirements(normalizedFilledSlotIndices, maxBringCount);
  const filledSet = new Set(normalizedFilledSlotIndices);
  const normalizedKnownBringSlotIndices = uniqueOrdered(
    (knownBringSlotIndices ?? []).filter((slotIndex) => filledSet.has(slotIndex)),
  ).slice(0, bringCount);

  if (normalizedFilledSlotIndices.length <= bringCount) {
    return {
      bringCount,
      benchCount,
      knownBringSlotIndices: normalizedFilledSlotIndices,
      candidateSlotIndices: normalizedFilledSlotIndices,
      eliminatedSlotIndices: [],
      hasConfirmedBring: normalizedFilledSlotIndices.length > 0,
    };
  }

  const knownBringSet = new Set(normalizedKnownBringSlotIndices);
  const hasConfirmedBring = bringCount > 0 && normalizedKnownBringSlotIndices.length === bringCount;

  return {
    bringCount,
    benchCount,
    knownBringSlotIndices: normalizedKnownBringSlotIndices,
    candidateSlotIndices: hasConfirmedBring
      ? normalizedFilledSlotIndices.filter((slotIndex) => knownBringSet.has(slotIndex))
      : normalizedFilledSlotIndices,
    eliminatedSlotIndices: hasConfirmedBring
      ? normalizedFilledSlotIndices.filter((slotIndex) => !knownBringSet.has(slotIndex))
      : [],
    hasConfirmedBring,
  };
}

export function rememberBringSelectionSlot(options: {
  currentKnownBringSlotIndices: number[];
  slotIndex: number | null;
  filledSlotIndices: number[];
  maxBringCount?: number;
}) {
  const { currentKnownBringSlotIndices, slotIndex, filledSlotIndices, maxBringCount = 4 } = options;
  const normalizedFilledSlotIndices = uniqueSorted(filledSlotIndices);
  const { bringCount } = getBringSelectionRequirements(normalizedFilledSlotIndices, maxBringCount);
  const filledSet = new Set(normalizedFilledSlotIndices);
  const safeCurrentKnownBringSlotIndices = uniqueOrdered(
    currentKnownBringSlotIndices.filter((candidate) => filledSet.has(candidate)),
  ).slice(0, bringCount);

  if (
    slotIndex === null ||
    !filledSet.has(slotIndex) ||
    safeCurrentKnownBringSlotIndices.includes(slotIndex) ||
    safeCurrentKnownBringSlotIndices.length >= bringCount
  ) {
    return safeCurrentKnownBringSlotIndices;
  }

  return [...safeCurrentKnownBringSlotIndices, slotIndex];
}

export function toggleBringSelection(options: {
  currentBringSlotIndices: number[];
  slotIndex: number;
  filledSlotIndices: number[];
  bringCount: number;
}) {
  const { currentBringSlotIndices, slotIndex, filledSlotIndices, bringCount } = options;
  const filledSet = new Set(filledSlotIndices);
  if (!filledSet.has(slotIndex) || bringCount <= 0) {
    return uniqueOrdered(currentBringSlotIndices.filter((candidate) => filledSet.has(candidate))).slice(0, bringCount);
  }

  const current = uniqueOrdered(currentBringSlotIndices.filter((candidate) => filledSet.has(candidate))).slice(0, bringCount);
  if (current.includes(slotIndex)) {
    return current.filter((candidate) => candidate !== slotIndex);
  }
  if (current.length < bringCount) {
    return [...current, slotIndex];
  }

  return current;
}
