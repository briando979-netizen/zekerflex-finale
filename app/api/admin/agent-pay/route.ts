import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { getCaps, listIntents, setCaps, spentTodayCents } from "@/lib/agent-pay/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/agent-pay — wachtrij + caps + wat vandaag al is uitgegeven.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [intents, caps] = await Promise.all([listIntents(), getCaps()]);
  return NextResponse.json({ intents, caps, spentTodayCents: spentTodayCents(intents) });
});

const capsSchema = z.object({
  maxPerIntentCents: z.number().int().min(0).max(100_000_000),
  maxPerDayCents: z.number().int().min(0).max(100_000_000),
  allowExternal: z.boolean(),
  killSwitch: z.boolean(),
});

// PUT /api/admin/agent-pay — caps / noodknop aanpassen.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = capsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Controleer de limieten");
  await setCaps(parsed.data);
  await recordAudit({
    category: "ADMIN",
    action: "agentpay.caps.updated",
    severity: "warning",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} wijzigde de betaal-limieten (extern: ${parsed.data.allowExternal ? "aan" : "uit"}, noodknop: ${parsed.data.killSwitch ? "AAN" : "uit"})`,
  });
  return NextResponse.json({ ok: true });
});
