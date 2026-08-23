import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BattleLabApiError,
  cancelRecommendationJob,
  loadBattleLabSession,
  loadAdvisorBridgeStatus,
  loadChampionsCatalog,
  loadRecommendationJob,
  prepareDeviceConnection,
  refreshDeviceSnapshot,
  startRecommendationJob,
} from "./api";
import { createChampionsCatalogIndex } from "./catalog";
import { BattleBoard } from "./components/BattleBoard";
import { EngineControlPanel } from "./components/EngineControlPanel";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { SnapshotTimeline } from "./components/SnapshotTimeline";
import type {
  BattleLabSession,
  ChampionsCatalog,
  EngineRecommendation,
  RecommendationJob,
} from "./types";

const exactSheetStorageKey = "pokemon-champions-live-lab-exact-sheet-v2";

type ConnectionPhase = "checking" | "connected" | "reading" | "synced" | "error";

type ConnectionViewState = {
  phase: ConnectionPhase;
  title: string;
  detail: string;
  action: string | null;
  currentStep: 2 | 3;
};

const initialConnectionState: ConnectionViewState = {
  phase: "checking",
  title: "Checking the iPhone connection",
  detail: "Looking for the USB device and preparing secure SSH access…",
  action: null,
  currentStep: 2,
};

function connectionFailure(error: unknown): ConnectionViewState {
  if (error instanceof BattleLabApiError) {
    return {
      phase: "error",
      title: error.stage === "snapshot" ? "Battle state unavailable" : "iPhone connection needs attention",
      detail: error.message,
      action: error.action,
      currentStep: error.stage === "snapshot" ? 3 : 2,
    };
  }
  return {
    phase: "error",
    title: "iPhone connection needs attention",
    detail: error instanceof Error ? error.message : String(error),
    action: "Confirm that the phone is connected and unlocked, then try again.",
    currentStep: 2,
  };
}

function connectionStepClassName(step: number, state: ConnectionViewState) {
  if (step === state.currentStep && state.phase === "error") {
    return "is-error";
  }
  if (
    step === state.currentStep &&
    (state.phase === "checking" || state.phase === "reading")
  ) {
    return "is-active";
  }
  if (
    step < state.currentStep ||
    (step <= state.currentStep && (state.phase === "connected" || state.phase === "synced"))
  ) {
    return "is-complete";
  }
  return "";
}

function loadStoredExactSheet() {
  try {
    return window.localStorage.getItem(exactSheetStorageKey) ?? "";
  } catch {
    return "";
  }
}

