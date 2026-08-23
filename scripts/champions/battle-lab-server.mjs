import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { buildPerfectKnowledgeSheet } from "./perfect-knowledge.mjs";
import { applyMatchObservations } from "./match-observations.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const captureDirectory = resolve(repositoryRoot, "native/ChampionsAdvisorHost/captures");
const mechanicsPath = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/engine/data/champions-mechanics-v1.json",
);
const assumptionDatabasePath = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/engine/data/opponent-assumptions-v1.json",
);
const manifestPath = resolve(repositoryRoot, "native/ChampionsAdvisorHost/engine/Cargo.toml");
const bridgePath = resolve(repositoryRoot, "scripts/champions/watch-device-state.mjs");
const distDirectory = resolve(repositoryRoot, "dist");
const webRecommendationPath = resolve(captureDirectory, "recommendation.web.json");
const matchObservationsPath = resolve(captureDirectory, "match-observations-v1.json");
const maximumBodyBytes = 512 * 1024;
const maximumEngineOutputBytes = 64 * 1024 * 1024;
const engineTimeoutMs = 60_000;
const connectionProbeTimeoutMs = 5_000;
const deviceHost = process.env.CHAMPIONS_DEVICE_HOST || "localhost";
const devicePort = Number(process.env.CHAMPIONS_DEVICE_PORT || "2222");
const deviceUser = process.env.CHAMPIONS_DEVICE_USER || "mobile";
const deviceSshKey =
  process.env.CHAMPIONS_SSH_KEY || resolve(repositoryRoot, "../Hush_Cracked/.hush_extract_ed25519");
const iproxyBinary = process.env.CHAMPIONS_IPROXY_BIN || "iproxy";
const ideviceIdBinary = process.env.CHAMPIONS_IDEVICE_ID_BIN || "idevice_id";
const excludedCaptureFiles = new Set([
  "recommendation.json",
  "recommendation.web.json",
  "scenario.generated.json",
]);

class DeviceConnectionError extends Error {
  constructor(code, stage, message, action, detail = "") {
    super(message);
    this.name = "DeviceConnectionError";
    this.code = code;
    this.stage = stage;
    this.action = action;
    this.detail = detail;
  }
}

class RecommendationCancelledError extends Error {
  constructor() {
    super("The calculation was cancelled");
    this.name = "RecommendationCancelledError";
  }
}

class StaleStateError extends Error {
  constructor(expectedStateHash, actualStateHash) {
    super("The requested battle state is no longer current");
    this.name = "StaleStateError";
    this.expectedStateHash = expectedStateHash;
    this.actualStateHash = actualStateHash;
  }
}

let managedTunnelProcess = null;
let connectionAttempt = null;
const recommendationJobs = new Map();
let managedAdvisorProcess = null;
let advisorRestartTimer = null;
let serverClosing = false;
let advisorStatus = {
  status: process.env.CHAMPIONS_AUTO_ADVISOR === "0" ? "disabled" : "stopped",
  lastMessage: "",
  startedAt: null,
  updatedAt: null,
};

function stopManagedTunnel() {
  if (managedTunnelProcess?.exitCode === null) {
    managedTunnelProcess.kill("SIGTERM");
  }
  managedTunnelProcess = null;
}

function publicAdvisorStatus() {
  if (
    (advisorStatus.status === "starting" || advisorStatus.status === "running")
    && isAdvisorHeartbeatStale(advisorStatus.updatedAt)
  ) {
    return {
      ...advisorStatus,
      status: "recovering",
      lastMessage: "Continuous advisor heartbeat is overdue; waiting for automatic recovery.",
    };
  }
  return { ...advisorStatus };
}

export function isAdvisorHeartbeatStale(updatedAt, now = Date.now(), maximumAgeMs = 20_000) {
  if (!updatedAt) return false;
  const updatedAtMs = Date.parse(updatedAt);
  return !Number.isFinite(updatedAtMs) || now - updatedAtMs > maximumAgeMs;
}

export function classifyAdvisorMessage(lastMessage) {
  return /reconnecting|unavailable|retrying|connection (?:closed|refused)|broken pipe|^(?:scp|ssh):/i
    .test(lastMessage)
    ? "recovering"
    : "running";
}

