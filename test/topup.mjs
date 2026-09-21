/**
 * Repairs a seed run that lost a write to the network.
 *
 *   node topup.mjs --round=2 --key=moonshot --role=builder4 --ask=1
 *
 * WHY THIS EXISTS. `harness.send` gives up on a transaction that has not
 * reached a terminal state in 300 seconds and reports it as UNSETTLED — which
 * is the right thing to do, because a run that blocks for ever on one dropped
 * transaction reports nothing at all. But Studio Dev sometimes settles that
 * transaction afterwards, and sometimes does not, so a seed run can end with a
 * proposal it believes was never filed, or without one it meant to file.
 *
 * This files a single missing proposal into an existing round, and refuses
 * loudly if the round has already closed or the wallet has already filed —
 * both of which are the contract working, and neither of which this script
 * should paper over.
 */
import { readFileSync } from "node:fs";
import { connect, argOf, returnedJson, gen } from "./harness.mjs";

const roundId = Number(argOf("round", "0"));
const key = argOf("key", "");
const role = argOf("role", "");
const ask = argOf("ask", "1");
const which = argOf("contract", "GrantJudgeDemo");

if (!roundId || !key || !role) {
  console.error("usage: node topup.mjs --round=N --key=<fixture> --role=<account> [--ask=GEN] [--contract=GrantJudgeDemo]");
  process.exit(2);
}

const dep = JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"))
  .deployments.studiodev;
const P = JSON.parse(readFileSync(new URL("./fixtures/proposals.json", import.meta.url), "utf8"));
const fixture = P[key];
if (!fixture) throw new Error(`no fixture named ${key}`);

const address = dep[which].address;
const client = connect({ address, role });
const round = await client.view("get_round", [roundId]);
if (!round?.found) throw new Error(`no round ${roundId} on ${which}`);

console.log(`round ${roundId} "${round.name}" — ${round.phase}, ${round.proposal_count}/${round.max_proposals} filed, ${round.seconds_remaining}s left`);
if (round.phase !== "OPEN") {
  console.error(`the round is ${round.phase}; a proposal cannot be filed into it and this script will not pretend otherwise`);
  process.exit(1);
}

const wei = (() => {
  const [w, f = ""] = String(ask).split(".");
  return BigInt(w) * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18));
})();

console.log(`filing ${key} as ${role}, asking ${gen(wei)} GEN, staking ${gen(round.spam_stake_wei)} GEN…`);
const out = await client.send(
  "submit_proposal",
  [roundId, fixture.description, wei.toString(), fixture.timeline, fixture.team],
  BigInt(round.spam_stake_wei),
);
const json = returnedJson(out);
console.log(`  ${out.status} ${out.seconds?.toFixed(0)}s`, JSON.stringify(json)?.slice(0, 260));
process.exit(json?.status === "OK" ? 0 : 1);
