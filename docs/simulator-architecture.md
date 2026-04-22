# Simulator Architecture

## Goal

The project is moving toward a two-layer VGC platform:

1. an authoritative simulator for battle truth
2. a separate planner/search layer for uncertainty, tactics, rollout, and future self-play

The simulator owns exact state transitions. The planner owns hidden-information beliefs.

## Current Layout

- `src/lib/engine/`
  Current approximate tactical engine used by the helper UI and search worker.
- `src/lib/sim/state/`
  Authoritative battle, public, and private state shapes.
- `src/lib/sim/rng/`
  Deterministic seeded RNG with clone/serialize support.
- `src/lib/sim/replay/`
  Machine-readable battle event and replay log types.
- `src/lib/sim/kernel/`
  Authoritative kernel scaffold and named hook/phase surface.
- `src/lib/sim/adapters/`
  Backend boundary between the tactical layer and simulator implementations.

## Adapter Boundary

`BattleSimulatorAdapter` is the migration seam.

Current adapters:

- `ApproximateEngineAdapter`
  Wraps `src/lib/engine/` so the existing UI and search code can keep functioning during migration.
- `AuthoritativeKernelAdapter`
  Wraps the new kernel scaffold.

Long term, the planner should depend on the adapter interface rather than on the approximate engine state model directly.

## Authoritative Kernel Status

Implemented now:

- Gen 9 Doubles/VGC-oriented state containers
- explicit public/private state separation
- deterministic seed handling
- replay/event/patch structures
- named phase and hook vocabulary
- team-preview state creation
- explicit unsupported-mechanic markers for unimplemented turn resolution

Not implemented yet:

- exact move execution
- switch-in timing/effects
- target redirection and legality rewrites
- priority ordering
- damage/status/stat pipelines
- residual ordering
- replacement flow
- replay step inspector UI
- differential validation harness

## Exact vs Approximate

Today:

- `src/lib/engine/` is still the only working turn resolver for the browser helper UI.
- `src/lib/sim/` is architecture and determinism scaffolding, not a full move-accurate resolver yet.

The authoritative path must never silently fake unsupported cartridge logic. Until a mechanic is implemented there, the kernel should emit an explicit unsupported marker.

## Hidden Information

The simulator stores truth:

- actual moves
- actual ability/item state
- actual HP/status/volatile state

The planner stores uncertainty:

- moveset membership beliefs
- current-turn action priors
- sampling/hypothesis logic

This split is required for exact search, rollout, and self-play later.

## Validation Strategy

Planned Node-only validation path:

- spin up overlapping scenarios against Pokemon Showdown
- normalize resulting state/event outputs
- compare HP, statuses, boosts, side conditions, faint order, replacements, and end-of-turn state

This validation harness is not in the repository yet. The architecture is being prepared so it can live separately from the browser-safe runtime.

## Browser and Runtime Strategy

- browser app should keep using a worker-backed simulation/search path
- simulator messages and replay artifacts should stay structured-clone friendly
- Node-only validation code should remain separate from the browser runtime

## AI Integration Direction

The planner should eventually consume simulator adapters for:

- legal choice generation
- deterministic state transitions
- serialization/replay
- public-state extraction
- rollout and PV inspection

Hidden-information reasoning must stay above the simulator so the same authoritative kernel can support exact sandbox play, tactical search, and future self-play data generation.
