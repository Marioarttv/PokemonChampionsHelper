use crate::{
    ExactHp, MechanicsCatalog, PendingMoveTarget, PokemonKey, PokemonScenario, PokemonSnapshot,
    ScenarioMove, ScenarioOverlay, SnapshotEnvelope, TeamScenario, TrainingPoints,
    calculate_battle_stats, materialize_simulation_state, normalize_battle_state,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::{Display, Formatter};

pub const EXACT_SCENARIO_SCHEMA_VERSION: u32 = 1;
const MAX_EXACT_SCENARIO_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ExactScenarioSheet {
    pub schema_version: u32,
    pub teams: Vec<ExactTeamSheet>,
    #[serde(default)]
    pub pending_move_targets: Vec<PendingMoveTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ExactTeamSheet {
    pub team_index: i32,
    pub pokemon_order: Vec<i32>,
    pub pokemon: Vec<ExactPokemonSheet>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ExactPokemonSheet {
    pub group_index: i32,
    pub species_id: String,
    pub current_item_id: String,
    pub current_ability_id: String,
    #[serde(default)]
    pub supreme_overlord_fallen_allies: Option<i32>,
    pub nature_id: String,
    pub training_points: TrainingPoints,
    pub current_hp: i32,
    pub moves: Vec<ExactMoveSheet>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ExactMoveSheet {
    pub move_id: String,
    pub current_pp: i32,
    pub max_pp: i32,
    #[serde(default)]
    pub locked: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExactScenarioError {
    TooLarge {
        actual: usize,
        maximum: usize,
    },
    InvalidJson(String),
    UnsupportedSchema(u32),
    BattleUnavailable,
    DuplicateTeam(i32),
    MissingTeam(i32),
    UnexpectedTeam(i32),
    TeamRosterMismatch(i32),
    MissingPokemon(PokemonKey),
    UnknownSpecies {
        key: PokemonKey,
        species_id: String,
    },
    SpeciesMismatch {
        key: PokemonKey,
        species_id: String,
        personal_id: i32,
    },
    UnknownItem {
        key: PokemonKey,
        item_id: String,
    },
    UnknownAbility {
        key: PokemonKey,
        ability_id: String,
    },
    UnknownNature {
        key: PokemonKey,
        nature_id: String,
    },
    InvalidMoveCount(PokemonKey),
    DuplicateMove {
        key: PokemonKey,
        move_id: String,
    },
    UnknownMove {
        key: PokemonKey,
        move_id: String,
    },
    InvalidMovePp {
        key: PokemonKey,
        move_id: String,
        current: i32,
        maximum: i32,
    },
    InvalidTraining {
        key: PokemonKey,
        detail: String,
    },
    InvalidCurrentHp {
        key: PokemonKey,
        current: i32,
        maximum: i32,
    },
    ObservedConflict {
        key: PokemonKey,
        field: &'static str,
    },
    StateNormalization(String),
    StateMaterialization(String),
}

impl Display for ExactScenarioError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooLarge { actual, maximum } => {
                write!(
                    formatter,
                    "exact scenario is {actual} bytes; maximum is {maximum}"
                )
            }
            Self::InvalidJson(message) => {
                write!(formatter, "invalid exact-scenario JSON: {message}")
            }
            Self::UnsupportedSchema(version) => {
                write!(
                    formatter,
                    "unsupported exact-scenario schema version {version}"
                )
            }
            Self::BattleUnavailable => write!(formatter, "snapshot has no active battle"),
            Self::DuplicateTeam(team) => write!(formatter, "exact scenario repeats team {team}"),
            Self::MissingTeam(team) => write!(formatter, "exact scenario is missing team {team}"),
            Self::UnexpectedTeam(team) => {
                write!(formatter, "exact scenario contains unexpected team {team}")
            }
            Self::TeamRosterMismatch(team) => write!(
                formatter,
                "exact scenario roster groups do not match snapshot team {team}"
            ),
            Self::MissingPokemon(key) => {
                write!(formatter, "exact scenario is missing Pokemon {key:?}")
            }
            Self::UnknownSpecies { key, species_id } => {
                write!(
                    formatter,
                    "Pokemon {key:?} has unknown species ID {species_id}"
                )
            }
            Self::SpeciesMismatch {
                key,
                species_id,
                personal_id,
            } => write!(
                formatter,
                "Pokemon {key:?} species {species_id} does not match snapshot personal ID {personal_id}"
            ),
            Self::UnknownItem { key, item_id } => {
                write!(
                    formatter,
                    "Pokemon {key:?} has unknown current item ID {item_id}"
                )
            }
            Self::UnknownAbility { key, ability_id } => write!(
                formatter,
                "Pokemon {key:?} has unknown current ability ID {ability_id}"
            ),
            Self::UnknownNature { key, nature_id } => {
                write!(
                    formatter,
                    "Pokemon {key:?} has unknown nature ID {nature_id}"
                )
            }
            Self::InvalidMoveCount(key) => {
                write!(
                    formatter,
                    "Pokemon {key:?} must have between one and four moves"
                )
            }
            Self::DuplicateMove { key, move_id } => {
                write!(formatter, "Pokemon {key:?} repeats move {move_id}")
            }
            Self::UnknownMove { key, move_id } => {
                write!(formatter, "Pokemon {key:?} has unknown move ID {move_id}")
            }
            Self::InvalidMovePp {
                key,
                move_id,
                current,
                maximum,
            } => write!(
                formatter,
                "Pokemon {key:?} move {move_id} has invalid PP {current}/{maximum}"
            ),
            Self::InvalidTraining { key, detail } => {
                write!(
                    formatter,
                    "Pokemon {key:?} has invalid training points: {detail}"
                )
            }
            Self::InvalidCurrentHp {
                key,
                current,
                maximum,
            } => write!(
                formatter,
                "Pokemon {key:?} has invalid exact HP {current}/{maximum}"
            ),
            Self::ObservedConflict { key, field } => write!(
                formatter,
                "Pokemon {key:?} exact-sheet {field} conflicts with the observed snapshot"
            ),
            Self::StateNormalization(message) => {
                write!(
                    formatter,
                    "exact scenario conflicts with snapshot: {message}"
                )
            }
            Self::StateMaterialization(message) => {
                write!(
                    formatter,
                    "exact scenario is incomplete or inconsistent: {message}"
                )
            }
        }
    }
}

impl std::error::Error for ExactScenarioError {}

pub fn parse_exact_scenario_sheet(bytes: &[u8]) -> Result<ExactScenarioSheet, ExactScenarioError> {
    if bytes.len() > MAX_EXACT_SCENARIO_BYTES {
        return Err(ExactScenarioError::TooLarge {
            actual: bytes.len(),
            maximum: MAX_EXACT_SCENARIO_BYTES,
        });
    }
    let sheet: ExactScenarioSheet = serde_json::from_slice(bytes)
        .map_err(|error| ExactScenarioError::InvalidJson(error.to_string()))?;
    if sheet.schema_version != EXACT_SCENARIO_SCHEMA_VERSION {
        return Err(ExactScenarioError::UnsupportedSchema(sheet.schema_version));
    }
    Ok(sheet)
}

pub fn build_exact_scenario(
    snapshot: &SnapshotEnvelope,
    sheet: &ExactScenarioSheet,
    catalog: &MechanicsCatalog,
) -> Result<ScenarioOverlay, ExactScenarioError> {
    if sheet.schema_version != EXACT_SCENARIO_SCHEMA_VERSION {
        return Err(ExactScenarioError::UnsupportedSchema(sheet.schema_version));
    }
    if !snapshot.state.available {
        return Err(ExactScenarioError::BattleUnavailable);
    }

    let snapshot_teams = snapshot
        .state
        .teams
        .iter()
        .map(|team| (team.team_index, team))
        .collect::<BTreeMap<_, _>>();
    let mut sheet_teams = BTreeMap::new();
    for team in &sheet.teams {
        if sheet_teams.insert(team.team_index, team).is_some() {
            return Err(ExactScenarioError::DuplicateTeam(team.team_index));
        }
        if !snapshot_teams.contains_key(&team.team_index) {
            return Err(ExactScenarioError::UnexpectedTeam(team.team_index));
        }
    }
    for team_index in snapshot_teams.keys() {
        if !sheet_teams.contains_key(team_index) {
            return Err(ExactScenarioError::MissingTeam(*team_index));
        }
    }

    let mut overlay = ScenarioOverlay::default();
    overlay.pending_move_targets = sheet.pending_move_targets.clone();
    for (team_index, snapshot_team) in snapshot_teams {
        let exact_team = sheet_teams
            .get(&team_index)
            .copied()
            .ok_or(ExactScenarioError::MissingTeam(team_index))?;
        let snapshot_groups = snapshot_team
            .pokemon
            .iter()
            .map(|pokemon| pokemon.group_index)
            .collect::<BTreeSet<_>>();
        let exact_groups = exact_team
            .pokemon
            .iter()
            .map(|pokemon| pokemon.group_index)
            .collect::<BTreeSet<_>>();
        if snapshot_groups != exact_groups || exact_groups.len() != exact_team.pokemon.len() {
            return Err(ExactScenarioError::TeamRosterMismatch(team_index));
        }

        overlay.teams.push(TeamScenario {
            team_index,
            pokemon_order: exact_team.pokemon_order.clone(),
        });
        for exact_pokemon in &exact_team.pokemon {
            let key = PokemonKey {
                team_index,
                group_index: exact_pokemon.group_index,
            };
            let snapshot_pokemon = snapshot_team
                .pokemon
                .iter()
                .find(|pokemon| pokemon.group_index == exact_pokemon.group_index)
                .ok_or(ExactScenarioError::MissingPokemon(key))?;
            overlay.pokemon.push(build_exact_pokemon(
                key,
                snapshot_pokemon,
                snapshot_team.is_local_player,
                exact_pokemon,
                catalog,
            )?);
        }
    }

    let normalized = normalize_battle_state(snapshot, &overlay, catalog)
        .map_err(|error| ExactScenarioError::StateNormalization(error.to_string()))?;
    materialize_simulation_state(&normalized, catalog)
        .map_err(|error| ExactScenarioError::StateMaterialization(error.to_string()))?;
    Ok(overlay)
}

fn build_exact_pokemon(
    key: PokemonKey,
    snapshot: &PokemonSnapshot,
    is_local_team: bool,
    exact: &ExactPokemonSheet,
    catalog: &MechanicsCatalog,
) -> Result<PokemonScenario, ExactScenarioError> {
    let species = catalog.species_by_id(&exact.species_id).ok_or_else(|| {
        ExactScenarioError::UnknownSpecies {
            key,
            species_id: exact.species_id.clone(),
        }
    })?;
    if species.num != snapshot.personal_id {
        return Err(ExactScenarioError::SpeciesMismatch {
            key,
            species_id: exact.species_id.clone(),
            personal_id: snapshot.personal_id,
        });
    }
    let nature = catalog
        .pack()
        .natures
        .iter()
        .find(|nature| nature.id.eq_ignore_ascii_case(&exact.nature_id))
        .ok_or_else(|| ExactScenarioError::UnknownNature {
            key,
            nature_id: exact.nature_id.clone(),
        })?;
    let stats = calculate_battle_stats(species, exact.training_points, &nature.id, catalog)
        .map_err(|error| ExactScenarioError::InvalidTraining {
            key,
            detail: error.to_string(),
        })?;
    if exact.current_hp < 0 || exact.current_hp > stats.hp {
        return Err(ExactScenarioError::InvalidCurrentHp {
            key,
            current: exact.current_hp,
            maximum: stats.hp,
        });
    }

    let item_md_id = if exact.current_item_id.eq_ignore_ascii_case("none") {
        0
    } else {
        catalog
            .pack()
            .items
            .iter()
            .find(|item| item.id.eq_ignore_ascii_case(&exact.current_item_id))
            .map(|item| item.num)
            .ok_or_else(|| ExactScenarioError::UnknownItem {
                key,
                item_id: exact.current_item_id.clone(),
            })?
    };
    let ability_md_id = catalog
        .pack()
        .abilities
        .iter()
        .find(|ability| ability.id.eq_ignore_ascii_case(&exact.current_ability_id))
        .map(|ability| ability.num)
        .ok_or_else(|| ExactScenarioError::UnknownAbility {
            key,
            ability_id: exact.current_ability_id.clone(),
        })?;

    if exact.moves.is_empty() || exact.moves.len() > 4 {
        return Err(ExactScenarioError::InvalidMoveCount(key));
    }
    let mut move_ids = BTreeSet::new();
    let mut moves = Vec::with_capacity(exact.moves.len());
    for (slot_index, exact_move) in exact.moves.iter().enumerate() {
        let normalized_id = exact_move.move_id.to_ascii_lowercase();
        if !move_ids.insert(normalized_id) {
            return Err(ExactScenarioError::DuplicateMove {
                key,
                move_id: exact_move.move_id.clone(),
            });
        }
        let move_record = catalog
            .pack()
            .moves
            .iter()
            .find(|entry| entry.id.eq_ignore_ascii_case(&exact_move.move_id))
            .ok_or_else(|| ExactScenarioError::UnknownMove {
                key,
                move_id: exact_move.move_id.clone(),
            })?;
        if exact_move.current_pp < 0
            || exact_move.max_pp <= 0
            || exact_move.current_pp > exact_move.max_pp
        {
            return Err(ExactScenarioError::InvalidMovePp {
                key,
                move_id: exact_move.move_id.clone(),
                current: exact_move.current_pp,
                maximum: exact_move.max_pp,
            });
        }
        moves.push(ScenarioMove {
            md_id: move_record.num,
            slot_index: i32::try_from(slot_index).ok(),
            current_pp: Some(exact_move.current_pp),
            max_pp: Some(exact_move.max_pp),
            locked: Some(exact_move.locked),
        });
    }

    let mut scenario = PokemonScenario {
        key,
        species_id: Some(species.id.clone()),
        exact_hp: Some(ExactHp {
            current: exact.current_hp,
            maximum: stats.hp,
        }),
        item_md_id: Some(item_md_id),
        ability_md_id: Some(ability_md_id),
        supreme_overlord_fallen_allies: exact.supreme_overlord_fallen_allies,
        training_points: Some(exact.training_points),
        nature_id: Some(nature.id.clone()),
        moves: Some(moves),
    };
    remove_observed_fields(&mut scenario, snapshot, is_local_team, catalog)?;
    Ok(scenario)
}

fn remove_observed_fields(
    scenario: &mut PokemonScenario,
    snapshot: &PokemonSnapshot,
    is_local_team: bool,
    catalog: &MechanicsCatalog,
) -> Result<(), ExactScenarioError> {
    let key = scenario.key;
    let species_candidates = catalog
        .species_by_num(snapshot.personal_id)
        .map(|species| species.id.as_str())
        .collect::<Vec<_>>();
    if species_candidates.len() == 1 {
        ensure_equal(
            species_candidates[0]
                .eq_ignore_ascii_case(scenario.species_id.as_deref().unwrap_or_default()),
            key,
            "species",
        )?;
        scenario.species_id = None;
    }

    if is_local_team || snapshot.item_md_id > 0 {
        let observed = snapshot.item_md_id.max(0);
        ensure_equal(scenario.item_md_id == Some(observed), key, "current item")?;
        scenario.item_md_id = None;
    }
    if snapshot.ability_md_id > 0 {
        ensure_equal(
            scenario.ability_md_id == Some(snapshot.ability_md_id),
            key,
            "current ability",
        )?;
        scenario.ability_md_id = None;
    }

    let points = snapshot.base_points.clone().unwrap_or_default();
    if is_local_team || points.contains_training_data() {
        let observed = TrainingPoints {
            hp: i32::from(points.hp),
            attack: i32::from(points.attack),
            defense: i32::from(points.defense),
            special_attack: i32::from(points.special_attack),
            special_defense: i32::from(points.special_defense),
            speed: i32::from(points.speed),
        };
        ensure_equal(
            scenario.training_points == Some(observed),
            key,
            "training points",
        )?;
        scenario.training_points = None;
    }

    if is_local_team || snapshot.nature_correction_md_id > 0 {
        let observed = catalog
            .nature_by_champions_md_id(snapshot.nature_correction_md_id)
            .map(|nature| nature.id.as_str())
            .unwrap_or_default();
        ensure_equal(
            scenario
                .nature_id
                .as_deref()
                .is_some_and(|nature| nature.eq_ignore_ascii_case(observed)),
            key,
            "nature",
        )?;
        scenario.nature_id = None;
    }

    if is_local_team || !snapshot.moves.is_empty() {
        let exact_moves = scenario.moves.as_deref().unwrap_or_default();
        let same_moves = exact_moves.len() == snapshot.moves.len()
            && exact_moves
                .iter()
                .zip(&snapshot.moves)
                .all(|(exact, observed)| {
                    exact.md_id == observed.md_id
                        && exact.slot_index == Some(observed.slot_index)
                        && exact.current_pp == Some(observed.current_pp)
                        && exact.max_pp == Some(observed.max_pp)
                });
        ensure_equal(same_moves, key, "moves and PP")?;
        scenario.moves = None;
    }

    if is_local_team && !snapshot.fainted {
        let hp = scenario.exact_hp.as_ref();
        ensure_equal(
            hp.is_some_and(|hp| hp.current == snapshot.current_hp && hp.maximum == snapshot.max_hp),
            key,
            "exact HP",
        )?;
        scenario.exact_hp = None;
    }
    Ok(())
}

fn ensure_equal(
    matches: bool,
    key: PokemonKey,
    field: &'static str,
) -> Result<(), ExactScenarioError> {
    if matches {
        Ok(())
    } else {
        Err(ExactScenarioError::ObservedConflict { key, field })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        BasePoints, BattleStateSnapshot, MoveSnapshot, OpponentObservability, PokemonSnapshot,
        SourceIdentity, TeamSnapshot, WorldSnapshot, load_mechanics_pack,
    };

    const PACK: &[u8] = include_bytes!("../data/champions-mechanics-v1.json");
    const CHECKSUM: &[u8] = include_bytes!("../data/champions-mechanics-v1.json.sha256");

    fn catalog() -> MechanicsCatalog {
        load_mechanics_pack(PACK, CHECKSUM).expect("mechanics pack should validate")
    }

    fn training() -> TrainingPoints {
        TrainingPoints {
            hp: 32,
            attack: 0,
            defense: 0,
            special_attack: 32,
            special_defense: 0,
            speed: 2,
        }
    }

    fn snapshot_pokemon(local: bool) -> PokemonSnapshot {
        PokemonSnapshot {
            personal_id: 279,
            group_index: 0,
            team_group_index: 0,
            is_local_team: local,
            max_hp: 167,
            current_hp: 167,
            raw_hp_ratio: 10_000,
            item_md_id: if local { 275 } else { -1 },
            ability_md_id: 2,
            nature_correction_md_id: if local { 15 } else { 0 },
            selection_order: if local { 0 } else { -1 },
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
                    current_pp: 12,
                    max_pp: 12,
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
            captured_at: "2026-07-15T18:00:00Z".to_owned(),
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
                local_team_index: 0,
                world: WorldSnapshot::default(),
                teams: vec![
                    TeamSnapshot {
                        team_index: 0,
                        is_local_player: true,
                        pokemon_order: vec![0],
                        pokemon: vec![snapshot_pokemon(true)],
                        ..TeamSnapshot::default()
                    },
                    TeamSnapshot {
                        team_index: 1,
                        is_local_player: false,
                        pokemon: vec![snapshot_pokemon(false)],
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

    fn exact_pokemon() -> ExactPokemonSheet {
        ExactPokemonSheet {
            group_index: 0,
            species_id: "pelipper".to_owned(),
            current_item_id: "focussash".to_owned(),
            current_ability_id: "drizzle".to_owned(),
            supreme_overlord_fallen_allies: None,
            nature_id: "modest".to_owned(),
            training_points: training(),
            current_hp: 167,
            moves: vec![ExactMoveSheet {
                move_id: "hurricane".to_owned(),
                current_pp: 12,
                max_pp: 12,
                locked: false,
            }],
        }
    }

    fn sheet() -> ExactScenarioSheet {
        ExactScenarioSheet {
            schema_version: EXACT_SCENARIO_SCHEMA_VERSION,
            teams: vec![
                ExactTeamSheet {
                    team_index: 0,
                    pokemon_order: vec![0],
                    pokemon: vec![exact_pokemon()],
                },
                ExactTeamSheet {
                    team_index: 1,
                    pokemon_order: vec![0],
                    pokemon: vec![exact_pokemon()],
                },
            ],
            pending_move_targets: Vec::new(),
        }
    }

    #[test]
    fn exact_sheet_builds_and_materializes_a_complete_overlay() {
        let overlay = build_exact_scenario(&snapshot(), &sheet(), &catalog())
            .expect("complete exact sheet should materialize");

        assert_eq!(overlay.teams.len(), 2);
        assert_eq!(overlay.pokemon.len(), 2);
        assert_eq!(overlay.pokemon[1].item_md_id, Some(275));
        assert_eq!(overlay.pokemon[1].ability_md_id, None);
        assert_eq!(overlay.pokemon[1].exact_hp.as_ref().unwrap().maximum, 167);
        assert_eq!(overlay.pokemon[1].moves.as_ref().unwrap()[0].md_id, 542);
    }

    #[test]
    fn exact_sheet_rejects_an_observed_local_conflict() {
        let mut sheet = sheet();
        sheet.teams[0].pokemon[0].current_item_id = "leftovers".to_owned();

        let error = build_exact_scenario(&snapshot(), &sheet, &catalog())
            .expect_err("observed local item conflict must fail");
        assert!(matches!(
            error,
            ExactScenarioError::ObservedConflict {
                field: "current item",
                ..
            }
        ));
    }

    #[test]
    fn exact_sheet_rejects_missing_roster_members() {
        let mut sheet = sheet();
        sheet.teams[1].pokemon.clear();

        assert!(matches!(
            build_exact_scenario(&snapshot(), &sheet, &catalog()),
            Err(ExactScenarioError::TeamRosterMismatch(1))
        ));
    }

    #[test]
    fn exact_sheet_retains_zero_hp_for_an_observed_fainted_local_pokemon() {
        let mut snapshot = snapshot();
        snapshot.state.teams[0].pokemon[0].fainted = true;
        snapshot.state.teams[0].pokemon[0].current_hp = 0;
        let mut sheet = sheet();
        sheet.teams[0].pokemon[0].current_hp = 0;

        let overlay = build_exact_scenario(&snapshot, &sheet, &catalog())
            .expect("fainted local exact HP should remain materializable");
        assert_eq!(
            overlay.pokemon[0].exact_hp,
            Some(ExactHp {
                current: 0,
                maximum: 167,
            })
        );
    }

    #[test]
    fn parser_rejects_unknown_fields_and_schema_versions() {
        let unknown = br#"{"schema_version":1,"teams":[],"unexpected":true}"#;
        assert!(matches!(
            parse_exact_scenario_sheet(unknown),
            Err(ExactScenarioError::InvalidJson(_))
        ));

        let unsupported = br#"{"schema_version":2,"teams":[]}"#;
        assert_eq!(
            parse_exact_scenario_sheet(unsupported),
            Err(ExactScenarioError::UnsupportedSchema(2))
        );
    }
}
