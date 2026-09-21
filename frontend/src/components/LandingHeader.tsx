"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logomark } from "./Logomark";

/**
 * The landing page's own header. NO WALLET BUTTON, deliberately: a visitor who
 * has not asked to connect should be able to read the whole page without a
 * wallet prompt, and a connect button on a marketing page is a prompt waiting
 * to happen.
 */
export function LandingHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "rgba(10,31,26,0.75)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid transparent",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "0 16px",
          height: 66,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: "var(--cream)" }}>
          <Logomark size={27} />
          <span className="serif" style={{ fontSize: "1.16rem" }}>GrantJudge</span>
        </Link>
        <nav style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <Link href="/docs" className="btn btn-ghost" style={{ padding: "7px 12px" }}>
            Docs
          </Link>
          <Link href="/rounds" className="btn btn-primary" style={{ padding: "7px 13px" }}>
            Open the app <ArrowRight size={15} />
          </Link>
        </nav>
      </div>
    </header>
  );
}
