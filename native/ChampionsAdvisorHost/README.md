# Champions Advisor Host Bridge

The host bridge copies the latest validated state snapshot from a USB-connected jailbroken iPhone to the Mac. This is the first offload boundary: the acquisition tweak stays small and passive, while simulation and search remain replaceable Mac-side components.

Run the watcher from the repository root:

```sh
npm run device:champions
```

Battle Lab starts and owns the bidirectional advisor bridge automatically after it verifies the phone connection. For headless use without Battle Lab, run the same bridge directly:

```sh
npm run advisor:champions
```

The watcher and Battle Lab both detect the USB device, reuse a healthy SSH tunnel, or start and verify `iproxy` automatically. If the connection drops, the watcher retries with bounded backoff and recreates the tunnel when the phone becomes available again. Battle Lab also restarts its managed watcher after an unexpected exit and stops both owned processes when the local service shuts down.

By default, advisor mode constructs a complete exact sheet from the 389-profile assumption database, reconciles the current snapshot plus match-local revealed moves/PP/targets, and validates the resulting scenario on every state change. A hand-authored sheet remains available as a manual override:

```sh
npm run advisor:champions -- --exact-sheet /absolute/path/to/exact-sheet.json
```

The bridge publishes `native/ChampionsAdvisorHost/captures/recommendation.json` locally and copies it to the app's adjacent `Documents/ChampionsAdvisor/recommendation.json`. During search it sends hash-bound progress documents with active/target depth, root-plan completion, nodes, cache hits, cutoffs, and elapsed time. It polls the phone while the native process runs, cancels work immediately when the board hash changes, and verifies the hash again before publishing the final result. The phone independently rejects any file whose `state_hash` differs from its live snapshot. A supported exact state returns `ready`; an unimplemented mechanic returns `mechanics_blocked` with the specific blocker instead of a misleading recommendation.

The default key path reuses the adjacent Hush_Cracked device key. Override connection settings with `CHAMPIONS_SSH_KEY`, `CHAMPIONS_DEVICE_HOST`, `CHAMPIONS_DEVICE_PORT`, `CHAMPIONS_DEVICE_USER`, `CHAMPIONS_POLL_MS`, or `CHAMPIONS_HEARTBEAT_MS`. The managed watcher emits a health heartbeat every five seconds and all USB SSH/SCP operations have finite deadlines, allowing Battle Lab to mark a silent bridge as recovering. Command-line overrides are also available:

```sh
npm run device:champions -- --once --key /absolute/path/to/key --port 2222 --output /absolute/path/to/latest.json
npm run advisor:champions -- --once --scenario /absolute/path/to/scenario.json
npm run advisor:champions -- --depth 3 --nodes 100000 --time-ms 5000
```

Validated snapshots are atomically published at `native/ChampionsAdvisorHost/captures/latest.json`. Generated captures are ignored by Git because they are runtime artifacts and may describe a real battle.

## Live Battle Lab

Build and start the browser UI plus its local Mac engine service:

```sh
npm run battle-lab:champions
```

The service listens only on `127.0.0.1:4174` by default. Open `http://127.0.0.1:4174`, choose **Live Battle Lab**, and use the replay rail to inspect every captured state. The page distinguishes exact local values, remote HP-bar observations, and fields hidden by the game.

Battle Lab checks the iPhone connection when the page opens. It then starts continuous phone-to-Mac analysis and overlay publication automatically. **Refresh from USB** detects the USB device, reuses a healthy SSH tunnel or starts `iproxy` automatically, verifies key-based access, and then performs one read-only snapshot pull. The connection card and capture strip report the current Mac service, iPhone link, battle-state stage, and overlay-sync state (`starting`, `running`, or `recovering`). Failures include a specific next step instead of raw shell output. The standalone watcher uses the same automatic recovery behavior.

Set `CHAMPIONS_AUTO_ADVISOR=0` before starting Battle Lab only when another process deliberately owns the continuous watcher.

Override automatic tunnel discovery with `CHAMPIONS_IPROXY_BIN` or `CHAMPIONS_IDEVICE_ID_BIN` when those tools are outside the service's `PATH`.

The calculation panel now uses `engine/data/opponent-assumptions-v1.json` automatically. Its 389 legal-species profiles fill opponent selected-four order, moves and PP, held items, nature and training points, and exact HP. Matching local sets are reused when the preview contains the same species. On every calculation, revealed order slots, HP-bar state, and any item, move, nature, or training data exposed by the phone replace the corresponding assumption before the native engine runs. The UI reports database coverage and the number of live overrides.

