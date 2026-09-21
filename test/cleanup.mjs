/**
 * Cancels an empty round left behind by an interrupted run.
 *
 *   node cleanup.mjs --round=1 --role=treasurer1
 *
 * A run that is killed between `create_round` and its first `submit_proposal`
 * leaves a real, funded, open round with nobody in it. That is not a bug — the
 * round is exactly what the treasurer asked for — but it is confusing beside
 * the seeded ones, and the pool is doing nothing.
 *
 * `cancel_round` is the contract's own answer: a treasurer may close a round
 * and take the pool back while, and only while, nobody has filed. This calls
 * it, and refuses to pretend otherwise if somebody has.
 */
import { readFileSync } from "node:fs";
import { connect, argOf, returnedJson, gen } from "./harness.mjs";

const roundId = Number(argOf("round", "0"));
const role = argOf("role", "treasurer1");
const which = argOf("contract", "GrantJudgeDemo");
if (!roundId) {
  console.error("usage: node cleanup.mjs --round=N [--role=treasurer1] [--contract=GrantJudgeDemo]");
  process.exit(2);
}

const dep = JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"))
  .deployments.studiodev;
const client = connect({ address: dep[which].address, role });

const round = await client.view("get_round", [roundId]);
if (!round?.found) throw new Error(`no round ${roundId} on ${which}`);
console.log(`round ${roundId} "${round.name}" — ${round.status}/${round.phase}, ${round.proposal_count} filed, pool ${gen(round.pool_wei)} GEN`);

if (round.proposal_count > 0) {
  console.error("this round has proposals filed against it; the pool is no longer the treasurer's to move");
  process.exit(1);
}
if (round.status !== "OPEN") {
  console.error(`the round is ${round.status}; only an OPEN round can be cancelled`);
  process.exit(1);
}

const out = await client.send("cancel_round", [roundId]);
const json = returnedJson(out);
console.log(`  cancel_round ${out.status} ${out.seconds?.toFixed(0)}s`, JSON.stringify(json)?.slice(0, 220));
if (json?.status !== "OK") process.exit(1);

const swept = await client.send("claim_payout", []);
console.log(`  claim_payout ${swept.status}`, JSON.stringify(returnedJson(swept))?.slice(0, 180));
