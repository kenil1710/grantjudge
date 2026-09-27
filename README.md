# GrantJudge — DAO grant evaluation by open criteria

[![checks](https://github.com/kenil1710/grantjudge/actions/workflows/checks.yml/badge.svg)](https://github.com/kenil1710/grantjudge/actions/workflows/checks.yml)

**Fund what matters. Let consensus decide.**

A DAO treasurer opens a round: they deposit a pool of GEN and write three to
five criteria in plain English, each with a weight. Builders submit proposals
and stake a small spam deposit. After the deadline, anyone may trigger an
evaluation, and GenLayer's validators independently read each proposal against
each criterion and score it. The ranking, the allocation and every wei of the
settlement are then computed by ordinary deterministic code from the scores the
validators agreed on.

**Live app:** <https://grantjudge-app.vercel.app>

**On chain:** GenLayer Studio Devnet, chain 61997. Addresses and source
checksums in [`deployments.json`](deployments.json).

| | |
|---|---|
| **The idea** | [Where the line is](#where-the-line-is) · [The two people this is for](#the-two-people-this-is-for) |
| **The mechanism** | [Scoring](#scoring) · [Settlement](#settlement) · [The appeal](#the-appeal) · [The twelve rules](#the-twelve-rules) |
| **The milestone build** | [Pools, approvals, milestones, reputation, templates…](#the-milestone-build) · [what the seed shows](#what-the-milestone-seed-demonstrates) |
| **The proof** | [docs/WORKED-EXAMPLE.md](docs/WORKED-EXAMPLE.md) · [docs/EVIDENCE.md](docs/EVIDENCE.md) · [docs/PROBE.md](docs/PROBE.md) |
| **The code** | [Contract API](#contract-api) · [Composability](#composability--grantconsumer) · [contracts/NOTES.md](contracts/NOTES.md) |
| **Running it** | [Repository](#repository) · `bash tools/verify.sh` |

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
   `claim_remainder_fallback` is the same remainder claim with the transfer
   left to `claim_payout`, for networks where the one-transaction form cannot
   be fee-estimated — see [below](#and-one-thing-the-estimator-gets-wrong).

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
offering more than four values. The model chooses inside the bracket and nowhere
else.

> A criterion a proposal never addresses **cannot be scored above 2 out of 7** —
> not by a validator, not by the leader of a round, and not by any model.
> `_coherent` refuses an out-of-bracket score by arithmetic, before this node
> spends an inference on the payload.

Both halves are published: `get_config` returns the whole vocabulary and every
ladder, and `preview_proposal` runs a draft through the same code with no
transaction and no model so a proposer can see their own ceiling before staking
anything.

**[docs/WORKED-EXAMPLE.md](docs/WORKED-EXAMPLE.md)** walks three real filings —
a strong one, a thin one and one made of adjectives — from text to signals to
brackets to the weighted total, with every number computed by importing the
contract rather than typed in. It is the shortest path to understanding the
whole model, including what an appeal does and does not buy.

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

## The milestone build

Ten features on top of the original round, and **every one of them is
optional**. A round opened with `create_round` sets none of them and settles
byte for byte as it always did: the original 682 offline tests still run
against plain rounds and still pass, and the eight seeded outcomes were re-run
on the new deployment. What follows is where each feature keeps the twelve
rules — which is the part that was hard.

**GenLayer does one new thing in this build:** it reads a *proof of delivery*
against a *milestone as the treasurer wrote it*, and says whether the first
demonstrates the second. **Deterministic code does everything else:** the
pools, reserves and round sequencing, the verbatim gate, the approval
majority and its lapse, the tranche arithmetic, every reputation figure, every
analytics figure, and the remainder route.

| # | feature | how it keeps the rules |
|---|---|---|
| 1 | **Multi-round pools** — `create_pool`, `top_up_pool`, `create_next_round`, `withdraw_reserve`, `get_pool_history` | One rubric for life, copied onto each round at creation (rule 4). The reserve is locked money like a pool, is promised to nobody, and `withdraw_reserve` returns it — so rule 7 holds for pools. A filing the pool already read is refused **before** the stake is taken (the novelty gate across rounds, `_text_key`). History totals are summed from the rounds on every read, never kept in a counter that could drift. |
| 2 | **Delegated approval** — `approve_finalization`, `reject_finalization`, `get_approvals` | A strict majority (1/1, 2/2, 2/3). Approvers sign off on a ranking that is already determined — every proposal must be scored first — and cannot touch a criterion, a score or a seat. The signature that makes the majority ranks the round in the same transaction. **Rule 6 applied to people the treasurer names:** if they never sign, the requirement lapses after the pool's approval window and `finalize` is permissionless again, so an approver's silence cannot freeze anybody's deposit. |
| 3 | **Milestone release** — `submit_milestone_proof`, `reclaim_lapsed_milestones`, `get_milestone_status` | The award is fixed at ranking and **held**; each proof is judged by `_consensus` with the same `_coherent` / `_agrees` gates and the same bracket system (the milestone becomes a one-line rubric, the proof becomes the filing). The last tranche takes what the floors left, so tranches sum to the award exactly. **The proof URL is a citation, never fetched** — see below. A tranche never delivered returns to the treasurer after the delivery window (rule 7). Released tranches are never clawed back. |
| 4 | **Proposer reputation** — `get_proposer_stats`, pool option `min_reputation` | **Computed from the wallet's own proposals on every read.** There is no reputation field in storage, so there is no setter and nothing to forge. A floor of zero admits a wallet the chain has never seen. |
| 5 | **Criteria templates** — `create_template`, `get_templates`, `get_template`, `create_round_from_template` | Validated exactly as a rubric is; stored in the same flat criteria array; immutable (only `create_template` assigns a template field — walked as syntax offline). A template door may open the next round of an existing pool only if the pool's rubric **is** the template's, hash for hash. |
| 6 | **Round analytics** — `get_round_analytics` | Per-criterion mean, min, max and standard deviation, the band distribution, the funding rate and the appeal success rate — a pure function (`_analytics`) over stored scores, in integer hundredths and basis points, with no float and no consensus. |
| 7 | **Batch evaluation** — `evaluate_all` | Up to three proposals per call, **each its own consensus round** and its own stored vector. A batch whose validators disagree on one proposal writes nothing for any of them — the stated cost of batching inside one transaction; an unreachable scorer only makes that one INCONCLUSIVE. It does not queue child transactions, because a contract message to itself is funded from the same message-fee pool whose estimate is broken on Studio Dev. |
| 8 | **Proposal amendments** — `amend_proposal` | One, by the author, before the deadline. Stored beside the filing, which is never rewritten; shown to the validators in its own delimited block; part of both hashes. Reduced to its **novel** sentences first (`_novel`, the appeal's guard), so repeating the filing cannot raise its depth and move both ends of every bracket. |
| 9 | **Round extensions** — `extend_deadline` | Treasurer only, while the round is open and not full, at most twice, at most seven days each. Nothing else moves; `config_hash` keeps committing to `original_deadline`, which is published beside the new one. |
| 10 | **Smart remainder handling** — `get_remainder_route` + the client's `takeRemainder` | One click and the remainder arrives. See below for why this lives in the client. |

### Two places this build does not do what the brief literally said, and why

**The milestone proof URL is not fetched.** The original brief's first rule
was *no URL fetching — all evidence is text on chain, no mutable content, no
archive issues*, and that rule still applies. A page behind a link can serve
two validators two different things in the same minute, which puts a third
party's server on the consensus axis; and it can be gone before anybody audits
the verdict. So `submit_milestone_proof(round_id, proposal_id, milestone_idx,
proof_url, proof_text)` takes the URL as a **citation** — stored, shown to the
validators, committed to in the content hash — and judges `proof_text`, which
stays on chain beside the verdict.

**The remainder is not rerouted by the contract.** `claim_remainder` fails on
Studio Dev in fee *estimation* — before the contract runs — and the
transaction that follows is rolled back whole ([`docs/PROBE.md` §4b](docs/PROBE.md)).
No contract code can observe that failure, let alone route around it. So the
routing lives where the failure is visible: `get_remainder_route` answers from
storage which single step is next (`book` → `claim_remainder_fallback`,
`sweep` → `claim_payout`, `wait`, `done`), and the app's one button and
`takeRemainder` in `test/harness.mjs` follow it to the end. One click, two
fee-estimable transactions, and `claim_remainder` is never tried on a network
where it is the door that fails.

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
| `claim_remainder_fallback(round_id)` | the treasurer | The same claim, the same gate, the same books — but it posts no transfer, crediting the remainder for `claim_payout` to sweep. Two fee-estimable transactions in place of one that is not. |
| `settle_stalled(round_id, proposal_id)` | anyone | Marks a proposal the network could not score as SKIPPED and returns its deposit. **Works while paused.** |
| `claim_payout()` | anyone | Sweeps refunds, a cancelled pool and returned stakes. |
| `create_pool(name, description, criteria_json, max_proposals, max_winners, min_score_threshold, deadline_seconds, options_json)` *payable* | anyone | Opens a multi-round pool and its first round. `options_json` (all optional): `co_approvers`, `approval_window_s`, `milestones`, `milestone_window_s`, `min_reputation`. |
| `top_up_pool(pool_id)` *payable* | the treasurer | Adds to the pool's reserve — never to a live round. |
| `create_next_round(pool_id)` *payable* | the treasurer | Opens the next round under the same rubric from the whole reserve (plus any value sent), once the latest round is ranked. |
| `withdraw_reserve(pool_id)` | the treasurer | Credits the unspent reserve back for `claim_payout`. |
| `create_template(name, criteria_json)` | anyone | Saves an immutable, public rubric. |
| `create_round_from_template(pool_id, template_id, name, description, max_proposals, max_winners, min_score_threshold, deadline_seconds, options_json)` *payable* | anyone / the treasurer | `pool_id` 0 opens a new pool with the template's rubric; a pool whose rubric is the template's opens its next round. |
| `approve_finalization(round_id)` / `reject_finalization(round_id)` | a co-approver | Signs off on (or objects to) a fully scored round. The majority-making signature ranks it. Bounded by the approval window. |
| `submit_milestone_proof(round_id, proposal_id, milestone_idx, proof_url, proof_text)` | the author | One consensus round over a proof of delivery; a pass releases that milestone's tranche into `claim_award`. `milestone_idx` counts from 0; in order. |
| `reclaim_lapsed_milestones(round_id, proposal_id)` | anyone | After the delivery window, or three failed proofs, returns the undelivered tranches to the treasurer. |
| `evaluate_all(round_id)` | anyone | Up to three unscored proposals, one consensus round each, one call. Returns `evaluated_count` and `remaining_count`. |
| `amend_proposal(round_id, proposal_id, amendment_text)` | the author | One amendment, ≤ 1000 chars, before the deadline, stored beside the filing. |
| `extend_deadline(round_id, additional_seconds)` | the treasurer | ≤ 7 days, ≤ 2 times, only while open and not full. |
| `set_paused(paused)` | the owner | Stops *new* rounds, *new* pools and *new* proposals. Nothing else. |
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
| `get_pool(pool_id)` / `get_pools(offset, count)` | A pool's rubric, options, reserve and round pointers. |
| `get_pool_history(pool_id)` | Every round of a pool with its stats, and `total_rounds`, `total_proposals`, `total_funded`, `total_distributed` summed from them. |
| `get_approvals(round_id)` | Who approved, who objected, who has not voted, and when the requirement lapses. |
| `get_milestone_status(round_id, proposal_id)` | Each milestone's tranche, status, attempts, score and reason, and what is held, released and lapsed. |
| `get_proposer_stats(address)` | `rounds_entered`, `proposals_funded`, `total_awarded`, `average_score`, `contests_won`, `contests_lost` — derived on read. |
| `get_templates()` / `get_template(template_id)` | Saved rubrics, and the pools opened from one. |
| `get_round_analytics(round_id)` | Per-criterion mean/min/max/stddev, the band distribution, funding rate and appeal success — from stored scores. |
| `get_remainder_route(round_id, address)` | The single next step to get a remainder out: `book`, `sweep`, `wait` or `done`. |

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
test/test_logic.py           915 offline tests — no chain, no network, no model
test/harness.mjs             shared integration helpers
test/deploy.mjs              deploys both instances and the consumer
test/seed.mjs                drives the whole lifecycle on chain and asserts it
test/seed_milestone.mjs      drives pools, approvals, milestones, reputation, templates on chain
test/collect.mjs             derives docs/seed-evidence.json by READING the chain
test/verify_onchain.mjs      reads the deployed source back and diffs it against the repo
test/topup.mjs               repairs a run that lost a write to the network
test/settle.mjs              drives one round to completion from wherever it is
test/appeal.mjs              files an appeal, as the author, from a fixture's evidence
test/remainder_fallback.mjs  proves the treasurer can get the remainder out, on chain
test/cleanup.mjs             cancels an empty round left by an interrupted run
test/fixtures/proposals.json the seeded proposal texts
tools/audit.py               the cross-file audit and the rejection ledger
tools/evidence.py            renders docs/EVIDENCE.md from what the seed read back
tools/worked_example.py      renders docs/WORKED-EXAMPLE.md from the contract itself
tools/verify.sh              the short loop: everything that costs no transaction
tools/finish.sh              settle what is open, read the chain, render the evidence
.github/workflows/checks.yml the same short loop, on every push
frontend/                    the Next.js app

docs/WORKED-EXAMPLE.md       three filings, scored, with every number computed
docs/PROBE.md                what was measured against the live network
docs/EVIDENCE.md             what the seed run actually did, generated not typed
docs/ARTICLE.md              the write-up
docs/seed-run.log            the raw log of the seed run, failures and all
docs/seed-evidence.json      the machine-readable form
docs/milestone-run.log       the raw log of the milestone seed
docs/milestone-evidence.json what the milestone seed read back off the chain
```

### Running it

```bash
bash tools/verify.sh              # everything that costs no transaction

python3 test/test_logic.py        # the offline suite — stdlib only
python3 tools/audit.py            # the repository audit

cd test && npm install
node accounts.mjs                 # a stable pool of signing keys
node deploy.mjs --both            # both instances + the consumer
node seed.mjs --canonical         # the whole lifecycle, on chain, asserted
node seed_milestone.mjs           # the milestone build, on its own wallets

cd .. && python3 tools/evidence.py   # renders docs/EVIDENCE.md from that run

cd frontend && npm install
cp .env.example .env.local        # fill in the deployed addresses
npm run dev
```

---

## What the seed run demonstrates

`node test/seed.mjs --canonical` does not just write — it reads every number
back off the chain and asserts it. In one run:

| | |
|---|---|
| **FUNDED** | a strong proposal wins and is paid |
| **PARTIALLY FUNDED** | two winners split a pool in proportion to their scores, to the wei |
| **QUALIFIED** | above the bar but out of seats: deposit back, no award |
| **REJECTED** | below the bar: deposit forfeited *to the pool*, not to the contract |
| **CONTESTED → WON** | rejected, appealed with real evidence, re-scored, funded out of the remainder |
| **CONTESTED → LOST** | appealed with adjectives, re-scored, still below the bar |
| **CANCELLED** | a treasurer closes an empty round and takes the pool back |
| **STALLED → SKIPPED** | a proposal nobody could score, settled by a stranger, deposit returned |
| **DRAINED** | after the last claim, the round's locked balance is exactly zero |

The result is `docs/EVIDENCE.md`, which is **generated** rather than typed:

```bash
node test/collect.mjs       # read the chain, derive the checks, write the JSON
python3 tools/evidence.py   # render docs/EVIDENCE.md from it
```

`collect.mjs` does not know or care what produced the state — it reads every
round, every proposal, every ranking, the books, the consumer's registry and a
fresh `verify_evaluation` for every scored proposal, and derives the checks from
what it finds. That is the honest shape for an evidence document: the chain is
the record, and this is a reader of it. An evidence document whose numbers were
copied by a person keeps looking healthy after the contract stops agreeing with
it.

> **This deployment's runs, and the one failure in them.** `docs/seed-run.log`
> is the original eight-outcome seed on the new bytes: **every check passed**,
> remainders taken by the two-step path. `docs/EVIDENCE.md` is `collect.mjs`
> reading the chain afterwards — **30/30**, now including the milestone
> build's rounds.
>
> `docs/milestone-run.log` records **one FAIL**: pool A's second round (round
> 10) "did not drain", with 2.1 GEN still locked. The contract was right — that
> was the funded proposer's award and deposit, unclaimed, because the seed
> matched wallets to proposals by comparing a lowercased address with the
> checksummed one the chain returns, found no wallet, and skipped the claim.
> The seed is fixed (both sides lowercased), the proposer claimed, round 10
> reached exactly zero, and EVIDENCE.md is the read taken after that. The same
> log also says "batch did not settle" three times: each of those
> `evaluate_all` calls **did** settle — all its proposals share one
> `evaluated_at` and `batches` counts them — but the SDK could not render the
> nested `results` list, and the first version of the script took an
> unreadable return value for a failure. Neither log is rewritten to match
> what came after — a log edited to agree with a later outcome is not a log.

## What the milestone seed demonstrates

`node test/seed_milestone.mjs` runs on wallets of its own, beside `seed.mjs`,
on the demo instance — and like it, reads every figure back and checks it.

| | |
|---|---|
| **POOL A · Ecosystem Growth v2** | round 1 evaluated with `evaluate_all` and ranked; an amendment read with its filing and verified; `top_up_pool` + `create_next_round` open round 2 under the identical rubric hash; a round-1 filing resubmitted verbatim is **refused**; `get_pool_history` shows both rounds |
| **POOL B · Security Audit Fund** | two co-approvers: `finalize` is refused, the first approval is not enough, the second **ranks the round in the same transaction** |
| **POOL C · Dev Tools Grant** | a 60 / 40 schedule: the whole award held at ranking, each proof judged by consensus and its tranche released and claimed; the tranches sum to the award exactly |
| **POOL D · Community Fund** | `min_reputation` 1: a proposer pool A funded is admitted, a wallet with no record is refused and refunded |
| **POOL E · from a template** | "Standard Ecosystem" saved with pool A's exact rubric hash, a pool opened from it, its deadline extended once |
| **ANALYTICS** | `get_round_analytics` on the busiest round |
| **REMAINDERS** | every one taken by `takeRemainder` — one call per round, each round drained to exactly zero |

Its log and evidence are in [`docs/milestone-run.log`](docs/milestone-run.log)
and [`docs/milestone-evidence.json`](docs/milestone-evidence.json).

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

That check proves the *file* has not moved since the deploy recorded its digest.
To prove the **chain** holds those bytes, read the source back off it:

```bash
node test/verify_onchain.mjs
#   ok   GrantJudge      chain 310570 bytes 9fc100c70de9f838… | identical true
#   ok   GrantJudgeDemo  chain 310570 bytes 9fc100c70de9f838… | identical true
#   ok   GrantConsumer   chain  19666 bytes c5d33005268a26c7… | identical true
```

`eth_getCode` answers `0x` for a GenVM contract; the source lives behind
`gen_getContractCode`, base64-encoded. This is part of `tools/verify.sh`.

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

Confirmed again on this deployment, from the outside. At the end of the seed run
the contract's real balance read **22.6 GEN** while its own books said **4.7** —
and `balance = locked + payable` held exactly. The 17.9 GEN difference is every
payout the network queued and declined to execute. The books are right about who
owns what; the chain is right about where the wei is; and the contract publishes
both rather than choosing one.

### And one thing the estimator gets wrong

`claim_remainder` is the only method in this contract that both reads the block
clock and posts a transfer — and it is the only one whose fee estimate is wrong
on Studio Dev, because the fee **simulator runs on a clock roughly 664 days
stale** and therefore simulates the call on the wrong side of its own appeal
window. It refuses in simulation, the estimator budgets nothing for a message
the real execution does post, and the transaction reverts with
`out_of message_fee total`.

The money was never lost — it stays locked against its round and `get_round`
publishes it — but *"you can still see it"* is not the same as *"you can still
have it"*, and a treasurer who cannot withdraw their own remainder is a
treasurer with trapped value. So the contract now carries a second door.

**`claim_remainder_fallback(round_id)`** breaks the combination instead of
trying to out-budget it. A contract cannot choose its own fee allocation — that
is carried by the transaction, and hand-supplying one was measured to fail
structurally, at 1× through 5000× the estimate alike. What a contract *can* do
is not post the transfer. The fallback reads the clock, applies the identical
gate and books the remainder to the treasurer's claimable balance; then
`claim_payout()`, which reads no clock, posts the transfer and estimates
correctly. Two transactions, each of them fee-estimable, in place of one that is
not.

It is deliberately **not** a second way to be paid. Both paths run through the
same `_remainder_gate` and the same `_book_remainder`, so the round reaches
FINALIZED exactly once and the remainder is credited exactly once whichever door
is used — asserted in the offline suite by driving the pool to zero through the
fallback and by taking each door after the other and requiring the second
refused.

The measurement, the exact correlation and the five different errors that
hand-budgeting produced are in [`docs/PROBE.md` §4b](docs/PROBE.md).
`tools/audit.py` flags the clock-plus-transfer combination so the next contract
meets it at build time — and it now resolves that combination **through the call
graph** rather than off the method's own bytes, because the first version of
this fix moved the clock read into a helper and silently switched the warning
off.

---

## Licence

MIT.
