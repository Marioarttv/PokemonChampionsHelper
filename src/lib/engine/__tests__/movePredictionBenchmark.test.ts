import { describe, expect, it } from "vitest";
import { runEngineLineBenchmark, type EngineLineBenchmarkFixture } from "../benchmark";
import {
  createTestBattleState,
  makeMember,
  makeMove,
  makePokemon,
} from "./fixtures";

const protect = makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, target: "self", priority: 4 });
const fakeOut = makeMove("Fake Out", {
  type: "Normal",
  category: "Physical",
  basePower: 40,
  priority: 3,
  target: "normal",
});
const quickGuard = makeMove("Quick Guard", {
  type: "Fighting",
  category: "Status",
  basePower: 0,
  priority: 3,
  target: "self",
});
const wideGuard = makeMove("Wide Guard", {
  type: "Rock",
  category: "Status",
  basePower: 0,
  priority: 3,
  target: "self",
});
const tailwind = makeMove("Tailwind", { type: "Flying", category: "Status", basePower: 0, target: "self" });
const trickRoom = makeMove("Trick Room", { type: "Psychic", category: "Status", basePower: 0, target: "all" });
const taunt = makeMove("Taunt", { type: "Dark", category: "Status", basePower: 0, target: "normal" });
const followMe = makeMove("Follow Me", { type: "Normal", category: "Status", basePower: 0, priority: 2, target: "self" });
const rainDance = makeMove("Rain Dance", { type: "Water", category: "Status", basePower: 0, target: "all" });
const rockSlide = makeMove("Rock Slide", { type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" });
const heatWave = makeMove("Heat Wave", { type: "Fire", category: "Special", basePower: 95, target: "allAdjacentFoes" });
const closeCombat = makeMove("Close Combat", { type: "Fighting", category: "Physical", basePower: 120, target: "normal" });
const moonblast = makeMove("Moonblast", { type: "Fairy", category: "Special", basePower: 95, target: "normal" });
const darkPulse = makeMove("Dark Pulse", { type: "Dark", category: "Special", basePower: 80, target: "normal" });
const hydroPump = makeMove("Hydro Pump", { type: "Water", category: "Special", basePower: 110, target: "normal" });
const eruption = makeMove("Eruption", { type: "Fire", category: "Special", basePower: 150, target: "allAdjacentFoes" });
const tackle = makeMove("Tackle", { type: "Normal", category: "Physical", basePower: 40, target: "normal" });
const extremeSpeed = makeMove("Extreme Speed", {
  type: "Normal",
  category: "Physical",
  basePower: 80,
  priority: 2,
  target: "normal",
});
const thunderbolt = makeMove("Thunderbolt", { type: "Electric", category: "Special", basePower: 90, target: "normal" });
const bodySlam = makeMove("Body Slam", { type: "Normal", category: "Physical", basePower: 85, target: "normal" });
const psychic = makeMove("Psychic", { type: "Psychic", category: "Special", basePower: 90, target: "normal" });

const commonMoves = [
  protect,
  fakeOut,
  quickGuard,
  wideGuard,
  tailwind,
  trickRoom,
  taunt,
  followMe,
  rainDance,
  rockSlide,
  heatWave,
  closeCombat,
  moonblast,
  darkPulse,
  hydroPump,
  eruption,
  tackle,
  extremeSpeed,
  thunderbolt,
  bodySlam,
  psychic,
];

function speedControlOpening(): EngineLineBenchmarkFixture {
  return {
    name: "speed-control-opening",
    note: "The clean VGC line denies the slower Trick Room mode with Fake Out while the partner establishes Tailwind.",
    state: createTestBattleState({
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
          pokemon: makePokemon("Dragapult", { types: ["Dragon", "Ghost"], baseStats: { spa: 120, spe: 142 } }),
          moveNames: ["Psychic"],
        }),
      ],
      moves: commonMoves,
    }),
    options: { searchMode: "balanced", objectiveMode: "robust", maxDepth: 2 },
    expected: {
      bestPlanIncludes: ["Sneasler: Fake Out into Oranguru", "Aerodactyl: Tailwind"],
      predictedEnemyIncludes: ["Oranguru: Trick Room"],
      minDepthReached: 2,
      maxSearchNodes: 10_000,
    },
  };
}

