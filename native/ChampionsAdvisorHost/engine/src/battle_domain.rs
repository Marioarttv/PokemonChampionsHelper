use crate::core_damage::{CoreDamageRequest, calculate_core_damage, resolve_static_damage_move};
use crate::turn_execution::{
    FLINCH_EFFECT_MD_ID, PROTECT_ACTIVE_EFFECT_MD_ID, WIDE_GUARD_SIDE_EFFECT_MD_ID,
    pending_electro_shot_effect, pending_electro_shot_target,
};
use crate::{
    ActionTarget, BattleAction, BattlePosition, ChanceSuccessor, CoreExecutionContext,
    CoreExecutionEvent, CriticalHitMode, ExactProbability, MechanicsCatalog, OrderedAction,
    PokemonKey, Rational, SearchDomain, SideJointPlan, SideSnapshot, SimulationPokemon,
    SimulationState, TurnOrderContext, apply_mega_evolution, execute_core_action,
    mega_target_species_id, resolve_turn_order, type_multiplier,
};
use crate::{ActorOrderModifier, weather::effective_weather_for_pokemon};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::hash::{DefaultHasher, Hash, Hasher};

const TERMINAL_SCORE: i64 = 1_000_000_000;
const MAX_SUCCESSOR_BRANCHES: usize = 4_096;
const TAILWIND_SIDE_EFFECT_MD_ID: i32 = 8;
const PROTECT_CHAIN_EFFECT_MD_ID: i32 = 66;
const ELECTRO_SHOT_CHARGE_EFFECT_MD_ID: i32 = 17;
const ELECTRO_SHOT_MD_ID: i32 = 905;
const PROTECT_MD_ID: i32 = 182;
const TAILWIND_MD_ID: i32 = 366;
const WIDE_GUARD_MD_ID: i32 = 469;
const SUCKER_PUNCH_MD_ID: i32 = 389;
const SUPPORTED_ABILITY_IDS: &[&str] = &[
    "adaptability",
    "airlock",
    "ballfetch",
    "chlorophyll",
    "cloudnine",
    "defiant",
    "drizzle",
    "honeygather",
    "hospitality",
    "keeneye",
    "runaway",
    "roughskin",
    "stamina",
    "supremeoverlord",
    "swiftswim",
    "torrent",
];
const SUPPORTED_ITEM_IDS: &[&str] = &[
    "babiriberry",
    "chartiberry",
    "chilanberry",
    "chopleberry",
    "choicescarf",
    "cobaberry",
    "colburberry",
    "focussash",
    "goldberry",
    "habanberry",
    "kasibberry",
    "kebiaberry",
    "leftovers",
    "lifeorb",
    "occaberry",
    "passhoberry",
    "payapaberry",
    "rindoberry",
    "roseliberry",
    "shucaberry",
    "sitrusberry",
    "tangaberry",
    "utilityumbrella",
    "wacanberry",
    "yacheberry",
];
const SPREAD_DAMAGE_MARKER_EFFECT_MD_ID: i32 = -294;

#[derive(Debug)]
pub struct CoreBattleDomain<'catalog> {
    catalog: &'catalog MechanicsCatalog,
    maximum_successor_branches: usize,
    critical_hit_mode: CriticalHitMode,
}

impl<'catalog> CoreBattleDomain<'catalog> {
    pub fn new(catalog: &'catalog MechanicsCatalog) -> Self {
        Self {
            catalog,
            maximum_successor_branches: MAX_SUCCESSOR_BRANCHES,
            critical_hit_mode: CriticalHitMode::Random,
        }
    }

    pub fn with_maximum_successor_branches(
        catalog: &'catalog MechanicsCatalog,
        maximum_successor_branches: usize,
    ) -> Self {
        Self {
            catalog,
            maximum_successor_branches: maximum_successor_branches.max(1),
            critical_hit_mode: CriticalHitMode::Random,
        }
    }

    pub fn with_critical_hit_mode(mut self, critical_hit_mode: CriticalHitMode) -> Self {
        self.critical_hit_mode = critical_hit_mode;
        self
    }

    #[cfg(test)]
    fn with_branch_limit(catalog: &'catalog MechanicsCatalog, limit: usize) -> Self {
        Self::with_maximum_successor_branches(catalog, limit)
    }

    pub fn validate_supported_state(&self, state: &SimulationState) -> Result<(), String> {
        if !state.world.field_effects.is_empty()
            || state.world.sides.iter().any(|side| {
                side.positions
                    .iter()
                    .any(|position| !position.field_effects.is_empty())
            })
        {
            return Err(
                "global or position effects are not implemented by the core battle domain"
                    .to_owned(),
            );
        }
        for side in &state.world.sides {
            for effect in &side.field_effects {
                if effect.md_id != TAILWIND_SIDE_EFFECT_MD_ID
                    && effect.md_id != WIDE_GUARD_SIDE_EFFECT_MD_ID
                {
                    return Err(format!(
                        "side {} has unsupported field effect {}",
                        side.side_index, effect.md_id
                    ));
                }
            }
        }
        if matches!(state.world.weather_md_id, 3 | 4 | 8) {
            return Err(format!(
                "weather {} requires an end-of-turn residual resolver",
                state.world.weather_md_id
            ));
        }
        for pokemon in state.teams.iter().flat_map(|team| &team.pokemon) {
            if pokemon.status_condition != 0 {
                return Err(format!(
                    "Pokemon {:?} has unresolved status condition {}",
                    pokemon.key, pokemon.status_condition
                ));
            }
            if pokemon.substitute {
                return Err(format!(
                    "Pokemon {:?} has an unresolved Substitute",
                    pokemon.key
                ));
            }
            let unsupported_volatile_effects = pokemon
                .volatile_effects
                .iter()
                .filter(|effect| {
                    !((effect.md_id == ELECTRO_SHOT_CHARGE_EFFECT_MD_ID
                        && effect.execute_id == ELECTRO_SHOT_MD_ID)
                        || (matches!(
                            effect.md_id,
                            PROTECT_ACTIVE_EFFECT_MD_ID | PROTECT_CHAIN_EFFECT_MD_ID
                        ) && matches!(effect.execute_id, PROTECT_MD_ID | WIDE_GUARD_MD_ID))
                        || effect.md_id == FLINCH_EFFECT_MD_ID)
                })
                .count();
            let electro_shot_effects = pokemon
                .volatile_effects
                .iter()
                .filter(|effect| {
                    effect.md_id == ELECTRO_SHOT_CHARGE_EFFECT_MD_ID
                        && effect.execute_id == ELECTRO_SHOT_MD_ID
                })
                .count();
            if unsupported_volatile_effects > 0
                || electro_shot_effects > 1
                || !pokemon.field_effects.is_empty()
            {
                return Err(format!(
                    "Pokemon {:?} has unresolved volatile or field effects",
                    pokemon.key
                ));
            }
            if let Some(item_md_id) = pokemon.item_md_id.filter(|item| *item != 0) {
                let items = self.catalog.items_by_num(item_md_id).collect::<Vec<_>>();
                if items.is_empty()
                    || items.iter().any(|item| {
                        !SUPPORTED_ITEM_IDS.contains(&item.id.as_str())
                            && item.mega_stone.is_empty()
                    })
                {
                    return Err(format!(
                        "Pokemon {:?} holds unsupported core item {item_md_id}",
                        pokemon.key
                    ));
                }
            }
            if pokemon.can_mega
                && !pokemon.mega_mode
                && mega_target_species_id(pokemon, self.catalog).is_none()
            {
                return Err(format!(
                    "Pokemon {:?} can Mega evolve but has no resolvable Mega target",
                    pokemon.key
                ));
            }
            if pokemon.ability_md_id != 0 {
                let abilities = self
                    .catalog
                    .abilities_by_num(pokemon.ability_md_id)
                    .collect::<Vec<_>>();
                if abilities.is_empty()
                    || abilities
                        .iter()
                        .any(|ability| !SUPPORTED_ABILITY_IDS.contains(&ability.id.as_str()))
                {
                    return Err(format!(
                        "Pokemon {:?} ability {} is outside the supported core whitelist",
                        pokemon.key, pokemon.ability_md_id
                    ));
                }
            }
        }
        Ok(())
    }

    fn legal_joint_plans(
        &self,
        state: &SimulationState,
        team_index: i32,
    ) -> Result<Vec<SideJointPlan>, String> {
        self.validate_supported_state(state)?;
        let team = state
            .teams
            .iter()
            .find(|team| team.team_index == team_index)
            .ok_or_else(|| format!("missing simulation team {team_index}"))?;
        let forced_team_indices = state
            .teams
            .iter()
            .filter(|candidate| {
                candidate
                    .pokemon
                    .iter()
                    .any(|pokemon| pokemon.position.is_some() && !is_alive(pokemon))
            })
            .map(|candidate| candidate.team_index)
            .collect::<BTreeSet<_>>();
        if !forced_team_indices.is_empty() && !forced_team_indices.contains(&team_index) {
            return Ok(vec![SideJointPlan {
                team_index,
                actions: Vec::new(),
            }]);
        }

        let replacement_phase = forced_team_indices.contains(&team_index);
        let mut actors = team
            .pokemon
            .iter()
            .filter(|pokemon| {
                pokemon.position.is_some() && (!replacement_phase || !is_alive(pokemon))
            })
            .collect::<Vec<_>>();
        actors.sort_by_key(|pokemon| {
            (
                pokemon
                    .position
                    .map(|position| position.position_index)
                    .unwrap_or(i32::MAX),
                pokemon.key,
            )
        });
        if actors.is_empty() {
            return Ok(Vec::new());
        }
        let forced_actor_count = actors.len();
        let available_replacement_count = team
            .pokemon
            .iter()
            .filter(|pokemon| {
                team.pokemon_order.contains(&pokemon.key.group_index)
                    && pokemon.position.is_none()
                    && is_alive(pokemon)
            })
            .count();
        let required_replacement_count = forced_actor_count.min(available_replacement_count);
        let permits_vacant_slot =
            replacement_phase && required_replacement_count < forced_actor_count;

        let mut products = vec![Vec::<BattleAction>::new()];
        for actor in actors {
            let mut actions = self.actor_actions(state, team, actor)?;
            if permits_vacant_slot {
                actions.push(BattleAction::Automatic { actor: actor.key });
            }
            if actions.is_empty() {
                return Err(format!("Pokemon {:?} has no legal core action", actor.key));
            }
            let mut expanded = Vec::new();
            for product in &products {
                for action in &actions {
                    let mut candidate = product.clone();
                    candidate.push(action.clone());
                    if joint_actions_are_legal(&candidate) {
                        expanded.push(candidate);
                    }
                }
            }
            products = expanded;
        }
        if replacement_phase {
            products.retain(|actions| {
                actions
                    .iter()
                    .filter(|action| matches!(action, BattleAction::Switch { .. }))
                    .count()
                    == required_replacement_count
            });
        }
        let mut plans = products
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
        plans.sort_by(|left, right| {
            plan_state_order_score(state, right, self.catalog)
                .cmp(&plan_state_order_score(state, left, self.catalog))
                .then_with(|| {
                    plan_order_score(right, self.catalog).cmp(&plan_order_score(left, self.catalog))
                })
                .then_with(|| left.cmp(right))
        });
        Ok(plans)
    }

