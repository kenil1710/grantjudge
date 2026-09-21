"use client";

import { AlertTriangle, LogOut, Wallet } from "lucide-react";
import { useWallet } from "./WalletProvider";
import { NETWORK_LABEL } from "@/lib/genlayer";
import { shortAddress } from "@/lib/format";

/**
 * The connect button. NEVER RENDERED ON THE LANDING PAGE — a visitor who has
 * not asked to connect should be able to read the site without a wallet prompt.
 */
export function ConnectWallet({ compact = false }: { compact?: boolean }) {
  const { account, hasWallet, connecting, error, connect, disconnect, onRightNetwork, switchNetwork } =
    useWallet();

  if (!hasWallet) {
    return (
      <a
        className="btn btn-ghost"
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        title="An injected wallet is needed to send transactions. Reading works without one."
      >
        <Wallet size={16} />
        {compact ? "Wallet" : "Install a wallet"}
      </a>
    );
  }

  if (account && !onRightNetwork) {
    return (
      <button className="btn btn-ghost" onClick={switchNetwork} style={{ color: "var(--amber)" }}>
        <AlertTriangle size={16} />
        Switch to {NETWORK_LABEL}
      </button>
    );
  }

  if (account) {
    return (
      <button
        className="btn btn-ghost"
        onClick={disconnect}
        title="Clears this app's view of the session. Access is revoked in the wallet itself."
      >
        <span className="mono" style={{ color: "var(--gold)" }}>{shortAddress(account)}</span>
        <LogOut size={14} />
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button className="btn btn-primary" onClick={connect} disabled={connecting}>
        <Wallet size={16} />
        {connecting ? "Connecting…" : compact ? "Connect" : "Connect wallet"}
      </button>
      {error && (
        <span style={{ fontSize: "0.72rem", color: "var(--rose)", maxWidth: 260, textAlign: "right" }}>
          {error}
        </span>
      )}
    </div>
  );
}
