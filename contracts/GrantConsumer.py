# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

# GrantConsumer - the block another DAO copies.
#
# A milestone registry that will only recognise a grant GrantJudge actually
# awarded. It stores no scores of its own, has no scoring code and holds NO
# MONEY AT ALL: every value here arrives from a free cross-contract read of the
# judge.
#
# CUSTODY: FALSE. There is not one `@gl.public.write.payable` method in this
# file, and there is no `emit_transfer` anywhere in it. That is a deliberate
# property and it is what makes this contract safe to copy: an integration that
# held funds would need every one of GrantJudge's twelve rules over again, and
# a builder copying it would inherit the obligation without the reasoning. This
# one is a GATE. It reads a verdict and records that it read it.
#
# THE POINT OF THE EXAMPLE. There are two ways to read a grant oracle and only
# one of them is safe to act on:
#
#   preview_grant() -> check_funded()   - non-reverting. Answers "what do you
#       know?", degrading to a reason string when the round is unfinished, the
#       proposal was not funded, the score is under this DAO's floor or the
#       decision is stale. Right for a UI, a dashboard, a dry run.
#
#   register_grant() -> _require()      - REVERTS. Answers "may I act on this?"
#       and refuses to return at all on any of the same conditions. Right for
#       anything that puts capital or reputation at risk.
#
# A registry that admitted grants through the first form eventually admits one
# from a round that was never finalised, on a score that was never agreed. So
# the reverting read is the default integration point here, and the
# non-reverting one is confined to the views that only ever describe.
#
# WHY THE REVERT LIVES HERE AND NOT IN GRANTJUDGE. GrantJudge contains zero
# `raise` statements, on purpose: it holds money, and a revert in a method that
# received value strands that value with no record to refund it from. This
# contract holds nothing, so it can refuse in the one way an integrator cannot
# accidentally ignore. The two halves of that argument are the same argument.

import genlayer as gl
from genlayer import *
from dataclasses import dataclass
import typing

# Policy defaults. The owner can retune these; none of them can move a score,
# because this contract has no way to write one.
DEFAULT_MIN_SCORE = 400          # 4.00 out of 7.00, on GrantJudge's scale
DEFAULT_MAX_AGE = 90 * 86400     # a grant decision nobody has looked at in a
                                 # quarter is not evidence about today
MAX_SLOTS = 500
MAX_SCORE = 700
ERR = "GrantConsumer: "

# Score band -> milestone tier. Deliberately coarse: the judge quantises to
# hundredths of a bucket, and banding on top of that keeps a one-hundredth
# wobble at the edge from moving a grant between tiers.
TIERS = (("PROVISIONAL", 0), ("STANDARD", 450), ("PRIORITY", 550),
         ("FLAGSHIP", 620))


def _as_int(v: typing.Any, default: int = 0) -> int:
    if isinstance(v, bool):
        return default
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    if isinstance(v, str):
        t = v.strip()
        if t == "" or not t.isdigit():
            return default
        return int(t)
    return default


def _clamp(v: int, lo: int, hi: int) -> int:
    return lo if v < lo else (hi if v > hi else v)


def _short(s: typing.Any, n: int = 160) -> str:
    t = " ".join(str(s).split())
    return t if len(t) <= n else t[:n]


def _is_addr(text: typing.Any) -> bool:
    t = str(text).strip()
    if len(t) != 42 or not t.startswith("0x"):
        return False
    for ch in t[2:]:
        if ch not in "0123456789abcdefABCDEF":
            return False
    return True


def _tier(score: int) -> str:
    """The highest tier whose floor this score has reached."""
    out = TIERS[0][0]
    for name, floor in TIERS:
        if score >= floor:
            out = name
    return out