    fn actor_actions(
        &self,
        state: &SimulationState,
        team: &crate::SimulationTeam,
        actor: &SimulationPokemon,
    ) -> Result<Vec<BattleAction>, String> {
        let switches = switch_actions(team, actor);
        if !is_alive(actor) {
            return Ok(switches);
        }
        if let Some(effect) = pending_electro_shot_effect(actor) {
            let target = pending_electro_shot_target(effect).ok_or_else(|| {
                format!(
                    "Pokemon {:?} has a pending Electro Shot whose selected target is not exposed",
                    actor.key
                )
            })?;
            if state
                .pokemon(target)
                .is_none_or(|pokemon| pokemon.position.is_none() || !is_alive(pokemon))
            {
                return Err(format!(
                    "Pokemon {:?} has a pending Electro Shot aimed at a target that is no longer active",
                    actor.key
                ));
            }
            let simulation_move = actor
                .moves
                .iter()
                .find(|simulation_move| simulation_move.md_id == ELECTRO_SHOT_MD_ID)
                .ok_or_else(|| {
                    format!(
                        "Pokemon {:?} has a pending Electro Shot but no Electro Shot move slot",
                        actor.key
                    )
                })?;
            return Ok(vec![BattleAction::UseMove {
                actor: actor.key,
                md_id: ELECTRO_SHOT_MD_ID,
                slot_index: Some(simulation_move.slot_index),
                target: ActionTarget::Pokemon { key: target },
                replacement: None,
                mega: false,
            }]);
        }
        let active = active_pokemon(state);
        let mega_options = if actor.can_mega && !actor.mega_mode {
            &[false, true][..]
        } else {
            &[false][..]
        };
        let mut actions = Vec::new();
        for simulation_move in &actor.moves {
            if simulation_move.locked || simulation_move.current_pp <= 0 {
                continue;
            }
            let move_record = self
                .catalog
                .move_by_num(simulation_move.md_id)
                .ok_or_else(|| format!("unknown move {}", simulation_move.md_id))?;
            let targets =
                direct_targets(actor.key, &active, &move_record.target).ok_or_else(|| {
                    format!(
                        "move {} ({}) uses unresolved target class {}",
                        move_record.name, move_record.num, move_record.target
                    )
                })?;
            let pivot_replacements = if move_record
                .mechanics
                .get("selfSwitch")
                .is_some_and(|value| value == &serde_json::Value::Bool(true))
            {
                let replacements = switches
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
                            actor: actor.key,
                            md_id: simulation_move.md_id,
                            slot_index: Some(simulation_move.slot_index),
                            target: target.clone(),
                            replacement: *replacement,
                            mega: *mega,
                        });
                    }
                }
            }
        }
        if actions.is_empty() {
            return Err(format!(
                "Pokemon {:?} requires unresolved Struggle or automatic action handling",
                actor.key
            ));
        }
        actions.extend(switches);
        actions.sort();
        actions.dedup();
        Ok(actions)
    }

    fn resolve_joint_turn(
        &self,
        state: &SimulationState,
        left: &SideJointPlan,
        right: &SideJointPlan,
    ) -> Result<Vec<ChanceSuccessor<SimulationState>>, String> {
        self.validate_supported_state(state)?;
        let mut prepared_state = state.clone();
        prepare_start_of_turn(&mut prepared_state);
        for action in left.actions.iter().chain(&right.actions) {
            if matches!(action, BattleAction::UseMove { mega: true, .. }) {
                apply_mega_evolution(&mut prepared_state, action.actor(), self.catalog)?;
            }
        }
        self.validate_supported_state(&prepared_state)?;
        let initial_positions = prepared_state
            .teams
            .iter()
            .flat_map(|team| &team.pokemon)
            .filter_map(|pokemon| pokemon.position.map(|position| (pokemon.key, position)))
            .collect::<BTreeMap<_, _>>();
        let order_branches = resolve_turn_order(
            &prepared_state,
            &[left.clone(), right.clone()],
            TurnOrderContext {
                trick_room: false,
                modifiers: weather_speed_modifiers(&prepared_state, left, right, self.catalog)?,
            },
            self.catalog,
        )
        .map_err(|error| format!("turn order failed: {error}"))?;
        let mut completed = Vec::<PendingBranch>::new();
        for order_branch in order_branches {
            let probability = ExactProbability::new(
                u64::from(order_branch.probability.numerator),
                u64::from(order_branch.probability.denominator),
            )
            .map_err(|error| error.to_string())?;
            let mut pending = vec![PendingBranch {
                probability,
                state: prepared_state.clone(),
            }];
            let mut acted = BTreeSet::<PokemonKey>::new();
            for ordered in order_branch.actions {
                let sucker_can_succeed =
                    sucker_punch_can_succeed(&ordered.action, left, right, &acted, self.catalog);
                let mut expanded = Vec::new();
                for branch in pending {
                    let Some(action) =
                        retarget_action(&branch.state, &ordered.action, &initial_positions)?
                    else {
                        expanded.push(branch);
                        continue;
                    };
                    let actor = action.actor();
                    if !action_actor_can_execute(&branch.state, &action) {
                        expanded.push(branch);
                        continue;
                    }
                    if branch.state.pokemon(actor).is_some_and(|pokemon| {
                        pokemon
                            .volatile_effects
                            .iter()
                            .any(|effect| effect.md_id == FLINCH_EFFECT_MD_ID)
                    }) {
                        let mut flinched = branch.state;
                        flinched
                            .pokemon_mut(actor)
                            .expect("the active actor was checked immediately before mutation")
                            .volatile_effects
                            .retain(|effect| effect.md_id != FLINCH_EFFECT_MD_ID);
                        expanded.push(PendingBranch {
                            probability: branch.probability,
                            state: flinched,
                        });
                        continue;
                    }
                    if !sucker_can_succeed {
                        let BattleAction::UseMove {
                            actor,
                            md_id,
                            slot_index,
                            ..
                        } = action
                        else {
                            unreachable!("only Sucker Punch can fail this conditional check")
                        };
                        let mut failed = consume_status_move(
                            &branch.state,
                            actor,
                            md_id,
                            slot_index,
                            self.catalog,
                        )?;
                        failed
                            .pokemon_mut(actor)
                            .ok_or_else(|| format!("missing failed-move actor {actor:?}"))?
                            .volatile_effects
                            .retain(|effect| {
                                !matches!(
                                    effect.md_id,
                                    PROTECT_ACTIVE_EFFECT_MD_ID | PROTECT_CHAIN_EFFECT_MD_ID
                                )
                            });
                        expanded.push(PendingBranch {
                            probability: branch.probability,
                            state: failed,
                        });
                        continue;
                    }
                    let action_branches = self.execute_selected_action(&branch.state, &action)?;
                    for action_branch in action_branches {
                        expanded.push(PendingBranch {
                            probability: branch
                                .probability
                                .multiply(action_branch.probability)
                                .map_err(|error| error.to_string())?,
                            state: action_branch.state,
                        });
                    }
                }
                acted.insert(ordered.action.actor());
                pending = aggregate_branches(expanded)?;
                if pending.len() > self.maximum_successor_branches {
                    return Err(format!(
                        "turn expanded to {} chance states; core limit is {}",
                        pending.len(),
                        self.maximum_successor_branches
                    ));
                }
            }
            for branch in &mut pending {
                advance_end_of_turn(&mut branch.state, self.catalog);
            }
            completed.extend(pending);
        }
        let completed = aggregate_branches(completed)?;
        if completed.len() > self.maximum_successor_branches {
            return Err(format!(
                "turn produced {} chance states; core limit is {}",
                completed.len(),
                self.maximum_successor_branches
            ));
        }
        Ok(completed
            .into_iter()
            .map(|branch| ChanceSuccessor {
                probability: branch.probability,
                state: branch.state,
            })
            .collect())
    }

    fn execute_selected_action(
        &self,
        state: &SimulationState,
        action: &BattleAction,
    ) -> Result<Vec<PendingBranch>, String> {
        if let BattleAction::Automatic { actor } = action {
            let mut vacated = state.clone();
            vacated
                .pokemon_mut(*actor)
                .ok_or_else(|| format!("missing automatic-action actor {actor:?}"))?
                .position = None;
            sync_world_positions(&mut vacated);
            return Ok(vec![PendingBranch {
                probability: ExactProbability::new(1, 1).map_err(|error| error.to_string())?,
                state: vacated,
            }]);
        }
        let normalized_state = match action {
            BattleAction::UseMove { actor, md_id, .. }
                if !matches!(*md_id, PROTECT_MD_ID | WIDE_GUARD_MD_ID) =>
            {
                let mut normalized = state.clone();
                if let Some(pokemon) = normalized.pokemon_mut(*actor) {
                    pokemon.volatile_effects.retain(|effect| {
                        !matches!(
                            effect.md_id,
                            PROTECT_ACTIVE_EFFECT_MD_ID | PROTECT_CHAIN_EFFECT_MD_ID
                        )
                    });
                }
                Some(normalized)
            }
            _ => None,
        };
        let state = normalized_state.as_ref().unwrap_or(state);
        if let BattleAction::UseMove {
            actor,
            md_id,
            slot_index,
            ..
        } = action
            && matches!(*md_id, PROTECT_MD_ID | TAILWIND_MD_ID | WIDE_GUARD_MD_ID)
        {
            return self.execute_status_move(state, *actor, *md_id, *slot_index);
        }
        if let BattleAction::UseMove {
            actor,
            md_id,
            slot_index,
            target: ActionTarget::Pokemon { key: target },
            ..
        } = action
            && self.catalog.move_by_num(*md_id).is_some_and(|move_record| {
                move_record.category == "Status"
                    && move_record
                        .mechanics
                        .get("boosts")
                        .and_then(serde_json::Value::as_object)
                        .is_some_and(|boosts| !boosts.is_empty())
            })
        {
            return self.execute_boosting_status_move(state, *actor, *target, *md_id, *slot_index);
        }
        let BattleAction::UseMove {
            actor,
            md_id,
            slot_index,
            target: ActionTarget::Automatic,
            mega,
            ..
        } = action
        else {
            let direct = execute_core_action(
                state,
                &without_mega_request(action),
                &CoreExecutionContext {
                    affected_targets: 1,
                    critical_hit_mode: self.critical_hit_mode,
                    ..CoreExecutionContext::default()
                },
                self.catalog,
            )
            .map_err(|error| format!("core action failed: {error}"))?;
            let pivot_replacement = match action {
                BattleAction::UseMove { replacement, .. } => *replacement,
                _ => None,
            };
            let mut pending = Vec::new();
            for branch in direct {
                let pivot_succeeded = pivot_replacement.is_some()
                    && matches!(
                        branch.event,
                        CoreExecutionEvent::Damage { damage, .. } if damage > 0
                    )
                    && branch
                        .state
                        .pokemon(action.actor())
                        .is_some_and(|pokemon| pokemon.is_active());
                if pivot_succeeded {
                    let replacement = pivot_replacement
                        .expect("a successful pivot was checked to have a replacement");
                    let switched = execute_core_action(
                        &branch.state,
                        &BattleAction::Switch {
                            actor: action.actor(),
                            replacement,
                        },
                        &CoreExecutionContext::default(),
                        self.catalog,
                    )
                    .map_err(|error| format!("pivot switch failed: {error}"))?;
                    for switch_branch in switched {
                        pending.push(PendingBranch {
                            probability: branch
                                .probability
                                .multiply(switch_branch.probability)
                                .map_err(|error| error.to_string())?,
                            state: switch_branch.state,
                        });
                    }
                } else {
                    pending.push(PendingBranch {
                        probability: branch.probability,
                        state: branch.state,
                    });
                }
            }
            return Ok(pending);
        };
        let _mega_was_applied_before_turn_order = mega;
        let move_record = self
            .catalog
            .move_by_num(*md_id)
            .ok_or_else(|| format!("unknown move {md_id}"))?;
        let mut targets = state
            .teams
            .iter()
            .flat_map(|team| &team.pokemon)
            .filter(|pokemon| pokemon.position.is_some() && is_alive(pokemon))
            .filter(|pokemon| match move_record.target.as_str() {
                "allAdjacentFoes" => pokemon.key.team_index != actor.team_index,
                "allAdjacent" => pokemon.key != *actor,
                _ => false,
            })
            .map(|pokemon| pokemon.key)
            .collect::<Vec<_>>();
        if !matches!(
            move_record.target.as_str(),
            "allAdjacentFoes" | "allAdjacent"
        ) {
            return Err(format!(
                "move {} ({md_id}) uses unresolved automatic target class {}",
                move_record.name, move_record.target
            ));
        }
        targets.sort();
        if targets.is_empty() {
            return Ok(vec![PendingBranch {
                probability: ExactProbability::new(1, 1).map_err(|error| error.to_string())?,
                state: state.clone(),
            }]);
        }
        let affected_targets = targets.len();
        let mut pending = vec![PendingBranch {
            probability: ExactProbability::new(1, 1).map_err(|error| error.to_string())?,
            state: state.clone(),
        }];
        for (target_index, target) in targets.into_iter().enumerate() {
            let mut expanded = Vec::new();
            for branch in pending {
                if branch
                    .state
                    .pokemon(target)
                    .is_none_or(|pokemon| !is_alive(pokemon))
                {
                    expanded.push(branch);
                    continue;
                }
                let target_action = BattleAction::UseMove {
                    actor: *actor,
                    md_id: *md_id,
                    slot_index: *slot_index,
                    target: ActionTarget::Pokemon { key: target },
                    replacement: None,
                    mega: false,
                };
                let actor_fainted_during_spread = branch
                    .state
                    .pokemon(*actor)
                    .is_some_and(|pokemon| !is_alive(pokemon));
                let mut execution_state = branch.state.clone();
                if actor_fainted_during_spread {
                    let execution_actor = execution_state
                        .pokemon_mut(*actor)
                        .ok_or_else(|| format!("missing spread actor {actor:?}"))?;
                    execution_actor.current_hp = 1;
                    execution_actor.fainted = false;
                }
                let target_branches = execute_core_action(
                    &execution_state,
                    &target_action,
                    &CoreExecutionContext {
                        affected_targets,
                        consume_pp: target_index == 0,
                        critical_hit_mode: self.critical_hit_mode,
                        apply_life_orb_recoil: false,
                        ..CoreExecutionContext::default()
                    },
                    self.catalog,
                )
                .map_err(|error| format!("spread action failed: {error}"))?;
                for mut target_branch in target_branches {
                    if matches!(
                        target_branch.event,
                        CoreExecutionEvent::Damage { damage, .. } if damage > 0
                    ) {
                        let branch_actor = target_branch
                            .state
                            .pokemon_mut(*actor)
                            .ok_or_else(|| format!("missing spread actor {actor:?}"))?;
                        if !branch_actor
                            .volatile_effects
                            .iter()
                            .any(|effect| effect.md_id == SPREAD_DAMAGE_MARKER_EFFECT_MD_ID)
                        {
                            branch_actor.volatile_effects.push(crate::EffectSnapshot {
                                md_id: SPREAD_DAMAGE_MARKER_EFFECT_MD_ID,
                                ..crate::EffectSnapshot::default()
                            });
                        }
                    }
                    if actor_fainted_during_spread {
                        let branch_actor = target_branch
                            .state
                            .pokemon_mut(*actor)
                            .ok_or_else(|| format!("missing spread actor {actor:?}"))?;
                        branch_actor.current_hp = 0;
                        branch_actor.fainted = true;
                    }
                    expanded.push(PendingBranch {
                        probability: branch
                            .probability
                            .multiply(target_branch.probability)
                            .map_err(|error| error.to_string())?,
                        state: target_branch.state,
                    });
                }
            }
            pending = aggregate_branches(expanded)?;
            if pending.len() > self.maximum_successor_branches {
                return Err(format!(
                    "spread move expanded to {} chance states; core limit is {}",
                    pending.len(),
                    self.maximum_successor_branches
                ));
            }
        }
        for branch in &mut pending {
            let branch_actor = branch
                .state
                .pokemon_mut(*actor)
                .ok_or_else(|| format!("missing spread actor {actor:?}"))?;
            let dealt_damage = branch_actor
                .volatile_effects
                .iter()
                .any(|effect| effect.md_id == SPREAD_DAMAGE_MARKER_EFFECT_MD_ID);
            branch_actor
                .volatile_effects
                .retain(|effect| effect.md_id != SPREAD_DAMAGE_MARKER_EFFECT_MD_ID);
            let holds_life_orb = branch_actor.item_md_id.is_some_and(|item_md_id| {
                self.catalog
                    .items_by_num(item_md_id)
                    .any(|item| item.id == "lifeorb")
            });
            if dealt_damage && holds_life_orb && is_alive(branch_actor) {
                let recoil = (branch_actor.maximum_hp() / 10).max(1);
                branch_actor.current_hp = (branch_actor.current_hp - recoil).max(0);
                branch_actor.fainted = branch_actor.current_hp == 0;
            }
        }
        Ok(pending)
    }

    fn execute_status_move(
        &self,
        state: &SimulationState,
        actor_key: PokemonKey,
        md_id: i32,
        slot_index: Option<i32>,
    ) -> Result<Vec<PendingBranch>, String> {
        let mut prepared = consume_status_move(state, actor_key, md_id, slot_index, self.catalog)?;
        let probability_one = ExactProbability::new(1, 1).map_err(|error| error.to_string())?;
        match md_id {
            TAILWIND_MD_ID => {
                let side_index = prepared
                    .pokemon(actor_key)
                    .and_then(|pokemon| pokemon.position)
                    .ok_or_else(|| format!("Tailwind actor {actor_key:?} is not active"))?
                    .side_index;
                let side = side_mut(&mut prepared, side_index);
                if !side
                    .field_effects
                    .iter()
                    .any(|effect| effect.md_id == TAILWIND_SIDE_EFFECT_MD_ID)
                {
                    side.field_effects.push(crate::EffectSnapshot {
                        md_id: TAILWIND_SIDE_EFFECT_MD_ID,
                        lifespan_turns: 4,
                        elapsed_turns: 0,
                        execute_kind: 1,
                        execute_id: TAILWIND_MD_ID,
                        ..crate::EffectSnapshot::default()
                    });
                }
                Ok(vec![PendingBranch {
                    probability: probability_one,
                    state: prepared,
                }])
            }
            WIDE_GUARD_MD_ID => {
                let side_index = prepared
                    .pokemon(actor_key)
                    .and_then(|pokemon| pokemon.position)
                    .ok_or_else(|| format!("Wide Guard actor {actor_key:?} is not active"))?
                    .side_index;
                update_protection_chain(&mut prepared, actor_key, WIDE_GUARD_MD_ID, true)?;
                let side = side_mut(&mut prepared, side_index);
                if !side
                    .field_effects
                    .iter()
                    .any(|effect| effect.md_id == WIDE_GUARD_SIDE_EFFECT_MD_ID)
                {
                    side.field_effects.push(crate::EffectSnapshot {
                        md_id: WIDE_GUARD_SIDE_EFFECT_MD_ID,
                        execute_kind: 1,
                        execute_id: WIDE_GUARD_MD_ID,
                        ..crate::EffectSnapshot::default()
                    });
                }
                Ok(vec![PendingBranch {
                    probability: probability_one,
                    state: prepared,
                }])
            }
            PROTECT_MD_ID => {
                let chain = prepared
                    .pokemon(actor_key)
                    .and_then(|pokemon| {
                        pokemon.volatile_effects.iter().find(|effect| {
                            effect.md_id == PROTECT_CHAIN_EFFECT_MD_ID
                                && matches!(effect.execute_id, PROTECT_MD_ID | WIDE_GUARD_MD_ID)
                        })
                    })
                    .map(|effect| effect.step_or_count.max(0) as u32)
                    .unwrap_or(0);
                let denominator = 3_u64
                    .checked_pow(chain)
                    .ok_or_else(|| "Protect chain probability overflowed".to_owned())?;
                let mut success = prepared.clone();
                update_protection_chain(&mut success, actor_key, PROTECT_MD_ID, true)?;
                success
                    .pokemon_mut(actor_key)
                    .ok_or_else(|| format!("missing Protect actor {actor_key:?}"))?
                    .volatile_effects
                    .push(crate::EffectSnapshot {
                        md_id: PROTECT_ACTIVE_EFFECT_MD_ID,
                        execute_kind: 1,
                        execute_id: PROTECT_MD_ID,
                        ..crate::EffectSnapshot::default()
                    });
                let mut branches = vec![PendingBranch {
                    probability: ExactProbability::new(1, denominator)
                        .map_err(|error| error.to_string())?,
                    state: success,
                }];
                if denominator > 1 {
                    update_protection_chain(&mut prepared, actor_key, PROTECT_MD_ID, false)?;
                    branches.push(PendingBranch {
                        probability: ExactProbability::new(denominator - 1, denominator)
                            .map_err(|error| error.to_string())?,
                        state: prepared,
                    });
                }
                Ok(branches)
            }
            _ => unreachable!("status move IDs are matched before dispatch"),
        }
    }

    fn execute_boosting_status_move(
        &self,
        state: &SimulationState,
        actor_key: PokemonKey,
        target_key: PokemonKey,
        md_id: i32,
        slot_index: Option<i32>,
    ) -> Result<Vec<PendingBranch>, String> {
        let mut prepared = consume_status_move(state, actor_key, md_id, slot_index, self.catalog)?;
        let boosts = self
            .catalog
            .move_by_num(md_id)
            .and_then(|move_record| move_record.mechanics.get("boosts"))
            .and_then(serde_json::Value::as_object)
            .ok_or_else(|| format!("status move {md_id} has no boost object"))?;
        let target = prepared
            .pokemon_mut(target_key)
            .ok_or_else(|| format!("missing boost target {target_key:?}"))?;
        for (stat, value) in boosts {
            let delta = value
                .as_i64()
                .and_then(|value| i32::try_from(value).ok())
                .ok_or_else(|| format!("status move {md_id} has invalid {stat} boost"))?;
            let stage = match stat.as_str() {
                "atk" => &mut target.stat_stages.attack,
                "def" => &mut target.stat_stages.defense,
                "spa" => &mut target.stat_stages.special_attack,
                "spd" => &mut target.stat_stages.special_defense,
                "spe" => &mut target.stat_stages.speed,
                "accuracy" => &mut target.stat_stages.accuracy,
                "evasion" => &mut target.stat_stages.evasion,
                _ => {
                    return Err(format!(
                        "status move {md_id} boosts unsupported stat {stat}"
                    ));
                }
            };
            *stage = stage.saturating_add(delta).clamp(-6, 6);
        }
        Ok(vec![PendingBranch {
            probability: ExactProbability::new(1, 1).map_err(|error| error.to_string())?,
            state: prepared,
        }])
    }

    fn expected_leaf_score_streaming(
        &self,
        state: &SimulationState,
        left: &SideJointPlan,
        right: &SideJointPlan,
        perspective_team: i32,
    ) -> Result<(i64, u64), String> {
        self.validate_supported_state(state)?;
        let mut prepared_state = state.clone();
        prepare_start_of_turn(&mut prepared_state);
        for action in left.actions.iter().chain(&right.actions) {
            if matches!(action, BattleAction::UseMove { mega: true, .. }) {
                apply_mega_evolution(&mut prepared_state, action.actor(), self.catalog)?;
            }
        }
        self.validate_supported_state(&prepared_state)?;
        let initial_positions = prepared_state
            .teams
            .iter()
            .flat_map(|team| &team.pokemon)
            .filter_map(|pokemon| pokemon.position.map(|position| (pokemon.key, position)))
            .collect::<BTreeMap<_, _>>();
        let order_branches = resolve_turn_order(
            &prepared_state,
            &[left.clone(), right.clone()],
            TurnOrderContext {
                trick_room: false,
                modifiers: weather_speed_modifiers(&prepared_state, left, right, self.catalog)?,
            },
            self.catalog,
        )
        .map_err(|error| format!("turn order failed: {error}"))?;
        let mut accumulator = LeafScoreAccumulator::default();
        for order_branch in order_branches {
            let probability = ExactProbability::new(
                u64::from(order_branch.probability.numerator),
                u64::from(order_branch.probability.denominator),
            )
            .map_err(|error| error.to_string())?;
            self.accumulate_leaf_order(
                &order_branch.actions,
                0,
                &prepared_state,
                probability,
                &initial_positions,
                left,
                right,
                perspective_team,
                &mut accumulator,
            )?;
        }
        accumulator.finish()
    }

    #[allow(clippy::too_many_arguments)]
    fn accumulate_leaf_order(
        &self,
        actions: &[OrderedAction],
        action_index: usize,
        state: &SimulationState,
        probability: ExactProbability,
        initial_positions: &BTreeMap<PokemonKey, BattlePosition>,
        left: &SideJointPlan,
        right: &SideJointPlan,
        perspective_team: i32,
        accumulator: &mut LeafScoreAccumulator,
    ) -> Result<(), String> {
        if action_index == actions.len() {
            let mut completed = state.clone();
            advance_end_of_turn(&mut completed, self.catalog);
            let score = self
                .terminal_score(&completed, perspective_team)
                .unwrap_or_else(|| self.evaluate(&completed, perspective_team));
            return accumulator.add(score, probability);
        }

        let ordered = &actions[action_index];
        let acted = actions[..action_index]
            .iter()
            .map(|entry| entry.action.actor())
            .collect::<BTreeSet<_>>();
        let Some(action) = retarget_action(state, &ordered.action, initial_positions)? else {
            return self.accumulate_leaf_order(
                actions,
                action_index + 1,
                state,
                probability,
                initial_positions,
                left,
                right,
                perspective_team,
                accumulator,
            );
        };
        let actor = action.actor();
        if !action_actor_can_execute(state, &action) {
            return self.accumulate_leaf_order(
                actions,
                action_index + 1,
                state,
                probability,
                initial_positions,
                left,
                right,
                perspective_team,
                accumulator,
            );
        }
        if state.pokemon(actor).is_some_and(|pokemon| {
            pokemon
                .volatile_effects
                .iter()
                .any(|effect| effect.md_id == FLINCH_EFFECT_MD_ID)
        }) {
            let mut flinched = state.clone();
            flinched
                .pokemon_mut(actor)
                .expect("the active actor was checked immediately before mutation")
                .volatile_effects
                .retain(|effect| effect.md_id != FLINCH_EFFECT_MD_ID);
            return self.accumulate_leaf_order(
                actions,
                action_index + 1,
                &flinched,
                probability,
                initial_positions,
                left,
                right,
                perspective_team,
                accumulator,
            );
        }
        if !sucker_punch_can_succeed(&ordered.action, left, right, &acted, self.catalog) {
            let BattleAction::UseMove {
                md_id, slot_index, ..
            } = action
            else {
                unreachable!("only Sucker Punch can fail its condition")
            };
            let mut failed = consume_status_move(state, actor, md_id, slot_index, self.catalog)?;
            failed
                .pokemon_mut(actor)
                .ok_or_else(|| format!("missing failed-move actor {actor:?}"))?
                .volatile_effects
                .retain(|effect| {
                    !matches!(
                        effect.md_id,
                        PROTECT_ACTIVE_EFFECT_MD_ID | PROTECT_CHAIN_EFFECT_MD_ID
                    )
                });
            return self.accumulate_leaf_order(
                actions,
                action_index + 1,
                &failed,
                probability,
                initial_positions,
                left,
                right,
                perspective_team,
                accumulator,
            );
        }
        let action_branches =
            collapse_search_leaf_branches(self.execute_selected_action(state, &action)?)?;
        for branch in action_branches {
            self.accumulate_leaf_order(
                actions,
                action_index + 1,
                &branch.state,
                probability
                    .multiply(branch.probability)
                    .map_err(|error| error.to_string())?,
                initial_positions,
                left,
                right,
                perspective_team,
                accumulator,
            )?;
        }
        Ok(())
    }
}

