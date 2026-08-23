# Champions Advisor Probe

This rootless Dopamine tweak is the first acquisition milestone for the move-prediction project. It passively snapshots the battle state already present in the Pokemon Champions client. It does not send battle commands, simulate touches, alter state, hook networking, or attempt to bypass integrity checks.

The probe is deliberately locked to Pokemon Champions `1.1.4 (25)` and UnityFramework UUID `30C1CBE3-025E-3590-88C3-2FEE8235D2A3`. Unsupported app or framework builds stop before resolving or calling native game code. The extracted framework SHA-256 is also recorded in every snapshot for provenance.

## Captured state

- Battle rule, type, stage, local-team index, replay/spectator flags
- Turn, weather, global, side, position, and Pokemon effects
- Both six-Pokemon preview rosters, the local selected-entry order, and remote group indices only as opposing Pokemon are revealed, without names, friend codes, room IDs, or Pokemon unique IDs
- Species/form/gender IDs, location, HP, stat stages, status, typing, item, ability, Mega flags, base points, and move slots/PP
- A compact opponent-observability summary used to determine whether the client really contains hidden opposing fields

Snapshots are written only when semantic state changes. They live under the app data container at `Documents/ChampionsAdvisor/snapshot.json`; diagnostic messages are in the adjacent `probe.log`.

## Overlay

The injected app UI adds a draggable `CA` bubble in an alert-level passthrough window. Empty parts of that window do not consume touches. Tapping the bubble opens a compact capture/engine status card; tapping again closes it. The bubble position is persisted in the app's preferences.

The card reads `Documents/ChampionsAdvisor/recommendation.json` and accepts a result only when its `state_hash` exactly matches the live snapshot. Missing or stale Mac results are labeled rather than shown as current advice. While the Mac searches, the card shows the active/target depth, completed root plans, node count, and elapsed time; ready results show the first two principal-variation turns plus depth/node/time metrics. An unsupported game build produces a red, fail-closed status instead of calling version-specific offsets.

The extraction evidence used by the code is recorded in `Profiles/champions-1.1.4-25.json`. Updating Champions requires a new verified profile; offsets are never reused merely because the marketing version looks similar.

## Build

```sh
export THEOS=/Users/mariomanzocco/theos
make clean package
```

## Test scope

Use offline, tutorial, replay, private, or otherwise explicitly sanctioned battles. The probe is diagnostic infrastructure; it is not an authorization to use live assistance where a game's rules prohibit it.