The strict exact-team-sheet JSON defined by `engine/exact-scenario-sheet.schema.json` remains available as an optional manual override. Leaving the editor empty selects the automatic database. Snapshot IDs come from a server-owned registry; browser requests cannot submit arbitrary filesystem paths or shell arguments. Depth, node, time, and request-body limits are bounded by the local service. Calculations run as cancellable background jobs: the UI polls real native progress and discards a result unless both the job and returned recommendation still match the displayed snapshot hash.

Regenerate the versioned assumption database from the current meta presets and Champions learnsets with:

```sh
npm run generate:perfect-knowledge-db
```

After an existing build, restart only the service with:

```sh
npm run serve:battle-lab:champions
```

## Native engine boundary

The Rust crate is the ingestion and simulation boundary. It independently checks the source build, Unity framework identity, semantic-state hash, collection limits, and opponent-observability totals before device data can reach the engine:

```sh
npm run engine:champions -- validate native/ChampionsAdvisorHost/captures/latest.json
```

The normalized state keeps `observed` and `scenario_assumption` provenance. The native CLI remains strict and refuses to invent hidden fields itself. Battle Lab satisfies that contract by supplying an explicit, versioned assumption sheet assembled on the Mac. These values are assumptions—not facts—and are replaced whenever richer phone state becomes available.

The live field-availability and asymmetric HP findings are documented in `acquisition-findings-1.1.4.md`. Those rules are part of the input contract: redacted opponent placeholders are not silently converted into exact facts.

### Scenario overlays and legal actions

A scenario is JSON with optional team and Pokemon entries. Omitted optional fields remain unknown:

```json
{
  "teams": [
    { "team_index": 0, "pokemon_order": [2, 0, 3, 1] }
  ],
  "pokemon": [
    {
      "key": { "team_index": 0, "group_index": 2 },
      "species_id": "pelipper",
      "exact_hp": { "current": 167, "maximum": 167 },
      "item_md_id": 275,
      "ability_md_id": 2,
      "training_points": {
        "hp": 32,
        "attack": 0,
        "defense": 0,
        "special_attack": 32,
        "special_defense": 0,
        "speed": 2
      },
      "nature_id": "modest",
      "moves": [
        { "md_id": 542, "slot_index": 0, "current_pp": 12, "max_pp": 12 }
      ]
    }
  ]
}
```

Use `"item_md_id": 0` to state explicitly that a Pokemon holds no item; omitting the field means unknown.

### Exact-sheet exporter

`ScenarioOverlay` is the engine-facing numeric format. The exact-sheet exporter provides the human/data-tool-facing boundary and resolves stable mechanics IDs into those numbers:

```sh
npm run --silent scenario:champions -- \
  native/ChampionsAdvisorHost/captures/latest.json \
  /absolute/path/to/exact-sheet.json \
  > native/ChampionsAdvisorHost/captures/scenario.generated.json
```

The complete machine-readable contract is `engine/exact-scenario-sheet.schema.json`. Each team must list every roster group present in the snapshot and its current selected order. Each Pokemon must provide its roster `group_index`, exact current species/form ID, current item ID (`"none"` for no item), current ability ID, nature ID, all six Champions training-point values, exact current HP, and every move with current/max PP. IDs are the alphanumeric IDs from the checksummed mechanics pack, such as `pelipper`, `focussash`, `drizzle`, `modest`, and `hurricane`.

The exporter rejects unknown or duplicate IDs, invalid training totals, impossible HP/PP, roster mismatches, and any disagreement with fields already observed on the phone. After those checks, it immediately normalizes and materializes the result. Its output only fills missing knowledge; richer observed runtime fields remain authoritative.

Generate all legal doubles joint plans for a side, or require a fully exact simulation state:

```sh
npm run engine:champions -- actions native/ChampionsAdvisorHost/captures/latest.json 1 /path/to/scenario.json
npm run engine:champions -- materialize native/ChampionsAdvisorHost/captures/latest.json /path/to/scenario.json
npm run engine:champions -- recommend native/ChampionsAdvisorHost/captures/latest.json 0 1 /path/to/scenario.json 4 250000 1000
```

