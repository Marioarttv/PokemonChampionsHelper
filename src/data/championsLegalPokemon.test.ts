import { Dex } from "@pkmn/dex";
import { describe, expect, it } from "vitest";
import {
  POKEMON_CHAMPIONS_ACTIVE_REGULATION,
  POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET,
  POKEMON_CHAMPIONS_LEGAL_SPECIES_NAMES,
  normalizePokemonNameKey,
} from "./championsLegalPokemon";

const REGULATION_MB_ADDITIONS = [
  "Vileplume",
  "Qwilfish",
  "Sceptile",
  "Blaziken",
  "Swampert",
  "Mawile",
  "Metagross",
  "Staraptor",
  "Musharna",
  "Scolipede",
  "Scrafty",
  "Eelektross",
  "Pyroar",
  "Malamar",
  "Barbaracle",
  "Dragalge",
  "Grimmsnarl",
  "Falinks",
  "Overqwil",
  "Houndstone",
  "Annihilape",
  "Gholdengo",
] as const;

const REGULATION_MB_MEGA_FORM_IDS = [
  "sceptilemega",
  "blazikenmega",
  "swampertmega",
  "mawilemega",
  "metagrossmega",
  "staraptormega",
  "scolipedemega",
  "scraftymega",
  "eelektrossmega",
  "pyroarmega",
  "malamarmega",
  "barbaraclemega",
  "dragalgemega",
  "falinksmega",
] as const;

describe("Pokemon Champions legal species", () => {
  it("uses Regulation M-B as the active regulation", () => {
    expect(POKEMON_CHAMPIONS_ACTIVE_REGULATION).toBe("Regulation M-B");
  });

  it("includes every Regulation M-B addition", () => {
    for (const speciesName of REGULATION_MB_ADDITIONS) {
      expect(POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET.has(normalizePokemonNameKey(speciesName))).toBe(true);
    }
  });

  it("keeps the legal base-species list deduplicated", () => {
    const uniqueKeys = new Set(POKEMON_CHAMPIONS_LEGAL_SPECIES_NAMES.map(normalizePokemonNameKey));

    expect(uniqueKeys.size).toBe(POKEMON_CHAMPIONS_LEGAL_SPECIES_NAMES.length);
  });

  it("marks the Regulation M-B Mega-form base species as legal", () => {
    for (const megaFormId of REGULATION_MB_MEGA_FORM_IDS) {
      const megaForm = Dex.species.get(megaFormId);

      expect(megaForm.exists).toBe(true);
      expect(POKEMON_CHAMPIONS_LEGAL_SPECIES_KEY_SET.has(normalizePokemonNameKey(megaForm.baseSpecies))).toBe(true);
    }
  });
});
