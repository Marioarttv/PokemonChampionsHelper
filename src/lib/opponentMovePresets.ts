import { getTypeFromLabel } from "../data/typeChart";
import { isSpreadTarget, type MoveRecord } from "./battleData";
import type { PokemonRecord } from "./pokemonDb";
import type { PersistedAttackCategory, PersistedSavedAttack } from "./savedTeams";

// Assumptions applied while importing user-provided moves:
// - "Water Ball" is treated as "Weather Ball".
// - "Slowking (Hisuian)" is mapped to Slowking-Galar because Hisuian Slowking does not exist.
// - "Decidueye" with Triple Arrows is mapped to Decidueye-Hisui.
// - "Ninetales" with Blizzard / Freeze-Dry / Moonblast is mapped to Ninetales-Alola.
const OPPONENT_MOVE_PRESET_NAMES: Record<string, readonly string[]> = {
  abomasnow: ["Blizzard", "Giga Drain", "Energy Ball", "Earth Power", "Ice Shard"],
  aegislash: ["Shadow Sneak", "Poltergeist", "Iron Head", "Sacred Sword"],
  aerodactyl: ["Rock Slide", "Dual Wingbeat"],
  aggron: ["Body Press", "Heavy Slam", "Rock Slide"],
  alakazam: ["Psychic", "Expanding Force", "Dazzling Gleam", "Focus Blast"],
  altaria: ["Hyper Voice", "Draco Meteor"],
  ampharos: ["Dragon Pulse", "Thunderbolt", "Dazzling Gleam", "Power Gem"],
  appletun: ["Fickle Beam", "Earth Power", "Giga Drain", "Pollen Puff"],
  araquanid: ["Liquidation", "Poison Jab"],
  arcanine: ["Flare Blitz", "Extreme Speed", "Rock Slide", "Snarl"],
  armarouge: ["Armor Cannon", "Psychic", "Expanding Force"],
  azumarill: ["Aqua Jet", "Play Rough", "Liquidation"],
  basculegion: ["Shadow Ball", "Last Respects", "Muddy Water", "Aqua Jet", "Flip Turn", "Wave Crash"],
  basculegionf: ["Shadow Ball", "Last Respects", "Muddy Water", "Aqua Jet", "Flip Turn", "Wave Crash"],
  bellibolt: ["Parabolic Charge", "Thunderbolt", "Muddy Water"],
  blastoise: ["Water Spout", "Dark Pulse", "Aura Sphere"],
  camerupt: ["Earth Power", "Heat Wave", "Eruption", "Ancient Power"],
  ceruledge: ["Bitter Blade", "Shadow Sneak", "Poltergeist", "Close Combat"],
  chandelure: ["Shadow Ball", "Heat Wave", "Energy Ball"],
  charizard: ["Heat Wave", "Weather Ball", "Solar Beam"],
  chesnaught: ["Body Press", "Wood Hammer", "Drain Punch"],
  chimecho: ["Flash Cannon", "Psychic"],
  clefable: ["Moonblast"],
  cofagrigus: ["Shadow Ball", "Body Press"],
  conkeldurr: ["Drain Punch", "Mach Punch", "Ice Punch", "Thunder Punch"],
  corviknight: ["Brave Bird", "Body Press", "Iron Head"],
  crabominable: ["Ice Hammer", "Drain Punch", "Mach Punch", "Thunder Punch", "Close Combat"],
  decidueyehisui: ["Triple Arrows", "Leaf Blade", "Sucker Punch", "Upper Hand", "Brave Bird"],
  delphox: ["Heat Wave", "Psychic"],
  dragapult: ["Dragon Darts", "Phantom Force", "Shadow Ball", "Draco Meteor"],
  drampa: ["Hyper Voice", "Draco Meteor", "Earth Power", "Thunderbolt"],
  empoleon: ["Flash Cannon", "Ice Beam", "Hydro Pump", "Water Pulse"],
  espathra: ["Lumina Crash", "Dazzling Gleam"],
  excadrill: ["Iron Head", "Rock Slide", "Earthquake"],
  feraligatr: ["Liquidation", "Double-Edge", "Aqua Jet"],
  floette: ["Moonblast", "Dazzling Gleam"],
  gallade: ["Psycho Cut", "Sacred Sword", "Leaf Blade"],
  gardevoir: ["Hyper Voice", "Psychic"],
  garganacl: ["Body Press", "Rock Slide"],
  gengar: ["Shadow Ball", "Sludge Bomb"],
  glaceon: ["Blizzard", "Freeze-Dry", "Ice Shard"],
  glimmora: ["Power Gem", "Earth Power", "Sludge Bomb"],
  gliscor: ["Earthquake", "Dual Wingbeat", "High Horsepower", "Rock Slide"],
  golurk: ["Poltergeist", "Headlong Rush", "Ice Punch", "Drain Punch"],
  goodra: ["Body Press", "Flash Cannon", "Heavy Slam", "Draco Meteor"],
  greninja: ["Dark Pulse", "Ice Beam", "Hydro Pump", "Water Shuriken"],
  gyarados: ["Waterfall", "Crunch"],
  hatterene: ["Dazzling Gleam", "Psychic", "Expanding Force"],
  hawlucha: ["Brave Bird", "Close Combat", "High Jump Kick", "Stone Edge"],
  heliolisk: ["Thunderbolt", "Volt Switch", "Electroweb"],
  heracross: ["Close Combat", "Rock Blast", "Pin Missile", "Bullet Seed"],
  hippowdon: ["Earthquake", "High Horsepower", "Rock Slide"],
  hydreigon: ["Dark Pulse", "Draco Meteor", "Earth Power"],
  incineroar: ["Fake Out", "Flare Blitz", "Throat Chop"],
  infernape: ["Close Combat", "Flare Blitz", "Fire Punch", "Thunder Punch"],
  jolteon: ["Thunderbolt", "Electroweb", "Volt Switch", "Shadow Ball"],
  kangaskhan: ["Double-Edge", "Sucker Punch", "Low Kick"],
  kingambit: ["Sucker Punch", "Kowtow Cleave", "Iron Head"],
  kleavor: ["Stone Axe", "X-Scissor", "Close Combat", "U-turn"],
  klefki: ["Dazzling Gleam"],
  kommoo: ["Clanging Scales", "Clangorous Soul", "Aura Sphere", "Body Press"],
  krookodile: ["Earthquake", "Knock Off", "Rock Slide", "High Horsepower"],
  lucario: ["Close Combat", "Meteor Mash", "Bullet Punch", "Aura Sphere", "Flash Cannon"],
  lycanroc: ["Rock Slide", "Close Combat", "Accelerock", "Psychic Fangs"],
  machamp: ["Dynamic Punch", "Stone Edge", "Bullet Punch", "Ice Punch"],
  mamoswine: ["Ice Shard", "Icicle Crash", "High Horsepower", "Earthquake"],
  manectric: ["Volt Switch", "Thunderbolt", "Overheat"],
  maushold: ["Super Fang", "Population Bomb"],
  medicham: ["Close Combat", "Zen Headbutt", "Psycho Cut", "Ice Punch"],
  meganium: ["Solar Beam", "Dazzling Gleam", "Weather Ball"],
  meowscarada: ["Flower Trick", "Knock Off", "Triple Axel", "U-turn"],
  meowstic: ["Expanding Force", "Psychic"],
  mimikyu: ["Play Rough", "Shadow Sneak", "Shadow Claw"],
  mudsdale: ["High Horsepower", "Rock Slide", "Heavy Slam", "Body Press", "Earthquake"],
  ninetalesalola: ["Blizzard", "Freeze-Dry", "Moonblast"],
  noivern: ["Draco Meteor", "Air Slash", "Hurricane"],
  oranguru: ["Psychic"],
  orthworm: ["Body Press", "Heavy Slam"],
  palafin: ["Jet Punch", "Wave Crash", "Flip Turn", "Close Combat"],
  politoed: ["Weather Ball", "Icy Wind", "Muddy Water"],
  primarina: ["Hyper Voice", "Moonblast", "Dazzling Gleam"],
  quaquaval: ["Close Combat", "Aqua Step", "Aqua Jet", "Ice Spinner"],
  raichu: ["Volt Switch", "Nuzzle", "Thunderbolt"],
  rhyperior: ["Rock Slide", "Earthquake", "High Horsepower", "Ice Punch"],
  rotom: ["Thunderbolt", "Volt Switch", "Hydro Pump"],
  rotomfrost: ["Blizzard", "Thunderbolt", "Volt Switch", "Electroweb"],
  rotomheat: ["Overheat", "Thunderbolt", "Volt Switch"],
  rotommow: ["Leaf Storm", "Volt Switch", "Thunderbolt", "Electroweb"],
  rotomwash: ["Thunderbolt", "Volt Switch", "Hydro Pump"],
  sableye: ["Foul Play"],
  samurotthisui: ["Sacred Sword", "Ceaseless Edge", "Aqua Cutter", "Razor Shell", "Sucker Punch"],
  scizor: ["Bullet Punch", "Bug Bite", "Close Combat"],
  scovillain: ["Flamethrower", "Overheat", "Giga Drain"],
  serperior: ["Leaf Storm", "Dragon Pulse", "Giga Drain"],
  sinistcha: ["Matcha Gotcha"],
  sinistchamasterpiece: ["Matcha Gotcha"],
  skeledirge: ["Torch Song", "Shadow Ball", "Earth Power"],
  skarmory: ["Iron Head", "Brave Bird", "Body Press"],
  slowbro: ["Scald", "Psychic", "Body Press"],
  slowbrogalar: ["Shell Side Arm", "Ice Beam"],
  slowking: ["Psychic", "Scald"],
  slowkinggalar: ["Sludge Bomb", "Psychic"],
  sneasler: ["Close Combat", "Dire Claw"],
  snorlax: ["Body Slam", "High Horsepower", "Rock Slide", "Earthquake"],
  spiritomb: ["Foul Play", "Snarl"],
  starmie: ["Liquidation", "Aqua Jet", "Zen Headbutt", "Ice Spinner"],
  steelix: ["Body Press", "Heavy Slam", "Earthquake"],
  sylveon: ["Hyper Voice", "Quick Attack", "Hyper Beam"],
  talonflame: ["Flare Blitz", "Brave Bird"],
  taurospaldeaaqua: ["Close Combat", "Aqua Jet", "Wave Crash", "Raging Bull"],
  tinkaton: ["Gigaton Hammer", "Play Rough", "Knock Off"],
  torkoal: ["Eruption", "Heat Wave", "Earth Power"],
  toxapex: ["Infestation", "Liquidation"],
  toxicroak: ["Close Combat", "Poison Jab", "Sucker Punch", "Gunk Shot"],
  tsareena: ["Triple Axel", "Trop Kick", "Low Kick", "Power Whip", "U-turn"],
  typhlosion: ["Eruption", "Shadow Ball", "Heat Wave", "Overheat"],
  typhlosionhisui: ["Eruption", "Flamethrower", "Heat Wave", "Scorching Sands", "Shadow Ball"],
  umbreon: ["Foul Play", "Snarl"],
  vanilluxe: ["Blizzard", "Freeze-Dry", "Icy Wind"],
  victreebel: ["Sludge Bomb", "Sucker Punch", "Poison Jab"],
  vivillon: ["Hurricane", "Struggle Bug"],
  volcarona: ["Heat Wave", "Giga Drain"],
  weavile: ["Knock Off", "Triple Axel", "Low Kick", "Ice Shard"],
  zoroarkhisui: ["Hyper Voice", "Bitter Malice", "Icy Wind", "Shadow Ball"],
};

