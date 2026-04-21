import type { PersistedKnownMove } from "./savedTeams";

export type PersistedSpeciesMoveset = {
  speciesKey: string;
  speciesName: string;
  knownMoves: PersistedKnownMove[];
  savedAttacks?: PersistedKnownMove[];
  abilityName?: string;
  itemName?: string;
  updatedAt: string;
};

const STORAGE_KEY = "pokemon-champions-helper.species-movesets.v2";

function getStorage() {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    throw new Error("Local storage is not available in this browser.");
  }

  return window.localStorage;
}

function readAllMovesets() {
  const raw = getStorage().getItem(STORAGE_KEY);

  if (!raw) {
    return {} as Record<string, PersistedSpeciesMoveset>;
  }

  const parsed = JSON.parse(raw) as Record<string, PersistedSpeciesMoveset> | null;

  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      {
        speciesKey: value?.speciesKey ?? key,
        speciesName: value?.speciesName ?? key,
        knownMoves: Array.isArray(value?.knownMoves)
          ? value.knownMoves
          : Array.isArray(value?.savedAttacks)
            ? value.savedAttacks
            : [],
        savedAttacks: Array.isArray(value?.savedAttacks) ? value.savedAttacks : undefined,
        abilityName: typeof value?.abilityName === "string" ? value.abilityName : undefined,
        itemName: typeof value?.itemName === "string" ? value.itemName : undefined,
        updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
      } satisfies PersistedSpeciesMoveset,
    ]),
  );
}

function writeAllMovesets(entries: Record<string, PersistedSpeciesMoveset>) {
  getStorage().setItem(STORAGE_KEY, JSON.stringify(entries));
}

export async function listSpeciesMovesets() {
  const entries = readAllMovesets();

  return Object.values(entries).sort((left, right) => left.speciesName.localeCompare(right.speciesName));
}

export async function saveSpeciesMoveset(
  speciesKey: string,
  speciesName: string,
  knownMoves: PersistedKnownMove[],
  options?: {
    abilityName?: string;
    itemName?: string;
  },
) {
  const entries = readAllMovesets();
  const persisted: PersistedSpeciesMoveset = {
    speciesKey,
    speciesName,
    knownMoves,
    savedAttacks: knownMoves,
    abilityName: options?.abilityName,
    itemName: options?.itemName,
    updatedAt: new Date().toISOString(),
  };

  entries[speciesKey] = persisted;
  writeAllMovesets(entries);
  return persisted;
}

export async function deleteSpeciesMoveset(speciesKey: string) {
  const entries = readAllMovesets();

  delete entries[speciesKey];
  writeAllMovesets(entries);
}
