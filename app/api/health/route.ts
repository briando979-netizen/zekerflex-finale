import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ultra-light liveness probe for the container HEALTHCHECK and Cloudflare
// Tunnel. Does not touch Postgres, Redis or the LLM — use /api/status for
// component health.
export function GET(): NextResponse {
  return NextResponse.json({ ok: true, service: "zekerflex", ts: Date.now() });
}

export function HEAD(): Response {
  return new Response(null, { status: 200 });
}
