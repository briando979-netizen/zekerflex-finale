import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { companionStatus, createCompanionToken, revokeCompanionToken } from "@/lib/companion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET status · POST new personal token (shown once) · DELETE revoke — for the laptop Jarvis.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (_req, { principal }) => NextResponse.json(await companionStatus(principal.userId)));
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (_req, { principal }) =>
  NextResponse.json({ token: await createCompanionToken(principal.userId, principal.email) }),
);
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_req, { principal }) => {
  await revokeCompanionToken(principal.userId);
  return NextResponse.json({ ok: true });
});
