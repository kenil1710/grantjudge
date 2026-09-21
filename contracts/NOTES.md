# GrantJudge — design notes

The contract documents its rules where they live. This file is for the
*reasoning* that does not belong in a docstring: the choices that were made
against an alternative, the things that were tried and were wrong, and the
hazards a reader will otherwise re-discover.

---

## 1. Why a bracket rather than a free score

The obvious design is: show the model the proposal and the criteria, ask for a
number, store the number. It fails for two independent reasons and the second
one is fatal.

**It does not settle.** Five validators each asked for six independent integers
will not agree on all six. A protocol whose rounds mostly go UNDETERMINED is a
protocol that does not work, whatever its properties on paper.

**It puts the ceiling in the model's hands.** If the model may return any
number, then whatever the leader returns is a number some model somewhere could
have returned, and the only thing standing between a proposal and a 7 is the
hope that every validator's model also declined to give it one.

The bracket fixes both by moving the ceiling into code. The contract measures
the proposal — figures, dates, costing, track record, named beneficiaries,
stated risks, filler, injection attempts — and measures how much of each
criterion's own words the proposal touches. Those two numbers produce a low and
a high per criterion. The model chooses inside, and `_coherent` refuses an
out-of-bracket score *by arithmetic, before spending an inference*.

The consequence worth stating plainly: **a criterion a proposal never addresses
caps at 2 out of 7**, and there is no actor in this system who can lift it.

### The coverage measure was wrong first time

Coverage was originally a PERCENTAGE of the criterion's tokens that appeared in
the proposal. That punished a treasurer for explaining themselves: the same
proposal scored lower against `Community impact — who benefits, how many of
them, and how directly` than against `Community impact`, because the longer
criterion had more tokens to miss. The second criterion is the first one with
the explanation removed; a measure that prefers the shorter one is measuring the
wrong thing.

It is now a COUNT, with the criterion's *name* counting double, because the name
is the subject and the description is the gloss. `_coverage` carries this note;
`TestCoverage.test_a_longer_description_does_not_punish_the_proposal` pins it.

---

## 2. Tolerance, and where it is not allowed

`_agrees` compares every dimension with a tolerance of exactly one bucket. Two
honest readers of the same proposal may differ by one; that is what it means for
a judgement to be a judgement, and a protocol that demanded identical opinions
from independent reviewers would not settle a single round.

But the tolerance is confined to the INPUTS. Every deterministic field is exact,
and the one derived field the money turns on — `qualifies`, whether the proposal
cleared the bar — is exact. So:

- a leader may shade a criterion by a bucket;
- a leader may **not** move a proposal across the funding bar;
- a validator whose reading puts the proposal on the other side of the bar votes
  no, the round settles nothing, and anybody may call `evaluate` again.

This is a deliberate difference from CourtRoom, which used exact equality
everywhere. CourtRoom asks for ONE index into a bounded list of at most nine
options. This asks for up to six independent buckets. Exactness there is not a
stricter version of the same rule; it is a different rule, and it does not
settle.

### The band was compared, and that was a mistake

`band` (the weighted total divided by 100) was originally on the compared axis.
It made settlement depend on where a score happened to sit relative to a round
number: two readings of 499 and 501 differ by two points and were refused, while
401 and 499 differ by ninety-eight and were accepted. That is not a rule about
disagreement, it is a rule about arithmetic coincidence.

The band is now checked in `_coherent` — against the leader's *own* vector, so a
forged band is still impossible — and left out of `_agrees`, where only an
accidental one was ever being caught. The weighted total's drift is bounded
separately and the band is a pure function of it.

### Where 70 comes from

`MAX_TOTAL_DRIFT` is not a feel. One bucket on every criterion is
`1 × 10000 bps / 100 = 100` points of criteria score, weighted at 80% = 80, plus
one bucket of quality at 10% = 10. So the per-dimension rule alone permits a
maximum drift of 90, and a cap of 90 would never fire. 70 refuses a vector
shifted the same way on every dimension at once — which is what a leader shading
systematically looks like, and is not what two honest readers look like.

