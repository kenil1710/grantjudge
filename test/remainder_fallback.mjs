/**
 * THE TRAPPED-REMAINDER GAP, CLOSED ON CHAIN AND PROVED HERE.
 *
 *   node test/remainder_fallback.mjs                  # the demo instance
 *   node test/remainder_fallback.mjs --instance=GrantJudge
 *   node test/remainder_fallback.mjs --resume=3         # a round already RANKED
 *   node test/remainder_fallback.mjs --address=0x…      # another instance
 *
 * `claim_remainder` is the only write in GrantJudge that both reads the block
 * clock and posts a value transfer, and on Studio Dev that combination cannot
 * be fee-estimated: the fee simulator runs on a clock roughly 664 days stale,
 * so it simulates the call on the wrong side of the round's own appeal window,
 * takes the refusal branch, emits no message, and budgets nothing for a
 * transfer the real execution does post. The transaction reverts with
 * `out_of message_fee total`, and a treasurer who cannot withdraw their own
 * remainder has trapped value. Measured in docs/PROBE.md §4b.
 *
 * `claim_remainder_fallback` breaks the combination rather than trying to
 * out-budget it — a contract cannot choose its own fee allocation. It applies
 * the identical gate, books the remainder to the treasurer's claimable balance
 * and posts nothing; `claim_payout` (which reads no clock) then posts the
 * transfer. Two transactions, each fee-estimable, in place of one that is not.
 *
 * WHAT THIS SCRIPT DOES. It drives a round to RANKED with the whole pool as
 * remainder WITHOUT needing an evaluation: one proposal, left unscored past the
 * stall TTL, is SKIPPED, so finalize ranks nobody and every wei of the pool
 * falls to the remainder. Then, on the SAME round, back to back:
 *
 *   1. claim_remainder           — expected to fail on fees
 *   2. claim_remainder_fallback  — expected to settle, crediting the treasurer
 *   3. claim_payout              — expected to settle, paying it out
 *
 * Step 1 is deliberately run first and its failure is NOT a failure of this
 * script: it is the measurement the fallback exists for, and a run where it
 * unexpectedly SUCCEEDS is reported as news, because it would mean the network
 * fixed its simulator.
 *
 * It costs about eleven minutes, almost all of it waiting out two real windows,
 * and roughly 1.1 GEN of pool and stake which it takes back out again.
 */
import { readFileSync } from "node:fs";
import { connect, sleep, gen, argOf, estimateWriteFees, returnedJson } from "./harness.mjs";

const instance = argOf("instance", "GrantJudgeDemo");
const dep = JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"))
  .deployments.studiodev;
if (!dep[instance]) throw new Error(`no ${instance} in deployments.json`);

/** `--address=0x…` runs against an instance other than the recorded one. */
const address = argOf("address", dep[instance].address);
const STALL = Number(dep[instance].stall_ttl_s);
const APPEAL = Number(dep[instance].contest_window_s);
const GEN = 10n ** 18n;
const DEADLINE = 60;
/** `--resume=<round id>` picks up a round that is already RANKED. */
const RESUME = argOf("resume", null);

const CRITERIA = JSON.stringify([
  { name: "Technical feasibility", description: "Can this be built as described, and does the plan show the team knows how?", weight_bps: 4000 },
  { name: "Community impact", description: "Who benefits, how many of them, and how directly?", weight_bps: 3000 },
  { name: "Budget reasonableness", description: "Is the money costed out, and is the cost proportionate to the work?", weight_bps: 3000 },
]);

const DESC = "A grant request filed purely to be left unscored, so that the round " +
  "ranks nobody and the entire pool falls to the remainder. It describes a small " +
  "indexing utility for GenLayer contract events, with a four week timeline and a " +
  "single maintainer, and it exists to exercise the settlement path rather than the " +
  "scoring path. Every field is long enough to pass the contract's own minimum " +
  "length gates, which is the only thing that matters about it.";

let failures = 0;
const log = (s = "") => console.log(s);
/** A view result, whether the client handed back a string or a decoded object. */
const readJson = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
};

const treasurer = connect({ address, role: "treasurer1" });
const proposer = connect({ address, role: "builder1" });

log(`\n${instance}  ${address}`);
log(`  treasurer  ${treasurer.account.address}`);
log(`  windows    deadline ${DEADLINE}s · stall ${STALL}s · appeal ${APPEAL}s`);

/** Open a round, let its only proposal stall, finalise it, and wait out
 *  the appeal window — leaving the whole pool as an unclaimed remainder. */
