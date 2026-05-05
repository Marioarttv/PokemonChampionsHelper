import { recommendBestPlan } from "./search";
import type { BattleState, SearchMode, SearchOptions } from "./types";

export type EngineBenchmarkFixture = {
  name: string;
  state: BattleState;
};

export type EngineLineBenchmarkExpectation = {
  bestPlanIncludes?: string[];
  bestPlanExcludes?: string[];
  predictedEnemyIncludes?: string[];
  predictedEnemyExcludes?: string[];
  enemyBestResponseIncludes?: string[];
  enemyBestResponseExcludes?: string[];
  minDepthReached?: number;
  maxSearchNodes?: number;
};

export type EngineLineBenchmarkFixture = EngineBenchmarkFixture & {
  note: string;
  options?: SearchOptions;
  expected: EngineLineBenchmarkExpectation;
};

export type EngineBenchmarkResult = {
  fixture: string;
  mode: SearchMode;
  elapsedMs: number;
  depthReached: number;
  searchNodes: number;
  ttHitRate: number;
};

export function runEngineBenchmark(
  fixtures: EngineBenchmarkFixture[],
  modes: SearchMode[] = ["fast", "balanced", "tactical", "deep"],
  baseOptions?: SearchOptions,
) {
  const results: EngineBenchmarkResult[] = [];

  for (const fixture of fixtures) {
    for (const mode of modes) {
      const recommendation = recommendBestPlan(fixture.state, {
        ...baseOptions,
        searchMode: mode,
      });
      const ttEvents = recommendation.diagnostics.ttHits + recommendation.diagnostics.ttStores;
      results.push({
        fixture: fixture.name,
        mode,
        elapsedMs: recommendation.diagnostics.elapsedMs,
        depthReached: recommendation.depthReached,
        searchNodes: recommendation.diagnostics.searchNodes,
        ttHitRate: ttEvents > 0 ? recommendation.diagnostics.ttHits / ttEvents : 0,
      });
    }
  }

  return results;
}

export type EngineLineBenchmarkResult = {
  fixture: string;
  note: string;
  passed: boolean;
  failures: string[];
  bestPlanSummary: string;
  predictedEnemySummary: string;
  enemyBestResponseSummary: string;
  elapsedMs: number;
  depthReached: number;
  searchNodes: number;
};

function checkIncludes(
  failures: string[],
  label: string,
  summary: string,
  expectedIncludes?: string[],
) {
  for (const expected of expectedIncludes ?? []) {
    if (!summary.includes(expected)) {
      failures.push(`${label} should include "${expected}", got "${summary || "<none>"}"`);
    }
  }
}

function checkExcludes(
  failures: string[],
  label: string,
  summary: string,
  expectedExcludes?: string[],
) {
  for (const expected of expectedExcludes ?? []) {
    if (summary.includes(expected)) {
      failures.push(`${label} should not include "${expected}", got "${summary}"`);
    }
  }
}

export function runEngineLineBenchmark(
  fixtures: EngineLineBenchmarkFixture[],
  baseOptions?: SearchOptions,
) {
  return fixtures.map((fixture): EngineLineBenchmarkResult => {
    const recommendation = recommendBestPlan(fixture.state, {
      ...baseOptions,
      ...fixture.options,
    });
    const bestPlanSummary = recommendation.bestPlan?.summary ?? "";
    const predictedEnemySummary = recommendation.predictedEnemyResponse?.summary ?? "";
    const enemyBestResponseSummary = recommendation.enemyBestResponse?.summary ?? "";
    const failures: string[] = [];

    checkIncludes(failures, "best plan", bestPlanSummary, fixture.expected.bestPlanIncludes);
    checkExcludes(failures, "best plan", bestPlanSummary, fixture.expected.bestPlanExcludes);
    checkIncludes(
      failures,
      "predicted enemy response",
      predictedEnemySummary,
      fixture.expected.predictedEnemyIncludes,
    );
    checkExcludes(
      failures,
      "predicted enemy response",
      predictedEnemySummary,
      fixture.expected.predictedEnemyExcludes,
    );
    checkIncludes(
      failures,
      "enemy best response",
      enemyBestResponseSummary,
      fixture.expected.enemyBestResponseIncludes,
    );
    checkExcludes(
      failures,
      "enemy best response",
      enemyBestResponseSummary,
      fixture.expected.enemyBestResponseExcludes,
    );

    if (
      typeof fixture.expected.minDepthReached === "number" &&
      recommendation.depthReached < fixture.expected.minDepthReached
    ) {
      failures.push(
        `depth should reach ${fixture.expected.minDepthReached}, got ${recommendation.depthReached}`,
      );
    }

    if (
      typeof fixture.expected.maxSearchNodes === "number" &&
      recommendation.diagnostics.searchNodes > fixture.expected.maxSearchNodes
    ) {
      failures.push(
        `search nodes should be <= ${fixture.expected.maxSearchNodes}, got ${recommendation.diagnostics.searchNodes}`,
      );
    }

    return {
      fixture: fixture.name,
      note: fixture.note,
      passed: failures.length === 0,
      failures,
      bestPlanSummary,
      predictedEnemySummary,
      enemyBestResponseSummary,
      elapsedMs: recommendation.diagnostics.elapsedMs,
      depthReached: recommendation.depthReached,
      searchNodes: recommendation.diagnostics.searchNodes,
    };
  });
}
