import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

/**
 * A serif for headings, because the subject is adjudication and a treasury
 * page set entirely in a UI sans reads like a settings screen. Fraunces has the
 * weight range to carry a hero without a second display face.
 */
const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "GrantJudge — DAO grants scored by open criteria",
  description:
    "A DAO treasurer posts a grant round with a pool and criteria in plain English. GenLayer validators score each proposal against each criterion independently. Ranking and settlement are deterministic.",
  openGraph: {
    title: "GrantJudge",
    description:
      "Fund what matters. Let consensus decide. DAO grants scored by independent validators, not committees.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${fraunces.variable}`}>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
