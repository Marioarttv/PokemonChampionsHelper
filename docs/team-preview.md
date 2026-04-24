# Team Preview

The VGC team-preview picker is a scenario-first recommender. It is designed to return explainable bring-four and lead-pair advice without hiding when the model had to approximate.

## Scenario Pass

For a normal six-Pokemon team, the preview model enumerates:

- all 15 legal ally four-Pokemon brings
- all 15 legal enemy four-Pokemon brings
- all six legal lead pairs inside each four

This complete coarse pass happens before tactical pruning. Enemy bring probabilities are used for expected-value scoring, but low-probability enemy fours are retained for robust floor and regret checks.

The returned diagnostics include `scenarioMatrix`:

- `allyFourCount`
- `enemyFourCount`
- `allyLeadPairCount`
- `enemyLeadPairCount`
- `scenarioCount`
- `retainedEnemyFourCount`
- explicit scoring formula text

## Scoring Dimensions

The model scores each viable bring/lead with visible dimensions:

- `expectedScore`: probability-weighted matchup value against the enemy bring distribution
- `robustFloor`: worst plausible matchup value retained for robust scoring
- `conditionalRegret`: how much this bring loses relative to the best available bring into a specific enemy four
- `mustAnswerCoverage`: whether required threats are answered by the four
- `answerOverloadPenalty`: penalty when one ally is the only answer to several high-impact threats
- `leadStability`: how the lead performs into likely enemy lead pairs
- `benchValue`: whether the back two add endgame, pivot, defensive, or cleanup value
- `unsupportedPenalty`: penalty/diagnostic pressure for approximated mechanics

Hard team-preview constraints are not supposed to be erased by shallow tactical rollouts. A four that fails must-answer coverage should remain risky even if its lead looks good in a one-turn search.

## Objective Modes

`robust`

- prioritizes must-answer coverage and `robustFloor`
- uses expected score only after the bring is not exposing major threats
- intended for safer tournament-style selection

`likely`

- prioritizes `expectedScore`
- can choose a higher-EV bring
- still reports catastrophic low-probability regret notes

`hybrid`

- combines expected score, robust floor, and conditional regret
- intended as the default compromise when no single mode is clearly appropriate

The formula is surfaced in diagnostics so UI explanations can show why the selected four won.

## Info Modes

`openTeamSheet`

- supplied opponent species/form, ability, held item, moves, and Tera Type are treated as known
- no alternate moves/items/abilities are invented from presets when the sheet supplies them
- EVs, nature, speed tier, and strategic intent can still remain uncertain

`closedSheet`

- prefers weighted complete `SetHypothesis` entries
- a hypothesis can include moves, item, ability, Tera Type, speed bucket, role tags, source, and probability
- complete set hypotheses avoid impossible independent move combinations

`custom`

- preserves older partial-data behavior
- if complete hypotheses are missing, the engine can fall back to independent move candidates but marks that as approximate

## Diagnostics

Recommendations can include:

- `confidence`: `high`, `medium`, or `low`
- `confidenceReasons`
- `unsupportedMechanics`
- `mechanicsSupportReport`
- `enemyBringDistribution`, including all 15 enemy fours for six-Pokemon teams
- `omittedSlotExplanations` for each benched ally
- `leadRiskNotes`
- `lowProbabilityHighRegretNotes`
- tactical refinement metadata such as searched scenario count, search depth, objective, top line, and tactical risk notes

The team picker should never present a fallback first-four bring as a confident solver result. Bring-selection fallbacks are marked with `fallbackUsed`, `fallbackReason`, `confidence`, and warnings.

## Tactical Refinement

After the full coarse pass, only high-impact scenarios are searched tactically. High-impact scenarios include:

- high enemy probability
- high regret
- must-answer threats
- unstable lead matchups
- important approximated mechanics

Tactical search may reorder otherwise viable fours, but it should not hide failed coverage or unsupported mechanics.

## Known Limitations

This is not cartridge-accurate simulation. It is an explainable planner built on an approximate tactical engine.

- enemy bring probabilities are heuristic
- action priors are heuristic
- complete closed-sheet set hypotheses depend on supplied presets/user data
- speed ties are annotated as 50/50 dependencies but currently resolved as one representative order in the turn trace
- many move-specific edge cases remain approximate or unsupported
- no claim of cartridge accuracy should be made until exact simulator transitions and differential tests exist
