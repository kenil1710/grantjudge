import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "GrantJudge — DAO grants scored by independent validators";

/**
 * The card that appears when the app is linked anywhere.
 *
 * Rendered at request time by Next's `ImageResponse` rather than checked in as
 * a PNG, so it cannot go stale against the palette in `globals.css` — and so
 * there is no binary in the repository that somebody has to regenerate by hand
 * after a copy change.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #0A1F1A 0%, #122B24 55%, #0A1F1A 100%)",
          color: "#F5EFE0",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              border: "2px solid #D4A847",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFD700",
              fontSize: 26,
            }}
          >
            ⚖
          </div>
          <div style={{ fontSize: 30, letterSpacing: -0.5 }}>GrantJudge</div>
          <div
            style={{
              marginLeft: "auto",
              fontSize: 19,
              color: "#D4A847",
              border: "1px solid rgba(212,168,71,0.4)",
              borderRadius: 999,
              padding: "6px 16px",
            }}
          >
            GenLayer · Studio Devnet
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 76, lineHeight: 1.04, letterSpacing: -2 }}>
            Fund what matters.
          </div>
          <div style={{ fontSize: 76, lineHeight: 1.04, letterSpacing: -2, color: "#D4A847" }}>
            Let consensus decide.
          </div>
          <div style={{ fontSize: 27, color: "#B9B3A5", maxWidth: 880, lineHeight: 1.45 }}>
            DAO grants scored by independent validators against criteria written
            in plain English. The judgement is consensus. Every wei is arithmetic.
          </div>
        </div>

        <div style={{ display: "flex", gap: 40, fontSize: 21, color: "#7D8F88" }}>
          <div style={{ display: "flex" }}>0–7 buckets, weighted</div>
          <div style={{ display: "flex" }}>brackets bound the score</div>
          <div style={{ display: "flex" }}>awards + remainder = pool</div>
        </div>
      </div>
    ),
    size,
  );
}
