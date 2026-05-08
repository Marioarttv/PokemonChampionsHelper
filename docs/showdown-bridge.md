# Pokemon Showdown bridge research

This note captures the concrete Showdown surfaces needed to build a Chrome
extension that reads a live battle, mirrors it into this app's battle canvas,
and runs the turn prediction engine.

## Live battle inspected

- URL: `https://play.pokemonshowdown.com/battle-gen9championsvgc2026regma-2605008031-ct7sns27smiv4do9yiamna9mau5qtdnpw`
- Format: `[Gen 9 Champions] VGC 2026 Reg M-A`
- Game type: doubles
- User side: `DarrowArtTV`
- Opponent: `youngchow14`
- Initial visible board:
  - Ally active: `Floette-Eternal`, `Kingambit`
  - Enemy active: `Manectric`, `Archaludon`
  - Ally team: `Charizard`, `Floette-Eternal`, `Aerodactyl`, `Garchomp`, `Kingambit`, `Basculegion`
  - Enemy team: `Sneasler`, `Aerodactyl`, `Archaludon`, `Politoed`, `Kingambit`, `Manectric`
- Downloaded replay artifact: `~/Downloads/Gen9ChampionsVGC2026RegMA-2026-05-08-darrowarttv-youngchow14.html`

The downloaded replay stores exact protocol text in:

```html
<script type="text/plain" class="battle-log-data">...</script>
```

That protocol is useful for tests and replay imports, but a live extension
should prefer Showdown's in-memory client state because it already tracks
current HP, active slots, boosts, statuses, field state, side conditions, and
the private request object for our side.

## Current Showdown client sources

The live page loaded these relevant files:

- `https://play.pokemonshowdown.com/js/client-battle.js?0.137230544653548`
- `https://play.pokemonshowdown.com/js/battle.js?0.34021439635120587`
- `https://play.pokemonshowdown.com/js/client.js?0.38224380590230855`

Important source facts from those files:

- `client.js` stores rooms under `window.app.rooms` and the focused room under `window.app.curRoom`.
- Battle rooms are `BattleRoom` instances. They own `room.battle`, `room.request`, `room.choice`, and `room.side`.
- `BattleRoom.initialize()` creates `this.battle = new Battle(...)`.
- `BattleRoom.receiveRequest(request)` annotates `request.requestType` as `move`, `switch`, `team`, or `wait`, stores it on `room.request`, then calls `updateSideLocation()`.
- `BattleRoom.updateSide()` copies `request.side.pokemon` into `battle.myPokemon` and parses each private Pokemon's `details` and `condition`.
- `Battle` owns public battle state: `turn`, `weather`, `weatherTimeLeft`, `pseudoWeather`, `tier`, `gameType`, `mySide`, `nearSide`, `farSide`, `p1`, `p2`, and side objects.
- `Side` owns `active`, `pokemon`, `sideConditions`, `totalPokemon`, `name`, `id`, and `sideid`.
- `Pokemon` owns `name`, `speciesForme`, `ident`, `details`, `slot`, `hp`, `maxhp`, `status`, `statusData`, `boosts`, `volatiles`, `turnstatuses`, `movestatuses`, `lastMove`, `moveTrack`, `moves`, `ability`, `item`, `teraType`, and `terastallized`.

## Extension architecture

Use the same split as a robust Chrome extension bridge:

1. `showdown-content.js`
   - Runs as a normal extension content script on `https://play.pokemonshowdown.com/*`.
   - Cannot directly trust or fully access page JS objects because content scripts run in an isolated world.
   - Injects a page-context script tag.
   - Listens for `window.postMessage` events from that injected page script.
   - Forwards sanitized snapshots to the background service worker.

2. `showdown-page-probe.js`
   - Runs in the page context.
   - Reads `window.app.curRoom` or searches `Object.values(window.app.rooms)` for an active battle room.
   - Builds a sanitized `ShowdownBridgeSnapshot`.
   - Emits when the snapshot signature changes.
   - Uses polling plus lightweight hooks. Polling every 250-500ms is acceptable for the first version. A later version can wrap `room.receiveRequest` and use `battle.subscribe(...)`.

3. `background.js`
   - Stores the latest snapshot per Showdown tab.
   - Tracks app tabs with an app content script.
   - Relays snapshots from Showdown tabs to app tabs.

