use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::{Display, Formatter};

const SUPPORTED_MECHANICS_SCHEMA_VERSION: u32 = 1;
const SUPPORTED_RULESET: &str = "pokemon-champions-doubles-v1";

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MechanicsPack {
    pub schema_version: u32,
    pub ruleset: String,
    pub source: MechanicsSource,
    pub runtime_id_semantics: BTreeMap<String, String>,
    pub runtime_enums: RuntimeEnums,
    pub damage_taken_codes: DamageTakenCodes,
    pub limits: MechanicsLimits,
    pub stat_rules: StatRules,
    pub damage_rules: DamageRules,
    pub counts: MechanicsCounts,
    pub types: Vec<TypeRecord>,
    pub natures: Vec<NatureRecord>,
    pub species: Vec<SpeciesRecord>,
    pub abilities: Vec<AbilityRecord>,
    pub items: Vec<ItemRecord>,
    pub moves: Vec<MoveRecord>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MechanicsSource {
    pub package: String,
    pub version: String,
    pub simulator_package: String,
    pub simulator_version: String,
    pub generation: u8,
    pub learnset_regulation: String,
    pub learnset_regulation_window: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct RuntimeEnums {
    pub weather: BTreeMap<String, i32>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct DamageTakenCodes {
    pub neutral: u8,
    pub weak: u8,
    pub resistant: u8,
    pub immune: u8,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MechanicsLimits {
    pub teams: usize,
    pub pokemon_per_team: usize,
    pub selected_pokemon_per_team: usize,
    pub active_pokemon_per_team: usize,
    pub moves_per_pokemon: usize,
    pub stat_stage_minimum: i8,
    pub stat_stage_maximum: i8,
    pub hp_ratio_basis_points: i32,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StatRules {
    pub level: i32,
    pub hp_baseline_bonus: i32,
    pub other_stat_baseline_bonus: i32,
    pub maximum_points_per_stat: i32,
    pub total_points: i32,
    pub nature_boost_numerator: i32,
    pub nature_drop_numerator: i32,
    pub nature_denominator: i32,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DamageRules {
    pub level_factor: i32,
    pub spread_numerator: i32,
    pub spread_denominator: i32,
    pub random_minimum: i32,
    pub random_maximum: i32,
    pub random_denominator: i32,
    pub stab_numerator: i32,
    pub stab_denominator: i32,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct MechanicsCounts {
    pub species: usize,
    pub abilities: usize,
    pub items: usize,
    pub moves: usize,
    pub natures: usize,
    pub types: usize,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TypeRecord {
    pub id: String,
    pub name: String,
    pub damage_taken: BTreeMap<String, u8>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NatureRecord {
    pub id: String,
    pub name: String,
    pub champions_md_id: u16,
    pub plus: Option<String>,
    pub minus: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpeciesRecord {
    pub num: i32,
    pub id: String,
    pub name: String,
    pub base_species: String,
    pub forme: Option<String>,
    pub types: Vec<String>,
    pub base_stats: BaseStats,
    pub abilities: Vec<SpeciesAbility>,
    pub height_m: Option<f64>,
    pub weight_kg: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct BaseStats {
    pub hp: u16,
    pub atk: u16,
    pub def: u16,
    pub spa: u16,
    pub spd: u16,
    pub spe: u16,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct SpeciesAbility {
    pub slot: String,
    pub num: i32,
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AbilityRecord {
    pub num: i32,
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub callback_keys: Vec<String>,
    #[serde(default)]
    pub flags: BTreeMap<String, u8>,
    pub short_desc: String,
    pub desc: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ItemRecord {
    pub num: i32,
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub mega_stone: BTreeMap<String, String>,
    #[serde(default)]
    pub callback_keys: Vec<String>,
    pub short_desc: String,
    pub desc: String,
    #[serde(default)]
    pub fling: Option<Value>,
    #[serde(default)]
    pub natural_gift: Option<Value>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MoveRecord {
    pub num: i32,
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub move_type: String,
    pub category: String,
    pub base_power: i32,
    pub accuracy: Accuracy,
    pub pp: i32,
    pub priority: i8,
    pub target: String,
    #[serde(default)]
    pub callback_keys: Vec<String>,
    #[serde(default)]
    pub flags: BTreeMap<String, u8>,
    #[serde(flatten)]
    pub mechanics: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Accuracy {
    AlwaysHits(bool),
    Percent(f64),
}

#[derive(Debug, Clone)]
pub struct MechanicsCatalog {
    pack: MechanicsPack,
    species_by_num: BTreeMap<i32, Vec<usize>>,
    abilities_by_num: BTreeMap<i32, Vec<usize>>,
    items_by_num: BTreeMap<i32, Vec<usize>>,
    moves_by_num: BTreeMap<i32, usize>,
}

impl MechanicsCatalog {
    pub fn from_pack(pack: MechanicsPack) -> Result<Self, MechanicsError> {
        validate_pack(&pack)?;

        let mut species_by_num = BTreeMap::<i32, Vec<usize>>::new();
        for (index, species) in pack.species.iter().enumerate() {
            species_by_num.entry(species.num).or_default().push(index);
        }
        let abilities_by_num = multi_index(&pack.abilities, |entry| entry.num);
        let items_by_num = multi_index(&pack.items, |entry| entry.num);
        let moves_by_num = unique_index(&pack.moves, |entry| entry.num, "move")?;

        Ok(Self {
            pack,
            species_by_num,
            abilities_by_num,
            items_by_num,
            moves_by_num,
        })
    }

    pub fn pack(&self) -> &MechanicsPack {
        &self.pack
    }

    pub fn species_by_num(&self, number: i32) -> impl Iterator<Item = &SpeciesRecord> {
        self.species_by_num
            .get(&number)
            .into_iter()
            .flatten()
            .map(|index| &self.pack.species[*index])
    }

    pub fn species_by_id(&self, id: &str) -> Option<&SpeciesRecord> {
        self.pack
            .species
            .iter()
            .find(|species| species.id.eq_ignore_ascii_case(id))
    }

    pub fn abilities_by_num(&self, number: i32) -> impl Iterator<Item = &AbilityRecord> {
        self.abilities_by_num
            .get(&number)
            .into_iter()
            .flatten()
            .map(|index| &self.pack.abilities[*index])
    }

    pub fn items_by_num(&self, number: i32) -> impl Iterator<Item = &ItemRecord> {
        self.items_by_num
            .get(&number)
            .into_iter()
            .flatten()
            .map(|index| &self.pack.items[*index])
    }

    pub fn item_by_id(&self, id: &str) -> Option<&ItemRecord> {
        self.pack
            .items
            .iter()
            .find(|item| item.id.eq_ignore_ascii_case(id))
    }

    pub fn move_by_num(&self, number: i32) -> Option<&MoveRecord> {
        self.moves_by_num
            .get(&number)
            .map(|index| &self.pack.moves[*index])
    }

    pub fn nature_by_champions_md_id(&self, md_id: u16) -> Option<&NatureRecord> {
        self.pack
            .natures
            .iter()
            .find(|nature| nature.champions_md_id == md_id)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MechanicsError {
    TooLarge { actual: usize, maximum: usize },
    InvalidJson(String),
    ChecksumFormat(String),
    ChecksumMismatch { expected: String, actual: String },
    UnsupportedSchema(u32),
    UnsupportedRuleset(String),
    InvalidPack(String),
}

impl Display for MechanicsError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooLarge { actual, maximum } => {
                write!(
                    formatter,
                    "mechanics pack is {actual} bytes; maximum is {maximum}"
                )
            }
            Self::InvalidJson(message) => write!(formatter, "invalid mechanics JSON: {message}"),
            Self::ChecksumFormat(message) => write!(formatter, "invalid checksum file: {message}"),
            Self::ChecksumMismatch { expected, actual } => {
                write!(
                    formatter,
                    "mechanics checksum mismatch: expected={expected}, actual={actual}"
                )
            }
            Self::UnsupportedSchema(version) => {
                write!(formatter, "unsupported mechanics schema version: {version}")
            }
            Self::UnsupportedRuleset(ruleset) => {
                write!(formatter, "unsupported mechanics ruleset: {ruleset}")
            }
            Self::InvalidPack(message) => write!(formatter, "invalid mechanics pack: {message}"),
        }
    }
}

impl std::error::Error for MechanicsError {}

pub fn load_mechanics_pack(
    bytes: &[u8],
    checksum_document: &[u8],
) -> Result<MechanicsCatalog, MechanicsError> {
    const MAXIMUM_BYTES: usize = 8 * 1024 * 1024;
    if bytes.len() > MAXIMUM_BYTES {
        return Err(MechanicsError::TooLarge {
            actual: bytes.len(),
            maximum: MAXIMUM_BYTES,
        });
    }
    validate_checksum(bytes, checksum_document)?;
    let pack: MechanicsPack = serde_json::from_slice(bytes)
        .map_err(|error| MechanicsError::InvalidJson(error.to_string()))?;
    MechanicsCatalog::from_pack(pack)
}

fn validate_checksum(bytes: &[u8], checksum_document: &[u8]) -> Result<(), MechanicsError> {
    let document = std::str::from_utf8(checksum_document)
        .map_err(|error| MechanicsError::ChecksumFormat(error.to_string()))?;
    let expected = document
        .split_whitespace()
        .next()
        .ok_or_else(|| MechanicsError::ChecksumFormat("missing hexadecimal digest".to_owned()))?;
    if expected.len() != 64 || !expected.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(MechanicsError::ChecksumFormat(expected.to_owned()));
    }
    let actual = format!("{:x}", Sha256::digest(bytes));
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(MechanicsError::ChecksumMismatch {
            expected: expected.to_ascii_lowercase(),
            actual,
        });
    }
    Ok(())
}

fn validate_pack(pack: &MechanicsPack) -> Result<(), MechanicsError> {
    if pack.schema_version != SUPPORTED_MECHANICS_SCHEMA_VERSION {
        return Err(MechanicsError::UnsupportedSchema(pack.schema_version));
    }
    if pack.ruleset != SUPPORTED_RULESET {
        return Err(MechanicsError::UnsupportedRuleset(pack.ruleset.clone()));
    }
    let observed_counts = MechanicsCounts {
        species: pack.species.len(),
        abilities: pack.abilities.len(),
        items: pack.items.len(),
        moves: pack.moves.len(),
        natures: pack.natures.len(),
        types: pack.types.len(),
    };
    if pack.counts != observed_counts {
        return Err(MechanicsError::InvalidPack(format!(
            "count manifest {:?} does not match contents {:?}",
            pack.counts, observed_counts
        )));
    }
    if pack.limits.teams != 2
        || pack.limits.pokemon_per_team != 6
        || pack.limits.selected_pokemon_per_team != 4
        || pack.limits.active_pokemon_per_team != 2
        || pack.limits.moves_per_pokemon != 4
        || pack.limits.hp_ratio_basis_points != 10_000
    {
        return Err(MechanicsError::InvalidPack(
            "battle limits do not match the supported doubles format".to_owned(),
        ));
    }
    if pack.damage_taken_codes
        != (DamageTakenCodes {
            neutral: 0,
            weak: 1,
            resistant: 2,
            immune: 3,
        })
    {
        return Err(MechanicsError::InvalidPack(
            "type-chart damage codes are not supported".to_owned(),
        ));
    }
    let expected_weather = BTreeMap::from([
        ("none".to_owned(), 0),
        ("sunnyDay".to_owned(), 1),
        ("rain".to_owned(), 2),
        ("snow".to_owned(), 3),
        ("sandstorm".to_owned(), 4),
        ("heavyRain".to_owned(), 5),
        ("harshSunlight".to_owned(), 6),
        ("turbulence".to_owned(), 7),
        ("hail".to_owned(), 8),
    ]);
    if pack.runtime_enums.weather != expected_weather {
        return Err(MechanicsError::InvalidPack(
            "weather runtime IDs do not match Pokemon Champions 1.1.4".to_owned(),
        ));
    }
    if pack.stat_rules
        != (StatRules {
            level: 50,
            hp_baseline_bonus: 75,
            other_stat_baseline_bonus: 20,
            maximum_points_per_stat: 32,
            total_points: 66,
            nature_boost_numerator: 11,
            nature_drop_numerator: 9,
            nature_denominator: 10,
        })
    {
        return Err(MechanicsError::InvalidPack(
            "Champions stat rules do not match the supported formula".to_owned(),
        ));
    }
    if pack.damage_rules
        != (DamageRules {
            level_factor: 22,
            spread_numerator: 3,
            spread_denominator: 4,
            random_minimum: 85,
            random_maximum: 100,
            random_denominator: 100,
            stab_numerator: 3,
            stab_denominator: 2,
        })
    {
        return Err(MechanicsError::InvalidPack(
            "Champions base damage rules do not match the supported formula".to_owned(),
        ));
    }
    validate_positive_identifiers(
        &pack.species,
        |entry| entry.num,
        |entry| &entry.id,
        "species",
    )?;
    validate_positive_identifiers(
        &pack.abilities,
        |entry| entry.num,
        |entry| &entry.id,
        "ability",
    )?;
    validate_positive_identifiers(&pack.items, |entry| entry.num, |entry| &entry.id, "item")?;
    validate_positive_identifiers(&pack.moves, |entry| entry.num, |entry| &entry.id, "move")?;
    Ok(())
}

fn validate_positive_identifiers<T, Number, Identifier>(
    records: &[T],
    number: Number,
    identifier: Identifier,
    label: &str,
) -> Result<(), MechanicsError>
where
    Number: Fn(&T) -> i32,
    Identifier: Fn(&T) -> &String,
{
    let mut ids = BTreeSet::new();
    for record in records {
        if number(record) <= 0 {
            return Err(MechanicsError::InvalidPack(format!(
                "{label} {} has a non-positive numeric ID",
                identifier(record)
            )));
        }
        if identifier(record).is_empty() || !ids.insert(identifier(record)) {
            return Err(MechanicsError::InvalidPack(format!(
                "{label} identifier is empty or duplicated: {}",
                identifier(record)
            )));
        }
    }
    Ok(())
}

fn unique_index<T, Number>(
    records: &[T],
    number: Number,
    label: &str,
) -> Result<BTreeMap<i32, usize>, MechanicsError>
where
    Number: Fn(&T) -> i32,
{
    let mut index = BTreeMap::new();
    for (position, record) in records.iter().enumerate() {
        let numeric_id = number(record);
        if index.insert(numeric_id, position).is_some() {
            return Err(MechanicsError::InvalidPack(format!(
                "duplicate {label} numeric ID {numeric_id}"
            )));
        }
    }
    Ok(index)
}

fn multi_index<T, Number>(records: &[T], number: Number) -> BTreeMap<i32, Vec<usize>>
where
    Number: Fn(&T) -> i32,
{
    let mut index = BTreeMap::<i32, Vec<usize>>::new();
    for (position, record) in records.iter().enumerate() {
        index.entry(number(record)).or_default().push(position);
    }
    index
}

#[cfg(test)]
mod tests {
    use super::*;

    const PACK: &[u8] = include_bytes!("../data/champions-mechanics-v1.json");
    const CHECKSUM: &[u8] = include_bytes!("../data/champions-mechanics-v1.json.sha256");

    #[test]
    fn loads_the_checked_in_mechanics_pack() {
        let catalog = load_mechanics_pack(PACK, CHECKSUM).expect("checked-in pack should validate");
        assert_eq!(catalog.pack().source.package, "@pkmn/dex");
        assert_eq!(catalog.pack().source.generation, 9);
        assert_eq!(catalog.pack().counts.moves, 688);
        assert_eq!(
            catalog.move_by_num(165).map(|entry| entry.id.as_str()),
            Some("struggle")
        );
    }

    #[test]
    fn maps_numeric_ids_observed_in_the_live_snapshot() {
        let catalog = load_mechanics_pack(PACK, CHECKSUM).expect("checked-in pack should validate");
        assert_eq!(
            catalog
                .species_by_num(279)
                .next()
                .map(|entry| entry.id.as_str()),
            Some("pelipper")
        );
        assert_eq!(
            catalog.move_by_num(542).map(|entry| entry.id.as_str()),
            Some("hurricane")
        );
        assert_eq!(
            catalog.move_by_num(311).map(|entry| entry.id.as_str()),
            Some("weatherball")
        );
        assert_eq!(
            catalog
                .abilities_by_num(2)
                .next()
                .map(|entry| entry.id.as_str()),
            Some("drizzle")
        );
        assert_eq!(
            catalog
                .items_by_num(275)
                .next()
                .map(|entry| entry.id.as_str()),
            Some("focussash")
        );
    }

    #[test]
    fn retains_numeric_aliases_instead_of_silently_choosing_one() {
        let catalog = load_mechanics_pack(PACK, CHECKSUM).expect("checked-in pack should validate");
        let ruin_abilities = catalog
            .abilities_by_num(284)
            .map(|entry| entry.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            ruin_abilities,
            vec!["beadsofruin", "tabletsofruin", "vesselofruin"]
        );
    }

    #[test]
    fn rejects_a_pack_whose_bytes_do_not_match_the_checksum() {
        let mut modified = PACK.to_vec();
        modified[100] ^= 1;
        let error = load_mechanics_pack(&modified, CHECKSUM).expect_err("tampered pack must fail");
        assert!(matches!(error, MechanicsError::ChecksumMismatch { .. }));
    }
}
