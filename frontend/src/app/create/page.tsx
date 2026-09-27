"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  Info,
  Layers,
  ListChecks,
  Plus,
  Trash2,
  Rocket,
  ScrollText,
  SlidersHorizontal,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Confetti } from "@/components/Confetti";
import { CriteriaEditor, type DraftCriterion } from "@/components/CriteriaEditor";
import { TxButton } from "@/components/TxButton";
import { useConfig } from "@/lib/hooks";
import { createPool, createRound, type PoolOptions } from "@/lib/contract";
import { formatGen, parseGen, scoreText } from "@/lib/format";

const STEPS = [
  { title: "The round", Icon: ScrollText },
  { title: "The rubric", Icon: ListChecks },
  { title: "The rules", Icon: SlidersHorizontal },
  { title: "Pool options", Icon: Layers },
  { title: "The pool", Icon: Coins },
  { title: "Review", Icon: Rocket },
];

const DEFAULT_CRITERIA: DraftCriterion[] = [
  {
    name: "Technical feasibility",
    description: "Can this team actually build the thing they describe, and does the plan show they know how?",
    weight: 30,
  },
  {
    name: "Team experience",
    description: "Has this team shipped comparable work before?",
    weight: 25,
  },
  {
    name: "Community impact",
    description: "Who benefits, how many of them, and how directly?",
    weight: 25,
  },
  {
    name: "Budget reasonableness",
    description: "Is the money costed out, and is the cost proportionate to the work?",
    weight: 20,
  },
];

const WINDOWS = [
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86400 },
  { label: "3 days", seconds: 3 * 86400 },
  { label: "7 days", seconds: 7 * 86400 },
  { label: "14 days", seconds: 14 * 86400 },
];

