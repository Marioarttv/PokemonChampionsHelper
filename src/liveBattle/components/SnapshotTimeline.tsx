import { memo } from "react";
import type { SnapshotSource } from "../types";

type SnapshotTimelineProps = {
  sources: SnapshotSource[];
  selectedSourceId: string;
  disabled: boolean;
  onSelect: (sourceId: string) => void;
};

function shortTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const SnapshotTimeline = memo(function SnapshotTimeline({
  sources,
  selectedSourceId,
  disabled,
  onSelect,
}: SnapshotTimelineProps) {
  return (
    <section className="live-lab-timeline" aria-label="Captured battle timeline">
      <header>
        <div>
          <p>Replay rail</p>
          <h2>Captured states</h2>
        </div>
        <span>{sources.length} snapshots</span>
      </header>
      <div className="live-lab-timeline__rail">
        {sources.map((source) => {
          const active = source.id === selectedSourceId;
          return (
            <button
              key={source.id}
              type="button"
              className={active ? "is-active" : undefined}
              disabled={disabled}
              onClick={() => onSelect(source.id)}
              aria-pressed={active}
            >
              <span className="live-lab-timeline__node" aria-hidden="true" />
              <span>
                <strong>{source.label}</strong>
                <small>{shortTime(source.capturedAt)}</small>
              </span>
              {source.isDeviceLatest ? <em>USB</em> : <em>T{source.turn}</em>}
            </button>
          );
        })}
      </div>
    </section>
  );
});
