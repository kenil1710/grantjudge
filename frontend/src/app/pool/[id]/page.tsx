"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Coins,
  Flag,
  HandCoins,
  Hash,
  Layers,
  LibraryBig,
  PlusCircle,
  ShieldCheck,
  Star,
  Trophy,
  Undo2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RoundBadge } from "@/components/StatusBadge";
import { TxButton } from "@/components/TxButton";
import { ErrorState, SkeletonCard } from "@/components/States";
import { useWallet } from "@/components/WalletProvider";
import { usePoolHistory } from "@/lib/hooks";
import { createNextRound, createTemplate, topUpPool, withdrawReserve } from "@/lib/contract";
import { formatGen, formatTime, parseGen, sameAddress, scoreText, shortAddress } from "@/lib/format";

export default function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const poolId = Number(id);
  const { data, error, isLoading, mutate } = usePoolHistory(poolId);
  const { account } = useWallet();
  const [topUp, setTopUp] = useState("2");
  const [templateName, setTemplateName] = useState("");

  if (isLoading) {
    return (
      <AppShell wide>
        <SkeletonCard height={260} lines={5} />
      </AppShell>
    );
  }
  if (error || !data?.found) {
    return (
      <AppShell wide title="Pool not found">
        <ErrorState message={data?.reason ?? (error as Error)?.message} onRetry={() => mutate()} />
      </AppShell>
    );
  }

  const pool = data.pool;
  const isTreasurer = sameAddress(account, pool.treasurer);
  const latest = data.rounds[data.rounds.length - 1];
  const latestLive = latest && (latest.status === "OPEN" || latest.status === "EVALUATING");
  const reserve = BigInt(pool.reserve_wei);
  const reload = () => void mutate();
  const criteriaJson = JSON.stringify(
    pool.criteria.map((c) => ({ name: c.name, description: c.description, weight_bps: c.weight_bps })),
  );

  return (
    <AppShell wide>
      <Link
        href="/pools"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)", textDecoration: "none", fontSize: "0.84rem", marginBottom: 18 }}
      >
        <ArrowLeft size={15} /> All pools
      </Link>

      <div className="card" style={{ padding: "clamp(20px, 3.5vw, 30px)", marginBottom: 22 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between" }}>
          <div style={{ minWidth: 0, flex: "1 1 340px" }}>
            <span className="mono" style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
              <Layers size={12} style={{ verticalAlign: -1 }} /> pool #{pool.pool_id} · treasurer {shortAddress(pool.treasurer, 6)}
              {pool.template_id > 0 && ` · template #${pool.template_id}`}
            </span>
            <h1 style={{ margin: "10px 0 12px", fontSize: "clamp(1.6rem, 4vw, 2.2rem)" }}>{pool.name}</h1>
            <p style={{ margin: 0, color: "var(--cream-dim)", fontSize: "0.93rem", lineHeight: 1.65, maxWidth: 620 }}>
              {pool.description}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="serif" style={{ fontSize: "clamp(2rem, 5vw, 2.6rem)", color: "var(--gold-bright)", lineHeight: 1 }}>
              {formatGen(pool.reserve_wei)}
            </div>
            <div style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: 5 }}>GEN in reserve for the next round</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line-soft)" }}>
          <Stat Icon={Layers} label="Rounds" value={String(data.total_rounds)} />
          <Stat Icon={Coins} label="Pooled" value={`${formatGen(data.total_pool_wei)} GEN`} />
          <Stat Icon={Trophy} label="Proposals / funded" value={`${data.total_proposals} / ${data.total_funded}`} />
          <Stat Icon={HandCoins} label="Distributed" value={`${formatGen(data.total_distributed_wei)} GEN`} gold />
        </div>

        <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {pool.criteria.map((c) => (
            <span key={c.position} className="chip">{c.name} · {c.weight_pct}</span>
          ))}
        </div>
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 16, fontSize: "0.82rem", color: "var(--cream-dim)" }}>
          <span>bar {scoreText(pool.min_score_threshold)} / 7.00</span>
          <span>{pool.max_winners} seats of {pool.max_proposals}</span>
          {pool.approvals_needed > 0 && (
            <span><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> {pool.approvals_needed} of {pool.co_approvers.map((a) => shortAddress(a)).join(", ")}</span>
          )}
          {pool.milestones.length > 0 && (
            <span><Flag size={13} style={{ verticalAlign: -2 }} /> {pool.milestones.map((m) => `${m.description} (${m.percentage}%)`).join(" → ")}</span>
          )}
          {pool.min_reputation > 0 && (
            <span><Star size={13} style={{ verticalAlign: -2 }} /> {pool.min_reputation}+ funded proposals to enter</span>
          )}
        </div>
        <div className="mono" style={{ marginTop: 12, fontSize: "0.69rem", color: "var(--muted)" }}>
          <Hash size={11} style={{ verticalAlign: -1 }} /> rubric {pool.criteria_hash} — every round of this pool runs this exact rubric
        </div>

        {isTreasurer && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line-soft)", display: "grid", gap: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
              <input
                className="input"
                style={{ width: 110 }}
                inputMode="decimal"
                value={topUp}
                onChange={(e) => setTopUp(e.target.value.replace(/[^\d.]/g, ""))}
                aria-label="Top-up amount in GEN"
              />
              <TxButton
                label={`Top up ${topUp || "0"} GEN`}
                className="btn btn-ghost"
                icon={<Coins size={16} />}
                disabled={parseGen(topUp) <= 0n}
                send={(acc) => topUpPool(acc, pool.pool_id, parseGen(topUp))}
                onDone={reload}
              />
              <TxButton
                label={`Open round ${pool.round_count + 1} with ${formatGen(pool.reserve_wei)} GEN`}
                icon={<PlusCircle size={16} />}
                disabled={Boolean(latestLive) || reserve <= 0n}
                title={latestLive ? "The latest round must be ranked first." : "Same rubric, fresh proposals, funded from the reserve."}
                send={(acc) => createNextRound(acc, pool.pool_id)}
                onDone={reload}
              />
              {reserve > 0n && (
                <TxButton
                  label="Withdraw the reserve"
                  className="btn btn-ghost"
                  icon={<Undo2 size={16} />}
                  send={(acc) => withdrawReserve(acc, pool.pool_id)}
                  onDone={reload}
                />
              )}
            </div>
            {latestLive && (
              <span style={{ fontSize: "0.79rem", color: "var(--muted)" }}>
                Round {latest.round_number} is still {latest.status.toLowerCase()}; the next round opens once it has been ranked.
              </span>
            )}
          </div>
        )}

        <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
          <input
            className="input"
            style={{ maxWidth: 260 }}
            placeholder="Save this rubric as a template…"
            value={templateName}
            maxLength={80}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <TxButton
            label="Save as template"
            className="btn btn-ghost"
            icon={<LibraryBig size={16} />}
            disabled={templateName.trim().length < 3}
            title="Templates are public and immutable. Anyone may open a pool with one."
            send={(acc) => createTemplate(acc, templateName.trim(), criteriaJson)}
            onDone={() => setTemplateName("")}
          />
        </div>
      </div>

      <h2 className="serif" style={{ fontSize: "1.3rem", margin: "0 0 14px" }}>History</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {data.rounds.map((r) => (
          <Link
            key={r.round_id}
            href={`/round/${r.round_id}`}
            className="card card-hover"
            style={{ padding: "16px 18px", textDecoration: "none", color: "inherit", display: "grid", gap: 10 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <RoundBadge phase={r.phase} size="sm" />
                <strong>Round {r.round_number}</strong>
                <span className="mono" style={{ fontSize: "0.72rem", color: "var(--muted)" }}>#{r.round_id}</span>
              </span>
              <span style={{ color: "var(--gold)" }}>{formatGen(r.pool_wei)} GEN</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: "0.8rem", color: "var(--cream-dim)" }}>
              <span>{r.proposal_count} proposals</span>
              <span>{r.evaluated_count ?? 0} scored</span>
              <span>{r.funded_count} funded</span>
              <span>{r.rejected_count ?? 0} rejected</span>
              <span>{formatGen(r.allocated_wei)} GEN awarded</span>
              {r.approval_outcome && <span>sign-off: {r.approval_outcome.toLowerCase()}</span>}
              <span style={{ color: "var(--muted)" }}>
                {r.finalized_at > 0 ? `ranked ${formatTime(r.finalized_at)}` : `closes ${formatTime(r.deadline)}`}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}

function Stat({
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
      <div style={{ marginTop: 5, fontSize: "1rem", color: gold ? "var(--gold-bright)" : "var(--cream)" }}>{value}</div>
    </div>
  );
}
