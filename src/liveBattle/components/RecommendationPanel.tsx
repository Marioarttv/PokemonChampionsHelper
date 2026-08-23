import { memo } from "react";
import type { EngineRecommendation } from "../types";

type RecommendationPanelProps = {
  recommendation: EngineRecommendation | null;
};

function statusLabel(status: EngineRecommendation["status"]) {
  switch (status) {
    case "ready":
      return "Line ready";
    case "needs_scenario":
      return "Knowledge needed";
    case "mechanics_blocked":
      return "Stopped safely";
    case "blocked":
      return "Bridge blocked";
    case "idle":
      return "No active battle";
  }
}

export const RecommendationPanel = memo(function RecommendationPanel({ recommendation }: RecommendationPanelProps) {
  if (!recommendation) {
    return (
      <section className="live-lab-result is-empty">
        <span className="live-lab-result__glyph" aria-hidden="true">◇</span>
        <div>
          <p>Engine output</p>
          <h2>No line calculated yet</h2>
          <span>The automatic opponent database is ready. Run the native search when the board is ready.</span>
        </div>
      </section>
    );
  }

  const detail = recommendation.detail ?? recommendation.search_blocker;
  return (
    <section className={`live-lab-result is-${recommendation.status}`} aria-live="polite">
      <header>
        <div>
          <p>Engine output</p>
          <h2>{statusLabel(recommendation.status)}</h2>
        </div>
        <span>{recommendation.engine}</span>
      </header>

      <p className="live-lab-result__summary">{recommendation.summary}</p>

      {recommendation.perfect_knowledge ? (
        <div className="live-lab-result__knowledge">
          <strong>
            {recommendation.perfect_knowledge.mode === "automatic"
              ? "Automatic perfect knowledge"
              : "Manual perfect-knowledge override"}
          </strong>
          <span>
            {recommendation.perfect_knowledge.covered_pokemon}/
            {recommendation.perfect_knowledge.roster_pokemon} opponent profiles · {recommendation.perfect_knowledge.observed_overrides} live overrides
          </span>
        </div>
      ) : null}

      {recommendation.best_plan ? (
        <div className="live-lab-plan-grid">
          <article>
            <span>Your best plan</span>
            <strong>{recommendation.best_plan.label}</strong>
          </article>
          <article>
            <span>Worst-case reply</span>
            <strong>{recommendation.worst_case_reply?.label ?? "No reply"}</strong>
          </article>
        </div>
      ) : null}

      {recommendation.missing_knowledge?.length ? (
        <ul className="live-lab-missing-list">
          {recommendation.missing_knowledge.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      ) : null}

      {detail ? <pre className="live-lab-blocker">{detail}</pre> : null}

      {recommendation.principal_variation?.length ? (
        <ol className="live-lab-variation">
          {recommendation.principal_variation.map((step) => (
            <li key={`${step.turn_offset}-${step.depth_remaining}`}>
              <span>T+{step.turn_offset + 1}</span>
              <div>
                <strong>{step.perspective_plan.label}</strong>
                <small>vs {step.opponent_reply.label}</small>
              </div>
              <em>
                {step.representative_probability.numerator}/{step.representative_probability.denominator}
              </em>
            </li>
          ))}
        </ol>
      ) : null}

      <footer className="live-lab-result__stats">
        <span><strong>{recommendation.depth}</strong> depth</span>
        <span><strong>{recommendation.nodes.toLocaleString()}</strong> nodes</span>
        <span><strong>{recommendation.elapsed_ms}</strong> ms</span>
        {recommendation.transposition_hits !== undefined ? (
          <span><strong>{recommendation.transposition_hits.toLocaleString()}</strong> cache hits</span>
        ) : null}
      </footer>
    </section>
  );
});
