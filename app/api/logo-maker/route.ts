import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordServerEvent } from "@/lib/analytics/track";
import { valideerLogoInvoer } from "@/lib/logo/regels";
import { maakLogo } from "@/lib/logo/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/logo-maker: het formulier op /logo-maker. Geeft het id terug van de pagina met zes logo's (openbaar, zonder
// account of e-mailadres). Begrensde body → invoer schoonmaken (lib/logo/regels.ts) → hooguit 8 per dag per IP (429,
// nooit 403; bij een storing in Redis gaat het verzoek door) → bewaren. Het id komt nergens in een log.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const gelezen = await jsonBegrensd(request, 8_000);
    if (!gelezen.ok) throw AppError.validation("Body moet JSON zijn");
    const lokveld = (gelezen.waarde as { website2?: unknown } | null)?.website2;
    if (typeof lokveld === "string" && lokveld.trim()) throw AppError.validation("Controleer je gegevens.");
    const invoer = valideerLogoInvoer(gelezen.waarde);
    if (!invoer.ok) throw AppError.validation(invoer.fout, { veld: invoer.veld });
    await enforceRateLimit({ name: "logo-maken", identifier: clientIp(request), limit: 8, windowSeconds: 86_400, message: "Je hebt vandaag al een paar logo's gemaakt. Probeer het morgen opnieuw." });
    const logo = await maakLogo(invoer.waarde);
    void recordServerEvent({ path: "/logo-maker", label: "logo-gemaakt", meta: { sfeer: invoer.waarde.sfeer } });
    return NextResponse.json({ ok: true, id: logo.id });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("logo maker: maken mislukt", { error: (err as Error).message });
    return res;
  }
}
