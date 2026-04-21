# Pokemon Champions Helper

A deployable React + TypeScript app for competitive Pokemon prep, with a growing doubles battle engine for tactical recommendations.

## Current Scope

The app currently includes:

- a local offline Pokemon species and move database
- team building and saved team storage
- a moveset database with imported enemy presets plus custom overrides
- matchup and coverage views for your team versus an enemy six
- a rough damage calculator with weather, terrain, stages, abilities, and items
- a 2v2 threat board for selected doubles leads
- a search-based battle engine that recommends worst-case-safe doubles lines

For the detailed engine progress log and roadmap, see [`docs/battle-engine.md`](docs/battle-engine.md).

## Stack

- Vite
- React
- TypeScript

The project stays fully client-side and uses generated local data so core features do not depend on runtime API calls.

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

## Local Data

The app uses reproducible local datasets generated from `@pkmn/dex`:

- `public/data/pokemon-db.json`
- `public/data/battle-data.json`

Generate or refresh them with:

```bash
npm run generate:data
```

This keeps the project independent from live runtime API requests for core species, typing, stat, move, item, and ability data.

## Battle Engine Progress

The current battle engine lives under `src/lib/engine/` and is already capable of:

- building a canonical `BattleState` from selected allies, enemies, and bench options
- generating legal doubles actions including moves, targeting, switching, and pass states
- resolving turn order using priority, speed, Tailwind, and Trick Room
- simulating direct damage with rough min / average / max branches
- reasoning about support/status play such as Protect, Fake Out, Tailwind, Trick Room, Helping Hand, redirection, screens, guards, Taunt, Safeguard, Ally Switch, Encore, Disable, common healing/setup lines, and several status / speed-control moves
- scoring positions with HP, survival, pressure, speed control, and side-condition heuristics
- recommending a line based on worst-case enemy counterplay rather than raw damage alone

The engine is still a tactical approximation, not a full cartridge-accurate simulator.

## Near-Term Roadmap

The next major goals are:

1. Expand move fidelity for more doubles-specific support, secondary effects, and edge-case interactions.
2. Improve hidden-information modeling so enemy options are represented more realistically than a fixed visible set.
3. Strengthen the evaluator and search depth so support lines and positioning choices are valued more consistently.
4. Move more battle reasoning out of `src/App.tsx` and into reusable pure engine modules.

## Deployment

### GitHub Pages

The repository includes a GitHub Actions workflow at `.github/workflows/deploy.yml` that builds the app and deploys the `dist/` output to GitHub Pages.

### Vercel

Import the repository into Vercel and use the default settings:

- Build command: `npm run build`
- Output directory: `dist`
