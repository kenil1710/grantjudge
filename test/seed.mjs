/**
 * Drives GrantJudge through its whole lifecycle on Studio Dev and records what
 * happened.
 *
 *   node seed.mjs                    # the demo instance, end to end
 *   node seed.mjs --canonical        # two rounds on the canonical instance too
 *
 * THIS IS NOT A FIXTURE LOADER. Every number it writes comes back off the chain
 * and is asserted against what the contract's own arithmetic says it should be:
 * the ranking, the proportional split, the forfeited deposits, the appeal
 * share, the remainder and — the one that matters most — that the round's
 * locked balance reaches EXACTLY ZERO once everybody has claimed. A seed script
 * that only writes is a seed script that cannot tell you the writes were right.
 *
 * WHAT IT DEMONSTRATES, in one run:
 *
 *   FUNDED              a strong proposal wins and is paid
 *   PARTIALLY FUNDED    two winners split a pool in proportion to their scores
 *   QUALIFIED           above the bar but out of seats: deposit back, no award
 *   REJECTED            below the bar: deposit forfeited to the pool
 *   CONTESTED -> WON    rejected, appealed with new evidence, re-scored, funded
 *   CONTESTED -> LOST   appealed with adjectives, re-scored, still below
 *   CANCELLED           a treasurer closes an empty round and takes the pool
 *   STALLED -> SKIPPED  a proposal nobody could score, settled by a stranger
 *   DRAINED             after the last claim, the pool balance is zero
 *
 * Each evaluation is a real consensus round with a real model call on every
 * validator, and takes a minute or two. The whole run is roughly half an hour.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { connect, fundOnStudio, gen, sleep, returnedJson, waitFinalized } from "./harness.mjs";

const args = process.argv.slice(2);
const withCanonical = args.includes("--canonical");

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

const EVIDENCE = { started_at: new Date().toISOString(), rounds: [], checks: [] };
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

const ROLES = [
  "client", "treasurer1", "treasurer2", "treasurer3",
  "builder1", "builder2", "builder3", "builder4", "builder5",
  "trigger", "outsider",
];

/* --------------------------------------------------------------------- */

async function run(address, label, plan) {
  log("");
  log(`=== ${label}  ${address}`);

  const clients = {};
  for (const role of ROLES) clients[role] = connect({ address, role });

  // Only top up what is actually short. The faucet takes several seconds per
  // call and these accounts are reused across runs, so funding all eleven
  // unconditionally spent two minutes at the top of every run to move zero
  // GEN.
  const FLOOR = 60n * GEN;
  let topped = 0;
  for (const role of ROLES) {
    const client = clients[role];
    let balance = 0n;
    try {
      balance = await client.read.getBalance({ address: client.account.address });
    } catch {
      balance = 0n;
    }
    if (balance < FLOOR) {
      await fundOnStudio(client.chain, client.account.address, 300n * GEN);
      topped++;
    }
  }
  log(`  funding   ${topped} of ${ROLES.length} accounts topped up`);
  const reader = clients.trigger;

  const config = await reader.view("get_config");
  log(`  stakes     spam ${config.spam_stake_gen} GEN · appeal ${config.contest_stake_gen} GEN`);
  log(`  windows    appeal ${config.contest_window_s}s · stall ${config.stall_ttl_s}s`);

  return { clients, reader, config };
}

/** Submit a write and report it, returning the decoded object or null. */
async function call(client, role, method, callArgs = [], value = 0n, { quiet = false } = {}) {
  const out = await client.send(method, callArgs, value);
  const json = returnedJson(out);
  if (!quiet) {
    const status = json?.status ?? (out.ok ? out.status : `${out.status} ${out.failure ?? ""}`);
    log(`  ${role.padEnd(11)} ${method.padEnd(16)} ${String(status).padEnd(9)} ${out.seconds?.toFixed(0) ?? "?"}s  ${json?.reason ? `— ${json.reason}` : ""}`);
  }
  return { out, json };
}

