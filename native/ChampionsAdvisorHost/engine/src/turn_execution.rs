use crate::core_damage::{SUPREME_OVERLORD_EFFECT_MD_ID, calculate_core_damage_variant};
use crate::weather::effective_weather_for_pokemon;
use crate::{
    AccuracyError, ActionTarget, BattleAction, CoreDamageError, CoreDamageRequest,
    DynamicMoveError, EffectSnapshot, HitChanceRequest, MechanicsCatalog, PokemonKey, Rational,
    SimulationPokemon, SimulationState, calculate_hit_chance, resolve_damage_move, type_multiplier,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fmt::{Display, Formatter};

const ELECTRO_SHOT_MD_ID: i32 = 905;
const ELECTRO_SHOT_CHARGE_EFFECT_MD_ID: i32 = 17;
pub(crate) const PROTECT_ACTIVE_EFFECT_MD_ID: i32 = 56;
pub(crate) const WIDE_GUARD_SIDE_EFFECT_MD_ID: i32 = 67;
pub(crate) const CONFUSION_EFFECT_MD_ID: i32 = 57;
pub(crate) const FLINCH_EFFECT_MD_ID: i32 = 58;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CriticalHitMode {
    #[default]
    Random,
    Never,
    Always,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExactProbability {
    pub numerator: u64,
    pub denominator: u64,
}

impl ExactProbability {
    pub fn new(numerator: u64, denominator: u64) -> Result<Self, TurnExecutionError> {
        if denominator == 0 || numerator > denominator {
            return Err(TurnExecutionError::InvalidProbability {
                numerator,
                denominator,
            });
        }
        let divisor = greatest_common_divisor(numerator, denominator);
        Ok(Self {
            numerator: numerator / divisor,
            denominator: denominator / divisor,
        })
    }

    pub fn multiply(self, other: Self) -> Result<Self, TurnExecutionError> {
        let left_divisor = greatest_common_divisor(self.numerator, other.denominator);
        let right_divisor = greatest_common_divisor(other.numerator, self.denominator);
        let numerator = (self.numerator / left_divisor)
            .checked_mul(other.numerator / right_divisor)
            .ok_or(TurnExecutionError::Overflow)?;
        let denominator = (self.denominator / right_divisor)
            .checked_mul(other.denominator / left_divisor)
            .ok_or(TurnExecutionError::Overflow)?;
        Self::new(numerator, denominator)
    }

    pub fn add(self, other: Self) -> Result<Self, TurnExecutionError> {
        let divisor = greatest_common_divisor(self.denominator, other.denominator);
        let left_multiplier = other.denominator / divisor;
        let right_multiplier = self.denominator / divisor;
        let numerator = self
            .numerator
            .checked_mul(left_multiplier)
            .and_then(|left| {
                other
                    .numerator
                    .checked_mul(right_multiplier)
                    .and_then(|right| left.checked_add(right))
            })
            .ok_or(TurnExecutionError::Overflow)?;
        let denominator = self
            .denominator
            .checked_mul(left_multiplier)
            .ok_or(TurnExecutionError::Overflow)?;
        Self::new(numerator, denominator)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CoreExecutionContext {
    pub affected_targets: usize,
    #[serde(default = "default_true")]
    pub consume_pp: bool,
    #[serde(default)]
    pub accuracy_modifiers: Vec<Rational>,
    #[serde(default)]
    pub damage_modifiers_before_random: Vec<Rational>,
    #[serde(default)]
    pub damage_modifiers_after_random: Vec<Rational>,
    #[serde(default)]
    pub critical_hit_mode: CriticalHitMode,
    #[serde(default = "default_true")]
    pub apply_life_orb_recoil: bool,
}

impl Default for CoreExecutionContext {
    fn default() -> Self {
        Self {
            affected_targets: 0,
            consume_pp: true,
            accuracy_modifiers: Vec::new(),
            damage_modifiers_before_random: Vec::new(),
            damage_modifiers_after_random: Vec::new(),
            critical_hit_mode: CriticalHitMode::Random,
            apply_life_orb_recoil: true,
        }
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CoreExecutionEvent {
    Miss {
        actor: PokemonKey,
        target: PokemonKey,
        md_id: i32,
    },
    Protected {
        actor: PokemonKey,
        target: PokemonKey,
        md_id: i32,
    },
    Damage {
        actor: PokemonKey,
        target: PokemonKey,
        md_id: i32,
        critical: bool,
        damage: i32,
        target_hp_before: i32,
        target_hp_after: i32,
        fainted: bool,
    },
    Switch {
        actor: PokemonKey,
        replacement: PokemonKey,
    },
    Charge {
        actor: PokemonKey,
        target: PokemonKey,
        md_id: i32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CoreExecutionBranch {
    pub probability: ExactProbability,
    pub event: CoreExecutionEvent,
    pub state: SimulationState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TurnExecutionError {
    UnsupportedAction,
    AutomaticTarget,
    MegaRequiresTransformation(PokemonKey),
    MissingPokemon(PokemonKey),
    InactivePokemon(PokemonKey),
    FaintedPokemon(PokemonKey),
    MissingMove {
        actor: PokemonKey,
        md_id: i32,
        slot_index: Option<i32>,
    },
    MoveUnavailable {
        actor: PokemonKey,
        md_id: i32,
    },
    UnresolvedMoveStateEffect {
        md_id: i32,
        rule: String,
    },
    InvalidAffectedTargets(usize),
    InvalidSwitch {
        actor: PokemonKey,
        replacement: PokemonKey,
    },
    InvalidProbability {
        numerator: u64,
        denominator: u64,
    },
    Accuracy(AccuracyError),
    Damage(CoreDamageError),
    DynamicMove(DynamicMoveError),
    Overflow,
}

impl Display for TurnExecutionError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnsupportedAction => {
                write!(formatter, "action is not a core damage or switch action")
            }
            Self::AutomaticTarget => write!(
                formatter,
                "automatic target requires spread/redirection resolution"
            ),
            Self::MegaRequiresTransformation(key) => write!(
                formatter,
                "Pokemon {key:?} requires Mega-form transformation before execution"
            ),
            Self::MissingPokemon(key) => write!(formatter, "missing Pokemon {key:?}"),
            Self::InactivePokemon(key) => write!(formatter, "Pokemon {key:?} is not active"),
            Self::FaintedPokemon(key) => write!(formatter, "Pokemon {key:?} has fainted"),
            Self::MissingMove {
                actor,
                md_id,
                slot_index,
            } => write!(
                formatter,
                "Pokemon {actor:?} does not have move {md_id} in slot {slot_index:?}"
            ),
            Self::MoveUnavailable { actor, md_id } => {
                write!(formatter, "Pokemon {actor:?} cannot use move {md_id}")
            }
            Self::UnresolvedMoveStateEffect { md_id, rule } => {
                write!(
                    formatter,
                    "move {md_id} requires state-effect resolver {rule}"
                )
            }
            Self::InvalidAffectedTargets(count) => {
                write!(
                    formatter,
                    "affected target count must be positive, got {count}"
                )
            }
            Self::InvalidSwitch { actor, replacement } => {
                write!(
                    formatter,
                    "invalid switch from {actor:?} to {replacement:?}"
                )
            }
            Self::InvalidProbability {
                numerator,
                denominator,
            } => write!(formatter, "invalid probability {numerator}/{denominator}"),
            Self::Accuracy(error) => Display::fmt(error, formatter),
            Self::Damage(error) => Display::fmt(error, formatter),
            Self::DynamicMove(error) => Display::fmt(error, formatter),
            Self::Overflow => write!(formatter, "state-branch probability overflowed"),
        }
    }
}

impl std::error::Error for TurnExecutionError {}

impl From<AccuracyError> for TurnExecutionError {
    fn from(value: AccuracyError) -> Self {
        Self::Accuracy(value)
    }
}

impl From<CoreDamageError> for TurnExecutionError {
    fn from(value: CoreDamageError) -> Self {
        Self::Damage(value)
    }
}

impl From<DynamicMoveError> for TurnExecutionError {
    fn from(value: DynamicMoveError) -> Self {
        Self::DynamicMove(value)
    }
}

pub fn execute_core_action(
    state: &SimulationState,
    action: &BattleAction,
    context: &CoreExecutionContext,
    catalog: &MechanicsCatalog,
) -> Result<Vec<CoreExecutionBranch>, TurnExecutionError> {
    match action {
        BattleAction::UseMove {
            actor,
            md_id,
            slot_index,
            target: ActionTarget::Pokemon { key: target },
            mega,
            ..
        } => {
            if *mega {
                return Err(TurnExecutionError::MegaRequiresTransformation(*actor));
            }
            if *md_id == ELECTRO_SHOT_MD_ID {
                execute_electro_shot(state, *actor, *target, *slot_index, context, catalog)
            } else {
                execute_damage_move(
                    state,
                    *actor,
                    *target,
                    *md_id,
                    *slot_index,
                    context,
                    catalog,
                )
            }
        }
        BattleAction::UseMove {
            target: ActionTarget::Automatic,
            ..
        } => Err(TurnExecutionError::AutomaticTarget),
        BattleAction::Switch { actor, replacement } => {
            execute_switch(state, *actor, *replacement, catalog)
        }
        BattleAction::Struggle { .. } | BattleAction::Automatic { .. } => {
            Err(TurnExecutionError::UnsupportedAction)
        }
    }
}

pub(crate) fn pending_electro_shot_effect(pokemon: &SimulationPokemon) -> Option<&EffectSnapshot> {
    pokemon.volatile_effects.iter().find(|effect| {
        effect.md_id == ELECTRO_SHOT_CHARGE_EFFECT_MD_ID && effect.execute_id == ELECTRO_SHOT_MD_ID
    })
}

pub(crate) fn pending_electro_shot_target(effect: &EffectSnapshot) -> Option<PokemonKey> {
    (effect.md_id == ELECTRO_SHOT_CHARGE_EFFECT_MD_ID
        && effect.execute_id == ELECTRO_SHOT_MD_ID
        && effect.target_execute_kind > 0
        && effect.target_execute_id >= 0)
        .then_some(PokemonKey {
            team_index: i32::from(effect.target_execute_kind) - 1,
            group_index: effect.target_execute_id,
        })
}

fn execute_electro_shot(
    state: &SimulationState,
    actor_key: PokemonKey,
    target_key: PokemonKey,
    slot_index: Option<i32>,
    context: &CoreExecutionContext,
    catalog: &MechanicsCatalog,
) -> Result<Vec<CoreExecutionBranch>, TurnExecutionError> {
    let actor = state
        .pokemon(actor_key)
        .ok_or(TurnExecutionError::MissingPokemon(actor_key))?;
    validate_active(actor_key, actor)?;
    let target = state
        .pokemon(target_key)
        .ok_or(TurnExecutionError::MissingPokemon(target_key))?;
    validate_active(target_key, target)?;
    let simulation_move = actor
        .moves
        .iter()
        .find(|entry| entry.md_id == ELECTRO_SHOT_MD_ID && Some(entry.slot_index) == slot_index)
        .ok_or(TurnExecutionError::MissingMove {
            actor: actor_key,
            md_id: ELECTRO_SHOT_MD_ID,
            slot_index,
        })?;

    if pending_electro_shot_effect(actor).is_some() {
        let mut release_state = state.clone();
        let release_actor = release_state
            .pokemon_mut(actor_key)
            .ok_or(TurnExecutionError::MissingPokemon(actor_key))?;
        release_actor.volatile_effects.retain(|effect| {
            effect.md_id != ELECTRO_SHOT_CHARGE_EFFECT_MD_ID
                || effect.execute_id != ELECTRO_SHOT_MD_ID
        });
        let release_context = CoreExecutionContext {
            consume_pp: false,
            ..context.clone()
        };
        return execute_damage_move(
            &release_state,
            actor_key,
            target_key,
            ELECTRO_SHOT_MD_ID,
            slot_index,
            &release_context,
            catalog,
        );
    }

    if simulation_move.locked || (context.consume_pp && simulation_move.current_pp <= 0) {
        return Err(TurnExecutionError::MoveUnavailable {
            actor: actor_key,
            md_id: ELECTRO_SHOT_MD_ID,
        });
    }

    let mut prepared_state = state.clone();
    let prepared_actor = prepared_state
        .pokemon_mut(actor_key)
        .ok_or(TurnExecutionError::MissingPokemon(actor_key))?;
    prepared_actor.stat_stages.special_attack = prepared_actor
        .stat_stages
        .special_attack
        .saturating_add(1)
        .min(6);

    if matches!(
        effective_weather_for_pokemon(state, actor_key, catalog),
        2 | 5
    ) {
        return execute_damage_move(
            &prepared_state,
            actor_key,
            target_key,
            ELECTRO_SHOT_MD_ID,
            slot_index,
            context,
            catalog,
        );
    }

    if context.consume_pp {
        let prepared_move = prepared_actor
            .moves
            .iter_mut()
            .find(|entry| entry.md_id == ELECTRO_SHOT_MD_ID && Some(entry.slot_index) == slot_index)
            .ok_or(TurnExecutionError::MissingMove {
                actor: actor_key,
                md_id: ELECTRO_SHOT_MD_ID,
                slot_index,
            })?;
        prepared_move.current_pp -= 1;
    }
    apply_choice_lock(prepared_actor, slot_index, catalog);
    let encoded_target_team = i16::try_from(target_key.team_index.saturating_add(1))
        .map_err(|_| TurnExecutionError::Overflow)?;
    prepared_actor.volatile_effects.push(EffectSnapshot {
        md_id: ELECTRO_SHOT_CHARGE_EFFECT_MD_ID,
        execute_kind: 1,
        execute_id: ELECTRO_SHOT_MD_ID,
        target_execute_kind: encoded_target_team,
        target_execute_id: target_key.group_index,
        ..EffectSnapshot::default()
    });
    Ok(vec![CoreExecutionBranch {
        probability: ExactProbability::new(1, 1)?,
        event: CoreExecutionEvent::Charge {
            actor: actor_key,
            target: target_key,
            md_id: ELECTRO_SHOT_MD_ID,
        },
        state: prepared_state,
    }])
}

fn execute_damage_move(
    state: &SimulationState,
    actor_key: PokemonKey,
    target_key: PokemonKey,
    md_id: i32,
    slot_index: Option<i32>,
    context: &CoreExecutionContext,
    catalog: &MechanicsCatalog,
) -> Result<Vec<CoreExecutionBranch>, TurnExecutionError> {
    if context.affected_targets == 0 {
        return Err(TurnExecutionError::InvalidAffectedTargets(0));
    }
    let actor = state
        .pokemon(actor_key)
        .ok_or(TurnExecutionError::MissingPokemon(actor_key))?;
    validate_active(actor_key, actor)?;
    let target = state
        .pokemon(target_key)
        .ok_or(TurnExecutionError::MissingPokemon(target_key))?;
    validate_active(target_key, target)?;
    let focus_sash_ready = target.current_hp == target.maximum_hp()
        && target.item_md_id.is_some_and(|item_md_id| {
            catalog
                .items_by_num(item_md_id)
                .any(|item| item.id == "focussash")
        });
    let simulation_move = actor
        .moves
        .iter()
        .find(|entry| entry.md_id == md_id && Some(entry.slot_index) == slot_index)
        .ok_or(TurnExecutionError::MissingMove {
            actor: actor_key,
            md_id,
            slot_index,
        })?;
    if simulation_move.locked || (context.consume_pp && simulation_move.current_pp <= 0) {
        return Err(TurnExecutionError::MoveUnavailable {
            actor: actor_key,
            md_id,
        });
    }
    let life_orb = actor.item_md_id.is_some_and(|item_md_id| {
        catalog
            .items_by_num(item_md_id)
            .any(|item| item.id == "lifeorb")
    });
    ensure_no_unresolved_state_effects(md_id, catalog)?;
    let secondary_boost = parse_secondary_boost(md_id, catalog)?;
    let recoil = parse_recoil(md_id, catalog)?;
    let makes_contact = catalog
        .move_by_num(md_id)
        .is_some_and(|move_record| move_record.flags.contains_key("contact"));
    let target_has_rough_skin = catalog
        .abilities_by_num(target.ability_md_id)
        .any(|ability| ability.id == "roughskin");
    let target_has_defiant = actor_key.team_index != target_key.team_index
        && catalog
            .abilities_by_num(target.ability_md_id)
            .any(|ability| ability.id == "defiant");
    let target_has_keen_eye = catalog
        .abilities_by_num(target.ability_md_id)
        .any(|ability| ability.id == "keeneye");
    let move_record = catalog
        .move_by_num(md_id)
        .ok_or(CoreDamageError::UnknownMove(md_id))?;
    let target_protected = move_record.flags.contains_key("protect")
        && target
            .volatile_effects
            .iter()
            .any(|effect| effect.md_id == PROTECT_ACTIVE_EFFECT_MD_ID && effect.execute_id == 182);
    let target_wide_guarded = move_record.flags.contains_key("protect")
        && matches!(
            move_record.target.as_str(),
            "allAdjacent" | "allAdjacentFoes"
        )
        && target.position.is_some_and(|position| {
            state
                .world
                .sides
                .iter()
                .find(|side| side.side_index == position.side_index)
                .is_some_and(|side| {
                    side.field_effects.iter().any(|effect| {
                        effect.md_id == WIDE_GUARD_SIDE_EFFECT_MD_ID && effect.execute_id == 469
                    })
                })
        });
    if recoil.is_some() && context.affected_targets != 1 {
        return Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id,
            rule: "multi-target recoil accumulation".to_owned(),
        });
    }
    let resolved_move = resolve_damage_move(state, actor_key, md_id, catalog)?;
    let resist_berry_active = matching_resist_berry(target, &resolved_move.move_type, catalog)?;
    let hit_chance = calculate_hit_chance(
        state,
        &HitChanceRequest {
            actor: actor_key,
            target: target_key,
            md_id,
            modifiers: context.accuracy_modifiers.clone(),
        },
        catalog,
    )?;
    let mut damage_modifiers_after_random = context.damage_modifiers_after_random.clone();
    if life_orb {
        damage_modifiers_after_random.push(Rational {
            numerator: 5_324,
            denominator: 4_096,
        });
    }
    if resist_berry_active {
        damage_modifiers_after_random.push(Rational::new(1, 2).map_err(CoreDamageError::from)?);
    }
    let damage_request = CoreDamageRequest {
        actor: actor_key,
        target: target_key,
        resolved_move,
        affected_targets: context.affected_targets,
        modifiers_before_random: context.damage_modifiers_before_random.clone(),
        modifiers_after_random: damage_modifiers_after_random,
    };
    let (critical_numerator, critical_denominator) =
        critical_hit_probability(move_record, context.critical_hit_mode)?;
    let mut damage_variants = Vec::with_capacity(2);
    if critical_numerator < critical_denominator {
        damage_variants.push((
            false,
            calculate_core_damage_variant(state, &damage_request, false, catalog)?,
            critical_denominator - critical_numerator,
        ));
    }
    if critical_numerator > 0 {
        damage_variants.push((
            true,
            calculate_core_damage_variant(state, &damage_request, true, catalog)?,
            critical_numerator,
        ));
    }
    let mut state_after_pp = state.clone();
    if context.consume_pp {
        let actor_after_pp = state_after_pp
            .pokemon_mut(actor_key)
            .ok_or(TurnExecutionError::MissingPokemon(actor_key))?;
        let move_after_pp = actor_after_pp
            .moves
            .iter_mut()
            .find(|entry| entry.md_id == md_id && Some(entry.slot_index) == slot_index)
            .ok_or(TurnExecutionError::MissingMove {
                actor: actor_key,
                md_id,
                slot_index,
            })?;
        move_after_pp.current_pp -= 1;
        apply_choice_lock(actor_after_pp, slot_index, catalog);
    }
    if target_protected || target_wide_guarded {
        return Ok(vec![CoreExecutionBranch {
            probability: ExactProbability::new(1, 1)?,
            event: CoreExecutionEvent::Protected {
                actor: actor_key,
                target: target_key,
                md_id,
            },
            state: state_after_pp,
        }]);
    }

    let mut branches = Vec::new();
    if hit_chance.miss_numerator() > 0 {
        branches.push(CoreExecutionBranch {
            probability: ExactProbability::new(
                u64::from(hit_chance.miss_numerator()),
                u64::from(hit_chance.denominator),
            )?,
            event: CoreExecutionEvent::Miss {
                actor: actor_key,
                target: target_key,
                md_id,
            },
            state: state_after_pp.clone(),
        });
    }
    for (critical, damage, critical_weight) in damage_variants {
        let roll_counts = damage.rolls.values.iter().copied().fold(
            BTreeMap::<i32, u64>::new(),
            |mut counts, roll| {
                *counts.entry(roll).or_default() += 1;
                counts
            },
        );
        let roll_denominator =
            u64::try_from(damage.rolls.values.len()).map_err(|_| TurnExecutionError::Overflow)?;
        let combined_denominator = u64::from(hit_chance.denominator)
            .checked_mul(roll_denominator)
            .and_then(|value| value.checked_mul(critical_denominator))
            .ok_or(TurnExecutionError::Overflow)?;
        for (roll, count) in roll_counts {
            let numerator = u64::from(hit_chance.numerator)
                .checked_mul(count)
                .and_then(|value| value.checked_mul(critical_weight))
                .ok_or(TurnExecutionError::Overflow)?;
            let mut next_state = state_after_pp.clone();
            let (before, after, target_fainted, damage_dealt) = {
                let target = next_state
                    .pokemon_mut(target_key)
                    .ok_or(TurnExecutionError::MissingPokemon(target_key))?;
                let before = target.current_hp;
                let focus_sash_triggered = focus_sash_ready && roll >= before;
                target.current_hp = if focus_sash_triggered {
                    1
                } else {
                    (target.current_hp - roll).max(0)
                };
                if focus_sash_triggered {
                    target.item_md_id = None;
                }
                target.fainted = target.current_hp == 0;
                if roll > 0
                    && !target.fainted
                    && catalog
                        .abilities_by_num(target.ability_md_id)
                        .any(|ability| ability.id == "stamina")
                {
                    target.stat_stages.defense =
                        target.stat_stages.defense.saturating_add(1).min(6);
                }
                let damage_dealt = before - target.current_hp;
                if resist_berry_active && damage_dealt > 0 {
                    target.item_md_id = None;
                }
                let sitrus_ready = target.current_hp > 0
                    && target.current_hp.saturating_mul(2) <= target.maximum_hp()
                    && target.item_md_id.is_some_and(|item_md_id| {
                        catalog
                            .items_by_num(item_md_id)
                            .any(|item| item.id == "sitrusberry")
                    });
                if sitrus_ready {
                    let recovery = (target.maximum_hp() / 4).max(1);
                    target.current_hp = target
                        .current_hp
                        .saturating_add(recovery)
                        .min(target.maximum_hp());
                    target.item_md_id = None;
                }
                (before, target.current_hp, target.fainted, damage_dealt)
            };
            if makes_contact && target_has_rough_skin && damage_dealt > 0 {
                let actor = next_state
                    .pokemon_mut(actor_key)
                    .ok_or(TurnExecutionError::MissingPokemon(actor_key))?;
                let rough_skin_damage = (actor.maximum_hp() / 8).max(1);
                actor.current_hp = (actor.current_hp - rough_skin_damage).max(0);
                actor.fainted = actor.current_hp == 0;
            }
            if let Some((numerator, denominator)) = recoil
                && damage_dealt > 0
            {
                let recoil_damage = calculate_recoil_damage(damage_dealt, numerator, denominator)?;
                let actor = next_state
                    .pokemon_mut(actor_key)
                    .ok_or(TurnExecutionError::MissingPokemon(actor_key))?;
                actor.current_hp = (actor.current_hp - recoil_damage).max(0);
                actor.fainted = actor.current_hp == 0;
            }
            if life_orb && context.apply_life_orb_recoil && damage_dealt > 0 {
                let actor = next_state
                    .pokemon_mut(actor_key)
                    .ok_or(TurnExecutionError::MissingPokemon(actor_key))?;
                if actor.current_hp > 0 {
                    let life_orb_damage = (actor.maximum_hp() / 10).max(1);
                    actor.current_hp = (actor.current_hp - life_orb_damage).max(0);
                    actor.fainted = actor.current_hp == 0;
                }
            }
            let probability = ExactProbability::new(numerator, combined_denominator)?;
            let event = CoreExecutionEvent::Damage {
                actor: actor_key,
                target: target_key,
                md_id,
                critical,
                damage: damage_dealt,
                target_hp_before: before,
                target_hp_after: after,
                fainted: target_fainted,
            };
            if let Some(secondary) = &secondary_boost
                && roll > 0
                && !target_fainted
            {
                if secondary.chance < 100 {
                    branches.push(CoreExecutionBranch {
                        probability: probability
                            .multiply(ExactProbability::new(100 - secondary.chance, 100)?)?,
                        event: event.clone(),
                        state: next_state.clone(),
                    });
                }
                if secondary.chance > 0 {
                    let mut boosted_state = next_state;
                    apply_secondary_boost(
                        boosted_state
                            .pokemon_mut(target_key)
                            .ok_or(TurnExecutionError::MissingPokemon(target_key))?,
                        secondary,
                        target_has_defiant,
                        target_has_keen_eye,
                    );
                    branches.push(CoreExecutionBranch {
                        probability: probability
                            .multiply(ExactProbability::new(secondary.chance, 100)?)?,
                        event,
                        state: boosted_state,
                    });
                }
            } else {
                branches.push(CoreExecutionBranch {
                    probability,
                    event,
                    state: next_state,
                });
            }
        }
    }
    Ok(branches)
}

fn critical_hit_probability(
    move_record: &crate::MoveRecord,
    mode: CriticalHitMode,
) -> Result<(u64, u64), TurnExecutionError> {
    match mode {
        CriticalHitMode::Never => return Ok((0, 1)),
        CriticalHitMode::Always => return Ok((1, 1)),
        CriticalHitMode::Random => {}
    }
    match move_record.mechanics.get("willCrit") {
        Some(Value::Bool(true)) => return Ok((1, 1)),
        Some(Value::Bool(false)) | Some(Value::Null) | None => {}
        Some(value) => {
            return Err(TurnExecutionError::UnresolvedMoveStateEffect {
                md_id: move_record.num,
                rule: format!("malformed willCrit value {value}"),
            });
        }
    }
    let stage = match move_record.mechanics.get("critRatio") {
        Some(Value::Number(value)) => {
            value
                .as_i64()
                .ok_or_else(|| TurnExecutionError::UnresolvedMoveStateEffect {
                    md_id: move_record.num,
                    rule: format!("malformed critRatio value {value}"),
                })?
        }
        Some(Value::Null) | None => 1,
        Some(value) => {
            return Err(TurnExecutionError::UnresolvedMoveStateEffect {
                md_id: move_record.num,
                rule: format!("malformed critRatio value {value}"),
            });
        }
    };
    match stage {
        i64::MIN..=0 => Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id: move_record.num,
            rule: format!("invalid critRatio stage {stage}"),
        }),
        1 => Ok((1, 24)),
        2 => Ok((1, 8)),
        3 => Ok((1, 2)),
        _ => Ok((1, 1)),
    }
}

fn matching_resist_berry(
    target: &SimulationPokemon,
    move_type: &str,
    catalog: &MechanicsCatalog,
) -> Result<bool, TurnExecutionError> {
    let Some(item_md_id) = target.item_md_id else {
        return Ok(false);
    };
    let berry_type = catalog.items_by_num(item_md_id).find_map(|item| {
        Some(match item.id.as_str() {
            "occaberry" => "Fire",
            "passhoberry" => "Water",
            "wacanberry" => "Electric",
            "rindoberry" => "Grass",
            "yacheberry" => "Ice",
            "chopleberry" => "Fighting",
            "kebiaberry" => "Poison",
            "shucaberry" => "Ground",
            "cobaberry" => "Flying",
            "payapaberry" => "Psychic",
            "tangaberry" => "Bug",
            "chartiberry" => "Rock",
            "kasibberry" => "Ghost",
            "habanberry" => "Dragon",
            "colburberry" => "Dark",
            "babiriberry" => "Steel",
            "chilanberry" => "Normal",
            "roseliberry" => "Fairy",
            _ => return None,
        })
    });
    let Some(berry_type) = berry_type else {
        return Ok(false);
    };
    if !move_type.eq_ignore_ascii_case(berry_type) {
        return Ok(false);
    }
    if berry_type == "Normal" {
        return Ok(true);
    }
    let effectiveness =
        type_multiplier(move_type, &target.types, catalog).map_err(CoreDamageError::from)?;
    Ok(effectiveness.numerator > effectiveness.denominator)
}

fn apply_choice_lock(
    pokemon: &mut SimulationPokemon,
    selected_slot_index: Option<i32>,
    catalog: &MechanicsCatalog,
) {
    let choice_item = pokemon.item_md_id.is_some_and(|item_md_id| {
        catalog.items_by_num(item_md_id).any(|item| {
            matches!(
                item.id.as_str(),
                "choiceband" | "choicescarf" | "choicespecs"
            )
        })
    });
    if choice_item {
        for simulation_move in &mut pokemon.moves {
            simulation_move.locked = Some(simulation_move.slot_index) != selected_slot_index;
        }
    }
}

fn execute_switch(
    state: &SimulationState,
    actor_key: PokemonKey,
    replacement_key: PokemonKey,
    catalog: &MechanicsCatalog,
) -> Result<Vec<CoreExecutionBranch>, TurnExecutionError> {
    if actor_key.team_index != replacement_key.team_index || actor_key == replacement_key {
        return Err(TurnExecutionError::InvalidSwitch {
            actor: actor_key,
            replacement: replacement_key,
        });
    }
    let actor = state
        .pokemon(actor_key)
        .ok_or(TurnExecutionError::MissingPokemon(actor_key))?;
    let position = actor
        .position
        .ok_or(TurnExecutionError::InactivePokemon(actor_key))?;
    let replacement = state
        .pokemon(replacement_key)
        .ok_or(TurnExecutionError::MissingPokemon(replacement_key))?;
    if replacement.position.is_some() || replacement.fainted || replacement.current_hp <= 0 {
        return Err(TurnExecutionError::InvalidSwitch {
            actor: actor_key,
            replacement: replacement_key,
        });
    }
    let summons_rain = catalog
        .abilities_by_num(replacement.ability_md_id)
        .any(|ability| ability.id == "drizzle");
    let provides_hospitality = catalog
        .abilities_by_num(replacement.ability_md_id)
        .any(|ability| ability.id == "hospitality");
    let supreme_overlord = catalog
        .abilities_by_num(replacement.ability_md_id)
        .any(|ability| ability.id == "supremeoverlord");
    let fallen_allies = state
        .teams
        .iter()
        .find(|team| team.team_index == replacement_key.team_index)
        .map(|team| {
            team.pokemon
                .iter()
                .filter(|pokemon| team.pokemon_order.contains(&pokemon.key.group_index))
                .filter(|pokemon| pokemon.fainted || pokemon.current_hp <= 0)
                .count()
                .min(5) as i32
        })
        .ok_or(TurnExecutionError::MissingPokemon(replacement_key))?;

    let mut next_state = state.clone();
    let actor = next_state
        .pokemon_mut(actor_key)
        .ok_or(TurnExecutionError::MissingPokemon(actor_key))?;
    actor.position = None;
    actor.stat_stages = crate::StatStages::default();
    actor.substitute = false;
    actor.volatile_effects.clear();
    actor.field_effects.clear();
    for simulation_move in &mut actor.moves {
        simulation_move.locked = false;
    }
    let replacement = next_state
        .pokemon_mut(replacement_key)
        .ok_or(TurnExecutionError::MissingPokemon(replacement_key))?;
    replacement.position = Some(position);
    replacement
        .volatile_effects
        .retain(|effect| effect.md_id != SUPREME_OVERLORD_EFFECT_MD_ID);
    if supreme_overlord {
        replacement.volatile_effects.push(EffectSnapshot {
            md_id: SUPREME_OVERLORD_EFFECT_MD_ID,
            execute_kind: 1,
            execute_id: 293,
            step_or_count: fallen_allies,
            ..EffectSnapshot::default()
        });
    }
    if let Some(world_position) = next_state
        .world
        .sides
        .iter_mut()
        .find(|side| side.side_index == position.side_index)
        .and_then(|side| {
            side.positions
                .iter_mut()
                .find(|entry| entry.position_index == position.position_index)
        })
    {
        world_position.registered_group_index = Some(replacement_key.group_index);
        world_position.registered_user_index = Some(replacement_key.team_index);
    }
    if summons_rain {
        next_state.world.weather_md_id = 2;
        next_state.world.weather_lifespan_turns = 5;
        next_state.world.weather_elapsed_turns = 0;
    }
    if provides_hospitality {
        let team = next_state
            .teams
            .iter_mut()
            .find(|team| team.team_index == replacement_key.team_index)
            .ok_or(TurnExecutionError::MissingPokemon(replacement_key))?;
        for ally in &mut team.pokemon {
            if ally.key != replacement_key && ally.is_active() {
                let recovery = (ally.maximum_hp() / 4).max(1);
                ally.current_hp = ally
                    .current_hp
                    .saturating_add(recovery)
                    .min(ally.maximum_hp());
            }
        }
    }
    Ok(vec![CoreExecutionBranch {
        probability: ExactProbability::new(1, 1)?,
        event: CoreExecutionEvent::Switch {
            actor: actor_key,
            replacement: replacement_key,
        },
        state: next_state,
    }])
}

fn validate_active(
    key: PokemonKey,
    pokemon: &crate::SimulationPokemon,
) -> Result<(), TurnExecutionError> {
    if pokemon.position.is_none() {
        return Err(TurnExecutionError::InactivePokemon(key));
    }
    if pokemon.fainted || pokemon.current_hp <= 0 {
        return Err(TurnExecutionError::FaintedPokemon(key));
    }
    Ok(())
}

fn ensure_no_unresolved_state_effects(
    md_id: i32,
    catalog: &MechanicsCatalog,
) -> Result<(), TurnExecutionError> {
    let move_record = catalog
        .move_by_num(md_id)
        .ok_or(CoreDamageError::UnknownMove(md_id))?;
    for rule in [
        "boosts",
        "drain",
        "forceSwitch",
        "heal",
        "self",
        "selfDestruct",
        "status",
        "volatileStatus",
    ] {
        let Some(value) = move_record.mechanics.get(rule) else {
            continue;
        };
        let meaningful = match value {
            Value::Null | Value::Bool(false) => false,
            Value::Array(values) => !values.is_empty(),
            Value::Object(values) => !values.is_empty(),
            _ => true,
        };
        if meaningful {
            return Err(TurnExecutionError::UnresolvedMoveStateEffect {
                md_id,
                rule: rule.to_owned(),
            });
        }
    }
    parse_secondary_boost(md_id, catalog)?;
    parse_recoil(md_id, catalog)?;
    Ok(())
}

fn parse_recoil(
    md_id: i32,
    catalog: &MechanicsCatalog,
) -> Result<Option<(i32, i32)>, TurnExecutionError> {
    let move_record = catalog
        .move_by_num(md_id)
        .ok_or(CoreDamageError::UnknownMove(md_id))?;
    let Some(value) = move_record.mechanics.get("recoil") else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }
    let Value::Array(parts) = value else {
        return Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id,
            rule: "recoil ratio is not an array".to_owned(),
        });
    };
    if parts.len() != 2 {
        return Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id,
            rule: format!("recoil ratio has {} parts", parts.len()),
        });
    }
    let numerator = parts[0]
        .as_i64()
        .and_then(|value| i32::try_from(value).ok());
    let denominator = parts[1]
        .as_i64()
        .and_then(|value| i32::try_from(value).ok());
    match (numerator, denominator) {
        (Some(numerator), Some(denominator)) if numerator > 0 && denominator > 0 => {
            Ok(Some((numerator, denominator)))
        }
        _ => Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id,
            rule: "recoil ratio must contain two positive integers".to_owned(),
        }),
    }
}