function focusSashDenial(): EngineLineBenchmarkFixture {
  return {
    name: "focus-sash-trick-room-denial",
    note: "A Focus Sash Trick Room setter must be double-targeted; a single huge hit is not enough.",
    state: createTestBattleState({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: makePokemon("Sneasler", { baseStats: { atk: 135, spe: 120 } }),
          moveNames: ["Fake Out", "Close Combat"],
        }),
        makeMember({
          side: "ally",
          slot: 1,
          pokemon: makePokemon("Flutter Mane", { types: ["Ghost", "Fairy"], baseStats: { spa: 155, spe: 135 } }),
          moveNames: ["Moonblast", "Protect"],
        }),
      ],
      enemy: [
        makeMember({
          side: "enemy",
          slot: 0,
          pokemon: makePokemon("Cresselia", { types: ["Psychic"], baseStats: { hp: 85, def: 70, spd: 80, spe: 85 } }),
          moveNames: ["Trick Room", "Protect"],
          itemName: "Focus Sash",
        }),
        makeMember({
          side: "enemy",
          slot: 1,
          pokemon: makePokemon("Passive Partner", { baseStats: { atk: 45, spe: 50 } }),
          moveNames: ["Body Slam"],
        }),
      ],
      moves: commonMoves,
    }),
    options: { searchMode: "balanced", objectiveMode: "hybrid", maxDepth: 2, maxJointPlansPerSide: 8, maxIndividualActionsPerActor: 5 },
    expected: {
      bestPlanIncludes: ["Sneasler: Fake Out into Cresselia", "Flutter Mane: Moonblast into Cresselia"],
      predictedEnemyIncludes: ["Cresselia: Trick Room", "Passive Partner: Body Slam"],
      minDepthReached: 2,
      maxSearchNodes: 10_000,
    },
  };
}

function quickGuardPriorityDefense(): EngineLineBenchmarkFixture {
  return {
    name: "quick-guard-priority-defense",
    note: "Quick Guard is correct when Fake Out plus Extreme Speed would otherwise remove the win condition before it moves.",
    state: createTestBattleState({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: makePokemon("Hitmontop", { baseStats: { hp: 100, atk: 105, def: 110, spe: 70 } }),
          moveNames: ["Quick Guard", "Body Slam"],
        }),
        makeMember({
          side: "ally",
          slot: 1,
          pokemon: makePokemon("Iron Bundle", { types: ["Water", "Ice"], baseStats: { spa: 145, spe: 136 } }),
          moveNames: ["Hydro Pump"],
          currentHpPercent: 12,
        }),
      ],
      enemy: [
        makeMember({
          side: "enemy",
          slot: 0,
          pokemon: makePokemon("Sneasler", { baseStats: { atk: 130, spe: 120 } }),
          moveNames: ["Fake Out", "Close Combat"],
        }),
        makeMember({
          side: "enemy",
          slot: 1,
          pokemon: makePokemon("Dragonite", { types: ["Dragon", "Flying"], baseStats: { atk: 150, spe: 80 } }),
          moveNames: ["Extreme Speed"],
        }),
      ],
      moves: commonMoves,
    }),
    options: { searchMode: "balanced", objectiveMode: "robust", maxDepth: 2 },
    expected: {
      bestPlanIncludes: ["Hitmontop: Quick Guard", "Iron Bundle: Hydro Pump into Sneasler"],
      predictedEnemyIncludes: ["Sneasler: Fake Out", "Dragonite: Extreme Speed"],
      minDepthReached: 2,
      maxSearchNodes: 10_000,
    },
  };
}

function wideGuardSpreadDefense(): EngineLineBenchmarkFixture {
  return {
    name: "wide-guard-double-spread-defense",
    note: "Wide Guard should be preferred over attacking when both opponents threaten high-value spread damage.",
    state: createTestBattleState({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: makePokemon("Hariyama", { baseStats: { hp: 120, atk: 120, spe: 50 } }),
          moveNames: ["Wide Guard", "Close Combat"],
        }),
        makeMember({
          side: "ally",
          slot: 1,
          pokemon: makePokemon("Fragile Partner", { baseStats: { hp: 70, def: 70, spd: 70, spe: 90 } }),
          moveNames: ["Close Combat"],
        }),
      ],
      enemy: [
        makeMember({
          side: "enemy",
          slot: 0,
          pokemon: makePokemon("Tyranitar", { baseStats: { atk: 134, spe: 61 } }),
          moveNames: ["Rock Slide"],
        }),
        makeMember({
          side: "enemy",
          slot: 1,
          pokemon: makePokemon("Charizard", { types: ["Fire", "Flying"], baseStats: { spa: 130, spe: 100 } }),
          moveNames: ["Heat Wave"],
        }),
      ],
      moves: commonMoves,
    }),
    options: { searchMode: "balanced", objectiveMode: "robust", maxDepth: 2 },
    expected: {
      bestPlanIncludes: ["Hariyama: Wide Guard"],
      predictedEnemyIncludes: ["Tyranitar: Rock Slide", "Charizard: Heat Wave"],
      minDepthReached: 2,
      maxSearchNodes: 10_000,
    },
  };
}

