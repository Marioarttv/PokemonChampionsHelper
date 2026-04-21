# Battle Engine Audit Prompt For GPT-5.4 Pro

Copy the prompt below into ChatGPT and upload the listed files with it. The prompt is designed so GPT-5.4 Pro reviews the real code first, then uses the written context here to avoid missing important project assumptions.

---

## Prompt To Paste

```text
I want you to perform a deep technical audit of a client-side TypeScript doubles battle engine inside a React/Vite project called "Pokemon Champions Helper".

Important instruction: treat the uploaded code as the source of truth. Use the written context below as a guide, not as a substitute for reading the actual files. If the docs or my summary disagree with the code, trust the code and call out the mismatch explicitly.

Your job:
1. Build a precise mental model of how the current battle engine works end to end.
2. Identify correctness gaps, architecture issues, data-model limitations, search/evaluation weaknesses, and hidden-information problems.
3. Separate current behavior from intended behavior.
4. Recommend concrete improvements in priority order, with enough detail that an engineer could implement them.

I do not want a generic simulator wishlist. I want an audit grounded in this codebase.

Files I am uploading in priority order:
- `docs/battle-engine.md`
- `README.md`
- `src/lib/engine/types.ts`
- `src/lib/engine/core.ts`
- `src/lib/engine/evaluate.ts`
- `src/lib/engine/search.ts`
- `src/lib/teamPreview.ts`
- `src/lib/damage.ts`
- `src/lib/damageAbilities.ts`
- `src/lib/damageItems.ts`
- `src/lib/battleData.ts`
- `src/lib/pokemonDb.ts`
- `src/lib/opponentMovePresets.ts`
- `src/lib/savedTeams.ts`
- `src/lib/speciesMovesets.ts`
- `src/App.tsx`
- `scripts/generate-pokemon-db.mjs`

If you think another uploaded file is relevant after reading these, say so, but do not assume missing behavior without checking the code first.

Project context:
- The app is fully client-side.
- It uses local generated data instead of runtime API calls for species, moves, abilities, and items.
- The battle engine is tactical and approximate, not cartridge-accurate.
- The main engine is under `src/lib/engine/`.
- `src/lib/teamPreview.ts` is an adjacent solver that reuses the engine for bring-pick recommendations; treat it as related but not the core turn engine.
- `src/App.tsx` still contains important adapter logic that shapes the engine input and therefore materially affects engine behavior.
- There does not appear to be an automated test suite for the engine right now.
- Local verification performed on my side: `npm run build` succeeds.

Please use this review structure:

Section 1: Current architecture
- Explain the engine modules and their responsibilities.
- Explain how data flows from UI state into the engine.
- Explain how battle data, presets, saved movesets, abilities, and items affect the engine.

Section 2: End-to-end execution flow
- Walk through what happens from board-state editing in the UI to the final recommendation shown to the user.
- Cover state construction, action generation, joint-plan generation, turn resolution, state evaluation, and adversarial search.

Section 3: Exact mechanic coverage today
- List what is actually modeled.
- Separate:
  - state tracked
  - actions generated
  - turn-order rules
  - damage modifiers
  - support/status mechanics
  - hidden-information handling
  - search/evaluation behavior
- Be explicit about what is only approximate.

Section 4: Gaps, bugs, and mismatches
- Find concrete issues in the current implementation.
- Distinguish:
  - likely bugs
  - intentional simplifications
  - accidental inconsistencies between docs/UI copy and code
  - structural design limitations

Section 5: Improvement roadmap
- Give me a prioritized roadmap.
- For each item include:
  - why it matters
  - scope size
  - implementation direction
  - likely risks/tradeoffs

Section 6: Recommended refactor shape
- Suggest how to reduce coupling with `src/App.tsx`.
- Suggest how to make the engine easier to test and evolve.
- Suggest how to represent hidden information, move fidelity, and future deeper search without turning the project into an unmaintainable full simulator immediately.

Section 7: Validation strategy
- Propose a practical test plan for this codebase:
  - unit tests
  - fixture tests
  - golden turn-resolution tests
  - search/regression tests
  - UI integration smoke tests

Constraints and context you should keep in mind while auditing:
- This project appears to value fast, explainable recommendations over full cartridge fidelity.
- The current engine is doubles-focused.
- The engine uses a handcrafted evaluation function, not learned evaluation.
- Search is shallow and bounded for UI responsiveness.
- Hidden information is only partially modeled.

My current understanding of the engine, which you should verify against code:

1. Canonical battle state
- `src/lib/engine/types.ts` defines:
  - sides: `ally` and `enemy`
  - combatants with HP, max HP, turns active, ability/item ids, generic stages, status, volatile states, known moves, last move, protection/flinch/switch flags
  - side state with active ids, bench ids, Tailwind/screens/Safeguard/Quick Guard/Wide Guard/redirection/Ally Switch
  - field state with weather, terrain, Trick Room, and turn counter
- The stage model is intentionally compressed to `attack`, `defense`, and `speed`, rather than separate physical/special stats.

2. Engine input construction
- `createBattleState(...)` in `src/lib/engine/core.ts` builds a canonical state from `BattleStateMemberInput[]` for ally and enemy.
- `App.tsx` constructs those inputs from:
  - the user team
  - enemy scouting slots
  - custom saved movesets
  - imported preset movesets
  - inferred enemy utility moves
  - per-slot battle simulator runtime state (HP %, stages, status, sleep turns)
- Allies are treated as fully known.
- Enemies can be custom-known, preset-partial, or effectively unknown, but I need you to check whether the `knowledge` field itself actually influences engine behavior.

3. Move source layering
- Moves appear to come from several layers:
  - user saved attacks
  - preset move names from imported meta sets
  - inferred utility moves injected by the UI for hidden-information planning
  - universally assumed `Protect` when `universalProtect` is enabled
- The engine seems to normalize these into `BattleMoveOption`.
- Special move behavior is manually encoded in `SPECIAL_MOVE_DEFINITIONS` inside `src/lib/engine/core.ts`.

4. Damage model
- `src/lib/damage.ts` is a rough level-50 damage model based on base stats, simplified stage multipliers, STAB, type effectiveness, spread penalty, weather, terrain, selected abilities/items, and Helping Hand.
- `src/lib/damageAbilities.ts` and `src/lib/damageItems.ts` encode a limited curated subset of supported damage-relevant abilities/items.
- The engine then adds some extra battle-layer multipliers on top, such as screens and burn attack halving.
- This is an approximation, not a full competitive damage engine with EVs/IVs/natures/full item support/full ability support.

5. Action generation
- The engine generates actions per active Pokemon and then combines them into joint side plans.
- It appears to support:
  - damaging moves
  - self/field/ally-targeted support moves
  - switches
  - pass
- It also filters based on status/state such as Taunt, Encore, Disable, sleep.
- Actions are heuristically scored before search, and only the top few per actor and per side are kept.

6. Turn resolution
- `resolveTurn(...)` clones the state, executes switches first, sorts moves by priority/speed/Trick Room, and resolves them.
- It handles at least some version of:
  - Protect-like moves
  - guards
  - Tailwind
  - Trick Room
  - Safeguard
  - screens
  - redirection
  - Ally Switch
  - Helping Hand
  - Taunt / Encore / Disable
  - status application
  - stage changes
  - Life Orb recoil
  - replacement after fainting
- Misses and secondaries are not probabilistic trees; they are handled through coarse branch modes.

7. Search
- `recommendBestPlan(...)` in `src/lib/engine/search.ts` appears to run a shallow adversarial search:
  - generate ally joint plans
  - generate enemy joint plans
  - score each ally plan against the enemy reply that minimizes ally outcome
  - recurse for a small number of turns
- It uses fixed branch sets:
  - `full`
  - `expectedOnly`
  - `expectedPlusRisk`
- Each branch combines a damage mode with coarse hit/proc assumptions.
- The result shown in the UI is worst-case oriented, not greedy best-case damage.

8. Evaluation
- `src/lib/engine/evaluate.ts` appears to score:
  - alive count
  - HP totals / HP percent
  - offensive pressure from best visible hits
  - speed control
  - statuses
  - side conditions
- It is handcrafted and positionally shallow.

9. UI integration
- In `src/App.tsx`, the important adapter pieces seem to be:
  - `getStoredOrPresetSavedAttacks(...)`
  - `getInferredEngineMoveNames(...)`
  - the `battleEngineAllyMembers` / `battleEngineEnemyMembers` builders
  - `runBattleEngineAnalysis(...)`
  - the battle simulator state editors that feed HP/stages/status into the engine
- This means a meaningful portion of engine behavior currently depends on app-side shaping logic rather than purely on `src/lib/engine/*`.

10. Team preview side-system
- `src/lib/teamPreview.ts` appears to reuse the engine in a higher-level bring-pick solver.
- It builds coarse structural scores for four/lead combinations, then verifies tactical cells by calling `recommendBestPlan(...)` on selected lead matchups.
- Please treat this as a downstream consumer and tell me whether the current engine abstraction is good enough for this reuse.

Specific issues I want you to confirm or refute directly from code:

1. Fake Out support may be inconsistent.
- The docs/UI copy say Fake Out is supported.
- I want you to verify whether `SPECIAL_MOVE_DEFINITIONS` actually classifies `Fake Out` as `fakeOut`.
- If not, check whether the dedicated Fake Out logic in action scoring and turn resolution is effectively unreachable.

2. `knowledge` may be dead metadata.
- `BattleStateMemberInput` includes `knowledge`.
- I want you to verify whether the engine ever branches on that value, or whether hidden information is actually handled only through move injection and source labels.

3. The stage model may be too compressed.
- I want you to verify how the engine treats special attack/special defense changes.
- In particular, check moves like `Nasty Plot`, `Calm Mind`, `Snarl`, and similar mappings in `SPECIAL_MOVE_DEFINITIONS`.

4. Universal Protect may duplicate protect-like options.
- Check whether `universalProtect` adds `Protect` even if a Pokemon already has `Detect`, `King's Shield`, or another protect clone, since the dedupe looks name-based.

5. Speed modeling may be incomplete.
- Verify whether turn order only uses base speed, generic speed stage, Tailwind, paralysis, and Trick Room.
- Check whether abilities/items that modify speed are ignored by the engine even if they exist elsewhere in the app.

6. Status immunities may be under-modeled.
- Verify whether `applyStatusCondition(...)` checks type, terrain, or ability immunities beyond Safeguard.

7. Search option plumbing may be incomplete.
- `SearchOptions` appears to include `damageModeWeights`.
- Verify whether that option is actually used anywhere.

8. Some spread/target rules may be simplified incorrectly.
- Check how `allAdjacent`, ally-hitting spread moves, Bulldoze-style collateral, and redirection exceptions are handled.

9. There may be doc/code mismatches.
- Compare `docs/battle-engine.md` and README claims against implementation details, not just broad intent.

10. Validation gap
- Please confirm whether there are effectively no engine tests right now and discuss the risk that creates.

What I want in the final answer:

1. A precise explanation of how the engine works today.
2. A list of the top 10 most important issues, ordered by impact.
3. A distinction between:
  - "bugs to fix now"
  - "modeling limitations to accept for now"
  - "bigger architectural upgrades"
4. A concrete refactor roadmap in phases:
  - phase 1: low-risk correctness fixes
  - phase 2: engine/data-model cleanup
  - phase 3: stronger hidden-information and search improvements
5. A recommended target architecture for keeping this fast and explainable.
6. A test strategy with example fixture ideas.

Please be specific. Reference exact files, functions, and code patterns. Do not just say "improve abstraction" or "add more mechanics". Tell me exactly what the code is doing now and what the best next step is.
```

---

## Suggested Upload Notes

When you paste the prompt above into ChatGPT, also upload these files if file upload is available:

- `docs/battle-engine.md`
- `src/lib/engine/types.ts`
- `src/lib/engine/core.ts`
- `src/lib/engine/evaluate.ts`
- `src/lib/engine/search.ts`
- `src/App.tsx`
- `src/lib/teamPreview.ts`
- `src/lib/damage.ts`
- `src/lib/damageAbilities.ts`
- `src/lib/damageItems.ts`
- `src/lib/opponentMovePresets.ts`

If you want to keep the upload set smaller, the minimum useful bundle is:

- `src/lib/engine/types.ts`
- `src/lib/engine/core.ts`
- `src/lib/engine/evaluate.ts`
- `src/lib/engine/search.ts`
- `src/App.tsx`
- `src/lib/damage.ts`
- `src/lib/opponentMovePresets.ts`

