use crate::core_damage::SUPREME_OVERLORD_EFFECT_MD_ID;
use crate::{
    BattleStats, EffectSnapshot, EngineBattleState, EngineMove, ExactHp, Knowledge, MathError,
    MechanicsCatalog, PokemonKey, SerializableHpObservation, StatStages, TrainingPoints,
    WorldSnapshot, calculate_battle_stats,
};
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct BattlePosition {
    pub side_index: i32,
    pub position_index: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct SimulationMove {
    pub md_id: i32,
    pub slot_index: i32,
    pub current_pp: i32,
    pub max_pp: i32,
    pub locked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct SimulationPokemon {
    pub key: PokemonKey,
    pub species_id: String,
    pub form_no: i32,
    pub item_md_id: Option<i32>,
    pub ability_md_id: i32,
    pub nature_id: String,
    pub training_points: TrainingPoints,
    pub stats: BattleStats,
    pub current_hp: i32,
    pub status_condition: i32,
    pub fainted: bool,
    pub stat_stages: StatStages,
    pub types: Vec<String>,
    pub substitute: bool,
    pub can_mega: bool,
    pub mega_mode: bool,
    pub position: Option<BattlePosition>,
    pub moves: Vec<SimulationMove>,
    pub volatile_effects: Vec<EffectSnapshot>,
    pub field_effects: Vec<EffectSnapshot>,
}

impl SimulationPokemon {
    pub fn maximum_hp(&self) -> i32 {
        self.stats.hp
    }

    pub fn is_active(&self) -> bool {
        self.position.is_some() && !self.fainted
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct SimulationTeam {
    pub team_index: i32,
    pub is_local_player: bool,
    pub pokemon_order: Vec<i32>,
    pub pokemon: Vec<SimulationPokemon>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct SimulationState {
    pub source_state_hash: String,
    pub battle_rule: u8,
    pub battle_type: u8,
    pub battle_stage_md_id: i32,
    pub local_team_index: i32,
    pub elapsed_turns: i32,
    pub world: WorldSnapshot,
    pub teams: Vec<SimulationTeam>,
}

impl SimulationState {
    pub fn pokemon(&self, key: PokemonKey) -> Option<&SimulationPokemon> {
        self.teams
            .iter()
            .find(|team| team.team_index == key.team_index)
            .and_then(|team| team.pokemon.iter().find(|pokemon| pokemon.key == key))
    }

    pub fn pokemon_mut(&mut self, key: PokemonKey) -> Option<&mut SimulationPokemon> {
        self.teams
            .iter_mut()
            .find(|team| team.team_index == key.team_index)
            .and_then(|team| team.pokemon.iter_mut().find(|pokemon| pokemon.key == key))
    }
}

pub fn mega_target_species_id(
    pokemon: &SimulationPokemon,
    catalog: &MechanicsCatalog,
) -> Option<String> {
    let item_md_id = pokemon.item_md_id?;
    catalog.items_by_num(item_md_id).find_map(|item| {
        item.mega_stone
            .get(&pokemon.species_id)
            .cloned()
            .or_else(|| {
                catalog
                    .species_by_id(&pokemon.species_id)
                    .and_then(|species| {
                        item.mega_stone.iter().find_map(|(base_id, target_id)| {
                            catalog
                                .species_by_id(base_id)
                                .filter(|base| base.base_species == species.base_species)
                                .map(|_| target_id.clone())
                        })
                    })
            })
    })
}

pub fn apply_mega_evolution(
    state: &mut SimulationState,
    actor_key: PokemonKey,
    catalog: &MechanicsCatalog,
) -> Result<(), String> {
    let actor = state
        .pokemon(actor_key)
        .ok_or_else(|| format!("missing Mega actor {actor_key:?}"))?;
    if actor.mega_mode {
        return Ok(());
    }
    if !actor.can_mega {
        return Err(format!(
            "Pokemon {actor_key:?} is not eligible to Mega evolve"
        ));
    }
    let target_id = mega_target_species_id(actor, catalog)
        .ok_or_else(|| format!("Pokemon {actor_key:?} has no matching Mega-stone target"))?;
    let target = catalog.species_by_id(&target_id).ok_or_else(|| {
        format!("Mega target species {target_id} is absent from the mechanics pack")
    })?;
    let target_stats =
        calculate_battle_stats(target, actor.training_points, &actor.nature_id, catalog).map_err(
            |error| format!("could not calculate Mega stats for {actor_key:?}: {error}"),
        )?;
    let target_types = target.types.clone();
    let target_ability = target
        .abilities
        .first()
        .map(|ability| ability.num)
        .ok_or_else(|| format!("Mega target species {target_id} has no ability"))?;
    let old_maximum_hp = actor.maximum_hp();
    let old_current_hp = actor.current_hp;

    let team = state
        .teams
        .iter_mut()
        .find(|team| team.team_index == actor_key.team_index)
        .ok_or_else(|| format!("missing Mega actor team {}", actor_key.team_index))?;
    for pokemon in &mut team.pokemon {
        pokemon.can_mega = false;
    }
    let actor = team
        .pokemon
        .iter_mut()
        .find(|pokemon| pokemon.key == actor_key)
        .ok_or_else(|| format!("missing Mega actor {actor_key:?}"))?;
    actor.species_id = target_id;
    actor.stats = target_stats;
    actor.current_hp = old_current_hp
        .saturating_add(actor.maximum_hp() - old_maximum_hp)
        .clamp(0, actor.maximum_hp());
    actor.types = target_types;
    actor.ability_md_id = target_ability;
    actor.mega_mode = true;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MaterializationError {
    IncompleteField {
        key: PokemonKey,
        field: &'static str,
    },
    IncompleteTeamOrder(i32),
    UnknownSpecies {
        key: PokemonKey,
        species_id: String,
    },
    UnknownMove {
        key: PokemonKey,
        md_id: i32,
    },
    InvalidHp {
        key: PokemonKey,
        current: i32,
        maximum: i32,
    },
    MaximumHpMismatch {
        key: PokemonKey,
        supplied: i32,
        calculated: i32,
    },
    HpRatioMismatch {
        key: PokemonKey,
        observed_basis_points: i32,
        supplied_basis_points: i32,
    },
    InvalidMovePp {
        key: PokemonKey,
        md_id: i32,
    },
    InvalidMoveSlot {
        key: PokemonKey,
        md_id: i32,
        slot_index: i32,
    },
    Math(MathError),
}

impl Display for MaterializationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::IncompleteField { key, field } => {
                write!(formatter, "Pokemon {key:?} is missing exact {field}")
            }
            Self::IncompleteTeamOrder(team_index) => {
                write!(
                    formatter,
                    "team {team_index} is missing its selected Pokemon order"
                )
            }
            Self::UnknownSpecies { key, species_id } => {
                write!(
                    formatter,
                    "Pokemon {key:?} has unknown species {species_id}"
                )
            }
            Self::UnknownMove { key, md_id } => {
                write!(formatter, "Pokemon {key:?} has unknown move {md_id}")
            }
            Self::InvalidHp {
                key,
                current,
                maximum,
            } => write!(
                formatter,
                "Pokemon {key:?} has invalid HP {current}/{maximum}"
            ),
            Self::MaximumHpMismatch {
                key,
                supplied,
                calculated,
            } => write!(
                formatter,
                "Pokemon {key:?} supplied max HP {supplied}, calculated {calculated}"
            ),
            Self::HpRatioMismatch {
                key,
                observed_basis_points,
                supplied_basis_points,
            } => write!(
                formatter,
                "Pokemon {key:?} HP ratio mismatch: observed {observed_basis_points}, supplied {supplied_basis_points} basis points"
            ),
            Self::InvalidMovePp { key, md_id } => {
                write!(formatter, "Pokemon {key:?} has invalid PP for move {md_id}")
            }
            Self::InvalidMoveSlot {
                key,
                md_id,
                slot_index,
            } => write!(
                formatter,
                "Pokemon {key:?} move {md_id} has invalid slot {slot_index}"
            ),
            Self::Math(error) => Display::fmt(error, formatter),
        }
    }
}

impl std::error::Error for MaterializationError {}

impl From<MathError> for MaterializationError {
    fn from(value: MathError) -> Self {
        Self::Math(value)
    }
}

pub fn materialize_simulation_state(
    state: &EngineBattleState,
    catalog: &MechanicsCatalog,
) -> Result<SimulationState, MaterializationError> {
    let mut teams = state
        .teams
        .iter()
        .map(|team| -> Result<SimulationTeam, MaterializationError> {
            let pokemon_order = team
                .pokemon_order
                .value()
                .cloned()
                .ok_or(MaterializationError::IncompleteTeamOrder(team.team_index))?;
            let pokemon = team
                .pokemon
                .iter()
                .map(|entry| materialize_pokemon(entry, catalog))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(SimulationTeam {
                team_index: team.team_index,
                is_local_player: team.is_local_player,
                pokemon_order,
                pokemon,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    for team in &mut teams {
        let fallen_allies = team
            .pokemon
            .iter()
            .filter(|pokemon| team.pokemon_order.contains(&pokemon.key.group_index))
            .filter(|pokemon| pokemon.fainted || pokemon.current_hp <= 0)
            .count()
            .min(5) as i32;
        for pokemon in &mut team.pokemon {
            let supreme_overlord = catalog
                .abilities_by_num(pokemon.ability_md_id)
                .any(|ability| ability.id == "supremeoverlord");
            if supreme_overlord
                && pokemon.is_active()
                && !pokemon.volatile_effects.iter().any(|effect| {
                    effect.md_id == SUPREME_OVERLORD_EFFECT_MD_ID && effect.execute_id == 293
                })
            {
                pokemon.volatile_effects.push(EffectSnapshot {
                    md_id: SUPREME_OVERLORD_EFFECT_MD_ID,
                    execute_kind: 1,
                    execute_id: 293,
                    step_or_count: fallen_allies,
                    ..EffectSnapshot::default()
                });
            }
        }
    }

    Ok(SimulationState {
        source_state_hash: state.source_state_hash.clone(),
        battle_rule: state.battle_rule,
        battle_type: state.battle_type,
        battle_stage_md_id: state.battle_stage_md_id,
        local_team_index: state.local_team_index,
        elapsed_turns: state.elapsed_turns,
        world: state.world.clone(),
        teams,
    })
}

fn materialize_pokemon(
    pokemon: &crate::EnginePokemon,
    catalog: &MechanicsCatalog,
) -> Result<SimulationPokemon, MaterializationError> {
    let species_id = required(&pokemon.species_id, pokemon.key, "species form")?.clone();
    let species =
        catalog
            .species_by_id(&species_id)
            .ok_or_else(|| MaterializationError::UnknownSpecies {
                key: pokemon.key,
                species_id: species_id.clone(),
            })?;
    let nature_id = required(&pokemon.nature_id, pokemon.key, "nature")?.clone();
    let training_points = *required(&pokemon.training_points, pokemon.key, "training points")?;
    let stats = calculate_battle_stats(species, training_points, &nature_id, catalog)?;
    let hp = exact_hp(pokemon)?;
    if hp.maximum != stats.hp {
        return Err(MaterializationError::MaximumHpMismatch {
            key: pokemon.key,
            supplied: hp.maximum,
            calculated: stats.hp,
        });
    }
    validate_hp_observation(pokemon, &hp)?;

    let item_md_id = *required(&pokemon.item_md_id, pokemon.key, "item")?;
    let ability_md_id = *required(&pokemon.ability_md_id, pokemon.key, "ability")?;
    let moves = required(&pokemon.moves, pokemon.key, "moves")?
        .iter()
        .map(|engine_move| materialize_move(pokemon.key, engine_move, catalog))
        .collect::<Result<Vec<_>, _>>()?;

    let inferred_can_mega = item_md_id.is_some_and(|item_md_id| {
        catalog.items_by_num(item_md_id).any(|item| {
            item.mega_stone.contains_key(&species_id)
                || item.mega_stone.iter().any(|(base_id, _)| {
                    catalog
                        .species_by_id(base_id)
                        .is_some_and(|base| base.base_species == species.base_species)
                })
        })
    });

    let mut volatile_effects = pokemon.volatile_effects.clone();
    if let Some(fallen_allies) = pokemon.supreme_overlord_fallen_allies {
        volatile_effects.retain(|effect| effect.md_id != SUPREME_OVERLORD_EFFECT_MD_ID);
        volatile_effects.push(EffectSnapshot {
            md_id: SUPREME_OVERLORD_EFFECT_MD_ID,
            execute_kind: 1,
            execute_id: 293,
            step_or_count: fallen_allies,
            ..EffectSnapshot::default()
        });
    }

    Ok(SimulationPokemon {
        key: pokemon.key,
        species_id,
        form_no: pokemon.form_no,
        item_md_id,
        ability_md_id,
        nature_id,
        training_points,
        stats,
        current_hp: hp.current,
        status_condition: pokemon.status_condition,
        fainted: pokemon.fainted || hp.current == 0,
        stat_stages: pokemon.stat_stages.clone(),
        types: species.types.clone(),
        substitute: pokemon.substitute,
        can_mega: pokemon.can_mega || (!pokemon.mega_mode && inferred_can_mega),
        mega_mode: pokemon.mega_mode,
        position: (pokemon.side_index >= 0 && pokemon.position_index >= 0).then_some(
            BattlePosition {
                side_index: pokemon.side_index,
                position_index: pokemon.position_index,
            },
        ),
        moves,
        volatile_effects,
        field_effects: pokemon.field_effects.clone(),
    })
}

fn required<'a, T>(
    knowledge: &'a Knowledge<T>,
    key: PokemonKey,
    field: &'static str,
) -> Result<&'a T, MaterializationError> {
    knowledge
        .value()
        .ok_or(MaterializationError::IncompleteField { key, field })
}

fn exact_hp(pokemon: &crate::EnginePokemon) -> Result<ExactHp, MaterializationError> {
    let hp = match &pokemon.hp.observed {
        SerializableHpObservation::Exact { current, maximum } => ExactHp {
            current: *current,
            maximum: *maximum,
        },
        SerializableHpObservation::RatioBasisPoints { .. }
        | SerializableHpObservation::Fainted
        | SerializableHpObservation::Unknown => {
            pokemon
                .hp
                .assumed_exact
                .clone()
                .ok_or(MaterializationError::IncompleteField {
                    key: pokemon.key,
                    field: "HP",
                })?
        }
    };
    if hp.maximum <= 0 || hp.current < 0 || hp.current > hp.maximum {
        return Err(MaterializationError::InvalidHp {
            key: pokemon.key,
            current: hp.current,
            maximum: hp.maximum,
        });
    }
    if pokemon.fainted && hp.current != 0 {
        return Err(MaterializationError::InvalidHp {
            key: pokemon.key,
            current: hp.current,
            maximum: hp.maximum,
        });
    }
    Ok(hp)
}

fn validate_hp_observation(
    pokemon: &crate::EnginePokemon,
    exact: &ExactHp,
) -> Result<(), MaterializationError> {
    match pokemon.hp.observed {
        SerializableHpObservation::RatioBasisPoints { basis_points } => {
            let supplied = i64::from(exact.current) * 10_000 / i64::from(exact.maximum);
            let supplied =
                i32::try_from(supplied).map_err(|_| MaterializationError::InvalidHp {
                    key: pokemon.key,
                    current: exact.current,
                    maximum: exact.maximum,
                })?;
            // Remote Champions HP is a rendered bar ratio, not an exact
            // numerator. Accept the nearest integer-HP bucket for the assumed
            // maximum while still rejecting ratios that are materially wrong.
            let quantization_tolerance = (5_000 + exact.maximum - 1) / exact.maximum + 1;
            if (supplied - basis_points).abs() > quantization_tolerance {
                return Err(MaterializationError::HpRatioMismatch {
                    key: pokemon.key,
                    observed_basis_points: basis_points,
                    supplied_basis_points: supplied,
                });
            }
        }
        SerializableHpObservation::Fainted if exact.current != 0 => {
            return Err(MaterializationError::InvalidHp {
                key: pokemon.key,
                current: exact.current,
                maximum: exact.maximum,
            });
        }
        _ => {}
    }
    Ok(())
}

fn materialize_move(
    key: PokemonKey,
    engine_move: &EngineMove,
    catalog: &MechanicsCatalog,
) -> Result<SimulationMove, MaterializationError> {
    if catalog.move_by_num(engine_move.md_id).is_none() {
        return Err(MaterializationError::UnknownMove {
            key,
            md_id: engine_move.md_id,
        });
    }
    let slot_index = engine_move
        .slot_index
        .ok_or(MaterializationError::IncompleteField {
            key,
            field: "move slot",
        })?;
    if !(0..4).contains(&slot_index) {
        return Err(MaterializationError::InvalidMoveSlot {
            key,
            md_id: engine_move.md_id,
            slot_index,
        });
    }
    let current_pp = engine_move
        .current_pp
        .ok_or(MaterializationError::IncompleteField {
            key,
            field: "move PP",
        })?;
    let max_pp = engine_move
        .max_pp
        .ok_or(MaterializationError::IncompleteField {
            key,
            field: "maximum move PP",
        })?;
    if max_pp <= 0 || current_pp < 0 || current_pp > max_pp {
        return Err(MaterializationError::InvalidMovePp {
            key,
            md_id: engine_move.md_id,
        });
    }
    Ok(SimulationMove {
        md_id: engine_move.md_id,
        slot_index,
        current_pp,
        max_pp,
        locked: engine_move.locked,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        EnginePokemon, EngineTeam, HpKnowledge, Provenance, SerializableHpObservation,
        load_mechanics_pack,
    };

    const PACK: &[u8] = include_bytes!("../data/champions-mechanics-v1.json");
    const CHECKSUM: &[u8] = include_bytes!("../data/champions-mechanics-v1.json.sha256");

    fn catalog() -> MechanicsCatalog {
        load_mechanics_pack(PACK, CHECKSUM).expect("mechanics pack should validate")
    }

    fn pokemon() -> EnginePokemon {
        let key = PokemonKey {
            team_index: 0,
            group_index: 0,
        };
        EnginePokemon {
            key,
            personal_id: 279,
            form_no: 0,
            species_candidates: vec!["pelipper".to_owned()],
            species_id: Knowledge::observed("pelipper".to_owned()),
            gender: 0,
            side_index: 0,
            position_index: 0,
            entered_field: true,
            needs_change: false,
            move_select_auto: false,
            change_select_locked: false,
            hp: HpKnowledge {
                observed: SerializableHpObservation::Exact {
                    current: 123,
                    maximum: 167,
                },
                assumed_exact: None,
            },
            item_md_id: Knowledge::Known {
                value: Some(275),
                provenance: Provenance::Observed,
            },
            ability_md_id: Knowledge::observed(2),
            supreme_overlord_fallen_allies: None,
            training_points: Knowledge::observed(TrainingPoints {
                hp: 32,
                special_attack: 32,
                speed: 2,
                ..TrainingPoints::default()
            }),
            nature_md_id: Some(15),
            nature_id: Knowledge::observed("modest".to_owned()),
            moves: Knowledge::observed(vec![EngineMove {
                md_id: 542,
                slot_index: Some(0),
                current_pp: Some(11),
                max_pp: Some(12),
                locked: false,
                target: Some(1),
                move_type: Some(2),
            }]),
            status_condition: 0,
            fainted: false,
            stat_stages: StatStages::default(),
            type_1: 0,
            type_2: 0,
            extra_type: 0,
            substitute: false,
            volatile_effects: Vec::new(),
            field_effects: Vec::new(),
            can_mega: false,
            mega_locked: false,
            mega_mode: false,
        }
    }

    fn state() -> EngineBattleState {
        EngineBattleState {
            source_state_hash: "0123456789abcdef".to_owned(),
            battle_rule: 5,
            battle_type: 1,
            battle_stage_md_id: 1,
            local_team_index: 0,
            elapsed_turns: 1,
            weather_md_id: 0,
            weather_lifespan_turns: 0,
            weather_elapsed_turns: 0,
            world: WorldSnapshot::default(),
            teams: vec![EngineTeam {
                team_index: 0,
                is_local_player: true,
                selected_entry: true,
                waiting_for_action: true,
                pokemon_order: Knowledge::observed(vec![0]),
                revealed_group_indices: vec![0],
                pokemon: vec![pokemon()],
            }],
        }
    }

    #[test]
    fn materializes_complete_knowledge_into_integer_battle_state() {
        let result = materialize_simulation_state(&state(), &catalog())
            .expect("complete state should materialize");
        let pelipper = &result.teams[0].pokemon[0];
        assert_eq!(pelipper.stats.hp, 167);
        assert_eq!(pelipper.current_hp, 123);
        assert_eq!(pelipper.moves[0].current_pp, 11);
        assert!(pelipper.is_active());
    }

    #[test]
    fn rejects_missing_hidden_knowledge_instead_of_inventing_a_default() {
        let mut state = state();
        state.teams[0].pokemon[0].nature_id = Knowledge::Unknown;
        assert_eq!(
            materialize_simulation_state(&state, &catalog()).expect_err("missing nature must fail"),
            MaterializationError::IncompleteField {
                key: PokemonKey {
                    team_index: 0,
                    group_index: 0
                },
                field: "nature"
            }
        );
    }

    #[test]
    fn rejects_hp_that_disagrees_with_calculated_stats() {
        let mut state = state();
        state.teams[0].pokemon[0].hp.observed = SerializableHpObservation::Exact {
            current: 123,
            maximum: 168,
        };
        assert!(matches!(
            materialize_simulation_state(&state, &catalog()),
            Err(MaterializationError::MaximumHpMismatch { .. })
        ));
    }

    #[test]
    fn accepts_the_nearest_integer_hp_for_a_remote_bar_ratio() {
        let mut pokemon = pokemon();
        pokemon.hp.observed = SerializableHpObservation::RatioBasisPoints {
            basis_points: 4_398,
        };

        validate_hp_observation(
            &pokemon,
            &ExactHp {
                current: 87,
                maximum: 197,
            },
        )
        .expect("remote HP bars must allow one half-HP quantization bucket");
    }

    #[test]
    fn rejects_an_assumed_hp_outside_the_remote_bar_bucket() {
        let mut pokemon = pokemon();
        pokemon.hp.observed = SerializableHpObservation::RatioBasisPoints {
            basis_points: 4_398,
        };

        assert!(matches!(
            validate_hp_observation(
                &pokemon,
                &ExactHp {
                    current: 100,
                    maximum: 197,
                },
            ),
            Err(MaterializationError::HpRatioMismatch { .. })
        ));
    }

    #[test]
    fn infers_mega_eligibility_from_the_matching_mega_stone() {
        let catalog = catalog();
        let mut state = state();
        let swampert = catalog
            .species_by_id("swampert")
            .expect("Swampert should be present");
        let stats = calculate_battle_stats(swampert, TrainingPoints::default(), "hardy", &catalog)
            .expect("Swampert stats should calculate");
        let pokemon = &mut state.teams[0].pokemon[0];
        pokemon.personal_id = swampert.num;
        pokemon.species_candidates = vec!["swampert".to_owned()];
        pokemon.species_id = Knowledge::observed("swampert".to_owned());
        pokemon.item_md_id = Knowledge::Known {
            value: Some(752),
            provenance: Provenance::ScenarioAssumption,
        };
        pokemon.ability_md_id = Knowledge::observed(67);
        pokemon.training_points = Knowledge::observed(TrainingPoints::default());
        pokemon.nature_id = Knowledge::observed("hardy".to_owned());
        pokemon.hp.observed = SerializableHpObservation::Exact {
            current: stats.hp,
            maximum: stats.hp,
        };

        let result = materialize_simulation_state(&state, &catalog)
            .expect("matching Mega Stone should materialize");
        assert!(result.teams[0].pokemon[0].can_mega);
        assert_eq!(
            mega_target_species_id(&result.teams[0].pokemon[0], &catalog).as_deref(),
            Some("swampertmega")
        );
    }

    #[test]
    fn mega_evolution_updates_form_stats_and_ability_while_preserving_damage() {
        let catalog = catalog();
        let swampert = catalog
            .species_by_id("swampert")
            .expect("Swampert should be present");
        let stats = calculate_battle_stats(swampert, TrainingPoints::default(), "hardy", &catalog)
            .expect("Swampert stats should calculate");
        let key = PokemonKey {
            team_index: 0,
            group_index: 0,
        };
        let partner_key = PokemonKey {
            team_index: 0,
            group_index: 1,
        };
        let actor = SimulationPokemon {
            key,
            species_id: "swampert".to_owned(),
            form_no: 0,
            item_md_id: Some(752),
            ability_md_id: 67,
            nature_id: "hardy".to_owned(),
            training_points: TrainingPoints::default(),
            stats,
            current_hp: stats.hp - 17,
            status_condition: 0,
            fainted: false,
            stat_stages: StatStages::default(),
            types: vec!["Water".to_owned(), "Ground".to_owned()],
            substitute: false,
            can_mega: true,
            mega_mode: false,
            position: Some(BattlePosition {
                side_index: 0,
                position_index: 0,
            }),
            moves: Vec::new(),
            volatile_effects: Vec::new(),
            field_effects: Vec::new(),
        };
        let mut partner = actor.clone();
        partner.key = partner_key;
        partner.position = Some(BattlePosition {
            side_index: 0,
            position_index: 1,
        });
        let mut state = SimulationState {
            source_state_hash: "mega-test".to_owned(),
            battle_rule: 5,
            battle_type: 1,
            battle_stage_md_id: 1,
            local_team_index: 0,
            elapsed_turns: 0,
            world: WorldSnapshot::default(),
            teams: vec![SimulationTeam {
                team_index: 0,
                is_local_player: true,
                pokemon_order: vec![0, 1],
                pokemon: vec![actor, partner],
            }],
        };

        apply_mega_evolution(&mut state, key, &catalog).expect("Swampert should Mega evolve");
        let transformed = state.pokemon(key).expect("actor should remain present");
        assert_eq!(transformed.species_id, "swampertmega");
        assert_eq!(transformed.ability_md_id, 33);
        assert_eq!(transformed.current_hp, transformed.maximum_hp() - 17);
        assert!(transformed.stats.attack > stats.attack);
        assert!(transformed.stats.speed > stats.speed);
        assert!(transformed.mega_mode);
        assert!(
            state.teams[0]
                .pokemon
                .iter()
                .all(|pokemon| !pokemon.can_mega)
        );
    }
}
