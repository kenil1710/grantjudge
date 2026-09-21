import Link from "next/link";
import { BookOpen, ExternalLink, FileCode2, Scale } from "lucide-react";
import { Logomark } from "./Logomark";
import { CONSUMER_ADDRESS, CONTRACT_ADDRESS, NETWORK_LABEL } from "@/lib/genlayer";

const REPO = "https://github.com/kenil1710/grantjudge";

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--line-soft)", marginTop: 88, background: "var(--bg-deep)" }}>
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "40px 16px 48px",
          display: "grid",
          gap: 30,
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
            <Logomark size={24} />
            <span className="serif" style={{ fontSize: "1.05rem" }}>GrantJudge</span>
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.84rem", lineHeight: 1.6, margin: 0, maxWidth: 260 }}>
            DAO grants scored by independent validators against criteria written
            in plain English. The judgement is consensus. The arithmetic is
            ordinary code.
          </p>
        </div>

        <FooterColumn title="Product">
          <FooterLink href="/rounds">Browse rounds</FooterLink>
          <FooterLink href="/propose">Submit a proposal</FooterLink>
          <FooterLink href="/create">Open a round</FooterLink>
          <FooterLink href="/verdicts">Past verdicts</FooterLink>
        </FooterColumn>

        <FooterColumn title="Learn">
          <FooterLink href="/docs">Documentation</FooterLink>
          <FooterLink href="/docs#scoring">How scoring works</FooterLink>
          <FooterLink href="/docs#settlement">Settlement maths</FooterLink>
          <FooterLink href="/docs#integrate">Integration guide</FooterLink>
        </FooterColumn>

        <FooterColumn title="On chain">
          <span style={{ fontSize: "0.78rem", color: "var(--muted)", display: "block", marginBottom: 4 }}>
            {NETWORK_LABEL} · chain 61997
          </span>
          <span className="mono" style={{ fontSize: "0.7rem", color: "var(--cream-dim)", wordBreak: "break-all", display: "block" }}>
            {CONTRACT_ADDRESS}
          </span>
          {CONSUMER_ADDRESS && (
            <span className="mono" style={{ fontSize: "0.7rem", color: "var(--muted)", wordBreak: "break-all", display: "block", marginTop: 6 }}>
              consumer {CONSUMER_ADDRESS}
            </span>
          )}
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, color: "var(--cream-dim)", textDecoration: "none", fontSize: "0.84rem" }}
          >
            <ExternalLink size={15} /> Source
          </a>
        </FooterColumn>
      </div>

      <div className="gold-rule" style={{ opacity: 0.4 }} />
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "16px",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          justifyContent: "space-between",
          fontSize: "0.76rem",
          color: "var(--muted)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Scale size={13} /> Built on GenLayer. Devnet only — nothing here is a real grant.
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
          <a href={`${REPO}/blob/main/contracts/GrantJudge.py`} target="_blank" rel="noreferrer" style={{ color: "var(--muted)", textDecoration: "none", display: "inline-flex", gap: 5, alignItems: "center" }}>
            <FileCode2 size={13} /> Contract
          </a>
          <Link href="/docs" style={{ color: "var(--muted)", textDecoration: "none", display: "inline-flex", gap: 5, alignItems: "center" }}>
            <BookOpen size={13} /> Docs
          </Link>
        </span>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4
        style={{
          fontSize: "0.72rem",
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          color: "var(--gold)",
          margin: "0 0 12px",
          fontWeight: 600,
          fontFamily: "inherit",
        }}
      >
        {title}
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{children}</div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ color: "var(--cream-dim)", textDecoration: "none", fontSize: "0.84rem" }}>
      {children}
    </Link>
  );
}
