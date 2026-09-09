import { POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET, normalizePokemonNameKey } from "../data/championsLegalPokemon";
import type { PokemonRecord } from "./pokemonDb";
import type { ItemRecord } from "./battleData";

export function isChampionsMegaEntry(pokemon: Pick<PokemonRecord, "baseSpecies" | "name" | "forme">) {
  if (!pokemon.forme) {
    return false;
  }

  if (!POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET.has(normalizePokemonNameKey(pokemon.baseSpecies || pokemon.name))) {
    return false;
  }

  return (
    /^Mega(?:-[XYZ])?$/.test(pokemon.forme) ||
    /^[FM]-Mega$/.test(pokemon.forme) ||
    pokemon.forme === "Original-Mega" ||
    pokemon.forme === "Primal"
  );
}


export function inferMegaEvolutionItemName(
  megaPokemon: PokemonRecord | null | undefined,
  itemOptions: readonly ItemRecord[] = [],
) {
  if (!megaPokemon || !isChampionsMegaEntry(megaPokemon)) {
    return null;
  }

  const mappedItem = itemOptions.find((item) => Object.values(item.megaStone ?? {}).includes(megaPokemon.id));
  if (mappedItem) return mappedItem.name;

  const baseSpecies = megaPokemon.baseSpecies || megaPokemon.name;
  const baseSpeciesKey = normalizePokemonNameKey(baseSpecies);

  if (megaPokemon.forme === "Primal") {
    if (baseSpeciesKey === "groudon") {
      return "Red Orb";
    }
    if (baseSpeciesKey === "kyogre") {
      return "Blue Orb";
    }
  }

  const formSuffix =
    megaPokemon.forme === "Mega-X"
      ? "x"
      : megaPokemon.forme === "Mega-Y"
        ? "y"
        : megaPokemon.forme === "Mega-Z" ? "z" : null;
  const candidateItems = itemOptions.filter((item) => {
    const itemKey = normalizePokemonNameKey(item.name);
    const itemTextKey = normalizePokemonNameKey(`${item.shortDesc} ${item.desc}`);
    return (
      itemKey.includes(baseSpeciesKey) ||
      itemTextKey.includes(`heldbya${baseSpeciesKey}`) ||
      itemTextKey.includes(`heldbyan${baseSpeciesKey}`)
    );
  });
  const matchedItem =
    (formSuffix
      ? candidateItems.find((item) => normalizePokemonNameKey(item.name).endsWith(formSuffix))
      : candidateItems.find((item) => !/[xyz]$/.test(normalizePokemonNameKey(item.name)))) ??
    candidateItems[0] ??
    null;

  if (matchedItem) {
    return matchedItem.name;
  }

  const spacedSuffix =
    megaPokemon.forme === "Mega-X" ? " X" : megaPokemon.forme === "Mega-Y" ? " Y" : megaPokemon.forme === "Mega-Z" ? " Z" : "";
  return `${baseSpecies}ite${spacedSuffix}`;
}

