export type KnowledgeTone = "observed" | "assumed" | "hidden";

export type SnapshotSource = {
  id: string;
  label: string;
  capturedAt: string;
  turn: number;
  stateHash: string;
  available: boolean;
  hasActiveLocalPokemon: boolean;
  isDeviceLatest: boolean;
};

export type DeviceConnectionStage = "usb" | "tunnel" | "ssh" | "snapshot";

export type DeviceConnectionStatus = {
  status: "ready";
  deviceConnected: boolean;
  tunnelReady: boolean;
  sshReady: boolean;
  tunnelStarted: boolean;
  advisorRunning: boolean;
  advisor: AdvisorBridgeStatus;
  message: string;
  checkedAt: string;
};

export type AdvisorBridgeStatus = {
  status: "disabled" | "stopped" | "starting" | "running" | "recovering";
  lastMessage: string;
  startedAt: string | null;
  updatedAt: string | null;
};

export type PerfectKnowledgeStatus = {
  mode: "automatic" | "manual_override";
  database_version: number;
  database_profiles: number;
  roster_pokemon: number;
  covered_pokemon: number;
  mirrored_pokemon: number;
  observed_overrides: number;
  revealed_order_slots: number;
  summary: string;
  match_local_observations?: number;
  match_local_team_overrides?: number;
  match_local_pokemon_overrides?: number;
  match_local_pending_targets?: number;
  match_local_revealed_moves?: number;
};

export type SnapshotMove = {
  md_id: number;
  slot_index: number;
  current_pp: number;
  max_pp: number;
  locked: boolean;
};

export type SnapshotEffect = {
  md_id: number;
  lifespan_turns: number;
  elapsed_turns: number;
  step_or_count: number;
  execute_kind: number;
  execute_id: number;
  target_execute_kind: number;
  target_execute_id: number;
};

export type SnapshotStatStages = {
  attack: number;
  defense: number;
  special_attack: number;
  special_defense: number;
  speed: number;
  accuracy: number;
  evasion: number;
  critical: number;
};

export type SnapshotPokemon = {
  personal_id: number;
  form_no: number;
  group_index: number;
  side_index: number;
  position_index: number;
  is_local_team: boolean;
  current_hp: number;
  max_hp: number;
  raw_hp_ratio: number;
  fainted: boolean;
  status_condition: number;
  item_md_id: number;
  ability_md_id: number;
  mega_mode: boolean;
  needs_change: boolean;
  selection_order: number;
  moves: SnapshotMove[];
  stat_stages: SnapshotStatStages;
  volatile_effects: SnapshotEffect[];
  field_effects: SnapshotEffect[];
};

export type SnapshotTeam = {
  team_index: number;
  is_local_player: boolean;
  waiting_for_action: boolean;
  pokemon_order: number[];
  selected_group_indices: number[];
  pokemon: SnapshotPokemon[];
};

export type SnapshotSide = {
  side_index: number;
  field_effects: SnapshotEffect[];
};

export type SnapshotWorld = {
  elapsed_turns: number;
  weather_md_id: number;
  weather_lifespan_turns: number;
  weather_elapsed_turns: number;
  field_effects: SnapshotEffect[];
  sides: SnapshotSide[];
};

export type SnapshotObservability = {
  remote_pokemon: number;
  remote_with_moves: number;
  remote_with_items: number;
  remote_with_abilities: number;
  remote_with_base_points: number;
};

export type ChampionsSnapshot = {
  schema_version: number;
  captured_at: string;
  state_hash: string;
  source: {
    app_version: string;
    app_build: string;
    bundle_id: string;
  };
  state: {
    available: boolean;
    battle_rule: number;
    battle_type: number;
    local_team_index: number;
    world: SnapshotWorld;
    teams: SnapshotTeam[];
    opponent_observability: SnapshotObservability;
  };
};

export type CatalogSpecies = {
  num: number;
  id: string;
  name: string;
  baseSpecies: string;
  forme: string | null;
  types: string[];
};

export type CatalogMove = {
  num: number;
  id: string;
  name: string;
  type: string;
  category: "Physical" | "Special" | "Status";
};

export type CatalogNamedEntry = {
  num: number;
  id: string;
  name: string;
};

export type ChampionsCatalog = {
  species: CatalogSpecies[];
  moves: CatalogMove[];
  items: CatalogNamedEntry[];
  abilities: CatalogNamedEntry[];
  weather: Record<string, number>;
};

export type BattleLabSession = {
  schemaVersion: number;
  selectedSourceId: string;
  sources: SnapshotSource[];
  snapshot: ChampionsSnapshot;
  lastRecommendation: EngineRecommendation | null;
  engine: {
    name: string;
    ready: boolean;
    advisor: AdvisorBridgeStatus;
  };
  connection?: DeviceConnectionStatus;
  perfectKnowledge: PerfectKnowledgeStatus;
};

export type PlanAction = {
  kind: "use_move" | "switch" | "struggle" | "automatic";
  actor: { team_index: number; group_index: number };
  md_id?: number;
  target?:
    | { kind: "pokemon"; key: { team_index: number; group_index: number } }
    | { kind: "automatic" };
  replacement?: { team_index: number; group_index: number };
};

export type LabeledPlan = {
  label: string;
  plan: {
    team_index: number;
    actions: PlanAction[];
  };
};

export type EngineRecommendation = {
  schema_version: number;
  state_hash: string;
  generated_at?: string;
  engine: string;
  status: "ready" | "needs_scenario" | "mechanics_blocked" | "blocked" | "idle";
  summary: string;
  best_plan?: LabeledPlan;
  worst_case_reply?: LabeledPlan;
  principal_variation?: Array<{
    turn_offset: number;
    depth_remaining: number;
    score: number;
    perspective_plan: LabeledPlan;
    opponent_reply: LabeledPlan;
    representative_probability: { numerator: number; denominator: number };
  }>;
  score?: number;
  depth: number;
  nodes: number;
  chance_nodes?: number;
  transposition_hits?: number;
  maximin_cutoffs?: number;
  elapsed_ms: number;
  detail?: string;
  search_blocker?: string;
  missing_knowledge?: string[];
  perfect_knowledge?: PerfectKnowledgeStatus;
};

export type RecommendationRequest = {
  snapshotId: string;
  stateHash: string;
  exactSheet: unknown | null;
  depth: number;
  nodes: number;
  timeMs: number | null;
};

export type RecommendationProgress = {
  stage: "queued" | "preparing" | "searching" | "cancelling" | "cancelled" | "complete";
  target_depth: number;
  active_depth?: number;
  root_plans_completed?: number;
  root_plans_total?: number;
  score?: number | null;
  statistics: {
    completed_depth: number;
    nodes: number;
    chance_nodes: number;
    transposition_hits: number;
    maximin_cutoffs: number;
    elapsed_ms: number;
  };
};

export type RecommendationJob = {
  jobId: string;
  status: "queued" | "running" | "cancelling" | "complete" | "cancelled" | "stale" | "failed";
  stateHash: string;
  snapshotId: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  progress: RecommendationProgress;
  result: EngineRecommendation | null;
  error: string | null;
};
