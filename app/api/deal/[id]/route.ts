import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { recordServerEvent } from "@/lib/analytics/track";
import { dealAkkoord, dealBekeken, dealTerugbellen, isDealId } from "@/lib/scans/deal";
import { BEL_MOMENTEN, type BelMoment } from "@/lib/scans/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("bekeken") }),
  z.object({
    actie: z.literal("akkoord"),
    naam: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200),
    telefoon: z.string().trim().max(40).optional(),
    keuze: z.array(z.string().max(40)).max(20),
    consent: z.literal(true),
  }),
  z.object({
    actie: z.literal("terugbellen"),
    naam: z.string().trim().min(1).max(120),
    telefoon: z.string().trim().max(40).regex(/^\+?[\d\s()-]{8,}$/),
    moment: z.enum(Object.keys(BEL_MOMENTEN) as [BelMoment, ...BelMoment[]]),
    vraag: z.string().trim().max(500).optional(),
    consent: z.literal(true),
  }),
]);

// POST /api/deal/<id> — het voorstel op maat na een gratis scan (lib/scans/deal.ts):
// "bekeken" (vanuit de browser, zodat linkvoorbeelden niet tellen), "akkoord" en
// "terugbellen" (eerst overleggen: naam + telefoon, nog geen ja).
// Het niet te raden id in de link is de sleutel; per bezoeker begrensd.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!isDealId(id)) throw AppError.notFound("Dit voorstel bestaat niet (meer).");
    await enforceRateLimit({ name: "deal", identifier: clientIp(request), limit: 20, windowSeconds: 600, message: "Even rustig aan. Probeer het zo opnieuw." });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Controleer je gegevens (een geldig telefoonnummer) en zet het vinkje.");
    const d = parsed.data;
    if (d.actie === "bekeken") {
      await dealBekeken(id);
      return NextResponse.json({ ok: true });
    }
    if (d.actie === "terugbellen") {
      await dealTerugbellen(id, { naam: d.naam, telefoon: d.telefoon, moment: d.moment, ...(d.vraag ? { vraag: d.vraag } : {}) });
      void recordServerEvent({ path: "/deal", label: "voorstel-op-maat-terugbellen", meta: { moment: d.moment } });
      return NextResponse.json({ ok: true });
    }
    const deal = await dealAkkoord(id, { naam: d.naam, email: d.email, ...(d.telefoon ? { telefoon: d.telefoon } : {}) }, d.keuze);
    void recordServerEvent({ path: "/deal", label: "voorstel-op-maat-akkoord", meta: { opties: deal.keuze.length } });
    return NextResponse.json({ ok: true, status: deal.status, keuze: deal.keuze });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("voorstel op maat mislukt", { error: (err as Error).message });
    return res;
  }
}
