import type { CSSProperties } from "react";
import { getPokemonSpriteUrl } from "../../lib/pokemonDb";
import { TYPE_META, getTypeFromLabel } from "../../data/typeChart";
import { resolveSnapshotSpecies, type ChampionsCatalogIndex } from "../catalog";
import type { SnapshotPokemon } from "../types";

type PokemonBattleCardProps = {
  pokemon: SnapshotPokemon;
  catalog: ChampionsCatalogIndex;
  isLocal: boolean;
};

const stageLabels: Array<[keyof SnapshotPokemon["stat_stages"], string]> = [
  ["attack", "Atk"],
  ["defense", "Def"],
  ["special_attack", "SpA"],
  ["special_defense", "SpD"],
  ["speed", "Spe"],
  ["accuracy", "Acc"],
  ["evasion", "Eva"],
];

function hpPresentation(pokemon: SnapshotPokemon, isLocal: boolean) {
  if (pokemon.fainted) {
    return { percent: 0, label: "Fainted" };
  }
  if (isLocal && pokemon.max_hp > 0) {
    return {
      percent: Math.max(0, Math.min(100, (pokemon.current_hp / pokemon.max_hp) * 100)),
      label: `${pokemon.current_hp} / ${pokemon.max_hp} HP`,
    };
  }
  const percent = Math.max(0, Math.min(100, pokemon.raw_hp_ratio / 100));
  return { percent, label: `${percent.toFixed(percent < 10 ? 1 : 0)}% HP` };
}

function stageLabel(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function PokemonBattleCard({ pokemon, catalog, isLocal }: PokemonBattleCardProps) {
  const species = resolveSnapshotSpecies(pokemon, catalog);
  const hp = hpPresentation(pokemon, isLocal);
  const item = pokemon.item_md_id >= 0 ? catalog.itemsByNumber.get(pokemon.item_md_id) : null;
  const ability = catalog.abilitiesByNumber.get(pokemon.ability_md_id);
  const active = pokemon.side_index >= 0 && pokemon.position_index >= 0 && !pokemon.fainted;
  const stages = stageLabels.filter(([key]) => pokemon.stat_stages[key] !== 0);
  const typeNames = species?.types ?? [];

  return (
    <article
      className={`live-lab-pokemon-card${active ? " is-active" : ""}${pokemon.fainted ? " is-fainted" : ""}`}
      data-pokemon-group={pokemon.group_index}
    >
      <header className="live-lab-pokemon-card__header">
        <span className="live-lab-pokemon-card__slot">
          {active ? `Active ${pokemon.position_index}` : `Roster ${pokemon.group_index + 1}`}
        </span>
        <span className={`live-lab-knowledge ${isLocal ? "is-exact" : "is-observed"}`}>
          {isLocal ? "Exact" : "Observed"}
        </span>
      </header>

      <div className="live-lab-pokemon-card__identity">
        <div className="live-lab-pokemon-card__sprite-wrap">
          {species ? (
            <img src={getPokemonSpriteUrl(species.id)} alt={`${species.name} sprite`} />
          ) : (
            <span aria-hidden="true">?</span>
          )}
        </div>
        <div>
          <h3>{species?.name ?? `Pokémon #${pokemon.personal_id}`}</h3>
          <div className="live-lab-type-row" aria-label="Types">
            {typeNames.map((typeName) => {
              const type = getTypeFromLabel(typeName);
              if (!type) {
                return null;
              }
              return (
                <span
                  key={type}
                  style={{ "--live-type-color": TYPE_META[type].color } as CSSProperties}
                >
                  {TYPE_META[type].label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="live-lab-hp" aria-label={hp.label}>
        <div className="live-lab-hp__track">
          <span style={{ width: `${hp.percent}%` }} />
        </div>
        <strong>{hp.label}</strong>
      </div>

      <dl className="live-lab-pokemon-card__facts">
        <div>
          <dt>Ability</dt>
          <dd>{ability?.name ?? (pokemon.ability_md_id > 0 ? `ID ${pokemon.ability_md_id}` : "Unknown")}</dd>
        </div>
        <div>
          <dt>Item</dt>
          <dd className={!item && !isLocal ? "is-hidden" : undefined}>
            {item?.name ?? (isLocal ? "None" : "Hidden")}
          </dd>
        </div>
      </dl>

      {stages.length > 0 ? (
        <div className="live-lab-stage-row" aria-label="Current stat stages">
          {stages.map(([key, label]) => (
            <span key={key} className={pokemon.stat_stages[key] > 0 ? "is-positive" : "is-negative"}>
              {label} {stageLabel(pokemon.stat_stages[key])}
            </span>
          ))}
        </div>
      ) : null}

      {pokemon.moves.length > 0 ? (
        <ul className="live-lab-move-list" aria-label="Known moves">
          {pokemon.moves.map((move) => {
            const moveRecord = catalog.movesByNumber.get(move.md_id);
            return (
              <li key={`${pokemon.group_index}-${move.slot_index}`}>
                <span>{moveRecord?.name ?? `Move ${move.md_id}`}</span>
                <small>{move.current_pp}/{move.max_pp}</small>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="live-lab-hidden-row">
          <span aria-hidden="true">••••</span>
          <strong>Moves hidden by game client</strong>
        </div>
      )}

      {pokemon.volatile_effects.length + pokemon.field_effects.length > 0 ? (
        <p className="live-lab-effect-note">
          {pokemon.volatile_effects.length + pokemon.field_effects.length} runtime effect
          {pokemon.volatile_effects.length + pokemon.field_effects.length === 1 ? "" : "s"} tracked
        </p>
      ) : null}
    </article>
  );
}
