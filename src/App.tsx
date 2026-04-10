import { useState, type CSSProperties } from "react";
import { TYPE_META, TYPE_ORDER, getTypeIconUrl, type PokemonType } from "./data/typeChart";
import { bucketDefenseEntries, getDefenseEntries, getTypeLabel } from "./lib/effectiveness";

type TypePoolProps = {
  selectedTypes: PokemonType[];
  onToggle: (type: PokemonType) => void;
  onClear: () => void;
};

type MatchupGroupProps = {
  label: string;
  multiplier: string;
  tone: "danger" | "warn" | "neutral" | "good" | "great" | "muted";
  entries: PokemonType[];
  compact?: boolean;
};

const DEFAULT_PRIMARY: PokemonType = "water";

function TypePool({ selectedTypes, onToggle, onClear }: TypePoolProps) {
  return (
    <section className="selector-panel">
      <div className="selector-topbar">
        <div className="selector-copy">
          <p className="eyebrow">Type Calculator</p>
          <h2>Pick one or two types</h2>
          <p className="selector-note">
            One type gives a mono-type profile. Two types combine into the final defensive matchup.
          </p>
        </div>

        <div className="selector-actions">
          <div className="selected-slots" aria-label="Selected types">
            {[0, 1].map((slotIndex) => {
              const type = selectedTypes[slotIndex] ?? null;

              return (
                <div key={slotIndex} className={`selected-slot ${type ? "filled" : ""}`}>
                  {type ? (
                    <>
                      <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" loading="lazy" />
                      <span>{TYPE_META[type].label}</span>
                    </>
                  ) : (
                    <span>Empty</span>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="reset-button"
            onClick={onClear}
            disabled={selectedTypes.length === 0}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="type-grid" role="list" aria-label="Pokemon types">
        {TYPE_ORDER.map((type) => {
          const meta = TYPE_META[type];
          const selected = selectedTypes.includes(type);

          return (
            <button
              key={type}
              type="button"
              aria-pressed={selected}
              className={`type-token ${selected ? "selected" : ""}`}
              style={
                {
                  "--type-color": meta.color,
                  "--type-accent": meta.accent,
                } as CSSProperties
              }
              onClick={() => onToggle(type)}
            >
              <img src={getTypeIconUrl(type)} alt="" aria-hidden="true" loading="lazy" />
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MatchupGroup({ label, multiplier, tone, entries, compact = false }: MatchupGroupProps) {
  return (
    <section className={`matchup-group ${tone} ${compact ? "compact" : ""}`}>
      <header className="matchup-group-header">
        <div>
          <p>{label}</p>
          <strong>{multiplier}</strong>
        </div>
        <span>{entries.length}</span>
      </header>

      <div className="matchup-icons">
        {entries.length > 0 ? (
          entries.map((type) => (
            <div
              key={type}
              className="matchup-icon-tile"
              style={
                {
                  "--type-color": TYPE_META[type].color,
                  "--type-accent": TYPE_META[type].accent,
                } as CSSProperties
              }
              title={getTypeLabel(type)}
            >
              <img src={getTypeIconUrl(type)} alt={getTypeLabel(type)} loading="lazy" />
              <span>{getTypeLabel(type)}</span>
            </div>
          ))
        ) : (
          <div className="matchup-empty">None</div>
        )}
      </div>
    </section>
  );
}

function App() {
  const [selectedTypes, setSelectedTypes] = useState<PokemonType[]>([DEFAULT_PRIMARY]);

  const toggleType = (type: PokemonType) => {
    setSelectedTypes((current) => {
      if (current.includes(type)) {
        return current.filter((entry) => entry !== type);
      }

      if (current.length === 2) {
        return [current[1], type];
      }

      return [...current, type];
    });
  };

  const clearTypes = () => {
    setSelectedTypes([]);
  };

  const primaryType = selectedTypes[0] ?? null;
  const secondaryType = selectedTypes[1] ?? null;
  const entries = primaryType ? getDefenseEntries(primaryType, secondaryType) : [];
  const buckets = bucketDefenseEntries(entries);

  const profileLabel = primaryType
    ? secondaryType
      ? `${getTypeLabel(primaryType)} / ${getTypeLabel(secondaryType)}`
      : getTypeLabel(primaryType)
    : "No type selected";

  return (
    <div className="app-shell">
      <main className="page-layout">
        <TypePool selectedTypes={selectedTypes} onToggle={toggleType} onClear={clearTypes} />

        <section className="board-panel">
          <div className="board-header">
            <div>
              <p className="eyebrow">Defensive Matchups</p>
              <h2>{profileLabel}</h2>
            </div>
            <p className="board-note">
              Matchups are grouped by damage taken, with the most dangerous categories first.
            </p>
          </div>

          {!primaryType ? (
            <div className="matchup-empty-board">Pick one or two types to see the matchup board.</div>
          ) : (
            <>
              <div className="matchup-grid matchup-grid-primary">
                <MatchupGroup
                  label="Quad Weak"
                  multiplier="4x"
                  tone="danger"
                  compact
                  entries={buckets.ultraWeak.map((entry) => entry.attackType)}
                />
                <MatchupGroup
                  label="Weak"
                  multiplier="2x"
                  tone="warn"
                  entries={buckets.weak.map((entry) => entry.attackType)}
                />
                <MatchupGroup
                  label="Neutral"
                  multiplier="1x"
                  tone="neutral"
                  entries={buckets.neutral.map((entry) => entry.attackType)}
                />
                <MatchupGroup
                  label="Resist"
                  multiplier="0.5x"
                  tone="good"
                  entries={buckets.resist.map((entry) => entry.attackType)}
                />
                <MatchupGroup
                  label="Hard Resist"
                  multiplier="0.25x"
                  tone="great"
                  compact
                  entries={buckets.quarter.map((entry) => entry.attackType)}
                />
              </div>
              <div className="matchup-grid matchup-grid-secondary">
                <MatchupGroup
                  label="Immune"
                  multiplier="0x"
                  tone="muted"
                  compact
                  entries={buckets.immune.map((entry) => entry.attackType)}
                />
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