export default function CreatePage() {
  const { data: config } = useConfig();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState<DraftCriterion[]>(DEFAULT_CRITERIA);
  const [deadline, setDeadline] = useState(7 * 86400);
  const [maxProposals, setMaxProposals] = useState(12);
  const [maxWinners, setMaxWinners] = useState(3);
  const [threshold, setThreshold] = useState(400);
  const [pool, setPool] = useState("5");
  const [created, setCreated] = useState<number | null>(null);
  // --- the milestone build: every one of these is optional, and with all of
  // them off the wizard opens a plain round exactly as it always did.
  const [asPool, setAsPool] = useState(false);
  const [approvers, setApprovers] = useState<string[]>([]);
  const [milestones, setMilestones] = useState<{ description: string; percentage: number; proof_format: string }[]>([]);
  const [minReputation, setMinReputation] = useState(0);
  const [createdPool, setCreatedPool] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pool") === "1") {
      setAsPool(true);
    }
  }, []);

  const HEX = /^0x[0-9a-fA-F]{40}$/;
  const milestoneTotal = milestones.reduce((s, m) => s + (Number(m.percentage) || 0), 0);
  const options: PoolOptions = {
    co_approvers: approvers.map((a) => a.trim()).filter(Boolean),
    milestones: milestones.map((m) => ({ ...m, description: m.description.trim(), proof_format: m.proof_format.trim() })),
    min_reputation: minReputation,
  };

  const minCriteria = config?.min_criteria ?? 3;
  const maxCriteria = config?.max_criteria ?? 5;
  const minPoolWei = config ? BigInt(config.min_pool_wei) : 10n ** 18n;
  const poolWei = useMemo(() => parseGen(pool), [pool]);
  const weightTotal = criteria.reduce((s, c) => s + c.weight, 0);

  const criteriaJson = useMemo(
    () =>
      JSON.stringify(
        criteria.map((c) => ({
          name: c.name.trim(),
          description: c.description.trim(),
          weight_bps: c.weight * 100,
        })),
      ),
    [criteria],
  );

  const stepProblems: string[][] = [
    [
      ...(name.trim().length < 3 ? ["The round needs a name of at least 3 characters."] : []),
    ],
    [
      ...(criteria.length < minCriteria || criteria.length > maxCriteria
        ? [`A round needs between ${minCriteria} and ${maxCriteria} criteria.`]
        : []),
      ...(criteria.some((c) => c.name.trim().length === 0) ? ["Every criterion needs a name."] : []),
      ...(new Set(criteria.map((c) => c.name.trim().toLowerCase())).size !== criteria.length
        ? ["Two criteria cannot share a name — a score vector could not tell them apart."]
        : []),
      ...(weightTotal !== 100 ? [`The weights total ${weightTotal}% and must be exactly 100%.`] : []),
    ],
    [
      ...(maxWinners > maxProposals
        ? ["A round cannot fund more proposals than it will accept."]
        : []),
    ],
    [
      ...(asPool && approvers.some((a) => !HEX.test(a.trim()))
        ? ["Every co-approver must be a 0x address."]
        : []),
      ...(asPool && new Set(approvers.map((a) => a.trim().toLowerCase())).size !== approvers.length
        ? ["A co-approver cannot be listed twice."]
        : []),
      ...(asPool && milestones.length > 0 && milestoneTotal !== 100
        ? [`Milestone percentages total ${milestoneTotal}% and must be exactly 100%.`]
        : []),
      ...(asPool && milestones.some((m) => m.description.trim().length < 3)
        ? ["Every milestone needs a description."]
        : []),
    ],
    [
      ...(poolWei < minPoolWei
        ? [`The pool must be at least ${formatGen(minPoolWei)} GEN.`]
        : []),
    ],
    [],
  ];

  const blocked = stepProblems[step].length > 0;
  const allProblems = stepProblems.flat();

  if (created) {
    return (
      <AppShell title="Round is open">
        <div
          className="card"
          style={{ padding: 34, textAlign: "center", borderColor: "rgba(255,215,0,0.3)", position: "relative", overflow: "hidden" }}
        >
          <Confetti />
          <CheckCircle2 size={34} color="var(--gold-bright)" />
          <h2 style={{ margin: "16px 0 10px", fontSize: "1.5rem" }}>Round #{created} is taking proposals</h2>
          <p style={{ margin: "0 auto 22px", maxWidth: 480, color: "var(--cream-dim)", lineHeight: 1.7, fontSize: "0.92rem" }}>
            The pool is locked and the rubric is fixed. You cannot change either
            — and you cannot withdraw the pool once the first proposal is filed.
            After the deadline, anyone can trigger the evaluations.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href={`/round/${created}`} className="btn btn-primary">
              Open the round <ArrowRight size={15} />
            </Link>
            {createdPool ? (
              <Link href={`/pool/${createdPool}`} className="btn btn-ghost">Pool #{createdPool}</Link>
            ) : (
              <Link href="/rounds" className="btn btn-ghost">All rounds</Link>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="Create"
      title="Open a grant round"
      blurb="Six steps. The pool locks when you submit and the rubric is fixed for good — there is no setter for either, which is the point."
    >
      {/* stepper */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 26,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        {STEPS.map(({ title, Icon }, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <button
              key={title}
              onClick={() => i <= step && setStep(i)}
              className="btn"
              style={{
                flex: "1 0 auto",
                padding: "9px 12px",
                fontSize: "0.8rem",
                justifyContent: "center",
                cursor: i <= step ? "pointer" : "default",
                color: active ? "var(--gold)" : done ? "var(--emerald)" : "var(--muted)",
                background: active ? "rgba(212,168,71,0.11)" : "rgba(255,255,255,0.03)",
                borderColor: active ? "rgba(212,168,71,0.4)" : "var(--line)",
              }}
            >
              {done ? <CheckCircle2 size={15} /> : <Icon size={15} />}
              <span>{title}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -14 }}
          transition={{ duration: 0.25 }}
        >
          {step === 0 && (
            <div className="card" style={{ padding: 24 }}>
              <Field label="Round name">
                <input
                  className="input"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="GenLayer Ecosystem Growth"
                />
              </Field>
              <Field
                label="What this round is for"
                hint="Shown on the round page. It is not scored — the criteria are what proposals are read against."
              >
                <textarea
                  className="textarea"
                  rows={5}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Funding the infrastructure the rest of the ecosystem builds on."
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="card" style={{ padding: 24 }}>
              <Note>
                Criteria are what a proposal is actually read against, and the
                WORDS MATTER twice over. The validators read them, and the
                contract also measures how much of each criterion a proposal
                addresses at all — so a criterion named plainly gives a proposal
                something to hit. A criterion a proposal never touches caps at 2
                out of 7, whatever anybody thinks of it.
              </Note>
              <div style={{ height: 18 }} />
              <CriteriaEditor
                criteria={criteria}
                onChange={setCriteria}
                min={minCriteria}
                max={maxCriteria}
              />
            </div>
          )}

          {step === 2 && (
            <div className="card" style={{ padding: 24, display: "grid", gap: 22 }}>
              <Field label="How long proposals stay open">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {WINDOWS.map((w) => (
                    <button
                      key={w.seconds}
                      className="btn"
                      onClick={() => setDeadline(w.seconds)}
                      style={{
                        padding: "7px 13px",
                        fontSize: "0.83rem",
                        color: deadline === w.seconds ? "var(--gold)" : "var(--cream-dim)",
                        background: deadline === w.seconds ? "rgba(212,168,71,0.12)" : "rgba(255,255,255,0.03)",
                        borderColor: deadline === w.seconds ? "rgba(212,168,71,0.4)" : "var(--line)",
                      }}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={`Maximum proposals — ${maxProposals}`}>
                <input
                  type="range"
                  min={1}
                  max={config?.max_proposals_ceiling ?? 64}
                  value={maxProposals}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMaxProposals(v);
                    if (maxWinners > v) setMaxWinners(v);
                  }}
                  style={{ width: "100%", accentColor: "var(--gold)" }}
                />
              </Field>

              <Field
                label={`Seats — ${maxWinners}`}
                hint="How many proposals can be funded. The pool is split between the winners in proportion to their scores, capped at what each asked for."
              >
                <input
                  type="range"
                  min={1}
                  max={Math.min(maxProposals, config?.max_winners_ceiling ?? 32)}
                  value={maxWinners}
                  onChange={(e) => setMaxWinners(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--gold)" }}
                />
              </Field>

              <Field
                label={`The bar — ${scoreText(threshold)} out of 7.00`}
                hint="Below this, a proposal is rejected and forfeits its deposit to the pool. At or above it, the deposit comes back whether or not there was a seat."
              >
                <input
                  type="range"
                  min={0}
                  max={700}
                  step={5}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--gold)" }}
                />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="card" style={{ padding: 24, display: "grid", gap: 20 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" checked={asPool} onChange={(e) => setAsPool(e.target.checked)} style={{ marginTop: 4 }} />
                <span>
                  <strong>Run this as a multi-round pool</strong>
                  <span style={{ display: "block", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.6, marginTop: 3 }}>
                    Same rubric every round, fresh proposals each time. Top up the reserve between rounds and open the next
                    one from the pool&apos;s page. A proposal the pool has already read cannot be filed again word for word.
                    Leave this off for a single plain round — nothing below applies to one.
                  </span>
                </span>
              </label>

              {asPool && (
                <>
                  <Field
                    label="Co-approvers (optional, up to 3)"
                    hint="A majority must sign off before the round is ranked: 1 of 1, 2 of 2, 2 of 3. They cannot touch scores or criteria, and if they never sign the requirement lapses so nobody's deposit is frozen."
                  >
                    <div style={{ display: "grid", gap: 8 }}>
                      {approvers.map((a, i) => (
                        <div key={i} style={{ display: "flex", gap: 8 }}>
                          <input
                            className="input mono"
                            placeholder="0x…"
                            value={a}
                            onChange={(e) => setApprovers(approvers.map((x, j) => (j === i ? e.target.value : x)))}
                          />
                          <button className="btn btn-ghost" aria-label="Remove co-approver" onClick={() => setApprovers(approvers.filter((_, j) => j !== i))}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                      {approvers.length < 3 && (
                        <button className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={() => setApprovers([...approvers, ""])}>
                          <Plus size={15} /> Add a co-approver
                        </button>
                      )}
                    </div>
                  </Field>

                  <Field
                    label="Milestone release (optional, up to 4)"
                    hint="Winners are paid in tranches. Each proof is judged by the validators against the milestone as you write it here; percentages must total exactly 100. A tranche never delivered returns to you after the delivery window."
                  >
                    <div style={{ display: "grid", gap: 10 }}>
                      {milestones.map((m, i) => (
                        <div key={i} style={{ display: "grid", gap: 6, padding: 10, borderRadius: 10, border: "1px solid var(--line-soft)" }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              className="input"
                              placeholder={i === 0 ? "MVP demo" : "Final delivery"}
                              value={m.description}
                              maxLength={200}
                              onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                            />
                            <input
                              className="input"
                              style={{ width: 84 }}
                              type="number"
                              min={1}
                              max={100}
                              value={m.percentage}
                              aria-label="Percentage"
                              onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, percentage: Number(e.target.value) || 0 } : x)))}
                            />
                            <button className="btn btn-ghost" aria-label="Remove milestone" onClick={() => setMilestones(milestones.filter((_, j) => j !== i))}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <input
                            className="input"
                            placeholder="Expected proof, e.g. release tag and usage figures"
                            value={m.proof_format}
                            maxLength={120}
                            onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, proof_format: e.target.value } : x)))}
                          />
                        </div>
                      ))}
                      {milestones.length < 4 && (
                        <button
                          className="btn btn-ghost"
                          style={{ justifySelf: "start" }}
                          onClick={() =>
                            setMilestones([
                              ...milestones,
                              { description: "", percentage: milestones.length === 0 ? 60 : 40, proof_format: "" },
                            ])
                          }
                        >
                          <Plus size={15} /> Add a milestone
                        </button>
                      )}
                      {milestones.length > 0 && (
                        <span style={{ fontSize: "0.78rem", color: milestoneTotal === 100 ? "var(--muted)" : "var(--rose)" }}>
                          total {milestoneTotal}%
                        </span>
                      )}
                    </div>
                  </Field>

                  <Field
                    label="Reputation floor"
                    hint="How many proposals this contract must already have funded for a wallet to enter. Zero admits anybody. Reputation is computed from on-chain history and nobody can set it."
                  >
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={10}
                      value={minReputation}
                      onChange={(e) => setMinReputation(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                    />
                  </Field>
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="card" style={{ padding: 24 }}>
              <Field
                label="Pool (GEN)"
                hint={`At least ${formatGen(minPoolWei)} GEN. It is sent with this transaction and locked immediately.`}
              >
                <input
                  className="input"
                  inputMode="decimal"
                  value={pool}
                  onChange={(e) => setPool(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="5"
                />
              </Field>
              <Note>
                The pool locks the moment the round opens. You can cancel and
                take it back while no proposal has been filed — and not one
                second after that, because by then somebody has staked a deposit
                and spent an afternoon writing against your rubric. Whatever the
                ranking does not allocate comes back to you once the appeal
                window closes, along with every deposit forfeited by a proposal
                that scored below the bar.
              </Note>
            </div>
          )}

          {step === 5 && (
            <div style={{ display: "grid", gap: 16 }}>
              <div className="card" style={{ padding: 24 }}>
                <h3 style={{ margin: "0 0 4px", fontSize: "1.3rem" }}>{name || "Untitled round"}</h3>
                <p style={{ margin: "0 0 20px", color: "var(--cream-dim)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                  {description || "No description."}
                </p>
                <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))" }}>
                  <Summary label="Pool" value={`${pool || "0"} GEN`} gold />
                  <Summary label="Seats" value={String(maxWinners)} />
                  <Summary label="Max proposals" value={String(maxProposals)} />
                  <Summary label="The bar" value={`${scoreText(threshold)} / 7.00`} />
                  <Summary label="Open for" value={WINDOWS.find((w) => w.seconds === deadline)?.label ?? `${deadline}s`} />
                  <Summary label="Deposit" value={`${config ? formatGen(config.spam_stake_wei) : "0.10"} GEN`} />
                  {asPool && <Summary label="Series" value="multi-round pool" />}
                  {asPool && options.co_approvers!.length > 0 && (
                    <Summary label="Sign-off" value={`${Math.floor(options.co_approvers!.length / 2) + 1} of ${options.co_approvers!.length}`} />
                  )}
                  {asPool && milestones.length > 0 && (
                    <Summary label="Release" value={milestones.map((m) => `${m.percentage}%`).join(" / ")} />
                  )}
                  {asPool && minReputation > 0 && <Summary label="Floor" value={`${minReputation} funded`} />}
                </div>
                <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line-soft)" }}>
                  <div style={{ fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>
                    The rubric
                  </div>
                  <div style={{ display: "grid", gap: 9 }}>
                    {criteria.map((c) => (
                      <div key={c.name} style={{ fontSize: "0.86rem", color: "var(--cream-dim)" }}>
                        <strong style={{ color: "var(--cream)" }}>{c.name}</strong>{" "}
                        <span style={{ color: "var(--gold)" }}>({c.weight}%)</span>
                        {c.description ? ` — ${c.description}` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {allProblems.length > 0 && (
                <div
                  style={{
                    padding: "13px 15px",
                    borderRadius: 11,
                    background: "rgba(201,112,112,0.08)",
                    border: "1px solid rgba(201,112,112,0.26)",
                    fontSize: "0.84rem",
                    color: "var(--rose)",
                  }}
                >
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                    {allProblems.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              )}

              <TxButton
                label={`${asPool ? "Open the pool" : "Open the round"} · deposit ${pool || "0"} GEN`}
                pendingLabel="Opening…"
                icon={<Rocket size={16} />}
                disabled={allProblems.length > 0}
                send={(account) =>
                  asPool
                    ? createPool(account, {
                        name: name.trim(),
                        description: description.trim(),
                        criteriaJson,
                        maxProposals,
                        maxWinners,
                        minScoreThreshold: threshold,
                        deadlineSeconds: deadline,
                        poolWei,
                        options,
                      })
                    : createRound(account, {
                    name: name.trim(),
                    description: description.trim(),
                    criteriaJson,
                    maxProposals,
                    maxWinners,
                    minScoreThreshold: threshold,
                    deadlineSeconds: deadline,
                    poolWei,
                  })
                }
                onDone={(result) => {
                  if (result.status === "OK") {
                    setCreated(Number(result.round_id ?? 0) || -1);
                    if (result.pool_id) setCreatedPool(Number(result.pool_id));
                  }
                }}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* nav */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
        <button
          className="btn btn-ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ArrowLeft size={15} /> Back
        </button>
        {step < STEPS.length - 1 && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {blocked && (
              <span style={{ fontSize: "0.79rem", color: "var(--rose)", maxWidth: 400, textAlign: "right", lineHeight: 1.5 }}>
                {stepProblems[step][0]}
              </span>
            )}
            <button
              className="btn btn-primary"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={blocked}
            >
              Next <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: "0.73rem",
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          color: "var(--gold)",
          marginBottom: 9,
        }}
      >
        {label}
      </div>
      {children}
      {hint && (
        <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.6 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "13px 15px",
        borderRadius: 11,
        background: "rgba(212,168,71,0.05)",
        border: "1px solid rgba(212,168,71,0.2)",
      }}
    >
      <Info size={16} color="var(--gold)" style={{ flexShrink: 0, marginTop: 2 }} />
      <p style={{ margin: 0, fontSize: "0.83rem", lineHeight: 1.7, color: "var(--cream-dim)" }}>{children}</p>
    </div>
  );
}

function Summary({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "0.71rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: "0.98rem", color: gold ? "var(--gold-bright)" : "var(--cream)" }}>
        {value}
      </div>
    </div>
  );
}
