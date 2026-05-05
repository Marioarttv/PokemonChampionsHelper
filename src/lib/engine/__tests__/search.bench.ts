import { bench, describe } from "vitest";
import { runEngineBenchmark } from "../benchmark";
import { createTestBattleState, makeMember, makeMove, makePokemon } from "./fixtures";

const fakeOut = makeMove("Fake Out", {
  type: "Normal",
  category: "Physical",
  basePower: 40,
  priority: 3,
  target: "normal",
});
const tailwind = makeMove("Tailwind", { type: "Flying", category: "Status", basePower: 0, target: "self" });
const trickRoom = makeMove("Trick Room", { type: "Psychic", category: "Status", basePower: 0, target: "all" });
const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
const psychic = makeMove("Psychic", { type: "Psychic", category: "Special", basePower: 90, target: "normal" });

const benchmarkState = createTestBattleState({
  ally: [
    makeMember({
      side: "ally",
      slot: 0,
      pokemon: makePokemon("Sneasler", { baseStats: { atk: 130, spe: 120 } }),
      moveNames: ["Fake Out"],
    }),
    makeMember({
      side: "ally",
      slot: 1,
      pokemon: makePokemon("Aerodactyl", { baseStats: { atk: 105, spe: 130 } }),
      moveNames: ["Tailwind"],
    }),
  ],
  enemy: [
    makeMember({
      side: "enemy",
      slot: 0,
      pokemon: makePokemon("Oranguru", { baseStats: { hp: 110, def: 110, spd: 110, spe: 60 } }),
      moveNames: ["Trick Room", "Protect"],
    }),
    makeMember({
      side: "enemy",
      slot: 1,
      pokemon: makePokemon("Meowstic", { baseStats: { spa: 95, spe: 104 } }),
      moveNames: ["Psychic"],
    }),
  ],
  moves: [fakeOut, tailwind, trickRoom, protect, psychic],
});

describe("engine search benchmark", () => {
  bench("compare fast, balanced, tactical, and deep modes", () => {
    runEngineBenchmark([{ name: "speed-control-opening", state: benchmarkState }]);
  });
});
