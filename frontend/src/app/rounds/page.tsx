"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, Coins, Filter, PlusCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RoundCard } from "@/components/RoundCard";
import { EmptyState, ErrorState, SkeletonGrid } from "@/components/States";
import { useAllRounds } from "@/lib/hooks";
import { toBigInt } from "@/lib/format";
import type { RoundCard as RoundCardData } from "@/types";

type FilterKey = "open" | "evaluating" | "finalized" | "all";
type SortKey = "pool" | "newest" | "ending";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "evaluating", label: "Evaluating" },
  { key: "finalized", label: "Finalized" },
  { key: "all", label: "All" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "pool", label: "Largest pool" },
  { key: "newest", label: "Newest" },
  { key: "ending", label: "Ending soon" },
];

function matches(round: RoundCardData, key: FilterKey): boolean {
  if (key === "all") return true;
  if (key === "open") return round.phase === "OPEN";
  if (key === "evaluating") return round.phase === "EVALUATING" || round.phase === "CLOSED";
  return round.status === "RANKED" || round.status === "FINALIZED";
}

export default function RoundsPage() {
  const { data, error, isLoading, mutate } = useAllRounds();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const rounds = useMemo(() => {
    const all = data?.rounds ?? [];
    const kept = all.filter((r) => matches(r, filter));
    const sorted = [...kept];
    if (sort === "pool") {
      sorted.sort((a, b) => (toBigInt(b.pool_wei) > toBigInt(a.pool_wei) ? 1 : -1));
    } else if (sort === "newest") {
      sorted.sort((a, b) => b.created_at - a.created_at);
    } else {
      // Ending soon: open rounds by deadline first, then everything else.
      sorted.sort((a, b) => {
        const aOpen = a.phase === "OPEN" ? 0 : 1;
        const bOpen = b.phase === "OPEN" ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        return a.deadline - b.deadline;
      });
    }
    return sorted;
  }, [data, filter, sort]);

  return (
    <AppShell
      wide
      eyebrow="Grant rounds"
      title="Every round on this contract"
      blurb="Open rounds are taking proposals. Evaluating rounds have closed and are being scored, one consensus round per proposal. Finalized rounds have paid out — and every award is re-derivable from storage."
      actions={
        <Link href="/create" className="btn btn-primary">
          <PlusCircle size={16} /> Create a round
        </Link>
      }
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Filter size={15} color="var(--muted)" />
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="btn"
              style={{
                padding: "5px 12px",
                fontSize: "0.82rem",
                background: filter === key ? "rgba(212,168,71,0.12)" : "rgba(255,255,255,0.03)",
                color: filter === key ? "var(--gold)" : "var(--cream-dim)",
                borderColor: filter === key ? "rgba(212,168,71,0.4)" : "var(--line)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ArrowDownWideNarrow size={15} color="var(--muted)" />
          <select
            className="select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            style={{ width: "auto", padding: "6px 10px", fontSize: "0.82rem" }}
            aria-label="Sort rounds"
          >
            {SORTS.map(({ key, label }) => (
              <option key={key} value={key} style={{ background: "var(--surface)" }}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <SkeletonGrid count={6} />}
      {error && <ErrorState onRetry={() => mutate()} message={(error as Error).message} />}

      {!isLoading && !error && rounds.length === 0 && (
        <EmptyState
          icon={<Coins size={26} strokeWidth={1.6} />}
          title={filter === "all" ? "No rounds yet" : `No ${filter} rounds`}
          message={
            filter === "all"
              ? "Nothing has been posted to this contract. Open the first round and set the criteria yourself."
              : "Try another filter, or open a round of your own."
          }
          action={
            <Link href="/create" className="btn btn-primary">
              <PlusCircle size={16} /> Create a round
            </Link>
          }
        />
      )}

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        }}
      >
        {rounds.map((round, i) => (
          <RoundCard key={round.round_id} round={round} index={i} />
        ))}
      </div>
    </AppShell>
  );
}
