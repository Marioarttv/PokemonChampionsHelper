import type { ChangeEvent } from "react";
import type { PerfectKnowledgeStatus, RecommendationProgress } from "../types";

type EngineControlPanelProps = {
  exactSheetText: string;
  perfectKnowledge: PerfectKnowledgeStatus;
  depth: number;
  nodes: number;
  timeMs: number | null;
  running: boolean;
  progress: RecommendationProgress | null;
  onExactSheetTextChange: (value: string) => void;
  onDepthChange: (value: number) => void;
  onNodesChange: (value: number) => void;
  onTimeMsChange: (value: number | null) => void;
  onRun: () => void;
  onCancel: () => void;
};

function exactSheetStatus(text: string, perfectKnowledge: PerfectKnowledgeStatus) {
  if (!text.trim()) {
    return {
      tone: "ready",
      label: perfectKnowledge.roster_pokemon
        ? `${perfectKnowledge.covered_pokemon}/${perfectKnowledge.roster_pokemon} auto-covered`
        : "Automatic assumptions ready",
    };
  }
  try {
    const value = JSON.parse(text) as { schema_version?: unknown; teams?: unknown };
    if (value.schema_version !== 1 || !Array.isArray(value.teams)) {
      return { tone: "invalid", label: "Sheet structure is incomplete" };
    }
    return { tone: "ready", label: `${value.teams.length} exact teams loaded` };
  } catch {
    return { tone: "invalid", label: "Invalid JSON" };
  }
}

export function EngineControlPanel({
  exactSheetText,
  perfectKnowledge,
  depth,
  nodes,
  timeMs,
  running,
  progress,
  onExactSheetTextChange,
  onDepthChange,
  onNodesChange,
  onTimeMsChange,
  onRun,
  onCancel,
}: EngineControlPanelProps) {
  const sheetStatus = exactSheetStatus(exactSheetText, perfectKnowledge);
  const completedDepth = progress?.statistics.completed_depth ?? 0;
  const targetDepth = progress?.target_depth ?? depth;
  const rootPlanProgress = progress?.root_plans_total
    ? (progress.root_plans_completed ?? 0) / progress.root_plans_total
    : 0;
  const depthProgress = targetDepth > 0
    ? ((completedDepth + rootPlanProgress) / targetDepth) * 100
    : 0;
  const progressPercent = progress?.stage === "complete" ? 100 : Math.min(96, depthProgress);
  const currentRootPlan = progress?.root_plans_total
    ? Math.min((progress.root_plans_completed ?? 0) + 1, progress.root_plans_total)
    : 0;

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    onExactSheetTextChange(await file.text());
    event.target.value = "";
  };

  return (
    <section className="live-lab-engine-panel">
      <header>
        <div>
          <p>Native search</p>
          <h2>Calculation controls</h2>
        </div>
        <span className={`live-lab-sheet-status is-${sheetStatus.tone}`}>{sheetStatus.label}</span>
      </header>

      <div className="live-lab-engine-panel__controls">
        <label>
          <span>Depth</span>
          <select value={depth} onChange={(event) => onDepthChange(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <option key={value} value={value}>
                {value} turn{value === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Node budget</span>
          <select value={nodes} onChange={(event) => onNodesChange(Number(event.target.value))}>
            {[25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000].map((value) => (
              <option key={value} value={value}>
                {value.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Time limit</span>
          <select
            value={timeMs ?? "none"}
            onChange={(event) =>
              onTimeMsChange(event.target.value === "none" ? null : Number(event.target.value))
            }
          >
            <option value={250}>250 ms</option>
            <option value={500}>500 ms</option>
            <option value={1000}>1 second</option>
            <option value={2500}>2.5 seconds</option>
            <option value={5000}>5 seconds</option>
            <option value={10000}>10 seconds</option>
            <option value={30000}>30 seconds</option>
            <option value="none">No time limit</option>
          </select>
        </label>
      </div>

      <details className="live-lab-exact-sheet" open={Boolean(exactSheetText.trim())}>
        <summary>
          <span>
            <strong>Automatic perfect knowledge</strong>
            <small>Selected four, moves and PP, items, spreads and exact HP</small>
          </span>
          <span>{perfectKnowledge.database_profiles} profiles</span>
        </summary>
        <div className="live-lab-exact-sheet__body">
          <div className="live-lab-assumption-summary">
            <strong>Live reconciliation enabled</strong>
            <span>{perfectKnowledge.summary}</span>
            <small>
              {perfectKnowledge.mirrored_pokemon} mirrored sets · {perfectKnowledge.revealed_order_slots}
              /4 order slots observed · {perfectKnowledge.observed_overrides} live field overrides
            </small>
          </div>
          <div className="live-lab-exact-sheet__toolbar">
            <label className="live-lab-file-button">
              <input type="file" accept="application/json,.json" onChange={(event) => void loadFile(event)} />
              Load manual override
            </label>
            {exactSheetText.trim() ? (
              <button type="button" onClick={() => onExactSheetTextChange("")}>Use automatic database</button>
            ) : null}
          </div>
          <textarea
            value={exactSheetText}
            onChange={(event) => onExactSheetTextChange(event.target.value)}
            spellCheck={false}
            placeholder="Optional manual exact-sheet override"
            aria-label="Exact scenario sheet JSON"
          />
          <p>
            With this field empty, every calculation uses the versioned opponent database. The
            newest phone state always replaces conflicting assumptions. Loading JSON replaces the
            automatic database for that calculation only.
          </p>
        </div>
      </details>

      {running && progress ? (
        <section className="live-lab-search-progress" aria-live="polite">
          <div>
            <span>
              {progress.stage === "queued"
                ? "Queued on this Mac"
                : progress.stage === "preparing"
                  ? "Building exact battle state"
                  : progress.stage === "cancelling"
                  ? "Stopping native search"
                    : `Depth ${progress.active_depth ?? completedDepth + 1} of ${targetDepth} · plan ${currentRootPlan || "…"}/${progress.root_plans_total ?? "…"}`}
            </span>
            <strong>{progress.statistics.nodes.toLocaleString()} nodes</strong>
          </div>
          <div
            className="live-lab-search-progress__track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={targetDepth}
            aria-valuenow={completedDepth}
          >
            <i style={{ width: `${progressPercent}%` }} />
          </div>
          <dl>
            <div><dt>Elapsed</dt><dd>{progress.statistics.elapsed_ms.toLocaleString()} ms</dd></div>
            <div><dt>Branches</dt><dd>{progress.statistics.chance_nodes.toLocaleString()}</dd></div>
            <div><dt>Cache hits</dt><dd>{progress.statistics.transposition_hits.toLocaleString()}</dd></div>
            <div><dt>Cutoffs</dt><dd>{progress.statistics.maximin_cutoffs.toLocaleString()}</dd></div>
          </dl>
        </section>
      ) : null}

      <div className="live-lab-engine-actions">
        <button type="button" className="live-lab-run-button" onClick={onRun} disabled={running}>
          <span aria-hidden="true">{running ? "◌" : "▶"}</span>
          {running ? "Searching exact branches…" : "Run perfect-knowledge calculation"}
        </button>
        {running ? (
          <button type="button" className="live-lab-cancel-button" onClick={onCancel}>
            Stop calculation
          </button>
        ) : null}
      </div>
      {!running && progress?.stage === "cancelled" ? (
        <p className="live-lab-search-message" role="status">
          Calculation stopped. The last hash-matched recommendation was kept.
        </p>
      ) : null}
    </section>
  );
}
