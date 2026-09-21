"use client";

import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { Footer } from "./Footer";
import { PageShell } from "./Reveal";

/**
 * Every app page's frame: the header with the wallet button and the network
 * badge, a bounded content column with a 16px gutter at phone width, and the
 * footer. The landing page deliberately does NOT use this — it has no wallet.
 */
export function AppShell({
  children,
  title,
  blurb,
  eyebrow,
  actions,
  wide = false,
}: {
  children: ReactNode;
  title?: string;
  blurb?: string;
  eyebrow?: string;
  actions?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <main style={{ flex: 1, padding: "34px 16px 0" }}>
        <div style={{ maxWidth: wide ? 1180 : 1000, margin: "0 auto" }}>
          <PageShell>
            {(title || actions) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  marginBottom: 28,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  {eyebrow && (
                    <div
                      style={{
                        fontSize: "0.72rem",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--gold)",
                        marginBottom: 10,
                      }}
                    >
                      {eyebrow}
                    </div>
                  )}
                  {title && (
                    <h1 style={{ margin: 0, fontSize: "clamp(1.7rem, 4.2vw, 2.3rem)", lineHeight: 1.15 }}>
                      {title}
                    </h1>
                  )}
                  {blurb && (
                    <p
                      style={{
                        margin: "12px 0 0",
                        color: "var(--cream-dim)",
                        fontSize: "0.94rem",
                        lineHeight: 1.65,
                        maxWidth: 640,
                      }}
                    >
                      {blurb}
                    </p>
                  )}
                </div>
                {actions && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{actions}</div>}
              </div>
            )}
            {children}
          </PageShell>
        </div>
      </main>
      <Footer />
    </div>
  );
}
