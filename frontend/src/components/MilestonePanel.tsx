"use client";

import { useState } from "react";
import { CheckCircle2, CircleDashed, Flag, Link2, RotateCcw, Send, XCircle } from "lucide-react";
import type { Proposal, Round } from "@/types";
import { TxButton } from "./TxButton";
import { useWallet } from "./WalletProvider";
import { useMilestoneStatus } from "@/lib/hooks";
import { reclaimLapsedMilestones, submitMilestoneProof } from "@/lib/contract";
import { formatGen, formatTime, sameAddress } from "@/lib/format";

/**
 * A funded proposal's release schedule.
 *
 * The award is fixed at ranking and HELD; each milestone the validators accept
 * releases its share into what `claim_award` pays. The proof is judged by the
 * same bracket-and-consensus machinery as a proposal, against the milestone as
 * the treasurer wrote it. The URL is a citation shown to the validators and
 * committed to in the content hash — it is never fetched, so the text has to
 * say what was delivered.
 */
export function MilestonePanel({
  proposal,
  round,
  onChanged,
}: {
  proposal: Proposal;
  round: Round;
  onChanged: () => void;
}) {
  const { account } = useWallet();
  const enabled = round.milestone_count > 0 && Number(proposal.award_wei) > 0;
  const { data, mutate } = useMilestoneStatus(round.round_id, proposal.proposal_id, enabled);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  if (!enabled || !data?.found) return null;

  const mine = sameAddress(account, proposal.author);
  const next = data.next_milestone;
  const now = Math.floor(Date.now() / 1000);
  const lapsed = data.lapses_at > 0 && now > data.lapses_at;
  const nextRow = next >= 0 ? data.milestones[next] : undefined;
  const exhausted = nextRow?.status === "FAILED" && nextRow.attempts >= 3;
  const canProve = mine && next >= 0 && !lapsed && !exhausted && BigInt(data.held_wei) > 0n;
  const canReclaim = BigInt(data.held_wei) > 0n && (lapsed || exhausted);
  const refresh = () => {
    void mutate();
    onChanged();
  };

  return (
    <div
      style={{
        marginTop: 20,
        padding: 18,
        borderRadius: 12,
        background: "rgba(45,212,191,0.05)",
        border: "1px solid rgba(45,212,191,0.22)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <strong style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--teal)", fontSize: "0.92rem" }}>
          <Flag size={16} /> Milestone release
        </strong>
        <span style={{ fontSize: "0.8rem", color: "var(--cream-dim)" }}>
          {formatGen(data.released_wei)} of {formatGen(data.award_wei)} GEN released
          {BigInt(data.held_wei) > 0n && ` · ${formatGen(data.held_wei)} held`}
          {BigInt(data.lapsed_wei) > 0n && ` · ${formatGen(data.lapsed_wei)} returned to the treasurer`}
        </span>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {data.milestones.map((m) => (
          <div
            key={m.index}
            style={{ padding: "11px 13px", borderRadius: 10, background: "rgba(0,0,0,0.2)", border: "1px solid var(--line-soft)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.87rem", color: "var(--cream)" }}>
                {m.status === "PASSED" ? (
                  <CheckCircle2 size={15} color="var(--emerald)" />
                ) : m.status === "FAILED" ? (
                  <XCircle size={15} color="var(--rose)" />
                ) : (
                  <CircleDashed size={15} color="var(--muted)" />
                )}
                {m.index + 1}. {m.description}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--gold)" }}>
                {m.percentage}% · {formatGen(m.tranche_wei)} GEN
              </span>
            </div>
            {m.proof_format && (
              <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 4 }}>Expected proof: {m.proof_format}</div>
            )}
            {m.status && (
              <div style={{ fontSize: "0.78rem", color: "var(--cream-dim)", marginTop: 8, lineHeight: 1.55 }}>
                <strong style={{ color: m.status === "PASSED" ? "var(--emerald)" : "var(--rose)" }}>
                  {m.status.toLowerCase()}
                </strong>{" "}
                at {m.score_text}/7.00 against {(data.threshold / 100).toFixed(2)} · attempt {m.attempts}
                {m.verified_at ? ` · ${formatTime(m.verified_at)}` : ""}
                {m.proof_url && (
                  <span style={{ display: "block", marginTop: 3 }}>
                    <Link2 size={12} style={{ verticalAlign: -1 }} /> cited (not fetched):{" "}
                    <span className="mono" style={{ wordBreak: "break-all" }}>{m.proof_url}</span>
                  </span>
                )}
                {m.reason && <span style={{ display: "block", marginTop: 3, color: "var(--muted)" }}>{m.reason}</span>}
                {m.content_hash && (
                  <span className="mono" style={{ display: "block", marginTop: 3, fontSize: "0.7rem", color: "var(--muted)" }}>
                    content hash {m.content_hash}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {data.lapses_at > 0 && BigInt(data.held_wei) > 0n && (
        <p style={{ margin: "12px 0 0", fontSize: "0.79rem", color: "var(--muted)" }}>
          Delivery window {lapsed ? "closed" : "closes"} {formatTime(data.lapses_at)}. After that, or after three
          failed proofs of the next milestone, anyone may return the undelivered part to the treasurer. Released
          tranches are never clawed back.
        </p>
      )}

      {canProve && nextRow && (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <strong style={{ fontSize: "0.85rem" }}>Prove milestone {next + 1}: {nextRow.description}</strong>
          <input
            className="input"
            placeholder="Link to the delivery (cited, never fetched)"
            value={url}
            maxLength={300}
            onChange={(e) => setUrl(e.target.value)}
          />
          <textarea
            className="textarea"
            rows={5}
            maxLength={3000}
            placeholder="Describe what was delivered: dates, figures, named artefacts, usage. This text is what the validators judge."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", color: text.trim().length < 80 ? "var(--rose)" : "var(--muted)" }}>
              {text.length}/3000 — at least 80 characters
            </span>
            <TxButton
              label={`Submit proof · releases ${formatGen(nextRow.tranche_wei)} GEN if accepted`}
              pendingLabel="Validators are checking the proof…"
              icon={<Send size={16} />}
              disabled={text.trim().length < 80}
              send={(acc) =>
                submitMilestoneProof(acc, {
                  roundId: round.round_id,
                  proposalId: proposal.proposal_id,
                  index: next,
                  url: url.trim(),
                  text: text.trim(),
                })
              }
              onDone={() => {
                setText("");
                setUrl("");
                refresh();
              }}
            />
          </div>
        </div>
      )}

      {canReclaim && (
        <div style={{ marginTop: 14 }}>
          <TxButton
            label={`Return ${formatGen(data.held_wei)} GEN to the treasurer`}
            className="btn btn-ghost"
            icon={<RotateCcw size={16} />}
            title="Permissionless once the delivery window has closed or the next milestone has failed three proofs."
            send={(acc) => reclaimLapsedMilestones(acc, round.round_id, proposal.proposal_id)}
            onDone={refresh}
          />
        </div>
      )}
    </div>
  );
}
