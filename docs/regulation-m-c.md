# Regulation M-C

The active regulation is M-C, September 9–December 2, 2026. Existing legal species remain available, and the new roster includes Absol Mega Z, Garchomp Mega Z, Lucario Mega Z, Mega Salamence, Mega Golisopod, and Mega Baxcalibur. Alternate Toxtricity, Indeedee, and Squawkabilly forms have separate usable presets.

## Data and regeneration

`data/regulation-m-c.json` is the verified correction snapshot shared with the iPad tweak update. Its `sources` field records the roster, Champions Pokédex, moves, abilities, and Mega Stone references. Champions species values, move PP, learnsets, abilities, and stones override the generic Dex snapshot. Other species retain the existing generator behavior.

The 35 new sets are curated starting points, with four legal moves, an ability, an item, a nature, and 66 training points each. They are not measured usage statistics; their usage counts remain zero. Literal preset blocks stay in `src/data/championsMetaMovesetsRaw.ts` for both the website parser and native generator. Training defaults are generated from the correction snapshot; saved custom spreads continue to override defaults.

Run `npm run generate:data` for the website JSON and move-trait/training data. Run `node scripts/champions/generate-mechanics-pack.mjs` and `node scripts/champions/generate-perfect-knowledge-db.mjs` for the companion data packs. `npm run build` also regenerates website data.

## Behavior

In Movesets DB, Mega forms show bracketed stat differences beside all six base stats and calculated training stats. Increases are green, decreases are red, and unchanged stats have no badge. Calculated comparisons use the selected Mega's nature and training points for both forms. The Mega Stone mapping selects the exact original form, including Eternal Floette and female Meowstic.

Mega Z forms appear alongside the existing Mega forms and resolve their exact stones. Corrected data feeds team building, movesets, move lookup, speed/stat calculations, and tactical analysis. The damage helpers recognize new contact/slicing/sound move flags, Aura Guard, Steely Spirit, Scrappy, the new presets' damage items, and terrain-sensitive moves. The approximate engine also handles terrain entry abilities, Grassy Glide priority, allied Steely Spirit, Seed Sower, Air Balloon consumption, and Normal Gem consumption.

The tactical engine remains an approximation. This update does not claim complete cartridge mechanics or replace the separate authoritative simulator scaffold. Artwork uses the existing sprite fallback where a new form's sprite is unavailable.

## Verification

The M-C regressions check every new preset against the generated species, ability, item, move and learnset data; exact Mega stones and abilities; training defaults; and relevant damage and turn interactions. Browser checks cover the M-C header, the Rillaboom moveset, and selecting Lucario Mega Z with Lucarionite Z and its corrected stats. Production deployment is through the existing Vercel connection.

September 9 validation: 212 Vitest tests and 9 Node tests passed, followed by a successful TypeScript/Vite production build. Vitest used `--no-file-parallelism` because concurrent runs hit wall-clock search-depth limits in existing benchmarks. The build retains its bundle-size warning.
