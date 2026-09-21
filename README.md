# GrantJudge — DAO grant evaluation by open criteria

**Fund what matters. Let consensus decide.**

A DAO treasurer opens a round: they deposit a pool of GEN and write three to
five criteria in plain English, each with a weight. Builders submit proposals
and stake a small spam deposit. After the deadline, anyone may trigger an
evaluation, and GenLayer's validators independently read each proposal against
each criterion and score it. The ranking, the allocation and every wei of the
settlement are then computed by ordinary deterministic code from the scores the
validators agreed on.

**Live app:** <https://grantjudge-app.vercel.app>
**On chain:** GenLayer Studio Devnet, chain 61997. Addresses in
[`deployments.json`](deployments.json).

---

## Where the line is

This is the whole design, and everything else in this repository is a
consequence of it.

**GenLayer does exactly one thing.** It reads a proposal written in English
against criteria written in English and says how well the first answers the
second. That is a judgement. It has no closed form, no API, no oracle, and a
committee doing it is the status quo this replaces.

**Deterministic code does everything else.** The brackets that bound what a
score may be, the coverage count, the weighted total, the ranking, the
proportional split, the threshold test, the spam-stake lifecycle, the appeal
arithmetic, the remainder and every transfer.

> **Not one wei is moved by a model.** A model that answered nonsense could, at
> worst, decline to fund something. It could never pay anybody.

---

## The two people this is for

**A treasurer** has GEN to give away and a set of things they care about. Today
they run a spreadsheet, a group chat and a call, and the result is a decision
nobody outside the call can audit. Here they write the criteria down, put a
number beside each one, lock the pool, and never touch the outcome again — there
is no method in this contract by which a treasurer changes a rubric, a score, a
ranking or an award.

**A proposer** writes against a rubric they can read before they start, sees
exactly what the contract can already measure in their draft before they stake
anything, gets their deposit back if they clear the bar whether or not there was
a seat left, and can appeal a rejection with new evidence for a stake that comes
back if they are right.

---

## How a round runs

```
CREATED ──▶ OPEN ──▶ EVALUATING ──▶ RANKED ──▶ FINALIZED
   │                     │             │
   │                     │             └── contest() ──▶ re-scored ──▶ funded or not
   │                     │
   │                     └── settle_stalled() ──▶ a stuck proposal is SKIPPED
   │
   └── cancel_round() ──▶ CANCELLED   (only while nobody has filed)
```

1. **`create_round`** — the treasurer deposits the pool and fixes the rubric.
   The pool locks immediately. One round per wallet per hour.
2. **`submit_proposal`** — a builder files and stakes `0.1 GEN`. One proposal
   per wallet per round.
3. **`evaluate`** — permissionless, after the deadline. **One consensus round
   per proposal**, so five proposals mean five independent readings and one
   proposal the network cannot agree on does not block the other four.
4. **`finalize`** — permissionless, once every proposal has a score or has been
   skipped. Ranks, allocates, and moves nothing that a model decided.
5. **`contest`** — the author of a rejected proposal appeals with new evidence
   for a `0.2 GEN` stake, inside the appeal window.
6. **`claim_award` / `claim_remainder` / `claim_payout`** — pull payments.
   After the last one, the round's locked balance is **exactly zero**.

---

## Scoring

Every score is an **integer bucket from 0 to 7**. Every total is an integer
hundredth of a bucket from 0 to 700, displayed as `4.25 / 7.00`. There is not one
floating-point number in the contract.

### The bracket: a score is bounded by evidence before a model is asked

Before any model call, the contract measures the proposal against a published
vocabulary — figures, dates and milestones, budget language, track record, named
beneficiaries, stated risks, filler, attempts to instruct the scorer — and
against how much of each criterion's own words the proposal actually touches.
Those two numbers produce a **bracket** per criterion: a low and a high, never
more than four buckets wide. The model chooses inside the bracket and nowhere
else.

> A criterion a proposal never addresses **cannot be scored above 2 out of 7** —
> not by a validator, not by the leader of a round, and not by any model.
> `_coherent` refuses an out-of-bracket score by arithmetic, before this node
> spends an inference on the payload.

