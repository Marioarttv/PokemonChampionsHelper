import type { BattleCombatantState, BattleFieldState } from "./types";
import { normalizeMoveKey } from "./moveRegistry";

export type MechanicSupportLevel = "exact" | "approximate" | "unsupported";

export type UnsupportedMechanicMarker = {
  mechanic: string;
  supportLevel: MechanicSupportLevel;
  reason: string;
  affectedSide?: "ally" | "enemy";
  affectedCombatantId?: string;
  severity?: "info" | "warning" | "critical";
};

export type MechanicSupportReport = {
  markers: UnsupportedMechanicMarker[];
  exact: string[];
  approximate: string[];
  unsupported: string[];
};

export type GroundedState = {
  grounded: boolean;
  markers: UnsupportedMechanicMarker[];
};

export function buildMechanicSupportReport(markers: UnsupportedMechanicMarker[] = []): MechanicSupportReport {
  const uniqueMarkers = dedupeMarkers(markers);
  return {
    markers: uniqueMarkers,
    exact: [
      "direct damage",
      "Protect streak odds",
      "Wide Guard spread blocking",
      "Quick Guard priority blocking",
      "Fake Out first-active-turn validation",
      "switch-in Intimidate",
      "weather setter order",
      "Storm Drain/Lightning Rod-style absorption when represented",
    ],
    approximate: uniqueMarkers
      .filter((marker) => marker.supportLevel === "approximate")
      .map((marker) => marker.mechanic),
    unsupported: uniqueMarkers
      .filter((marker) => marker.supportLevel === "unsupported")
      .map((marker) => marker.mechanic),
  };
}

export function dedupeMarkers(markers: UnsupportedMechanicMarker[]) {
  const byKey = new Map<string, UnsupportedMechanicMarker>();
  for (const marker of markers) {
    const key = [
      marker.mechanic,
      marker.supportLevel,
      marker.reason,
      marker.affectedSide ?? "",
      marker.affectedCombatantId ?? "",
    ].join("::");
    if (!byKey.has(key)) {
      byKey.set(key, marker);
    }
  }
  return [...byKey.values()];
}

export function getGroundedState(
  combatant: BattleCombatantState,
  field: BattleFieldState,
): GroundedState {
  const markers: UnsupportedMechanicMarker[] = [];
  const itemKey = normalizeMoveKey(combatant.itemName ?? combatant.itemId);
  const abilityKey = normalizeMoveKey(combatant.abilityName ?? combatant.abilityId);
  const volatile = combatant.volatileState;

  if ((field.gravityTurns ?? 0) > 0) {
    return { grounded: true, markers };
  }

  if ((volatile?.groundedTurns ?? 0) > 0) {
    return { grounded: true, markers };
  }

  if (itemKey === "ironball") {
    return { grounded: true, markers };
  }

  if ((volatile?.magnetRiseTurns ?? 0) > 0) {
    return { grounded: false, markers };
  }

  if (itemKey === "airballoon" && !combatant.itemConsumed) {
    return { grounded: false, markers };
  }

  if (abilityKey === "levitate") {
    return { grounded: false, markers };
  }

  if (combatant.pokemon.types.includes("Flying")) {
    return { grounded: false, markers };
  }

  if (!volatile) {
    markers.push({
      mechanic: "volatile groundedness",
      supportLevel: "approximate",
      reason: "Magnet Rise and Smack Down-style volatile state is only considered when explicitly present.",
      affectedSide: combatant.side,
      affectedCombatantId: combatant.id,
      severity: "info",
    });
  }

  return { grounded: true, markers };
}
