import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const fixtureDirectory = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/engine/fixtures/replays/private-rain-2026-07-15",
);
const replayPath = resolve(fixtureDirectory, "replay.json");
const binaryPath = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/engine/target/release/champions-advisor-protocol",
);
const label = process.argv[2];
if (!label) {
  throw new Error("Usage: node scripts/champions/infer-replay-plans.mjs TRANSITION_LABEL [TOLERANCE]");
}
const tolerance = Number(process.argv[3] ?? 100);
if (!Number.isInteger(tolerance) || tolerance < 0) {
  throw new Error(`Invalid remote HP tolerance ${process.argv[3]}`);
}

const replay = JSON.parse(await readFile(replayPath, "utf8"));
const transitionIndex = replay.transitions.findIndex((entry) => entry.label === label);
if (transitionIndex < 0) {
  throw new Error(`Replay has no transition named ${label}`);
}
const transition = replay.transitions[transitionIndex];
const beforePath = resolve(fixtureDirectory, transition.before);
const afterPath = resolve(fixtureDirectory, transition.after);
const scenarioPath = resolve(fixtureDirectory, `scenarios/turn-${transitionIndex}.json`);
const before = JSON.parse(await readFile(beforePath, "utf8"));
const after = JSON.parse(await readFile(afterPath, "utf8"));
const teamIndices = before.state.teams.map((team) => team.team_index);
if (teamIndices.length !== 2) {
  throw new Error(`Expected two teams, found ${teamIndices.length}`);
}
const initialReplacements = transition.prediction?.initial_replacements
  ?? transition.actions
    .filter((evidence) => evidence.kind === "switch")
    .map((evidence) => {
      const replacement = after.state.teams
        .find((team) => team.team_index === evidence.replacement.team_index)?.pokemon
        .find((pokemon) => pokemon.group_index === evidence.replacement.group_index);
      const position = replacement?.side_index >= 0 && replacement?.position_index >= 0
        ? {
            side_index: replacement.side_index,
            position_index: replacement.position_index,
          }
        : undefined;
      return { actor: evidence.actor, replacement: evidence.replacement, position };
    });
const temporaryDirectory = await mkdtemp(join(tmpdir(), "champions-replay-infer-"));
const replacementsPath = join(temporaryDirectory, "initial-replacements.json");
await writeFile(replacementsPath, `${JSON.stringify(initialReplacements)}\n`, "utf8");

const forcedReplacements = transition.prediction?.forced_replacements
  ?? [];

async function jointPlans(teamIndex) {
  const arguments_ = initialReplacements.length > 0
    ? [
        "actions-after-replacements",
        beforePath,
        String(teamIndex),
        scenarioPath,
        replacementsPath,
      ]
    : ["actions", beforePath, String(teamIndex), scenarioPath];
  const { stdout } = await execFileAsync(
    binaryPath,
    arguments_,
    { cwd: repositoryRoot, maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(stdout).jointPlans;
}

function sameKey(left, right) {
  return left?.team_index === right?.team_index
    && left?.group_index === right?.group_index;
}

function actionMatchesEvidence(action, evidence) {
  if (!sameKey(action.actor, evidence.actor) || action.kind !== evidence.kind) {
    return false;
  }
  if (evidence.kind === "use_move") {
    if (action.md_id !== evidence.md_id || Boolean(action.mega) !== Boolean(evidence.mega)) {
      return false;
    }
    if (evidence.target?.kind === "pokemon") {
      if (action.target?.kind !== "pokemon"
        || !sameKey(action.target.key, evidence.target.key)) {
        return false;
      }
    }
    if (evidence.replacement && !sameKey(action.replacement, evidence.replacement)) {
      return false;
    }
  }
  if (evidence.kind === "switch") {
    return sameKey(action.replacement, evidence.replacement);
  }
  return true;
}

function planMatchesEvidence(plan) {
  return transition.actions
    .filter((evidence) => evidence.actor.team_index === plan.team_index)
    .filter((evidence) => evidence.kind !== "unknown" && evidence.kind !== "switch")
    .every((evidence) => plan.actions.some((action) => actionMatchesEvidence(action, evidence)));
}

const [leftCandidates, rightCandidates] = await Promise.all(
  teamIndices.map(async (teamIndex) => (await jointPlans(teamIndex)).filter(planMatchesEvidence)),
);
if (leftCandidates.length === 0 || rightCandidates.length === 0) {
  throw new Error(
    `Evidence eliminated all plans (${leftCandidates.length} x ${rightCandidates.length})`,
  );
}

const pairs = leftCandidates.flatMap((leftPlan) =>
  rightCandidates.map((rightPlan) => ({ leftPlan, rightPlan })));
const results = new Array(pairs.length);
let nextPair = 0;

async function evaluatePair(workerIndex) {
  while (nextPair < pairs.length) {
    const pairIndex = nextPair;
    nextPair += 1;
    const pair = pairs[pairIndex];
    const candidateTransition = {
      ...transition,
      before: beforePath,
      after: afterPath,
      prediction: {
        scenario: scenarioPath,
        left_plan: pair.leftPlan,
        right_plan: pair.rightPlan,
        remote_hp_tolerance_basis_points: tolerance,
        forced_replacements: forcedReplacements,
        initial_replacements: initialReplacements,
      },
    };
    const candidateFixture = {
      schema_version: 1,
      name: `${replay.name}-${label}-candidate-${pairIndex}`,
      notes: [],
      transitions: [candidateTransition],
    };
    const candidatePath = join(temporaryDirectory, `candidate-${workerIndex}.json`);
    await writeFile(candidatePath, `${JSON.stringify(candidateFixture)}\n`, "utf8");
    let stdout;
    try {
      ({ stdout } = await execFileAsync(binaryPath, ["replay", candidatePath], {
        cwd: repositoryRoot,
        maxBuffer: 64 * 1024 * 1024,
      }));
    } catch (error) {
      stdout = error.stdout;
    }
    const report = JSON.parse(stdout).transitions[0].prediction;
    results[pairIndex] = {
      ...pair,
      status: report.status,
      mismatchCount: report.mismatches.length,
      mismatches: report.mismatches,
      successorCount: report.successor_count,
      matchedBranchIndex: report.matched_branch_index,
      matchedProbability: report.matched_probability,
    };
  }
}

try {
  await Promise.all(Array.from({ length: Math.min(8, pairs.length) }, (_, index) =>
    evaluatePair(index)));
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

results.sort((left, right) =>
  Number(right.status === "matched") - Number(left.status === "matched")
    || Number(left.status === "blocked") - Number(right.status === "blocked")
    || left.mismatchCount - right.mismatchCount
    || left.successorCount - right.successorCount);
process.stdout.write(`${JSON.stringify({
  label,
  tolerance,
  candidate_counts: {
    left: leftCandidates.length,
    right: rightCandidates.length,
    pairs: pairs.length,
  },
  matches: results.filter((entry) => entry.status === "matched").length,
  best: results.slice(0, 10),
}, null, 2)}\n`);