function startManagedAdvisorBridge() {
  if (process.env.CHAMPIONS_AUTO_ADVISOR === "0") {
    return false;
  }
  if (managedAdvisorProcess?.exitCode === null) {
    return true;
  }
  if (advisorRestartTimer) {
    clearTimeout(advisorRestartTimer);
    advisorRestartTimer = null;
  }
  const child = spawn(process.execPath, [bridgePath, "--analyze"], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  managedAdvisorProcess = child;
  advisorStatus = {
    status: "starting",
    lastMessage: "Continuous phone-to-Mac advisor sync is starting.",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const updateMessage = (chunk) => {
    const lines = chunk.toString("utf8").trim().split(/\r?\n/).filter(Boolean);
    if (lines.length > 0) {
      const lastMessage = lines.at(-1).slice(-500);
      advisorStatus = {
        ...advisorStatus,
        status: classifyAdvisorMessage(lastMessage),
        lastMessage,
        updatedAt: new Date().toISOString(),
      };
    }
  };
  child.stdout.on("data", updateMessage);
  child.stderr.on("data", updateMessage);
  child.once("error", (error) => {
    advisorStatus = {
      ...advisorStatus,
      status: "recovering",
      lastMessage: engineFailureDetail(error),
      updatedAt: new Date().toISOString(),
    };
  });
  child.once("close", (code) => {
    if (managedAdvisorProcess === child) managedAdvisorProcess = null;
    if (serverClosing) return;
    advisorStatus = {
      ...advisorStatus,
      status: "recovering",
      lastMessage: `Continuous advisor exited with ${code ?? "unknown"}; restarting.`,
      updatedAt: new Date().toISOString(),
    };
    advisorRestartTimer = setTimeout(() => {
      advisorRestartTimer = null;
      startManagedAdvisorBridge();
    }, 1_500);
  });
  return true;
}

function stopManagedAdvisorBridge() {
  if (advisorRestartTimer) clearTimeout(advisorRestartTimer);
  advisorRestartTimer = null;
  if (managedAdvisorProcess?.exitCode === null) {
    managedAdvisorProcess.kill("SIGTERM");
  }
  managedAdvisorProcess = null;
}

function sshProbeArguments() {
  return [
    "-p",
    String(devicePort),
    "-i",
    deviceSshKey,
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
    `${deviceUser}@${deviceHost}`,
    "printf champions-ready",
  ];
}

async function listConnectedUsbDevices() {
  try {
    const { stdout } = await execFileAsync(ideviceIdBinary, ["-l"], {
      maxBuffer: 1024 * 1024,
      timeout: connectionProbeTimeoutMs,
    });
    return stdout
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new DeviceConnectionError(
        "USB_TOOLS_MISSING",
        "usb",
        "The Mac cannot check for a connected iPhone.",
        "Install libimobiledevice and usbmuxd, then restart Battle Lab.",
      );
    }
    throw new DeviceConnectionError(
      "USB_CHECK_FAILED",
      "usb",
      "The Mac could not query USB devices.",
      "Reconnect the iPhone cable, unlock the phone, and try again.",
      engineFailureDetail(error),
    );
  }
}

async function probeDeviceSsh() {
  try {
    const { stdout } = await execFileAsync("ssh", sshProbeArguments(), {
      maxBuffer: 1024 * 1024,
      timeout: connectionProbeTimeoutMs,
    });
    return { ready: stdout === "champions-ready", detail: "" };
  } catch (error) {
    return { ready: false, detail: engineFailureDetail(error) };
  }
}

async function startManagedTunnel() {
  stopManagedTunnel();
  let spawnError = null;
  let stderr = "";
  const tunnel = spawn(iproxyBinary, [`${devicePort}:22`], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  managedTunnelProcess = tunnel;
  tunnel.once("error", (error) => {
    spawnError = error;
  });
  tunnel.stderr?.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4_000);
  });

  const deadline = Date.now() + connectionProbeTimeoutMs;
  let lastProbe = { ready: false, detail: "" };
  while (Date.now() < deadline) {
    await delay(200);
    if (spawnError || tunnel.exitCode !== null) {
      break;
    }
    lastProbe = await probeDeviceSsh();
    if (lastProbe.ready) {
      return;
    }
  }

  stopManagedTunnel();
  if (spawnError?.code === "ENOENT") {
    throw new DeviceConnectionError(
      "IPROXY_MISSING",
      "tunnel",
      "Battle Lab cannot open the USB tunnel automatically.",
      "Install usbmuxd so the iproxy command is available, then restart Battle Lab.",
    );
  }
  if (stderr.includes("Address already in use")) {
    throw new DeviceConnectionError(
      "TUNNEL_PORT_BUSY",
      "tunnel",
      `Port ${devicePort} is being used by another process.`,
      `Stop the process using localhost:${devicePort}, then try Refresh from USB again.`,
      stderr.trim(),
    );
  }
  throw new DeviceConnectionError(
    "TUNNEL_START_FAILED",
    "tunnel",
    "The secure USB tunnel did not become ready.",
    "Keep the iPhone unlocked, reconnect the cable, and try again.",
    stderr.trim() || lastProbe.detail,
  );
}

