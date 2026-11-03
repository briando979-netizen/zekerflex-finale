import { after, NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { zaakVanSlug } from "@/lib/horeca/store";
import { leesMet } from "@/lib/horeca/link";
import { annuleerDoorGast } from "@/lib/horeca/reserveringen";
import { geannuleerdZaak, verstuur } from "@/lib/horeca/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De gast annuleert zelf met de ondertekende link uit de bevestigingsmail.
// Alleen met een POST (een linkscanner die de pagina opent, annuleert niets),
// IP-begrensd en alleen van de eigen site. (De pagina met de knop volgt de
// site: die is er zolang de site online staat.)
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    await enforceRateLimit({ name: "horeca-annuleren", identifier: clientIp(request), limit: 20, windowSeconds: 3600 });
    const zaak = await zaakVanSlug((await params).slug);
    if (!zaak) throw AppError.notFound("Deze zaak bestaat niet.");
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    const id = leesMet(env.AUTH_SECRET, "annuleer", typeof body?.token === "string" ? body.token : undefined);
    if (!id) throw AppError.notFound("Deze annuleerlink klopt niet.");
    const r = await annuleerDoorGast(zaak, id);
    after(() => verstuur(geannuleerdZaak(zaak, r)).then(() => undefined));
    return NextResponse.json({ ok: true, datum: r.datum, tijd: r.tijd, personen: r.personen });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