impl SearchDomain for CoreBattleDomain<'_> {
    type State = SimulationState;
    type Plan = SideJointPlan;

    fn hash(&self, state: &Self::State) -> u64 {
        stable_state_hash(state)
    }

    fn terminal_score(&self, state: &Self::State, perspective_team: i32) -> Option<i64> {
        let perspective_alive = team_has_survivor(state, perspective_team);
        let opponent_alive = state
            .teams
            .iter()
            .filter(|team| team.team_index != perspective_team)
            .any(|team| team_has_survivor(state, team.team_index));
        match (perspective_alive, opponent_alive) {
            (true, true) => None,
            (true, false) => Some(TERMINAL_SCORE),
            (false, true) => Some(-TERMINAL_SCORE),
            (false, false) => Some(0),
        }
    }

    fn evaluate(&self, state: &Self::State, perspective_team: i32) -> i64 {
        state
            .teams
            .iter()
            .map(|team| {
                let score = team_material_score(team);
                if team.team_index == perspective_team {
                    score
                } else {
                    -score
                }
            })
            .sum()
    }

    fn legal_plans(&self, state: &Self::State, team_index: i32) -> Result<Vec<Self::Plan>, String> {
        self.legal_joint_plans(state, team_index)
    }

    fn resolve_turn(
        &self,
        state: &Self::State,
        perspective_plan: &Self::Plan,
        opponent_plan: &Self::Plan,
    ) -> Result<Vec<ChanceSuccessor<Self::State>>, String> {
        self.resolve_joint_turn(state, perspective_plan, opponent_plan)
    }

    fn resolve_leaf_score(
        &self,
        state: &Self::State,
        perspective_plan: &Self::Plan,
        opponent_plan: &Self::Plan,
        perspective_team: i32,
    ) -> Result<Option<(i64, u64)>, String> {
        self.expected_leaf_score_streaming(state, perspective_plan, opponent_plan, perspective_team)
            .map(Some)
    }
}

