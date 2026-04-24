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
      fallbackUsed: false,
      confidence: "high",
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
      fallbackUsed: true,
      fallbackReason: "manual_selection_incomplete",
      confidence: "low",
    });
  });

  it("does not include invalid recommended indices in the final bring set", () => {
    const resolved = resolveBringSelection({
      filledSlotIndices: [0, 1, 2, 3, 4, 5],
      recommendedFourSlotIndices: [0, 1, 8, 9],
    });

    expect(resolved.bringSlotIndices).toEqual([0, 1, 2, 3]);
    expect(resolved.bringSlotIndices).not.toContain(8);
    expect(resolved.bringSlotIndices).not.toContain(9);
    expect(resolved.fallbackUsed).toBe(true);
    expect(resolved.fallbackReason).toBe("recommendation_invalid");
    expect(resolved.confidence).toBe("low");
    expect(resolved.warnings.join(" ")).toMatch(/invalid recommended slot/i);
  });

  it("marks incomplete recommendations as low-confidence fallbacks", () => {
    const resolved = resolveBringSelection({
      filledSlotIndices: [0, 1, 2, 3, 4, 5],
      recommendedFourSlotIndices: [2, 4],
    });

    expect(resolved.bringSlotIndices).toEqual([0, 1, 2, 3]);
    expect(resolved.fallbackUsed).toBe(true);
    expect(resolved.fallbackReason).toBe("recommendation_incomplete");
    expect(resolved.confidence).toBe("low");
  });

  it("flags manual partial selections and names auto-filled slots", () => {
    const resolved = resolveBringSelection({
      filledSlotIndices: [0, 1, 2, 3, 4, 5],
      recommendedFourSlotIndices: [1, 2, 3, 4],
      manualBringSlotIndices: [5, 1],
      mode: "manual",
    });

    expect(resolved.bringSlotIndices).toEqual([5, 1, 2, 3]);
    expect(resolved.autoFilledBringSlotIndices).toEqual([2, 3]);
    expect(resolved.fallbackUsed).toBe(true);
    expect(resolved.fallbackReason).toBe("manual_selection_incomplete");
    expect(resolved.warnings.join(" ")).toMatch(/auto-filled slot\(s\): 2, 3/i);
  });

  it("marks completed manual selections as high-confidence", () => {
    const resolved = resolveBringSelection({
      filledSlotIndices: [0, 1, 2, 3, 4, 5],
      recommendedFourSlotIndices: [0, 1, 2, 3],
      manualBringSlotIndices: [5, 4, 3, 2],
      mode: "manual",
    });

    expect(resolved.hasCompleteManualSelection).toBe(true);
    expect(resolved.fallbackUsed).toBe(false);
    expect(resolved.confidence).toBe("high");
    expect(resolved.warnings).toEqual([]);
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
