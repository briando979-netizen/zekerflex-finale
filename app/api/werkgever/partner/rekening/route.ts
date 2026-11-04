import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { isValidIban } from "@/lib/billing/sepa";
import { siteTenantOf } from "@/lib/sites/access";
import { bewaarPartnerRekening } from "@/lib/shop/partner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  iban: z.string().trim().min(15).max(40),
  tenaamstelling: z.string().trim().min(2).max(70),
});

// PUT /api/werkgever/partner/rekening { iban, tenaamstelling } — Studio → Verdienen:
// het rekeningnummer waarop ZekerFlex de partnervergoeding uitbetaalt.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await siteTenantOf(p);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Vul je rekeningnummer en de naam op de rekening in.");
    if (!isValidIban(parsed.data.iban)) throw AppError.validation("Dit rekeningnummer klopt niet. Controleer de IBAN.");
    const rekening = await bewaarPartnerRekening(tenantId, parsed.data.iban, parsed.data.tenaamstelling);
    await recordAudit({
      category: "ADMIN",
      action: "shop.partner.rekening",
      actorUserId: p.userId,
      summary: `Rekening voor partnervergoeding ingesteld (eindigt op ${rekening.iban.slice(-4)})`,
      targetType: "tenant",
      targetId: tenantId,
    });
    return NextResponse.json({ rekening });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
