import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { buildPensioenAangifte, listPensioenPeriods, previousMonth, savePensioenAangifte } from "@/lib/pensioen/aangifte";
import { deliveryConfigured } from "@/lib/pensioen/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/pensioen — known periods + the live (rebuilt) aangifte for one period.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const period = new URL(request.url).searchParams.get("period") ?? previousMonth();
  const [periods, aangifte] = await Promise.all([listPensioenPeriods(), buildPensioenAangifte(period)]);
  // keep the stored copy in sync with the latest payroll data
  await savePensioenAangifte(aangifte).catch(() => undefined);
  const known = new Set(periods);
  known.add(period);
  return NextResponse.json({ periods: [...known].sort().reverse(), aangifte, deliveryConfigured: deliveryConfigured() });
});

const schema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });

// POST /api/admin/pensioen — (re)generate the aangifte for a period from the payroll runs.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { period } = schema.parse(await request.json().catch(() => ({})));
  const aangifte = await buildPensioenAangifte(period);
  await savePensioenAangifte(aangifte);
  await recordAudit({
    category: "BILLING",
    action: "pensioen.aangifte.generated",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `StiPP-aangifte ${aangifte.label} gegenereerd: ${aangifte.totals.werknemers} werknemers, totale premie €${(aangifte.totals.totaalPremieCents / 100).toFixed(2)}`,
    targetType: "pensioen-aangifte",
    targetId: period,
  }).catch(() => undefined);
  return NextResponse.json({ aangifte });
});
