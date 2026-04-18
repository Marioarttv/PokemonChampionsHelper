import type { PersistedSavedAttack } from "./savedTeams";

export type PersistedSpeciesMoveset = {
  speciesKey: string;
  speciesName: string;
  savedAttacks: PersistedSavedAttack[];
  updatedAt: string;
};

const STORAGE_KEY = "pokemon-champions-helper.species-movesets.v1";

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
  return parsed && typeof parsed === "object" ? parsed : {};
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
  savedAttacks: PersistedSavedAttack[],
) {
  const entries = readAllMovesets();
  const persisted: PersistedSpeciesMoveset = {
    speciesKey,
    speciesName,
    savedAttacks,
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
