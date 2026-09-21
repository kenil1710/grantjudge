"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Crown, Gavel, Percent, ShieldAlert, SkipForward, Trophy, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ErrorState, SkeletonGrid } from "@/components/States";
import { CountUp } from "@/components/CountUp";
import { useAllRounds, useStats } from "@/lib/hooks";
import { formatGen, formatTime, scorePct, scoreText, shortAddress, toBigInt } from "@/lib/format";
import { RoundBadge } from "@/components/StatusBadge";
import { useRankings } from "@/lib/hooks";

export default function VerdictsPage() {
  const { data: stats } = useStats();
  const { data, error, isLoading, mutate } = useAllRounds();

  const settled = useMemo(
    () =>
      (data?.rounds ?? [])
        .filter((r) => r.status === "RANKED" || r.status === "FINALIZED")
        .sort((a, b) => b.finalized_at - a.finalized_at),
    [data],
  );

  const distributed = Number(formatGen(stats?.total_awarded_wei ?? "0", 2).replace(/,/g, ""));
  const decided = (stats?.funded_proposals ?? 0) + (stats?.qualified_proposals ?? 0) + (stats?.rejected_proposals ?? 0);

  return (
    <AppShell
      wide
      eyebrow="The record"
      title="Verdicts"
      blurb="Every round that has been ranked, with what each proposal scored and what it was paid. Nothing here is editable and nothing here was decided by one party."
    >
      <div
        className="card"
        style={{
          padding: "24px 22px",
          marginBottom: 24,
          display: "grid",
          gap: 20,
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          background: "linear-gradient(180deg, rgba(23,54,45,0.6), rgba(15,37,31,0.6))",
        }}
      >
        <Stat Icon={Trophy} label="GEN distributed" value={distributed} decimals={2} />
        <Stat Icon={Gavel} label="Proposals decided" value={decided} />
        <Stat Icon={Crown} label="Funded" value={stats?.funded_proposals ?? 0} />
        <Stat Icon={XCircle} label="Rejected" value={stats?.rejected_proposals ?? 0} />
        <Stat Icon={ShieldAlert} label="Appeals heard" value={stats?.contests ?? 0} />
        <Stat Icon={SkipForward} label="Skipped" value={stats?.skipped_proposals ?? 0} />
      </div>

      {isLoading && <SkeletonGrid count={3} />}
      {error && <ErrorState onRetry={() => mutate()} message={(error as Error).message} />}

      {!isLoading && !error && settled.length === 0 && (
        <EmptyState
          icon={<Gavel size={26} strokeWidth={1.6} />}
          title="No round has been ranked yet"
          message="A verdict appears here the moment a round is finalised. Until then the rounds page shows what is still open and what is being scored."
          action={
            <Link href="/rounds" className="btn btn-primary">
              Browse rounds
            </Link>
          }
        />
      )}

      <div style={{ display: "grid", gap: 18 }}>
        {settled.map((round) => (
          <VerdictCard key={round.round_id} roundId={round.round_id} />
        ))}
      </div>
    </AppShell>
  );
}

function VerdictCard({ roundId }: { roundId: number }) {
  const { data: rankings } = useRankings(roundId);
  const { data } = useAllRounds();
  const round = (data?.rounds ?? []).find((r) => r.round_id === roundId);
  if (!round || !rankings?.found) {
    return <div className="skeleton" style={{ height: 180, borderRadius: 14 }} />;
  }

  const rows = rankings.rows ?? [];
  const scores = rows.map((r) => r.score);
  const average = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "20px 22px",
          borderBottom: "1px solid var(--line-soft)",
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <RoundBadge phase={round.phase} size="sm" />
            <span className="mono" style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
              round #{round.round_id} · ranked {formatTime(round.finalized_at)}
            </span>
          </div>
          <Link href={`/round/${round.round_id}`} className="serif" style={{ fontSize: "1.2rem", color: "var(--cream)", textDecoration: "none" }}>
            {round.name}
          </Link>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="serif" style={{ fontSize: "1.5rem", color: "var(--gold-bright)", lineHeight: 1 }}>
            {formatGen(round.allocated_wei)} GEN
          </div>
          <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 4 }}>
            of a {formatGen(round.pool_wei)} GEN pool
          </div>
        </div>
      </div>

      <div style={{ padding: "10px 12px 14px" }}>
        {rows.map((row) => {
          const funded = row.status === "FUNDED";
          return (
            <div
              key={row.proposal_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: funded ? "rgba(255,215,0,0.05)" : "transparent",
              }}
            >
              <span
                style={{
                  width: 23,
                  height: 23,
                  borderRadius: 7,
                  display: "grid",
                  placeItems: "center",
                  fontSize: "0.72rem",
                  flexShrink: 0,
                  fontWeight: 600,
                  color: funded ? "#241a05" : "var(--cream-dim)",
                  background: funded ? "var(--gold-bright)" : "rgba(255,255,255,0.05)",
                }}
              >
                {row.rank}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: "0.8rem", color: "var(--cream-dim)" }}>
                    {shortAddress(row.author)}
                  </span>
                  {row.contest_status === "WON" && (
                    <span style={{ fontSize: "0.7rem", color: "var(--amber)" }}>won on appeal</span>
                  )}
                  {row.contest_status === "LOST" && (
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>appeal lost</span>
                  )}
                </div>
                <div style={{ height: 5, borderRadius: 999, background: "rgba(0,0,0,0.35)", marginTop: 6, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${scorePct(row.score)}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: funded
                        ? "linear-gradient(90deg, var(--gold), var(--gold-bright))"
                        : row.qualifies
                          ? "linear-gradient(90deg, var(--gold-dim), var(--gold))"
                          : "linear-gradient(90deg, #6d4141, var(--rose))",
                    }}
                  />
                </div>
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--gold)", width: 44, textAlign: "right", flexShrink: 0 }}>
                {row.score_text}
              </span>
              <span
                style={{
                  width: 76,
                  textAlign: "right",
                  fontSize: "0.8rem",
                  flexShrink: 0,
                  color: funded ? "var(--gold-bright)" : "var(--muted)",
                }}
              >
                {formatGen(row.award_wei)}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--line-soft)",
          padding: "12px 22px",
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          fontSize: "0.77rem",
          color: "var(--muted)",
        }}
      >
        <span>
          <Percent size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
          average score {scoreText(average)}
        </span>
        <span>bar {scoreText(rankings.threshold)}</span>
        <span>{rankings.winner_count} funded of {rankings.rows.length} ranked</span>
        {toBigInt(round.allocated_wei) > 0n && (
          <span>
            remainder {formatGen(rankings.remainder_wei)} GEN
          </span>
        )}
        <Link href={`/round/${round.round_id}`} style={{ marginLeft: "auto", color: "var(--gold)", textDecoration: "none" }}>
          Full round →
        </Link>
      </div>
    </div>
  );
}

function Stat({
  Icon,
  label,
  value,
  decimals = 0,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  value: number;
  decimals?: number;
}) {
  return (
    <div>
      <Icon size={16} color="var(--gold)" strokeWidth={1.8} />
      <div className="serif" style={{ fontSize: "1.65rem", color: "var(--gold-bright)", marginTop: 8, lineHeight: 1 }}>
        <CountUp value={value} decimals={decimals} />
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 6 }}>{label}</div>
    </div>
  );
}