4. `app-content.js`
   - Runs on our app origin, for example `http://localhost:5173/*` and the deployed site.
   - Receives background messages.
   - Posts `window.postMessage({ type: "PCH_SHOWDOWN_SNAPSHOT", snapshot })` into the app page.

5. App receiver
   - Validates the snapshot.
   - Converts it to `BattleStateMemberInput[]` and `CreateBattleStateInput`.
   - Calls the existing battle state/render path.
   - Runs the existing `recommendBestPlan` worker path.

## Snapshot contract

```ts
export type ShowdownBridgeSnapshot = {
  source: "pokemon-showdown";
  capturedAt: string;
  url: string;
  room: {
    id: string;
    type: "battle";
    side: "p1" | "p2" | "p3" | "p4" | "";
    requestType: "move" | "switch" | "team" | "wait" | null;
    rqid: number | null;
    request: ShowdownRequestSnapshot | null;
  };
  battle: {
    id: string;
    roomid: string;
    tier: string;
    gameType: "singles" | "doubles" | "triples" | "multi" | "freeforall";
    gen: number;
    turn: number;
    ended: boolean;
    weather: string;
    weatherTimeLeft: number;
    weatherMinTimeLeft: number;
    pseudoWeather: Array<[string, number, number]>;
    teamPreviewCount: number;
    pokemonControlled: number;
    mySide: string;
    nearSide: string;
    farSide: string;
    sides: Record<"p1" | "p2", ShowdownSideSnapshot>;
  };
};

export type ShowdownSideSnapshot = {
  sideid: "p1" | "p2";
  id: string;
  name: string;
  totalPokemon: number;
  sideConditions: Record<string, unknown>;
  active: Array<ShowdownPokemonSnapshot | null>;
  pokemon: ShowdownPokemonSnapshot[];
};

export type ShowdownPokemonSnapshot = {
  name: string;
  speciesForme: string;
  ident: string;
  details: string;
  searchid: string;
  slot: number;
  fainted: boolean;
  hp: number;
  maxhp: number;
  level: number;
  gender: "M" | "F" | "N";
  ability: string;
  baseAbility: string;
  item: string;
  itemEffect: string;
  prevItem: string;
  prevItemEffect: string;
  status: string;
  statusData: { sleepTurns?: number; toxicTurns?: number };
  boosts: Record<string, number>;
  volatiles: string[];
  turnstatuses: string[];
  movestatuses: string[];
  lastMove: string;
  moveTrack: unknown[];
  moves: string[];
  teraType: string;
  terastallized: string;
};

export type ShowdownRequestSnapshot = {
  active?: Array<{
    moves?: Array<{
      move: string;
      id: string;
      pp: number;
      maxpp: number;
      target: string;
      disabled?: boolean | string;
    }>;
    canMegaEvo?: boolean;
    canMegaEvoX?: boolean;
    canMegaEvoY?: boolean;
    canZMove?: unknown;
    canDynamax?: boolean;
    maxMoves?: unknown;
    canTerastallize?: string;
    trapped?: boolean;
    maybeTrapped?: boolean;
  }>;
  side?: {
    id: "p1" | "p2" | "p3" | "p4";
    pokemon: Array<{
      ident: string;
      details: string;
      condition: string;
      active?: boolean;
      stats?: Record<string, number>;
      moves?: string[];
      baseAbility?: string;
      item?: string;
      pokeball?: string;
      teraType?: string;
      canMegaEvo?: boolean;
      canMegaEvoX?: boolean;
      canMegaEvoY?: boolean;
    }>;
  };
  wait?: boolean;
  forceSwitch?: boolean | boolean[];
  teamPreview?: boolean;
};
```

The request object is private-side data. It is the best source for our own
legal moves, PP, available switches, Mega Evolution, and exact HP. Public
opponent state should come from `battle.p1`/`battle.p2` and known/revealed
fields.

## Normalization into this app

- Side mapping:
  - If `snapshot.room.side === side.sideid`, map that Showdown side to `ally`.
  - The other side maps to `enemy`.
- Active slots:
  - Use `side.active[0]` and `side.active[1]` for doubles.
  - Bench is `side.pokemon` minus active and fainted entries.
- Species:
  - Prefer `speciesForme`.
  - Fall back to `details.split(",")[0]`.
  - Normalize through our Pokemon DB name lookup.
- HP:
  - Our side: prefer `request.side.pokemon[].condition` when available because it can be exact, such as `144/207`.
  - Opponent side: Showdown often only exposes percentage-style values such as `37/100`; treat those as percent unless max HP is known.