fn consume_status_move(
    state: &SimulationState,
    actor_key: PokemonKey,
    md_id: i32,
    slot_index: Option<i32>,
    catalog: &MechanicsCatalog,
) -> Result<SimulationState, String> {
    let mut prepared = state.clone();
    let actor = prepared
        .pokemon_mut(actor_key)
        .ok_or_else(|| format!("missing status-move actor {actor_key:?}"))?;
    if !actor.is_active() {
        return Err(format!("status-move actor {actor_key:?} is not active"));
    }
    let selected_index = actor
        .moves
        .iter()
        .position(|simulation_move| {
            simulation_move.md_id == md_id && Some(simulation_move.slot_index) == slot_index
        })
        .ok_or_else(|| format!("Pokemon {actor_key:?} does not know move {md_id}"))?;
    if actor.moves[selected_index].locked || actor.moves[selected_index].current_pp <= 0 {
        return Err(format!("Pokemon {actor_key:?} cannot use move {md_id}"));
    }
    actor.moves[selected_index].current_pp -= 1;
    let choice_item = actor.item_md_id.is_some_and(|item_md_id| {
        catalog.items_by_num(item_md_id).any(|item| {
            matches!(
                item.id.as_str(),
                "choiceband" | "choicescarf" | "choicespecs"
            )
        })
    });
    if choice_item {
        for (index, simulation_move) in actor.moves.iter_mut().enumerate() {
            simulation_move.locked = index != selected_index;
        }
    }
    Ok(prepared)
}

fn side_mut(state: &mut SimulationState, side_index: i32) -> &mut SideSnapshot {
    if let Some(index) = state
        .world
        .sides
        .iter()
        .position(|side| side.side_index == side_index)
    {
        return &mut state.world.sides[index];
    }
    state.world.sides.push(SideSnapshot {
        side_index,
        ..SideSnapshot::default()
    });
    state
        .world
        .sides
        .last_mut()
        .expect("a side was appended immediately before access")
}

fn update_protection_chain(
    state: &mut SimulationState,
    actor_key: PokemonKey,
    execute_id: i32,
    successful: bool,
) -> Result<(), String> {
    let actor = state
        .pokemon_mut(actor_key)
        .ok_or_else(|| format!("missing protection actor {actor_key:?}"))?;
    let previous = actor
        .volatile_effects
        .iter()
        .find(|effect| effect.md_id == PROTECT_CHAIN_EFFECT_MD_ID)
        .map(|effect| effect.step_or_count.max(0))
        .unwrap_or(0);
    actor.volatile_effects.retain(|effect| {
        !matches!(
            effect.md_id,
            PROTECT_ACTIVE_EFFECT_MD_ID | PROTECT_CHAIN_EFFECT_MD_ID
        )
    });
    if successful {
        actor.volatile_effects.push(crate::EffectSnapshot {
            md_id: PROTECT_CHAIN_EFFECT_MD_ID,
            step_or_count: previous.saturating_add(1),
            execute_kind: 1,
            execute_id,
            ..crate::EffectSnapshot::default()
        });
    }
    Ok(())
}

#[derive(Debug, Clone)]
struct PendingBranch {
    probability: ExactProbability,
    state: SimulationState,
}

#[derive(Debug)]
struct LeafScoreAccumulator {
    score_numerator: i128,
    score_denominator: u128,
    probability_numerator: u128,
    probability_denominator: u128,
    nodes: u64,
}

#[derive(Debug)]
struct SearchLeafCollapseGroup {
    probability: ExactProbability,
    probability_mass: f64,
    hp_weighted: Vec<f64>,
    state: SimulationState,
}

