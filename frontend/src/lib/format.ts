/**
 * Formatting helpers.
 *
 * EVERY WEI VALUE IS A STRING AND STAYS ONE. A `u256` does not survive JSON, so
 * the contract returns decimal strings, and parsing one into a JS number loses
 * precision above 2^53 — which is 0.009 GEN. Nothing here calls `Number()` on a
 * wei value; the arithmetic is BigInt and the output is a string.
 */

const WEI = 10n ** 18n;

export function toBigInt(value: string | number | bigint | undefined | null): bigint {
  if (value === undefined || value === null) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  const text = String(value).trim();
  if (!/^-?\d+$/.test(text)) return 0n;
  return BigInt(text);
}

/** Wei as GEN, with `decimals` places and no float anywhere in the path. */
export function formatGen(
  wei: string | number | bigint | undefined | null,
  decimals = 2,
): string {
  let n = toBigInt(wei);
  const sign = n < 0n ? "-" : "";
  if (n < 0n) n = -n;
  const whole = n / WEI;
  const frac = n % WEI;
  if (decimals <= 0) return `${sign}${whole}`;
  const padded = frac.toString().padStart(18, "0").slice(0, decimals);
  return `${sign}${whole.toLocaleString("en-US")}.${padded}`;
}

/** GEN as wei. Accepts "1.5", "0.1", "12". Returns 0n for anything else. */
export function parseGen(text: string): bigint {
  const t = String(text ?? "").trim();
  if (!/^\d*(\.\d*)?$/.test(t) || t === "" || t === ".") return 0n;
  const [whole, frac = ""] = t.split(".");
  const padded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * WEI + BigInt(padded || "0");
}

/** A 0..700 score as "4.25". The contract's own `_score_text`, in TypeScript. */
export function scoreText(score: number | undefined | null): string {
  const n = Math.max(0, Math.min(700, Math.trunc(Number(score ?? 0))));
  return `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
}

/** A score as a percentage of the 7.00 ceiling, for a bar's width. */
export function scorePct(score: number | undefined | null): number {
  const n = Math.max(0, Math.min(700, Math.trunc(Number(score ?? 0))));
  return (n / 700) * 100;
}

export function shortAddress(address: string | undefined | null, size = 4): string {
  const a = String(address ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return a || "—";
  return `${a.slice(0, 2 + size)}…${a.slice(-size)}`;
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/** A unix second count as a readable UTC instant. */
export function formatTime(ts: number | undefined | null): string {
  const n = Number(ts ?? 0);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

export function formatDate(ts: number | undefined | null): string {
  const n = Number(ts ?? 0);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2d 4h", "3h 12m", "48s". Empty string once it has run out. */
export function formatDuration(seconds: number | undefined | null): string {
  let n = Math.max(0, Math.trunc(Number(seconds ?? 0)));
  if (n <= 0) return "";
  const d = Math.floor(n / 86400);
  n -= d * 86400;
  const h = Math.floor(n / 3600);
  n -= h * 3600;
  const m = Math.floor(n / 60);
  const s = n - m * 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** A window in seconds as a phrase: "24 hours", "5 minutes", "48 hours". */
export function describeWindow(seconds: number | undefined | null): string {
  const n = Math.max(0, Math.trunc(Number(seconds ?? 0)));
  if (n === 0) return "no window";
  if (n % 86400 === 0) {
    const d = n / 86400;
    return `${d} ${d === 1 ? "day" : "days"}`;
  }
  if (n % 3600 === 0) {
    const h = n / 3600;
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  if (n % 60 === 0) {
    const m = n / 60;
    return `${m} ${m === 1 ? "minute" : "minutes"}`;
  }
  return `${n} seconds`;
}

export function truncate(text: string | undefined | null, n: number): string {
  const t = String(text ?? "");
  return t.length <= n ? t : `${t.slice(0, n).trimEnd()}…`;
}

export function pluralize(n: number, one: string, many?: string): string {
  return n === 1 ? one : many ?? `${one}s`;
}
