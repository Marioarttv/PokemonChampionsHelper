export type OpponentRosterEntryLike<TPokemon, TSavedAttack, TKnownMove> = {
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

export type LoadedOpponentEntryLike<TPokemon, TSavedAttack, TKnownMove> = Omit<
  OpponentRosterEntryLike<TPokemon, TSavedAttack, TKnownMove>,
  "pokemon"
> & {
  pokemon: TPokemon;
};

export function getLoadedOpponentEntries<TPokemon, TSavedAttack, TKnownMove>(
  opponentRoster: OpponentRosterEntryLike<TPokemon, TSavedAttack, TKnownMove>[],
): LoadedOpponentEntryLike<TPokemon, TSavedAttack, TKnownMove>[] {
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