async function ensureDeviceConnection() {
  if (!Number.isInteger(devicePort) || devicePort < 1 || devicePort > 65_535) {
    throw new DeviceConnectionError(
      "INVALID_DEVICE_PORT",
      "tunnel",
      "The configured iPhone tunnel port is invalid.",
      "Set CHAMPIONS_DEVICE_PORT to a valid local port and restart Battle Lab.",
    );
  }

  const devices = await listConnectedUsbDevices();
  if (devices.length === 0) {
    throw new DeviceConnectionError(
      "NO_USB_DEVICE",
      "usb",
      "No iPhone was detected over USB.",
      "Connect the iPhone with a data-capable cable, unlock it, tap Trust if prompted, and try again.",
    );
  }

  try {
    await access(deviceSshKey);
  } catch {
    throw new DeviceConnectionError(
      "SSH_KEY_MISSING",
      "ssh",
      "The iPhone SSH key is not available on this Mac.",
      "Set CHAMPIONS_SSH_KEY to the private key used by the jailbroken phone and restart Battle Lab.",
    );
  }

  const existingProbe = await probeDeviceSsh();
  if (existingProbe.ready) {
    return {
      status: "ready",
      deviceConnected: true,
      tunnelReady: true,
      sshReady: true,
      tunnelStarted: false,
      message: "iPhone detected. The existing secure USB tunnel is ready.",
      checkedAt: new Date().toISOString(),
    };
  }
  if (/permission denied|publickey/i.test(existingProbe.detail)) {
    throw new DeviceConnectionError(
      "SSH_AUTH_FAILED",
      "ssh",
      "The Mac reached the iPhone, but SSH authentication was rejected.",
      "Confirm the configured mobile-user SSH key is authorized on the iPhone, then try again.",
      existingProbe.detail,
    );
  }

  await startManagedTunnel();
  return {
    status: "ready",
    deviceConnected: true,
    tunnelReady: true,
    sshReady: true,
    tunnelStarted: true,
    message: "iPhone detected. Battle Lab opened and verified the secure USB tunnel automatically.",
    checkedAt: new Date().toISOString(),
  };
}

function prepareDeviceConnection() {
  connectionAttempt ??= ensureDeviceConnection()
    .then((connection) => {
      const advisorRunning = startManagedAdvisorBridge();
      const advisor = publicAdvisorStatus();
      const advisorMessage = advisor.status === "starting"
        ? "Continuous overlay sync is starting automatically."
        : advisor.status === "recovering"
          ? "Continuous overlay sync is reconnecting automatically."
          : "Continuous overlay sync is running.";
      return {
        ...connection,
        advisorRunning,
        advisor,
        message: advisorRunning
          ? `${connection.message} ${advisorMessage}`
          : connection.message,
      };
    })
    .finally(() => {
      connectionAttempt = null;
    });
  return connectionAttempt;
}

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function parseArguments(argv) {
  const options = {
    host: process.env.CHAMPIONS_LAB_HOST || "127.0.0.1",
    port: Number(process.env.CHAMPIONS_LAB_PORT || "4174"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`Missing value after ${argument}`);
    }
    if (argument === "--host") {
      options.host = value;
    } else if (argument === "--port") {
      options.port = Number(value);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
    index += 1;
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) {
    throw new Error(`Invalid HTTP port: ${options.port}`);
  }
  return options;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSnapshotShape(snapshot, filePath) {
  if (!isObject(snapshot) || snapshot.schema_version !== 1 || !isObject(snapshot.state)) {
    throw new Error(`${basename(filePath)} is not a Champions snapshot`);
  }
  if (typeof snapshot.state_hash !== "string" || !Array.isArray(snapshot.state.teams)) {
    throw new Error(`${basename(filePath)} is missing battle state fields`);
  }
  return snapshot;
}

function sourceLabel(fileName, snapshot) {
  if (fileName === "latest.json") {
    return snapshot.state.available ? "Device latest" : "Device latest · no battle";
  }
  const turn = fileName.match(/turn(\d+)/i)?.[1];
  if (turn) {
    return `Private match · Turn ${turn}${fileName.includes("resolving") ? " resolving" : ""}`;
  }
  if (fileName.includes("postbattle")) {
    return "Private match · Post battle";
  }
  return fileName.replace(/\.json$/i, "").replaceAll("-", " ");
}

function activeLocalCount(snapshot) {
  const localTeam = snapshot.state.teams.find((team) => team.is_local_player);
  return (
    localTeam?.pokemon?.filter(
      (pokemon) => pokemon.side_index >= 0 && pokemon.position_index >= 0 && !pokemon.fainted,
    ).length ?? 0
  );
}

async function loadSourceRegistry() {
  const entries = await readdir(captureDirectory, { withFileTypes: true });
  const sources = [];
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".json") ||
      excludedCaptureFiles.has(entry.name)
    ) {
      continue;
    }
    const filePath = resolve(captureDirectory, entry.name);
    try {
      const snapshot = validateSnapshotShape(JSON.parse(await readFile(filePath, "utf8")), filePath);
      const activeCount = activeLocalCount(snapshot);
      sources.push({
        id: `capture:${entry.name}`,
        filePath,
        snapshot,
        label: sourceLabel(entry.name, snapshot),
        capturedAt: snapshot.captured_at,
        turn: snapshot.state.world?.elapsed_turns ?? 0,
        stateHash: snapshot.state_hash,
        available: Boolean(snapshot.state.available),
        hasActiveLocalPokemon: activeCount > 0,
        isDeviceLatest: entry.name === "latest.json",
      });
    } catch {
      // Non-snapshot JSON files are intentionally absent from the source picker.
    }
  }
  sources.sort((left, right) => {
    if (left.isDeviceLatest !== right.isDeviceLatest) {
      return left.isDeviceLatest ? -1 : 1;
    }
    return left.capturedAt.localeCompare(right.capturedAt);
  });
  if (sources.length === 0) {
    throw new Error(`No battle snapshots were found in ${captureDirectory}`);
  }
  return sources;
}

