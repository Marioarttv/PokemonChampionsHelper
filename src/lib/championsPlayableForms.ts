import {
  POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET,
  normalizePokemonNameKey,
} from "../data/championsLegalPokemon";
import type { PokemonRecord } from "./pokemonDb";

const PLAYABLE_BASE_FORM_ID_BY_BASE_SPECIES_KEY: Record<string, string> = {
  floette: "floetteeternal",
};

export function getChampionsPlayableBaseFormId(
  pokemon: Pick<PokemonRecord, "baseSpecies" | "name">,
) {
  const baseSpeciesKey = normalizePokemonNameKey(pokemon.baseSpecies || pokemon.name);
  return PLAYABLE_BASE_FORM_ID_BY_BASE_SPECIES_KEY[baseSpeciesKey] ?? null;
}

export function isChampionsSuppressedBaseForm(
  pokemon: Pick<PokemonRecord, "baseSpecies" | "forme" | "name">,
) {
  const baseSpeciesKey = normalizePokemonNameKey(pokemon.baseSpecies || pokemon.name);
  return (
    pokemon.forme === null &&
    POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET.has(baseSpeciesKey) &&
    Boolean(PLAYABLE_BASE_FORM_ID_BY_BASE_SPECIES_KEY[baseSpeciesKey])
  );
}

export function isChampionsPlayableBaseForm(
  pokemon: Pick<PokemonRecord, "baseSpecies" | "forme" | "id" | "name">,
) {
  const baseSpeciesKey = normalizePokemonNameKey(pokemon.baseSpecies || pokemon.name);
  if (!POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET.has(baseSpeciesKey)) {
    return false;
  }

  const playableFormId = PLAYABLE_BASE_FORM_ID_BY_BASE_SPECIES_KEY[baseSpeciesKey] ?? null;
  if (playableFormId) {
    return normalizePokemonNameKey(pokemon.id) === playableFormId;
  }

  return pokemon.forme === null;
}
