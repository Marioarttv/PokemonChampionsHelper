# Battle Engine

## Overview

The battle engine in `src/lib/engine/` is a client-side, TypeScript-first VGC tactical searcher. It is still intentionally approximate rather than cartridge-faithful, but it now has three operating goals:

- preserve the previous shallow worst-case recommendation path as a robust baseline
- add a selective deep mode that can reach depth 3 in lower-branch tactical positions
- explain what it searched, what it assumed about hidden information, and why it chose the line it did

The engine remains synchronous at its core for testability and determinism. The UI runs the heavier battle-engine search in a web worker so deeper searches do not block the browser thread.

## Module Layout

- `core.ts`
  Builds battle states, generates legal actions, resolves turns, and scores action heuristics.
- `beliefs.ts`
  Central belief helper for known plus candidate move modeling.
- `evaluate.ts`
  Belief-aware positional evaluator.
- `search.ts`
  Iterative deepening, selective search, pruning, PV tracking, and diagnostics.
- `hash.ts`
  Lightweight canonical state key for search caching.
- `transposition.ts`
  Exact-value transposition table used by iterative deepening.
- `../sim/`
  Authoritative simulator scaffold: seeded RNG, public/private battle state, replay types, and adapter boundary.
- `knowledge.ts`
  Produces enemy move candidates and normalized weights from preset/inferred knowledge.
- `adapters/fromUiState.ts`
  Converts UI state into engine members and enemy knowledge inputs.
- `signature.ts`
  Builds stable UI signatures for stale-result detection.
- `benchmark.ts`
  Small benchmark harness for comparing search modes over fixed tactical fixtures.

## Search Modes

### Fast

- tuned for quick UI feedback
- default depth target: 1
- smaller node/time budgets
- cheaper branch model by default

### Balanced

- default general-purpose mode
- default depth target: 2
- preserves the previous robust maximin semantics
- adds iterative deepening, PV tracking, pruning, and transposition caching

### Deep

- default depth target: 3
- larger node/time budgets
- staged search:
  a cheap ordering pass narrows the ally plans
  then the top `K` ally plans are re-searched with the full branch model
- selective extensions can push one more turn in tactical positions such as KO races or expiring speed control
- intended to run from the worker-backed UI path

## Objective Modes

### Robust

- original worst-case style objective
- for each ally line, the engine keeps the enemy response that minimizes the ally outcome
- alpha-style cutoffs preserve this semantics:
  if an ally line is already worse than the current best robust line, the remaining enemy replies for that ally line can be skipped

### Likely

- expected-value objective over enemy policy weights
- move-set membership and current-board action priors are handled as separate signals
- plan likelihood weights now combine move membership confidence, action priors derived from legal-action heuristics, and joint-plan heuristic score
- still uses the same legal-action generation and branch model

### Hybrid

- blends robust and likely:
  `hybrid = lambda * robust + (1 - lambda) * likely`
- current default lambda is conservative, biasing toward safety while still rewarding likely tactical lines

## Search Foundation

The search now uses:

- explicit search budgets:
  `maxDepth`, `maxNodes`, `maxMs`, `searchMode`, `objectiveMode`
- iterative deepening:
  the engine searches depth `1..N` and always returns the best fully completed iteration
- principal variation tracking:
  recommendation includes the chosen ally line, predicted enemy reply, and deeper continuation
- transposition caching:
  exact scores are cached by a compact state key plus search context
- move ordering:
  prior PV, heuristic action scores, and lightweight history reuse improve cutoff quality

TT safety note:

- the current key is only sound while hidden-information beliefs stay static during a search call
- if future search work mutates beliefs in-tree, that belief state must also enter the TT key

## Branch Model Staging

The existing turn-branch support remains intact:

- `expectedOnly`
- `expectedPlusRisk`
- `full`

Deep mode stages the search:

1. use a cheaper ordering model to score ally plans quickly
2. keep only the strongest few ally plans
3. re-search those plans with the full branch model

The staging pass now computes enemy plans once per state instead of regenerating them per ally candidate.

## Hidden Information and Beliefs

Enemy move handling is now belief-aware.

`getBelievedMoves(combatant, options)`:

- treats known moves as certainty
- includes candidate moves with normalized weights
- supports top-`N` truncation
- returns move-on-set belief weights and confidence summaries usable by both evaluation and diagnostics

