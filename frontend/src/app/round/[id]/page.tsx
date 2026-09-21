"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Coins,
  FilePlus2,
  Gavel,
  HandCoins,
  Hash,
  Percent,
  Timer,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RoundBadge } from "@/components/StatusBadge";
import { Countdown } from "@/components/Countdown";
import { ProposalPanel } from "@/components/ProposalPanel";
import { TxButton } from "@/components/TxButton";
import { EmptyState, ErrorState, SkeletonCard, SkeletonGrid } from "@/components/States";
import { useProposals, useRankings, useRound } from "@/lib/hooks";
import { cancelRound, claimRemainder, finalize } from "@/lib/contract";
import { useWallet } from "@/components/WalletProvider";
import { formatGen, formatTime, sameAddress, scoreText, shortAddress } from "@/lib/format";

export default function RoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const roundId = Number(id);
  const { data: round, error, isLoading, mutate: reloadRound } = useRound(roundId, true);
  /**
   * Poll the heavy reads only while the round is actually in motion.
   *
   * Studio Dev meters requests per minute, and three polling hooks on an open
   * page is fifteen reads a minute for a round that has been settled for a
   * week. A finalised round changes only when somebody claims, and a claim
   * already revalidates through `reload`.
   */
  const live = round
    ? round.status !== "FINALIZED" && round.status !== "CANCELLED"
    : false;
  const { data: proposals, mutate: reloadProposals } = useProposals(roundId, live);
  const { data: rankings, mutate: reloadRankings } = useRankings(roundId, live);
  const { account } = useWallet();

  const reload = () => {
    void reloadRound();
    void reloadProposals();
    void reloadRankings();
  };

  const ordered = useMemo(() => {
    const list = proposals?.proposals ?? [];
    const order = new Map((rankings?.rows ?? []).map((row, i) => [row.proposal_id, i]));
    return [...list].sort((a, b) => {
      const ai = order.get(a.proposal_id);
      const bi = order.get(b.proposal_id);
      if (ai === undefined && bi === undefined) return a.proposal_id - b.proposal_id;
      if (ai === undefined) return 1;
      if (bi === undefined) return -1;
      return ai - bi;
    });
  }, [proposals, rankings]);

  if (isLoading) {
    return (
      <AppShell wide>
        <SkeletonCard height={220} lines={4} />
        <div style={{ height: 22 }} />
        <SkeletonGrid count={3} />
      </AppShell>
    );
  }

  if (error || !round?.found) {
    return (
      <AppShell wide title="Round not found">
        <ErrorState
          title={round && !round.found ? `No round #${id}` : undefined}
          message={round?.reason ?? (error as Error)?.message}
          onRetry={reload}
        />
      </AppShell>
    );
  }

  const isTreasurer = sameAddress(account, round.treasurer);
  const pending = round.pending_count;
  const canFinalize =
    (round.status === "OPEN" || round.status === "EVALUATING") &&
    round.seconds_remaining === 0 &&
    pending === 0;
  const canCancel = isTreasurer && round.status === "OPEN" && round.proposal_count === 0;
  const canClaimRemainder =
    isTreasurer && round.status === "RANKED" && !round.contest_open && !round.remainder_claimed;

  return (
    <AppShell wide>
      <Link
        href="/rounds"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)", textDecoration: "none", fontSize: "0.84rem", marginBottom: 18 }}
      >
        <ArrowLeft size={15} /> All rounds
      </Link>

      {/* --- header ------------------------------------------------------- */}
      <div className="card" style={{ padding: "clamp(20px, 3.5vw, 30px)", marginBottom: 22 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: "1 1 340px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <RoundBadge phase={round.phase} />
              <span className="mono" style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                round #{round.round_id} · treasurer {shortAddress(round.treasurer, 6)}
              </span>
            </div>
            <h1 style={{ margin: "0 0 12px", fontSize: "clamp(1.6rem, 4vw, 2.2rem)", lineHeight: 1.16 }}>
              {round.name}
            </h1>
            <p style={{ margin: 0, color: "var(--cream-dim)", fontSize: "0.93rem", lineHeight: 1.65, maxWidth: 620 }}>
              {round.description}
            </p>
          </div>

          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div className="serif" style={{ fontSize: "clamp(2rem, 5vw, 2.8rem)", color: "var(--gold-bright)", lineHeight: 1 }}>
              {formatGen(round.pool_wei)}
            </div>
            <div style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: 5 }}>GEN pool</div>
            {round.phase === "OPEN" && (
              <div style={{ marginTop: 12 }}>
                <Countdown deadline={round.deadline} prefix="closes in " expired="closed" />
              </div>
            )}
            {round.contest_open && (
              <div style={{ marginTop: 10 }}>
                <Countdown deadline={round.contest_closes_at} prefix="appeals close in " expired="appeals closed" />
              </div>
            )}
          </div>
        </div>

        {/* facts */}
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            marginTop: 24,
            paddingTop: 20,
            borderTop: "1px solid var(--line-soft)",
          }}
        >
          <Fact Icon={Trophy} label="Bar to clear" value={`${scoreText(round.min_score_threshold)} / 7.00`} />
          <Fact Icon={Users} label="Seats" value={`${round.max_winners} of ${round.max_proposals} max`} />
          <Fact Icon={FilePlus2} label="Proposals" value={`${round.proposal_count} filed`} />
          <Fact Icon={Coins} label="Deposit" value={`${formatGen(round.spam_stake_wei)} GEN`} />
          <Fact Icon={Timer} label="Deadline" value={formatTime(round.deadline)} />
          {round.finalized_at > 0 && (
            <Fact Icon={Gavel} label="Ranked" value={formatTime(round.finalized_at)} />
          )}
        </div>

        {/* criteria */}
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line-soft)" }}>
          <div style={{ fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 14 }}>
            The rubric — fixed when the round opened, and there is no setter for it
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            {round.criteria.map((c) => (
              <div
                key={c.position}
                style={{
                  padding: "13px 15px",
                  borderRadius: 11,
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--line-soft)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <strong style={{ fontSize: "0.9rem", color: "var(--cream)" }}>{c.name}</strong>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--gold)", fontSize: "0.82rem", flexShrink: 0 }}>
                    {c.weight_bps / 100}
                    <Percent size={11} />
                  </span>
                </div>
                {c.description && (
                  <p style={{ margin: "7px 0 0", fontSize: "0.8rem", lineHeight: 1.55, color: "var(--muted)" }}>
                    {c.description}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="mono" style={{ marginTop: 12, fontSize: "0.69rem", color: "var(--muted)", display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span><Hash size={11} style={{ verticalAlign: -1 }} /> rubric {round.criteria_hash}</span>
            <span><Hash size={11} style={{ verticalAlign: -1 }} /> config {round.config_hash}</span>
          </div>
        </div>

        {/* settlement summary */}
        {(round.status === "RANKED" || round.status === "FINALIZED") && (
          <div
            style={{
              marginTop: 22,
              padding: "16px 18px",
              borderRadius: 12,
              background: "rgba(212,168,71,0.06)",
              border: "1px solid rgba(212,168,71,0.2)",
              display: "grid",
              gap: 14,
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            }}
          >
            <Fact Icon={HandCoins} label="Awarded" value={`${formatGen(round.allocated_wei)} GEN`} gold />
            <Fact Icon={Coins} label="Remainder" value={`${formatGen(round.remainder_wei)} GEN`} />
            <Fact Icon={XCircle} label="Forfeited deposits" value={`${formatGen(round.forfeited_wei)} GEN`} />
            <Fact Icon={Trophy} label="Outcome" value={`${round.funded_count} funded · ${round.qualified_count} qualified · ${round.rejected_count} rejected · ${round.skipped_count} skipped`} />
          </div>
        )}

        {/* actions */}
        <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 12 }}>
          {round.phase === "OPEN" && (
            <Link href={`/propose?round=${round.round_id}`} className="btn btn-primary">
              <FilePlus2 size={16} /> Submit your proposal
            </Link>
          )}
          {canFinalize && (
            <TxButton
              label="Finalize the round"
              pendingLabel="Ranking…"
              icon={<Gavel size={16} />}
              title="Permissionless. Reads the agreed scores, ranks them and splits the pool — no model is consulted."
              send={(account) => finalize(account, round.round_id)}
              onDone={reload}
            />
          )}
          {canCancel && (
            <TxButton
              label="Cancel and reclaim the pool"
              className="btn btn-ghost"
              icon={<XCircle size={16} />}
              title="Only possible while no proposal has been filed."
              send={(account) => cancelRound(account, round.round_id)}
              onDone={reload}
            />
          )}
          {canClaimRemainder && (
            <TxButton
              label={`Claim ${formatGen(round.remainder_wei)} GEN remainder`}
              icon={<HandCoins size={16} />}
              send={(account) => claimRemainder(account, round.round_id)}
              onDone={reload}
            />
          )}
          {round.status === "RANKED" && round.contest_open && isTreasurer && (
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", alignSelf: "center", maxWidth: 420, lineHeight: 1.5 }}>
              The remainder is claimable once the appeal window closes — a
              successful appeal is paid out of it.
            </span>
          )}
        </div>
      </div>

      {/* --- progress ----------------------------------------------------- */}
      {(round.phase === "EVALUATING" || round.phase === "CLOSED") && round.proposal_count > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <strong style={{ fontSize: "0.92rem" }}>
              Scoring — one consensus round per proposal
            </strong>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
              {round.evaluated_count + round.skipped_count} of {round.proposal_count} resolved
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,0.35)", overflow: "hidden" }}>
            <div
              style={{
                width: `${((round.evaluated_count + round.skipped_count) / Math.max(1, round.proposal_count)) * 100}%`,
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(90deg, var(--teal), var(--gold))",
                transition: "width 600ms ease",
              }}
            />
          </div>
          <p style={{ margin: "12px 0 0", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.6 }}>
            Anyone may trigger an evaluation and nobody is paid for it. A round
            that does not settle — because two validators read the proposal onto
            opposite sides of the bar — writes nothing and can be run again.
          </p>
        </div>
      )}

      {/* --- proposals ---------------------------------------------------- */}
      {round.proposal_count === 0 ? (
        <EmptyState
          title="No proposals yet"
          message={
            round.phase === "OPEN"
              ? "Nobody has filed to this round. Be the first — the deposit comes back in full if you clear the bar."
              : "This round closed without a single proposal, so the whole pool goes back to the treasurer."
          }
          action={
            round.phase === "OPEN" ? (
              <Link href={`/propose?round=${round.round_id}`} className="btn btn-primary">
                <FilePlus2 size={16} /> Submit a proposal
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {ordered.map((proposal, i) => (
            <ProposalPanel
              key={proposal.proposal_id}
              proposal={proposal}
              round={round}
              index={i}
              onChanged={reload}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function Fact({
  Icon,
  label,
  value,
  gold,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.71rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
        <Icon size={13} strokeWidth={1.9} />
        {label}
      </div>
      <div style={{ marginTop: 5, fontSize: "0.9rem", color: gold ? "var(--gold-bright)" : "var(--cream)", lineHeight: 1.45 }}>
        {value}
      </div>
    </div>
  );
}
