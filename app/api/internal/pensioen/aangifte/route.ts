import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { buildPensioenAangifte, previousMonth, savePensioenAangifte } from "@/lib/pensioen/aangifte";
import { deliverPensioenAangifte, deliveryConfigured } from "@/lib/pensioen/delivery";
import { alertOwner } from "@/lib/ops/alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Monthly StiPP pension declaration (vercel.json: 1st of the month). Builds the
// previous month's aangifte from the finalised payroll runs and, if a delivery
// channel is configured, transmits it; otherwise leaves it ready as an export
// and nudges the owner.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    const period = previousMonth();
    const aangifte = await buildPensioenAangifte(period);
    await savePensioenAangifte(aangifte);
    let delivered = false;
    let detail = "opgeslagen als concept";
    if (aangifte.lines.length > 0) {
      if (deliveryConfigured()) {
        const res = await deliverPensioenAangifte(period);
        delivered = res.ok;
        detail = res.detail;
      } else {
        detail = "geen leverkanaal ingesteld — klaar als export";
        await alertOwner({
          key: `pensioen-aangifte-ready:${period}`,
          title: `StiPP-aangifte ${aangifte.label} klaar`,
          detail: `De pensioenaangifte over ${aangifte.label} staat klaar (${aangifte.totals.werknemers} werknemers${aangifte.totals.incompleet ? `, ${aangifte.totals.incompleet} incompleet` : ""}). Download of lever hem via Admin → Pensioen.`,
          severity: "warning",
          url: "/admin/pensioen",
        }).catch(() => undefined);
      }
    }
    recordCronRun("pensioen-aangifte", true);
    return NextResponse.json({ ok: true, period, werknemers: aangifte.totals.werknemers, incompleet: aangifte.totals.incompleet, delivered, detail });
  } catch (err) {
    recordCronRun("pensioen-aangifte", false);
    logger.error("pensioen aangifte tick failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Aangifte mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
