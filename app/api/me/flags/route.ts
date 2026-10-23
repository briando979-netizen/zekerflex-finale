import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { flagsFor } from "@/lib/flags";
import { rolesOf } from "@/lib/auth/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/flags — the feature flags resolved for the caller (anonymous allowed),
// so the client can show/hide features that were rolled out gradually.
export async function GET(): Promise<NextResponse> {
  const p = await getPrincipal();
  const ctx = p ? { userId: p.userId, roles: rolesOf({ roles: p.grants }) } : {};
  return NextResponse.json({ flags: await flagsFor(ctx) });
}
