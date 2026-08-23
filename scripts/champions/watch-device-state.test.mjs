import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatingRecommendation,
  parseArguments,
  validateSnapshot,
} from "./watch-device-state.mjs";

function snapshot() {
  return {
    schema_version: 1,
    state_hash: "0123456789abcdef",
    source: {
      bundle_id: "jp.pokemon.pokemonchampions",
      app_version: "1.1.4",
      app_build: "25",
    },
    state: {
      teams: [],
      world: {},
      opponent_observability: { remote_pokemon: 0 },
    },
  };
}

test("watcher accepts bounded search controls", () => {
  const options = parseArguments([
    "--depth", "4",
    "--nodes", "250000",
    "--time-ms", "none",
    "--interval-ms", "750",
    "--heartbeat-ms", "6000",
  ]);
  assert.equal(options.depth, 4);
  assert.equal(options.nodes, 250_000);
  assert.equal(options.timeMs, null);
  assert.equal(options.intervalMs, 750);
  assert.equal(options.heartbeatMs, 6_000);
});

test("watcher progress documents stay bound to the captured state hash", () => {
  const document = calculatingRecommendation(
    validateSnapshot(snapshot()),
    Date.now() - 200,
    {
      target_depth: 3,
      active_depth: 2,
      root_plans_completed: 7,
      root_plans_total: 40,
      statistics: {
        completed_depth: 1,
        nodes: 12_345,
        chance_nodes: 456,
        transposition_hits: 78,
        maximin_cutoffs: 9,
        elapsed_ms: 175,
      },
    },
    { mode: "automatic" },
  );
  assert.equal(document.state_hash, "0123456789abcdef");
  assert.equal(document.status, "calculating");
  assert.equal(document.summary, "Mac search · depth 2/3");
  assert.equal(document.depth, 1);
  assert.equal(document.nodes, 12_345);
  assert.equal(document.root_plans_completed, 7);
  assert.deepEqual(document.perfect_knowledge, { mode: "automatic" });
});
