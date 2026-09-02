import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight identity for client components (command bar, toasts). Read-only.
export async function GET(): Promise<NextResponse> {
  const p = await getPrincipal();
  if (!p) return NextResponse.json({ authenticated: false }, { status: 200 });
  return NextResponse.json({
    authenticated: true,
    userId: p.userId,
    fullName: p.fullName,
    email: p.email,
    roles: [...new Set(p.grants.map((g) => g.role))],
    emailVerified: Boolean(p.emailVerifiedAt),
  });
}
