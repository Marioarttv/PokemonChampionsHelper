use crate::{
    ActionTarget, BattleAction, BattlePosition, BattleStateSnapshot, CoreBattleDomain,
    CoreExecutionContext, CriticalHitMode, MechanicsCatalog, PokemonKey, PokemonSnapshot,
    ScenarioOverlay, SearchDomain, SideJointPlan, SimulationState, SnapshotEnvelope,
    execute_core_action, parse_and_validate_snapshot,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::{Display, Formatter};
use std::fs;
use std::path::{Path, PathBuf};

const REPLAY_SCHEMA_VERSION: u32 = 1;
const MAX_REPLAY_FIXTURE_BYTES: usize = 512 * 1024;
const MAX_SCENARIO_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReplayFixture {
    pub schema_version: u32,
    pub name: String,
    #[serde(default)]
    pub notes: Vec<String>,
    pub transitions: Vec<ReplayTransition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReplayTransition {
    pub label: String,
    pub before: String,
    pub after: String,
    #[serde(default = "default_turn_delta")]
    pub expected_turn_delta: i32,
    #[serde(default)]
    pub actions: Vec<ReplayActionEvidence>,
    #[serde(default)]
    pub expected_changes: Vec<ExpectedObservationChange>,
    #[serde(default)]
    pub expected_blockers: Vec<String>,
    pub prediction: Option<ReplayPrediction>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReplayActionEvidence {
    pub actor: PokemonKey,
    #[serde(flatten)]
    pub action: ReplayActionKind,
    pub provenance: ReplayEvidenceProvenance,
    #[serde(default)]
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReplayActionKind {
    UseMove {
        md_id: i32,
        target: Option<ActionTarget>,
        #[serde(default)]
        replacement: Option<PokemonKey>,
        #[serde(default)]
        mega: bool,
    },
    Switch {
        replacement: PokemonKey,
    },
    Unknown {
        description: String,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReplayEvidenceProvenance {
    UserConfirmed,
    LocalPpDelta,
    StateTransition,
    OutcomeInferred,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExpectedObservationChange {
    pub field: String,
    pub before: Value,
    pub after: Value,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReplayPrediction {
    pub scenario: String,
    pub left_plan: SideJointPlan,
    pub right_plan: SideJointPlan,
    #[serde(default = "default_remote_hp_tolerance")]
    pub remote_hp_tolerance_basis_points: i32,
    #[serde(default)]
    pub critical_hit_mode: CriticalHitMode,
    #[serde(default)]
    pub forced_replacements: Vec<ReplayForcedReplacement>,
    #[serde(default)]
    pub initial_replacements: Vec<ReplayForcedReplacement>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReplayForcedReplacement {
    pub actor: PokemonKey,
    pub replacement: PokemonKey,
    #[serde(default)]
    pub position: Option<BattlePosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ObservationChange {
    pub field: String,
    pub before: Value,
    pub after: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReplayReport {
    pub schema_version: u32,
    pub fixture: String,
    pub passed: bool,
    pub transition_count: usize,
    pub transitions: Vec<ReplayTransitionReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReplayTransitionReport {
    pub label: String,
    pub before_state_hash: String,
    pub after_state_hash: String,
    pub before_turn: i32,
    pub after_turn: i32,
    pub passed: bool,
    pub action_evidence_count: usize,
    pub observation_change_count: usize,
    pub observation_changes: Vec<ObservationChange>,
    pub errors: Vec<String>,
    pub expected_blockers: Vec<String>,
    pub prediction: PredictionReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PredictionReport {
    pub status: PredictionStatus,
    pub successor_count: usize,
    pub matched_branch_index: Option<usize>,
    pub matched_probability: Option<crate::ExactProbability>,
    pub nearest_branch_index: Option<usize>,
    pub nearest_branch_probability: Option<crate::ExactProbability>,
    pub mismatches: Vec<PredictionMismatch>,
    pub message: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PredictionStatus {
    NotConfigured,
    Matched,
    Mismatch,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PredictionMismatch {
    pub field: String,
    pub predicted: Value,
    pub observed: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReplayError {
    CouldNotRead { path: PathBuf, message: String },
    FixtureTooLarge { actual: usize, maximum: usize },
    InvalidFixture(String),
}

impl Display for ReplayError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::CouldNotRead { path, message } => {
                write!(formatter, "could not read {}: {message}", path.display())
            }
            Self::FixtureTooLarge { actual, maximum } => write!(
                formatter,
                "replay fixture is {actual} bytes; maximum is {maximum}"
            ),
            Self::InvalidFixture(message) => write!(formatter, "invalid replay fixture: {message}"),
        }
    }
}

impl std::error::Error for ReplayError {}

pub fn validate_replay_fixture_path(
    fixture_path: &Path,
    catalog: &MechanicsCatalog,
) -> Result<ReplayReport, ReplayError> {
    let bytes = read_limited(fixture_path, MAX_REPLAY_FIXTURE_BYTES)?;
    let fixture: ReplayFixture = serde_json::from_slice(&bytes)
        .map_err(|error| ReplayError::InvalidFixture(error.to_string()))?;
    let base_directory = fixture_path.parent().unwrap_or_else(|| Path::new("."));
    validate_replay_fixture(&fixture, base_directory, catalog)
}

pub fn validate_replay_fixture(
    fixture: &ReplayFixture,
    base_directory: &Path,
    catalog: &MechanicsCatalog,
) -> Result<ReplayReport, ReplayError> {
    validate_fixture_structure(fixture)?;
    let mut reports = Vec::with_capacity(fixture.transitions.len());
    for transition in &fixture.transitions {
        reports.push(validate_transition(transition, base_directory, catalog)?);
    }
    Ok(ReplayReport {
        schema_version: REPLAY_SCHEMA_VERSION,
        fixture: fixture.name.clone(),
        passed: reports.iter().all(|report| report.passed),
        transition_count: reports.len(),
        transitions: reports,
    })
}

pub fn diff_observed_states(
    before: &SnapshotEnvelope,
    after: &SnapshotEnvelope,
) -> Vec<ObservationChange> {
    let before = observation_map(before);
    let after = observation_map(after);
    let fields = before
        .keys()
        .chain(after.keys())
        .cloned()
        .collect::<BTreeSet<_>>();
    fields
        .into_iter()
        .filter_map(|field| {
            let before_value = before.get(&field).cloned().unwrap_or(Value::Null);
            let after_value = after.get(&field).cloned().unwrap_or(Value::Null);
            (before_value != after_value).then_some(ObservationChange {
                field,
                before: before_value,
                after: after_value,
            })
        })
        .collect()
}

pub fn compare_predicted_state(
    predicted: &SimulationState,
    observed: &SnapshotEnvelope,
    remote_hp_tolerance_basis_points: i32,
) -> Vec<PredictionMismatch> {
    let mut mismatches = Vec::new();
    compare_value(
        &mut mismatches,
        "world.elapsed_turns",
        predicted.elapsed_turns,
        observed.state.world.elapsed_turns,
    );
    compare_value(
        &mut mismatches,
        "world.weather_md_id",
        predicted.world.weather_md_id,
        observed.state.world.weather_md_id,
    );
    compare_value(
        &mut mismatches,
        "world.weather_lifespan_turns",
        predicted.world.weather_lifespan_turns,
        observed.state.world.weather_lifespan_turns,
    );
    compare_value(
        &mut mismatches,
        "world.weather_elapsed_turns",
        predicted.world.weather_elapsed_turns,
        observed.state.world.weather_elapsed_turns,
    );
    compare_json_value(
        &mut mismatches,
        "world.field_effects",
        serde_json::to_value(&predicted.world.field_effects).unwrap_or(Value::Null),
        serde_json::to_value(&observed.state.world.field_effects).unwrap_or(Value::Null),
    );
    compare_json_value(
        &mut mismatches,
        "world.sides",
        world_sides_without_registrations(&predicted.world.sides),
        world_sides_without_registrations(&observed.state.world.sides),
    );

    for team in &observed.state.teams {
        for pokemon in &team.pokemon {
            let key = PokemonKey {
                team_index: team.team_index,
                group_index: pokemon.group_index,
            };
            let prefix = pokemon_prefix(key);
            let Some(simulated) = predicted.pokemon(key) else {
                mismatches.push(PredictionMismatch {
                    field: prefix,
                    predicted: Value::Null,
                    observed: json!({"species_id": pokemon.personal_id}),
                });
                continue;
            };
            compare_value(
                &mut mismatches,
                &format!("{prefix}.fainted"),
                simulated.fainted,
                pokemon.fainted,
            );
            compare_value(
                &mut mismatches,
                &format!("{prefix}.status_condition"),
                simulated.status_condition,
                pokemon.status_condition,
            );
            compare_value(
                &mut mismatches,
                &format!("{prefix}.ability_md_id"),
                simulated.ability_md_id,
                pokemon.ability_md_id,
            );
            if pokemon.item_md_id >= 0 {
                compare_json_value(
                    &mut mismatches,
                    &format!("{prefix}.item_md_id"),
                    serde_json::to_value(simulated.item_md_id.unwrap_or(0)).unwrap_or(Value::Null),
                    json!(pokemon.item_md_id),
                );
            }
            compare_json_value(
                &mut mismatches,
                &format!("{prefix}.position"),
                if pokemon.side_index >= 0 && pokemon.position_index >= 0 {
                    position_value(simulated.position)
                } else {
                    Value::Null
                },
                snapshot_position_value(pokemon),
            );
            compare_json_value(
                &mut mismatches,
                &format!("{prefix}.stat_stages"),
                serde_json::to_value(&simulated.stat_stages).unwrap_or(Value::Null),
                serde_json::to_value(&pokemon.stat_stages).unwrap_or(Value::Null),
            );
            if team.is_local_player {
                compare_value(
                    &mut mismatches,
                    &format!("{prefix}.current_hp"),
                    simulated.current_hp,
                    pokemon.current_hp,
                );
                compare_value(
                    &mut mismatches,
                    &format!("{prefix}.maximum_hp"),
                    simulated.maximum_hp(),
                    pokemon.max_hp,
                );
                for observed_move in &pokemon.moves {
                    match simulated
                        .moves
                        .iter()
                        .find(|entry| entry.slot_index == observed_move.slot_index)
                    {
                        Some(simulated_move) => {
                            compare_value(
                                &mut mismatches,
                                &format!("{prefix}.moves[{}].md_id", observed_move.slot_index),
                                simulated_move.md_id,
                                observed_move.md_id,
                            );
                            compare_value(
                                &mut mismatches,
                                &format!("{prefix}.moves[{}].current_pp", observed_move.slot_index),
                                simulated_move.current_pp,
                                observed_move.current_pp,
                            );
                        }
                        None => mismatches.push(PredictionMismatch {
                            field: format!("{prefix}.moves[{}]", observed_move.slot_index),
                            predicted: Value::Null,
                            observed: serde_json::to_value(observed_move).unwrap_or(Value::Null),
                        }),
                    }
                }
            } else {
                if pokemon.side_index < 0 || pokemon.position_index < 0 {
                    continue;
                }
                let predicted_ratio =
                    hp_ratio_basis_points(simulated.current_hp, simulated.maximum_hp());
                if (predicted_ratio - pokemon.raw_hp_ratio).abs()
                    > remote_hp_tolerance_basis_points.max(0)
                {
                    mismatches.push(PredictionMismatch {
                        field: format!("{prefix}.hp_ratio_basis_points"),
                        predicted: json!(predicted_ratio),
                        observed: json!(pokemon.raw_hp_ratio),
                    });
                }
            }
        }
    }
    mismatches
}

fn validate_fixture_structure(fixture: &ReplayFixture) -> Result<(), ReplayError> {
    if fixture.schema_version != REPLAY_SCHEMA_VERSION {
        return Err(ReplayError::InvalidFixture(format!(
            "unsupported schema version {}; expected {REPLAY_SCHEMA_VERSION}",
            fixture.schema_version
        )));
    }
    if fixture.name.trim().is_empty() {
        return Err(ReplayError::InvalidFixture(
            "fixture name must not be empty".to_owned(),
        ));
    }
    if fixture.transitions.is_empty() {
        return Err(ReplayError::InvalidFixture(
            "fixture must contain at least one transition".to_owned(),
        ));
    }
    let mut labels = BTreeSet::new();
    for transition in &fixture.transitions {
        if transition.label.trim().is_empty() {
            return Err(ReplayError::InvalidFixture(
                "transition label must not be empty".to_owned(),
            ));
        }
        if !labels.insert(transition.label.as_str()) {
            return Err(ReplayError::InvalidFixture(format!(
                "duplicate transition label {}",
                transition.label
            )));
        }
        if transition.before.trim().is_empty() || transition.after.trim().is_empty() {
            return Err(ReplayError::InvalidFixture(format!(
                "transition {} must name before and after snapshots",
                transition.label
            )));
        }
        if transition.expected_turn_delta < 0 {
            return Err(ReplayError::InvalidFixture(format!(
                "transition {} has negative expected_turn_delta",
                transition.label
            )));
        }
        let mut expected_fields = BTreeSet::new();
        for expectation in &transition.expected_changes {
            if expectation.field.trim().is_empty() {
                return Err(ReplayError::InvalidFixture(format!(
                    "transition {} has an empty expected field",
                    transition.label
                )));
            }
            if !expected_fields.insert(expectation.field.as_str()) {
                return Err(ReplayError::InvalidFixture(format!(
                    "transition {} repeats expected field {}",
                    transition.label, expectation.field
                )));
            }
        }
    }
    Ok(())
}

fn validate_transition(
    transition: &ReplayTransition,
    base_directory: &Path,
    catalog: &MechanicsCatalog,
) -> Result<ReplayTransitionReport, ReplayError> {
    let before_path = resolve_relative(base_directory, &transition.before);
    let after_path = resolve_relative(base_directory, &transition.after);
    let before = read_snapshot(&before_path)?;
    let after = read_snapshot(&after_path)?;
    let changes = diff_observed_states(&before, &after);
    let mut errors = Vec::new();
    if before.source != after.source {
        errors.push("before and after snapshots have different source identities".to_owned());
    }
    let actual_turn_delta = after.state.world.elapsed_turns - before.state.world.elapsed_turns;
    if actual_turn_delta != transition.expected_turn_delta {
        errors.push(format!(
            "turn delta is {actual_turn_delta}; expected {}",
            transition.expected_turn_delta
        ));
    }
    errors.extend(validate_action_evidence(
        &transition.actions,
        &before,
        &after,
        catalog,
    ));
    errors.extend(validate_expected_changes(
        &transition.expected_changes,
        &changes,
    ));
    let prediction = match &transition.prediction {
        Some(prediction) => {
            validate_prediction(prediction, base_directory, &before, &after, catalog)
        }
        None => PredictionReport {
            status: PredictionStatus::NotConfigured,
            successor_count: 0,
            matched_branch_index: None,
            matched_probability: None,
            nearest_branch_index: None,
            nearest_branch_probability: None,
            mismatches: Vec::new(),
            message: if transition.expected_blockers.is_empty() {
                "observation-only transition".to_owned()
            } else {
                format!(
                    "prediction intentionally omitted; blockers: {}",
                    transition.expected_blockers.join(", ")
                )
            },
        },
    };
    let prediction_passed = matches!(
        prediction.status,
        PredictionStatus::NotConfigured | PredictionStatus::Matched
    );
    Ok(ReplayTransitionReport {
        label: transition.label.clone(),
        before_state_hash: before.state_hash,
        after_state_hash: after.state_hash,
        before_turn: before.state.world.elapsed_turns,
        after_turn: after.state.world.elapsed_turns,
        passed: errors.is_empty() && prediction_passed,
        action_evidence_count: transition.actions.len(),
        observation_change_count: changes.len(),
        observation_changes: changes,
        errors,
        expected_blockers: transition.expected_blockers.clone(),
        prediction,
    })
}

fn validate_action_evidence(
    actions: &[ReplayActionEvidence],
    before: &SnapshotEnvelope,
    after: &SnapshotEnvelope,
    catalog: &MechanicsCatalog,
) -> Vec<String> {
    let mut errors = Vec::new();
    for (index, evidence) in actions.iter().enumerate() {
        let label = format!("action evidence {index} for {:?}", evidence.actor);
        let before_pokemon = snapshot_pokemon(&before.state, evidence.actor);
        let after_pokemon = snapshot_pokemon(&after.state, evidence.actor);
        if before_pokemon.is_none() && after_pokemon.is_none() {
            errors.push(format!("{label} references a missing actor"));
            continue;
        }
        match &evidence.action {
            ReplayActionKind::UseMove {
                md_id,
                target,
                replacement,
                mega,
            } => {
                if catalog.move_by_num(*md_id).is_none() {
                    errors.push(format!("{label} references unknown move {md_id}"));
                }
                if let Some(actor) = before_pokemon.or(after_pokemon) {
                    if actor.is_local_team
                        && !actor.moves.is_empty()
                        && !actor.moves.iter().any(|entry| entry.md_id == *md_id)
                    {
                        errors.push(format!(
                            "{label} move {md_id} is absent from the observed local move set"
                        ));
                    }
                    if *mega && !actor.can_mega && !actor.mega_mode {
                        errors.push(format!("{label} records Mega for an ineligible actor"));
                    }
                }
                if let Some(ActionTarget::Pokemon { key }) = target
                    && snapshot_pokemon(&before.state, *key).is_none()
                    && snapshot_pokemon(&after.state, *key).is_none()
                {
                    errors.push(format!("{label} references a missing target {key:?}"));
                }
                if let Some(replacement) = replacement {
                    if replacement.team_index != evidence.actor.team_index {
                        errors.push(format!("{label} pivots across team boundaries"));
                    }
                    if snapshot_pokemon(&before.state, *replacement).is_none()
                        && snapshot_pokemon(&after.state, *replacement).is_none()
                    {
                        errors.push(format!(
                            "{label} references missing pivot replacement {replacement:?}"
                        ));
                    }
                }
                if evidence.provenance == ReplayEvidenceProvenance::LocalPpDelta {
                    match (before_pokemon, after_pokemon) {
                        (Some(before_actor), Some(after_actor)) if before_actor.is_local_team => {
                            let before_pp = move_pp(before_actor, *md_id);
                            let after_pp = move_pp(after_actor, *md_id);
                            if !matches!((before_pp, after_pp), (Some(left), Some(right)) if left - right == 1)
                            {
                                errors.push(format!(
                                    "{label} claims local_pp_delta but PP changed from {before_pp:?} to {after_pp:?}"
                                ));
                            }
                        }
                        _ => errors.push(format!(
                            "{label} uses local_pp_delta without a local actor in both snapshots"
                        )),
                    }
                }
            }
            ReplayActionKind::Switch { replacement } => {
                if replacement.team_index != evidence.actor.team_index {
                    errors.push(format!("{label} switches across team boundaries"));
                }
                if snapshot_pokemon(&before.state, *replacement).is_none()
                    && snapshot_pokemon(&after.state, *replacement).is_none()
                {
                    errors.push(format!(
                        "{label} references missing replacement {replacement:?}"
                    ));
                }
            }
            ReplayActionKind::Unknown { description } => {
                if description.trim().is_empty() {
                    errors.push(format!("{label} has an empty unknown-action description"));
                }
            }
        }
    }
    errors
}

fn validate_expected_changes(
    expected: &[ExpectedObservationChange],
    observed: &[ObservationChange],
) -> Vec<String> {
    let observed = observed
        .iter()
        .map(|change| (change.field.as_str(), change))
        .collect::<BTreeMap<_, _>>();
    expected
        .iter()
        .filter_map(
            |expectation| match observed.get(expectation.field.as_str()) {
                Some(change)
                    if change.before == expectation.before && change.after == expectation.after =>
                {
                    None
                }
                Some(change) => Some(format!(
                    "expected {} to change from {} to {}, observed {} to {}",
                    expectation.field,
                    expectation.before,
                    expectation.after,
                    change.before,
                    change.after
                )),
                None => Some(format!(
                    "expected change {} was not observed",
                    expectation.field
                )),
            },
        )
        .collect()
}

fn validate_prediction(
    prediction: &ReplayPrediction,
    base_directory: &Path,
    before: &SnapshotEnvelope,
    after: &SnapshotEnvelope,
    catalog: &MechanicsCatalog,
) -> PredictionReport {
    match resolve_prediction(prediction, base_directory, before, after, catalog) {
        Ok(report) => report,
        Err(message) => PredictionReport {
            status: PredictionStatus::Blocked,
            successor_count: 0,
            matched_branch_index: None,
            matched_probability: None,
            nearest_branch_index: None,
            nearest_branch_probability: None,
            mismatches: Vec::new(),
            message,
        },
    }
}

fn resolve_prediction(
    prediction: &ReplayPrediction,
    base_directory: &Path,
    before: &SnapshotEnvelope,
    after: &SnapshotEnvelope,
    catalog: &MechanicsCatalog,
) -> Result<PredictionReport, String> {
    if prediction.left_plan.team_index == prediction.right_plan.team_index {
        return Err("prediction plans must belong to different teams".to_owned());
    }
    let scenario_path = resolve_relative(base_directory, &prediction.scenario);
    let scenario_bytes =
        read_limited(&scenario_path, MAX_SCENARIO_BYTES).map_err(|error| error.to_string())?;
    let scenario: ScenarioOverlay = serde_json::from_slice(&scenario_bytes)
        .map_err(|error| format!("invalid scenario {}: {error}", scenario_path.display()))?;
    let normalized = crate::normalize_battle_state(before, &scenario, catalog)
        .map_err(|error| format!("state normalization failed: {error}"))?;
    let simulation = crate::materialize_simulation_state(&normalized, catalog)
        .map_err(|error| format!("exact-state materialization failed: {error}"))?;
    let simulation =
        apply_forced_replacements(&simulation, &prediction.initial_replacements, catalog)?;
    let domain = CoreBattleDomain::with_maximum_successor_branches(catalog, 262_144)
        .with_critical_hit_mode(prediction.critical_hit_mode);
    domain
        .validate_supported_state(&simulation)
        .map_err(|error| format!("core battle domain rejected state: {error}"))?;
    let successors = domain
        .resolve_turn(&simulation, &prediction.left_plan, &prediction.right_plan)
        .map_err(|error| format!("turn resolution failed: {error}"))?;
    if successors.is_empty() {
        return Err("turn resolution returned no successors".to_owned());
    }
    let mut nearest = None::<(usize, u64, Vec<PredictionMismatch>)>;
    for (index, successor) in successors.iter().enumerate() {
        let predicted_state =
            apply_forced_replacements(&successor.state, &prediction.forced_replacements, catalog)?;
        let mismatches = compare_predicted_state(
            &predicted_state,
            after,
            prediction.remote_hp_tolerance_basis_points,
        );
        if mismatches.is_empty() {
            return Ok(PredictionReport {
                status: PredictionStatus::Matched,
                successor_count: successors.len(),
                matched_branch_index: Some(index),
                matched_probability: Some(successor.probability),
                nearest_branch_index: Some(index),
                nearest_branch_probability: Some(successor.probability),
                mismatches: Vec::new(),
                message: "recorded state matched an exact engine successor".to_owned(),
            });
        }
        let candidate = (index, mismatch_score(&mismatches), mismatches);
        if nearest
            .as_ref()
            .is_none_or(|(_, score, _)| candidate.1 < *score)
        {
            nearest = Some(candidate);
        }
    }
    let (nearest_index, _, mismatches) = nearest.expect("successor list was checked as non-empty");
    Ok(PredictionReport {
        status: PredictionStatus::Mismatch,
        successor_count: successors.len(),
        matched_branch_index: None,
        matched_probability: None,
        nearest_branch_index: Some(nearest_index),
        nearest_branch_probability: Some(successors[nearest_index].probability),
        message: format!(
            "no exact successor matched; nearest branch has {} mismatches",
            mismatches.len()
        ),
        mismatches,
    })
}

fn mismatch_score(mismatches: &[PredictionMismatch]) -> u64 {
    mismatches
        .iter()
        .map(|mismatch| {
            let importance = if mismatch.field.ends_with(".current_pp")
                || mismatch.field.ends_with(".fainted")
                || mismatch.field.ends_with(".position")
                || mismatch.field == "world.sides"
            {
                1_000
            } else if mismatch.field.ends_with(".current_hp")
                || mismatch.field.ends_with(".hp_ratio_basis_points")
            {
                100
            } else {
                10
            };
            let distance = match (&mismatch.predicted, &mismatch.observed) {
                (Value::Number(left), Value::Number(right)) => left
                    .as_i64()
                    .zip(right.as_i64())
                    .map_or(1, |(left, right)| left.abs_diff(right).min(1_000)),
                _ => 1,
            };
            importance * distance.max(1)
        })
        .sum()
}

fn apply_forced_replacements(
    state: &SimulationState,
    replacements: &[ReplayForcedReplacement],
    catalog: &MechanicsCatalog,
) -> Result<SimulationState, String> {
    let mut state = state.clone();
    for replacement in replacements {
        if state
            .pokemon(replacement.actor)
            .is_some_and(|pokemon| pokemon.position.is_none())
        {
            let position = replacement.position.ok_or_else(|| {
                format!(
                    "forced replacement actor {:?} has no retained or supplied position",
                    replacement.actor
                )
            })?;
            state
                .pokemon_mut(replacement.actor)
                .ok_or_else(|| format!("missing forced replacement actor {:?}", replacement.actor))?
                .position = Some(position);
        }
        let branches = execute_core_action(
            &state,
            &BattleAction::Switch {
                actor: replacement.actor,
                replacement: replacement.replacement,
            },
            &CoreExecutionContext::default(),
            catalog,
        )
        .map_err(|error| format!("forced replacement failed: {error}"))?;
        let [branch] = branches.as_slice() else {
            return Err(format!(
                "forced replacement {:?} -> {:?} produced {} branches",
                replacement.actor,
                replacement.replacement,
                branches.len()
            ));
        };
        state = branch.state.clone();
    }
    Ok(state)
}

fn observation_map(snapshot: &SnapshotEnvelope) -> BTreeMap<String, Value> {
    let state = &snapshot.state;
    let mut observations = BTreeMap::new();
    observations.insert("battle.available".to_owned(), json!(state.available));
    observations.insert("battle.battle_rule".to_owned(), json!(state.battle_rule));
    observations.insert("battle.battle_type".to_owned(), json!(state.battle_type));
    observations.insert(
        "world.elapsed_turns".to_owned(),
        json!(state.world.elapsed_turns),
    );
    observations.insert(
        "world.weather".to_owned(),
        json!({
            "md_id": state.world.weather_md_id,
            "lifespan_turns": state.world.weather_lifespan_turns,
            "elapsed_turns": state.world.weather_elapsed_turns,
        }),
    );
    observations.insert(
        "world.field_effects".to_owned(),
        serde_json::to_value(&state.world.field_effects).unwrap_or(Value::Null),
    );
    for side in &state.world.sides {
        observations.insert(
            format!("side[{}].field_effects", side.side_index),
            serde_json::to_value(&side.field_effects).unwrap_or(Value::Null),
        );
        observations.insert(
            format!("side[{}].positions", side.side_index),
            serde_json::to_value(&side.positions).unwrap_or(Value::Null),
        );
    }
    for team in &state.teams {
        let team_prefix = format!("team[{}]", team.team_index);
        observations.insert(
            format!("{team_prefix}.pokemon_order"),
            json!(team.pokemon_order),
        );
        observations.insert(
            format!("{team_prefix}.selected_group_indices"),
            json!(team.selected_group_indices),
        );
        for pokemon in &team.pokemon {
            let key = PokemonKey {
                team_index: team.team_index,
                group_index: pokemon.group_index,
            };
            let prefix = pokemon_prefix(key);
            observations.insert(
                format!("{prefix}.species"),
                json!({"personal_id": pokemon.personal_id, "form_no": pokemon.form_no}),
            );
            observations.insert(
                format!("{prefix}.position"),
                snapshot_position_value(pokemon),
            );
            observations.insert(
                format!("{prefix}.authoritative_hp"),
                authoritative_hp_value(team.is_local_player, pokemon),
            );
            observations.insert(format!("{prefix}.fainted"), json!(pokemon.fainted));
            observations.insert(
                format!("{prefix}.status_condition"),
                json!(pokemon.status_condition),
            );
            observations.insert(
                format!("{prefix}.ability_md_id"),
                if pokemon.ability_md_id > 0 {
                    json!(pokemon.ability_md_id)
                } else {
                    json!("unknown")
                },
            );
            observations.insert(
                format!("{prefix}.item_md_id"),
                if team.is_local_player || pokemon.item_md_id >= 0 {
                    json!(pokemon.item_md_id)
                } else {
                    json!("unknown")
                },
            );
            observations.insert(
                format!("{prefix}.mega"),
                json!({
                    "can_mega": pokemon.can_mega,
                    "mega_locked": pokemon.mega_locked,
                    "mega_mode": pokemon.mega_mode,
                }),
            );
            observations.insert(
                format!("{prefix}.stat_stages"),
                serde_json::to_value(&pokemon.stat_stages).unwrap_or(Value::Null),
            );
            observations.insert(
                format!("{prefix}.volatile_effects"),
                serde_json::to_value(&pokemon.volatile_effects).unwrap_or(Value::Null),
            );
            observations.insert(
                format!("{prefix}.field_effects"),
                serde_json::to_value(&pokemon.field_effects).unwrap_or(Value::Null),
            );
            if team.is_local_player || !pokemon.moves.is_empty() {
                let mut moves = pokemon.moves.clone();
                moves.sort_by_key(|entry| entry.slot_index);
                observations.insert(
                    format!("{prefix}.moves"),
                    serde_json::to_value(moves).unwrap_or(Value::Null),
                );
            } else {
                observations.insert(format!("{prefix}.moves"), json!("unknown"));
            }
        }
    }
    observations
}

fn authoritative_hp_value(is_local: bool, pokemon: &PokemonSnapshot) -> Value {
    if pokemon.fainted {
        return json!({"kind": "fainted"});
    }
    if is_local && pokemon.max_hp > 0 {
        return json!({
            "kind": "exact",
            "current": pokemon.current_hp,
            "maximum": pokemon.max_hp,
        });
    }
    if !is_local && (0..=10_000).contains(&pokemon.raw_hp_ratio) {
        return json!({
            "kind": "ratio_basis_points",
            "basis_points": pokemon.raw_hp_ratio,
        });
    }
    json!({"kind": "unknown"})
}

fn validate_expected_snapshot(
    snapshot: &[u8],
    path: &Path,
) -> Result<SnapshotEnvelope, ReplayError> {
    parse_and_validate_snapshot(snapshot).map_err(|error| {
        ReplayError::InvalidFixture(format!("snapshot {} was rejected: {error}", path.display()))
    })
}

fn read_snapshot(path: &Path) -> Result<SnapshotEnvelope, ReplayError> {
    let bytes = read_limited(path, 2 * 1024 * 1024)?;
    validate_expected_snapshot(&bytes, path)
}

fn read_limited(path: &Path, maximum: usize) -> Result<Vec<u8>, ReplayError> {
    let bytes = fs::read(path).map_err(|error| ReplayError::CouldNotRead {
        path: path.to_path_buf(),
        message: error.to_string(),
    })?;
    if bytes.len() > maximum {
        return Err(ReplayError::FixtureTooLarge {
            actual: bytes.len(),
            maximum,
        });
    }
    Ok(bytes)
}

fn resolve_relative(base_directory: &Path, value: &str) -> PathBuf {
    let path = Path::new(value);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        base_directory.join(path)
    }
}

fn snapshot_pokemon(state: &BattleStateSnapshot, key: PokemonKey) -> Option<&PokemonSnapshot> {
    state
        .teams
        .iter()
        .find(|team| team.team_index == key.team_index)
        .and_then(|team| {
            team.pokemon
                .iter()
                .find(|pokemon| pokemon.group_index == key.group_index)
        })
}

fn move_pp(pokemon: &PokemonSnapshot, md_id: i32) -> Option<i32> {
    pokemon
        .moves
        .iter()
        .find(|entry| entry.md_id == md_id)
        .map(|entry| entry.current_pp)
}

fn pokemon_prefix(key: PokemonKey) -> String {
    format!("pokemon[{}/{}]", key.team_index, key.group_index)
}

fn position_value(position: Option<BattlePosition>) -> Value {
    position.map_or(Value::Null, |position| {
        json!({
            "side_index": position.side_index,
            "position_index": position.position_index,
        })
    })
}

fn snapshot_position_value(pokemon: &PokemonSnapshot) -> Value {
    if pokemon.side_index >= 0 && pokemon.position_index >= 0 {
        json!({
            "side_index": pokemon.side_index,
            "position_index": pokemon.position_index,
        })
    } else {
        Value::Null
    }
}

fn hp_ratio_basis_points(current: i32, maximum: i32) -> i32 {
    if current <= 0 || maximum <= 0 {
        return 0;
    }
    let numerator = i64::from(current) * 10_000;
    let rounded = (numerator + i64::from(maximum) / 2) / i64::from(maximum);
    rounded.clamp(0, 10_000) as i32
}

fn compare_value<T>(mismatches: &mut Vec<PredictionMismatch>, field: &str, left: T, right: T)
where
    T: Serialize + PartialEq,
{
    if left != right {
        mismatches.push(PredictionMismatch {
            field: field.to_owned(),
            predicted: serde_json::to_value(left).unwrap_or(Value::Null),
            observed: serde_json::to_value(right).unwrap_or(Value::Null),
        });
    }
}

fn compare_json_value(
    mismatches: &mut Vec<PredictionMismatch>,
    field: &str,
    predicted: Value,
    observed: Value,
) {
    if predicted != observed {
        mismatches.push(PredictionMismatch {
            field: field.to_owned(),
            predicted,
            observed,
        });
    }
}

fn world_sides_without_registrations(sides: &[crate::SideSnapshot]) -> Value {
    let mut sides = sides.to_vec();
    for side in &mut sides {
        for position in &mut side.positions {
            position.registered_group_index = None;
            position.registered_user_index = None;
        }
    }
    serde_json::to_value(sides).unwrap_or(Value::Null)
}

const fn default_turn_delta() -> i32 {
    1
}

const fn default_remote_hp_tolerance() -> i32 {
    1
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        BasePoints, BattleAction, BattleStats, MoveSnapshot, OpponentObservability, SimulationMove,
        SimulationPokemon, SimulationTeam, SourceIdentity, StatStages, TeamSnapshot,
        TrainingPoints, WorldSnapshot,
    };

    fn source() -> SourceIdentity {
        SourceIdentity {
            bundle_id: crate::SUPPORTED_BUNDLE_ID.to_owned(),
            app_version: crate::SUPPORTED_APP_VERSION.to_owned(),
            app_build: crate::SUPPORTED_APP_BUILD.to_owned(),
            unity_framework_sha256: crate::SUPPORTED_UNITY_FRAMEWORK_SHA256.to_owned(),
            unity_framework_uuid: crate::SUPPORTED_UNITY_FRAMEWORK_UUID.to_owned(),
            offset_profile: crate::SUPPORTED_OFFSET_PROFILE.to_owned(),
        }
    }

    fn snapshot(turn: i32, local_hp: i32, remote_ratio: i32, local_pp: i32) -> SnapshotEnvelope {
        SnapshotEnvelope {
            schema_version: 1,
            captured_at: format!("2026-07-15T17:00:0{turn}.000Z"),
            state_hash: format!("{turn:016x}"),
            source: source(),
            state: BattleStateSnapshot {
                available: true,
                local_team_index: 0,
                world: WorldSnapshot {
                    elapsed_turns: turn,
                    ..WorldSnapshot::default()
                },
                teams: vec![
                    TeamSnapshot {
                        is_local_player: true,
                        team_index: 0,
                        pokemon: vec![PokemonSnapshot {
                            personal_id: 504,
                            is_local_team: true,
                            group_index: 0,
                            side_index: 0,
                            position_index: 1,
                            max_hp: 100,
                            current_hp: local_hp,
                            raw_hp_ratio: local_hp * 100,
                            item_md_id: 0,
                            ability_md_id: 50,
                            base_points: Some(BasePoints::default()),
                            moves: vec![MoveSnapshot {
                                md_id: 33,
                                slot_index: 0,
                                current_pp: local_pp,
                                max_pp: 35,
                                ..MoveSnapshot::default()
                            }],
                            ..PokemonSnapshot::default()
                        }],
                        ..TeamSnapshot::default()
                    },
                    TeamSnapshot {
                        team_index: 1,
                        pokemon: vec![PokemonSnapshot {
                            personal_id: 504,
                            group_index: 0,
                            side_index: 1,
                            position_index: 1,
                            max_hp: 999,
                            current_hp: 999,
                            raw_hp_ratio: remote_ratio,
                            item_md_id: -1,
                            ability_md_id: 50,
                            ..PokemonSnapshot::default()
                        }],
                        ..TeamSnapshot::default()
                    },
                ],
                opponent_observability: OpponentObservability {
                    remote_pokemon: 1,
                    remote_with_abilities: 1,
                    ..OpponentObservability::default()
                },
                ..BattleStateSnapshot::default()
            },
        }
    }

    #[test]
    fn observed_diff_uses_exact_local_hp_and_remote_ratio() {
        let changes =
            diff_observed_states(&snapshot(0, 100, 10_000, 35), &snapshot(1, 72, 6_500, 34));
        let fields = changes
            .iter()
            .map(|change| change.field.as_str())
            .collect::<BTreeSet<_>>();
        assert!(fields.contains("pokemon[0/0].authoritative_hp"));
        assert!(fields.contains("pokemon[1/0].authoritative_hp"));
        assert!(fields.contains("pokemon[0/0].moves"));
        assert!(!fields.contains("pokemon[1/0].current_hp"));
    }

    #[test]
    fn local_pp_delta_evidence_requires_one_spent_pp() {
        let catalog = crate::load_mechanics_pack(
            include_bytes!("../data/champions-mechanics-v1.json"),
            include_bytes!("../data/champions-mechanics-v1.json.sha256"),
        )
        .unwrap();
        let action = ReplayActionEvidence {
            actor: PokemonKey {
                team_index: 0,
                group_index: 0,
            },
            action: ReplayActionKind::UseMove {
                md_id: 33,
                target: Some(ActionTarget::Pokemon {
                    key: PokemonKey {
                        team_index: 1,
                        group_index: 0,
                    },
                }),
                replacement: None,
                mega: false,
            },
            provenance: ReplayEvidenceProvenance::LocalPpDelta,
            notes: Vec::new(),
        };
        let errors = validate_action_evidence(
            &[action],
            &snapshot(0, 100, 10_000, 35),
            &snapshot(1, 100, 10_000, 34),
            &catalog,
        );
        assert!(errors.is_empty(), "{errors:?}");
    }

    #[test]
    fn prediction_comparison_ignores_stale_remote_numeric_hp() {
        let observed = snapshot(1, 72, 6_500, 34);
        let simulation = SimulationState {
            source_state_hash: "before".to_owned(),
            battle_rule: 0,
            battle_type: 0,
            battle_stage_md_id: 0,
            local_team_index: 0,
            elapsed_turns: 1,
            world: WorldSnapshot {
                elapsed_turns: 1,
                ..WorldSnapshot::default()
            },
            teams: vec![
                SimulationTeam {
                    team_index: 0,
                    is_local_player: true,
                    pokemon_order: vec![0],
                    pokemon: vec![simulation_pokemon(0, 72, 100, 34)],
                },
                SimulationTeam {
                    team_index: 1,
                    is_local_player: false,
                    pokemon_order: vec![0],
                    pokemon: vec![simulation_pokemon(1, 65, 100, 35)],
                },
            ],
        };
        let mismatches = compare_predicted_state(&simulation, &observed, 1);
        assert!(mismatches.is_empty(), "{mismatches:?}");
    }

    #[test]
    fn prediction_resolver_matches_an_exact_successor_branch() {
        let catalog = crate::load_mechanics_pack(
            include_bytes!("../data/champions-mechanics-v1.json"),
            include_bytes!("../data/champions-mechanics-v1.json.sha256"),
        )
        .unwrap();
        let before = exact_prediction_snapshot();
        let scenario = json!({
            "teams": [{ "team_index": 1, "pokemon_order": [0] }],
            "pokemon": [{
                "key": { "team_index": 1, "group_index": 0 },
                "species_id": "patrat",
                "exact_hp": { "current": 120, "maximum": 120 },
                "item_md_id": 0,
                "ability_md_id": 50,
                "training_points": {
                    "hp": 0, "attack": 0, "defense": 0,
                    "special_attack": 0, "special_defense": 0, "speed": 0
                },
                "nature_id": "hardy",
                "moves": [{
                    "md_id": 33, "slot_index": 0,
                    "current_pp": 35, "max_pp": 35
                }]
            }]
        });
        let scenario_overlay: ScenarioOverlay = serde_json::from_value(scenario.clone()).unwrap();
        let normalized =
            crate::normalize_battle_state(&before, &scenario_overlay, &catalog).unwrap();
        let simulation = crate::materialize_simulation_state(&normalized, &catalog).unwrap();
        let left_plan = tackle_plan(0, 1);
        let right_plan = tackle_plan(1, 0);
        let domain = CoreBattleDomain::new(&catalog).with_critical_hit_mode(CriticalHitMode::Never);
        let successors = domain
            .resolve_turn(&simulation, &left_plan, &right_plan)
            .unwrap();
        let mut observed_after = before.clone();
        apply_simulation_to_observed_snapshot(&successors[0].state, &mut observed_after);

        let directory = std::env::temp_dir().join(format!(
            "champions-advisor-replay-prediction-{}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            directory.join("scenario.json"),
            serde_json::to_vec_pretty(&scenario).unwrap(),
        )
        .unwrap();
        let report = resolve_prediction(
            &ReplayPrediction {
                scenario: "scenario.json".to_owned(),
                left_plan,
                right_plan,
                remote_hp_tolerance_basis_points: 1,
                critical_hit_mode: CriticalHitMode::Never,
                forced_replacements: Vec::new(),
                initial_replacements: Vec::new(),
            },
            &directory,
            &before,
            &observed_after,
            &catalog,
        )
        .unwrap();
        fs::remove_dir_all(directory).unwrap();
        assert_eq!(report.status, PredictionStatus::Matched);
        assert!(report.mismatches.is_empty());
        assert!(report.successor_count > 0);
    }

    fn exact_prediction_snapshot() -> SnapshotEnvelope {
        let mut value = snapshot(0, 120, 10_000, 35);
        value.state.battle_rule = 5;
        value.state.battle_type = 1;
        value.state.teams[0].pokemon_order = vec![0];
        value.state.teams[0].selected_group_indices = vec![0];
        value.state.teams[0].pokemon[0].side_index = 0;
        value.state.teams[0].pokemon[0].position_index = 0;
        value.state.teams[0].pokemon[0].max_hp = 120;
        value.state.teams[0].pokemon[0].current_hp = 120;
        value.state.teams[0].pokemon[0].raw_hp_ratio = 10_000;
        value.state.teams[0].pokemon[0].item_md_id = 0;
        value.state.teams[0].pokemon[0].nature_correction_md_id = 0;
        value.state.teams[0].pokemon[0].base_points = Some(BasePoints::default());
        value.state.teams[1].selected_group_indices = vec![0];
        value.state.teams[1].pokemon[0].side_index = 1;
        value.state.teams[1].pokemon[0].position_index = 0;
        value.state.teams[1].pokemon[0].max_hp = 120;
        value.state.teams[1].pokemon[0].current_hp = 120;
        value.state.teams[1].pokemon[0].ability_md_id = 50;
        value
    }

    fn tackle_plan(team_index: i32, target_team_index: i32) -> SideJointPlan {
        SideJointPlan {
            team_index,
            actions: vec![BattleAction::UseMove {
                actor: PokemonKey {
                    team_index,
                    group_index: 0,
                },
                md_id: 33,
                slot_index: Some(0),
                target: ActionTarget::Pokemon {
                    key: PokemonKey {
                        team_index: target_team_index,
                        group_index: 0,
                    },
                },
                replacement: None,
                mega: false,
            }],
        }
    }

    fn apply_simulation_to_observed_snapshot(
        simulation: &SimulationState,
        observed: &mut SnapshotEnvelope,
    ) {
        observed.state.world = simulation.world.clone();
        for simulation_team in &simulation.teams {
            let observed_team = observed
                .state
                .teams
                .iter_mut()
                .find(|team| team.team_index == simulation_team.team_index)
                .unwrap();
            for simulated in &simulation_team.pokemon {
                let pokemon = observed_team
                    .pokemon
                    .iter_mut()
                    .find(|pokemon| pokemon.group_index == simulated.key.group_index)
                    .unwrap();
                pokemon.fainted = simulated.fainted;
                pokemon.status_condition = simulated.status_condition;
                pokemon.ability_md_id = simulated.ability_md_id;
                pokemon.stat_stages = simulated.stat_stages.clone();
                match simulated.position {
                    Some(position) => {
                        pokemon.side_index = position.side_index;
                        pokemon.position_index = position.position_index;
                    }
                    None => {
                        pokemon.side_index = -1;
                        pokemon.position_index = -1;
                    }
                }
                if observed_team.is_local_player {
                    pokemon.current_hp = simulated.current_hp;
                    pokemon.max_hp = simulated.maximum_hp();
                    for observed_move in &mut pokemon.moves {
                        let simulated_move = simulated
                            .moves
                            .iter()
                            .find(|entry| entry.slot_index == observed_move.slot_index)
                            .unwrap();
                        observed_move.current_pp = simulated_move.current_pp;
                    }
                } else {
                    pokemon.raw_hp_ratio =
                        hp_ratio_basis_points(simulated.current_hp, simulated.maximum_hp());
                }
            }
        }
    }

    fn simulation_pokemon(
        team_index: i32,
        current_hp: i32,
        maximum_hp: i32,
        pp: i32,
    ) -> SimulationPokemon {
        SimulationPokemon {
            key: PokemonKey {
                team_index,
                group_index: 0,
            },
            species_id: "patrat".to_owned(),
            form_no: 0,
            item_md_id: Some(0),
            ability_md_id: 50,
            nature_id: "hardy".to_owned(),
            training_points: TrainingPoints::default(),
            stats: BattleStats {
                hp: maximum_hp,
                attack: 1,
                defense: 1,
                special_attack: 1,
                special_defense: 1,
                speed: 1,
            },
            current_hp,
            status_condition: 0,
            fainted: false,
            stat_stages: StatStages::default(),
            types: vec!["Normal".to_owned()],
            substitute: false,
            can_mega: false,
            mega_mode: false,
            position: Some(BattlePosition {
                side_index: team_index,
                position_index: 1,
            }),
            moves: vec![SimulationMove {
                md_id: 33,
                slot_index: 0,
                current_pp: pp,
                max_pp: 35,
                locked: false,
            }],
            volatile_effects: Vec::new(),
            field_effects: Vec::new(),
        }
    }
}
