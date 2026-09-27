/**
 * Drives the MILESTONE BUILD's features through real consensus on Studio Dev,
 * on the demo instance, and records what the chain says happened.
 *
 *   node seed_milestone.mjs
 *
 * It runs on wallets of its own (`ptreasurer*`, `pbuilder*`, `approver*`,
 * `newcomer`, `ptrigger` — see accounts.mjs), so it can run beside seed.mjs,
 * which still demonstrates the original eight outcomes on the same instance.
 *
 * WHAT IT DEMONSTRATES:
 *
 *   POOL A  Ecosystem Growth v2   multi-round: round 1 evaluated in ONE
 *                                 evaluate_all call and ranked; top_up_pool and
 *                                 create_next_round open round 2 under the same
 *                                 rubric; a round-1 filing resubmitted verbatim
 *                                 is refused; an amendment is read with its
 *                                 filing; pool history shows both rounds
 *   POOL B  Security Audit Fund   two co-approvers: finalize is refused, the
 *                                 first approval is not enough, the second
 *                                 ranks the round in the same transaction
 *   POOL C  Dev Tools Grant       a 60/40 milestone schedule: the award is held
 *                                 at ranking, each proof is judged by consensus
 *                                 and releases its tranche, claimed in turn
 *   POOL D  Community Fund        min_reputation 1: a proposer Pool A funded is
 *                                 admitted, a wallet with no record is refused
 *   POOL E  from a template       "Standard Ecosystem" saved with Pool A's
 *                                 rubric (same criteria hash), a pool opened
 *                                 from it, and its deadline extended once
 *   ANALYTICS                     get_round_analytics on the busiest round
 *   REMAINDERS                    every one taken by `takeRemainder`, the
 *                                 client-side router — one call per round
 *
 * Like seed.mjs, THIS IS NOT A FIXTURE LOADER: every figure it reports is read
 * back off the chain and checked, and a check that fails is recorded as a
 * failure rather than retried until it passes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { connect, fundOnStudio, gen, sleep, returnedJson, takeRemainder } from "./harness.mjs";

const GEN = 10n ** 18n;
const genOf = (text) => {
  const [whole, frac = ""] = String(text).split(".");
  return BigInt(whole) * GEN + BigInt((frac + "0".repeat(18)).slice(0, 18));
};

const deployments = JSON.parse(
  readFileSync(new URL("../deployments.json", import.meta.url), "utf8"),
).deployments.studiodev;
const P = JSON.parse(readFileSync(new URL("./fixtures/proposals.json", import.meta.url), "utf8"));

const LOG = [];
const log = (line = "") => {
  console.log(line);
  LOG.push(line);
};
const EVIDENCE = { started_at: new Date().toISOString(), checks: [], pools: {} };
let failures = 0;
function check(ok, label, detail = "") {
  EVIDENCE.checks.push({ ok: Boolean(ok), label, detail: String(detail) });
  if (!ok) failures++;
  log(`     ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

const CRITERIA_4 = JSON.stringify([
  { name: "Technical feasibility", description: "Can this team actually build the thing they describe, and does the plan show they know how?", weight_bps: 3000 },
  { name: "Team experience", description: "Has this team shipped comparable work before?", weight_bps: 2500 },
  { name: "Community impact", description: "Who benefits, how many of them, and how directly?", weight_bps: 2500 },
  { name: "Budget reasonableness", description: "Is the money costed out, and is the cost proportionate to the work?", weight_bps: 2000 },
]);
const CRITERIA_3 = JSON.stringify([
  { name: "Technical feasibility", description: "Can this be built as described, and does the plan show the team knows how?", weight_bps: 4000 },
  { name: "Developer impact", description: "How many developers does this help, and how much does it help them?", weight_bps: 3500 },
  { name: "Budget reasonableness", description: "Is the cost costed out and proportionate to the work?", weight_bps: 2500 },
]);

const ROLES = ["ptreasurer1", "ptreasurer2", "ptreasurer3", "pbuilder1", "pbuilder2",
  "pbuilder3", "pbuilder4", "pbuilder5", "approver1", "approver2", "newcomer", "ptrigger"];

const address = deployments.GrantJudgeDemo.address;
const clients = {};
for (const role of ROLES) clients[role] = connect({ address, role });
const reader = clients.ptrigger;
const addr = (role) => clients[role].account.address;

async function call(role, method, args = [], value = 0n) {
  const out = await clients[role].send(method, args, value);
  const json = returnedJson(out);
  const status = json?.status ?? (out.ok ? out.status : `${out.status} ${out.failure ?? ""}`);
  log(`  ${role.padEnd(12)} ${method.padEnd(26)} ${String(status).padEnd(9)} ${out.seconds?.toFixed(0) ?? "?"}s${json?.reason ? `  — ${json.reason}` : ""}`);
  return { out, json };
}

/** A create that outran the client is a question for the chain, not a failure (NOTES 11). */
async function openedRound(role, res, name) {
  if (res.json?.round_id) return res.json;
  for (let i = 0; i < 6; i++) {
    const mine = await reader.view("get_rounds_by_treasurer", [addr(role)]);
    const hit = (mine?.rounds ?? []).filter((r) => r.name === name).pop();
    if (hit) {
      log(`               the create outran the client but LANDED — round ${hit.round_id}`);
      return { round_id: hit.round_id, pool_id: hit.pool_id, deadline: hit.deadline };
    }
    await sleep(10_000);
  }
  return null;
}

