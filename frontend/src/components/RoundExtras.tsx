"use client";

import Link from "next/link";
import {
  BarChart3,
  CalendarPlus,
  CheckCircle2,
  Clock,
  HandCoins,
  Layers,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Zap,
} from "lucide-react";
import type { Round } from "@/types";
import { TxButton } from "./TxButton";
import { Countdown } from "./Countdown";
import { useWallet } from "./WalletProvider";
import { useAnalytics, useApprovals, useRemainderRoute } from "@/lib/hooks";
import {
  approveFinalization,
  evaluateAll,
  extendDeadline,
  rejectFinalization,
  takeRemainder,
} from "@/lib/contract";
import { formatGen, formatTime, sameAddress, shortAddress } from "@/lib/format";

const label: React.CSSProperties = {
  fontSize: "0.72rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--gold)",
  marginBottom: 12,
  display: "flex",
  alignItems: "center",
  gap: 7,
};

/** Where a round sits in its pool, with a link back to the series. */
export function PoolRibbon({ round }: { round: Round }) {
  if (!round.pool_id) return null;
  const extras = [
    round.approvals_needed > 0 && `${round.approvals_needed} of ${round.co_approvers.length} co-approvers sign off`,
    round.milestone_count > 0 && `paid in ${round.milestone_count} milestones`,
    round.min_reputation > 0 && `proposers need ${round.min_reputation}+ funded`,
    round.extensions_used > 0 && `extended ${round.extensions_used}×`,
  ].filter(Boolean);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        marginBottom: 16,
        padding: "10px 14px",
        borderRadius: 11,
        background: "rgba(45,212,191,0.06)",
        border: "1px solid rgba(45,212,191,0.2)",
        fontSize: "0.82rem",
        color: "var(--cream-dim)",
      }}
    >
      <Layers size={15} color="var(--teal)" />
      <Link href={`/pool/${round.pool_id}`} style={{ color: "var(--teal)" }}>
        Pool #{round.pool_id}
      </Link>
      <span>· round {round.round_number}</span>
      {round.template_id > 0 && (
        <Link href="/templates" style={{ color: "var(--muted)" }}>· template #{round.template_id}</Link>
      )}
      {extras.map((e) => (
        <span key={String(e)} style={{ color: "var(--muted)" }}>· {e}</span>
      ))}
    </div>
  );
}

/** Evaluate every waiting proposal with one click — still one consensus round each. */
export function BatchEvaluate({ round, onDone }: { round: Round; onDone: () => void }) {
  const open =
    (round.status === "OPEN" || round.status === "EVALUATING") &&
    round.seconds_remaining === 0 &&
    round.pending_count > 1;
  if (!open) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 14 }}>
      <TxButton
        label={`Evaluate ${Math.min(round.pending_count, 3)} at once`}
        pendingLabel="Validators are scoring the batch…"
        icon={<Zap size={16} />}
        className="btn btn-ghost"
        title="evaluate_all — up to three proposals per call, each its own consensus round."
        send={(account) => evaluateAll(account, round.round_id)}
        onDone={onDone}
      />
      <span style={{ fontSize: "0.79rem", color: "var(--muted)", maxWidth: 440, lineHeight: 1.55 }}>
        Each proposal is still its own consensus round and its own stored
        vector. If the validators cannot agree on one of them, the batch writes
        nothing and the per-proposal buttons below still work.
      </span>
    </div>
  );
}

