"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Coins,
  Crown,
  Gavel,
  HandCoins,
  Hash,
  Scale,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import type { Proposal, Round } from "@/types";
import { formatGen, formatTime, shortAddress, sameAddress, truncate } from "@/lib/format";
import { ProposalBadge } from "./StatusBadge";
import { CriterionBar, TotalBar } from "./ScoreBar";
import { VerifyPanel } from "./VerifyPanel";
import { TxButton } from "./TxButton";
import { claimAward, contest, evaluate, settleStalled } from "@/lib/contract";
import { useWallet } from "./WalletProvider";

type Props = {
  proposal: Proposal & { reason: string };
  round: Round;
  index: number;
  onChanged: () => void;
};

function brackets(csv: string): [number, number][] {
  return csv
    .split(",")
    .filter(Boolean)
    .map((part) => {
      const [lo, hi] = part.split("-").map((n) => Number(n));
      return [lo || 0, hi || 0] as [number, number];
    });
}

export function ProposalPanel({ proposal, round, index, onChanged }: Props) {
  const { account } = useWallet();
  const [expanded, setExpanded] = useState(false);
  const [evidence, setEvidence] = useState("");
  const mine = sameAddress(account, proposal.author);
  const scored = proposal.evaluated_at > 0;
  const bracketList = brackets(proposal.bracket_csv);
  const funded = proposal.status === "FUNDED";
  const canEvaluate =
    proposal.status === "PENDING" &&
    round.status !== "RANKED" &&
    round.status !== "FINALIZED" &&
    round.status !== "CANCELLED" &&
    round.seconds_remaining === 0;
  // Offered only once the contract would actually accept it. The button was
  // shown for every PENDING proposal at first, which meant the common case was
  // a user clicking it and being told to come back in four minutes — a refusal
  // the UI already had everything it needed to avoid.
  const stallsAt = round.deadline + round.stall_ttl_s;
  const canSettleStalled =
    proposal.status === "PENDING" && Math.floor(Date.now() / 1000) >= stallsAt;
  const canClaim =
    mine && !proposal.payout_claimed && Number(proposal.payout_wei) > 0 && proposal.settled_at > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.25) }}
      layout
      className="card"
      style={{
        padding: 20,
        borderColor: funded ? "rgba(255,215,0,0.28)" : undefined,
        background: funded
          ? "linear-gradient(180deg, rgba(31,60,48,0.9), rgba(15,37,31,0.95))"
          : undefined,
      }}
    >
      {/* header */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              fontWeight: 600,
              fontSize: "0.82rem",
              color: funded ? "#241a05" : "var(--cream-dim)",
              background: funded ? "var(--gold-bright)" : "rgba(255,255,255,0.05)",
            }}
          >
            {proposal.rank > 0 ? proposal.rank : "—"}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="mono" style={{ color: "var(--cream)", fontSize: "0.86rem" }}>
                {shortAddress(proposal.author, 6)}
              </span>
              {funded && <Crown size={15} color="var(--gold-bright)" />}
              {mine && (
                <span style={{ fontSize: "0.68rem", color: "var(--emerald)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 999, padding: "1px 7px" }}>
                  you
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginTop: 3 }}>
              proposal #{proposal.proposal_id} · filed {formatTime(proposal.submitted_at)}
            </div>
          </div>
        </div>
        <ProposalBadge status={proposal.status} contest={proposal.contest_status} />
      </div>

      {/* amounts */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 16 }}>
        <Figure Icon={Coins} label="requested" value={`${formatGen(proposal.requested_wei)} GEN`} />
        {proposal.settled_at > 0 && (
          <Figure
            Icon={HandCoins}
            label="awarded"
            value={`${formatGen(proposal.award_wei)} GEN`}
            highlight={funded}
          />
        )}
        {proposal.settled_at > 0 && (
          <Figure
            Icon={Sparkles}
            label="deposit"
            value={
              Number(proposal.stake_return_wei) > 0
                ? `${formatGen(proposal.stake_return_wei)} GEN back`
                : "forfeited to the pool"
            }
          />
        )}
      </div>

      {/* description */}
      <p
        style={{
          margin: "16px 0 0",
          fontSize: "0.88rem",
          lineHeight: 1.7,
          color: "var(--cream-dim)",
          whiteSpace: "pre-wrap",
        }}
      >
        {expanded ? proposal.description : truncate(proposal.description, 280)}
      </p>
      {proposal.description.length > 280 && (
        <button
          className="btn btn-ghost"
          onClick={() => setExpanded((v) => !v)}
          style={{ marginTop: 10, fontSize: "0.79rem", padding: "5px 10px" }}
        >
          {expanded ? "Show less" : "Read the whole proposal"}
          <ChevronDown size={13} style={{ transform: expanded ? "rotate(180deg)" : "none" }} />
        </button>
      )}

      {expanded && (
        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          <Block title="Timeline" body={proposal.timeline} />
          <Block title="Team" body={proposal.team} />
          {proposal.contest_evidence && (
            <Block title="Evidence filed on appeal" body={proposal.contest_evidence} accent />
          )}
        </div>
      )}

      {/* scores */}
      {scored && (
        <div style={{ marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--line-soft)" }}>
          <div style={{ display: "grid", gap: 24, gridTemplateColumns: "minmax(0,1fr)" }} className="score-grid">
            <div>
              <div
                style={{
                  fontSize: "0.72rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--gold)",
                  marginBottom: 14,
                }}
              >
                Per criterion
              </div>
              {proposal.breakdown.map((row, i) => (
                <CriterionBar
                  key={row.name}
                  name={row.name}
                  score={row.score}
                  weightBps={row.weight_bps}
                  bracket={bracketList[i]}
                  delay={i * 0.08}
                />
              ))}
              <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: "0.79rem", color: "var(--muted)", flexWrap: "wrap" }}>
                <span>
                  overall quality <strong style={{ color: "var(--gold)" }}>{proposal.quality_bucket}</strong>/7
                </span>
                <span>
                  completeness <strong style={{ color: "var(--gold)" }}>{proposal.completeness_bucket}</strong>/7
                </span>
                <span>
                  model consulted <strong style={{ color: "var(--gold)" }}>{proposal.model_called ? "yes" : "no"}</strong>
                </span>
              </div>
            </div>

            <div>
              <TotalBar score={proposal.final_score} threshold={round.min_score_threshold} />
              {proposal.contest_status !== "" && (
                <div style={{ marginTop: 18 }}>
                  <TotalBar
                    score={proposal.contest_score}
                    threshold={round.min_score_threshold}
                    label="On appeal"
                  />
                </div>
              )}
              <p
                style={{
                  margin: "18px 0 0",
                  fontSize: "0.83rem",
                  lineHeight: 1.65,
                  color: "var(--cream-dim)",
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 10,
                  padding: "12px 13px",
                }}
              >
                <Scale size={14} style={{ verticalAlign: -2, marginRight: 6, color: "var(--gold)" }} />
                {proposal.contest_status !== "" ? proposal.contest_reason : proposal.reason}
              </p>
              <div
                className="mono"
                style={{ marginTop: 12, fontSize: "0.7rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: 6, wordBreak: "break-all" }}
              >
                <Hash size={12} style={{ flexShrink: 0 }} />
                {proposal.content_hash}
              </div>
            </div>
          </div>

          <VerifyPanel roundId={round.round_id} proposalId={proposal.proposal_id} />
        </div>
      )}

      {/* actions */}
      <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        {canEvaluate && (
          <TxButton
            label="Evaluate this proposal"
            pendingLabel="Validators are scoring…"
            icon={<Scale size={16} />}
            title="Permissionless — anyone may trigger an evaluation, and nobody is paid for it."
            send={(account) => evaluate(account, round.round_id, proposal.proposal_id)}
            onDone={onChanged}
          />
        )}
        {canSettleStalled && (
          <TxButton
            label="Settle as stalled"
            className="btn btn-ghost"
            icon={<Gavel size={16} />}
            title={`Only possible once the proposal has been stuck for ${round.stall_ttl_s}s. The deposit is returned in full.`}
            send={(account) => settleStalled(account, round.round_id, proposal.proposal_id)}
            onDone={onChanged}
          />
        )}
        {canClaim && (
          <TxButton
            label={`Claim ${formatGen(proposal.payout_wei)} GEN`}
            icon={<HandCoins size={16} />}
            send={(account) => claimAward(account, round.round_id, proposal.proposal_id)}
            onDone={onChanged}
          />
        )}
        {proposal.payout_claimed && (
          <span style={{ fontSize: "0.8rem", color: "var(--muted)", alignSelf: "center" }}>
            <Users size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
            claimed
          </span>
        )}
      </div>

      {/* appeal */}
      {proposal.contestable && mine && (
        <div
          style={{
            marginTop: 20,
            padding: 18,
            borderRadius: 12,
            background: "rgba(232,168,56,0.06)",
            border: "1px solid rgba(232,168,56,0.24)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "var(--amber)" }}>
            <ShieldAlert size={17} />
            <strong style={{ fontSize: "0.92rem" }}>Appeal this decision</strong>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: "0.84rem", lineHeight: 1.65, color: "var(--cream-dim)" }}>
            Add the evidence the first filing left out — figures, dates, a
            costing, a track record, the risks you know about. The proposal is
            read again against the same rubric with your new text appended, which
            raises the ceiling the scorers may reach. It stakes{" "}
            <strong style={{ color: "var(--gold)" }}>{formatGen(round.contest_stake_wei)} GEN</strong>, returned if
            the appeal succeeds and forfeited to the pool if it does not. One
            appeal per proposal.
          </p>
          <textarea
            className="textarea"
            rows={5}
            maxLength={2000}
            placeholder="The detail the first filing left out…"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", color: evidence.length < 20 ? "var(--rose)" : "var(--muted)" }}>
              {evidence.length}/2000 — at least 20 characters
            </span>
            <TxButton
              label={`Appeal · stake ${formatGen(round.contest_stake_wei)} GEN`}
              pendingLabel="Re-reading the proposal…"
              icon={<ShieldAlert size={16} />}
              disabled={evidence.trim().length < 20}
              send={(account) =>
                contest(account, {
                  roundId: round.round_id,
                  proposalId: proposal.proposal_id,
                  evidence: evidence.trim(),
                  stakeWei: BigInt(round.contest_stake_wei),
                })
              }
              onDone={() => {
                setEvidence("");
                onChanged();
              }}
            />
          </div>
        </div>
      )}

      <style>{`
        @media (min-width: 820px) {
          .score-grid { grid-template-columns: 1.05fr 0.95fr !important; }
        }
      `}</style>
    </motion.div>
  );
}

function Figure({
  Icon,
  label,
  value,
  highlight,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: "0.72rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        <Icon size={13} strokeWidth={1.9} />
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: "0.98rem",
          color: highlight ? "var(--gold-bright)" : "var(--cream)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Block({ title, body, accent }: { title: string; body: string; accent?: boolean }) {
  if (!body) return null;
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        background: accent ? "rgba(232,168,56,0.06)" : "rgba(0,0,0,0.2)",
        border: `1px solid ${accent ? "rgba(232,168,56,0.2)" : "var(--line-soft)"}`,
      }}
    >
      <div style={{ fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", color: accent ? "var(--amber)" : "var(--gold-dim)", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: "0.85rem", lineHeight: 1.65, color: "var(--cream-dim)", whiteSpace: "pre-wrap" }}>{body}</div>
    </div>
  );
}
