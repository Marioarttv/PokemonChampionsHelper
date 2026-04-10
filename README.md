# Pokemon Champions Helper

A deployable React + TypeScript app for competitive Pokemon prep.

The first implemented feature is a defensive type calculator inspired by solo-type tools, but with optional dual-type support so the same engine can power later features like:

- team matchup overviews
- offensive coverage summaries
- damage calculation flows backed by external Pokemon data APIs

## Stack

- Vite
- React
- TypeScript

This stack is a good fit because it works well on both Vercel and GitHub Pages, and it keeps the calculator logic easy to reuse as the app grows.

## Development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## GitHub Pages

The repository includes a GitHub Actions workflow at `.github/workflows/deploy.yml` that builds the app and deploys the `dist/` output to GitHub Pages.

## Vercel

Import the repository into Vercel and use the default settings:

- Build command: `npm run build`
- Output directory: `dist`

## Next implementation targets

1. Add Pokemon, move, and ability data ingestion from a reliable API or curated dataset.
2. Model six-Pokemon teams and aggregate defensive and offensive coverage.
3. Add a damage calculator with battle format assumptions and move modifiers.
