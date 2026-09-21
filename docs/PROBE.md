# PROBE — what was measured, and how

Everything in this file was measured against GenLayer Studio Devnet (chain
61997) during the build of GrantJudge. Nothing here is inferred from
documentation. Where a number is a single observation it says so, because a
single observation is worth having and is not the same thing as a benchmark.

---

## 1. `exec_prompt` accepts `response_format="json"` on this runner

**How it was established.** Read out of the runner's own type stubs in the
locally cached `py-lib-genlayer-std` for `v0.3.0-rc7`:

```
genlayer/gl/nondet/__init__.py
    @typing.overload
    def exec_prompt(prompt, *, response_format: typing.Literal['json'],
                    image=None) -> dict[str, typing.Any]: ...
```

and then confirmed on chain by an evaluation that settled (§2).

**Why it matters.** The alternative is a free-text answer and a parser in the
contract, which puts the contract's own parsing on the consensus axis: two nodes
whose models phrase an answer differently would then disagree about *parsing*
rather than about the proposal. Asking for JSON moves that problem to the
runner, which decodes identically everywhere.

The offline harness asserts the contract passes `response_format="json"` and
fails the suite if it ever stops:

```python
def _exec_prompt(prompt, **kwargs):
    if kwargs.get("response_format") != "json":
        raise AssertionError("GrantJudge must ask for response_format='json'")
```

---

## 2. A real evaluation settles, and takes about a minute and a half

**Measured once**, on a probe contract with the same source, 4 criteria and the
`indexer` fixture:

```
evaluating…
   ACCEPTED 105s
   {"scores":"4,6,5,4","quality_bucket":6,"completeness_bucket":4,
    "final_score":480,"final_score_text":"4.80","band":4,"qualifies":true,
    "model_called":true,"content_hash":"65c66a379d45747c","outcome":"SCORED"}
```

**What this establishes.** The consensus design settles with real validators
running real model calls: a five-dimension vector, compared with a one-bucket
tolerance per dimension and exact agreement on the qualification flag, reached
agreement on the first attempt. The stored vector re-derived from storage
(`verify_evaluation` returned `verified: true`).

**What it does not establish.** One observation is not a settlement rate. The
seed run records `attempts` per proposal for exactly this reason — see
`docs/EVIDENCE.md`.

---

## 3. Write latency on Studio Dev is highly variable

Measured across the deploy and seed runs, same contract, same account pool:

| call | observed |
|---|---|
| `create_round` | 10s, 23s, 91s, 161s, 175s, 182s, **313s** |
| `submit_proposal` | 18s, 53s, 81s, 86s, 159s, 174s, 286s |
| `cancel_round` | 161s |
| `claim_payout` | 172s |
| `evaluate` (a full consensus round) | **14s, 17s**, 105s |
| `estimateTransactionFeesForWrite` for a payable write | 11.4s |
| `sim_fundAccount` (faucet) | 2.4s, 3.8s, 10.8s |

The range is not noise around a mean — it is two regimes. The same
`evaluate` call, on the same contract with the same fixtures, took 105 seconds
in one window and 14 in another half an hour later. A script that assumes either
regime is a script that breaks in the other.

**What this cost.** The seed script's first version used a 150-second submission
window, which is generous if a submit takes 18 seconds and absurd if it takes
286. The round closed while its own proposals were still being filed and the
last builder was refused with *"closed to submissions"* — the contract working
exactly as specified, and the script being wrong. The window is now 900 seconds
and the wait is computed from the **last deadline the chain recorded** rather
than assumed from the first.

**And then the same bug cost a whole seeded round.** A `create_round` settled in
**313 seconds** against a 300-second client give-up. The script had no round id,
filed its three proposals into round `0`, and every one was correctly refused
with the stake returned — the contract behaved perfectly, and the run lost a
round to the *client* being wrong about the chain.

Two fixes, and the second is the one that matters. The deadline is now 900
seconds, because giving up early is worse than waiting long here. And a create
that still comes back unsettled is no longer treated as a failure: the chain is
asked whether the round exists, by treasurer and name, before anything
downstream believes it does.

> A write that lands after the client stopped watching leaves the SCRIPT wrong
> about the chain. That is the one failure mode a seed script must not have,
> because every number it then reports is measured against a world that is not
> the one on chain.