function publicSource(source) {
  const { filePath: _filePath, snapshot: _snapshot, ...value } = source;
  return value;
}

function selectSource(sources, requestedId) {
  if (requestedId) {
    const requested = sources.find((source) => source.id === requestedId);
    if (!requested) {
      throw new Error(`Unknown snapshot source: ${requestedId}`);
    }
    return requested;
  }
  const deviceLatest = sources.find(
    (source) => source.isDeviceLatest && source.available && source.hasActiveLocalPokemon,
  );
  if (deviceLatest) {
    return deviceLatest;
  }
  return (
    [...sources].reverse().find((source) => source.available && source.hasActiveLocalPokemon) ??
    [...sources].reverse().find((source) => source.available) ??
    sources[0]
  );
}

async function readLastRecommendation(stateHash) {
  for (const path of [webRecommendationPath, resolve(captureDirectory, "recommendation.json")]) {
    try {
      const recommendation = JSON.parse(await readFile(path, "utf8"));
      if (recommendation.state_hash === stateHash) {
        return recommendation;
      }
    } catch {
      // A missing, partial, or stale recommendation should not block the state view.
    }
  }
  return null;
}

async function buildSession(requestedId) {
  const sources = await loadSourceRegistry();
  const selected = selectSource(sources, requestedId);
  const perfectKnowledge = selected.snapshot.state.available
    ? (await buildAutomaticPerfectKnowledge(selected.snapshot)).status
    : {
        mode: "automatic",
        database_version: 1,
        database_profiles: (await loadPerfectKnowledgeResources()).database.profile_count,
        roster_pokemon: 0,
        covered_pokemon: 0,
        mirrored_pokemon: 0,
        observed_overrides: 0,
        revealed_order_slots: 0,
        summary: "Automatic assumptions are ready and will attach when a battle is active.",
      };
  return {
    schemaVersion: 1,
    selectedSourceId: selected.id,
    sources: sources.map(publicSource),
    snapshot: selected.snapshot,
    lastRecommendation: await readLastRecommendation(selected.stateHash),
    engine: {
      name: "champions-native-core-v1",
      ready: true,
      advisor: publicAdvisorStatus(),
    },
    perfectKnowledge,
  };
}

let catalogPromise;
let perfectKnowledgeResourcesPromise;
function loadPerfectKnowledgeResources() {
  perfectKnowledgeResourcesPromise ??= Promise.all([
    readFile(mechanicsPath, "utf8").then(JSON.parse),
    readFile(assumptionDatabasePath, "utf8").then(JSON.parse),
  ]).then(([pack, database]) => ({ pack, database }));
  return perfectKnowledgeResourcesPromise;
}

async function buildAutomaticPerfectKnowledge(snapshot) {
  const { pack, database } = await loadPerfectKnowledgeResources();
  return buildPerfectKnowledgeSheet(snapshot, pack, database);
}