fn collapse_search_leaf_branches(
    branches: Vec<PendingBranch>,
) -> Result<Vec<PendingBranch>, String> {
    if branches.len() <= 1 {
        return Ok(branches);
    }
    let mut groups = HashMap::<SimulationState, SearchLeafCollapseGroup>::new();
    for branch in branches {
        let probability_mass =
            branch.probability.numerator as f64 / branch.probability.denominator as f64;
        let hp = branch
            .state
            .teams
            .iter()
            .flat_map(|team| &team.pokemon)
            .map(|pokemon| f64::from(pokemon.current_hp))
            .collect::<Vec<_>>();
        let mut projection = branch.state.clone();
        for pokemon in projection
            .teams
            .iter_mut()
            .flat_map(|team| &mut team.pokemon)
        {
            pokemon.current_hp = if pokemon.fainted { 0 } else { 1 };
        }
        let key = projection;
        if let Some(group) = groups.get_mut(&key) {
            group.probability = group
                .probability
                .add(branch.probability)
                .map_err(|error| error.to_string())?;
            group.probability_mass += probability_mass;
            for (weighted, current_hp) in group.hp_weighted.iter_mut().zip(hp) {
                *weighted += current_hp * probability_mass;
            }
        } else {
            groups.insert(
                key,
                SearchLeafCollapseGroup {
                    probability: branch.probability,
                    probability_mass,
                    hp_weighted: hp
                        .into_iter()
                        .map(|current_hp| current_hp * probability_mass)
                        .collect(),
                    state: branch.state,
                },
            );
        }
    }
    groups
        .into_values()
        .map(|mut group| {
            if !group.probability_mass.is_finite() || group.probability_mass <= 0.0 {
                return Err("search leaf branch has invalid probability mass".to_owned());
            }
            for (pokemon, weighted) in group
                .state
                .teams
                .iter_mut()
                .flat_map(|team| &mut team.pokemon)
                .zip(group.hp_weighted)
            {
                if !pokemon.fainted {
                    pokemon.current_hp = ((weighted / group.probability_mass).round() as i32)
                        .clamp(1, pokemon.maximum_hp());
                }
            }
            Ok(PendingBranch {
                probability: group.probability,
                state: group.state,
            })
        })
        .collect()
}

impl Default for LeafScoreAccumulator {
    fn default() -> Self {
        Self {
            score_numerator: 0,
            score_denominator: 1,
            probability_numerator: 0,
            probability_denominator: 1,
            nodes: 0,
        }
    }
}

impl LeafScoreAccumulator {
    fn add(&mut self, score: i64, probability: ExactProbability) -> Result<(), String> {
        if probability.denominator == 0 || probability.numerator > probability.denominator {
            return Err("leaf evaluator received an invalid probability".to_owned());
        }
        let right_denominator = u128::from(probability.denominator);
        let score_common = least_common_multiple(self.score_denominator, right_denominator)?;
        let left_scale = i128::try_from(score_common / self.score_denominator)
            .map_err(|_| "leaf score scale overflowed".to_owned())?;
        let right_scale = i128::try_from(score_common / right_denominator)
            .map_err(|_| "leaf probability scale overflowed".to_owned())?;
        let left = self
            .score_numerator
            .checked_mul(left_scale)
            .ok_or_else(|| "leaf score overflowed".to_owned())?;
        let right = i128::from(score)
            .checked_mul(i128::from(probability.numerator))
            .and_then(|value| value.checked_mul(right_scale))
            .ok_or_else(|| "weighted leaf score overflowed".to_owned())?;
        self.score_numerator = left
            .checked_add(right)
            .ok_or_else(|| "leaf score sum overflowed".to_owned())?;
        self.score_denominator = score_common;
        reduce_signed_fraction(&mut self.score_numerator, &mut self.score_denominator);

        let probability_common =
            least_common_multiple(self.probability_denominator, right_denominator)?;
        let probability_left = self
            .probability_numerator
            .checked_mul(probability_common / self.probability_denominator)
            .ok_or_else(|| "leaf probability sum overflowed".to_owned())?;
        let probability_right = u128::from(probability.numerator)
            .checked_mul(probability_common / right_denominator)
            .ok_or_else(|| "leaf probability sum overflowed".to_owned())?;
        self.probability_numerator = probability_left
            .checked_add(probability_right)
            .ok_or_else(|| "leaf probability sum overflowed".to_owned())?;
        self.probability_denominator = probability_common;
        reduce_unsigned_fraction(
            &mut self.probability_numerator,
            &mut self.probability_denominator,
        );
        self.nodes = self.nodes.saturating_add(1);
        Ok(())
    }

    fn finish(self) -> Result<(i64, u64), String> {
        if self.nodes == 0 {
            return Err("leaf evaluator produced no successors".to_owned());
        }
        if self.probability_numerator != self.probability_denominator {
            return Err(format!(
                "leaf successor probabilities sum to {}/{}",
                self.probability_numerator, self.probability_denominator
            ));
        }
        let denominator = i128::try_from(self.score_denominator)
            .map_err(|_| "leaf score denominator overflowed".to_owned())?;
        let half = denominator / 2;
        let rounded = if self.score_numerator >= 0 {
            self.score_numerator
                .checked_add(half)
                .ok_or_else(|| "leaf score rounding overflowed".to_owned())?
                / denominator
        } else {
            self.score_numerator
                .checked_sub(half)
                .ok_or_else(|| "leaf score rounding overflowed".to_owned())?
                / denominator
        };
        Ok((
            i64::try_from(rounded).map_err(|_| "leaf score exceeded i64".to_owned())?,
            self.nodes,
        ))
    }
}

fn least_common_multiple(left: u128, right: u128) -> Result<u128, String> {
    left.checked_div(greatest_common_divisor(left, right))
        .and_then(|value| value.checked_mul(right))
        .ok_or_else(|| "leaf fraction denominator overflowed".to_owned())
}

fn greatest_common_divisor(mut left: u128, mut right: u128) -> u128 {
    while right != 0 {
        let remainder = left % right;
        left = right;
        right = remainder;
    }
    left.max(1)
}

fn reduce_unsigned_fraction(numerator: &mut u128, denominator: &mut u128) {
    let divisor = greatest_common_divisor(*numerator, *denominator);
    *numerator /= divisor;
    *denominator /= divisor;
}

fn reduce_signed_fraction(numerator: &mut i128, denominator: &mut u128) {
    let divisor = greatest_common_divisor(numerator.unsigned_abs(), *denominator);
    *numerator /= i128::try_from(divisor).unwrap_or(1);
    *denominator /= divisor;
}

fn is_alive(pokemon: &SimulationPokemon) -> bool {
    !pokemon.fainted && pokemon.current_hp > 0
}

fn action_actor_can_execute(state: &SimulationState, action: &BattleAction) -> bool {
    state.pokemon(action.actor()).is_some_and(|pokemon| {
        if matches!(
            action,
            BattleAction::Switch { .. } | BattleAction::Automatic { .. }
        ) {
            pokemon.position.is_some()
        } else {
            pokemon.is_active()
        }
    })
}

fn plan_order_score(plan: &SideJointPlan, catalog: &MechanicsCatalog) -> i32 {
    plan.actions
        .iter()
        .map(|action| match action {
            BattleAction::UseMove {
                md_id,
                mega,
                replacement,
                ..
            } => {
                let move_score = catalog.move_by_num(*md_id).map_or(0, |move_record| {
                    let target_multiplier = if matches!(
                        move_record.target.as_str(),
                        "allAdjacent" | "allAdjacentFoes"
                    ) {
                        2
                    } else {
                        1
                    };
                    move_record.base_power.saturating_mul(target_multiplier)
                });
                move_score
                    + if *mega { 120 } else { 0 }
                    + if replacement.is_some() { 25 } else { 0 }
                    + match *md_id {
                        TAILWIND_MD_ID => 110,
                        PROTECT_MD_ID => 45,
                        WIDE_GUARD_MD_ID => 40,
                        _ => 0,
                    }
            }
            BattleAction::Switch { .. } => 15,
            BattleAction::Struggle { .. } => 25,
            BattleAction::Automatic { .. } => 0,
        })
        .sum()
}

fn plan_state_order_score(
    state: &SimulationState,
    plan: &SideJointPlan,
    catalog: &MechanicsCatalog,
) -> i64 {
    plan.actions
        .iter()
        .map(|action| action_state_order_score(state, action, catalog))
        .sum()
}

fn action_state_order_score(
    state: &SimulationState,
    action: &BattleAction,
    catalog: &MechanicsCatalog,
) -> i64 {
    let BattleAction::UseMove {
        actor,
        md_id,
        target,
        mega,
        replacement,
        ..
    } = action
    else {
        return match action {
            BattleAction::Switch { .. } => 100,
            BattleAction::Struggle { .. } => 250,
            BattleAction::Automatic { .. } => 0,
            BattleAction::UseMove { .. } => unreachable!(),
        };
    };
    let Some(move_record) = catalog.move_by_num(*md_id) else {
        return 0;
    };
    if move_record.category == "Status" {
        return i64::from(match *md_id {
            TAILWIND_MD_ID => 1_200,
            PROTECT_MD_ID => 600,
            WIDE_GUARD_MD_ID => 550,
            _ => 350,
        });
    }

    let targets = match target {
        ActionTarget::Pokemon { key } => state
            .pokemon(*key)
            .filter(|pokemon| key.team_index != actor.team_index && pokemon.is_active())
            .map(|_| vec![*key])
            .unwrap_or_default(),
        ActionTarget::Automatic => state
            .teams
            .iter()
            .filter(|team| team.team_index != actor.team_index)
            .flat_map(|team| &team.pokemon)
            .filter(|pokemon| pokemon.is_active())
            .map(|pokemon| pokemon.key)
            .collect(),
    };
    let affected_targets = targets.len().max(1);
    let resolved = resolve_static_damage_move(*md_id, catalog).ok();
    let damage_score = targets
        .iter()
        .map(|target_key| {
            let target_pokemon = state.pokemon(*target_key);
            let estimated = resolved
                .as_ref()
                .and_then(|resolved_move| {
                    calculate_core_damage(
                        state,
                        &CoreDamageRequest {
                            actor: *actor,
                            target: *target_key,
                            resolved_move: resolved_move.clone(),
                            affected_targets,
                            modifiers_before_random: Vec::new(),
                            modifiers_after_random: Vec::new(),
                        },
                        catalog,
                    )
                    .ok()
                })
                .map(|damage| {
                    let sum = damage
                        .rolls
                        .values
                        .iter()
                        .map(|value| i64::from(*value))
                        .sum::<i64>();
                    sum / i64::try_from(damage.rolls.values.len().max(1)).unwrap_or(1)
                })
                .unwrap_or_else(|| {
                    let effectiveness = target_pokemon
                        .and_then(|pokemon| {
                            type_multiplier(&move_record.move_type, &pokemon.types, catalog).ok()
                        })
                        .unwrap_or(Rational::ONE);
                    i64::from(move_record.base_power.max(1)) * i64::from(effectiveness.numerator)
                        / i64::from(effectiveness.denominator)
                });
            let knockout_bonus = target_pokemon
                .is_some_and(|pokemon| estimated >= i64::from(pokemon.current_hp))
                .then_some(10_000)
                .unwrap_or(0);
            estimated.saturating_mul(100).saturating_add(knockout_bonus)
        })
        .sum::<i64>();
    damage_score + if *mega { 1_000 } else { 0 } + if replacement.is_some() { 200 } else { 0 }
}

