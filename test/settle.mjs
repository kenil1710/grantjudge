/**
 * Drives one round to completion from wherever it currently is.
 *
 *   node settle.mjs --round=2                 # evaluate, finalize, claim
 *   node settle.mjs --round=2 --stalled       # also skip anything still stuck
 *   node settle.mjs --round=2 --remainder     # also claim the remainder
 *
 * WHY THIS EXISTS SEPARATELY FROM `seed.mjs`. The seed writes a whole demo in
 * one pass and gives up on a proposal it could not get scored in three
 * attempts. That is the right behaviour for a script whose job is to report
 * what happened — but a round left with one unscored proposal cannot be
 * finalised, and the fix is not to re-run the seed and create everything again.
 *
 * This reads the round's CURRENT state and does only what is still missing. It
 * is safe to run repeatedly: every step checks the chain first, and the
 * contract refuses anything out of order anyway.
 *
 * It is also the honest operator's tool for the real thing. A round is
 * permissionless to evaluate and to finalise; anybody can run this against
 * anybody's round, and it earns them nothing.
 */
import { readFileSync } from "node:fs";
import { connect, argOf, returnedJson, gen, sleep } from "./harness.mjs";

const roundId = Number(argOf("round", "0"));
const which = argOf("contract", "GrantJudgeDemo");
const attempts = Number(argOf("attempts", "4"));
const alsoStalled = process.argv.includes("--stalled");
const alsoRemainder = process.argv.includes("--remainder");
if (!roundId) {
  console.error("usage: node settle.mjs --round=N [--attempts=4] [--stalled] [--remainder] [--contract=GrantJudgeDemo]");
  process.exit(2);
}

const accounts = JSON.parse(readFileSync(new URL("./.accounts.json", import.meta.url), "utf8"));
const dep = JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"))
  .deployments.studiodev;
const address = dep[which].address;

const trigger = connect({ address, role: "trigger" });
/** role name -> client, for whichever wallet owns a given proposal. */
const byAddress = new Map(
  Object.entries(accounts).map(([role, a]) => [String(a.address).toLowerCase(), role]),
);
const clients = new Map();
const clientFor = (addr) => {
  const role = byAddress.get(String(addr).toLowerCase());
  if (!role) return null;
  if (!clients.has(role)) clients.set(role, connect({ address, role }));
  return { role, client: clients.get(role) };
};

const say = (...a) => console.log(...a);

let round = await trigger.view("get_round", [roundId]);
if (!round?.found) throw new Error(`no round ${roundId} on ${which}`);
say(`round ${roundId} "${round.name}" — ${round.status}/${round.phase}, ${round.proposal_count} filed, ${round.pending_count} unscored`);

/* --- 1. evaluate whatever is still pending -------------------------------- */
if (round.status === "OPEN" || round.status === "EVALUATING") {
  if (round.seconds_remaining > 0) {
    say(`  the submission window is still open for ${round.seconds_remaining}s; nothing to do yet`);
    process.exit(0);
  }
  const proposals = await trigger.view("get_proposals", [roundId]);
  for (const p of proposals.proposals ?? []) {
    if (p.status !== "PENDING") continue;
    let scored = false;
    for (let i = 1; i <= attempts && !scored; i++) {
      const out = await trigger.send("evaluate", [roundId, p.proposal_id]);
      const json = returnedJson(out);
      const label = json?.outcome ?? json?.status ?? out.status;
      say(`  evaluate #${p.proposal_id} attempt ${i}: ${label} ${out.seconds?.toFixed(0)}s ${json?.reason ? "— " + json.reason : ""}`);
      if (json?.outcome === "SCORED") {
        say(`    ${json.scores} → ${json.final_score_text}/7.00 ${json.qualifies ? "clears" : "below"} the bar`);
        scored = true;
      } else {
        await sleep(5000);
      }
    }
    if (!scored && alsoStalled) {
      const out = await trigger.send("settle_stalled", [roundId, p.proposal_id]);
      const json = returnedJson(out);
      say(`  settle_stalled #${p.proposal_id}: ${json?.outcome ?? json?.reason ?? out.status}`);
    }
  }
  round = await trigger.view("get_round", [roundId]);
}

/* --- 2. finalize ---------------------------------------------------------- */
if (round.status === "OPEN" || round.status === "EVALUATING") {
  const out = await trigger.send("finalize", [roundId]);
  const json = returnedJson(out);
  say(`  finalize: ${json?.status} ${json?.reason ?? ""} ${json?.status === "OK" ? `${json.winners} funded, ${gen(json.allocated_wei)} GEN allocated` : ""}`);
  round = await trigger.view("get_round", [roundId]);
}

/* --- 3. pay everybody who is owed something ------------------------------- */
const proposals = await trigger.view("get_proposals", [roundId]);
for (const p of proposals.proposals ?? []) {
  if (p.payout_claimed || BigInt(p.payout_wei) === 0n) continue;
  const who = clientFor(p.author);
  if (!who) {
    say(`  #${p.proposal_id} is owed ${gen(p.payout_wei)} GEN but this machine holds no key for ${p.author}`);
    continue;
  }
  const out = await who.client.send("claim_award", [roundId, p.proposal_id]);
  const json = returnedJson(out);
  say(`  claim_award #${p.proposal_id} as ${who.role}: ${json?.status} ${json?.payout_wei ? gen(json.payout_wei) + " GEN" : json?.reason ?? ""}`);
}

/* --- 4. the remainder ----------------------------------------------------- */
if (alsoRemainder) {
  round = await trigger.view("get_round", [roundId]);
  const who = clientFor(round.treasurer);
  if (!who) {
    say(`  the remainder belongs to ${round.treasurer} and this machine holds no key for it`);
  } else if (round.contest_open) {
    say(`  the appeal window is open for another ${round.contest_closes_at - Math.floor(Date.now() / 1000)}s; the remainder is not the treasurer's yet`);
  } else {
    const out = await who.client.send("claim_remainder", [roundId]);
    const json = returnedJson(out);
    say(`  claim_remainder as ${who.role}: ${json?.status} ${json?.remainder_wei ? gen(json.remainder_wei) + " GEN" : json?.reason ?? ""}`);
  }
}

const final = await trigger.view("get_round", [roundId]);
say(`round ${roundId} is now ${final.status}/${final.phase} — ${final.funded_count} funded, ${final.qualified_count} qualified, ${final.rejected_count} rejected, ${final.skipped_count} skipped, ${final.locked_wei} wei still locked`);
