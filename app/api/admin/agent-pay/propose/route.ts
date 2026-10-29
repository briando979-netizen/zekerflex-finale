import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { proposeIntent } from "@/lib/agent-pay/intents";
import { proposeRestocks } from "@/lib/agent-pay/propose-ai";
import { saveIntent } from "@/lib/agent-pay/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const manualSchema = z.object({
  ai: z.literal(false).optional(),
  amountCents: z.number().int().positive().max(100_000_000),
  recipient: z.string().trim().min(1).max(200),
  external: z.boolean(),
  reason: z.string().trim().min(2).max(500),
});

// POST /api/admin/agent-pay/propose — maak een VOORSTEL (PENDING). Met { ai: true }
// laat je de regelgebaseerde voorsteller bijbestellingen voorstellen uit echte
// (lage voorraad-)data. Er verplaatst niets — dit wacht op jouw goedkeuring.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.ai === true) {
    const proposals = await proposeRestocks();
    for (const p of proposals) await saveIntent(p);
    await recordAudit({
      category: "ADMIN",
      action: "agentpay.proposed.ai",
      severity: "info",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `AI stelde ${proposals.length} betaling(en) voor (lage voorraad) — wachten op goedkeuring`,
    });
    return NextResponse.json({ created: proposals.length });
  }

  const parsed = manualSchema.safeParse(body);
  if (!parsed.success) throw AppError.validation("Controleer de gegevens van het voorstel");
  const intent = proposeIntent({
    amountCents: parsed.data.amountCents,
    recipient: parsed.data.recipient,
    external: parsed.data.external,
    reason: parsed.data.reason,
    proposedBy: principal.userId,
  });
  await saveIntent(intent);
  return NextResponse.json({ intent });
});
