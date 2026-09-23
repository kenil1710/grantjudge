"use client";

import { useState } from "react";
import Link from "next/link";
import { Coins, FilePlus2, Gavel, HandCoins, Inbox, LayoutGrid, Wallet } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProposalBadge, RoundBadge } from "@/components/StatusBadge";
import { TxButton } from "@/components/TxButton";
import { EmptyState, ErrorState, SkeletonGrid } from "@/components/States";
import { useMyProposals, useMyRounds, usePayout } from "@/lib/hooks";
import { useWallet } from "@/components/WalletProvider";
import { claimAward, claimPayout } from "@/lib/contract";
import { formatGen, formatTime, scoreText, truncate } from "@/lib/format";

export default function MyProposalsPage() {
  const { account } = useWallet();
  const [tab, setTab] = useState<"proposals" | "rounds">("proposals");
  const { data, error, isLoading, mutate } = useMyProposals(account);
  const { data: mine, isLoading: roundsLoading } = useMyRounds(account);
  const { data: payout, mutate: reloadPayout } = usePayout(account);

  if (!account) {
    return (
      <AppShell eyebrow="Your work" title="My proposals">
        <EmptyState
          icon={<Wallet size={26} strokeWidth={1.6} />}
          title="Connect a wallet to see your proposals"
          message="This page reads the chain for proposals filed by your address — the scores they were given, what they are owed, and whether any of them can still be appealed."
        />
      </AppShell>
    );
  }

  const proposals = data?.proposals ?? [];
  const ledger = payout ? BigInt(payout.payout_wei) : 0n;

  return (
    <AppShell
      wide
      eyebrow="Your work"
      title="Mine"
      blurb="Everything this address has filed and everything it has funded — the proposer's side and the treasurer's side of the same contract."
      actions={
        <Link href="/propose" className="btn btn-primary">
          <FilePlus2 size={16} /> New proposal
        </Link>
      }
    >
      {ledger > 0n && (
        <div
          className="card"
          style={{
            padding: 20,
            marginBottom: 20,
            borderColor: "rgba(212,168,71,0.3)",
            background: "rgba(212,168,71,0.05)",
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "0.73rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--gold)" }}>
              Claimable balance
            </div>
            <div className="serif" style={{ fontSize: "1.7rem", color: "var(--gold-bright)", marginTop: 4 }}>
              {formatGen(ledger)} GEN
            </div>
            <p style={{ margin: "6px 0 0", fontSize: "0.79rem", color: "var(--muted)", maxWidth: 460, lineHeight: 1.6 }}>
              Refunds from calls the contract refused, a cancelled pool, a
              returned appeal stake, or a remainder you booked from a round.
              Awards are claimed per proposal below.
            </p>
          </div>
          <TxButton
            label={`Withdraw ${formatGen(ledger)} GEN`}
            icon={<HandCoins size={16} />}
            send={(acct) => claimPayout(acct)}
            onDone={() => {
              void reloadPayout();
              void mutate();
            }}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {([["proposals", "Proposals", FilePlus2], ["rounds", "Rounds I opened", LayoutGrid]] as const).map(
          ([key, label, Icon]) => (
            <button
              key={key}
              className="btn"
              onClick={() => setTab(key)}
              style={{
                padding: "7px 13px",
                fontSize: "0.84rem",
                color: tab === key ? "var(--gold)" : "var(--cream-dim)",
                background: tab === key ? "rgba(212,168,71,0.12)" : "rgba(255,255,255,0.03)",
                borderColor: tab === key ? "rgba(212,168,71,0.4)" : "var(--line)",
              }}
            >
              <Icon size={15} /> {label}
            </button>
          ),
        )}
      </div>

      {tab === "rounds" && (
        <>
          {roundsLoading && <SkeletonGrid count={2} />}
          {!roundsLoading && (mine?.rounds ?? []).length === 0 && (
            <EmptyState
              icon={<Gavel size={26} strokeWidth={1.6} />}
              title="You have not opened a round"
              message="A treasurer deposits a pool and writes the criteria. The pool locks immediately, and you cannot touch the outcome afterwards — there is no method on this contract by which a treasurer changes a rubric, a score or an award."
              action={
                <Link href="/create" className="btn btn-primary">
                  <Coins size={16} /> Create a round
                </Link>
              }
            />
          )}
          <div style={{ display: "grid", gap: 14 }}>
            {(mine?.rounds ?? []).map((r) => (
              <Link
                key={r.round_id}
                href={`/round/${r.round_id}`}
                className="card card-hover"
                style={{ padding: 20, textDecoration: "none", color: "inherit", display: "block" }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div className="serif" style={{ fontSize: "1.08rem" }}>{r.name}</div>
                    <div className="mono" style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>
                      round #{r.round_id} · opened {formatTime(r.created_at)}
                    </div>
                  </div>
                  <RoundBadge phase={r.phase} size="sm" />
                </div>
                <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 20 }}>
                  <Small label="pool" value={`${formatGen(r.pool_wei)} GEN`} gold />
                  <Small label="awarded" value={`${formatGen(r.allocated_wei)} GEN`} />
                  <Small label="proposals" value={`${r.proposal_count}/${r.max_proposals}`} />
                  <Small label="funded" value={String(r.funded_count)} />
                  <span style={{ marginLeft: "auto", alignSelf: "center", color: "var(--gold)", fontSize: "0.83rem" }}>
                    Open the round →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {tab === "proposals" && isLoading && <SkeletonGrid count={3} />}
      {tab === "proposals" && error && (
        <ErrorState onRetry={() => mutate()} message={(error as Error).message} />
      )}

      {tab === "proposals" && !isLoading && !error && proposals.length === 0 && (
        <EmptyState
          icon={<Inbox size={26} strokeWidth={1.6} />}
          title="Nothing filed yet"
          message="You have not filed a proposal from this address. Find an open round and write against its rubric — the preview shows what the contract can already see in your draft before you stake anything."
          action={
            <Link href="/propose" className="btn btn-primary">
              <FilePlus2 size={16} /> Submit a proposal
            </Link>
          }
        />
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {(tab === "proposals" ? proposals : []).map((p) => {
          const claimable = !p.payout_claimed && BigInt(p.payout_wei) > 0n;
          return (
            <div key={p.proposal_id} className="card card-hover" style={{ padding: 20 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <Link
                    href={`/round/${p.round_id}`}
                    style={{ color: "var(--cream)", textDecoration: "none", fontSize: "1.05rem" }}
                    className="serif"
                  >
                    {p.round_name}
                  </Link>
                  <div className="mono" style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>
                    round #{p.round_id} · proposal #{p.proposal_id} · filed {formatTime(p.submitted_at)}
                  </div>
                </div>
                <ProposalBadge status={p.status} contest={p.contest_status} size="sm" />
              </div>

              <p style={{ margin: "14px 0 0", fontSize: "0.86rem", lineHeight: 1.65, color: "var(--cream-dim)" }}>
                {truncate(p.description, 200)}
              </p>

              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: "1px solid var(--line-soft)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 20,
                  alignItems: "center",
                }}
              >
                <Small label="requested" value={`${formatGen(p.requested_wei)} GEN`} />
                <Small
                  label="score"
                  value={p.evaluated_at > 0 ? `${scoreText(p.effective_score)} / 7.00` : "not yet scored"}
                  gold={p.evaluated_at > 0}
                />
                <Small label="awarded" value={`${formatGen(p.award_wei)} GEN`} gold={BigInt(p.award_wei) > 0n} />
                <Small
                  label="deposit"
                  value={BigInt(p.stake_return_wei) > 0n ? "returned" : p.settled_at > 0 ? "forfeited" : "held"}
                />

                <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {claimable && (
                    <TxButton
                      label={`Claim ${formatGen(p.payout_wei)} GEN`}
                      icon={<Coins size={15} />}
                      send={(acct) => claimAward(acct, p.round_id, p.proposal_id)}
                      onDone={() => {
                        void mutate();
                        void reloadPayout();
                      }}
                    />
                  )}
                  {p.contestable && (
                    <Link href={`/round/${p.round_id}`} className="btn btn-ghost" style={{ fontSize: "0.83rem" }}>
                      Appeal on the round page
                    </Link>
                  )}
                  {!claimable && !p.contestable && (
                    <Link href={`/round/${p.round_id}`} className="btn btn-ghost" style={{ fontSize: "0.83rem" }}>
                      Open the round
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

function Small({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "0.68rem", letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>
        {label}
      </div>
      <div style={{ marginTop: 3, fontSize: "0.88rem", color: gold ? "var(--gold-bright)" : "var(--cream)" }}>
        {value}
      </div>
    </div>
  );
}
