/**
 * The shapes GrantJudge's views return.
 *
 * Written against the contract's own `_round_view` / `_proposal_view` rather
 * than inferred: a field renamed on chain should break the build here, which is
 * the only place a rename gets caught before it reaches a page.
 *
 * WEI IS A STRING, ALWAYS. The contract returns every wei value as a decimal
 * string because a `u256` does not survive JSON. Parsing one into a JS number
 * loses precision above 2^53, so nothing in this app does; the formatters in
 * `lib/format.ts` take strings and do the arithmetic with BigInt.
 */

export type RoundStatus =
  | "OPEN"
  | "EVALUATING"
  | "RANKED"
  | "FINALIZED"
  | "CANCELLED";

export type RoundPhase = RoundStatus | "CLOSED" | "SETTLING";

export type ProposalStatus =
  | "PENDING"
  | "SCORED"
  | "FUNDED"
  | "QUALIFIED"
  | "REJECTED"
  | "SKIPPED";

export type ContestStatus = "" | "WON" | "LOST";

export interface Criterion {
  position: number;
  name: string;
  description: string;
  weight_bps: number;
  weight_pct: string;
}

export interface Round {
  found: boolean;
  reason?: string;
  round_id: number;
  treasurer: string;
  name: string;
  description: string;
  status: RoundStatus;
  phase: RoundPhase;
  pool_wei: string;
  pool_gen: string;
  created_at: number;
  deadline: number;
  seconds_remaining: number;
  criteria: Criterion[];
  criteria_count: number;
  criteria_hash: string;
  config_hash: string;
  max_proposals: number;
  max_winners: number;
  min_score_threshold: number;
  min_score_text: string;
  spam_stake_wei: string;
  spam_stake_gen: string;
  contest_stake_wei: string;
  contest_stake_gen: string;
  contest_window_s: number;
  contest_closes_at: number;
  contest_open: boolean;
  stall_ttl_s: number;
  proposal_count: number;
  evaluated_count: number;
  skipped_count: number;
  funded_count: number;
  qualified_count: number;
  rejected_count: number;
  contested_count: number;
  pending_count: number;
  finalized_at: number;
  cancelled_at: number;
  winner_score_sum: number;
  allocated_wei: string;
  allocated_gen: string;
  remainder_wei: string;
  remainder_gen: string;
  forfeited_wei: string;
  stakes_wei: string;
  locked_wei: string;
  remainder_claimed: boolean;
}

export interface RoundCard {
  round_id: number;
  treasurer: string;
  name: string;
  status: RoundStatus;
  phase: RoundPhase;
  pool_wei: string;
  pool_gen: string;
  deadline: number;
  seconds_remaining: number;
  criteria_names: string[];
  criteria_count: number;
  proposal_count: number;
  max_proposals: number;
  max_winners: number;
  min_score_threshold: number;
  spam_stake_wei: string;
  funded_count: number;
  allocated_wei: string;
  finalized_at: number;
  created_at: number;
}

export interface ScoreRow {
  name: string;
  weight_bps: number;
  score: number;
  out_of: number;
  contribution: number;
}

export interface Proposal {
  found: boolean;
  reason?: string;
  proposal_id: number;
  round_id: number;
  round_name: string;
  author: string;
  description: string;
  timeline: string;
  team: string;
  requested_wei: string;
  requested_gen: string;
  submitted_at: number;
  status: ProposalStatus;
  stake_wei: string;
  evaluated_at: number;
  eval_attempts: number;
  scores: number[];
  scores_csv: string;
  breakdown: ScoreRow[];
  quality_bucket: number;
  completeness_bucket: number;
  final_score: number;
  final_score_text: string;
  effective_score: number;
  effective_score_text: string;
  band: number;
  qualifies: boolean;
  depth: number;
  coverage_csv: string;
  bracket_csv: string;
  quality_bracket_csv: string;
  signals_csv: string;
  model_called: boolean;
  facts_hash: string;
  content_hash: string;
  reason_text?: string;
  rank: number;
  award_wei: string;
  award_gen: string;
  stake_return_wei: string;
  contest_return_wei: string;
  payout_wei: string;
  payout_gen: string;
  payout_claimed: boolean;
  settled_at: number;
  contest_status: ContestStatus;
  contest_evidence: string;
  contest_stake_wei: string;
  contested_at: number;
  contest_score: number;
  contest_score_text: string;
  contest_quality: number;
  contest_scores_csv: string;
  contest_content_hash: string;
  contest_facts_hash: string;
  contest_reason: string;
  contestable: boolean;
  claimable_wei: string;
}

/** The contract spells the written finding `reason`; `reason` is also the
 *  refusal field on a write, so the proposal view keeps the contract's name. */
