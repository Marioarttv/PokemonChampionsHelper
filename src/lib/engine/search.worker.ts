import { recommendBestPlan } from "./search";
import type { BattleState, SearchOptions, SearchRecommendation } from "./types";

type SearchWorkerRequest = {
  id: number;
  state: BattleState;
  options?: SearchOptions;
};

type SearchWorkerResponse =
  | {
      id: number;
      recommendation: SearchRecommendation;
    }
  | {
      id: number;
      error: string;
    };

self.onmessage = (event: MessageEvent<SearchWorkerRequest>) => {
  const { id, state, options } = event.data;

  try {
    const recommendation = recommendBestPlan(state, options);
    const response: SearchWorkerResponse = { id, recommendation };
    self.postMessage(response);
  } catch (error) {
    const response: SearchWorkerResponse = {
      id,
      error: error instanceof Error ? error.message : "Unknown search error",
    };
    self.postMessage(response);
  }
};

export {};
