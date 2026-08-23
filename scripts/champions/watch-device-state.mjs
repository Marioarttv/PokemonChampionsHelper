import { execFile, spawn } from "node:child_process";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { applyMatchObservations } from "./match-observations.mjs";
import { buildPerfectKnowledgeSheet } from "./perfect-knowledge.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const mechanicsPath = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/engine/data/champions-mechanics-v1.json",
);
const assumptionDatabasePath = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/engine/data/opponent-assumptions-v1.json",
);
const matchObservationsPath = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/captures/match-observations-v1.json",
);
const manifestPath = resolve(repositoryRoot, "native/ChampionsAdvisorHost/engine/Cargo.toml");
const maximumEngineOutputBytes = 64 * 1024 * 1024;
const engineTimeoutMs = 60_000;

class StaleSnapshotError extends Error {
  constructor(expectedHash, actualHash) {
    super(`battle state changed from ${expectedHash} to ${actualHash}`);
    this.name = "StaleSnapshotError";
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
  }
}

function parseArguments(argv) {
  const options = {
    once: false,
    host: process.env.CHAMPIONS_DEVICE_HOST || "localhost",
    port: Number(process.env.CHAMPIONS_DEVICE_PORT || "2222"),
    user: process.env.CHAMPIONS_DEVICE_USER || "mobile",
    key:
      process.env.CHAMPIONS_SSH_KEY ||
      resolve(repositoryRoot, "../Hush_Cracked/.hush_extract_ed25519"),
    intervalMs: Number(process.env.CHAMPIONS_POLL_MS || "500"),
    heartbeatMs: Number(process.env.CHAMPIONS_HEARTBEAT_MS || "5000"),
    output: resolve(repositoryRoot, "native/ChampionsAdvisorHost/captures/latest.json"),
    analyze: false,
    push: true,
    scenario: process.env.CHAMPIONS_SCENARIO
      ? resolve(process.env.CHAMPIONS_SCENARIO)
      : null,
    exactSheet: process.env.CHAMPIONS_EXACT_SHEET
      ? resolve(process.env.CHAMPIONS_EXACT_SHEET)
      : null,
    scenarioOutput: process.env.CHAMPIONS_SCENARIO_OUTPUT
      ? resolve(process.env.CHAMPIONS_SCENARIO_OUTPUT)
      : resolve(repositoryRoot, "native/ChampionsAdvisorHost/captures/scenario.generated.json"),
    recommendationOutput: resolve(
      repositoryRoot,
      "native/ChampionsAdvisorHost/captures/recommendation.json",
    ),
    exactSheetOutput: resolve(
      repositoryRoot,
      "native/ChampionsAdvisorHost/captures/exact-sheet.generated.json",
    ),
    depth: Number(process.env.CHAMPIONS_SEARCH_DEPTH || "3"),
    nodes: Number(process.env.CHAMPIONS_SEARCH_NODES || "100000"),
    timeMs: process.env.CHAMPIONS_SEARCH_TIME_MS === "none"
      ? null
      : Number(process.env.CHAMPIONS_SEARCH_TIME_MS || "5000"),
    iproxyBinary: process.env.CHAMPIONS_IPROXY_BIN || "iproxy",
    ideviceIdBinary: process.env.CHAMPIONS_IDEVICE_ID_BIN || "idevice_id",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--once") {
      options.once = true;
      continue;
    }
    if (argument === "--analyze") {
      options.analyze = true;
      continue;
    }
    if (argument === "--no-push") {
      options.push = false;
      continue;
    }

    const value = argv[index + 1];
    if (!value) {
      throw new Error(`Missing value after ${argument}`);
    }
    if (argument === "--host") {
      options.host = value;
    } else if (argument === "--port") {
      options.port = Number(value);
    } else if (argument === "--user") {
      options.user = value;
    } else if (argument === "--key") {
      options.key = resolve(value);
    } else if (argument === "--interval-ms") {
      options.intervalMs = Number(value);
    } else if (argument === "--heartbeat-ms") {
      options.heartbeatMs = Number(value);
    } else if (argument === "--output") {
      options.output = resolve(value);
    } else if (argument === "--scenario") {
      options.scenario = resolve(value);
    } else if (argument === "--exact-sheet") {
      options.exactSheet = resolve(value);
    } else if (argument === "--scenario-output") {
      options.scenarioOutput = resolve(value);
    } else if (argument === "--recommendation-output") {
      options.recommendationOutput = resolve(value);
    } else if (argument === "--exact-sheet-output") {
      options.exactSheetOutput = resolve(value);
    } else if (argument === "--depth") {
      options.depth = Number(value);
    } else if (argument === "--nodes") {
      options.nodes = Number(value);
    } else if (argument === "--time-ms") {
      options.timeMs = value === "none" ? null : Number(value);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
    index += 1;
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`Invalid SSH port: ${options.port}`);
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error(`Polling interval must be at least 100 ms: ${options.intervalMs}`);
  }
  if (!Number.isFinite(options.heartbeatMs) || options.heartbeatMs < 1_000) {
    throw new Error(`Heartbeat interval must be at least 1000 ms: ${options.heartbeatMs}`);
  }
  if (options.scenario && options.exactSheet) {
    throw new Error("Use either --scenario or --exact-sheet, not both.");
  }
  if (!Number.isInteger(options.depth) || options.depth < 1 || options.depth > 8) {
    throw new Error(`Search depth must be an integer from 1 to 8: ${options.depth}`);
  }
  if (!Number.isInteger(options.nodes) || options.nodes < 1_000 || options.nodes > 2_000_000) {
    throw new Error(`Search nodes must be an integer from 1000 to 2000000: ${options.nodes}`);
  }
  if (
    options.timeMs !== null
    && (!Number.isInteger(options.timeMs) || options.timeMs < 50 || options.timeMs > 30_000)
  ) {
    throw new Error(`Search time must be 50-30000 ms or none: ${options.timeMs}`);
  }
  return options;
}

