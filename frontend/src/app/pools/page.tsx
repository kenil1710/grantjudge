"use client";

import Link from "next/link";
import { Flag, Layers, LibraryBig, PlusCircle, ShieldCheck, Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ErrorState, SkeletonGrid } from "@/components/States";
import { usePools } from "@/lib/hooks";
import { formatGen, scoreText, shortAddress } from "@/lib/format";

export default function PoolsPage() {
  const { data, error, isLoading, mutate } = usePools();
  const pools = data?.pools ?? [];

  return (
    <AppShell
      wide
      eyebrow="Pools"
      title="Multi-round pools"
      blurb="A pool runs the same rubric round after round, funded from a reserve the treasurer tops up. A proposal the pool has already read cannot be filed again word for word."
      actions={
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/templates" className="btn btn-ghost">
            <LibraryBig size={16} /> Templates
          </Link>
          <Link href="/create?pool=1" className="btn btn-primary">
            <PlusCircle size={16} /> Open a pool
          </Link>
        </div>
      }
    >
      {isLoading && <SkeletonGrid count={3} />}
      {error && <ErrorState onRetry={() => mutate()} message={(error as Error).message} />}
      {!isLoading && !error && pools.length === 0 && (
        <EmptyState
          icon={<Layers size={26} strokeWidth={1.6} />}
          title="No pools yet"
          message="Open one from the create wizard, or from a saved template."
          action={
            <Link href="/create?pool=1" className="btn btn-primary">
              Open a pool
            </Link>
          }
        />
      )}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {pools.map((p) => (
          <Link
            key={p.pool_id}
            href={`/pool/${p.pool_id}`}
            className="card card-hover"
            style={{ padding: 20, textDecoration: "none", color: "inherit", display: "block" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <span className="mono" style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                pool #{p.pool_id} · {shortAddress(p.treasurer)}
              </span>
              <span style={{ fontSize: "0.78rem", color: "var(--teal)" }}>
                {p.round_count} {p.round_count === 1 ? "round" : "rounds"}
              </span>
            </div>
            <h3 className="serif" style={{ margin: "8px 0 10px", fontSize: "1.2rem" }}>{p.name}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {p.criteria.map((c) => (
                <span key={c.position} className="chip" style={{ fontSize: "0.72rem" }}>
                  {c.name} {c.weight_pct}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: "0.78rem", color: "var(--cream-dim)" }}>
              <span>bar {scoreText(p.min_score_threshold)}</span>
              <span>{p.max_winners} seats</span>
              {p.approvals_needed > 0 && (
                <span><ShieldCheck size={12} style={{ verticalAlign: -2 }} /> {p.approvals_needed}/{p.co_approvers.length} sign-off</span>
              )}
              {p.milestones.length > 0 && (
                <span><Flag size={12} style={{ verticalAlign: -2 }} /> {p.milestones.map((m) => `${m.percentage}%`).join(" / ")}</span>
              )}
              {p.min_reputation > 0 && (
                <span><Star size={12} style={{ verticalAlign: -2 }} /> {p.min_reputation}+ funded to enter</span>
              )}
            </div>
            <div style={{ marginTop: 14, fontSize: "0.82rem", color: "var(--gold)" }}>
              reserve {formatGen(p.reserve_wei)} GEN · topped up {formatGen(p.topped_up_wei)} GEN in total
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
