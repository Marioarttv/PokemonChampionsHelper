import { normalizeMoveKey } from "./moveRegistry";
import type { CandidateMove, KnowledgeLevel } from "./types";

type EnemyMovesetSource = "custom" | "preset" | "none";

type BuildEnemyMoveKnowledgeInput = {
  knownMoveNames: string[];
  presetMoveNames: string[];
  inferredMoveNames: string[];
  movesetSource: EnemyMovesetSource;
};

type EnemyMoveKnowledge = {
  knowledge: KnowledgeLevel;
  moveNames: string[];
  candidateMoves: CandidateMove[];
  assumptionSummary: string[];
};

function dedupeMoveNames(moveNames: string[]) {
  const byKey = new Map<string, string>();

  for (const moveName of moveNames) {
    const trimmed = moveName.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeMoveKey(trimmed);
    if (!byKey.has(key)) {
      byKey.set(key, trimmed);
    }
  }

  return [...byKey.values()];
}

function dedupeCandidateMoves(candidateMoves: CandidateMove[]) {
  const byKey = new Map<string, CandidateMove>();

  for (const candidate of candidateMoves) {
    const key = normalizeMoveKey(candidate.name);
    const existing = byKey.get(key);
    if (!existing || candidate.weight > existing.weight) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()];
}

export function buildEnemyMoveKnowledge(input: BuildEnemyMoveKnowledgeInput): EnemyMoveKnowledge {
  const knownMoveNames = dedupeMoveNames(input.knownMoveNames);
  const knownMoveKeys = new Set(knownMoveNames.map((moveName) => normalizeMoveKey(moveName)));

  if (input.movesetSource === "custom") {
    return {
      knowledge: "known",
      moveNames: knownMoveNames,
      candidateMoves: [],
      assumptionSummary: [],
    };
  }

  const presetCandidates = dedupeMoveNames(input.presetMoveNames)
    .filter((moveName) => !knownMoveKeys.has(normalizeMoveKey(moveName)))
    .slice(0, 4)
    .map((moveName) => ({
      name: moveName,
      source: "preset" as const,
      weight: input.movesetSource === "preset" ? 0.85 : 0.45,
      confidence: "candidate" as const,
    }));

  const inferredCandidates = dedupeMoveNames(input.inferredMoveNames)
    .filter(
      (moveName) =>
        !knownMoveKeys.has(normalizeMoveKey(moveName)) &&
        !presetCandidates.some((candidate) => normalizeMoveKey(candidate.name) === normalizeMoveKey(moveName)),
    )
    .slice(0, input.movesetSource === "preset" ? 2 : 4)
    .map((moveName) => ({
      name: moveName,
      source: "inferred" as const,
      weight: input.movesetSource === "preset" ? 0.35 : 0.25,
      confidence: "candidate" as const,
    }));

  const candidateMoves = dedupeCandidateMoves([...presetCandidates, ...inferredCandidates]);

  return {
    knowledge: input.movesetSource === "preset" ? "partial" : "unknown",
    moveNames: knownMoveNames,
    candidateMoves,
    assumptionSummary: candidateMoves.map((move) => `${move.name}:${move.source}:${move.weight.toFixed(2)}`),
  };
}