Both halves are published: `get_config` returns the whole vocabulary and every
ladder, and `preview_proposal` runs a draft through the same code with no
transaction and no model so a proposer can see their own ceiling before staking
anything.

### The vector, and what the validators compare

Each node returns:

| field | chosen by | compared |
|---|---|---|
| one bucket per criterion (3–5) | the model, inside its bracket | ± 1 bucket |
| `quality_bucket` | the model, inside its bracket | ± 1 bucket |
| `completeness_bucket` | arithmetic | exactly |
| `coverage_csv`, `bracket_csv`, `signals_csv`, `depth` | arithmetic | exactly |
| `qualifies` (clears the bar) | derived | **exactly** |
| `final_score` | derived | drift ≤ 70 |
| `facts_hash` (the text each node read) | arithmetic | exactly |
| `model_called` | arithmetic | exactly |

A leader may shade a criterion by a bucket. **A leader may not move a proposal
across the funding bar.** When two validators' readings fall on opposite sides
of it, nothing is written and anybody may run the evaluation again.

The drift bound of 70 is derived rather than chosen: one bucket on every
criterion is 80 points of weighted total and one bucket of quality is 10, so the
per-dimension rule alone permits 90. 70 refuses a vector shifted the same way on
every dimension at once, which is what a leader shading systematically looks
like and is not what two honest readers disagreeing looks like.

### The total

```
weighted total = 80% × Σ(criterion score × its weight)
               + 10% × quality
               + 10% × completeness          — all in integer hundredths
```

---

## Settlement

```
1. Rank by score; ties to the earlier filing.
2. Everything at or above the bar QUALIFIES — deposit back, seat or no seat.
3. The top N qualifiers WIN.
4. A winner's share is the pool in proportion to its score among the winners,
   CAPPED at what it asked for.
5. Everything not awarded is the remainder.

   sum(awards) + remainder == pool,  exactly,  always
```

Integer division floors every share, so the dust falls into the remainder rather
than into a rounding error nobody owns. Asking for less than your share does not
enrich the other winners; it enlarges the remainder, which is the treasurer's.

**Where the money can be**, published on every read:

```
balance_wei == locked_wei + payable_wei
```

Everything held is either locked in a live round or already somebody's to claim.
There is no third bucket and **no protocol revenue**: a forfeited deposit goes to
the pool, which the treasurer reclaims, never to the contract owner — who has no
withdraw method at all, not a gated one, none.

---

## The appeal

A rejected proposer may appeal once, inside the round's appeal window, for a
`0.2 GEN` stake plus up to 2000 characters of new evidence.

The proposal is read again against the same rubric with the new text appended.
That changes the signals, which changes the brackets, which raises the ceiling
the scorers may reach. **New evidence buys room, not a score** — an appeal made
of adjectives earns a lower bracket than the original filing, because filler is
subtracted from depth.

> **Nothing is ever clawed back.** A successful appeal is paid strictly out of
> what the ranking did not allocate. If that cannot cover the full share, the
> appeal is partially funded and the shortfall is **named** rather than
> swallowed. No other proposal's award changes by one wei.

Win: both stakes come back. Lose: the appeal stake goes to the pool — to the
treasurer, who paid for a second reading they did not ask for. Network could not
hear it: the stake is returned in full and the appeal can be filed again.

---

## The twelve rules

Every one is a past rejection written down so that it cannot happen again, and
every one is asserted as syntax by `tools/audit.py` and by `test/test_logic.py`.

1. **Consensus binds every stored value**, not just the verdict.
2. **No public write ever raises.** Zero `raise` statements in `GrantJudge.py`.
3. **No counter moves before a path that can still refuse** (except the two
   statistics that are *about* refusals and attempts).
4. **The stakes and the rubric are snapshotted** onto the round. No setter.
5. **A terminal round is frozen**, and a proposal's score is frozen the moment
   it is written. The one permitted rescoring is an appeal the author pays for.
6. **The owner cannot freeze user money.** Pause stops new rounds and new
   proposals; everything else keeps working, `settle_stalled` included.
