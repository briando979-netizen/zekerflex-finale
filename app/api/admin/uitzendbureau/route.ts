import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getUitzendbureauOverview } from "@/lib/uitzendbureau/admin";
import { clientEconomics, setMarkup, workerPool } from "@/lib/uitzendbureau/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/uitzendbureau — leads, clients, pool + ABU signals, numbers per client.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [overview, pool, economics] = await Promise.all([getUitzendbureauOverview(), workerPool(), clientEconomics()]);
  return NextResponse.json({ ...overview, pool: pool.workers, signals: pool.signals, economics, defaultMarkup: env.UITZEND_MARKUP_RATE });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("markup"), tenantId: z.string().min(1), rate: z.number().min(0.1).max(1.5).nullable() }),
  z.object({ action: z.literal("lead-status"), leadId: z.string().min(1), status: z.enum(["REPLIED", "WON", "LOST", "DISQUALIFIED"]), note: z.string().max(500).optional() }),
]);

// POST /api/admin/uitzendbureau — set a client's opslag, or move an aanvraag through the pipeline.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = schema.parse(await request.json().catch(() => ({})));
  if (input.action === "markup") {
    const rate = await setMarkup(input.tenantId, input.rate);
    await recordAudit({ category: "ADMIN", action: "uitzend.markup", actorUserId: principal.userId, summary: `Uitzendopslag ${input.tenantId}: ${Math.round(rate * 100)}%${input.rate === null ? " (standaard)" : ""}`, targetType: "tenant", targetId: input.tenantId });
    return NextResponse.json({ rate });
  }
  const lead = await prisma.salesLead.update({
    where: { id: input.leadId },
    data: { status: input.status, ...(input.note ? { notes: input.note } : {}) },
    select: { id: true, status: true, companyName: true },
  });
  await recordAudit({ category: "SALES", action: "uitzend.lead_status", actorUserId: principal.userId, summary: `Uitzendaanvraag ${lead.companyName} → ${lead.status}`, targetType: "salesLead", targetId: lead.id });
  return NextResponse.json({ lead });
});
