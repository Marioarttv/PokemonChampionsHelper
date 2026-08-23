import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";

import { buildPerfectKnowledgeSheet } from "./perfect-knowledge.mjs";

const root = resolve(import.meta.dirname, "../..");
const [pack, database, turnZero, turnSix] = await Promise.all([
  readFile(resolve(root, "native/ChampionsAdvisorHost/engine/data/champions-mechanics-v1.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "native/ChampionsAdvisorHost/engine/data/opponent-assumptions-v1.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "native/ChampionsAdvisorHost/captures/private-identical-six-turn0.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "native/ChampionsAdvisorHost/captures/private-identical-six-turn6.json"), "utf8").then(JSON.parse),
]);

test("fills every hidden opponent field from the assumption database", () => {
  const result = buildPerfectKnowledgeSheet(turnZero, pack, database);
  const opponent = result.sheet.teams.find((team) => team.team_index !== turnZero.state.local_team_index);
  assert.equal(opponent.pokemon_order.length, 4);
  assert.deepEqual(opponent.pokemon_order.slice(0, 2), [5, 0]);
  assert.equal(opponent.pokemon.length, 6);
  for (const pokemon of opponent.pokemon) {
    assert.ok(pokemon.current_item_id);
    assert.ok(pokemon.current_ability_id);
    assert.ok(pokemon.nature_id);
    assert.ok(pokemon.current_hp > 0);
    assert.ok(pokemon.moves.length > 0);
    assert.ok(pokemon.moves.every((move) => move.current_pp >= 0 && move.max_pp > 0));
  }
  assert.equal(result.status.covered_pokemon, 6);
  assert.equal(result.status.mirrored_pokemon, 5);
});

test("reconciles later revealed order, item, ability, and HP observations", () => {
  const early = buildPerfectKnowledgeSheet(turnZero, pack, database);
  const late = buildPerfectKnowledgeSheet(turnSix, pack, database);
  const earlyOpponent = early.sheet.teams.find((team) => team.team_index !== turnZero.state.local_team_index);
  const lateOpponent = late.sheet.teams.find((team) => team.team_index !== turnSix.state.local_team_index);
  assert.deepEqual(lateOpponent.pokemon_order, [5, 0, 1, 3]);
  assert.notDeepEqual(lateOpponent.pokemon_order, earlyOpponent.pokemon_order);
  const lateSwampert = lateOpponent.pokemon.find((pokemon) => pokemon.group_index === 0);
  assert.equal(lateSwampert.current_item_id, "swampertite");
  assert.equal(lateSwampert.current_ability_id, "swiftswim");
  assert.equal(lateSwampert.current_hp, 0);
  const lateKingambit = lateOpponent.pokemon.find((pokemon) => pokemon.group_index === 1);
  assert.ok(lateKingambit.current_hp > 0);
  assert.ok(lateKingambit.current_hp < 207);
  assert.ok(late.status.observed_overrides > early.status.observed_overrides);
});