fn calculate_recoil_damage(
    damage_dealt: i32,
    numerator: i32,
    denominator: i32,
) -> Result<i32, TurnExecutionError> {
    let scaled = i64::from(damage_dealt)
        .checked_mul(i64::from(numerator))
        .and_then(|value| value.checked_add(i64::from(denominator / 2)))
        .ok_or(TurnExecutionError::Overflow)?;
    i32::try_from((scaled / i64::from(denominator)).max(1))
        .map_err(|_| TurnExecutionError::Overflow)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SecondaryBoost {
    chance: u64,
    stages: Vec<(String, i32)>,
    status: Option<String>,
    volatile_status: Option<String>,
}

fn parse_secondary_boost(
    md_id: i32,
    catalog: &MechanicsCatalog,
) -> Result<Option<SecondaryBoost>, TurnExecutionError> {
    let move_record = catalog
        .move_by_num(md_id)
        .ok_or(CoreDamageError::UnknownMove(md_id))?;
    let Some(secondaries) = move_record.mechanics.get("secondaries") else {
        return Ok(None);
    };
    let Value::Array(secondaries) = secondaries else {
        if secondaries.is_null() {
            return Ok(None);
        }
        return Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id,
            rule: "secondaries must be an array".to_owned(),
        });
    };
    if secondaries.is_empty() {
        return Ok(None);
    }
    if secondaries.len() != 1 {
        return Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id,
            rule: format!("{} secondary entries", secondaries.len()),
        });
    }
    let Value::Object(secondary) = &secondaries[0] else {
        return Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id,
            rule: "secondary entry is not an object".to_owned(),
        });
    };
    if secondary.keys().any(|key| {
        !matches!(
            key.as_str(),
            "boosts" | "chance" | "status" | "volatileStatus"
        )
    }) {
        return Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id,
            rule: "secondary contains an unsupported effect".to_owned(),
        });
    }
    let chance = secondary
        .get("chance")
        .and_then(Value::as_u64)
        .unwrap_or(100);
    if chance > 100 {
        return Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id,
            rule: format!("secondary chance is {chance}"),
        });
    }
    let mut stages = Vec::new();
    if let Some(boosts) = secondary.get("boosts") {
        let Value::Object(boosts) = boosts else {
            return Err(TurnExecutionError::UnresolvedMoveStateEffect {
                md_id,
                rule: "secondary stat boosts are not an object".to_owned(),
            });
        };
        for (stat, value) in boosts {
            if !matches!(
                stat.as_str(),
                "accuracy" | "atk" | "def" | "evasion" | "spa" | "spd" | "spe"
            ) {
                return Err(TurnExecutionError::UnresolvedMoveStateEffect {
                    md_id,
                    rule: format!("secondary changes unsupported stat {stat}"),
                });
            }
            let delta = value
                .as_i64()
                .and_then(|value| i32::try_from(value).ok())
                .ok_or_else(|| TurnExecutionError::UnresolvedMoveStateEffect {
                    md_id,
                    rule: format!("secondary stat {stat} has non-integer delta"),
                })?;
            stages.push((stat.clone(), delta));
        }
    }
    let status = secondary
        .get("status")
        .and_then(Value::as_str)
        .map(str::to_owned);
    if status
        .as_deref()
        .is_some_and(|status| !matches!(status, "brn" | "frz" | "par" | "psn" | "slp" | "tox"))
    {
        return Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id,
            rule: format!("secondary has unsupported status {}", status.unwrap()),
        });
    }
    let volatile_status = secondary
        .get("volatileStatus")
        .and_then(Value::as_str)
        .map(str::to_owned);
    if volatile_status
        .as_deref()
        .is_some_and(|status| !matches!(status, "confusion" | "flinch"))
    {
        return Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id,
            rule: format!(
                "secondary has unsupported volatile status {}",
                volatile_status.unwrap()
            ),
        });
    }
    if stages.is_empty() && status.is_none() && volatile_status.is_none() {
        return Err(TurnExecutionError::UnresolvedMoveStateEffect {
            md_id,
            rule: "secondary effect is empty".to_owned(),
        });
    }
    stages.sort();
    Ok(Some(SecondaryBoost {
        chance,
        stages,
        status,
        volatile_status,
    }))
}

