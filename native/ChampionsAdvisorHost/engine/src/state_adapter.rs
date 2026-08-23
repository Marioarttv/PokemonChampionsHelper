use crate::{
    BasePoints, BattleStateSnapshot, HpObservation, MechanicsCatalog, MoveSnapshot,
    PokemonSnapshot, SnapshotEnvelope, TeamSnapshot, TrainingPoints,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Provenance {
    Observed,
    ScenarioAssumption,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "knowledge", rename_all = "snake_case")]
pub enum Knowledge<T> {
    Known { value: T, provenance: Provenance },
    Unknown,
}

impl<T> Knowledge<T> {
    pub fn observed(value: T) -> Self {
        Self::Known {
            value,
            provenance: Provenance::Observed,
        }
    }

    pub fn assumed(value: T) -> Self {
        Self::Known {
            value,
            provenance: Provenance::ScenarioAssumption,
        }
    }

    pub fn value(&self) -> Option<&T> {
        match self {
            Self::Known { value, .. } => Some(value),
            Self::Unknown => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PokemonKey {
    pub team_index: i32,
    pub group_index: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExactHp {
    pub current: i32,
    pub maximum: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HpKnowledge {
    pub observed: SerializableHpObservation,
    pub assumed_exact: Option<ExactHp>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SerializableHpObservation {
    Exact { current: i32, maximum: i32 },
    RatioBasisPoints { basis_points: i32 },
    Fainted,
    Unknown,
}

impl From<HpObservation> for SerializableHpObservation {
    fn from(value: HpObservation) -> Self {
        match value {
            HpObservation::Exact { current, maximum } => Self::Exact { current, maximum },
            HpObservation::RatioBasisPoints { basis_points } => {
                Self::RatioBasisPoints { basis_points }
            }
            HpObservation::Fainted => Self::Fainted,
            HpObservation::Unknown => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EngineMove {
    pub md_id: i32,
    pub slot_index: Option<i32>,
    pub current_pp: Option<i32>,
    pub max_pp: Option<i32>,
    pub locked: bool,
    pub target: Option<i16>,
    pub move_type: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EnginePokemon {
    pub key: PokemonKey,
    pub personal_id: i32,
    pub form_no: i32,
    pub species_candidates: Vec<String>,
    pub species_id: Knowledge<String>,
    pub gender: i32,
    pub side_index: i32,
    pub position_index: i32,
    pub entered_field: bool,
    pub needs_change: bool,
    pub move_select_auto: bool,
    pub change_select_locked: bool,
    pub hp: HpKnowledge,
    pub item_md_id: Knowledge<Option<i32>>,
    pub ability_md_id: Knowledge<i32>,
    pub supreme_overlord_fallen_allies: Option<i32>,
    pub training_points: Knowledge<TrainingPoints>,
    pub nature_md_id: Option<u16>,
    pub nature_id: Knowledge<String>,
    pub moves: Knowledge<Vec<EngineMove>>,
    pub status_condition: i32,
    pub fainted: bool,
    pub stat_stages: crate::StatStages,
    pub type_1: u8,
    pub type_2: u8,
    pub extra_type: u8,
    pub substitute: bool,
    pub volatile_effects: Vec<crate::EffectSnapshot>,
    pub field_effects: Vec<crate::EffectSnapshot>,
    pub can_mega: bool,
    pub mega_locked: bool,
    pub mega_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EngineTeam {
    pub team_index: i32,
    pub is_local_player: bool,
    pub selected_entry: bool,
    pub waiting_for_action: bool,
    pub pokemon_order: Knowledge<Vec<i32>>,
    pub revealed_group_indices: Vec<i32>,
    pub pokemon: Vec<EnginePokemon>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EngineBattleState {
    pub source_state_hash: String,
    pub battle_rule: u8,
    pub battle_type: u8,
    pub battle_stage_md_id: i32,
    pub local_team_index: i32,
    pub elapsed_turns: i32,
    pub weather_md_id: i32,
    pub weather_lifespan_turns: i32,
    pub weather_elapsed_turns: i32,
    pub world: crate::WorldSnapshot,
    pub teams: Vec<EngineTeam>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScenarioOverlay {
    #[serde(default)]
    pub teams: Vec<TeamScenario>,
    #[serde(default)]
    pub pokemon: Vec<PokemonScenario>,
    #[serde(default)]
    pub pending_move_targets: Vec<PendingMoveTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PendingMoveTarget {
    pub actor: PokemonKey,
    pub md_id: i32,
    pub target: PokemonKey,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TeamScenario {
    pub team_index: i32,
    pub pokemon_order: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PokemonScenario {
    pub key: PokemonKey,
    #[serde(default)]
    pub species_id: Option<String>,
    #[serde(default)]
    pub exact_hp: Option<ExactHp>,
    #[serde(default)]
    pub item_md_id: Option<i32>,
    #[serde(default)]
    pub ability_md_id: Option<i32>,
    #[serde(default)]
    pub supreme_overlord_fallen_allies: Option<i32>,
    #[serde(default)]
    pub training_points: Option<TrainingPoints>,
    #[serde(default)]
    pub nature_id: Option<String>,
    #[serde(default)]
    pub moves: Option<Vec<ScenarioMove>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScenarioMove {
    pub md_id: i32,
    #[serde(default)]
    pub slot_index: Option<i32>,
    #[serde(default)]
    pub current_pp: Option<i32>,
    #[serde(default)]
    pub max_pp: Option<i32>,
    #[serde(default)]
    pub locked: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StateAdapterError {
    BattleUnavailable,
    DuplicateTeamScenario(i32),
    MissingTeam(i32),
    InvalidTeamOrder(i32),
    TeamObservedConflict {
        team_index: i32,
        field: &'static str,
    },
    DuplicateScenarioKey(PokemonKey),
    MissingPokemon(PokemonKey),
    DuplicatePokemon(PokemonKey),
    MissingPendingMoveEffect {
        actor: PokemonKey,
        md_id: i32,
    },
    PendingMoveTargetConflict {
        actor: PokemonKey,
        md_id: i32,
    },
    TeamLocalityMismatch(PokemonKey),
    UnknownSpecies {
        key: PokemonKey,
        personal_id: i32,
    },
    UnknownMove {
        key: PokemonKey,
        md_id: i32,
    },
    UnknownItem {
        key: PokemonKey,
        md_id: i32,
    },
    InvalidScenarioItem {
        key: PokemonKey,
        md_id: i32,
    },
    UnknownAbility {
        key: PokemonKey,
        md_id: i32,
    },
    UnknownNature {
        key: PokemonKey,
        nature_id: String,
    },
    UnknownNatureMdId {
        key: PokemonKey,
        md_id: u16,
    },
    InvalidExactHp {
        key: PokemonKey,
        current: i32,
        maximum: i32,
    },
    InvalidMovePp {
        key: PokemonKey,
        md_id: i32,
    },
    InvalidSupremeOverlordState {
        key: PokemonKey,
        fallen_allies: i32,
    },
    ObservedConflict {
        key: PokemonKey,
        field: &'static str,
    },
}

impl Display for StateAdapterError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BattleUnavailable => write!(
                formatter,
                "device snapshot does not contain an active battle"
            ),
            Self::DuplicateTeamScenario(team_index) => {
                write!(formatter, "scenario repeats team {team_index}")
            }
            Self::MissingTeam(team_index) => {
                write!(formatter, "scenario references missing team {team_index}")
            }
            Self::InvalidTeamOrder(team_index) => {
                write!(
                    formatter,
                    "scenario has an invalid Pokemon order for team {team_index}"
                )
            }
            Self::TeamObservedConflict { team_index, field } => write!(
                formatter,
                "scenario conflicts with observed {field} for team {team_index}"
            ),
            Self::DuplicateScenarioKey(key) => {
                write!(formatter, "scenario repeats Pokemon {key:?}")
            }
            Self::MissingPokemon(key) => {
                write!(formatter, "scenario references missing Pokemon {key:?}")
            }
            Self::DuplicatePokemon(key) => write!(formatter, "snapshot repeats Pokemon {key:?}"),
            Self::MissingPendingMoveEffect { actor, md_id } => write!(
                formatter,
                "match observation references pending move {md_id} absent from Pokemon {actor:?}"
            ),
            Self::PendingMoveTargetConflict { actor, md_id } => write!(
                formatter,
                "match observation conflicts with the observed target for move {md_id} on Pokemon {actor:?}"
            ),
            Self::TeamLocalityMismatch(key) => {
                write!(formatter, "team/Pokemon locality differs for {key:?}")
            }
            Self::UnknownSpecies { key, personal_id } => {
                write!(
                    formatter,
                    "Pokemon {key:?} has unknown personal ID {personal_id}"
                )
            }
            Self::UnknownMove { key, md_id } => {
                write!(formatter, "Pokemon {key:?} has unknown move ID {md_id}")
            }
            Self::UnknownItem { key, md_id } => {
                write!(formatter, "Pokemon {key:?} has unknown item ID {md_id}")
            }
            Self::InvalidScenarioItem { key, md_id } => {
                write!(
                    formatter,
                    "Pokemon {key:?} has invalid scenario item ID {md_id}"
                )
            }
            Self::UnknownAbility { key, md_id } => {
                write!(formatter, "Pokemon {key:?} has unknown ability ID {md_id}")
            }
            Self::UnknownNature { key, nature_id } => {
                write!(formatter, "Pokemon {key:?} has unknown nature {nature_id}")
            }
            Self::UnknownNatureMdId { key, md_id } => {
                write!(
                    formatter,
                    "Pokemon {key:?} has unknown nature MD ID {md_id}"
                )
            }
            Self::InvalidExactHp {
                key,
                current,
                maximum,
            } => write!(
                formatter,
                "Pokemon {key:?} has invalid exact HP {current}/{maximum}"
            ),
            Self::InvalidMovePp { key, md_id } => {
                write!(formatter, "Pokemon {key:?} has invalid PP for move {md_id}")
            }
            Self::InvalidSupremeOverlordState { key, fallen_allies } => write!(
                formatter,
                "Pokemon {key:?} has invalid Supreme Overlord fallen-allies count {fallen_allies}"
            ),
            Self::ObservedConflict { key, field } => {
                write!(
                    formatter,
                    "scenario conflicts with observed {field} for Pokemon {key:?}"
                )
            }
        }
    }
}

impl std::error::Error for StateAdapterError {}

pub fn normalize_battle_state(
    snapshot: &SnapshotEnvelope,
    overlay: &ScenarioOverlay,
    catalog: &MechanicsCatalog,
) -> Result<EngineBattleState, StateAdapterError> {
    if !snapshot.state.available {
        return Err(StateAdapterError::BattleUnavailable);
    }
    let team_scenarios = index_team_scenarios(overlay)?;
    let scenarios = index_scenarios(overlay)?;
    let snapshot_keys = snapshot_keys(&snapshot.state)?;
    let snapshot_teams = snapshot
        .state
        .teams
        .iter()
        .map(|team| team.team_index)
        .collect::<BTreeSet<_>>();
    for team_index in team_scenarios.keys() {
        if !snapshot_teams.contains(team_index) {
            return Err(StateAdapterError::MissingTeam(*team_index));
        }
    }
    for key in scenarios.keys() {
        if !snapshot_keys.contains(key) {
            return Err(StateAdapterError::MissingPokemon(*key));
        }
    }

    let mut teams = snapshot
        .state
        .teams
        .iter()
        .map(|team| {
            normalize_team(
                team,
                team_scenarios.get(&team.team_index).copied(),
                &scenarios,
                catalog,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;

    for pending in &overlay.pending_move_targets {
        if !snapshot_keys.contains(&pending.actor) {
            return Err(StateAdapterError::MissingPokemon(pending.actor));
        }
        if !snapshot_keys.contains(&pending.target) {
            return Err(StateAdapterError::MissingPokemon(pending.target));
        }
        let actor = teams
            .iter_mut()
            .find(|team| team.team_index == pending.actor.team_index)
            .and_then(|team| {
                team.pokemon
                    .iter_mut()
                    .find(|pokemon| pokemon.key == pending.actor)
            })
            .ok_or(StateAdapterError::MissingPokemon(pending.actor))?;
        let effect = actor
            .volatile_effects
            .iter_mut()
            .find(|effect| effect.execute_id == pending.md_id)
            .ok_or(StateAdapterError::MissingPendingMoveEffect {
                actor: pending.actor,
                md_id: pending.md_id,
            })?;
        let encoded_team =
            i16::try_from(pending.target.team_index.saturating_add(1)).map_err(|_| {
                StateAdapterError::PendingMoveTargetConflict {
                    actor: pending.actor,
                    md_id: pending.md_id,
                }
            })?;
        let observed_target = (effect.target_execute_kind > 0).then_some(PokemonKey {
            team_index: i32::from(effect.target_execute_kind) - 1,
            group_index: effect.target_execute_id,
        });
        if observed_target.is_some_and(|target| target != pending.target) {
            return Err(StateAdapterError::PendingMoveTargetConflict {
                actor: pending.actor,
                md_id: pending.md_id,
            });
        }
        effect.target_execute_kind = encoded_team;
        effect.target_execute_id = pending.target.group_index;
    }

    Ok(EngineBattleState {
        source_state_hash: snapshot.state_hash.clone(),
        battle_rule: snapshot.state.battle_rule,
        battle_type: snapshot.state.battle_type,
        battle_stage_md_id: snapshot.state.battle_stage_md_id,
        local_team_index: snapshot.state.local_team_index,
        elapsed_turns: snapshot.state.world.elapsed_turns,
        weather_md_id: snapshot.state.world.weather_md_id,
        weather_lifespan_turns: snapshot.state.world.weather_lifespan_turns,
        weather_elapsed_turns: snapshot.state.world.weather_elapsed_turns,
        world: snapshot.state.world.clone(),
        teams,
    })
}

fn normalize_team(
    team: &TeamSnapshot,
    scenario: Option<&TeamScenario>,
    scenarios: &BTreeMap<PokemonKey, &PokemonScenario>,
    catalog: &MechanicsCatalog,
) -> Result<EngineTeam, StateAdapterError> {
    let pokemon = team
        .pokemon
        .iter()
        .map(|entry| {
            let key = PokemonKey {
                team_index: team.team_index,
                group_index: entry.group_index,
            };
            if entry.is_local_team != team.is_local_player {
                return Err(StateAdapterError::TeamLocalityMismatch(key));
            }
            normalize_pokemon(
                entry,
                key,
                team.is_local_player,
                scenarios.get(&key).copied(),
                catalog,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;

    let observed_order = observed_team_order(team);
    let assumed_order = scenario.map(|value| value.pokemon_order.clone());
    let pokemon_order = match (observed_order, assumed_order) {
        (Knowledge::Known { value, provenance }, Some(assumption)) => {
            if value != assumption {
                return Err(StateAdapterError::TeamObservedConflict {
                    team_index: team.team_index,
                    field: "Pokemon order",
                });
            }
            Knowledge::Known { value, provenance }
        }
        (known @ Knowledge::Known { .. }, None) => known,
        (Knowledge::Unknown, Some(value)) => Knowledge::assumed(value),
        (Knowledge::Unknown, None) => Knowledge::Unknown,
    };
    validate_team_order(team, &pokemon_order)?;

    Ok(EngineTeam {
        team_index: team.team_index,
        is_local_player: team.is_local_player,
        selected_entry: team.selected_entry,
        waiting_for_action: team.waiting_for_action,
        pokemon_order,
        revealed_group_indices: team.selected_group_indices.clone(),
        pokemon,
    })
}

fn observed_team_order(team: &TeamSnapshot) -> Knowledge<Vec<i32>> {
    let mut selected = team
        .pokemon
        .iter()
        .filter(|pokemon| pokemon.selection_order >= 0)
        .map(|pokemon| (pokemon.selection_order, pokemon.group_index))
        .collect::<Vec<_>>();
    selected.sort_unstable_by_key(|(selection_order, _)| *selection_order);

    let contiguous_selection_order = selected
        .iter()
        .enumerate()
        .all(|(expected, (actual, _))| *actual == expected as i32);
    let unique_group_count = selected
        .iter()
        .map(|(_, group_index)| *group_index)
        .collect::<BTreeSet<_>>()
        .len();

    if !selected.is_empty() && contiguous_selection_order && unique_group_count == selected.len() {
        // Live Champions snapshots use TeamSnapshot::pokemon_order for indices
        // inside the selected-team array. Those indices change as active slots
        // rotate, so the stable roster group order must be reconstructed from
        // each Pokemon's selection_order instead.
        if selected.len() != team.pokemon_order.len() {
            return Knowledge::Unknown;
        }
        return Knowledge::observed(
            selected
                .into_iter()
                .map(|(_, group_index)| group_index)
                .collect(),
        );
    }

    // Retain compatibility with older fixtures that populated pokemon_order
    // directly and did not provide valid per-Pokemon selection metadata.
    if team.pokemon_order.is_empty() {
        Knowledge::Unknown
    } else {
        Knowledge::observed(team.pokemon_order.clone())
    }
}

fn normalize_pokemon(
    pokemon: &PokemonSnapshot,
    key: PokemonKey,
    is_local_team: bool,
    scenario: Option<&PokemonScenario>,
    catalog: &MechanicsCatalog,
) -> Result<EnginePokemon, StateAdapterError> {
    let species_candidates = catalog
        .species_by_num(pokemon.personal_id)
        .map(|entry| entry.id.clone())
        .collect::<Vec<_>>();
    if species_candidates.is_empty() {
        return Err(StateAdapterError::UnknownSpecies {
            key,
            personal_id: pokemon.personal_id,
        });
    }
    let observed_species = if species_candidates.len() == 1 {
        Knowledge::observed(species_candidates[0].clone())
    } else {
        Knowledge::Unknown
    };
    let assumed_species = scenario
        .and_then(|value| value.species_id.as_ref())
        .map(|value| value.to_ascii_lowercase());
    if let Some(species) = &assumed_species
        && !species_candidates
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(species))
    {
        return Err(StateAdapterError::UnknownSpecies {
            key,
            personal_id: pokemon.personal_id,
        });
    }
    let species_id = merge_knowledge(observed_species, assumed_species, key, "species form")?;

    let observed_item = if is_local_team {
        Knowledge::observed((pokemon.item_md_id > 0).then_some(pokemon.item_md_id))
    } else if pokemon.item_md_id > 0 {
        Knowledge::observed(Some(pokemon.item_md_id))
    } else {
        Knowledge::Unknown
    };
    if pokemon.item_md_id > 0 && catalog.items_by_num(pokemon.item_md_id).next().is_none() {
        return Err(StateAdapterError::UnknownItem {
            key,
            md_id: pokemon.item_md_id,
        });
    }
    let assumed_item = scenario
        .and_then(|value| value.item_md_id)
        .map(|md_id| {
            if md_id < 0 {
                Err(StateAdapterError::InvalidScenarioItem { key, md_id })
            } else {
                Ok((md_id > 0).then_some(md_id))
            }
        })
        .transpose()?;
    let item_md_id = merge_knowledge(observed_item, assumed_item, key, "item")?;
    if let Some(Some(item)) = item_md_id.value()
        && catalog.items_by_num(*item).next().is_none()
    {
        return Err(StateAdapterError::UnknownItem { key, md_id: *item });
    }
    let item_enables_mega = item_md_id
        .value()
        .and_then(|item| *item)
        .is_some_and(|item| {
            catalog.items_by_num(item).any(|record| {
                !record.mega_stone.is_empty()
                    && species_candidates.iter().any(|candidate| {
                        record.mega_stone.contains_key(candidate)
                            || catalog.species_by_id(candidate).is_some_and(|species| {
                                record.mega_stone.keys().any(|base_id| {
                                    catalog.species_by_id(base_id).is_some_and(|base| {
                                        base.base_species == species.base_species
                                    })
                                })
                            })
                    })
            })
        });

    let observed_ability = if pokemon.ability_md_id > 0 {
        if catalog
            .abilities_by_num(pokemon.ability_md_id)
            .next()
            .is_none()
        {
            return Err(StateAdapterError::UnknownAbility {
                key,
                md_id: pokemon.ability_md_id,
            });
        }
        Knowledge::observed(pokemon.ability_md_id)
    } else {
        Knowledge::Unknown
    };
    let ability_md_id = merge_knowledge(
        observed_ability,
        scenario.and_then(|value| value.ability_md_id),
        key,
        "ability",
    )?;
    if let Some(ability) = ability_md_id.value()
        && catalog.abilities_by_num(*ability).next().is_none()
    {
        return Err(StateAdapterError::UnknownAbility {
            key,
            md_id: *ability,
        });
    }
    let supreme_overlord_fallen_allies =
        scenario.and_then(|value| value.supreme_overlord_fallen_allies);
    if let Some(fallen_allies) = supreme_overlord_fallen_allies
        && (!(0..=5).contains(&fallen_allies)
            || ability_md_id.value().is_none_or(|ability_md_id| {
                catalog
                    .abilities_by_num(*ability_md_id)
                    .all(|ability| ability.id != "supremeoverlord")
            }))
    {
        return Err(StateAdapterError::InvalidSupremeOverlordState { key, fallen_allies });
    }

    let observed_training = training_from_snapshot(pokemon.base_points.as_ref(), is_local_team);
    let training_points = merge_knowledge(
        observed_training,
        scenario.and_then(|value| value.training_points),
        key,
        "training points",
    )?;

    let observed_nature = if is_local_team || pokemon.nature_correction_md_id > 0 {
        let nature = catalog
            .nature_by_champions_md_id(pokemon.nature_correction_md_id)
            .ok_or(StateAdapterError::UnknownNatureMdId {
                key,
                md_id: pokemon.nature_correction_md_id,
            })?;
        Knowledge::observed(nature.id.clone())
    } else {
        Knowledge::Unknown
    };
    let assumed_nature = if let Some(nature) = scenario.and_then(|value| value.nature_id.as_ref()) {
        if catalog
            .pack()
            .natures
            .iter()
            .all(|entry| !entry.id.eq_ignore_ascii_case(nature))
        {
            return Err(StateAdapterError::UnknownNature {
                key,
                nature_id: nature.clone(),
            });
        }
        Some(nature.to_ascii_lowercase())
    } else {
        None
    };
    let nature_id = merge_knowledge(observed_nature, assumed_nature, key, "nature")?;

    let observed_moves = if pokemon.moves.is_empty() && !is_local_team {
        Knowledge::Unknown
    } else {
        Knowledge::observed(
            pokemon
                .moves
                .iter()
                .map(|entry| observed_move(entry, key, catalog))
                .collect::<Result<Vec<_>, _>>()?,
        )
    };
    let assumed_moves = scenario
        .and_then(|value| value.moves.as_ref())
        .map(|moves| {
            moves
                .iter()
                .enumerate()
                .map(|(slot_index, entry)| scenario_move(entry, slot_index, key, catalog))
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()?;
    let moves = merge_knowledge(observed_moves, assumed_moves, key, "moves")?;

    let assumed_exact = scenario.and_then(|value| value.exact_hp.clone());
    if let Some(exact) = &assumed_exact {
        validate_exact_hp(key, exact)?;
        if let HpObservation::Exact { current, maximum } = pokemon.hp_observation(is_local_team)
            && (current != exact.current || maximum != exact.maximum)
        {
            return Err(StateAdapterError::ObservedConflict { key, field: "HP" });
        }
    }

    Ok(EnginePokemon {
        key,
        personal_id: pokemon.personal_id,
        form_no: pokemon.form_no,
        species_candidates,
        species_id,
        gender: pokemon.gender,
        side_index: pokemon.side_index,
        position_index: pokemon.position_index,
        entered_field: pokemon.entered_field,
        needs_change: pokemon.needs_change,
        move_select_auto: pokemon.move_select_auto,
        change_select_locked: pokemon.change_select_locked,
        hp: HpKnowledge {
            observed: pokemon.hp_observation(is_local_team).into(),
            assumed_exact,
        },
        item_md_id,
        ability_md_id,
        supreme_overlord_fallen_allies,
        training_points,
        nature_md_id: (is_local_team || pokemon.nature_correction_md_id > 0)
            .then_some(pokemon.nature_correction_md_id),
        nature_id,
        moves,
        status_condition: pokemon.status_condition,
        fainted: pokemon.fainted,
        stat_stages: pokemon.stat_stages.clone(),
        type_1: pokemon.type_1,
        type_2: pokemon.type_2,
        extra_type: pokemon.extra_type,
        substitute: pokemon.substitute,
        volatile_effects: pokemon.volatile_effects.clone(),
        field_effects: pokemon.field_effects.clone(),
        can_mega: pokemon.can_mega || (item_enables_mega && !pokemon.mega_mode),
        mega_locked: pokemon.mega_locked,
        mega_mode: pokemon.mega_mode,
    })
}

fn observed_move(
    move_snapshot: &MoveSnapshot,
    key: PokemonKey,
    catalog: &MechanicsCatalog,
) -> Result<EngineMove, StateAdapterError> {
    if catalog.move_by_num(move_snapshot.md_id).is_none() {
        return Err(StateAdapterError::UnknownMove {
            key,
            md_id: move_snapshot.md_id,
        });
    }
    if move_snapshot.current_pp < 0
        || move_snapshot.max_pp < 0
        || move_snapshot.current_pp > move_snapshot.max_pp
    {
        return Err(StateAdapterError::InvalidMovePp {
            key,
            md_id: move_snapshot.md_id,
        });
    }
    Ok(EngineMove {
        md_id: move_snapshot.md_id,
        slot_index: Some(move_snapshot.slot_index),
        current_pp: Some(move_snapshot.current_pp),
        max_pp: Some(move_snapshot.max_pp),
        locked: move_snapshot.locked,
        target: Some(move_snapshot.target),
        move_type: Some(move_snapshot.move_type),
    })
}

fn scenario_move(
    scenario: &ScenarioMove,
    fallback_slot_index: usize,
    key: PokemonKey,
    catalog: &MechanicsCatalog,
) -> Result<EngineMove, StateAdapterError> {
    if catalog.move_by_num(scenario.md_id).is_none() {
        return Err(StateAdapterError::UnknownMove {
            key,
            md_id: scenario.md_id,
        });
    }
    if scenario.current_pp.is_some_and(|value| value < 0)
        || scenario.max_pp.is_some_and(|value| value < 0)
        || matches!((scenario.current_pp, scenario.max_pp), (Some(current), Some(maximum)) if current > maximum)
    {
        return Err(StateAdapterError::InvalidMovePp {
            key,
            md_id: scenario.md_id,
        });
    }
    Ok(EngineMove {
        md_id: scenario.md_id,
        slot_index: scenario
            .slot_index
            .or_else(|| i32::try_from(fallback_slot_index).ok()),
        current_pp: scenario.current_pp,
        max_pp: scenario.max_pp,
        locked: scenario.locked.unwrap_or(false),
        target: None,
        move_type: None,
    })
}

fn merge_knowledge<T: Clone + PartialEq>(
    observed: Knowledge<T>,
    assumed: Option<T>,
    key: PokemonKey,
    field: &'static str,
) -> Result<Knowledge<T>, StateAdapterError> {
    match (observed, assumed) {
        (Knowledge::Known { value, provenance }, Some(assumption)) => {
            if value != assumption {
                Err(StateAdapterError::ObservedConflict { key, field })
            } else {
                Ok(Knowledge::Known { value, provenance })
            }
        }
        (known @ Knowledge::Known { .. }, None) => Ok(known),
        (Knowledge::Unknown, Some(value)) => Ok(Knowledge::assumed(value)),
        (Knowledge::Unknown, None) => Ok(Knowledge::Unknown),
    }
}

fn training_from_snapshot(
    points: Option<&BasePoints>,
    is_local_team: bool,
) -> Knowledge<TrainingPoints> {
    let Some(points) = points else {
        return Knowledge::Unknown;
    };
    let training = TrainingPoints {
        hp: i32::from(points.hp),
        attack: i32::from(points.attack),
        defense: i32::from(points.defense),
        special_attack: i32::from(points.special_attack),
        special_defense: i32::from(points.special_defense),
        speed: i32::from(points.speed),
    };
    if is_local_team || training != TrainingPoints::default() {
        Knowledge::observed(training)
    } else {
        Knowledge::Unknown
    }
}

fn validate_exact_hp(key: PokemonKey, hp: &ExactHp) -> Result<(), StateAdapterError> {
    if hp.maximum <= 0 || hp.current < 0 || hp.current > hp.maximum {
        return Err(StateAdapterError::InvalidExactHp {
            key,
            current: hp.current,
            maximum: hp.maximum,
        });
    }
    Ok(())
}

fn validate_team_order(
    team: &TeamSnapshot,
    pokemon_order: &Knowledge<Vec<i32>>,
) -> Result<(), StateAdapterError> {
    let Some(order) = pokemon_order.value() else {
        return Ok(());
    };
    if order.is_empty() || order.len() > 4 {
        return Err(StateAdapterError::InvalidTeamOrder(team.team_index));
    }
    let roster = team
        .pokemon
        .iter()
        .map(|pokemon| pokemon.group_index)
        .collect::<BTreeSet<_>>();
    let unique = order.iter().copied().collect::<BTreeSet<_>>();
    if unique.len() != order.len() || unique.iter().any(|group| !roster.contains(group)) {
        return Err(StateAdapterError::InvalidTeamOrder(team.team_index));
    }
    Ok(())
}

fn index_team_scenarios(
    overlay: &ScenarioOverlay,
) -> Result<BTreeMap<i32, &TeamScenario>, StateAdapterError> {
    let mut scenarios = BTreeMap::new();
    for scenario in &overlay.teams {
        if scenarios.insert(scenario.team_index, scenario).is_some() {
            return Err(StateAdapterError::DuplicateTeamScenario(
                scenario.team_index,
            ));
        }
    }
    Ok(scenarios)
}

fn index_scenarios(
    overlay: &ScenarioOverlay,
) -> Result<BTreeMap<PokemonKey, &PokemonScenario>, StateAdapterError> {
    let mut scenarios = BTreeMap::new();
    for scenario in &overlay.pokemon {
        if scenarios.insert(scenario.key, scenario).is_some() {
            return Err(StateAdapterError::DuplicateScenarioKey(scenario.key));
        }
    }
    Ok(scenarios)
}

fn snapshot_keys(state: &BattleStateSnapshot) -> Result<BTreeSet<PokemonKey>, StateAdapterError> {
    let mut keys = BTreeSet::new();
    for team in &state.teams {
        for pokemon in &team.pokemon {
            let key = PokemonKey {
                team_index: team.team_index,
                group_index: pokemon.group_index,
            };
            if !keys.insert(key) {
                return Err(StateAdapterError::DuplicatePokemon(key));
            }
        }
    }
    Ok(keys)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{OpponentObservability, SourceIdentity, WorldSnapshot, load_mechanics_pack};

    const PACK: &[u8] = include_bytes!("../data/champions-mechanics-v1.json");
    const CHECKSUM: &[u8] = include_bytes!("../data/champions-mechanics-v1.json.sha256");
    const LIVE_PRIVATE_MATCH_TURN_ZERO: &[u8] = include_bytes!(
        "../fixtures/replays/private-rain-2026-07-15/snapshots/private-identical-six-turn0.json"
    );

    fn catalog() -> MechanicsCatalog {
        load_mechanics_pack(PACK, CHECKSUM).expect("mechanics pack should validate")
    }

    fn pokemon(personal_id: i32, group_index: i32, local: bool) -> PokemonSnapshot {
        PokemonSnapshot {
            personal_id,
            group_index,
            team_group_index: group_index,
            is_local_team: local,
            max_hp: if local { 167 } else { 170 },
            current_hp: if local { 41 } else { 170 },
            raw_hp_ratio: if local { 2_455 } else { 7_500 },
            item_md_id: if local { 275 } else { -1 },
            ability_md_id: if local { 2 } else { 56 },
            nature_correction_md_id: if local { 5 } else { 0 },
            base_points: Some(if local {
                BasePoints {
                    hp: 32,
                    special_attack: 32,
                    speed: 2,
                    ..BasePoints::default()
                }
            } else {
                BasePoints::default()
            }),
            moves: if local {
                vec![MoveSnapshot {
                    md_id: 542,
                    slot_index: 0,
                    current_pp: 11,
                    max_pp: 12,
                    target: 1,
                    move_type: 2,
                    ..MoveSnapshot::default()
                }]
            } else {
                Vec::new()
            },
            ..PokemonSnapshot::default()
        }
    }

    fn snapshot() -> SnapshotEnvelope {
        SnapshotEnvelope {
            schema_version: 1,
            captured_at: "2026-07-15T15:00:00Z".to_owned(),
            state_hash: "0123456789abcdef".to_owned(),
            source: SourceIdentity {
                bundle_id: crate::SUPPORTED_BUNDLE_ID.to_owned(),
                app_version: crate::SUPPORTED_APP_VERSION.to_owned(),
                app_build: crate::SUPPORTED_APP_BUILD.to_owned(),
                unity_framework_sha256: crate::SUPPORTED_UNITY_FRAMEWORK_SHA256.to_owned(),
                unity_framework_uuid: crate::SUPPORTED_UNITY_FRAMEWORK_UUID.to_owned(),
                offset_profile: crate::SUPPORTED_OFFSET_PROFILE.to_owned(),
            },
            state: BattleStateSnapshot {
                available: true,
                battle_rule: 5,
                battle_type: 1,
                local_team_index: 1,
                world: WorldSnapshot {
                    elapsed_turns: 1,
                    weather_md_id: 2,
                    weather_lifespan_turns: 5,
                    weather_elapsed_turns: 1,
                    ..WorldSnapshot::default()
                },
                teams: vec![
                    TeamSnapshot {
                        team_index: 0,
                        is_local_player: false,
                        pokemon: vec![pokemon(700, 0, false)],
                        ..TeamSnapshot::default()
                    },
                    TeamSnapshot {
                        team_index: 1,
                        is_local_player: true,
                        pokemon: vec![pokemon(279, 0, true)],
                        ..TeamSnapshot::default()
                    },
                ],
                opponent_observability: OpponentObservability {
                    remote_pokemon: 1,
                    remote_with_moves: 0,
                    remote_with_items: 0,
                    remote_with_abilities: 1,
                    remote_with_base_points: 0,
                },
                ..BattleStateSnapshot::default()
            },
        }
    }

    #[test]
    fn preserves_observed_fields_and_marks_remote_redactions_unknown() {
        let catalog = catalog();
        let normalized = normalize_battle_state(&snapshot(), &ScenarioOverlay::default(), &catalog)
            .expect("snapshot should normalize");
        let remote = &normalized.teams[0].pokemon[0];
        let local = &normalized.teams[1].pokemon[0];
        assert_eq!(remote.item_md_id, Knowledge::Unknown);
        assert_eq!(remote.moves, Knowledge::Unknown);
        assert_eq!(remote.training_points, Knowledge::Unknown);
        assert_eq!(remote.ability_md_id, Knowledge::observed(56));
        assert_eq!(
            remote.hp.observed,
            SerializableHpObservation::RatioBasisPoints {
                basis_points: 7_500
            }
        );
        assert_eq!(local.item_md_id, Knowledge::observed(Some(275)));
        assert!(matches!(
            local.moves,
            Knowledge::Known {
                provenance: Provenance::Observed,
                ..
            }
        ));
        assert_eq!(
            local.hp.observed,
            SerializableHpObservation::Exact {
                current: 41,
                maximum: 167
            }
        );
    }

    #[test]
    fn merges_a_complete_remote_scenario_with_assumption_provenance() {
        let catalog = catalog();
        let overlay = ScenarioOverlay {
            teams: Vec::new(),
            pending_move_targets: Vec::new(),
            pokemon: vec![PokemonScenario {
                key: PokemonKey {
                    team_index: 0,
                    group_index: 0,
                },
                species_id: None,
                exact_hp: Some(ExactHp {
                    current: 127,
                    maximum: 170,
                }),
                item_md_id: Some(275),
                ability_md_id: Some(56),
                supreme_overlord_fallen_allies: None,
                training_points: Some(TrainingPoints {
                    hp: 32,
                    special_attack: 32,
                    speed: 2,
                    ..TrainingPoints::default()
                }),
                nature_id: Some("modest".to_owned()),
                moves: Some(vec![ScenarioMove {
                    md_id: 542,
                    slot_index: None,
                    current_pp: Some(12),
                    max_pp: Some(12),
                    locked: Some(false),
                }]),
            }],
        };
        let normalized =
            normalize_battle_state(&snapshot(), &overlay, &catalog).expect("overlay should merge");
        let remote = &normalized.teams[0].pokemon[0];
        assert_eq!(remote.item_md_id, Knowledge::assumed(Some(275)));
        assert_eq!(remote.ability_md_id, Knowledge::observed(56));
        assert!(matches!(
            remote.moves,
            Knowledge::Known {
                provenance: Provenance::ScenarioAssumption,
                ..
            }
        ));
        assert_eq!(
            remote.hp.assumed_exact,
            Some(ExactHp {
                current: 127,
                maximum: 170
            })
        );
    }

    #[test]
    fn rejects_scenarios_that_conflict_with_observed_local_fields() {
        let catalog = catalog();
        let overlay = ScenarioOverlay {
            teams: Vec::new(),
            pending_move_targets: Vec::new(),
            pokemon: vec![PokemonScenario {
                key: PokemonKey {
                    team_index: 1,
                    group_index: 0,
                },
                species_id: None,
                exact_hp: None,
                item_md_id: Some(220),
                ability_md_id: None,
                supreme_overlord_fallen_allies: None,
                training_points: None,
                nature_id: None,
                moves: None,
            }],
        };
        let error = normalize_battle_state(&snapshot(), &overlay, &catalog)
            .expect_err("conflicting item must fail");
        assert!(matches!(
            error,
            StateAdapterError::ObservedConflict { field: "item", .. }
        ));
    }

    #[test]
    fn rejects_unknown_move_ids_in_scenarios() {
        let catalog = catalog();
        let overlay = ScenarioOverlay {
            teams: Vec::new(),
            pending_move_targets: Vec::new(),
            pokemon: vec![PokemonScenario {
                key: PokemonKey {
                    team_index: 0,
                    group_index: 0,
                },
                species_id: None,
                exact_hp: None,
                item_md_id: None,
                ability_md_id: None,
                supreme_overlord_fallen_allies: None,
                training_points: None,
                nature_id: None,
                moves: Some(vec![ScenarioMove {
                    md_id: 999_999,
                    slot_index: None,
                    current_pp: None,
                    max_pp: None,
                    locked: None,
                }]),
            }],
        };
        let error = normalize_battle_state(&snapshot(), &overlay, &catalog)
            .expect_err("unknown move must fail");
        assert!(matches!(error, StateAdapterError::UnknownMove { .. }));
    }

    #[test]
    fn supplies_hidden_remote_team_order_as_an_explicit_assumption() {
        let catalog = catalog();
        let mut snapshot = snapshot();
        snapshot.state.teams[0].pokemon = (0..4)
            .map(|group_index| pokemon(700, group_index, false))
            .collect();
        snapshot.state.opponent_observability.remote_pokemon = 4;
        snapshot.state.opponent_observability.remote_with_abilities = 4;
        let overlay = ScenarioOverlay {
            teams: vec![TeamScenario {
                team_index: 0,
                pokemon_order: vec![2, 0, 3, 1],
            }],
            pokemon: Vec::new(),
            pending_move_targets: Vec::new(),
        };

        let normalized = normalize_battle_state(&snapshot, &overlay, &catalog)
            .expect("hidden order should merge");
        assert_eq!(
            normalized.teams[0].pokemon_order,
            Knowledge::assumed(vec![2, 0, 3, 1])
        );
    }

    #[test]
    fn rejects_team_order_that_conflicts_with_observed_order() {
        let catalog = catalog();
        let mut snapshot = snapshot();
        snapshot.state.teams[1].pokemon_order = vec![0];
        let overlay = ScenarioOverlay {
            teams: vec![TeamScenario {
                team_index: 1,
                pokemon_order: vec![1],
            }],
            pokemon: Vec::new(),
            pending_move_targets: Vec::new(),
        };

        let error = normalize_battle_state(&snapshot, &overlay, &catalog)
            .expect_err("observed team order must win");
        assert!(matches!(
            error,
            StateAdapterError::TeamObservedConflict {
                team_index: 1,
                field: "Pokemon order"
            }
        ));
    }

    #[test]
    fn derives_live_local_roster_order_from_selection_order() {
        let snapshot = crate::parse_and_validate_snapshot(LIVE_PRIVATE_MATCH_TURN_ZERO)
            .expect("checked-in live fixture should validate");
        let normalized = normalize_battle_state(&snapshot, &ScenarioOverlay::default(), &catalog())
            .expect("live fixture should normalize");
        let local = normalized
            .teams
            .iter()
            .find(|team| team.is_local_player)
            .expect("fixture should contain the local team");

        assert_eq!(local.pokemon_order, Knowledge::observed(vec![1, 0, 3, 5]));
    }

    #[test]
    fn leaves_partial_selection_metadata_unknown_instead_of_trusting_internal_indices() {
        let mut team = TeamSnapshot {
            pokemon_order: vec![0, 1, 2, 3],
            pokemon: (0..6)
                .map(|group_index| {
                    let mut pokemon = pokemon(700, group_index, true);
                    pokemon.selection_order = -1;
                    pokemon
                })
                .collect(),
            ..TeamSnapshot::default()
        };
        team.pokemon[1].selection_order = 0;
        team.pokemon[4].selection_order = 1;

        assert_eq!(observed_team_order(&team), Knowledge::Unknown);
    }

    #[test]
    fn preserves_legacy_fixture_order_when_selection_metadata_is_invalid() {
        let team = TeamSnapshot {
            pokemon_order: vec![2, 0, 3, 1],
            pokemon: (0..4)
                .map(|group_index| pokemon(700, group_index, true))
                .collect(),
            ..TeamSnapshot::default()
        };

        assert_eq!(
            observed_team_order(&team),
            Knowledge::observed(vec![2, 0, 3, 1])
        );
    }
}