7. **Value the contract accepts is value somebody can get back out.**
8. **Conservative when the reading is not there** — INCONCLUSIVE, not a guess.
9. **A score is bounded by evidence before a model is ever asked.**
10. **The comparison is tight where money moves and only there.**
11. **Nothing the leader sends is stored without being recomputed.**
12. **The text is untrusted and is treated as such.** The prompt's warning comes
    *after* the data; and more importantly, an injection attempt is
    mechanically filler and lowers the ceiling it was trying to raise.

---

## Contract API

### Writes

| method | who | what |
|---|---|---|
| `create_round(name, description, criteria_json, max_proposals, max_winners, min_score_threshold, deadline_seconds)` *payable* | anyone | Opens a round. Value sent is the pool (≥ 1 GEN). Criteria weights must sum to exactly 10000 bps. One per wallet per hour. |
| `submit_proposal(round_id, description, requested_amount_wei, timeline, team)` *payable* | anyone | Files a proposal and stakes the round's deposit. One per wallet per round. |
| `evaluate(round_id, proposal_id)` | anyone | Opens one consensus round for one proposal. Moves no money. |
| `finalize(round_id)` | anyone | Ranks and allocates. Refuses while any proposal is unresolved. |
| `contest(round_id, proposal_id, additional_evidence)` *payable* | the author | Appeals a rejection with new evidence. Once per proposal. |
| `cancel_round(round_id)` | the treasurer | Closes an empty round and returns the pool. Refuses once anyone has filed. |
| `claim_award(round_id, proposal_id)` | the author | Pays the award, the returned deposit and a returned appeal stake in one transfer. |
| `claim_remainder(round_id)` | the treasurer | Pays what the ranking did not allocate, after the appeal window. Moves the round to FINALIZED. |
| `settle_stalled(round_id, proposal_id)` | anyone | Marks a proposal the network could not score as SKIPPED and returns its deposit. **Works while paused.** |
| `claim_payout()` | anyone | Sweeps refunds, a cancelled pool and returned stakes. |
| `set_paused(paused)` | the owner | Stops *new* rounds and *new* proposals. Nothing else. |
| `transfer_ownership(new_owner)` | the owner | Hands over the pause switch. There is nothing else to hand over. |

### Views

| method | returns |
|---|---|
| `get_round(round_id)` | The round in full: rubric with weights, pool, deadline, snapshotted stakes, counts, settlement, and a `phase` that moves with the clock where `status` moves only with a write. |
| `get_proposal(round_id, proposal_id)` | One proposal with its per-criterion breakdown and every field the validators compared. The pair is cross-checked. |
| `get_proposals(round_id)` | Every proposal filed to a round, in submission order. |
| `get_criteria(round_id)` | The rubric alone, with its hash. |
| `get_rankings(round_id)` | The table, **recomputed from storage** — a live preview before finalisation and the booked result after. |
| `get_rounds(offset, count)` | A bounded window over the register, newest first. |
| `get_open_rounds()` | Rounds still taking proposals, soonest deadline first. Filters on the derived phase, so a closed round never offers a submit button. |
| `get_rounds_by_treasurer(address)` | Every round a wallet opened. |
| `get_proposals_by_author(address)` | Every proposal a wallet filed, with what it is owed. |
| `get_stats()` | The books, including `ledger_balanced` and the gap between the contract's own accounting and its real chain balance. |
| `get_config()` | Every number this contract judges by: weights, tolerances, bounds, the whole signal vocabulary and every ladder. |
| `verify_evaluation(round_id, proposal_id)` | **Re-derives the whole evaluation from storage** and reports every field beside what was stored. No caller input, no model. |
| `preview_proposal(round_id, description, timeline, team)` | The brackets a draft would earn, with no transaction and no model. |
| `payout_of(address)` | What a wallet can sweep with `claim_payout`. |
| `is_funded(round_id, proposal_id)` | The composability primitive. True only for a proposal a finalised round actually awarded money to. |
| `get_award(round_id, proposal_id)` | What a proposal was awarded, degrading to a reason rather than refusing. |
| `check_funded(round_id, proposal_id, min_score, max_age_seconds)` | The integration gate as a verdict: `{ok, reason, …}` against the caller's own floor and staleness limit. |