/**
 * Evaluate one proposal, retrying a round that did not settle.
 *
 * A round can legitimately fail to settle: rule 10 says that when two
 * validators' readings fall on opposite sides of the funding threshold, nothing
 * is written and anyone may run it again. That is the contract working, not
 * failing, so the seed retries rather than aborting — and reports how many
 * attempts each proposal took, because that number is the honest measure of how
 * well the bracketing works on real text.
 */
async function evaluate(clients, roundId, proposalId, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    const { out, json } = await call(clients.trigger, "trigger", "evaluate", [roundId, proposalId]);
    if (json?.status === "OK" && json?.outcome === "SCORED") {
      return { json, attempts: i, seconds: out.seconds };
    }
    if (json?.outcome === "INCONCLUSIVE") {
      log(`               the scorers did not answer; retrying (${i}/${attempts})`);
    } else if (!out.ok || json?.status === "REJECTED") {
      log(`               not settled: ${json?.reason ?? out.failure ?? out.status}; retrying (${i}/${attempts})`);
    }
    await sleep(6000);
  }
  return { json: null, attempts, seconds: 0 };
}

async function seedDemo() {
  const address = deployments.GrantJudgeDemo.address;
  const { clients, reader, config } = await run(address, "GrantJudgeDemo", "full lifecycle");
  const spam = BigInt(config.spam_stake_wei);
  const appeal = BigInt(config.contest_stake_wei);
  /**
   * THE SUBMISSION WINDOW, AND WHY IT IS THIS LONG.
   *
   * Fifteen minutes for a demo round looks absurd until you count what happens
   * inside it: every create and every submit is a real transaction that has to
   * reach a terminal state, and on Studio Dev that is twenty to forty seconds
   * apiece. Nine proposals and five rounds is eight minutes of wall clock
   * before a single evaluation starts.
   *
   * The first version of this script used 150 seconds and the round closed
   * while its own proposals were still being filed — the last builder was
   * refused with "closed to submissions", which is the contract working exactly
   * as specified and the seed being wrong. The window is now set from the work
   * the seed actually does, and the wait below is computed from the LAST
   * deadline rather than assumed from the first.
   */
  const WINDOW = 900;   // submission window, seconds
  const deadlines = [];
  const record = (r) => EVIDENCE.rounds.push(r);

  /* --- round 1 ------------------------------------------------------- */
  log("");
  log("  ROUND 1 — GenLayer Ecosystem Growth, 5 GEN, 4 criteria, 2 seats, 4.00 bar");
  let r = await call(clients.treasurer1, "treasurer1", "create_round", [
    "GenLayer Ecosystem Growth",
    "Funding the infrastructure the rest of the ecosystem builds on: indexing, tooling and the things every team currently rebuilds for itself.",
    CRITERIA_4, 4, 2, 400, WINDOW,
  ], 5n * GEN);
  const round1 = r.json?.round_id;
  check(Boolean(round1), "round 1 created", `id ${round1}`);
  if (r.json?.deadline) deadlines.push(Number(r.json.deadline));

  const R1 = [
    ["builder1", "indexer"],
    ["builder2", "testkit"],
    ["builder3", "explorer"],
    ["builder4", "moonshot"],
  ];
  const r1ids = {};
  for (const [role, key] of R1) {
    const v = P[key];
    const res = await call(clients[role], role, "submit_proposal", [
      round1, v.description, genOf(v.requested_gen).toString(), v.timeline, v.team,
    ], spam);
    r1ids[key] = res.json?.proposal_id;
    check(Boolean(r1ids[key]), `proposal filed: ${key}`, `id ${r1ids[key]}`);
  }

  /* --- round 2 ------------------------------------------------------- */
  log("");
  log("  ROUND 2 — Developer Tooling, 3 GEN, 3 criteria, 2 seats, 3.00 bar");
  r = await call(clients.treasurer2, "treasurer2", "create_round", [
    "Developer Tooling",
    "Two grants for the tools that make building on GenLayer faster: a step debugger and a type generator.",
    CRITERIA_3, 2, 2, 300, WINDOW,
  ], 3n * GEN);
  const round2 = r.json?.round_id;
  check(Boolean(round2), "round 2 created", `id ${round2}`);
  if (r.json?.deadline) deadlines.push(Number(r.json.deadline));
  const r2ids = {};
  for (const [role, key] of [["builder5", "debugger"], ["builder1", "typegen"]]) {
    const v = P[key];
    const res = await call(clients[role], role, "submit_proposal", [
      round2, v.description, genOf(v.requested_gen).toString(), v.timeline, v.team,
    ], spam);
    r2ids[key] = res.json?.proposal_id;
  }

  /* --- round 3: cancelled -------------------------------------------- */
  log("");
  log("  ROUND 3 — Security Audits, cancelled before anybody filed");
  r = await call(clients.treasurer3, "treasurer3", "create_round", [
    "Security Audits",
    "A pool for third-party audits of ecosystem contracts. Withdrawn before any proposal was filed.",
    CRITERIA_3, 3, 1, 400, 3600,
  ], 2n * GEN);
  const round3 = r.json?.round_id;
  const before3 = await reader.view("payout_of", [clients.treasurer3.account.address]);
  const cancel = await call(clients.treasurer3, "treasurer3", "cancel_round", [round3]);
  check(cancel.json?.status === "OK", "round 3 cancelled");
  check(
    BigInt(cancel.json?.refunded_wei ?? 0) === 2n * GEN,
    "cancel refunded the whole pool",
    `${gen(cancel.json?.refunded_wei ?? 0)} GEN`,
  );
  const after3 = await reader.view("payout_of", [clients.treasurer3.account.address]);
  check(
    BigInt(after3.payout_wei) - BigInt(before3.payout_wei) === 2n * GEN,
    "the pool is in the treasurer's claimable balance",
  );
  await call(clients.treasurer3, "treasurer3", "claim_payout", []);
  record({ round_id: round3, name: "Security Audits", outcome: "CANCELLED", pool_gen: "2.00" });

  /* --- round 4: a stall ---------------------------------------------- */
  log("");
  log("  ROUND 4 — Docs and Translation, 2 GEN, 1 seat, one proposal nobody scores");
  r = await call(clients.treasurer1, "treasurer1", "create_round", [
    "Docs and Translation",
    "One grant for documentation work. Three proposals, one seat, and one entry the network never manages to score.",
    CRITERIA_3, 3, 1, 300, WINDOW,
  ], 2n * GEN);
  const round4 = r.json?.round_id;
  if (r.json?.deadline) deadlines.push(Number(r.json.deadline));
  const r4ids = {};
  for (const [role, key, ask] of [
    ["builder2", "translation", "1.2"],
    ["builder3", "workshops", "0.8"],
    ["builder4", "debugger", "1.5"],
  ]) {
    const v = P[key];
    const res = await call(clients[role], role, "submit_proposal", [
      round4, v.description, genOf(ask).toString(), v.timeline, v.team,
    ], spam);
    r4ids[key] = res.json?.proposal_id;
  }

  /* --- round 5: stays open ------------------------------------------- */
  log("");
  log("  ROUND 5 — Q4 Ecosystem Fund, left OPEN for the UI");
  r = await call(clients.treasurer2, "treasurer2", "create_round", [
    "Q4 Ecosystem Fund",
    "An open round accepting proposals for the next quarter. Anyone may file until the deadline.",
    CRITERIA_4, 8, 3, 400, 7 * 86400,
  ], 4n * GEN);
  const round5 = r.json?.round_id;
  check(Boolean(round5), "round 5 created and left open", `id ${round5}`);
  record({ round_id: round5, name: "Q4 Ecosystem Fund", outcome: "OPEN", pool_gen: "4.00" });

  /* --- wait for the submission windows -------------------------------- */
  // Computed from the LAST deadline the chain actually recorded, not from
  // WINDOW: the rounds were created minutes apart, so the first one's deadline
  // says nothing about the last one's.
  const closesAt = Math.max(...deadlines);
  const waitFor = Math.max(15, closesAt - Math.floor(Date.now() / 1000) + 15);
  log("");
  log(`  waiting ${waitFor}s for the last submission window to close…`);
  await sleep(waitFor * 1000);

  /* --- evaluate round 1 ----------------------------------------------- */
  log("");
  log("  evaluating round 1 — one consensus round per proposal");
  const r1scores = {};
  for (const [, key] of R1) {
    const res = await evaluate(clients, round1, r1ids[key]);
    check(Boolean(res.json), `scored: ${key}`,
      res.json ? `${res.json.scores} q${res.json.quality_bucket} c${res.json.completeness_bucket} → ${res.json.final_score_text}/7.00 ${res.json.qualifies ? "clears" : "below"} the bar (${res.attempts} attempt${res.attempts === 1 ? "" : "s"}, ${res.seconds?.toFixed(0)}s)` : "no reading");
    r1scores[key] = res.json;
  }

  const fin1 = await call(clients.trigger, "trigger", "finalize", [round1]);
  check(fin1.json?.status === "OK", "round 1 ranked",
    `${fin1.json?.winners} funded, ${fin1.json?.rejected} rejected, ${gen(fin1.json?.allocated_wei ?? 0)} GEN allocated`);

  const rank1 = await reader.view("get_rankings", [round1]);
  for (const row of rank1.rows ?? []) {
    log(`     #${row.rank} proposal ${row.proposal_id} ${String(row.status).padEnd(10)} ${row.score_text}/7.00  ${gen(row.award_wei)} GEN`);
  }
  {
    const allocated = BigInt(fin1.json?.allocated_wei ?? 0);
    const remainder = BigInt(fin1.json?.remainder_wei ?? 0);
    const forfeited = BigInt(fin1.json?.forfeited_stakes_wei ?? 0);
    check(allocated + remainder - forfeited === 5n * GEN,
      "awards + remainder = pool, exactly",
      `${gen(allocated)} + ${gen(remainder - forfeited)} = 5.00 GEN`);
  }

  /* --- the two appeals ------------------------------------------------ */
  log("");
  log("  two appeals: one with evidence, one with adjectives");
  const appealWon = await call(clients.builder3, "builder3", "contest",
    [round1, r1ids.explorer, P.explorer.appeal], appeal);
  check(appealWon.json?.outcome === "CONTEST_WON", "the evidenced appeal won",
    appealWon.json ? `${appealWon.json.original_score ? (appealWon.json.original_score / 100).toFixed(2) : "?"} → ${appealWon.json.new_score_text}, awarded ${gen(appealWon.json.award_wei ?? 0)} GEN` : "");
  if (appealWon.json?.shortfall_wei && BigInt(appealWon.json.shortfall_wei) > 0n) {
    log(`     partially funded: the remainder could not cover ${gen(appealWon.json.shortfall_wei)} GEN of the full share, and the shortfall is named rather than swallowed`);
  }
  const appealLost = await call(clients.builder4, "builder4", "contest",
    [round1, r1ids.moonshot, P.moonshot.appeal], appeal);
  check(appealLost.json?.outcome === "CONTEST_LOST", "the adjectival appeal lost",
    appealLost.json ? `${appealLost.json.new_score_text}/7.00, stake forfeited to the pool` : "");

  /* --- evaluate round 2 ----------------------------------------------- */
  log("");
  log("  evaluating round 2 — two proposals, two seats, a proportional split");
  for (const key of ["debugger", "typegen"]) {
    const res = await evaluate(clients, round2, r2ids[key]);
    check(Boolean(res.json), `scored: ${key}`,
      res.json ? `${res.json.scores} → ${res.json.final_score_text}/7.00 (${res.attempts} attempt${res.attempts === 1 ? "" : "s"})` : "no reading");
  }
  const fin2 = await call(clients.trigger, "trigger", "finalize", [round2]);
  const rank2 = await reader.view("get_rankings", [round2]);
  for (const row of rank2.rows ?? []) {
    log(`     #${row.rank} proposal ${row.proposal_id} ${String(row.status).padEnd(10)} ${row.score_text}/7.00  ${gen(row.award_wei)} GEN`);
  }
  check(fin2.json?.winners === 2, "both round 2 proposals funded");
  {
    const rows = rank2.rows ?? [];
    if (rows.length === 2) {
      const [a, b] = rows;
      const ratioScore = a.score / b.score;
      const ratioAward = Number(BigInt(a.award_wei) * 10000n / BigInt(b.award_wei || 1n)) / 10000;
      check(Math.abs(ratioScore - ratioAward) < 0.01,
        "the split is proportional to the scores",
        `scores ${a.score}:${b.score} → awards ${gen(a.award_wei)}:${gen(b.award_wei)}`);
    }
  }

  /* --- round 4: evaluate two, stall one ------------------------------- */
  log("");
  log("  evaluating round 4 — and leaving one proposal for the stall path");
  for (const key of ["translation", "debugger"]) {
    const res = await evaluate(clients, round4, r4ids[key]);
    check(Boolean(res.json), `scored: round 4 ${key}`,
      res.json ? `→ ${res.json.final_score_text}/7.00` : "no reading");
  }
  log("");
  log(`  waiting ${config.stall_ttl_s + 20}s for the stall window on the unscored proposal…`);
  await sleep((config.stall_ttl_s + 20) * 1000);
  const stalled = await call(clients.outsider, "outsider", "settle_stalled", [round4, r4ids.workshops]);
  check(stalled.json?.outcome === "SKIPPED", "a stranger settled the stuck proposal",
    `deposit of ${gen(stalled.json?.stake_return_wei ?? 0)} GEN returned in full`);

  const fin4 = await call(clients.trigger, "trigger", "finalize", [round4]);
  const rank4 = await reader.view("get_rankings", [round4]);
  for (const row of rank4.rows ?? []) {
    log(`     #${row.rank} proposal ${row.proposal_id} ${String(row.status).padEnd(10)} ${row.score_text}/7.00  ${gen(row.award_wei)} GEN`);
  }
  check(fin4.json?.qualified_not_funded >= 1,
    "a proposal above the bar but out of seats keeps its deposit and gets no award");

  /* --- claims ---------------------------------------------------------- */
  log("");
  log("  claims — every award, every returned deposit");
  const roleOf = {};
  for (const [role, key] of R1) roleOf[r1ids[key]] = role;
  roleOf[r2ids.debugger] = "builder5";
  roleOf[r2ids.typegen] = "builder1";
  roleOf[r4ids.translation] = "builder2";
  roleOf[r4ids.workshops] = "builder3";
  roleOf[r4ids.debugger] = "builder4";

  for (const [roundId, ids] of [[round1, r1ids], [round2, r2ids], [round4, r4ids]]) {
    for (const key of Object.keys(ids)) {
      const pid = ids[key];
      const p = await reader.view("get_proposal", [roundId, pid]);
      if (!p?.found || BigInt(p.payout_wei) === 0n || p.payout_claimed) continue;
      const role = roleOf[pid];
      const res = await call(clients[role], role, "claim_award", [roundId, pid]);
      check(res.json?.status === "OK", `claimed: round ${roundId} proposal ${pid} (${key})`,
        `${gen(res.json?.payout_wei ?? 0)} GEN`);
    }
  }

  log("");
  log(`  waiting ${config.contest_window_s + 20}s for the appeal windows to close…`);
  await sleep((config.contest_window_s + 20) * 1000);

  for (const [roundId, role] of [[round1, "treasurer1"], [round2, "treasurer2"], [round4, "treasurer1"]]) {
    const res = await call(clients[role], role, "claim_remainder", [roundId]);
    check(res.json?.status === "OK", `remainder claimed: round ${roundId}`,
      `${gen(res.json?.remainder_wei ?? 0)} GEN, round now ${res.json?.round_status}`);
    const rnd = await reader.view("get_round", [roundId]);
    check(BigInt(rnd.locked_wei) === 0n,
      `round ${roundId} pool drained to exactly zero`,
      `${rnd.locked_wei} wei still locked`);
    record({
      round_id: roundId,
      name: rnd.name,
      outcome: rnd.status,
      pool_gen: rnd.pool_gen,
      allocated_gen: rnd.allocated_gen,
      funded: rnd.funded_count,
      qualified: rnd.qualified_count,
      rejected: rnd.rejected_count,
      skipped: rnd.skipped_count,
      contested: rnd.contested_count,
      locked_wei: rnd.locked_wei,
    });
  }

  /* --- the books ------------------------------------------------------- */
  const stats = await reader.view("get_stats");
  log("");
  log("  the books");
  log(`     rounds ${stats.rounds} · proposals ${stats.proposals} · evaluations ${stats.evaluations} · appeals ${stats.contests} (${stats.contests_won} won)`);
  log(`     funded ${stats.funded_proposals} · qualified ${stats.qualified_proposals} · rejected ${stats.rejected_proposals} · skipped ${stats.skipped_proposals}`);
  log(`     balance ${gen(stats.balance_wei)} = locked ${gen(stats.locked_wei)} + payable ${gen(stats.payable_wei)} GEN`);
  check(stats.ledger_balanced, "the ledger identity holds on chain", stats.identity);
  check(stats.funded_proposals >= 4, "at least four proposals were funded");
  check(stats.rejected_proposals >= 1, "at least one proposal was rejected");
  check(stats.skipped_proposals >= 1, "at least one proposal was skipped");
  check(stats.qualified_proposals >= 1, "at least one proposal qualified without a seat");
  check(stats.contests === 2 && stats.contests_won === 1, "one appeal won and one lost");
  check(stats.cancelled_rounds >= 1, "one round was cancelled");
  EVIDENCE.stats = stats;

  /* --- verification ---------------------------------------------------- */
  log("");
  log("  re-deriving every stored evaluation from storage alone");
  let verified = 0;
  let checked = 0;
  for (const [roundId, ids] of [[round1, r1ids], [round2, r2ids], [round4, r4ids]]) {
    for (const key of Object.keys(ids)) {
      const v = await reader.view("verify_evaluation", [roundId, ids[key]]);
      if (!v?.scored) continue;
      checked++;
      if (v.verified) verified++;
      else log(`     FAIL round ${roundId} proposal ${ids[key]}: ${JSON.stringify((v.checks ?? []).filter((c) => !c.ok))}`);
    }
  }
  check(verified === checked && checked > 0,
    "every stored evaluation re-derives from its own inputs",
    `${verified}/${checked}`);

  /* --- composability --------------------------------------------------- */
  if (deployments.GrantConsumer) {
    log("");
    log("  GrantConsumer — a DAO registry that only recognises what the judge funded");
    const consumer = connect({ address: deployments.GrantConsumer.address, role: "outsider" });
    const winner = (rank1.rows ?? []).find((row) => row.status === "FUNDED");
    const loser = (rank1.rows ?? []).find((row) => row.status === "REJECTED");
    if (winner) {
      const preview = await consumer.view("preview_grant", [round1, winner.proposal_id]);
      log(`     preview  proposal ${winner.proposal_id}: would_register=${preview.would_register} tier=${preview.tier} ${preview.score_text}/7.00`);
      const reg = await consumer.send("register_grant", [round1, winner.proposal_id]);
      const regJson = returnedJson(reg);
      check(regJson?.status === "OK", "a funded grant registers",
        `tier ${regJson?.tier}, ${gen(regJson?.award_wei ?? 0)} GEN`);
    }
    if (loser) {
      const preview = await consumer.view("preview_grant", [round1, loser.proposal_id]);
      check(preview.would_register === false, "a rejected proposal is refused by the registry",
        preview.reason);
      const reg = await consumer.send("register_grant", [round1, loser.proposal_id]);
      check(reg.reverted === true || returnedJson(reg)?.status !== "OK",
        "register_grant REVERTS on a grant the judge will not vouch for",
        reg.revertReason?.slice(0, 120) ?? reg.status);
    }
    const registry = await consumer.view("get_registry");
    log(`     registry ${registry.count} grant(s), ${gen(registry.total_award_wei)} GEN recognised`);
    EVIDENCE.consumer = { address: deployments.GrantConsumer.address, registry };
  }

  EVIDENCE.demo = {
    address,
    round1, round2, round3, round4, round5,
    proposals: { round1: r1ids, round2: r2ids, round4: r4ids },
    rankings: { round1: rank1, round2: rank2, round4: rank4 },
  };
}

