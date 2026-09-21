"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  FilePlus2,
  Gauge,
  Info,
  Lightbulb,
  Send,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TxButton } from "@/components/TxButton";
import { EmptyState, SkeletonCard } from "@/components/States";
import { useConfig, useOpenRounds, usePreview, useRound } from "@/lib/hooks";
import { submitProposal } from "@/lib/contract";
import { formatGen, parseGen, scoreText, shortAddress } from "@/lib/format";

/** Debounce a value so the bracket preview is not a chain read per keystroke. */
function useDebounced<T>(value: T, ms = 700): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return out;
}

function ProposeInner() {
  const search = useSearchParams();
  const preselected = Number(search.get("round") ?? 0) || null;

  const { data: open, isLoading } = useOpenRounds();
  const { data: config } = useConfig();
  const [roundId, setRoundId] = useState<number | null>(preselected);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [timeline, setTimeline] = useState("");
  const [team, setTeam] = useState("");
  const [done, setDone] = useState<null | number>(null);

  const rounds = open?.rounds ?? [];
  useEffect(() => {
    if (roundId === null && rounds.length > 0) setRoundId(rounds[0].round_id);
  }, [rounds, roundId]);

  const { data: round } = useRound(roundId);
  const debouncedDesc = useDebounced(description);
  const debouncedTimeline = useDebounced(timeline);
  const debouncedTeam = useDebounced(team);
  const { data: preview } = usePreview(
    roundId,
    debouncedDesc,
    debouncedTimeline,
    debouncedTeam,
    debouncedDesc.length >= 40,
  );

  const requestedWei = useMemo(() => parseGen(amount), [amount]);
  const minChars = config?.min_description_chars ?? 200;
  const poolWei = round ? BigInt(round.pool_wei) : 0n;

  const problems: string[] = [];
  if (!roundId) problems.push("Pick a round.");
  if (description.trim().length < minChars)
    problems.push(`The description needs at least ${minChars} characters — it has ${description.trim().length}.`);
  if (requestedWei <= 0n) problems.push("Ask for an amount greater than zero.");
  if (round && requestedWei > poolWei)
    problems.push(`You cannot ask for more than the whole pool (${formatGen(poolWei)} GEN).`);

  if (isLoading) {
    return (
      <AppShell title="Submit a proposal">
        <SkeletonCard height={320} lines={6} />
      </AppShell>
    );
  }

  if (rounds.length === 0 && !round) {
    return (
      <AppShell title="Submit a proposal">
        <EmptyState
          icon={<FilePlus2 size={26} strokeWidth={1.6} />}
          title="No round is taking proposals"
          message="Every round on this contract has closed to submissions. Open one of your own, or watch the rounds page for the next."
          action={
            <Link href="/create" className="btn btn-primary">
              <Coins size={16} /> Create a round
            </Link>
          }
        />
      </AppShell>
    );
  }

  if (done) {
    return (
      <AppShell title="Filed">
        <div className="card" style={{ padding: 34, textAlign: "center", borderColor: "rgba(16,185,129,0.3)" }}>
          <CheckCircle2 size={34} color="var(--emerald)" />
          <h2 style={{ margin: "16px 0 10px", fontSize: "1.5rem" }}>Your proposal is on chain</h2>
          <p style={{ margin: "0 auto 22px", maxWidth: 460, color: "var(--cream-dim)", lineHeight: 1.7, fontSize: "0.92rem" }}>
            It will be scored after the deadline — one consensus round, read by
            each validator independently. Your deposit comes back in full if you
            clear the bar, whether or not you win a seat.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href={`/round/${roundId}`} className="btn btn-primary">
              See the round
            </Link>
            <Link href="/my-proposals" className="btn btn-ghost">
              My proposals
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      wide
      eyebrow="Propose"
      title="Submit a proposal"
      blurb="Write for the rubric, not for a reader. Every figure, date, costed line, named credential and stated risk raises the ceiling the validators are allowed to reach — and the preview on the right computes exactly that, before you stake anything."
    >
      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0,1fr)" }} className="propose-grid">
        <div style={{ display: "grid", gap: 16 }}>
          <div className="card" style={{ padding: 22 }}>
            <Label icon={<Coins size={14} />}>Round</Label>
            <select
              className="select"
              value={roundId ?? ""}
              onChange={(e) => setRoundId(Number(e.target.value))}
            >
              {rounds.map((r) => (
                <option key={r.round_id} value={r.round_id} style={{ background: "var(--surface)" }}>
                  #{r.round_id} — {r.name} ({formatGen(r.pool_wei)} GEN)
                </option>
              ))}
              {round && !rounds.some((r) => r.round_id === round.round_id) && (
                <option value={round.round_id} style={{ background: "var(--surface)" }}>
                  #{round.round_id} — {round.name}
                </option>
              )}
            </select>

            {round && (
              <div
                style={{
                  marginTop: 16,
                  padding: "14px 16px",
                  borderRadius: 11,
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--line-soft)",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: "0.8rem", color: "var(--muted)" }}>
                  <span>pool <strong style={{ color: "var(--gold)" }}>{formatGen(round.pool_wei)} GEN</strong></span>
                  <span>bar <strong style={{ color: "var(--gold)" }}>{scoreText(round.min_score_threshold)}</strong></span>
                  <span>seats <strong style={{ color: "var(--gold)" }}>{round.max_winners}</strong></span>
                  <span>treasurer <span className="mono">{shortAddress(round.treasurer)}</span></span>
                </div>
                <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
                  {round.criteria.map((c) => (
                    <div key={c.position} style={{ fontSize: "0.82rem", color: "var(--cream-dim)" }}>
                      <strong style={{ color: "var(--cream)" }}>{c.name}</strong>{" "}
                      <span style={{ color: "var(--gold)" }}>({c.weight_bps / 100}%)</span>
                      {c.description ? ` — ${c.description}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 22 }}>
            <Label icon={<FilePlus2 size={14} />}>
              Description — {description.trim().length}/{config?.max_description_chars ?? 5000}
            </Label>
            <textarea
              className="textarea"
              rows={14}
              maxLength={config?.max_description_chars ?? 5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What you will build, in what order, by when, for whom, and what it costs. Name the figures. Say what could go wrong."
            />
            <div style={{ marginTop: 6, fontSize: "0.75rem", color: description.trim().length < minChars ? "var(--rose)" : "var(--muted)" }}>
              at least {minChars} characters
            </div>
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            <div className="card" style={{ padding: 22 }}>
              <Label icon={<Coins size={14} />}>Amount requested (GEN)</Label>
              <input
                className="input"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="2.5"
              />
              {round && (
                <div style={{ marginTop: 6, fontSize: "0.75rem", color: "var(--muted)" }}>
                  the whole pool is {formatGen(round.pool_wei)} GEN — asking for
                  less than your proportional share enlarges the remainder, it
                  does not enrich the other winners
                </div>
              )}
            </div>
            <div className="card" style={{ padding: 22 }}>
              <Label icon={<Users size={14} />}>Timeline</Label>
              <textarea
                className="textarea"
                rows={4}
                maxLength={1000}
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
                placeholder="Month 1 to 2: … Month 3 to 4: …"
              />
            </div>
          </div>

          <div className="card" style={{ padding: 22 }}>
            <Label icon={<Users size={14} />}>Team</Label>
            <textarea
              className="textarea"
              rows={4}
              maxLength={1000}
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              placeholder="What this team has shipped before, and where it can be seen."
            />
          </div>

          {/* stake disclosure */}
          {round && (
            <div
              className="card"
              style={{
                padding: 20,
                borderColor: "rgba(212,168,71,0.24)",
                background: "rgba(212,168,71,0.05)",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Info size={17} color="var(--gold)" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: "0.86rem", lineHeight: 1.7, color: "var(--cream-dim)" }}>
                  Filing stakes a <strong style={{ color: "var(--gold)" }}>{formatGen(round.spam_stake_wei)} GEN</strong> deposit.
                  It comes back in full if your proposal scores at or above{" "}
                  <strong style={{ color: "var(--gold)" }}>{scoreText(round.min_score_threshold)}/7.00</strong>,
                  whether or not you win a seat, and it comes back in full if the
                  network fails to score you at all. It is forfeited only if you
                  are scored and found below the bar — and then it goes to the
                  round&rsquo;s pool, which the treasurer reclaims. It never goes
                  to this contract.
                </p>
              </div>
            </div>
          )}

          {problems.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "13px 15px",
                borderRadius: 11,
                background: "rgba(232,168,56,0.07)",
                border: "1px solid rgba(232,168,56,0.24)",
                fontSize: "0.83rem",
                color: "var(--amber)",
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.7 }}>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <TxButton
              label={round ? `File · stake ${formatGen(round.spam_stake_wei)} GEN` : "File proposal"}
              pendingLabel="Filing…"
              icon={<Send size={16} />}
              disabled={problems.length > 0 || !round}
              send={(account) =>
                submitProposal(account, {
                  roundId: round!.round_id,
                  description: description.trim(),
                  requestedWei,
                  timeline: timeline.trim(),
                  team: team.trim(),
                  stakeWei: BigInt(round!.spam_stake_wei),
                })
              }
              onDone={(result) => {
                if (result.status === "OK") setDone(Number(result.proposal_id ?? 0) || -1);
              }}
            />
          </div>
        </div>

        {/* --- preview ---------------------------------------------------- */}
        <div>
          <div style={{ position: "sticky", top: 82, display: "grid", gap: 16 }}>
            <div className="card" style={{ padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Gauge size={17} color="var(--gold)" />
                <strong style={{ fontSize: "0.95rem" }}>What the contract can already see</strong>
              </div>
              <p style={{ margin: "0 0 16px", fontSize: "0.79rem", lineHeight: 1.6, color: "var(--muted)" }}>
                Computed from your draft by the deployed contract, with no model
                consulted and no transaction sent. It shows the RANGE each
                criterion may be scored in — the score inside it is what the
                validators decide.
              </p>

              {!preview?.found && (
                <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--muted)" }}>
                  Write at least 40 characters and the preview appears here.
                </p>
              )}

              {preview?.found && (
                <>
                  <div style={{ display: "grid", gap: 10 }}>
                    {preview.criteria.map((c) => (
                      <div key={c.name}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: 5 }}>
                          <span style={{ color: c.addressed ? "var(--cream)" : "var(--rose)" }}>
                            {c.name}
                          </span>
                          <span style={{ color: "var(--gold)" }}>
                            {c.min_score}–{c.max_score}
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: "rgba(0,0,0,0.35)", position: "relative" }}>
                          <div
                            style={{
                              position: "absolute",
                              left: `${(c.min_score / 7) * 100}%`,
                              width: `${Math.max(((c.max_score - c.min_score) / 7) * 100, 1.5)}%`,
                              top: 0,
                              bottom: 0,
                              borderRadius: 999,
                              background: "linear-gradient(90deg, var(--gold-dim), var(--gold))",
                            }}
                          />
                        </div>
                        {!c.addressed && (
                          <div style={{ fontSize: "0.72rem", color: "var(--rose)", marginTop: 4 }}>
                            your draft never touches this criterion — it caps at 2
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      marginTop: 18,
                      paddingTop: 14,
                      borderTop: "1px solid var(--line-soft)",
                      display: "grid",
                      gap: 8,
                      fontSize: "0.82rem",
                    }}
                  >
                    <Row label="Best possible total" value={`${scoreText(preview.best_possible_score)} / 7.00`} gold />
                    <Row label="Worst possible total" value={`${scoreText(preview.worst_possible_score)} / 7.00`} />
                    <Row label="The round's bar" value={`${preview.threshold_text} / 7.00`} />
                    <Row label="Evidence depth" value={`${preview.depth} / 7`} />
                    <Row label="Completeness" value={`${preview.completeness} / 7`} />
                  </div>

                  {preview.best_possible_score < preview.threshold && (
                    <div
                      style={{
                        marginTop: 14,
                        padding: "11px 13px",
                        borderRadius: 10,
                        background: "rgba(201,112,112,0.09)",
                        border: "1px solid rgba(201,112,112,0.26)",
                        fontSize: "0.8rem",
                        color: "var(--rose)",
                        lineHeight: 1.6,
                      }}
                    >
                      As written, this draft cannot reach the bar even if every
                      validator scores it at the top of every bracket. Add
                      figures, dates, a costing and a track record.
                    </div>
                  )}
                </>
              )}
            </div>

            {preview?.found && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Lightbulb size={16} color="var(--gold)" />
                  <strong style={{ fontSize: "0.9rem" }}>What it counted</strong>
                </div>
                <div style={{ display: "grid", gap: 7, fontSize: "0.81rem" }}>
                  <Row label="Figures" value={String(preview.signals.numbers ?? 0)} />
                  <Row label="Dates and milestones" value={String(preview.signals.specific ?? 0)} />
                  <Row label="Budget language" value={String(preview.signals.budget ?? 0)} />
                  <Row label="Track record" value={String(preview.signals.team ?? 0)} />
                  <Row label="Named beneficiaries" value={String(preview.signals.impact ?? 0)} />
                  <Row label="Stated risks" value={String(preview.signals.risk ?? 0)} />
                  <Row
                    label="Filler phrases"
                    value={String(preview.signals.filler ?? 0)}
                    bad={(preview.signals.filler ?? 0) > 0}
                  />
                  <Row
                    label="Attempts to instruct the scorer"
                    value={String(preview.signals.injection ?? 0)}
                    bad={(preview.signals.injection ?? 0) > 0}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 960px) {
          .propose-grid { grid-template-columns: 1.15fr 0.85fr !important; }
        }
      `}</style>
    </AppShell>
  );
}

function Label({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        fontSize: "0.73rem",
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: "var(--gold)",
        marginBottom: 10,
      }}
    >
      {icon}
      {children}
    </div>
  );
}

function Row({ label, value, gold, bad }: { label: string; value: string; gold?: boolean; bad?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <strong style={{ color: bad ? "var(--rose)" : gold ? "var(--gold-bright)" : "var(--cream)" }}>{value}</strong>
    </div>
  );
}

export default function ProposePage() {
  return (
    <Suspense fallback={<AppShell title="Submit a proposal"><SkeletonCard height={320} lines={6} /></AppShell>}>
      <ProposeInner />
    </Suspense>
  );
}
