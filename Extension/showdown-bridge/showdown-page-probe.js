(function installShowdownBridgeProbe() {
  if (window.__pchShowdownBridgeProbeInstalled) {
    return;
  }

  window.__pchShowdownBridgeProbeInstalled = true;

  const PAGE_SNAPSHOT = "PCH_SHOWDOWN_BRIDGE_PAGE_SNAPSHOT";
  const PAGE_STATUS = "PCH_SHOWDOWN_BRIDGE_PAGE_STATUS";
  const PAGE_REQUEST = "PCH_SHOWDOWN_BRIDGE_PAGE_REQUEST";
  let lastSignature = "";
  let lastSnapshot = null;

  function postStatus(status, message) {
    window.postMessage({ type: PAGE_STATUS, status, message }, window.location.origin);
  }

  function copyJson(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }

  function ownKeys(value) {
    if (!value || typeof value !== "object") return [];
    return Object.keys(value);
  }

  function normalizeMoveList(moves) {
    if (!Array.isArray(moves)) return [];
    return moves
      .map((move) => {
        if (typeof move === "string") return move;
        if (move && typeof move === "object") return move.move || move.name || move.id || "";
        return "";
      })
      .filter(Boolean);
  }

  function serializePokemon(pokemon) {
    if (!pokemon) return null;

    return {
      name: pokemon.name || "",
      speciesForme: pokemon.speciesForme || "",
      ident: pokemon.ident || "",
      details: pokemon.details || "",
      searchid: pokemon.searchid || "",
      slot: Number.isFinite(pokemon.slot) ? pokemon.slot : 0,
      fainted: !!pokemon.fainted,
      hp: Number.isFinite(pokemon.hp) ? pokemon.hp : 0,
      maxhp: Number.isFinite(pokemon.maxhp) ? pokemon.maxhp : 100,
      level: Number.isFinite(pokemon.level) ? pokemon.level : 100,
      gender: pokemon.gender || "N",
      ability: pokemon.ability || "",
      baseAbility: pokemon.baseAbility || "",
      item: pokemon.item || "",
      itemEffect: pokemon.itemEffect || "",
      prevItem: pokemon.prevItem || "",
      prevItemEffect: pokemon.prevItemEffect || "",
      status: pokemon.status || "",
      statusData: copyJson(pokemon.statusData || {}, {}),
      boosts: copyJson(pokemon.boosts || {}, {}),
      volatiles: ownKeys(pokemon.volatiles),
      turnstatuses: ownKeys(pokemon.turnstatuses),
      movestatuses: ownKeys(pokemon.movestatuses),
      lastMove: pokemon.lastMove || "",
      moveTrack: copyJson(pokemon.moveTrack || [], []),
      moves: normalizeMoveList(pokemon.moves),
      teraType: pokemon.teraType || "",
      terastallized: pokemon.terastallized || "",
    };
  }

  function serializeSide(side) {
    if (!side) return null;

    return {
      sideid: side.sideid || "",
      id: side.id || "",
      name: side.name || "",
      totalPokemon: Number.isFinite(side.totalPokemon) ? side.totalPokemon : 6,
      openTeamSheet: !!side.openTeamSheet,
      sideConditions: copyJson(side.sideConditions || {}, {}),
      active: Array.isArray(side.active) ? side.active.map(serializePokemon) : [],
      pokemon: Array.isArray(side.pokemon) ? side.pokemon.map(serializePokemon).filter(Boolean) : [],
    };
  }

  function serializeRequestPokemon(pokemon) {
    if (!pokemon) return null;
    return {
      ident: pokemon.ident || "",
      details: pokemon.details || "",
      condition: pokemon.condition || "",
      active: !!pokemon.active,
      stats: copyJson(pokemon.stats || {}, {}),
      moves: normalizeMoveList(pokemon.moves),
      baseAbility: pokemon.baseAbility || "",
      item: pokemon.item || "",
      pokeball: pokemon.pokeball || "",
      teraType: pokemon.teraType || "",
      canMegaEvo: !!pokemon.canMegaEvo,
      canMegaEvoX: !!pokemon.canMegaEvoX,
      canMegaEvoY: !!pokemon.canMegaEvoY,
    };
  }

  function serializeRequestMove(move) {
    if (!move) return null;
    return {
      move: move.move || "",
      id: move.id || "",
      pp: Number.isFinite(move.pp) ? move.pp : 0,
      maxpp: Number.isFinite(move.maxpp) ? move.maxpp : 0,
      target: move.target || "",
      disabled: move.disabled || false,
    };
  }

  function serializeRequest(request) {
    if (!request) return null;

    return {
      active: Array.isArray(request.active)
        ? request.active.map((active) => ({
            moves: Array.isArray(active.moves) ? active.moves.map(serializeRequestMove).filter(Boolean) : [],
            canMegaEvo: !!active.canMegaEvo,
            canMegaEvoX: !!active.canMegaEvoX,
            canMegaEvoY: !!active.canMegaEvoY,
            canZMove: copyJson(active.canZMove || null, null),
            canDynamax: !!active.canDynamax,
            maxMoves: copyJson(active.maxMoves || null, null),
            canTerastallize: active.canTerastallize || "",
            trapped: !!active.trapped,
            maybeTrapped: !!active.maybeTrapped,
          }))
        : [],
      side: request.side
        ? {
            id: request.side.id || "",
            pokemon: Array.isArray(request.side.pokemon)
              ? request.side.pokemon.map(serializeRequestPokemon).filter(Boolean)
              : [],
          }
        : null,
      wait: !!request.wait,
      forceSwitch: copyJson(request.forceSwitch || false, false),
      teamPreview: !!request.teamPreview,
    };
  }

  function findBattleRoom() {
    const app = window.app;
    if (!app) return null;
    if (app.curRoom && app.curRoom.battle) return app.curRoom;

    const rooms = app.rooms && typeof app.rooms === "object" ? Object.values(app.rooms) : [];
    return rooms.find((room) => room && room.battle && room.type === "battle") || null;
  }

  function buildSnapshot() {
    const room = findBattleRoom();
    const battle = room && room.battle;
    if (!room || !battle) return null;

    const p1 = serializeSide(battle.p1);
    const p2 = serializeSide(battle.p2);
    if (!p1 || !p2) return null;

    return {
      source: "pokemon-showdown",
      capturedAt: new Date().toISOString(),
      url: window.location.href,
      room: {
        id: room.id || "",
        type: room.type || "battle",
        side: room.side || "",
        requestType: room.request?.requestType || null,
        rqid: Number.isFinite(room.request?.rqid) ? room.request.rqid : null,
        request: serializeRequest(room.request),
      },
      battle: {
        id: battle.id || "",
        roomid: battle.roomid || "",
        tier: battle.tier || "",
        gameType: battle.gameType || "",
        gen: Number.isFinite(battle.gen) ? battle.gen : 0,
        turn: Number.isFinite(battle.turn) ? battle.turn : 0,
        ended: !!battle.ended,
        weather: battle.weather || "",
        weatherTimeLeft: Number.isFinite(battle.weatherTimeLeft) ? battle.weatherTimeLeft : 0,
        weatherMinTimeLeft: Number.isFinite(battle.weatherMinTimeLeft) ? battle.weatherMinTimeLeft : 0,
        pseudoWeather: copyJson(battle.pseudoWeather || [], []),
        teamPreviewCount: Number.isFinite(battle.teamPreviewCount) ? battle.teamPreviewCount : 0,
        pokemonControlled: Number.isFinite(battle.pokemonControlled) ? battle.pokemonControlled : 0,
        mySide: battle.mySide?.sideid || "",
        nearSide: battle.nearSide?.sideid || "",
        farSide: battle.farSide?.sideid || "",
        sides: { p1, p2 },
      },
    };
  }

  function emitSnapshot(force) {
    const snapshot = buildSnapshot();
    if (!snapshot) {
      if (force) postStatus("waiting", "No active Showdown battle room found.");
      return;
    }

    const signature = JSON.stringify({ ...snapshot, capturedAt: "" });
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    lastSnapshot = snapshot;
    window.postMessage({ type: PAGE_SNAPSHOT, snapshot }, window.location.origin);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== PAGE_REQUEST) return;
    emitSnapshot(true);
  });

  postStatus("installed", "Showdown bridge probe installed.");
  emitSnapshot(true);
  window.setInterval(() => emitSnapshot(false), 500);
  document.addEventListener("visibilitychange", () => emitSnapshot(true));
})();