---

## Composability — `GrantConsumer`

A DAO milestone registry that only recognises a grant GrantJudge actually
awarded. It stores no scores, has no scoring code, and **holds no money at all**:

- `custody: false`, declared and true by construction
- **zero payable methods**
- **no `emit_transfer` anywhere in the file**

There are two ways to read a grant oracle and only one is safe to act on:

```python
preview_grant(round_id, proposal_id)   # non-reverting — right for a UI
register_grant(round_id, proposal_id)  # REVERTS — right for anything at risk
```

The reverting form lives in the consumer precisely *because* the consumer has no
custody. `GrantJudge` contains zero `raise` statements: it holds money, and a
revert in a method that received value strands that value with no record to
refund it from. Both halves of that argument are the same argument.

---

## Repository

```
contracts/GrantJudge.py      the contract — every rule documented where it lives
contracts/GrantConsumer.py   the composability example, custody: false
contracts/NOTES.md           design notes and the hazards that shaped them
test/test_logic.py           657 offline tests — no chain, no network, no model
test/harness.mjs             shared integration helpers
test/deploy.mjs              deploys both instances and the consumer
test/seed.mjs                drives the whole lifecycle on chain and asserts it
test/topup.mjs               repairs a run that lost a write to the network
test/fixtures/proposals.json the seeded proposal texts
tools/audit.py               the cross-file audit and the rejection ledger
tools/evidence.py            renders docs/EVIDENCE.md from what the seed read back
frontend/                    the Next.js app

docs/PROBE.md                what was measured against the live network
docs/EVIDENCE.md             what the seed run actually did, generated not typed
docs/ARTICLE.md              the write-up
docs/seed-run.log            the raw log of the run EVIDENCE.md describes
docs/seed-evidence.json      the machine-readable form
```

### Running it

```bash
python3 test/test_logic.py        # the offline suite — stdlib only
python3 tools/audit.py            # the repository audit

cd test && npm install
node accounts.mjs                 # a stable pool of signing keys
node deploy.mjs --both            # both instances + the consumer
node seed.mjs --canonical         # the whole lifecycle, on chain, asserted

cd ../frontend && npm install
cp .env.example .env.local        # fill in the deployed addresses
npm run dev
```

---

## Verifying the deployed bytes

`deployments.json` records the checksum of the source that was deployed, so
"the source in this repository is the source on chain" is something you can
check rather than something this README asserts:

```bash
shasum -a 256 contracts/GrantJudge.py contracts/GrantConsumer.py
python3 -c "import json;d=json.load(open('deployments.json'))['deployments']['studiodev'];\
print({k:v.get('source_sha256') for k,v in d.items() if isinstance(v,dict)})"
```

`tools/audit.py` re-computes both on every run, which means a one-word comment
edit in the contract fails the audit until the contract is redeployed. That
strictness is the whole value of the field.

## Two deployed instances, same source

The **canonical** instance enforces the brief: a 24-hour appeal window, a
48-hour stall window, one round per wallet per hour. That is the right rule and
it is completely un-watchable — the earliest a treasurer could reclaim a
remainder on it is a day from now.

A settlement path nobody has watched execute is a settlement path nobody has
tested, so a **second instance of the same source** is deployed with the windows
in minutes. Every rule, every gate and every line of consensus logic is
identical; only the clocks are faster. That is what `seed.mjs` drives end to end,
what `docs/EVIDENCE.md` records, and what the app reads.

---

## A note on Studio Dev and payouts

`_pay` posts its internal transfer with `on="finalized"`, deliberately: a payout
applied at acceptance would already have happened if the transaction that
authorised it were later rolled back.

**Studio Dev queues that message and does not execute it.** This has been
measured independently by three previous projects, three ways each: the message
is posted with the right recipient and the right value, the parent transaction
reaches FINALIZED, and no balance moves. It is a property of the network, not of
this contract, and it is **reported rather than hidden** — `get_stats` publishes
the contract's real chain balance beside its own books and names the gap
`undelivered_wei`. On a network that delivers, that number is zero.

---

## Licence

MIT.
