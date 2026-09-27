/**
 * Typed access to the deployed GrantJudge contract.
 *
 * Two things worth knowing before reading further:
 *
 *  1. **Views return objects, not JSON strings.** GrantJudge's
 *     `@gl.public.view` methods are annotated `-> typing.Any` and return dicts,
 *     and `genlayer-js` hands back a parsed structure. So there is no
 *     `JSON.parse` anywhere here.
 *
 *  2. **No write ever throws.** Every public write is payable or could receive
 *     value, and a call that raised would keep the deposit with no record to
 *     refund it from — so every refusal comes back as
 *     `{status: "REJECTED", reason}` with the value credited to a pull ledger.
 *     The UI must read `status`, not catch.
 */
import { CONTRACT_ADDRESS, CONSUMER_ADDRESS, getReadClient, getWalletClient } from "./genlayer";
import type {
  Analytics,
  Approvals,
  MilestoneStatus,
  Pool,
  PoolHistory,
  ProposerStats,
  RemainderRoute,
  Template,
  Config,
  Preview,
  Proposal,
  Rankings,
  Round,
  RoundCard,
  Stats,
  Verification,
  WriteResult,
} from "@/types";

export type TransactionHash = `0x${string}`;

/** A read that failed, with enough context to show the user something useful. */
export class ContractReadError extends Error {
  constructor(
    readonly method: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ContractReadError";
  }
}

/**
 * Every read is budgeted. Studio can sit on a `gen_call` for a long time under
 * load, and a page that waits forever looks broken in a way a timeout does not.
 */
const READ_TIMEOUT_MS = 30_000;

async function read<T>(method: string, args: unknown[] = [], address = CONTRACT_ADDRESS): Promise<T> {
  try {
    const result = await Promise.race([
      getReadClient().readContract({
        address: address as `0x${string}`,
        functionName: method,
        // The SDK's CalldataEncodable union doesn't describe our arg shapes;
        // the contract's own signature is the real check here.
        args: args as never,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`timed out after ${READ_TIMEOUT_MS / 1000}s`)),
          READ_TIMEOUT_MS,
        ),
      ),
    ]);
    return result as T;
  } catch (error) {
    throw new ContractReadError(
      method,
      `Could not read ${method} from the contract. Check your connection and that Studio Dev is up.`,
      error,
    );
  }
}

/* --- reads ------------------------------------------------------------- */

export const getRound = (roundId: number) => read<Round>("get_round", [roundId]);
export const getCriteria = (roundId: number) =>
  read<{ found: boolean; criteria: Round["criteria"]; criteria_hash: string }>(
    "get_criteria",
    [roundId],
  );
export const getProposal = (roundId: number, proposalId: number) =>
  read<Proposal & { reason: string }>("get_proposal", [roundId, proposalId]);
export const getProposals = (roundId: number) =>
  read<{ found: boolean; count: number; proposals: (Proposal & { reason: string })[] }>(
    "get_proposals",
    [roundId],
  );
export const getRankings = (roundId: number) => read<Rankings>("get_rankings", [roundId]);
export const getOpenRounds = () =>
  read<{ count: number; now: number; rounds: RoundCard[] }>("get_open_rounds");
export const getRounds = (offset = 0, count = 50) =>
  read<{ total: number; offset: number; count: number; rounds: RoundCard[] }>(
    "get_rounds",
    [offset, count],
  );
export const getRoundsByTreasurer = (address: string) =>
  read<{ found: boolean; count: number; rounds: RoundCard[] }>(
    "get_rounds_by_treasurer",
    [address],
  );
export const getProposalsByAuthor = (address: string) =>
  read<{
    found: boolean;
    count: number;
    claimable_wei: string;
    claimable_gen: string;
    ledger_wei: string;
    proposals: (Proposal & { reason: string })[];
  }>("get_proposals_by_author", [address]);
