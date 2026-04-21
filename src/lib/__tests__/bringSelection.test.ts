import { describe, expect, it } from "vitest";

import {
  getBringSelectionRequirements,
  getRecommendedBenchSlotIndices,
  resolveBringSelection,
  toggleBenchSelection,
} from "../bringSelection";

describe("bringSelection", () => {
  it("derives bring-four requirements from a six-mon team", () => {
    expect(getBringSelectionRequirements([0, 1, 2, 3, 4, 5])).toEqual({
      bringCount: 4,
      benchCount: 2,
    });
  });

  it("extracts the benched pair from a recommended four", () => {
    expect(getRecommendedBenchSlotIndices([0, 1, 2, 3, 4, 5], [0, 2, 3, 5], 2)).toEqual([1, 4]);
  });

  it("prefers a complete manual bench override", () => {
    expect(
      resolveBringSelection({
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
        recommendedFourSlotIndices: [0, 1, 2, 3],
        manualBenchSlotIndices: [2, 4],
        mode: "manual",
      }),
    ).toMatchObject({
      bringSlotIndices: [0, 1, 3, 5],
      benchSlotIndices: [2, 4],
      recommendedBenchSlotIndices: [4, 5],
    });
  });

  it("falls back to the recommendation when manual benching is incomplete", () => {
    expect(
      resolveBringSelection({
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
        recommendedFourSlotIndices: [0, 1, 2, 5],
        manualBenchSlotIndices: [4],
        mode: "manual",
      }),
    ).toMatchObject({
      bringSlotIndices: [0, 1, 2, 5],
      benchSlotIndices: [3, 4],
    });
  });

  it("swaps the oldest benched mon when the bench is already full", () => {
    expect(
      toggleBenchSelection({
        currentBenchSlotIndices: [1, 4],
        slotIndex: 5,
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
        benchCount: 2,
      }),
    ).toEqual([4, 5]);
  });
});
