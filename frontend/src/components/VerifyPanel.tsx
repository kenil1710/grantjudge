"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BadgeCheck, Check, ChevronDown, ShieldCheck, X } from "lucide-react";
import { useVerification } from "@/lib/hooks";
import { SkeletonLines } from "./States";

/**
 * Re-derive a stored evaluation from storage and show the result field by
 * field.
 *
 * This is the button that makes the rest of the page checkable rather than
 * merely asserted: it calls `verify_evaluation`, which reads the proposal text,
 * the rubric and the agreed score vector out of storage, recomputes the
 * signals, the coverage, the brackets, the weighted total, the written finding
 * and the content hash, and reports each one beside what was stored. It takes
 * no input from the caller and consults no model.
 */
export function VerifyPanel({ roundId, proposalId }: { roundId: number; proposalId: number }) {
  const [open, setOpen] = useState(false);
  const { data, error, isLoading } = useVerification(roundId, proposalId, open);

  return (
    <div style={{ marginTop: 16 }}>
      <button
        className="btn btn-ghost"
        onClick={() => setOpen((v) => !v)}
        style={{ fontSize: "0.82rem", padding: "6px 12px" }}
      >
        <ShieldCheck size={15} />
        {open ? "Hide verification" : "Verify this score from storage"}
        <ChevronDown
          size={14}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="card"
              style={{ marginTop: 12, padding: 18, background: "rgba(0,0,0,0.22)" }}
            >
              {isLoading && <SkeletonLines rows={5} />}
              {error && (
                <p style={{ margin: 0, color: "var(--rose)", fontSize: "0.85rem" }}>
                  Could not run the verification: {(error as Error).message}
                </p>
              )}
              {data && !data.scored && (
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.86rem" }}>
                  This proposal has no score to verify yet.
                </p>
              )}
              {data?.scored && (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      marginBottom: 14,
                      color: data.verified ? "var(--emerald)" : "var(--rose)",
                    }}
                  >
                    <BadgeCheck size={18} />
                    <strong style={{ fontSize: "0.94rem" }}>
                      {data.verified
                        ? "Every stored field re-derives from its own inputs"
                        : "One or more stored fields do not re-derive"}
                    </strong>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {[...data.checks, ...data.contest_checks].map((row) => (
                      <div
                        key={row.field}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "18px minmax(120px, 170px) 1fr",
                          gap: 10,
                          alignItems: "start",
                          fontSize: "0.78rem",
                          padding: "5px 0",
                          borderBottom: "1px solid rgba(255,255,255,0.03)",
                        }}
                      >
                        {row.ok ? (
                          <Check size={14} color="var(--emerald)" />
                        ) : (
                          <X size={14} color="var(--rose)" />
                        )}
                        <span style={{ color: "var(--cream-dim)" }}>{row.field}</span>
                        <span
                          className="mono"
                          style={{
                            color: row.ok ? "var(--muted)" : "var(--rose)",
                            wordBreak: "break-word",
                          }}
                        >
                          {row.ok ? row.stored || "—" : `stored ${row.stored} · recomputed ${row.recomputed}`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p
                    style={{
                      margin: "14px 0 0",
                      fontSize: "0.76rem",
                      color: "var(--muted)",
                      lineHeight: 1.6,
                    }}
                  >
                    {data.note}
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