const MOVE_NAME_ALIASES: Record<string, string> = {
  waterball: "Weather Ball",
};

export const OPPONENT_MOVE_PRESET_KEY_SET = new Set(Object.keys(OPPONENT_MOVE_PRESET_NAMES));

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getPresetKeys(pokemon: PokemonRecord) {
  return [
    normalizeKey(pokemon.id),
    normalizeKey(pokemon.name),
    normalizeKey(pokemon.baseSpecies),
  ];
}

function getPresetMoveLookupKey(moveName: string) {
  return moveName.toLowerCase();
}

function resolvePresetMoveName(moveName: string) {
  return MOVE_NAME_ALIASES[normalizeKey(moveName)] ?? moveName;
}

function buildPresetSavedAttack(
  pokemon: PokemonRecord,
  move: MoveRecord,
  index: number,
): PersistedSavedAttack | null {
  if (move.category === "Status") {
    return null;
  }

  const type = getTypeFromLabel(move.type);

  if (!type) {
    return null;
  }

  return {
    id: `preset-${pokemon.id}-${normalizeKey(move.name)}-${index}`,
    label: move.name,
    type,
    basePower: move.basePower > 0 ? move.basePower : undefined,
    category: move.category.toLowerCase() as PersistedAttackCategory,
    isSpreadMove: isSpreadTarget(move.target),
  };
}

export function getOpponentPresetMoveNames(pokemon: PokemonRecord) {
  for (const key of getPresetKeys(pokemon)) {
    const preset = OPPONENT_MOVE_PRESET_NAMES[key];

    if (preset) {
      return [...preset];
    }
  }

  return [];
}

export function getOpponentPresetSavedAttacks(
  pokemon: PokemonRecord,
  moveByKey: ReadonlyMap<string, MoveRecord>,
) {
  return getOpponentPresetMoveNames(pokemon)
    .map((rawMoveName, index) => {
      const moveName = resolvePresetMoveName(rawMoveName);
      const move =
        moveByKey.get(getPresetMoveLookupKey(moveName)) ??
        moveByKey.get(normalizeKey(moveName)) ??
        null;

      return move ? buildPresetSavedAttack(pokemon, move, index) : null;
    })
    .filter((attack): attack is PersistedSavedAttack => attack !== null);
}