Action generation covers move targets, PP and disabled-move locks, Struggle, ordinary and forced switches, automatic turns, Mega choice variants, and the rule that both active slots cannot switch to the same replacement or Mega evolve together. Turn ordering represents speed ties as probability branches instead of resolving them with a hidden arbitrary sort.

`recommend` connects exact materialization to iterative-deepening simultaneous-choice maximin search. It returns the best plan, worst-case opposing reply, and a multi-turn principal variation. Each principal-variation step labels its representative chance probability; the evaluated score remains the exact probability-weighted expectation across every retained accuracy/damage branch. State-aware damage/KO ordering improves maximin cutoffs, structural state hashing avoids JSON serialization in hot paths, and `CHAMPIONS_PROGRESS_JSON=1` emits periodic machine-readable progress without mixing it into final stdout.

The current battle domain is intentionally strict. It covers direct and spread damage with Champions rounding, critical hits, accuracy/damage/secondary branches, Mega transformation, Protect/Wide Guard chains, Tailwind creation and expiry, pivots and forced replacements (including unfillable doubles slots), Choice locks, Focus Sash, berries, Leftovers, Life Orb once per spread move, weather, key speed abilities, Stamina/Defiant/Rough Skin/Supreme Overlord, Sucker Punch, Electro Shot charge/release, Last Respects, recoil, retargeting, and fainted-action skipping. Simulator-created Electro Shot states retain the selected release target; a mid-charge device snapshot whose runtime marker omits it still fails closed. Unknown status, Substitute, field effects, residual weather, items, abilities, or callbacks stop with a named error instead of being silently approximated.

## Replay validation

Replay fixtures turn captured before/after snapshots into regression tests. Every transition validates the snapshot hashes and source identity, checks the expected turn delta, verifies structured action evidence, computes a semantic state diff, and checks the fixture's required observations. The diff follows the acquisition contract: local HP is exact, remote HP uses only the HP-bar ratio, hidden remote items remain `unknown` until revealed, and local PP deltas are validated against the selected move.

Run the checked-in private-match fixture:

```sh
npm run replay:champions -- native/ChampionsAdvisorHost/engine/fixtures/replays/private-rain-2026-07-15/replay.json
```

The fixture records seven live transitions from the July 15 private rain battle and supplies an executable exact scenario and joint plans for every turn. Four transitions match an exact successor branch. The remaining three are retained as strict evidence mismatches: turn 0 has an action-order/outcome inconsistency, turn 1's observed Archaludon HP is outside the legal damage-plus-Leftovers set, and turn 4's observed HP loss is not produced by the confirmed Sucker Punch/Defiant state. They are not hidden behind tolerance or invented state.

A transition may also contain a `prediction` object with a scenario path plus the two exact `SideJointPlan` values. In that mode the validator materializes the exact starting state, executes the native turn resolver, and compares every chance successor against the captured next snapshot. A pass requires at least one exact branch match. If none matches, the report returns the nearest branch, its exact probability, and field-level mismatches. If the state contains an unsupported mechanic, the prediction is reported as `blocked` and the replay command fails.

Replay snapshots live under the fixture directory rather than `captures/`; runtime captures remain ignored by Git. Action provenance is explicit: `user_confirmed`, `local_pp_delta`, `state_transition`, `outcome_inferred`, or `unknown`.

## Mechanics pack

`npm run generate:mechanics-pack` builds a deterministic, checksummed Gen 9 data pack from the website's pinned `@pkmn/dex` data, the official `@pkmn/sim` callback inventory, the active Champions learnset list, and the verified 1.1.4 runtime enum mappings. It retains the numeric IDs used by the live client, structured move effects, move/ability/item callback requirements, type chart, Champions nature IDs, base stats, system moves, and descriptions. The native simulator consumes this pack; it does not import the existing TypeScript prediction/search code.

The implemented native mechanics currently include Champions integer stats, stat stages, the 16 damage rolls, STAB/type/spread math, legal action products, base priority and speed ordering, Trick Room reversal, Weather Ball, and Hurricane weather accuracy. Unimplemented dynamic callbacks fail closed with a named error rather than being approximated as ordinary damage.

Run the complete Rust suite and verify the pack checksum:

```sh
cd native/ChampionsAdvisorHost/engine/data
shasum -a 256 -c champions-mechanics-v1.json.sha256
cd ..
cargo test
```