function manualWeatherSetup(): EngineLineBenchmarkFixture {
  return {
    name: "manual-rain-speed-and-damage-setup",
    note: "Rain Dance is the long-term line because it activates Swift Swim and weakens the incoming Fire spread mode.",
    state: createTestBattleState({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: makePokemon("Tornadus", { types: ["Flying"], baseStats: { spa: 125, spe: 121 } }),
          moveNames: ["Rain Dance", "Tailwind"],
        }),
        makeMember({
          side: "ally",
          slot: 1,
          pokemon: makePokemon("Ludicolo", { types: ["Water", "Grass"], baseStats: { spa: 120, spe: 70 } }),
          moveNames: ["Hydro Pump", "Protect"],
          abilityName: "Swift Swim",
        }),
      ],
      enemy: [
        makeMember({
          side: "enemy",
          slot: 0,
          pokemon: makePokemon("Charizard", { types: ["Fire", "Flying"], baseStats: { spa: 150, spe: 100 } }),
          moveNames: ["Heat Wave"],
        }),
        makeMember({
          side: "enemy",
          slot: 1,
          pokemon: makePokemon("Torkoal", { types: ["Fire"], baseStats: { spa: 150, spe: 20 } }),
          moveNames: ["Eruption"],
        }),
      ],
      moves: commonMoves,
      weather: "sun",
    }),
    options: { searchMode: "deep", objectiveMode: "hybrid", maxDepth: 3, stageTopK: 4, maxMs: 250 },
    expected: {
      bestPlanIncludes: ["Tornadus: Rain Dance", "Ludicolo: Hydro Pump"],
      predictedEnemyIncludes: ["Charizard: Heat Wave", "Torkoal: Eruption"],
      minDepthReached: 2,
      maxSearchNodes: 10_000,
    },
  };
}

function intimidateSwitch(): EngineLineBenchmarkFixture {
  return {
    name: "intimidate-switch-into-physical-pressure",
    note: "The active slot is pinned by physical damage, so the professional line pivots Incineroar in before attacks resolve.",
    state: createTestBattleState({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: makePokemon("Gholdengo", { types: ["Steel", "Ghost"], baseStats: { hp: 80, def: 85, spd: 90, spe: 84 } }),
          moveNames: ["Protect"],
          currentHpPercent: 38,
        }),
        makeMember({
          side: "ally",
          slot: 1,
          pokemon: makePokemon("Amoonguss", { types: ["Grass", "Poison"], baseStats: { hp: 114, def: 90, spd: 100, spe: 30 } }),
          moveNames: ["Protect", "Body Slam"],
        }),
        makeMember({
          side: "ally",
          slot: 2,
          pokemon: makePokemon("Incineroar", { types: ["Fire", "Dark"], baseStats: { hp: 110, atk: 115, def: 95, spe: 60 } }),
          moveNames: ["Fake Out"],
          abilityName: "Intimidate",
          isActive: false,
        }),
      ],
      enemy: [
        makeMember({
          side: "enemy",
          slot: 0,
          pokemon: makePokemon("Dragonite", { types: ["Dragon", "Flying"], baseStats: { atk: 160, spe: 80 } }),
          moveNames: ["Extreme Speed"],
        }),
        makeMember({
          side: "enemy",
          slot: 1,
          pokemon: makePokemon("Landorus", { types: ["Ground", "Flying"], baseStats: { atk: 165, spe: 91 } }),
          moveNames: ["Rock Slide"],
        }),
      ],
      moves: commonMoves,
    }),
    options: { searchMode: "balanced", objectiveMode: "robust", maxDepth: 2, maxJointPlansPerSide: 10 },
    expected: {
      bestPlanIncludes: ["Gholdengo: switch to Incineroar"],
      predictedEnemyIncludes: ["Dragonite: Extreme Speed", "Landorus: Rock Slide"],
      minDepthReached: 2,
      maxSearchNodes: 10_000,
    },
  };
}