fn apply_secondary_boost(
    pokemon: &mut crate::SimulationPokemon,
    secondary: &SecondaryBoost,
    has_defiant: bool,
    has_keen_eye: bool,
) {
    let mut lowered = false;
    for (stat, delta) in &secondary.stages {
        if has_keen_eye && stat == "accuracy" && *delta < 0 {
            continue;
        }
        let stage = match stat.as_str() {
            "atk" => &mut pokemon.stat_stages.attack,
            "def" => &mut pokemon.stat_stages.defense,
            "spa" => &mut pokemon.stat_stages.special_attack,
            "spd" => &mut pokemon.stat_stages.special_defense,
            "spe" => &mut pokemon.stat_stages.speed,
            "accuracy" => &mut pokemon.stat_stages.accuracy,
            "evasion" => &mut pokemon.stat_stages.evasion,
            _ => unreachable!("secondary stat keys were validated"),
        };
        let before = *stage;
        *stage = stage.saturating_add(*delta).clamp(-6, 6);
        lowered |= *stage < before;
    }
    if has_defiant && lowered {
        pokemon.stat_stages.attack = pokemon.stat_stages.attack.saturating_add(2).min(6);
    }
    if pokemon.status_condition == 0
        && let Some(status) = secondary.status.as_deref()
        && status_can_affect(pokemon, status)
    {
        pokemon.status_condition = match status {
            "slp" => 1,
            "psn" => 2,
            "brn" => 3,
            "frz" => 4,
            "par" => 5,
            "tox" => 6,
            _ => unreachable!("secondary status IDs were validated"),
        };
    }
    let volatile_effect_md_id = match secondary.volatile_status.as_deref() {
        Some("confusion") => Some(CONFUSION_EFFECT_MD_ID),
        Some("flinch") => Some(FLINCH_EFFECT_MD_ID),
        _ => None,
    };
    if let Some(volatile_effect_md_id) = volatile_effect_md_id
        && !pokemon
            .volatile_effects
            .iter()
            .any(|effect| effect.md_id == volatile_effect_md_id)
    {
        pokemon.volatile_effects.push(EffectSnapshot {
            md_id: volatile_effect_md_id,
            lifespan_turns: if volatile_effect_md_id == CONFUSION_EFFECT_MD_ID {
                4
            } else {
                1
            },
            elapsed_turns: 0,
            ..EffectSnapshot::default()
        });
    }
}