async function loadPublicCatalog() {
  catalogPromise ??= readFile(mechanicsPath, "utf8").then((text) => {
    const pack = JSON.parse(text);
    return {
      species: pack.species.map(({ num, id, name, baseSpecies, forme, types }) => ({
        num,
        id,
        name,
        baseSpecies,
        forme,
        types,
      })),
      moves: pack.moves.map(({ num, id, name, type, category }) => ({
        num,
        id,
        name,
        type,
        category,
      })),
      items: pack.items.map(({ num, id, name }) => ({ num, id, name })),
      abilities: pack.abilities.map(({ num, id, name }) => ({ num, id, name })),
      weather: pack.runtimeEnums.weather,
    };
  });
  return catalogPromise;
}

function sendJson(response, statusCode, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximumBodyBytes) {
      throw new Error(`Request body exceeds ${maximumBodyBytes} bytes`);
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!isObject(value)) {
    throw new Error("Request body must be a JSON object");
  }
  return value;
}

function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
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
      rejectPromise(new RecommendationCancelledError());
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
    let stdout = "";
    let stderr = "";
    let stderrLineBuffer = "";
    let timedOut = false;
    let settled = false;

    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const abort = () => terminateProcessTree(child);
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, engineTimeoutMs);
    signal?.addEventListener("abort", abort, { once: true });

    const consumeProgressLines = (flush = false) => {
      const lines = stderrLineBuffer.split(/\r?\n/);
      stderrLineBuffer = flush ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (!line.startsWith("CHAMPIONS_PROGRESS ")) {
          continue;
        }
        try {
          onProgress?.(JSON.parse(line.slice("CHAMPIONS_PROGRESS ".length)));
        } catch {
          // A malformed diagnostic line must not invalidate an otherwise valid result.
        }
      }
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > maximumEngineOutputBytes) {
        terminateProcessTree(child);
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      stderrLineBuffer += text;
      consumeProgressLines();
      if (Buffer.byteLength(stderr) > maximumEngineOutputBytes) {
        terminateProcessTree(child);
      }
    });
    child.once("error", (error) => finish(rejectPromise, error));
    child.once("close", (code, terminationSignal) => {
      consumeProgressLines(true);
      if (signal?.aborted) {
        finish(rejectPromise, new RecommendationCancelledError());
        return;
      }
      if (timedOut) {
        const error = new Error(`Native engine exceeded ${engineTimeoutMs} ms`);
        error.stderr = stderr;
        finish(rejectPromise, error);
        return;
      }
      if (code !== 0) {
        const error = new Error(
          `Native engine exited with code ${code ?? "unknown"}${terminationSignal ? ` (${terminationSignal})` : ""}`,
        );
        error.stderr = stderr;
        finish(rejectPromise, error);
        return;
      }
      finish(resolvePromise, { stdout, stderr });
    });
  });
}

function engineFailureDetail(error) {
  const stderr = typeof error?.stderr === "string"
    ? error.stderr
        .split(/\r?\n/)
        .filter((line) => !line.startsWith("CHAMPIONS_PROGRESS "))
        .join("\n")
        .trim()
    : "";
  const message = error instanceof Error ? error.message : String(error);
  return (stderr || message).slice(-4_000);
}

async function saveWebRecommendation(recommendation) {
  const temporaryPath = `${webRecommendationPath}.incoming-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(recommendation, null, 2)}\n`, "utf8");
  await rename(temporaryPath, webRecommendationPath);
}

function needsScenarioRecommendation(snapshot, detail) {
  return {
    schema_version: 1,
    state_hash: snapshot.state_hash,
    generated_at: new Date().toISOString(),
    engine: "champions-native-core-v1",
    status: "needs_scenario",
    summary: "Automatic perfect-knowledge assumptions could not be completed",
    missing_knowledge: [
      "opponent selected-four order",
      "opponent moves and PP",
      "opponent held items",
      "opponent nature and training points",
      "opponent exact HP",
    ],
    depth: 0,
    nodes: 0,
    elapsed_ms: 0,
    detail,
  };
}