export const getStats = () => read<Stats>("get_stats");
export const getConfig = () => read<Config>("get_config");
export const payoutOf = (address: string) =>
  read<{ found: boolean; payout_wei: string; payout_gen: string }>("payout_of", [address]);
export const verifyEvaluation = (roundId: number, proposalId: number) =>
  read<Verification>("verify_evaluation", [roundId, proposalId]);
export const previewProposal = (
  roundId: number,
  description: string,
  timeline: string,
  team: string,
) => read<Preview>("preview_proposal", [roundId, description, timeline, team]);
export const getAward = (roundId: number, proposalId: number) =>
  read<Record<string, unknown>>("get_award", [roundId, proposalId]);

/* --- the milestone build: pools, approvals, milestones, reputation ------ */

export const getPool = (poolId: number) => read<Pool>("get_pool", [poolId]);
export const getPools = (offset = 0, count = 50) =>
  read<{ total: number; offset: number; count: number; pools: Pool[] }>("get_pools", [offset, count]);
export const getPoolHistory = (poolId: number) =>
  read<PoolHistory>("get_pool_history", [poolId]);
export const getApprovals = (roundId: number) => read<Approvals>("get_approvals", [roundId]);
export const getMilestoneStatus = (roundId: number, proposalId: number) =>
  read<MilestoneStatus>("get_milestone_status", [roundId, proposalId]);
export const getProposerStats = (address: string) =>
  read<ProposerStats>("get_proposer_stats", [address]);
export const getTemplates = () =>
  read<{ count: number; templates: Template[] }>("get_templates");
export const getTemplate = (templateId: number) => read<Template>("get_template", [templateId]);
export const getRoundAnalytics = (roundId: number) =>
  read<Analytics>("get_round_analytics", [roundId]);
export const getRemainderRoute = (roundId: number, address: string) =>
  read<RemainderRoute>("get_remainder_route", [roundId, address]);

/** The consumer's own view of a grant. Only called when it is configured. */
export const previewGrant = (roundId: number, proposalId: number) => {
  if (!CONSUMER_ADDRESS) {
    return Promise.reject(new Error("No consumer contract configured."));
  }
  return read<Record<string, unknown>>(
    "preview_grant",
    [roundId, proposalId],
    CONSUMER_ADDRESS as `0x${string}`,
  );
};

export const consumerRegistry = () => {
  if (!CONSUMER_ADDRESS) {
    return Promise.reject(new Error("No consumer contract configured."));
  }
  return read<{ count: number; grants: Record<string, unknown>[]; total_award_wei: string }>(
    "get_registry",
    [],
    CONSUMER_ADDRESS as `0x${string}`,
  );
};

/* --- writes ------------------------------------------------------------ */

/**
 * Fee estimation for a write, by simulating it first.
 *
 * Studio Dev prices every transaction and REFUSES one whose attached feeValue
 * is below the floor. A method that posts an INTERNAL MESSAGE — which here
 * means anything that moves value, because `emit_transfer` posts one — also
 * needs a `messageAllocations` entry budgeting that message. A generic estimate
 * produces no allocations and the transaction then fails inside the node with
 * `fee no_matching_allocation`, which reads like a contract fault and is not
 * one.
 *
 * A failed estimate is NOT fatal: it returns `undefined` and the transaction
 * goes out without an explicit fee so the node applies its own default. Making
 * a flaky pricing endpoint able to block every write would be trading one
 * failure mode for a worse one.
 */
async function estimateFees(
  client: ReturnType<typeof getWalletClient>,
  params: { address: `0x${string}`; functionName: string; args: unknown[]; value: bigint },
) {
  try {
    const est = await client.estimateTransactionFeesForWrite({
      address: params.address,
      functionName: params.functionName,
      args: params.args as never,
      value: params.value,
    });
    if (!est?.distribution) return undefined;
    return {
      distribution: est.distribution,
      ...(est.messageAllocations ? { messageAllocations: est.messageAllocations } : {}),
      feeValue: est.feeValue,
    };
  } catch {
    return undefined;
  }
}

