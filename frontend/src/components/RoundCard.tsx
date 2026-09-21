"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Coins, FileText, Trophy, Users } from "lucide-react";
import type { RoundCard as RoundCardData } from "@/types";
import { formatGen, scoreText, shortAddress } from "@/lib/format";
import { RoundBadge } from "./StatusBadge";
import { Countdown } from "./Countdown";

export function RoundCard({ round, index = 0 }: { round: RoundCardData; index?: number }) {
  const open = round.phase === "OPEN";
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.3), ease: [0.22, 1, 0.36, 1] }}
    >
      <Link href={`/round/${round.round_id}`} style={{ textDecoration: "none", color: "inherit" }}>
        <div
          className="card card-hover"
          style={{
            padding: 20,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            ...(open ? { boxShadow: "0 0 0 1px rgba(16,185,129,0.16)" } : {}),
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", lineHeight: 1.3 }}>{round.name}</h3>
              <div className="mono" style={{ color: "var(--muted)", marginTop: 5, fontSize: "0.72rem" }}>
                round #{round.round_id} · {shortAddress(round.treasurer)}
              </div>
            </div>
            <RoundBadge phase={round.phase} size="sm" />
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <Coins size={18} color="var(--gold)" strokeWidth={1.9} />
            <span className="serif" style={{ fontSize: "1.85rem", color: "var(--gold-bright)", lineHeight: 1 }}>
              {formatGen(round.pool_wei)}
            </span>
            <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>GEN pool</span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {round.criteria_names.slice(0, 4).map((name) => (
              <span
                key={name}
                style={{
                  fontSize: "0.72rem",
                  padding: "3px 9px",
                  borderRadius: 999,
                  color: "var(--cream-dim)",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--line-soft)",
                }}
              >
                {name}
              </span>
            ))}
          </div>

          <div
            style={{
              marginTop: "auto",
              paddingTop: 12,
              borderTop: "1px solid var(--line-soft)",
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              alignItems: "center",
              fontSize: "0.79rem",
              color: "var(--muted)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <FileText size={14} strokeWidth={1.9} />
              {round.proposal_count}/{round.max_proposals}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Users size={14} strokeWidth={1.9} />
              {round.max_winners} {round.max_winners === 1 ? "seat" : "seats"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Trophy size={14} strokeWidth={1.9} />
              bar {scoreText(round.min_score_threshold)}
            </span>
            <span style={{ marginLeft: "auto" }}>
              {open ? (
                <Countdown deadline={round.deadline} expired="closing" />
              ) : round.funded_count > 0 ? (
                <span style={{ color: "var(--gold)" }}>
                  {formatGen(round.allocated_wei)} GEN awarded
                </span>
              ) : (
                <span>—</span>
              )}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
