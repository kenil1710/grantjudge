"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown } from "lucide-react";

/**
 * The landing page's right-hand side: four proposals sliding into ranked
 * positions as their scores come in.
 *
 * It is an ILLUSTRATION and says so — the numbers are the shape of a real
 * round, not a reading of one. The live example further down the page is the
 * real thing, read off the chain.
 */
const ENTRIES = [
  { id: "A", name: "Ecosystem indexer", score: 542, award: "2.50" },
  { id: "B", name: "Contract test kit", score: 540, award: "2.00" },
  { id: "C", name: "Block explorer", score: 88, award: "0.00" },
  { id: "D", name: "Moonshot platform", score: 40, award: "0.00" },
];

const STAGES = ["filed", "scoring", "ranked"] as const;

export function HeroVisual() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStage((s) => (s + 1) % 3), 2600);
    return () => clearInterval(id);
  }, []);

  const phase = STAGES[stage];
  const ordered =
    phase === "ranked" || phase === "scoring"
      ? [...ENTRIES].sort((a, b) => b.score - a.score)
      : ENTRIES;

  return (
    <div
      className="card"
      style={{
        padding: 22,
        width: "100%",
        maxWidth: 460,
        background: "linear-gradient(165deg, #143229 0%, #0c211c 100%)",
        borderColor: "rgba(212,168,71,0.2)",
        boxShadow: "0 30px 70px -40px rgba(212,168,71,0.55)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: "0.74rem", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--gold)" }}>
          Ecosystem Growth · 5 GEN
        </span>
        <AnimatePresence mode="wait">
          <motion.span
            key={phase}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.25 }}
            style={{ fontSize: "0.72rem", color: "var(--cream-dim)" }}
          >
            {phase === "filed" ? "4 proposals filed" : phase === "scoring" ? "validators scoring…" : "ranked · 2 seats"}
          </motion.span>
        </AnimatePresence>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: "0.7rem", color: "var(--muted)" }}>
        Illustration — a live round is shown further down.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
        {ordered.map((entry, i) => {
          const funded = phase === "ranked" && i < 2;
          const scored = phase !== "filed";
          return (
            <motion.div
              key={entry.id}
              layout
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 13px",
                borderRadius: 11,
                background: funded ? "rgba(255,215,0,0.07)" : "rgba(0,0,0,0.25)",
                border: `1px solid ${funded ? "rgba(255,215,0,0.32)" : "var(--line-soft)"}`,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  display: "grid",
                  placeItems: "center",
                  fontSize: "0.72rem",
                  color: funded ? "#241a05" : "var(--cream-dim)",
                  background: funded ? "var(--gold-bright)" : "rgba(255,255,255,0.05)",
                  flexShrink: 0,
                  fontWeight: 600,
                }}
              >
                {phase === "filed" ? entry.id : i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.84rem", color: "var(--cream)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {entry.name}
                </div>
                <div style={{ height: 5, borderRadius: 999, background: "rgba(0,0,0,0.4)", marginTop: 6, overflow: "hidden" }}>
                  <motion.div
                    animate={{ width: scored ? `${(entry.score / 700) * 100}%` : "0%" }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      height: "100%",
                      borderRadius: 999,
                      background: funded
                        ? "linear-gradient(90deg, var(--gold), var(--gold-bright))"
                        : "linear-gradient(90deg, var(--gold-dim), var(--gold))",
                    }}
                  />
                </div>
              </div>
              <span style={{ fontSize: "0.78rem", color: scored ? "var(--gold)" : "var(--muted)", width: 42, textAlign: "right", flexShrink: 0 }}>
                {scored ? (entry.score / 100).toFixed(2) : "—"}
              </span>
              <span style={{ width: 62, textAlign: "right", fontSize: "0.78rem", flexShrink: 0, color: funded ? "var(--gold-bright)" : "var(--muted)" }}>
                {phase === "ranked" ? `${entry.award}` : "—"}
              </span>
              {funded && i === 0 && (
                <motion.span
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 14 }}
                  style={{ position: "absolute", right: -9, marginTop: -34, color: "var(--gold-bright)" }}
                >
                  <Crown size={17} className="pulse" />
                </motion.span>
              )}
            </motion.div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: "1px solid var(--line-soft)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.74rem",
          color: "var(--muted)",
        }}
      >
        <span>awards + remainder = pool, exactly</span>
        <span style={{ color: "var(--gold)" }}>4.50 + 0.50 = 5.00</span>
      </div>
    </div>
  );
}