fn status_can_affect(pokemon: &SimulationPokemon, status: &str) -> bool {
    let has_type = |kind: &str| {
        pokemon
            .types
            .iter()
            .any(|pokemon_type| pokemon_type.eq_ignore_ascii_case(kind))
    };
    match status {
        "brn" => !has_type("Fire"),
        "frz" => !has_type("Ice"),
        "par" => !has_type("Electric"),
        "psn" | "tox" => !has_type("Poison") && !has_type("Steel"),
        "slp" => true,
        _ => false,
    }
}

fn greatest_common_divisor(left: u64, right: u64) -> u64 {
    let mut left = left;
    let mut right = right;
    while right != 0 {
        let remainder = left % right;
        left = right;
        right = remainder;
    }
    left.max(1)
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

    fn pokemon(team_index: i32, group_index: i32, active: bool) -> SimulationPokemon {
        SimulationPokemon {
            key: PokemonKey {
                team_index,
                group_index,
            },
            species_id: "pelipper".to_owned(),
            form_no: 0,
            item_md_id: None,
            ability_md_id: 2,
            nature_id: "hardy".to_owned(),
            training_points: TrainingPoints::default(),
            stats: BattleStats {
                hp: 150,
                attack: 100,
                defense: 100,
                special_attack: 100,
                special_defense: 100,
                speed: 100,
            },
            current_hp: 150,
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
                current_pp: 10,
                max_pp: 10,
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
                    pokemon_order: vec![0, 1],
                    pokemon: vec![pokemon(0, 0, true), pokemon(0, 1, false)],
                },
                SimulationTeam {
                    team_index: 1,
                    is_local_player: false,
                    pokemon_order: vec![0],
                    pokemon: vec![pokemon(1, 0, true)],
                },
            ],
        }
    }

    fn tackle() -> BattleAction {
        BattleAction::UseMove {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            md_id: 33,
            slot_index: Some(0),
            target: ActionTarget::Pokemon {
                key: PokemonKey {
                    team_index: 1,
                    group_index: 0,
                },
            },
            replacement: None,
            mega: false,
        }
    }

    fn electro_shot_state(weather_md_id: i32) -> SimulationState {
        let mut state = state();
        state.world.weather_md_id = weather_md_id;
        state.teams[0].pokemon[0].moves[0] = SimulationMove {
            md_id: ELECTRO_SHOT_MD_ID,
            slot_index: 0,
            current_pp: 12,
            max_pp: 12,
            locked: false,
        };
        state
    }

    fn electro_shot_action() -> BattleAction {
        BattleAction::UseMove {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            md_id: ELECTRO_SHOT_MD_ID,
            slot_index: Some(0),
            target: ActionTarget::Pokemon {
                key: PokemonKey {
                    team_index: 1,
                    group_index: 0,
                },
            },
            replacement: None,
            mega: false,
        }
    }

    #[test]
    fn damage_execution_consumes_pp_and_compresses_equal_rolls() {
        let branches = execute_core_action(
            &state(),
            &tackle(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog(),
        )
        .expect("Tackle should execute");
        assert!(!branches.is_empty());
        assert!(branches.len() < 16);
        for branch in &branches {
            assert_eq!(branch.state.teams[0].pokemon[0].moves[0].current_pp, 9);
            assert!(branch.state.teams[1].pokemon[0].current_hp < 150);
        }
    }

    #[test]
    fn ordinary_damage_branches_with_one_in_twenty_four_critical_probability() {
        let branches = execute_core_action(
            &state(),
            &tackle(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog(),
        )
        .expect("Tackle should execute");
        let critical_probability = branches
            .iter()
            .filter(|branch| {
                matches!(
                    branch.event,
                    CoreExecutionEvent::Damage { critical: true, .. }
                )
            })
            .try_fold(ExactProbability::new(0, 1).unwrap(), |sum, branch| {
                sum.add(branch.probability)
            })
            .unwrap();
        assert_eq!(critical_probability, ExactProbability::new(1, 24).unwrap());
        assert!(branches.iter().any(|branch| {
            matches!(
                branch.event,
                CoreExecutionEvent::Damage {
                    critical: false,
                    ..
                }
            )
        }));

        let noncritical = execute_core_action(
            &state(),
            &tackle(),
            &CoreExecutionContext {
                affected_targets: 1,
                critical_hit_mode: CriticalHitMode::Never,
                ..CoreExecutionContext::default()
            },
            &catalog(),
        )
        .unwrap();
        assert!(noncritical.iter().all(|branch| {
            matches!(
                branch.event,
                CoreExecutionEvent::Damage {
                    critical: false,
                    ..
                }
            )
        }));
    }

    #[test]
    fn focus_sash_survives_a_lethal_full_hp_hit_and_is_consumed() {
        let catalog = catalog();
        let mut state = state();
        state.teams[0].pokemon[0].stats.attack = 10_000;
        state.teams[1].pokemon[0].item_md_id = Some(
            catalog
                .item_by_id("focussash")
                .expect("mechanics pack should include Focus Sash")
                .num,
        );

        let branches = execute_core_action(
            &state,
            &tackle(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog,
        )
        .expect("Focus Sash should resolve");

        assert!(branches.iter().all(|branch| {
            let target = &branch.state.teams[1].pokemon[0];
            target.current_hp == 1 && !target.fainted && target.item_md_id.is_none()
        }));
    }

    #[test]
    fn sitrus_berry_heals_at_half_hp_and_is_consumed() {
        let catalog = catalog();
        let mut state = state();
        let target = &mut state.teams[1].pokemon[0];
        target.current_hp = 80;
        target.item_md_id = Some(
            catalog
                .item_by_id("sitrusberry")
                .expect("mechanics pack should include Sitrus Berry")
                .num,
        );

        let branches = execute_core_action(
            &state,
            &tackle(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog,
        )
        .expect("Sitrus Berry should resolve");

        assert!(branches.iter().all(|branch| {
            let target = &branch.state.teams[1].pokemon[0];
            target.item_md_id.is_none() && target.current_hp >= 75
        }));
    }

    #[test]
    fn resist_berry_halves_a_matching_super_effective_hit_and_is_consumed() {
        let catalog = catalog();
        let mut ordinary_state = state();
        ordinary_state.teams[0].pokemon[0].moves[0] = SimulationMove {
            md_id: 2,
            slot_index: 0,
            current_pp: 25,
            max_pp: 25,
            locked: false,
        };
        let action = BattleAction::UseMove {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            md_id: 2,
            slot_index: Some(0),
            target: ActionTarget::Pokemon {
                key: PokemonKey {
                    team_index: 1,
                    group_index: 0,
                },
            },
            replacement: None,
            mega: false,
        };
        let ordinary = execute_core_action(
            &ordinary_state,
            &action,
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog,
        )
        .expect("ordinary Fighting hit should resolve");
        let mut berry_state = ordinary_state;
        berry_state.teams[1].pokemon[0].item_md_id = Some(
            catalog
                .item_by_id("chopleberry")
                .expect("mechanics pack should include Chople Berry")
                .num,
        );
        let resisted = execute_core_action(
            &berry_state,
            &action,
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog,
        )
        .expect("Chople Berry should resolve");
        let maximum_damage = |branches: &[CoreExecutionBranch]| {
            branches
                .iter()
                .filter_map(|branch| match branch.event {
                    CoreExecutionEvent::Damage { damage, .. } => Some(damage),
                    _ => None,
                })
                .max()
                .unwrap()
        };
        assert!(maximum_damage(&resisted) < maximum_damage(&ordinary));
        assert!(
            resisted
                .iter()
                .all(|branch| { branch.state.teams[1].pokemon[0].item_md_id.is_none() })
        );
    }

    #[test]
    fn choice_scarf_locks_other_moves_after_the_first_executed_move() {
        let catalog = catalog();
        let mut state = state();
        let actor = &mut state.teams[0].pokemon[0];
        actor.item_md_id = Some(
            catalog
                .item_by_id("choicescarf")
                .expect("mechanics pack should include Choice Scarf")
                .num,
        );
        actor.moves.push(SimulationMove {
            md_id: 55,
            slot_index: 1,
            current_pp: 25,
            max_pp: 25,
            locked: false,
        });

        let branches = execute_core_action(
            &state,
            &tackle(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog,
        )
        .expect("Choice Scarf move should execute");

        assert!(branches.iter().all(|branch| {
            let moves = &branch.state.teams[0].pokemon[0].moves;
            !moves[0].locked && moves[1].locked
        }));
    }

    #[test]
    fn electro_shot_charges_then_releases_without_spending_pp_twice() {
        let catalog = catalog();
        let charge = execute_core_action(
            &electro_shot_state(0),
            &electro_shot_action(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog,
        )
        .expect("Electro Shot should charge outside rain");
        assert_eq!(charge.len(), 1);
        assert!(matches!(
            charge[0].event,
            CoreExecutionEvent::Charge {
                md_id: ELECTRO_SHOT_MD_ID,
                ..
            }
        ));
        let charged_state = &charge[0].state;
        let charged_actor = &charged_state.teams[0].pokemon[0];
        assert_eq!(charged_actor.moves[0].current_pp, 11);
        assert_eq!(charged_actor.stat_stages.special_attack, 1);
        assert_eq!(charged_state.teams[1].pokemon[0].current_hp, 150);
        let charge_effect = pending_electro_shot_effect(charged_actor)
            .expect("charge state should preserve the Electro Shot marker");
        assert_eq!(
            pending_electro_shot_target(charge_effect),
            Some(PokemonKey {
                team_index: 1,
                group_index: 0,
            })
        );

        let release = execute_core_action(
            charged_state,
            &electro_shot_action(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog,
        )
        .expect("charged Electro Shot should release");
        assert!(release.iter().all(|branch| {
            let actor = &branch.state.teams[0].pokemon[0];
            actor.moves[0].current_pp == 11
                && actor.stat_stages.special_attack == 1
                && pending_electro_shot_effect(actor).is_none()
                && branch.state.teams[1].pokemon[0].current_hp < 150
        }));
    }

    #[test]
    fn electro_shot_boosts_and_attacks_immediately_in_rain() {
        let branches = execute_core_action(
            &electro_shot_state(2),
            &electro_shot_action(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog(),
        )
        .expect("Electro Shot should skip its charge turn in rain");

        assert!(branches.iter().all(|branch| {
            let actor = &branch.state.teams[0].pokemon[0];
            actor.moves[0].current_pp == 11
                && actor.stat_stages.special_attack == 1
                && pending_electro_shot_effect(actor).is_none()
                && branch.state.teams[1].pokemon[0].current_hp < 150
        }));
    }

    #[test]
    fn utility_umbrella_keeps_electro_shot_as_a_charge_move_in_rain() {
        let catalog = catalog();
        let mut state = electro_shot_state(2);
        state.teams[0].pokemon[0].item_md_id = Some(
            catalog
                .item_by_id("utilityumbrella")
                .expect("mechanics pack should include Utility Umbrella")
                .num,
        );
        let branches = execute_core_action(
            &state,
            &electro_shot_action(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog,
        )
        .expect("Utility Umbrella should suppress Electro Shot's rain shortcut");

        assert_eq!(branches.len(), 1);
        assert!(matches!(
            branches[0].event,
            CoreExecutionEvent::Charge { .. }
        ));
        assert_eq!(branches[0].state.teams[1].pokemon[0].current_hp, 150);
    }

    #[test]
    fn wave_crash_recoil_uses_actual_damage_and_rounds_half_up() {
        let mut state = state();
        state.teams[0].pokemon[0].moves[0] = SimulationMove {
            md_id: 834,
            slot_index: 0,
            current_pp: 12,
            max_pp: 12,
            locked: false,
        };
        let action = BattleAction::UseMove {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            md_id: 834,
            slot_index: Some(0),
            target: ActionTarget::Pokemon {
                key: PokemonKey {
                    team_index: 1,
                    group_index: 0,
                },
            },
            replacement: None,
            mega: false,
        };
        let branches = execute_core_action(
            &state,
            &action,
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog(),
        )
        .expect("Wave Crash should resolve damage and recoil");

        assert_eq!(calculate_recoil_damage(1, 33, 100).unwrap(), 1);
        assert_eq!(calculate_recoil_damage(50, 33, 100).unwrap(), 17);
        for branch in branches {
            let CoreExecutionEvent::Damage { damage, .. } = branch.event else {
                panic!("100%-accurate Wave Crash should only yield damage branches");
            };
            let expected_recoil = calculate_recoil_damage(damage, 33, 100).unwrap();
            assert_eq!(
                branch.state.teams[0].pokemon[0].current_hp,
                150 - expected_recoil
            );
            assert_eq!(branch.state.teams[0].pokemon[0].moves[0].current_pp, 11);
        }
    }

    #[test]
    fn stamina_raises_defense_after_each_survived_damaging_hit() {
        let mut state = state();
        state.teams[1].pokemon[0].ability_md_id = 192;
        let branches = execute_core_action(
            &state,
            &tackle(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog(),
        )
        .expect("a hit on Stamina should resolve");

        assert!(
            branches
                .iter()
                .all(|branch| { branch.state.teams[1].pokemon[0].stat_stages.defense == 1 })
        );
    }

    #[test]
    fn rough_skin_damages_a_contact_attacker() {
        let mut state = state();
        state.teams[1].pokemon[0].ability_md_id = 24;
        let branches = execute_core_action(
            &state,
            &tackle(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog(),
        )
        .expect("contact with Rough Skin should resolve");

        assert!(branches.iter().all(|branch| {
            branch.state.teams[0].pokemon[0].current_hp == 132
                && !branch.state.teams[0].pokemon[0].fainted
        }));
    }

    #[test]
    fn defiant_raises_attack_after_an_opponent_stat_drop() {
        let mut state = state();
        state.teams[0].pokemon[0].moves[0] = SimulationMove {
            md_id: 196,
            slot_index: 0,
            current_pp: 15,
            max_pp: 15,
            locked: false,
        };
        state.teams[1].pokemon[0].ability_md_id = 128;
        let action = BattleAction::UseMove {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            md_id: 196,
            slot_index: Some(0),
            target: ActionTarget::Pokemon {
                key: PokemonKey {
                    team_index: 1,
                    group_index: 0,
                },
            },
            replacement: None,
            mega: false,
        };
        let branches = execute_core_action(
            &state,
            &action,
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog(),
        )
        .expect("Icy Wind into Defiant should resolve");

        assert!(
            branches
                .iter()
                .filter(|branch| matches!(branch.event, CoreExecutionEvent::Damage { .. }))
                .all(|branch| {
                    let target = &branch.state.teams[1].pokemon[0];
                    target.stat_stages.speed == -1 && target.stat_stages.attack == 2
                })
        );
    }

    #[test]
    fn exact_probabilities_add_and_multiply_without_losing_precision() {
        assert_eq!(
            ExactProbability::new(1, 2)
                .unwrap()
                .multiply(ExactProbability::new(2, 3).unwrap())
                .unwrap(),
            ExactProbability::new(1, 3).unwrap()
        );
        assert_eq!(
            ExactProbability::new(1, 6)
                .unwrap()
                .add(ExactProbability::new(1, 3).unwrap())
                .unwrap(),
            ExactProbability::new(1, 2).unwrap()
        );
    }

    #[test]
    fn switch_resets_leaving_stages_and_transfers_the_position() {
        let mut state = state();
        state.teams[0].pokemon[0].stat_stages.attack = 2;
        state.teams[0].pokemon[0].substitute = true;
        state.teams[0].pokemon[0].moves[0].locked = true;
        let actor = PokemonKey {
            team_index: 0,
            group_index: 0,
        };
        let replacement = PokemonKey {
            team_index: 0,
            group_index: 1,
        };
        let branches = execute_core_action(
            &state,
            &BattleAction::Switch { actor, replacement },
            &CoreExecutionContext::default(),
            &catalog(),
        )
        .expect("switch should execute");
        let next = &branches[0].state;
        assert!(next.pokemon(actor).unwrap().position.is_none());
        assert_eq!(next.pokemon(actor).unwrap().stat_stages.attack, 0);
        assert!(!next.pokemon(actor).unwrap().substitute);
        assert!(!next.pokemon(actor).unwrap().moves[0].locked);
        assert_eq!(
            next.pokemon(replacement).unwrap().position,
            Some(BattlePosition {
                side_index: 0,
                position_index: 0
            })
        );
    }

    #[test]
    fn drizzle_switch_in_starts_a_fresh_five_turn_rain() {
        let mut state = state();
        state.teams[0].pokemon[1].ability_md_id = 2;
        let actor = PokemonKey {
            team_index: 0,
            group_index: 0,
        };
        let replacement = PokemonKey {
            team_index: 0,
            group_index: 1,
        };
        let branches = execute_core_action(
            &state,
            &BattleAction::Switch { actor, replacement },
            &CoreExecutionContext::default(),
            &catalog(),
        )
        .expect("Drizzle switch-in should execute");
        let world = &branches[0].state.world;
        assert_eq!(world.weather_md_id, 2);
        assert_eq!(world.weather_lifespan_turns, 5);
        assert_eq!(world.weather_elapsed_turns, 0);
    }

    #[test]
    fn misses_and_damage_rolls_preserve_exact_total_probability() {
        let mut state = state();
        state.teams[0].pokemon[0].moves[0].md_id = 21;
        let mut action = tackle();
        if let BattleAction::UseMove { md_id, .. } = &mut action {
            *md_id = 21;
        }
        let branches = execute_core_action(
            &state,
            &action,
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog(),
        )
        .expect("Slam should branch on accuracy and damage");
        assert!(
            branches
                .iter()
                .any(|branch| matches!(branch.event, CoreExecutionEvent::Miss { md_id: 21, .. }))
        );
        let common_denominator = branches.iter().fold(1_u64, |common, branch| {
            common / greatest_common_divisor(common, branch.probability.denominator)
                * branch.probability.denominator
        });
        let total_numerator = branches
            .iter()
            .map(|branch| {
                branch.probability.numerator * (common_denominator / branch.probability.denominator)
            })
            .sum::<u64>();
        assert_eq!(total_numerator, common_denominator);
    }

    #[test]
    fn status_secondaries_branch_without_dropping_the_effect() {
        let mut action = tackle();
        if let BattleAction::UseMove {
            md_id, slot_index, ..
        } = &mut action
        {
            *md_id = 85;
            *slot_index = Some(0);
        }
        let mut state = state();
        state.teams[0].pokemon[0].moves[0].md_id = 85;
        let branches = execute_core_action(
            &state,
            &action,
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog(),
        )
        .expect("Thunderbolt paralysis secondary should resolve");
        let status_probability = branches
            .iter()
            .filter(|branch| branch.state.teams[1].pokemon[0].status_condition == 5)
            .try_fold(ExactProbability::new(0, 1).unwrap(), |sum, branch| {
                sum.add(branch.probability)
            })
            .unwrap();
        assert_eq!(status_probability, ExactProbability::new(1, 10).unwrap());
        assert!(
            branches
                .iter()
                .any(|branch| branch.state.teams[1].pokemon[0].status_condition == 0)
        );
    }

    #[test]
    fn deterministic_speed_drop_applies_only_on_icy_wind_hits() {
        let mut state = state();
        state.teams[0].pokemon[0].moves[0] = SimulationMove {
            md_id: 196,
            slot_index: 0,
            current_pp: 15,
            max_pp: 15,
            locked: false,
        };
        let action = BattleAction::UseMove {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            md_id: 196,
            slot_index: Some(0),
            target: ActionTarget::Pokemon {
                key: PokemonKey {
                    team_index: 1,
                    group_index: 0,
                },
            },
            replacement: None,
            mega: false,
        };
        let branches = execute_core_action(
            &state,
            &action,
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog(),
        )
        .expect("Icy Wind should resolve");
        let miss_probability = branches
            .iter()
            .filter(|branch| matches!(branch.event, CoreExecutionEvent::Miss { .. }))
            .try_fold(ExactProbability::new(0, 1).unwrap(), |sum, branch| {
                sum.add(branch.probability)
            })
            .unwrap();
        assert_eq!(miss_probability, ExactProbability::new(1, 20).unwrap());
        assert!(branches.iter().all(|branch| {
            let stage = branch.state.teams[1].pokemon[0].stat_stages.speed;
            if matches!(branch.event, CoreExecutionEvent::Miss { .. }) {
                stage == 0
            } else {
                stage == -1
            }
        }));
    }

    #[test]
    fn life_orb_boosts_damage_and_costs_one_tenth_max_hp_after_a_hit() {
        let catalog = catalog();
        let baseline = execute_core_action(
            &state(),
            &tackle(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog,
        )
        .expect("baseline Tackle should resolve");
        let mut life_orb_state = state();
        life_orb_state.teams[0].pokemon[0].item_md_id = Some(270);
        let boosted = execute_core_action(
            &life_orb_state,
            &tackle(),
            &CoreExecutionContext {
                affected_targets: 1,
                ..CoreExecutionContext::default()
            },
            &catalog,
        )
        .expect("Life Orb Tackle should resolve");

        let baseline_max = baseline
            .iter()
            .filter_map(|branch| match branch.event {
                CoreExecutionEvent::Damage { damage, .. } => Some(damage),
                _ => None,
            })
            .max()
            .unwrap();
        let boosted_max = boosted
            .iter()
            .filter_map(|branch| match branch.event {
                CoreExecutionEvent::Damage { damage, .. } => Some(damage),
                _ => None,
            })
            .max()
            .unwrap();
        assert!(boosted_max > baseline_max);
        assert!(
            boosted
                .iter()
                .all(|branch| { branch.state.teams[0].pokemon[0].current_hp == 135 })
        );
    }
}
