import { describe, expect, it } from "vitest";
import { createBattleState } from "../engine";
import { createMoveLookup, makeMove, makePokemon } from "../engine/__tests__/fixtures";
import {
  showdownSnapshotToBattleInput,
  type ShowdownBridgeSnapshot,
  type ShowdownPokemonSnapshot,
} from "../showdownBridge";

const pokemonEntries = [
  makePokemon("Floette-Mega", {
    id: "floettemega",
    baseSpecies: "Floette",
    types: ["Fairy"],
    abilities: { "0": "Fairy Aura" },
  }),
  makePokemon("Kingambit", {
    id: "kingambit",
    types: ["Dark", "Steel"],
    abilities: { "0": "Defiant" },
  }),
  makePokemon("Manectric", {
    id: "manectric",
    types: ["Electric"],
    abilities: { "0": "Lightning Rod" },
  }),
  makePokemon("Archaludon", {
    id: "archaludon",
    types: ["Steel", "Dragon"],
    abilities: { "0": "Stamina" },
  }),
  makePokemon("Garchomp", {
    id: "garchomp",
    types: ["Dragon", "Ground"],
    abilities: { "0": "Rough Skin" },
  }),
  makePokemon("Politoed", {
    id: "politoed",
    types: ["Water"],
    abilities: { "0": "Drizzle" },
  }),
];

const moveByKey = createMoveLookup(
  makeMove("Dazzling Gleam", { type: "Fairy", category: "Special", basePower: 80, target: "allAdjacentFoes" }),
  makeMove("Moonblast", { type: "Fairy", category: "Special", basePower: 95 }),
  makeMove("Light of Ruin", { type: "Fairy", category: "Special", basePower: 140 }),
  makeMove("Protect", { type: "Normal", category: "Status", basePower: 0, priority: 4, target: "self" }),
  makeMove("Kowtow Cleave", { type: "Dark", category: "Physical", basePower: 85 }),
  makeMove("Low Kick", { type: "Fighting", category: "Physical", basePower: 0 }),
  makeMove("Volt Switch", { type: "Electric", category: "Special", basePower: 70 }),
);

function showdownPokemon(partial: Partial<ShowdownPokemonSnapshot>) {
  return {
    name: partial.name ?? partial.speciesForme ?? "Unknown",
    speciesForme: partial.speciesForme ?? partial.name ?? "Unknown",
    ident: partial.ident ?? "",
    details: partial.details ?? `${partial.speciesForme ?? partial.name ?? "Unknown"}, L50`,
    searchid: partial.searchid ?? "",
    slot: partial.slot ?? 0,
    fainted: partial.fainted ?? false,
    hp: partial.hp ?? 100,
    maxhp: partial.maxhp ?? 100,
    level: partial.level ?? 50,
    gender: partial.gender ?? "N",
    ability: partial.ability ?? "",
    baseAbility: partial.baseAbility ?? "",
    item: partial.item ?? "",
    itemEffect: partial.itemEffect ?? "",
    prevItem: partial.prevItem ?? "",
    prevItemEffect: partial.prevItemEffect ?? "",
    status: partial.status ?? "",
    statusData: partial.statusData ?? {},
    boosts: partial.boosts ?? {},
    volatiles: partial.volatiles ?? [],
    turnstatuses: partial.turnstatuses ?? [],
    movestatuses: partial.movestatuses ?? [],
    lastMove: partial.lastMove ?? "",
    moveTrack: partial.moveTrack ?? [],
    moves: partial.moves ?? [],
    teraType: partial.teraType ?? "",
    terastallized: partial.terastallized ?? "",
  };
}

function baseSnapshot(): ShowdownBridgeSnapshot {
  const floette = showdownPokemon({
    name: "Floette",
    speciesForme: "Floette-Mega",
    ident: "p1a: Floette",
    details: "Floette-Mega, L50, F",
    hp: 53,
    maxhp: 151,
    ability: "Fairy Aura",
    item: "Floettite",
  });
  const kingambit = showdownPokemon({
    name: "Kingambit",
    speciesForme: "Kingambit",
    ident: "p1b: Kingambit",
    details: "Kingambit, L50, M",
    hp: 144,
    maxhp: 207,
    moves: ["Kowtow Cleave", "Low Kick"],
  });
  const manectric = showdownPokemon({
    name: "Manectric",
    speciesForme: "Manectric",
    ident: "p2a: Manectric",
    details: "Manectric, L50, M",
    moves: ["Volt Switch"],
  });
  const archaludon = showdownPokemon({
    name: "Archaludon",
    speciesForme: "Archaludon",
    ident: "p2b: Archaludon",
    details: "Archaludon, L50, F",
  });

  return {
    source: "pokemon-showdown",
    capturedAt: "2026-05-08T17:53:00.000Z",
    url: "https://play.pokemonshowdown.com/battle-gen9championsvgc2026regma-test",
    room: {
      id: "battle-gen9championsvgc2026regma-test",
      type: "battle",
      side: "p1",
      requestType: "move",
      rqid: 3,
      request: {
        active: [
          {
            moves: [
              { move: "Dazzling Gleam", id: "dazzlinggleam", pp: 12, maxpp: 12, target: "allAdjacentFoes" },
              { move: "Moonblast", id: "moonblast", pp: 16, maxpp: 16, target: "normal" },
              { move: "Light of Ruin", id: "lightofruin", pp: 8, maxpp: 8, target: "normal" },
              { move: "Protect", id: "protect", pp: 8, maxpp: 8, target: "self" },
            ],
            canMegaEvo: true,
          },
          {
            moves: [
              { move: "Kowtow Cleave", id: "kowtowcleave", pp: 16, maxpp: 16, target: "normal" },
              { move: "Low Kick", id: "lowkick", pp: 16, maxpp: 16, target: "normal" },
            ],
          },
        ],
        side: {
          id: "p1",
          pokemon: [
            {
              ident: "p1a: Floette",
              details: "Floette-Mega, L50, F",
              condition: "53/151",
              active: true,
              moves: ["Dazzling Gleam", "Moonblast", "Light of Ruin", "Protect"],
              baseAbility: "Fairy Aura",
              item: "Floettite",
            },
            {
              ident: "p1b: Kingambit",
              details: "Kingambit, L50, M",
              condition: "144/207",
              active: true,
              moves: ["Kowtow Cleave", "Low Kick"],
            },
          ],
        },
      },
    },
    battle: {
      id: "gen9championsvgc2026regma-test",
      roomid: "battle-gen9championsvgc2026regma-test",
      tier: "[Gen 9 Champions] VGC 2026 Reg M-A",
      gameType: "doubles",
      gen: 9,
      turn: 2,
      ended: false,
      weather: "raindance",
      weatherTimeLeft: 6,
      weatherMinTimeLeft: 3,
      pseudoWeather: [["Trick Room", 1, 3]],
      teamPreviewCount: 4,
      pokemonControlled: 2,
      mySide: "p1",
      nearSide: "p1",
      farSide: "p2",
      sides: {
        p1: {
          sideid: "p1",
          id: "darrowarttv",
          name: "DarrowArtTV",
          totalPokemon: 4,
          sideConditions: { tailwind: ["Tailwind", 1, 2] },
          active: [floette, kingambit],
          pokemon: [floette, kingambit],
        },
        p2: {
          sideid: "p2",
          id: "youngchow14",
          name: "youngchow14",
          totalPokemon: 4,
          sideConditions: { reflect: ["Reflect", 1, 4] },
          active: [manectric, archaludon],
          pokemon: [manectric, archaludon],
        },
      },
    },
  };
}

