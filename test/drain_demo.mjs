/**
 * Settles EVERYTHING on the demo instance and asserts the contract holds zero.
 *
 *   node drain_demo.mjs            # settle, sweep, assert balance == 0
 *   node drain_demo.mjs --reopen   # ...then open one fresh round for the app
 *
 * Run after seed.mjs and seed_milestone.mjs. By then every round is FINALIZED
 * except the ones a seed deliberately leaves OPEN for the app to show — which,
 * having no proposals, their treasurers can cancel. Cancelling returns the
 * whole pool; every wallet then sweeps its ledger; and the contract's own
 * books must read exactly zero.
 *
 * The check is made on the contract's BOOKS (`balance_wei`, the sum of what it
 * has accepted and not yet paid out) and reported beside its real chain
 * balance. On Studio Dev those two can differ by transfers the network queued
 * and did not execute (README, "A note on Studio Dev and payouts"); the books
 * are what this contract controls, and they are what must reach zero.
 *
 * With --reopen, one new round is opened AFTER the zero has been recorded, so
 * the app has something open to show. The evidence records the zero, not the
 * reopened round.
 */
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { accounts, connect, gen, returnedJson } from "./harness.mjs";

const reopen = process.argv.includes("--reopen");
const deployments = JSON.parse(
  readFileSync(new URL("../deployments.json", import.meta.url), "utf8"),
).deployments.studiodev;
const address = deployments.GrantJudgeDemo.address;
const roles = Object.keys(accounts());
const clients = Object.fromEntries(roles.map((r) => [r, connect({ address, role: r })]));
const reader = clients.outsider;
const roleOf = (hex) => roles.find((r) => clients[r].account.address.toLowerCase() === String(hex).toLowerCase());

const LOG = [];
const log = (line = "") => { console.log(line); LOG.push(line); };
const checks = [];
const check = (ok, label, detail = "") => {
  checks.push({ ok: Boolean(ok), label, detail: String(detail) });
  log(`     ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

log(`=== drain ${address}`);
const list = await reader.view("get_rounds", [0, 100]);
for (const card of list.rounds ?? []) {
  const rnd = await reader.view("get_round", [card.round_id]);
  if (rnd.status === "FINALIZED" || rnd.status === "CANCELLED") continue;
  const role = roleOf(rnd.treasurer);
  if (rnd.status === "OPEN" && Number(rnd.proposal_count) === 0 && role) {
    const out = await clients[role].send("cancel_round", [rnd.round_id]);
    const json = returnedJson(out);
    check(json?.status === "OK", `round ${rnd.round_id} (${rnd.name}) cancelled by its treasurer`,
      `${gen(json?.refunded_wei ?? 0)} GEN back to the treasurer`);
  } else {
    check(false, `round ${rnd.round_id} (${rnd.name}) is settled`, `still ${rnd.status}, ${rnd.locked_wei} wei locked`);
  }
}

for (const role of roles) {
  const owed = await reader.view("payout_of", [clients[role].account.address]);
  if (BigInt(owed.payout_wei) > 0n) {
    const out = await clients[role].send("claim_payout", []);
    check(returnedJson(out)?.status === "OK", `${role} swept`, `${gen(owed.payout_wei)} GEN`);
  }
}

const stats = await reader.view("get_stats");
const pools = await reader.view("get_pools", [0, 100]);
const reserves = (pools.pools ?? []).reduce((s, p) => s + BigInt(p.reserve_wei), 0n);
log("");
log(`  books  balance ${stats.balance_wei} = locked ${stats.locked_wei} + payable ${stats.payable_wei} wei`);
log(`  chain  ${stats.chain_balance_wei} wei · undelivered ${stats.undelivered_wei} wei`);
check(BigInt(stats.balance_wei) === 0n && BigInt(stats.locked_wei) === 0n && BigInt(stats.payable_wei) === 0n,
  "Q10 · every pool settled — the contract's balance is exactly 0",
  `balance ${stats.balance_wei} · locked ${stats.locked_wei} · payable ${stats.payable_wei} · pool reserves ${reserves}`);
check(stats.ledger_balanced, "the ledger identity holds", stats.identity);

const evidence = { read_at: new Date().toISOString(), address, stats, checks };

if (reopen) {
  const t = clients.treasurer2;
  const out = await t.send("create_round", [
    "Q4 Ecosystem Fund",
    "An open round accepting proposals for the next quarter. Opened after the demo instance was drained to zero, so the app has something to show.",
    JSON.stringify([
      { name: "Technical feasibility", description: "Can this team actually build the thing they describe, and does the plan show they know how?", weight_bps: 3000 },
      { name: "Team experience", description: "Has this team shipped comparable work before?", weight_bps: 2500 },
      { name: "Community impact", description: "Who benefits, how many of them, and how directly?", weight_bps: 2500 },
      { name: "Budget reasonableness", description: "Is the money costed out, and is the cost proportionate to the work?", weight_bps: 2000 },
    ]),
    8, 3, 400, 14 * 86400,
  ], 4n * 10n ** 18n);
  log("");
  log(`  reopened a round for the app AFTER the zero was recorded: ${returnedJson(out)?.round_id ?? out.status}`);
  evidence.reopened_round = returnedJson(out)?.round_id ?? null;
}

const failed = checks.filter((c) => !c.ok).length;
log("");
log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
writeFileSync(new URL("../docs/drain-evidence.json", import.meta.url), JSON.stringify(evidence, null, 2) + "\n");
writeFileSync(new URL("../docs/drain-run.log", import.meta.url), LOG.join("\n") + "\n");
process.exit(failed === 0 ? 0 : 1);
