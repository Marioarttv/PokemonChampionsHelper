import { describe, expect, it } from "vitest";

import {
  getBringSelectionRequirements,
  getRecommendedBenchSlotIndices,
  resolveBringSelection,
  toggleBringSelection,
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

  it("uses a complete manual bring order", () => {
    expect(
      resolveBringSelection({
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
        recommendedFourSlotIndices: [0, 1, 2, 3],
        manualBringSlotIndices: [5, 2, 4, 0],
        mode: "manual",
      }),
    ).toMatchObject({
      bringSlotIndices: [5, 2, 4, 0],
      benchSlotIndices: [1, 3],
      lockedBringSlotIndices: [5, 2, 4, 0],
      autoFilledBringSlotIndices: [],
      recommendedBenchSlotIndices: [4, 5],
    });
  });

  it("fills the rest from the solver while manual bring picks are incomplete", () => {
    expect(
      resolveBringSelection({
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
        recommendedFourSlotIndices: [0, 1, 2, 5],
        manualBringSlotIndices: [4],
        mode: "manual",
      }),
    ).toMatchObject({
      bringSlotIndices: [4, 0, 1, 2],
      benchSlotIndices: [3, 5],
      lockedBringSlotIndices: [4],
      autoFilledBringSlotIndices: [0, 1, 2],
    });
  });

  it("appends manual picks until bring order is full", () => {
    expect(
      toggleBringSelection({
        currentBringSlotIndices: [1, 4],
        slotIndex: 5,
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
        bringCount: 4,
      }),
    ).toEqual([1, 4, 5]);
  });

  it("removes an already-picked mon from the manual order", () => {
    expect(
      toggleBringSelection({
        currentBringSlotIndices: [1, 4, 5],
        slotIndex: 4,
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
        bringCount: 4,
      }),
    ).toEqual([1, 5]);
  });

  it("does not auto-replace a pick when the manual order is already full", () => {
    expect(
      toggleBringSelection({
        currentBringSlotIndices: [1, 2, 3, 4],
        slotIndex: 5,
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
        bringCount: 4,
      }),
    ).toEqual([1, 2, 3, 4]);
  });
});
