import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { canPostShift } from "@/lib/klusconcept/concept";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/werkgever — may the visitor's own session put out a dienst?
// For /klus-plaatsen: a signed-in werkgever skips sign-up. Always 200 (no 401
// in the console of every anonymous visitor, unlike /api/me), and only this
// one yes/no about the caller's own session.
export async function GET(): Promise<NextResponse> {
  const p = await getPrincipal().catch(() => null);
  return NextResponse.json({ werkgever: Boolean(p && canPostShift(p.grants.map((g) => g.role))) }, { headers: { "Cache-Control": "no-store" } });
}
