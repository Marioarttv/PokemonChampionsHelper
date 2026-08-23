use crate::weather::effective_weather_for_pokemon;
use crate::{
    CoreDamageError, DamageCategory, MechanicsCatalog, PokemonKey, ResolvedDamageMove,
    SimulationState, resolve_static_damage_move,
};
use std::collections::BTreeSet;
use std::fmt::{Display, Formatter};

const WEATHER_BALL_MD_ID: i32 = 311;
const HURRICANE_MD_ID: i32 = 542;
const ELECTRO_SHOT_MD_ID: i32 = 905;
const SUCKER_PUNCH_MD_ID: i32 = 389;
const LAST_RESPECTS_MD_ID: i32 = 854;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DynamicMoveError {
    Core(CoreDamageError),
    MissingPokemon(PokemonKey),
    MissingRuntimeWeather(String),
    MissingItem(String),
    UnknownCategory {
        md_id: i32,
        category: String,
    },
    CallbackContractChanged {
        md_id: i32,
        expected: Vec<String>,
        actual: Vec<String>,
    },
    UnsupportedDynamicMove {
        md_id: i32,
        callbacks: Vec<String>,
    },
}

impl Display for DynamicMoveError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Core(error) => Display::fmt(error, formatter),
            Self::MissingPokemon(key) => write!(formatter, "missing Pokemon {key:?}"),
            Self::MissingRuntimeWeather(weather) => {
                write!(formatter, "mechanics pack is missing weather {weather}")
            }
            Self::MissingItem(item) => write!(formatter, "mechanics pack is missing item {item}"),
            Self::UnknownCategory { md_id, category } => {
                write!(formatter, "move {md_id} has unknown category {category}")
            }
            Self::CallbackContractChanged {
                md_id,
                expected,
                actual,
            } => write!(
                formatter,
                "move {md_id} callback contract changed: expected {expected:?}, actual {actual:?}"
            ),
            Self::UnsupportedDynamicMove { md_id, callbacks } => write!(
                formatter,
                "move {md_id} has no native resolver for callbacks: {}",
                callbacks.join(", ")
            ),
        }
    }
}

impl std::error::Error for DynamicMoveError {}

impl From<CoreDamageError> for DynamicMoveError {
    fn from(value: CoreDamageError) -> Self {
        Self::Core(value)
    }
}

pub fn resolve_damage_move(
    state: &SimulationState,
    actor: PokemonKey,
    md_id: i32,
    catalog: &MechanicsCatalog,
) -> Result<ResolvedDamageMove, DynamicMoveError> {
    match resolve_static_damage_move(md_id, catalog) {
        Ok(resolved) => return Ok(resolved),
        Err(CoreDamageError::UnresolvedMoveCallbacks { .. })
        | Err(CoreDamageError::VariableOrFixedPower(_))
        | Err(CoreDamageError::UnsupportedDamageRule { .. }) => {}
        Err(error) => return Err(error.into()),
    }
    match md_id {
        WEATHER_BALL_MD_ID => resolve_weather_ball(state, actor, catalog),
        HURRICANE_MD_ID => {
            assert_callbacks(catalog, md_id, &["onModifyMove"])?;
            profile_from_catalog(md_id, None, None, catalog)
        }
        ELECTRO_SHOT_MD_ID => {
            assert_callbacks(catalog, md_id, &["onTryMove"])?;
            profile_from_catalog(md_id, None, None, catalog)
        }
        SUCKER_PUNCH_MD_ID => {
            assert_callbacks(catalog, md_id, &["onTry"])?;
            profile_from_catalog(md_id, None, None, catalog)
        }
        LAST_RESPECTS_MD_ID => resolve_last_respects(state, actor, catalog),
        _ => {
            let callbacks = catalog
                .move_by_num(md_id)
                .map(|move_record| move_record.callback_keys.clone())
                .unwrap_or_default();
            Err(DynamicMoveError::UnsupportedDynamicMove { md_id, callbacks })
        }
    }
}