async function buildRound() {
  log(`\n== a round whose pool becomes the remainder in full ==`);
  out = await treasurer.send("create_round",
    ["Remainder Fallback Proof",
     "A round opened to drive the remainder settlement path end to end on chain.",
     CRITERIA, 2, 1, 400, DEADLINE], 1n * GEN);
  json = returnedJson(out);
  check(json?.status === "OK", "create_round", `${out.status} round ${json?.round_id}`);
  if (json?.status !== "OK") process.exit(1);
  rid = Number(json.round_id);

  out = await proposer.send("submit_proposal",
    [rid, DESC, (1n * GEN).toString(),
     "Four weeks: two to build, one to test, one to document and hand over.",
     "One maintainer who has shipped comparable indexing tools before."], GEN / 10n);
  json = returnedJson(out);
  check(json?.status === "OK", "submit_proposal", `${out.status} proposal ${json?.proposal_id}`);
  const pid = Number(json?.proposal_id ?? 1);

  log(`\n== waiting out the deadline and the stall TTL (${DEADLINE + STALL + 15}s) ==`);
  await sleep((DEADLINE + STALL + 15) * 1000);

  out = await treasurer.send("settle_stalled", [rid, pid]);
  json = returnedJson(out);
  check(json?.status === "OK", "settle_stalled leaves the proposal SKIPPED",
        `${out.status} ${json?.proposal_status ?? json?.reason ?? ""}`);

  out = await treasurer.send("finalize", [rid]);
  json = returnedJson(out);
  check(json?.status === "OK", "finalize ranks nobody", `${out.status}`);

  round = readJson(await treasurer.view("get_round", [rid]));
  remainder = BigInt(round.remainder_wei);
  check(round.status === "RANKED" && remainder > 0n,
        "the whole pool is the remainder", `${gen(remainder)} GEN, round ${round.status}`);

  log(`\n== waiting out the appeal window (${APPEAL + 20}s) ==`);
  await sleep((APPEAL + 20) * 1000);
}

let rid, remainder, round, out, json;

if (RESUME) {
  rid = Number(RESUME);
  round = readJson(await treasurer.view("get_round", [rid]));
  remainder = BigInt(round.remainder_wei);
  log(`\n== resuming round ${rid} ==`);
  check(round.status === "RANKED" && remainder > 0n,
        "the round is RANKED with a remainder to claim",
        `${gen(remainder)} GEN, round ${round.status}`);
  if (failures) process.exit(1);
} else {
  await buildRound();
}


log(`\n== the fee estimates, side by side ==`);
for (const fn of ["claim_remainder", "claim_remainder_fallback"]) {
  const est = await estimateWriteFees(treasurer.wallet, {
    address, functionName: fn, args: [rid], value: 0n,
  });
  const allocs = est?.messageAllocations;
  log(`    ${fn.padEnd(26)} feeValue=${est?.feeValue ?? "?"} allocations=${
    allocs ? (Array.isArray(allocs) ? allocs.length : "yes") : "NONE"}`);
}

/**
 * ASSERTED AGAINST CONTRACT STATE, NOT AGAINST THE RETURN VALUE.
 *
 * genlayer-js renders a returned object into a `readable` string that is not
 * always valid JSON (see `repairReadable` in harness.mjs), so a run can fail to
 * read a return value that the contract produced perfectly well. A return that
 * cannot be decoded is a property of the transport and must never be reported
 * as a contract failure — so every check below reads the round, the ledger and
 * the books back off the chain, and the decoded return is printed as commentary
 * only.
 */
const stateOf = async () => {
  const r = readJson(await treasurer.view("get_round", [rid]));
  const owed = readJson(await treasurer.view("payout_of", [treasurer.account.address]));
  return { status: String(r.status), remainder: BigInt(r.remainder_wei),
           owed: BigInt(owed.payout_wei ?? 0) };
};
const commentary = (out) => {
  const j = returnedJson(out);
  return j ? `${j.status ?? "?"} ${j.reason ?? ""}`.trim()
           : "(return value not decodable — reading state instead)";
};

log(`\n== 1. claim_remainder, the one-transaction form ==`);
out = await treasurer.send("claim_remainder", [rid]);
log(`    tx ${out.status} · ${commentary(out)}`);
let st = await stateOf();
const oneCallWorked = st.status === "FINALIZED";
if (oneCallWorked) {
  log(`    NEWS: the one-call form SUCCEEDED on this network. The fee simulator`);
  log(`    may have been fixed — re-measure docs/PROBE.md §4b before relying on it.`);
} else {
  log(`    it did not settle the round — this is the gap the fallback exists to close`);
  check(st.status === "RANKED" && st.remainder === remainder,
        "a failed claim_remainder left the round untouched",
        `${st.status}, ${gen(st.remainder)} GEN still there`);
}

if (!oneCallWorked) {
  log(`\n== 2. claim_remainder_fallback ==`);
  out = await treasurer.send("claim_remainder_fallback", [rid]);
  log(`    tx ${out.status} · ${commentary(out)}`);
  st = await stateOf();
  check(st.status === "FINALIZED", "the fallback closes the round", st.status);
  check(st.remainder === 0n, "the round no longer holds the remainder",
        `${gen(st.remainder)} GEN`);
  check(st.owed >= remainder, "the remainder is now the treasurer's to sweep",
        `${gen(st.owed)} GEN claimable`);

  log(`\n== 3. claim_payout ==`);
  const before = st.owed;
  out = await treasurer.send("claim_payout", []);
  log(`    tx ${out.status} · ${commentary(out)}`);
  st = await stateOf();
  check(st.owed === 0n, "the sweep empties the treasurer's ledger",
        `${gen(before)} GEN swept, ${gen(st.owed)} left`);
}

const stats = readJson(await treasurer.view("get_stats", []));
const balanced = stats.ledger_balanced === true || stats.ledger_balanced === "true";
check(balanced, "balance == locked + payable still holds",
      `locked ${stats.locked_wei} payable ${stats.payable_wei} balance ${stats.balance_wei}`);

log();
log(failures === 0
  ? "  THE TREASURER GOT THE REMAINDER OUT."
  : `  ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