function sshArguments(options) {
  return [
    "-p",
    String(options.port),
    "-i",
    options.key,
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "BatchMode=yes",
    "-o",
    "LogLevel=ERROR",
    "-o",
    "ConnectTimeout=3",
  ];
}

let managedTunnelProcess = null;
let activeEngineProcess = null;

function stopManagedTunnel() {
  if (managedTunnelProcess?.exitCode === null) {
    managedTunnelProcess.kill("SIGTERM");
  }
  managedTunnelProcess = null;
}

async function probeDeviceSsh(options) {
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      [...sshArguments(options), `${options.user}@${options.host}`, "printf champions-ready"],
      { maxBuffer: 1024 * 1024, timeout: 5_000 },
    );
    return stdout === "champions-ready";
  } catch {
    return false;
  }
}

async function connectedUsbDevices(options) {
  const { stdout } = await execFileAsync(options.ideviceIdBinary, ["-l"], {
    maxBuffer: 1024 * 1024,
    timeout: 5_000,
  });
  return stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

async function startManagedTunnel(options) {
  stopManagedTunnel();
  let spawnError = null;
  let stderr = "";
  const tunnel = spawn(options.iproxyBinary, [`${options.port}:22`], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  managedTunnelProcess = tunnel;
  tunnel.once("error", (error) => {
    spawnError = error;
  });
  tunnel.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4_000);
  });
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    await delay(200);
    if (spawnError || tunnel.exitCode !== null) {
      break;
    }
    if (await probeDeviceSsh(options)) {
      return;
    }
  }
  stopManagedTunnel();
  if (spawnError?.code === "ENOENT") {
    throw new Error("iproxy is unavailable; install usbmuxd to restore the iPhone tunnel");
  }
  throw new Error(
    stderr.includes("Address already in use")
      ? `USB tunnel port ${options.port} is occupied but does not accept iPhone SSH`
      : `the USB tunnel did not become ready${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
  );
}

async function ensureDeviceConnection(options) {
  if (await probeDeviceSsh(options)) {
    return;
  }
  if (options.host !== "localhost" && options.host !== "127.0.0.1") {
    throw new Error(`SSH connection to ${options.host}:${options.port} is unavailable`);
  }
  await access(options.key);
  const devices = await connectedUsbDevices(options);
  if (devices.length === 0) {
    throw new Error("no unlocked iPhone is visible over USB");
  }
  await startManagedTunnel(options);
}

async function locateDeviceSnapshot(options) {
  const { stdout } = await execFileAsync(
    "ssh",
    [
      ...sshArguments(options),
      `${options.user}@${options.host}`,
      "find /var/mobile/Containers/Data/Application -path '*/Documents/ChampionsAdvisor/snapshot.json' -type f -print -quit 2>/dev/null",
    ],
    { maxBuffer: 1024 * 1024, timeout: 5_000 },
  );
  return stdout.trim();
}

async function copyDeviceSnapshot(options, remotePath, localPath) {
  await execFileAsync(
    "scp",
    [
      "-P",
      String(options.port),
      "-i",
      options.key,
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "IdentitiesOnly=yes",
      "-o",
      "LogLevel=ERROR",
      "-o",
      "ConnectTimeout=3",
      `${options.user}@${options.host}:${remotePath}`,
      localPath,
    ],
    { maxBuffer: 1024 * 1024, timeout: 5_000 },
  );
}

async function readDeviceSnapshot(options, remotePath) {
  assertSafeRemoteSnapshotPath(remotePath);
  const { stdout } = await execFileAsync(
    "ssh",
    [
      ...sshArguments(options),
      `${options.user}@${options.host}`,
      `cat '${remotePath}'`,
    ],
    { maxBuffer: 4 * 1024 * 1024, timeout: 5_000 },
  );
  return validateSnapshot(JSON.parse(stdout));
}

function assertSafeRemoteSnapshotPath(remotePath) {
  const pattern = /^\/var\/mobile\/Containers\/Data\/Application\/[A-Fa-f0-9-]+\/Documents\/ChampionsAdvisor\/snapshot\.json$/;
  if (!pattern.test(remotePath)) {
    throw new Error(`Refusing unexpected remote snapshot path: ${remotePath}`);
  }
}

async function pushDeviceRecommendation(options, remoteSnapshotPath, localPath) {
  assertSafeRemoteSnapshotPath(remoteSnapshotPath);
  const remoteDirectory = dirname(remoteSnapshotPath);
  const remotePath = `${remoteDirectory}/recommendation.json`;
  const remoteTemporaryPath = `${remotePath}.incoming-${process.pid}`;
  await execFileAsync(
    "scp",
    [
      "-P",
      String(options.port),
      "-i",
      options.key,
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "IdentitiesOnly=yes",
      "-o",
      "LogLevel=ERROR",
      "-o",
      "ConnectTimeout=3",
      localPath,
      `${options.user}@${options.host}:${remoteTemporaryPath}`,
    ],
    { maxBuffer: 1024 * 1024, timeout: 5_000 },
  );
  await execFileAsync(
    "ssh",
    [
      ...sshArguments(options),
      `${options.user}@${options.host}`,
      `mv '${remoteTemporaryPath}' '${remotePath}'`,
    ],
    { maxBuffer: 1024 * 1024, timeout: 5_000 },
  );
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function validateSnapshot(snapshot) {
  assertObject(snapshot, "snapshot");
  if (snapshot.schema_version !== 1) {
    throw new Error(`Unsupported schema_version: ${snapshot.schema_version}`);
  }
  if (typeof snapshot.state_hash !== "string" || !/^[0-9a-f]{16}$/.test(snapshot.state_hash)) {
    throw new Error("state_hash must be a 16-character lowercase hexadecimal string");
  }
  assertObject(snapshot.source, "source");
  if (snapshot.source.bundle_id !== "jp.pokemon.pokemonchampions") {
    throw new Error(`Unexpected source bundle: ${snapshot.source.bundle_id}`);
  }
  if (snapshot.source.app_version !== "1.1.4" || snapshot.source.app_build !== "25") {
    throw new Error(
      `Unsupported source build: ${snapshot.source.app_version} (${snapshot.source.app_build})`,
    );
  }
  assertObject(snapshot.state, "state");
  if (!Array.isArray(snapshot.state.teams)) {
    throw new Error("state.teams must be an array");
  }
  assertObject(snapshot.state.world, "state.world");
  assertObject(snapshot.state.opponent_observability, "state.opponent_observability");
  assertNumber(
    snapshot.state.opponent_observability.remote_pokemon,
    "state.opponent_observability.remote_pokemon",
  );
  return snapshot;
}

function snapshotSummary(snapshot) {
  const state = snapshot.state;
  const observability = state.opponent_observability;
  const elapsedTurns = state.world.elapsed_turns ?? 0;
  return [
    `hash=${snapshot.state_hash}`,
    `available=${Boolean(state.available)}`,
    `teams=${state.teams.length}`,
    `turn=${elapsedTurns}`,
    `remote=${observability.remote_pokemon}`,
    `remoteMoves=${observability.remote_with_moves}`,
    `remoteItems=${observability.remote_with_items}`,
    `remoteAbilities=${observability.remote_with_abilities}`,
  ].join(" ");
}

async function delay(milliseconds) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function readExistingHash(outputPath) {
  try {
    const snapshot = JSON.parse(await readFile(outputPath, "utf8"));
    return typeof snapshot.state_hash === "string" ? snapshot.state_hash : null;
  } catch {
    return null;
  }
}

async function pullOnce(options, previousHash) {
  const remotePath = await locateDeviceSnapshot(options);
  if (!remotePath) {
    return { status: "waiting", hash: previousHash };
  }
  assertSafeRemoteSnapshotPath(remotePath);

  await mkdir(dirname(options.output), { recursive: true });
  const temporaryPath = `${options.output}.incoming-${process.pid}`;
  await copyDeviceSnapshot(options, remotePath, temporaryPath);

  try {
    const snapshot = validateSnapshot(JSON.parse(await readFile(temporaryPath, "utf8")));
    if (snapshot.state_hash === previousHash) {
      return { status: "unchanged", hash: previousHash, remotePath };
    }
    await rename(temporaryPath, options.output);
    console.log(`${new Date().toISOString()} ${snapshotSummary(snapshot)}`);
    return { status: "updated", hash: snapshot.state_hash, remotePath, snapshot };
  } finally {
    try {
      await unlink(temporaryPath);
    } catch {
      // The atomic rename already consumed the incoming file, or copying failed before it existed.
    }
  }
}

async function runNativeEngine(arguments_, { signal } = {}) {
  return execFileAsync(
    "cargo",
    ["run", "--quiet", "--release", "--manifest-path", manifestPath, "--", ...arguments_],
    {
      cwd: repositoryRoot,
      maxBuffer: maximumEngineOutputBytes,
      timeout: engineTimeoutMs,
      signal,
    },
  );
}

function terminateProcessTree(child, signal = "SIGTERM") {
  if (!child || child.exitCode !== null || child.pid === undefined) {
    return;
  }
  try {
    if (process.platform === "win32") {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    child.kill(signal);
  }
}

function runNativeEngineWithProgress(arguments_, { signal, onProgress }) {
  return new Promise((resolvePromise, rejectPromise) => {
    if (signal?.aborted) {
      rejectPromise(new Error("native recommendation cancelled"));
      return;
    }
    const child = spawn(
      "cargo",
      ["run", "--quiet", "--release", "--manifest-path", manifestPath, "--", ...arguments_],
      {
        cwd: repositoryRoot,
        detached: process.platform !== "win32",
        env: { ...process.env, CHAMPIONS_PROGRESS_JSON: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    activeEngineProcess = child;
    let stdout = "";
    let stderr = "";
    let lineBuffer = "";
    let settled = false;
    let timedOut = false;
    const abort = () => terminateProcessTree(child);
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, engineTimeoutMs);
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (activeEngineProcess === child) activeEngineProcess = null;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const consumeLines = (flush = false) => {
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = flush ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (!line.startsWith("CHAMPIONS_PROGRESS ")) continue;
        try {
          onProgress?.(JSON.parse(line.slice("CHAMPIONS_PROGRESS ".length)));
        } catch {
          // Ignore malformed diagnostics while retaining the final engine result.
        }
      }
    };
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > maximumEngineOutputBytes) terminateProcessTree(child);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      lineBuffer += text;
      consumeLines();
      if (Buffer.byteLength(stderr) > maximumEngineOutputBytes) terminateProcessTree(child);
    });
    child.once("error", (error) => finish(rejectPromise, error));
    child.once("close", (code) => {
      consumeLines(true);
      if (signal?.aborted) {
        finish(rejectPromise, new Error("native recommendation cancelled"));
      } else if (timedOut) {
        finish(rejectPromise, new Error(`native recommendation exceeded ${engineTimeoutMs} ms`));
      } else if (code !== 0) {
        const detail = stderr
          .split(/\r?\n/)
          .filter((line) => !line.startsWith("CHAMPIONS_PROGRESS "))
          .join("\n")
          .trim();
        finish(rejectPromise, new Error(detail || `native recommendation exited with ${code}`));
      } else {
        finish(resolvePromise, { stdout, stderr });
      }
    });
  });
}

function baseRecommendation(snapshot, startedAt) {
  return {
    schema_version: 1,
    state_hash: snapshot.state_hash,
    generated_at: new Date().toISOString(),
    engine: "champions-native-core-v1",
    status: "unknown",
    summary: "",
    depth: 0,
    nodes: 0,
    elapsed_ms: Date.now() - startedAt,
  };
}

let perfectKnowledgeResourcesPromise;

function loadPerfectKnowledgeResources() {
  perfectKnowledgeResourcesPromise ??= Promise.all([
    readFile(mechanicsPath, "utf8").then(JSON.parse),
    readFile(assumptionDatabasePath, "utf8").then(JSON.parse),
  ]).then(([pack, database]) => ({ pack, database }));
  return perfectKnowledgeResourcesPromise;
}

async function writeAtomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.incoming-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function resolveScenarioPath(options, snapshot) {
  if (options.scenario) {
    await readFile(options.scenario, "utf8");
    return { path: options.scenario, perfectKnowledge: null };
  }
  let exactSheetPath = options.exactSheet;
  let perfectKnowledge = null;
  if (!exactSheetPath) {
    const { pack, database } = await loadPerfectKnowledgeResources();
    const automatic = buildPerfectKnowledgeSheet(snapshot, pack, database);
    const observations = JSON.parse(await readFile(matchObservationsPath, "utf8"));
    const matchStatus = applyMatchObservations(automatic.sheet, observations, snapshot);
    const matchCount = matchStatus.team_override_count
      + matchStatus.pokemon_override_count
      + matchStatus.pending_move_target_count
      + matchStatus.revealed_move_observation_count;
    perfectKnowledge = {
      ...automatic.status,
      match_local_observations: matchCount,
      match_local_team_overrides: matchStatus.team_override_count,
      match_local_pokemon_overrides: matchStatus.pokemon_override_count,
      match_local_pending_targets: matchStatus.pending_move_target_count,
      match_local_revealed_moves: matchStatus.revealed_move_observation_count,
    };
    await writeAtomicJson(options.exactSheetOutput, automatic.sheet);
    exactSheetPath = options.exactSheetOutput;
  }

  const { stdout } = await runNativeEngine([
    "scenario",
    options.output,
    exactSheetPath,
  ]);
  const scenario = JSON.parse(stdout);
  assertObject(scenario, "generated scenario");
  if (!Array.isArray(scenario.teams) || !Array.isArray(scenario.pokemon)) {
    throw new Error("Native exact-sheet exporter returned an invalid scenario overlay");
  }
  await writeAtomicJson(options.scenarioOutput, scenario);
  return { path: options.scenarioOutput, perfectKnowledge };
}

function calculatingRecommendation(snapshot, startedAt, progress, perfectKnowledge) {
  const statistics = progress?.statistics ?? {};
  const activeDepth = progress?.active_depth ?? 1;
  const targetDepth = progress?.target_depth ?? 0;
  return {
    ...baseRecommendation(snapshot, startedAt),
    status: "calculating",
    summary: targetDepth > 0
      ? `Mac search · depth ${activeDepth}/${targetDepth}`
      : "Mac search · preparing exact state",
    depth: statistics.completed_depth ?? 0,
    active_depth: activeDepth,
    target_depth: targetDepth,
    root_plans_completed: progress?.root_plans_completed ?? 0,
    root_plans_total: progress?.root_plans_total ?? 0,
    nodes: statistics.nodes ?? 0,
    chance_nodes: statistics.chance_nodes ?? 0,
    transposition_hits: statistics.transposition_hits ?? 0,
    maximin_cutoffs: statistics.maximin_cutoffs ?? 0,
    elapsed_ms: statistics.elapsed_ms ?? (Date.now() - startedAt),
    perfect_knowledge: perfectKnowledge,
  };
}

async function runMonitoredRecommendation(
  options,
  remotePath,
  snapshot,
  arguments_,
  perfectKnowledge,
  startedAt,
) {
  const controller = new AbortController();
  let latestProgress = null;
  let lastPublishedNodes = -1;
  let engineResult = null;
  let engineError = null;
  let settled = false;
  await publishRecommendation(
    options,
    remotePath,
    calculatingRecommendation(snapshot, startedAt, null, perfectKnowledge),
  );
  const execution = runNativeEngineWithProgress(arguments_, {
    signal: controller.signal,
    onProgress: (progress) => {
      latestProgress = progress;
    },
  }).then(
    (result) => {
      engineResult = result;
      settled = true;
    },
    (error) => {
      engineError = error;
      settled = true;
    },
  );

  while (!settled) {
    await delay(Math.max(500, Math.min(1_000, options.intervalMs)));
    let currentSnapshot;
    try {
      currentSnapshot = await readDeviceSnapshot(options, remotePath);
    } catch (error) {
      controller.abort();
      await execution;
      throw error;
    }
    if (currentSnapshot.state_hash !== snapshot.state_hash) {
      controller.abort();
      await execution;
      throw new StaleSnapshotError(snapshot.state_hash, currentSnapshot.state_hash);
    }
    const currentNodes = latestProgress?.statistics?.nodes ?? 0;
    if (latestProgress && currentNodes !== lastPublishedNodes) {
      await publishRecommendation(
        options,
        remotePath,
        calculatingRecommendation(snapshot, startedAt, latestProgress, perfectKnowledge),
      );
      lastPublishedNodes = currentNodes;
    }
  }
  await execution;
  if (engineError) throw engineError;
  const currentSnapshot = await readDeviceSnapshot(options, remotePath);
  if (currentSnapshot.state_hash !== snapshot.state_hash) {
    throw new StaleSnapshotError(snapshot.state_hash, currentSnapshot.state_hash);
  }
  return engineResult;
}

async function analyzeSnapshot(options, remotePath, snapshot) {
  const startedAt = Date.now();
  await runNativeEngine(["validate", options.output]);
  if (!snapshot.state.available) {
    return {
      ...baseRecommendation(snapshot, startedAt),
      status: "idle",
      summary: "No battle active · Mac engine connected",
    };
  }
  const scenario = await resolveScenarioPath(options, snapshot);
  const scenarioPath = scenario.path;

  await runNativeEngine(["materialize", options.output, scenarioPath]);
  const localTeamIndex = snapshot.state.local_team_index;
  const opponentTeam = snapshot.state.teams.find(
    (team) => team.team_index !== localTeamIndex,
  );
  if (!opponentTeam) {
    throw new Error(`No opposing team exists for local team ${localTeamIndex}`);
  }
  const [localActions, opponentActions] = await Promise.all([
    runNativeEngine([
      "actions",
      options.output,
      String(localTeamIndex),
      scenarioPath,
    ]),
    runNativeEngine([
      "actions",
      options.output,
      String(opponentTeam.team_index),
      scenarioPath,
    ]),
  ]);
  const local = JSON.parse(localActions.stdout);
  const opponent = JSON.parse(opponentActions.stdout);
  const legalPlanCounts = {
    [String(localTeamIndex)]: local.jointPlanCount,
    [String(opponentTeam.team_index)]: opponent.jointPlanCount,
  };
  try {
    const { stdout } = await runMonitoredRecommendation(
      options,
      remotePath,
      snapshot,
      [
        "recommend",
        options.output,
        String(localTeamIndex),
        String(opponentTeam.team_index),
        scenarioPath,
        String(options.depth),
        String(options.nodes),
        options.timeMs === null ? "none" : String(options.timeMs),
      ],
      scenario.perfectKnowledge,
      startedAt,
    );
    return {
      ...JSON.parse(stdout),
      generated_at: new Date().toISOString(),
      legal_plan_counts: legalPlanCounts,
      perfect_knowledge: scenario.perfectKnowledge,
    };
  } catch (error) {
    if (error instanceof StaleSnapshotError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...baseRecommendation(snapshot, startedAt),
      status: "mechanics_blocked",
      summary: "Exact state ready · unsupported mechanic blocks search",
      legal_plan_counts: legalPlanCounts,
      search_blocker: message.slice(0, 1000),
    };
  }
}

async function publishRecommendation(options, remotePath, recommendation) {
  await mkdir(dirname(options.recommendationOutput), { recursive: true });
  const temporaryPath = `${options.recommendationOutput}.incoming`;
  await writeFile(temporaryPath, `${JSON.stringify(recommendation, null, 2)}\n`, "utf8");
  await rename(temporaryPath, options.recommendationOutput);
  if (options.push) {
    await pushDeviceRecommendation(options, remotePath, options.recommendationOutput);
  }
  console.log(
    `${new Date().toISOString()} engine status=${recommendation.status} hash=${recommendation.state_hash} elapsedMs=${recommendation.elapsed_ms}`,
  );
}

async function analyzeAndPublish(options, remotePath, snapshot) {
  const startedAt = Date.now();
  let recommendation;
  const analysisSnapshotPath = `${options.output}.analysis-${process.pid}-${snapshot.state_hash}`;
  await writeAtomicJson(analysisSnapshotPath, snapshot);
  const analysisOptions = { ...options, output: analysisSnapshotPath };
  try {
    try {
      recommendation = await analyzeSnapshot(analysisOptions, remotePath, snapshot);
    } catch (error) {
      if (error instanceof StaleSnapshotError) {
        console.log(
          `${new Date().toISOString()} discarded stale engine result expected=${error.expectedHash} actual=${error.actualHash}`,
        );
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      recommendation = {
        ...baseRecommendation(snapshot, startedAt),
        status: "blocked",
        summary: "Mac engine blocked · inspect host details",
        detail: message.slice(0, 1000),
      };
    }
    const currentSnapshot = await readDeviceSnapshot(options, remotePath);
    if (currentSnapshot.state_hash !== snapshot.state_hash) {
      console.log(
        `${new Date().toISOString()} discarded stale engine result expected=${snapshot.state_hash} actual=${currentSnapshot.state_hash}`,
      );
      return false;
    }
    await publishRecommendation(options, remotePath, recommendation);
    return true;
  } finally {
    await unlink(analysisSnapshotPath).catch(() => {});
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  let lastHash = options.analyze ? null : await readExistingHash(options.output);
  let reportedWaiting = false;
  let connectionReady = false;
  let retryDelayMs = options.intervalMs;
  let lastConnectionError = null;
  let lastHeartbeatAt = 0;

  do {
    try {
      if (!connectionReady) {
        await ensureDeviceConnection(options);
        connectionReady = true;
        retryDelayMs = options.intervalMs;
        lastConnectionError = null;
        console.log(`${new Date().toISOString()} iPhone USB/SSH connection ready`);
      }
      const result = await pullOnce(options, lastHash);
      lastHash = result.hash;
      if (result.status === "waiting" && !reportedWaiting) {
        console.log("Waiting for the ChampionsAdvisor snapshot on the connected device.");
        reportedWaiting = true;
      } else if (result.status === "updated") {
        reportedWaiting = false;
        if (options.analyze) {
          await analyzeAndPublish(options, result.remotePath, result.snapshot);
        }
      }
      if (!options.once && Date.now() - lastHeartbeatAt >= options.heartbeatMs) {
        console.log(
          `${new Date().toISOString()} bridge heartbeat status=${result.status} hash=${result.hash ?? "none"}`,
        );
        lastHeartbeatAt = Date.now();
      }
      retryDelayMs = options.intervalMs;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.once) {
        throw error;
      }
      connectionReady = false;
      stopManagedTunnel();
      if (message !== lastConnectionError) {
        console.error(`${new Date().toISOString()} bridge reconnecting: ${message}`);
        lastConnectionError = message;
      }
      retryDelayMs = Math.min(Math.max(options.intervalMs, retryDelayMs * 2), 5_000);
    }

    if (!options.once) {
      await delay(retryDelayMs);
    }
  } while (!options.once);
}

export {
  calculatingRecommendation,
  parseArguments,
  resolveScenarioPath,
  validateSnapshot,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const shutdown = () => {
    terminateProcessTree(activeEngineProcess);
    stopManagedTunnel();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  main()
    .then(() => stopManagedTunnel())
    .catch((error) => {
      stopManagedTunnel();
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
