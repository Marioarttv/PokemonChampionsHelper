import type { PokemonType } from "../data/typeChart";

export type PersistedAttackTypeDefaults = Partial<Record<PokemonType, number>>;
export type PersistedAttackTypeSpreadDefaults = Partial<Record<PokemonType, boolean>>;
export type PersistedMoveCategory = "physical" | "special" | "status";
export type PersistedAttackCategory = Extract<PersistedMoveCategory, "physical" | "special">;

export type PersistedKnownMove = {
  id: string;
  name?: string;
  label: string;
  type?: PokemonType;
  basePower?: number;
  category?: PersistedMoveCategory;
  isSpreadMove?: boolean;
};

export type PersistedSavedAttack = {
  id: string;
  label: string;
  type: PokemonType;
  basePower?: number;
  category?: PersistedAttackCategory;
  isSpreadMove?: boolean;
};

export type PersistedTeamSlot = {
  query: string;
  pokemonId: string | null;
  savedAttacks?: PersistedSavedAttack[];
  knownMoves?: PersistedKnownMove[];
  attackTypes?: PokemonType[];
  attackTypeDefaults?: PersistedAttackTypeDefaults;
  attackTypeSpreadDefaults?: PersistedAttackTypeSpreadDefaults;
};

export type PersistedOpenerSelection = [number | null, number | null];

export type PersistedTeam = {
  id: string;
  name: string;
  updatedAt: string;
  version: 1 | 2 | 3 | 4 | 5;
  slots: PersistedTeamSlot[];
  openerSelections?: PersistedOpenerSelection[];
};

const DB_NAME = "pokemon-champions-helper";
const STORE_NAME = "saved-teams";
const DB_VERSION = 1;

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

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

export async function listSavedTeams() {
  const db = await openDatabase();

  return new Promise<PersistedTeam[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const teams = (request.result as PersistedTeam[]).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
      resolve(teams);
    };

    request.onerror = () => reject(request.error ?? new Error("Failed to read saved teams."));
  });
}

export async function saveTeam(team: Omit<PersistedTeam, "id" | "updatedAt" | "version"> & { id?: string }) {
  const db = await openDatabase();

  const persisted: PersistedTeam = {
    id: team.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `team-${Date.now()}`),
    name: team.name,
    updatedAt: new Date().toISOString(),
    version: 5,
    slots: team.slots,
    openerSelections: team.openerSelections,
  };

  return new Promise<PersistedTeam>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(persisted);

    request.onsuccess = () => resolve(persisted);
    request.onerror = () => reject(request.error ?? new Error("Failed to save team."));
  });
}

export async function deleteSavedTeam(id: string) {
  const db = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to delete team."));
  });
}