async function loadMatchObservations() {
  try {
    return JSON.parse(await readFile(matchObservationsPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { schema_version: 1, observations: [] };
    }
    throw error;
  }
}

async function readSourceStateHash(source) {
  const snapshot = validateSnapshotShape(
    JSON.parse(await readFile(source.filePath, "utf8")),
    source.filePath,
  );
  return snapshot.state_hash;
}

async function assertSourceStateIsCurrent(source, expectedStateHash) {
  const actualStateHash = await readSourceStateHash(source);
  if (actualStateHash !== expectedStateHash) {
    throw new StaleStateError(expectedStateHash, actualStateHash);
  }
}

async function calculateRecommendation(body, { signal, onProgress } = {}) {
  const sources = await loadSourceRegistry();
  const source = selectSource(sources, String(body.snapshotId ?? ""));
  const snapshot = source.snapshot;
  const expectedStateHash = String(body.stateHash ?? snapshot.state_hash);
  if (expectedStateHash !== snapshot.state_hash) {
    throw new StaleStateError(expectedStateHash, snapshot.state_hash);
  }
  onProgress?.({
    stage: "preparing",
    target_depth: body.depth,
    statistics: {
      completed_depth: 0,
      nodes: 0,
      chance_nodes: 0,
      transposition_hits: 0,
      maximin_cutoffs: 0,
      elapsed_ms: 0,
    },
  });
  if (!snapshot.state.available) {
    return {
      schema_version: 1,
      state_hash: snapshot.state_hash,
      generated_at: new Date().toISOString(),
      engine: "champions-native-core-v1",
      status: "idle",
      summary: "No active battle exists in this snapshot",
      depth: 0,
      nodes: 0,
      elapsed_ms: 0,
    };
  }
  let exactSheet = body.exactSheet;
  let perfectKnowledge;
  if (!isObject(exactSheet)) {
    try {
      const automatic = await buildAutomaticPerfectKnowledge(snapshot);
      exactSheet = automatic.sheet;
      perfectKnowledge = automatic.status;
    } catch (error) {
      return needsScenarioRecommendation(snapshot, engineFailureDetail(error));
    }
  } else {
    const automatic = await buildAutomaticPerfectKnowledge(snapshot);
    perfectKnowledge = {
      ...automatic.status,
      mode: "manual_override",
      summary: "A manual exact sheet replaced the automatic database assumptions for this run.",
    };
  }
  const matchObservationStatus = applyMatchObservations(
    exactSheet,
    await loadMatchObservations(),
    snapshot,
  );
  const matchLocalObservationCount = matchObservationStatus.team_override_count
    + matchObservationStatus.pokemon_override_count
    + matchObservationStatus.pending_move_target_count
    + matchObservationStatus.revealed_move_observation_count;
  if (matchLocalObservationCount > 0) {
    perfectKnowledge = {
      ...perfectKnowledge,
      match_local_observations: matchLocalObservationCount,
      match_local_team_overrides: matchObservationStatus.team_override_count,
      match_local_pokemon_overrides: matchObservationStatus.pokemon_override_count,
      match_local_pending_targets: matchObservationStatus.pending_move_target_count,
      match_local_revealed_moves: matchObservationStatus.revealed_move_observation_count,
    };
  }

  const depth = boundedInteger(body.depth, "depth", 1, 8);
  const nodes = boundedInteger(body.nodes, "nodes", 1_000, 2_000_000);
  const timeMs =
    body.timeMs === null
      ? null
      : boundedInteger(body.timeMs, "timeMs", 50, 30_000);
  const localTeamIndex = snapshot.state.local_team_index;
  const opponent = snapshot.state.teams.find((team) => team.team_index !== localTeamIndex);
  if (!opponent) {
    throw new Error(`Snapshot has no opponent for local team ${localTeamIndex}`);
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "champions-battle-lab-"));
  const sheetPath = join(temporaryDirectory, "exact-sheet.json");
  const scenarioPath = join(temporaryDirectory, "scenario.json");
  const startedAt = Date.now();
  try {
    await writeFile(sheetPath, `${JSON.stringify(exactSheet, null, 2)}\n`, "utf8");
    const scenario = await runNativeEngine(["scenario", source.filePath, sheetPath], { signal });
    JSON.parse(scenario.stdout);
    await writeFile(scenarioPath, scenario.stdout, "utf8");
    onProgress?.({
      stage: "searching",
      target_depth: depth,
      statistics: {
        completed_depth: 0,
        nodes: 0,
        chance_nodes: 0,
        transposition_hits: 0,
        maximin_cutoffs: 0,
        elapsed_ms: Date.now() - startedAt,
      },
    });
    const recommendation = await runNativeEngineWithProgress(
      [
        "recommend",
        source.filePath,
        String(localTeamIndex),
        String(opponent.team_index),
        scenarioPath,
        String(depth),
        String(nodes),
        timeMs === null ? "none" : String(timeMs),
      ],
      {
        signal,
        onProgress: (progress) => onProgress?.({ stage: "searching", ...progress }),
      },
    );
    const result = {
      ...JSON.parse(recommendation.stdout),
      generated_at: new Date().toISOString(),
      perfect_knowledge: perfectKnowledge,
    };
    await assertSourceStateIsCurrent(source, expectedStateHash);
    await saveWebRecommendation(result);
    return result;
  } catch (error) {
    if (error instanceof RecommendationCancelledError || error instanceof StaleStateError) {
      throw error;
    }
    if (signal?.aborted) {
      throw new RecommendationCancelledError();
    }
    const result = {
      schema_version: 1,
      state_hash: snapshot.state_hash,
      generated_at: new Date().toISOString(),
      engine: "champions-native-core-v1",
      status: "mechanics_blocked",
      summary: "The exact calculation stopped safely",
      detail: engineFailureDetail(error),
      depth: 0,
      nodes: 0,
      elapsed_ms: Date.now() - startedAt,
      perfect_knowledge: perfectKnowledge,
    };
    await assertSourceStateIsCurrent(source, expectedStateHash);
    await saveWebRecommendation(result);
    return result;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function publicRecommendationJob(job) {
  return {
    jobId: job.jobId,
    status: job.status,
    stateHash: job.stateHash,
    snapshotId: job.snapshotId,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    progress: job.progress,
    result: job.result,
    error: job.error,
  };
}

function pruneRecommendationJobs() {
  const finished = [...recommendationJobs.values()]
    .filter((job) => job.finishedAt)
    .sort((left, right) => left.finishedAt.localeCompare(right.finishedAt));
  while (recommendationJobs.size > 50 && finished.length > 0) {
    recommendationJobs.delete(finished.shift().jobId);
  }
}

async function createRecommendationJob(body) {
  const sources = await loadSourceRegistry();
  const source = selectSource(sources, String(body.snapshotId ?? ""));
  if (typeof body.stateHash !== "string" || body.stateHash !== source.stateHash) {
    throw new StaleStateError(String(body.stateHash ?? "missing"), source.stateHash);
  }
  boundedInteger(body.depth, "depth", 1, 8);
  boundedInteger(body.nodes, "nodes", 1_000, 2_000_000);
  if (body.timeMs !== null) {
    boundedInteger(body.timeMs, "timeMs", 50, 30_000);
  }

  const controller = new AbortController();
  const job = {
    jobId: randomUUID(),
    status: "queued",
    stateHash: source.stateHash,
    snapshotId: source.id,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    progress: {
      stage: "queued",
      target_depth: body.depth,
      statistics: {
        completed_depth: 0,
        nodes: 0,
        chance_nodes: 0,
        transposition_hits: 0,
        maximin_cutoffs: 0,
        elapsed_ms: 0,
      },
    },
    result: null,
    error: null,
    controller,
  };
  recommendationJobs.set(job.jobId, job);
  pruneRecommendationJobs();

  void Promise.resolve().then(async () => {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    try {
      const result = await calculateRecommendation(body, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) {
            job.progress = progress;
          }
        },
      });
      if (controller.signal.aborted) {
        throw new RecommendationCancelledError();
      }
      job.result = result;
      job.status = "complete";
      job.progress = {
        stage: "complete",
        target_depth: body.depth,
        score: result.score,
        statistics: {
          completed_depth: result.depth,
          nodes: result.nodes,
          chance_nodes: result.chance_nodes ?? 0,
          transposition_hits: result.transposition_hits ?? 0,
          maximin_cutoffs: result.maximin_cutoffs ?? 0,
          elapsed_ms: result.elapsed_ms,
        },
      };
    } catch (error) {
      if (error instanceof RecommendationCancelledError || controller.signal.aborted) {
        job.status = "cancelled";
        job.error = "The calculation was cancelled.";
        job.progress = { ...job.progress, stage: "cancelled" };
      } else if (error instanceof StaleStateError) {
        job.status = "stale";
        job.error = `Battle state changed from ${error.expectedStateHash} to ${error.actualStateHash}.`;
      } else {
        job.status = "failed";
        job.error = engineFailureDetail(error);
      }
    } finally {
      job.finishedAt = new Date().toISOString();
      pruneRecommendationJobs();
    }
  });

  return publicRecommendationJob(job);
}

