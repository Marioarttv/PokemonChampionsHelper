import { readFile } from "node:fs/promises";

export const regulationMC = JSON.parse(await readFile(new URL("../data/regulation-m-c.json", import.meta.url), "utf8"));
const byId = (records) => new Map(records.map((record) => [record.id, record]));

export function applyWebSpeciesCorrections(species) {
  const records = byId(species);
  for (const correction of regulationMC.species) {
    const previous = records.get(correction.id) ?? {};
    records.set(correction.id, {
      ...previous,
      id: correction.id,
      name: correction.name,
      num: correction.num,
      baseSpecies: correction.baseSpecies,
      forme: correction.forme,
      types: correction.types,
      baseStats: correction.baseStats,
      bst: Object.values(correction.baseStats).reduce((sum, value) => sum + value, 0),
      abilities: Object.fromEntries(correction.abilities.map((ability) => [ability.slot, ability.name])),
      heightm: correction.heightM,
      weightkg: correction.weightKg,
      color: previous.color ?? null,
      prevo: previous.prevo ?? null,
      evos: previous.evos ?? [],
      gen: previous.gen ?? 9,
      tier: previous.tier ?? null,
      doublesTier: previous.doublesTier ?? null,
      isNonstandard: null,
    });
  }
  return [...records.values()].sort((a, b) => a.num - b.num || a.name.localeCompare(b.name));
}

export function applyWebBattleCorrections(abilities, items, moves) {
  const abilityMap = byId(abilities);
  const itemMap = byId(items);
  const moveMap = byId(moves);
  for (const correction of regulationMC.abilities) abilityMap.set(correction.id, {
    id: correction.id, name: correction.name, shortDesc: correction.shortDesc, desc: correction.desc,
  });
  for (const correction of regulationMC.items) itemMap.set(correction.id, {
    id: correction.id, name: correction.name, shortDesc: correction.shortDesc, desc: correction.desc,
    megaStone: correction.megaStone,
  });
  for (const correction of regulationMC.moves) {
    const previous = moveMap.get(correction.id) ?? {};
    moveMap.set(correction.id, {
      ...previous,
      id: correction.id, name: correction.name, type: correction.type, category: correction.category,
      basePower: ({tripleaxel: 40, triplekick: 20})[correction.id] ?? correction.basePower,
      accuracy: correction.accuracy, pp: correction.championsPp ?? correction.pp,
      priority: correction.priority, target: correction.target,
      multihit: correction.multihit ?? null, flags: correction.flags,
      shortDesc: correction.shortDesc, desc: correction.desc,
    });
  }
  const sorted = (map) => [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { abilities: sorted(abilityMap), items: sorted(itemMap), moves: sorted(moveMap) };
}

export function isRegulationMCForm(pokemon) {
  const affectedBases = new Set(regulationMC.species.map((entry) => entry.baseSpecies));
  return !affectedBases.has(pokemon.baseSpecies) || regulationMC.species.some((entry) => entry.id === pokemon.id);
}

export function applyNativeRegulationMC(pack) {
  for (const field of ["species", "abilities", "items", "moves"]) {
    const records = byId(pack[field]);
    for (const correction of regulationMC[field]) records.set(correction.id, structuredClone(correction));
    pack[field] = [...records.values()].sort((a, b) => a.num - b.num || a.id.localeCompare(b.id));
    pack.counts[field] = pack[field].length;
  }
  // Earlier on-device evidence established Staraptite's Champions runtime ID.
  const staraptite = pack.items.find((item) => item.id === "staraptite");
  if (staraptite) { staraptite.num = 2639; staraptite.aliasNumbers = [2589]; }
  pack.source.championsCorrections = regulationMC.sources;
  pack.championsLearnsets = { ...pack.championsLearnsets, ...regulationMC.learnsets };
}
