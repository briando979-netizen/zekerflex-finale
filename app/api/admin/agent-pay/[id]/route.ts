import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { approveIntent, executeIntent, rejectIntent } from "@/lib/agent-pay/intents";
import { getCaps, getIntent, listIntents, saveIntent, spentTodayCents } from "@/lib/agent-pay/store";
import { runRail } from "@/lib/agent-pay/rail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["approve", "reject"]), note: z.string().trim().max(500).optional() });
const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

// POST /api/admin/agent-pay/<id> — { action: "approve" | "reject" }.
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Ongeldige actie");
  const intent = await getIntent(params.id);
  if (!intent) throw AppError.notFound("Betaling niet gevonden");

  if (parsed.data.action === "reject") {
    let rejected;
    try {
      rejected = rejectIntent(intent, principal.userId, parsed.data.note);
    } catch (e) {
      throw AppError.validation(e instanceof Error ? e.message : "Afwijzen mislukt");
    }
    await saveIntent(rejected);
    await recordAudit({
      category: "ADMIN",
      action: "agentpay.rejected",
      severity: "info",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} wees een betaling af: ${euro(intent.amountCents)} aan ${intent.recipient}`,
    });
    return NextResponse.json({ intent: rejected });
  }

  // approve — alleen binnen de caps, geen noodknop, extern alleen als toegestaan.
  const caps = await getCaps();
  const spent = spentTodayCents(await listIntents());
  let approved;
  try {
    approved = approveIntent(intent, principal.userId, caps, spent);
  } catch (e) {
    throw AppError.validation(e instanceof Error ? e.message : "Goedkeuren geweigerd");
  }

  // De rail staat standaard uit → de betaling blijft GOEDGEKEURD (handmatig uit
  // te voeren). Alleen een aangesloten rail die écht afrekent zet 'm op EXECUTED.
  let finalIntent = approved;
  const rail = await runRail(approved);
  if (rail.executed) {
    try {
      finalIntent = executeIntent(approved, caps);
    } catch {
      finalIntent = approved;
    }
  }
  await saveIntent(finalIntent);

  await recordAudit({
    category: "ADMIN",
    action: "agentpay.approved",
    severity: "warning",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} keurde een betaling goed: ${euro(approved.amountCents)} aan ${approved.recipient} (${finalIntent.status})`,
    metadata: { intentId: approved.id, external: approved.external, status: finalIntent.status },
  });

  return NextResponse.json({ intent: finalIntent, rail: rail.detail });
});