function recommendationJob(jobId) {
  const job = recommendationJobs.get(jobId);
  if (!job) {
    const error = new Error(`Unknown recommendation job: ${jobId}`);
    error.statusCode = 404;
    throw error;
  }
  return job;
}

function cancelRecommendationJob(jobId) {
  const job = recommendationJob(jobId);
  if (job.status === "queued" || job.status === "running") {
    job.status = "cancelling";
    job.progress = { ...job.progress, stage: "cancelling" };
    job.controller.abort();
  }
  return publicRecommendationJob(job);
}

async function refreshDevice() {
  const connection = await prepareDeviceConnection();
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [bridgePath, "--once", "--no-push"],
      {
        cwd: repositoryRoot,
        maxBuffer: maximumEngineOutputBytes,
        timeout: engineTimeoutMs,
      },
    );
    if (stdout.includes("Waiting for the ChampionsAdvisor snapshot")) {
      throw new DeviceConnectionError(
        "SNAPSHOT_NOT_FOUND",
        "snapshot",
        "The iPhone is connected, but no Champions battle snapshot exists yet.",
        "Open Pokémon Champions with the advisor tweak enabled, then try Refresh from USB again.",
      );
    }
  } catch (error) {
    if (error instanceof DeviceConnectionError) {
      throw error;
    }
    throw new DeviceConnectionError(
      "SNAPSHOT_READ_FAILED",
      "snapshot",
      "The iPhone connection is ready, but Battle Lab could not read the latest snapshot.",
      "Keep the phone unlocked with Pokémon Champions open, then try Refresh from USB again.",
      engineFailureDetail(error),
    );
  }
  return { ...(await buildSession("capture:latest.json")), connection };
}

