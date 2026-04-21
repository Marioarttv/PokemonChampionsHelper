export type OpponentRosterEntryLike<TPokemon, TSavedAttack, TKnownMove, TExtra extends object = {}> = TExtra & {
  slotIndex: number;
  query: string;
  pokemon: TPokemon | null;
  savedAttacks: TSavedAttack[];
  knownMoves: TKnownMove[];
  presetMoveNames: string[];
  abilityName: string | null;
  itemName: string | null;
  movesetSource: "custom" | "preset" | "none";
};

export type LoadedOpponentEntryLike<TPokemon, TSavedAttack, TKnownMove, TExtra extends object = {}> = Omit<
  OpponentRosterEntryLike<TPokemon, TSavedAttack, TKnownMove, TExtra>,
  "pokemon"
> & {
  pokemon: TPokemon;
};

export function getLoadedOpponentEntries<TPokemon, TSavedAttack, TKnownMove, TExtra extends object = {}>(
  opponentRoster: OpponentRosterEntryLike<TPokemon, TSavedAttack, TKnownMove, TExtra>[],
): LoadedOpponentEntryLike<TPokemon, TSavedAttack, TKnownMove, TExtra>[] {
  return opponentRoster.flatMap((entry) =>
    entry.pokemon
      ? [
          {
            ...entry,
            pokemon: entry.pokemon,
          },
        ]
      : [],
  );
}
