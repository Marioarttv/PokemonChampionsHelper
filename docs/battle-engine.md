# Battle Engine Progress

## Overview

The project has moved beyond a pure calculator. It now includes an in-app doubles battle engine that can:

- construct a real board state from your team, the enemy team, and selected active leads
- generate legal actions for both sides
- simulate a simplified turn
- search multiple candidate lines
- recommend the ally line that looks best against the enemy's strongest modeled response

This is intentionally a tactical engine first. The current goal is to produce useful, explainable recommendations inside the app before chasing full cartridge accuracy.

## Current Architecture

The engine lives in `src/lib/engine/`.

- `types.ts`
  Defines the canonical battle state, actions, move metadata, side conditions, volatile statuses, and search result types.
- `core.ts`
  Handles state construction, move normalization, action generation, turn resolution, and battle utility helpers.
- `evaluate.ts`
  Scores non-terminal states with handcrafted heuristics.
- `search.ts`
  Runs the shallow adversarial search and produces the recommendation shown in the UI.

The UI integration currently happens in `src/App.tsx`, where selected allies and enemies are converted into engine inputs and fed to the recommendation panel.

## What Is Implemented

### 1. Canonical Battle State

The engine tracks:

- active and bench Pokemon for each side
- current HP and max HP
- attack, defense, and speed stages
- status conditions: burn, paralysis, sleep
- volatile state such as Protect, flinch, Helping Hand, Taunt, Encore, and Disable
- side conditions such as Tailwind, Reflect, Light Screen, Aurora Veil, Safeguard, Quick Guard, Wide Guard, redirection, and Ally Switch pairing
- field conditions such as weather, terrain, and Trick Room

### 2. Legal Action Generation

For each active Pokemon, the engine can currently generate:

- damaging moves with targets
- spread attacks
- ally-targeted support actions
- self-targeted support actions
- field-wide support actions
- switching into bench slots
- pass, when no better legal action exists

It also respects some action restrictions already modeled in state:

- Taunt blocks non-damaging moves
- Encore locks a Pokemon into a previous move
- Disable blocks the disabled move
- sleep limits action choice

### 3. Turn Resolution

The turn resolver currently models:

- switches before normal move execution
- move order using priority, speed, Tailwind, and Trick Room
- Protect-like blocking
- Fake Out first-turn behavior
- Helping Hand damage support
- screens and Aurora Veil damage reduction
- Quick Guard and Wide Guard
- Safeguard blocking new status
- redirection through Follow Me / Rage Powder
- Ally Switch target swapping
- Encore and Disable application
- burn/paralysis/sleep state handling
- basic recoil from Life Orb
- automatic replacement from the bench after a faint

### 4. Search

The search is still shallow, but it is no longer deterministic in just one line.

It now evaluates multiple outcome branches per turn:

- conservative branch
  Lower damage expectation, stricter hit assumptions, no secondary-effect upside
- expected branch
  Normal average-damage branch with expected hit/proc assumptions
- optimistic branch
  Higher damage expectation, more favorable hit assumptions, secondary effects enabled

For each ally plan, the engine checks enemy responses and keeps the score from the enemy reply that hurts the ally plan the most. The recommendation shown in the UI is therefore worst-case oriented rather than greedy.

### 5. Hidden Information Handling

Enemy move knowledge is now split conceptually into:

- known
  Custom user-entered moves
- partial
  Imported preset moves
- unknown
  No reliable move data

When the enemy set is partial or unknown, the engine can add a few inferred utility moves such as Protect, Taunt, Feint, Safeguard, Ally Switch, Disable, Encore, Icy Wind, Electroweb, or Trick Room based on rough heuristics. This is still lightweight, but it is better than pretending an unknown Pokemon has no support options.

## Supported Move Families

The engine currently has explicit or semi-explicit support for:

- direct damage moves
- Fake Out
- Protect-like moves
- Tailwind
- Trick Room
- Safeguard
- Ally Switch
- Feint
- Encore
- Disable
- Helping Hand
- Follow Me / Rage Powder
- Reflect / Light Screen / Aurora Veil
- Quick Guard / Wide Guard
- Taunt
- status moves such as Thunder Wave, Will-O-Wisp, Spore, Sleep Powder, Hypnosis, Glare, and Stun Spore
- speed-control / debuff moves such as Icy Wind, Electroweb, Bulldoze, Rock Tomb, Scary Face, Cotton Spore, Snarl, Breaking Swipe, and Chilling Water
- common setup / recovery moves such as Swords Dance, Nasty Plot, Calm Mind, Dragon Dance, Agility, Iron Defense, Bulk Up, Recover, Roost, Slack Off, Soft-Boiled, Moonlight, Morning Sun, Synthesis, and Life Dew

## What Is Still Simplified

The engine is not yet a full competitive simulator. Important limitations still include:

- no exact accuracy math, evasion, or full probability trees
- secondary effects are coarse branches, not exact per-move distributions
- no full status-resolution rules for every edge case
- no complete support for redirection immunity, terrain immunity, sound/powder edge cases, and similar move exceptions
- no exact cartridge handling for repeated Protect odds, priority-blocking subtleties, or every special-case move interaction
- no complete hidden-information belief model
- no deep multi-turn planning with transposition tables or advanced pruning
- no exact move PP, choice lock, item consumption, hazard layers, or weather chip loops yet

## Near-Term Goals

The next milestones are:

1. Improve probability modeling.
   Move from coarse conservative/expected/optimistic turn branches toward more explicit branching for hit chance, misses, and important secondaries.

2. Broaden move support.
   Add more high-impact doubles support moves and edge-case interactions, especially around protection-breaking, disruption, redirection exceptions, and field control.

3. Improve hidden-information reasoning.
   Replace the current inferred utility-move heuristics with better enemy archetype modeling, preset weighting, and uncertainty-aware search.

4. Strengthen the evaluator.
   Make the heuristic more position-aware so it better values tempo, board safety, support sequencing, and future switch quality.

5. Refactor UI integration.
   Move more battle-engine-specific shaping logic out of `src/App.tsx` into dedicated engine adapters or view-model helpers.

## Longer-Term Goals

Longer-term, the project can evolve in one of two directions:

- a stronger tactical recommendation engine that remains approximate but fast and explainable
- a much more faithful simulator with richer rules, deeper search, and eventually optional learned components for evaluation or opponent modeling

The current direction favors the first path first, then uses that stronger foundation to decide how much simulator fidelity is worth the added complexity.