---

## 3. Why `quality` is pinned shut at zero depth

`_quality_bracket` returns `(0, 0)` when the penalised depth is nothing. A
filing with no figure, no date, no costing, no track record, no named
beneficiary and no stated risk — or with enough filler to cancel out whatever it
had — leaves nothing to have an opinion ABOUT.

Pinning it is also what makes the no-model path reachable at all. With a
one-wide quality bracket at every depth, `model_called` was always true and the
"the evidence left no room" branch was dead code. Now such a proposal is scored
entirely by arithmetic, in one transaction, with no inference bought and no round
to disagree over — and `model_called` says so, on the compared axis, where a
leader cannot claim to have consulted a model it did not.

---

## 4. The appeal, and what it is allowed to do

An appeal re-reads the proposal with the new evidence appended. That changes the
signals, which changes the brackets, which raises the ceiling. **New evidence
buys room, not a score.** An appeal made of adjectives earns a LOWER bracket than
the original filing, because filler is subtracted from depth — which is the
property that makes the appeal path safe to leave open to everybody who was
rejected.

Three consequences that took some getting right:

**Nothing is clawed back.** An award already made is somebody's money, and a
protocol that could reverse one on appeal would be a protocol nobody could build
on. So an appeal is paid strictly out of the remainder, and if the remainder
cannot cover the full share the appeal is PARTIALLY funded and the shortfall is
named. `_contest_share` computes what the ranking would have paid had the
proposal scored this well the first time, and then takes the minimum of that,
the amount requested, and what is actually left.

**The original deposit comes back first.** A proposal that has now cleared the
bar was never one whose deposit the treasurer was entitled to keep, so the
forfeited spam stake is returned out of the remainder BEFORE the award is
computed. That ordering is visible in `contest` and is the reason
`forfeited_wei` is decremented there.

**An unheard appeal costs nothing.** If the network cannot produce a reading,
the stake is handed straight back and `contest_status` is left untouched so the
appeal can be filed again. Charging a proposer for the network's bad minute
would make the appeal path a lottery.

---

## 5. The one place a raise is allowed, and it is not in this contract

`GrantJudge.py` contains **zero** `raise` statements — not in a write, not in a
helper, not in a view. A revert rolls back storage but NOT the value that came
with the call, which then sits in the contract unaccounted for and unreachable.

The tempting exception is a reverting integration read: `require_funded()`, the
form an integrator cannot accidentally ignore. It was written, and then removed.
A view that reverts is harmless in itself, but it is one `@gl.public.write` away
from being the bug the rule exists to prevent, and a codebase where the rule has
an exception is a codebase where the next person adds the second one.

The reverting form lives in `GrantConsumer.register_grant`, which holds no money
and can therefore afford it. `GrantJudge.check_funded` is the non-reverting
verdict the consumer calls. Both halves of that argument are the same argument.

---

## 6. `_bank` and the double credit

The obvious accounting is: take the value, and refund it in the refusal path.
That DOUBLE-CREDITED any value attached to a method that refused — a stranger
sending 1 GEN to a call that refused them came away owed 2. The bug was in the
SHAPE of the accounting, not in any one path, which is why no individual method
looked wrong and why a per-path fix would have left the next one exposed.

There is now exactly one place value becomes the sender's (`_bank`, the first
statement of every write) and exactly one place it stops being theirs (`_take`),
so a double credit is not expressible. `_refuse` credits nothing, because
refusing simply means never calling `_take`.

`_bank` runs on NON-payable writes too. A method that was never meant to receive
value should never see any — but if the runner ever let one through, that value
still has an owner and a way out rather than becoming an unaccounted balance.

---

## 7. Per-round books

