/**
 * Builds `docs/seed-evidence.json` by READING THE CHAIN, not by remembering
 * what a script did.
 *
 *   node collect.mjs
 *
 * WHY THIS IS SEPARATE FROM `seed.mjs`, AND WHY IT IS THE BETTER OF THE TWO.
 * The seed asserts as it goes, which is right — a run that only writes cannot
 * tell you the writes were correct. But its evidence came out of its own
 * memory, so a run that fell over near the end produced no evidence at all,
 * however much of the work had actually landed on chain.
 *
 * This reads every round, every proposal, every ranking, the books, the
 * consumer's registry and a fresh `verify_evaluation` for every scored
 * proposal, and derives the checks from what it finds. It does not know or care
 * what produced the state. That is the honest shape for an evidence document:
 * the chain is the record, and this is a reader of it.
 *
 * It writes nothing to the chain and needs no keys.
 */
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { connect } from "./harness.mjs";

const dep = JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"))
  .deployments.studiodev;

const GEN = 10n ** 18n;
const gen = (wei) => {
  const n = BigInt(String(wei ?? "0"));
  const whole = n / GEN;
  const frac = (n % GEN).toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${frac}`;
};

const checks = [];
const check = (ok, label, detail = "") => {
  checks.push({ ok: Boolean(ok), label, detail: String(detail) });
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function readInstance(name) {
  const address = dep[name]?.address;
  if (!address) return null;
  const c = connect({ address, role: "client" });
  const stats = await c.view("get_stats");
  const list = await c.view("get_rounds", [0, 50]);
  const rounds = [];
  for (const card of (list.rounds ?? []).slice().reverse()) {
    const round = await c.view("get_round", [card.round_id]);
    const proposals = await c.view("get_proposals", [card.round_id]);
    const rankings = await c.view("get_rankings", [card.round_id]);
    const verifications = [];
    for (const p of proposals.proposals ?? []) {
      if (p.evaluated_at > 0) {
        const v = await c.view("verify_evaluation", [card.round_id, p.proposal_id]);
        verifications.push({
          proposal_id: p.proposal_id,
          verified: v.verified,
          failed: (v.checks ?? []).filter((r) => !r.ok).map((r) => r.field),
          contest_failed: (v.contest_checks ?? []).filter((r) => !r.ok).map((r) => r.field),
        });
      }
    }
    rounds.push({ round, proposals: proposals.proposals ?? [], rankings, verifications });
  }
  return { name, address, stats, rounds };
}

console.log(`\nreading ${dep.GrantJudgeDemo.address} …`);
const demo = await readInstance("GrantJudgeDemo");
console.log(`reading ${dep.GrantJudge.address} …`);
const canonical = await readInstance("GrantJudge");

console.log("\nchecks derived from what is on chain:");

/* --- the outcomes the brief asks a seed to demonstrate -------------------- */
const allProposals = demo.rounds.flatMap((r) => r.proposals);
const funded = allProposals.filter((p) => p.status === "FUNDED");
const qualified = allProposals.filter((p) => p.status === "QUALIFIED");
const rejected = allProposals.filter((p) => p.status === "REJECTED");
const skipped = allProposals.filter((p) => p.status === "SKIPPED");
const wonAppeals = allProposals.filter((p) => p.contest_status === "WON");
const lostAppeals = allProposals.filter((p) => p.contest_status === "LOST");
const cancelled = demo.rounds.filter((r) => r.round.status === "CANCELLED");
const settled = demo.rounds.filter((r) => r.round.status === "RANKED" || r.round.status === "FINALIZED");

check(funded.length > 0, "FUNDED — a proposal won and was awarded",
  funded.map((p) => `#${p.proposal_id} ${gen(p.award_wei)} GEN`).join(", "));
check(qualified.length > 0, "QUALIFIED — above the bar, out of seats, deposit returned",
  qualified.map((p) => `#${p.proposal_id}`).join(", "));
check(rejected.length > 0, "REJECTED — below the bar, deposit forfeited to the pool",
  rejected.map((p) => `#${p.proposal_id} ${p.final_score_text}`).join(", "));
check(skipped.length > 0, "SKIPPED — the network could not score it, deposit returned in full",
  skipped.map((p) => `#${p.proposal_id}`).join(", "));
check(wonAppeals.length > 0, "CONTESTED → WON — re-scored on new evidence and funded",
  wonAppeals.map((p) => `#${p.proposal_id} ${p.final_score_text} → ${p.contest_score_text}`).join(", "));
check(lostAppeals.length > 0, "CONTESTED → LOST — re-scored and still below the bar",
  lostAppeals.map((p) => `#${p.proposal_id} ${p.final_score_text} → ${p.contest_score_text}`).join(", "));
check(cancelled.length > 0, "CANCELLED — a treasurer closed an empty round and took the pool back",
  cancelled.map((r) => `#${r.round.round_id} ${r.round.pool_gen} GEN`).join(", "));

/* --- proportional split --------------------------------------------------- */
for (const r of settled) {
  const winners = (r.rankings.rows ?? []).filter((row) => row.status === "FUNDED");
  if (winners.length < 2) continue;
  const [a, b] = winners;
  const uncapped = winners.every((w) => BigInt(w.award_wei) < BigInt(w.requested_wei));
  if (!uncapped) continue;
  const scoreRatio = a.score / b.score;
  const awardRatio = Number((BigInt(a.award_wei) * 10000n) / BigInt(b.award_wei || 1n)) / 10000;
  check(Math.abs(scoreRatio - awardRatio) < 0.01,
    `PARTIALLY FUNDED — round ${r.round.round_id} split in proportion to the scores`,
    `${a.score}:${b.score} → ${gen(a.award_wei)}:${gen(b.award_wei)} GEN`);
}

/* --- the money ------------------------------------------------------------ */
for (const r of settled) {
  const allocated = BigInt(r.round.allocated_wei);
  const remainder = BigInt(r.round.remainder_wei);
  const forfeited = BigInt(r.round.forfeited_wei);
  const pool = BigInt(r.round.pool_wei);
  const claimedAway = r.round.remainder_claimed;
  if (!claimedAway) {
    check(allocated + remainder - forfeited === pool,
      `round ${r.round.round_id}: awards + remainder = pool, exactly`,
      `${gen(allocated)} + ${gen(remainder - forfeited)} = ${gen(pool)} GEN`);
  }
  const unclaimed = (r.proposals ?? []).reduce(
    (sum, p) => sum + (p.payout_claimed ? 0n : BigInt(p.payout_wei)), 0n);
  check(BigInt(r.round.locked_wei) === unclaimed + (claimedAway ? 0n : remainder),
    `round ${r.round.round_id}: everything still locked is somebody's to claim`,
    `${gen(r.round.locked_wei)} locked = ${gen(unclaimed)} unclaimed by proposers + ${gen(claimedAway ? 0n : remainder)} remainder`);
  if (claimedAway && unclaimed === 0n) {
    check(BigInt(r.round.locked_wei) === 0n,
      `DRAINED — round ${r.round.round_id} reached exactly zero`,
      `${r.round.locked_wei} wei`);
  }
}

check(demo.stats.ledger_balanced, "the ledger identity holds on chain", demo.stats.identity);
check(BigInt(demo.stats.balance_wei) === BigInt(demo.stats.locked_wei) + BigInt(demo.stats.payable_wei),
  "balance = locked + payable, recomputed here from the published figures",
  `${gen(demo.stats.balance_wei)} = ${gen(demo.stats.locked_wei)} + ${gen(demo.stats.payable_wei)} GEN`);

/* --- verification --------------------------------------------------------- */
const verifications = demo.rounds.flatMap((r) => r.verifications);
const verified = verifications.filter((v) => v.verified);
check(verifications.length > 0 && verified.length === verifications.length,
  "every stored evaluation re-derives from its own inputs",
  `${verified.length}/${verifications.length}`);

/* --- consensus health ----------------------------------------------------- */
const attempts = Number(demo.stats.evaluation_attempts);
const evaluations = Number(demo.stats.evaluations);
check(evaluations > 0, "evaluations settled",
  `${evaluations} of ${attempts} attempts (${demo.stats.inconclusive} inconclusive)`);

/* --- composability -------------------------------------------------------- */
let consumer = null;
if (dep.GrantConsumer) {
  const c = connect({ address: dep.GrantConsumer.address, role: "client" });
  const config = await c.view("get_config");
  const registry = await c.view("get_registry");
  consumer = { address: dep.GrantConsumer.address, config, registry };
  check(config.custody === false && config.payable_methods === 0,
    "GrantConsumer holds nothing", `custody ${config.custody}, ${config.payable_methods} payable methods`);
  const winner = funded[0];
  if (winner) {
    const preview = await c.view("preview_grant", [winner.round_id, winner.proposal_id]);
    check(preview.would_register === true,
      "the consumer would admit a grant the judge funded",
      `#${winner.proposal_id} tier ${preview.tier} at ${preview.score_text}`);
    consumer.preview_funded = preview;
  }
  const loser = rejected[0];
  if (loser) {
    const preview = await c.view("preview_grant", [loser.round_id, loser.proposal_id]);
    check(preview.would_register === false,
      "the consumer refuses a proposal the judge rejected", preview.reason);
    consumer.preview_rejected = preview;
  }
}

/* --- write it out --------------------------------------------------------- */
const rounds = [];
for (const r of [...demo.rounds, ...(canonical?.rounds ?? [])]) {
  rounds.push({
    round_id: r.round.round_id,
    instance: demo.rounds.includes(r) ? "GrantJudgeDemo" : "GrantJudge",
    name: r.round.name,
    outcome: r.round.status,
    pool_gen: r.round.pool_gen,
    allocated_gen: r.round.allocated_gen,
    funded: r.round.funded_count,
    qualified: r.round.qualified_count,
    rejected: r.round.rejected_count,
    skipped: r.round.skipped_count,
    contested: r.round.contested_count,
    locked_wei: r.round.locked_wei,
  });
}

const evidence = {
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  seconds: 0,
  note: "Read off the chain by test/collect.mjs. Nothing here came out of a script's memory.",
  failures: checks.filter((c) => !c.ok).length,
  checks,
  deployments: dep,
  rounds,
  stats: demo.stats,
  demo: {
    address: demo.address,
    rankings: Object.fromEntries(
      demo.rounds
        .filter((r) => (r.rankings.rows ?? []).length > 0)
        .map((r) => [`round${r.round.round_id}`, r.rankings]),
    ),
    verifications,
  },
  canonical: canonical
    ? {
        address: canonical.address,
        open_round: canonical.rounds.find((r) => r.round.phase === "OPEN")?.round.round_id ?? null,
        ranked_round: canonical.rounds.find((r) => r.round.status === "RANKED")?.round.round_id ?? null,
        stats: canonical.stats,
      }
    : null,
  consumer,
};

writeFileSync(new URL("../docs/seed-evidence.json", import.meta.url),
  JSON.stringify(evidence, null, 2) + "\n");

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed — wrote docs/seed-evidence.json`);
process.exit(failed === 0 ? 0 : 1);
