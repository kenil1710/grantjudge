"use client";

import { motion } from "framer-motion";
import { scorePct, scoreText } from "@/lib/format";

/**
 * One criterion's score, as a bar that fills.
 *
 * The bar is drawn against the BRACKET as well as the score where a bracket is
 * known: the pale segment is the range the evidence permitted and the solid one
 * is where the validators landed inside it. That is the whole scoring model in
 * one picture, and it is why the bracket is passed in rather than dropped.
 */
export function CriterionBar({
  name,
  score,
  weightBps,
  bracket,
  delay = 0,
}: {
  name: string;
  score: number;
  weightBps: number;
  bracket?: [number, number];
  delay?: number;
}) {
  const pct = (score / 7) * 100;
  const lo = bracket ? (bracket[0] / 7) * 100 : null;
  const hi = bracket ? (bracket[1] / 7) * 100 : null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: "0.86rem", color: "var(--cream)" }}>{name}</span>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
          <span style={{ color: "var(--gold)", fontWeight: 600 }}>{score}</span>
          <span>/7</span>
          <span style={{ marginLeft: 8 }}>{(weightBps / 100).toFixed(0)}%</span>
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 8,
          borderRadius: 999,
          background: "rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        {lo !== null && hi !== null && (
          <div
            title={`the evidence permitted ${bracket![0]}–${bracket![1]}`}
            style={{
              position: "absolute",
              left: `${lo}%`,
              width: `${Math.max(hi - lo, 0.8)}%`,
              top: 0,
              bottom: 0,
              background: "rgba(212,168,71,0.2)",
            }}
          />
        )}
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.75, delay, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 999,
            background: "linear-gradient(90deg, var(--gold-dim), var(--gold))",
          }}
        />
      </div>
    </div>
  );
}

/** The weighted total, big, with the threshold marked on it. */
export function TotalBar({
  score,
  threshold,
  label = "Weighted total",
}: {
  score: number;
  threshold: number;
  label?: string;
}) {
  const clears = score >= threshold;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: "0.8rem", color: "var(--muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {label}
        </span>
        <span
          className="serif"
          style={{ fontSize: "1.6rem", color: clears ? "var(--gold-bright)" : "var(--rose)" }}
        >
          {scoreText(score)}
          <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}> / 7.00</span>
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 12,
          borderRadius: 999,
          background: "rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${scorePct(score)}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 999,
            background: clears
              ? "linear-gradient(90deg, var(--gold), var(--gold-bright))"
              : "linear-gradient(90deg, #7c4a4a, var(--rose))",
          }}
        />
        <div
          title={`the round's bar: ${scoreText(threshold)}`}
          style={{
            position: "absolute",
            left: `${scorePct(threshold)}%`,
            top: -3,
            bottom: -3,
            width: 2,
            background: "var(--cream)",
            opacity: 0.85,
          }}
        />
      </div>
      <div style={{ marginTop: 6, fontSize: "0.74rem", color: "var(--muted)" }}>
        the round&rsquo;s bar is {scoreText(threshold)} — this {clears ? "clears" : "does not clear"} it
      </div>
    </div>
  );
}