async function write(
  account: `0x${string}`,
  functionName: string,
  args: unknown[] = [],
  value: bigint = 0n,
): Promise<TransactionHash> {
  const client = getWalletClient(account);
  const fees = await estimateFees(client, {
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  });
  return (await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args: args as never,
    value,
    ...(fees ? { fees } : {}),
  })) as TransactionHash;
}

export const createRound = (
  account: `0x${string}`,
  args: {
    name: string;
    description: string;
    criteriaJson: string;
    maxProposals: number;
    maxWinners: number;
    minScoreThreshold: number;
    deadlineSeconds: number;
    poolWei: bigint;
  },
) =>
  write(
    account,
    "create_round",
    [
      args.name,
      args.description,
      args.criteriaJson,
      args.maxProposals,
      args.maxWinners,
      args.minScoreThreshold,
      args.deadlineSeconds,
    ],
    args.poolWei,
  );

export const submitProposal = (
  account: `0x${string}`,
  args: {
    roundId: number;
    description: string;
    requestedWei: bigint;
    timeline: string;
    team: string;
    stakeWei: bigint;
  },
) =>
  write(
    account,
    "submit_proposal",
    [args.roundId, args.description, args.requestedWei.toString(), args.timeline, args.team],
    args.stakeWei,
  );

export const evaluate = (account: `0x${string}`, roundId: number, proposalId: number) =>
  write(account, "evaluate", [roundId, proposalId]);

export const finalize = (account: `0x${string}`, roundId: number) =>
  write(account, "finalize", [roundId]);

export const contest = (
  account: `0x${string}`,
  args: { roundId: number; proposalId: number; evidence: string; stakeWei: bigint },
) =>
  write(
    account,
    "contest",
    [args.roundId, args.proposalId, args.evidence],
    args.stakeWei,
  );

export const cancelRound = (account: `0x${string}`, roundId: number) =>
  write(account, "cancel_round", [roundId]);

export const claimAward = (account: `0x${string}`, roundId: number, proposalId: number) =>
  write(account, "claim_award", [roundId, proposalId]);

export const claimRemainder = (account: `0x${string}`, roundId: number) =>
  write(account, "claim_remainder", [roundId]);

/**
 * The remainder claim that does NOT post the transfer itself.
 *
 * `claim_remainder` is the only write in GrantJudge that both reads the block
 * clock and posts a value transfer, and on Studio Dev that combination cannot
 * be fee-estimated: the fee simulator runs on a clock roughly 664 days stale,
 * so it simulates the call on the wrong side of the round's own appeal window,
 * takes the refusal branch, emits no message, and budgets nothing for a
 * transfer the real execution does post. The transaction then reverts with
 * `out_of message_fee total`. Measured, four times — docs/PROBE.md §4b.
 *
 * This is the contract's own way around it: identical gate, identical books,
 * no transfer. The remainder lands in the treasurer's claimable balance and
 * `claimPayout` sweeps it — and `claim_payout` reads no clock, so its estimate
 * is correct. The UI uses this path because on this network it is the one that
 * completes.
 */
export const claimRemainderFallback = (account: `0x${string}`, roundId: number) =>
  write(account, "claim_remainder_fallback", [roundId]);

export const settleStalled = (account: `0x${string}`, roundId: number, proposalId: number) =>
  write(account, "settle_stalled", [roundId, proposalId]);

export const claimPayout = (account: `0x${string}`) => write(account, "claim_payout");

/* --- the milestone build: writes ---------------------------------------- */

export type PoolOptions = {
  co_approvers?: string[];
  approval_window_s?: number;
  milestones?: { description: string; percentage: number; proof_format: string }[];
  milestone_window_s?: number;
  min_reputation?: number;
};

