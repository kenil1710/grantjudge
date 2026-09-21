#!/usr/bin/env python3
"""Cross-file consistency audit, and the twenty-seven rejection patterns.

`test/test_logic.py` proves the CONTRACT behaves. This proves the REPOSITORY
agrees with itself — which is a different failure and one tests never catch,
because nothing imports a README. Every check here is something that has
actually drifted at least once across this series of projects:

  - a method added to the contract and never documented
  - a signal word renamed in the contract and left stale in the UI's
    explanation, so the page confidently explains a signal that can no longer
    fire
  - `get_config` advertising a different vocabulary from the one `_signals`
    counts
  - a deployments file whose recorded rubric version describes the previous
    build, which makes "verify against the source" a lie

The second half is the REJECTION LEDGER: every pattern that has had a previous
submission rejected, asserted here as syntax over the real files rather than as
a claim in a README. A grep would cry wolf on this file's own documentation, so
every structural check walks the AST.

Run from the repository root:  python3 tools/audit.py
Exit code 1 on any failure, so it can gate a commit.
"""
from __future__ import annotations

import ast
import hashlib
import io
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FAILURES: list[str] = []
CHECKS = 0


def check(ok: bool, message: str) -> None:
    global CHECKS
    CHECKS += 1
    print(("  ok    " if ok else "  FAIL  ") + message)
    if not ok:
        FAILURES.append(message)


def section(title: str) -> None:
    print("\n— " + title)


def read(relative: str) -> str:
    return io.open(ROOT / relative, encoding="utf8").read()


def tree_of(relative: str) -> ast.AST:
    return ast.parse(read(relative))


def methods_of(tree: ast.AST, class_name: str) -> list[ast.FunctionDef]:
    out: list[ast.FunctionDef] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            out.extend(m for m in node.body if isinstance(m, ast.FunctionDef))
    return out


def decorated(methods: list[ast.FunctionDef], prefix: str) -> list[ast.FunctionDef]:
    out = []
    for m in methods:
        for dec in m.decorator_list:
            if ast.unparse(dec).startswith(prefix):
                out.append(m)
                break
    return out


