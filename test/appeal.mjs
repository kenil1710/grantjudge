/**
 * Files an appeal against a rejected proposal, using a fixture's `appeal` text.
 *
 *   node appeal.mjs --round=2 --proposal=3 --key=explorer
 *
 * The author of the proposal must be a wallet in `.accounts.json`, because an
 * appeal is the one path in this contract that is NOT permissionless: only the
 * author may file one, which is the point — an appeal costs a stake and puts
 * the proposal in front of the validators again, and a stranger who could do
 * that to somebody else's proposal could burn their deposit for them.
 */
import { readFileSync } from "node:fs";
import { connect, argOf, returnedJson, gen } from "./harness.mjs";

const roundId = Number(argOf("round", "0"));
const proposalId = Number(argOf("proposal", "0"));
const key = argOf("key", "");
const which = argOf("contract", "GrantJudgeDemo");
if (!roundId || !proposalId || !key) {
  console.error("usage: node appeal.mjs --round=N --proposal=N --key=<fixture> [--contract=GrantJudgeDemo]");
  process.exit(2);
}

const accounts = JSON.parse(readFileSync(new URL("./.accounts.json", import.meta.url), "utf8"));
const dep = JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"))
  .deployments.studiodev;
const P = JSON.parse(readFileSync(new URL("./fixtures/proposals.json", import.meta.url), "utf8"));
const evidence = P[key]?.appeal;
if (!evidence) throw new Error(`fixture ${key} has no appeal text`);

const address = dep[which].address;
const reader = connect({ address, role: "trigger" });
const proposal = await reader.view("get_proposal", [roundId, proposalId]);
if (!proposal?.found) throw new Error(proposal?.reason ?? "no such proposal");

console.log(`proposal ${proposalId} — ${proposal.status}, scored ${proposal.final_score_text}/7.00, contestable: ${proposal.contestable}`);
if (!proposal.contestable) {
  console.error("the contract will not accept an appeal on this proposal, and this script will not pretend otherwise");
  process.exit(1);
}

const role = Object.entries(accounts).find(
  ([, a]) => String(a.address).toLowerCase() === String(proposal.author).toLowerCase(),
)?.[0];
if (!role) throw new Error(`no key on this machine for the author ${proposal.author}`);

const round = await reader.view("get_round", [roundId]);
const author = connect({ address, role });
console.log(`filing as ${role}, staking ${gen(round.contest_stake_wei)} GEN, ${evidence.length} characters of new evidence…`);

const out = await author.send(
  "contest",
  [roundId, proposalId, evidence],
  BigInt(round.contest_stake_wei),
);
const json = returnedJson(out);
console.log(`  ${out.status} ${out.seconds?.toFixed(0)}s`, JSON.stringify(json)?.slice(0, 420));
process.exit(json?.status === "OK" ? 0 : 1);
