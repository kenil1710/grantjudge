/**
 * Reads each deployed contract's source BACK OFF THE CHAIN and compares it,
 * byte for byte, with the file in this repository.
 *
 *   node test/verify_onchain.mjs
 *
 * `deployments.json` records a sha256 at deploy time, and `tools/audit.py`
 * re-checks it — but that only proves the FILE has not changed since. It says
 * nothing about what the chain actually holds. This closes the loop: the node
 * answers `gen_getContractCode` with the deployed source, and that is what gets
 * hashed here.
 *
 * `eth_getCode` answers "0x" for a GenVM contract; the source lives behind
 * `gen_getContractCode` and comes back base64-encoded.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { studioDevnet } from "genlayer-js/chains";  // resolved from test/node_modules

const root = new URL("../", import.meta.url);
const dep = JSON.parse(readFileSync(new URL("deployments.json", root), "utf8"))
  .deployments.studiodev;
const url = studioDevnet.rpcUrls.default.http[0];

async function codeOf(address) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gen_getContractCode", params: [address] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return Buffer.from(String(json.result), "base64");
}

const sha = (b) => createHash("sha256").update(b).digest("hex");
let failures = 0;

for (const [name, src] of [
  ["GrantJudge", "contracts/GrantJudge.py"],
  ["GrantJudgeDemo", "contracts/GrantJudge.py"],
  ["GrantConsumer", "contracts/GrantConsumer.py"],
]) {
  if (!dep[name]) continue;
  const local = readFileSync(new URL(src, root));
  let onchain;
  try {
    onchain = await codeOf(dep[name].address);
  } catch (e) {
    console.log(`  FAIL ${name}: could not read code back — ${String(e.message).slice(0, 70)}`);
    failures++;
    continue;
  }
  const same = Buffer.compare(local, onchain) === 0;
  const recorded = dep[name].source_sha256 === sha(local);
  if (!same || !recorded) failures++;
  console.log(
    `  ${same && recorded ? "ok  " : "FAIL"} ${name.padEnd(15)} ` +
    `chain ${onchain.length} bytes ${sha(onchain).slice(0, 16)}… | ` +
    `repo ${local.length} ${sha(local).slice(0, 16)}… | identical ${same}`,
  );
}

console.log(failures === 0
  ? "\n  the source in this repository IS the source on chain"
  : `\n  ${failures} MISMATCH(ES)`);
process.exit(failures === 0 ? 0 : 1);
