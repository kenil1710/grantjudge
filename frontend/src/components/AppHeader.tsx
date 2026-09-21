"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  FilePlus2,
  Gavel,
  LayoutGrid,
  Menu,
  PlusCircle,
  Radio,
  User,
  X,
} from "lucide-react";
import { Logomark } from "./Logomark";
import { ConnectWallet } from "./ConnectWallet";
import { NETWORK_LABEL } from "@/lib/genlayer";

const NAV = [
  { href: "/rounds", label: "Rounds", Icon: LayoutGrid },
  { href: "/propose", label: "Propose", Icon: FilePlus2 },
  { href: "/create", label: "Create", Icon: PlusCircle },
  { href: "/my-proposals", label: "Mine", Icon: User },
  { href: "/verdicts", label: "Verdicts", Icon: Gavel },
  { href: "/docs", label: "Docs", Icon: BookOpen },
];

export function AppHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        borderBottom: "1px solid var(--line-soft)",
        background: "rgba(10,31,26,0.86)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "0 16px",
          height: 62,
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: "var(--cream)" }}
        >
          <Logomark size={26} />
          <span className="serif" style={{ fontSize: "1.12rem", letterSpacing: "-0.01em" }}>
            GrantJudge
          </span>
        </Link>

        <nav style={{ display: "none", gap: 2, flex: 1 }} className="nav-desktop">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "7px 11px",
                  borderRadius: 9,
                  fontSize: "0.87rem",
                  textDecoration: "none",
                  color: active ? "var(--gold)" : "var(--cream-dim)",
                  background: active ? "rgba(212,168,71,0.10)" : "transparent",
                  transition: "color 140ms ease, background 140ms ease",
                }}
              >
                <Icon size={16} strokeWidth={1.9} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span
            title="Every read and write on this page goes to GenLayer Studio Devnet, chain 61997."
            style={{
              display: "none",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: "0.72rem",
              color: "var(--emerald)",
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.25)",
              whiteSpace: "nowrap",
            }}
            className="network-badge"
          >
            <Radio size={12} className="pulse" />
            {NETWORK_LABEL}
          </span>
          <div className="wallet-desktop" style={{ display: "none" }}>
            <ConnectWallet compact />
          </div>
          <button
            className="btn btn-ghost nav-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            style={{ padding: "8px 10px" }}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div
          style={{
            borderTop: "1px solid var(--line-soft)",
            padding: "12px 16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
          className="nav-mobile"
        >
          {NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                textDecoration: "none",
                color: pathname.startsWith(href) ? "var(--gold)" : "var(--cream-dim)",
                background: pathname.startsWith(href) ? "rgba(212,168,71,0.08)" : "transparent",
              }}
            >
              <Icon size={17} strokeWidth={1.9} />
              {label}
            </Link>
          ))}
          <div style={{ marginTop: 10 }}>
            <ConnectWallet />
          </div>
        </div>
      )}

      <style>{`
        @media (min-width: 900px) {
          .nav-desktop { display: flex !important; }
          .nav-toggle { display: none !important; }
          .wallet-desktop { display: block !important; }
          .network-badge { display: inline-flex !important; }
        }
        @media (min-width: 560px) and (max-width: 899px) {
          .network-badge { display: inline-flex !important; }
        }
      `}</style>
    </header>
  );
}
