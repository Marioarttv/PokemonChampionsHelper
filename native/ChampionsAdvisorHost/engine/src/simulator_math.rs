use crate::mechanics::{DamageRules, MechanicsCatalog, SpeciesRecord, StatRules};
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct TrainingPoints {
    pub hp: i32,
    pub attack: i32,
    pub defense: i32,
    pub special_attack: i32,
    pub special_defense: i32,
    pub speed: i32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct BattleStats {
    pub hp: i32,
    pub attack: i32,
    pub defense: i32,
    pub special_attack: i32,
    pub special_defense: i32,
    pub speed: i32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Rational {
    pub numerator: i32,
    pub denominator: i32,
}

impl Rational {
    pub const ONE: Self = Self {
        numerator: 1,
        denominator: 1,
    };

    pub const ZERO: Self = Self {
        numerator: 0,
        denominator: 1,
    };

    pub fn new(numerator: i32, denominator: i32) -> Result<Self, MathError> {
        if denominator <= 0 || numerator < 0 {
            return Err(MathError::InvalidRatio {
                numerator,
                denominator,
            });
        }
        let divisor = greatest_common_divisor(numerator, denominator);
        Ok(Self {
            numerator: numerator / divisor,
            denominator: denominator / divisor,
        })
    }

    pub fn multiply(self, other: Self) -> Result<Self, MathError> {
        let numerator = i64::from(self.numerator) * i64::from(other.numerator);
        let denominator = i64::from(self.denominator) * i64::from(other.denominator);
        if numerator > i64::from(i32::MAX) || denominator > i64::from(i32::MAX) {
            return Err(MathError::Overflow);
        }
        Self::new(numerator as i32, denominator as i32)
    }

    pub fn apply_floor(self, value: i32) -> Result<i32, MathError> {
        if value < 0 {
            return Err(MathError::NegativeValue(value));
        }
        let result = i64::from(value) * i64::from(self.numerator) / i64::from(self.denominator);
        i32::try_from(result).map_err(|_| MathError::Overflow)
    }

    /// Applies a modern battle modifier using the games' 12-bit fixed-point
    /// rounding rule. Exact halves round down, while values above a half round up.
    pub fn apply_modifier_round(self, value: i32) -> Result<i32, MathError> {
        if value < 0 {
            return Err(MathError::NegativeValue(value));
        }
        const SCALE: i64 = 4_096;
        const HALF_DOWN_BIAS: i64 = 2_047;
        let modifier = i64::from(self.numerator)
            .checked_mul(SCALE)
            .ok_or(MathError::Overflow)?
            / i64::from(self.denominator);
        let scaled = i64::from(value)
            .checked_mul(modifier)
            .and_then(|result| result.checked_add(HALF_DOWN_BIAS))
            .ok_or(MathError::Overflow)?;
        i32::try_from(scaled / SCALE).map_err(|_| MathError::Overflow)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DamageInput {
    pub base_power: i32,
    pub attack: i32,
    pub defense: i32,
    pub spread: bool,
    pub stab: Rational,
    pub type_effectiveness: Rational,
    pub modifiers_before_random: Vec<Rational>,
    pub modifiers_after_random: Vec<Rational>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DamageRolls {
    pub values: Vec<i32>,
}

impl DamageRolls {
    pub fn minimum(&self) -> i32 {
        self.values.iter().copied().min().unwrap_or(0)
    }

    pub fn maximum(&self) -> i32 {
        self.values.iter().copied().max().unwrap_or(0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MathError {
    InvalidTrainingPoints(String),
    UnknownNature(String),
    UnknownType(String),
    MissingTypeRelation {
        attacking: String,
        defending: String,
    },
    InvalidTypeRelation {
        defending: String,
        code: u8,
    },
    InvalidStatStage(i32),
    InvalidDamageInput(String),
    InvalidRatio {
        numerator: i32,
        denominator: i32,
    },
    NegativeValue(i32),
    Overflow,
}

impl Display for MathError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidTrainingPoints(message) => {
                write!(formatter, "invalid training points: {message}")
            }
            Self::UnknownNature(nature) => write!(formatter, "unknown nature: {nature}"),
            Self::UnknownType(move_type) => write!(formatter, "unknown type: {move_type}"),
            Self::MissingTypeRelation {
                attacking,
                defending,
            } => {
                write!(
                    formatter,
                    "type chart has no {attacking} -> {defending} relation"
                )
            }
            Self::InvalidTypeRelation { defending, code } => {
                write!(
                    formatter,
                    "type {defending} has unsupported damage-taken code {code}"
                )
            }
            Self::InvalidStatStage(stage) => {
                write!(formatter, "stat stage is outside -6..6: {stage}")
            }
            Self::InvalidDamageInput(message) => {
                write!(formatter, "invalid damage input: {message}")
            }
            Self::InvalidRatio {
                numerator,
                denominator,
            } => write!(
                formatter,
                "invalid nonnegative ratio {numerator}/{denominator}"
            ),
            Self::NegativeValue(value) => {
                write!(formatter, "expected a nonnegative value, got {value}")
            }
            Self::Overflow => write!(formatter, "integer overflow in simulator math"),
        }
    }
}

impl std::error::Error for MathError {}

pub fn calculate_battle_stats(
    species: &SpeciesRecord,
    training: TrainingPoints,
    nature_id: &str,
    catalog: &MechanicsCatalog,
) -> Result<BattleStats, MathError> {
    let rules = &catalog.pack().stat_rules;
    validate_training_points(training, rules)?;
    let nature = catalog
        .pack()
        .natures
        .iter()
        .find(|nature| nature.id.eq_ignore_ascii_case(nature_id))
        .ok_or_else(|| MathError::UnknownNature(nature_id.to_owned()))?;

    Ok(BattleStats {
        hp: species.base_stats.hp as i32 + rules.hp_baseline_bonus + training.hp,
        attack: calculate_other_stat(
            species.base_stats.atk as i32,
            training.attack,
            "atk",
            nature.plus.as_deref(),
            nature.minus.as_deref(),
            rules,
        )?,
        defense: calculate_other_stat(
            species.base_stats.def as i32,
            training.defense,
            "def",
            nature.plus.as_deref(),
            nature.minus.as_deref(),
            rules,
        )?,
        special_attack: calculate_other_stat(
            species.base_stats.spa as i32,
            training.special_attack,
            "spa",
            nature.plus.as_deref(),
            nature.minus.as_deref(),
            rules,
        )?,
        special_defense: calculate_other_stat(
            species.base_stats.spd as i32,
            training.special_defense,
            "spd",
            nature.plus.as_deref(),
            nature.minus.as_deref(),
            rules,
        )?,
        speed: calculate_other_stat(
            species.base_stats.spe as i32,
            training.speed,
            "spe",
            nature.plus.as_deref(),
            nature.minus.as_deref(),
            rules,
        )?,
    })
}

pub fn apply_stat_stage(value: i32, stage: i32) -> Result<i32, MathError> {
    if value < 0 {
        return Err(MathError::NegativeValue(value));
    }
    if !(-6..=6).contains(&stage) {
        return Err(MathError::InvalidStatStage(stage));
    }
    let ratio = if stage >= 0 {
        Rational::new(2 + stage, 2)?
    } else {
        Rational::new(2, 2 - stage)?
    };
    ratio.apply_floor(value)
}

pub fn type_multiplier(
    attacking_type: &str,
    defending_types: &[String],
    catalog: &MechanicsCatalog,
) -> Result<Rational, MathError> {
    let attacking = catalog
        .pack()
        .types
        .iter()
        .find(|entry| {
            entry.id.eq_ignore_ascii_case(attacking_type)
                || entry.name.eq_ignore_ascii_case(attacking_type)
        })
        .ok_or_else(|| MathError::UnknownType(attacking_type.to_owned()))?;
    let mut multiplier = Rational::ONE;
    for defending_type in defending_types {
        let defending = catalog
            .pack()
            .types
            .iter()
            .find(|entry| {
                entry.id.eq_ignore_ascii_case(defending_type)
                    || entry.name.eq_ignore_ascii_case(defending_type)
            })
            .ok_or_else(|| MathError::UnknownType(defending_type.clone()))?;
        let code = defending
            .damage_taken
            .get(&attacking.name)
            .copied()
            .ok_or_else(|| MathError::MissingTypeRelation {
                attacking: attacking.name.clone(),
                defending: defending.name.clone(),
            })?;
        let relation = if code == catalog.pack().damage_taken_codes.neutral {
            Rational::ONE
        } else if code == catalog.pack().damage_taken_codes.weak {
            Rational::new(2, 1)?
        } else if code == catalog.pack().damage_taken_codes.resistant {
            Rational::new(1, 2)?
        } else if code == catalog.pack().damage_taken_codes.immune {
            Rational::ZERO
        } else {
            return Err(MathError::InvalidTypeRelation {
                defending: defending.name.clone(),
                code,
            });
        };
        multiplier = multiplier.multiply(relation)?;
    }
    Ok(multiplier)
}

pub fn calculate_damage_rolls(
    input: &DamageInput,
    rules: &DamageRules,
) -> Result<DamageRolls, MathError> {
    if input.base_power < 0 || input.attack <= 0 || input.defense <= 0 {
        return Err(MathError::InvalidDamageInput(format!(
            "power={}, attack={}, defense={}",
            input.base_power, input.attack, input.defense
        )));
    }
    if rules.random_minimum < 0
        || rules.random_maximum < rules.random_minimum
        || rules.random_denominator <= 0
    {
        return Err(MathError::InvalidDamageInput(
            "damage random range is malformed".to_owned(),
        ));
    }
    if input.base_power == 0 || input.type_effectiveness.numerator == 0 {
        return Ok(DamageRolls {
            values: vec![0; (rules.random_maximum - rules.random_minimum + 1) as usize],
        });
    }

    let numerator =
        i64::from(rules.level_factor) * i64::from(input.base_power) * i64::from(input.attack);
    let divided_by_defense = numerator / i64::from(input.defense);
    let base = divided_by_defense / 50 + 2;
    let mut base_damage = i32::try_from(base).map_err(|_| MathError::Overflow)?;
    if input.spread {
        base_damage = Rational::new(rules.spread_numerator, rules.spread_denominator)?
            .apply_modifier_round(base_damage)?;
    }
    for modifier in &input.modifiers_before_random {
        base_damage = modifier.apply_modifier_round(base_damage)?;
    }

    if base_damage == 0 {
        return Ok(DamageRolls {
            values: vec![0; (rules.random_maximum - rules.random_minimum + 1) as usize],
        });
    }

    let mut values = Vec::with_capacity((rules.random_maximum - rules.random_minimum + 1) as usize);
    for roll in rules.random_minimum..=rules.random_maximum {
        let mut damage = Rational::new(roll, rules.random_denominator)?.apply_floor(base_damage)?;
        damage = input.stab.apply_modifier_round(damage)?;
        damage = input.type_effectiveness.apply_floor(damage)?;
        for modifier in &input.modifiers_after_random {
            damage = modifier.apply_modifier_round(damage)?;
        }
        values.push(if damage == 0 { 0 } else { damage.max(1) });
    }
    Ok(DamageRolls { values })
}

fn calculate_other_stat(
    base: i32,
    training: i32,
    stat_id: &str,
    increased: Option<&str>,
    decreased: Option<&str>,
    rules: &StatRules,
) -> Result<i32, MathError> {
    let pre_nature = base + rules.other_stat_baseline_bonus + training;
    let nature = if increased == Some(stat_id) {
        Rational::new(rules.nature_boost_numerator, rules.nature_denominator)?
    } else if decreased == Some(stat_id) {
        Rational::new(rules.nature_drop_numerator, rules.nature_denominator)?
    } else {
        Rational::ONE
    };
    nature.apply_floor(pre_nature)
}

fn validate_training_points(training: TrainingPoints, rules: &StatRules) -> Result<(), MathError> {
    let values = [
        training.hp,
        training.attack,
        training.defense,
        training.special_attack,
        training.special_defense,
        training.speed,
    ];
    if values
        .iter()
        .any(|value| *value < 0 || *value > rules.maximum_points_per_stat)
    {
        return Err(MathError::InvalidTrainingPoints(format!(
            "every value must be within 0..{}: {values:?}",
            rules.maximum_points_per_stat
        )));
    }
    let total: i32 = values.iter().sum();
    if total > rules.total_points {
        return Err(MathError::InvalidTrainingPoints(format!(
            "total {total} exceeds {}",
            rules.total_points
        )));
    }
    Ok(())
}

fn greatest_common_divisor(left: i32, right: i32) -> i32 {
    let mut left = left.abs();
    let mut right = right.abs();
    while right != 0 {
        let remainder = left % right;
        left = right;
        right = remainder;
    }
    left.max(1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::load_mechanics_pack;

    const PACK: &[u8] = include_bytes!("../data/champions-mechanics-v1.json");
    const CHECKSUM: &[u8] = include_bytes!("../data/champions-mechanics-v1.json.sha256");

    fn catalog() -> MechanicsCatalog {
        load_mechanics_pack(PACK, CHECKSUM).expect("mechanics pack should validate")
    }

    #[test]
    fn reproduces_the_observed_pelipper_hp() {
        let catalog = catalog();
        let pelipper = catalog
            .species_by_num(279)
            .next()
            .expect("Pelipper should exist");
        let stats = calculate_battle_stats(
            pelipper,
            TrainingPoints {
                hp: 32,
                special_attack: 32,
                speed: 2,
                ..TrainingPoints::default()
            },
            "modest",
            &catalog,
        )
        .expect("spread should validate");
        assert_eq!(stats.hp, 167);
        assert_eq!(stats.special_attack, 161);
        assert_eq!(stats.speed, 87);
    }

    #[test]
    fn reproduces_the_website_incineroar_stat_fixture_with_integer_nature_math() {
        let catalog = catalog();
        let incineroar = catalog
            .species_by_num(727)
            .next()
            .expect("Incineroar should exist");
        let stats = calculate_battle_stats(
            incineroar,
            TrainingPoints {
                hp: 32,
                defense: 20,
                special_defense: 14,
                ..TrainingPoints::default()
            },
            "bold",
            &catalog,
        )
        .expect("spread should validate");
        assert_eq!(
            stats,
            BattleStats {
                hp: 202,
                attack: 121,
                defense: 143,
                special_attack: 100,
                special_defense: 124,
                speed: 80,
            }
        );
    }

    #[test]
    fn enforces_training_point_limits() {
        let catalog = catalog();
        let pelipper = catalog
            .species_by_num(279)
            .next()
            .expect("Pelipper should exist");
        let error = calculate_battle_stats(
            pelipper,
            TrainingPoints {
                hp: 32,
                attack: 32,
                defense: 32,
                ..TrainingPoints::default()
            },
            "adamant",
            &catalog,
        )
        .expect_err("over-budget spread must fail");
        assert!(matches!(error, MathError::InvalidTrainingPoints(_)));
    }

    #[test]
    fn applies_positive_and_negative_stat_stages_with_flooring() {
        assert_eq!(
            apply_stat_stage(100, 2).expect("stage should be valid"),
            200
        );
        assert_eq!(
            apply_stat_stage(100, -1).expect("stage should be valid"),
            66
        );
        assert!(matches!(
            apply_stat_stage(100, 7),
            Err(MathError::InvalidStatStage(7))
        ));
    }

    #[test]
    fn evaluates_dual_types_and_immunities_without_floats() {
        let catalog = catalog();
        assert_eq!(
            type_multiplier("fire", &["Grass".to_owned()], &catalog)
                .expect("relation should exist"),
            Rational::new(2, 1).expect("ratio should validate")
        );
        assert_eq!(
            type_multiplier("fire", &["Water".to_owned()], &catalog)
                .expect("relation should exist"),
            Rational::new(1, 2).expect("ratio should validate")
        );
        assert_eq!(
            type_multiplier("fire", &["Grass".to_owned(), "Steel".to_owned()], &catalog)
                .expect("relation should exist"),
            Rational::new(4, 1).expect("ratio should validate")
        );
        assert_eq!(
            type_multiplier("normal", &["Ghost".to_owned()], &catalog)
                .expect("relation should exist"),
            Rational::ZERO
        );
    }

    #[test]
    fn produces_all_sixteen_integer_damage_rolls_in_order() {
        let catalog = catalog();
        let input = DamageInput {
            base_power: 100,
            attack: 150,
            defense: 100,
            spread: true,
            stab: Rational::new(3, 2).expect("ratio should validate"),
            type_effectiveness: Rational::new(2, 1).expect("ratio should validate"),
            modifiers_before_random: Vec::new(),
            modifiers_after_random: Vec::new(),
        };
        let rolls = calculate_damage_rolls(&input, &catalog.pack().damage_rules)
            .expect("damage input should validate");
        assert_eq!(rolls.values.len(), 16);
        assert_eq!(rolls.minimum(), 128);
        assert_eq!(rolls.maximum(), 152);
        assert!(rolls.values.windows(2).all(|window| window[0] <= window[1]));
    }

    #[test]
    fn immunity_produces_zero_for_every_roll() {
        let catalog = catalog();
        let input = DamageInput {
            base_power: 100,
            attack: 150,
            defense: 100,
            spread: false,
            stab: Rational::ONE,
            type_effectiveness: Rational::ZERO,
            modifiers_before_random: Vec::new(),
            modifiers_after_random: Vec::new(),
        };
        let rolls = calculate_damage_rolls(&input, &catalog.pack().damage_rules)
            .expect("damage input should validate");
        assert_eq!(rolls.values, vec![0; 16]);
    }
}
