import { ENGINE_DEFAULTS, generateJointActionPlans, resolveTurn } from "./core";
import { evaluateBattleState } from "./evaluate";
import type {
  BattleState,
  SearchBranchModel,
  SearchDiagnostics,
  SearchOptions,
  SearchPlanScore,
  SearchRecommendation,
} from "./types";

const FULL_TURN_BRANCHES = [
  {
    weight: 0.2,
    damageMode: "min" as const,
    accuracyMode: "conservative" as const,
    secondaryMode: "off" as const,
  },
  {
    weight: 0.6,
    damageMode: "average" as const,
    accuracyMode: "expected" as const,
    secondaryMode: "expected" as const,
  },
  {
    weight: 0.2,
    damageMode: "max" as const,
    accuracyMode: "optimistic" as const,
    secondaryMode: "on" as const,
  },
];

const EXPECTED_ONLY_BRANCHES = [
  {
    weight: 1,
    damageMode: "average" as const,
    accuracyMode: "expected" as const,
    secondaryMode: "expected" as const,
  },
];

const EXPECTED_PLUS_RISK_BRANCHES = [
  {
    weight: 0.75,
    damageMode: "average" as const,
    accuracyMode: "expected" as const,
    secondaryMode: "expected" as const,
  },
  {
    weight: 0.25,
    damageMode: "min" as const,
    accuracyMode: "conservative" as const,
    secondaryMode: "off" as const,
  },
];

type SearchContext = Required<Pick<SearchOptions, "maxJointPlansPerSide" | "maxIndividualActionsPerActor">> & {
  branches: typeof FULL_TURN_BRANCHES;
  diagnostics: SearchDiagnostics;
};

function createSearchDiagnostics(): SearchDiagnostics {
  return {
    searchNodes: 0,
    resolveTurnCalls: 0,
    generatedJointPlans: 0,
    planPairEvaluations: 0,
  };
}

function getTurnBranches(branchModel: SearchBranchModel) {
  switch (branchModel) {
    case "expectedOnly":
      return EXPECTED_ONLY_BRANCHES;
    case "expectedPlusRisk":
      return EXPECTED_PLUS_RISK_BRANCHES;
    case "full":
    default:
      return FULL_TURN_BRANCHES;
  }
}

function scoreJointPlans(
  state: BattleState,
  depth: number,
  context: SearchContext,
): SearchPlanScore[] {
  context.diagnostics.searchNodes += 1;

  const allyPlans = generateJointActionPlans(state, "ally", {
    maxIndividualActionsPerActor: context.maxIndividualActionsPerActor,
    maxJointPlans: context.maxJointPlansPerSide,
  });
  const enemyPlans = generateJointActionPlans(state, "enemy", {
    maxIndividualActionsPerActor: context.maxIndividualActionsPerActor,
    maxJointPlans: context.maxJointPlansPerSide,
  });
  context.diagnostics.generatedJointPlans += allyPlans.length + enemyPlans.length;

  return allyPlans.map((allyPlan) => {
    let bestEnemyResponse = enemyPlans[0] ?? null;
    let worstScore = Number.POSITIVE_INFINITY;
    let worstPreview = null as SearchPlanScore["preview"];

    for (const enemyPlan of enemyPlans) {
      context.diagnostics.planPairEvaluations += 1;
      let weightedScore = 0;
      let averagePreview = null as SearchPlanScore["preview"];

      for (const branch of context.branches) {
        context.diagnostics.resolveTurnCalls += 1;
        const preview = resolveTurn(state, allyPlan, enemyPlan, branch.damageMode, {
          accuracyMode: branch.accuracyMode,
          secondaryMode: branch.secondaryMode,
        });
        if (branch.damageMode === "average" && branch.accuracyMode === "expected") {
          averagePreview = preview;
        }

        const childScore =
          depth > 1
            ? evaluateRecursively(preview.state, depth - 1, context)
            : evaluateBattleState(preview.state);
        weightedScore += childScore * branch.weight;
      }

      if (weightedScore < worstScore) {
        worstScore = weightedScore;
        bestEnemyResponse = enemyPlan;
        worstPreview = averagePreview;
      }
    }

    return {
      plan: allyPlan,
      score: worstScore,
      enemyBestResponse: bestEnemyResponse,
      preview: worstPreview,
    };
  });
}

function evaluateRecursively(
  state: BattleState,
  depth: number,
  context: SearchContext,
): number {
  if (depth <= 0) {
    return evaluateBattleState(state);
  }

  const scores = scoreJointPlans(state, depth, context);
  if (scores.length === 0) {
    return evaluateBattleState(state);
  }

  return Math.max(...scores.map((entry) => entry.score));
}

export function recommendBestPlan(state: BattleState, options?: SearchOptions): SearchRecommendation {
  const depth = options?.depth ?? 2;
  const maxJointPlansPerSide = options?.maxJointPlansPerSide ?? ENGINE_DEFAULTS.maxJointPlans;
  const maxIndividualActionsPerActor =
    options?.maxIndividualActionsPerActor ?? ENGINE_DEFAULTS.maxIndividualActionsPerActor;
  const branchModel = options?.branchModel ?? "full";
  const diagnostics = createSearchDiagnostics();

  const scoredPlans = scoreJointPlans(state, depth, {
    maxJointPlansPerSide,
    maxIndividualActionsPerActor,
    branches: getTurnBranches(branchModel),
    diagnostics,
  }).sort((left, right) => right.score - left.score);

  const best = scoredPlans[0] ?? null;

  return {
    rootScore: best?.score ?? evaluateBattleState(state),
    depth,
    bestPlan: best?.plan ?? null,
    enemyBestResponse: best?.enemyBestResponse ?? null,
    preview: best?.preview ?? null,
    consideredPlans: scoredPlans.slice(0, 3),
    diagnostics,
  };
}
