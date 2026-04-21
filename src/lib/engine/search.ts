import { ENGINE_DEFAULTS, generateJointActionPlans, resolveTurn } from "./core";
import { evaluateBattleState } from "./evaluate";
import type {
  BranchPolicy,
  BattleState,
  SearchBranchModel,
  SearchDiagnostics,
  SearchOptions,
  SearchPlanScore,
  SearchRecommendation,
} from "./types";

const FULL_TURN_BRANCHES = [
  {
    label: "low-roll",
    weight: 0.2,
    damageMode: "min" as const,
    accuracyMode: "conservative" as const,
    secondaryMode: "off" as const,
  },
  {
    label: "expected",
    weight: 0.6,
    damageMode: "average" as const,
    accuracyMode: "expected" as const,
    secondaryMode: "expected" as const,
  },
  {
    label: "high-roll",
    weight: 0.2,
    damageMode: "max" as const,
    accuracyMode: "optimistic" as const,
    secondaryMode: "on" as const,
  },
] satisfies BranchPolicy["branches"];

const EXPECTED_ONLY_BRANCHES = [
  {
    label: "expected",
    weight: 1,
    damageMode: "average" as const,
    accuracyMode: "expected" as const,
    secondaryMode: "expected" as const,
  },
] satisfies BranchPolicy["branches"];

const EXPECTED_PLUS_RISK_BRANCHES = [
  {
    label: "expected",
    weight: 0.75,
    damageMode: "average" as const,
    accuracyMode: "expected" as const,
    secondaryMode: "expected" as const,
  },
  {
    label: "risk-averse",
    weight: 0.25,
    damageMode: "min" as const,
    accuracyMode: "conservative" as const,
    secondaryMode: "off" as const,
  },
] satisfies BranchPolicy["branches"];

type SearchContext = Required<Pick<SearchOptions, "maxJointPlansPerSide" | "maxIndividualActionsPerActor">> & {
  branches: BranchPolicy["branches"];
  diagnostics: SearchDiagnostics;
};

function createSearchDiagnostics(): SearchDiagnostics {
  return {
    searchNodes: 0,
    resolveTurnCalls: 0,
    generatedJointPlans: 0,
    planPairEvaluations: 0,
    enemyAssumptions: [],
  };
}

function getBranchPolicy(branchModel: SearchBranchModel, branchPolicy?: BranchPolicy): BranchPolicy {
  if (branchPolicy?.branches?.length) {
    return branchPolicy;
  }

  switch (branchModel) {
    case "expectedOnly":
      return { key: "expectedOnly", branches: EXPECTED_ONLY_BRANCHES };
    case "expectedPlusRisk":
      return { key: "expectedPlusRisk", branches: EXPECTED_PLUS_RISK_BRANCHES };
    case "full":
    default:
      return { key: "full", branches: FULL_TURN_BRANCHES };
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
  const branchPolicy = getBranchPolicy(branchModel, options?.branchPolicy);
  const diagnostics = createSearchDiagnostics();
  diagnostics.enemyAssumptions = Object.values(state.combatants)
    .filter((combatant) => combatant.side === "enemy")
    .flatMap((combatant) =>
      combatant.candidateMoves.map(
        (move) => `${combatant.label}:${move.name}:${move.candidateSource ?? "candidate"}:${move.candidateWeight.toFixed(2)}`,
      ),
    );

  const scoredPlans = scoreJointPlans(state, depth, {
    maxJointPlansPerSide,
    maxIndividualActionsPerActor,
    branches: branchPolicy.branches,
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