function tauntTrickRoom(): EngineLineBenchmarkFixture {
  return {
    name: "taunt-trick-room-denial",
    note: "When the support Pokemon is faster than the setter, Taunt should deny Trick Room while the partner attacks.",
    state: createTestBattleState({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: makePokemon("Whimsicott", { types: ["Grass", "Fairy"], baseStats: { spa: 80, spe: 116 } }),
          moveNames: ["Taunt"],
        }),
        makeMember({
          side: "ally",
          slot: 1,
          pokemon: makePokemon("Hydreigon", { types: ["Dark", "Dragon"], baseStats: { spa: 145, spe: 98 } }),
          moveNames: ["Dark Pulse"],
        }),
      ],
      enemy: [
        makeMember({
          side: "enemy",
          slot: 0,
          pokemon: makePokemon("Cresselia", { types: ["Psychic"], baseStats: { hp: 130, def: 120, spd: 130, spe: 85 } }),
          moveNames: ["Trick Room"],
        }),
        makeMember({
          side: "enemy",
          slot: 1,
          pokemon: makePokemon("Ursaluna", { types: ["Ground", "Normal"], baseStats: { atk: 140, spe: 50 } }),
          moveNames: ["Body Slam"],
        }),
      ],
      moves: commonMoves,
    }),
    options: { searchMode: "balanced", objectiveMode: "robust", maxDepth: 2 },
    expected: {
      bestPlanIncludes: ["Whimsicott: Taunt on Cresselia"],
      enemyBestResponseIncludes: ["Cresselia: Trick Room"],
      minDepthReached: 2,
      maxSearchNodes: 10_000,
    },
  };
}

function redirectionTrickRoom(): EngineLineBenchmarkFixture {
  return {
    name: "redirection-plus-trick-room",
    note: "Follow Me should buy the Trick Room setter a turn against two direct attacks.",
    state: createTestBattleState({
      ally: [
        makeMember({
          side: "ally",
          slot: 0,
          pokemon: makePokemon("Indeedee", { types: ["Psychic", "Normal"], baseStats: { hp: 100, spa: 45, def: 105, spd: 105, spe: 85 } }),
          moveNames: ["Follow Me", "Body Slam"],
        }),
        makeMember({
          side: "ally",
          slot: 1,
          pokemon: makePokemon("Farigiraf", { types: ["Normal", "Psychic"], baseStats: { hp: 90, def: 60, spd: 60, spe: 60 } }),
          moveNames: ["Trick Room", "Psychic"],
          currentHpPercent: 35,
        }),
      ],
      enemy: [
        makeMember({
          side: "enemy",
          slot: 0,
          pokemon: makePokemon("Chien-Pao", { types: ["Dark", "Ice"], baseStats: { atk: 160, spe: 135 } }),
          moveNames: ["Close Combat"],
        }),
        makeMember({
          side: "enemy",
          slot: 1,
          pokemon: makePokemon("Flutter Mane", { types: ["Ghost", "Fairy"], baseStats: { spa: 155, spe: 135 } }),
          moveNames: ["Moonblast"],
        }),
      ],
      moves: commonMoves,
    }),
    options: { searchMode: "balanced", objectiveMode: "robust", maxDepth: 2 },
    expected: {
      bestPlanIncludes: ["Indeedee: Follow Me", "Farigiraf: Trick Room"],
      predictedEnemyIncludes: ["Chien-Pao: Close Combat", "Flutter Mane: Moonblast"],
      minDepthReached: 2,
      maxSearchNodes: 10_000,
    },
  };
}

const benchmarks = [
  speedControlOpening(),
  focusSashDenial(),
  quickGuardPriorityDefense(),
  wideGuardSpreadDefense(),
  manualWeatherSetup(),
  intimidateSwitch(),
  tauntTrickRoom(),
  redirectionTrickRoom(),
];

describe("VGC move prediction benchmark", () => {
  it.each(benchmarks)("$name", (fixture) => {
    const [result] = runEngineLineBenchmark([fixture], {
      maxJointPlansPerSide: 10,
      maxIndividualActionsPerActor: 6,
      maxMs: 500,
      maxNodes: 10_000,
    });

    expect(
      result.failures,
      [
        fixture.note,
        `best: ${result.bestPlanSummary || "<none>"}`,
        `predicted enemy: ${result.predictedEnemySummary || "<none>"}`,
        `worst enemy: ${result.enemyBestResponseSummary || "<none>"}`,
        `nodes: ${result.searchNodes}, depth: ${result.depthReached}, elapsed: ${Math.round(result.elapsedMs)}ms`,
      ].join("\n"),
    ).toEqual([]);
  });
});