fn resolve_last_respects(
    state: &SimulationState,
    actor: PokemonKey,
    catalog: &MechanicsCatalog,
) -> Result<ResolvedDamageMove, DynamicMoveError> {
    assert_callbacks(catalog, LAST_RESPECTS_MD_ID, &["basePowerCallback"])?;
    let team = state
        .teams
        .iter()
        .find(|team| team.team_index == actor.team_index)
        .ok_or(DynamicMoveError::MissingPokemon(actor))?;
    let fainted = team
        .pokemon
        .iter()
        .filter(|pokemon| team.pokemon_order.contains(&pokemon.key.group_index))
        .filter(|pokemon| pokemon.fainted || pokemon.current_hp <= 0)
        .count()
        .min(100) as i32;
    profile_from_catalog(
        LAST_RESPECTS_MD_ID,
        None,
        Some(50_i32.saturating_mul(1 + fainted)),
        catalog,
    )
}

fn resolve_weather_ball(
    state: &SimulationState,
    actor: PokemonKey,
    catalog: &MechanicsCatalog,
) -> Result<ResolvedDamageMove, DynamicMoveError> {
    assert_callbacks(
        catalog,
        WEATHER_BALL_MD_ID,
        &["onModifyMove", "onModifyType"],
    )?;
    state
        .pokemon(actor)
        .ok_or(DynamicMoveError::MissingPokemon(actor))?;
    let weather = effective_weather_for_pokemon(state, actor, catalog);
    let sunny_day = weather_id(catalog, "sunnyDay")?;
    let rain = weather_id(catalog, "rain")?;
    let snow = weather_id(catalog, "snow")?;
    let sandstorm = weather_id(catalog, "sandstorm")?;
    let heavy_rain = weather_id(catalog, "heavyRain")?;
    let harsh_sunlight = weather_id(catalog, "harshSunlight")?;
    let hail = weather_id(catalog, "hail")?;
    let move_type = if weather == sunny_day || weather == harsh_sunlight {
        Some("Fire")
    } else if weather == rain || weather == heavy_rain {
        Some("Water")
    } else if weather == snow || weather == hail {
        Some("Ice")
    } else if weather == sandstorm {
        Some("Rock")
    } else {
        None
    };
    let base_power = move_type.map(|_| 100);
    profile_from_catalog(WEATHER_BALL_MD_ID, move_type, base_power, catalog)
}

fn profile_from_catalog(
    md_id: i32,
    move_type: Option<&str>,
    base_power: Option<i32>,
    catalog: &MechanicsCatalog,
) -> Result<ResolvedDamageMove, DynamicMoveError> {
    let move_record = catalog
        .move_by_num(md_id)
        .ok_or(CoreDamageError::UnknownMove(md_id))?;
    let category = match move_record.category.as_str() {
        "Physical" => DamageCategory::Physical,
        "Special" => DamageCategory::Special,
        category => {
            return Err(DynamicMoveError::UnknownCategory {
                md_id,
                category: category.to_owned(),
            });
        }
    };
    Ok(ResolvedDamageMove {
        md_id,
        move_type: move_type.unwrap_or(&move_record.move_type).to_owned(),
        category,
        base_power: base_power.unwrap_or(move_record.base_power),
        target_class: move_record.target.clone(),
    })
}

fn weather_id(catalog: &MechanicsCatalog, weather: &str) -> Result<i32, DynamicMoveError> {
    catalog
        .pack()
        .runtime_enums
        .weather
        .get(weather)
        .copied()
        .ok_or_else(|| DynamicMoveError::MissingRuntimeWeather(weather.to_owned()))
}

