/**
 * Creates test/.accounts.json — a stable, reusable pool of signing keys.
 *
 * A POOL rather than one key because GrantJudge's rules are RELATIONAL. "One
 * proposal per wallet per round" cannot even be STATED with a single address;
 * neither can "only the treasurer may cancel", nor "only the author may appeal",
 * nor "anyone may trigger an evaluation". Proving any of them needs several
 * wallets, and the seed round needs one per proposal because a wallet may file
 * only once to a round.
 *
 * Keys are written by hand rather than read off `createAccount()`, because that
 * helper does NOT expose a `privateKey` field — it returns a viem account whose
 * key stays private to the closure. Persisting `account.privateKey` therefore
 * writes `undefined`, JSON.stringify drops the field entirely, and every later
 * `createAccount(undefined)` silently mints a brand-new random account. On a
 * faucet-funded network that failure is INVISIBLE: every run works, just from a
 * different address each time. It surfaces later, as access-control tests that
 * can never trigger and a treasurer nobody holds the key to.
 *
 * Existing roles are PRESERVED across runs unless --force is passed, so a
 * funded address is never silently replaced.
 *
 * Usage: node accounts.mjs [--force]
 */
import { createAccount } from "genlayer-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = new URL("./.accounts.json", import.meta.url);
const force = process.argv.includes("--force");

// `client` deploys and owns the contract. Its only power is pausing NEW rounds.
// `treasurer1..3` each run one round — the create_round rate limit is one per
// wallet per hour, so three rounds in one run need three treasurers, and a
// single-wallet run would spend its time being refused with the refusals
// reading exactly like a contract fault in a log.
// `builder1..5` file the proposals. `trigger` calls evaluate() and finalize(),
// which proves those paths really are permissionless and earns nothing for it.
// `outsider` only ever probes access control and must never be granted a
// privilege by any test.
const ROLES = [
  "client",
  "treasurer1", "treasurer2", "treasurer3",
  "builder1", "builder2", "builder3", "builder4", "builder5",
  "trigger", "outsider",
];

const existing = existsSync(target) && !force ? JSON.parse(readFileSync(target, "utf8")) : {};
const out = {};
let created = 0;

for (const role of ROLES) {
  if (existing[role]?.key) {
    out[role] = existing[role];
    continue;
  }
  const key = `0x${randomBytes(32).toString("hex")}`;
  const account = createAccount(key);
  // Round-trip assertion: the stored address must be the one this key actually
  // derives. Without it a mismatch just sits in the file looking plausible.
  if (createAccount(key).address !== account.address) {
    throw new Error(`key for ${role} does not derive a stable address`);
  }
  out[role] = { key, address: account.address };
  created++;
}

writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote .accounts.json — ${created} new, ${ROLES.length - created} preserved`);
for (const role of ROLES) console.log(`  ${role.padEnd(12)} ${out[role].address}`);