This belief helper is now used in:

- pressure scoring
- incoming threat estimation
- protect scoring
- switch scoring
- Helping Hand scoring
- screen / guard / safeguard scoring
- taunt / disable / encore support heuristics
- evaluator pressure, bench-quality, and tempo terms

For fully known custom enemy sets, the behavior remains deterministic because there are no candidate moves to blend in.

Search-specific note:

- robust mode semantics are unchanged
- likely/hybrid mode now distinguish:
  - move membership confidence:
    "is this move plausibly on the set?"
  - action prior:
    "how likely is this move to be clicked on this board right now?"

## Evaluator

The evaluator still uses a handcrafted positional structure, but it now values more than raw HP:

- alive-count and HP advantage
- immediate KO pressure
- speed-control ownership and expiry timing
- side-positioning value:
  redirection, screens, guards, Ally Switch state
- tempo:
  Fake Out, priority, Protect pressure, Helping Hand/redirection threat
- bench quality and switch safety
- trap states:
  Taunt, Encore, Disable, Protect loops
- endgame conversion pressure

The feature magnitudes were kept intentionally moderate so no single heuristic term dominates by accident.

## Selective Extensions

Deep mode can extend one more turn when explicit tactical triggers fire. The logic is intentionally simple and debuggable.

Current extension triggers:

- imminent KO race
- Tailwind / Trick Room about to expire
- lock/trap pressure:
  Encore, Disable, Protect states
- positioning tricks:
  redirection, Ally Switch
- low-count endgames

Each extension reason is recorded in the PV diagnostics instead of being hidden.

## Diagnostics

Each recommendation now exposes:

- `elapsedMs`
- `depthReached`
- `searchNodes`
- `resolveTurnCalls`
- `generatedJointPlans`
- `planPairEvaluations`
- `ttHits`
- `ttStores`
- `cutoffs`
- `branchModelUsed`
- `objectiveMode`
- `searchMode`
- `enemyBeliefs`
- `pv`

The UI explanation panel surfaces:

- recommended ally line
- predicted enemy reply
- worst-case reply
- 2-3 turn PV
- robust / likely / hybrid scores
- enemy assumption summaries
- search telemetry

## UI Integration

The battle-engine panel now exposes:

- search mode:
  `Fast`, `Balanced`, `Deep`
- objective mode:
  `Robust`, `Likely`, `Hybrid`
- an explanation panel with PV and enemy assumptions

The heavier search path is executed inside `search.worker.ts`. The UI terminates stale workers when the board or search settings change.

## Testing and Benchmarking

Regression coverage in `src/lib/engine/__tests__/core.regression.test.ts` now includes:

- Trick Room setup/deny
- Protect / Fake Out interactions
- Wide Guard against spread pressure
- belief-aware hidden-information denial
- switching under immediate threat
- deterministic deep-mode diagnostics shape

Additional search regression coverage in `src/lib/engine/__tests__/search.regression.test.ts` now includes:

- root states with no legal enemy plan
- likely vs robust objective separation on hidden-information fixtures
- hybrid score bounds
- deep staged candidate filtering
- transposition key/result stability

Benchmarking:

- `src/lib/engine/benchmark.ts` provides a small harness for comparing modes
- `src/lib/engine/__tests__/search.bench.ts` provides a baseline benchmark case
- run with:

```bash
npm run bench:engine
```

## Known Limitations

The engine is stronger than before, but it is still approximate.

Still simplified:

- exact cartridge probability trees are not modeled
- secondaries remain coarse branch policies rather than full distributions
- there is no full hidden-information search over complete moveset combinations
- transposition caching stores exact values only, not alpha/beta bounds
- action likelihoods are heuristic, not learned policies
- repeated Protect success odds, PP, hazards, item micro-rules, and many move-specific edge cases remain simplified
- the evaluator is still handcrafted and local rather than trained

## Recommended Next Steps

1. Improve move fidelity for high-impact VGC mechanics:
   repeated Protect odds, more redirection exceptions, Encore/Disable edge cases, item activation details.
2. Add richer hidden-information modeling:
   moveset-combination sampling, archetype-conditioned beliefs, and better enemy policy weighting.
3. Add bound-aware TT entries and more selective ordering heuristics once current diagnostics stabilize.
4. Expand benchmark fixtures so speed and strength can be compared on a broader tactical suite over time.
