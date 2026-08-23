use crate::{MechanicsCatalog, PokemonKey, SimulationState};

pub(crate) fn effective_weather_for_pokemon(
    state: &SimulationState,
    pokemon_key: PokemonKey,
    catalog: &MechanicsCatalog,
) -> i32 {
    if active_weather_suppressor(state, catalog) {
        return 0;
    }
    let weather = state.world.weather_md_id;
    let umbrella = catalog.item_by_id("utilityumbrella").map(|item| item.num);
    let holder_ignores = state
        .pokemon(pokemon_key)
        .is_some_and(|pokemon| pokemon.item_md_id == umbrella)
        && matches!(weather, 1 | 2 | 5 | 6);
    if holder_ignores { 0 } else { weather }
}

fn active_weather_suppressor(state: &SimulationState, catalog: &MechanicsCatalog) -> bool {
    state
        .teams
        .iter()
        .flat_map(|team| &team.pokemon)
        .filter(|pokemon| pokemon.is_active() && pokemon.current_hp > 0)
        .any(|pokemon| {
            catalog
                .abilities_by_num(pokemon.ability_md_id)
                .any(|ability| matches!(ability.id.as_str(), "airlock" | "cloudnine"))
        })
}