async function file(role, roundId, key, ask = null) {
  const v = P[key];
  const res = await call(role, "submit_proposal", [
    roundId, v.description, genOf(ask ?? v.requested_gen).toString(), v.timeline, v.team,
  ], spam);
  return res;
}

/** Evaluate a round: one evaluate_all per batch, falling back to evaluate() per
 *  proposal if a batch did not settle — which is the documented cost of a batch
 *  (every reading in it must settle for the transaction to). */
async function scoreRound(roundId, label) {
  let batches = 0;
  for (let i = 0; i < 4; i++) {
    const rnd = await reader.view("get_round", [roundId]);
    if (Number(rnd.pending_count) === 0) break;
    const res = await call("ptrigger", "evaluate_all", [roundId]);
    batches++;
    if (res.json?.status === "OK") {
      for (const row of res.json.results ?? []) {
        log(`               proposal ${row.proposal_id}: ${row.outcome}${row.final_score_text ? ` ${row.final_score_text}/7.00` : ""}`);
      }
      continue;
    }
    // ACCEPTED WITH AN UNREADABLE RETURN VALUE IS NOT "DID NOT SETTLE". The
    // first run of this script said it was: the batch settled all three
    // readings in one 55-second transaction, the SDK's `readable` rendering of
    // the nested `results` list could not be parsed, and the log reported a
    // failure that had not happened. The chain is the record - so ask it.
    if (res.out.ok && !res.json) {
      const after = await reader.view("get_round", [roundId]);
      log(`               batch ACCEPTED, return value unreadable — the chain says ${after.evaluated_count} scored, ${after.pending_count} pending`);
      continue;
    }
    // The batch did not settle. Fall back to one consensus round per proposal.
    log(`               batch did not settle (${res.json?.reason ?? res.out.status}); evaluating one at a time`);
    const props = await reader.view("get_proposals", [roundId]);
    for (const p of props.proposals ?? []) {
      if (p.status !== "PENDING") continue;
      for (let a = 0; a < 3; a++) {
        const one = await call("ptrigger", "evaluate", [roundId, p.proposal_id]);
        if (one.json?.outcome === "SCORED") break;
        await sleep(5000);
      }
    }
  }
  const rnd = await reader.view("get_round", [roundId]);
  check(Number(rnd.pending_count) === 0, `${label}: every proposal scored`, `${rnd.evaluated_count} scored, ${batches} evaluate_all call(s)`);
  return batches;
}

let spam = 0n;