/** The co-approvers, their votes, and the lapse that stops them freezing money. */
export function ApprovalsPanel({ round, onDone }: { round: Round; onDone: () => void }) {
  const { account } = useWallet();
  const { data, mutate } = useApprovals(round.round_id, round.approvals_needed > 0);
  if (round.approvals_needed <= 0) return null;
  const mine = data?.approvers.find((a) => sameAddress(a.address, account));
  const canVote =
    Boolean(mine) &&
    (round.status === "OPEN" || round.status === "EVALUATING") &&
    round.seconds_remaining === 0 &&
    round.pending_count === 0;
  const refresh = () => {
    void mutate();
    onDone();
  };

  return (
    <div className="card" style={{ padding: 20, marginBottom: 22 }}>
      <div style={label}>
        <ShieldCheck size={14} /> Co-approval — {round.approvals_needed} of {round.co_approvers.length} must sign off
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {(data?.approvers ?? round.co_approvers.map((a) => ({ address: a, vote: "PENDING" as const }))).map((a) => (
          <div
            key={a.address}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: "0.85rem" }}
          >
            <span className="mono" style={{ color: "var(--cream-dim)" }}>
              {shortAddress(a.address, 6)}
              {sameAddress(a.address, account) && <span style={{ color: "var(--gold)" }}> (you)</span>}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color:
                  a.vote === "APPROVE" ? "var(--emerald)" : a.vote === "REJECT" ? "var(--rose)" : "var(--muted)",
              }}
            >
              {a.vote === "APPROVE" ? <ThumbsUp size={14} /> : a.vote === "REJECT" ? <ThumbsDown size={14} /> : <Clock size={14} />}
              {a.vote.toLowerCase()}
            </span>
          </div>
        ))}
      </div>
      <p style={{ margin: "14px 0 0", fontSize: "0.81rem", color: "var(--muted)", lineHeight: 1.6 }}>
        Approvers sign off on a ranking that is already decided — they cannot
        change a criterion, a score or a seat. The signature that makes the
        majority ranks the round in the same transaction. If they never sign,
        the requirement lapses at <strong>{formatTime(round.approval_lapses_at)}</strong>{" "}
        and anyone may finalize, so nobody&apos;s deposit is frozen by a silence.
      </p>
      {round.approval_outcome && (
        <p style={{ margin: "10px 0 0", fontSize: "0.84rem", color: "var(--gold)" }}>
          <CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> Ranked on{" "}
          {round.approval_outcome === "APPROVED" ? "a majority sign-off" : "a lapse of the approval window"}.
        </p>
      )}
      {canVote && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <TxButton
            label="Approve the ranking"
            pendingLabel="Signing…"
            icon={<ThumbsUp size={16} />}
            send={(acc) => approveFinalization(acc, round.round_id)}
            onDone={refresh}
          />
          <TxButton
            label="Object"
            className="btn btn-ghost"
            icon={<ThumbsDown size={16} />}
            send={(acc) => rejectFinalization(acc, round.round_id)}
            onDone={refresh}
          />
        </div>
      )}
      {mine && !canVote && (round.status === "OPEN" || round.status === "EVALUATING") && (
        <p style={{ margin: "12px 0 0", fontSize: "0.8rem", color: "var(--amber)" }}>
          You can vote once the deadline has passed and every proposal is scored or skipped.
        </p>
      )}
    </div>
  );
}

/** Treasurer tools that are new in the milestone build. */
export function TreasurerTools({ round, onDone }: { round: Round; onDone: () => void }) {
  const { account } = useWallet();
  const isTreasurer = sameAddress(account, round.treasurer);
  const { data: route, mutate } = useRemainderRoute(isTreasurer ? round.round_id : null, account);
  if (!isTreasurer) return null;
  const canExtend =
    round.status === "OPEN" &&
    round.seconds_remaining > 0 &&
    round.extensions_left > 0 &&
    round.proposal_count < round.max_proposals;
  const refresh = () => {
    void mutate();
    onDone();
  };
  const moving = route && (route.step === "book" || route.step === "sweep");
  if (!canExtend && !route) return null;
  return (
    <>
      {canExtend && (
        <TxButton
          label="Extend by 3 days"
          className="btn btn-ghost"
          icon={<CalendarPlus size={16} />}
          title={`${round.extensions_left} extension(s) left, at most 7 days each. Nothing else about the round changes.`}
          send={(acc) => extendDeadline(acc, round.round_id, 3 * 86400)}
          onDone={refresh}
        />
      )}
      {moving && (
        <>
          <TxButton
            label={
              route.step === "book"
                ? `Take the ${formatGen(round.remainder_wei)} GEN remainder`
                : `Withdraw ${formatGen(route.claimable_wei)} GEN`
            }
            pendingLabel="Routing the remainder…"
            icon={<HandCoins size={16} />}
            title="One click: books the remainder and sweeps it, without the one-call path this network cannot fee-estimate."
            send={(acc) => takeRemainder(acc, round.round_id)}
            onDone={refresh}
          />
          <span style={{ fontSize: "0.79rem", color: "var(--muted)", alignSelf: "center", maxWidth: 420, lineHeight: 1.5 }}>
            One click. The app books the remainder with{" "}
            <code>claim_remainder_fallback</code> and sweeps it with{" "}
            <code>claim_payout</code> — the one-call form cannot be
            fee-estimated on this network, and a contract cannot catch a failure
            that happens before it runs.
          </span>
        </>
      )}
      {route?.step === "wait" && round.status === "RANKED" && (
        <span style={{ fontSize: "0.8rem", color: "var(--muted)", alignSelf: "center" }}>
          <Countdown deadline={round.contest_closes_at} prefix="remainder claimable in " expired="remainder claimable" />
        </span>
      )}
    </>
  );
}

