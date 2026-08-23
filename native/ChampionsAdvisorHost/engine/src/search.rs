use crate::ExactProbability;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt::{Display, Formatter};
use std::time::{Duration, Instant};

const NEGATIVE_INFINITY: i64 = i64::MIN / 4;
const POSITIVE_INFINITY: i64 = i64::MAX / 4;

pub trait SearchDomain {
    type State: Clone;
    type Plan: Clone + Eq;

    fn hash(&self, state: &Self::State) -> u64;
    fn terminal_score(&self, state: &Self::State, perspective_team: i32) -> Option<i64>;
    fn evaluate(&self, state: &Self::State, perspective_team: i32) -> i64;
    fn legal_plans(&self, state: &Self::State, team_index: i32) -> Result<Vec<Self::Plan>, String>;
    fn resolve_turn(
        &self,
        state: &Self::State,
        perspective_plan: &Self::Plan,
        opponent_plan: &Self::Plan,
    ) -> Result<Vec<ChanceSuccessor<Self::State>>, String>;

    fn resolve_leaf_score(
        &self,
        _state: &Self::State,
        _perspective_plan: &Self::Plan,
        _opponent_plan: &Self::Plan,
        _perspective_team: i32,
    ) -> Result<Option<(i64, u64)>, String> {
        Ok(None)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChanceSuccessor<State> {
    pub probability: ExactProbability,
    pub state: State,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct SearchLimits {
    pub maximum_depth: u8,
    pub maximum_nodes: u64,
    pub time_limit_ms: Option<u64>,
}

impl Default for SearchLimits {
    fn default() -> Self {
        Self {
            maximum_depth: 4,
            maximum_nodes: 250_000,
            time_limit_ms: Some(1_000),
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SearchStatistics {
    pub completed_depth: u8,
    pub nodes: u64,
    pub chance_nodes: u64,
    pub transposition_hits: u64,
    pub maximin_cutoffs: u64,
    pub elapsed_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SearchResult<Plan> {
    pub score: i64,
    pub best_plan: Plan,
    pub worst_case_reply: Plan,
    pub principal_variation: Vec<PrincipalVariationStep<Plan>>,
    pub statistics: SearchStatistics,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct SearchProgress {
    pub target_depth: u8,
    pub active_depth: u8,
    pub root_plans_completed: usize,
    pub root_plans_total: usize,
    pub score: Option<i64>,
    pub statistics: SearchStatistics,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PrincipalVariationStep<Plan> {
    pub depth_remaining: u8,
    pub score: i64,
    pub perspective_plan: Plan,
    pub opponent_reply: Plan,
    pub representative_probability: ExactProbability,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchError {
    InvalidLimits(String),
    NoLegalPlans(i32),
    EmptyChanceNode,
    InvalidProbabilityMass,
    Domain(String),
    BudgetExhausted,
    ArithmeticOverflow,
}

impl Display for SearchError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidLimits(message) => write!(formatter, "invalid search limits: {message}"),
            Self::NoLegalPlans(team_index) => {
                write!(formatter, "team {team_index} has no legal plans")
            }
            Self::EmptyChanceNode => write!(formatter, "turn resolver returned no successors"),
            Self::InvalidProbabilityMass => {
                write!(formatter, "turn successor probabilities do not sum to one")
            }
            Self::Domain(message) => write!(formatter, "search domain failed: {message}"),
            Self::BudgetExhausted => write!(formatter, "search budget exhausted before depth one"),
            Self::ArithmeticOverflow => write!(formatter, "search arithmetic overflowed"),
        }
    }
}

impl std::error::Error for SearchError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct TranspositionKey {
    state_hash: u64,
    depth: u8,
    perspective_team: i32,
    opponent_team: i32,
}

#[derive(Debug, Clone)]
struct TranspositionEntry<Plan> {
    score: i64,
    best_plan: Plan,
    worst_case_reply: Plan,
}

struct SearchContext<'progress, Plan> {
    started_at: Instant,
    deadline: Option<Instant>,
    limits: SearchLimits,
    statistics: SearchStatistics,
    transpositions: HashMap<TranspositionKey, TranspositionEntry<Plan>>,
    active_depth: u8,
    root_plans_completed: usize,
    root_plans_total: usize,
    current_score: Option<i64>,
    last_progress_at: Instant,
    on_progress: &'progress mut dyn FnMut(SearchProgress),
}

#[derive(Debug)]
struct RootIteration<Plan> {
    score: i64,
    best_plan: Plan,
    worst_case_reply: Plan,
}

pub fn search_best_plan<Domain>(
    domain: &Domain,
    initial_state: &Domain::State,
    perspective_team: i32,
    opponent_team: i32,
    limits: SearchLimits,
) -> Result<SearchResult<Domain::Plan>, SearchError>
where
    Domain: SearchDomain,
{
    search_best_plan_with_progress(
        domain,
        initial_state,
        perspective_team,
        opponent_team,
        limits,
        |_| {},
    )
}

pub fn search_best_plan_with_progress<Domain, Progress>(
    domain: &Domain,
    initial_state: &Domain::State,
    perspective_team: i32,
    opponent_team: i32,
    limits: SearchLimits,
    mut on_progress: Progress,
) -> Result<SearchResult<Domain::Plan>, SearchError>
where
    Domain: SearchDomain,
    Progress: FnMut(SearchProgress),
{
    validate_limits(limits)?;
    let started_at = Instant::now();
    let deadline = limits
        .time_limit_ms
        .map(|milliseconds| started_at + Duration::from_millis(milliseconds));
    let mut context = SearchContext {
        started_at,
        deadline,
        limits,
        statistics: SearchStatistics::default(),
        transpositions: HashMap::new(),
        active_depth: 0,
        root_plans_completed: 0,
        root_plans_total: 0,
        current_score: None,
        last_progress_at: started_at,
        on_progress: &mut on_progress,
    };
    let mut last_completed = None;
    for depth in 1..=limits.maximum_depth {
        context.active_depth = depth;
        context.root_plans_completed = 0;
        context.root_plans_total = 0;
        context.current_score = last_completed
            .as_ref()
            .map(|iteration: &RootIteration<Domain::Plan>| iteration.score);
        match search_root(
            domain,
            initial_state,
            perspective_team,
            opponent_team,
            depth,
            &mut context,
        ) {
            Ok(iteration) => {
                context.statistics.completed_depth = depth;
                let mut statistics = context.statistics;
                statistics.elapsed_ms = context.started_at.elapsed().as_millis();
                (context.on_progress)(SearchProgress {
                    target_depth: limits.maximum_depth,
                    active_depth: depth,
                    root_plans_completed: context.root_plans_total,
                    root_plans_total: context.root_plans_total,
                    score: Some(iteration.score),
                    statistics,
                });
                context.last_progress_at = Instant::now();
                last_completed = Some(iteration);
            }
            Err(SearchError::BudgetExhausted) => break,
            Err(error) => return Err(error),
        }
    }
    context.statistics.elapsed_ms = context.started_at.elapsed().as_millis();
    let completed = last_completed.ok_or(SearchError::BudgetExhausted)?;
    let principal_variation = build_principal_variation(
        domain,
        initial_state,
        perspective_team,
        opponent_team,
        context.statistics.completed_depth,
        &context.transpositions,
    )?;
    Ok(SearchResult {
        score: completed.score,
        best_plan: completed.best_plan,
        worst_case_reply: completed.worst_case_reply,
        principal_variation,
        statistics: context.statistics,
    })
}

fn search_root<Domain>(
    domain: &Domain,
    state: &Domain::State,
    perspective_team: i32,
    opponent_team: i32,
    depth: u8,
    context: &mut SearchContext<'_, Domain::Plan>,
) -> Result<RootIteration<Domain::Plan>, SearchError>
where
    Domain: SearchDomain,
{
    check_budget(context)?;
    let mut perspective_plans = domain
        .legal_plans(state, perspective_team)
        .map_err(SearchError::Domain)?;
    if perspective_plans.is_empty() {
        return Err(SearchError::NoLegalPlans(perspective_team));
    }
    context.root_plans_total = perspective_plans.len();
    report_progress(context, true);
    let opponent_plans = domain
        .legal_plans(state, opponent_team)
        .map_err(SearchError::Domain)?;
    if opponent_plans.is_empty() {
        return Err(SearchError::NoLegalPlans(opponent_team));
    }
    let root_key = TranspositionKey {
        state_hash: domain.hash(state),
        depth,
        perspective_team,
        opponent_team,
    };
    if let Some(entry) = context.transpositions.get(&root_key) {
        promote_plan(&mut perspective_plans, &entry.best_plan);
    }

    let mut best_score = NEGATIVE_INFINITY;
    let mut best_plan = None;
    let mut best_reply = None;
    for perspective_plan in &perspective_plans {
        check_budget(context)?;
        let mut worst_score = POSITIVE_INFINITY;
        let mut worst_reply = None;
        for opponent_plan in &opponent_plans {
            let score = expected_successor_score(
                domain,
                state,
                perspective_plan,
                opponent_plan,
                perspective_team,
                opponent_team,
                depth - 1,
                context,
            )?;
            report_progress(context, false);
            if score < worst_score {
                worst_score = score;
                worst_reply = Some(opponent_plan.clone());
            }
            if worst_score <= best_score {
                context.statistics.maximin_cutoffs += 1;
                break;
            }
        }
        if worst_score > best_score {
            best_score = worst_score;
            best_plan = Some(perspective_plan.clone());
            best_reply = worst_reply;
        }
        context.root_plans_completed += 1;
        context.current_score = (best_score != NEGATIVE_INFINITY).then_some(best_score);
        report_progress(context, true);
    }
    let best_plan = best_plan.ok_or(SearchError::NoLegalPlans(perspective_team))?;
    let worst_case_reply = best_reply.ok_or(SearchError::NoLegalPlans(opponent_team))?;
    context.transpositions.insert(
        root_key,
        TranspositionEntry {
            score: best_score,
            best_plan: best_plan.clone(),
            worst_case_reply: worst_case_reply.clone(),
        },
    );
    Ok(RootIteration {
        score: best_score,
        best_plan,
        worst_case_reply,
    })
}

fn search_value<Domain>(
    domain: &Domain,
    state: &Domain::State,
    perspective_team: i32,
    opponent_team: i32,
    depth: u8,
    context: &mut SearchContext<'_, Domain::Plan>,
) -> Result<i64, SearchError>
where
    Domain: SearchDomain,
{
    check_budget(context)?;
    context.statistics.nodes += 1;
    if let Some(score) = domain.terminal_score(state, perspective_team) {
        return Ok(score);
    }
    if depth == 0 {
        return Ok(domain.evaluate(state, perspective_team));
    }
    let key = TranspositionKey {
        state_hash: domain.hash(state),
        depth,
        perspective_team,
        opponent_team,
    };
    if let Some(entry) = context.transpositions.get(&key) {
        context.statistics.transposition_hits += 1;
        return Ok(entry.score);
    }

    let perspective_plans = domain
        .legal_plans(state, perspective_team)
        .map_err(SearchError::Domain)?;
    if perspective_plans.is_empty() {
        return Err(SearchError::NoLegalPlans(perspective_team));
    }
    let opponent_plans = domain
        .legal_plans(state, opponent_team)
        .map_err(SearchError::Domain)?;
    if opponent_plans.is_empty() {
        return Err(SearchError::NoLegalPlans(opponent_team));
    }
    let mut best_score = NEGATIVE_INFINITY;
    let mut best_plan = None;
    let mut best_reply = None;
    for perspective_plan in &perspective_plans {
        let mut worst_score = POSITIVE_INFINITY;
        let mut worst_reply = None;
        for opponent_plan in &opponent_plans {
            let score = expected_successor_score(
                domain,
                state,
                perspective_plan,
                opponent_plan,
                perspective_team,
                opponent_team,
                depth - 1,
                context,
            )?;
            if score < worst_score {
                worst_score = score;
                worst_reply = Some(opponent_plan.clone());
            }
            if worst_score <= best_score {
                context.statistics.maximin_cutoffs += 1;
                break;
            }
        }
        if worst_score > best_score {
            best_score = worst_score;
            best_plan = Some(perspective_plan.clone());
            best_reply = worst_reply;
        }
    }
    let best_plan = best_plan.ok_or(SearchError::NoLegalPlans(perspective_team))?;
    let worst_case_reply = best_reply.ok_or(SearchError::NoLegalPlans(opponent_team))?;
    context.transpositions.insert(
        key,
        TranspositionEntry {
            score: best_score,
            best_plan,
            worst_case_reply,
        },
    );
    Ok(best_score)
}

fn build_principal_variation<Domain>(
    domain: &Domain,
    initial_state: &Domain::State,
    perspective_team: i32,
    opponent_team: i32,
    completed_depth: u8,
    transpositions: &HashMap<TranspositionKey, TranspositionEntry<Domain::Plan>>,
) -> Result<Vec<PrincipalVariationStep<Domain::Plan>>, SearchError>
where
    Domain: SearchDomain,
{
    let mut state = initial_state.clone();
    let mut depth = completed_depth;
    let mut variation = Vec::new();
    while depth > 0 && domain.terminal_score(&state, perspective_team).is_none() {
        let key = TranspositionKey {
            state_hash: domain.hash(&state),
            depth,
            perspective_team,
            opponent_team,
        };
        let Some(entry) = transpositions.get(&key) else {
            break;
        };
        let successors = domain
            .resolve_turn(&state, &entry.best_plan, &entry.worst_case_reply)
            .map_err(SearchError::Domain)?;
        if successors.is_empty() {
            return Err(SearchError::EmptyChanceNode);
        }
        validate_probability_mass(&successors)?;
        let representative = select_representative_successor(
            domain,
            &successors,
            entry.score,
            perspective_team,
            opponent_team,
            depth - 1,
            transpositions,
        );
        variation.push(PrincipalVariationStep {
            depth_remaining: depth,
            score: entry.score,
            perspective_plan: entry.best_plan.clone(),
            opponent_reply: entry.worst_case_reply.clone(),
            representative_probability: representative.probability,
        });
        state = representative.state.clone();
        depth -= 1;
    }
    Ok(variation)
}

#[allow(clippy::too_many_arguments)]
fn select_representative_successor<'state, Domain>(
    domain: &Domain,
    successors: &'state [ChanceSuccessor<Domain::State>],
    expected_score: i64,
    perspective_team: i32,
    opponent_team: i32,
    remaining_depth: u8,
    transpositions: &HashMap<TranspositionKey, TranspositionEntry<Domain::Plan>>,
) -> &'state ChanceSuccessor<Domain::State>
where
    Domain: SearchDomain,
{
    successors
        .iter()
        .min_by(|left, right| {
            let left_score = principal_variation_state_score(
                domain,
                &left.state,
                perspective_team,
                opponent_team,
                remaining_depth,
                transpositions,
            );
            let right_score = principal_variation_state_score(
                domain,
                &right.state,
                perspective_team,
                opponent_team,
                remaining_depth,
                transpositions,
            );
            left_score
                .abs_diff(expected_score)
                .cmp(&right_score.abs_diff(expected_score))
                .then_with(|| compare_probability_descending(left.probability, right.probability))
                .then_with(|| domain.hash(&left.state).cmp(&domain.hash(&right.state)))
        })
        .expect("nonempty successors were checked")
}

fn principal_variation_state_score<Domain>(
    domain: &Domain,
    state: &Domain::State,
    perspective_team: i32,
    opponent_team: i32,
    depth: u8,
    transpositions: &HashMap<TranspositionKey, TranspositionEntry<Domain::Plan>>,
) -> i64
where
    Domain: SearchDomain,
{
    if let Some(score) = domain.terminal_score(state, perspective_team) {
        return score;
    }
    if depth == 0 {
        return domain.evaluate(state, perspective_team);
    }
    transpositions
        .get(&TranspositionKey {
            state_hash: domain.hash(state),
            depth,
            perspective_team,
            opponent_team,
        })
        .map(|entry| entry.score)
        .unwrap_or_else(|| domain.evaluate(state, perspective_team))
}

fn compare_probability_descending(
    left: ExactProbability,
    right: ExactProbability,
) -> std::cmp::Ordering {
    let left_scaled = u128::from(left.numerator) * u128::from(right.denominator);
    let right_scaled = u128::from(right.numerator) * u128::from(left.denominator);
    right_scaled.cmp(&left_scaled)
}

#[allow(clippy::too_many_arguments)]
fn expected_successor_score<Domain>(
    domain: &Domain,
    state: &Domain::State,
    perspective_plan: &Domain::Plan,
    opponent_plan: &Domain::Plan,
    perspective_team: i32,
    opponent_team: i32,
    remaining_depth: u8,
    context: &mut SearchContext<'_, Domain::Plan>,
) -> Result<i64, SearchError>
where
    Domain: SearchDomain,
{
    check_budget(context)?;
    context.statistics.chance_nodes += 1;
    if remaining_depth == 0
        && let Some((score, evaluated_nodes)) = domain
            .resolve_leaf_score(state, perspective_plan, opponent_plan, perspective_team)
            .map_err(SearchError::Domain)?
    {
        context.statistics.nodes = context.statistics.nodes.saturating_add(evaluated_nodes);
        if context.statistics.nodes > context.limits.maximum_nodes {
            return Err(SearchError::BudgetExhausted);
        }
        return Ok(score);
    }
    let successors = domain
        .resolve_turn(state, perspective_plan, opponent_plan)
        .map_err(SearchError::Domain)?;
    if successors.is_empty() {
        return Err(SearchError::EmptyChanceNode);
    }
    validate_probability_mass(&successors)?;
    let mut expectation = SignedFraction::zero();
    for successor in successors {
        let score = search_value(
            domain,
            &successor.state,
            perspective_team,
            opponent_team,
            remaining_depth,
            context,
        )?;
        expectation.add_weighted(score, successor.probability)?;
    }
    expectation.round_to_i64()
}

fn validate_limits(limits: SearchLimits) -> Result<(), SearchError> {
    if limits.maximum_depth == 0 {
        return Err(SearchError::InvalidLimits(
            "maximum_depth must be at least one".to_owned(),
        ));
    }
    if limits.maximum_nodes == 0 {
        return Err(SearchError::InvalidLimits(
            "maximum_nodes must be at least one".to_owned(),
        ));
    }
    if limits.time_limit_ms == Some(0) {
        return Err(SearchError::InvalidLimits(
            "time_limit_ms must be positive when present".to_owned(),
        ));
    }
    Ok(())
}

fn check_budget<Plan>(context: &mut SearchContext<'_, Plan>) -> Result<(), SearchError> {
    report_progress(context, false);
    if context.statistics.nodes >= context.limits.maximum_nodes {
        return Err(SearchError::BudgetExhausted);
    }
    if context
        .deadline
        .is_some_and(|deadline| Instant::now() >= deadline)
    {
        return Err(SearchError::BudgetExhausted);
    }
    Ok(())
}

fn report_progress<Plan>(context: &mut SearchContext<'_, Plan>, force: bool) {
    let now = Instant::now();
    if !force && now.duration_since(context.last_progress_at) < Duration::from_millis(100) {
        return;
    }
    let mut statistics = context.statistics;
    statistics.elapsed_ms = context.started_at.elapsed().as_millis();
    (context.on_progress)(SearchProgress {
        target_depth: context.limits.maximum_depth,
        active_depth: context.active_depth,
        root_plans_completed: context.root_plans_completed,
        root_plans_total: context.root_plans_total,
        score: context.current_score,
        statistics,
    });
    context.last_progress_at = now;
}

fn promote_plan<Plan: Eq>(plans: &mut [Plan], preferred: &Plan) {
    if let Some(index) = plans.iter().position(|plan| plan == preferred) {
        plans.swap(0, index);
    }
}

fn validate_probability_mass<State>(
    successors: &[ChanceSuccessor<State>],
) -> Result<(), SearchError> {
    let mut sum = UnsignedFraction::zero();
    for successor in successors {
        sum.add(successor.probability)?;
    }
    if sum.numerator != sum.denominator {
        return Err(SearchError::InvalidProbabilityMass);
    }
    Ok(())
}

#[derive(Debug, Clone, Copy)]
struct UnsignedFraction {
    numerator: u128,
    denominator: u128,
}

impl UnsignedFraction {
    fn zero() -> Self {
        Self {
            numerator: 0,
            denominator: 1,
        }
    }

    fn add(&mut self, probability: ExactProbability) -> Result<(), SearchError> {
        if probability.denominator == 0 || probability.numerator > probability.denominator {
            return Err(SearchError::InvalidProbabilityMass);
        }
        let right_denominator = u128::from(probability.denominator);
        let divisor = greatest_common_divisor_u128(self.denominator, right_denominator);
        let common = self
            .denominator
            .checked_div(divisor)
            .and_then(|value| value.checked_mul(right_denominator))
            .ok_or(SearchError::ArithmeticOverflow)?;
        let left = self
            .numerator
            .checked_mul(common / self.denominator)
            .ok_or(SearchError::ArithmeticOverflow)?;
        let right = u128::from(probability.numerator)
            .checked_mul(common / right_denominator)
            .ok_or(SearchError::ArithmeticOverflow)?;
        self.numerator = left
            .checked_add(right)
            .ok_or(SearchError::ArithmeticOverflow)?;
        self.denominator = common;
        self.reduce();
        Ok(())
    }

    fn reduce(&mut self) {
        let divisor = greatest_common_divisor_u128(self.numerator, self.denominator);
        self.numerator /= divisor;
        self.denominator /= divisor;
    }
}

#[derive(Debug, Clone, Copy)]
struct SignedFraction {
    numerator: i128,
    denominator: u128,
}

impl SignedFraction {
    fn zero() -> Self {
        Self {
            numerator: 0,
            denominator: 1,
        }
    }

    fn add_weighted(
        &mut self,
        score: i64,
        probability: ExactProbability,
    ) -> Result<(), SearchError> {
        let right_denominator = u128::from(probability.denominator);
        let divisor = greatest_common_divisor_u128(self.denominator, right_denominator);
        let common = self
            .denominator
            .checked_div(divisor)
            .and_then(|value| value.checked_mul(right_denominator))
            .ok_or(SearchError::ArithmeticOverflow)?;
        let left_scale = i128::try_from(common / self.denominator)
            .map_err(|_| SearchError::ArithmeticOverflow)?;
        let right_scale = i128::try_from(common / right_denominator)
            .map_err(|_| SearchError::ArithmeticOverflow)?;
        let left = self
            .numerator
            .checked_mul(left_scale)
            .ok_or(SearchError::ArithmeticOverflow)?;
        let right = i128::from(score)
            .checked_mul(i128::from(probability.numerator))
            .and_then(|value| value.checked_mul(right_scale))
            .ok_or(SearchError::ArithmeticOverflow)?;
        self.numerator = left
            .checked_add(right)
            .ok_or(SearchError::ArithmeticOverflow)?;
        self.denominator = common;
        self.reduce();
        Ok(())
    }

    fn reduce(&mut self) {
        let absolute = self.numerator.unsigned_abs();
        let divisor = greatest_common_divisor_u128(absolute, self.denominator);
        self.numerator /= i128::try_from(divisor).unwrap_or(1);
        self.denominator /= divisor;
    }

    fn round_to_i64(self) -> Result<i64, SearchError> {
        let denominator =
            i128::try_from(self.denominator).map_err(|_| SearchError::ArithmeticOverflow)?;
        let half = denominator / 2;
        let rounded = if self.numerator >= 0 {
            self.numerator
                .checked_add(half)
                .ok_or(SearchError::ArithmeticOverflow)?
                / denominator
        } else {
            self.numerator
                .checked_sub(half)
                .ok_or(SearchError::ArithmeticOverflow)?
                / denominator
        };
        i64::try_from(rounded).map_err(|_| SearchError::ArithmeticOverflow)
    }
}

fn greatest_common_divisor_u128(left: u128, right: u128) -> u128 {
    let mut left = left;
    let mut right = right;
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

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum Plan {
        Safe,
        Risky,
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct State {
        turn: u8,
        score: i64,
    }

    struct MatrixDomain;

    impl SearchDomain for MatrixDomain {
        type State = State;
        type Plan = Plan;

        fn hash(&self, state: &Self::State) -> u64 {
            (u64::from(state.turn) << 56) ^ u64::from_ne_bytes(state.score.to_ne_bytes())
        }

        fn terminal_score(&self, state: &Self::State, _perspective_team: i32) -> Option<i64> {
            (state.turn >= 2).then_some(state.score)
        }

        fn evaluate(&self, state: &Self::State, _perspective_team: i32) -> i64 {
            state.score
        }

        fn legal_plans(
            &self,
            _state: &Self::State,
            _team_index: i32,
        ) -> Result<Vec<Self::Plan>, String> {
            Ok(vec![Plan::Risky, Plan::Safe])
        }

        fn resolve_turn(
            &self,
            state: &Self::State,
            perspective_plan: &Self::Plan,
            opponent_plan: &Self::Plan,
        ) -> Result<Vec<ChanceSuccessor<Self::State>>, String> {
            let outcomes = match (perspective_plan, opponent_plan) {
                (Plan::Safe, Plan::Safe) | (Plan::Safe, Plan::Risky) => vec![(3, 1, 1)],
                (Plan::Risky, Plan::Safe) | (Plan::Risky, Plan::Risky) => {
                    vec![(0, 1, 2), (10, 1, 2)]
                }
            };
            Ok(outcomes
                .into_iter()
                .map(|(delta, numerator, denominator)| ChanceSuccessor {
                    probability: ExactProbability {
                        numerator,
                        denominator,
                    },
                    state: State {
                        turn: state.turn + 1,
                        score: state.score + delta,
                    },
                })
                .collect())
        }
    }

    #[test]
    fn simultaneous_search_maximizes_the_worst_opponent_reply() {
        let result = search_best_plan(
            &MatrixDomain,
            &State { turn: 0, score: 0 },
            0,
            1,
            SearchLimits {
                maximum_depth: 1,
                maximum_nodes: 1_000,
                time_limit_ms: None,
            },
        )
        .expect("search should complete");
        assert_eq!(result.best_plan, Plan::Risky);
        assert_eq!(result.score, 5);
        assert_eq!(result.statistics.completed_depth, 1);
    }

    #[test]
    fn iterative_deepening_reuses_transpositions() {
        let result = search_best_plan(
            &MatrixDomain,
            &State { turn: 0, score: 0 },
            0,
            1,
            SearchLimits {
                maximum_depth: 3,
                maximum_nodes: 100_000,
                time_limit_ms: None,
            },
        )
        .expect("search should complete");
        assert_eq!(result.statistics.completed_depth, 3);
        assert!(result.statistics.transposition_hits > 0);
        assert!(result.statistics.maximin_cutoffs > 0);
        assert_eq!(result.principal_variation.len(), 2);
        assert_eq!(result.principal_variation[0].depth_remaining, 3);
        assert_eq!(result.principal_variation[1].depth_remaining, 2);
        assert_eq!(result.principal_variation[0].perspective_plan, Plan::Risky);
    }

    #[test]
    fn iterative_deepening_reports_each_completed_depth() {
        let mut progress = Vec::new();
        let result = search_best_plan_with_progress(
            &MatrixDomain,
            &State { turn: 0, score: 0 },
            0,
            1,
            SearchLimits {
                maximum_depth: 3,
                maximum_nodes: 100_000,
                time_limit_ms: None,
            },
            |update| progress.push(update),
        )
        .expect("search should complete");
        assert_eq!(result.statistics.completed_depth, 3);
        assert_eq!(
            progress
                .iter()
                .filter(|update| update.statistics.completed_depth == update.active_depth)
                .map(|update| update.statistics.completed_depth)
                .collect::<Vec<_>>(),
            vec![1, 2, 3]
        );
        assert!(progress.windows(2).all(|window| {
            window[0].statistics.nodes <= window[1].statistics.nodes
                && window[0].statistics.elapsed_ms <= window[1].statistics.elapsed_ms
        }));
        assert!(progress.iter().all(|update| update.target_depth == 3));
        assert!(progress.iter().any(|update| {
            update.active_depth == 1
                && update.statistics.completed_depth == 0
                && update.root_plans_total > 0
        }));
    }

    #[test]
    fn invalid_chance_probability_mass_is_rejected() {
        struct InvalidDomain;
        impl SearchDomain for InvalidDomain {
            type State = State;
            type Plan = Plan;

            fn hash(&self, _state: &Self::State) -> u64 {
                0
            }
            fn terminal_score(&self, _state: &Self::State, _team: i32) -> Option<i64> {
                None
            }
            fn evaluate(&self, state: &Self::State, _team: i32) -> i64 {
                state.score
            }
            fn legal_plans(&self, _state: &Self::State, _team: i32) -> Result<Vec<Plan>, String> {
                Ok(vec![Plan::Safe])
            }
            fn resolve_turn(
                &self,
                state: &Self::State,
                _ours: &Plan,
                _theirs: &Plan,
            ) -> Result<Vec<ChanceSuccessor<State>>, String> {
                Ok(vec![ChanceSuccessor {
                    probability: ExactProbability {
                        numerator: 1,
                        denominator: 2,
                    },
                    state: state.clone(),
                }])
            }
        }

        let error = search_best_plan(
            &InvalidDomain,
            &State { turn: 0, score: 0 },
            0,
            1,
            SearchLimits {
                maximum_depth: 1,
                maximum_nodes: 100,
                time_limit_ms: None,
            },
        )
        .expect_err("probability mass must be exact");
        assert_eq!(error, SearchError::InvalidProbabilityMass);
    }
}