fn sucker_punch_can_succeed(
    action: &BattleAction,
    left: &SideJointPlan,
    right: &SideJointPlan,
    acted: &BTreeSet<PokemonKey>,
    catalog: &MechanicsCatalog,
) -> bool {
    let BattleAction::UseMove {
        md_id: SUCKER_PUNCH_MD_ID,
        target: ActionTarget::Pokemon { key: target },
        ..
    } = action
    else {
        return true;
    };
    if acted.contains(target) {
        return false;
    }
    left.actions
        .iter()
        .chain(&right.actions)
        .find(|candidate| candidate.actor() == *target)
        .is_some_and(|candidate| match candidate {
            BattleAction::UseMove { md_id, .. } => catalog
                .move_by_num(*md_id)
                .is_some_and(|move_record| move_record.category != "Status"),
            _ => false,
        })
}

fn weather_speed_modifiers(
    state: &SimulationState,
    left: &SideJointPlan,
    right: &SideJointPlan,
    catalog: &MechanicsCatalog,
) -> Result<Vec<ActorOrderModifier>, String> {
    left.actions
        .iter()
        .chain(&right.actions)
        .map(BattleAction::actor)
        .map(|actor| {
            let pokemon = state
                .pokemon(actor)
                .ok_or_else(|| format!("missing action actor {actor:?}"))?;
            let ability_ids = catalog
                .abilities_by_num(pokemon.ability_md_id)
                .map(|ability| ability.id.as_str())
                .collect::<BTreeSet<_>>();
            let weather = effective_weather_for_pokemon(state, actor, catalog);
            let weather_doubled = (matches!(weather, 2 | 5) && ability_ids.contains("swiftswim"))
                || (matches!(weather, 1 | 6) && ability_ids.contains("chlorophyll"));
            let tailwind_doubled = pokemon.position.is_some_and(|position| {
                state
                    .world
                    .sides
                    .iter()
                    .find(|side| side.side_index == position.side_index)
                    .is_some_and(|side| {
                        side.field_effects.iter().any(|effect| {
                            effect.md_id == TAILWIND_SIDE_EFFECT_MD_ID
                                && (effect.lifespan_turns <= 0
                                    || effect.elapsed_turns < effect.lifespan_turns)
                        })
                    })
            });
            let choice_scarf = pokemon.item_md_id.is_some_and(|item_md_id| {
                catalog
                    .items_by_num(item_md_id)
                    .any(|item| item.id == "choicescarf")
            });
            let speed_numerator = if weather_doubled { 2 } else { 1 }
                * if tailwind_doubled { 2 } else { 1 }
                * if choice_scarf { 3 } else { 1 };
            let speed_denominator = if choice_scarf { 2 } else { 1 };
            Ok(ActorOrderModifier {
                actor,
                priority_delta: 0,
                speed_multiplier: Rational::new(speed_numerator, speed_denominator)
                    .map_err(|error| error.to_string())?,
                force_last: false,
            })
        })
        .collect()
}

fn active_pokemon(state: &SimulationState) -> Vec<&SimulationPokemon> {
    state
        .teams
        .iter()
        .flat_map(|team| &team.pokemon)
        .filter(|pokemon| pokemon.position.is_some() && is_alive(pokemon))
        .collect()
}

fn switch_actions(team: &crate::SimulationTeam, actor: &SimulationPokemon) -> Vec<BattleAction> {
    team.pokemon
        .iter()
        .filter(|candidate| {
            team.pokemon_order.contains(&candidate.key.group_index)
                && candidate.position.is_none()
                && is_alive(candidate)
        })
        .map(|replacement| BattleAction::Switch {
            actor: actor.key,
            replacement: replacement.key,
        })
        .collect()
}

fn direct_targets(
    actor: PokemonKey,
    active: &[&SimulationPokemon],
    target_class: &str,
) -> Option<Vec<ActionTarget>> {
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
    match target_class {
        "self" => Some(vec![ActionTarget::Pokemon { key: actor }]),
        "adjacentAlly" => Some(allies),
        "adjacentAllyOrSelf" => Some(
            std::iter::once(ActionTarget::Pokemon { key: actor })
                .chain(allies)
                .collect(),
        ),
        "adjacentFoe" | "normal" => Some(foes),
        "any" => Some(
            active
                .iter()
                .filter(|pokemon| pokemon.key != actor)
                .map(|pokemon| ActionTarget::Pokemon { key: pokemon.key })
                .collect(),
        ),
        "allAdjacent" | "allAdjacentFoes" => Some(vec![ActionTarget::Automatic]),
        "allySide" => Some(vec![ActionTarget::Automatic]),
        _ => None,
    }
}

fn joint_actions_are_legal(actions: &[BattleAction]) -> bool {
    let mut replacements = BTreeSet::new();
    let mut mega_count = 0;
    actions.iter().all(|action| {
        if matches!(action, BattleAction::UseMove { mega: true, .. }) {
            mega_count += 1;
            if mega_count > 1 {
                return false;
            }
        }
        match action {
            BattleAction::Switch { replacement, .. } => replacements.insert(*replacement),
            BattleAction::UseMove {
                replacement: Some(replacement),
                ..
            } => replacements.insert(*replacement),
            _ => true,
        }
    })
}

fn without_mega_request(action: &BattleAction) -> BattleAction {
    match action {
        BattleAction::UseMove {
            actor,
            md_id,
            slot_index,
            target,
            replacement,
            ..
        } => BattleAction::UseMove {
            actor: *actor,
            md_id: *md_id,
            slot_index: *slot_index,
            target: target.clone(),
            replacement: *replacement,
            mega: false,
        },
        _ => action.clone(),
    }
}

fn retarget_action(
    state: &SimulationState,
    action: &BattleAction,
    initial_positions: &BTreeMap<PokemonKey, BattlePosition>,
) -> Result<Option<BattleAction>, String> {
    let BattleAction::UseMove {
        actor,
        md_id,
        slot_index,
        target: ActionTarget::Pokemon {
            key: selected_target,
        },
        replacement,
        mega,
    } = action
    else {
        return Ok(Some(action.clone()));
    };
    let selected_position = initial_positions
        .get(selected_target)
        .copied()
        .ok_or_else(|| format!("selected target {selected_target:?} had no initial position"))?;
    if let Some(occupant) = state
        .teams
        .iter()
        .flat_map(|team| &team.pokemon)
        .find(|pokemon| pokemon.position == Some(selected_position) && is_alive(pokemon))
    {
        return Ok(Some(BattleAction::UseMove {
            actor: *actor,
            md_id: *md_id,
            slot_index: *slot_index,
            target: ActionTarget::Pokemon { key: occupant.key },
            replacement: *replacement,
            mega: *mega,
        }));
    }
    Ok(None)
}

fn aggregate_branches(branches: Vec<PendingBranch>) -> Result<Vec<PendingBranch>, String> {
    let mut grouped = BTreeMap::<Vec<u8>, PendingBranch>::new();
    for branch in branches {
        let key = serde_json::to_vec(&branch.state)
            .map_err(|error| format!("could not hash successor state: {error}"))?;
        if let Some(existing) = grouped.get_mut(&key) {
            existing.probability = existing
                .probability
                .add(branch.probability)
                .map_err(|error| error.to_string())?;
        } else {
            grouped.insert(key, branch);
        }
    }
    Ok(grouped.into_values().collect())
}

fn prepare_start_of_turn(state: &mut SimulationState) {
    for pokemon in state.teams.iter_mut().flat_map(|team| &mut team.pokemon) {
        pokemon
            .volatile_effects
            .retain(|effect| effect.md_id != PROTECT_ACTIVE_EFFECT_MD_ID);
    }
    for side in &mut state.world.sides {
        side.field_effects
            .retain(|effect| effect.md_id != WIDE_GUARD_SIDE_EFFECT_MD_ID);
    }
}

fn advance_end_of_turn(state: &mut SimulationState, catalog: &MechanicsCatalog) {
    state.elapsed_turns = state.elapsed_turns.saturating_add(1);
    state.world.elapsed_turns = state.world.elapsed_turns.saturating_add(1);
    if state.world.weather_md_id != 0 {
        state.world.weather_elapsed_turns = state.world.weather_elapsed_turns.saturating_add(1);
        if state.world.weather_lifespan_turns > 0
            && state.world.weather_elapsed_turns >= state.world.weather_lifespan_turns
        {
            state.world.weather_md_id = 0;
            state.world.weather_lifespan_turns = 0;
            state.world.weather_elapsed_turns = 0;
        }
    }
    for side in &mut state.world.sides {
        for effect in &mut side.field_effects {
            if effect.md_id == TAILWIND_SIDE_EFFECT_MD_ID {
                effect.elapsed_turns = effect.elapsed_turns.saturating_add(1);
            }
        }
        side.field_effects.retain(|effect| {
            effect.md_id != WIDE_GUARD_SIDE_EFFECT_MD_ID
                && (effect.md_id != TAILWIND_SIDE_EFFECT_MD_ID
                    || effect.lifespan_turns <= 0
                    || effect.elapsed_turns < effect.lifespan_turns)
        });
    }
    for pokemon in state.teams.iter_mut().flat_map(|team| &mut team.pokemon) {
        pokemon
            .volatile_effects
            .retain(|effect| effect.md_id != FLINCH_EFFECT_MD_ID);
        let has_leftovers = pokemon.item_md_id.is_some_and(|item_md_id| {
            catalog
                .items_by_num(item_md_id)
                .any(|item| item.id == "leftovers")
        });
        if has_leftovers && pokemon.position.is_some() && is_alive(pokemon) {
            let healing = (pokemon.maximum_hp() / 16).max(1);
            pokemon.current_hp = pokemon
                .current_hp
                .saturating_add(healing)
                .min(pokemon.maximum_hp());
        }
    }
    sync_world_positions(state);
}

fn sync_world_positions(state: &mut SimulationState) {
    for side in &mut state.world.sides {
        for position in &mut side.positions {
            position.registered_group_index = None;
            position.registered_user_index = None;
        }
    }
    let active = state
        .teams
        .iter()
        .flat_map(|team| &team.pokemon)
        .filter(|pokemon| is_alive(pokemon))
        .filter_map(|pokemon| pokemon.position.map(|position| (pokemon.key, position)))
        .collect::<Vec<_>>();
    for (key, battle_position) in active {
        if let Some(position) = state
            .world
            .sides
            .iter_mut()
            .find(|side| side.side_index == battle_position.side_index)
            .and_then(|side| {
                side.positions
                    .iter_mut()
                    .find(|position| position.position_index == battle_position.position_index)
            })
        {
            position.registered_group_index = Some(key.group_index);
            position.registered_user_index = Some(key.team_index);
        }
    }
}

fn stable_state_hash<T: Hash>(value: &T) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn team_has_survivor(state: &SimulationState, team_index: i32) -> bool {
    state
        .teams
        .iter()
        .find(|team| team.team_index == team_index)
        .is_some_and(|team| {
            team.pokemon.iter().any(|pokemon| {
                team.pokemon_order.contains(&pokemon.key.group_index) && is_alive(pokemon)
            })
        })
}

