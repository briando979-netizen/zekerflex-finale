import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordServerEvent } from "@/lib/analytics/track";
import { meldAanvraag } from "@/lib/advertentie/melding";
import { isAdvertentieId, valideerAanvraag } from "@/lib/advertentie/regels";
import { leesPrijzen, vraagAan } from "@/lib/advertentie/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/advertentie/<id>/aanvraag: "Deze wil ik". De bezoeker kiest één ontwerp of alle drie en laat naam en e-mail
// achter; de status wordt "aangevraagd" en de eigenaar krijgt een melding (overgeslagen bij een testadres). Betalen
// loopt buiten de pagina om: de eigenaar stuurt een betaalverzoek en geeft daarna vrij in Beheer. Grens per IP en per
// e-mailadres (429). Het id is de sleutel en komt nergens in een log.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!isAdvertentieId(id)) throw AppError.notFound("Deze advertentie bestaat niet (meer).");
    const gelezen = await jsonBegrensd(request, 4_000);
    if (!gelezen.ok) throw AppError.validation("Body moet JSON zijn");
    const lokveld = (gelezen.waarde as { website2?: unknown } | null)?.website2;
    // een robot vulde het lokveld: doen alsof het gelukt is, niets bewaren en niets melden
    if (typeof lokveld === "string" && lokveld.trim()) return NextResponse.json({ ok: true });
    const aanvraag = valideerAanvraag(gelezen.waarde);
    if (!aanvraag.ok) throw AppError.validation(aanvraag.fout, { veld: aanvraag.veld });
    const teVaak = "Je hebt net al een paar aanvragen gestuurd. Probeer het later opnieuw.";
    await enforceRateLimit({ name: "advertentie-aanvraag-ip", identifier: clientIp(request), limit: 5, windowSeconds: 3600, message: teVaak });
    await enforceRateLimit({ name: "advertentie-aanvraag-adres", identifier: aanvraag.waarde.email.toLowerCase(), limit: 5, windowSeconds: 86_400, message: teVaak });

    const ad = await vraagAan(id, aanvraag.waarde);
    void recordServerEvent({ path: "/advertentie-op-maat", label: "advertentie-aangevraagd", meta: { pakket: aanvraag.waarde.pakket } });
    // de melding mag mislukken: de aanvraag staat al in Beheer
    void leesPrijzen()
      .then((prijzen) => meldAanvraag(ad, prijzen))
      .catch(() => undefined);
    return NextResponse.json({ ok: true, status: ad.status });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("advertentie op maat: aanvraag mislukt", { error: (err as Error).message });
    return res;
  }
}