**The faucet had the same shape of bug.** `fundOnStudio` was a bare
`await fetch` with no timeout. When Studio accepted the socket and stopped
answering, an eleven-account funding loop hung with nothing in the log, and an
unanswered HTTP request looked like a contract problem. It is now bounded to 20
seconds, retried three times, non-fatal, and skipped entirely for an account
that already has a balance.

---

## 4. `estimateTransactionFeesForWrite` returns no message allocations for a
   payable write that posts no internal message

Measured for `submit_proposal` with a 1,845-character description and
`value = 0.1 GEN`:

```
estimate took 11.4s  feeValue 378622800010352  allocs no
```

**Why this is the right answer and not a bug.** `submit_proposal` moves value
*into* the contract and posts no internal message, so there is nothing to
allocate. The methods that need an allocation are the ones that call
`emit_transfer` — `claim_award`, `claim_remainder`, `claim_payout` — and the
estimate is taken per call, with the real signer and the real arguments, rather
than once and reused. A generic estimate produces `totalMessageFees: 0` and the
transaction then fails *inside* the node with `fee no_matching_allocation`,
which reads like a contract fault and is not one.

---

## 5. The v0.6 contract format, confirmed by deploying

The two-line runner header is exactly:

```
# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
```

**Established by deploying.** Both contracts in this repository deploy and run
with this header, with `gl.contract.Contract`, `gl.storage.TreeMap`,
`gl.storage.DynArray`, `gl.storage.allow`, `gl.message.raw`,
`gl.contract.interface` and `gl.vm.run_nondet`.

GenVM parses the *contiguous leading `#` block* as the runner header, so a stray
comment between line 1 and the imports makes the contract undeployable and
reports nothing but `invalid_contract`. `genvm-lint` does not catch it; the
offline suite does, structurally, for both files.

**The runner is a pinned hash, not `py-genlayer:test`.** A deployed contract
that floats its runner is a contract whose semantics can change under it without
a transaction. `tools/audit.py` refuses both `:test` and `:latest`.

---

## 6. `genvm-lint validate` cannot run against a pinned runner locally

```
$ genvm-lint check contracts/GrantJudge.py
✓ Lint passed (3 checks)
✗ Validation failed
  Failed to load SDK: "filename 'runners/py-genlayer/5j/ycge…tar' not found"
```

The AST lint passes; the SDK-semantics validator cannot fetch that runner into
the local cache, which holds `v0.3.0-rc7` under a different id. Substituting
`py-genlayer:test` to get the validator to run fails differently
(`No module named 'genlayer.py'`).

**What was done instead.** The offline suite carries a static undefined-name
check over the *whole* file including class bodies, plus the structural checks
the validator would have made: no unqualified storage names, no pre-v0.6
namespaces, no `run_nondet_unsafe`, no `str.replace`, and the two-line header.
A name error inside a `@gl.public.view` only fires when that view is called on
chain; a parser catches it in a millisecond.

---

## 7. Studio Dev queues an `on="finalized"` transfer and does not execute it

`_pay` posts its internal transfer on finalisation, deliberately: a payout
applied at acceptance would already have happened if the transaction that
authorised it were later rolled back.

This was established by three previous projects in this series, three ways each:
the message is posted with the right recipient and the right value, the parent
transaction reaches FINALIZED, and no balance moves. It is a property of the
network, not of the contract.

**It is reported rather than hidden.** `get_stats` publishes the contract's real
chain balance beside its own books and names the gap `undelivered_wei`. The
figure from this project's own seed run is in `docs/EVIDENCE.md`. On a network
that delivers, it is zero.

---

## 8. The SDK's `readable` payload is not valid JSON

Measured against `genlayer-js@2.0.0-rc.1`: the encoder omits the comma between
map entries, so a contract returning a four-key object comes back as

```
{"claim_with":"claim_payout()""claimable_at":1794929934"status":"REJECTED"}
```

which `JSON.parse` rejects. The `raw` calldata beside it is correct — the bug is
purely in the human-readable rendering.

Both the harness and the frontend carry a repair that inserts the missing
separators while tracking string literals, so a quote *inside* a value is never
mistaken for the start of the next key. **Nothing depends on it:** every
assertion in the seed and every screen in the app re-reads contract state after
a write, because a return value that cannot be read is a property of the
transport and must never be reported as a contract failure.
