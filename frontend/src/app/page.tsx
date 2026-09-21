"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Coins,
  FileText,
  Lock,
  Scale,
  Shield,
  Trophy,
} from "lucide-react";
import { LandingHeader } from "@/components/LandingHeader";
import { Footer } from "@/components/Footer";
import { HeroVisual } from "@/components/HeroVisual";
import { LiveExample } from "@/components/LiveExample";
import { Reveal } from "@/components/Reveal";
import { CountUp } from "@/components/CountUp";
import { useStats } from "@/lib/hooks";
import { formatGen } from "@/lib/format";

const STEPS = [
  {
    Icon: Coins,
    title: "Fund",
    body: "A treasurer deposits the pool and writes three to five criteria in plain English, each with a weight. The pool locks the moment the round opens.",
  },
  {
    Icon: FileText,
    title: "Propose",
    body: "Builders file a proposal and stake a small deposit. It comes back in full to anyone who clears the bar — it is not a fee.",
  },
  {
    Icon: Scale,
    title: "Evaluate",
    body: "After the deadline, anyone can trigger an evaluation. Validators read the proposal against each criterion independently and score it.",
  },
  {
    Icon: Trophy,
    title: "Award",
    body: "Ranking and settlement are ordinary arithmetic over the agreed scores. Top proposals are funded in proportion to what they scored.",
  },
];

const REASONS = [
  {
    Icon: BarChart3,
    title: "Weighted",
    body: "Criteria have weights. Scores are integer buckets from 0 to 7, and a criterion your proposal never addresses cannot be given more than a 2 — by any validator, any leader or any model.",
  },
  {
    Icon: Lock,
    title: "Trustless",
    body: "No committee, no politics. Every score is agreed by independent validators, and every value the contract stores is a value they compared. Nothing a single node reports can move a wei.",
  },
  {
    Icon: Shield,
    title: "Contestable",
    body: "Rejected? Stake an appeal, add evidence, and the proposal is re-read against the same rubric. A successful appeal is paid out of what the ranking did not allocate — never taken back from a winner.",
  },
];

