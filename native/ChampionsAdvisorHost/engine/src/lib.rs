use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt::{Display, Formatter};

mod accuracy;
mod action_generation;
mod battle_domain;
mod core_damage;
mod dynamic_moves;
mod exact_scenario;
mod mechanics;
mod replay;
mod search;
mod simulation_state;
mod simulator_math;
mod state_adapter;
mod turn_execution;
mod turn_order;
mod weather;

pub use accuracy::{AccuracyError, HitChance, HitChanceRequest, calculate_hit_chance};
pub use battle_domain::CoreBattleDomain;
pub use exact_scenario::{
    EXACT_SCENARIO_SCHEMA_VERSION, ExactMoveSheet, ExactPokemonSheet, ExactScenarioError,
    ExactScenarioSheet, ExactTeamSheet, build_exact_scenario, parse_exact_scenario_sheet,
};
pub use mechanics::{
    AbilityRecord, Accuracy, ItemRecord, MechanicsCatalog, MechanicsError, MechanicsPack,
    MoveRecord, RuntimeEnums, SpeciesRecord, load_mechanics_pack,
};
pub use replay::{
    ExpectedObservationChange, ObservationChange, PredictionMismatch, PredictionReport,
    PredictionStatus, ReplayActionEvidence, ReplayActionKind, ReplayError,
    ReplayEvidenceProvenance, ReplayFixture, ReplayForcedReplacement, ReplayPrediction,
    ReplayReport, ReplayTransition, ReplayTransitionReport, compare_predicted_state,
    diff_observed_states, validate_replay_fixture, validate_replay_fixture_path,
};
pub use search::{
    ChanceSuccessor, PrincipalVariationStep, SearchDomain, SearchError, SearchLimits,
    SearchProgress, SearchResult, SearchStatistics, search_best_plan,
    search_best_plan_with_progress,
};
pub use simulation_state::{
    BattlePosition, MaterializationError, SimulationMove, SimulationPokemon, SimulationState,
    SimulationTeam, apply_mega_evolution, materialize_simulation_state, mega_target_species_id,
};
pub use simulator_math::{
    BattleStats, DamageInput, DamageRolls, MathError, Rational, TrainingPoints, apply_stat_stage,
    calculate_battle_stats, calculate_damage_rolls, type_multiplier,
};
pub use state_adapter::{
    EngineBattleState, EngineMove, EnginePokemon, EngineTeam, ExactHp, HpKnowledge, Knowledge,
    PendingMoveTarget, PokemonKey, PokemonScenario, Provenance, ScenarioMove, ScenarioOverlay,
    SerializableHpObservation, StateAdapterError, TeamScenario, normalize_battle_state,
};
pub use turn_execution::{
    CoreExecutionBranch, CoreExecutionContext, CoreExecutionEvent, CriticalHitMode,
    ExactProbability, TurnExecutionError, execute_core_action,
};
pub use turn_order::{
    ActionPhase, ActorOrderModifier, BranchProbability, OrderedAction, TurnOrderBranch,
    TurnOrderContext, TurnOrderError, resolve_turn_order,
};

pub const SUPPORTED_SCHEMA_VERSION: u32 = 1;
pub const SUPPORTED_BUNDLE_ID: &str = "jp.pokemon.pokemonchampions";
pub const SUPPORTED_APP_VERSION: &str = "1.1.4";
pub const SUPPORTED_APP_BUILD: &str = "25";
pub const SUPPORTED_OFFSET_PROFILE: &str = "champions-1.1.4-25-arm64e-v1";
pub const SUPPORTED_UNITY_FRAMEWORK_UUID: &str = "30C1CBE3-025E-3590-88C3-2FEE8235D2A3";
pub const SUPPORTED_UNITY_FRAMEWORK_SHA256: &str =
    "e162bcd191a4a0fab1c131ed2d7b7755ecc675074da28868a7006c9b54e56dab";