`Round.locked_wei` is the round's slice of the contract-wide `locked_wei`, and
every settlement path goes through `_hand_over`, which decrements both together.
It exists so that rule 7 can be asserted PER ROUND rather than merely in
aggregate: when a round's last claim lands, this is exactly zero, and both the
offline suite and `seed.mjs` drive a whole lifecycle to the end and check it.

An aggregate-only invariant is satisfiable by a contract that has quietly moved
one round's pool into another's, which is precisely the failure a grant platform
would be least able to explain.

---

## 8. Storage shapes this runner does not take

A `DynArray` nested inside a struct is not a shape this runner accepts. That is
why:

- **criteria live in one flat array** and a round names a contiguous RANGE of it
  (`criteria_start`, `criteria_count`). Safe precisely because criteria are
  written in one go at creation and never appended to afterwards.
- **criterion scores are stored as a CSV string** rather than as a list. A flat
  string is a shape storage, calldata, the UI and a human reading an explorer all
  take identically — and it is exactly the "compared key" the design calls for.

Indexing a `TreeMap` key that is not there RAISES. `get_or_insert_default` is the
spelling that inserts; `self.by_round[key].append(...)` is a revert waiting for
the first proposal of every round.

---

## 9. Time

There is no `block.timestamp` on this chain. The block time arrives as an ISO
string in `gl.message.raw["datetime"]`, which is part of the transaction and
therefore identical on every validator. A wall-clock read per node would put the
difference between two nodes' clocks straight onto the consensus axis: a
deadline would expire at a different instant for each of them.

`_epoch_from_iso` is written out by hand, with Howard Hinnant's civil-date
algorithm, because a date routine on the consensus axis should be one anybody can
read and check.

---

## 10. Hazards that cost previous projects a deploy

- **The runner header is exactly two comment lines.** GenVM parses the
  contiguous leading `#` block as the runner header, so a stray comment between
  line 1 and the imports makes the contract undeployable and reports nothing but
  `invalid_contract`. Lint does not catch it.
- **`Proxy.emit()` posts NO MESSAGE.** It returns a method getter, so an
  `emit(value=…)` with nothing after it constructs an object and drops it. Every
  payout appears to succeed and not one wei moves. `emit_transfer` is the
  spelling that posts a bare value transfer, and the only way to catch the
  mistake is to compare the contract's real chain balance before and after.
- **A nondet closure that captures `self`** pickles storage and kills the leader
  mid-round with no usable error. `_facts` is the boundary: it copies plain
  strings and ints out of storage before the closure is built, and the offline
  suite walks the AST to prove neither closure mentions `self`.
- **`str.replace()` is rejected by the runner.** Slice around `find()` instead.
- **`gl.vm.UserError` moved its payload to `.data`.** Reading `.message` returns
  `""`, and an empty message makes every error-class comparison succeed — which
  turns a leader that failed for one reason into a leader every validator agreed
  with for another. `_err_text` reads both.
- **Studio Dev queues an `on="finalized"` transfer and does not execute it.**
  Measured by three previous projects, three ways each. It is a property of the
  network, and `get_stats` reports the gap as `undelivered_wei` rather than
  hiding it.

---

## 11. The seed's own bug, which is worth recording

`seed.mjs` first used a 150-second submission window. Every create and every
submit is a real transaction that has to reach a terminal state, and on Studio
Dev that is twenty to forty seconds apiece — so the round closed while its own
proposals were still being filed and the last builder was refused with "closed to
submissions".

The contract was working exactly as specified. The seed was wrong. The window is
now set from the work the script actually does, and the wait is computed from the
LAST deadline the chain recorded rather than assumed from the first.

The faucet had the same shape of bug: a bare `await fetch` with no timeout, which
hung an eleven-account funding loop with nothing in the log and made an
unanswered HTTP request look like a contract problem. It is now bounded,
retried, non-fatal, and skipped entirely for an account that already has a
balance.
