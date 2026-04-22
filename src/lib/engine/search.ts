import { getBelievedMoves, summarizeEnemyBeliefs } from "./beliefs";
import { ENGINE_DEFAULTS, generateJointActionPlans, getMoveOption, resolveTurn } from "./core";
import { evaluateBattleState } from "./evaluate";
import { buildSearchStateKey } from "./hash";
import { TranspositionTable, type CachedSearchBundle } from "./transposition";
import type {
  BranchPolicy,
  BattleState,
  JointActionPlan,
  ObjectiveMode,
  SearchBranchModel,
  SearchBudgetSnapshot,
  SearchDiagnostics,
  SearchMode,
  SearchOptions,
  SearchPlanScore,
  SearchPvStep,
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

const DEFAULT_STAGE_TOP_K: Record<SearchMode, number> = {
  fast: 0,
  balanced: 0,
  deep: 3,
};

const DEFAULT_MAX_DEPTH: Record<SearchMode, number> = {
  fast: 1,
  balanced: 2,
  deep: 3,
};

const DEFAULT_MAX_NODES: Record<SearchMode, number> = {
  fast: 350,
  balanced: 1_600,
  deep: 4_500,
};

const DEFAULT_MAX_MS: Record<SearchMode, number> = {
  fast: 20,
  balanced: 60,
  deep: 140,
};

const DEFAULT_MAX_SELECTIVE_EXTENSIONS: Record<SearchMode, number> = {
  fast: 0,
  balanced: 0,
  deep: 2,
};

const DEFAULT_HYBRID_LAMBDA = 0.65;

type SearchContext = Required<
  Pick<SearchOptions, "maxJointPlansPerSide" | "maxIndividualActionsPerActor" | "branchModel">
> & {
  budget: SearchBudgetSnapshot;
  branches: BranchPolicy["branches"];
  orderingBranches: BranchPolicy["branches"];
  diagnostics: SearchDiagnostics;
  transposition: TranspositionTable;
  startedAt: number;
  signal: AbortSignal | null;
  pvHints: Map<number, { allySummary: string | null; enemySummary: string | null }>;
  historyScores: Map<string, number>;
};

type SearchPlanEvaluation = SearchPlanScore & {
  predictedPv: SearchPvStep[];
};

type WeightedEnemyPlan = {
  plan: JointActionPlan;
  policyWeight: number;
};

class SearchAbortedError extends Error {
  constructor() {
    super("Search budget exhausted");
  }
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
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

function getDefaultBranchModel(searchMode: SearchMode): SearchBranchModel {
  if (searchMode === "fast") {
    return "expectedPlusRisk";
  }
  return "full";
}

function normalizeSearchBudget(options?: SearchOptions): SearchBudgetSnapshot {
  const searchMode = options?.searchMode ?? "balanced";
  const objectiveMode = options?.objectiveMode ?? "robust";
  const maxDepth = Math.max(1, Math.round(options?.maxDepth ?? options?.depth ?? DEFAULT_MAX_DEPTH[searchMode]));
  const maxNodes = Math.max(1, Math.round(options?.maxNodes ?? DEFAULT_MAX_NODES[searchMode]));
  const maxMs = Math.max(1, Math.round(options?.maxMs ?? DEFAULT_MAX_MS[searchMode]));
  const stageTopK = Math.max(0, Math.round(options?.stageTopK ?? DEFAULT_STAGE_TOP_K[searchMode]));
  const maxSelectiveExtensions = Math.max(
    0,
    Math.round(options?.maxSelectiveExtensions ?? DEFAULT_MAX_SELECTIVE_EXTENSIONS[searchMode]),
  );

  return {
    maxDepth,
    maxNodes,
    maxMs,
    searchMode,
    objectiveMode,
    hybridLambda: options?.hybridLambda ?? DEFAULT_HYBRID_LAMBDA,
    stageTopK,
    maxSelectiveExtensions,
  };
}

function createSearchDiagnostics(
  budget: SearchBudgetSnapshot,
  branchModelUsed: string,
  state: BattleState,
): SearchDiagnostics {
  const enemyBeliefs = summarizeEnemyBeliefs(state, { topN: 4 });
  return {
    elapsedMs: 0,
    depthReached: 0,
    searchNodes: 0,
    resolveTurnCalls: 0,
    generatedJointPlans: 0,
    planPairEvaluations: 0,
    ttHits: 0,
    ttStores: 0,
    cutoffs: 0,
    branchModelUsed,
    objectiveMode: budget.objectiveMode,
    searchMode: budget.searchMode,
    completedIterations: 0,
    enemyAssumptions: enemyBeliefs.flatMap((combatant) =>
      combatant.moves.map(
        (move) =>
          `${combatant.label}:${move.moveName}:${move.source}:${move.policyWeight.toFixed(2)}:${move.certainty.toFixed(2)}`,
      ),
    ),
    enemyBeliefs,
    pv: [],
  };
}

function bundleFromScalar(score: number): CachedSearchBundle {
  return {
    robustScore: score,
    likelyScore: score,
    hybridScore: score,
    pv: [],
  };
}

function getObjectiveScore(bundle: Pick<CachedSearchBundle, "robustScore" | "likelyScore" | "hybridScore">, objectiveMode: ObjectiveMode) {
  if (objectiveMode === "likely") {
    return bundle.likelyScore;
  }
  if (objectiveMode === "hybrid") {
    return bundle.hybridScore;
  }
  return bundle.robustScore;
}

function assertSearchBudget(context: SearchContext) {
  if (context.signal?.aborted) {
    throw new SearchAbortedError();
  }
  if (context.diagnostics.searchNodes >= context.budget.maxNodes) {
    throw new SearchAbortedError();
  }
  if (nowMs() - context.startedAt >= context.budget.maxMs) {
    throw new SearchAbortedError();
  }
}

function getPlanHistoryKey(side: "ally" | "enemy", plan: JointActionPlan) {
  return `${side}::${plan.summary}`;
}

function orderPlans(
  plans: JointActionPlan[],
  side: "ally" | "enemy",
  ply: number,
  context: SearchContext,
) {
  const pvHint = context.pvHints.get(ply);
  const hintedSummary = side === "ally" ? pvHint?.allySummary : pvHint?.enemySummary;

  return [...plans].sort((left, right) => {
    const leftPvBonus = left.summary === hintedSummary ? 1 : 0;
    const rightPvBonus = right.summary === hintedSummary ? 1 : 0;
    if (leftPvBonus !== rightPvBonus) {
      return rightPvBonus - leftPvBonus;
    }

    const leftHistory = context.historyScores.get(getPlanHistoryKey(side, left)) ?? 0;
    const rightHistory = context.historyScores.get(getPlanHistoryKey(side, right)) ?? 0;
    if (leftHistory !== rightHistory) {
      return rightHistory - leftHistory;
    }

    return right.heuristicScore - left.heuristicScore;
  });
}

function getMoveInferencePenalty(state: BattleState, plan: JointActionPlan) {
  return plan.actions.reduce((sum, action) => {
    if (action.action.type !== "move") {
      return sum;
    }
    const move = getMoveOption(state, action.actorId, action.action.moveId);
    if (!move) {
      return sum;
    }
    return sum + (move.source === "candidate" || move.source === "inferred" || move.source === "assumed" ? 1 : 0);
  }, 0);
}

function planDependsOnInference(state: BattleState, plan: JointActionPlan | null) {
  return plan ? getMoveInferencePenalty(state, plan) > 0 : false;
}

function buildActionIdentity(plan: JointActionPlan["actions"][number]) {
  const { action } = plan;
  switch (action.type) {
    case "move":
      return `${action.actorId}::move::${action.moveId}::${action.targetId ?? ""}`;
    case "switch":
      return `${action.actorId}::switch::${action.switchInId}`;
    case "pass":
    default:
      return `${action.actorId}::pass`;
  }
}

function scoreToLikelihoodFactor(score: number) {
  return Math.exp(Math.max(-3, Math.min(3, score / 90)));
}

function buildEnemyActionPriorLookup(enemyPlans: JointActionPlan[]) {
  const rawActionWeightsByActor = new Map<string, Map<string, number>>();

  for (const plan of enemyPlans) {
    for (const entry of plan.actions) {
      const actionKey = buildActionIdentity(entry);
      const actorWeights = rawActionWeightsByActor.get(entry.actorId) ?? new Map<string, number>();
      const nextWeight = Math.max(actorWeights.get(actionKey) ?? 0, scoreToLikelihoodFactor(entry.heuristicScore));
      actorWeights.set(actionKey, nextWeight);
      rawActionWeightsByActor.set(entry.actorId, actorWeights);
    }
  }

  const priors = new Map<string, number>();
  for (const [actorId, actionWeights] of rawActionWeightsByActor.entries()) {
    const total = [...actionWeights.values()].reduce((sum, weight) => sum + weight, 0) || 1;
    for (const [actionKey, weight] of actionWeights.entries()) {
      priors.set(`${actorId}::${actionKey}`, weight / total);
    }
  }

  return priors;
}

function getEnemyPlanPolicyWeights(state: BattleState, enemyPlans: JointActionPlan[]): WeightedEnemyPlan[] {
  if (enemyPlans.length === 0) {
    return [];
  }

  const actionPriorLookup = buildEnemyActionPriorLookup(enemyPlans);
  const moveBeliefsByActor = new Map(
    Object.values(state.combatants)
      .filter((combatant) => combatant.side === "enemy")
      .map((combatant) => [
        combatant.id,
        new Map(getBelievedMoves(combatant, { topN: 6 }).map((entry) => [entry.move.id, entry])),
      ]),
  );

  const rawWeights = enemyPlans.map((plan) => {
    const actorWeight = plan.actions.reduce((product, action) => {
      const resolvedAction = action.action;
      const actionKey = `${action.actorId}::${buildActionIdentity(action)}`;
      const actionPrior = actionPriorLookup.get(actionKey) ?? 0.05;

      if (resolvedAction.type === "switch" || resolvedAction.type === "pass") {
        return product * Math.max(0.02, actionPrior);
      }

      const actorBeliefs = moveBeliefsByActor.get(action.actorId);
      const moveMembership = actorBeliefs?.get(resolvedAction.moveId)?.certainty ?? 0.05;
      return product * Math.max(0.01, moveMembership * actionPrior);
    }, 1);

    const planHeuristicFactor = scoreToLikelihoodFactor(plan.heuristicScore);
    return Math.max(0.0001, actorWeight * planHeuristicFactor);
  });

  const total = rawWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  return enemyPlans.map((plan, index) => ({
    plan,
    policyWeight: rawWeights[index] / total,
  }));
}

function getSelectiveExtensionReasons(state: BattleState) {
  const reasons: string[] = [];
  const activeCombatants = state.sides.ally.activeIds
    .concat(state.sides.enemy.activeIds)
    .map((combatantId) => (combatantId ? state.combatants[combatantId] : null))
    .filter((combatant): combatant is NonNullable<typeof combatant> => Boolean(combatant && combatant.currentHp > 0));

  const imminentKoRace = activeCombatants.some((combatant) => {
    const hpPercent = combatant.maxHp > 0 ? (combatant.currentHp / combatant.maxHp) * 100 : 0;
    return hpPercent <= 35;
  });
  if (imminentKoRace) {
    reasons.push("imminent-ko-race");
  }

  if (state.sides.ally.tailwindTurns === 1 || state.sides.enemy.tailwindTurns === 1 || state.field.trickRoomTurns === 1) {
    reasons.push("speed-control-expiring");
  }

  if (activeCombatants.some((combatant) => combatant.encoreTurns > 0 || combatant.disableTurns > 0 || combatant.isProtected)) {
    reasons.push("lock-trap-pressure");
  }

  if (
    (state.sides.ally.redirectionTargetId ?? state.sides.enemy.redirectionTargetId) ||
    state.sides.ally.allySwitchPair ||
    state.sides.enemy.allySwitchPair
  ) {
    reasons.push("positioning-trick");
  }

  const allyAlive = Object.values(state.combatants).filter((combatant) => combatant.side === "ally" && combatant.currentHp > 0).length;
  const enemyAlive = Object.values(state.combatants).filter((combatant) => combatant.side === "enemy" && combatant.currentHp > 0).length;
  if (allyAlive <= 2 || enemyAlive <= 2) {
    reasons.push("low-count-endgame");
  }

  return reasons;
}

function selectDeepSearchCandidates(
  state: BattleState,
  plans: JointActionPlan[],
  context: SearchContext,
) {
  if (context.budget.searchMode !== "deep" || context.budget.stageTopK <= 0 || plans.length <= context.budget.stageTopK) {
    return plans;
  }

  const stagedEnemyPlans = generateJointActionPlans(state, "enemy", {
    maxIndividualActionsPerActor: Math.max(2, Math.min(context.maxIndividualActionsPerActor, 3)),
    maxJointPlans: Math.max(2, Math.min(context.maxJointPlansPerSide, 4)),
  });
  if (stagedEnemyPlans.length === 0) {
    return plans;
  }

  const quickPolicy = context.orderingBranches;
  const enemyWeights = getEnemyPlanPolicyWeights(state, stagedEnemyPlans);
  const scored = plans.map((plan) => {
    let worstRobust = Number.POSITIVE_INFINITY;
    let likely = 0;

    for (const enemyEntry of enemyWeights) {
      let weightedScore = 0;
      for (const branch of quickPolicy) {
        context.diagnostics.resolveTurnCalls += 1;
        const preview = resolveTurn(state, plan, enemyEntry.plan, branch.damageMode, {
          accuracyMode: branch.accuracyMode,
          secondaryMode: branch.secondaryMode,
        });
        weightedScore += evaluateBattleState(preview.state) * branch.weight;
      }
      worstRobust = Math.min(worstRobust, weightedScore);
      likely += weightedScore * enemyEntry.policyWeight;
    }

    if (!Number.isFinite(worstRobust)) {
      worstRobust = evaluateBattleState(state);
      likely = worstRobust;
    }

    return {
      plan,
      // TODO: stage ordering is intentionally objective-agnostic for now. If deep-mode pruning starts
      // dropping true robust-best lines in practice, switch this to an objective-aware staging score.
      orderingScore: context.budget.hybridLambda * worstRobust + (1 - context.budget.hybridLambda) * likely,
    };
  });

  return scored
    .sort((left, right) => right.orderingScore - left.orderingScore)
    .slice(0, context.budget.stageTopK)
    .map((entry) => entry.plan);
}

function updateHistoryScore(context: SearchContext, side: "ally" | "enemy", plan: JointActionPlan | null) {
  if (!plan) {
    return;
  }
  const key = getPlanHistoryKey(side, plan);
  context.historyScores.set(key, (context.historyScores.get(key) ?? 0) + 1);
}

function buildTranspositionKey(
  state: BattleState,
  depth: number,
  extensionsRemaining: number,
  context: SearchContext,
) {
  // The TT key only hashes public engine state plus static search context. This remains sound
  // because hidden-information beliefs are treated as immutable during a single search call.
  // If future search work mutates beliefs inside the tree, the belief state must also join this key.
  return [
    context.budget.searchMode,
    context.budget.objectiveMode,
    context.branchModel,
    depth,
    extensionsRemaining,
    buildSearchStateKey(state),
  ].join("::");
}

function evaluateNode(
  state: BattleState,
  depth: number,
  ply: number,
  extensionsRemaining: number,
  context: SearchContext,
): CachedSearchBundle {
  assertSearchBudget(context);
  context.diagnostics.searchNodes += 1;

  if (depth <= 0) {
    // Selective deepening only triggers from explicit, debuggable tactical hooks.
    if (extensionsRemaining > 0) {
      const extensionReasons = getSelectiveExtensionReasons(state);
      if (extensionReasons.length > 0) {
        const extended = evaluateNode(state, 1, ply, extensionsRemaining - 1, context);
        return {
          ...extended,
          pv: extended.pv.map((step, index) =>
            index === 0
              ? {
                  ...step,
                  extensionReasons: [...step.extensionReasons, ...extensionReasons],
                }
              : step,
          ),
        };
      }
    }
    return bundleFromScalar(evaluateBattleState(state));
  }

  const cacheKey = buildTranspositionKey(state, depth, extensionsRemaining, context);
  const cached = context.transposition.get(cacheKey, depth);
  if (cached) {
    context.diagnostics.ttHits += 1;
    return cached;
  }

  let allyPlans = generateJointActionPlans(state, "ally", {
    maxIndividualActionsPerActor: context.maxIndividualActionsPerActor,
    maxJointPlans: context.maxJointPlansPerSide,
  });
  const enemyPlans = generateJointActionPlans(state, "enemy", {
    maxIndividualActionsPerActor: context.maxIndividualActionsPerActor,
    maxJointPlans: context.maxJointPlansPerSide,
  });

  context.diagnostics.generatedJointPlans += allyPlans.length + enemyPlans.length;

  if (allyPlans.length === 0 || enemyPlans.length === 0) {
    return bundleFromScalar(evaluateBattleState(state));
  }

  allyPlans = selectDeepSearchCandidates(state, orderPlans(allyPlans, "ally", ply, context), context);
  const orderedEnemyPlans = orderPlans(enemyPlans, "enemy", ply, context);
  const enemyPlanWeights = getEnemyPlanPolicyWeights(state, orderedEnemyPlans);

  let bestPlanResult: SearchPlanEvaluation | null = null;
  let alphaRobust = Number.NEGATIVE_INFINITY;

  for (const allyPlan of allyPlans) {
    assertSearchBudget(context);
    context.diagnostics.planPairEvaluations += enemyPlanWeights.length;

    let worstRobust = Number.POSITIVE_INFINITY;
    let likelyScore = 0;
    let worstEntry: {
      plan: JointActionPlan;
      preview: SearchPlanEvaluation["preview"];
      bundle: CachedSearchBundle;
    } | null = null;
    let predictedEntry: {
      plan: JointActionPlan;
      preview: SearchPlanEvaluation["preview"];
      bundle: CachedSearchBundle;
      policyWeight: number;
    } | null = null;
    let remainingWeight = 1;
    let cutoffTriggered = false;

    for (const enemyEntry of enemyPlanWeights) {
      assertSearchBudget(context);

      let robustScore = 0;
      let enemyLikelyScore = 0;
      let enemyHybridScore = 0;
      let selectedPreview: SearchPlanEvaluation["preview"] = null;
      let selectedChildPv: SearchPvStep[] = [];

      for (const branch of context.branches) {
        context.diagnostics.resolveTurnCalls += 1;
        const preview = resolveTurn(state, allyPlan, enemyEntry.plan, branch.damageMode, {
          accuracyMode: branch.accuracyMode,
          secondaryMode: branch.secondaryMode,
        });
        const childBundle = evaluateNode(preview.state, depth - 1, ply + 1, extensionsRemaining, context);

        robustScore += childBundle.robustScore * branch.weight;
        enemyLikelyScore += childBundle.likelyScore * branch.weight;
        enemyHybridScore += childBundle.hybridScore * branch.weight;

        if (branch.damageMode === "average" && branch.accuracyMode === "expected") {
          selectedPreview = preview;
          selectedChildPv = childBundle.pv;
        }
      }

      const childBundle: CachedSearchBundle = {
        robustScore,
        likelyScore: enemyLikelyScore,
        hybridScore: enemyHybridScore,
        pv: selectedChildPv,
      };

      likelyScore += childBundle.likelyScore * enemyEntry.policyWeight;
      remainingWeight -= enemyEntry.policyWeight;

      if (!predictedEntry || enemyEntry.policyWeight > predictedEntry.policyWeight) {
        predictedEntry = {
          plan: enemyEntry.plan,
          preview: selectedPreview,
          bundle: childBundle,
          policyWeight: enemyEntry.policyWeight,
        };
      }

      if (childBundle.robustScore < worstRobust) {
        worstRobust = childBundle.robustScore;
        worstEntry = {
          plan: enemyEntry.plan,
          preview: selectedPreview,
          bundle: childBundle,
        };
      }

      if (
        context.budget.objectiveMode === "robust" &&
        worstRobust <= alphaRobust &&
        enemyPlanWeights.length > 1
      ) {
        cutoffTriggered = true;
        context.diagnostics.cutoffs += 1;
        break;
      }
    }

    if (cutoffTriggered) {
      likelyScore += remainingWeight * worstRobust;
    }

    const hybridScore =
      context.budget.hybridLambda * worstRobust + (1 - context.budget.hybridLambda) * likelyScore;
    const predictedPv =
      predictedEntry && predictedEntry.preview
        ? [
            {
              ply,
              turn: state.field.turn,
              allyPlan,
              enemyPlan: predictedEntry.plan,
              robustScore: worstRobust,
              likelyScore,
              hybridScore,
              preview: predictedEntry.preview,
              extensionReasons: [],
            },
            ...predictedEntry.bundle.pv,
          ]
        : [];

    const planResult: SearchPlanEvaluation = {
      plan: allyPlan,
      score: getObjectiveScore({ robustScore: worstRobust, likelyScore, hybridScore }, context.budget.objectiveMode),
      robustScore: worstRobust,
      likelyScore,
      hybridScore,
      enemyBestResponse: worstEntry?.plan ?? null,
      predictedEnemyResponse: predictedEntry?.plan ?? worstEntry?.plan ?? null,
      preview: predictedEntry?.preview ?? worstEntry?.preview ?? null,
      pv: predictedPv,
      predictedPv,
      enemyPolicyWeight: predictedEntry?.policyWeight ?? 0,
      dependsOnInferredMoves:
        planDependsOnInference(state, allyPlan) ||
        planDependsOnInference(state, worstEntry?.plan ?? null) ||
        planDependsOnInference(state, predictedEntry?.plan ?? null),
    };

    if (!bestPlanResult || planResult.score > bestPlanResult.score) {
      bestPlanResult = planResult;
      if (context.budget.objectiveMode === "robust") {
        alphaRobust = Math.max(alphaRobust, planResult.robustScore);
      }
    }
  }

  const result: CachedSearchBundle = bestPlanResult
    ? {
        robustScore: bestPlanResult.robustScore,
        likelyScore: bestPlanResult.likelyScore,
        hybridScore: bestPlanResult.hybridScore,
        pv: bestPlanResult.predictedPv,
      }
    : bundleFromScalar(evaluateBattleState(state));

  context.transposition.set(cacheKey, depth, result);
  context.diagnostics.ttStores += 1;
  if (bestPlanResult) {
    updateHistoryScore(context, "ally", bestPlanResult.plan);
    updateHistoryScore(context, "enemy", bestPlanResult.predictedEnemyResponse);
  }
  return result;
}

function scoreRootPlans(
  state: BattleState,
  depth: number,
  context: SearchContext,
): SearchPlanEvaluation[] {
  let allyPlans = generateJointActionPlans(state, "ally", {
    maxIndividualActionsPerActor: context.maxIndividualActionsPerActor,
    maxJointPlans: context.maxJointPlansPerSide,
  });
  const enemyPlans = generateJointActionPlans(state, "enemy", {
    maxIndividualActionsPerActor: context.maxIndividualActionsPerActor,
    maxJointPlans: context.maxJointPlansPerSide,
  });

  context.diagnostics.generatedJointPlans += allyPlans.length + enemyPlans.length;
  if (allyPlans.length === 0) {
    return [];
  }

  if (enemyPlans.length === 0) {
    const scalar = evaluateBattleState(state);
    return orderPlans(allyPlans, "ally", 0, context).map((plan) => ({
      plan,
      score: scalar,
      robustScore: scalar,
      likelyScore: scalar,
      hybridScore: scalar,
      enemyBestResponse: null,
      predictedEnemyResponse: null,
      preview: null,
      pv: [],
      predictedPv: [],
      enemyPolicyWeight: 0,
      dependsOnInferredMoves: planDependsOnInference(state, plan),
    }));
  }

  allyPlans = selectDeepSearchCandidates(state, orderPlans(allyPlans, "ally", 0, context), context);
  const orderedEnemyPlans = orderPlans(enemyPlans, "enemy", 0, context);
  const enemyPlanWeights = getEnemyPlanPolicyWeights(state, orderedEnemyPlans);
  const planScores: SearchPlanEvaluation[] = [];
  let alphaRobust = Number.NEGATIVE_INFINITY;

  for (const allyPlan of allyPlans) {
    assertSearchBudget(context);

    let worstRobust = Number.POSITIVE_INFINITY;
    let likelyScore = 0;
    let worstEntry: SearchPlanEvaluation["enemyBestResponse"] = null;
    let worstPreview: SearchPlanEvaluation["preview"] = null;
    let worstBundle: CachedSearchBundle | null = null;
    let predictedEntry: SearchPlanEvaluation["predictedEnemyResponse"] = null;
    let predictedPreview: SearchPlanEvaluation["preview"] = null;
    let predictedBundle: CachedSearchBundle | null = null;
    let predictedPolicyWeight = 0;
    let remainingWeight = 1;
    let cutoffTriggered = false;

    for (const enemyEntry of enemyPlanWeights) {
      assertSearchBudget(context);
      context.diagnostics.planPairEvaluations += 1;

      let robustScore = 0;
      let enemyLikelyScore = 0;
      let enemyHybridScore = 0;
      let averagePreview: SearchPlanEvaluation["preview"] = null;
      let childPv: SearchPvStep[] = [];

      for (const branch of context.branches) {
        context.diagnostics.resolveTurnCalls += 1;
        const preview = resolveTurn(state, allyPlan, enemyEntry.plan, branch.damageMode, {
          accuracyMode: branch.accuracyMode,
          secondaryMode: branch.secondaryMode,
        });
        const childBundle = depth > 1
          ? evaluateNode(preview.state, depth - 1, 1, context.budget.maxSelectiveExtensions, context)
          : bundleFromScalar(evaluateBattleState(preview.state));

        robustScore += childBundle.robustScore * branch.weight;
        enemyLikelyScore += childBundle.likelyScore * branch.weight;
        enemyHybridScore += childBundle.hybridScore * branch.weight;

        if (branch.damageMode === "average" && branch.accuracyMode === "expected") {
          averagePreview = preview;
          childPv = childBundle.pv;
        }
      }

      const branchBundle: CachedSearchBundle = {
        robustScore,
        likelyScore: enemyLikelyScore,
        hybridScore: enemyHybridScore,
        pv: childPv,
      };

      likelyScore += branchBundle.likelyScore * enemyEntry.policyWeight;
      remainingWeight -= enemyEntry.policyWeight;

      if (enemyEntry.policyWeight > predictedPolicyWeight) {
        predictedPolicyWeight = enemyEntry.policyWeight;
        predictedEntry = enemyEntry.plan;
        predictedPreview = averagePreview;
        predictedBundle = branchBundle;
      }

      if (branchBundle.robustScore < worstRobust) {
        worstRobust = branchBundle.robustScore;
        worstEntry = enemyEntry.plan;
        worstPreview = averagePreview;
        worstBundle = branchBundle;
      }

      if (context.budget.objectiveMode === "robust" && worstRobust <= alphaRobust && enemyPlanWeights.length > 1) {
        context.diagnostics.cutoffs += 1;
        cutoffTriggered = true;
        break;
      }
    }

    if (cutoffTriggered) {
      likelyScore += remainingWeight * worstRobust;
    }

    const hybridScore =
      context.budget.hybridLambda * worstRobust + (1 - context.budget.hybridLambda) * likelyScore;
    const predictedPv =
      predictedEntry && predictedPreview
        ? [
            {
              ply: 0,
              turn: state.field.turn,
              allyPlan,
              enemyPlan: predictedEntry,
              robustScore: worstRobust,
              likelyScore,
              hybridScore,
              preview: predictedPreview,
              extensionReasons: [],
            },
            ...(predictedBundle?.pv ?? []),
          ]
        : [];

    const planResult: SearchPlanEvaluation = {
      plan: allyPlan,
      score: getObjectiveScore({ robustScore: worstRobust, likelyScore, hybridScore }, context.budget.objectiveMode),
      robustScore: worstRobust,
      likelyScore,
      hybridScore,
      enemyBestResponse: worstEntry,
      predictedEnemyResponse: predictedEntry ?? worstEntry,
      preview: predictedPreview ?? worstPreview,
      pv: predictedPv,
      predictedPv,
      enemyPolicyWeight: predictedPolicyWeight,
      dependsOnInferredMoves:
        planDependsOnInference(state, allyPlan) ||
        planDependsOnInference(state, worstEntry) ||
        planDependsOnInference(state, predictedEntry),
    };

    planScores.push(planResult);
    alphaRobust = Math.max(alphaRobust, planResult.robustScore);
  }

  return planScores.sort((left, right) => right.score - left.score);
}

function derivePvHints(recommendation: SearchRecommendation) {
  const hints = new Map<number, { allySummary: string | null; enemySummary: string | null }>();
  for (const step of recommendation.pv) {
    hints.set(step.ply, {
      allySummary: step.allyPlan?.summary ?? null,
      enemySummary: step.enemyPlan?.summary ?? null,
    });
  }
  return hints;
}

function finalizeDiagnostics(context: SearchContext, depthReached: number, pv: SearchPvStep[]) {
  context.diagnostics.elapsedMs = nowMs() - context.startedAt;
  context.diagnostics.depthReached = depthReached;
  context.diagnostics.pv = pv;
}

export function recommendBestPlan(state: BattleState, options?: SearchOptions): SearchRecommendation {
  const budget = normalizeSearchBudget(options);
  const branchModel = options?.branchModel ?? getDefaultBranchModel(budget.searchMode);
  const branchPolicy = getBranchPolicy(branchModel, options?.branchPolicy);
  const orderingBranchPolicy = getBranchPolicy("expectedOnly");
  const diagnostics = createSearchDiagnostics(
    budget,
    budget.searchMode === "deep" && budget.stageTopK > 0 ? `${orderingBranchPolicy.key}->${branchPolicy.key}` : branchPolicy.key,
    state,
  );
  const context: SearchContext = {
    maxJointPlansPerSide: options?.maxJointPlansPerSide ?? ENGINE_DEFAULTS.maxJointPlans,
    maxIndividualActionsPerActor:
      options?.maxIndividualActionsPerActor ?? ENGINE_DEFAULTS.maxIndividualActionsPerActor,
    branchModel,
    budget,
    branches: branchPolicy.branches,
    orderingBranches: orderingBranchPolicy.branches,
    diagnostics,
    transposition: new TranspositionTable(),
    startedAt: nowMs(),
    signal: options?.signal ?? null,
    pvHints: new Map(),
    historyScores: new Map(),
  };

  let bestCompleted: SearchRecommendation | null = null;

  try {
    for (let depth = 1; depth <= budget.maxDepth; depth += 1) {
      const scoredPlans = scoreRootPlans(state, depth, context);
      const best = scoredPlans[0] ?? null;
      const scalar = evaluateBattleState(state);

      const iterationResult: SearchRecommendation = {
        rootScore:
          best ? getObjectiveScore(best, budget.objectiveMode) : scalar,
        depth,
        depthReached: depth,
        robustScore: best?.robustScore ?? scalar,
        likelyScore: best?.likelyScore ?? scalar,
        hybridScore: best?.hybridScore ?? scalar,
        bestPlan: best?.plan ?? null,
        enemyBestResponse: best?.enemyBestResponse ?? null,
        predictedEnemyResponse: best?.predictedEnemyResponse ?? null,
        preview: best?.preview ?? null,
        pv: best?.pv ?? [],
        consideredPlans: scoredPlans.slice(0, 3),
        budget,
        diagnostics,
      };

      diagnostics.completedIterations = depth;
      diagnostics.depthReached = depth;
      diagnostics.pv = iterationResult.pv;
      bestCompleted = iterationResult;
      context.pvHints = derivePvHints(iterationResult);
    }
  } catch (error) {
    if (!(error instanceof SearchAbortedError)) {
      throw error;
    }
  }

  const fallbackScore = evaluateBattleState(state);
  const result = bestCompleted ?? {
    rootScore: fallbackScore,
    depth: 0,
    depthReached: 0,
    robustScore: fallbackScore,
    likelyScore: fallbackScore,
    hybridScore: fallbackScore,
    bestPlan: null,
    enemyBestResponse: null,
    predictedEnemyResponse: null,
    preview: null,
    pv: [],
    consideredPlans: [],
    budget,
    diagnostics,
  };

  finalizeDiagnostics(context, result.depthReached, result.pv);
  return {
    ...result,
    diagnostics: {
      ...result.diagnostics,
      elapsedMs: diagnostics.elapsedMs,
      depthReached: result.depthReached,
      pv: result.pv,
    },
  };
}

export async function recommendBestPlanAsync(state: BattleState, options?: SearchOptions) {
  await Promise.resolve();
  return recommendBestPlan(state, options);
}
