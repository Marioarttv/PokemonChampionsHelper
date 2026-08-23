use crate::weather::effective_weather_for_pokemon;
use crate::{
    DamageInput, DamageRolls, MathError, MechanicsCatalog, PokemonKey, Rational, SimulationState,
    apply_stat_stage, calculate_damage_rolls, type_multiplier,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt::{Display, Formatter};

pub(crate) const SUPREME_OVERLORD_EFFECT_MD_ID: i32 = -293;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DamageCategory {
    Physical,
    Special,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResolvedDamageMove {
    pub md_id: i32,
    pub move_type: String,
    pub category: DamageCategory,
    pub base_power: i32,
    pub target_class: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CoreDamageRequest {
    pub actor: PokemonKey,
    pub target: PokemonKey,
    pub resolved_move: ResolvedDamageMove,
    pub affected_targets: usize,
    #[serde(default)]
    pub modifiers_before_random: Vec<Rational>,
    #[serde(default)]
    pub modifiers_after_random: Vec<Rational>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CoreDamageResult {
    pub actor: PokemonKey,
    pub target: PokemonKey,
    pub md_id: i32,
    pub move_type: String,
    pub category: DamageCategory,
    pub base_power: i32,
    pub attack_stat: i32,
    pub defense_stat: i32,
    pub spread: bool,
    pub stab: Rational,
    pub type_effectiveness: Rational,
    pub weather_modifier: Rational,
    pub critical: bool,
    pub rolls: DamageRolls,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreDamageError {
    MissingPokemon(PokemonKey),
    UnknownMove(i32),
    StatusMove(i32),
    VariableOrFixedPower(i32),
    UnresolvedMoveCallbacks { md_id: i32, callbacks: Vec<String> },
    UnsupportedDamageRule { md_id: i32, rule: String },
    InvalidAffectedTargets(usize),
    Math(MathError),
}

impl Display for CoreDamageError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingPokemon(key) => write!(formatter, "missing Pokemon {key:?}"),
            Self::UnknownMove(md_id) => write!(formatter, "unknown move {md_id}"),
            Self::StatusMove(md_id) => {
                write!(formatter, "move {md_id} does not deal direct damage")
            }
            Self::VariableOrFixedPower(md_id) => {
                write!(
                    formatter,
                    "move {md_id} requires a dedicated power resolver"
                )
            }
            Self::UnresolvedMoveCallbacks { md_id, callbacks } => write!(
                formatter,
                "move {md_id} requires callback resolvers: {}",
                callbacks.join(", ")
            ),
            Self::UnsupportedDamageRule { md_id, rule } => {
                write!(
                    formatter,
                    "move {md_id} requires unsupported damage rule {rule}"
                )
            }
            Self::InvalidAffectedTargets(count) => {
                write!(
                    formatter,
                    "affected target count must be positive, got {count}"
                )
            }
            Self::Math(error) => Display::fmt(error, formatter),
        }
    }
}

impl std::error::Error for CoreDamageError {}

impl From<MathError> for CoreDamageError {
    fn from(value: MathError) -> Self {
        Self::Math(value)
    }
}

pub fn resolve_static_damage_move(
    md_id: i32,
    catalog: &MechanicsCatalog,
) -> Result<ResolvedDamageMove, CoreDamageError> {
    let move_record = catalog
        .move_by_num(md_id)
        .ok_or(CoreDamageError::UnknownMove(md_id))?;
    let category = match move_record.category.as_str() {
        "Physical" => DamageCategory::Physical,
        "Special" => DamageCategory::Special,
        "Status" => return Err(CoreDamageError::StatusMove(md_id)),
        other => {
            return Err(CoreDamageError::UnsupportedDamageRule {
                md_id,
                rule: format!("category {other}"),
            });
        }
    };
    if move_record.base_power <= 0 || non_null_rule(move_record, "damage") {
        return Err(CoreDamageError::VariableOrFixedPower(md_id));
    }
    if !move_record.callback_keys.is_empty() {
        return Err(CoreDamageError::UnresolvedMoveCallbacks {
            md_id,
            callbacks: move_record.callback_keys.clone(),
        });
    }
    for rule in [
        "multihit",
        "ignoreDefensive",
        "ignoreNegativeOffensive",
        "ignoreOffensive",
        "ignorePositiveDefensive",
    ] {
        if non_null_rule(move_record, rule)
            && move_record
                .mechanics
                .get(rule)
                .is_some_and(|value| value != &Value::Bool(false))
        {
            return Err(CoreDamageError::UnsupportedDamageRule {
                md_id,
                rule: rule.to_owned(),
            });
        }
    }
    Ok(ResolvedDamageMove {
        md_id,
        move_type: move_record.move_type.clone(),
        category,
        base_power: move_record.base_power,
        target_class: move_record.target.clone(),
    })
}

pub fn calculate_core_damage(
    state: &SimulationState,
    request: &CoreDamageRequest,
    catalog: &MechanicsCatalog,
) -> Result<CoreDamageResult, CoreDamageError> {
    calculate_core_damage_variant(state, request, false, catalog)
}

pub(crate) fn calculate_core_damage_variant(
    state: &SimulationState,
    request: &CoreDamageRequest,
    critical: bool,
    catalog: &MechanicsCatalog,
) -> Result<CoreDamageResult, CoreDamageError> {
    if request.affected_targets == 0 {
        return Err(CoreDamageError::InvalidAffectedTargets(0));
    }
    let actor = state
        .pokemon(request.actor)
        .ok_or(CoreDamageError::MissingPokemon(request.actor))?;
    let target = state
        .pokemon(request.target)
        .ok_or(CoreDamageError::MissingPokemon(request.target))?;
    let target_weather = effective_weather_for_pokemon(state, request.target, catalog);
    let (attack_stage, defense_stage) = match request.resolved_move.category {
        DamageCategory::Physical => (actor.stat_stages.attack, target.stat_stages.defense),
        DamageCategory::Special => (
            actor.stat_stages.special_attack,
            target.stat_stages.special_defense,
        ),
    };
    // Critical hits retain helpful offensive stages and harmful defensive stages,
    // while ignoring an attacker's drops and a defender's boosts.
    let attack_stage = if critical {
        attack_stage.max(0)
    } else {
        attack_stage
    };
    let defense_stage = if critical {
        defense_stage.min(0)
    } else {
        defense_stage
    };
    let (attack_stat, mut defense_stat) = match request.resolved_move.category {
        DamageCategory::Physical => (
            apply_stat_stage(actor.stats.attack, attack_stage)?,
            apply_stat_stage(target.stats.defense, defense_stage)?,
        ),
        DamageCategory::Special => (
            apply_stat_stage(actor.stats.special_attack, attack_stage)?,
            apply_stat_stage(target.stats.special_defense, defense_stage)?,
        ),
    };
    if request.resolved_move.category == DamageCategory::Physical
        && target_weather == 3
        && target
            .types
            .iter()
            .any(|kind| kind.eq_ignore_ascii_case("Ice"))
    {
        defense_stat = Rational::new(3, 2)?.apply_floor(defense_stat)?;
    } else if request.resolved_move.category == DamageCategory::Special
        && target_weather == 4
        && target
            .types
            .iter()
            .any(|kind| kind.eq_ignore_ascii_case("Rock"))
    {
        defense_stat = Rational::new(3, 2)?.apply_floor(defense_stat)?;
    }
    let has_stab = actor
        .types
        .iter()
        .any(|move_type| move_type.eq_ignore_ascii_case(&request.resolved_move.move_type));
    let stab = if has_stab {
        if has_ability(actor.ability_md_id, "adaptability", catalog) {
            Rational::new(2, 1)?
        } else {
            Rational::new(
                catalog.pack().damage_rules.stab_numerator,
                catalog.pack().damage_rules.stab_denominator,
            )?
        }
    } else {
        Rational::ONE
    };
    let mut effectiveness =
        type_multiplier(&request.resolved_move.move_type, &target.types, catalog)?;
    if target_weather == 7
        && target
            .types
            .iter()
            .any(|kind| kind.eq_ignore_ascii_case("Flying"))
        && type_multiplier(
            &request.resolved_move.move_type,
            &["Flying".to_owned()],
            catalog,
        )? == Rational::new(2, 1)?
    {
        effectiveness = effectiveness.multiply(Rational::new(1, 2)?)?;
    }
    let actor_weather = effective_weather_for_pokemon(state, request.actor, catalog);
    let weather_modifier = match (actor_weather, request.resolved_move.move_type.as_str()) {
        (1 | 6, "Fire") | (2 | 5, "Water") => Rational::new(3, 2)?,
        (1 | 2, "Water" | "Fire") => Rational::new(1, 2)?,
        (5, "Fire") | (6, "Water") => Rational::ZERO,
        _ => Rational::ONE,
    };
    let spread = matches!(
        request.resolved_move.target_class.as_str(),
        "allAdjacent" | "allAdjacentFoes"
    ) && request.affected_targets > 1;
    let pinch_ability_modifier = if actor.current_hp.saturating_mul(3) <= actor.maximum_hp()
        && ((request
            .resolved_move
            .move_type
            .eq_ignore_ascii_case("Water")
            && has_ability(actor.ability_md_id, "torrent", catalog))
            || (request.resolved_move.move_type.eq_ignore_ascii_case("Fire")
                && has_ability(actor.ability_md_id, "blaze", catalog))
            || (request
                .resolved_move
                .move_type
                .eq_ignore_ascii_case("Grass")
                && has_ability(actor.ability_md_id, "overgrow", catalog))
            || (request.resolved_move.move_type.eq_ignore_ascii_case("Bug")
                && has_ability(actor.ability_md_id, "swarm", catalog)))
    {
        Rational::new(3, 2)?
    } else {
        Rational::ONE
    };
    let mut modifiers_before_random = vec![weather_modifier, pinch_ability_modifier];
    if critical {
        modifiers_before_random.push(Rational::new(3, 2)?);
    }
    modifiers_before_random.extend(request.modifiers_before_random.iter().copied());
    let fallen_allies = actor
        .volatile_effects
        .iter()
        .find(|effect| effect.md_id == SUPREME_OVERLORD_EFFECT_MD_ID && effect.execute_id == 293)
        .map(|effect| effect.step_or_count.clamp(0, 5))
        .unwrap_or(0) as usize;
    let supreme_overlord_modifiers = [4_096, 4_506, 4_915, 5_325, 5_734, 6_144];
    let base_power = if has_ability(actor.ability_md_id, "supremeoverlord", catalog) {
        Rational::new(supreme_overlord_modifiers[fallen_allies], 4_096)?
            .apply_modifier_round(request.resolved_move.base_power)?
    } else {
        request.resolved_move.base_power
    };
    let rolls = calculate_damage_rolls(
        &DamageInput {
            base_power,
            attack: attack_stat,
            defense: defense_stat,
            spread,
            stab,
            type_effectiveness: effectiveness,
            modifiers_before_random,
            modifiers_after_random: request.modifiers_after_random.clone(),
        },
        &catalog.pack().damage_rules,
    )?;
    Ok(CoreDamageResult {
        actor: request.actor,
        target: request.target,
        md_id: request.resolved_move.md_id,
        move_type: request.resolved_move.move_type.clone(),
        category: request.resolved_move.category,
        base_power,
        attack_stat,
        defense_stat,
        spread,
        stab,
        type_effectiveness: effectiveness,
        weather_modifier,
        critical,
        rolls,
    })
}

fn has_ability(ability_md_id: i32, ability_id: &str, catalog: &MechanicsCatalog) -> bool {
    catalog
        .abilities_by_num(ability_md_id)
        .any(|ability| ability.id == ability_id)
}

fn non_null_rule(move_record: &crate::MoveRecord, rule: &str) -> bool {
    move_record
        .mechanics
        .get(rule)
        .is_some_and(|value| !value.is_null())
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

    fn pokemon(team_index: i32, types: &[&str]) -> SimulationPokemon {
        SimulationPokemon {
            key: PokemonKey {
                team_index,
                group_index: 0,
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
            types: types.iter().map(|value| (*value).to_owned()).collect(),
            substitute: false,
            can_mega: false,
            mega_mode: false,
            position: Some(BattlePosition {
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

    fn state(target_types: &[&str]) -> SimulationState {
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
                    pokemon: vec![pokemon(0, &["Normal"])],
                },
                SimulationTeam {
                    team_index: 1,
                    is_local_player: false,
                    pokemon_order: vec![0],
                    pokemon: vec![pokemon(1, target_types)],
                },
            ],
        }
    }

    fn request(move_profile: ResolvedDamageMove, affected_targets: usize) -> CoreDamageRequest {
        CoreDamageRequest {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            target: PokemonKey {
                team_index: 1,
                group_index: 0,
            },
            resolved_move: move_profile,
            affected_targets,
            modifiers_before_random: Vec::new(),
            modifiers_after_random: Vec::new(),
        }
    }

    #[test]
    fn calculates_sixteen_integer_rolls_for_a_static_move() {
        let catalog = catalog();
        let tackle = resolve_static_damage_move(33, &catalog).expect("Tackle is static");
        let result = calculate_core_damage(&state(&["Water"]), &request(tackle, 1), &catalog)
            .expect("damage should calculate");
        assert_eq!(result.rolls.values.len(), 16);
        assert_eq!(result.stab, Rational::new(3, 2).unwrap());
        assert_eq!(result.type_effectiveness, Rational::ONE);
        assert!(!result.spread);
    }

    #[test]
    fn critical_damage_ignores_attack_drops_and_defense_boosts() {
        let catalog = catalog();
        let tackle = resolve_static_damage_move(33, &catalog).expect("Tackle is static");
        let request = request(tackle, 1);
        let clean = state(&["Normal"]);
        let clean_critical =
            calculate_core_damage_variant(&clean, &request, true, &catalog).unwrap();

        let mut staged = clean;
        staged.teams[0].pokemon[0].stat_stages.attack = -2;
        staged.teams[1].pokemon[0].stat_stages.defense = 3;
        let ordinary = calculate_core_damage(&staged, &request, &catalog).unwrap();
        let critical = calculate_core_damage_variant(&staged, &request, true, &catalog).unwrap();

        assert!(critical.critical);
        assert!(critical.rolls.minimum() > ordinary.rolls.maximum());
        assert_eq!(critical.rolls, clean_critical.rolls);
    }

    #[test]
    fn supreme_overlord_uses_the_entry_time_fallen_ally_counter() {
        let catalog = catalog();
        let tackle = resolve_static_damage_move(33, &catalog).expect("Tackle is static");
        let request = request(tackle, 1);
        let mut without_fallen = state(&["Normal"]);
        without_fallen.teams[0].pokemon[0].ability_md_id = 293;
        let ordinary = calculate_core_damage(&without_fallen, &request, &catalog).unwrap();

        let mut one_fallen = without_fallen;
        one_fallen.teams[0].pokemon[0]
            .volatile_effects
            .push(crate::EffectSnapshot {
                md_id: SUPREME_OVERLORD_EFFECT_MD_ID,
                execute_kind: 1,
                execute_id: 293,
                step_or_count: 1,
                ..crate::EffectSnapshot::default()
            });
        let boosted = calculate_core_damage(&one_fallen, &request, &catalog).unwrap();

        assert_eq!(ordinary.base_power, 40);
        assert_eq!(boosted.base_power, 44);
        assert!(boosted.rolls.minimum() > ordinary.rolls.minimum());
    }

    #[test]
    fn adaptability_replaces_normal_stab_with_double_stab() {
        let catalog = catalog();
        let tackle = resolve_static_damage_move(33, &catalog).expect("Tackle is static");
        let mut ordinary = state(&["Water"]);
        ordinary.teams[0].pokemon[0].ability_md_id = 50;
        let ordinary_damage =
            calculate_core_damage(&ordinary, &request(tackle.clone(), 1), &catalog).unwrap();
        let mut adaptable = ordinary;
        adaptable.teams[0].pokemon[0].ability_md_id = 91;
        let adaptable_damage =
            calculate_core_damage(&adaptable, &request(tackle, 1), &catalog).unwrap();
        assert_eq!(ordinary_damage.stab, Rational::new(3, 2).unwrap());
        assert_eq!(adaptable_damage.stab, Rational::new(2, 1).unwrap());
        assert!(adaptable_damage.rolls.maximum() > ordinary_damage.rolls.maximum());
    }

    #[test]
    fn torrent_boosts_water_damage_only_at_one_third_hp_or_less() {
        let catalog = catalog();
        let water = resolve_static_damage_move(55, &catalog).expect("Water Gun is static");
        let mut healthy = state(&["Normal"]);
        healthy.teams[0].pokemon[0].types = vec!["Water".to_owned()];
        healthy.teams[0].pokemon[0].ability_md_id = 67;
        let healthy_damage =
            calculate_core_damage(&healthy, &request(water.clone(), 1), &catalog).unwrap();
        let mut critical = healthy;
        critical.teams[0].pokemon[0].current_hp = 50;
        let boosted_damage =
            calculate_core_damage(&critical, &request(water, 1), &catalog).unwrap();
        assert!(boosted_damage.rolls.maximum() > healthy_damage.rolls.maximum());
    }

    #[test]
    fn rain_boosts_water_and_primordial_sun_nullifies_it() {
        let catalog = catalog();
        let mut clear = state(&["Normal"]);
        clear.teams[0].pokemon[0].types = vec!["Water".to_owned()];
        clear.teams[0].pokemon[0].moves[0].md_id = 55;
        let request = CoreDamageRequest {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            target: PokemonKey {
                team_index: 1,
                group_index: 0,
            },
            resolved_move: resolve_static_damage_move(55, &catalog).unwrap(),
            affected_targets: 1,
            modifiers_before_random: Vec::new(),
            modifiers_after_random: Vec::new(),
        };
        let clear_damage = calculate_core_damage(&clear, &request, &catalog).unwrap();
        let mut rain = clear.clone();
        rain.world.weather_md_id = 2;
        let rain_damage = calculate_core_damage(&rain, &request, &catalog).unwrap();
        assert_eq!(rain_damage.weather_modifier, Rational::new(3, 2).unwrap());
        assert!(rain_damage.rolls.maximum() > clear_damage.rolls.maximum());

        let mut harsh_sunlight = clear;
        harsh_sunlight.world.weather_md_id = 6;
        let suppressed = calculate_core_damage(&harsh_sunlight, &request, &catalog).unwrap();
        assert_eq!(suppressed.weather_modifier, Rational::ZERO);
        assert!(suppressed.rolls.values.iter().all(|damage| *damage == 0));
    }

    #[test]
    fn snow_raises_ice_defense_and_turbulence_removes_flying_weakness() {
        let catalog = catalog();
        let clear_ice = state(&["Ice"]);
        let request = CoreDamageRequest {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            target: PokemonKey {
                team_index: 1,
                group_index: 0,
            },
            resolved_move: resolve_static_damage_move(33, &catalog).unwrap(),
            affected_targets: 1,
            modifiers_before_random: Vec::new(),
            modifiers_after_random: Vec::new(),
        };
        let clear_damage = calculate_core_damage(&clear_ice, &request, &catalog).unwrap();
        let mut snow = clear_ice;
        snow.world.weather_md_id = 3;
        let snow_damage = calculate_core_damage(&snow, &request, &catalog).unwrap();
        assert!(snow_damage.defense_stat > clear_damage.defense_stat);
        assert!(snow_damage.rolls.maximum() < clear_damage.rolls.maximum());

        let mut flying = state(&["Flying"]);
        flying.teams[0].pokemon[0].moves[0].md_id = 157;
        let rock_request = CoreDamageRequest {
            resolved_move: resolve_static_damage_move(157, &catalog).unwrap(),
            ..request
        };
        let ordinary = calculate_core_damage(&flying, &rock_request, &catalog).unwrap();
        flying.world.weather_md_id = 7;
        let turbulence = calculate_core_damage(&flying, &rock_request, &catalog).unwrap();
        assert_eq!(ordinary.type_effectiveness, Rational::new(2, 1).unwrap());
        assert_eq!(turbulence.type_effectiveness, Rational::ONE);
    }

    #[test]
    fn applies_spread_reduction_only_when_multiple_targets_are_affected() {
        let catalog = catalog();
        let hyper_voice = resolve_static_damage_move(304, &catalog).expect("Hyper Voice is static");
        let single = calculate_core_damage(
            &state(&["Water"]),
            &request(hyper_voice.clone(), 1),
            &catalog,
        )
        .expect("single-target damage should calculate");
        let spread = calculate_core_damage(&state(&["Water"]), &request(hyper_voice, 2), &catalog)
            .expect("spread damage should calculate");
        assert!(!single.spread);
        assert!(spread.spread);
        assert!(spread.rolls.maximum() < single.rolls.maximum());
    }

    #[test]
    fn rejects_dynamic_moves_until_a_dedicated_resolver_runs() {
        let error = resolve_static_damage_move(311, &catalog())
            .expect_err("Weather Ball has type and power callbacks");
        assert!(matches!(
            error,
            CoreDamageError::UnresolvedMoveCallbacks { md_id: 311, .. }
        ));
    }
}
