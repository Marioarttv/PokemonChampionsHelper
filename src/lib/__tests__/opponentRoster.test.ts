import { describe, expect, it } from "vitest";

import { getLoadedOpponentEntries } from "../opponentRoster";

describe("getLoadedOpponentEntries", () => {
  it("preserves known moves for loaded opponent slots", () => {
    const loadedEntries = getLoadedOpponentEntries([
      {
        slotIndex: 0,
        query: "Pikachu",
        pokemon: { id: "pikachu" },
        savedAttacks: [{ id: "thunderbolt" }],
        knownMoves: [{ id: "fake-out" }],
        presetMoveNames: ["Thunderbolt", "Fake Out"],
        abilityName: "Static",
        itemName: "Light Ball",
        movesetSource: "custom" as const,
      },
      {
        slotIndex: 1,
        query: "",
        pokemon: null,
        savedAttacks: [],
        knownMoves: [],
        presetMoveNames: [],
        abilityName: null,
        itemName: null,
        movesetSource: "none" as const,
      },
    ]);

    expect(loadedEntries).toHaveLength(1);
    expect(loadedEntries[0]?.pokemon).toEqual({ id: "pikachu" });
    expect(loadedEntries[0]?.knownMoves).toEqual([{ id: "fake-out" }]);
    expect(loadedEntries[0]?.presetMoveNames).toEqual(["Thunderbolt", "Fake Out"]);
  });
});
