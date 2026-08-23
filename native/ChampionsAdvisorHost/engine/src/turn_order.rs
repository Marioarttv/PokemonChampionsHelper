use crate::{
    BattleAction, MathError, MechanicsCatalog, PokemonKey, Rational, SideJointPlan,
    SimulationState, apply_stat_stage,
};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct TurnOrderContext {
    pub trick_room: bool,
    #[serde(default)]
    pub modifiers: Vec<ActorOrderModifier>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActorOrderModifier {
    pub actor: PokemonKey,
    pub priority_delta: i8,
    pub speed_multiplier: Rational,
    pub force_last: bool,
}

impl ActorOrderModifier {
    pub fn neutral(actor: PokemonKey) -> Self {
        Self {
            actor,
            priority_delta: 0,
            speed_multiplier: Rational::ONE,
            force_last: false,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ActionPhase {
    Switch,
    Move,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OrderedAction {
    pub action: BattleAction,
    pub phase: ActionPhase,
    pub effective_priority: i16,
    pub effective_speed: i32,
    pub force_last: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct BranchProbability {
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TurnOrderBranch {
    pub probability: BranchProbability,
    pub actions: Vec<OrderedAction>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TurnOrderError {
    DuplicateTeamPlan(i32),
    MissingPokemon(PokemonKey),
    DuplicateActor(PokemonKey),
    DuplicateModifier(PokemonKey),
    ModifierForUnqueuedActor(PokemonKey),
    UnknownMove { actor: PokemonKey, md_id: i32 },
    InvalidSpeedMultiplier(PokemonKey),
    UnsupportedMegaOrder(PokemonKey),
    Math(MathError),
    TooManyTieBranches(usize),
}

impl Display for TurnOrderError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateTeamPlan(team_index) => {
                write!(
                    formatter,
                    "turn contains duplicate plan for team {team_index}"
                )
            }
            Self::MissingPokemon(key) => write!(formatter, "missing Pokemon {key:?}"),
            Self::DuplicateActor(key) => write!(formatter, "turn queues Pokemon {key:?} twice"),
            Self::DuplicateModifier(key) => {
                write!(formatter, "turn-order context repeats Pokemon {key:?}")
            }
            Self::ModifierForUnqueuedActor(key) => {
                write!(
                    formatter,
                    "turn-order modifier references unqueued Pokemon {key:?}"
                )
            }
            Self::UnknownMove { actor, md_id } => {
                write!(formatter, "Pokemon {actor:?} has unknown move {md_id}")
            }
            Self::InvalidSpeedMultiplier(key) => {
                write!(formatter, "Pokemon {key:?} has an invalid speed multiplier")
            }
            Self::UnsupportedMegaOrder(key) => write!(
                formatter,
                "Pokemon {key:?} requires Mega-form stat materialization before turn ordering"
            ),
            Self::Math(error) => Display::fmt(error, formatter),
            Self::TooManyTieBranches(count) => {
                write!(formatter, "turn-order tie expands to {count} branches")
            }
        }
    }
}

impl std::error::Error for TurnOrderError {}

impl From<MathError> for TurnOrderError {
    fn from(value: MathError) -> Self {
        Self::Math(value)
    }
}

pub fn resolve_turn_order(
    state: &SimulationState,
    plans: &[SideJointPlan],
    context: TurnOrderContext,
    catalog: &MechanicsCatalog,
) -> Result<Vec<TurnOrderBranch>, TurnOrderError> {
    validate_team_plans(plans)?;
    let actions = plans
        .iter()
        .flat_map(|plan| plan.actions.iter())
        .collect::<Vec<_>>();
    let actors = actions
        .iter()
        .map(|action| action.actor())
        .collect::<BTreeSet<_>>();
    if actors.len() != actions.len() {
        let mut seen = BTreeSet::new();
        let duplicate = actions
            .iter()
            .map(|action| action.actor())
            .find(|actor| !seen.insert(*actor))
            .expect("actor counts prove a duplicate exists");
        return Err(TurnOrderError::DuplicateActor(duplicate));
    }
    let modifiers = index_modifiers(&context.modifiers, &actors)?;
    let mut queued = actions
        .into_iter()
        .map(|action| queue_action(state, action, modifiers.get(&action.actor()), catalog))
        .collect::<Result<Vec<_>, _>>()?;
    queued.sort_by(|left, right| compare_queued(left, right, context.trick_room));

    let tie_groups = split_tie_groups(&queued, context.trick_room);
    let mut branch_actions = vec![Vec::<OrderedAction>::new()];
    for group in tie_groups {
        let permutations = permutations(group);
        let projected_count = branch_actions.len().saturating_mul(permutations.len());
        if projected_count > 24 {
            return Err(TurnOrderError::TooManyTieBranches(projected_count));
        }
        let mut expanded = Vec::with_capacity(projected_count);
        for partial in &branch_actions {
            for permutation in &permutations {
                let mut branch = partial.clone();
                branch.extend(permutation.iter().cloned());
                expanded.push(branch);
            }
        }
        branch_actions = expanded;
    }
    let denominator = u32::try_from(branch_actions.len()).unwrap_or(u32::MAX);
    Ok(branch_actions
        .into_iter()
        .map(|actions| TurnOrderBranch {
            probability: BranchProbability {
                numerator: 1,
                denominator,
            },
            actions,
        })
        .collect())
}

fn validate_team_plans(plans: &[SideJointPlan]) -> Result<(), TurnOrderError> {
    let mut teams = BTreeSet::new();
    for plan in plans {
        if !teams.insert(plan.team_index) {
            return Err(TurnOrderError::DuplicateTeamPlan(plan.team_index));
        }
    }
    Ok(())
}

fn index_modifiers(
    modifiers: &[ActorOrderModifier],
    queued_actors: &BTreeSet<PokemonKey>,
) -> Result<BTreeMap<PokemonKey, ActorOrderModifier>, TurnOrderError> {
    let mut indexed = BTreeMap::new();
    for modifier in modifiers {
        if !queued_actors.contains(&modifier.actor) {
            return Err(TurnOrderError::ModifierForUnqueuedActor(modifier.actor));
        }
        if modifier.speed_multiplier.denominator <= 0 || modifier.speed_multiplier.numerator < 0 {
            return Err(TurnOrderError::InvalidSpeedMultiplier(modifier.actor));
        }
        if indexed.insert(modifier.actor, *modifier).is_some() {
            return Err(TurnOrderError::DuplicateModifier(modifier.actor));
        }
    }
    Ok(indexed)
}

fn queue_action(
    state: &SimulationState,
    action: &BattleAction,
    modifier: Option<&ActorOrderModifier>,
    catalog: &MechanicsCatalog,
) -> Result<OrderedAction, TurnOrderError> {
    let actor_key = action.actor();
    let actor = state
        .pokemon(actor_key)
        .ok_or(TurnOrderError::MissingPokemon(actor_key))?;
    let modifier = modifier
        .copied()
        .unwrap_or_else(|| ActorOrderModifier::neutral(actor_key));
    let phase = if matches!(
        action,
        BattleAction::Switch { .. } | BattleAction::Automatic { .. }
    ) {
        ActionPhase::Switch
    } else {
        ActionPhase::Move
    };
    let base_priority = match action {
        BattleAction::UseMove { md_id, .. } => {
            catalog
                .move_by_num(*md_id)
                .ok_or(TurnOrderError::UnknownMove {
                    actor: actor_key,
                    md_id: *md_id,
                })?
                .priority
        }
        BattleAction::Switch { .. }
        | BattleAction::Struggle { .. }
        | BattleAction::Automatic { .. } => 0,
    };
    let staged_speed = apply_stat_stage(actor.stats.speed, actor.stat_stages.speed)?;
    let effective_speed = modifier.speed_multiplier.apply_floor(staged_speed)?;
    Ok(OrderedAction {
        action: action.clone(),
        phase,
        effective_priority: i16::from(base_priority) + i16::from(modifier.priority_delta),
        effective_speed,
        force_last: modifier.force_last,
    })
}

fn compare_queued(left: &OrderedAction, right: &OrderedAction, trick_room: bool) -> Ordering {
    left.phase
        .cmp(&right.phase)
        .then_with(|| right.effective_priority.cmp(&left.effective_priority))
        .then_with(|| left.force_last.cmp(&right.force_last))
        .then_with(|| {
            if trick_room {
                left.effective_speed.cmp(&right.effective_speed)
            } else {
                right.effective_speed.cmp(&left.effective_speed)
            }
        })
        .then_with(|| left.action.actor().cmp(&right.action.actor()))
}

fn same_order_bucket(left: &OrderedAction, right: &OrderedAction) -> bool {
    left.phase == right.phase
        && left.effective_priority == right.effective_priority
        && left.force_last == right.force_last
        && left.effective_speed == right.effective_speed
}

fn split_tie_groups(queued: &[OrderedAction], _trick_room: bool) -> Vec<Vec<OrderedAction>> {
    let mut groups = Vec::<Vec<OrderedAction>>::new();
    for action in queued {
        if let Some(group) = groups.last_mut()
            && same_order_bucket(&group[0], action)
        {
            group.push(action.clone());
            continue;
        }
        groups.push(vec![action.clone()]);
    }
    groups
}

fn permutations(group: Vec<OrderedAction>) -> Vec<Vec<OrderedAction>> {
    if group.len() <= 1 {
        return vec![group];
    }
    let mut output = Vec::new();
    let mut used = vec![false; group.len()];
    let mut current = Vec::with_capacity(group.len());
    build_permutations(&group, &mut used, &mut current, &mut output);
    output
}

fn build_permutations(
    group: &[OrderedAction],
    used: &mut [bool],
    current: &mut Vec<OrderedAction>,
    output: &mut Vec<Vec<OrderedAction>>,
) {
    if current.len() == group.len() {
        output.push(current.clone());
        return;
    }
    for index in 0..group.len() {
        if used[index] {
            continue;
        }
        used[index] = true;
        current.push(group[index].clone());
        build_permutations(group, used, current, output);
        current.pop();
        used[index] = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        BattlePosition, BattleStats, SimulationMove, SimulationPokemon, SimulationTeam, StatStages,
        TrainingPoints, WorldSnapshot, load_mechanics_pack,
    };

    const PACK: &[u8] = include_bytes!("../data/champions-mechanics-v1.json");
    const CHECKSUM: &[u8] = include_bytes!("../data/champions-mechanics-v1.json.sha256");

    fn catalog() -> MechanicsCatalog {
        load_mechanics_pack(PACK, CHECKSUM).expect("mechanics pack should validate")
    }

    fn pokemon(team_index: i32, speed: i32) -> SimulationPokemon {
        let key = PokemonKey {
            team_index,
            group_index: 0,
        };
        SimulationPokemon {
            key,
            species_id: "pelipper".to_owned(),
            form_no: 0,
            item_md_id: None,
            ability_md_id: 2,
            nature_id: "hardy".to_owned(),
            training_points: TrainingPoints::default(),
            stats: BattleStats {
                hp: 135,
                attack: 70,
                defense: 120,
                special_attack: 115,
                special_defense: 90,
                speed,
            },
            current_hp: 135,
            status_condition: 0,
            fainted: false,
            stat_stages: StatStages::default(),
            types: vec!["Water".to_owned(), "Flying".to_owned()],
            substitute: false,
            can_mega: false,
            mega_mode: false,
            position: Some(BattlePosition {
                side_index: team_index,
                position_index: 0,
            }),
            moves: vec![SimulationMove {
                md_id: 311,
                slot_index: 0,
                current_pp: 8,
                max_pp: 8,
                locked: false,
            }],
            volatile_effects: Vec::new(),
            field_effects: Vec::new(),
        }
    }

    fn state(left_speed: i32, right_speed: i32) -> SimulationState {
        SimulationState {
            source_state_hash: "0123456789abcdef".to_owned(),
            battle_rule: 5,
            battle_type: 1,
            battle_stage_md_id: 1,
            local_team_index: 0,
            elapsed_turns: 1,
            world: WorldSnapshot::default(),
            teams: vec![
                SimulationTeam {
                    team_index: 0,
                    is_local_player: true,
                    pokemon_order: vec![0],
                    pokemon: vec![pokemon(0, left_speed)],
                },
                SimulationTeam {
                    team_index: 1,
                    is_local_player: false,
                    pokemon_order: vec![0],
                    pokemon: vec![pokemon(1, right_speed)],
                },
            ],
        }
    }

    fn move_action(team_index: i32, md_id: i32) -> BattleAction {
        BattleAction::UseMove {
            actor: PokemonKey {
                team_index,
                group_index: 0,
            },
            md_id,
            slot_index: Some(0),
            target: crate::ActionTarget::Automatic,
            replacement: None,
            mega: false,
        }
    }

    fn plans(left: BattleAction, right: BattleAction) -> Vec<SideJointPlan> {
        vec![
            SideJointPlan {
                team_index: 0,
                actions: vec![left],
            },
            SideJointPlan {
                team_index: 1,
                actions: vec![right],
            },
        ]
    }

    #[test]
    fn move_priority_precedes_speed() {
        let state = state(200, 50);
        let branches = resolve_turn_order(
            &state,
            &plans(move_action(0, 311), move_action(1, 182)),
            TurnOrderContext::default(),
            &catalog(),
        )
        .expect("order should resolve");
        assert_eq!(branches.len(), 1);
        assert_eq!(branches[0].actions[0].action.actor().team_index, 1);
    }

    #[test]
    fn trick_room_reverses_speed_inside_a_priority_bracket() {
        let state = state(200, 50);
        let plans = plans(move_action(0, 311), move_action(1, 311));
        let normal = resolve_turn_order(&state, &plans, TurnOrderContext::default(), &catalog())
            .expect("normal order should resolve");
        assert_eq!(normal[0].actions[0].action.actor().team_index, 0);
        let trick_room = resolve_turn_order(
            &state,
            &plans,
            TurnOrderContext {
                trick_room: true,
                modifiers: Vec::new(),
            },
            &catalog(),
        )
        .expect("Trick Room order should resolve");
        assert_eq!(trick_room[0].actions[0].action.actor().team_index, 1);
    }

    #[test]
    fn speed_ties_are_explicit_equal_probability_branches() {
        let state = state(100, 100);
        let branches = resolve_turn_order(
            &state,
            &plans(move_action(0, 311), move_action(1, 311)),
            TurnOrderContext::default(),
            &catalog(),
        )
        .expect("tie should branch");
        assert_eq!(branches.len(), 2);
        assert!(branches.iter().all(|branch| {
            branch.probability
                == BranchProbability {
                    numerator: 1,
                    denominator: 2,
                }
        }));
        assert_ne!(
            branches[0].actions[0].action.actor(),
            branches[1].actions[0].action.actor()
        );
    }

    #[test]
    fn switches_resolve_before_moves() {
        let mut state = state(50, 200);
        let mut replacement = state.teams[0].pokemon[0].clone();
        replacement.key = PokemonKey {
            team_index: 0,
            group_index: 1,
        };
        replacement.position = None;
        state.teams[0].pokemon.push(replacement);
        let switch = BattleAction::Switch {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            replacement: PokemonKey {
                team_index: 0,
                group_index: 1,
            },
        };
        let branches = resolve_turn_order(
            &state,
            &plans(switch, move_action(1, 182)),
            TurnOrderContext::default(),
            &catalog(),
        )
        .expect("switch order should resolve");
        assert!(matches!(
            branches[0].actions[0].action,
            BattleAction::Switch { .. }
        ));
    }
}