function requestFailure(error) {
  if (error instanceof DeviceConnectionError) {
    return {
      statusCode: 503,
      payload: {
        error: error.message,
        code: error.code,
        stage: error.stage,
        action: error.action,
        detail: error.detail,
      },
    };
  }
  if (error instanceof StaleStateError) {
    return {
      statusCode: 409,
      payload: {
        error: error.message,
        code: "STALE_BATTLE_STATE",
        expectedStateHash: error.expectedStateHash,
        actualStateHash: error.actualStateHash,
      },
    };
  }
  return {
    statusCode: Number.isInteger(error?.statusCode) ? error.statusCode : 500,
    payload: {
      error: "Battle Lab request failed",
      detail: engineFailureDetail(error),
    },
  };
}

function resolveStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const requested = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const normalizedPath = normalize(requested);
  const absolutePath = resolve(distDirectory, normalizedPath);
  if (absolutePath !== distDirectory && !absolutePath.startsWith(`${distDirectory}${sep}`)) {
    return null;
  }
  return absolutePath;
}

async function serveStatic(request, response, pathname) {
  let filePath = resolveStaticPath(pathname);
  if (!filePath) {
    sendJson(response, 400, { error: "Invalid asset path" });
    return;
  }
  try {
    const details = await stat(filePath);
    if (details.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
    await access(filePath);
  } catch {
    filePath = join(distDirectory, "index.html");
  }
  const details = await stat(filePath);
  response.writeHead(200, {
    "cache-control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=3600",
    "content-length": details.size,
    "content-type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

async function handleRequest(request, response) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  try {
    if (request.method === "GET" && url.pathname === "/api/champions/session") {
      sendJson(response, 200, await buildSession(url.searchParams.get("snapshot") ?? undefined));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/champions/advisor") {
      sendJson(response, 200, publicAdvisorStatus());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/champions/catalog") {
      sendJson(response, 200, await loadPublicCatalog());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/champions/assumptions") {
      const sources = await loadSourceRegistry();
      const source = selectSource(sources, url.searchParams.get("snapshot") ?? "");
      sendJson(response, 200, await buildAutomaticPerfectKnowledge(source.snapshot));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/champions/connect") {
      await readJsonBody(request);
      sendJson(response, 200, await prepareDeviceConnection());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/champions/recommend") {
      sendJson(response, 200, await calculateRecommendation(await readJsonBody(request)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/champions/recommend/jobs") {
      sendJson(response, 202, await createRecommendationJob(await readJsonBody(request)));
      return;
    }
    const recommendationJobMatch = url.pathname.match(
      /^\/api\/champions\/recommend\/jobs\/([0-9a-f-]+)$/i,
    );
    if (request.method === "GET" && recommendationJobMatch) {
      sendJson(response, 200, publicRecommendationJob(recommendationJob(recommendationJobMatch[1])));
      return;
    }
    if (request.method === "DELETE" && recommendationJobMatch) {
      sendJson(response, 200, cancelRecommendationJob(recommendationJobMatch[1]));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/champions/refresh") {
      await readJsonBody(request);
      sendJson(response, 200, await refreshDevice());
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "Unknown API endpoint" });
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    await serveStatic(request, response, url.pathname);
  } catch (error) {
    const failure = requestFailure(error);
    sendJson(response, failure.statusCode, failure.payload);
  }
}

export function createBattleLabServer() {
  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });
  server.on("close", () => {
    serverClosing = true;
    stopManagedAdvisorBridge();
    stopManagedTunnel();
    for (const job of recommendationJobs.values()) {
      job.controller.abort();
    }
  });
  return server;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await Promise.all([
    access(distDirectory),
    access(manifestPath),
    access(mechanicsPath),
    access(assumptionDatabasePath),
  ]);
  const server = createBattleLabServer();
  const shutdown = () => {
    serverClosing = true;
    stopManagedAdvisorBridge();
    stopManagedTunnel();
    server.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  server.listen(options.port, options.host, () => {
    console.log(`Champions Battle Lab ready at http://${options.host}:${options.port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
