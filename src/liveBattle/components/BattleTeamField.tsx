import { PokemonBattleCard } from "./PokemonBattleCard";
import type { ChampionsCatalogIndex } from "../catalog";
import type { SnapshotTeam } from "../types";

type BattleTeamFieldProps = {
  team: SnapshotTeam;
  catalog: ChampionsCatalogIndex;
  localTeamIndex: number;
};

function pokemonOrder(team: SnapshotTeam) {
  return [...team.pokemon].sort((left, right) => {
    const leftActive = left.side_index >= 0 && left.position_index >= 0 && !left.fainted;
    const rightActive = right.side_index >= 0 && right.position_index >= 0 && !right.fainted;
    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1;
    }
    if (leftActive && rightActive) {
      return left.position_index - right.position_index;
    }
    const leftSelected = left.selection_order >= 0 ? left.selection_order : Number.MAX_SAFE_INTEGER;
    const rightSelected = right.selection_order >= 0 ? right.selection_order : Number.MAX_SAFE_INTEGER;
    return leftSelected - rightSelected || left.group_index - right.group_index;
  });
}

export function BattleTeamField({ team, catalog, localTeamIndex }: BattleTeamFieldProps) {
  const isLocal = team.team_index === localTeamIndex;
  const orderedPokemon = pokemonOrder(team);
  const activeCount = team.pokemon.filter(
    (pokemon) => pokemon.side_index >= 0 && pokemon.position_index >= 0 && !pokemon.fainted,
  ).length;

  return (
    <section className={`live-lab-team-field ${isLocal ? "is-local" : "is-remote"}`}>
      <header className="live-lab-team-field__header">
        <div>
          <p>{isLocal ? "Your field" : "Opponent field"}</p>
          <h2>{isLocal ? "Local squad" : "Remote squad"}</h2>
        </div>
        <div className="live-lab-team-field__meta">
          <span>{activeCount} active</span>
          <span>{team.pokemon.filter((pokemon) => pokemon.fainted).length} fainted</span>
          {team.waiting_for_action ? <strong>Awaiting move</strong> : <span>Resolving</span>}
        </div>
      </header>

      <div className="live-lab-team-grid">
        {orderedPokemon.map((pokemon) => (
          <PokemonBattleCard
            key={`${team.team_index}-${pokemon.group_index}`}
            pokemon={pokemon}
            catalog={catalog}
            isLocal={isLocal}
          />
        ))}
      </div>
    </section>
  );
}