describe("showdownSnapshotToBattleInput", () => {
  it("maps a live Showdown doubles snapshot into engine input", () => {
    const result = showdownSnapshotToBattleInput(baseSnapshot(), { pokemonEntries, moveByKey });

    expect(result.unresolvedSpecies).toEqual([]);
    expect(result.input?.weather).toBe("rain");
    expect(result.input?.fieldState.trickRoomTurns).toBe(3);
    expect(result.input?.allySide.tailwindTurns).toBe(2);
    expect(result.input?.enemySide.reflectTurns).toBe(4);
    expect(result.input?.ally[0].pokemon.name).toBe("Floette-Mega");
    expect(result.input?.ally[0].currentHpPercent).toBeCloseTo(35.1, 1);
    expect(result.input?.ally[0].moveNames).toContain("Light of Ruin");
    expect(result.input?.enemy[0].pokemon.name).toBe("Manectric");

    const state = createBattleState({
      ally: result.input!.ally,
      enemy: result.input!.enemy,
      moveByKey,
      weather: result.input!.weather,
      terrain: result.input!.terrain,
      allySide: result.input!.allySide,
      enemySide: result.input!.enemySide,
      fieldState: result.input!.fieldState,
      applyInitialEntryEffects: false,
    });

    expect(state.sides.ally.activeIds).toEqual(["ally-0", "ally-1"]);
    expect(state.sides.enemy.activeIds).toEqual(["enemy-0", "enemy-1"]);
    expect(state.field.weather).toBe("rain");
  });

  it("uses the viewer side from mySide when room.side is missing", () => {
    const snapshot = baseSnapshot();
    snapshot.room.side = "";
    snapshot.battle.mySide = "p2";

    const result = showdownSnapshotToBattleInput(snapshot, { pokemonEntries, moveByKey });

    expect(result.input?.ally[0].pokemon.name).toBe("Manectric");
    expect(result.input?.enemy[0].pokemon.name).toBe("Floette-Mega");
  });

  it("normalizes Showdown status ids into battle statuses", () => {
    const snapshot = baseSnapshot();
    const floette = snapshot.battle.sides.p1?.active[0];
    if (!floette) throw new Error("missing Floette fixture");
    floette.status = "tox";
    floette.statusData = { toxicTurns: 3 };
    const archaludon = snapshot.battle.sides.p2?.active[1];
    if (!archaludon) throw new Error("missing Archaludon fixture");
    archaludon.status = "frz";

    const garchomp = showdownPokemon({
      name: "Garchomp",
      speciesForme: "Garchomp",
      ident: "p2a: Garchomp",
      details: "Garchomp, L50, M",
      status: "psn",
    });
    snapshot.battle.sides.p2!.active[0] = garchomp;
    snapshot.battle.sides.p2!.pokemon = [garchomp, ...snapshot.battle.sides.p2!.pokemon.slice(1)];

    const result = showdownSnapshotToBattleInput(snapshot, { pokemonEntries, moveByKey });

    expect(result.warnings).not.toContain('Floette-Mega has unsupported status "tox".');
    expect(result.warnings).not.toContain('Garchomp has unsupported status "psn".');
    expect(result.warnings).not.toContain('Archaludon has unsupported status "frz".');
    expect(result.input?.ally[0].statusCondition).toBe("badPoison");
    expect(result.input?.ally[0].toxicTurns).toBe(3);
    expect(result.input?.enemy[0].pokemon.name).toBe("Garchomp");
    expect(result.input?.enemy[0].statusCondition).toBe("poison");
    expect(result.input?.enemy[1].pokemon.name).toBe("Archaludon");
    expect(result.input?.enemy[1].statusCondition).toBe("freeze");
  });
});
