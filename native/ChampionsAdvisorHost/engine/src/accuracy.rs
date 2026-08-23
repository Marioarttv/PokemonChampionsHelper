use crate::weather::effective_weather_for_pokemon;
use crate::{Accuracy, MathError, MechanicsCatalog, PokemonKey, Rational, SimulationState};
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter};

const HURRICANE_MD_ID: i32 = 542;
const WEATHER_BALL_MD_ID: i32 = 311;
const ELECTRO_SHOT_MD_ID: i32 = 905;
const SUCKER_PUNCH_MD_ID: i32 = 389;
const LAST_RESPECTS_MD_ID: i32 = 854;
const BASIS_POINTS: u32 = 10_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HitChanceRequest {
    pub actor: PokemonKey,
    pub target: PokemonKey,
    pub md_id: i32,
    #[serde(default)]
    pub modifiers: Vec<Rational>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct HitChance {
    pub numerator: u32,
    pub denominator: u32,
}

impl HitChance {
    pub const CERTAIN: Self = Self {
        numerator: BASIS_POINTS,
        denominator: BASIS_POINTS,
    };

    pub fn miss_numerator(self) -> u32 {
        self.denominator.saturating_sub(self.numerator)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AccuracyError {
    MissingPokemon(PokemonKey),
    UnknownMove(i32),
    InvalidBaseAccuracy(i32),
    UnsupportedAccuracyCallbacks { md_id: i32, callbacks: Vec<String> },
    MissingRuntimeWeather(String),
    MissingItem(String),
    Math(MathError),
    Overflow,
}

impl Display for AccuracyError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingPokemon(key) => write!(formatter, "missing Pokemon {key:?}"),
            Self::UnknownMove(md_id) => write!(formatter, "unknown move {md_id}"),
            Self::InvalidBaseAccuracy(md_id) => {
                write!(formatter, "move {md_id} has invalid base accuracy")
            }
            Self::UnsupportedAccuracyCallbacks { md_id, callbacks } => write!(
                formatter,
                "move {md_id} has unresolved accuracy callbacks: {}",
                callbacks.join(", ")
            ),
            Self::MissingRuntimeWeather(weather) => {
                write!(formatter, "mechanics pack is missing weather {weather}")
            }
            Self::MissingItem(item) => write!(formatter, "mechanics pack is missing item {item}"),
            Self::Math(error) => Display::fmt(error, formatter),
            Self::Overflow => write!(formatter, "accuracy calculation overflowed"),
        }
    }
}

impl std::error::Error for AccuracyError {}

impl From<MathError> for AccuracyError {
    fn from(value: MathError) -> Self {
        Self::Math(value)
    }
}

pub fn calculate_hit_chance(
    state: &SimulationState,
    request: &HitChanceRequest,
    catalog: &MechanicsCatalog,
) -> Result<HitChance, AccuracyError> {
    let actor = state
        .pokemon(request.actor)
        .ok_or(AccuracyError::MissingPokemon(request.actor))?;
    let target = state
        .pokemon(request.target)
        .ok_or(AccuracyError::MissingPokemon(request.target))?;
    let move_record = catalog
        .move_by_num(request.md_id)
        .ok_or(AccuracyError::UnknownMove(request.md_id))?;
    let dynamic = dynamic_base_accuracy(state, request.target, request.md_id, catalog)?;
    let mut chance = match dynamic {
        Some(value) => value,
        None => accuracy_basis_points(&move_record.accuracy, request.md_id)?,
    };
    if matches!(move_record.accuracy, Accuracy::AlwaysHits(true)) {
        return Ok(HitChance::CERTAIN);
    }
    if chance > BASIS_POINTS {
        return Err(AccuracyError::InvalidBaseAccuracy(request.md_id));
    }

    let net_stage = (actor.stat_stages.accuracy - target.stat_stages.evasion).clamp(-6, 6);
    let stage_modifier = if net_stage >= 0 {
        Rational::new(3 + net_stage, 3)?
    } else {
        Rational::new(3, 3 - net_stage)?
    };
    chance = apply_probability_modifier(chance, stage_modifier)?;
    for modifier in &request.modifiers {
        chance = apply_probability_modifier(chance, *modifier)?;
    }
    Ok(HitChance {
        numerator: chance.min(BASIS_POINTS),
        denominator: BASIS_POINTS,
    })
}

fn dynamic_base_accuracy(
    state: &SimulationState,
    target: PokemonKey,
    md_id: i32,
    catalog: &MechanicsCatalog,
) -> Result<Option<u32>, AccuracyError> {
    let move_record = catalog
        .move_by_num(md_id)
        .ok_or(AccuracyError::UnknownMove(md_id))?;
    if move_record.callback_keys.is_empty() {
        return Ok(None);
    }
    match md_id {
        WEATHER_BALL_MD_ID => Ok(None),
        ELECTRO_SHOT_MD_ID if move_record.callback_keys == ["onTryMove"] => Ok(None),
        SUCKER_PUNCH_MD_ID if move_record.callback_keys == ["onTry"] => Ok(None),
        LAST_RESPECTS_MD_ID if move_record.callback_keys == ["basePowerCallback"] => Ok(None),
        HURRICANE_MD_ID => {
            let weather = effective_weather_for_pokemon(state, target, catalog);
            let rain = weather_id(catalog, "rain")?;
            let heavy_rain = weather_id(catalog, "heavyRain")?;
            let sunny_day = weather_id(catalog, "sunnyDay")?;
            let harsh_sunlight = weather_id(catalog, "harshSunlight")?;
            if weather == rain || weather == heavy_rain {
                Ok(Some(BASIS_POINTS))
            } else if weather == sunny_day || weather == harsh_sunlight {
                Ok(Some(5_000))
            } else {
                Ok(Some(7_000))
            }
        }
        _ => Err(AccuracyError::UnsupportedAccuracyCallbacks {
            md_id,
            callbacks: move_record.callback_keys.clone(),
        }),
    }
}

