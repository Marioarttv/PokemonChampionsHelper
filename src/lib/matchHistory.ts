import type { PersistedTeamSlot } from "./savedTeams";

export type MatchResult = "won" | "lost";

export type MatchHistoryPokemon = {
  slotIndex: number;
  pokemonId: string;
  name: string;
};

export type PersistedMatchHistoryEntry = {
  id: string;
  playedAt: string;
  updatedAt: string;
  version: 1;
  result: MatchResult;
  allyTeamName: string;
  allySlots: PersistedTeamSlot[];
  enemySlots: PersistedTeamSlot[];
  allyBroughtSlotIndices: number[];
  enemyBroughtSlotIndices: number[];
  allyLeadSlotIndices: number[];
  enemyLeadSlotIndices: number[];
  allyBrought: MatchHistoryPokemon[];
  enemyBrought: MatchHistoryPokemon[];
  allyLeads: MatchHistoryPokemon[];
  enemyLeads: MatchHistoryPokemon[];
};

const DB_NAME = "pokemon-champions-helper";
const STORE_NAME = "match-history";
const SAVED_TEAMS_STORE_NAME = "saved-teams";
const DB_VERSION = 2;

function getIndexedDb() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    throw new Error("IndexedDB is not available in this browser.");
  }

  return window.indexedDB;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = getIndexedDb().open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SAVED_TEAMS_STORE_NAME)) {
        const store = db.createObjectStore(SAVED_TEAMS_STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("playedAt", "playedAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

export async function listMatchHistoryEntries() {
  const db = await openDatabase();

  return new Promise<PersistedMatchHistoryEntry[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const entries = (request.result as PersistedMatchHistoryEntry[]).sort((a, b) =>
        b.playedAt.localeCompare(a.playedAt),
      );
      resolve(entries);
    };

    request.onerror = () => reject(request.error ?? new Error("Failed to read match history."));
  });
}

export async function saveMatchHistoryEntry(
  entry: Omit<PersistedMatchHistoryEntry, "id" | "playedAt" | "updatedAt" | "version"> & {
    id?: string;
    playedAt?: string;
  },
) {
  const db = await openDatabase();
  const timestamp = new Date().toISOString();
  const persisted: PersistedMatchHistoryEntry = {
    ...entry,
    id: entry.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `match-${Date.now()}`),
    playedAt: entry.playedAt ?? timestamp,
    updatedAt: timestamp,
    version: 1,
  };

  return new Promise<PersistedMatchHistoryEntry>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(persisted);

    request.onsuccess = () => resolve(persisted);
    request.onerror = () => reject(request.error ?? new Error("Failed to save match history."));
  });
}

export async function deleteMatchHistoryEntry(id: string) {
  const db = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to delete match history entry."));
  });
}
