/**
 * Deploys GrantJudge (and GrantConsumer) to Studio Dev.
 *
 *   node deploy.mjs              # the canonical instance: the brief exactly
 *   node deploy.mjs --demo       # a second instance with the windows in minutes
 *   node deploy.mjs --both       # both, plus the consumer, in one run
 *
 * WHY TWO INSTANCES. The canonical contract enforces the brief: a 24-hour
 * appeal window, a 48-hour stall window and one round per wallet per hour. That
 * is the right rule and it is completely un-watchable — the earliest a
 * treasurer could reclaim a remainder on it is a day from now, and the earliest
 * a stuck proposal could be skipped is two.
 *
 * A settlement path nobody has watched execute is a settlement path nobody has
 * tested, so a SECOND INSTANCE OF THE SAME SOURCE is deployed with the windows
 * in minutes. Every rule, every gate and every line of consensus logic is
 * identical; only the clocks are faster. That is what `seed.mjs` drives end to
 * end and what docs/EVIDENCE.md records.
 *
 * GrantConsumer points at the DEMO instance, because a consumer wired to a
 * contract with no settled rounds can only ever demonstrate its refusals.
 *
 * Every deploy estimates its fee first. Studio Dev prices transactions and
 * REFUSES one whose attached feeValue is below the floor; estimating per-call
 * rather than hardcoding a number is the difference between a script that keeps
 * working when the fee policy moves and one that starts failing everywhere for
 * a reason that looks like a contract bug.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { CHAINS, argOf, accounts, fundOnStudio, deploy, gen } from "./harness.mjs";

const networkName = argOf("network", "studiodev");
const chain = CHAINS[networkName];
if (!chain) throw new Error(`unknown network ${networkName}`);

const both = process.argv.includes("--both");
const demoOnly = process.argv.includes("--demo");

/** `RUBRIC_VERSION` as the contract itself declares it. */
function rubricVersion(source) {
  const m = String(source).match(/^RUBRIC_VERSION\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error("no RUBRIC_VERSION in the contract source");
  return m[1];
}

const acc = accounts();
const account = createAccount(acc.client.key);
const wallet = createClient({ chain, account });
const read = createClient({ chain });

console.log(`\nGrantJudge deploy → ${networkName}`);
console.log(`  signer     ${account.address} (client)`);

await fundOnStudio(chain, account.address, 2000n * 10n ** 18n);
console.log(`  balance    ${gen(await read.getBalance({ address: account.address }))} GEN`);

const path = new URL("../deployments.json", import.meta.url);
const doc = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
doc.deployments = doc.deployments || {};
const record = doc.deployments[networkName] || { network: networkName, chain_id: chain.id };

/**
 * Persist AFTER EACH CONTRACT, not once at the end.
 *
 * A previous project's deploy script put one contract on chain, then exited on
 * the second one's failure before writing anything — so a live contract existed
 * nowhere on disk and the next run happily deployed a duplicate. A deploy record
 * that only survives a fully clean run is a deploy record that loses exactly the
 * addresses you most need after a partial failure.
 */
function persist() {
  record.explorer = "https://explorer-studio-dev.genlayer.com/";
  doc.deployments[networkName] = record;
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
}

const code = readFileSync(new URL("../contracts/GrantJudge.py", import.meta.url));
const consumerCode = readFileSync(new URL("../contracts/GrantConsumer.py", import.meta.url));

const GEN = 10n ** 18n;

// (spam_stake_wei, contest_stake_wei, contest_window_s, stall_ttl_s,
//  round_cooldown_s, min_pool_wei) — all six immutable after deploy.
const VARIANTS = {
  GrantJudge: {
    label: "canonical (the brief: 0.1 / 0.2 GEN stakes, 24h appeal, 48h stall)",
    args: [GEN / 10n, GEN / 5n, 24 * 3600, 48 * 3600, 3600, GEN],
  },
  GrantJudgeDemo: {
    label: "demo (same source, appeal 5min, stall 4min, no cooldown)",
    args: [GEN / 10n, GEN / 5n, 300, 240, 0, GEN],
  },
};

const wanted = both
  ? ["GrantJudge", "GrantJudgeDemo"]
  : demoOnly
    ? ["GrantJudgeDemo"]
    : ["GrantJudge"];

for (const name of wanted) {
  const { label, args } = VARIANTS[name];
  console.log(`\n  ${name}  ${label}`);
  console.log(`  source     contracts/GrantJudge.py (${code.length.toLocaleString()} bytes)`);
  console.log(`  stakes     spam ${gen(args[0])} GEN  appeal ${gen(args[1])} GEN`);
  console.log(`  windows    appeal ${args[2]}s  stall ${args[3]}s  cooldown ${args[4]}s`);

  const res = await deploy({ chain, wallet, read, code, args, label: `${name} deploy` });
  if (!res.ok) {
    console.error(`\n${name} deploy FAILED: ${res.out?.status} ${res.reason ?? ""} ${res.out?.revertReason ?? ""}`);
    console.error((res.out?.stderr ?? "").split("\n").slice(-25).join("\n"));
    persist();
    process.exit(1);
  }
  console.log(`  address    ${res.address}`);

  record[name] = {
    address: res.address,
    deploy_tx: res.hash,
    source_bytes: code.length,
    owner: account.address,
    // READ OUT OF THE SOURCE, never retyped here. A hardcoded version string
    // silently recorded the wrong rubric the first time a previous project's
    // consensus projection changed — a deployments file that disagrees with the
    // bytes it describes is worse than one that omits the field, because it is
    // believed.
    rubric_version: rubricVersion(code),
    spam_stake_wei: args[0].toString(),
    contest_stake_wei: args[1].toString(),
    contest_window_s: args[2],
    stall_ttl_s: args[3],
    round_cooldown_s: args[4],
    min_pool_wei: args[5].toString(),
    deployed_at: new Date().toISOString(),
  };
  persist();
}

// The consumer reads whichever judge this run produced, preferring the demo,
// because a consumer wired to a contract with no settled rounds can only ever
// demonstrate its refusals.
const judge = record.GrantJudgeDemo?.address ?? record.GrantJudge?.address;
if (both && judge) {
  console.log(`\n  GrantConsumer  reads ${judge}`);
  // (judge_address, min_score, max_age_seconds). A floor of 4.00 and a
  // 90-day staleness limit: this DAO's own policy, not the judge's.
  const consumerArgs = [judge, 400, 90 * 86400];
  const res = await deploy({
    chain, wallet, read, code: consumerCode, args: consumerArgs,
    label: "GrantConsumer deploy",
  });
  if (!res.ok) {
    console.error(`\nGrantConsumer deploy FAILED: ${res.out?.status} ${res.reason ?? ""}`);
    console.error((res.out?.stderr ?? "").split("\n").slice(-25).join("\n"));
    persist();
    process.exit(1);
  }
  console.log(`  address    ${res.address}`);
  record.GrantConsumer = {
    address: res.address,
    deploy_tx: res.hash,
    source_bytes: consumerCode.length,
    judge,
    min_score: consumerArgs[1],
    max_age_seconds: consumerArgs[2],
    owner: account.address,
    custody: false,
    payable_methods: 0,
    deployed_at: new Date().toISOString(),
  };
  persist();
}

console.log(`\nwrote deployments.json`);
