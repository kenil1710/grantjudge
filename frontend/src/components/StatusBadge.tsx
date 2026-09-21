import {
  CheckCircle2,
  CircleDashed,
  Crown,
  Gavel,
  Hourglass,
  Lock,
  ShieldAlert,
  SkipForward,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import type { ContestStatus, ProposalStatus, RoundPhase } from "@/types";

type Tone = {
  label: string;
  color: string;
  bg: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  hint: string;
};

const ROUND_TONES: Record<string, Tone> = {
  OPEN: { label: "Open", color: "var(--emerald)", bg: "rgba(16,185,129,0.12)", Icon: Sparkles, hint: "accepting proposals" },
  CLOSED: { label: "Closed", color: "var(--teal)", bg: "rgba(58,175,169,0.12)", Icon: Hourglass, hint: "deadline passed, waiting for the first evaluation" },
  EVALUATING: { label: "Evaluating", color: "var(--teal)", bg: "rgba(58,175,169,0.12)", Icon: CircleDashed, hint: "validators are scoring" },
  RANKED: { label: "Ranked", color: "var(--gold)", bg: "rgba(212,168,71,0.12)", Icon: Gavel, hint: "ranked and paid; the appeal window is open" },
  SETTLING: { label: "Settling", color: "var(--gold)", bg: "rgba(212,168,71,0.12)", Icon: Lock, hint: "appeal window closed; awaiting the treasurer's remainder claim" },
  FINALIZED: { label: "Finalized", color: "var(--gold-bright)", bg: "rgba(255,215,0,0.12)", Icon: Trophy, hint: "settled; the pool is empty" },
  CANCELLED: { label: "Cancelled", color: "var(--muted)", bg: "rgba(125,143,136,0.12)", Icon: XCircle, hint: "withdrawn before anybody filed" },
};

const PROPOSAL_TONES: Record<ProposalStatus, Tone> = {
  PENDING: { label: "Pending", color: "var(--teal)", bg: "rgba(58,175,169,0.12)", Icon: CircleDashed, hint: "not yet scored" },
  SCORED: { label: "Scored", color: "var(--teal)", bg: "rgba(58,175,169,0.12)", Icon: CheckCircle2, hint: "scored, awaiting the ranking" },
  FUNDED: { label: "Funded", color: "var(--gold-bright)", bg: "rgba(255,215,0,0.13)", Icon: Crown, hint: "won a seat and an award" },
  QUALIFIED: { label: "Qualified", color: "var(--gold)", bg: "rgba(212,168,71,0.12)", Icon: CheckCircle2, hint: "above the bar but out of seats; deposit returned" },
  REJECTED: { label: "Rejected", color: "var(--rose)", bg: "rgba(201,112,112,0.12)", Icon: XCircle, hint: "below the bar; deposit went to the pool" },
  SKIPPED: { label: "Skipped", color: "var(--muted)", bg: "rgba(125,143,136,0.12)", Icon: SkipForward, hint: "the network could not score it; deposit returned" },
};

export function RoundBadge({ phase, size = "md" }: { phase: RoundPhase | string; size?: "sm" | "md" }) {
  const tone = ROUND_TONES[phase] ?? ROUND_TONES.OPEN;
  return <Badge tone={tone} size={size} />;
}

export function ProposalBadge({
  status,
  contest,
  size = "md",
}: {
  status: ProposalStatus;
  contest?: ContestStatus;
  size?: "sm" | "md";
}) {
  if (contest === "WON" || contest === "LOST") {
    const won = contest === "WON";
    return (
      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
        <Badge tone={PROPOSAL_TONES[status]} size={size} />
        <Badge
          size={size}
          tone={{
            label: won ? "Appeal won" : "Appeal lost",
            color: "var(--amber)",
            bg: "rgba(232,168,56,0.13)",
            Icon: ShieldAlert,
            hint: won
              ? "re-scored on new evidence and funded from the remainder"
              : "re-scored on new evidence and still below the bar",
          }}
        />
      </span>
    );
  }
  return <Badge tone={PROPOSAL_TONES[status] ?? PROPOSAL_TONES.PENDING} size={size} />;
}

function Badge({ tone, size }: { tone: Tone; size: "sm" | "md" }) {
  const { Icon } = tone;
  return (
    <span
      title={tone.hint}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: size === "sm" ? "2px 8px" : "4px 10px",
        borderRadius: 999,
        fontSize: size === "sm" ? "0.7rem" : "0.76rem",
        fontWeight: 500,
        letterSpacing: "0.02em",
        color: tone.color,
        background: tone.bg,
        border: `1px solid ${tone.color}33`,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={size === "sm" ? 12 : 14} strokeWidth={2} />
      {tone.label}
    </span>
  );
}
