import { recommendBestPlan } from "./search";
import type { BattleState, SearchMode, SearchOptions } from "./types";

export type EngineBenchmarkFixture = {
  name: string;
  state: BattleState;
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
  modes: SearchMode[] = ["fast", "balanced", "deep"],
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
