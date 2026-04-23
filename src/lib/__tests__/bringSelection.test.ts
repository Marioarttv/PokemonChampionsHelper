import { describe, expect, it } from "vitest";

import {
  getBringSelectionRequirements,
  getRecommendedBenchSlotIndices,
  rememberBringSelectionSlot,
  resolveBringSelection,
  resolveKnownBring,
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

  it("tracks unique enemy bring reveals until the bring is full", () => {
    expect(
      rememberBringSelectionSlot({
        currentKnownBringSlotIndices: [2, 4, 2],
        slotIndex: 5,
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
      }),
    ).toEqual([2, 4, 5]);
  });

  it("ignores invalid, duplicate, and overflow enemy bring reveals", () => {
    expect(
      rememberBringSelectionSlot({
        currentKnownBringSlotIndices: [0, 1, 2, 3],
        slotIndex: 5,
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
      }),
    ).toEqual([0, 1, 2, 3]);

    expect(
      rememberBringSelectionSlot({
        currentKnownBringSlotIndices: [0, 1],
        slotIndex: 1,
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
      }),
    ).toEqual([0, 1]);

    expect(
      rememberBringSelectionSlot({
        currentKnownBringSlotIndices: [0, 1],
        slotIndex: 7,
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
      }),
    ).toEqual([0, 1]);
  });

  it("keeps the full enemy roster available until four brought mons are confirmed", () => {
    expect(
      resolveKnownBring({
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
        knownBringSlotIndices: [5, 1, 4],
      }),
    ).toMatchObject({
      knownBringSlotIndices: [5, 1, 4],
      candidateSlotIndices: [0, 1, 2, 3, 4, 5],
      eliminatedSlotIndices: [],
      hasConfirmedBring: false,
    });
  });

  it("eliminates the remaining two enemy slots once the brought four are known", () => {
    expect(
      resolveKnownBring({
        filledSlotIndices: [0, 1, 2, 3, 4, 5],
        knownBringSlotIndices: [5, 1, 4, 2],
      }),
    ).toMatchObject({
      knownBringSlotIndices: [5, 1, 4, 2],
      candidateSlotIndices: [1, 2, 4, 5],
      eliminatedSlotIndices: [0, 3],
      hasConfirmedBring: true,
    });
  });

  it("treats a four-mon enemy roster as fully known immediately", () => {
    expect(
      resolveKnownBring({
        filledSlotIndices: [0, 1, 2, 3],
        knownBringSlotIndices: [],
      }),
    ).toMatchObject({
      knownBringSlotIndices: [0, 1, 2, 3],
      candidateSlotIndices: [0, 1, 2, 3],
      eliminatedSlotIndices: [],
      hasConfirmedBring: true,
    });
  });
});
