# Pokemon Champions 1.1.4 acquisition findings

These findings come from live, read-only snapshots on Pokemon Champions `1.1.4 (25)` during doubles team selection, turn 0 move selection, and turn 1 move selection. They describe what this client build actually materializes; they are not assumptions made by the simulator.

## Confirmed state

- Both six-Pokemon preview rosters, the local selected four/order, and both active positions
- Species, form, gender, ability, typing, exact local training/base-point values, local item, and all local moves/PP
- Turn number, weather ID/lifespan/elapsed turns, global/side/position/Pokemon effect containers
- Exact local current/max HP, status, stat stages, faint/change flags, move locks, Mega flags, and position changes
- Remote active position, switch/faint state, ability, maximum-HP field, and the server/UI HP ratio

## Confirmed redactions and asymmetric fields

- Remote `MoveSlotData[]` is empty at preview and move selection.
- Remote item ID is `-1`, including after the first turn.
- Remote training/base-point values are zeroed.
- Remote selected four/order is not exposed; active/revealed group indices accumulate as Pokemon enter the field.
- Remote `NowHPValue` does not update with damage and must not be treated as exact current HP. `RawHpRatio` updates and is the authoritative observable HP-bar value. Fainting is independently represented by the faint flag and a zero ratio.
- Local `NowHPValue`, move PP, stat stages, and item-driven move locks do update exactly.
- `TeamSnapshot.pokemon_order` contains indices into the selected-team array, not stable six-Pokemon roster group IDs; it can change when active slots rotate. The exact local bring order is reconstructed by sorting Pokemon with nonnegative `selection_order` and reading their `group_index` values. In the captured private match, raw `[0, 1, 2, 3]` therefore normalized to roster groups `[1, 0, 3, 5]`.
- Electro Shot spent PP and raised Archaludon's Special Attack on the charging turn after rain had expired. Its runtime state then included `{ "md_id": 17, "execute_id": 905 }`, and the move released on the following turn without another PP decrease. The user confirmed that Choice Scarf Basculegion did not use Protect. The engine must preserve this two-turn state instead of inferring an immediate hit from an unchanged HP bar.
- The observed Electro Shot charge marker does not expose the originally selected target: both target fields were zero. Search states created before the charging turn retain that target internally and force it on release; recommendation from a newly attached mid-charge snapshot must fail closed unless target provenance is supplied separately.
- The user confirmed that the charged move released toward Basculegion, but Basculegion's remote HP ratio remained `4398` in the final snapshot. With the remote action order and full outcome log still hidden, the replay records the release without inventing a damage event; this transition remains a named prediction blocker until it can be reproduced with tighter timing evidence.

## Engine consequences

The normal live-state adapter must preserve knowledge quality per field:

- Local HP: exact integer.
- Remote HP: ratio/interval unless an external sanctioned state source supplies an exact value.
- Remote move/item/training data: unknown until supplied by a user-owned scenario, replay fixture, or sanctioned test harness. Placeholder values must never be promoted to facts.
- Local selected-four order: derive from per-Pokemon `selection_order`; never interpret the raw selected-team indices as roster group IDs. If the per-Pokemon evidence is only partial, retain `Unknown` rather than guessing.
- “Perfect knowledge” is a search configuration over a complete scenario input. It is not a claim that the production client leaks the opponent's hidden set or future actions.

The move engine should therefore accept two inputs: the observed device snapshot and an optional scenario overlay. The merge must retain provenance so the UI can distinguish observed, inferred, and assumed values.
