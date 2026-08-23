import type {
  BattleLabSession,
  AdvisorBridgeStatus,
  ChampionsCatalog,
  DeviceConnectionStage,
  DeviceConnectionStatus,
  EngineRecommendation,
  RecommendationJob,
  RecommendationRequest,
} from "./types";

export class BattleLabApiError extends Error {
  readonly code: string | null;
  readonly stage: DeviceConnectionStage | null;
  readonly action: string | null;

  constructor(
    message: string,
    options: {
      code?: string;
      stage?: DeviceConnectionStage;
      action?: string;
    } = {},
  ) {
    super(message);
    this.name = "BattleLabApiError";
    this.code = options.code ?? null;
    this.stage = options.stage ?? null;
    this.action = options.action ?? null;
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & {
    action?: string;
    code?: string;
    detail?: string;
    error?: string;
    stage?: DeviceConnectionStage;
  };
  if (!response.ok) {
    const message =
      (payload.code ? payload.error : payload.detail ?? payload.error) ??
      `Request failed with status ${response.status}`;
    throw new BattleLabApiError(message, {
      code: payload.code,
      stage: payload.stage,
      action: payload.action,
    });
  }
  return payload;
}

export async function loadBattleLabSession(snapshotId?: string, signal?: AbortSignal) {
  const query = snapshotId ? `?snapshot=${encodeURIComponent(snapshotId)}` : "";
  const response = await fetch(`/api/champions/session${query}`, { signal });
  return readJsonResponse<BattleLabSession>(response);
}

export async function loadChampionsCatalog(signal?: AbortSignal) {
  const response = await fetch("/api/champions/catalog", { signal });
  return readJsonResponse<ChampionsCatalog>(response);
}

export async function requestRecommendation(request: RecommendationRequest, signal?: AbortSignal) {
  const response = await fetch("/api/champions/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  return readJsonResponse<EngineRecommendation>(response);
}

export async function startRecommendationJob(
  request: RecommendationRequest,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/champions/recommend/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  return readJsonResponse<RecommendationJob>(response);
}

export async function loadRecommendationJob(jobId: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/champions/recommend/jobs/${encodeURIComponent(jobId)}`,
    { signal },
  );
  return readJsonResponse<RecommendationJob>(response);
}

export async function cancelRecommendationJob(jobId: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/champions/recommend/jobs/${encodeURIComponent(jobId)}`,
    { method: "DELETE", signal },
  );
  return readJsonResponse<RecommendationJob>(response);
}

export async function prepareDeviceConnection(signal?: AbortSignal) {
  const response = await fetch("/api/champions/connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal,
  });
  return readJsonResponse<DeviceConnectionStatus>(response);
}

export async function loadAdvisorBridgeStatus(signal?: AbortSignal) {
  const response = await fetch("/api/champions/advisor", { signal });
  return readJsonResponse<AdvisorBridgeStatus>(response);
}

export async function refreshDeviceSnapshot(signal?: AbortSignal) {
  const response = await fetch("/api/champions/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal,
  });
  return readJsonResponse<BattleLabSession>(response);
}
