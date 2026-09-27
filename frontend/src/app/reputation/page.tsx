"use client";

import { useState } from "react";
import { Award, Coins, Crown, FileText, Gauge, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ErrorState, SkeletonCard } from "@/components/States";
import { useWallet } from "@/components/WalletProvider";
import { useProposerStats } from "@/lib/hooks";
import { formatGen, shortAddress } from "@/lib/format";

const HEX = /^0x[0-9a-fA-F]{40}$/;

export default function ReputationPage() {
  const { account } = useWallet();
  const [query, setQuery] = useState("");
  const target = HEX.test(query.trim()) ? query.trim() : account ?? null;
  const { data, error, isLoading, mutate } = useProposerStats(target);

  return (
    <AppShell
      eyebrow="Reputation"
      title="Proposer records"
      blurb="Computed from a wallet's proposals every time it is read. There is no reputation field on chain, so there is nothing anybody — an owner, a treasurer or the proposer — can set. A pool's reputation floor is compared against the funded count."
    >
      <div className="card" style={{ padding: 16, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <Search size={17} color="var(--muted)" />
        <input
          className="input"
          placeholder={account ? `Your wallet ${shortAddress(account)} — or paste any address` : "Paste an address"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!target && (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Connect a wallet or paste an address to see its record.</p>
      )}
      {target && isLoading && <SkeletonCard height={200} />}
      {error && <ErrorState onRetry={() => mutate()} message={(error as Error).message} />}
      {data?.found && (
        <div className="card" style={{ padding: 24 }}>
          <div className="mono" style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 18, wordBreak: "break-all" }}>
            {data.address}
          </div>
          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <Figure Icon={Crown} label="Reputation (funded)" value={String(data.proposals_funded)} gold />
            <Figure Icon={FileText} label="Rounds entered" value={String(data.rounds_entered)} />
            <Figure Icon={Coins} label="Total awarded" value={`${formatGen(data.total_awarded_wei)} GEN`} />
            <Figure Icon={Gauge} label="Average score" value={data.scored > 0 ? `${data.average_score_text} / 7.00` : "—"} />
            <Figure Icon={ShieldCheck} label="Appeals won" value={String(data.contests_won)} />
            <Figure Icon={ShieldAlert} label="Appeals lost" value={String(data.contests_lost)} />
          </div>
          <p style={{ margin: "20px 0 0", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.6 }}>
            <Award size={14} style={{ verticalAlign: -2 }} /> A round with a floor of zero admits a wallet the chain has
            never seen; a floor of one admits only wallets this contract has funded at least once.
          </p>
        </div>
      )}
    </AppShell>
  );
}

function Figure({
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
        <Icon size={13} strokeWidth={1.9} /> {label}
      </div>
      <div className="serif" style={{ marginTop: 6, fontSize: "1.5rem", color: gold ? "var(--gold-bright)" : "var(--cream)" }}>
        {value}
      </div>
    </div>
  );
}
