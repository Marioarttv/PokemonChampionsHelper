function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function trainingFromSnapshot(pokemon) {
  const points = isObject(pokemon.base_points) ? pokemon.base_points : {};
  return {
    hp: Number(points.hp ?? 0),
    attack: Number(points.attack ?? 0),
    defense: Number(points.defense ?? 0),
    special_attack: Number(points.special_attack ?? 0),
    special_defense: Number(points.special_defense ?? 0),
    speed: Number(points.speed ?? 0),
  };
}

function hasTrainingData(pokemon) {
  return Object.values(trainingFromSnapshot(pokemon)).some((value) => value > 0);
}

function findByNumber(records, number) {
  return records.find((entry) => entry.num === number) ?? null;
}

function resolveSpecies(pokemon, pack, profileBySpecies) {
  const candidates = pack.species.filter((species) => species.num === pokemon.personal_id);
  if (candidates.length === 0) {
    throw new Error(`No mechanics species matches personal ID ${pokemon.personal_id}`);
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (pokemon.mega_mode) {
    const mega = candidates.find((species) => species.forme?.toLowerCase() === "mega");
    if (mega) {
      return mega;
    }
  }
  if (pokemon.ability_md_id > 0) {
    const abilityMatches = candidates.filter((species) =>
      species.abilities.some((ability) => ability.num === pokemon.ability_md_id));
    if (abilityMatches.length === 1) {
      return abilityMatches[0];
    }
  }
  if (Number.isInteger(pokemon.form_no) && pokemon.form_no > 0 && candidates[pokemon.form_no]) {
    return candidates[pokemon.form_no];
  }
  return candidates.find((species) => !species.forme && profileBySpecies.has(species.id))
    ?? candidates.find((species) => profileBySpecies.has(species.id))
    ?? candidates[0];
}

function teamOrder(team, local) {
  const groupIndices = team.pokemon.map((pokemon) => pokemon.group_index);
  const selectedByOrder = team.pokemon
    .filter((pokemon) => pokemon.selection_order >= 0)
    .sort((left, right) => left.selection_order - right.selection_order)
    .map((pokemon) => pokemon.group_index);
  const revealed = unique([
    ...(local && selectedByOrder.length ? selectedByOrder : []),
    ...(Array.isArray(team.selected_group_indices) ? team.selected_group_indices : []),
    ...team.pokemon
      .filter((pokemon) => pokemon.position_index >= 0)
      .sort((left, right) => left.position_index - right.position_index)
      .map((pokemon) => pokemon.group_index),
  ]).filter((groupIndex) => groupIndices.includes(groupIndex));
  const selectedCount = Math.min(4, groupIndices.length);
  return [...revealed, ...groupIndices.filter((groupIndex) => !revealed.includes(groupIndex))]
    .slice(0, selectedCount);
}

function natureFromSnapshot(pokemon, pack) {
  return pack.natures.find((nature) =>
    nature.championsMdId === pokemon.nature_correction_md_id)?.id ?? null;
}

function exactMovesFromSnapshot(pokemon, pack, resetCurrentPp = false) {
  return pokemon.moves.map((move) => {
    const record = findByNumber(pack.moves, move.md_id);
    if (!record) {
      throw new Error(`No mechanics move matches MD ID ${move.md_id}`);
    }
    return {
      move_id: record.id,
      current_pp: resetCurrentPp ? move.max_pp : move.current_pp,
      max_pp: move.max_pp,
    };
  });
}

function exactMaximumHp(species, trainingPoints, pack) {
  return species.baseStats.hp + pack.statRules.hpBaselineBonus + trainingPoints.hp;
}

function currentHpFromObservation(pokemon, maximum) {
  if (pokemon.fainted) {
    return 0;
  }
  const ratio = Number(pokemon.raw_hp_ratio);
  if (!Number.isFinite(ratio) || ratio >= 10_000) {
    return maximum;
  }
  if (ratio <= 0) {
    return Math.min(maximum, Math.max(1, Number(pokemon.current_hp) || maximum));
  }
  return Math.min(maximum, Math.max(1, Math.round(maximum * ratio / 10_000)));
}

function exactLocalPokemon(pokemon, species, pack, fallbackProfile) {
  const trainingPoints = trainingFromSnapshot(pokemon);
  const natureId = natureFromSnapshot(pokemon, pack) ?? fallbackProfile.nature_id;
  const item = findByNumber(pack.items, pokemon.item_md_id);
  const ability = findByNumber(pack.abilities, pokemon.ability_md_id);
  return {
    group_index: pokemon.group_index,
    species_id: species.id,
    current_item_id: item?.id ?? "none",
    current_ability_id: ability?.id ?? fallbackProfile.current_ability_id,
    nature_id: natureId,
    training_points: trainingPoints,
    current_hp: pokemon.current_hp,
    moves: pokemon.moves.length
      ? exactMovesFromSnapshot(pokemon, pack)
      : fallbackProfile.moves,
  };
}

function buildMirrorIndex(localTeam, pack, profileBySpecies) {
  const mirrored = new Map();
  for (const pokemon of localTeam.pokemon) {
    const species = resolveSpecies(pokemon, pack, profileBySpecies);
    const profile = profileBySpecies.get(species.id);
    if (!profile) {
      continue;
    }
    const exact = exactLocalPokemon(pokemon, species, pack, profile);
    mirrored.set(species.id, {
      nature_id: exact.nature_id,
      training_points: exact.training_points,
      moves: exact.moves.map((move) => ({ ...move, current_pp: move.max_pp })),
    });
  }
  return mirrored;
}

function exactOpponentPokemon(pokemon, species, profile, mirror, pack) {
  const trainingPoints = hasTrainingData(pokemon)
    ? trainingFromSnapshot(pokemon)
    : mirror?.training_points ?? profile.training_points;
  const natureId = (pokemon.nature_correction_md_id > 0
    ? natureFromSnapshot(pokemon, pack)
    : null)
    ?? mirror?.nature_id
    ?? profile.nature_id;
  const item = pokemon.item_md_id > 0 ? findByNumber(pack.items, pokemon.item_md_id)?.id : null;
  const ability = pokemon.ability_md_id > 0
    ? findByNumber(pack.abilities, pokemon.ability_md_id)?.id
    : null;
  const maximumHp = exactMaximumHp(species, trainingPoints, pack);
  return {
    group_index: pokemon.group_index,
    species_id: species.id,
    current_item_id: item ?? profile.current_item_id,
    current_ability_id: ability ?? profile.current_ability_id,
    nature_id: natureId,
    training_points: trainingPoints,
    current_hp: currentHpFromObservation(pokemon, maximumHp),
    moves: pokemon.moves.length
      ? exactMovesFromSnapshot(pokemon, pack)
      : mirror?.moves ?? profile.moves,
  };
}

export function buildPerfectKnowledgeSheet(snapshot, pack, database) {
  if (!snapshot?.state?.available) {
    throw new Error("No active battle is available for automatic assumptions");
  }
  if (database.schema_version !== 1 || !Array.isArray(database.profiles)) {
    throw new Error("Unsupported opponent assumption database");
  }
  const profileBySpecies = new Map(database.profiles.map((profile) => [profile.species_id, profile]));
  const localTeam = snapshot.state.teams.find((team) => team.team_index === snapshot.state.local_team_index);
  if (!localTeam) {
    throw new Error(`Snapshot has no local team ${snapshot.state.local_team_index}`);
  }
  const mirrorBySpecies = buildMirrorIndex(localTeam, pack, profileBySpecies);
  let opponentPokemon = 0;
  let mirroredPokemon = 0;
  let observedOverrides = 0;
  const teams = snapshot.state.teams.map((team) => {
    const local = team.team_index === snapshot.state.local_team_index;
    const pokemon = team.pokemon.map((entry) => {
      const species = resolveSpecies(entry, pack, profileBySpecies);
      const profile = profileBySpecies.get(species.id);
      if (!profile) {
        throw new Error(`The assumption database has no profile for ${species.id}`);
      }
      if (local) {
        return exactLocalPokemon(entry, species, pack, profile);
      }
      opponentPokemon += 1;
      const mirror = mirrorBySpecies.get(species.id);
      if (mirror) {
        mirroredPokemon += 1;
      }
      observedOverrides += Number(entry.item_md_id > 0)
        + Number(entry.moves.length > 0)
        + Number(hasTrainingData(entry))
        + Number(entry.nature_correction_md_id > 0)
        + Number(entry.raw_hp_ratio >= 0 && entry.raw_hp_ratio < 10_000);
      return exactOpponentPokemon(entry, species, profile, mirror, pack);
    });
    return {
      team_index: team.team_index,
      pokemon_order: teamOrder(team, local),
      pokemon,
    };
  });
  const opponentTeam = snapshot.state.teams.find((team) => team.team_index !== snapshot.state.local_team_index);
  const revealedOrderSlots = opponentTeam?.selected_group_indices?.length ?? 0;
  return {
    sheet: { schema_version: 1, teams },
    status: {
      mode: "automatic",
      database_version: database.schema_version,
      database_profiles: database.profile_count ?? database.profiles.length,
      roster_pokemon: opponentPokemon,
      covered_pokemon: opponentPokemon,
      mirrored_pokemon: mirroredPokemon,
      observed_overrides: observedOverrides,
      revealed_order_slots: revealedOrderSlots,
      summary: `Automatic assumptions cover ${opponentPokemon}/${opponentPokemon} opponent Pokemon. Live observations override them every run.`,
    },
  };
}
