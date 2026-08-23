import assert from "node:assert/strict";
import test from "node:test";

import { applyMatchObservations } from "./match-observations.mjs";

function sheet() {
  return {
    teams: [{
      team_index: 1,
      pokemon_order: [0, 1, 2, 3],
      pokemon: [{
        group_index: 5,
        current_item_id: "none",
        moves: [
          { move_id: "flipturn", current_pp: 20, max_pp: 20 },
          { move_id: "aquajet", current_pp: 20, max_pp: 20 },
        ],
      }],
    }],
  };
}

test("applies match-local PP, Choice lock, and pending target observations", () => {
  const exact = sheet();
  const snapshot = { state_hash: "state-1" };
  const report = applyMatchObservations(exact, {
    schema_version: 1,
    team_overrides: [{ team_index: 1, pokemon_order: [5] }],
    pokemon_overrides: [{
      key: { team_index: 1, group_index: 5 },
      current_item_id: "choicescarf",
    }],
    observations: [{
      state_hash: "state-1",
      revealed_moves: [{
        key: { team_index: 1, group_index: 5 },
        choice_locked_move_id: "aquajet",
        moves: [
          { move_id: "flipturn", current_pp: 19 },
          { move_id: "aquajet", current_pp: 19 },
        ],
      }],
      pending_move_targets: [{
        actor: { team_index: 0, group_index: 5 },
        md_id: 905,
        target: { team_index: 1, group_index: 5 },
      }],
    }],
  }, snapshot);

  assert.deepEqual(exact.teams[0].pokemon_order, [5]);
  assert.equal(exact.teams[0].pokemon[0].current_item_id, "choicescarf");
  assert.deepEqual(exact.teams[0].pokemon[0].moves, [
    { move_id: "flipturn", current_pp: 19, max_pp: 20, locked: true },
    { move_id: "aquajet", current_pp: 19, max_pp: 20, locked: false },
  ]);
  assert.equal(exact.pending_move_targets[0].md_id, 905);
  assert.deepEqual(report, {
    team_override_count: 1,
    pokemon_override_count: 1,
    revealed_move_observation_count: 1,
    pending_move_target_count: 1,
  });
});

test("fails closed when a revealed move is absent from the assumed set", () => {
  assert.throws(() => applyMatchObservations(sheet(), {
    schema_version: 1,
    observations: [{
      state_hash: "state-1",
      revealed_moves: [{
        key: { team_index: 1, group_index: 5 },
        moves: [{ move_id: "protect", current_pp: 7 }],
      }],
    }],
  }, { state_hash: "state-1" }), /Revealed move protect is absent/);
});
