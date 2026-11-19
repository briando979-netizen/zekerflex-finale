import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordServerEvent } from "@/lib/analytics/track";
import { meldLogoAanvraag } from "@/lib/advertentie/melding";
import { isAdvertentieId } from "@/lib/advertentie/regels";
import { leesPrijzen } from "@/lib/advertentie/store";
import { valideerLogoAanvraag } from "@/lib/logo/regels";
import { vraagLogoAan } from "@/lib/logo/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/logo-maker/<id>/aanvraag: "Deze wil ik". De bezoeker kiest één van de logo's op zijn pagina en laat naam en e-mail
// achter; de eigenaar krijgt een melding (overgeslagen bij een testadres). Betalen loopt buiten de pagina om, daarna
// geeft de eigenaar vrij in Beheer. Grens per IP en per e-mailadres (429). Het id komt nergens in een log.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!isAdvertentieId(id)) throw AppError.notFound("Dit logo bestaat niet (meer).");
    const gelezen = await jsonBegrensd(request, 4_000);
    if (!gelezen.ok) throw AppError.validation("Body moet JSON zijn");
    const lokveld = (gelezen.waarde as { website2?: unknown } | null)?.website2;
    if (typeof lokveld === "string" && lokveld.trim()) return NextResponse.json({ ok: true });
    const aanvraag = valideerLogoAanvraag(gelezen.waarde);
    if (!aanvraag.ok) throw AppError.validation(aanvraag.fout, { veld: aanvraag.veld });
    const teVaak = "Je hebt net al een paar aanvragen gestuurd. Probeer het later opnieuw.";
    await enforceRateLimit({ name: "logo-aanvraag-ip", identifier: clientIp(request), limit: 5, windowSeconds: 3600, message: teVaak });
    await enforceRateLimit({ name: "logo-aanvraag-adres", identifier: aanvraag.waarde.email.toLowerCase(), limit: 5, windowSeconds: 86_400, message: teVaak });

    const logo = await vraagLogoAan(id, aanvraag.waarde);
    void recordServerEvent({ path: "/logo-maker", label: "logo-aangevraagd" });
    void leesPrijzen()
      .then((prijzen) => meldLogoAanvraag(logo, prijzen))
      .catch(() => undefined);
    return NextResponse.json({ ok: true, status: logo.status });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("logo maker: aanvraag mislukt", { error: (err as Error).message });
    return res;
  }
}
