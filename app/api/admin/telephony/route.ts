import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { placeOutboundCall, callerConfigured } from "@/lib/telephony/provider";
import { listCalls } from "@/lib/telephony/store";
import { recordConsent, recordOptOut } from "@/lib/telephony/consent";
import { CALL_SCRIPTS } from "@/lib/telephony/scripts";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/telephony — config + recente oproepen (voor de admin-UI).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const calls = await listCalls(60);
  return NextResponse.json({
    configured: callerConfigured(),
    allowB2bCold: env.TELEPHONY_ALLOW_B2B_COLD,
    scripts: Object.entries(CALL_SCRIPTS).map(([id, s]) => ({ id, label: s.label })),
    calls,
  });
});

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("call"),
    to: z.string().trim().min(6).max(40),
    script: z.string().trim().max(40).default("intro-werkgever"),
    leadId: z.string().trim().max(60).optional(),
    b2b: z.boolean().optional(),
  }),
  z.object({ action: z.literal("consent"), number: z.string().trim().min(6).max(40) }),
  z.object({ action: z.literal("optout"), number: z.string().trim().min(6).max(40), reason: z.string().trim().max(200).optional() }),
]);

// POST /api/admin/telephony — { action: "call" | "consent" | "optout" }.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Ongeldig verzoek", parsed.error.flatten());
  const body = parsed.data;

  if (body.action === "consent") {
    await recordConsent(body.number, `admin:${principal.email}`);
    return NextResponse.json({ ok: true, message: "Toestemming vastgelegd." });
  }
  if (body.action === "optout") {
    await recordOptOut(body.number, body.reason ?? "verzoek niet te bellen");
    return NextResponse.json({ ok: true, message: "Op de niet-bellen-lijst gezet." });
  }

  // action === "call"
  const result = await placeOutboundCall({
    to: body.to,
    script: body.script,
    humanInitiated: true, // een beheerder klikte zelf op "bel nu"
    ...(body.leadId ? { leadId: body.leadId } : {}),
    ...(body.b2b !== undefined ? { b2b: body.b2b } : {}),
  });
  await recordAudit({
    category: "ADMIN",
    action: "telephony.call.placed",
    actorUserId: principal.userId,
    severity: result.ok ? "info" : "warning",
    summary: `AI-beller → ${body.to}: ${result.ok ? (result.mock ? "mock" : "geplaatst") : `geweigerd (${result.reason})`}`,
    ...(result.callId ? { targetType: "call", targetId: result.callId } : {}),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
});
