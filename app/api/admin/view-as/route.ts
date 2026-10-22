import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { INSPECT_SESSION_SECONDS } from "@/lib/auth/inspect";
import { getViewAsAccounts, setViewAsAccount, VIEW_AS_COOKIE, VIEW_AS_HOME, viewAsSession } from "@/lib/auth/view-as";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — which example accounts are set up.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ accounts: await getViewAsAccounts() }));

const schema = z.union([
  z.object({ action: z.literal("start"), role: z.enum(["freelancer", "employer"]) }),
  z.object({ action: z.literal("choose"), role: z.enum(["freelancer", "employer"]), userId: z.string().min(3).max(64) }),
  z.object({ action: z.literal("stop") }),
]);

// POST — start viewing as a role, choose the example account for a role, or stop.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = schema.parse(await request.json().catch(() => ({})));

  if (body.action === "stop") {
    const res = NextResponse.json({ ok: true, to: "/admin" });
    res.cookies.delete(VIEW_AS_COOKIE);
    return res;
  }

  if (body.action === "choose") {
    let acc;
    try {
      acc = await setViewAsAccount(body.role, body.userId);
    } catch (err) {
      throw AppError.validation((err as Error).message);
    }
    await recordAudit({
      category: "ADMIN",
      action: "view_as.account_chosen",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} koos ${acc.email} als voorbeeld-${body.role === "freelancer" ? "werknemer" : "opdrachtgever"}`,
      targetType: "user",
      targetId: acc.userId,
    });
    return NextResponse.json({ ok: true, account: acc });
  }

  const started = await viewAsSession(body.role);
  if (!started) {
    throw AppError.validation(
      body.role === "freelancer"
        ? "Er is nog geen voorbeeld-werknemer. Kies er een bij Admin → Gebruikers → <werknemer> → 'Gebruik als voorbeeld'."
        : "Er is nog geen voorbeeld-opdrachtgever. Kies er een bij Admin → Gebruikers → <opdrachtgever> → 'Gebruik als voorbeeld'.",
    );
  }
  await recordAudit({
    category: "SECURITY",
    action: "view_as.started",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} bekijkt het platform als ${started.account.email} (alleen-lezen)`,
    targetType: "user",
    targetId: started.account.userId,
  });
  const res = NextResponse.json({ ok: true, to: VIEW_AS_HOME[body.role], account: started.account });
  res.cookies.set(VIEW_AS_COOKIE, started.session, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: INSPECT_SESSION_SECONDS,
  });
  return res;
});