- Status:
  - `brn` -> `burn`
  - `par` -> `paralysis`
  - `slp` -> `sleep`
  - `""` -> `none`
  - `psn`, `tox`, and `frz` are visible but not currently first-class engine statuses.
- Boosts:
  - `atk` -> `attack`
  - `def` -> `defense`
  - `spa` -> `specialAttack`
  - `spd` -> `specialDefense`
  - `spe` -> `speed`
- Weather:
  - `raindance` -> `rain`
  - `sunnyday` -> `sun`
  - `sandstorm` -> `sand`
  - `snow`, `hail` -> `snow`
  - empty string -> `none`
- Terrain:
  - Read from `battle.pseudoWeather` entries whose ids end with `terrain`.
  - `electricterrain`, `grassyterrain`, `psychicterrain`, `mistyterrain` map to the app's terrain values.
- Side conditions:
  - `tailwind` -> `tailwindTurns`
  - `reflect` -> `reflectTurns`
  - `lightscreen` -> `lightScreenTurns`
  - `auroraveil` -> `auroraVeilTurns`
  - `safeguard` -> `safeguardTurns`
  - `quickguard` and `wideguard` are usually turn statuses or side conditions depending on protocol event.
- Moves:
  - Our active legal moves come from `request.active[index].moves`.
  - Our team moves can come from `request.side.pokemon[].moves`.
  - Opponent revealed moves come from `pokemon.moves` and `moveTrack`.
  - Hidden opponent moves should stay as `candidateMoves` / beliefs.
- Mega Evolution:
  - `request.active[index].canMegaEvo` or `request.side.pokemon[index].canMegaEvo` indicates the UI checkbox should be available.
  - Actual Mega state appears through protocol events such as `detailschange`, `-mega`, and ability updates, and then through `pokemon.speciesForme` / `details`.

## Protocol lines that matter for replay tests

Observed protocol examples:

```text
|gametype|doubles
|tier|[Gen 9 Champions] VGC 2026 Reg M-A
|poke|p1|Floette-Eternal, L50, F|
|teampreview|4
|switch|p1a: Floette|Floette-Eternal, L50, F|151/151
|turn|1
|detailschange|p1a: Floette|Floette-Mega, L50, F
|-mega|p1a: Floette|Floette|Floettite
|-ability|p1a: Floette|Fairy Aura
|move|p2a: Manectric|Volt Switch|p1b: Kingambit
|-damage|p1b: Kingambit|144/207
|switch|p2a: Politoed|Politoed, L50, F|100/100|[from] Volt Switch
|-weather|RainDance|[from] ability: Drizzle|[of] p2a: Politoed
|-sidestart|p1|move: Tailwind
|-sideend|p1|move: Tailwind
|-boost|p1a: Example|atk|1
|-unboost|p2a: Example|spe|1
|-status|p1a: Example|par
|faint|p2b: Kingambit
|win|DarrowArtTV
```

The current Showdown client already applies these protocol events into
`battle`, `side`, and `pokemon` objects. We should use protocol parsing for
tests/replay import and in-memory state for live extension sync.

## MVP implementation checklist

1. Add extension files under a dedicated folder, for example `Extension/showdown-bridge/`.
2. Add a page probe that emits `ShowdownBridgeSnapshot`.
3. Add a background relay from Showdown tabs to app tabs.
4. Add app-side content script that posts snapshots into the React page.
5. Add a React listener and a small "Showdown Live" status/control surface.
6. Add `showdownSnapshotToBattleStateInput(...)`.
7. Reuse `createBattleState(...)` and existing `recommendBestPlan` worker flow.
8. Add replay fixture coverage using the downloaded protocol shape.
9. Browser-test with a live Showdown battle and with a replay.

## Known limitations

- A normal webpage cannot read a different Showdown tab. This requires the
  Chrome extension bridge.
- Content scripts cannot safely rely on isolated-world access to Showdown's
  page globals. Inject a page-context probe.
- Opponent hidden information must remain probabilistic. Do not invent exact
  items, abilities, or moves unless Showdown exposes them through open team
  sheets, request data, or battle protocol.
- Showdown's exact HP model and this app's Champions stat model can differ. For
  opponent HP, use visible percentages unless exact HP is available.
- Chrome remote debugging was not enabled in the inspected browser session, and
  Chrome AppleScript JavaScript execution was blocked/hanging. The extension
  injector path is therefore the reliable path for future live reads.