export function LiveBattleLabPage() {
  const [session, setSession] = useState<BattleLabSession | null>(null);
  const [catalog, setCatalog] = useState<ChampionsCatalog | null>(null);
  const [recommendation, setRecommendation] = useState<EngineRecommendation | null>(null);
  const [exactSheetText, setExactSheetText] = useState(loadStoredExactSheet);
  const [depth, setDepth] = useState(3);
  const [nodes, setNodes] = useState(100_000);
  const [timeMs, setTimeMs] = useState<number | null>(5_000);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [recommendationJob, setRecommendationJob] = useState<RecommendationJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionViewState>(initialConnectionState);
  const activeRecommendationJobId = useRef<string | null>(null);

  const stopActiveCalculation = useCallback(async (reportFailure = true) => {
    const jobId = activeRecommendationJobId.current;
    if (!jobId) {
      return;
    }
    try {
      const cancelled = await cancelRecommendationJob(jobId);
      setRecommendationJob(cancelled);
    } catch (cancelError) {
      if (reportFailure) {
        setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      loadBattleLabSession(undefined, controller.signal),
      loadChampionsCatalog(controller.signal),
    ])
      .then(([nextSession, nextCatalog]) => {
        setSession(nextSession);
        setCatalog(nextCatalog);
        setRecommendation(nextSession.lastRecommendation);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    void prepareDeviceConnection(controller.signal)
      .then((connection) => {
        if (!controller.signal.aborted) {
          setSession((current) => current
            ? { ...current, engine: { ...current.engine, advisor: connection.advisor } }
            : current);
          setConnectionState({
            phase: "connected",
            title: "iPhone connection ready",
            detail: connection.message,
            action: null,
            currentStep: 2,
          });
        }
      })
      .catch((connectionError: unknown) => {
        if (!controller.signal.aborted) {
          setConnectionState(connectionFailure(connectionError));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const updateAdvisorStatus = () => {
      void loadAdvisorBridgeStatus(controller.signal)
        .then((advisor) => {
          if (!controller.signal.aborted) {
            setSession((current) => current
              ? { ...current, engine: { ...current.engine, advisor } }
              : current);
            setConnectionState((current) => {
              if (current.phase !== "connected") {
                return current;
              }
              const detail = advisor.status === "running"
                ? "iPhone connected through the secure USB tunnel. Continuous overlay sync is running."
                : advisor.status === "recovering"
                  ? "The iPhone tunnel is ready. Continuous overlay sync is reconnecting automatically."
                  : current.detail;
              return detail === current.detail ? current : { ...current, detail };
            });
          }
        })
        .catch(() => {
          // The primary session/connection flows own user-facing service errors.
        });
    };
    updateAdvisorStatus();
    const interval = window.setInterval(updateAdvisorStatus, 2_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const job = recommendationJob;
    if (!job || !["queued", "running", "cancelling"].includes(job.status)) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadRecommendationJob(job.jobId, controller.signal)
        .then((updated) => {
          setRecommendationJob(updated);
          if (["queued", "running", "cancelling"].includes(updated.status)) {
            return;
          }
          activeRecommendationJobId.current = null;
          setRunning(false);
          if (updated.status === "complete" && updated.result) {
            const currentStateHash = session?.snapshot.state_hash;
            if (
              updated.stateHash !== currentStateHash ||
              updated.result.state_hash !== currentStateHash
            ) {
              setError("The board changed before the calculation finished. The stale result was discarded.");
              return;
            }
            setRecommendation(updated.result);
            setError(null);
            return;
          }
          if (updated.status === "cancelled") {
            return;
          }
          setError(updated.error ?? "The native calculation did not finish.");
        })
        .catch((pollError: unknown) => {
          if (!controller.signal.aborted) {
            activeRecommendationJobId.current = null;
            setRunning(false);
            setError(pollError instanceof Error ? pollError.message : String(pollError));
          }
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [recommendationJob, session?.snapshot.state_hash]);

  useEffect(
    () => () => {
      const jobId = activeRecommendationJobId.current;
      if (jobId) {
        void fetch(`/api/champions/recommend/jobs/${encodeURIComponent(jobId)}`, {
          method: "DELETE",
          keepalive: true,
        });
      }
    },
    [],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(exactSheetStorageKey, exactSheetText);
    } catch {
      // The editor remains usable when browser storage is disabled.
    }
  }, [exactSheetText]);

  const catalogIndex = useMemo(
    () => (catalog ? createChampionsCatalogIndex(catalog) : null),
    [catalog],
  );

  const selectSource = useCallback(async (sourceId: string) => {
    await stopActiveCalculation(false);
    activeRecommendationJobId.current = null;
    setRunning(false);
    setRecommendationJob(null);
    setLoading(true);
    try {
      const nextSession = await loadBattleLabSession(sourceId);
      setSession(nextSession);
      setRecommendation(nextSession.lastRecommendation);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [stopActiveCalculation]);

  const refresh = async () => {
    await stopActiveCalculation(false);
    activeRecommendationJobId.current = null;
    setRunning(false);
    setRecommendationJob(null);
    setRefreshing(true);
    setConnectionState(initialConnectionState);
    try {
      const connection = await prepareDeviceConnection();
      setSession((current) => current
        ? { ...current, engine: { ...current.engine, advisor: connection.advisor } }
        : current);
      setConnectionState({
        phase: "reading",
        title: "iPhone connected",
        detail: `${connection.message} Reading the latest Champions battle state now…`,
        action: null,
        currentStep: 3,
      });
      const nextSession = await refreshDeviceSnapshot();
      setSession(nextSession);
      setRecommendation(nextSession.lastRecommendation);
      setError(null);
      setConnectionState({
        phase: "synced",
        title: nextSession.snapshot.state.available
          ? "Live battle state synced"
          : "Connected · no active battle",
        detail: nextSession.snapshot.state.available
          ? `The latest turn was read at ${new Date(nextSession.snapshot.captured_at).toLocaleTimeString()}.`
          : "The phone connection is healthy. Start a battle, then refresh again to load the board.",
        action: null,
        currentStep: 3,
      });
    } catch (refreshError) {
      setConnectionState(connectionFailure(refreshError));
    } finally {
      setRefreshing(false);
    }
  };

  const runCalculation = async () => {
    if (!session) {
      return;
    }
    let exactSheet: unknown | null = null;
    if (exactSheetText.trim()) {
      try {
        exactSheet = JSON.parse(exactSheetText);
      } catch {
        setError("The exact team sheet is not valid JSON.");
        return;
      }
    }
    setRunning(true);
    setRecommendationJob(null);
    try {
      const job = await startRecommendationJob({
        snapshotId: session.selectedSourceId,
        stateHash: session.snapshot.state_hash,
        exactSheet,
        depth,
        nodes,
        timeMs,
      });
      activeRecommendationJobId.current = job.jobId;
      setRecommendationJob(job);
      setError(null);
    } catch (runError) {
      activeRecommendationJobId.current = null;
      setRunning(false);
      setError(runError instanceof Error ? runError.message : String(runError));
    }
  };

  if (loading && (!session || !catalogIndex)) {
    return (
      <section className="live-lab-loading" aria-live="polite">
        <span aria-hidden="true" />
        <strong>Loading captured battle state…</strong>
      </section>
    );
  }

  if (!session || !catalogIndex) {
    return (
      <section className="live-lab-empty-state">
        <strong>Battle Lab could not connect to the Mac service.</strong>
        <p>{error ?? "Start the Battle Lab server and reload this page."}</p>
      </section>
    );
  }

  const snapshot = session.snapshot;
  const observability = snapshot.state.opponent_observability;
  const refreshButtonLabel =
    connectionState.phase === "checking"
      ? "Checking iPhone…"
      : connectionState.phase === "reading"
        ? "Reading battle state…"
        : "Refresh from USB";

  return (
    <section className="live-lab-page">
      <header className="live-lab-hero">
        <div>
          <p className="live-lab-kicker">
            <span aria-hidden="true" /> Live Battle Lab
          </p>
          <h1>See the board. Search the line.</h1>
          <p>
            A faithful view of the phone capture with explicit hidden knowledge and native
            multi-turn calculation on this Mac.
          </p>
        </div>
        <div className="live-lab-hero__actions">
          <span className="live-lab-connection">
            <i aria-hidden="true" /> {session.engine.ready ? "Native engine online" : "Engine offline"}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || connectionState.phase === "checking"}
          >
            {refreshButtonLabel}
          </button>
        </div>
      </header>

      {error ? (
        <div className="live-lab-alert" role="alert">
          <strong>Battle Lab notice</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss notice">×</button>
        </div>
      ) : null}

      <section
        className={`live-lab-device-connection is-${connectionState.phase}`}
        aria-label="iPhone connection status"
        aria-live="polite"
      >
        <span className="live-lab-device-connection__signal" aria-hidden="true">
          <i />
        </span>
        <div className="live-lab-device-connection__copy">
          <span>USB connection</span>
          <strong>{connectionState.title}</strong>
          <p>{connectionState.detail}</p>
          {connectionState.action ? (
            <small>
              <b>Next step:</b> {connectionState.action}
            </small>
          ) : null}
        </div>
        <ol className="live-lab-device-connection__steps">
          {[
            [1, "Mac service"],
            [2, "iPhone link"],
            [3, "Battle state"],
          ].map(([step, label]) => (
            <li key={step} className={connectionStepClassName(Number(step), connectionState)}>
              <i aria-hidden="true" />
              <span>{label}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="live-lab-status-strip" aria-label="Capture status">
        <div>
          <span>Overlay sync</span>
          <strong>{session.engine.advisor.status}</strong>
        </div>
        <div>
          <span>State hash</span>
          <strong>{snapshot.state_hash}</strong>
        </div>
        <div>
          <span>Captured</span>
          <strong>{new Date(snapshot.captured_at).toLocaleString()}</strong>
        </div>
        <div>
          <span>Opponent moves</span>
          <strong>{observability.remote_with_moves}/{observability.remote_pokemon} visible</strong>
        </div>
        <div>
          <span>Opponent items</span>
          <strong>{observability.remote_with_items}/{observability.remote_pokemon} visible</strong>
        </div>
      </section>

      <SnapshotTimeline
        sources={session.sources}
        selectedSourceId={session.selectedSourceId}
        disabled={loading || running}
        onSelect={selectSource}
      />

      <div className="live-lab-workspace">
        <BattleBoard snapshot={snapshot} catalog={catalogIndex} />
        <aside className="live-lab-sidebar">
          <EngineControlPanel
            exactSheetText={exactSheetText}
            perfectKnowledge={session.perfectKnowledge}
            depth={depth}
            nodes={nodes}
            timeMs={timeMs}
            running={running}
            progress={recommendationJob?.progress ?? null}
            onExactSheetTextChange={setExactSheetText}
            onDepthChange={setDepth}
            onNodesChange={setNodes}
            onTimeMsChange={setTimeMs}
            onRun={() => void runCalculation()}
            onCancel={() => void stopActiveCalculation()}
          />
          <RecommendationPanel recommendation={recommendation} />
        </aside>
      </div>
    </section>
  );
}
