"use client";

import Link from "next/link";
import { ArrowUpRight, Crown } from "lucide-react";
import { useAllRounds, useRankings } from "@/lib/hooks";
import { formatGen, scorePct, shortAddress } from "@/lib/format";
import { SkeletonCard } from "./States";

/**
 * A REAL round, read off the chain, shown on the landing page.
 *
 * It picks the most recently finalised round with at least one funded proposal
 * — which means this section is empty on a chain with no history, and says so,
 * rather than shipping a hardcoded example that would keep looking healthy long
 * after the contract stopped working.
 */
export function LiveExample() {
  const { data: rounds, isLoading } = useAllRounds();
  const settled = (rounds?.rounds ?? [])
    .filter((r) => (r.status === "RANKED" || r.status === "FINALIZED") && r.funded_count > 0)
    .sort((a, b) => b.finalized_at - a.finalized_at)[0];
  const { data: rankings } = useRankings(settled?.round_id ?? null);

  if (isLoading) return <SkeletonCard height={280} lines={5} />;
  if (!settled) {
    return (
      <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>
        No round has been settled on this deployment yet. The example appears
        here as soon as one is.
      </div>
    );
  }

  const rows = rankings?.rows ?? [];

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "20px 22px",
          borderBottom: "1px solid var(--line-soft)",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: "0.72rem", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 5 }}>
            A settled round, read live from the chain
          </div>
          <h3 style={{ margin: 0, fontSize: "1.25rem" }}>{settled.name}</h3>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="serif" style={{ fontSize: "1.6rem", color: "var(--gold-bright)", lineHeight: 1 }}>
            {formatGen(settled.pool_wei)} GEN
          </div>
          <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 4 }}>
            {formatGen(settled.allocated_wei)} awarded across {settled.funded_count}
          </div>
        </div>
      </div>

      <div style={{ padding: "8px 10px 12px" }}>
        {rows.slice(0, 5).map((row) => {
          const funded = row.status === "FUNDED";
          return (
            <div
              key={row.proposal_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 12px",
                borderRadius: 10,
                background: funded ? "rgba(255,215,0,0.05)" : "transparent",
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  display: "grid",
                  placeItems: "center",
                  fontSize: "0.74rem",
                  flexShrink: 0,
                  fontWeight: 600,
                  color: funded ? "#241a05" : "var(--cream-dim)",
                  background: funded ? "var(--gold-bright)" : "rgba(255,255,255,0.05)",
                }}
              >
                {row.rank}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.84rem" }}>
                  <span className="mono" style={{ color: "var(--cream-dim)" }}>{shortAddress(row.author)}</span>
                  {funded && <Crown size={13} color="var(--gold-bright)" />}
                  <span style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
                    {row.contest_status === "WON" ? "· won on appeal" : row.contest_status === "LOST" ? "· appeal lost" : ""}
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 999, background: "rgba(0,0,0,0.35)", marginTop: 7, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${scorePct(row.score)}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: funded
                        ? "linear-gradient(90deg, var(--gold), var(--gold-bright))"
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
                  width: 74,
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

      <Link
        href={`/round/${settled.round_id}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          padding: "13px",
          borderTop: "1px solid var(--line-soft)",
          color: "var(--gold)",
          textDecoration: "none",
          fontSize: "0.86rem",
        }}
      >
        See the full round, every score and every hash <ArrowUpRight size={15} />
      </Link>
    </div>
  );
}
