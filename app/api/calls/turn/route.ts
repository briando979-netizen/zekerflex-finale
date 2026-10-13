import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { mintTurnCredential } from "@/lib/calls/turn-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/calls/turn — short-lived TURN relay credentials for the current
// call. Returns { turn: null } when no self-hosted TURN server is configured
// (CallOverlay then falls back to STUN-only).
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ turn: mintTurnCredential(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