/* --------------------------------------------------------------------- */

async function seedCanonical() {
  const address = deployments.GrantJudge.address;
  const { clients, reader } = await run(address, "GrantJudge (canonical)", "two rounds");

  log("");
  log("  an OPEN round on the canonical instance");
  let r = await call(clients.treasurer1, "treasurer1", "create_round", [
    "Core Protocol Research",
    "Funding research into consensus, validator economics and the parts of the protocol that are hardest to change later.",
    CRITERIA_4, 6, 2, 400, 5 * 86400,
  ], 6n * GEN);
  const openRound = r.json?.round_id;
  check(Boolean(openRound), "canonical open round created", `id ${openRound}`);

  log("");
  log("  a round that reaches RANKED with its 24-hour appeal window still open");
  r = await call(clients.treasurer2, "treasurer2", "create_round", [
    "Indexing and Data",
    "One seat. Finalised on the canonical contract, with the full 24-hour appeal window open.",
    CRITERIA_4, 2, 1, 400, 600,
  ], 3n * GEN);
  const rankRound = r.json?.round_id;
  const ids = {};
  for (const [role, key, ask] of [["builder1", "indexer", "2"], ["builder3", "explorer", "1"]]) {
    const v = P[key];
    const res = await call(clients[role], role, "submit_proposal", [
      rankRound, v.description, genOf(ask).toString(), v.timeline, v.team,
    ], BigInt((await reader.view("get_round", [rankRound])).spam_stake_wei));
    ids[key] = res.json?.proposal_id;
  }
  log("");
  const canonicalCloses = Number((await reader.view("get_round", [rankRound])).deadline);
  const canonicalWait = Math.max(15, canonicalCloses - Math.floor(Date.now() / 1000) + 15);
  log(`  waiting ${canonicalWait}s for the submission window…`);
  await sleep(canonicalWait * 1000);
  for (const key of ["indexer", "explorer"]) {
    const res = await evaluate(clients, rankRound, ids[key]);
    check(Boolean(res.json), `canonical scored: ${key}`,
      res.json ? `→ ${res.json.final_score_text}/7.00` : "no reading");
  }
  const fin = await call(clients.trigger, "trigger", "finalize", [rankRound]);
  check(fin.json?.status === "OK", "canonical round ranked",
    `${fin.json?.winners} funded, appeal window closes at ${fin.json?.contest_window_closes}`);
  const rnd = await reader.view("get_round", [rankRound]);
  check(rnd.contest_open === true, "the 24-hour appeal window is open on chain");
  EVIDENCE.canonical = { address, open_round: openRound, ranked_round: rankRound, proposals: ids };
}

/* --------------------------------------------------------------------- */

const started = Date.now();
try {
  await seedDemo();
  if (withCanonical) await seedCanonical();
} catch (e) {
  log("");
  log(`SEED ABORTED: ${e?.stack ?? e}`);
  failures++;
}

EVIDENCE.finished_at = new Date().toISOString();
EVIDENCE.seconds = (Date.now() - started) / 1000;
EVIDENCE.failures = failures;
EVIDENCE.deployments = deployments;

log("");
log(`${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} — ${(EVIDENCE.seconds / 60).toFixed(1)} minutes`);

writeFileSync(new URL("../docs/seed-evidence.json", import.meta.url), JSON.stringify(EVIDENCE, null, 2) + "\n");
writeFileSync(new URL("../docs/seed-run.log", import.meta.url), LOG.join("\n") + "\n");
console.log("\nwrote docs/seed-evidence.json and docs/seed-run.log");
process.exit(failures === 0 ? 0 : 1);