export type ProposalWithReason = Proposal & { reason: string };

export interface RankingRow {
  rank: number;
  proposal_id: number;
  author: string;
  status: ProposalStatus;
  score: number;
  score_text: string;
  band: number;
  qualifies: boolean;
  requested_wei: string;
  requested_gen: string;
  award_wei: string;
  projected_award_wei: string;
  contest_status: ContestStatus;
  payout_claimed: boolean;
  content_hash: string;
}

export interface Rankings {
  found: boolean;
  reason?: string;
  round_id: number;
  status: RoundStatus;
  phase: RoundPhase;
  final: boolean;
  pool_wei: string;
  pool_gen: string;
  threshold: number;
  threshold_text: string;
  max_winners: number;
  rows: RankingRow[];
  pending: number[];
  skipped: number[];
  winner_count: number;
  qualified_count: number;
  allocated_wei: string;
  remainder_wei: string;
  winner_score_sum: number;
}

export interface Stats {
  rounds: number;
  proposals: number;
  evaluations: number;
  evaluation_attempts: number;
  inconclusive: number;
  contests: number;
  contests_won: number;
  skipped: number;
  refusals: number;
  open_rounds: number;
  evaluating_rounds: number;
  ranked_rounds: number;
  finalized_rounds: number;
  cancelled_rounds: number;
  pending_proposals: number;
  scored_proposals: number;
  funded_proposals: number;
  qualified_proposals: number;
  rejected_proposals: number;
  skipped_proposals: number;
  total_pool_wei: string;
  total_pool_gen: string;
  total_awarded_wei: string;
  total_awarded_gen: string;
  total_stakes_wei: string;
  total_forfeited_wei: string;
  total_refunded_wei: string;
  total_claimed_wei: string;
  balance_wei: string;
  locked_wei: string;
  payable_wei: string;
  ledger_balanced: boolean;
  chain_balance_wei: string;
  undelivered_wei: string;
  identity: string;
  paused: boolean;
  owner: string;
  rubric_version: string;
}

export interface Config {
  rubric_version: string;
  owner: string;
  paused: boolean;
  score_buckets: number;
  top_bucket: number;
  score_scale: number;
  max_score: number;
  criteria_weight_bps: number;
  quality_weight_bps: number;
  completeness_weight_bps: number;
  score_tolerance: number;
  max_total_drift: number;
  band_width: number;
  min_criteria: number;
  max_criteria: number;
  min_description_chars: number;
  max_description_chars: number;
  max_evidence_chars: number;
  min_pool_wei: string;
  min_pool_gen: string;
  spam_stake_wei: string;
  spam_stake_gen: string;
  contest_stake_wei: string;
  contest_stake_gen: string;
  contest_window_s: number;
  stall_ttl_s: number;
  round_cooldown_s: number;
  min_deadline_s: number;
  max_deadline_s: number;
  max_proposals_ceiling: number;
  max_winners_ceiling: number;
  default_threshold: number;
  round_statuses: string[];
  proposal_statuses: string[];
  contest_statuses: string[];
  outcomes: string[];
  signal_names: string[];
  specific_words: string[];
  budget_words: string[];
  team_words: string[];
  impact_words: string[];
  risk_words: string[];
  filler_words: string[];
  injection_words: string[];
  depth_ladders: Record<string, number[]>;
  note: string;
}

export interface PreviewCriterion {
  name: string;
  weight_bps: number;
  coverage: number;
  min_score: number;
  max_score: number;
  addressed: boolean;
}

export interface Preview {
  found: boolean;
  reason?: string;
  round_id: number;
  chars: number;
  long_enough: boolean;
  min_description_chars: number;
  depth: number;
  completeness: number;
  signals: Record<string, number>;
  signals_csv: string;
  criteria: PreviewCriterion[];
  quality_min: number;
  quality_max: number;
  model_would_be_called: boolean;
  best_possible_score: number;
  worst_possible_score: number;
  threshold: number;
  threshold_text: string;
  note: string;
}

export interface VerifyCheck {
  field: string;
  stored: string;
  recomputed: string;
  ok: boolean;
}

export interface Verification {
  found: boolean;
  scored: boolean;
  verified: boolean;
  reason?: string;
  round_id: number;
  proposal_id: number;
  rubric_version: string;
  checks: VerifyCheck[];
  contest_checks: VerifyCheck[];
  recomputed_reason: string;
  note: string;
}

/** Every write returns either this or `{status: "OK", ...}`. It never throws. */
export interface WriteResult {
  status: "OK" | "REJECTED" | string;
  reason?: string;
  refunded_wei?: string;
  claim_with?: string;
  [key: string]: unknown;
}
