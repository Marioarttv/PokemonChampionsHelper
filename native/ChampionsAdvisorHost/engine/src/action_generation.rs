use crate::{
    EngineBattleState, EngineMove, EnginePokemon, EngineTeam, MechanicsCatalog, PokemonKey,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fmt::{Display, Formatter};

const STRUGGLE_MOVE_ID: i32 = 165;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ActionTarget {
    Pokemon { key: PokemonKey },
    Automatic,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BattleAction {
    UseMove {
        actor: PokemonKey,
        md_id: i32,
        slot_index: Option<i32>,
        target: ActionTarget,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        replacement: Option<PokemonKey>,
        mega: bool,
    },
    Switch {
        actor: PokemonKey,
        replacement: PokemonKey,
    },
    Struggle {
        actor: PokemonKey,
    },
    Automatic {
        actor: PokemonKey,
    },
}

impl BattleAction {
    pub fn actor(&self) -> PokemonKey {
        match self {
            Self::UseMove { actor, .. }
            | Self::Switch { actor, .. }
            | Self::Struggle { actor }
            | Self::Automatic { actor } => *actor,
        }
    }

    fn replacement(&self) -> Option<PokemonKey> {
        match self {
            Self::Switch { replacement, .. } => Some(*replacement),
            Self::UseMove { replacement, .. } => *replacement,
            _ => None,
        }
    }

    fn uses_mega(&self) -> bool {
        matches!(self, Self::UseMove { mega: true, .. })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActorActionSet {
    pub actor: PokemonKey,
    pub actions: Vec<BattleAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct SideJointPlan {
    pub team_index: i32,
    pub actions: Vec<BattleAction>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActionGenerationError {
    MissingTeam(i32),
    MissingPokemon(PokemonKey),
    NoActivePokemon(i32),
    TooManyActivePokemon {
        team_index: i32,
        actual: usize,
        maximum: usize,
    },
    MissingMoves(PokemonKey),
    MissingPokemonOrder(i32),
    UnknownMove {
        actor: PokemonKey,
        md_id: i32,
    },
    UnsupportedMoveTarget {
        actor: PokemonKey,
        md_id: i32,
        target: String,
    },
    NoLegalActions(PokemonKey),
}

impl Display for ActionGenerationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingTeam(team_index) => write!(formatter, "missing team {team_index}"),
            Self::MissingPokemon(key) => write!(formatter, "missing Pokemon {key:?}"),
            Self::NoActivePokemon(team_index) => {
                write!(formatter, "team {team_index} has no active Pokemon")
            }
            Self::TooManyActivePokemon {
                team_index,
                actual,
                maximum,
            } => write!(
                formatter,
                "team {team_index} has {actual} active Pokemon; maximum is {maximum}"
            ),
            Self::MissingMoves(key) => {
                write!(formatter, "Pokemon {key:?} has no known move set")
            }
            Self::MissingPokemonOrder(team_index) => write!(
                formatter,
                "team {team_index} has no known selected-Pokemon order"
            ),
            Self::UnknownMove { actor, md_id } => {
                write!(formatter, "Pokemon {actor:?} has unknown move ID {md_id}")
            }
            Self::UnsupportedMoveTarget {
                actor,
                md_id,
                target,
            } => write!(
                formatter,
                "Pokemon {actor:?} move {md_id} uses unsupported target class {target}"
            ),
            Self::NoLegalActions(key) => {
                write!(formatter, "Pokemon {key:?} has no legal action")
            }
        }
    }
}

impl std::error::Error for ActionGenerationError {}

pub fn generate_actor_actions(
    state: &EngineBattleState,
    actor: PokemonKey,
    catalog: &MechanicsCatalog,
) -> Result<ActorActionSet, ActionGenerationError> {
    let team = team_by_index(state, actor.team_index)?;
    let pokemon = team
        .pokemon
        .iter()
        .find(|entry| entry.key == actor)
        .ok_or(ActionGenerationError::MissingPokemon(actor))?;

    let switch_actions = generate_switch_actions(team, pokemon)?;
    if pokemon.needs_change {
        if switch_actions.is_empty() {
            return Err(ActionGenerationError::NoLegalActions(actor));
        }
        return Ok(ActorActionSet {
            actor,
            actions: switch_actions,
        });
    }
    if pokemon.move_select_auto {
        return Ok(ActorActionSet {
            actor,
            actions: vec![BattleAction::Automatic { actor }],
        });
    }

    let moves = pokemon
        .moves
        .value()
        .ok_or(ActionGenerationError::MissingMoves(actor))?;
    let active = active_pokemon(state);
    let mega_options = if pokemon.can_mega && !pokemon.mega_locked && !pokemon.mega_mode {
        &[false, true][..]
    } else {
        &[false][..]
    };

    let mut actions = Vec::new();
    let mut selectable_move = false;
    for engine_move in moves {
        if engine_move.locked || engine_move.current_pp == Some(0) {
            continue;
        }
        let move_record =
            catalog
                .move_by_num(engine_move.md_id)
                .ok_or(ActionGenerationError::UnknownMove {
                    actor,
                    md_id: engine_move.md_id,
                })?;
        let targets = targets_for_move(actor, &active, engine_move, &move_record.target)?;
        if targets.is_empty() {
            continue;
        }
        selectable_move = true;
        let pivot_replacements = if move_record
            .mechanics
            .get("selfSwitch")
            .is_some_and(|value| value == &serde_json::Value::Bool(true))
        {
            let replacements = switch_actions
                .iter()
                .filter_map(|action| match action {
                    BattleAction::Switch { replacement, .. } => Some(Some(*replacement)),
                    _ => None,
                })
                .collect::<Vec<_>>();
            if replacements.is_empty() {
                vec![None]
            } else {
                replacements
            }
        } else {
            vec![None]
        };
        for target in targets {
            for mega in mega_options {
                for replacement in &pivot_replacements {
                    actions.push(BattleAction::UseMove {
                        actor,
                        md_id: engine_move.md_id,
                        slot_index: engine_move.slot_index,
                        target: target.clone(),
                        replacement: *replacement,
                        mega: *mega,
                    });
                }
            }
        }
    }
    if !selectable_move {
        if catalog.move_by_num(STRUGGLE_MOVE_ID).is_none() {
            return Err(ActionGenerationError::UnknownMove {
                actor,
                md_id: STRUGGLE_MOVE_ID,
            });
        }
        actions.push(BattleAction::Struggle { actor });
    }
    actions.extend(switch_actions);
    actions.sort();
    actions.dedup();
    if actions.is_empty() {
        return Err(ActionGenerationError::NoLegalActions(actor));
    }
    Ok(ActorActionSet { actor, actions })
}

pub fn generate_joint_plans(
    state: &EngineBattleState,
    team_index: i32,
    catalog: &MechanicsCatalog,
) -> Result<Vec<SideJointPlan>, ActionGenerationError> {
    let team = team_by_index(state, team_index)?;
    let mut actors = team
        .pokemon
        .iter()
        .filter(|pokemon| is_action_actor(pokemon))
        .collect::<Vec<_>>();
    actors.sort_by_key(|pokemon| (pokemon.position_index, pokemon.key));
    if actors.is_empty() {
        return Err(ActionGenerationError::NoActivePokemon(team_index));
    }
    let maximum = catalog.pack().limits.active_pokemon_per_team;
    if actors.len() > maximum {
        return Err(ActionGenerationError::TooManyActivePokemon {
            team_index,
            actual: actors.len(),
            maximum,
        });
    }

    let action_sets = actors
        .iter()
        .map(|pokemon| generate_actor_actions(state, pokemon.key, catalog))
        .collect::<Result<Vec<_>, _>>()?;
    let mut partial_plans = vec![Vec::<BattleAction>::new()];
    for action_set in action_sets {
        let mut expanded = Vec::new();
        for partial in &partial_plans {
            for action in &action_set.actions {
                let mut candidate = partial.clone();
                candidate.push(action.clone());
                if joint_plan_is_legal(&candidate) {
                    expanded.push(candidate);
                }
            }
        }
        partial_plans = expanded;
    }

    let plans = partial_plans
        .into_iter()
        .map(|mut actions| {
            actions.sort_by_key(BattleAction::actor);
            SideJointPlan {
                team_index,
                actions,
            }
        })
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    Ok(plans)
}

fn team_by_index(
    state: &EngineBattleState,
    team_index: i32,
) -> Result<&EngineTeam, ActionGenerationError> {
    state
        .teams
        .iter()
        .find(|team| team.team_index == team_index)
        .ok_or(ActionGenerationError::MissingTeam(team_index))
}

fn is_action_actor(pokemon: &EnginePokemon) -> bool {
    pokemon.side_index >= 0
        && pokemon.position_index >= 0
        && (!pokemon.fainted || pokemon.needs_change)
}

fn active_pokemon(state: &EngineBattleState) -> Vec<&EnginePokemon> {
    state
        .teams
        .iter()
        .flat_map(|team| &team.pokemon)
        .filter(|pokemon| {
            pokemon.side_index >= 0 && pokemon.position_index >= 0 && !pokemon.fainted
        })
        .collect()
}

fn generate_switch_actions(
    team: &EngineTeam,
    actor: &EnginePokemon,
) -> Result<Vec<BattleAction>, ActionGenerationError> {
    if actor.change_select_locked {
        return Ok(Vec::new());
    }
    let order = team
        .pokemon_order
        .value()
        .ok_or(ActionGenerationError::MissingPokemonOrder(team.team_index))?;
    let active_groups = team
        .pokemon
        .iter()
        .filter(|pokemon| {
            pokemon.side_index >= 0 && pokemon.position_index >= 0 && !pokemon.fainted
        })
        .map(|pokemon| pokemon.key.group_index)
        .collect::<BTreeSet<_>>();
    let mut actions = Vec::new();
    for group_index in order {
        let replacement = team
            .pokemon
            .iter()
            .find(|pokemon| pokemon.key.group_index == *group_index)
            .ok_or(ActionGenerationError::MissingPokemon(PokemonKey {
                team_index: team.team_index,
                group_index: *group_index,
            }))?;
        if replacement.fainted || active_groups.contains(group_index) {
            continue;
        }
        actions.push(BattleAction::Switch {
            actor: actor.key,
            replacement: replacement.key,
        });
    }
    Ok(actions)
}

fn targets_for_move(
    actor: PokemonKey,
    active: &[&EnginePokemon],
    engine_move: &EngineMove,
    target_class: &str,
) -> Result<Vec<ActionTarget>, ActionGenerationError> {
    let allies = active
        .iter()
        .filter(|pokemon| pokemon.key.team_index == actor.team_index && pokemon.key != actor)
        .map(|pokemon| ActionTarget::Pokemon { key: pokemon.key })
        .collect::<Vec<_>>();
    let foes = active
        .iter()
        .filter(|pokemon| pokemon.key.team_index != actor.team_index)
        .map(|pokemon| ActionTarget::Pokemon { key: pokemon.key })
        .collect::<Vec<_>>();
    let targets = match target_class {
        "self" => vec![ActionTarget::Pokemon { key: actor }],
        "adjacentAlly" => allies,
        "adjacentAllyOrSelf" => {
            let mut targets = vec![ActionTarget::Pokemon { key: actor }];
            targets.extend(allies);
            targets
        }
        "adjacentFoe" | "normal" => foes,
        "any" => active
            .iter()
            .filter(|pokemon| pokemon.key != actor)
            .map(|pokemon| ActionTarget::Pokemon { key: pokemon.key })
            .collect(),
        "all" | "allAdjacent" | "allAdjacentFoes" | "allies" | "allySide" | "allyTeam"
        | "foeSide" | "randomNormal" => vec![ActionTarget::Automatic],
        unsupported => {
            return Err(ActionGenerationError::UnsupportedMoveTarget {
                actor,
                md_id: engine_move.md_id,
                target: unsupported.to_owned(),
            });
        }
    };
    Ok(targets)
}

fn joint_plan_is_legal(actions: &[BattleAction]) -> bool {
    let mut replacements = BTreeSet::new();
    let mut mega_count = 0;
    for action in actions {
        if let Some(replacement) = action.replacement()
            && !replacements.insert(replacement)
        {
            return false;
        }
        if action.uses_mega() {
            mega_count += 1;
            if mega_count > 1 {
                return false;
            }
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ExactHp, HpKnowledge, Knowledge, Provenance, SerializableHpObservation, StatStages,
        TrainingPoints, load_mechanics_pack,
    };

    const PACK: &[u8] = include_bytes!("../data/champions-mechanics-v1.json");
    const CHECKSUM: &[u8] = include_bytes!("../data/champions-mechanics-v1.json.sha256");

    fn catalog() -> MechanicsCatalog {
        load_mechanics_pack(PACK, CHECKSUM).expect("mechanics pack should validate")
    }

    fn engine_move(md_id: i32, slot_index: i32) -> EngineMove {
        EngineMove {
            md_id,
            slot_index: Some(slot_index),
            current_pp: Some(8),
            max_pp: Some(8),
            locked: false,
            target: None,
            move_type: None,
        }
    }

    fn pokemon(team_index: i32, group_index: i32, position_index: i32) -> EnginePokemon {
        EnginePokemon {
            key: PokemonKey {
                team_index,
                group_index,
            },
            personal_id: if team_index == 0 { 279 } else { 700 },
            form_no: 0,
            species_candidates: vec![if team_index == 0 {
                "pelipper".to_owned()
            } else {
                "sylveon".to_owned()
            }],
            species_id: Knowledge::observed(if team_index == 0 {
                "pelipper".to_owned()
            } else {
                "sylveon".to_owned()
            }),
            gender: 0,
            side_index: if position_index >= 0 { team_index } else { -1 },
            position_index,
            entered_field: position_index >= 0,
            needs_change: false,
            move_select_auto: false,
            change_select_locked: false,
            hp: HpKnowledge {
                observed: SerializableHpObservation::Exact {
                    current: 167,
                    maximum: 167,
                },
                assumed_exact: Some(ExactHp {
                    current: 167,
                    maximum: 167,
                }),
            },
            item_md_id: Knowledge::Known {
                value: None,
                provenance: Provenance::Observed,
            },
            ability_md_id: Knowledge::observed(2),
            supreme_overlord_fallen_allies: None,
            training_points: Knowledge::observed(TrainingPoints::default()),
            nature_md_id: None,
            nature_id: Knowledge::assumed("timid".to_owned()),
            moves: Knowledge::observed(vec![engine_move(311, 0), engine_move(182, 1)]),
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

    fn team(team_index: i32) -> EngineTeam {
        EngineTeam {
            team_index,
            is_local_player: team_index == 0,
            selected_entry: true,
            waiting_for_action: true,
            pokemon_order: Knowledge::observed(vec![0, 1, 2, 3]),
            revealed_group_indices: vec![0, 1],
            pokemon: vec![
                pokemon(team_index, 0, 0),
                pokemon(team_index, 1, 1),
                pokemon(team_index, 2, -1),
                pokemon(team_index, 3, -1),
            ],
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
            world: crate::WorldSnapshot::default(),
            teams: vec![team(0), team(1)],
        }
    }

    #[test]
    fn normal_moves_target_each_foe_and_self_moves_target_the_actor() {
        let state = state();
        let actor = PokemonKey {
            team_index: 0,
            group_index: 0,
        };
        let actions = generate_actor_actions(&state, actor, &catalog())
            .expect("actor actions should generate")
            .actions;
        let weather_ball_targets = actions
            .iter()
            .filter_map(|action| match action {
                BattleAction::UseMove {
                    md_id: 311,
                    target: ActionTarget::Pokemon { key },
                    ..
                } => Some(*key),
                _ => None,
            })
            .collect::<BTreeSet<_>>();
        assert_eq!(
            weather_ball_targets,
            BTreeSet::from([
                PokemonKey {
                    team_index: 1,
                    group_index: 0
                },
                PokemonKey {
                    team_index: 1,
                    group_index: 1
                }
            ])
        );
        assert!(actions.iter().any(|action| matches!(
            action,
            BattleAction::UseMove {
                md_id: 182,
                target: ActionTarget::Pokemon { key },
                ..
            } if *key == actor
        )));
    }

    #[test]
    fn locked_or_empty_moves_fall_back_to_struggle() {
        let mut state = state();
        let actor = state.teams[0].pokemon[0].key;
        {
            let moves = match &mut state.teams[0].pokemon[0].moves {
                Knowledge::Known { value, .. } => value,
                Knowledge::Unknown => panic!("fixture moves should be known"),
            };
            moves[0].current_pp = Some(0);
            moves[1].locked = true;
        }
        let actions = generate_actor_actions(&state, actor, &catalog())
            .expect("Struggle should generate")
            .actions;
        assert!(actions.iter().any(|action| matches!(
            action,
            BattleAction::Struggle { actor: key } if *key == actor
        )));
    }

    #[test]
    fn hidden_moves_or_selected_order_fail_closed() {
        let mut missing_moves_state = state();
        let actor = missing_moves_state.teams[0].pokemon[0].key;
        missing_moves_state.teams[0].pokemon[0].moves = Knowledge::Unknown;
        assert_eq!(
            generate_actor_actions(&missing_moves_state, actor, &catalog())
                .expect_err("moves are required"),
            ActionGenerationError::MissingMoves(actor)
        );

        let mut missing_order_state = state();
        missing_order_state.teams[0].pokemon_order = Knowledge::Unknown;
        assert_eq!(
            generate_actor_actions(&missing_order_state, actor, &catalog())
                .expect_err("order is required"),
            ActionGenerationError::MissingPokemonOrder(0)
        );
    }

    #[test]
    fn mega_is_an_explicit_move_variant_and_only_one_actor_can_use_it() {
        let mut state = state();
        state.teams[0].pokemon[0].can_mega = true;
        state.teams[0].pokemon[1].can_mega = true;
        let actor = state.teams[0].pokemon[0].key;
        let actions = generate_actor_actions(&state, actor, &catalog())
            .expect("Mega variants should generate")
            .actions;
        assert!(
            actions
                .iter()
                .any(|action| matches!(action, BattleAction::UseMove { mega: false, .. }))
        );
        assert!(
            actions
                .iter()
                .any(|action| matches!(action, BattleAction::UseMove { mega: true, .. }))
        );

        let plans = generate_joint_plans(&state, 0, &catalog()).expect("plans should generate");
        assert!(plans.iter().all(|plan| {
            plan.actions
                .iter()
                .filter(|action| action.uses_mega())
                .count()
                <= 1
        }));
    }

    #[test]
    fn joint_plans_never_switch_both_slots_to_the_same_replacement() {
        let state = state();
        let plans = generate_joint_plans(&state, 0, &catalog()).expect("plans should generate");
        assert!(!plans.is_empty());
        assert!(plans.iter().all(|plan| {
            let replacements = plan
                .actions
                .iter()
                .filter_map(BattleAction::replacement)
                .collect::<Vec<_>>();
            replacements.iter().collect::<BTreeSet<_>>().len() == replacements.len()
        }));
    }
}
