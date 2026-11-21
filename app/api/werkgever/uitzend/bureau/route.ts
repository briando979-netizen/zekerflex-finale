import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { bureauContext, leesBureauStand, zetBureauGegevens } from "@/lib/uitzend/bureau";
import type { BureauGegevens } from "@/lib/uitzend/bureau-kern";
import { PARTNER_VOORWAARDEN_VERSIE } from "@/lib/uitzend/voorwaarden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const datum = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const schema = z.object({
  uitlener: z.boolean(),
  keurmerk: z.enum(["sna", "wtta", "geen"]),
  keurmerkTot: datum,
  cao: z.enum(["abu", "nbbu", "anders", ""]),
  verzekeringTot: datum,
  loonheffingennummer: z.string().trim().max(20),
  /** het bureau accepteert nu de huidige versie van de partnervoorwaarden */
  akkoord: z.boolean(),
});

// POST /api/werkgever/uitzend/bureau — de bureaugegevens van een uitzendpartner (artikel 3 van de partnervoorwaarden) en het
// akkoord op de voorwaarden. Alleen de hoofdbeheerder van het bureau. Het akkoord legt vast welke versie, wanneer en door wie,
// met een regel in de audit. Geeft de bewaarde stand terug (die neemt het scherm over).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await bureauContext();
    requireRole(ctx.principal, "HQ_ADMIN", "PLATFORM_ADMIN");
    if (!ctx.tenantId || !ctx.partnerSinds) throw AppError.precondition("Dit kan alleen bij een uitzendpartner.");
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());
    const { akkoord, ...rest } = parsed.data;
    const oud = (await leesBureauStand(ctx.tenantId)).gegevens;
    const nu = new Date().toISOString();
    const nieuwAkkoord = akkoord && oud.akkoord?.versie !== PARTNER_VOORWAARDEN_VERSIE;
    const gegevens: BureauGegevens = {
      ...rest,
      keurmerkTot: rest.keurmerk === "geen" ? null : rest.keurmerkTot,
      akkoord: nieuwAkkoord ? { versie: PARTNER_VOORWAARDEN_VERSIE, op: nu, door: ctx.principal.userId } : oud.akkoord,
      bijgewerkt: nu,
    };
    const stand = await zetBureauGegevens(ctx.tenantId, gegevens);
    await recordAudit({
      category: "COMPANY",
      action: nieuwAkkoord ? "uitzendpartner.voorwaarden.akkoord" : "uitzendpartner.gegevens",
      actorUserId: ctx.principal.userId,
      actorLabel: "user",
      summary: nieuwAkkoord ? `Partnervoorwaarden versie ${PARTNER_VOORWAARDEN_VERSIE} geaccepteerd` : "Bureaugegevens van de uitzendpartner bijgewerkt",
      targetType: "tenant",
      targetId: ctx.tenantId,
      metadata: { keurmerk: gegevens.keurmerk, keurmerkTot: gegevens.keurmerkTot, verzekeringTot: gegevens.verzekeringTot, cao: gegevens.cao },
    });
    return NextResponse.json({ gegevens: stand.gegevens });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
