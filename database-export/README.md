# Database Export

This folder is a portable copy of the Pokemon data files that are currently committed to `PokemonChampionsHelper`.

These are duplicates only. Nothing was moved out of the main app.

## Included In This Export

### `public/data/pokemon-db.json`

Generated from `@pkmn/dex`.

Contains the local species database used by the app, including:

- species ids and names
- National Dex numbers
- forms / base species
- types
- base stats
- abilities
- height / weight
- evolution references
- generation and tier fields

Current snapshot metadata:

- source: `@pkmn/dex`
- generatedAt: `2026-04-10T21:50:26.245Z`
- speciesCount: `1417`

### `public/data/battle-data.json`

Generated from `@pkmn/dex`.

Contains the app's local battle data snapshot for:

- moves
- abilities
- items

Current snapshot metadata:

- source: `@pkmn/dex`
- generatedAt: `2026-04-11T17:50:21.937Z`
- moveCount: `954`
- abilityCount: `314`
- itemCount: `583`

### `src/data/typeChart.ts`

Local type reference data, including:

- canonical type order
- display metadata for each type
- attack effectiveness chart

### `src/data/championsLegalPokemon.ts`

Current Pokemon Champions legal-species snapshot used by the app.

Current snapshot metadata:

- regulation: `Regulation M-A`
- regulation window: `April 8, 2026 to June 17, 2026`
- sourced at: `April 18, 2026`
- source note: `MetaVGC regulation snapshot`

### `src/data/championsMetaMovesetsRaw.ts`

Raw text export of Pokemon Champions meta sets.

Current snapshot metadata:

- source: `https://www.pokemon-zone.com/champions/pokemon/`
- exportedAt: `2026-04-19T17:28:05.487Z`

## What Is Not In This Folder

Some app data is runtime-only and is not stored in versioned files in this repository:

- saved teams are stored in browser IndexedDB via `src/lib/savedTeams.ts`
- custom species movesets are stored in browser localStorage via `src/lib/speciesMovesets.ts`

Because those are browser-side user data stores, there were no committed database files to duplicate here.

## Best Sources For Additional Pokemon Data

### 1. `@pkmn/dex` / Pokemon Showdown data

Best for battle-ready structured data:

- species
- moves
- abilities
- items
- forms
- tiers
- learnsets
- showdown-aligned battle behavior

This project already uses `@pkmn/dex` as the source for the two JSON files in `public/data/`.

Good when you want:

- offline generation
- reproducible snapshots
- battle data that matches competitive tooling closely

Useful resources:

- [@pkmn/dex on npm](https://www.npmjs.com/package/@pkmn/dex)
- [Pokemon Showdown data repo](https://github.com/smogon/pokemon-showdown)

### 2. PokeAPI

Best for broad REST-style Pokemon data access.

Useful endpoints:

- `https://pokeapi.co/api/v2/pokemon/{name-or-id}`
- `https://pokeapi.co/api/v2/pokemon-species/{name-or-id}`
- `https://pokeapi.co/api/v2/move/{name-or-id}`
- `https://pokeapi.co/api/v2/ability/{name-or-id}`
- `https://pokeapi.co/api/v2/item/{name-or-id}`
- `https://pokeapi.co/api/v2/type/{name-or-id}`
- `https://pokeapi.co/api/v2/evolution-chain/{id}`

Use PokeAPI when you need:

- species flavor text
- evolution chain traversal
- encounter and habitat info
- dex text and classification data
- sprite / artwork references
- a straightforward REST API

Reference:

- [PokeAPI docs](https://pokeapi.co/docs/v2)

### 3. Pokemon Showdown sprite CDN

Best for lightweight competitive-facing sprites.

This app already uses:

- `https://play.pokemonshowdown.com/sprites/dex/{pokemon-id}.png`

Good for:

- battle sprites
- quick lookup by showdown-style id

### 4. Pokemon Champions meta resources

Best for usage trends, meta sets, and regulation snapshots.

Current project sources:

- meta sets: [Pokemon Zone - Champions](https://www.pokemon-zone.com/champions/pokemon/)
- legal roster snapshot: [MetaVGC](https://www.metavgc.com/)

Use these when you need:

- current ranked meta trends
- popular sets
- regulation-specific legal lists

For anything regulation-sensitive, cross-check against official Pokemon announcements whenever available.

### 5. Bulbapedia / Serebii

Best for manual verification and edge-case research.

Use these when you need to confirm:

- odd form naming
- event or special-case availability
- move/item/ability trivia not exposed cleanly in APIs

References:

- [Bulbapedia](https://bulbapedia.bulbagarden.net/)
- [Serebii](https://www.serebii.net/)

## Suggested Data Strategy For Another Project

If you are porting this into another app, a practical split is:

1. Use `@pkmn/dex` or Showdown data for battle mechanics and learnsets.
2. Use PokeAPI for species flavor, evolution, and additional encyclopedic fields.
3. Use Pokemon Zone / MetaVGC for Pokemon Champions-specific legality and meta snapshots.
4. Keep the type chart local unless you specifically need to regenerate it from another source.

## Refreshing The Local JSON Snapshots

From the main project root:

```bash
npm run generate:data
```

That regenerates:

- `public/data/pokemon-db.json`
- `public/data/battle-data.json`
