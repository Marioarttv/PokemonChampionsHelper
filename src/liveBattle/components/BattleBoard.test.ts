import { describe, expect, it } from "vitest";
import type { ChampionsSnapshot } from "../types";
import { hasRenderableBattleState } from "./BattleBoard";

function snapshotWithState(
  state: Partial<ChampionsSnapshot["state"]>,
): ChampionsSnapshot {
  return {
    schema_version: 1,
    captured_at: "2026-07-15T17:02:28.820Z",
    state_hash: "0cb38aca1730ea12",
    source: {
      app_version: "1.1.4",
      app_build: "25",
      bundle_id: "jp.pokemon.pokemonchampions",
    },
    state: {
      available: false,
      battle_rule: 0,
      battle_type: 0,
      local_team_index: -1,
      world: {} as ChampionsSnapshot["state"]["world"],
      teams: [],
      opponent_observability: {
        remote_pokemon: 0,
        remote_with_moves: 0,
        remote_with_items: 0,
        remote_with_abilities: 0,
        remote_with_base_points: 0,
      },
      ...state,
    },
  };
}

describe("Live Battle Lab battle-state guard", () => {
  it("rejects the inactive post-battle snapshot returned by USB refresh", () => {
    expect(hasRenderableBattleState(snapshotWithState({}))).toBe(false);
  });

  it("accepts a complete active battle snapshot", () => {
    expect(
      hasRenderableBattleState(
        snapshotWithState({
          available: true,
          local_team_index: 0,
          teams: [
            {
              team_index: 0,
              is_local_player: true,
              waiting_for_action: true,
              pokemon_order: [],
              selected_group_indices: [],
              pokemon: [],
            },
          ],
          world: {
            elapsed_turns: 0,
            weather_md_id: 0,
            weather_lifespan_turns: 0,
            weather_elapsed_turns: 0,
            field_effects: [],
            sides: [],
          },
        }),
      ),
    ).toBe(true);
  });

  it("rejects a nominally active snapshot with incomplete world data", () => {
    expect(
      hasRenderableBattleState(
        snapshotWithState({
          available: true,
          local_team_index: 0,
          teams: [
            {
              team_index: 0,
              is_local_player: true,
              waiting_for_action: true,
              pokemon_order: [],
              selected_group_indices: [],
              pokemon: [],
            },
          ],
        }),
      ),
    ).toBe(false);
  });
});