export default function Landing() {
  const { data: stats } = useStats();

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <LandingHeader />

      {/* ---- hero ---- */}
      <section
        style={{
          position: "relative",
          padding: "clamp(48px, 9vw, 110px) 16px clamp(56px, 8vw, 96px)",
          background:
            "radial-gradient(1100px 520px at 76% -8%, rgba(212,168,71,0.14), transparent 62%), radial-gradient(900px 520px at 6% 8%, rgba(16,185,129,0.1), transparent 60%)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            display: "grid",
            gap: "clamp(34px, 5vw, 60px)",
            gridTemplateColumns: "minmax(0, 1fr)",
            alignItems: "center",
          }}
          className="hero-grid"
        >
          <div>
            <Reveal>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 12px",
                  borderRadius: 999,
                  fontSize: "0.75rem",
                  color: "var(--gold)",
                  background: "rgba(212,168,71,0.09)",
                  border: "1px solid rgba(212,168,71,0.24)",
                  marginBottom: 22,
                }}
              >
                <Scale size={13} /> DAO grant evaluation by open criteria
              </span>
            </Reveal>

            <Reveal delay={0.05}>
              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(2.4rem, 6.4vw, 4.1rem)",
                  lineHeight: 1.03,
                  letterSpacing: "-0.028em",
                }}
              >
                Fund what matters.
                <br />
                <span style={{ color: "var(--gold)" }}>Let consensus decide.</span>
              </h1>
            </Reveal>

            <Reveal delay={0.1}>
              <p
                style={{
                  margin: "22px 0 0",
                  fontSize: "clamp(1.02rem, 2.1vw, 1.2rem)",
                  lineHeight: 1.65,
                  color: "var(--cream-dim)",
                  maxWidth: 540,
                }}
              >
                DAO grants scored by independent validators, not committees. A
                treasurer writes the criteria. Builders write the proposals.
                GenLayer does the reading — and nothing else here is decided by
                anything but arithmetic.
              </p>
            </Reveal>

            <Reveal delay={0.16}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
                <Link href="/create" className="btn btn-primary" style={{ padding: "0.8rem 1.3rem" }}>
                  <Coins size={17} /> Create a round
                </Link>
                <Link href="/rounds" className="btn btn-ghost" style={{ padding: "0.8rem 1.3rem" }}>
                  Browse open rounds <ArrowRight size={16} />
                </Link>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.12} className="hero-visual">
            <div style={{ display: "flex", justifyContent: "center" }}>
              <HeroVisual />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- stats banner ---- */}
      <section style={{ padding: "0 16px" }}>
        <div
          className="card"
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "26px 22px",
            display: "grid",
            gap: 22,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            background: "linear-gradient(180deg, rgba(23,54,45,0.7), rgba(15,37,31,0.7))",
          }}
        >
          <Stat
            label="GEN distributed"
            value={Number(formatGen(stats?.total_awarded_wei ?? "0", 2).replace(/,/g, ""))}
            decimals={2}
          />
          <Stat label="Proposals evaluated" value={stats?.evaluations ?? 0} />
          <Stat label="Rounds run" value={stats?.rounds ?? 0} />
          <Stat label="Appeals heard" value={stats?.contests ?? 0} />
        </div>
      </section>

      {/* ---- how it works ---- */}
      <Section
        eyebrow="How it works"
        title="Four steps, and only one of them needs a model"
        blurb="A grant round is mostly bookkeeping. The part that is not — reading a proposal against a criterion written in English — is the part GenLayer does."
      >
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          }}
        >
          {STEPS.map(({ Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.06}>
              <div className="card card-hover" style={{ padding: 22, height: "100%" }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(212,168,71,0.1)",
                    border: "1px solid rgba(212,168,71,0.25)",
                    marginBottom: 15,
                  }}
                >
                  <Icon size={19} color="var(--gold)" strokeWidth={1.8} />
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--gold-dim)", letterSpacing: "0.1em", marginBottom: 6 }}>
                  STEP {i + 1}
                </div>
                <h3 style={{ margin: "0 0 9px", fontSize: "1.12rem" }}>{title}</h3>
                <p style={{ margin: 0, fontSize: "0.87rem", lineHeight: 1.65, color: "var(--cream-dim)" }}>{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---- why ---- */}
      <Section
        eyebrow="Why GrantJudge"
        title="The judgement is consensus. The money is arithmetic."
        blurb="A model that answered nonsense could, at worst, decline to fund something. It could never pay anybody — because not one wei in this contract is moved by a model."
      >
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(275px, 1fr))",
          }}
        >
          {REASONS.map(({ Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.07}>
              <div className="card card-hover" style={{ padding: 24, height: "100%" }}>
                <Icon size={22} color="var(--gold)" strokeWidth={1.7} />
                <h3 style={{ margin: "15px 0 10px", fontSize: "1.2rem" }}>{title}</h3>
                <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.68, color: "var(--cream-dim)" }}>{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---- live example ---- */}
      <Section
        eyebrow="Proof, not a screenshot"
        title="A real round, on a real chain"
        blurb="Every number below is read from the deployed contract as this page loads. The scores were agreed by validators; the split is the contract's own arithmetic, and it is re-derivable from storage by anybody."
      >
        <Reveal>
          <LiveExample />
        </Reveal>
      </Section>

      {/* ---- closing CTA ---- */}
      <section style={{ padding: "72px 16px 20px" }}>
        <Reveal>
          <div
            className="card"
            style={{
              maxWidth: 820,
              margin: "0 auto",
              padding: "clamp(30px, 5vw, 52px)",
              textAlign: "center",
              background: "linear-gradient(165deg, rgba(23,54,45,0.9), rgba(12,33,28,0.9))",
              borderColor: "rgba(212,168,71,0.22)",
            }}
          >
            <h2 style={{ margin: "0 0 14px", fontSize: "clamp(1.6rem, 4vw, 2.3rem)" }}>
              Stop deciding grants in a group chat
            </h2>
            <p
              style={{
                margin: "0 auto 26px",
                maxWidth: 540,
                color: "var(--cream-dim)",
                fontSize: "1rem",
                lineHeight: 1.7,
              }}
            >
              Write down what you are actually funding for, put a number beside
              each of them, and let a set of independent readers score against it.
              Everything after that is addition.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
              <Link href="/create" className="btn btn-primary" style={{ padding: "0.8rem 1.4rem" }}>
                <Coins size={17} /> Create a round
              </Link>
              <Link href="/docs" className="btn btn-ghost" style={{ padding: "0.8rem 1.4rem" }}>
                Read the docs <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <div style={{ flex: 1 }} />
      <Footer />

      <style>{`
        @media (min-width: 940px) {
          .hero-grid { grid-template-columns: 1.08fr 0.92fr !important; }
        }
        @media (max-width: 939px) {
          .hero-visual { order: 2; }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, decimals = 0 }: { label: string; value: number; decimals?: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="serif" style={{ fontSize: "clamp(1.7rem, 4vw, 2.3rem)", color: "var(--gold-bright)", lineHeight: 1 }}>
        <CountUp value={value} decimals={decimals} />
      </div>
      <div style={{ marginTop: 8, fontSize: "0.78rem", color: "var(--muted)", letterSpacing: "0.04em" }}>{label}</div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  blurb,
  children,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ padding: "clamp(56px, 8vw, 92px) 16px 0" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Reveal>
          <div style={{ maxWidth: 680, marginBottom: 32 }}>
            <div style={{ fontSize: "0.73rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>
              {eyebrow}
            </div>
            <h2 style={{ margin: "0 0 14px", fontSize: "clamp(1.6rem, 3.8vw, 2.35rem)", lineHeight: 1.16 }}>{title}</h2>
            <p style={{ margin: 0, color: "var(--cream-dim)", fontSize: "0.97rem", lineHeight: 1.7 }}>{blurb}</p>
          </div>
        </Reveal>
        {children}
      </div>
    </section>
  );
}
