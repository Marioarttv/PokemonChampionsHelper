const OVERRIDE_FIELDS = [
  "species_id",
  "current_item_id",
  "current_ability_id",
  "supreme_overlord_fallen_allies",
  "nature_id",
  "training_points",
  "current_hp",
  "moves",
];

function assertObservationDocument(document) {
  if (document?.schema_version !== 1 || !Array.isArray(document.observations)) {
    throw new Error("Unsupported match-observation database");
  }
}

function observationKey(entry) {
  return `${entry?.key?.team_index}:${entry?.key?.group_index}`;
}

function applicablePokemonOverrides(document, snapshot) {
  const stateObservation = document.observations.find(
    (entry) => entry?.state_hash === snapshot.state_hash,
  );
  const overrides = [
    ...(Array.isArray(document.pokemon_overrides) ? document.pokemon_overrides : []),
    ...(Array.isArray(stateObservation?.pokemon_overrides)
      ? stateObservation.pokemon_overrides
      : []),
  ];
  const merged = new Map();
  for (const entry of overrides) {
    if (!Number.isInteger(entry?.key?.team_index)
      || !Number.isInteger(entry?.key?.group_index)) {
      throw new Error("Match-local Pokemon override is missing a valid key");
    }
    const key = observationKey(entry);
    merged.set(key, { ...(merged.get(key) ?? {}), ...entry, key: entry.key });
  }
  return [...merged.values()];
}

export function applyMatchObservations(sheet, document, snapshot) {
  assertObservationDocument(document);
  const teamOverrides = Array.isArray(document.team_overrides)
    ? document.team_overrides
    : [];
  for (const override of teamOverrides) {
    const team = sheet.teams.find((entry) => entry.team_index === override.team_index);
    if (!team || !Array.isArray(override.pokemon_order)) {
      throw new Error(`Invalid match-local team override ${override?.team_index}`);
    }
    team.pokemon_order = [...override.pokemon_order];
  }
  const overrides = applicablePokemonOverrides(document, snapshot);
  for (const override of overrides) {
    const team = sheet.teams.find(
      (entry) => entry.team_index === override.key.team_index,
    );
    const pokemon = team?.pokemon.find(
      (entry) => entry.group_index === override.key.group_index,
    );
    if (!pokemon) {
      throw new Error(
        `Match-local override references missing Pokemon ${observationKey(override)}`,
      );
    }
    for (const field of OVERRIDE_FIELDS) {
      if (Object.hasOwn(override, field)) {
        pokemon[field] = structuredClone(override[field]);
      }
    }
  }

  const stateObservation = document.observations.find(
    (entry) => entry?.state_hash === snapshot.state_hash,
  );
  const revealedMoves = Array.isArray(stateObservation?.revealed_moves)
    ? stateObservation.revealed_moves
    : [];
  for (const observation of revealedMoves) {
    const team = sheet.teams.find(
      (entry) => entry.team_index === observation?.key?.team_index,
    );
    const pokemon = team?.pokemon.find(
      (entry) => entry.group_index === observation?.key?.group_index,
    );
    if (!pokemon || !Array.isArray(observation.moves)) {
      throw new Error(`Invalid revealed-move observation ${observationKey(observation)}`);
    }
    for (const revealed of observation.moves) {
      const move = pokemon.moves.find(
        (entry) => entry.move_id.toLowerCase() === revealed?.move_id?.toLowerCase(),
      );
      if (!move) {
        throw new Error(
          `Revealed move ${revealed?.move_id} is absent from ${observationKey(observation)}`,
        );
      }
      for (const field of ["current_pp", "max_pp", "locked"]) {
        if (Object.hasOwn(revealed, field)) move[field] = revealed[field];
      }
    }
    if (typeof observation.choice_locked_move_id === "string") {
      const selected = observation.choice_locked_move_id.toLowerCase();
      if (!pokemon.moves.some((move) => move.move_id.toLowerCase() === selected)) {
        throw new Error(
          `Choice-locked move ${observation.choice_locked_move_id} is absent from ${observationKey(observation)}`,
        );
      }
      for (const move of pokemon.moves) {
        move.locked = move.move_id.toLowerCase() !== selected;
      }
    }
  }
  const pendingMoveTargets = Array.isArray(stateObservation?.pending_move_targets)
    ? stateObservation.pending_move_targets.map(({ actor, md_id, target }) => ({
        actor,
        md_id,
        target,
      }))
    : [];
  if (pendingMoveTargets.length > 0) {
    const explicitTargets = Array.isArray(sheet.pending_move_targets)
      ? sheet.pending_move_targets
      : [];
    const explicitKeys = new Set(explicitTargets.map(
      (entry) => `${entry.actor?.team_index}:${entry.actor?.group_index}:${entry.md_id}`,
    ));
    sheet.pending_move_targets = [
      ...explicitTargets,
      ...pendingMoveTargets.filter((entry) => !explicitKeys.has(
        `${entry.actor?.team_index}:${entry.actor?.group_index}:${entry.md_id}`,
      )),
    ];
  }
  return {
    team_override_count: teamOverrides.length,
    pokemon_override_count: overrides.length,
    revealed_move_observation_count: revealedMoves.length,
    pending_move_target_count: pendingMoveTargets.length,
  };
}
