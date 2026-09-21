import { NextResponse } from "next/server";
import { studioDevnet } from "genlayer-js/chains";

/**
 * Same-origin relay for Studio Devnet's JSON-RPC.
 *
 * WHY THIS EXISTS AND IS NOT A CONVENIENCE. Studio serves CORS headers on a
 * success and DROPS THEM ON ITS 429s. So an exhausted rate limit reaches the
 * browser as "No 'Access-Control-Allow-Origin' header is present" rather than
 * as the rate-limit error it actually is — an error message that sends you
 * looking for a misconfiguration that is not there. Relaying through our own
 * origin means the browser can always read the response, so a failure arrives
 * with its real reason attached.
 *
 * It forwards the body unchanged and adds nothing: no key, no signing, no
 * rewriting. There is nothing secret on this path.
 */
const UPSTREAM = studioDevnet.rpcUrls.default.http[0];

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json(
      { error: "could not read the request body" },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    // Reported as a 502 with the reason, not swallowed into a 200 with an
    // empty body — a relay that hides an upstream failure is worse than no
    // relay at all.
    return NextResponse.json(
      {
        error: "the Studio Devnet RPC could not be reached",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