fn assert_callbacks(
    catalog: &MechanicsCatalog,
    md_id: i32,
    expected: &[&str],
) -> Result<(), DynamicMoveError> {
    let actual = catalog
        .move_by_num(md_id)
        .ok_or(CoreDamageError::UnknownMove(md_id))?
        .callback_keys
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    let expected = expected
        .iter()
        .map(|value| (*value).to_owned())
        .collect::<BTreeSet<_>>();
    if actual != expected {
        return Err(DynamicMoveError::CallbackContractChanged {
            md_id,
            expected: expected.into_iter().collect(),
            actual: actual.into_iter().collect(),
        });
    }
    Ok(())
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

    fn state(weather_md_id: i32, item_md_id: Option<i32>) -> SimulationState {
        let mut world = WorldSnapshot::default();
        world.weather_md_id = weather_md_id;
        SimulationState {
            source_state_hash: "0123456789abcdef".to_owned(),
            battle_rule: 5,
            battle_type: 1,
            battle_stage_md_id: 1,
            local_team_index: 0,
            elapsed_turns: 1,
            world,
            teams: vec![SimulationTeam {
                team_index: 0,
                is_local_player: true,
                pokemon_order: vec![0],
                pokemon: vec![SimulationPokemon {
                    key: PokemonKey {
                        team_index: 0,
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
                        side_index: 0,
                        position_index: 0,
                    }),
                    moves: vec![SimulationMove {
                        md_id: WEATHER_BALL_MD_ID,
                        slot_index: 0,
                        current_pp: 8,
                        max_pp: 8,
                        locked: false,
                    }],
                    volatile_effects: Vec::new(),
                    field_effects: Vec::new(),
                }],
            }],
        }
    }

    fn actor() -> PokemonKey {
        PokemonKey {
            team_index: 0,
            group_index: 0,
        }
    }

    #[test]
    fn weather_ball_tracks_champions_weather_ids() {
        let catalog = catalog();
        let rain = weather_id(&catalog, "rain").unwrap();
        let result = resolve_damage_move(&state(rain, None), actor(), 311, &catalog)
            .expect("rain Weather Ball should resolve");
        assert_eq!(result.move_type, "Water");
        assert_eq!(result.base_power, 100);

        let sand = weather_id(&catalog, "sandstorm").unwrap();
        let result = resolve_damage_move(&state(sand, None), actor(), 311, &catalog)
            .expect("sand Weather Ball should resolve");
        assert_eq!(result.move_type, "Rock");
        assert_eq!(result.base_power, 100);
    }

    #[test]
    fn electro_shot_release_uses_its_catalog_damage_profile() {
        let profile = resolve_damage_move(
            &state(0, None),
            PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            ELECTRO_SHOT_MD_ID,
            &catalog(),
        )
        .expect("Electro Shot's release phase should have a damage profile");

        assert_eq!(profile.base_power, 130);
        assert_eq!(profile.category, DamageCategory::Special);
        assert_eq!(profile.move_type, "Electric");
    }

    #[test]
    fn utility_umbrella_only_suppresses_rain_and_sun_weather_ball() {
        let catalog = catalog();
        let umbrella = catalog.item_by_id("utilityumbrella").unwrap().num;
        let rain = weather_id(&catalog, "rain").unwrap();
        let rain_result = resolve_damage_move(&state(rain, Some(umbrella)), actor(), 311, &catalog)
            .expect("umbrella rain Weather Ball should resolve");
        assert_eq!(rain_result.move_type, "Normal");
        assert_eq!(rain_result.base_power, 50);

        let snow = weather_id(&catalog, "snow").unwrap();
        let snow_result = resolve_damage_move(&state(snow, Some(umbrella)), actor(), 311, &catalog)
            .expect("umbrella snow Weather Ball should resolve");
        assert_eq!(snow_result.move_type, "Ice");
        assert_eq!(snow_result.base_power, 100);
    }

    #[test]
    fn hurricane_damage_profile_is_static_after_its_accuracy_callback_is_acknowledged() {
        let catalog = catalog();
        let result = resolve_damage_move(&state(0, None), actor(), 542, &catalog)
            .expect("Hurricane damage should resolve");
        assert_eq!(result.move_type, "Flying");
        assert_eq!(result.base_power, 110);
    }

    #[test]
    fn unknown_dynamic_moves_fail_closed() {
        let error = resolve_damage_move(&state(0, None), actor(), 486, &catalog())
            .expect_err("Electro Ball needs its own speed-ratio resolver");
        assert!(matches!(
            error,
            DynamicMoveError::UnsupportedDynamicMove { md_id: 486, .. }
        ));
    }
}
