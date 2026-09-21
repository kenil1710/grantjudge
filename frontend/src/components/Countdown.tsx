"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { formatDuration } from "@/lib/format";

/**
 * A live countdown to a unix instant.
 *
 * It ticks against the BROWSER's clock from a chain-supplied deadline, which is
 * the one place in this app where those two clocks meet. It is deliberately
 * display-only: every decision that turns on time is made by the contract
 * against the block time, so a browser a minute fast shows a slightly early
 * zero and changes nothing.
 */
export function Countdown({
  deadline,
  prefix = "",
  expired = "closed",
  icon = true,
}: {
  deadline: number;
  prefix?: string;
  expired?: string;
  icon?: boolean;
}) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, deadline - now);
  const text = left > 0 ? `${prefix}${formatDuration(left)}` : expired;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: "0.8rem",
        color: left > 0 ? "var(--cream-dim)" : "var(--muted)",
        whiteSpace: "nowrap",
      }}
    >
      {icon && <Timer size={14} strokeWidth={1.9} />}
      {text}
    </span>
  );
}
