use champions_advisor_protocol::{
    ActionTarget, BattleAction, CoreBattleDomain, CoreExecutionContext, CriticalHitMode,
    MechanicsCatalog, ReplayForcedReplacement, ScenarioOverlay, SearchDomain, SearchLimits,
    SideJointPlan, SnapshotEnvelope, build_exact_scenario, execute_core_action,
    load_mechanics_pack, materialize_simulation_state, normalize_battle_state,
    parse_and_validate_snapshot, parse_exact_scenario_sheet, search_best_plan_with_progress,
    validate_replay_fixture_path,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::Path;
use std::process::ExitCode;

const MECHANICS_PACK: &[u8] = include_bytes!("../data/champions-mechanics-v1.json");
const MECHANICS_CHECKSUM: &[u8] = include_bytes!("../data/champions-mechanics-v1.json.sha256");
const MAX_SCENARIO_BYTES: usize = 256 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActionOutput {
    state_hash: String,
    team_index: i32,
    joint_plan_count: usize,
    joint_plans: Vec<champions_advisor_protocol::SideJointPlan>,
}

#[derive(Debug, Serialize)]
struct LabeledPlan {
    label: String,
    plan: SideJointPlan,
}

#[derive(Debug, Serialize)]
struct RecommendationOutput {
    schema_version: u32,
    state_hash: String,
    engine: &'static str,
    status: &'static str,
    summary: String,
    best_plan: LabeledPlan,
    worst_case_reply: LabeledPlan,
    principal_variation: Vec<LabeledVariationStep>,
    score: i64,
    depth: u8,
    nodes: u64,
    chance_nodes: u64,
    transposition_hits: u64,
    maximin_cutoffs: u64,
    elapsed_ms: u128,
}

#[derive(Debug, Serialize)]
struct LabeledVariationStep {
    turn_offset: usize,
    depth_remaining: u8,
    score: i64,
    perspective_plan: LabeledPlan,
    opponent_reply: LabeledPlan,
    representative_probability: champions_advisor_protocol::ExactProbability,
}

#[derive(Debug, Deserialize)]
struct ResolveTurnInput {
    left_plan: SideJointPlan,
    right_plan: SideJointPlan,
    #[serde(default)]
    critical_hit_mode: CriticalHitMode,
}

fn main() -> ExitCode {
    match run(env::args_os().collect()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

fn run(arguments: Vec<OsString>) -> Result<(), String> {
    let executable = arguments
        .first()
        .and_then(|value| value.to_str())
        .unwrap_or("champions-advisor-protocol");
    let args = &arguments[1..];
    if args.first().is_some_and(|command| command == "recommend") {
        return recommend_command(&args[1..]);
    }
    match args {
        [snapshot_path] => validate_command(Path::new(snapshot_path)),
        [command, snapshot_path] if command == "validate" => {
            validate_command(Path::new(snapshot_path))
        }
        [command, snapshot_path, team_index] if command == "actions" => actions_command(
            Path::new(snapshot_path),
            parse_team_index(team_index)?,
            None,
        ),
        [command, snapshot_path, team_index, scenario_path] if command == "actions" => {
            actions_command(
                Path::new(snapshot_path),
                parse_team_index(team_index)?,
                scenario_path_or_none(scenario_path),
            )
        }
        [command, snapshot_path] if command == "materialize" => {
            materialize_command(Path::new(snapshot_path), None)
        }
        [command, fixture_path] if command == "replay" => replay_command(Path::new(fixture_path)),
        [command, snapshot_path, sheet_path] if command == "scenario" => {
            scenario_command(Path::new(snapshot_path), Path::new(sheet_path))
        }
        [command, snapshot_path, scenario_path] if command == "materialize" => materialize_command(
            Path::new(snapshot_path),
            scenario_path_or_none(scenario_path),
        ),
        [command, snapshot_path, scenario_path, plans_path] if command == "resolve" => {
            resolve_command(
                Path::new(snapshot_path),
                scenario_path_or_none(scenario_path),
                Path::new(plans_path),
            )
        }
        [
            command,
            snapshot_path,
            team_index,
            scenario_path,
            replacements_path,
        ] if command == "actions-after-replacements" => actions_after_replacements_command(
            Path::new(snapshot_path),
            parse_team_index(team_index)?,
            scenario_path_or_none(scenario_path),
            Path::new(replacements_path),
        ),
        _ => Err(format!(
            "usage:\n  {executable} SNAPSHOT\n  {executable} validate SNAPSHOT\n  {executable} scenario SNAPSHOT EXACT_SHEET\n  {executable} actions SNAPSHOT TEAM_INDEX [SCENARIO|-]\n  {executable} actions-after-replacements SNAPSHOT TEAM_INDEX SCENARIO|- REPLACEMENTS\n  {executable} materialize SNAPSHOT [SCENARIO|-]\n  {executable} resolve SNAPSHOT SCENARIO|- PLANS\n  {executable} recommend SNAPSHOT PERSPECTIVE_TEAM OPPONENT_TEAM SCENARIO|- [DEPTH] [NODES] [TIME_MS|none]\n  {executable} replay FIXTURE"
        )),
    }
}

fn actions_after_replacements_command(
    snapshot_path: &Path,
    team_index: i32,
    scenario_path: Option<&Path>,
    replacements_path: &Path,
) -> Result<(), String> {
    let snapshot = read_snapshot(snapshot_path)?;
    let scenario = read_scenario(scenario_path)?;
    let catalog = catalog()?;
    let normalized = normalize_battle_state(&snapshot, &scenario, &catalog)
        .map_err(|error| format!("state normalization failed: {error}"))?;
    let mut simulation = materialize_simulation_state(&normalized, &catalog)
        .map_err(|error| format!("state materialization failed: {error}"))?;
    let replacements: Vec<ReplayForcedReplacement> =
        serde_json::from_slice(&fs::read(replacements_path).map_err(|error| {
            format!(
                "could not read replacements {}: {error}",
                replacements_path.display()
            )
        })?)
        .map_err(|error| {
            format!(
                "invalid replacements {}: {error}",
                replacements_path.display()
            )
        })?;
    for replacement in replacements {
        if simulation
            .pokemon(replacement.actor)
            .is_some_and(|pokemon| pokemon.position.is_none())
        {
            let position = replacement.position.ok_or_else(|| {
                format!(
                    "replacement actor {:?} has no retained or supplied position",
                    replacement.actor
                )
            })?;
            simulation
                .pokemon_mut(replacement.actor)
                .ok_or_else(|| format!("missing replacement actor {:?}", replacement.actor))?
                .position = Some(position);
        }
        let mut branches = execute_core_action(
            &simulation,
            &BattleAction::Switch {
                actor: replacement.actor,
                replacement: replacement.replacement,
            },
            &CoreExecutionContext::default(),
            &catalog,
        )
        .map_err(|error| format!("replacement failed: {error}"))?;
        if branches.len() != 1 {
            return Err(format!("replacement produced {} branches", branches.len()));
        }
        simulation = branches.remove(0).state;
    }
    let joint_plans = CoreBattleDomain::new(&catalog)
        .legal_plans(&simulation, team_index)
        .map_err(|error| format!("core action generation failed: {error}"))?;
    write_json(&ActionOutput {
        state_hash: simulation.source_state_hash,
        team_index,
        joint_plan_count: joint_plans.len(),
        joint_plans,
    })
}

fn resolve_command(
    snapshot_path: &Path,
    scenario_path: Option<&Path>,
    plans_path: &Path,
) -> Result<(), String> {
    let snapshot = read_snapshot(snapshot_path)?;
    let scenario = read_scenario(scenario_path)?;
    let catalog = catalog()?;
    let normalized = normalize_battle_state(&snapshot, &scenario, &catalog)
        .map_err(|error| format!("state normalization failed: {error}"))?;
    let simulation = materialize_simulation_state(&normalized, &catalog)
        .map_err(|error| format!("state materialization failed: {error}"))?;
    let plans: ResolveTurnInput = serde_json::from_slice(
        &fs::read(plans_path)
            .map_err(|error| format!("could not read plans {}: {error}", plans_path.display()))?,
    )
    .map_err(|error| format!("invalid plans {}: {error}", plans_path.display()))?;
    let successors = CoreBattleDomain::with_maximum_successor_branches(&catalog, 262_144)
        .with_critical_hit_mode(plans.critical_hit_mode)
        .resolve_turn(&simulation, &plans.left_plan, &plans.right_plan)
        .map_err(|error| format!("turn resolution failed: {error}"))?;
    write_json(&successors)
}

fn scenario_command(snapshot_path: &Path, sheet_path: &Path) -> Result<(), String> {
    let snapshot = read_snapshot(snapshot_path)?;
    let sheet_bytes = fs::read(sheet_path).map_err(|error| {
        format!(
            "could not read exact sheet {}: {error}",
            sheet_path.display()
        )
    })?;
    let sheet = parse_exact_scenario_sheet(&sheet_bytes)
        .map_err(|error| format!("exact sheet rejected: {error}"))?;
    let overlay = build_exact_scenario(&snapshot, &sheet, &catalog()?)
        .map_err(|error| format!("could not build exact scenario: {error}"))?;
    write_json(&overlay)
}

fn replay_command(path: &Path) -> Result<(), String> {
    let catalog = catalog()?;
    let report = validate_replay_fixture_path(path, &catalog)
        .map_err(|error| format!("replay validation failed: {error}"))?;
    write_json(&report)?;
    if report.passed {
        Ok(())
    } else {
        Err(format!(
            "replay validation failed: {} of {} transitions passed",
            report
                .transitions
                .iter()
                .filter(|transition| transition.passed)
                .count(),
            report.transition_count
        ))
    }
}

fn recommend_command(args: &[OsString]) -> Result<(), String> {
    if !(4..=7).contains(&args.len()) {
        return Err("recommend requires SNAPSHOT, PERSPECTIVE_TEAM, OPPONENT_TEAM, SCENARIO|-, and optional DEPTH, NODES, TIME_MS|none".to_owned());
    }
    let snapshot_path = Path::new(&args[0]);
    let perspective_team = parse_team_index(&args[1])?;
    let opponent_team = parse_team_index(&args[2])?;
    if perspective_team == opponent_team {
        return Err("perspective and opponent team indices must differ".to_owned());
    }
    let scenario = read_scenario(scenario_path_or_none(&args[3]))?;
    let limits = SearchLimits {
        maximum_depth: args
            .get(4)
            .map(parse_u8)
            .transpose()?
            .unwrap_or(SearchLimits::default().maximum_depth),
        maximum_nodes: args
            .get(5)
            .map(parse_u64)
            .transpose()?
            .unwrap_or(SearchLimits::default().maximum_nodes),
        time_limit_ms: args
            .get(6)
            .map(parse_optional_time_limit)
            .transpose()?
            .unwrap_or(SearchLimits::default().time_limit_ms),
    };

    let snapshot = read_snapshot(snapshot_path)?;
    let catalog = catalog()?;
    let normalized = normalize_battle_state(&snapshot, &scenario, &catalog)
        .map_err(|error| format!("state normalization failed: {error}"))?;
    let simulation = materialize_simulation_state(&normalized, &catalog)
        .map_err(|error| format!("exact-state materialization failed: {error}"))?;
    let domain = CoreBattleDomain::new(&catalog);
    domain
        .validate_supported_state(&simulation)
        .map_err(|error| format!("core battle domain rejected state: {error}"))?;
    let progress_json = env::var_os("CHAMPIONS_PROGRESS_JSON").is_some();
    let result = search_best_plan_with_progress(
        &domain,
        &simulation,
        perspective_team,
        opponent_team,
        limits,
        |progress| {
            if progress_json && let Ok(json) = serde_json::to_string(&progress) {
                eprintln!("CHAMPIONS_PROGRESS {json}");
            }
        },
    )
    .map_err(|error| format!("search failed: {error}"))?;
    let best_label = plan_label(&result.best_plan, &catalog);
    let reply_label = plan_label(&result.worst_case_reply, &catalog);
    let principal_variation = result
        .principal_variation
        .iter()
        .enumerate()
        .map(|(turn_offset, step)| LabeledVariationStep {
            turn_offset,
            depth_remaining: step.depth_remaining,
            score: step.score,
            perspective_plan: LabeledPlan {
                label: plan_label(&step.perspective_plan, &catalog),
                plan: step.perspective_plan.clone(),
            },
            opponent_reply: LabeledPlan {
                label: plan_label(&step.opponent_reply, &catalog),
                plan: step.opponent_reply.clone(),
            },
            representative_probability: step.representative_probability,
        })
        .collect();
    write_json(&RecommendationOutput {
        schema_version: 1,
        state_hash: snapshot.state_hash,
        engine: "champions-native-core-v1",
        status: "ready",
        summary: format!("Best core plan: {best_label}"),
        best_plan: LabeledPlan {
            label: best_label,
            plan: result.best_plan,
        },
        worst_case_reply: LabeledPlan {
            label: reply_label,
            plan: result.worst_case_reply,
        },
        principal_variation,
        score: result.score,
        depth: result.statistics.completed_depth,
        nodes: result.statistics.nodes,
        chance_nodes: result.statistics.chance_nodes,
        transposition_hits: result.statistics.transposition_hits,
        maximin_cutoffs: result.statistics.maximin_cutoffs,
        elapsed_ms: result.statistics.elapsed_ms,
    })
}

fn validate_command(path: &Path) -> Result<(), String> {
    let snapshot = read_snapshot(path)?;
    let observability = &snapshot.state.opponent_observability;
    println!(
        "accepted hash={} available={} teams={} turn={} remote={} remote_moves={} remote_items={} remote_abilities={}",
        snapshot.state_hash,
        snapshot.state.available,
        snapshot.state.teams.len(),
        snapshot.state.world.elapsed_turns,
        observability.remote_pokemon,
        observability.remote_with_moves,
        observability.remote_with_items,
        observability.remote_with_abilities
    );
    Ok(())
}

fn actions_command(
    snapshot_path: &Path,
    team_index: i32,
    scenario_path: Option<&Path>,
) -> Result<(), String> {
    let snapshot = read_snapshot(snapshot_path)?;
    let scenario = read_scenario(scenario_path)?;
    let catalog = catalog()?;
    let state = normalize_battle_state(&snapshot, &scenario, &catalog)
        .map_err(|error| format!("state normalization failed: {error}"))?;
    let simulation = materialize_simulation_state(&state, &catalog)
        .map_err(|error| format!("state materialization failed: {error}"))?;
    let joint_plans = CoreBattleDomain::new(&catalog)
        .legal_plans(&simulation, team_index)
        .map_err(|error| format!("core action generation failed: {error}"))?;
    write_json(&ActionOutput {
        state_hash: state.source_state_hash,
        team_index,
        joint_plan_count: joint_plans.len(),
        joint_plans,
    })
}

fn materialize_command(snapshot_path: &Path, scenario_path: Option<&Path>) -> Result<(), String> {
    let snapshot = read_snapshot(snapshot_path)?;
    let scenario = read_scenario(scenario_path)?;
    let catalog = catalog()?;
    let state = normalize_battle_state(&snapshot, &scenario, &catalog)
        .map_err(|error| format!("state normalization failed: {error}"))?;
    let simulation = materialize_simulation_state(&state, &catalog)
        .map_err(|error| format!("exact-state materialization failed: {error}"))?;
    write_json(&simulation)
}

fn read_snapshot(path: &Path) -> Result<SnapshotEnvelope, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    parse_and_validate_snapshot(&bytes).map_err(|error| format!("snapshot rejected: {error}"))
}

fn read_scenario(path: Option<&Path>) -> Result<ScenarioOverlay, String> {
    let Some(path) = path else {
        return Ok(ScenarioOverlay::default());
    };
    let bytes = fs::read(path)
        .map_err(|error| format!("could not read scenario {}: {error}", path.display()))?;
    if bytes.len() > MAX_SCENARIO_BYTES {
        return Err(format!(
            "scenario is {} bytes; maximum is {MAX_SCENARIO_BYTES}",
            bytes.len()
        ));
    }
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("invalid scenario JSON in {}: {error}", path.display()))
}

fn catalog() -> Result<MechanicsCatalog, String> {
    load_mechanics_pack(MECHANICS_PACK, MECHANICS_CHECKSUM)
        .map_err(|error| format!("mechanics pack rejected: {error}"))
}

fn parse_team_index(value: &OsString) -> Result<i32, String> {
    value
        .to_str()
        .ok_or_else(|| "team index is not UTF-8".to_owned())?
        .parse::<i32>()
        .map_err(|error| format!("invalid team index: {error}"))
}

fn parse_u8(value: &OsString) -> Result<u8, String> {
    value
        .to_str()
        .ok_or_else(|| "numeric argument is not UTF-8".to_owned())?
        .parse::<u8>()
        .map_err(|error| format!("invalid depth: {error}"))
}

fn parse_u64(value: &OsString) -> Result<u64, String> {
    value
        .to_str()
        .ok_or_else(|| "numeric argument is not UTF-8".to_owned())?
        .parse::<u64>()
        .map_err(|error| format!("invalid positive integer: {error}"))
}

fn parse_optional_time_limit(value: &OsString) -> Result<Option<u64>, String> {
    if value == "none" {
        Ok(None)
    } else {
        parse_u64(value).map(Some)
    }
}

fn scenario_path_or_none(value: &OsString) -> Option<&Path> {
    (value != "-").then(|| Path::new(value))
}

fn write_json<T: Serialize>(value: &T) -> Result<(), String> {
    let output = serde_json::to_string_pretty(value)
        .map_err(|error| format!("could not encode output: {error}"))?;
    println!("{output}");
    Ok(())
}

fn plan_label(plan: &SideJointPlan, catalog: &MechanicsCatalog) -> String {
    if plan.actions.is_empty() {
        return "wait".to_owned();
    }
    plan.actions
        .iter()
        .map(|action| action_label(action, catalog))
        .collect::<Vec<_>>()
        .join(" + ")
}

fn action_label(action: &BattleAction, catalog: &MechanicsCatalog) -> String {
    let actor = action.actor();
    let actor_label = format!("T{}/P{}", actor.team_index, actor.group_index);
    match action {
        BattleAction::UseMove { md_id, target, .. } => {
            let name = catalog
                .move_by_num(*md_id)
                .map(|move_record| move_record.name.as_str())
                .unwrap_or("Unknown move");
            let target = match target {
                ActionTarget::Pokemon { key } => {
                    format!("T{}/P{}", key.team_index, key.group_index)
                }
                ActionTarget::Automatic => "automatic target".to_owned(),
            };
            format!("{actor_label}: {name} → {target}")
        }
        BattleAction::Switch { replacement, .. } => format!(
            "{actor_label}: switch → T{}/P{}",
            replacement.team_index, replacement.group_index
        ),
        BattleAction::Struggle { .. } => format!("{actor_label}: Struggle"),
        BattleAction::Automatic { .. } => format!("{actor_label}: automatic"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use champions_advisor_protocol::{
        SUPPORTED_APP_BUILD, SUPPORTED_APP_VERSION, SUPPORTED_BUNDLE_ID, SUPPORTED_OFFSET_PROFILE,
        SUPPORTED_UNITY_FRAMEWORK_SHA256, SUPPORTED_UNITY_FRAMEWORK_UUID, state_hash,
    };
    use serde_json::json;

    #[test]
    fn recommend_command_runs_from_snapshot_through_exact_search() {
        let state = json!({
            "available": true,
            "battle_rule": 5,
            "battle_type": 1,
            "battle_stage_md_id": 1,
            "local_team_index": 0,
            "world": { "elapsed_turns": 0 },
            "teams": [
                {
                    "is_local_player": true,
                    "team_index": 0,
                    "pokemon_order": [0],
                    "selected_group_indices": [0],
                    "pokemon": [{
                        "personal_id": 504,
                        "is_local_team": true,
                        "item_md_id": -1,
                        "ability_md_id": 50,
                        "group_index": 0,
                        "side_index": 0,
                        "position_index": 0,
                        "max_hp": 120,
                        "current_hp": 120,
                        "raw_hp_ratio": 10000,
                        "nature_correction_md_id": 0,
                        "base_points": {
                            "hp": 0, "attack": 0, "defense": 0,
                            "special_attack": 0, "special_defense": 0, "speed": 0
                        },
                        "moves": [{
                            "md_id": 33, "slot_index": 0,
                            "current_pp": 35, "max_pp": 35
                        }]
                    }]
                },
                {
                    "is_local_player": false,
                    "team_index": 1,
                    "pokemon_order": [],
                    "selected_group_indices": [0],
                    "pokemon": [{
                        "personal_id": 504,
                        "is_local_team": false,
                        "item_md_id": -1,
                        "ability_md_id": 0,
                        "group_index": 0,
                        "side_index": 1,
                        "position_index": 0,
                        "max_hp": 120,
                        "current_hp": 120,
                        "raw_hp_ratio": 10000,
                        "nature_correction_md_id": 0,
                        "moves": []
                    }]
                }
            ],
            "opponent_observability": {
                "remote_pokemon": 1,
                "remote_with_moves": 0,
                "remote_with_items": 0,
                "remote_with_abilities": 0,
                "remote_with_base_points": 0
            }
        });
        let snapshot = json!({
            "schema_version": 1,
            "captured_at": "2026-07-15T16:00:00.000Z",
            "state_hash": state_hash(&state).unwrap(),
            "source": {
                "bundle_id": SUPPORTED_BUNDLE_ID,
                "app_version": SUPPORTED_APP_VERSION,
                "app_build": SUPPORTED_APP_BUILD,
                "unity_framework_sha256": SUPPORTED_UNITY_FRAMEWORK_SHA256,
                "unity_framework_uuid": SUPPORTED_UNITY_FRAMEWORK_UUID,
                "offset_profile": SUPPORTED_OFFSET_PROFILE
            },
            "state": state
        });
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
        let directory = std::env::temp_dir().join(format!(
            "champions-advisor-recommend-smoke-{}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).unwrap();
        let snapshot_path = directory.join("snapshot.json");
        let scenario_path = directory.join("scenario.json");
        fs::write(
            &snapshot_path,
            serde_json::to_vec_pretty(&snapshot).unwrap(),
        )
        .unwrap();
        fs::write(
            &scenario_path,
            serde_json::to_vec_pretty(&scenario).unwrap(),
        )
        .unwrap();
        let args = vec![
            snapshot_path.into_os_string(),
            OsString::from("0"),
            OsString::from("1"),
            scenario_path.into_os_string(),
            OsString::from("1"),
            OsString::from("100000"),
            OsString::from("none"),
        ];
        let result = recommend_command(&args);
        fs::remove_dir_all(directory).unwrap();
        result.expect("exact core smoke recommendation should complete");
    }
}
