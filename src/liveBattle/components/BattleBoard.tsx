import { memo } from "react";
import { formatWeatherName, type ChampionsCatalogIndex } from "../catalog";
import type { ChampionsSnapshot, SnapshotWorld } from "../types";
import { BattleTeamField } from "./BattleTeamField";

type BattleBoardProps = {
  snapshot: ChampionsSnapshot;
  catalog: ChampionsCatalogIndex;
};

export function hasRenderableBattleState(snapshot: ChampionsSnapshot) {
  const { state } = snapshot;
  const world = state.world as Partial<SnapshotWorld>;

  return (
    state.available &&
    state.local_team_index >= 0 &&
    state.teams.length > 0 &&
    Number.isFinite(world.elapsed_turns) &&
    Number.isFinite(world.weather_md_id) &&
    Number.isFinite(world.weather_lifespan_turns) &&
    Number.isFinite(world.weather_elapsed_turns) &&
    Array.isArray(world.field_effects) &&
    Array.isArray(world.sides)
  );
}

export const BattleBoard = memo(function BattleBoard({ snapshot, catalog }: BattleBoardProps) {
  if (!hasRenderableBattleState(snapshot)) {
    return (
      <div className="live-lab-board">
        <section className="live-lab-empty-state" aria-live="polite">
          <strong>No active battle on the phone.</strong>
          <p>
            USB refresh succeeded. Start a battle and refresh again, or select an earlier capture
            above to inspect the completed match.
          </p>
        </section>
      </div>
    );
  }

  const localTeamIndex = snapshot.state.local_team_index;
  const remoteTeams = snapshot.state.teams.filter((team) => team.team_index !== localTeamIndex);
  const localTeam = snapshot.state.teams.find((team) => team.team_index === localTeamIndex);
  const world = snapshot.state.world;
  const weather = formatWeatherName(catalog.weatherByNumber.get(world.weather_md_id));
  const weatherRemaining =
    world.weather_lifespan_turns > 0
      ? Math.max(0, world.weather_lifespan_turns - world.weather_elapsed_turns)
      : null;

  return (
    <div className="live-lab-board">
      {remoteTeams.map((team) => (
        <BattleTeamField
          key={team.team_index}
          team={team}
          catalog={catalog}
          localTeamIndex={localTeamIndex}
        />
      ))}

      <section className="live-lab-field-state" aria-label="Current field state">
        <div>
          <span>Turn</span>
          <strong>{world.elapsed_turns + 1}</strong>
        </div>
        <div className="live-lab-field-state__weather">
          <span className="live-lab-field-state__orb" aria-hidden="true" />
          <p>
            <span>Weather</span>
            <strong>{weather}</strong>
          </p>
          {weatherRemaining !== null ? <small>{weatherRemaining} turns left</small> : null}
        </div>
        <div>
          <span>Field data</span>
          <strong>{world.field_effects.length} effects</strong>
        </div>
      </section>

      {localTeam ? (
        <BattleTeamField
          team={localTeam}
          catalog={catalog}
          localTeamIndex={localTeamIndex}
        />
      ) : (
        <section className="live-lab-empty-state">
          <strong>No local battle team is present.</strong>
          <p>Select an earlier capture from the timeline.</p>
        </section>
      )}
    </div>
  );
});