/** The options JSON, with every empty option left OUT rather than sent as an
 *  empty value — "" is how the contract spells "none of it". */
export function optionsJson(options: PoolOptions): string {
  const out: PoolOptions = {};
  if (options.co_approvers?.length) {
    out.co_approvers = options.co_approvers;
    if (options.approval_window_s) out.approval_window_s = options.approval_window_s;
  }
  if (options.milestones?.length) {
    out.milestones = options.milestones;
    if (options.milestone_window_s) out.milestone_window_s = options.milestone_window_s;
  }
  if (options.min_reputation) out.min_reputation = options.min_reputation;
  return Object.keys(out).length ? JSON.stringify(out) : "";
}

export const createPool = (
  account: `0x${string}`,
  args: {
    name: string;
    description: string;
    criteriaJson: string;
    maxProposals: number;
    maxWinners: number;
    minScoreThreshold: number;
    deadlineSeconds: number;
    poolWei: bigint;
    options: PoolOptions;
  },
) =>
  write(
    account,
    "create_pool",
    [
      args.name,
      args.description,
      args.criteriaJson,
      args.maxProposals,
      args.maxWinners,
      args.minScoreThreshold,
      args.deadlineSeconds,
      optionsJson(args.options),
    ],
    args.poolWei,
  );

export const createRoundFromTemplate = (
  account: `0x${string}`,
  args: {
    poolId: number;
    templateId: number;
    name: string;
    description: string;
    maxProposals: number;
    maxWinners: number;
    minScoreThreshold: number;
    deadlineSeconds: number;
    poolWei: bigint;
    options: PoolOptions;
  },
) =>
  write(
    account,
    "create_round_from_template",
    [
      args.poolId,
      args.templateId,
      args.name,
      args.description,
      args.maxProposals,
      args.maxWinners,
      args.minScoreThreshold,
      args.deadlineSeconds,
      optionsJson(args.options),
    ],
    args.poolWei,
  );

export const createNextRound = (account: `0x${string}`, poolId: number, valueWei = 0n) =>
  write(account, "create_next_round", [poolId], valueWei);
export const topUpPool = (account: `0x${string}`, poolId: number, valueWei: bigint) =>
  write(account, "top_up_pool", [poolId], valueWei);
export const withdrawReserve = (account: `0x${string}`, poolId: number) =>
  write(account, "withdraw_reserve", [poolId]);
export const createTemplate = (account: `0x${string}`, name: string, criteriaJson: string) =>
  write(account, "create_template", [name, criteriaJson]);
export const approveFinalization = (account: `0x${string}`, roundId: number) =>
  write(account, "approve_finalization", [roundId]);
export const rejectFinalization = (account: `0x${string}`, roundId: number) =>
  write(account, "reject_finalization", [roundId]);
export const submitMilestoneProof = (
  account: `0x${string}`,
  args: { roundId: number; proposalId: number; index: number; url: string; text: string },
) =>
  write(account, "submit_milestone_proof", [
    args.roundId,
    args.proposalId,
    args.index,
    args.url,
    args.text,
  ]);
export const reclaimLapsedMilestones = (
  account: `0x${string}`,
  roundId: number,
  proposalId: number,
) => write(account, "reclaim_lapsed_milestones", [roundId, proposalId]);
export const evaluateAll = (account: `0x${string}`, roundId: number) =>
  write(account, "evaluate_all", [roundId]);
export const amendProposal = (
  account: `0x${string}`,
  roundId: number,
  proposalId: number,
  text: string,
) => write(account, "amend_proposal", [roundId, proposalId, text]);
export const extendDeadline = (account: `0x${string}`, roundId: number, seconds: number) =>
  write(account, "extend_deadline", [roundId, seconds]);