fn accuracy_basis_points(accuracy: &Accuracy, md_id: i32) -> Result<u32, AccuracyError> {
    match accuracy {
        Accuracy::AlwaysHits(true) => Ok(BASIS_POINTS),
        Accuracy::AlwaysHits(false) => Err(AccuracyError::InvalidBaseAccuracy(md_id)),
        Accuracy::Percent(percent) if percent.is_finite() && (0.0..=100.0).contains(percent) => {
            let scaled = (percent * 100.0).round();
            if scaled < 0.0 || scaled > f64::from(BASIS_POINTS) {
                return Err(AccuracyError::Overflow);
            }
            Ok(scaled as u32)
        }
        Accuracy::Percent(_) => Err(AccuracyError::InvalidBaseAccuracy(md_id)),
    }
}

fn apply_probability_modifier(value: u32, modifier: Rational) -> Result<u32, AccuracyError> {
    if modifier.denominator <= 0 || modifier.numerator < 0 {
        return Err(MathError::InvalidRatio {
            numerator: modifier.numerator,
            denominator: modifier.denominator,
        }
        .into());
    }
    let scaled = u64::from(value)
        .checked_mul(u64::try_from(modifier.numerator).map_err(|_| AccuracyError::Overflow)?)
        .ok_or(AccuracyError::Overflow)?
        / u64::try_from(modifier.denominator).map_err(|_| AccuracyError::Overflow)?;
    u32::try_from(scaled).map_err(|_| AccuracyError::Overflow)
}

fn weather_id(catalog: &MechanicsCatalog, weather: &str) -> Result<i32, AccuracyError> {
    catalog
        .pack()
        .runtime_enums
        .weather
        .get(weather)
        .copied()
        .ok_or_else(|| AccuracyError::MissingRuntimeWeather(weather.to_owned()))
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

    fn pokemon(team_index: i32, item_md_id: Option<i32>) -> SimulationPokemon {
        SimulationPokemon {
            key: PokemonKey {
                team_index,
                group_index: 0,
            },
            species_id: "pelipper".to_owned(),
            form_no: 0,
            item_md_id,
            ability_md_id: 2,
            nature_id: "hardy".to_owned(),
            training_points: TrainingPoints::default(),
            stats: BattleStats {
                hp: 135,
                attack: 70,
                defense: 120,
                special_attack: 115,
                special_defense: 90,
                speed: 85,
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
                md_id: HURRICANE_MD_ID,
                slot_index: 0,
                current_pp: 8,
                max_pp: 8,
                locked: false,
            }],
            volatile_effects: Vec::new(),
            field_effects: Vec::new(),
        }
    }

    fn state(weather: i32, target_item: Option<i32>) -> SimulationState {
        let mut world = WorldSnapshot::default();
        world.weather_md_id = weather;
        SimulationState {
            source_state_hash: "0123456789abcdef".to_owned(),
            battle_rule: 5,
            battle_type: 1,
            battle_stage_md_id: 1,
            local_team_index: 0,
            elapsed_turns: 1,
            world,
            teams: vec![
                SimulationTeam {
                    team_index: 0,
                    is_local_player: true,
                    pokemon_order: vec![0],
                    pokemon: vec![pokemon(0, None)],
                },
                SimulationTeam {
                    team_index: 1,
                    is_local_player: false,
                    pokemon_order: vec![0],
                    pokemon: vec![pokemon(1, target_item)],
                },
            ],
        }
    }

    fn request() -> HitChanceRequest {
        HitChanceRequest {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            target: PokemonKey {
                team_index: 1,
                group_index: 0,
            },
            md_id: HURRICANE_MD_ID,
            modifiers: Vec::new(),
        }
    }

    #[test]
    fn hurricane_uses_weather_specific_accuracy() {
        let catalog = catalog();
        let rain = weather_id(&catalog, "rain").unwrap();
        assert_eq!(
            calculate_hit_chance(&state(rain, None), &request(), &catalog).unwrap(),
            HitChance::CERTAIN
        );
        let sun = weather_id(&catalog, "sunnyDay").unwrap();
        assert_eq!(
            calculate_hit_chance(&state(sun, None), &request(), &catalog).unwrap(),
            HitChance {
                numerator: 5_000,
                denominator: 10_000
            }
        );
    }

    #[test]
    fn target_utility_umbrella_suppresses_hurricane_weather_accuracy() {
        let catalog = catalog();
        let umbrella = catalog.item_by_id("utilityumbrella").unwrap().num;
        let rain = weather_id(&catalog, "rain").unwrap();
        assert_eq!(
            calculate_hit_chance(&state(rain, Some(umbrella)), &request(), &catalog).unwrap(),
            HitChance {
                numerator: 7_000,
                denominator: 10_000
            }
        );
    }

    #[test]
    fn accuracy_and_evasion_stages_use_the_three_based_ratio() {
        let catalog = catalog();
        let mut state = state(0, None);
        state.teams[0].pokemon[0].stat_stages.accuracy = 1;
        let chance = calculate_hit_chance(&state, &request(), &catalog).unwrap();
        assert_eq!(chance.numerator, 9_333);
    }
}