async function main() {
  // --- funding --------------------------------------------------------------
  let topped = 0;
  for (const role of ROLES) {
    const bal = await reader.read.getBalance({ address: addr(role) }).catch(() => 0n);
    if (bal < 40n * GEN) {
      await fundOnStudio(clients[role].chain, addr(role), 200n * GEN);
      topped++;
    }
  }
  const config = await reader.view("get_config");
  spam = BigInt(config.spam_stake_wei);
  log(`=== GrantJudgeDemo ${address} — milestone build`);
  log(`  funding  ${topped} of ${ROLES.length} wallets topped up · batch ${config.max_batch_eval} · delivery bar ${config.milestone_threshold}`);

  const WINDOW = 900;
  const deadlines = [];

  // --- POOL A, round 1 -------------------------------------------------------
  log("");
  log("  POOL A — Ecosystem Growth v2, multi-round, 5 GEN, 2 seats, 4.00 bar");
  let res = await call("ptreasurer1", "create_pool", [
    "Ecosystem Growth v2",
    "The ecosystem fund, run as a series of rounds under one rubric. Same criteria every round, fresh proposals each time.",
    CRITERIA_4, 4, 2, 400, WINDOW, "",
  ], 5n * GEN);
  const a1 = await openedRound("ptreasurer1", res, "Ecosystem Growth v2 - Round 1");
  check(Boolean(a1), "pool A opened with round 1", a1 ? `pool ${a1.pool_id}, round ${a1.round_id}` : "");
  const poolA = Number(a1.pool_id);
  const roundA1 = Number(a1.round_id);
  deadlines.push(Number(a1.deadline));
  const A1 = { pbuilder1: "indexer", pbuilder2: "explorer", pbuilder3: "translation" };
  const a1ids = {};
  for (const [role, key] of Object.entries(A1)) {
    const r = await file(role, roundA1, key);
    a1ids[role] = r.json?.proposal_id;
    check(Boolean(a1ids[role]), `pool A round 1: ${key} filed`, `proposal ${a1ids[role]}`);
  }
  // FEATURE 8 — one amendment, before the deadline, stored beside the filing.
  const amend = await call("pbuilder2", "amend_proposal", [roundA1, a1ids.pbuilder2,
    "Budget detail added before the deadline: 0.9 GEN engineering salary at 60 hours per month, 0.3 GEN hosting and infra for 12 months, 0.2 GEN for an accessibility review, 0.1 GEN contingency."]);
  check(amend.json?.status === "OK", "an amendment is accepted before the deadline", `${amend.json?.amendment_chars} chars, the filing unchanged`);

  // --- POOL B ----------------------------------------------------------------
  log("");
  log("  POOL B — Security Audit Fund, two co-approvers");
  res = await call("ptreasurer2", "create_pool", [
    "Security Audit Fund",
    "Audits of ecosystem contracts. Two named co-approvers must sign off before the ranking pays out.",
    CRITERIA_3, 3, 2, 300, WINDOW,
    JSON.stringify({ co_approvers: [addr("approver1"), addr("approver2")], approval_window_s: 7200 }),
  ], 3n * GEN);
  const b1 = await openedRound("ptreasurer2", res, "Security Audit Fund - Round 1");
  check(Boolean(b1) && Number(res.json?.approvals_needed ?? 2) === 2, "pool B opened needing 2 of 2 approvals");
  const roundB = Number(b1.round_id);
  deadlines.push(Number(b1.deadline));
  const bids = {};
  for (const [role, key] of [["pbuilder4", "debugger"], ["pbuilder5", "testkit"]]) {
    const r = await file(role, roundB, key);
    bids[role] = r.json?.proposal_id;
  }

  // --- POOL C ----------------------------------------------------------------
  log("");
  log("  POOL C — Dev Tools Grant, milestones 60 / 40");
  res = await call("ptreasurer3", "create_pool", [
    "Dev Tools Grant",
    "One seat for developer tooling, paid in two tranches against delivered milestones.",
    CRITERIA_3, 2, 1, 300, WINDOW,
    JSON.stringify({ milestones: P._milestones.typegen, milestone_window_s: 14400 }),
  ], 3n * GEN);
  const c1 = await openedRound("ptreasurer3", res, "Dev Tools Grant - Round 1");
  check(Boolean(c1) && Number(res.json?.milestone_count ?? 2) === 2, "pool C opened with a two-milestone schedule");
  const roundC = Number(c1.round_id);
  deadlines.push(Number(c1.deadline));
  const cids = {};
  for (const [role, key] of [["pbuilder1", "typegen"], ["pbuilder2", "moonshot"]]) {
    const r = await file(role, roundC, key);
    cids[role] = r.json?.proposal_id;
  }

  // --- TEMPLATE and POOL E ----------------------------------------------------
  log("");
  log("  TEMPLATE — Standard Ecosystem, saved with pool A's rubric");
  res = await call("ptreasurer1", "create_template", ["Standard Ecosystem", CRITERIA_4]);
  const templateId = res.json?.template_id;
  const poolAView = await reader.view("get_pool", [poolA]);
  check(res.json?.criteria_hash === poolAView.criteria_hash, "the template carries pool A's exact rubric",
    `criteria hash ${res.json?.criteria_hash}`);
  res = await call("ptreasurer2", "create_round_from_template", [0, templateId,
    "Standard Ecosystem Q1",
    "A pool opened from the Standard Ecosystem template. Left open for the app.",
    6, 2, 400, 3 * 86400, "",
  ], 2n * GEN);
  const e1 = await openedRound("ptreasurer2", res, "Standard Ecosystem Q1 - Round 1");
  check(Boolean(e1), "pool E opened from the template", e1 ? `pool ${e1.pool_id}, template ${templateId}` : "");
  const roundE = Number(e1?.round_id);
  // FEATURE 9 — extend a thin round, once.
  const ext = await call("ptreasurer2", "extend_deadline", [roundE, 86400]);
  check(ext.json?.status === "OK" && Number(ext.json.deadline) === Number(ext.json.original_deadline) + 86400,
    "pool E's deadline extended by a day", `extensions left ${ext.json?.extensions_left}`);

  // --- wait ------------------------------------------------------------------
  const closes = Math.max(...deadlines);
  const wait = Math.max(15, closes - Math.floor(Date.now() / 1000) + 15);
  log("");
  log(`  waiting ${wait}s for the submission windows to close…`);
  await sleep(wait * 1000);

  // --- evaluate and rank A ---------------------------------------------------
  log("");
  log("  POOL A round 1 — evaluate_all, one call per batch of three");
  await scoreRound(roundA1, "pool A round 1");
  const amended = await reader.view("get_proposal", [roundA1, a1ids.pbuilder2]);
  const verifiedAmend = await reader.view("verify_evaluation", [roundA1, a1ids.pbuilder2]);
  check(Boolean(amended.amendment) && verifiedAmend.verified, "the amended proposal verifies with its amendment in the content hash",
    amended.content_hash);
  res = await call("ptrigger", "finalize", [roundA1]);
  check(res.json?.status === "OK", "pool A round 1 ranked", `${res.json?.winners} funded, ${res.json?.rejected} rejected`);

  // --- B: approvals ------------------------------------------------------------
  log("");
  log("  POOL B — the ranking waits for its co-approvers");
  await scoreRound(roundB, "pool B");
  res = await call("ptrigger", "finalize", [roundB]);
  check(res.json?.status === "REJECTED", "finalize is refused without the approvals", res.json?.reason ?? "");
  res = await call("approver1", "approve_finalization", [roundB]);
  check(res.json?.status === "OK" && res.json.finalized === false, "the first approval is not enough",
    `${res.json?.approvals}/${res.json?.approvals_needed}`);
  res = await call("approver2", "approve_finalization", [roundB]);
  check(res.json?.finalized === true, "the second approval ranks the round in the same transaction",
    `${res.json?.finalize?.winners} funded, outcome ${res.json?.finalize?.approval_outcome}`);
  const approvals = await reader.view("get_approvals", [roundB]);
  EVIDENCE.pools.B = { round: roundB, approvals };

  // --- C: milestones -----------------------------------------------------------
  log("");
  log("  POOL C — the award is held, and released against delivered milestones");
  await scoreRound(roundC, "pool C");
  res = await call("ptrigger", "finalize", [roundC]);
  check(res.json?.status === "OK", "pool C ranked", `${res.json?.winners} funded`);
  const rankC = await reader.view("get_rankings", [roundC]);
  const winnerC = (rankC.rows ?? []).find((r) => r.status === "FUNDED");
  const winnerRole = winnerC ? Object.entries(cids).find(([, id]) => id === winnerC.proposal_id)?.[0] : null;
  check(Boolean(winnerC), "pool C has a funded winner", winnerC ? `proposal ${winnerC.proposal_id}` : "");
  if (winnerC && winnerRole) {
    const pid = winnerC.proposal_id;
    let status = await reader.view("get_milestone_status", [roundC, pid]);
    const award = BigInt(status.award_wei);
    check(BigInt(status.held_wei) === award && award > 0n, "the whole award is held at ranking", `${gen(award)} GEN held`);
    res = await call(winnerRole, "claim_award", [roundC, pid]);
    check(res.json?.status === "OK", "the returned deposit is claimable at once", `${gen(res.json?.payout_wei ?? 0)} GEN`);
    const proofs = P._milestones.typegen_proofs;
    for (let i = 0; i < 2; i++) {
      let proved = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        proved = await call(winnerRole, "submit_milestone_proof", [roundC, pid, i,
          `https://github.com/genlayer-community/typegen/releases/tag/milestone-${i + 1}`, proofs[i]]);
        if (proved.json?.outcome && proved.json.outcome !== "INCONCLUSIVE") break;
        await sleep(5000);
      }
      const expect = i === 0 ? (award * 6000n) / 10000n : award - (award * 6000n) / 10000n;
      check(proved.json?.outcome === "MILESTONE_PASSED" && BigInt(proved.json.released_wei) === expect,
        `milestone ${i + 1} verified by consensus and ${i === 0 ? "60" : "40"}% released`,
        `${proved.json?.score_text}/7.00 against 4.00, ${gen(proved.json?.released_wei ?? 0)} GEN`);
      res = await call(winnerRole, "claim_award", [roundC, pid]);
      check(res.json?.status === "OK" && BigInt(res.json.payout_wei) === expect,
        `tranche ${i + 1} claimed`, `${gen(res.json?.payout_wei ?? 0)} GEN`);
    }
    status = await reader.view("get_milestone_status", [roundC, pid]);
    check(BigInt(status.held_wei) === 0n && BigInt(status.released_wei) === award,
      "the tranches sum to the award exactly", `${gen(status.released_wei)} of ${gen(award)} GEN`);
    EVIDENCE.pools.C = { round: roundC, proposal: pid, status };
  }

  // --- A round 2 --------------------------------------------------------------
  log("");
  log("  POOL A — top up, open round 2 under the same rubric");
  res = await call("ptreasurer1", "top_up_pool", [poolA], 3n * GEN);
  check(res.json?.status === "OK", "pool A topped up", `${gen(res.json?.reserve_wei ?? 0)} GEN in reserve`);
  res = await call("ptreasurer1", "create_next_round", [poolA]);
  const a2 = await openedRound("ptreasurer1", res, "Ecosystem Growth v2 - Round 2");
  check(Boolean(a2) && Number(res.json?.round_number ?? 2) === 2, "round 2 opened from the reserve", a2 ? `round ${a2.round_id}` : "");
  const roundA2 = Number(a2.round_id);
  const r2 = await reader.view("get_round", [roundA2]);
  const r1 = await reader.view("get_round", [roundA1]);
  check(r2.criteria_hash === r1.criteria_hash, "round 2 runs round 1's rubric, hash for hash", r2.criteria_hash);
  const verbatim = await file("pbuilder1", roundA2, "indexer");
  check(verbatim.json?.status === "REJECTED" && Boolean(verbatim.json.earlier_proposal_id),
    "a round-1 filing resubmitted verbatim is refused", verbatim.json?.reason ?? "");
  for (const [role, key] of [["pbuilder4", "workshops"], ["pbuilder5", "debugger"]]) {
    const r = await file(role, roundA2, key);
    check(r.json?.status === "OK", `pool A round 2: ${key} filed`, `proposal ${r.json?.proposal_id}`);
  }

  // --- D: reputation -------------------------------------------------------------
  log("");
  log("  POOL D — Community Fund, min_reputation 1");
  res = await call("ptreasurer3", "create_pool", [
    "Community Fund",
    "Open only to proposers this contract has funded before. Left open for the app.",
    CRITERIA_4, 5, 2, 400, 3 * 86400, JSON.stringify({ min_reputation: 1 }),
  ], 2n * GEN);
  const d1 = await openedRound("ptreasurer3", res, "Community Fund - Round 1");
  const roundD = Number(d1?.round_id);
  const rankA1 = await reader.view("get_rankings", [roundA1]);
  const fundedA = (rankA1.rows ?? []).find((r) => r.status === "FUNDED");
  const fundedRole = fundedA ? Object.entries(a1ids).find(([, id]) => id === fundedA.proposal_id)?.[0] : null;
  if (fundedRole) {
    const stats = await reader.view("get_proposer_stats", [addr(fundedRole)]);
    log(`     ${fundedRole} record: entered ${stats.rounds_entered}, funded ${stats.proposals_funded}, awarded ${stats.total_awarded_gen} GEN, average ${stats.average_score_text}`);
    const d = await file(fundedRole, roundD, "testkit");
    check(d.json?.status === "OK", "a proposer pool A funded is admitted", `${stats.proposals_funded} funded`);
  } else {
    check(false, "a proposer pool A funded is admitted", "pool A funded nobody");
  }
  const fresh = await reader.view("get_proposer_stats", [addr("newcomer")]);
  const n = await file("newcomer", roundD, "workshops");
  check(n.json?.status === "REJECTED" && Number(fresh.proposals_funded) === 0,
    "a wallet with no record is refused, and its deposit is refundable", n.json?.reason ?? "");
  await call("newcomer", "claim_payout", []);

  // --- A round 2: score and rank ---------------------------------------------------
  const wait2 = Math.max(15, Number(r2.deadline) - Math.floor(Date.now() / 1000) + 15);
  log("");
  log(`  waiting ${wait2}s for pool A round 2 to close…`);
  await sleep(wait2 * 1000);
  await scoreRound(roundA2, "pool A round 2");
  res = await call("ptrigger", "finalize", [roundA2]);
  check(res.json?.status === "OK", "pool A round 2 ranked", `${res.json?.winners} funded`);

  const history = await reader.view("get_pool_history", [poolA]);
  check(Number(history.total_rounds) === 2, "pool A's history shows two rounds",
    `${history.total_proposals} proposals, ${history.total_funded} funded, ${history.total_distributed_gen} GEN distributed`);
  EVIDENCE.pools.A = { pool: poolA, history };

  // --- analytics ------------------------------------------------------------------
  let busiest = roundA1;
  let most = -1;
  for (const rid of [roundA1, roundA2, roundB, roundC]) {
    const rv = await reader.view("get_round", [rid]);
    if (Number(rv.evaluated_count) > most) { most = Number(rv.evaluated_count); busiest = rid; }
  }
  const analytics = await reader.view("get_round_analytics", [busiest]);
  log("");
  log(`  ANALYTICS — round ${busiest}, ${analytics.scored_count} scored`);
  for (const c of analytics.criteria ?? []) {
    log(`     ${String(c.name).padEnd(24)} mean ${(c.mean / 100).toFixed(2)}  min ${(c.min / 100).toFixed(2)}  max ${(c.max / 100).toFixed(2)}  sd ${(c.stddev / 100).toFixed(2)}`);
  }
  log(`     distribution by band ${JSON.stringify(analytics.distribution)} · funding rate ${(analytics.funding_rate_bps / 100).toFixed(1)}%`);
  check(Number(analytics.scored_count) === most && most >= 2, "analytics computed from stored scores", `round ${busiest}`);
  EVIDENCE.analytics = { round: busiest, analytics };

  // --- claims and remainders ----------------------------------------------------------
  log("");
  log("  claims — every award and returned deposit");
  const owners = { ...Object.fromEntries(Object.entries(a1ids).map(([r, id]) => [id, r])),
    ...Object.fromEntries(Object.entries(bids).map(([r, id]) => [id, r])),
    ...Object.fromEntries(Object.entries(cids).map(([r, id]) => [id, r])) };
  for (const rid of [roundA1, roundA2, roundB, roundC]) {
    const props = await reader.view("get_proposals", [rid]);
    for (const p of props.proposals ?? []) {
      if (BigInt(p.claimable_wei) === 0n) continue;
      // BOTH SIDES LOWERCASED. The chain answers `author` in checksummed case;
      // the first run of this script lowercased only one side, matched no
      // wallet for pool A's second round, skipped its claim, and correctly
      // reported that round as not drained.
      const role = owners[p.proposal_id]
        ?? ROLES.find((r) => addr(r).toLowerCase() === String(p.author).toLowerCase());
      if (!role) continue;
      const c = await call(role, "claim_award", [rid, p.proposal_id]);
      check(c.json?.status === "OK", `claimed: round ${rid} proposal ${p.proposal_id}`, `${gen(c.json?.payout_wei ?? 0)} GEN`);
    }
  }
  log("");
  log(`  waiting ${Number(config.contest_window_s) + 20}s for the appeal windows…`);
  await sleep((Number(config.contest_window_s) + 20) * 1000);
  log("");
  log("  REMAINDERS — one takeRemainder() per round; the client routes around the fee bug");
  for (const [rid, role] of [[roundA1, "ptreasurer1"], [roundA2, "ptreasurer1"], [roundB, "ptreasurer2"], [roundC, "ptreasurer3"]]) {
    const taken = await takeRemainder(clients[role], reader, rid, (line) => log(`     ${line}`));
    check(taken.ok, `round ${rid}: remainder taken in one call`, taken.steps.map((s) => s.method).join(" → "));
    const rv = await reader.view("get_round", [rid]);
    check(BigInt(rv.locked_wei) === 0n, `round ${rid} drained to exactly zero`, `${rv.locked_wei} wei locked`);
  }

  const stats = await reader.view("get_stats");
  log("");
  log(`  books  balance ${gen(stats.balance_wei)} = locked ${gen(stats.locked_wei)} + payable ${gen(stats.payable_wei)} GEN`);
  log(`         pools ${stats.pools} · templates ${stats.templates} · milestones passed ${stats.milestones_passed} · batches ${stats.batches} · amendments ${stats.amendments} · extensions ${stats.extensions}`);
  check(stats.ledger_balanced, "the ledger identity holds on chain", stats.identity);
  EVIDENCE.stats = stats;
  EVIDENCE.rounds = { A1: roundA1, A2: roundA2, B: roundB, C: roundC, D: roundD, E: roundE, template: templateId };
}

const started = Date.now();
try {
  await main();
} catch (e) {
  log("");
  log(`SEED ABORTED: ${e?.stack ?? e}`);
  failures++;
}
EVIDENCE.finished_at = new Date().toISOString();
EVIDENCE.seconds = (Date.now() - started) / 1000;
EVIDENCE.failures = failures;
EVIDENCE.address = address;
log("");
log(`${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} — ${(EVIDENCE.seconds / 60).toFixed(1)} minutes`);
writeFileSync(new URL("../docs/milestone-evidence.json", import.meta.url), JSON.stringify(EVIDENCE, null, 2) + "\n");
writeFileSync(new URL("../docs/milestone-run.log", import.meta.url), LOG.join("\n") + "\n");
process.exit(failures === 0 ? 0 : 1);