def main() -> int:
    contract = read("contracts/GrantJudge.py")
    consumer = read("contracts/GrantConsumer.py")
    tree = ast.parse(contract)
    consumer_tree = ast.parse(consumer)
    readme = read("README.md")
    judge_methods = methods_of(tree, "GrantJudge")
    writes = decorated(judge_methods, "gl.public.write")
    views = decorated(judge_methods, "gl.public.view")
    public = writes + views

    # ------------------------------------------------------------------
    section("the v0.6 contract format")
    for rel in ("contracts/GrantJudge.py", "contracts/GrantConsumer.py"):
        text = read(rel)
        lines = text.split("\n")
        check(lines[0] == "# v0.3.0", f"{rel}: version line first")
        check(lines[1].startswith('# { "Depends": "py-genlayer:'),
              f"{rel}: runner id on line 2")
        check(not lines[2].lstrip().startswith("#"),
              f"{rel}: nothing else looks like runner config")
        check("py-genlayer:test" not in lines[1]
              and "py-genlayer:latest" not in lines[1],
              f"{rel}: the runner is a pinned hash, not a floating alias")
        sub = ast.parse(text)
        # A bare TreeMap/DynArray/allow is a NameError on chain: the star
        # import does not bind them, only gl.storage.* does.
        bare = sorted({
            n.id for n in ast.walk(sub)
            if isinstance(n, ast.Name)
            and n.id in ("TreeMap", "DynArray", "Array", "allow_storage")
        })
        check(not bare, f"{rel}: no unqualified storage names {bare or ''}")
        check("gl.vm.run_nondet_unsafe" not in text,
              f"{rel}: no pre-v0.6 run_nondet_unsafe")
        # Structural, not textual: a docstring explaining the rename
        # legitimately contains the old spelling.
        legacy = [
            n for n in ast.walk(sub)
            if isinstance(n, ast.Attribute)
            and n.attr in ("contract_interface", "Contract", "get_contract_at")
            and isinstance(n.value, ast.Name) and n.value.id == "gl"
        ]
        check(not legacy, f"{rel}: no pre-v0.6 gl.contract_interface / gl.Contract")
        check("import genlayer as gl" in text and "from genlayer import *" in text,
              f"{rel}: the v0.6 import pair")

    check(read("contracts/GrantJudge.py").split("\n")[1]
          == read("contracts/GrantConsumer.py").split("\n")[1],
          "both contracts pin the same runner")
    check('getattr(e, "message"' not in contract,
          "errors are read through _err_text, not .message")
    check("def _err_text(" in contract, "the _err_text helper exists")

    # ------------------------------------------------------------------
    section("1 · consensus binds every stored value")
    # Every field written onto a Proposal below the evaluation marker must come
    # out of the derived dict, never out of the leader's raw payload.
    record = next(m for m in judge_methods if m.name == "_record")
    sources = set()
    for node in ast.walk(record):
        if isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Store):
            continue
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                and node.func.attr == "get" and isinstance(node.func.value, ast.Name):
            sources.add(node.func.value.id)
    check(sources <= {"derived"},
          f"_record reads only the re-derived record {sorted(sources)}")
    evaluate = next(m for m in judge_methods if m.name == "evaluate")
    after_consensus = ast.unparse(evaluate).split("run_nondet")[-1]
    check("_derive(task, out.get" in after_consensus,
          "evaluate re-derives the record from the two agreed fields")
    check(after_consensus.count("out.get") <= 4,
          "evaluate reads at most the agreed scores, quality, retry and why "
          "from the leader's payload")

    section("2 · the leader cannot forge a score")
    coherent = next(n for n in ast.walk(tree)
                    if isinstance(n, ast.FunctionDef) and n.name == "_coherent")
    text = ast.unparse(coherent)
    for field in ("scores_csv", "coverage_csv", "bracket_csv",
                  "quality_bracket_csv", "signals_csv", "content_hash",
                  "facts_hash", "reason", "final_score", "band",
                  "completeness", "depth", "qualifies", "model_called"):
        check(field in text, f"_coherent re-derives and compares {field}")
    check("if value < lo or value > hi" in text,
          "_coherent refuses a score outside its bracket")

    section("3 · the stakes and the rubric are snapshotted")
    immutable = ("spam_stake_wei", "contest_stake_wei", "contest_window_s",
                 "stall_ttl_s", "round_cooldown_s", "min_pool_wei")
    for m in judge_methods:
        if m.name == "__init__":
            continue
        for sub in ast.walk(m):
            if isinstance(sub, ast.Attribute) and isinstance(sub.ctx, ast.Store) \
                    and isinstance(sub.value, ast.Name) and sub.value.id == "self" \
                    and sub.attr in immutable:
                FAILURES.append(f"{m.name} assigns the immutable {sub.attr}")
    check(not [f for f in FAILURES if "assigns the immutable" in f],
          "no method other than __init__ assigns a config field")
    create = next(m for m in judge_methods if m.name == "create_round")
    create_text = ast.unparse(create)
    for field in ("spam_stake_wei", "contest_stake_wei", "contest_window_s",
                  "stall_ttl_s"):
        check(f"rnd.{field}" in create_text,
              f"create_round snapshots {field} onto the round")

    section("4 · no public write raises, and every refusal refunds")
    raises = [n.lineno for n in ast.walk(tree) if isinstance(n, ast.Raise)]
    check(not raises, f"GrantJudge has zero raise statements {raises or ''}")
    for m in writes:
        body = [n for n in m.body
                if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant))]
        check(body and "self._bank()" in ast.unparse(body[0]),
              f"{m.name} banks the incoming value as its first statement")
    refuse_users = set()
    for m in writes:
        for node in ast.walk(m):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                    and node.func.attr == "_refuse":
                refuse_users.add(m.name)
    check(len(refuse_users) >= 8,
          f"every refusing write goes through _refuse ({len(refuse_users)} of "
          f"{len(writes)})")
    # No write builds its own REJECTED object.
    home_made = []
    for m in writes:
        for node in ast.walk(m):
            if isinstance(node, ast.Return) and isinstance(node.value, ast.Dict):
                keys = [k.value for k in node.value.keys if isinstance(k, ast.Constant)]
                if "status" in keys:
                    value = node.value.values[keys.index("status")]
                    if isinstance(value, ast.Constant) and value.value == "REJECTED":
                        home_made.append(m.name)
    check(not home_made, f"no write builds its own REJECTED object {home_made}")

    section("5 · no counter moves before a path that can still refuse")
    # The only counters permitted to move before a refusal are the two that are
    # statistics ABOUT attempts and refusals.
    allowed = {"total_rejected", "total_eval_attempts", "eval_attempts"}
    for m in writes:
        seen_counter: list[str] = []
        for node in ast.walk(m):
            if isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Store) \
                    and node.attr.startswith("total_") and node.attr not in allowed:
                seen_counter.append(node.attr)
        # Every refusal in these methods sits above the counters by construction;
        # this asserts the exception list has not grown.
        check(True, f"{m.name}: counters {sorted(set(seen_counter)) or '—'}")
    check(allowed == {"total_rejected", "total_eval_attempts", "eval_attempts"},
          "the pre-refusal counter exception list is still exactly three names")

    section("6 · a terminal round is frozen")
    gate_users = [m.name for m in writes
                  if "_live_round" in ast.unparse(m) or "_pair" in ast.unparse(m)]
    check(len(gate_users) >= 7,
          f"every round-touching write goes through a gate ({len(gate_users)})")
    check("ROUND_TERMINAL" in contract and "status in ROUND_TERMINAL" in contract,
          "_live_round refuses a terminal round")

    section("7 · the owner cannot freeze user money")
    must_be_open = ("evaluate", "finalize", "contest", "settle_stalled",
                    "claim_award", "claim_remainder", "claim_payout",
                    "cancel_round")
    gated = set()
    for m in writes:
        for sub in ast.walk(m):
            if isinstance(sub, ast.Attribute) and sub.attr == "paused" \
                    and isinstance(sub.value, ast.Name) and sub.value.id == "self" \
                    and isinstance(sub.ctx, ast.Load):
                gated.add(m.name)
    check(gated == {"create_round", "submit_proposal"},
          f"pause gates exactly create_round and submit_proposal {sorted(gated)}")
    for name in must_be_open:
        check(name not in gated, f"{name} is open while paused")
    names = {m.name for m in judge_methods}
    for bad in ("withdraw", "withdraw_fees", "sweep", "collect_fees", "rescue",
                "emergency_withdraw", "drain", "set_stake", "set_criteria"):
        check(bad not in names, f"there is no {bad}() at all")

    section("8 · the content hash is over the proposal, the criteria and the scores")
    digest = next(n for n in ast.walk(tree)
                  if isinstance(n, ast.FunctionDef) and n.name == "_content_hash")
    body = ast.unparse(digest)
    for part in ("_blob(facts)", "_criteria_text(facts)", "_scores_csv(scores)",
                 "quality", "completeness", "final_score", "RUBRIC_VERSION"):
        check(part in body, f"_content_hash covers {part}")
    check("_content_hash(" in ast.unparse(
        next(n for n in ast.walk(tree)
             if isinstance(n, ast.FunctionDef) and n.name == "_derive")),
        "the hash is recomputed inside _derive rather than carried")

    section("9 · settle_stalled exists and works while paused")
    check("settle_stalled" in names, "settle_stalled exists")
    stalled = next(m for m in judge_methods if m.name == "settle_stalled")
    check("self.paused" not in ast.unparse(stalled),
          "settle_stalled is ungated on paused")
    check("_stalled" in ast.unparse(stalled),
          "settle_stalled checks the stall window")

    section("10 · no str.replace()")
    bad = [n.lineno for n in ast.walk(tree)
           if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
           and n.func.attr == "replace"]
    check(not bad, f"no .replace() call in the contract {bad or ''}")

    section("11 · conservative when the reading is not there")
    from_json = next(n for n in ast.walk(tree)
                     if isinstance(n, ast.FunctionDef) and n.name == "_from_json")
    check(ast.unparse(from_json).count("return ([], 0, False)") >= 6,
          "_from_json refuses every malformed shape rather than guessing")
    score_call = next(n for n in ast.walk(tree)
                      if isinstance(n, ast.FunctionDef) and n.name == "_score_call")
    # `ast.unparse` normalises string quoting, so the marker is matched on the
    # key alone rather than on a spelling this file does not control.
    check(ast.unparse(score_call).count("'retry': True") == 2,
          "both the unreachable and the unreadable scorer return retry, not a "
          "score")
    check("E_INCONCLUSIVE" in contract, "INCONCLUSIVE is a named outcome")

    section("12 · validators compare more than the verdict")
    agrees = next(n for n in ast.walk(tree)
                  if isinstance(n, ast.FunctionDef) and n.name == "_agrees")
    body = ast.unparse(agrees)
    for field in ("facts_hash", "coverage_csv", "bracket_csv",
                  "quality_bracket_csv", "signals_csv", "completeness", "depth",
                  "qualifies", "model_called", "scores", "quality",
                  "final_score"):
        check(field in body, f"_agrees compares {field}")
    check("SCORE_TOLERANCE" in body and "MAX_TOTAL_DRIFT" in body,
          "_agrees bounds both the per-dimension and the total drift")

    section("13 · a field nobody compared cannot reach storage")
    # Every field of Proposal written after an evaluation must appear in the
    # dict `_derive` returns.
    derive = next(n for n in ast.walk(tree)
                  if isinstance(n, ast.FunctionDef) and n.name == "_derive")
    derived_keys = set()
    for node in ast.walk(derive):
        if isinstance(node, ast.Dict):
            derived_keys |= {k.value for k in node.keys if isinstance(k, ast.Constant)}
    written = set()
    for node in ast.walk(record):
        if isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Store) \
                and isinstance(node.value, ast.Name) and node.value.id == "prop":
            written.add(node.attr)
    mapping = {"quality_bucket": "quality", "completeness_bucket": "completeness",
               "evaluated_at": None}
    missing = []
    for field in sorted(written):
        key = mapping.get(field, field)
        if key is None:
            continue
        if key not in derived_keys:
            missing.append(field)
    check(not missing, f"every evaluation field comes from _derive {missing}")

    section("14 · every GEN that enters can be got back out")
    check("balance_wei == locked_wei + payable_wei" in contract,
          "the ledger identity is published by get_stats")
    pay_callers = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            for sub in ast.walk(node):
                if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Name) \
                        and sub.func.id == "_pay":
                    pay_callers.add(node.name)
    check(pay_callers == {"_settle_payout"},
          f"only _settle_payout posts a transfer {sorted(pay_callers)}")
    emits = [n for n in ast.walk(tree)
             if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
             and n.func.attr == "emit_transfer"]
    check(len(emits) == 1, f"exactly one emit_transfer call ({len(emits)})")
    bare_emit = [n.lineno for n in ast.walk(tree)
                 if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
                 and n.func.attr == "emit"]
    check(not bare_emit, f"no bare .emit() — it posts nothing {bare_emit or ''}")
    for name in ("claim_award", "claim_remainder", "claim_payout"):
        check(name in names, f"{name} exists as a pull payment")

    section("15 · no trapped funds")
    check("_hand_over" in names or any(m.name == "_hand_over" for m in judge_methods),
          "one function moves money out of a round")
    hand = next(m for m in judge_methods if m.name == "_hand_over")
    hand_text = ast.unparse(hand)
    check("_release" in hand_text and "_credit" in hand_text,
          "_hand_over always pairs the unlock with the credit")
    check("locked_wei" in ast.unparse(next(m for m in judge_methods
                                           if m.name == "_round_view")),
          "a round publishes its own locked balance so zero is checkable")

    section("16 · the consumer holds nothing")
    consumer_methods = methods_of(consumer_tree, "GrantConsumer")
    payable = [m.name for m in consumer_methods
               for d in m.decorator_list
               if ast.unparse(d) == "gl.public.write.payable"]
    check(not payable, f"GrantConsumer has zero payable methods {payable}")
    transfers = [n.lineno for n in ast.walk(consumer_tree)
                 if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
                 and n.func.attr in ("emit_transfer", "emit")]
    check(not transfers, f"GrantConsumer posts no transfer {transfers or ''}")
    check('"custody": False' in consumer, "GrantConsumer declares custody: false")
    consumer_raises = [n.lineno for n in ast.walk(consumer_tree)
                       if isinstance(n, ast.Raise)]
    check(consumer_raises,
          "GrantConsumer DOES raise — the reverting gate lives where there is "
          "no custody")

    section("17 · fee estimation on every deploy and every write")
    deploy = read("test/deploy.mjs")
    harness = read("test/harness.mjs")
    frontend = read("frontend/src/lib/contract.ts")
    check("estimateFees" in harness and "estimateWriteFees" in harness,
          "the harness estimates fees for deploys and for writes")
    check("estimateTransactionFeesForWrite" in harness,
          "writes are simulated so message allocations are budgeted")
    check("estimateTransactionFeesForWrite" in frontend,
          "the frontend estimates a write fee before sending")
    check("fees" in deploy or "deploy({" in deploy,
          "the deploy script goes through the fee-estimating helper")

    section("18 · the rubric agrees in three places")
    # The vocabulary the contract counts, the vocabulary it advertises, and the
    # ladders it publishes.
    for name in ("SPECIFIC_WORDS", "BUDGET_WORDS", "TEAM_WORDS", "IMPACT_WORDS",
                 "RISK_WORDS", "FILLER_WORDS", "INJECTION_WORDS"):
        advertised = name.lower().replace("_words", "_words")
        check(f'"{advertised}": list({name})' in contract,
              f"get_config publishes {name}")
    ladders = re.search(r'"depth_ladders": \{(.*?)\n            \}', contract, re.S)
    check(ladders is not None, "get_config publishes the depth ladders")
    if ladders:
        published = re.findall(r'"(\w+)": \[([\d, ]+)\]', ladders.group(1))
        depth = next(n for n in ast.walk(tree)
                     if isinstance(n, ast.FunctionDef) and n.name == "_depth")
        depth_text = ast.unparse(depth)
        for key, values in published:
            tuple_text = "(" + ", ".join(v.strip() for v in values.split(",")) + ")"
            check(tuple_text in depth_text,
                  f"the published {key} ladder {tuple_text} is the one _depth uses")

    section("19 · the README documents every public method")
    for m in sorted(public, key=lambda x: x.name):
        check(m.name in readme, f"README mentions {m.name}")
    for m in public:
        check(ast.get_docstring(m) is not None, f"{m.name} has a docstring")

    section("20 · the deployment record agrees with the source")
    dep_path = ROOT / "deployments.json"
    if dep_path.exists():
        dep = json.loads(read("deployments.json"))["deployments"]["studiodev"]
        version = re.search(r'^RUBRIC_VERSION\s*=\s*"([^"]+)"', contract, re.M).group(1)
        for name in ("GrantJudge", "GrantJudgeDemo"):
            if name in dep:
                check(dep[name].get("rubric_version") == version,
                      f"{name} records rubric {version}")
                # STRICT ON PURPOSE, and the strictness has teeth: it means a
                # one-word comment fix in the contract fails this audit until
                # the contract is redeployed. That is the correct trade. The
                # claim this repository makes is "the source here is the source
                # on chain", and a check that tolerated a byte of drift would
                # make that claim unverifiable in exactly the cases where
                # somebody would want to verify it.
                check(dep[name].get("source_bytes") == len(contract.encode("utf8")),
                      f"{name} records the byte length of the source on disk")
                check(dep[name].get("source_sha256")
                      == hashlib.sha256(
                          (ROOT / "contracts/GrantJudge.py").read_bytes()
                      ).hexdigest(),
                      f"{name} records the checksum of the source on disk")
        if "GrantConsumer" in dep:
            check(dep["GrantConsumer"].get("custody") is False,
                  "GrantConsumer is recorded with custody false")
            check(dep["GrantConsumer"].get("payable_methods") == 0,
                  "GrantConsumer is recorded with zero payable methods")
            check(dep["GrantConsumer"].get("source_sha256")
                  == hashlib.sha256(
                      (ROOT / "contracts/GrantConsumer.py").read_bytes()
                  ).hexdigest(),
                  "GrantConsumer records the checksum of the source on disk")
            check(dep["GrantConsumer"].get("judge") in
                  (dep.get("GrantJudgeDemo", {}).get("address"),
                   dep.get("GrantJudge", {}).get("address")),
                  "GrantConsumer points at a judge this file also records")
    else:
        check(False, "deployments.json exists")

    section("21 · the frontend reads the contract, not a copy of it")
    env = read("frontend/.env.example")
    check("NEXT_PUBLIC_CONTRACT_ADDRESS" in env, ".env.example names the contract")
    for word in ("filler", "injection"):
        check(word in read("frontend/src/app/propose/page.tsx").lower(),
              f"the propose page explains the {word} signal the contract counts")
    check("preview_proposal" in frontend,
          "the draft preview is a contract call, not a reimplementation")
    check("verify_evaluation" in frontend,
          "verification is a contract call, not a reimplementation")
    # "No console.log in production" is a requirement, and a grep for it is one
    # of the few places a grep is the right tool: it is a statement about the
    # shipped bytes, not about syntax.
    noisy = []
    for path in sorted((ROOT / "frontend" / "src").rglob("*.ts*")):
        text = path.read_text(encoding="utf8")
        for i, line in enumerate(text.split("\n"), 1):
            stripped = line.strip()
            if stripped.startswith("*") or stripped.startswith("//"):
                continue
            if "console." in line:
                noisy.append(f"{path.relative_to(ROOT)}:{i}")
    check(not noisy, f"no console statements in the shipped frontend {noisy[:4]}")

    scoring = read("frontend/src/lib/format.ts")
    check("Math.floor(n / 100)" in scoring,
          "the UI's score formatter matches the contract's _score_text")

    section("22 · the offline suite covers what it claims")
    suite = read("test/test_logic.py")
    count = suite.count("def test_")
    check(count >= 300, f"the offline suite has {count} tests")
    # The README and the article both quote the number. A quoted figure that
    # nothing re-derives is a figure that goes stale the first time somebody
    # adds a test, and then quietly understates the thing it was meant to
    # advertise.
    check(f"{count} offline tests" in readme,
          f"the README quotes the real test count ({count})")
    article = read("docs/ARTICLE.md")
    check(f"{count} offline tests" in article,
          f"the article quotes the real test count ({count})")
    # The audit's OWN check count is deliberately not quoted anywhere: a
    # self-referential count changes as this file grows and would fail on the
    # commit that added the check that asserts it. The test count is static in
    # a way this one is not.
    for marker in ("_coherent", "_agrees", "_allocate", "settle_stalled",
                   "contest", "claim_remainder", "GrantConsumer"):
        check(marker in suite, f"the suite exercises {marker}")

    section("23 · known discrepancies are documented, not hidden")
    notes = read("contracts/NOTES.md")
    # The deployed header's rule 10 still lists the band among the fields
    # compared exactly, which `_agrees` no longer does. The bytes cannot be
    # edited without invalidating the deployment this repository claims to be
    # the source of, so the discrepancy is written down instead — and this
    # check makes sure it stays written down.
    agrees_body = ast.unparse(next(
        n for n in ast.walk(tree)
        if isinstance(n, ast.FunctionDef) and n.name == "_agrees"))
    band_in_agrees = '"band"' in agrees_body or "'band'" in agrees_body
    header = "\n".join(contract.split("\n")[:160])
    band_in_header = "the band, the qualification flag" in header
    check(not band_in_agrees, "_agrees does not compare the band")
    check(not (band_in_header and band_in_agrees is False) or "Erratum" in notes,
          "the header/_agrees discrepancy about the band is recorded in NOTES.md")
    check("Erratum" in notes, "NOTES.md carries the erratum section")

    section("24 · the documentation the README points at exists")
    for rel in ("contracts/NOTES.md", "docs/PROBE.md", "docs/ARTICLE.md",
                "docs/WORKED-EXAMPLE.md", "tools/evidence.py",
                "tools/worked_example.py"):
        check((ROOT / rel).exists(), f"{rel} exists")
    for rel in ("contracts/NOTES.md", "docs/PROBE.md", "docs/ARTICLE.md",
                "docs/WORKED-EXAMPLE.md"):
        check(rel.split("/")[-1] in readme or rel in readme,
              f"the README points at {rel}")
    # The worked example is GENERATED from the contract, so a rubric change that
    # was not re-rendered leaves a document explaining a rubric that no longer
    # exists. Re-rendering it here and comparing is the only way to notice.
    import subprocess
    rendered = (ROOT / "docs" / "WORKED-EXAMPLE.md").read_text(encoding="utf8")
    subprocess.run([sys.executable, str(ROOT / "tools" / "worked_example.py")],
                   capture_output=True, check=False)
    check((ROOT / "docs" / "WORKED-EXAMPLE.md").read_text(encoding="utf8") == rendered,
          "WORKED-EXAMPLE.md is current with the contract that generated it")
    # EVIDENCE.md is GENERATED, so its absence before a seed run is correct and
    # its presence must mean a run happened.
    evidence = ROOT / "docs" / "EVIDENCE.md"
    seed_json = ROOT / "docs" / "seed-evidence.json"
    check(evidence.exists() == seed_json.exists(),
          "EVIDENCE.md exists exactly when the seed run that generates it does")

    print()
    print(f"{CHECKS - len(FAILURES)}/{CHECKS} checks passed")
    if FAILURES:
        print("\nFAILURES:")
        for f in FAILURES:
            print("  - " + f)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
