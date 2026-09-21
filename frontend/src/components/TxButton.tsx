"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { waitForResult, type TransactionHash } from "@/lib/contract";
import type { WriteResult } from "@/types";
import { useWallet } from "./WalletProvider";

type State = "idle" | "signing" | "waiting" | "ok" | "rejected" | "error";

/**
 * A write, from click to outcome, with the contract's own words on failure.
 *
 * THE CRUCIAL PART IS THAT A REFUSAL IS NOT AN ERROR. GrantJudge never raises:
 * a call it will not perform returns `{status: "REJECTED", reason}` with the
 * value credited back to a pull ledger. So this reads `status` and shows the
 * contract's reason verbatim, and only treats a thrown exception — a wallet
 * rejection, an RPC failure — as an error. Showing a refusal as a crash would
 * tell the user something went wrong when in fact the contract did exactly what
 * it says it does.
 */
export function TxButton({
  label,
  pendingLabel = "Confirming…",
  icon,
  disabled,
  className = "btn btn-primary",
  title,
  send,
  onDone,
}: {
  label: string;
  pendingLabel?: string;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  title?: string;
  send: (account: `0x${string}`) => Promise<TransactionHash>;
  onDone?: (result: WriteResult) => void;
}) {
  const { account, onRightNetwork, connect, switchNetwork } = useWallet();
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string>("");

  async function run() {
    if (!account) {
      await connect();
      return;
    }
    if (!onRightNetwork) {
      await switchNetwork();
      return;
    }
    setState("signing");
    setMessage("");
    try {
      const hash = await send(account);
      setState("waiting");
      const result = await waitForResult(hash);
      if (result.status === "REJECTED") {
        setState("rejected");
        setMessage(result.reason ?? "The contract refused this call.");
      } else {
        setState("ok");
        setMessage("");
      }
      onDone?.(result);
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setState("error");
      setMessage(
        /user rejected|denied/i.test(text)
          ? "Cancelled in the wallet."
          : text.slice(0, 220),
      );
    }
  }

  const busy = state === "signing" || state === "waiting";

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 8, maxWidth: "100%" }}>
      <button
        className={className}
        onClick={run}
        disabled={disabled || busy}
        title={title}
      >
        {busy ? (
          <Loader2 size={16} className="pulse" />
        ) : state === "ok" ? (
          <CheckCircle2 size={16} />
        ) : (
          icon
        )}
        {busy ? (state === "signing" ? "Waiting for the wallet…" : pendingLabel) : !account ? "Connect wallet" : label}
      </button>

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              maxWidth: 480,
              fontSize: "0.79rem",
              lineHeight: 1.55,
              color: state === "rejected" ? "var(--amber)" : "var(--rose)",
              background: state === "rejected" ? "rgba(232,168,56,0.08)" : "rgba(201,112,112,0.08)",
              border: `1px solid ${state === "rejected" ? "rgba(232,168,56,0.25)" : "rgba(201,112,112,0.25)"}`,
              borderRadius: 10,
              padding: "9px 11px",
            }}
          >
            <XCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              {state === "rejected" && (
                <strong style={{ display: "block", marginBottom: 2 }}>
                  The contract refused this call — nothing moved and anything you sent is claimable.
                </strong>
              )}
              {message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
