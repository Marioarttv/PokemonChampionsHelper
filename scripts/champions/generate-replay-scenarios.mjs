import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { buildPerfectKnowledgeSheet } from "./perfect-knowledge.mjs";
import { applyMatchObservations } from "./match-observations.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const fixtureDirectory = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/engine/fixtures/replays/private-rain-2026-07-15",
);
const replayPath = resolve(fixtureDirectory, "replay.json");
const mechanicsPath = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/engine/data/champions-mechanics-v1.json",
);
const assumptionsPath = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/engine/data/opponent-assumptions-v1.json",
);
const observationsPath = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/captures/match-observations-v1.json",
);
const manifestPath = resolve(
  repositoryRoot,
  "native/ChampionsAdvisorHost/engine/Cargo.toml",
);
const scenarioDirectory = resolve(fixtureDirectory, "scenarios");

const [replay, mechanics, assumptions, observations] = await Promise.all([
  readFile(replayPath, "utf8").then(JSON.parse),
  readFile(mechanicsPath, "utf8").then(JSON.parse),
  readFile(assumptionsPath, "utf8").then(JSON.parse),
  readFile(observationsPath, "utf8").then(JSON.parse),
]);

await mkdir(scenarioDirectory, { recursive: true });
for (const [index, transition] of replay.transitions.entries()) {
  const snapshotPath = resolve(fixtureDirectory, transition.before);
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const { sheet } = buildPerfectKnowledgeSheet(snapshot, mechanics, assumptions);
  applyMatchObservations(sheet, observations, snapshot);
  const exactSheetPath = resolve(scenarioDirectory, `.turn-${index}.exact.json`);
  const scenarioPath = resolve(scenarioDirectory, `turn-${index}.json`);
  await writeFile(exactSheetPath, `${JSON.stringify(sheet, null, 2)}\n`, "utf8");
  try {
    const result = await execFileAsync(
      "cargo",
      [
        "run",
        "--quiet",
        "--release",
        "--manifest-path",
        manifestPath,
        "--",
        "scenario",
        snapshotPath,
        exactSheetPath,
      ],
      { cwd: repositoryRoot, maxBuffer: 64 * 1024 * 1024 },
    );
    const scenario = JSON.parse(result.stdout);
    await writeFile(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
    process.stdout.write(`generated ${scenarioPath}\n`);
  } finally {
    await import("node:fs/promises").then(({ rm }) => rm(exactSheetPath, { force: true }));
  }
}
