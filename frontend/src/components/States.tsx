"use client";

import { AlertCircle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

/** A skeleton card. Used wherever a real card will land, at the real size. */
export function SkeletonCard({ lines = 3, height = 150 }: { lines?: number; height?: number }) {
  return (
    <div className="card" style={{ padding: 20, minHeight: height }}>
      <div className="skeleton" style={{ height: 14, width: "55%", marginBottom: 14 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: 10, width: `${88 - i * 13}%`, marginBottom: 10 }}
        />
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonLines({ rows = 4 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 12, width: `${95 - i * 8}%`, marginBottom: 12 }} />
      ))}
    </div>
  );
}

/**
 * An error that says what actually failed and offers the one action that might
 * help. "Something went wrong" is not an error state, it is an apology.
 */
export function ErrorState({
  title = "Could not read the chain",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 26,
        borderColor: "rgba(201,112,112,0.35)",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      <AlertCircle size={20} color="var(--rose)" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div className="serif" style={{ fontSize: "1.05rem", marginBottom: 6 }}>{title}</div>
        <p style={{ margin: 0, color: "var(--cream-dim)", fontSize: "0.87rem", lineHeight: 1.6 }}>
          {message ??
            "Studio Devnet did not answer. It meters requests per minute and occasionally has a bad one; nothing on chain has changed."}
        </p>
        {onRetry && (
          <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={onRetry}>
            <RefreshCw size={15} /> Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
  icon,
}: {
  title: string;
  message: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "44px 26px",
        textAlign: "center",
        borderStyle: "dashed",
        borderColor: "var(--line)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14, color: "var(--gold-dim)" }}>
        {icon ?? <Inbox size={26} strokeWidth={1.6} />}
      </div>
      <div className="serif" style={{ fontSize: "1.15rem", marginBottom: 8 }}>{title}</div>
      <p
        style={{
          margin: "0 auto",
          maxWidth: 420,
          color: "var(--muted)",
          fontSize: "0.88rem",
          lineHeight: 1.65,
        }}
      >
        {message}
      </p>
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}