/**
 * SMART REMAINDER HANDLING — one click, and the remainder arrives.
 *
 * The failure `claim_remainder_fallback` exists for happens in fee ESTIMATION,
 * before the contract runs, so no contract can catch it and reroute. The route
 * therefore lives here: ask `get_remainder_route` which single step is next,
 * take it, and repeat. `book` credits the remainder without a transfer; `sweep`
 * posts the transfer from a method that reads no clock. `claim_remainder` is
 * never tried, because on this network it is the door that fails.
 *
 * Returns the LAST transaction's hash so `TxButton` can show the outcome of the
 * step that actually moved the money; the earlier step is awaited here.
 */
export async function takeRemainder(
  account: `0x${string}`,
  roundId: number,
): Promise<TransactionHash> {
  let last: TransactionHash | null = null;
  for (let i = 0; i < 3; i++) {
    const route = await getRemainderRoute(roundId, account);
    if (route.step === "book") {
      last = await write(account, "claim_remainder_fallback", [roundId]);
      const result = await waitForResult(last);
      if (result.status !== "OK") return last;
      continue;
    }
    if (route.step === "sweep") return write(account, "claim_payout");
    if (last) return last;
    throw new Error(
      route.step === "wait" ? route.why : "Nothing of this round's remainder is left to take.",
    );
  }
  if (last) return last;
  throw new Error("The remainder route did not settle; try again.");
}

/* --- waiting for a transaction ---------------------------------------- */

/**
 * Wait for a transaction to settle and read what the contract returned.
 *
 * `waitForTransactionReceipt` with `status: "ACCEPTED"` is the right target
 * here rather than FINALIZED: a write's RETURN VALUE is readable at acceptance,
 * and the UI's job is to show the user what the contract said. The money is a
 * separate matter — `_pay` posts its transfer `on="finalized"` deliberately, so
 * a balance moves later than a receipt does.
 */
export async function waitForResult(hash: TransactionHash): Promise<WriteResult> {
  const receipt = (await getReadClient().waitForTransactionReceipt({
    hash: hash as never,
    status: "ACCEPTED" as never,
    retries: 200,
    interval: 3000,
  })) as Record<string, unknown>;

  const consensus = receipt?.consensus_data as
    | { leader_receipt?: Array<Record<string, unknown>> }
    | undefined;
  const leader = consensus?.leader_receipt?.[0];
  const result = leader?.result as { payload?: unknown } | undefined;
  const payload = result?.payload;

  if (payload && typeof payload === "object") {
    const readable = (payload as { readable?: string }).readable;
    if (typeof readable === "string") {
      const parsed = parseReadable(readable);
      if (parsed) return parsed as WriteResult;
    }
  }
  if (typeof payload === "string" && payload) {
    // A revert spells its reason as a bare string. GrantJudge does not revert,
    // so reaching here means the node refused the transaction rather than the
    // contract refusing the call — worth saying differently.
    return { status: "REJECTED", reason: payload };
  }
  return { status: "OK" };
}

/**
 * Parse the SDK's `readable` payload, repairing it if necessary.
 *
 * MEASURED against genlayer-js 2.0.0-rc.1 on Studio Dev: the encoder omits the
 * comma between map entries, so a contract returning a four-key object comes
 * back as `{"a":"1""b":"2"}`, which `JSON.parse` rejects. The bug is purely in
 * the human-readable rendering; the value on the wire is correct. This inserts
 * the missing separators, tracking string literals so a quote INSIDE a value is
 * never mistaken for the start of the next key.
 *
 * Nothing in this app DEPENDS on it: every screen re-reads contract state after
 * a write, because a return value that cannot be read is a property of the
 * transport and must never be shown to a user as a contract failure.
 */
function parseReadable(text: string): unknown {
  for (const candidate of [text, repairReadable(text)]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* try the repaired form next */
    }
  }
  return null;
}

export function repairReadable(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      const prev = out.replace(/\s+$/, "").slice(-1);
      if (prev && !"{[,:".includes(prev)) out += ",";
      out += ch;
      inString = true;
      continue;
    }
    out += ch;
  }
  return out;
}