const MAX_SNAPSHOT_BYTES: usize = 2 * 1024 * 1024;
const MAX_TEAMS: usize = 4;
const MAX_POKEMON_PER_TEAM: usize = 6;
const MAX_MOVES_PER_POKEMON: usize = 4;
const MAX_EFFECTS_PER_SCOPE: usize = 32;
const MAX_SIDES: usize = 4;
const MAX_POSITIONS_PER_SIDE: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SnapshotEnvelope {
    pub schema_version: u32,
    pub captured_at: String,
    pub state_hash: String,
    pub source: SourceIdentity,
    pub state: BattleStateSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SourceIdentity {
    pub bundle_id: String,
    pub app_version: String,
    pub app_build: String,
    pub unity_framework_sha256: String,
    pub unity_framework_uuid: String,
    pub offset_profile: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct BattleStateSnapshot {
    pub available: bool,
    pub battle_rule: u8,
    pub battle_type: u8,
    pub battle_stage_md_id: i32,
    pub local_team_index: i32,
    pub replay_mode: bool,
    pub spectator_mode: bool,
    pub spectator_mode_type: i32,
    pub world: WorldSnapshot,
    pub teams: Vec<TeamSnapshot>,
    pub opponent_observability: OpponentObservability,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(default)]
pub struct WorldSnapshot {
    pub battle_rule: u8,
    pub weather_md_id: i32,
    pub weather_lifespan_turns: i32,
    pub weather_elapsed_turns: i32,
    pub elapsed_turns: i32,
    pub field_effects: Vec<EffectSnapshot>,
    pub sides: Vec<SideSnapshot>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(default)]
pub struct SideSnapshot {
    pub side_index: i32,
    pub field_effects: Vec<EffectSnapshot>,
    pub positions: Vec<PositionSnapshot>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(default)]
pub struct PositionSnapshot {
    pub side_index: i32,
    pub position_index: i32,
    pub registered_group_index: Option<i32>,
    pub registered_user_index: Option<i32>,
    pub field_effects: Vec<EffectSnapshot>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct TeamSnapshot {
    pub battle_rule: u8,
    pub is_local_player: bool,
    pub team_index: i32,
    pub selected_entry: bool,
    pub waiting_for_action: bool,
    pub pokemon_order: Vec<i32>,
    pub selected_group_indices: Vec<i32>,
    pub pokemon: Vec<PokemonSnapshot>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct PokemonSnapshot {
    pub personal_md_index: i32,
    pub personal_id: i32,
    pub form_no: i32,
    pub gender: i32,
    pub user_index: i32,
    pub team_group_index: i32,
    pub is_local_team: bool,
    pub item_md_id: i32,
    pub ability_md_id: i32,
    pub last_ability_md_id: i32,
    pub group_index: i32,
    pub team_user_index: i32,
    pub team_pokemon_index: i32,
    pub side_index: i32,
    pub position_index: i32,
    pub max_hp: i32,
    pub current_hp: i32,
    pub raw_hp_ratio: i32,
    pub fainted: bool,
    pub needs_change: bool,
    pub move_select_auto: bool,
    pub change_select_locked: bool,
    pub substitute: bool,
    pub can_mega: bool,
    pub mega_locked: bool,
    pub mega_mode: bool,
    pub type_1: u8,
    pub type_2: u8,
    pub extra_type: u8,
    pub extra_type_cause: u8,
    pub illusion_active: bool,
    pub illusion_revealed: bool,
    pub status_condition: i32,
    pub nature_correction_md_id: u16,
    pub selection_order: i32,
    pub entered_field: bool,
    pub stat_stages: StatStages,
    pub base_points: Option<BasePoints>,
    pub moves: Vec<MoveSnapshot>,
    pub volatile_effects: Vec<EffectSnapshot>,
    pub field_effects: Vec<EffectSnapshot>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(default)]
pub struct StatStages {
    pub hp: i32,
    pub attack: i32,
    pub defense: i32,
    pub special_attack: i32,
    pub special_defense: i32,
    pub speed: i32,
    pub accuracy: i32,
    pub evasion: i32,
    pub critical: i32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct BasePoints {
    pub hp: u8,
    pub attack: u8,
    pub defense: u8,
    pub special_attack: u8,
    pub special_defense: u8,
    pub speed: u8,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct MoveSnapshot {
    pub md_id: i32,
    pub slot_index: i32,
    pub current_pp: i32,
    pub max_pp: i32,
    pub locked: bool,
    pub lock_execute_kind: i16,
    pub lock_data_kind: i16,
    pub lock_data_md_id: i32,
    pub target: i16,
    pub move_type: u8,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(default)]
pub struct EffectSnapshot {
    pub md_id: i32,
    pub lifespan_turns: i32,
    pub elapsed_turns: i32,
    pub step_or_count: i32,
    pub execute_kind: i16,
    pub execute_id: i32,
    pub target_execute_kind: i16,
    pub target_execute_id: i32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct OpponentObservability {
    pub remote_pokemon: usize,
    pub remote_with_moves: usize,
    pub remote_with_items: usize,
    pub remote_with_abilities: usize,
    pub remote_with_base_points: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HpObservation {
    Exact { current: i32, maximum: i32 },
    RatioBasisPoints { basis_points: i32 },
    Fainted,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotError {
    TooLarge { actual: usize, maximum: usize },
    InvalidJson(String),
    MissingState,
    UnsupportedSchema(u32),
    UnsupportedSource(String),
    InvalidStateHashFormat(String),
    StateHashMismatch { expected: String, actual: String },
    InvalidState(String),
}

impl Display for SnapshotError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooLarge { actual, maximum } => {
                write!(
                    formatter,
                    "snapshot is {actual} bytes; maximum is {maximum}"
                )
            }
            Self::InvalidJson(message) => write!(formatter, "invalid snapshot JSON: {message}"),
            Self::MissingState => write!(formatter, "snapshot does not contain a state object"),
            Self::UnsupportedSchema(version) => {
                write!(formatter, "unsupported snapshot schema version: {version}")
            }
            Self::UnsupportedSource(message) => {
                write!(formatter, "unsupported snapshot source: {message}")
            }
            Self::InvalidStateHashFormat(hash) => {
                write!(formatter, "invalid state hash format: {hash}")
            }
            Self::StateHashMismatch { expected, actual } => {
                write!(
                    formatter,
                    "state hash mismatch: envelope={expected}, calculated={actual}"
                )
            }
            Self::InvalidState(message) => write!(formatter, "invalid battle state: {message}"),
        }
    }
}

impl std::error::Error for SnapshotError {}

pub fn parse_and_validate_snapshot(bytes: &[u8]) -> Result<SnapshotEnvelope, SnapshotError> {
    if bytes.len() > MAX_SNAPSHOT_BYTES {
        return Err(SnapshotError::TooLarge {
            actual: bytes.len(),
            maximum: MAX_SNAPSHOT_BYTES,
        });
    }

    let raw: Value = serde_json::from_slice(bytes)
        .map_err(|error| SnapshotError::InvalidJson(error.to_string()))?;
    let state_value = raw.get("state").ok_or(SnapshotError::MissingState)?;
    let calculated_hash = state_hash(state_value)?;
    let snapshot: SnapshotEnvelope = serde_json::from_value(raw)
        .map_err(|error| SnapshotError::InvalidJson(error.to_string()))?;

    validate_source(&snapshot)?;
    validate_hash(&snapshot.state_hash, &calculated_hash)?;
    validate_state(&snapshot.state)?;
    Ok(snapshot)
}

pub fn state_hash(state: &Value) -> Result<String, SnapshotError> {
    let bytes =
        serde_json::to_vec(state).map_err(|error| SnapshotError::InvalidJson(error.to_string()))?;
    let mut hash = 14_695_981_039_346_656_037_u64;
    for byte in bytes {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(1_099_511_628_211_u64);
    }
    Ok(format!("{hash:016x}"))
}

fn validate_source(snapshot: &SnapshotEnvelope) -> Result<(), SnapshotError> {
    if snapshot.schema_version != SUPPORTED_SCHEMA_VERSION {
        return Err(SnapshotError::UnsupportedSchema(snapshot.schema_version));
    }

    let source = &snapshot.source;
    let checks = [
        ("bundle_id", source.bundle_id.as_str(), SUPPORTED_BUNDLE_ID),
        (
            "app_version",
            source.app_version.as_str(),
            SUPPORTED_APP_VERSION,
        ),
        ("app_build", source.app_build.as_str(), SUPPORTED_APP_BUILD),
        (
            "offset_profile",
            source.offset_profile.as_str(),
            SUPPORTED_OFFSET_PROFILE,
        ),
        (
            "unity_framework_uuid",
            source.unity_framework_uuid.as_str(),
            SUPPORTED_UNITY_FRAMEWORK_UUID,
        ),
        (
            "unity_framework_sha256",
            source.unity_framework_sha256.as_str(),
            SUPPORTED_UNITY_FRAMEWORK_SHA256,
        ),
    ];
    for (field, actual, expected) in checks {
        if actual != expected {
            return Err(SnapshotError::UnsupportedSource(format!(
                "{field}={actual}, expected {expected}"
            )));
        }
    }
    Ok(())
}

fn validate_hash(envelope_hash: &str, calculated_hash: &str) -> Result<(), SnapshotError> {
    if envelope_hash.len() != 16
        || !envelope_hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(SnapshotError::InvalidStateHashFormat(
            envelope_hash.to_owned(),
        ));
    }
    if envelope_hash != calculated_hash {
        return Err(SnapshotError::StateHashMismatch {
            expected: envelope_hash.to_owned(),
            actual: calculated_hash.to_owned(),
        });
    }
    Ok(())
}

fn validate_state(state: &BattleStateSnapshot) -> Result<(), SnapshotError> {
    if state.teams.len() > MAX_TEAMS {
        return Err(SnapshotError::InvalidState(format!(
            "{} teams exceeds maximum {MAX_TEAMS}",
            state.teams.len()
        )));
    }
    if state.world.sides.len() > MAX_SIDES {
        return Err(SnapshotError::InvalidState(format!(
            "{} sides exceeds maximum {MAX_SIDES}",
            state.world.sides.len()
        )));
    }
    validate_effect_count("world", &state.world.field_effects)?;

    for side in &state.world.sides {
        if side.positions.len() > MAX_POSITIONS_PER_SIDE {
            return Err(SnapshotError::InvalidState(format!(
                "side {} has {} positions; maximum is {MAX_POSITIONS_PER_SIDE}",
                side.side_index,
                side.positions.len()
            )));
        }
        validate_effect_count("side", &side.field_effects)?;
        for position in &side.positions {
            validate_effect_count("position", &position.field_effects)?;
        }
    }

    let mut remote_pokemon = 0_usize;
    let mut remote_with_moves = 0_usize;
    let mut remote_with_items = 0_usize;
    let mut remote_with_abilities = 0_usize;
    let mut remote_with_base_points = 0_usize;
    for team in &state.teams {
        if team.pokemon.len() > MAX_POKEMON_PER_TEAM {
            return Err(SnapshotError::InvalidState(format!(
                "team {} has {} Pokemon; maximum is {MAX_POKEMON_PER_TEAM}",
                team.team_index,
                team.pokemon.len()
            )));
        }
        if team.selected_group_indices.len() > MAX_POKEMON_PER_TEAM
            || team.pokemon_order.len() > MAX_POKEMON_PER_TEAM
        {
            return Err(SnapshotError::InvalidState(format!(
                "team {} entry arrays exceed maximum {MAX_POKEMON_PER_TEAM}",
                team.team_index
            )));
        }
        for pokemon in &team.pokemon {
            if pokemon.moves.len() > MAX_MOVES_PER_POKEMON {
                return Err(SnapshotError::InvalidState(format!(
                    "Pokemon group {} has {} moves; maximum is {MAX_MOVES_PER_POKEMON}",
                    pokemon.group_index,
                    pokemon.moves.len()
                )));
            }
            validate_effect_count("Pokemon volatile", &pokemon.volatile_effects)?;
            validate_effect_count("Pokemon field", &pokemon.field_effects)?;
            if !team.is_local_player {
                remote_pokemon += 1;
                remote_with_moves += usize::from(!pokemon.moves.is_empty());
                remote_with_items += usize::from(pokemon.item_md_id > 0);
                remote_with_abilities += usize::from(pokemon.ability_md_id > 0);
                remote_with_base_points += usize::from(
                    pokemon
                        .base_points
                        .as_ref()
                        .is_some_and(BasePoints::contains_training_data),
                );
            }
        }
    }

    let expected_observability = OpponentObservability {
        remote_pokemon,
        remote_with_moves,
        remote_with_items,
        remote_with_abilities,
        remote_with_base_points,
    };
    if state.opponent_observability != expected_observability {
        return Err(SnapshotError::InvalidState(format!(
            "opponent observability mismatch: envelope={:?}, calculated={expected_observability:?}",
            state.opponent_observability
        )));
    }
    if state.available && state.teams.is_empty() {
        return Err(SnapshotError::InvalidState(
            "available=true requires at least one team".to_owned(),
        ));
    }
    Ok(())
}

fn validate_effect_count(label: &str, effects: &[EffectSnapshot]) -> Result<(), SnapshotError> {
    if effects.len() > MAX_EFFECTS_PER_SCOPE {
        return Err(SnapshotError::InvalidState(format!(
            "{label} has {} effects; maximum is {MAX_EFFECTS_PER_SCOPE}",
            effects.len()
        )));
    }
    Ok(())
}

impl BasePoints {
    fn contains_training_data(&self) -> bool {
        self.hp > 0
            || self.attack > 0
            || self.defense > 0
            || self.special_attack > 0
            || self.special_defense > 0
            || self.speed > 0
    }
}

impl PokemonSnapshot {
    pub fn hp_observation(&self, is_local_team: bool) -> HpObservation {
        if self.fainted {
            return HpObservation::Fainted;
        }
        if is_local_team && self.max_hp > 0 && (0..=self.max_hp).contains(&self.current_hp) {
            return HpObservation::Exact {
                current: self.current_hp,
                maximum: self.max_hp,
            };
        }
        if !is_local_team && (0..=10_000).contains(&self.raw_hp_ratio) {
            return HpObservation::RatioBasisPoints {
                basis_points: self.raw_hp_ratio,
            };
        }
        HpObservation::Unknown
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn valid_snapshot_value() -> Value {
        let state = json!({
            "available": false,
            "battle_rule": 0,
            "battle_type": 0,
            "battle_stage_md_id": 0,
            "local_team_index": 0,
            "replay_mode": false,
            "spectator_mode": false,
            "spectator_mode_type": 0,
            "world": {},
            "teams": [],
            "opponent_observability": {
                "remote_pokemon": 0,
                "remote_with_moves": 0,
                "remote_with_items": 0,
                "remote_with_abilities": 0,
                "remote_with_base_points": 0
            }
        });
        let hash = state_hash(&state).expect("state should serialize");
        json!({
            "schema_version": 1,
            "captured_at": "2026-07-15T15:00:00.000Z",
            "state_hash": hash,
            "source": {
                "bundle_id": SUPPORTED_BUNDLE_ID,
                "app_version": SUPPORTED_APP_VERSION,
                "app_build": SUPPORTED_APP_BUILD,
                "unity_framework_sha256": SUPPORTED_UNITY_FRAMEWORK_SHA256,
                "unity_framework_uuid": SUPPORTED_UNITY_FRAMEWORK_UUID,
                "offset_profile": SUPPORTED_OFFSET_PROFILE
            },
            "state": state
        })
    }

    #[test]
    fn accepts_a_valid_out_of_battle_snapshot() {
        let input = serde_json::to_vec(&valid_snapshot_value()).expect("fixture should serialize");
        let snapshot = parse_and_validate_snapshot(&input).expect("fixture should validate");
        assert!(!snapshot.state.available);
        assert!(snapshot.state.teams.is_empty());
    }

    #[test]
    fn rejects_a_modified_state_with_a_stale_hash() {
        let mut fixture = valid_snapshot_value();
        fixture["state"]["available"] = Value::Bool(true);
        let input = serde_json::to_vec(&fixture).expect("fixture should serialize");
        let error = parse_and_validate_snapshot(&input).expect_err("stale hash must fail");
        assert!(matches!(error, SnapshotError::StateHashMismatch { .. }));
    }

    #[test]
    fn rejects_an_unknown_framework_uuid() {
        let mut fixture = valid_snapshot_value();
        fixture["source"]["unity_framework_uuid"] =
            Value::String("00000000-0000-0000-0000-000000000000".to_owned());
        let input = serde_json::to_vec(&fixture).expect("fixture should serialize");
        let error = parse_and_validate_snapshot(&input).expect_err("unknown framework must fail");
        assert!(matches!(error, SnapshotError::UnsupportedSource(_)));
    }

    #[test]
    fn rejects_observability_counts_that_disagree_with_the_roster() {
        let mut fixture = valid_snapshot_value();
        fixture["state"]["opponent_observability"]["remote_pokemon"] = Value::from(1);
        let state = fixture["state"].clone();
        fixture["state_hash"] = Value::String(state_hash(&state).expect("state should hash"));
        let input = serde_json::to_vec(&fixture).expect("fixture should serialize");
        let error = parse_and_validate_snapshot(&input).expect_err("bad counts must fail");
        assert!(matches!(error, SnapshotError::InvalidState(_)));
    }

    #[test]
    fn treats_local_hp_as_exact() {
        let pokemon = PokemonSnapshot {
            current_hp: 41,
            max_hp: 167,
            raw_hp_ratio: 2_455,
            ..PokemonSnapshot::default()
        };
        assert_eq!(
            pokemon.hp_observation(true),
            HpObservation::Exact {
                current: 41,
                maximum: 167
            }
        );
    }

    #[test]
    fn treats_remote_hp_as_a_ratio_even_when_the_numeric_hp_field_is_stale() {
        let pokemon = PokemonSnapshot {
            current_hp: 175,
            max_hp: 175,
            raw_hp_ratio: 2_146,
            ..PokemonSnapshot::default()
        };
        assert_eq!(
            pokemon.hp_observation(false),
            HpObservation::RatioBasisPoints {
                basis_points: 2_146
            }
        );
    }
}
pub use action_generation::{
    ActionGenerationError, ActionTarget, ActorActionSet, BattleAction, SideJointPlan,
    generate_actor_actions, generate_joint_plans,
};
pub use core_damage::{
    CoreDamageError, CoreDamageRequest, CoreDamageResult, DamageCategory, ResolvedDamageMove,
    calculate_core_damage, resolve_static_damage_move,
};
pub use dynamic_moves::{DynamicMoveError, resolve_damage_move};