fn team_material_score(team: &crate::SimulationTeam) -> i64 {
    team.pokemon
        .iter()
        .filter(|pokemon| team.pokemon_order.contains(&pokemon.key.group_index))
        .map(|pokemon| {
            if !is_alive(pokemon) || pokemon.maximum_hp() <= 0 {
                return 0;
            }
            let hp_fraction = i64::from(pokemon.current_hp).saturating_mul(50_000)
                / i64::from(pokemon.maximum_hp());
            50_000 + hp_fraction + i64::from(pokemon.position.is_some()) * 250
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        BattleStats, EffectSnapshot, SearchLimits, SideSnapshot, SimulationMove, SimulationTeam,
        StatStages, TrainingPoints, WorldSnapshot, calculate_battle_stats, load_mechanics_pack,
        search_best_plan,
    };

    const PACK: &[u8] = include_bytes!("../data/champions-mechanics-v1.json");
    const CHECKSUM: &[u8] = include_bytes!("../data/champions-mechanics-v1.json.sha256");

    fn catalog() -> MechanicsCatalog {
        load_mechanics_pack(PACK, CHECKSUM).expect("mechanics pack should validate")
    }

    fn pokemon(team_index: i32, active: bool) -> SimulationPokemon {
        SimulationPokemon {
            key: PokemonKey {
                team_index,
                group_index: 0,
            },
            species_id: "eevee".to_owned(),
            form_no: 0,
            item_md_id: None,
            ability_md_id: 50,
            nature_id: "hardy".to_owned(),
            training_points: TrainingPoints::default(),
            stats: BattleStats {
                hp: 130,
                attack: 90,
                defense: 85,
                special_attack: 80,
                special_defense: 85,
                speed: 90,
            },
            current_hp: 130,
            status_condition: 0,
            fainted: false,
            stat_stages: StatStages::default(),
            types: vec!["Normal".to_owned()],
            substitute: false,
            can_mega: false,
            mega_mode: false,
            position: active.then_some(BattlePosition {
                side_index: team_index,
                position_index: 0,
            }),
            moves: vec![SimulationMove {
                md_id: 33,
                slot_index: 0,
                current_pp: 35,
                max_pp: 35,
                locked: false,
            }],
            volatile_effects: Vec::new(),
            field_effects: Vec::new(),
        }
    }

    fn state() -> SimulationState {
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
                    pokemon: vec![pokemon(0, true)],
                },
                SimulationTeam {
                    team_index: 1,
                    is_local_player: false,
                    pokemon_order: vec![0],
                    pokemon: vec![pokemon(1, true)],
                },
            ],
        }
    }

    #[test]
    fn full_core_turn_probability_sums_to_one() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let state = state();
        let left = domain.legal_joint_plans(&state, 0).unwrap();
        let right = domain.legal_joint_plans(&state, 1).unwrap();
        let successors = domain
            .resolve_joint_turn(&state, &left[0], &right[0])
            .expect("core turn should resolve");
        let probability = successors
            .iter()
            .try_fold(ExactProbability::new(0, 1).unwrap(), |sum, branch| {
                sum.add(branch.probability)
            })
            .unwrap();
        assert_eq!(probability, ExactProbability::new(1, 1).unwrap());
        assert!(
            successors
                .iter()
                .all(|branch| branch.state.elapsed_turns == 2)
        );
    }

    #[test]
    fn forced_replacement_can_leave_an_unfillable_doubles_slot_vacant() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        state.teams[0].pokemon[0].current_hp = 0;
        state.teams[0].pokemon[0].fainted = true;
        let mut surviving_partner = pokemon(0, true);
        surviving_partner.key.group_index = 1;
        surviving_partner.position = Some(BattlePosition {
            side_index: 0,
            position_index: 1,
        });
        state.teams[0].pokemon_order.push(1);
        state.teams[0].pokemon.push(surviving_partner);
        let mut unselected_bench = pokemon(0, false);
        unselected_bench.key.group_index = 2;
        state.teams[0].pokemon.push(unselected_bench);

        let plans = domain
            .legal_joint_plans(&state, 0)
            .expect("the empty replacement slot should be representable");
        assert_eq!(
            plans,
            vec![SideJointPlan {
                team_index: 0,
                actions: vec![BattleAction::Automatic {
                    actor: PokemonKey {
                        team_index: 0,
                        group_index: 0,
                    },
                }],
            }]
        );
        let branches = domain
            .resolve_joint_turn(
                &state,
                &plans[0],
                &SideJointPlan {
                    team_index: 1,
                    actions: Vec::new(),
                },
            )
            .expect("forced vacancy should resolve");
        assert!(branches.iter().all(|branch| {
            branch
                .state
                .pokemon(PokemonKey {
                    team_index: 0,
                    group_index: 0,
                })
                .is_some_and(|pokemon| pokemon.position.is_none())
        }));
    }

    #[test]
    fn mega_is_generated_and_applied_before_turn_execution() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        let base = catalog
            .species_by_id("swampert")
            .expect("Swampert should be present");
        let stats = calculate_battle_stats(base, TrainingPoints::default(), "hardy", &catalog)
            .expect("Swampert stats should calculate");
        let actor = &mut state.teams[0].pokemon[0];
        actor.species_id = "swampert".to_owned();
        actor.item_md_id = Some(752);
        actor.ability_md_id = 67;
        actor.stats = stats;
        actor.current_hp = stats.hp;
        actor.types = vec!["Water".to_owned(), "Ground".to_owned()];
        actor.can_mega = true;

        let left = domain
            .legal_joint_plans(&state, 0)
            .expect("both ordinary and Mega plans should be legal");
        assert_eq!(left.len(), 2);
        let mega_plan = left
            .iter()
            .find(|plan| {
                matches!(
                    plan.actions.as_slice(),
                    [BattleAction::UseMove { mega: true, .. }]
                )
            })
            .expect("a Mega move variant should be generated");
        let right = domain.legal_joint_plans(&state, 1).unwrap();
        let branches = domain
            .resolve_joint_turn(&state, mega_plan, &right[0])
            .expect("Mega turn should resolve");

        assert!(branches.iter().all(|branch| {
            let transformed = &branch.state.teams[0].pokemon[0];
            transformed.species_id == "swampertmega"
                && transformed.ability_md_id == 33
                && transformed.mega_mode
                && !transformed.can_mega
        }));
    }

    #[test]
    fn pending_electro_shot_forces_its_recorded_release_target() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        state.teams[0].pokemon[0].moves[0] = SimulationMove {
            md_id: ELECTRO_SHOT_MD_ID,
            slot_index: 0,
            current_pp: 0,
            max_pp: 12,
            locked: false,
        };
        state.teams[0].pokemon[0]
            .volatile_effects
            .push(EffectSnapshot {
                md_id: ELECTRO_SHOT_CHARGE_EFFECT_MD_ID,
                execute_kind: 1,
                execute_id: ELECTRO_SHOT_MD_ID,
                target_execute_kind: 2,
                target_execute_id: 0,
                ..EffectSnapshot::default()
            });

        let plans = domain
            .legal_joint_plans(&state, 0)
            .expect("a simulator-created charge marker should retain its release target");
        assert_eq!(plans.len(), 1);
        assert!(matches!(
            plans[0].actions.as_slice(),
            [BattleAction::UseMove {
                md_id: ELECTRO_SHOT_MD_ID,
                target: ActionTarget::Pokemon {
                    key: PokemonKey {
                        team_index: 1,
                        group_index: 0
                    }
                },
                ..
            }]
        ));
    }

    #[test]
    fn observed_electro_shot_marker_without_a_target_fails_closed() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        state.teams[0].pokemon[0]
            .volatile_effects
            .push(EffectSnapshot {
                md_id: ELECTRO_SHOT_CHARGE_EFFECT_MD_ID,
                execute_kind: 1,
                execute_id: ELECTRO_SHOT_MD_ID,
                ..EffectSnapshot::default()
            });

        let error = domain
            .legal_joint_plans(&state, 0)
            .expect_err("the live marker does not reveal the selected target");
        assert!(error.contains("selected target is not exposed"));
    }

    #[test]
    fn maximin_search_runs_against_the_exact_core_domain() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let result = search_best_plan(
            &domain,
            &state(),
            0,
            1,
            SearchLimits {
                maximum_depth: 1,
                maximum_nodes: 100_000,
                time_limit_ms: None,
            },
        )
        .expect("depth-one core search should complete");
        assert_eq!(result.statistics.completed_depth, 1);
        assert!(matches!(
            result.best_plan.actions.as_slice(),
            [BattleAction::UseMove { md_id: 33, .. }]
        ));
    }

    #[test]
    fn unsupported_ability_and_branch_explosion_fail_closed() {
        let catalog = catalog();
        let mut unsupported = state();
        unsupported.teams[0].pokemon[0].ability_md_id = 26;
        let error = CoreBattleDomain::new(&catalog)
            .validate_supported_state(&unsupported)
            .expect_err("Levitate must not be ignored");
        assert!(error.contains("supported core whitelist"));

        let domain = CoreBattleDomain::with_branch_limit(&catalog, 1);
        let state = state();
        let left = domain.legal_joint_plans(&state, 0).unwrap();
        let right = domain.legal_joint_plans(&state, 1).unwrap();
        let error = domain
            .resolve_joint_turn(&state, &left[0], &right[0])
            .expect_err("a one-state cap should stop damage-roll expansion");
        assert!(error.contains("chance states"));
    }

    #[test]
    fn spread_damage_hits_each_target_and_consumes_pp_once() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        let mut ally = pokemon(0, true);
        ally.key.group_index = 1;
        ally.position = Some(BattlePosition {
            side_index: 0,
            position_index: 1,
        });
        state.teams[0].pokemon_order.push(1);
        state.teams[0].pokemon.push(ally);
        state.teams[0].pokemon[0].moves = vec![SimulationMove {
            md_id: 89,
            slot_index: 0,
            current_pp: 10,
            max_pp: 10,
            locked: false,
        }];
        state.teams[0].pokemon[0].item_md_id = Some(
            catalog
                .item_by_id("lifeorb")
                .expect("mechanics pack should include Life Orb")
                .num,
        );
        let action = BattleAction::UseMove {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            md_id: 89,
            slot_index: Some(0),
            target: ActionTarget::Automatic,
            replacement: None,
            mega: false,
        };
        let branches = domain
            .execute_selected_action(&state, &action)
            .expect("Earthquake should resolve across ally and foe");
        let probability = branches
            .iter()
            .try_fold(ExactProbability::new(0, 1).unwrap(), |sum, branch| {
                sum.add(branch.probability)
            })
            .unwrap();
        assert_eq!(probability, ExactProbability::new(1, 1).unwrap());
        assert!(branches.iter().all(|branch| {
            branch.state.teams[0].pokemon[0].moves[0].current_pp == 9
                && branch.state.teams[0].pokemon[0].current_hp == 117
                && branch.state.teams[0].pokemon[1].current_hp < 130
                && branch.state.teams[1].pokemon[0].current_hp < 130
        }));
    }

    #[test]
    fn flip_turn_plans_encode_and_execute_the_selected_replacement() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        let mut replacement = pokemon(0, false);
        replacement.key.group_index = 1;
        state.teams[0].pokemon_order.push(1);
        state.teams[0].pokemon.push(replacement);
        state.teams[0].pokemon[0].moves = vec![SimulationMove {
            md_id: 812,
            slot_index: 0,
            current_pp: 20,
            max_pp: 20,
            locked: false,
        }];
        let replacement_key = PokemonKey {
            team_index: 0,
            group_index: 1,
        };
        let pivot_plan = domain
            .legal_joint_plans(&state, 0)
            .expect("Flip Turn plans should generate")
            .into_iter()
            .find(|plan| {
                matches!(
                    plan.actions.as_slice(),
                    [BattleAction::UseMove {
                        md_id: 812,
                        replacement: Some(key),
                        ..
                    }] if *key == replacement_key
                )
            })
            .expect("Flip Turn should encode the selected replacement");
        let right = domain.legal_joint_plans(&state, 1).unwrap();
        let branches = domain
            .resolve_joint_turn(&state, &pivot_plan, &right[0])
            .expect("Flip Turn should damage then pivot");

        assert!(branches.iter().all(|branch| {
            branch.state.teams[0].pokemon[0].position.is_none()
                && branch
                    .state
                    .pokemon(replacement_key)
                    .is_some_and(|pokemon| {
                        pokemon.position
                            == Some(BattlePosition {
                                side_index: 0,
                                position_index: 0,
                            })
                    })
                && branch.state.teams[0].pokemon[0].moves[0].current_pp == 19
        }));
    }

    #[test]
    fn swift_swim_changes_the_exact_turn_winner_in_rain() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        state.world.weather_md_id = 2;
        state.teams[0].pokemon[0].ability_md_id = 33;
        state.teams[0].pokemon[0].current_hp = 1;
        state.teams[1].pokemon[0].current_hp = 1;
        let left = domain.legal_joint_plans(&state, 0).unwrap();
        let right = domain.legal_joint_plans(&state, 1).unwrap();
        let branches = domain
            .resolve_joint_turn(&state, &left[0], &right[0])
            .expect("Swift Swim turn should resolve");
        assert!(branches.iter().all(|branch| {
            branch.state.teams[0].pokemon[0].current_hp == 1
                && branch.state.teams[1].pokemon[0].current_hp == 0
        }));
    }

    #[test]
    fn choice_scarf_changes_the_exact_turn_winner() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        state.teams[0].pokemon[0].stats.speed = 60;
        state.teams[1].pokemon[0].stats.speed = 80;
        state.teams[0].pokemon[0].current_hp = 1;
        state.teams[1].pokemon[0].current_hp = 1;
        state.teams[0].pokemon[0].item_md_id = Some(
            catalog
                .item_by_id("choicescarf")
                .expect("mechanics pack should include Choice Scarf")
                .num,
        );
        let left = domain.legal_joint_plans(&state, 0).unwrap();
        let right = domain.legal_joint_plans(&state, 1).unwrap();
        let branches = domain
            .resolve_joint_turn(&state, &left[0], &right[0])
            .expect("Choice Scarf turn should resolve");
        assert!(branches.iter().all(|branch| {
            branch.state.teams[0].pokemon[0].current_hp == 1
                && branch.state.teams[1].pokemon[0].current_hp == 0
        }));
    }

    #[test]
    fn observed_tailwind_doubles_side_speed_and_expires_on_schedule() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        state.teams[0].pokemon[0].stats.speed = 60;
        state.teams[1].pokemon[0].stats.speed = 100;
        state.teams[0].pokemon[0].current_hp = 1;
        state.teams[1].pokemon[0].current_hp = 1;
        state.world.sides = vec![SideSnapshot {
            side_index: 0,
            field_effects: vec![EffectSnapshot {
                md_id: TAILWIND_SIDE_EFFECT_MD_ID,
                lifespan_turns: 4,
                elapsed_turns: 3,
                ..EffectSnapshot::default()
            }],
            positions: Vec::new(),
        }];
        let left = domain.legal_joint_plans(&state, 0).unwrap();
        let right = domain.legal_joint_plans(&state, 1).unwrap();
        let branches = domain
            .resolve_joint_turn(&state, &left[0], &right[0])
            .expect("active Tailwind should be supported");

        assert!(branches.iter().all(|branch| {
            branch.state.teams[0].pokemon[0].current_hp == 1
                && branch.state.teams[1].pokemon[0].current_hp == 0
                && branch.state.world.sides[0].field_effects.is_empty()
        }));
    }

    #[test]
    fn tailwind_move_creates_the_four_turn_side_effect() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        state.teams[0].pokemon[0].moves[0] = SimulationMove {
            md_id: TAILWIND_MD_ID,
            slot_index: 0,
            current_pp: 15,
            max_pp: 15,
            locked: false,
        };
        let left = domain.legal_joint_plans(&state, 0).unwrap();
        let right = domain.legal_joint_plans(&state, 1).unwrap();
        let branches = domain
            .resolve_joint_turn(&state, &left[0], &right[0])
            .expect("Tailwind turn should resolve");

        assert!(branches.iter().all(|branch| {
            branch.state.teams[0].pokemon[0].moves[0].current_pp == 14
                && branch
                    .state
                    .world
                    .sides
                    .iter()
                    .find(|side| side.side_index == 0)
                    .is_some_and(|side| {
                        side.field_effects.iter().any(|effect| {
                            effect.md_id == TAILWIND_SIDE_EFFECT_MD_ID
                                && effect.lifespan_turns == 4
                                && effect.elapsed_turns == 1
                        })
                    })
        }));
    }

    #[test]
    fn protect_blocks_damage_and_consecutive_use_branches_exactly() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        state.teams[0].pokemon[0].moves[0] = SimulationMove {
            md_id: PROTECT_MD_ID,
            slot_index: 0,
            current_pp: 10,
            max_pp: 10,
            locked: false,
        };
        state.teams[0].pokemon[0].current_hp = 1;
        let left = domain.legal_joint_plans(&state, 0).unwrap();
        let right = domain.legal_joint_plans(&state, 1).unwrap();
        let first = domain
            .resolve_joint_turn(&state, &left[0], &right[0])
            .expect("first Protect should resolve");
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].state.teams[0].pokemon[0].current_hp, 1);
        assert!(
            first[0].state.teams[0].pokemon[0]
                .volatile_effects
                .iter()
                .any(|effect| {
                    effect.md_id == PROTECT_CHAIN_EFFECT_MD_ID && effect.step_or_count == 1
                })
        );
        assert!(
            first[0].state.teams[0].pokemon[0]
                .volatile_effects
                .iter()
                .any(|effect| effect.md_id == PROTECT_ACTIVE_EFFECT_MD_ID)
        );

        let left = domain.legal_joint_plans(&first[0].state, 0).unwrap();
        let right = domain.legal_joint_plans(&first[0].state, 1).unwrap();
        let second = domain
            .resolve_joint_turn(&first[0].state, &left[0], &right[0])
            .expect("second Protect should branch");
        assert_eq!(second.len(), 2);
        assert!(second.iter().any(|branch| {
            branch.state.teams[0].pokemon[0].current_hp == 1
                && branch.probability == ExactProbability::new(1, 3).unwrap()
        }));
        assert!(second.iter().any(|branch| {
            branch.state.teams[0].pokemon[0].current_hp == 0
                && branch.probability == ExactProbability::new(2, 3).unwrap()
        }));
    }

    #[test]
    fn sucker_punch_fails_against_status_moves_and_spends_pp() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        state.teams[0].pokemon[0].moves[0] = SimulationMove {
            md_id: SUCKER_PUNCH_MD_ID,
            slot_index: 0,
            current_pp: 8,
            max_pp: 8,
            locked: false,
        };
        state.teams[1].pokemon[0].moves[0] = SimulationMove {
            md_id: PROTECT_MD_ID,
            slot_index: 0,
            current_pp: 10,
            max_pp: 10,
            locked: false,
        };
        let target_hp = state.teams[1].pokemon[0].current_hp;
        let left = domain.legal_joint_plans(&state, 0).unwrap();
        let right = domain.legal_joint_plans(&state, 1).unwrap();
        let branches = domain
            .resolve_joint_turn(&state, &left[0], &right[0])
            .expect("Sucker Punch into Protect should resolve as a failure");

        assert!(branches.iter().all(|branch| {
            branch.state.teams[0].pokemon[0].moves[0].current_pp == 7
                && branch.state.teams[1].pokemon[0].current_hp == target_hp
        }));
    }

    #[test]
    fn swords_dance_applies_its_self_boost_and_spends_pp() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        state.teams[0].pokemon[0].moves[0] = SimulationMove {
            md_id: 14,
            slot_index: 0,
            current_pp: 20,
            max_pp: 20,
            locked: false,
        };
        let left = domain.legal_joint_plans(&state, 0).unwrap();
        let right = domain.legal_joint_plans(&state, 1).unwrap();
        let branches = domain
            .resolve_joint_turn(&state, &left[0], &right[0])
            .expect("Swords Dance should resolve");
        assert!(branches.iter().all(|branch| {
            let actor = &branch.state.teams[0].pokemon[0];
            actor.stat_stages.attack == 2 && actor.moves[0].current_pp == 19
        }));
    }

    #[test]
    fn rock_slide_flinch_skips_a_slower_targets_action() {
        let catalog = catalog();
        let domain = CoreBattleDomain::new(&catalog);
        let mut state = state();
        state.teams[0].pokemon[0].stats.speed = 120;
        state.teams[1].pokemon[0].stats.speed = 60;
        state.teams[0].pokemon[0].moves[0] = SimulationMove {
            md_id: 157,
            slot_index: 0,
            current_pp: 10,
            max_pp: 10,
            locked: false,
        };
        let left = domain.legal_joint_plans(&state, 0).unwrap();
        let right = domain.legal_joint_plans(&state, 1).unwrap();
        let branches = domain
            .resolve_joint_turn(&state, &left[0], &right[0])
            .expect("Rock Slide flinch should resolve");
        assert!(branches.iter().any(|branch| {
            branch.state.teams[1].pokemon[0].moves[0].current_pp == 35
                && branch.state.teams[0].pokemon[0].current_hp == 130
        }));
        assert!(branches.iter().any(|branch| {
            branch.state.teams[1].pokemon[0].moves[0].current_pp == 34
                && branch.state.teams[0].pokemon[0].current_hp < 130
        }));
    }

    #[test]
    fn unsupported_side_effects_still_fail_closed() {
        let catalog = catalog();
        let mut state = state();
        state.world.sides = vec![SideSnapshot {
            side_index: 0,
            field_effects: vec![EffectSnapshot {
                md_id: 999,
                ..EffectSnapshot::default()
            }],
            positions: Vec::new(),
        }];

        let error = CoreBattleDomain::new(&catalog)
            .validate_supported_state(&state)
            .expect_err("unknown side effect must fail");
        assert!(error.contains("unsupported field effect 999"));
    }

    #[test]
    fn leftovers_heals_active_pokemon_by_one_sixteenth_at_end_of_turn() {
        let catalog = catalog();
        let mut state = state();
        state.teams[0].pokemon[0].item_md_id = Some(234);
        state.teams[0].pokemon[0].current_hp = 100;

        advance_end_of_turn(&mut state, &catalog);

        assert_eq!(state.teams[0].pokemon[0].current_hp, 108);
        assert_eq!(state.elapsed_turns, 2);
    }

    #[test]
    fn leftovers_does_not_revive_or_heal_benched_pokemon() {
        let catalog = catalog();
        let mut fainted = state();
        fainted.teams[0].pokemon[0].item_md_id = Some(234);
        fainted.teams[0].pokemon[0].current_hp = 0;
        fainted.teams[0].pokemon[0].fainted = true;
        advance_end_of_turn(&mut fainted, &catalog);
        assert_eq!(fainted.teams[0].pokemon[0].current_hp, 0);

        let mut benched = state();
        benched.teams[0].pokemon[0].item_md_id = Some(234);
        benched.teams[0].pokemon[0].current_hp = 100;
        benched.teams[0].pokemon[0].position = None;
        advance_end_of_turn(&mut benched, &catalog);
        assert_eq!(benched.teams[0].pokemon[0].current_hp, 100);
    }
}