def _score_text(score: typing.Any) -> str:
    n = _clamp(_as_int(score, 0), 0, MAX_SCORE)
    return str(n // 100) + "." + ("0" + str(n % 100))[-2:]


@gl.contract.interface
class IGrantJudge:
    """The judge's public surface, as this consumer uses it. Type stubs only -
    at runtime this is the same thing `gl.contract.get_at()` returns.

    v0.6 moved the decorator from `gl.contract_interface` to
    `gl.contract.interface`. The `IGrantJudge(addr).view().method()` shape it
    produces is unchanged."""

    class View:
        def get_award(self, round_id: typing.Any,
                      proposal_id: typing.Any) -> typing.Any: ...

        def check_funded(self, round_id: typing.Any, proposal_id: typing.Any,
                         min_score: typing.Any,
                         max_age_seconds: typing.Any) -> typing.Any: ...

        def is_funded(self, round_id: typing.Any,
                      proposal_id: typing.Any) -> bool: ...

        def get_round(self, round_id: typing.Any) -> typing.Any: ...

        def get_stats(self) -> typing.Any: ...

    class Write:
        pass


@gl.storage.allow
@dataclass
class Grant:
    """One recognised grant. Every field is a copy of what the judge said at
    the moment of registration, kept so that a later change of policy here
    cannot silently rewrite what this registry admitted and why."""
    round_id: u32
    proposal_id: u32
    grantee: Address
    registrar: Address
    award_wei: u256
    score: u32
    tier: str
    content_hash: str
    registered_at: u64
    min_score_at_registration: u32


class GrantConsumer(gl.contract.Contract):
    owner: Address
    judge: Address
    min_score: u32
    max_age_seconds: u64

    grants: gl.storage.DynArray[Grant]
    seen: gl.storage.TreeMap[str, u32]
    by_grantee: gl.storage.TreeMap[Address, gl.storage.DynArray[u32]]
    total_registered: u256
    total_award_wei: u256
    total_refused: u256

    def __init__(self, judge_address: str,
                 min_score: int = DEFAULT_MIN_SCORE,
                 max_age_seconds: int = DEFAULT_MAX_AGE):
        self.owner = gl.message.sender_address
        self.judge = Address(str(judge_address).strip())
        self.min_score = u32(_clamp(_as_int(min_score, DEFAULT_MIN_SCORE), 0,
                                    MAX_SCORE))
        self.max_age_seconds = u64(_clamp(
            _as_int(max_age_seconds, DEFAULT_MAX_AGE), 0, 3650 * 86400))
        self.total_registered = u256(0)
        self.total_award_wei = u256(0)
        self.total_refused = u256(0)

    def _judge(self) -> typing.Any:
        return IGrantJudge(self.judge)

    def _key(self, round_id: typing.Any, proposal_id: typing.Any) -> str:
        return str(_as_int(round_id, 0)) + ":" + str(_as_int(proposal_id, 0))

    def _ask(self, round_id: typing.Any, proposal_id: typing.Any) -> typing.Any:
        """The non-reverting read, with the transport failure folded in.

        A judge that cannot be reached is NOT a grant that was refused, and the
        difference matters: the first is retryable and the second is final. Both
        arrive here as `{"ok": false}` with a reason that says which."""
        try:
            return self._judge().view().check_funded(
                round_id, proposal_id, int(self.min_score),
                int(self.max_age_seconds))
        except Exception as e:
            return {"ok": False, "reachable": False,
                    "reason": "the judge could not be read: " + _short(e)}

    def _require(self, round_id: typing.Any, proposal_id: typing.Any) -> dict:
        """THE REVERTING READ. Everything that puts anything at risk goes
        through here.

        It refuses to return at all unless the judge says the grant is final,
        funded, at or above this DAO's own score floor and inside its own
        staleness window. An integrator who forgets to check a return value
        still gets the right behaviour, which is the entire argument for a
        revert over a boolean."""
        answer = self._ask(round_id, proposal_id)
        if not isinstance(answer, dict):
            raise gl.vm.UserError(ERR + "the judge returned nothing usable")
        if not answer.get("ok"):
            raise gl.vm.UserError(
                ERR + _short(answer.get("reason", "the grant was not funded")))
        return answer

    @gl.public.write
    def register_grant(self, round_id: typing.Any,
                       proposal_id: typing.Any) -> typing.Any:
        """Admit a grant to this DAO's milestone registry.

        PERMISSIONLESS, because the check is not "who is asking" but "what did
        the judge decide". Anyone may register a grant the judge funded, and
        nobody can register one it did not.

        REVERTS on a grant the judge will not vouch for. This contract holds no
        money, so a revert here strands nothing - see the header."""
        answer = self._require(round_id, proposal_id)
        key = self._key(round_id, proposal_id)
        if int(self.seen.get(key) or 0) > 0:
            return {"status": "ALREADY_REGISTERED",
                    "grant_index": int(self.seen.get(key) or 0),
                    "round_id": _as_int(round_id, 0),
                    "proposal_id": _as_int(proposal_id, 0)}
        if len(self.grants) >= MAX_SLOTS:
            return {"status": "FULL", "slots": MAX_SLOTS,
                    "reason": "this registry is full"}

        score = _clamp(_as_int(answer.get("score"), 0), 0, MAX_SCORE)
        grantee = Address(str(answer.get("author", "")).strip()) \
            if _is_addr(answer.get("author", "")) else gl.message.sender_address
        award = _as_int(answer.get("award_wei"), 0)
        row = self.grants.append_new_get()
        row.round_id = u32(_as_int(round_id, 0))
        row.proposal_id = u32(_as_int(proposal_id, 0))
        row.grantee = grantee
        row.registrar = gl.message.sender_address
        row.award_wei = u256(award)
        row.score = u32(score)
        row.tier = _tier(score)
        row.content_hash = str(answer.get("content_hash", ""))
        row.registered_at = u64(_as_int(answer.get("finalized_at"), 0))
        row.min_score_at_registration = u32(int(self.min_score))

        index = len(self.grants)
        self.seen[key] = u32(index)
        self.by_grantee.get_or_insert_default(grantee).append(u32(index))
        self.total_registered = u256(int(self.total_registered) + 1)
        self.total_award_wei = u256(int(self.total_award_wei) + award)

        return {
            "status": "OK",
            "grant_index": index,
            "round_id": _as_int(round_id, 0),
            "proposal_id": _as_int(proposal_id, 0),
            "grantee": grantee.as_hex,
            "award_wei": str(award),
            "score": score,
            "score_text": _score_text(score),
            "tier": row.tier,
            "content_hash": str(row.content_hash),
        }

    @gl.public.write
    def set_policy(self, min_score: typing.Any,
                   max_age_seconds: typing.Any) -> typing.Any:
        """Retune the floor and the staleness limit. Owner only.

        IT CANNOT MOVE A SCORE, because this contract has no way to write one,
        and it cannot retroactively admit or expel a grant already in the
        registry - every row keeps the floor it was admitted under."""
        if gl.message.sender_address != self.owner:
            return {"status": "REJECTED",
                    "reason": "only the owner can retune this registry"}
        self.min_score = u32(_clamp(_as_int(min_score, DEFAULT_MIN_SCORE), 0,
                                    MAX_SCORE))
        self.max_age_seconds = u64(_clamp(
            _as_int(max_age_seconds, DEFAULT_MAX_AGE), 0, 3650 * 86400))
        return {"status": "OK", "min_score": int(self.min_score),
                "max_age_seconds": int(self.max_age_seconds)}

    @gl.public.view
    def is_funded(self, round_id: typing.Any,
                  proposal_id: typing.Any) -> bool:
        """Straight through to the judge. Non-reverting, and False for anything
        it cannot read."""
        try:
            return bool(self._judge().view().is_funded(round_id, proposal_id))
        except Exception:
            return False

    @gl.public.view
    def get_award(self, round_id: typing.Any,
                  proposal_id: typing.Any) -> typing.Any:
        try:
            return self._judge().view().get_award(round_id, proposal_id)
        except Exception as e:
            return {"found": False, "award_wei": "0",
                    "reason": "the judge could not be read: " + _short(e)}

    @gl.public.view
    def preview_grant(self, round_id: typing.Any,
                      proposal_id: typing.Any) -> typing.Any:
        """What `register_grant` would do, without doing it. THE FORM A UI
        SHOULD USE - it degrades to a reason instead of refusing to answer."""
        answer = self._ask(round_id, proposal_id)
        allowed = isinstance(answer, dict) and bool(answer.get("ok"))
        score = _clamp(_as_int(answer.get("score"), 0), 0, MAX_SCORE) \
            if isinstance(answer, dict) else 0
        return {
            "round_id": _as_int(round_id, 0),
            "proposal_id": _as_int(proposal_id, 0),
            "would_register": allowed,
            "already_registered": int(
                self.seen.get(self._key(round_id, proposal_id)) or 0) > 0,
            "reason": str(answer.get("reason", "")) if isinstance(answer, dict)
            else "the judge returned nothing usable",
            "score": score,
            "score_text": _score_text(score),
            "tier": _tier(score) if allowed else "",
            "award_wei": str(_as_int(answer.get("award_wei"), 0))
            if isinstance(answer, dict) else "0",
            "min_score": int(self.min_score),
            "min_score_text": _score_text(int(self.min_score)),
            "max_age_seconds": int(self.max_age_seconds),
        }

    @gl.public.view
    def get_grant(self, index: typing.Any) -> typing.Any:
        i = _as_int(index, 0)
        if i < 1 or i > len(self.grants):
            return {"found": False, "reason": "no grant at index " + str(i)}
        row = self.grants[i - 1]
        return {
            "found": True,
            "index": i,
            "round_id": int(row.round_id),
            "proposal_id": int(row.proposal_id),
            "grantee": row.grantee.as_hex,
            "registrar": row.registrar.as_hex,
            "award_wei": str(int(row.award_wei)),
            "score": int(row.score),
            "score_text": _score_text(int(row.score)),
            "tier": str(row.tier),
            "content_hash": str(row.content_hash),
            "registered_at": int(row.registered_at),
            "min_score_at_registration": int(row.min_score_at_registration),
        }

    @gl.public.view
    def get_registry(self) -> typing.Any:
        rows = []
        for i in range(len(self.grants)):
            row = self.grants[i]
            rows.append({
                "index": i + 1,
                "round_id": int(row.round_id),
                "proposal_id": int(row.proposal_id),
                "grantee": row.grantee.as_hex,
                "award_wei": str(int(row.award_wei)),
                "score": int(row.score),
                "score_text": _score_text(int(row.score)),
                "tier": str(row.tier),
                "content_hash": str(row.content_hash),
            })
        return {"count": len(rows), "grants": rows,
                "total_award_wei": str(int(self.total_award_wei))}

    @gl.public.view
    def get_config(self) -> typing.Any:
        return {
            "judge": self.judge.as_hex,
            "owner": self.owner.as_hex,
            "min_score": int(self.min_score),
            "min_score_text": _score_text(int(self.min_score)),
            "max_age_seconds": int(self.max_age_seconds),
            "max_slots": MAX_SLOTS,
            "tiers": [{"name": name, "floor": floor} for name, floor in TIERS],
            "registered": int(self.total_registered),
            "total_award_wei": str(int(self.total_award_wei)),
            # Declared, and true by construction: there is not one payable
            # method and not one `emit_transfer` in this file.
            "custody": False,
            "payable_methods": 0,
            "note": ("this contract reads GrantJudge and holds nothing; "
                     "register_grant reverts on a grant the judge will not "
                     "vouch for, and preview_grant is the non-reverting form"),
        }