/** Per-criterion spread, the band distribution and the rates — all from stored scores. */
export function AnalyticsPanel({ round }: { round: Round }) {
  const enabled = round.evaluated_count > 0;
  const { data } = useAnalytics(round.round_id, enabled);
  if (!enabled || !data?.found || data.scored_count === 0) return null;
  const peak = Math.max(1, ...data.distribution);
  return (
    <div className="card" style={{ padding: 20, marginBottom: 22 }}>
      <div style={label}>
        <BarChart3 size={14} /> Round analytics — computed from stored scores, no consensus needed
      </div>
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div style={{ display: "grid", gap: 9 }}>
          {data.criteria.map((c) => (
            <div key={c.name} style={{ fontSize: "0.82rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "var(--cream-dim)" }}>
                <span>{c.name}</span>
                <span className="mono" style={{ color: "var(--gold)" }}>
                  {(c.mean / 100).toFixed(2)} ± {(c.stddev / 100).toFixed(2)}
                </span>
              </div>
              <div style={{ position: "relative", height: 6, borderRadius: 999, background: "rgba(0,0,0,0.35)", marginTop: 5 }}>
                <div
                  style={{
                    position: "absolute",
                    left: `${(c.min / 700) * 100}%`,
                    width: `${Math.max(1.5, ((c.max - c.min) / 700) * 100)}%`,
                    top: 0,
                    bottom: 0,
                    borderRadius: 999,
                    background: "rgba(212,168,71,0.35)",
                  }}
                  title={`min ${(c.min / 100).toFixed(2)} · max ${(c.max / 100).toFixed(2)}`}
                />
                <div
                  style={{
                    position: "absolute",
                    left: `calc(${(c.mean / 700) * 100}% - 1px)`,
                    width: 3,
                    top: -2,
                    bottom: -2,
                    borderRadius: 2,
                    background: "var(--gold-bright)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }} aria-label="score distribution by band">
            {data.distribution.map((n, band) => (
              <div key={band} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div
                  style={{
                    width: "100%",
                    height: `${(n / peak) * 60}px`,
                    minHeight: n > 0 ? 4 : 1,
                    borderRadius: 4,
                    background: band * 100 >= data.threshold ? "var(--gold)" : "rgba(201,112,112,0.55)",
                  }}
                  title={`${n} proposal(s) scored ${band}.00–${band}.99`}
                />
                <span style={{ fontSize: "0.66rem", color: "var(--muted)" }}>{band}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12, fontSize: "0.8rem", color: "var(--cream-dim)" }}>
            <span>mean {(data.mean_score / 100).toFixed(2)}</span>
            <span>funded {(data.funding_rate_bps / 100).toFixed(1)}%</span>
            <span>
              appeals won{" "}
              {data.contested_count > 0 ? `${(data.contest_success_bps / 100).toFixed(0)}%` : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
